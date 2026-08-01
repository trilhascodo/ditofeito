// ============================================================================
// bolaoReminder.ts — lembrete "seu bolão fecha em breve" (BOLAO_CLOSING_SOON).
// Diferente dos outros jobs (diário/semanal, ver schedule.ts), este roda de
// hora em hora — precisa de dedupe explícito porque não é "1 execução = 1
// evento" como resolução de mercado ou geração de pré-candidatos.
// ============================================================================
import type { Pool } from "pg";
import { notify } from "../domain/notify.js";
import { sendTransactionalEmail } from "../lib/email.js";

const REMINDER_WINDOW_HOURS = 3;

export async function sendBolaoClosingReminders(pool: Pool): Promise<{ notified: number }> {
  // Membro do grupo, bolão ainda aberto (mercado OPEN ou, pra bolão de
  // evento próprio do grupo — ver migrations/036_bolao_custom.sql,
  // custom_close_at) e fecha dentro da janela, sem palpite dele ainda.
  // Dedup por (user_id, bolao_id) — precisa, e não dá pra reaproveitar
  // market_id como antes: bolão custom não tem mercado, então
  // market_id=NULL nunca bateria em si mesmo num WHERE e o lembrete
  // repetiria toda hora pro mesmo bolão.
  const r = await pool.query(
    `SELECT b.id AS bolao_id, b.market_id, b.group_id, gm.user_id, u.email, u.email_notifications,
            COALESCE(m.title, b.custom_title) AS market_title, g.name AS group_name
       FROM boloes b
       LEFT JOIN markets m ON m.id = b.market_id
       JOIN groups g ON g.id = b.group_id
       JOIN group_members gm ON gm.group_id = b.group_id
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN bolao_palpites bp ON bp.bolao_id = b.id AND bp.user_id = gm.user_id
      WHERE (
              (m.status = 'OPEN' AND m.close_at BETWEEN now() AND now() + interval '${REMINDER_WINDOW_HOURS} hours')
              OR (b.market_id IS NULL AND b.custom_close_at BETWEEN now() AND now() + interval '${REMINDER_WINDOW_HOURS} hours')
            )
        AND bp.user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.user_id = gm.user_id AND n.kind = 'BOLAO_CLOSING_SOON' AND n.bolao_id = b.id
        )`,
  );

  for (const row of r.rows) {
    const body = `Faltam poucas horas pro prazo do bolão "${row.market_title}" no grupo "${row.group_name}" — dá seu palpite!`;
    await notify(pool, row.user_id, "BOLAO_CLOSING_SOON", body, {
      marketId: row.market_id ?? undefined, groupId: row.group_id, bolaoId: row.bolao_id,
    });
    if (row.email_notifications) {
      sendTransactionalEmail(pool, {
        to: row.email as string,
        subject: `Bolão fechando: "${row.market_title}" — DitoFeito`,
        html: `<p>${body}</p>`,
      }).catch((e) => console.error("[jobs] envio de lembrete de bolão falhou", e));
    }
  }

  return { notified: r.rows.length };
}
