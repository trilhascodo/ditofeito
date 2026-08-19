// ============================================================================
// points.ts — compra de pontos pelo usuário comum (moeda recreativa, nunca
// resgatável em dinheiro — ver migrations/044_user_points_topup.sql e
// domain/pointsPurchase.ts). Mesmo padrão de routers/sponsor.ts::createTopup,
// mas pra conta de usuário comum (protectedProcedure, ctx.user.id) em vez de
// sponsor — categoria de risco e tabela (user_payments) diferentes de propósito.
// ============================================================================
import { z } from "zod";
import { router, protectedProcedure } from "../trpc/trpc.js";
import { createPixPayment, createBoletoPayment, createCardPayment, MercadoPagoError, CARD_REJECTION_MESSAGES } from "../lib/mercadoPago.js";
import { creditApprovedUserPayment } from "../domain/pointsPurchase.js";
import { POINTS_PURCHASE_CONFIG } from "../config.js";

const { pointsPerCent, minTopupCents, maxTopupCents } = POINTS_PURCHASE_CONFIG;
const minLabel = `mínimo R$ ${(minTopupCents / 100).toFixed(0)}`;
const maxLabel = `máximo R$ ${(maxTopupCents / 100).toFixed(0)}`;

const amountCentsSchema = z.number().int().min(minTopupCents, minLabel).max(maxTopupCents, maxLabel);

export const pointsRouter = router({
  // Config pública pro front calcular o preview de pontos sem duplicar os
  // números aqui (POINTS_PURCHASE_CONFIG é a única fonte de verdade).
  purchaseConfig: protectedProcedure.query(() => POINTS_PURCHASE_CONFIG),

  // Pagamentos Pix/boleto ainda não confirmados — pro front reabrir o QR
  // code/link se a pessoa navegar pra outra aba antes de pagar (mesmo padrão
  // de sponsor.ts::myBalance.pendingPayments).
  myPendingPayments: protectedProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT id, method, amount_cents, points, qr_code, boleto_url, created_at
         FROM user_payments WHERE user_id = $1 AND status = 'PENDING'
        ORDER BY created_at DESC`,
      [ctx.user.id],
    );
    return r.rows.map((row) => ({
      id: row.id as string, method: row.method as "PIX" | "BOLETO" | "CARD",
      amountCents: Number(row.amount_cents), points: Number(row.points),
      qrCode: row.qr_code as string | null, boletoUrl: row.boleto_url as string | null,
      createdAt: row.created_at as string,
    }));
  }),

  createTopup: protectedProcedure
    .input(z.discriminatedUnion("method", [
      z.object({ method: z.literal("PIX"), amountCents: amountCentsSchema }),
      z.object({ method: z.literal("BOLETO"), amountCents: amountCentsSchema }),
      z.object({
        method: z.literal("CARD"),
        amountCents: amountCentsSchema,
        // Token de uso único do Card Payment Brick (tokenização no
        // navegador) — nunca chega número de cartão/CVV aqui.
        token: z.string().min(1),
        paymentMethodId: z.string().min(1),
        issuerId: z.string().optional(),
        paymentMethodOptionId: z.string().optional(),
        payerEmail: z.string().email(),
        payerTaxId: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF (11 dígitos) ou CNPJ (14)"),
      }),
    ]))
    .mutation(async ({ ctx, input }) => {
      const points = input.amountCents * pointsPerCent;
      const description = `Compra de pontos DitoFeito — ${ctx.user.displayName}`;

      if (input.method === "CARD") {
        try {
          const r = await createCardPayment({
            amountCents: input.amountCents, description, token: input.token,
            paymentMethodId: input.paymentMethodId, issuerId: input.issuerId,
            paymentMethodOptionId: input.paymentMethodOptionId,
            payer: { email: input.payerEmail, taxId: input.payerTaxId },
          });
          if (r.status === "rejected") {
            await ctx.pool.query(
              `INSERT INTO user_payments (user_id, mp_payment_id, method, amount_cents, points, status, card_last4, card_brand)
               VALUES ($1,$2,'CARD',$3,$4,'REJECTED',$5,$6)`,
              [ctx.user.id, r.mpPaymentId, input.amountCents, points, r.cardLast4, r.cardBrand],
            );
            throw new Error(
              (r.statusDetail && CARD_REJECTION_MESSAGES[r.statusDetail])
              ?? "Pagamento recusado pelo seu banco — tente outro cartão ou use Pix/boleto.",
            );
          }
          // approved ou in_process: grava PENDING sempre — creditApprovedUserPayment
          // (idempotente) é o único caminho que efetivamente credita pontos,
          // mesmo quando já sabemos que veio "approved" aqui.
          const inserted = await ctx.pool.query(
            `INSERT INTO user_payments (user_id, mp_payment_id, method, amount_cents, points, status, card_last4, card_brand)
             VALUES ($1,$2,'CARD',$3,$4,'PENDING',$5,$6) RETURNING id`,
            [ctx.user.id, r.mpPaymentId, input.amountCents, points, r.cardLast4, r.cardBrand],
          );
          if (r.status === "approved") {
            try {
              await creditApprovedUserPayment(ctx.pool, inserted.rows[0].id as string);
            } catch (e) {
              // Dinheiro já foi cobrado de verdade no Mercado Pago — log
              // gritante pra reconciliar manualmente; o webhook ainda vai
              // chegar e tentar de novo (idempotente).
              console.error("[points.createTopup] cartão aprovado mas falhou ao creditar pontos — reconciliar manualmente", r.mpPaymentId, e);
            }
          }
          return {
            qrCode: null, qrCodeBase64: null, boletoUrl: null, points,
            cardStatus: r.status as "approved" | "in_process", cardLast4: r.cardLast4,
          };
        } catch (e) {
          if (e instanceof MercadoPagoError)
            throw new Error(`Não foi possível processar o cartão: ${e.message}`);
          throw e;
        }
      }

      const u = await ctx.pool.query(`SELECT email, cpf FROM users WHERE id = $1`, [ctx.user.id]);
      // Boleto registrado exige first_name/last_name do pagador (Pix não,
      // mas não custa mandar).
      const nameParts = ctx.user.displayName.trim().split(/\s+/);
      const payer = {
        email: u.rows[0].email as string, taxId: u.rows[0].cpf as string | null,
        firstName: nameParts[0], lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts[0],
      };

      try {
        if (input.method === "PIX") {
          const r = await createPixPayment({ amountCents: input.amountCents, description, payer });
          await ctx.pool.query(
            `INSERT INTO user_payments (user_id, mp_payment_id, method, amount_cents, points, status, qr_code)
             VALUES ($1,$2,'PIX',$3,$4,'PENDING',$5)`,
            [ctx.user.id, r.mpPaymentId, input.amountCents, points, r.qrCode],
          );
          return { qrCode: r.qrCode, qrCodeBase64: r.qrCodeBase64, boletoUrl: null, points, cardStatus: null, cardLast4: null };
        }
        const r = await createBoletoPayment({ amountCents: input.amountCents, description, payer });
        await ctx.pool.query(
          `INSERT INTO user_payments (user_id, mp_payment_id, method, amount_cents, points, status, boleto_url)
           VALUES ($1,$2,'BOLETO',$3,$4,'PENDING',$5)`,
          [ctx.user.id, r.mpPaymentId, input.amountCents, points, r.boletoUrl],
        );
        return { qrCode: null, qrCodeBase64: null, boletoUrl: r.boletoUrl, points, cardStatus: null, cardLast4: null };
      } catch (e) {
        if (e instanceof MercadoPagoError)
          throw new Error(`Não foi possível gerar a cobrança: ${e.message}`);
        throw e;
      }
    }),
});
