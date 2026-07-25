// CLI pra rodar o gerador de sugestões financeiras manualmente/via cron.
// Este gerador SEMPRE nasce em DRAFT (revisão editorial obrigatória — ver
// comentário em generators/financeiro.ts), não tem flag --publish.
//
// Uso: node dist/jobs/run-financeiro.js [--dry-run]
//   --dry-run: busca preço real na API e imprime a proposta, sem tocar no
//              banco (nem precisa de Postgres rodando).
import { getPool } from "@ditofeito/db";
import { rodarGeradorFinanceiro, dryRunFinanceiro } from "./generators/financeiro.js";

if (process.argv.includes("--dry-run")) {
  dryRunFinanceiro()
    .then((propostas) => {
      console.log(`[financeiro] dry-run — ${propostas.length} mercado(s) seriam propostos:\n`);
      for (const p of propostas) {
        console.log(`- ${p.title}\n  slug=${p.slug} closeAt=${p.closeAt} resolveBy=${p.resolveBy}\n`);
      }
      process.exit(0);
    })
    .catch((e) => { console.error(e); process.exit(1); });
} else {
  rodarGeradorFinanceiro(getPool())
    .then((r) => {
      console.log(`[financeiro] criados=${r.criados} (DRAFT)`);
      process.exit(0);
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
