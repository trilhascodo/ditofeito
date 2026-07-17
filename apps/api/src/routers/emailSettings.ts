import { z } from "zod";
import { router, adminProcedure } from "../trpc/trpc.js";
import { encrypt } from "../lib/crypto.js";
import { sendTransactionalEmail } from "../lib/email.js";

// Configuração de e-mail transacional pelo painel admin (/admin/email) em
// vez de só variável de ambiente na VPS — mesmo padrão já usado noutros
// projetos do usuário (SmartLicença, Sagace). api_key_encrypted nunca volta
// pro cliente decifrada; só um booleano dizendo se existe uma configurada.
export const emailSettingsRouter = router({
  get: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT from_address, api_key_encrypted FROM email_settings WHERE id = true`);
    const row = r.rows[0];
    return {
      fromAddress: row?.from_address as string,
      hasApiKey: !!row?.api_key_encrypted,
    };
  }),

  update: adminProcedure
    .input(z.object({
      fromAddress: z.string().trim().min(3),
      apiKey: z.string().trim().min(1).optional(),
      clearApiKey: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.clearApiKey) {
        await ctx.pool.query(
          `UPDATE email_settings SET from_address = $1, api_key_encrypted = NULL, updated_at = now() WHERE id = true`,
          [input.fromAddress]);
      } else if (input.apiKey) {
        await ctx.pool.query(
          `UPDATE email_settings SET from_address = $1, api_key_encrypted = $2, updated_at = now() WHERE id = true`,
          [input.fromAddress, encrypt(input.apiKey)]);
      } else {
        await ctx.pool.query(
          `UPDATE email_settings SET from_address = $1, updated_at = now() WHERE id = true`,
          [input.fromAddress]);
      }
      return { ok: true };
    }),

  sendTest: adminProcedure.mutation(async ({ ctx }) => {
    const u = await ctx.pool.query(`SELECT email FROM users WHERE id = $1`, [ctx.user.id]);
    const to = u.rows[0]?.email as string | undefined;
    if (!to) throw new Error("Sua conta não tem e-mail cadastrado");
    await sendTransactionalEmail(ctx.pool, {
      to, subject: "Teste de e-mail — DitoFeito",
      html: "<p>Se você recebeu isso, a configuração de e-mail do DitoFeito está funcionando.</p>",
    });
    return { ok: true, to };
  }),
});
