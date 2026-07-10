import { z } from "zod";
import { router, protectedProcedure } from "../trpc/trpc.js";
import { executeTrade } from "../domain/trade.js";
import { throwAsTRPC } from "../trpc/errors.js";

export const tradeRouter = router({
  execute: protectedProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        outcomeId: z.string().uuid(),
        side: z.enum(["BUY", "SELL"]),
        amount: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await executeTrade(ctx.pool, { ...input, userId: ctx.user.id });
      } catch (e) {
        throwAsTRPC(e);
      }
    }),
});
