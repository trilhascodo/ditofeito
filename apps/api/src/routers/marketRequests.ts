import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";
import { verifyCaptcha } from "../lib/captcha.js";

// ----------------------------------------------------------------------------
// Solicitação de criação de mercado — serviço contratado (veículo de
// comunicação, agência etc. propõe um mercado), não conteúdo aberto de
// usuário. Vira registro no banco pro admin revisar; aprovar aqui só marca
// status, o mercado em si continua sendo criado pelo fluxo normal do admin
// (market.create), com resolution_criteria/resolution_source exigidos —
// mesma esteira editorial de sempre, isso só abre a porta de entrada.
// ----------------------------------------------------------------------------
export const marketRequestsRouter = router({
  create: publicProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(120),
      company: z.string().trim().min(1).max(120),
      email: z.string().trim().email(),
      phone: z.string().trim().max(40).optional(),
      proposedTitle: z.string().trim().min(1).max(300),
      proposedCriteria: z.string().trim().min(10).max(2000),
      proposedSource: z.string().trim().min(2).max(300),
      message: z.string().trim().max(2000).optional(),
      captchaToken: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const captchaOk = await verifyCaptcha(input.captchaToken);
      if (!captchaOk) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível validar o captcha" });

      await ctx.pool.query(
        `INSERT INTO market_requests
           (name, company, email, phone, proposed_title, proposed_criteria, proposed_source, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.name, input.company, input.email, input.phone ?? null,
          input.proposedTitle, input.proposedCriteria, input.proposedSource, input.message ?? null],
      );
      return { ok: true };
    }),

  list: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT id, name, company, email, phone, proposed_title, proposed_criteria, proposed_source,
              message, status, admin_note, created_at
         FROM market_requests ORDER BY created_at DESC`,
    );
    return r.rows.map((row) => ({
      id: row.id as string, name: row.name as string, company: row.company as string,
      email: row.email as string, phone: row.phone as string | null,
      proposedTitle: row.proposed_title as string, proposedCriteria: row.proposed_criteria as string,
      proposedSource: row.proposed_source as string, message: row.message as string | null,
      status: row.status as string, adminNote: row.admin_note as string | null,
      createdAt: row.created_at as string,
    }));
  }),

  approve: adminProcedure
    .input(z.object({ id: z.string().uuid(), adminNote: z.string().trim().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE market_requests SET status = 'APROVADO', admin_note = $2 WHERE id = $1`,
        [input.id, input.adminNote ?? null],
      );
      return { ok: true };
    }),

  reject: adminProcedure
    .input(z.object({ id: z.string().uuid(), adminNote: z.string().trim().max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE market_requests SET status = 'REJEITADO', admin_note = $2 WHERE id = $1`,
        [input.id, input.adminNote],
      );
      return { ok: true };
    }),
});
