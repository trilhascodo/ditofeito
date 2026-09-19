// ============================================================================
// tseSync.ts — alinha a base de candidatos (presidente, governador, senador)
// com o registro oficial do TSE (consulta_cand_2026, mesmo dado do
// DivulgaCandContas).
//
// Por que existe: a base veio de pré-candidatos (sugestão/curadoria) e o
// gerador montou os mercados com ela — ficou gente que nunca se registrou
// (Kim Kataguiri em governador/SP) e faltou gente registrada (Policial Edjane,
// senadores do MA). O matcher (matcher.ts) tinha o casamento por nome, mas
// nada importava o arquivo nem aplicava o resultado nos mercados.
//
// Passos, numa transação só (modo simulação = ROLLBACK no fim):
//   1. carrega o arquivo em tse_staging (só cargos majoritários — deputado
//      são milhares e não têm mercado);
//   2. quem já está vinculado ao TSE: atualiza situação/partido/número;
//   3. quem não está: casa por nome (score do matcher.ts); casamento
//      duvidoso vira "pendente" e não mexe em nada, a não ser com
//      --aceitar-pendentes;
//   4. registrado no TSE sem par na base: cria o candidato;
//   5. candidato ativo sem registro no TSE: NAO_REGISTROU;
//   6. toda saída (não registrou, indeferido, renúncia, falecimento) passa por
//      domain/candidateExit.ts — mesma regra da tela do admin.
// Depois do commit: anula "será eleito?" publicado de quem saiu e roda o
// gerador (novos candidatos entram nos "quem vence").
// ============================================================================
import type { Pool } from "pg";
import { compositeScore, MATCH_CONFIG, applyMatchEffects, type PairRow } from "./matcher.js";
import { applyExitToMarkets, EXIT_STATUSES } from "../domain/candidateExit.js";
import { voidMarket } from "../domain/trade.js";
import { rodarGerador } from "./gerador.js";
import type { TseCandidateRow } from "../lib/tseCsv.js";

export const TSE_SOURCE_URL = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026";

// Corte de casamento automático da sync (o matcher usa 0.92). O score do
// matcher dá 25% pra data de nascimento, que pré-candidato quase nunca tem
// (vale 0.5 = neutro): sem ela, nem nome de urna idêntico + mesmo partido
// passa de 0.875 — "Fufuca (PP)" × "FUFUCA/PP" ficaria pendente. Dentro de
// uma disputa (mesmo cargo e UF, ~10 nomes) homônimo não acontece na prática,
// e o casamento ainda precisa ser recíproco e único dos dois lados.
const SYNC_AUTO_THRESHOLD = 0.85;
const ACTIVE = ["PRE_ANUNCIADO", "PRE_REIVINDICADO", "REGISTRADO", "DEFERIDO"];
const CARGO_LABEL: Record<string, string> = { PRESIDENTE: "presidente", GOVERNADOR: "governador", SENADOR: "senador" };

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

/** DS_CARGO do TSE -> cargo interno. Vice, suplente e deputado ficam de fora. */
export function officeFromCargo(dsCargo: string): string | null {
  const c = norm(dsCargo);
  return c === "PRESIDENTE" || c === "GOVERNADOR" || c === "SENADOR" ? c : null;
}

/** DS_DETALHE_SITUACAO_CAND -> candidacy_status. "Com recurso" segue na urna
 *  (sub judice) — conta como ativo até decisão final. */
export function statusFromTse(ds: string): string {
  const s = norm(ds);
  if (s.startsWith("DEFERIDO")) return "DEFERIDO";
  if (s.includes("COM RECURSO")) return "REGISTRADO";
  if (s.startsWith("RENUNCIA")) return "RENUNCIOU";
  if (s.startsWith("FALECID")) return "FALECIDO";
  if (/^(INDEFERIDO|CANCELADO|CASSADO|NAO CONHECIMENTO|INAPTO)/.test(s)) return "INDEFERIDO";
  return "REGISTRADO"; // aguardando julgamento, pendente, apto...
}

const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
/** "EDUARDO SALIM BRAIDE" -> "Eduardo Salim Braide"; "DR.HILTON" -> "Dr.Hilton" (rótulo do mercado). */
export function titleCase(s: string): string {
  return s.toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.replace(/(^|[.'-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())))
    .join(" ");
}

/** Pedido duplicado: a mesma pessoa pode ter 2 SQ_CANDIDATO na mesma disputa
 *  (ex.: Guto Schiavetto, senador/SP, mesmo CPF e número 144 — um deles vai
 *  ser indeferido). Fica o pedido que não saiu da disputa e, entre iguais, o
 *  mais recente (SQ maior). Sem CPF no arquivo, cai pro nome civil. */
export function umaPessoaPorDisputa<T extends TseCandidateRow & { office: string }>(rows: T[]): T[] {
  const ativo = (x: T) => !EXIT_STATUSES.has(statusFromTse(x.dsSituacao));
  const porPessoa = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.office}/${r.sgUf}/${r.cpf || norm(r.nmCandidato)}`;
    const cur = porPessoa.get(k);
    if (!cur || (ativo(r) && !ativo(cur))
        || (ativo(r) === ativo(cur) && BigInt(r.sqCandidato) > BigInt(cur.sqCandidato))) porPessoa.set(k, r);
  }
  return [...porPessoa.values()];
}

export interface RaceReport {
  vinculados: string[];      // "Braide (base) = EDUARDO BRAIDE (TSE, 0.95)"
  criados: string[];
  saidas: string[];          // "Kim Kataguiri — não registrou → saiu de quem-vence-..."
  situacao: string[];        // mudanças de situação de quem já estava vinculado
  pendentes: string[];       // casamento duvidoso, nada foi mexido
}
export interface SyncResult {
  aplicado: boolean;
  linhasTse: number;
  corridas: Map<string, RaceReport>;
  anulados: string[];
  gerador?: { binarios: number; multis: number; outcomesSincronizados: number };
}

export interface SyncOptions {
  rows: TseCandidateRow[];
  fileVersion: string;
  /** UFs a sincronizar ("BR" = presidente). Vazio = todas. */
  ufs: string[];
  aceitarPendentes: boolean;
  aplicar: boolean;
}

export async function syncCandidatesWithTse(pool: Pool, opt: SyncOptions): Promise<SyncResult> {
  const all = opt.rows
    .map((r) => ({ ...r, office: officeFromCargo(r.dsCargo), sgUf: r.sgUf.toUpperCase() }))
    .filter((r): r is typeof r & { office: string } =>
      !!r.office && (!opt.ufs.length || opt.ufs.includes(r.sgUf)));
  const rows = umaPessoaPorDisputa(all);

  const corridas = new Map<string, RaceReport>();
  const race = (office: string, uf: string | null) => {
    const k = `${office}/${uf ?? "BR"}`;
    if (!corridas.has(k)) corridas.set(k, { vinculados: [], criados: [], saidas: [], situacao: [], pendentes: [] });
    return corridas.get(k)!;
  };
  const toVoid: { id: string; slug: string; justification: string }[] = [];
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!sys.rowCount) throw new Error("Seed ausente: usuário 'sistema'");
  const sistemaId = sys.rows[0].id as string;

  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. staging (upsert — candidate_matches referencia tse_staging, não dá pra apagar)
    for (const r of rows) {
      await c.query(
        `INSERT INTO tse_staging (sq_candidato, nm_candidato, nm_urna, nr_candidato, sg_partido,
                                  ds_cargo, office, sg_uf, dt_nascimento, ds_situacao, file_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (sq_candidato) DO UPDATE SET
           nm_candidato=EXCLUDED.nm_candidato, nm_urna=EXCLUDED.nm_urna, nr_candidato=EXCLUDED.nr_candidato,
           sg_partido=EXCLUDED.sg_partido, ds_cargo=EXCLUDED.ds_cargo, office=EXCLUDED.office,
           sg_uf=EXCLUDED.sg_uf, dt_nascimento=EXCLUDED.dt_nascimento, ds_situacao=EXCLUDED.ds_situacao,
           file_version=EXCLUDED.file_version, imported_at=now()`,
        [r.sqCandidato, r.nmCandidato, r.nmUrna, r.nrCandidato, r.sgPartido,
          r.dsCargo, r.office, r.sgUf, r.dtNascimento, r.dsSituacao, opt.fileVersion]);
    }
    // Só disputas que o arquivo realmente cobre — sem isso, um arquivo
    // parcial (ou um --uf) marcaria "não registrou" em disputas inteiras.
    const racesInFile = new Set(rows.map((r) => `${r.office}/${r.sgUf}`));
    const inScope = (office: string, uf: string | null) => racesInFile.has(`${office}/${uf ?? "BR"}`);
    const sqInFile = new Set(rows.map((r) => r.sqCandidato));

    const exit = async (candId: string, label: string, office: string, uf: string | null,
                        newStatus: string, motivo: string, justification: string) => {
      await c.query(`UPDATE candidates SET candidacy_status = $2, updated_at = now() WHERE id = $1`,
        [candId, newStatus]);
      const fx = await applyExitToMarkets(c, candId);
      for (const m of fx.toVoid) toVoid.push({ ...m, justification });
      const efeitos = [
        ...fx.removedFromMarkets.map((s) => `saiu de ${s}`),
        ...fx.deletedDrafts.map((s) => `rascunho apagado ${s}`),
        ...fx.toVoid.map((m) => `anula ${m.slug}`),
        ...fx.skippedMarkets.map((s) => `JÁ TEM APOSTA em ${s} — decidir no admin`),
      ];
      race(office, uf).saidas.push(`${label} — ${motivo}${efeitos.length ? " → " + efeitos.join("; ") : ""}`);
    };

    // 2. já vinculados: situação/partido/número do arquivo mais recente
    const linked = await c.query(
      `SELECT c.id, coalesce(c.public_name, c.ballot_name, c.name) AS label, c.office, c.uf,
              c.candidacy_status, t.ds_situacao, t.sg_partido, t.nr_candidato, t.nm_urna
         FROM candidates c JOIN tse_staging t ON t.sq_candidato = c.tse_sq_candidato
        WHERE t.sq_candidato = ANY($1::bigint[])`, [[...sqInFile]]);
    for (const l of linked.rows) {
      const novo = statusFromTse(l.ds_situacao ?? "");
      await c.query(
        `UPDATE candidates SET party = $2, number = $3, ballot_name = $4, updated_at = now() WHERE id = $1`,
        [l.id, l.sg_partido, l.nr_candidato, l.nm_urna]);
      if (novo === l.candidacy_status) continue;
      if (EXIT_STATUSES.has(novo) && !EXIT_STATUSES.has(l.candidacy_status)) {
        await exit(l.id, l.label, l.office, l.uf, novo, `TSE: ${l.ds_situacao}`,
          `Situação da candidatura no TSE: ${l.ds_situacao} (dados abertos, ${opt.fileVersion}).`);
      } else {
        await c.query(`UPDATE candidates SET candidacy_status = $2, updated_at = now() WHERE id = $1`, [l.id, novo]);
        race(l.office, l.uf).situacao.push(`${l.label}: ${l.candidacy_status} → ${novo} (${l.ds_situacao})`);
      }
    }

    // 3. casamento por nome dos ativos ainda sem vínculo (inclui quem o admin
    //    cadastrou como REGISTRADO, não só pré-candidato — senão viraria
    //    duplicata ao criar o do TSE)
    const pairs = await c.query(
      `SELECT c.id AS candidate_id, t.sq_candidato::text AS sq_candidato,
              similarity(c.norm_full_name, t.norm_nm_candidato) AS sim_civil,
              similarity(f_norm_name(coalesce(c.public_name, c.ballot_name, c.name)), t.norm_nm_urna) AS sim_urna,
              coalesce((SELECT max(similarity(a.norm_alias, t.norm_nm_urna)) FROM candidate_aliases a
                         WHERE a.candidate_id = c.id), 0) AS best_alias_sim,
              (c.party = t.sg_partido) AS party_equal,
              (c.birth_date IS NOT NULL AND c.birth_date = t.dt_nascimento) AS birth_equal,
              (c.birth_date IS NOT NULL AND t.dt_nascimento IS NOT NULL) AS birth_known,
              c.norm_full_name AS cand_tokens, t.norm_nm_candidato AS tse_tokens,
              f_norm_name(coalesce(c.public_name, c.ballot_name, c.name)) AS cand_pub, t.norm_nm_urna AS tse_urna,
              coalesce(c.public_name, c.ballot_name, c.name) AS cand_label, t.nm_urna,
              c.office, c.uf
         FROM candidates c
         JOIN tse_staging t ON t.office = c.office AND t.sg_uf = coalesce(c.uf, 'BR')
        WHERE c.tse_sq_candidato IS NULL AND c.candidacy_status = ANY($1)
          AND t.sq_candidato = ANY($2::bigint[])
          AND NOT EXISTS (SELECT 1 FROM candidates c2 WHERE c2.tse_sq_candidato = t.sq_candidato)
          AND greatest(similarity(c.norm_full_name, t.norm_nm_candidato),
                       similarity(f_norm_name(coalesce(c.public_name, c.ballot_name, c.name)), t.norm_nm_urna)) >= $3`,
      [ACTIVE, [...sqInFile], MATCH_CONFIG.minPairSim]);
    const scored = pairs.rows.map((p) => {
      // Mesmo score do matcher, testando o subconjunto de nomes nos dois
      // canais: civil×civil e público×urna ("Policial Edjane" só casa pelo 2º).
      const a = compositeScore(p as PairRow).score;
      const b = compositeScore({ ...(p as PairRow), cand_tokens: p.cand_pub, tse_tokens: p.tse_urna }).score;
      return { p, score: Math.max(a, b) };
    }).filter((s) => s.score >= MATCH_CONFIG.reviewThreshold);

    // melhor par de cada lado; casa só se for recíproco (evita homônimo)
    const bestByCand = new Map<string, (typeof scored)[number]>();
    const bestByTse = new Map<string, (typeof scored)[number]>();
    const autoCount = new Map<string, number>();
    for (const s of scored) {
      if (!bestByCand.has(s.p.candidate_id) || s.score > bestByCand.get(s.p.candidate_id)!.score) bestByCand.set(s.p.candidate_id, s);
      if (!bestByTse.has(s.p.sq_candidato) || s.score > bestByTse.get(s.p.sq_candidato)!.score) bestByTse.set(s.p.sq_candidato, s);
      if (s.score >= SYNC_AUTO_THRESHOLD) {
        autoCount.set(`c:${s.p.candidate_id}`, (autoCount.get(`c:${s.p.candidate_id}`) ?? 0) + 1);
        autoCount.set(`t:${s.p.sq_candidato}`, (autoCount.get(`t:${s.p.sq_candidato}`) ?? 0) + 1);
      }
    }
    const pendingCands = new Set<string>(), pendingSqs = new Set<string>();
    for (const [candId, s] of bestByCand) {
      const reciprocal = bestByTse.get(s.p.sq_candidato)?.p.candidate_id === candId;
      const auto = s.score >= SYNC_AUTO_THRESHOLD
        && autoCount.get(`c:${candId}`) === 1 && autoCount.get(`t:${s.p.sq_candidato}`) === 1;
      const r = race(s.p.office, s.p.uf);
      const desc = `${s.p.cand_label} (base) = ${s.p.nm_urna} (TSE, ${s.score.toFixed(2)})`;
      if (reciprocal && (auto || opt.aceitarPendentes)) {
        await c.query(
          `INSERT INTO candidate_matches (candidate_id, sq_candidato, method, score, score_detail, status, decided_at)
           VALUES ($1,$2,'FUZZY',$3,'{}','CONFIRMED',now())
           ON CONFLICT (candidate_id, sq_candidato) DO UPDATE SET status='CONFIRMED', score=$3, decided_at=now()`,
          [candId, s.p.sq_candidato, s.score.toFixed(4)]);
        await applyMatchEffects(c, candId, s.p.sq_candidato);
        r.vinculados.push(desc);
        const t = rows.find((x) => x.sqCandidato === s.p.sq_candidato)!;
        const novo = statusFromTse(t.dsSituacao);
        if (EXIT_STATUSES.has(novo)) {
          await exit(candId, s.p.cand_label, s.p.office, s.p.uf, novo, `TSE: ${t.dsSituacao}`,
            `Situação da candidatura no TSE: ${t.dsSituacao} (dados abertos, ${opt.fileVersion}).`);
        } else if (novo !== "REGISTRADO") {
          await c.query(`UPDATE candidates SET candidacy_status = $2 WHERE id = $1`, [candId, novo]);
        }
      } else {
        pendingCands.add(candId);
        pendingSqs.add(s.p.sq_candidato);
        r.pendentes.push(desc);
      }
    }

    // 4. registrado no TSE sem ninguém na base: cria (só quem segue na disputa)
    for (const t of rows) {
      if (pendingSqs.has(t.sqCandidato)) continue;
      const exists = await c.query(`SELECT 1 FROM candidates WHERE tse_sq_candidato = $1`, [t.sqCandidato]);
      if (exists.rowCount) continue;
      const status = statusFromTse(t.dsSituacao);
      if (EXIT_STATUSES.has(status)) continue;
      const uf = t.sgUf === "BR" ? null : t.sgUf;
      await c.query(
        `INSERT INTO candidates (tse_sq_candidato, name, ballot_name, public_name, number, party, office, uf,
                                 birth_date, candidacy_status, source_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [t.sqCandidato, titleCase(t.nmCandidato), t.nmUrna, titleCase(t.nmUrna), t.nrCandidato,
          t.sgPartido, t.office, uf, t.dtNascimento, status, TSE_SOURCE_URL]);
      race(t.office!, uf).criados.push(`${titleCase(t.nmUrna)} (${t.sgPartido}) — ${t.dsSituacao || "registrado"}`);
    }

    // 5. ativo na base, sem vínculo nem casamento pendente, numa disputa que o
    //    arquivo cobre: não se registrou
    const orphans = await c.query(
      `SELECT id, coalesce(public_name, ballot_name, name) AS label, office, uf FROM candidates
        WHERE tse_sq_candidato IS NULL AND candidacy_status = ANY($1)
          AND office IN ('PRESIDENTE','GOVERNADOR','SENADOR')`, [ACTIVE]);
    for (const o of orphans.rows) {
      if (pendingCands.has(o.id) || !inScope(o.office, o.uf)) continue;
      await exit(o.id, o.label, o.office, o.uf, "NAO_REGISTROU", "não registrou no TSE",
        `Sem registro de candidatura a ${CARGO_LABEL[o.office]}${o.uf ? "/" + o.uf : ""} no TSE ` +
        `para 2026 (dados abertos, ${opt.fileVersion}).`);
    }

    await c.query(opt.aplicar ? "COMMIT" : "ROLLBACK");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }

  const result: SyncResult = { aplicado: opt.aplicar, linhasTse: rows.length, corridas, anulados: [] };
  if (!opt.aplicar) {
    result.anulados = toVoid.map((m) => m.slug);
    return result;
  }
  for (const m of toVoid) {
    await voidMarket(pool, {
      marketId: m.id, resolverUserId: sistemaId, justification: m.justification, sourceUrl: TSE_SOURCE_URL,
    });
    result.anulados.push(m.slug);
  }
  result.gerador = await rodarGerador(pool);
  return result;
}

export function formatReport(r: SyncResult): string {
  const out: string[] = [];
  out.push(r.aplicado ? "== APLICADO ==" : "== SIMULAÇÃO (nada foi gravado — rode com --aplicar) ==");
  out.push(`${r.linhasTse} candidaturas majoritárias lidas do arquivo do TSE.`);
  const keys = [...r.corridas.keys()].sort();
  const sec = (titulo: string, itens: string[]) => { if (itens.length) { out.push(`  ${titulo}:`); for (const i of itens) out.push(`    - ${i}`); } };
  for (const k of keys) {
    const x = r.corridas.get(k)!;
    if (!x.vinculados.length && !x.criados.length && !x.saidas.length && !x.situacao.length && !x.pendentes.length) continue;
    out.push(`\n${k}`);
    sec("vinculados ao TSE", x.vinculados);
    sec("novos (registrados no TSE, faltavam na base)", x.criados);
    sec("saem da disputa", x.saidas);
    sec("mudança de situação", x.situacao);
    sec("PENDENTE — casamento duvidoso, nada mexido (confira; --aceitar-pendentes casa todos)", x.pendentes);
  }
  if (r.anulados.length) out.push(`\n"será eleito?" publicados ${r.aplicado ? "anulados" : "que serão anulados"}: ${r.anulados.join(", ")}`);
  if (r.gerador) out.push(`\nGerador: ${r.gerador.binarios} rascunho(s) "será eleito?" novo(s), ${r.gerador.outcomesSincronizados} candidato(s) incluído(s) em "quem vence".`);
  else if (!r.aplicado) out.push(`\nAo aplicar, o gerador roda em seguida e inclui os novos candidatos nos "quem vence" e cria os rascunhos "será eleito?".`);
  return out.join("\n");
}
