import { router } from "../trpc/trpc.js";
import { marketRouter } from "./market.js";
import { tradeRouter } from "./trade.js";
import { adminRouter } from "./admin.js";

export const appRouter = router({
  market: marketRouter,
  trade: tradeRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
