// CLI: mercados de bancada de deputado (federal e estadual) de uma UF — ver
// deputados.ts. As opções (partidos isolados e federações com candidatos
// ativos) saem do arquivo do TSE, o mesmo da sync de candidatos.
//
// Uso (na VPS, a partir da raiz do repo):
//   docker compose -f infra/docker-compose.yml exec -T api node apps/api/dist/jobs/run-deputados.js --uf MA --arquivo - < consulta_cand_2026.zip
//   --publish   publica (sem isso nasce em DRAFT; se já existe como rascunho, publica)
// Idempotente pelo slug: rodar de novo não duplica nem troca as opções.
import { getPool } from "@ditofeito/db";
import { suggestB } from "@ditofeito/core";
import { readConsultaCand } from "../lib/tseCsv.js";
import { createMarketIdempotent } from "../domain/marketFactory.js";
import { CALENDARIO_2026 } from "./gerador.js";
import { UF_DE } from "./senado.js";
import { agremiacoes, type Casa } from "./deputados.js";

const TSE_ZIP_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip";
const RESOLVE_BY = "2026-10-18T23:59:59-03:00"; // distribuição das vagas (sobras) leva alguns dias
const args = process.argv.slice(2);
const publish = args.includes("--publish");
const uf = (args.includes("--uf") ? args[args.indexOf("--uf") + 1] ?? "" : "").toUpperCase();

async function readInput(): Promise<Buffer> {
  if (args.includes("--arquivo") && args[args.indexOf("--arquivo") + 1] === "-") {
    const chunks: Buffer[] = [];
    for await (const ch of process.stdin) chunks.push(ch as Buffer);
    return Buffer.concat(chunks);
  }
  const res = await fetch(TSE_ZIP_URL, { headers: { "User-Agent": "Mozilla/5.0 (DitoFeito; mercados de deputado)" } });
  if (!res.ok) throw new Error(`TSE respondeu ${res.status} — baixe o consulta_cand_2026.zip e passe com --arquivo -`);
  return Buffer.from(await res.arrayBuffer());
}

const CASA_TXT: Record<Casa, { plural: string; slug: string }> = {
  FEDERAL: { plural: "deputados federais", slug: "federal" },
  ESTADUAL: { plural: "deputados estaduais", slug: "estadual" },
};
// "pelo Maranhão" / "no Maranhão" — mas "pela Bahia", "em São Paulo"...
function onde(casa: Casa, u: string): string {
  const de = UF_DE[u]; // "do Maranhão", "da Bahia", "de São Paulo"
  const nome = de.replace(/^d[oae]s? /, "");
  const art = de.startsWith("do ") ? "o" : de.startsWith("da ") ? "a" : de.startsWith("dos ") ? "os" : "";
  if (casa === "FEDERAL") return art ? `pel${art} ${nome}` : `por ${nome}`;
  return art ? `n${art} ${nome}` : `em ${nome}`;
}

async function main() {
  if (!UF_DE[uf]) throw new Error("informe a UF: --uf MA");
  const pool = getPool();
  const rows = readConsultaCand(await readInput());
  const cat = await pool.query(`SELECT id FROM categories WHERE slug = 'eleicoes-2026'`);
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!cat.rowCount || !sys.rowCount) throw new Error("Seed ausente: categoria 'eleicoes-2026' e usuário 'sistema'");

  for (const casa of ["FEDERAL", "ESTADUAL"] as Casa[]) {
    const ags = agremiacoes(rows, casa, uf);
    const t = CASA_TXT[casa];
    const slug = `bancada-${t.slug}-${uf.toLowerCase()}-2026`;
    if (ags.length < 2) { console.log(`PULADO    ${slug} — menos de 2 partidos/federações com candidatos no arquivo`); continue; }
    const outcomes = [...ags.map((a) => ({ label: a.label })), { label: "OUTROS", isCatchall: true }];
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const { created } = await createMarketIdempotent(c, {
        slug,
        title: `Qual partido ou federação elegerá mais ${t.plural} ${onde(casa, uf)} em 2026?`,
        categoryId: cat.rows[0].id, type: "MULTI",
        liquidityB: suggestB(outcomes.length, 150), status: publish ? "OPEN" : "DRAFT",
        resolutionCriteria:
          `Resolve no partido isolado ou federação (a federação conta como uma só, como na distribuição das ` +
          `vagas) que eleger o maior número de ${t.plural} ${onde(casa, uf)} na eleição de 04/10/2026, conforme ` +
          `a totalização final do TSE — contam os eleitos por quociente partidário e por média. Empate: vence ` +
          `quem tiver mais votos válidos (nominais + legenda) para o cargo no estado. Agremiação não listada ` +
          `resolve em OUTROS. Anula se a eleição for adiada ou anulada.`,
        resolutionSource: "TSE — resultado oficial e distribuição das vagas (resultados.tse.jus.br)",
        closeAt: CALENDARIO_2026.primeiroTurno, resolveBy: RESOLVE_BY,
        isElectoral: true, createdBy: sys.rows[0].id, regionUf: uf, outcomes,
      });
      let publicado = false;
      if (!created && publish) {
        const u = await c.query(`UPDATE markets SET status = 'OPEN' WHERE slug = $1 AND status = 'DRAFT'`, [slug]);
        publicado = !!u.rowCount;
      }
      await c.query("COMMIT");
      const estado = created ? (publish ? "CRIADO   " : "RASCUNHO ") : publicado ? "PUBLICADO" : "JÁ EXISTE";
      console.log(`${estado} ${slug} — ${ags.length} partidos/federações + OUTROS:`);
      for (const a of ags) console.log(`    ${a.label} (${a.candidatos} candidatos)`);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
