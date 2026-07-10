// Agendamento em processo (node-cron) — plano-construcao.md §2: "um processo a
// menos p/ operar; volume não justifica fila" nesta fase.
import cron from "node-cron";
import type { Pool } from "pg";
import { rodarGerador } from "./gerador.js";
import { verifyLedgerChain } from "../domain/trade.js";

/** Roda verifyLedgerChain para todo usuário; loga qualquer cadeia quebrada
 *  (não deve acontecer — é alarme de integridade, não fluxo esperado). */
export async function verifyAllLedgers(pool: Pool): Promise<{ checked: number; broken: string[] }> {
  const { rows } = await pool.query(`SELECT id FROM users`);
  const broken: string[] = [];
  for (const { id } of rows) {
    const ok = await verifyLedgerChain(pool, id);
    if (!ok) broken.push(id);
  }
  return { checked: rows.length, broken };
}

export function startJobs(pool: Pool) {
  // Gerador diário: novos pré-candidatos -> mercados (idempotente)
  cron.schedule("0 6 * * *", async () => {
    try {
      const r = await rodarGerador(pool);
      console.log("[jobs] rodarGerador", r);
    } catch (e) {
      console.error("[jobs] rodarGerador falhou", e);
    }
  });

  // Auditoria noturna do ledger — alarme de integridade
  cron.schedule("0 3 * * *", async () => {
    const r = await verifyAllLedgers(pool);
    if (r.broken.length) console.error("[jobs] LEDGER QUEBRADO", r.broken);
    else console.log(`[jobs] verifyAllLedgers OK (${r.checked} usuários)`);
  });

  // runMatcher NÃO entra no cron: roda sob demanda a cada republicação do TSE
  // (disparado pelo painel admin — ver apps/api/src/jobs/matcher.ts).
}
