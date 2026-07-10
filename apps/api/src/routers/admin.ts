import { z } from "zod";
import { router, resolverProcedure } from "../trpc/trpc.js";
import { resolveMarket, voidMarket } from "../domain/trade.js";
import { throwAsTRPC } from "../trpc/errors.js";

const justificationInput = {
  justification: z.string().trim().min(10),
  sourceUrl: z.string().url(),
};

export const adminRouter = router({
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
