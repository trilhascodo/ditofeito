// CLI: mercado de disputa do Senado de UMA UF ("quem será o senador mais
// votado?") — ver senado.ts. Pra todas as UFs de uma vez, com conferência do
// TSE antes de publicar: run-publicar-disputas.ts.
//
// Uso (na VPS): docker compose -f infra/docker-compose.yml exec api node apps/api/dist/jobs/run-senado.js --uf MA [--publish]
//   sem --publish nasce em DRAFT; --publish publica mesmo se já existir como rascunho.
import { getPool } from "@ditofeito/db";
import { ensureSenateMarket, senateCandidates, senateSlug } from "./senado.js";

const args = process.argv.slice(2);
const publish = args.includes("--publish");
const uf = (args[args.indexOf("--uf") + 1] ?? "").toUpperCase();

async function main() {
  const pool = getPool();
  const semTse = (await senateCandidates(pool, uf)).filter((c) => !c.tse_sq_candidato).map((c) => c.nome);
  if (semTse.length) console.log(`AVISO: sem vínculo com o TSE (rode run-tse-sync --uf ${uf}): ${semTse.join(", ")}`);
  const r = await ensureSenateMarket(pool, uf, publish);
  console.log(`${r.estado.padEnd(9)} ${senateSlug(uf)} (${r.candidatos} candidatos + OUTROS)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
