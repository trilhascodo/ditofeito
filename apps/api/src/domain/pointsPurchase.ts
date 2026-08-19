// ============================================================================
// pointsPurchase.ts — crédito de pontos por compra do usuário comum
// (migrations/044_user_points_topup.sql). Mesmo padrão de
// domain/sponsorBilling.ts::creditApprovedPayment, mas creditando
// point_ledger (via trade.ts::appendLedger, reason TOPUP) em vez do saldo em
// centavos do sponsor — categorias de conta e de risco diferentes, nunca
// reaproveitar a mesma tabela/ledger.
//
// Único caminho de código que credita pontos por um pagamento aprovado no
// Mercado Pago — chamado tanto pelo webhook (http/mercadoPagoWebhook.ts)
// quanto, de forma síncrona, pelo branch CARD de routers/points.ts::createTopup
// (cartão aprova na hora, não espera webhook). Idempotente via
// `WHERE status = 'PENDING'`: reentrega do mesmo mp_payment_id é no-op.
// ============================================================================
import type { Pool } from "pg";
import { appendLedger } from "./trade.js";

export async function creditApprovedUserPayment(pool: Pool, paymentId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE user_payments SET status = 'APPROVED', paid_at = now()
         WHERE id = $1 AND status = 'PENDING' RETURNING user_id, points`,
      [paymentId],
    );
    if (upd.rowCount) {
      const userId = upd.rows[0].user_id as string;
      const points = Number(upd.rows[0].points);
      // Lock na linha do usuário antes de appendLedger — mesma convenção de
      // domain/trade.ts (PRESSUPÕE lock já tomado).
      await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      await appendLedger(client, userId, points, "TOPUP", "payment", paymentId);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
