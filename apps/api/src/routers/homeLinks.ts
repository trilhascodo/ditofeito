import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";

// ----------------------------------------------------------------------------
// "Links úteis" da coluna lateral da home — curadoria manual do admin, mesmo
// princípio do news.ts (sem integração automática/favicon de terceiro).
// Preenche o espaço que sobra na lateral quando ela é mais curta que o
// conteúdo principal (slide+faixa+abas+grade).
// ----------------------------------------------------------------------------
export const homeLinksRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT id, title, url FROM home_links ORDER BY display_order, created_at`);
    return r.rows.map((row) => ({
      id: row.id as string, title: row.title as string, url: row.url as string,
    }));
  }),

  add: adminProcedure
    .input(z.object({
      title: z.string().trim().min(1).max(200),
      url: z.string().trim().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.pool.query(`SELECT count(*)::int AS n FROM home_links`);
      const r = await ctx.pool.query(
        `INSERT INTO home_links (title, url, display_order) VALUES ($1,$2,$3) RETURNING id`,
        [input.title, input.url, count.rows[0].n]);
      return { id: r.rows[0].id as string };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`DELETE FROM home_links WHERE id = $1`, [input.id]);
      return { ok: true };
    }),
});
