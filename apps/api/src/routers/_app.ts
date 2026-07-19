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
import { homeLinksRouter } from "./homeLinks.js";
import { leadsRouter } from "./leads.js";
import { commentsRouter } from "./comments.js";
import { pageViewsRouter } from "./pageViews.js";
import { notificationsRouter } from "./notifications.js";
import { indexSeriesRouter } from "./indexSeries.js";
import { adEventsRouter } from "./adEvents.js";

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
  homeLinks: homeLinksRouter,
  leads: leadsRouter,
  comments: commentsRouter,
  pageViews: pageViewsRouter,
  notifications: notificationsRouter,
  indexSeries: indexSeriesRouter,
  adEvents: adEventsRouter,
});

export type AppRouter = typeof appRouter;
