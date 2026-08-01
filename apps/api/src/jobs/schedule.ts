// Agendamento em processo (node-cron) — plano-construcao.md §2: "um processo a
// menos p/ operar; volume não justifica fila" nesta fase.
import cron from "node-cron";
import type { Pool } from "pg";
import { rodarGerador } from "./gerador.js";
import { rodarGeradorEsporte } from "./generators/esporte.js";
import { rodarGeradorFinanceiro } from "./generators/financeiro.js";
import { verifyLedgerChain } from "../domain/trade.js";
import { sendBolaoClosingReminders } from "./bolaoReminder.js";

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

  // Gerador de esporte diário: fixtures novos -> mercados 3-outcomes (idempotente).
  // Roda depois do eleitoral (06:00) pra não competir pela mesma janela de I/O.
  cron.schedule("30 6 * * *", async () => {
    try {
      const r = await rodarGeradorEsporte(pool);
      console.log("[jobs] rodarGeradorEsporte", r);
    } catch (e) {
      console.error("[jobs] rodarGeradorEsporte falhou", e);
    }
  });

  // Gerador financeiro semanal (não diário — sugestão de limiar não muda todo
  // dia; cadência menor evita fadiga de fila de revisão no admin).
  cron.schedule("0 7 * * 1", async () => {
    try {
      const r = await rodarGeradorFinanceiro(pool);
      console.log("[jobs] rodarGeradorFinanceiro", r);
    } catch (e) {
      console.error("[jobs] rodarGeradorFinanceiro falhou", e);
    }
  });

  // Auditoria noturna do ledger — alarme de integridade
  cron.schedule("0 3 * * *", async () => {
    const r = await verifyAllLedgers(pool);
    if (r.broken.length) console.error("[jobs] LEDGER QUEBRADO", r.broken);
    else console.log(`[jobs] verifyAllLedgers OK (${r.checked} usuários)`);
  });

  // Lembrete de bolão fechando — de hora em hora (cadência bem mais curta que
  // os outros jobs, todos diários/semanais; a dedupe fica na própria query,
  // ver bolaoReminder.ts).
  cron.schedule("0 * * * *", async () => {
    try {
      const r = await sendBolaoClosingReminders(pool);
      console.log("[jobs] sendBolaoClosingReminders", r);
    } catch (e) {
      console.error("[jobs] sendBolaoClosingReminders falhou", e);
    }
  });

  // runMatcher NÃO entra no cron: roda sob demanda a cada republicação do TSE
  // (disparado pelo painel admin — ver apps/api/src/jobs/matcher.ts).
}
