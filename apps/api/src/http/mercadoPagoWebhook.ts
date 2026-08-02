// ============================================================================
// mercadoPagoWebhook.ts — POST /webhooks/mercadopago
//
// Mercado Pago avisa quando o status de um pagamento muda. A fonte de
// verdade NUNCA é o corpo desse POST (qualquer um pode forjar um POST pra
// esse endpoint) — é sempre um GET novo em /v1/payments/:id com o NOSSO
// access token (lib/mercadoPago.ts::getPayment). Por isso a verificação de
// assinatura (x-signature) aqui é reforço, não o portão real: mesmo que a
// assinatura falhe ou o cálculo dela esteja levemente errado em relação à
// versão exata que o Mercado Pago usa (não dá pra testar isso sem uma conta
// real, que não é algo que eu consigo criar), um POST forjado só faz a
// gente reconsultar um id de pagamento real via API autenticada — não tem
// como forjar A RESPOSTA dessa consulta. O guard de verdade contra crédito
// duplicado é o idempotente `WHERE status = 'PENDING'` no UPDATE abaixo.
// ============================================================================
import { createHmac, timingSafeEqual } from "node:crypto";
import type express from "express";
import type { Pool } from "pg";
import { MERCADOPAGO_CONFIG } from "../config.js";
import { getPayment } from "../lib/mercadoPago.js";
import { asyncHandler } from "./asyncHandler.js";

// Formato documentado do Mercado Pago: header "ts=<epoch>,v1=<hmac-hex>",
// manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". Só roda se
// MERCADOPAGO_WEBHOOK_SECRET estiver configurado — sem secret, pula
// silenciosamente (mesmo padrão do resto do projeto: ausência de chave
// desliga a checagem, não derruba o fluxo). Resultado é só logado, nunca
// bloqueia sozinho (ver comentário do arquivo).
function logSignatureMismatch(req: express.Request, dataId: string): void {
  if (!MERCADOPAGO_CONFIG.webhookSecret) return;
  const sigHeader = req.get("x-signature");
  const requestId = req.get("x-request-id");
  if (!sigHeader) { console.warn("[mercadopago-webhook] sem x-signature"); return; }

  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.trim().split("=").map((s) => s.trim())),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) { console.warn("[mercadopago-webhook] x-signature em formato inesperado"); return; }

  const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", MERCADOPAGO_CONFIG.webhookSecret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) console.warn("[mercadopago-webhook] assinatura não bateu — seguindo pela reconsulta via API mesmo assim");
}

export function mountMercadoPagoWebhook(app: express.Express, pool: Pool) {
  app.post("/webhooks/mercadopago", asyncHandler(async (req, res) => {
    const type = req.body?.type as string | undefined;
    const dataId = req.body?.data?.id as string | undefined;
    // Sempre 200 rápido pro Mercado Pago não ficar reentregando por engano
    // de formato — não é erro nosso um webhook de tipo que a gente ignora.
    if (type !== "payment" || !dataId) return res.status(200).json({ ok: true });

    logSignatureMismatch(req, String(dataId));

    let status: string;
    try {
      status = (await getPayment(String(dataId))).status;
    } catch (e) {
      console.error("[mercadopago-webhook] falha ao reconsultar pagamento", dataId, e);
      return res.status(200).json({ ok: true }); // MP reentrega; nosso log já registrou
    }

    const payment = await pool.query(
      `SELECT id, sponsor_id, amount_cents, status FROM sponsor_payments WHERE mp_payment_id = $1`,
      [String(dataId)],
    );
    if (!payment.rowCount) return res.status(200).json({ ok: true }); // não é nosso (ou já foi limpo)
    const row = payment.rows[0];

    if (status === "approved" && row.status === "PENDING") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const upd = await client.query(
          `UPDATE sponsor_payments SET status = 'APPROVED', paid_at = now()
             WHERE id = $1 AND status = 'PENDING' RETURNING sponsor_id, amount_cents`,
          [row.id],
        );
        // Reentrega do mesmo webhook depois que outra já processou — idempotente, no-op.
        if (upd.rowCount) {
          const sponsorId = upd.rows[0].sponsor_id as string;
          const amountCents = Number(upd.rows[0].amount_cents);
          await client.query(`SELECT id FROM sponsors WHERE id = $1 FOR UPDATE`, [sponsorId]);
          const cur = await client.query(`SELECT balance_cents FROM sponsors WHERE id = $1`, [sponsorId]);
          const newBalance = Number(cur.rows[0].balance_cents) + amountCents;
          await client.query(`UPDATE sponsors SET balance_cents = $2 WHERE id = $1`, [sponsorId, newBalance]);
          await client.query(
            `INSERT INTO sponsor_ledger (sponsor_id, delta_cents, balance_after_cents, reason, payment_id)
             VALUES ($1,$2,$3,'TOPUP',$4)`,
            [sponsorId, amountCents, newBalance, row.id],
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        console.error("[mercadopago-webhook] falha ao creditar saldo", dataId, e);
      } finally {
        client.release();
      }
    } else if ((status === "rejected" || status === "cancelled") && row.status === "PENDING") {
      await pool.query(
        `UPDATE sponsor_payments SET status = $2 WHERE id = $1 AND status = 'PENDING'`,
        [row.id, status === "rejected" ? "REJECTED" : "CANCELLED"],
      );
    }

    res.status(200).json({ ok: true });
  }));
}
