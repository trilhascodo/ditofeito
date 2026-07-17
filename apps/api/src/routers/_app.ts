import { router } from "../trpc/trpc.js";
import { marketRouter } from "./market.js";
import { tradeRouter } from "./trade.js";
import { adminRouter } from "./admin.js";
import { moderationRouter } from "./moderation.js";
import { emailSettingsRouter } from "./emailSettings.js";
import { candidateRouter } from "./candidate.js";
import { userRouter } from "./user.js";
import { sponsorRouter } from "./sponsor.js";
import { newsRouter } from "./news.js";

export const appRouter = router({
  market: marketRouter,
  trade: tradeRouter,
  admin: adminRouter,
  moderation: moderationRouter,
  emailSettings: emailSettingsRouter,
  candidate: candidateRouter,
  user: userRouter,
  sponsor: sponsorRouter,
  news: newsRouter,
});

export type AppRouter = typeof appRouter;
