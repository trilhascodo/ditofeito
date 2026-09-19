// ============================================================================
// tseCheck.ts — confere as opções de um mercado eleitoral com o registro do
// TSE (tse_staging, carregado por jobs/run-tse-sync.ts) antes de publicar.
//
// Por que existe: mercados "quem vence" de CE e MG foram publicados com a
// lista de pré-candidatos (a sync só tinha rodado pra MA/SP/BR) e o admin só
// percebeu depois, corrigindo à mão. Aqui o admin vê, na tela do mercado, se
// a disputa já foi conferida, quem está sobrando e quem está faltando.
// Só leitura — não muda nada.
// ============================================================================
import type { Pool } from "pg";

export interface TseCheck {
  /** false = mercado sem candidato vinculado (ex.: "haverá 2º turno?") — nada a conferir. */
  aplicavel: boolean;
  /** "GOVERNADOR/MA" */
  disputa: string | null;
  /** O arquivo do TSE já foi carregado pra essa disputa (run-tse-sync). */
  disputaNoTse: boolean;
  /** Opções cujo candidato não tem registro no TSE ou já saiu da disputa. */
  foraDoTse: string[];
  /** Registrados no TSE (e ativos) que não estão no mercado — só MULTI. */
  faltando: string[];
  /** Opções digitadas sem vínculo com a base de candidatos (não dá pra conferir). */
  semVinculo: string[];
  /** Rótulos todos em maiúsculas ("POLICIAL EDJANE (AGIR)"). */
  maiusculas: string[];
}

const EXIT = ["INDEFERIDO", "RENUNCIOU", "FALECIDO", "NAO_REGISTROU"];
const ATIVO = ["PRE_ANUNCIADO", "PRE_REIVINDICADO", "REGISTRADO", "DEFERIDO"];

export async function checkMarketAgainstTse(pool: Pool, marketId: string): Promise<TseCheck> {
  const empty: TseCheck = {
    aplicavel: false, disputa: null, disputaNoTse: false,
    foraDoTse: [], faltando: [], semVinculo: [], maiusculas: [],
  };
  const m = await pool.query(`SELECT type, is_electoral FROM markets WHERE id = $1`, [marketId]);
  if (!m.rowCount || !m.rows[0].is_electoral) return empty;
  const type = m.rows[0].type as string;

  const outs = await pool.query(
    `SELECT o.label, o.candidate_id, c.office, c.uf, c.candidacy_status, c.tse_sq_candidato
       FROM market_outcomes o LEFT JOIN candidates c ON c.id = o.candidate_id
      WHERE o.market_id = $1 AND NOT o.is_catchall AND o.label NOT IN ('SIM', 'NÃO')
      ORDER BY o.display_order, o.label`, [marketId]);
  const linked = outs.rows.filter((r) => r.candidate_id);
  // binário "será eleito?": o candidato está no SIM, não no rótulo
  if (type === "BINARY") {
    const sim = await pool.query(
      `SELECT coalesce(c.public_name, c.ballot_name, c.name) AS label, o.candidate_id,
              c.office, c.uf, c.candidacy_status, c.tse_sq_candidato
         FROM market_outcomes o JOIN candidates c ON c.id = o.candidate_id
        WHERE o.market_id = $1`, [marketId]);
    linked.push(...sim.rows);
  }
  if (!linked.length) return empty;

  // disputa = (cargo, UF) mais comum entre os candidatos do mercado
  const count = new Map<string, number>();
  for (const r of linked) count.set(`${r.office}/${r.uf ?? "BR"}`, (count.get(`${r.office}/${r.uf ?? "BR"}`) ?? 0) + 1);
  const disputa = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const [office, ufKey] = disputa.split("/");
  const uf = ufKey === "BR" ? null : ufKey;

  const noTse = await pool.query(
    `SELECT 1 FROM tse_staging WHERE office = $1 AND sg_uf = $2 LIMIT 1`, [office, ufKey]);
  const disputaNoTse = !!noTse.rowCount;

  const foraDoTse = linked
    .filter((r) => EXIT.includes(r.candidacy_status) || (disputaNoTse && !r.tse_sq_candidato))
    .map((r) => r.label as string);

  let faltando: string[] = [];
  if (type === "MULTI" && disputaNoTse) {
    const miss = await pool.query(
      `SELECT coalesce(public_name, ballot_name, name) AS label, party FROM candidates c
        WHERE office = $1 AND uf IS NOT DISTINCT FROM $2 AND tse_sq_candidato IS NOT NULL
          AND candidacy_status = ANY($3)
          AND NOT EXISTS (SELECT 1 FROM market_outcomes o WHERE o.market_id = $4 AND o.candidate_id = c.id)
        ORDER BY 1`, [office, uf, ATIVO, marketId]);
    faltando = miss.rows.map((r) => `${r.label} (${r.party})`);
  }

  const maiusculas = outs.rows
    .map((r) => r.label as string)
    .filter((l) => { const nome = l.replace(/\s*\(.*\)\s*$/, ""); return nome.length > 3 && /\p{L}/u.test(nome) && nome === nome.toUpperCase(); });

  return {
    aplicavel: true, disputa, disputaNoTse, foraDoTse, faltando,
    semVinculo: outs.rows.filter((r) => !r.candidate_id).map((r) => r.label as string),
    maiusculas,
  };
}
