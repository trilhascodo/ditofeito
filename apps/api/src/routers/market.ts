import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lmsrPrices, suggestB } from "@ditofeito/core";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";

const outcomeInput = z.object({ label: z.string().trim().min(1).max(120) });

const SERIES_DAYS = 30;
const SERIES_POINTS = 60;

// BINARY sempre nasce SIM/NÃO (README §schema: "type BINARY -> exatamente 2
// outcomes"); MULTI exige outcomes nomeados + catchall opcional (mesmo
// padrão do gerador.ts eleitoral, generalizado pra qualquer categoria).
const createMarketInput = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use letras minúsculas, números e hífen"),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(2000).optional(),
    categorySlug: z.string(),
    type: z.enum(["BINARY", "MULTI"]),
    outcomes: z.array(outcomeInput).optional(),
    includeCatchall: z.boolean().default(true),
    resolutionCriteria: z.string().trim().min(10),
    resolutionSource: z.string().trim().min(2),
    closeAt: z.string().datetime(),
    resolveBy: z.string().datetime(),
    isElectoral: z.boolean().default(false),
    liquidityB: z.number().positive().optional(),
    // false = fica em DRAFT pra revisão editorial antes de abrir pro público
    // (mesma opção do gerador.ts eleitoral, GERADOR_CONFIG.publicarDireto).
    publish: z.boolean().default(true),
  })
  .refine((d) => new Date(d.resolveBy) > new Date(d.closeAt), {
    message: "resolveBy deve ser depois de closeAt",
    path: ["resolveBy"],
  })
  .refine((d) => d.type === "BINARY" || (d.outcomes?.length ?? 0) >= 2, {
    message: "MULTI exige ao menos 2 outcomes",
    path: ["outcomes"],
  });

export const marketRouter = router({
  create: adminProcedure.input(createMarketInput).mutation(async ({ ctx, input }) => {
    const cat = await ctx.pool.query(`SELECT id FROM categories WHERE slug = $1`, [input.categorySlug]);
    if (!cat.rowCount) throw new TRPCError({ code: "BAD_REQUEST", message: "categoria não encontrada" });
    const categoryId = cat.rows[0].id;

    const outcomes = input.type === "BINARY" ? [{ label: "SIM" }, { label: "NÃO" }] : input.outcomes!;
    const nOutcomes = outcomes.length + (input.type === "MULTI" && input.includeCatchall ? 1 : 0);
    const b = input.liquidityB ?? suggestB(nOutcomes, input.type === "BINARY" ? 40 : 150);

    const client = await ctx.pool.connect();
    try {
      await client.query("BEGIN");
      const m = await client.query(
        `INSERT INTO markets (slug, title, description, category_id, type, liquidity_b, status,
                              resolution_criteria, resolution_source, close_at, resolve_by,
                              is_electoral, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          input.slug, input.title, input.description ?? null, categoryId, input.type,
          b.toFixed(4), input.publish ? "OPEN" : "DRAFT", input.resolutionCriteria, input.resolutionSource,
          input.closeAt, input.resolveBy, input.isElectoral, ctx.user.id,
        ],
      );
      const marketId = m.rows[0].id as string;
      for (const [i, o] of outcomes.entries()) {
        await client.query(
          `INSERT INTO market_outcomes (market_id, label, display_order) VALUES ($1,$2,$3)`,
          [marketId, o.label, i],
        );
      }
      if (input.type === "MULTI" && input.includeCatchall) {
        await client.query(
          `INSERT INTO market_outcomes (market_id, label, is_catchall, display_order)
           VALUES ($1,'OUTROS',true,999)`,
          [marketId],
        );
      }
      await client.query("COMMIT");
      return { id: marketId, slug: input.slug };
    } catch (e) {
      await client.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505")
        throw new TRPCError({ code: "CONFLICT", message: "slug já existe" });
      throw e;
    } finally {
      client.release();
    }
  }),

  // Só campos não-estruturais (nunca slug/type/outcomes/liquidez — mexer
  // nisso com trades já registrados quebraria a matemática do LMSR).
  // Só permitido em DRAFT/OPEN; CLOSED/RESOLVED/VOIDED são estados finais.
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(300).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        resolutionCriteria: z.string().trim().min(10).optional(),
        resolutionSource: z.string().trim().min(2).optional(),
        closeAt: z.string().datetime().optional(),
        resolveBy: z.string().datetime().optional(),
        isElectoral: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const colMap: Record<string, string> = {
        title: "title", description: "description", resolutionCriteria: "resolution_criteria",
        resolutionSource: "resolution_source", closeAt: "close_at", resolveBy: "resolve_by",
        isElectoral: "is_electoral",
      };
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${colMap[k]} = $${params.length}`);
      }
      if (!sets.length) throw new TRPCError({ code: "BAD_REQUEST", message: "nada para atualizar" });
      params.push(id);

      try {
        const r = await ctx.pool.query(
          `UPDATE markets SET ${sets.join(", ")} WHERE id = $${params.length} AND status IN ('DRAFT','OPEN')
           RETURNING id`,
          params,
        );
        if (!r.rowCount)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "mercado não encontrado ou não editável (status atual não permite edição)",
          });
        return { id: r.rows[0].id as string };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        if ((e as { code?: string }).code === "23514")
          throw new TRPCError({ code: "BAD_REQUEST", message: "resolveBy deve ser depois de closeAt" });
        throw e;
      }
    }),

  setFeatured: adminProcedure
    .input(z.object({ id: z.string().uuid(), featured: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`UPDATE markets SET featured = $2 WHERE id = $1`, [input.id, input.featured]);
      return { ok: true };
    }),

  // Slide de destaque da home (inspirado no carrossel do Polymarket — só o
  // layout). Prioriza featured=true (curadoria do admin); completa com quem
  // fecha mais cedo se tiver menos de 3 marcados, pro slide nunca ficar vazio.
  featured: publicProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT m.id, m.slug, m.title, m.type, m.close_at, m.liquidity_b,
              c.name AS category_name
         FROM markets m JOIN categories c ON c.id = m.category_id
        WHERE m.status = 'OPEN'
        ORDER BY m.featured DESC, m.close_at ASC LIMIT 6`,
    );
    if (!r.rowCount) return [];
    const marketIds = r.rows.map((row) => row.id as string);

    const out = await ctx.pool.query(
      `SELECT market_id, id, label, q, is_catchall FROM market_outcomes
        WHERE market_id = ANY($1) ORDER BY market_id, display_order, id`,
      [marketIds],
    );
    const outcomesByMarket = new Map<string, { id: string; label: string; q: number; isCatchall: boolean }[]>();
    for (const o of out.rows) {
      const arr = outcomesByMarket.get(o.market_id) ?? [];
      arr.push({ id: o.id, label: o.label, q: Number(o.q), isCatchall: o.is_catchall });
      outcomesByMarket.set(o.market_id, arr);
    }

    // Outcome "manchete" por mercado (mesma regra do embed.ts: SIM em
    // BINARY, líder excluindo OUTROS em MULTI) — é o que ganha a sparkline.
    const leaderOutcomeId = new Map<string, string>();
    const marketSummary = new Map<string, { label: string; price: number }>();
    for (const row of r.rows) {
      const outcomes = outcomesByMarket.get(row.id) ?? [];
      const prices = lmsrPrices(outcomes.map((o) => o.q), Number(row.liquidity_b));
      let idx = row.type === "BINARY" ? outcomes.findIndex((o) => o.label === "SIM") : -1;
      if (idx < 0) {
        let best = -1;
        outcomes.forEach((o, i) => { if (!o.isCatchall && (best < 0 || prices[i] > prices[best])) best = i; });
        idx = best;
      }
      if (idx >= 0) {
        leaderOutcomeId.set(row.id, outcomes[idx].id);
        marketSummary.set(row.id, { label: outcomes[idx].label, price: prices[idx] });
      }
    }

    const leaderIds = [...leaderOutcomeId.values()];
    const snaps = leaderIds.length ? await ctx.pool.query(
      `WITH win AS (
         SELECT outcome_id, price, ts, extract(epoch FROM ts) AS ep
           FROM price_snapshots
          WHERE outcome_id = ANY($1) AND ts > now() - ($2 || ' days')::interval
       ), lim AS (SELECT outcome_id, min(ep) AS t0, max(ep) AS t1 FROM win GROUP BY outcome_id)
       SELECT w.outcome_id,
              width_bucket(w.ep, lim.t0, lim.t1 + 1, $3) AS bucket,
              avg(w.price) AS price,
              (avg(w.ep) - lim.t0) / greatest(lim.t1 - lim.t0, 1) AS t
         FROM win w JOIN lim ON lim.outcome_id = w.outcome_id
        GROUP BY w.outcome_id, bucket, lim.t0, lim.t1
        ORDER BY w.outcome_id, bucket`,
      [leaderIds, SERIES_DAYS, SERIES_POINTS],
    ) : { rows: [] as { outcome_id: string; t: number; price: number }[] };
    const seriesByOutcome = new Map<string, [number, number][]>();
    for (const s of snaps.rows) {
      const arr = seriesByOutcome.get(s.outcome_id) ?? [];
      arr.push([Number(s.t), Number(s.price)]);
      seriesByOutcome.set(s.outcome_id, arr);
    }

    return r.rows.map((row) => ({
      slug: row.slug as string, title: row.title as string, type: row.type as string,
      closeAt: row.close_at as Date, categoryName: row.category_name as string,
      summary: marketSummary.get(row.id) ?? null,
      series: seriesByOutcome.get(leaderOutcomeId.get(row.id) ?? "") ?? [],
    }));
  }),

  publish: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const r = await ctx.pool.query(
      `UPDATE markets SET status = 'OPEN' WHERE id = $1 AND status = 'DRAFT' RETURNING id`,
      [input.id],
    );
    if (!r.rowCount)
      throw new TRPCError({ code: "BAD_REQUEST", message: "mercado não encontrado ou não está em DRAFT" });
    return { id: r.rows[0].id as string };
  }),

  categories: publicProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(`SELECT slug, name FROM categories ORDER BY name`);
    return r.rows as { slug: string; name: string }[];
  }),

  get: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const m = await ctx.pool.query(
      `SELECT m.id, m.slug, m.title, m.description, m.status, m.type, m.liquidity_b, m.is_electoral,
              m.close_at, m.resolve_by, m.resolution_criteria, m.resolution_source, m.featured,
              c.slug AS category_slug, c.name AS category_name
         FROM markets m JOIN categories c ON c.id = m.category_id
        WHERE m.slug = $1`,
      [input.slug],
    );
    if (!m.rowCount) throw new TRPCError({ code: "NOT_FOUND", message: "mercado não encontrado" });
    const mk = m.rows[0];

    const out = await ctx.pool.query(
      `SELECT id, label, q, is_catchall FROM market_outcomes
        WHERE market_id = $1 ORDER BY display_order, id`,
      [mk.id],
    );
    const prices = lmsrPrices(out.rows.map((r) => Number(r.q)), Number(mk.liquidity_b));

    // Série de preços p/ o gráfico — mesmo downsample por bucket de tempo do
    // embed.ts (getMarketPublicData), só que aqui indexado por outcome_id em
    // vez de label (é o que a página React usa pra casar com os outcomes).
    const snaps = await ctx.pool.query(
      `WITH win AS (
         SELECT outcome_id, price, ts, extract(epoch FROM ts) AS ep
           FROM price_snapshots
          WHERE market_id = $1 AND ts > now() - ($2 || ' days')::interval
       ), lim AS (SELECT min(ep) AS t0, max(ep) AS t1 FROM win)
       SELECT w.outcome_id,
              width_bucket(w.ep, lim.t0, lim.t1 + 1, $3) AS bucket,
              avg(w.price) AS price,
              (avg(w.ep) - lim.t0) / greatest(lim.t1 - lim.t0, 1) AS t
         FROM win w, lim
        GROUP BY w.outcome_id, bucket, lim.t0, lim.t1
        ORDER BY w.outcome_id, bucket`,
      [mk.id, SERIES_DAYS, SERIES_POINTS],
    );
    const byOutcome = new Map<string, [number, number][]>();
    for (const s of snaps.rows) {
      const arr = byOutcome.get(s.outcome_id) ?? [];
      arr.push([Number(s.t), Number(s.price)]);
      byOutcome.set(s.outcome_id, arr);
    }

    return {
      id: mk.id as string, slug: mk.slug as string, title: mk.title as string,
      description: mk.description as string | null, status: mk.status as string,
      type: mk.type as string, isElectoral: mk.is_electoral as boolean,
      closeAt: mk.close_at as Date, resolveBy: mk.resolve_by as Date,
      resolutionCriteria: mk.resolution_criteria as string, resolutionSource: mk.resolution_source as string,
      categorySlug: mk.category_slug as string, categoryName: mk.category_name as string,
      liquidityB: Number(mk.liquidity_b), featured: mk.featured as boolean,
      outcomes: out.rows.map((r, i) => ({
        id: r.id as string, label: r.label as string,
        isCatchall: r.is_catchall as boolean, price: prices[i],
        series: byOutcome.get(r.id as string) ?? [],
      })),
    };
  }),

  // Público: nunca mostra DRAFT (revisão editorial ainda não publicada).
  // A tabela do admin usa admin.listMarkets, que inclui DRAFT.
  list: publicProcedure
    .input(z.object({
      status: z.string().optional(), categorySlug: z.string().optional(),
      q: z.string().trim().max(200).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conds: string[] = ["m.status != 'DRAFT'"];
      const params: unknown[] = [];
      if (input?.status) { params.push(input.status); conds.push(`m.status = $${params.length}`); }
      if (input?.categorySlug) { params.push(input.categorySlug); conds.push(`c.slug = $${params.length}`); }
      if (input?.q) { params.push(`%${input.q}%`); conds.push(`m.title ILIKE $${params.length}`); }
      const where = `WHERE ${conds.join(" AND ")}`;

      const r = await ctx.pool.query(
        `SELECT m.id, m.slug, m.title, m.status, m.type, m.is_electoral, m.liquidity_b, m.close_at,
                c.slug AS category_slug, c.name AS category_name
           FROM markets m JOIN categories c ON c.id = m.category_id
           ${where}
          ORDER BY m.created_at DESC LIMIT 300`,
        params,
      );
      if (!r.rowCount) return [];

      const marketIds = r.rows.map((row) => row.id as string);
      const out = await ctx.pool.query(
        `SELECT market_id, label, q, is_catchall FROM market_outcomes
          WHERE market_id = ANY($1) ORDER BY market_id, display_order, id`,
        [marketIds],
      );
      const byMarket = new Map<string, { label: string; q: number; isCatchall: boolean }[]>();
      for (const o of out.rows) {
        const arr = byMarket.get(o.market_id) ?? [];
        arr.push({ label: o.label, q: Number(o.q), isCatchall: o.is_catchall });
        byMarket.set(o.market_id, arr);
      }

      // Patrocínio ativo agora, por mercado — mesma regra de sponsor.getActiveForMarket,
      // batelada aqui pra não disparar 1 query por card no grid da home.
      const spRes = await ctx.pool.query(
        `SELECT sp.market_id, sp.label, s.name, s.logo_url
           FROM sponsorships sp JOIN sponsors s ON s.id = sp.sponsor_id
          WHERE sp.market_id = ANY($1) AND s.is_active = true
            AND now() BETWEEN sp.starts_at AND sp.ends_at`,
        [marketIds],
      );
      const sponsorByMarket = new Map<string, { label: string; name: string; logoUrl: string | null }>();
      for (const row of spRes.rows) {
        sponsorByMarket.set(row.market_id, {
          label: row.label as string, name: row.name as string, logoUrl: row.logo_url as string | null,
        });
      }

      return r.rows.map((row) => {
        const outcomes = byMarket.get(row.id as string) ?? [];
        const prices = lmsrPrices(outcomes.map((o) => o.q), Number(row.liquidity_b));
        // Resumo: BINARY -> preço do SIM; MULTI -> outcome líder (excluindo OUTROS).
        let summary: { label: string; price: number } | null = null;
        if (row.type === "BINARY") {
          const idx = outcomes.findIndex((o) => o.label === "SIM");
          if (idx >= 0) summary = { label: "SIM", price: prices[idx] };
        } else {
          let best = -1;
          outcomes.forEach((o, i) => { if (!o.isCatchall && (best < 0 || prices[i] > prices[best])) best = i; });
          if (best >= 0) summary = { label: outcomes[best].label, price: prices[best] };
        }
        return {
          slug: row.slug as string, title: row.title as string, status: row.status as string,
          type: row.type as string, isElectoral: row.is_electoral as boolean,
          closeAt: row.close_at as Date,
          categorySlug: row.category_slug as string, categoryName: row.category_name as string,
          summary,
          sponsor: sponsorByMarket.get(row.id as string) ?? null,
        };
      });
    }),
});
