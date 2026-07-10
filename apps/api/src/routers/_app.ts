import { router } from "../trpc/trpc.js";
import { marketRouter } from "./market.js";
import { tradeRouter } from "./trade.js";
import { adminRouter } from "./admin.js";
import { candidateRouter } from "./candidate.js";
import { userRouter } from "./user.js";

export const appRouter = router({
  market: marketRouter,
  trade: tradeRouter,
  admin: adminRouter,
  candidate: candidateRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
