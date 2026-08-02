// ============================================================================
// sponsorBilling.ts — movimento de saldo pré-pago do sponsor
// (migrations/040_sponsor_billing.sql, 041_sponsor_card_payment.sql).
//
// appendSponsorLedger: mesmo formato de domain/trade.ts::appendLedger, sem
// hash-chain (aquilo é prova pública pro usuário, isso é registro interno).
//
// creditApprovedPayment: único caminho de código que credita saldo por um
// pagamento aprovado no Mercado Pago — chamado tanto pelo webhook
// (http/mercadoPagoWebhook.ts) quanto, de forma síncrona, pelo branch CARD
// de routers/sponsor.ts::createTopup (cartão aprova na hora, não espera
// webhook). Idempotente via `WHERE status = 'PENDING'`: se o webhook chegar
// depois pro mesmo mp_payment_id (Mercado Pago notifica todo pagamento, não
// só Pix/Boleto), a segunda chamada é no-op — nunca credita duas vezes.
// ============================================================================
import type { Pool, PoolClient } from "pg";

// PRESSUPÕE lock FOR UPDATE já tomado em sponsors (mesma convenção de
// domain/trade.ts::appendLedger).
export async function appendSponsorLedger(
  c: PoolClient, sponsorId: string, deltaCents: number,
  reason: "TOPUP" | "CAMPAIGN_CHARGE" | "REFUND" | "ADMIN_ADJUST",
  refs: { sponsorshipId?: string; paymentId?: string } = {},
): Promise<{ newBalanceCents: number }> {
  const cur = await c.query(`SELECT balance_cents FROM sponsors WHERE id = $1`, [sponsorId]);
  const newBalance = Number(cur.rows[0].balance_cents) + deltaCents;
  if (newBalance < 0) throw new Error("Saldo insuficiente");
  await c.query(`UPDATE sponsors SET balance_cents = $2 WHERE id = $1`, [sponsorId, newBalance]);
  await c.query(
    `INSERT INTO sponsor_ledger (sponsor_id, delta_cents, balance_after_cents, reason, sponsorship_id, payment_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [sponsorId, deltaCents, newBalance, reason, refs.sponsorshipId ?? null, refs.paymentId ?? null],
  );
  return { newBalanceCents: newBalance };
}

export async function creditApprovedPayment(pool: Pool, paymentId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE sponsor_payments SET status = 'APPROVED', paid_at = now()
         WHERE id = $1 AND status = 'PENDING' RETURNING sponsor_id, amount_cents`,
      [paymentId],
    );
    // Reentrega (webhook duplicado, ou cartão já creditado na hora e o
    // webhook chega depois) — idempotente, no-op.
    if (upd.rowCount) {
      const sponsorId = upd.rows[0].sponsor_id as string;
      const amountCents = Number(upd.rows[0].amount_cents);
      await client.query(`SELECT id FROM sponsors WHERE id = $1 FOR UPDATE`, [sponsorId]);
      await appendSponsorLedger(client, sponsorId, amountCents, "TOPUP", { paymentId });
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
