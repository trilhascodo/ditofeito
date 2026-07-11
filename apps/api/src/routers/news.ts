import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";

// ----------------------------------------------------------------------------
// "Leitura relacionada" — notícia externa que o admin vincula manualmente a
// um mercado (sem integração automática: menos risco de puxar algo fora de
// contexto ou desatualizado do que uma busca automática).
// ----------------------------------------------------------------------------
export const newsRouter = router({
  list: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT id, title, url, created_at FROM market_news
          WHERE market_id = $1 ORDER BY created_at DESC`,
        [input.marketId]);
      return r.rows.map((row) => ({
        id: row.id as string, title: row.title as string, url: row.url as string,
        createdAt: row.created_at as string,
      }));
    }),

  add: adminProcedure
    .input(z.object({
      marketId: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      url: z.string().trim().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `INSERT INTO market_news (market_id, title, url) VALUES ($1,$2,$3) RETURNING id`,
        [input.marketId, input.title, input.url]);
      return { id: r.rows[0].id as string };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`DELETE FROM market_news WHERE id = $1`, [input.id]);
      return { ok: true };
    }),
});
