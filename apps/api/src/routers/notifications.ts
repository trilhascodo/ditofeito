import { z } from "zod";
import { router, protectedProcedure } from "../trpc/trpc.js";

// ----------------------------------------------------------------------------
// Central in-app (sino no header) — sem push/e-mail por enquanto. Gatilhos
// ficam em domain/trade.ts (resolução/anulação) e routers/comments.ts (novo
// comentário em mercado que você previu).
// ----------------------------------------------------------------------------
export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT n.id, n.kind, n.body, n.read_at, n.created_at, m.slug AS market_slug
           FROM notifications n
           LEFT JOIN markets m ON m.id = n.market_id
          WHERE n.user_id = $1
          ORDER BY n.created_at DESC LIMIT $2`,
        [ctx.user.id, input?.limit ?? 30],
      );
      return r.rows.map((row) => ({
        id: row.id as string, kind: row.kind as string, body: row.body as string,
        marketSlug: row.market_slug as string | null,
        readAt: row.read_at as string | null, createdAt: row.created_at as string,
      }));
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [ctx.user.id],
    );
    return r.rows[0].n as number;
  }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.pool.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [ctx.user.id],
    );
    return { ok: true };
  }),
});
