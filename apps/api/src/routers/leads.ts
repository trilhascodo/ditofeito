import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";
import { verifyCaptcha } from "../lib/captcha.js";

// ----------------------------------------------------------------------------
// Leads da página pública /anuncie — quem quer contratar um plano de
// patrocínio mas ainda não tem conta de anunciante vinculada. Sem CRM/e-mail
// de terceiro: vira lead no banco, admin acompanha em /admin/leads.
// ----------------------------------------------------------------------------
export const leadsRouter = router({
  create: publicProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(120),
      company: z.string().trim().min(1).max(120),
      email: z.string().trim().email(),
      phone: z.string().trim().max(40).optional(),
      plan: z.enum(["BASICO", "PROFISSIONAL", "PREMIUM"]).optional(),
      message: z.string().trim().max(2000).optional(),
      captchaToken: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const captchaOk = await verifyCaptcha(input.captchaToken);
      if (!captchaOk) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível validar o captcha" });

      await ctx.pool.query(
        `INSERT INTO sponsor_leads (name, company, email, phone, plan, message)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [input.name, input.company, input.email, input.phone ?? null, input.plan ?? null, input.message ?? null],
      );
      return { ok: true };
    }),

  list: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT id, name, company, email, phone, plan, message, status, created_at
         FROM sponsor_leads ORDER BY created_at DESC`,
    );
    return r.rows.map((row) => ({
      id: row.id as string, name: row.name as string, company: row.company as string,
      email: row.email as string, phone: row.phone as string | null,
      plan: row.plan as string | null, message: row.message as string | null,
      status: row.status as string, createdAt: row.created_at as string,
    }));
  }),

  markContacted: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`UPDATE sponsor_leads SET status = 'CONTATADO' WHERE id = $1`, [input.id]);
      return { ok: true };
    }),
});
