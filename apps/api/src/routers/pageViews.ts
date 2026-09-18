import { z } from "zod";
import { normalizeSource } from "@ditofeito/core";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";
import { visitorHash } from "../lib/visitorHash.js";
import { checkRateLimit } from "../lib/rateLimit.js";

// ----------------------------------------------------------------------------
// Analytics próprio (migrations/006_page_views.sql) — sem cookie, sem
// terceiro. O front dispara track() a cada mudança de rota da SPA; stats()
// alimenta o painel de audiência do admin (base pra mostrar alcance real
// pro anunciante e pra imprensa citar) — precisa ser difícil de forjar.
// ----------------------------------------------------------------------------
export const pageViewsRouter = router({
  track: publicProcedure
    .input(z.object({
      path: z.string().trim().min(1).max(500),
      referrerHost: z.string().trim().max(200).optional(),
      // Canal da visita (?origem=/utm_source/fbclid — ver 045). Leniente:
      // valor inválido vira null, nunca derruba o track.
      source: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const hash = visitorHash(ctx.ip, ctx.userAgent);
      // Generoso pra navegação real (uma troca de rota por vez); barra script.
      if (!checkRateLimit(`pageview:${hash}`, 30, 60_000)) return { ok: true };
      await ctx.pool.query(
        `INSERT INTO page_views (path, referrer_host, visitor_hash, source) VALUES ($1,$2,$3,$4)`,
        [input.path, input.referrerHost ?? null, hash, normalizeSource(input.source) ?? null],
      );
      return { ok: true };
    }),

  stats: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const window = `${days} days`;

      const totals = await ctx.pool.query(
        `SELECT count(*)::int AS views, count(DISTINCT visitor_hash)::int AS uniques
           FROM page_views WHERE created_at > now() - $1::interval`,
        [window],
      );

      const daily = await ctx.pool.query(
        `SELECT date_trunc('day', created_at) AS day,
                count(*)::int AS views, count(DISTINCT visitor_hash)::int AS uniques
           FROM page_views WHERE created_at > now() - $1::interval
          GROUP BY day ORDER BY day`,
        [window],
      );

      const topPaths = await ctx.pool.query(
        `SELECT path, count(*)::int AS views
           FROM page_views WHERE created_at > now() - $1::interval
          GROUP BY path ORDER BY views DESC LIMIT 10`,
        [window],
      );

      const topReferrers = await ctx.pool.query(
        `SELECT referrer_host, count(*)::int AS views
           FROM page_views WHERE created_at > now() - $1::interval AND referrer_host IS NOT NULL
          GROUP BY referrer_host ORDER BY views DESC LIMIT 10`,
        [window],
      );

      // Por visitante-dia (não por pageview): quem chegou por um canal conta
      // uma vez, não uma por página que navegou depois.
      const topSources = await ctx.pool.query(
        `SELECT source, count(DISTINCT visitor_hash || date_trunc('day', created_at)::text)::int AS visitors
           FROM page_views WHERE created_at > now() - $1::interval AND source IS NOT NULL
          GROUP BY source ORDER BY visitors DESC LIMIT 10`,
        [window],
      );

      const signupSources = await ctx.pool.query(
        `SELECT coalesce(signup_source, '(sem origem)') AS source, count(*)::int AS signups
           FROM users WHERE created_at > now() - $1::interval AND role = 'USER'
          GROUP BY 1 ORDER BY signups DESC LIMIT 10`,
        [window],
      );

      return {
        days,
        views: totals.rows[0].views as number,
        uniques: totals.rows[0].uniques as number,
        daily: daily.rows.map((row) => ({
          day: row.day as string, views: row.views as number, uniques: row.uniques as number,
        })),
        topPaths: topPaths.rows.map((row) => ({ path: row.path as string, views: row.views as number })),
        topReferrers: topReferrers.rows.map((row) => ({
          referrerHost: row.referrer_host as string, views: row.views as number,
        })),
        topSources: topSources.rows.map((row) => ({
          source: row.source as string, visitors: row.visitors as number,
        })),
        signupSources: signupSources.rows.map((row) => ({
          source: row.source as string, signups: row.signups as number,
        })),
      };
    }),
});
