import { z } from "zod";
import { router, resolverProcedure } from "../trpc/trpc.js";
import { resolveMarket, voidMarket } from "../domain/trade.js";
import { throwAsTRPC } from "../trpc/errors.js";

const justificationInput = {
  justification: z.string().trim().min(10),
  sourceUrl: z.string().url(),
};

export const adminRouter = router({
  // Único lugar que mostra DRAFT (mercados criados sem publish direto,
  // aguardando revisão editorial) — market.list público nunca inclui.
  listMarkets: resolverProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT m.id, m.slug, m.title, m.status, m.type, m.is_electoral,
              m.close_at, m.resolve_by, c.name AS category_name,
              (m.resolve_by < now() AND m.status IN ('OPEN','CLOSED')) AS overdue
         FROM markets m JOIN categories c ON c.id = m.category_id
        ORDER BY overdue DESC, m.created_at DESC
        LIMIT 200`,
    );
    return r.rows.map((row) => ({
      id: row.id as string, slug: row.slug as string, title: row.title as string,
      status: row.status as string, type: row.type as string, isElectoral: row.is_electoral as boolean,
      closeAt: row.close_at as Date, resolveBy: row.resolve_by as Date,
      categoryName: row.category_name as string, overdue: row.overdue as boolean,
    }));
  }),

  resolveMarket: resolverProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        winningOutcomeId: z.string().uuid(),
        ...justificationInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await resolveMarket(ctx.pool, { ...input, resolverUserId: ctx.user.id });
      } catch (e) {
        throwAsTRPC(e);
      }
    }),

  voidMarket: resolverProcedure
    .input(z.object({ marketId: z.string().uuid(), ...justificationInput }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await voidMarket(ctx.pool, { ...input, resolverUserId: ctx.user.id });
      } catch (e) {
        throwAsTRPC(e);
      }
    }),
});
