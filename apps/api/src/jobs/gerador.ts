// ============================================================================
// gerador.ts — Geração programática de mercados eleitorais
//
// Regras de domínio (sistema eleitoral brasileiro):
//   MAJORITÁRIO (PRESIDENTE, GOVERNADOR, SENADOR, PREFEITO):
//     -> 1 mercado MULTI por disputa: candidatos nomeados + "OUTROS" (catchall)
//   PROPORCIONAL (DEP_FEDERAL, DEP_ESTADUAL, VEREADOR):
//     -> sem MULTI (não há "vencedor" da disputa); só binários individuais
//   TODO CANDIDATO (qualquer cargo):
//     -> binário "será eleito?"           (slug eleito-*)
//     -> na fase 1, binário "vai registrar?" (slug registro-*  ← convenção que
//        o matcher.ts usa p/ resolução automática no match TSE)
//
// Idempotente: dedupe por slug (ON CONFLICT DO NOTHING) + sincronização de
// outcomes dos MULTI quando novos pré-candidatos entram na disputa.
// ============================================================================
import type { Pool, PoolClient } from "pg";
import { suggestB } from "@ditofeito/core";

// ------------------------------ Calendário -----------------------------------
// Datas oficiais do ciclo 2026 (ajustar por resolução TSE se mudarem)
export const CALENDARIO_2026 = {
  prazoRegistro: "2026-08-15T23:59:59-03:00",   // fim do registro de candidaturas
  primeiroTurno: "2026-10-04T17:00:00-03:00",
  segundoTurno:  "2026-10-25T17:00:00-03:00",
  prazoResolucaoEleito: "2026-12-20T23:59:59-03:00", // pós-diplomação
} as const;

const MAJORITARIOS = new Set(["PRESIDENTE", "GOVERNADOR", "SENADOR", "PREFEITO"]);
const CARGO_LABEL: Record<string, string> = {
  PRESIDENTE: "presidente", GOVERNADOR: "governador(a)", SENADOR: "senador(a)",
  DEP_FEDERAL: "deputado(a) federal", DEP_ESTADUAL: "deputado(a) estadual",
  PREFEITO: "prefeito(a)", VEREADOR: "vereador(a)",
};

export const GERADOR_CONFIG = {
  /** Profundidade de liquidez (multiplicador do suggestB) por tipo */
  depthBinario: 40,
  depthMajoritaria: 150,      // disputas visíveis: preço mais estável
  /** Máximo de outcomes nomeados no MULTI; excedente vai p/ OUTROS */
  maxOutcomesNomeados: 12,
  /** Publicar direto (OPEN) ou deixar em DRAFT p/ revisão editorial */
  publicarDireto: true,
} as const;

// -------------------------------- Utils --------------------------------------
export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface Candidato {
  id: string; name: string; public_name: string | null; ballot_name: string;
  party: string; office: string; uf: string | null;
  municipality_ibge: number | null; candidacy_status: string;
}

const nomePublico = (c: Candidato) => c.public_name ?? c.ballot_name ?? c.name;
const sufixoLocal = (c: Candidato) =>
  c.office === "PRESIDENTE" ? "" : c.uf ? `/${c.uf}` : "";

// ============================================================================
// 1. BINÁRIOS POR CANDIDATO — "vai registrar?" (fase 1) e "será eleito?"
// ============================================================================
export async function gerarBinariosCandidatos(
  pool: Pool, opts: { categoriaEleicoesId: string; sistemaUserId: string;
                      incluirRegistro?: boolean },
): Promise<{ criados: number }> {
  const c = await pool.connect();
  let criados = 0;
  try {
    await c.query("BEGIN");
    const cands = await c.query<Candidato>(
      `SELECT id, name, public_name, ballot_name, party, office, uf,
              municipality_ibge, candidacy_status
         FROM candidates
        WHERE candidacy_status IN ('PRE_ANUNCIADO','PRE_REIVINDICADO','REGISTRADO','DEFERIDO')
        ORDER BY uf, office, name`);

    for (const cand of cands.rows) {
      const nome = nomePublico(cand);
      const local = sufixoLocal(cand);
      const cargoTxt = CARGO_LABEL[cand.office] ?? cand.office.toLowerCase();
      const base = `${slugify(nome)}-${slugify(cand.office)}${cand.uf ? "-" + cand.uf.toLowerCase() : ""}`;

      // --- "vai registrar candidatura?" — só na fase 1, fecha no prazo TSE ---
      const ehFase1 = ["PRE_ANUNCIADO", "PRE_REIVINDICADO"].includes(cand.candidacy_status);
      if ((opts.incluirRegistro ?? true) && ehFase1) {
        criados += await criarBinario(c, {
          slug: `registro-${base}`,   // convenção esperada pelo matcher.ts
          titulo: `${nome} (${cand.party}) vai registrar candidatura a ${cargoTxt}${local} no TSE?`,
          criterio:
            `Resolve SIM se constar registro de candidatura de ${cand.name} ao cargo de ` +
            `${cargoTxt}${local ? " pela UF " + cand.uf : ""} na base oficial do TSE ` +
            `(consulta_cand 2026) até o fim do prazo legal de registro. Caso contrário, resolve NÃO.`,
          fonte: "TSE — DivulgaCandContas / dados abertos (consulta_cand 2026)",
          closeAt: CALENDARIO_2026.prazoRegistro,
          resolveBy: "2026-08-31T23:59:59-03:00",
          categoriaId: opts.categoriaEleicoesId, criadoPor: opts.sistemaUserId,
          candidateId: cand.id,
        });
      }

      // --- "será eleito?" — todo candidato, resolve após diplomação ---
      criados += await criarBinario(c, {
        slug: `eleito-${base}`,
        titulo: `${nome} (${cand.party}) será eleito(a) ${cargoTxt}${local} em 2026?`,
        criterio:
          `Resolve SIM se ${cand.name} for declarado(a) eleito(a) ao cargo de ${cargoTxt}` +
          `${local ? " pela UF " + cand.uf : ""} pela Justiça Eleitoral no pleito de 2026 ` +
          `(incluindo eleição por quociente partidário, quando aplicável). ` +
          `Suplência NÃO conta como eleição. Se a candidatura não for registrada ou for ` +
          `indeferida definitivamente antes do pleito, o mercado é ANULADO.`,
        fonte: "TSE — resultado oficial / diplomação",
        closeAt: CALENDARIO_2026.primeiroTurno,
        resolveBy: CALENDARIO_2026.prazoResolucaoEleito,
        categoriaId: opts.categoriaEleicoesId, criadoPor: opts.sistemaUserId,
        candidateId: cand.id,
      });
    }
    await c.query("COMMIT");
    return { criados };
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

async function criarBinario(c: PoolClient, p: {
  slug: string; titulo: string; criterio: string; fonte: string;
  closeAt: string; resolveBy: string; categoriaId: string; criadoPor: string;
  candidateId: string;
}): Promise<number> {
  const b = suggestB(2, GERADOR_CONFIG.depthBinario);
  const r = await c.query(
    `INSERT INTO markets (slug, title, category_id, type, liquidity_b, status,
                          resolution_criteria, resolution_source, close_at,
                          resolve_by, is_electoral, created_by)
     VALUES ($1,$2,$3,'BINARY',$4,$5,$6,$7,$8,$9,true,$10)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [p.slug, p.titulo, p.categoriaId, b.toFixed(4),
     GERADOR_CONFIG.publicarDireto ? "OPEN" : "DRAFT",
     p.criterio, p.fonte, p.closeAt, p.resolveBy, p.criadoPor]);
  if (!r.rowCount) return 0; // já existia — idempotência
  const mid = r.rows[0].id;
  await c.query(
    `INSERT INTO market_outcomes (market_id, label, candidate_id, display_order)
     VALUES ($1,'SIM',$2,0), ($1,'NÃO',NULL,1)`, [mid, p.candidateId]);
  return 1;
}

// ============================================================================
// 2. MULTI POR DISPUTA MAJORITÁRIA — "quem vence?" com sync de outcomes
// ============================================================================
export async function gerarDisputasMajoritarias(
  pool: Pool, opts: { categoriaEleicoesId: string; sistemaUserId: string },
): Promise<{ mercadosCriados: number; outcomesAdicionados: number }> {
  const c = await pool.connect();
  let mercadosCriados = 0, outcomesAdicionados = 0;
  try {
    await c.query("BEGIN");
    // Disputas = combinações (cargo majoritário, UF) com candidatos ativos
    const disputas = await c.query(
      `SELECT office, uf, count(*) AS n FROM candidates
        WHERE office = ANY($1)
          AND candidacy_status IN ('PRE_ANUNCIADO','PRE_REIVINDICADO','REGISTRADO','DEFERIDO')
        GROUP BY office, uf ORDER BY office, uf`,
      [[...MAJORITARIOS]]);

    for (const d of disputas.rows) {
      const cargoTxt = CARGO_LABEL[d.office];
      const local = d.office === "PRESIDENTE" ? "" : `/${d.uf}`;
      const slugDisputa = `disputa-${slugify(d.office)}${d.uf ? "-" + d.uf.toLowerCase() : ""}-2026`;

      // Grupo da disputa (navegação + índice citável)
      const grp = await c.query(
        `INSERT INTO market_groups (slug, title, category_id)
         VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title
         RETURNING id`,
        [slugDisputa, `Eleições 2026 — ${cargoTxt}${local}`, opts.categoriaEleicoesId]);
      const groupId = grp.rows[0].id;

      // Candidatos da disputa (reivindicados primeiro; corte em maxOutcomesNomeados)
      const cands = await c.query<Candidato>(
        `SELECT id, name, public_name, ballot_name, party, office, uf,
                municipality_ibge, candidacy_status
           FROM candidates
          WHERE office=$1 AND uf IS NOT DISTINCT FROM $2
            AND candidacy_status IN ('PRE_ANUNCIADO','PRE_REIVINDICADO','REGISTRADO','DEFERIDO')
          ORDER BY (candidacy_status='PRE_REIVINDICADO') DESC, name
          LIMIT $3`,
        [d.office, d.uf, GERADOR_CONFIG.maxOutcomesNomeados]);
      if (cands.rowCount! < 2) continue; // disputa sem massa crítica ainda

      const b = suggestB(cands.rowCount! + 1, GERADOR_CONFIG.depthMajoritaria);
      const mkt = await c.query(
        `INSERT INTO markets (slug, title, category_id, group_id, type, liquidity_b,
                              status, resolution_criteria, resolution_source,
                              close_at, resolve_by, is_electoral, created_by)
         VALUES ($1,$2,$3,$4,'MULTI',$5,$6,$7,$8,$9,$10,true,$11)
         ON CONFLICT (slug) DO NOTHING RETURNING id`,
        [`quem-vence-${slugDisputa}`,
         `Quem vence a eleição para ${cargoTxt}${local} em 2026?`,
         opts.categoriaEleicoesId, groupId, b.toFixed(4),
         GERADOR_CONFIG.publicarDireto ? "OPEN" : "DRAFT",
         `Resolve no candidato declarado eleito ${cargoTxt}${local} pela Justiça Eleitoral ` +
         `(2º turno, se houver). Candidato não listado nominalmente resolve em "OUTROS". ` +
         `Anulação da eleição pela Justiça Eleitoral antes da diplomação ANULA o mercado.`,
         "TSE — resultado oficial / diplomação",
         CALENDARIO_2026.segundoTurno, CALENDARIO_2026.prazoResolucaoEleito,
         opts.sistemaUserId]);

      let marketId: string;
      if (mkt.rowCount) {
        marketId = mkt.rows[0].id;
        mercadosCriados++;
        // Outcomes iniciais: candidatos + OUTROS por último
        for (const [i, cd] of cands.rows.entries()) {
          await c.query(
            `INSERT INTO market_outcomes (market_id, label, candidate_id, display_order)
             VALUES ($1,$2,$3,$4)`,
            [marketId, `${nomePublico(cd)} (${cd.party})`, cd.id, i]);
          outcomesAdicionados++;
        }
        await c.query(
          `INSERT INTO market_outcomes (market_id, label, is_catchall, display_order)
           VALUES ($1,'OUTROS',true,999)`, [marketId]);
      } else {
        // Mercado já existe: SINCRONIZAR — pré-candidato novo entra como outcome
        // com q inicial que preserva os preços atuais? Não: LMSR exige cuidado.
        // Estratégia segura: novo outcome entra com q = min(q existentes) - offset,
        // nascendo com preço baixo e roubando probabilidade proporcionalmente do
        // conjunto (na prática, quase tudo de OUTROS, onde ele estava implícito).
        const ex = await c.query(
          `SELECT m.id AS market_id, min(o.q) AS qmin
             FROM markets m JOIN market_outcomes o ON o.market_id=m.id
            WHERE m.slug=$1 AND m.status IN ('DRAFT','OPEN')
            GROUP BY m.id`, [`quem-vence-${slugDisputa}`]);
        if (!ex.rowCount) continue;
        marketId = ex.rows[0].market_id;
        for (const cd of cands.rows) {
          const novo = await c.query(
            `INSERT INTO market_outcomes (market_id, label, candidate_id, display_order, q)
             SELECT $1,$2,$3,
                    coalesce((SELECT max(display_order)+1 FROM market_outcomes
                              WHERE market_id=$1 AND NOT is_catchall),0),
                    $4
             WHERE NOT EXISTS (SELECT 1 FROM market_outcomes
                                WHERE market_id=$1 AND candidate_id=$3)
             RETURNING id`,
            [marketId, `${nomePublico(cd)} (${cd.party})`, cd.id,
             Number(ex.rows[0].qmin).toFixed(6)]);
          if (novo.rowCount) outcomesAdicionados++;
        }
      }
    }
    await c.query("COMMIT");
    return { mercadosCriados, outcomesAdicionados };
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

// ============================================================================
// 3. ORQUESTRADOR — rodar como job diário (novos pré-candidatos -> mercados)
// ============================================================================
export async function rodarGerador(pool: Pool) {
  const cat = await pool.query(
    `SELECT id FROM categories WHERE slug = 'eleicoes-2026'`);
  const sys = await pool.query(
    `SELECT id FROM users WHERE handle = 'sistema'`);
  if (!cat.rowCount || !sys.rowCount)
    throw new Error("Seed ausente: categoria 'eleicoes-2026' e usuário 'sistema'");
  const a = await gerarBinariosCandidatos(pool, {
    categoriaEleicoesId: cat.rows[0].id, sistemaUserId: sys.rows[0].id });
  const b = await gerarDisputasMajoritarias(pool, {
    categoriaEleicoesId: cat.rows[0].id, sistemaUserId: sys.rows[0].id });
  return { binarios: a.criados, multis: b.mercadosCriados,
           outcomesSincronizados: b.outcomesAdicionados };
}
