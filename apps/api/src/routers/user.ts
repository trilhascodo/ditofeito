// ============================================================================
// user.ts — Saldo/reputação, posições e extrato do ledger do usuário logado.
// Alimenta a página de perfil da F1 (plano-construcao.md §3: "perfil próprio
// (posições + extrato do ledger)"). Auth em si (signup/login) fica em
// apps/api/src/http/auth.ts — HTTP puro, não tRPC.
// ============================================================================
import { z } from "zod";
import { lmsrPrices } from "@ditofeito/core";
import { router, protectedProcedure } from "../trpc/trpc.js";

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const bal = await ctx.pool.query(
      `SELECT balance_after FROM point_ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [ctx.user.id],
    );
    const rep = await ctx.pool.query(
      `SELECT resolved_count, brier_mean, skill_score, streak_current, streak_best
         FROM user_reputation WHERE user_id = $1`,
      [ctx.user.id],
    );
    return {
      ...ctx.user,
      balance: bal.rowCount ? Number(bal.rows[0].balance_after) : 0,
      reputation: rep.rowCount
        ? {
            resolvedCount: rep.rows[0].resolved_count as number,
            brierMean: rep.rows[0].brier_mean !== null ? Number(rep.rows[0].brier_mean) : null,
            skillScore: Number(rep.rows[0].skill_score),
            streakCurrent: rep.rows[0].streak_current as number,
            streakBest: rep.rows[0].streak_best as number,
          }
        : null,
    };
  }),

  myPositions: protectedProcedure.query(async ({ ctx }) => {
    const pos = await ctx.pool.query(
      `SELECT p.market_id, p.outcome_id, p.shares, p.cost_basis, p.updated_at,
              m.slug, m.title, m.status, m.liquidity_b
         FROM positions p
         JOIN markets m ON m.id = p.market_id
        WHERE p.user_id = $1 AND p.shares > 0
        ORDER BY p.updated_at DESC`,
      [ctx.user.id],
    );
    if (!pos.rowCount) return [];

    const marketIds = [...new Set(pos.rows.map((r) => r.market_id as string))];
    const out = await ctx.pool.query(
      `SELECT market_id, id, label, q, display_order FROM market_outcomes
        WHERE market_id = ANY($1) ORDER BY market_id, display_order, id`,
      [marketIds],
    );
    const byMarket = new Map<string, { id: string; label: string; q: number }[]>();
    for (const o of out.rows) {
      const arr = byMarket.get(o.market_id) ?? [];
      arr.push({ id: o.id, label: o.label, q: Number(o.q) });
      byMarket.set(o.market_id, arr);
    }

    return pos.rows.map((r) => {
      const outcomes = byMarket.get(r.market_id as string) ?? [];
      const prices = lmsrPrices(outcomes.map((o) => o.q), Number(r.liquidity_b));
      const idx = outcomes.findIndex((o) => o.id === r.outcome_id);
      return {
        marketSlug: r.slug as string, marketTitle: r.title as string, marketStatus: r.status as string,
        outcomeId: r.outcome_id as string, outcomeLabel: idx >= 0 ? outcomes[idx].label : null,
        shares: Number(r.shares), costBasis: Number(r.cost_basis),
        currentPrice: idx >= 0 ? prices[idx] : null,
      };
    });
  }),

  myLedger: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT id, delta, balance_after, reason, ref_type, ref_id, created_at
           FROM point_ledger WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
        [ctx.user.id, input?.limit ?? 50],
      );
      return r.rows;
    }),
});
