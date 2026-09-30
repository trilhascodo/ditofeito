import { z } from "zod";
import { router, protectedProcedure } from "../trpc/trpc.js";
import { executeTrade } from "../domain/trade.js";
import { activateReferralInBackground } from "../domain/referral.js";
import { throwAsTRPC } from "../trpc/errors.js";

export const tradeRouter = router({
  execute: protectedProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        outcomeId: z.string().uuid(),
        side: z.enum(["BUY", "SELL"]),
        amount: z.number().positive(),
        // Sugerida por geolocalização no cliente, só quando o usuário ligou o
        // opt-in de compartilhar localização por previsão (ver user.ts).
        regionUf: z.string().length(2).toUpperCase().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const r = await executeTrade(ctx.pool, { ...input, userId: ctx.user.id });
        activateReferralInBackground(ctx.pool, ctx.user.id);
        return r;
      } catch (e) {
        throwAsTRPC(e);
      }
    }),
});
