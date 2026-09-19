// ============================================================================
// senado.ts — mercado de disputa do Senado de uma UF (2026).
//
// Senado tem 2 vagas por UF (renovação de 2/3) e turno único em 04/10, então
// não existe "quem vence" (o gerador nem cria esse MULTI pra senador). O
// mercado de disputa do Senado é o MULTI "quem será o senador mais votado?"
// — vencedor único (o 1º colocado), com todos os candidatos ativos da base
// (já sincronizada com o TSE) COM candidate_id: marcar saída de alguém tira
// ele daqui também. Usado por run-senado.ts (uma UF) e
// run-publicar-disputas.ts (todas).
// ============================================================================
import type { Pool } from "pg";
import { suggestB } from "@ditofeito/core";
import { createMarketIdempotent } from "../domain/marketFactory.js";
import { CALENDARIO_2026 } from "./gerador.js";

const RESOLVE_BY = "2026-10-11T23:59:59-03:00";
export const UF_DE: Record<string, string> = {
  AC: "do Acre", AL: "de Alagoas", AP: "do Amapá", AM: "do Amazonas", BA: "da Bahia", CE: "do Ceará",
  DF: "do Distrito Federal", ES: "do Espírito Santo", GO: "de Goiás", MA: "do Maranhão", MT: "de Mato Grosso",
  MS: "de Mato Grosso do Sul", MG: "de Minas Gerais", PA: "do Pará", PB: "da Paraíba", PR: "do Paraná",
  PE: "de Pernambuco", PI: "do Piauí", RJ: "do Rio de Janeiro", RN: "do Rio Grande do Norte",
  RS: "do Rio Grande do Sul", RO: "de Rondônia", RR: "de Roraima", SC: "de Santa Catarina",
  SP: "de São Paulo", SE: "de Sergipe", TO: "do Tocantins",
};

export const senateSlug = (uf: string) => `mais-votado-senador-${uf.toLowerCase()}-2026`;

export async function senateCandidates(pool: Pool, uf: string) {
  const r = await pool.query(
    `SELECT id, coalesce(public_name, ballot_name, name) AS nome, party, tse_sq_candidato
       FROM candidates
      WHERE office = 'SENADOR' AND uf = $1
        AND candidacy_status IN ('PRE_ANUNCIADO','PRE_REIVINDICADO','REGISTRADO','DEFERIDO')
      ORDER BY 2`, [uf]);
  return r.rows as { id: string; nome: string; party: string; tse_sq_candidato: string | null }[];
}

/** Cria o MULTI (se não existir) e, com publish, publica — inclusive se já
 *  existia como rascunho. Idempotente pelo slug. */
export async function ensureSenateMarket(pool: Pool, uf: string, publish: boolean):
    Promise<{ estado: "CRIADO" | "RASCUNHO" | "PUBLICADO" | "JÁ EXISTE"; candidatos: number }> {
  if (!UF_DE[uf]) throw new Error(`UF inválida: ${uf}`);
  const cat = await pool.query(`SELECT id FROM categories WHERE slug = 'eleicoes-2026'`);
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!cat.rowCount || !sys.rowCount) throw new Error("Seed ausente: categoria 'eleicoes-2026' e usuário 'sistema'");
  const cands = await senateCandidates(pool, uf);
  if (cands.length < 2) throw new Error(`menos de 2 candidatos ativos a senador/${uf} na base — rode a sync do TSE antes`);

  const slug = senateSlug(uf);
  const outcomes = [
    ...cands.map((c) => ({ label: `${c.nome} (${c.party})`, candidateId: c.id })),
    { label: "OUTROS", isCatchall: true },
  ];
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { created } = await createMarketIdempotent(c, {
      slug, title: `Quem será o senador mais votado ${UF_DE[uf]} em 2026?`,
      categoryId: cat.rows[0].id, type: "MULTI",
      liquidityB: suggestB(outcomes.length, 150), status: publish ? "OPEN" : "DRAFT",
      resolutionCriteria:
        `Resolve no candidato a senador ${UF_DE[uf]} com o maior número de votos válidos na eleição de ` +
        `04/10/2026 (turno único), conforme a totalização final do TSE. São 2 vagas: este mercado trata só ` +
        `do PRIMEIRO colocado. Candidato não listado resolve em OUTROS. Anula se a eleição for adiada ou anulada.`,
      resolutionSource: "TSE — resultado oficial (resultados.tse.jus.br)",
      closeAt: CALENDARIO_2026.primeiroTurno, resolveBy: RESOLVE_BY,
      isElectoral: true, createdBy: sys.rows[0].id, regionUf: uf, outcomes,
    });
    let publicado = false;
    if (!created && publish) {
      const u = await c.query(`UPDATE markets SET status = 'OPEN' WHERE slug = $1 AND status = 'DRAFT'`, [slug]);
      publicado = !!u.rowCount;
    }
    await c.query("COMMIT");
    return {
      estado: created ? (publish ? "CRIADO" : "RASCUNHO") : publicado ? "PUBLICADO" : "JÁ EXISTE",
      candidatos: cands.length,
    };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
