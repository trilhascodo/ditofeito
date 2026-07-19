import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";
import { visitorHash } from "../lib/visitorHash.js";

// ----------------------------------------------------------------------------
// Medição de audiência dos anúncios — impressão (card renderizado) aqui via
// tRPC; clique é medido em http/adClick.ts (rota de redirect /ir/:id, mais
// confiável que capturar onClick antes da navegação sair da página).
// ----------------------------------------------------------------------------
export const adEventsRouter = router({
  trackImpression: publicProcedure
    .input(z.object({ sponsorshipIds: z.array(z.string().uuid()).min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const hash = visitorHash(ctx.ip, ctx.userAgent);
      await ctx.pool.query(
        `INSERT INTO ad_events (sponsorship_id, kind, visitor_hash)
         SELECT unnest($1::uuid[]), 'IMPRESSION', $2`,
        [input.sponsorshipIds, hash],
      );
      return { ok: true };
    }),

  // Painel de desempenho (admin > Patrocinadores) — impressões, únicas e
  // cliques por patrocínio, numa janela configurável. É o número que
  // sustenta negociação de espaço e reajuste de preço.
  stats: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const r = await ctx.pool.query(
        `SELECT sp.id AS sponsorship_id, s.name AS sponsor_name, sp.label,
                sp.is_home, sp.home_placement, m.title AS market_title,
                count(*) FILTER (WHERE ae.kind = 'IMPRESSION') AS impressions,
                count(DISTINCT ae.visitor_hash) FILTER (WHERE ae.kind = 'IMPRESSION') AS unique_impressions,
                count(*) FILTER (WHERE ae.kind = 'CLICK') AS clicks
           FROM sponsorships sp
           JOIN sponsors s ON s.id = sp.sponsor_id
           LEFT JOIN markets m ON m.id = sp.market_id
           LEFT JOIN ad_events ae ON ae.sponsorship_id = sp.id
                                  AND ae.created_at > now() - ($1 || ' days')::interval
          WHERE now() < sp.ends_at
          GROUP BY sp.id, s.name, sp.label, sp.is_home, sp.home_placement, m.title
          ORDER BY impressions DESC`,
        [days],
      );
      return r.rows.map((row) => ({
        sponsorshipId: row.sponsorship_id as string, sponsorName: row.sponsor_name as string,
        label: row.label as string, isHome: row.is_home as boolean,
        homePlacement: row.home_placement as string | null, marketTitle: row.market_title as string | null,
        impressions: Number(row.impressions), uniqueImpressions: Number(row.unique_impressions),
        clicks: Number(row.clicks),
      }));
    }),
});
