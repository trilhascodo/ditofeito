import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lmsrPrices, suggestB } from "@ditofeito/core";
import { router, publicProcedure, adminProcedure } from "../trpc/trpc.js";

const outcomeInput = z.object({ label: z.string().trim().min(1).max(120) });

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
         VALUES ($1,$2,$3,$4,$5,$6,'OPEN',$7,$8,$9,$10,$11,$12) RETURNING id`,
        [
          input.slug, input.title, input.description ?? null, categoryId, input.type,
          b.toFixed(4), input.resolutionCriteria, input.resolutionSource,
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

  get: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const m = await ctx.pool.query(
      `SELECT id, slug, title, description, status, type, liquidity_b, is_electoral,
              close_at, resolve_by, resolution_criteria, resolution_source
         FROM markets WHERE slug = $1`,
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

    return {
      id: mk.id as string, slug: mk.slug as string, title: mk.title as string,
      description: mk.description as string | null, status: mk.status as string,
      type: mk.type as string, isElectoral: mk.is_electoral as boolean,
      closeAt: mk.close_at as Date, resolveBy: mk.resolve_by as Date,
      resolutionCriteria: mk.resolution_criteria as string, resolutionSource: mk.resolution_source as string,
      outcomes: out.rows.map((r, i) => ({
        id: r.id as string, label: r.label as string,
        isCatchall: r.is_catchall as boolean, price: prices[i],
      })),
    };
  }),

  list: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const status = input?.status;
      const r = await ctx.pool.query(
        status
          ? `SELECT slug, title, status, type FROM markets WHERE status = $1 ORDER BY created_at DESC LIMIT 50`
          : `SELECT slug, title, status, type FROM markets ORDER BY created_at DESC LIMIT 50`,
        status ? [status] : [],
      );
      return r.rows;
    }),
});
