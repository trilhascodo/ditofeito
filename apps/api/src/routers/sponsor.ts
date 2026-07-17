import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";

// ----------------------------------------------------------------------------
// Patrocínio nativo (identidade-ditofeito.md — card "Apresentado por", nunca
// pop-up). Schema já existia desde o F0 (sponsors/sponsorships) sem nenhum
// código em cima; este router é a primeira peça em uso.
// ----------------------------------------------------------------------------
const sponsorshipInput = z
  .object({
    sponsorId: z.string().uuid(),
    // Ou marketId (card na página do mercado), ou isHome (faixa da home) —
    // mesma regra do CHECK no banco (migrations/004_sponsor_home_news.sql).
    marketId: z.string().uuid().optional(),
    isHome: z.boolean().default(false),
    // Só importa quando isHome; SIDEBAR é o comportamento de sempre
    // (migrations/008_home_ad_placement.sql).
    homePlacement: z.enum(["SIDEBAR", "BANNER", "GRID"]).default("SIDEBAR"),
    label: z.string().trim().min(1).max(60).default("Apresentado por"),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt deve ser depois de startsAt",
    path: ["endsAt"],
  })
  .refine((d) => d.marketId || d.isHome, {
    message: "escolha um mercado ou marque como faixa da home",
    path: ["marketId"],
  });

export const sponsorRouter = router({
  // ---- ADMIN: cadastro de patrocinadores ----------------------------------
  list: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT id, name, logo_url, site_url, is_active FROM sponsors ORDER BY name`);
    return r.rows.map((s) => ({
      id: s.id as string, name: s.name as string,
      logoUrl: s.logo_url as string | null, siteUrl: s.site_url as string | null,
      isActive: s.is_active as boolean,
    }));
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(120),
      logoUrl: z.string().trim().url().optional(),
      siteUrl: z.string().trim().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `INSERT INTO sponsors (name, logo_url, site_url) VALUES ($1,$2,$3) RETURNING id`,
        [input.name, input.logoUrl ?? null, input.siteUrl ?? null]);
      return { id: r.rows[0].id as string };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`UPDATE sponsors SET is_active = $2 WHERE id = $1`, [input.id, input.isActive]);
      return { ok: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      logoUrl: z.string().trim().url().optional(),
      siteUrl: z.string().trim().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE sponsors SET name = $2, logo_url = $3, site_url = $4 WHERE id = $1`,
        [input.id, input.name, input.logoUrl ?? null, input.siteUrl ?? null]);
      return { ok: true };
    }),

  // ---- ADMIN: vínculo patrocinador <-> mercado ----------------------------
  listSponsorships: adminProcedure
    .input(z.object({ marketId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const params: unknown[] = [];
      let where = "";
      if (input?.marketId) { params.push(input.marketId); where = "WHERE sp.market_id = $1"; }
      const r = await ctx.pool.query(
        `SELECT sp.id, sp.label, sp.starts_at, sp.ends_at, sp.market_id, sp.is_home, sp.home_placement,
                s.id AS sponsor_id, s.name AS sponsor_name, s.logo_url, s.site_url,
                m.title AS market_title, m.slug AS market_slug
           FROM sponsorships sp
           JOIN sponsors s ON s.id = sp.sponsor_id
           LEFT JOIN markets m ON m.id = sp.market_id
           ${where}
          ORDER BY sp.starts_at DESC`, params);
      return r.rows.map((row) => ({
        id: row.id as string, label: row.label as string,
        startsAt: row.starts_at as string, endsAt: row.ends_at as string,
        marketId: row.market_id as string | null, isHome: row.is_home as boolean,
        homePlacement: row.home_placement as "SIDEBAR" | "BANNER" | "GRID",
        marketTitle: row.market_title as string | null, marketSlug: row.market_slug as string | null,
        sponsor: {
          id: row.sponsor_id as string, name: row.sponsor_name as string,
          logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
        },
      }));
    }),

  createSponsorship: adminProcedure.input(sponsorshipInput).mutation(async ({ ctx, input }) => {
    const r = await ctx.pool.query(
      `INSERT INTO sponsorships (sponsor_id, market_id, is_home, home_placement, label, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.sponsorId, input.marketId ?? null, input.isHome, input.homePlacement,
        input.label, input.startsAt, input.endsAt]);
    return { id: r.rows[0].id as string };
  }),

  removeSponsorship: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`DELETE FROM sponsorships WHERE id = $1`, [input.id]);
      return { ok: true };
    }),

  // ---- PÚBLICO: patrocínio ativo agora pra um mercado (card no MarketPage) --
  getActiveForMarket: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT sp.label, s.name, s.logo_url, s.site_url
           FROM sponsorships sp
           JOIN sponsors s ON s.id = sp.sponsor_id
          WHERE sp.market_id = $1
            AND s.is_active = true
            AND now() BETWEEN sp.starts_at AND sp.ends_at
          ORDER BY sp.starts_at DESC
          LIMIT 1`, [input.marketId]);
      if (!r.rowCount) return null;
      const row = r.rows[0];
      return {
        label: row.label as string, sponsorName: row.name as string,
        logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
      };
    }),

  // ---- PÚBLICO: espaços de publicidade da home, por posição ---------------
  // 3 superfícies (migrations/008_home_ad_placement.sql): coluna lateral do
  // carrossel, faixa horizontal abaixo dele, e cards nativos na grade de
  // mercados. Uma query só, agrupada em JS — evita 3 round-trips da home.
  getActiveHome: publicProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT sp.label, sp.home_placement, s.name, s.logo_url, s.site_url
         FROM sponsorships sp
         JOIN sponsors s ON s.id = sp.sponsor_id
        WHERE sp.is_home = true
          AND s.is_active = true
          AND now() BETWEEN sp.starts_at AND sp.ends_at
        ORDER BY sp.starts_at ASC`);
    const toItem = (row: (typeof r.rows)[number]) => ({
      label: row.label as string, sponsorName: row.name as string,
      logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
    });
    const byPlacement = (p: string) => r.rows.filter((row) => row.home_placement === p).map(toItem);
    return {
      sidebar: byPlacement("SIDEBAR").slice(0, 5),
      banner: byPlacement("BANNER").slice(0, 4),
      grid: byPlacement("GRID").slice(0, 2),
    };
  }),
});
