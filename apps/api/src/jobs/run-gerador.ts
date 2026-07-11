// CLI pra rodar o gerador de mercados eleitorais manualmente/via cron.
// gerador.ts nunca teve um jeito de ser invocado — rodarGerador() só existia
// como export, sem entrypoint (mesmo padrão do runner de migrate.ts).
//
// Uso: node dist/jobs/run-gerador.js [--publish]
//   sem --publish: mercados nascem em DRAFT (revisão editorial no admin antes
//                  de ir ao ar — default seguro pra primeira carga real).
//   --publish:     nasce OPEN direto (GERADOR_CONFIG.publicarDireto).
import { getPool } from "@ditofeito/db";
import { rodarGerador } from "./gerador.js";

const publish = process.argv.includes("--publish");

rodarGerador(getPool(), { publicarDireto: publish })
  .then((r) => {
    console.log(`binarios=${r.binarios} multis=${r.multis} outcomesSincronizados=${r.outcomesSincronizados} (${publish ? "OPEN" : "DRAFT"})`);
    process.exit(0);
  })
  .catch((e) => { console.error(e); process.exit(1); });
