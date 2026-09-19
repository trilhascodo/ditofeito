// CLI: cria os mercados de 1º turno 2026 (04/10) — "haverá 2º turno?" pra
// presidente/SP/MA e "quem terá mais votos no 1º turno?" pra governador de
// SP/MA. Uma vez só, à mão (idempotente pelo slug: rodar de novo não duplica
// nem mexe no que já existe).
//
// Os "mais votado" copiam as opções do MULTI "quem vence" da mesma disputa
// (já revisado no admin), COM o candidate_id — digitados à mão no formulário
// ficariam sem vínculo, e marcar a saída do candidato (candidate.updateStatus)
// não o tiraria desses mercados.
//
// Uso (na VPS): docker compose -f infra/docker-compose.yml exec api node dist/jobs/run-primeiro-turno.js [--publish]
//   sem --publish: nasce em DRAFT (revisar em Admin → Mercados e publicar).
import { getPool } from "@ditofeito/db";
import { suggestB } from "@ditofeito/core";
import { createMarketIdempotent, type MarketOutcomeInput } from "../domain/marketFactory.js";
import { CALENDARIO_2026 } from "./gerador.js";

const publish = process.argv.includes("--publish");
const RESOLVE_BY = "2026-10-11T23:59:59-03:00"; // uma semana pra totalização final
const FONTE = "TSE — resultado oficial do 1º turno (resultados.tse.jus.br)";
const UF_NOME: Record<string, string> = { SP: "São Paulo", MA: "Maranhão" };
const UF_DE: Record<string, string> = { SP: "de São Paulo", MA: "do Maranhão" };

interface Def {
  slug: string; title: string; type: "BINARY" | "MULTI"; uf: string | null;
  criteria: string; copyFrom?: string;
}

const segundoTurno = (cargo: string, uf: string | null): Def => {
  const onde = uf ? ` ${UF_DE[uf]}` : "";
  const local = uf ? ` em ${UF_NOME[uf]}` : "";
  return {
    slug: `segundo-turno-${cargo}${uf ? "-" + uf.toLowerCase() : ""}-2026`,
    title: `Haverá 2º turno para ${cargo}${onde} em 2026?`,
    type: "BINARY", uf,
    criteria:
      `Resolve SIM se nenhum candidato a ${cargo}${onde} obtiver mais de 50% dos votos válidos ` +
      `no 1º turno de 04/10/2026, conforme a totalização do TSE. Resolve NÃO se um candidato for ` +
      `eleito já no 1º turno. Anula se o 1º turno${local} for adiado ou anulado pela Justiça Eleitoral.`,
  };
};

const maisVotado = (uf: string): Def => ({
  slug: `mais-votado-1turno-governador-${uf.toLowerCase()}-2026`,
  title: `Quem terá mais votos para governador ${UF_DE[uf]} no 1º turno?`,
  type: "MULTI", uf,
  copyFrom: `quem-vence-disputa-governador-${uf.toLowerCase()}-2026`,
  criteria:
    `Resolve no candidato com o maior número de votos válidos para governador ${UF_DE[uf]} no ` +
    `1º turno de 04/10/2026, conforme a totalização final do TSE, mesmo que haja 2º turno. ` +
    `Candidato não listado resolve em OUTROS. Anula se o 1º turno for adiado ou anulado.`,
});

const DEFS: Def[] = [
  segundoTurno("presidente", null),
  segundoTurno("governador", "SP"),
  segundoTurno("governador", "MA"),
  maisVotado("SP"),
  maisVotado("MA"),
];

async function main() {
  const pool = getPool();
  const cat = await pool.query(`SELECT id FROM categories WHERE slug = 'eleicoes-2026'`);
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!cat.rowCount || !sys.rowCount) throw new Error("Seed ausente: categoria 'eleicoes-2026' e usuário 'sistema'");

  for (const d of DEFS) {
    let outcomes: MarketOutcomeInput[] = [{ label: "SIM" }, { label: "NÃO" }];
    if (d.type === "MULTI") {
      const src = await pool.query(
        `SELECT o.label, o.candidate_id FROM market_outcomes o JOIN markets m ON m.id = o.market_id
          WHERE m.slug = $1 AND NOT o.is_catchall ORDER BY o.display_order, o.label`, [d.copyFrom]);
      if (src.rowCount! < 2) {
        console.log(`PULADO  ${d.slug} — "${d.copyFrom}" não existe ou tem menos de 2 candidatos`);
        continue;
      }
      outcomes = [
        ...src.rows.map((r) => ({ label: r.label as string, candidateId: (r.candidate_id as string | null) ?? undefined })),
        { label: "OUTROS", isCatchall: true },
      ];
    }
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const { created } = await createMarketIdempotent(c, {
        slug: d.slug, title: d.title, categoryId: cat.rows[0].id, type: d.type,
        liquidityB: suggestB(outcomes.length, d.type === "BINARY" ? 40 : 150),
        status: publish ? "OPEN" : "DRAFT",
        resolutionCriteria: d.criteria, resolutionSource: FONTE,
        closeAt: CALENDARIO_2026.primeiroTurno, resolveBy: RESOLVE_BY,
        isElectoral: true, createdBy: sys.rows[0].id, regionUf: d.uf,
        outcomes,
      });
      await c.query("COMMIT");
      const n = d.type === "MULTI" ? ` (${outcomes.length - 1} candidatos + OUTROS)` : "";
      console.log(`${created ? (publish ? "CRIADO  " : "RASCUNHO") : "JÁ EXISTE"} ${d.slug}${n}`);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
