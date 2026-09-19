// CLI: mercados de Senado de uma UF para 2026.
//
// Senado tem 2 vagas por UF (renovação de 2/3) e turno único em 04/10, então
// não existe "quem vence" (o gerador nem cria esse MULTI pra senador). O que
// funciona com 2 vagas:
//   - binário "Fulano será eleito senador?" — 1 por candidato; o gerador já
//     cria em rascunho (slug eleito-*-senador-<uf>); aqui, com --publish, os
//     dos candidatos ATIVOS são publicados (quem saiu da disputa fica de fora);
//   - MULTI "quem será o senador mais votado?" — vencedor único (o 1º
//     colocado), criado aqui com as opções vindas da base de candidatos COM
//     candidate_id (marcar saída de alguém tira ele daqui também).
// Idempotente pelo slug; sem --publish tudo fica/nasce em DRAFT.
//
// Uso (na VPS): docker compose -f infra/docker-compose.yml exec api node apps/api/dist/jobs/run-senado.js --uf MA [--publish]
import { getPool } from "@ditofeito/db";
import { suggestB } from "@ditofeito/core";
import { createMarketIdempotent } from "../domain/marketFactory.js";
import { CALENDARIO_2026 } from "./gerador.js";

const args = process.argv.slice(2);
const publish = args.includes("--publish");
const uf = (args[args.indexOf("--uf") + 1] ?? "").toUpperCase();
const RESOLVE_BY = "2026-10-11T23:59:59-03:00";
const UF_DE: Record<string, string> = {
  AC: "do Acre", AL: "de Alagoas", AP: "do Amapá", AM: "do Amazonas", BA: "da Bahia", CE: "do Ceará",
  DF: "do Distrito Federal", ES: "do Espírito Santo", GO: "de Goiás", MA: "do Maranhão", MT: "de Mato Grosso",
  MS: "de Mato Grosso do Sul", MG: "de Minas Gerais", PA: "do Pará", PB: "da Paraíba", PR: "do Paraná",
  PE: "de Pernambuco", PI: "do Piauí", RJ: "do Rio de Janeiro", RN: "do Rio Grande do Norte",
  RS: "do Rio Grande do Sul", RO: "de Rondônia", RR: "de Roraima", SC: "de Santa Catarina",
  SP: "de São Paulo", SE: "de Sergipe", TO: "do Tocantins",
};

async function main() {
  if (!UF_DE[uf]) throw new Error("informe a UF: --uf MA");
  const pool = getPool();
  const cat = await pool.query(`SELECT id FROM categories WHERE slug = 'eleicoes-2026'`);
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!cat.rowCount || !sys.rowCount) throw new Error("Seed ausente: categoria 'eleicoes-2026' e usuário 'sistema'");

  const cands = await pool.query(
    `SELECT id, coalesce(public_name, ballot_name, name) AS nome, party, tse_sq_candidato
       FROM candidates
      WHERE office = 'SENADOR' AND uf = $1
        AND candidacy_status IN ('PRE_ANUNCIADO','PRE_REIVINDICADO','REGISTRADO','DEFERIDO')
      ORDER BY 2`, [uf]);
  if (cands.rowCount! < 2) throw new Error(`menos de 2 candidatos ativos a senador/${uf} na base — rode a sync do TSE antes`);
  const semTse = cands.rows.filter((c) => !c.tse_sq_candidato).map((c) => c.nome);
  if (semTse.length)
    console.log(`AVISO: sem vínculo com o TSE (rode run-tse-sync --uf ${uf}): ${semTse.join(", ")}`);

  // 1. MULTI "mais votado" (vencedor único = 1º colocado)
  const slug = `mais-votado-senador-${uf.toLowerCase()}-2026`;
  const outcomes = [
    ...cands.rows.map((c) => ({ label: `${c.nome} (${c.party})`, candidateId: c.id as string })),
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
    await c.query("COMMIT");
    console.log(`${created ? (publish ? "CRIADO   " : "RASCUNHO ") : "JÁ EXISTE"} ${slug} (${cands.rowCount} candidatos + OUTROS)`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }

  // 2. binários "será eleito?" dos candidatos ativos (criados em rascunho pelo gerador)
  const bins = await pool.query(
    `SELECT DISTINCT m.id, m.slug, m.status, cd.nome
       FROM markets m JOIN market_outcomes o ON o.market_id = m.id
       JOIN (SELECT id, coalesce(public_name, ballot_name, name) AS nome FROM candidates
              WHERE office = 'SENADOR' AND uf = $1
                AND candidacy_status IN ('PRE_ANUNCIADO','PRE_REIVINDICADO','REGISTRADO','DEFERIDO')) cd
         ON cd.id = o.candidate_id
      WHERE m.type = 'BINARY' AND m.slug LIKE 'eleito-%' ORDER BY m.slug`, [uf]);
  const comMercado = new Set<string>();
  for (const b of bins.rows) {
    comMercado.add(b.nome);
    if (publish && b.status === "DRAFT") {
      await pool.query(`UPDATE markets SET status = 'OPEN' WHERE id = $1 AND status = 'DRAFT'`, [b.id]);
      console.log(`PUBLICADO ${b.slug}`);
    } else {
      console.log(`${b.status.padEnd(9)} ${b.slug}`);
    }
  }
  const semBinario = cands.rows.map((x) => x.nome).filter((n) => !comMercado.has(n));
  if (semBinario.length)
    console.log(`Sem "será eleito?" ainda (rode o gerador no admin): ${semBinario.join(", ")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
