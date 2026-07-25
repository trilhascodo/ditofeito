// CLI pra rodar o gerador de mercados esportivos manualmente/via cron.
// Mesmo padrão de run-gerador.ts.
//
// Uso: node dist/jobs/run-esporte.js [--publish|--dry-run]
//   sem flag:   mercados nascem em DRAFT (revisão editorial no admin antes
//               de ir ao ar — default seguro pra primeira carga real).
//   --publish:  nasce OPEN direto.
//   --dry-run:  só busca na API real e imprime o que seria criado — NÃO toca
//               no banco (nem precisa de Postgres rodando). Serve pra testar
//               a integração com a API antes de ter um banco local de pé.
import { getPool } from "@ditofeito/db";
import { rodarGeradorEsporte, dryRunEsporte } from "./generators/esporte.js";

const publish = process.argv.includes("--publish");
const dryRun = process.argv.includes("--dry-run");

if (dryRun) {
  dryRunEsporte()
    .then((propostos) => {
      console.log(`[esporte] dry-run — ${propostos.length} mercado(s) seriam criados:\n`);
      for (const p of propostos) {
        console.log(`- ${p.title}\n  slug=${p.slug} closeAt=${p.closeAt} resolveBy=${p.resolveBy}\n`);
      }
      process.exit(0);
    })
    .catch((e) => { console.error(e); process.exit(1); });
} else {
  rodarGeradorEsporte(getPool(), { publicarDireto: publish })
    .then((r) => {
      console.log(`[esporte] criados=${r.criados} (${publish ? "OPEN" : "DRAFT"})`);
      process.exit(0);
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
