// ============================================================================
// matcher.ts — Reconciliação fase 1 (pré-candidatos) × fase 2 (registro TSE)
// Idempotente: pode rodar a cada republicação do consulta_cand.
// Estágios: pares (SQL) -> score composto -> tiers -> auto-match/fila -> efeitos
// ============================================================================
import { Pool } from "pg";

// ------------------------------- Configuração -------------------------------
export const MATCH_CONFIG = {
  minPairSim: 0.45,      // piso na geração de pares (SQL)
  autoThreshold: 0.92,   // >= : auto-match (se único nos dois lados)
  reviewThreshold: 0.7,  // [review, auto): fila humana | abaixo: descarta
  weights: { name: 0.6, party: 0.15, birth: 0.25 },
} as const;

// ------------------------------ Score composto ------------------------------
/** Subconjunto de tokens: nomes brasileiros omitem sobrenomes.
 *  "JOSE CARLOS SILVA" ⊂ "JOSE CARLOS DA SILVA SANTOS" => sinal forte. */
export function tokenSubset(a: string, b: string): boolean {
  const stop = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
  const ta = a.split(" ").filter((t) => t && !stop.has(t));
  const tb = new Set(b.split(" ").filter((t) => t && !stop.has(t)));
  const [shorter, longerSet] =
    ta.length <= tb.size ? [ta, tb] : [[...tb], new Set(ta)];
  return shorter.length >= 2 && shorter.every((t) => longerSet.has(t));
}

export interface PairRow {
  candidate_id: string; sq_candidato: string;
  sim_civil: number; sim_urna: number; best_alias_sim: number;
  party_equal: boolean; birth_equal: boolean; birth_known: boolean;
  cand_tokens: string; tse_tokens: string;
}

export function compositeScore(p: PairRow) {
  const w = MATCH_CONFIG.weights;
  // melhor canal de nome: civil×civil, público×urna ou alias×urna
  let nameSim = Math.max(p.sim_civil, p.sim_urna, p.best_alias_sim);
  const subset = tokenSubset(p.cand_tokens, p.tse_tokens);
  if (subset) nameSim = Math.max(nameSim, 0.9); // piso p/ subconjunto de tokens

  const partyScore = p.party_equal ? 1 : 0.3;   // partido diferente pune, não elimina
  // nascimento: igual = 1 | ambos conhecidos e diferentes = forte contra-evidência
  // | um dos lados desconhecido = neutro (0.5)
  const birthScore = p.birth_equal ? 1 : p.birth_known ? 0 : 0.5;

  const score = w.name * nameSim + w.party * partyScore + w.birth * birthScore;
  return {
    score: Math.min(score, 1),
    detail: { nameSim, subset, partyScore, birthScore,
              channels: { civil: p.sim_civil, urna: p.sim_urna, alias: p.best_alias_sim } },
  };
}

// --------------------------------- Execução ---------------------------------
export async function runMatcher(pool: Pool) {
  const { rows: pairs } = await pool.query<PairRow>(
    "SELECT * FROM f_match_pairs($1)", [MATCH_CONFIG.minPairSim],
  );

  // score + corte inferior
  const scored = pairs
    .map((p) => ({ p, ...compositeScore(p) }))
    .filter((s) => s.score >= MATCH_CONFIG.reviewThreshold);

  // Homônimos/ambiguidade: qualquer lado com mais de um pretendente acima do
  // limiar de auto-match NUNCA casa sozinho — vai para revisão humana.
  const byCand = countBy(scored.filter(s => s.score >= MATCH_CONFIG.autoThreshold),
                         (s) => s.p.candidate_id);
  const byTse  = countBy(scored.filter(s => s.score >= MATCH_CONFIG.autoThreshold),
                         (s) => s.p.sq_candidato);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const s of scored) {
      const unique =
        byCand.get(s.p.candidate_id) === 1 && byTse.get(s.p.sq_candidato) === 1;
      const auto = s.score >= MATCH_CONFIG.autoThreshold && unique;

      await client.query(
        `INSERT INTO candidate_matches
           (candidate_id, sq_candidato, method, score, score_detail, status, decided_at)
         VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6='CONFIRMED' THEN now() END)
         ON CONFLICT (candidate_id, sq_candidato) DO UPDATE
           SET score=$4, score_detail=$5,
               status = CASE WHEN candidate_matches.status='PENDING'
                             THEN EXCLUDED.status ELSE candidate_matches.status END`,
        [ s.p.candidate_id, s.p.sq_candidato,
          s.detail.nameSim >= 0.999 ? "EXACT" : "FUZZY",
          s.score, JSON.stringify(s.detail),
          auto ? "CONFIRMED" : "PENDING" ],
      );
      if (auto) await applyMatchEffects(client, s.p.candidate_id, s.p.sq_candidato);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK"); throw e;
  } finally { client.release(); }

  return {
    pares: pairs.length,
    autoConfirmados: scored.filter(s => s.score >= MATCH_CONFIG.autoThreshold &&
      byCand.get(s.p.candidate_id) === 1 && byTse.get(s.p.sq_candidato) === 1).length,
    filaRevisao: scored.length,
  };
}

// ------------------------- Efeitos pós-confirmação --------------------------
// Também chamado pelo endpoint de revisão humana ao aprovar um PENDING.
export async function applyMatchEffects(
  client: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> },
  candidateId: string, sqCandidato: string,
) {
  // Hidrata o candidato com os dados oficiais
  await client.query(
    `UPDATE candidates c SET
       tse_sq_candidato = t.sq_candidato,
       number           = t.nr_candidato,
       ballot_name      = t.nm_urna,
       party            = t.sg_partido,
       birth_date       = coalesce(c.birth_date, t.dt_nascimento),
       candidacy_status = 'REGISTRADO',
       updated_at       = now()
     FROM tse_staging t
     WHERE c.id = $1 AND t.sq_candidato = $2`,
    [candidateId, sqCandidato],
  );
}

// Após o prazo final de registro: quem sobrou sem par não registrou.
export async function markNonRegistered(pool: Pool) {
  await pool.query(
    `UPDATE candidates SET candidacy_status='NAO_REGISTROU', updated_at=now()
      WHERE candidacy_status IN ('PRE_ANUNCIADO','PRE_REIVINDICADO')
        AND tse_sq_candidato IS NULL`);
}

// Candidatos que só existem no TSE (nunca passaram pela fase 1): criar do zero.
export async function createUnmatchedFromTse(pool: Pool) {
  const { rows } = await pool.query(
    `INSERT INTO candidates
       (tse_sq_candidato, name, ballot_name, number, party, office, uf,
        birth_date, candidacy_status)
     SELECT t.sq_candidato, t.nm_candidato, t.nm_urna, t.nr_candidato,
            t.sg_partido, t.office, t.sg_uf, t.dt_nascimento, 'REGISTRADO'
       FROM tse_staging t
      WHERE NOT EXISTS (SELECT 1 FROM candidate_matches m
                         WHERE m.sq_candidato = t.sq_candidato AND m.status='CONFIRMED')
        AND NOT EXISTS (SELECT 1 FROM candidates c
                         WHERE c.tse_sq_candidato = t.sq_candidato)
     RETURNING id`);
  return rows.length; // -> disparar geração programática de mercados p/ esses ids
}

// --------------------------------- util --------------------------------------
function countBy<T>(arr: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const x of arr) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
}
