import { z } from "zod";
import { router, publicProcedure, adminProcedure, sponsorProcedure } from "../trpc/trpc.js";

// ----------------------------------------------------------------------------
// Patrocínio nativo (identidade-ditofeito.md — card "Apresentado por", nunca
// pop-up). Schema já existia desde o F0 (sponsors/sponsorships) sem nenhum
// código em cima; este router é a primeira peça em uso.
// ----------------------------------------------------------------------------
const HOME_PLACEMENTS = ["SIDEBAR", "BANNER", "GRID"] as const;

const REGION_SCOPES = ["NACIONAL", "ESTADUAL", "MUNICIPAL"] as const;

const sponsorshipInput = z
  .object({
    sponsorId: z.string().uuid(),
    // Ou marketId (card na página do mercado), ou isHome (espaço da home) —
    // mesma regra do CHECK no banco (migrations/004_sponsor_home_news.sql).
    marketId: z.string().uuid().optional(),
    isHome: z.boolean().default(false),
    // Só importa quando isHome — validado contra PLAN_ALLOWED_PLACEMENTS do
    // sponsor no mutation abaixo (não dá pra confiar só no zod aqui, precisa
    // do plano que está no banco).
    homePlacement: z.enum(HOME_PLACEMENTS).optional(),
    // Escopo regional do espaço de home (migrations/019_region_segmentation.sql)
    // — nacional é o padrão/comportamento de sempre. Só relevante quando isHome.
    regionScope: z.enum(REGION_SCOPES).default("NACIONAL"),
    regionUf: z.string().length(2).optional(),
    regionCity: z.string().trim().max(120).optional(),
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
  })
  .refine((d) => !d.isHome || d.homePlacement, {
    message: "escolha a posição na home",
    path: ["homePlacement"],
  })
  .refine((d) => d.regionScope === "NACIONAL" || !!d.regionUf, {
    message: "escolha o estado pro escopo regional",
    path: ["regionUf"],
  })
  .refine((d) => d.regionScope !== "MUNICIPAL" || !!d.regionCity, {
    message: "escolha a cidade pro escopo municipal",
    path: ["regionCity"],
  });

const SOCIAL_PLATFORMS = ["INSTAGRAM", "X", "TIKTOK", "YOUTUBE", "FACEBOOK", "WHATSAPP"] as const;
type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// Limite de redes sociais no autoatendimento, por plano (migrations/009_sponsor_plans.sql).
const PLAN_LIMITS: Record<string, number> = { BASICO: 1, PROFISSIONAL: 3, PREMIUM: 5 };

// Posições que cada plano libera na home — CUMULATIVO (plano maior inclui os
// menores, como qualquer tabela de planos em camadas: Premium não faz
// sentido valer menos posições que Profissional). Mesmo mapeamento
// divulgado em /anuncie. O admin escolhe entre as opções liberadas — sem
// isso, um sponsor Premium não tinha como aparecer no nativo da grade
// (bug relatado: "não é possível adicionar nada ao grid").
const PLAN_ALLOWED_PLACEMENTS: Record<string, readonly (typeof HOME_PLACEMENTS)[number][]> = {
  BASICO: ["BANNER"],
  PROFISSIONAL: ["BANNER", "GRID"],
  PREMIUM: ["BANNER", "GRID", "SIDEBAR"],
};

async function socialLinksBySponsor(pool: import("pg").Pool, sponsorIds: string[]) {
  const map = new Map<string, { id: string; platform: SocialPlatform; url: string }[]>();
  if (sponsorIds.length === 0) return map;
  const r = await pool.query(
    `SELECT id, sponsor_id, platform, url FROM sponsor_social_links
      WHERE sponsor_id = ANY($1) ORDER BY sponsor_id, display_order`,
    [sponsorIds]);
  for (const row of r.rows) {
    const arr = map.get(row.sponsor_id) ?? [];
    arr.push({ id: row.id, platform: row.platform, url: row.url });
    map.set(row.sponsor_id, arr);
  }
  return map;
}

export const sponsorRouter = router({
  // ---- ADMIN: cadastro de patrocinadores ----------------------------------
  list: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT id, name, logo_url, site_url, creative_url, is_active, plan FROM sponsors ORDER BY name`);
    const links = await socialLinksBySponsor(ctx.pool, r.rows.map((s) => s.id as string));
    return r.rows.map((s) => ({
      id: s.id as string, name: s.name as string,
      logoUrl: s.logo_url as string | null, siteUrl: s.site_url as string | null,
      creativeUrl: s.creative_url as string | null,
      isActive: s.is_active as boolean, plan: s.plan as string,
      socialLinks: links.get(s.id as string) ?? [],
    }));
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(120),
      logoUrl: z.string().trim().url().optional(),
      siteUrl: z.string().trim().url().optional(),
      // Arte pronta do anunciante (fundo+headline+CTA embutidos) — quando
      // presente, substitui o card composto logo+nome+CTA na coluna lateral.
      creativeUrl: z.string().trim().url().optional(),
      plan: z.enum(["BASICO", "PROFISSIONAL", "PREMIUM"]).default("BASICO"),
    }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `INSERT INTO sponsors (name, logo_url, site_url, creative_url, plan) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [input.name, input.logoUrl ?? null, input.siteUrl ?? null, input.creativeUrl ?? null, input.plan]);
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
      creativeUrl: z.string().trim().url().optional(),
      plan: z.enum(["BASICO", "PROFISSIONAL", "PREMIUM"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE sponsors SET name = $2, logo_url = $3, site_url = $4, creative_url = $5, plan = $6 WHERE id = $1`,
        [input.id, input.name, input.logoUrl ?? null, input.siteUrl ?? null, input.creativeUrl ?? null, input.plan]);
      return { ok: true };
    }),

  // ---- ADMIN: vincular conta de anunciante a um sponsor -------------------
  // Só promove conta USER comum — nunca rebaixa admin/moderador por handle
  // errado, e nunca reusa um handle já vinculado a outro papel de staff.
  linkUser: adminProcedure
    .input(z.object({ sponsorId: z.string().uuid(), handle: z.string().trim().toLowerCase() }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `UPDATE users SET role = 'SPONSOR', sponsor_id = $1, updated_at = now()
          WHERE handle = $2 AND role = 'USER' RETURNING id`,
        [input.sponsorId, input.handle]);
      if (!r.rowCount) throw new Error("Usuário não encontrado ou já tem outro papel no site");
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
                sp.region_scope, sp.region_uf, sp.region_city,
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
        regionScope: row.region_scope as "NACIONAL" | "ESTADUAL" | "MUNICIPAL",
        regionUf: row.region_uf as string | null, regionCity: row.region_city as string | null,
        marketTitle: row.market_title as string | null, marketSlug: row.market_slug as string | null,
        sponsor: {
          id: row.sponsor_id as string, name: row.sponsor_name as string,
          logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
        },
      }));
    }),

  createSponsorship: adminProcedure.input(sponsorshipInput).mutation(async ({ ctx, input }) => {
    let homePlacement: "SIDEBAR" | "BANNER" | "GRID" = "SIDEBAR";
    if (input.isHome) {
      const s = await ctx.pool.query(`SELECT plan FROM sponsors WHERE id = $1`, [input.sponsorId]);
      if (!s.rowCount) throw new Error("Patrocinador não encontrado");
      const allowed = PLAN_ALLOWED_PLACEMENTS[s.rows[0].plan as string] ?? PLAN_ALLOWED_PLACEMENTS.BASICO;
      if (!input.homePlacement || !allowed.includes(input.homePlacement))
        throw new Error(`Plano ${s.rows[0].plan} não inclui essa posição (libera: ${allowed.join(", ")})`);
      homePlacement = input.homePlacement;
    }
    const r = await ctx.pool.query(
      `INSERT INTO sponsorships
         (sponsor_id, market_id, is_home, home_placement, region_scope, region_uf, region_city,
          label, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [input.sponsorId, input.marketId ?? null, input.isHome, homePlacement,
        input.regionScope, input.regionUf ?? null, input.regionCity?.trim() || null,
        input.label, input.startsAt, input.endsAt]);
    return { id: r.rows[0].id as string };
  }),

  removeSponsorship: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`DELETE FROM sponsorships WHERE id = $1`, [input.id]);
      return { ok: true };
    }),

  // ---- AUTOATENDIMENTO: painel do anunciante (só a própria conta) ---------
  getMine: sponsorProcedure.query(async ({ ctx }) => {
    const s = await ctx.pool.query(
      `SELECT name, logo_url, site_url, creative_url, plan FROM sponsors WHERE id = $1`, [ctx.sponsorId]);
    if (!s.rowCount) throw new Error("Patrocinador não encontrado");
    const links = await socialLinksBySponsor(ctx.pool, [ctx.sponsorId]);
    const row = s.rows[0];
    return {
      name: row.name as string, logoUrl: row.logo_url as string | null,
      siteUrl: row.site_url as string | null, creativeUrl: row.creative_url as string | null,
      plan: row.plan as string,
      socialLinksMax: PLAN_LIMITS[row.plan] ?? 1,
      socialLinks: links.get(ctx.sponsorId) ?? [],
    };
  }),

  updateMine: sponsorProcedure
    .input(z.object({
      logoUrl: z.string().trim().url().optional(),
      siteUrl: z.string().trim().url().optional(),
      creativeUrl: z.string().trim().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE sponsors SET logo_url = $2, site_url = $3, creative_url = $4 WHERE id = $1`,
        [ctx.sponsorId, input.logoUrl ?? null, input.siteUrl ?? null, input.creativeUrl ?? null]);
      return { ok: true };
    }),

  addSocialLink: sponsorProcedure
    .input(z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: z.string().trim().url() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.pool.query(`SELECT plan FROM sponsors WHERE id = $1`, [ctx.sponsorId]);
      const max = PLAN_LIMITS[plan.rows[0]?.plan] ?? 1;
      const count = await ctx.pool.query(
        `SELECT count(*)::int AS n FROM sponsor_social_links WHERE sponsor_id = $1`, [ctx.sponsorId]);
      if (count.rows[0].n >= max)
        throw new Error(`Limite do plano atingido (até ${max} rede${max === 1 ? "" : "s"} social`
          + `${max === 1 ? "" : "is"})`);
      await ctx.pool.query(
        `INSERT INTO sponsor_social_links (sponsor_id, platform, url, display_order)
         VALUES ($1,$2,$3,$4)`,
        [ctx.sponsorId, input.platform, input.url, count.rows[0].n]);
      return { ok: true };
    }),

  removeSocialLink: sponsorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `DELETE FROM sponsor_social_links WHERE id = $1 AND sponsor_id = $2`,
        [input.id, ctx.sponsorId]);
      return { ok: true };
    }),

  // ---- PÚBLICO: patrocínio ativo agora pra um mercado (card no MarketPage) --
  getActiveForMarket: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT sp.id AS sponsorship_id, sp.label, s.id AS sponsor_id, s.name, s.logo_url, s.site_url
           FROM sponsorships sp
           JOIN sponsors s ON s.id = sp.sponsor_id
          WHERE sp.market_id = $1
            AND s.is_active = true
            AND now() BETWEEN sp.starts_at AND sp.ends_at
          ORDER BY sp.starts_at DESC
          LIMIT 1`, [input.marketId]);
      if (!r.rowCount) return null;
      const row = r.rows[0];
      const links = await socialLinksBySponsor(ctx.pool, [row.sponsor_id]);
      return {
        sponsorshipId: row.sponsorship_id as string,
        label: row.label as string, sponsorName: row.name as string,
        logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
        socialLinks: links.get(row.sponsor_id) ?? [],
      };
    }),

  // ---- PÚBLICO: espaços de publicidade da home, por posição ---------------
  // 3 superfícies (migrations/008_home_ad_placement.sql): coluna lateral do
  // carrossel, faixa horizontal abaixo dele, e cards nativos na grade de
  // mercados. Uma query só, agrupada em JS — evita 3 round-trips da home.
  getActiveHome: publicProcedure.query(async ({ ctx }) => {
    // ORDER BY random() em vez de starts_at ASC: cada posição tem um teto de
    // exibição (5/4/2), então mais patrocinadores ativos que isso na mesma
    // posição SEMPRE existirá — a questão é só quem aparece. Ordenar por
    // data antiga excluía pra sempre quem entrou depois (silencioso, sem
    // rodízio nenhum — bug relatado). Aleatório a cada carregamento dá
    // exposição justa pra todo mundo ativo, sem precisar de infra de rodízio
    // com estado (cron, contador de impressão etc.).
    const r = await ctx.pool.query(
      `SELECT sp.id AS sponsorship_id, sp.label, sp.home_placement,
              sp.region_scope, sp.region_uf, sp.region_city,
              s.id AS sponsor_id, s.name, s.logo_url, s.site_url, s.creative_url
         FROM sponsorships sp
         JOIN sponsors s ON s.id = sp.sponsor_id
        WHERE sp.is_home = true
          AND s.is_active = true
          AND now() BETWEEN sp.starts_at AND sp.ends_at
        ORDER BY random()`);

    // Região do visitante (autodeclarada, opcional — sem geo-IP). Sponsorship
    // regional só aparece pra quem bate; sem declaração, só vê os nacionais
    // (não dá pra confirmar match, então não arrisca mostrar pro público errado).
    let visitorUf: string | null = null;
    let visitorCity: string | null = null;
    if (ctx.user) {
      const v = await ctx.pool.query(`SELECT region_uf, region_city FROM users WHERE id = $1`, [ctx.user.id]);
      visitorUf = v.rows[0]?.region_uf ?? null;
      visitorCity = v.rows[0]?.region_city ?? null;
    }
    const matchesVisitor = (row: (typeof r.rows)[number]) => {
      if (row.region_scope === "NACIONAL") return true;
      if (!visitorUf || visitorUf !== row.region_uf) return false;
      if (row.region_scope === "ESTADUAL") return true;
      return !!visitorCity && visitorCity.trim().toLowerCase() === (row.region_city as string).trim().toLowerCase();
    };
    const rows = r.rows.filter(matchesVisitor);

    const links = await socialLinksBySponsor(ctx.pool, [...new Set(rows.map((row) => row.sponsor_id))]);
    const toItem = (row: (typeof rows)[number]) => ({
      sponsorshipId: row.sponsorship_id as string,
      label: row.label as string, sponsorName: row.name as string,
      logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
      creativeUrl: row.creative_url as string | null,
      socialLinks: links.get(row.sponsor_id) ?? [],
    });
    const byPlacement = (p: string) => rows.filter((row) => row.home_placement === p).map(toItem);
    return {
      sidebar: byPlacement("SIDEBAR").slice(0, 5),
      banner: byPlacement("BANNER").slice(0, 4),
      grid: byPlacement("GRID").slice(0, 2),
    };
  }),
});
