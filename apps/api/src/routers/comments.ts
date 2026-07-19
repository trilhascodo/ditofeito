import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lmsrPrices } from "@ditofeito/core";
import { router, publicProcedure, protectedProcedure } from "../trpc/trpc.js";
import { notify } from "../domain/notify.js";

// ----------------------------------------------------------------------------
// Comentários por mercado — versão mais simples: sem thread (parent_id existe
// no schema pra resposta futura, não usado ainda). O que diferencia isso de
// uma rede social genérica: cada comentário carrega, no momento do post, a
// posição do autor no mercado (quantas shares, em que preço) e o histórico de
// acerto dele (Brier) — "put your money where your mouth is" em vez de
// opinião solta, é o que sustenta grupo A desafiando grupo B.
// ----------------------------------------------------------------------------
export const commentsRouter = router({
  list: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT c.id, c.body, c.position_snapshot, c.author_rep_snapshot, c.created_at,
                u.handle, u.display_name, u.avatar_url
           FROM comments c JOIN users u ON u.id = c.user_id
          WHERE c.market_id = $1 AND c.is_hidden = false
          ORDER BY c.created_at DESC
          LIMIT 200`,
        [input.marketId],
      );
      return r.rows.map((row) => ({
        id: row.id as string, body: row.body as string,
        positionSnapshot: row.position_snapshot as
          { outcomeLabel: string; shares: number; priceAtPost: number }[],
        authorRepSnapshot: row.author_rep_snapshot !== null ? Number(row.author_rep_snapshot) : null,
        createdAt: row.created_at as string,
        author: {
          handle: row.handle as string, displayName: row.display_name as string,
          avatarUrl: row.avatar_url as string | null,
        },
      }));
    }),

  create: protectedProcedure
    .input(z.object({ marketId: z.string().uuid(), body: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const m = await ctx.pool.query(`SELECT liquidity_b FROM markets WHERE id = $1`, [input.marketId]);
      if (!m.rowCount) throw new TRPCError({ code: "NOT_FOUND", message: "mercado não encontrado" });

      // Posição atual do autor nesse mercado, se tiver — snapshot congelado
      // no momento do post (preço muda depois, o comentário não deveria).
      const pos = await ctx.pool.query(
        `SELECT outcome_id, shares FROM positions
          WHERE user_id = $1 AND market_id = $2 AND shares > 0`,
        [ctx.user.id, input.marketId],
      );

      let positionSnapshot: { outcomeLabel: string; shares: number; priceAtPost: number }[] = [];
      if (pos.rowCount) {
        const allOut = await ctx.pool.query(
          `SELECT id, label, q FROM market_outcomes WHERE market_id = $1 ORDER BY display_order, id`,
          [input.marketId],
        );
        const prices = lmsrPrices(allOut.rows.map((o) => Number(o.q)), Number(m.rows[0].liquidity_b));
        const byOutcome = new Map(allOut.rows.map((o, i) => [o.id as string, { label: o.label as string, price: prices[i] }]));
        positionSnapshot = pos.rows
          .map((row) => {
            const o = byOutcome.get(row.outcome_id as string);
            return o ? { outcomeLabel: o.label, shares: Number(row.shares), priceAtPost: o.price } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
      }

      const rep = await ctx.pool.query(`SELECT brier_mean FROM user_reputation WHERE user_id = $1`, [ctx.user.id]);
      const authorRepSnapshot: number | null = rep.rowCount && rep.rows[0].brier_mean !== null
        ? Number(rep.rows[0].brier_mean) : null;

      const r = await ctx.pool.query(
        `INSERT INTO comments (market_id, user_id, body, position_snapshot, author_rep_snapshot)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [input.marketId, ctx.user.id, input.body, JSON.stringify(positionSnapshot), authorRepSnapshot],
      );

      // Notifica quem tem posição aberta nesse mercado (menos o próprio
      // autor) — é o "desafio" ficando visível em vez de silencioso.
      const others = await ctx.pool.query(
        `SELECT DISTINCT user_id FROM positions
          WHERE market_id = $1 AND shares > 0 AND user_id != $2`,
        [input.marketId, ctx.user.id],
      );
      for (const row of others.rows) {
        await notify(
          ctx.pool, row.user_id as string, "NEW_COMMENT",
          `${ctx.user.displayName} comentou num mercado que você previu.`,
          { marketId: input.marketId, commentId: r.rows[0].id as string },
        );
      }

      return { id: r.rows[0].id as string };
    }),
});
