import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Pool } from "pg";
import { lmsrPrices } from "@ditofeito/core";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";

// ----------------------------------------------------------------------------
// Índice citável (index_series/index_points, no schema desde o F0 sem
// nenhum código em cima — mesmo estado que sponsors/comments tinham antes).
// group_id vem do gerador.ts eleitoral ("Grupo da disputa (navegação +
// índice citável)" — comentário original já previa isso): cada disputa
// majoritária vira 1 market_group com 1 mercado MULTI ("Quem vence...?"),
// cujos outcomes JÁ SÃO a probabilidade por candidato. O "índice" não
// recalcula nada — só expõe esse mercado com metodologia pública e um slug
// estável, citável pela imprensa sem precisar linkar o mercado bruto.
// ----------------------------------------------------------------------------
export interface Methodology { description: string }

async function computeCurrentValues(pool: Pool, groupId: string) {
  const mkt = await pool.query(
    `SELECT id, slug, title, status, close_at, liquidity_b FROM markets
      WHERE group_id = $1 AND type = 'MULTI'
      ORDER BY created_at DESC LIMIT 1`,
    [groupId],
  );
  if (!mkt.rowCount) return null;
  const m = mkt.rows[0];

  const out = await pool.query(
    `SELECT label, q, is_catchall FROM market_outcomes
      WHERE market_id = $1 ORDER BY display_order, id`,
    [m.id],
  );
  const prices = lmsrPrices(out.rows.map((o) => Number(o.q)), Number(m.liquidity_b));
  const values = out.rows
    .map((o, i) => ({ label: o.label as string, price: prices[i], isCatchall: o.is_catchall as boolean }))
    .sort((a, b) => b.price - a.price);

  return {
    marketSlug: m.slug as string, marketTitle: m.title as string,
    marketStatus: m.status as string, closeAt: m.close_at as Date,
    values,
  };
}

export const indexSeriesRouter = router({
  // ---- PÚBLICO -------------------------------------------------------------
  list: publicProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT s.slug, s.title, g.title AS group_title
         FROM index_series s LEFT JOIN market_groups g ON g.id = s.group_id
        WHERE s.is_public = true
        ORDER BY s.title`,
    );
    return r.rows.map((row) => ({
      slug: row.slug as string, title: row.title as string,
      groupTitle: row.group_title as string | null,
    }));
  }),

  get: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const s = await ctx.pool.query(
        `SELECT title, methodology, group_id, is_public FROM index_series WHERE slug = $1`,
        [input.slug],
      );
      if (!s.rowCount || !s.rows[0].is_public)
        throw new TRPCError({ code: "NOT_FOUND", message: "índice não encontrado" });
      const row = s.rows[0];
      const current = row.group_id ? await computeCurrentValues(ctx.pool, row.group_id as string) : null;
      return {
        slug: input.slug, title: row.title as string,
        methodology: row.methodology as Methodology,
        current,
      };
    }),

  // ---- ADMIN -----------------------------------------------------------------
  adminList: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT s.id, s.slug, s.title, s.is_public, s.group_id, g.title AS group_title
         FROM index_series s LEFT JOIN market_groups g ON g.id = s.group_id
        ORDER BY s.title`,
    );
    return r.rows.map((row) => ({
      id: row.id as string, slug: row.slug as string, title: row.title as string,
      isPublic: row.is_public as boolean, groupId: row.group_id as string | null,
      groupTitle: row.group_title as string | null,
    }));
  }),

  // Só grupos que ainda não têm índice — evita 2 índices citando o mesmo
  // mercado com metodologias diferentes por engano.
  listAvailableGroups: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT g.id, g.title FROM market_groups g
        WHERE NOT EXISTS (SELECT 1 FROM index_series s WHERE s.group_id = g.id)
        ORDER BY g.title`,
    );
    return r.rows.map((row) => ({ id: row.id as string, title: row.title as string }));
  }),

  create: adminProcedure
    .input(z.object({
      slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use letras minúsculas, números e hífen"),
      title: z.string().trim().min(1).max(200),
      groupId: z.string().uuid(),
      description: z.string().trim().min(1).max(2000),
      isPublic: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `INSERT INTO index_series (slug, title, group_id, methodology, is_public)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [input.slug, input.title, input.groupId,
          JSON.stringify({ description: input.description } satisfies Methodology), input.isPublic],
      );
      return { id: r.rows[0].id as string };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(), title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(2000), isPublic: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE index_series SET title = $2, methodology = $3, is_public = $4 WHERE id = $1`,
        [input.id, input.title, JSON.stringify({ description: input.description } satisfies Methodology), input.isPublic],
      );
      return { ok: true };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`DELETE FROM index_series WHERE id = $1`, [input.id]);
      return { ok: true };
    }),
});
