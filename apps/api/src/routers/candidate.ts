// ============================================================================
// candidate.ts — Sugestão comunitária de pré-candidato + fila de moderação.
// Escopo da F1 (plano-construcao.md §3): suggest + list. Reivindicação de
// perfil (claim) é F2 — exige o form com campos-TSE pra dar match quase
// determinístico depois (README §4), fora do escopo agora de propósito.
// ============================================================================
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, resolverProcedure } from "../trpc/trpc.js";

const OFFICE = z.enum([
  "PRESIDENTE", "GOVERNADOR", "SENADOR",
  "DEP_FEDERAL", "DEP_ESTADUAL", "PREFEITO", "VEREADOR",
]);
const CANDIDACY_STATUS = z.enum([
  "PRE_ANUNCIADO", "PRE_REIVINDICADO", "REGISTRADO",
  "DEFERIDO", "INDEFERIDO", "RENUNCIOU", "FALECIDO", "NAO_REGISTROU",
]);

const suggestInput = z
  .object({
    name: z.string().trim().min(3).max(200),
    publicName: z.string().trim().max(120).optional(),
    party: z.string().trim().min(1).max(20),
    office: OFFICE,
    uf: z.string().length(2).toUpperCase().optional(),
    municipalityIbge: z.number().int().positive().optional(),
    photoUrl: z.string().url().optional(),
    // Fonte pública do anúncio: obrigatória por regra de produto (curadoria
    // verificável), mesmo a coluna sendo nullable no schema.
    sourceUrl: z.string().url(),
  })
  .refine((d) => d.office === "PRESIDENTE" || !!d.uf, {
    message: "uf é obrigatória para esse cargo",
    path: ["uf"],
  });

export const candidateRouter = router({
  suggest: protectedProcedure.input(suggestInput).mutation(async ({ ctx, input }) => {
    try {
      // ballot_name (nome de urna) é NOT NULL no schema, mas só existe de
      // verdade após o registro no TSE — usa o nome público/civil como
      // estimativa até lá (mesmo padrão de fallback do gerador.ts).
      const ballotName = input.publicName ?? input.name;
      const r = await ctx.pool.query(
        `INSERT INTO candidates
           (name, ballot_name, public_name, party, office, uf, municipality_ibge, photo_url,
            source_url, candidacy_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PRE_ANUNCIADO')
         RETURNING id`,
        [
          input.name, ballotName, input.publicName ?? null, input.party, input.office,
          input.uf ?? null, input.municipalityIbge ?? null, input.photoUrl ?? null,
          input.sourceUrl,
        ],
      );
      return { id: r.rows[0].id as string };
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new TRPCError({
          code: "CONFLICT",
          message: "já existe um pré-candidato com esse nome, cargo e UF",
        });
      throw e;
    }
  }),

  list: publicProcedure
    .input(
      z
        .object({
          office: OFFICE.optional(),
          uf: z.string().length(2).toUpperCase().optional(),
          status: CANDIDACY_STATUS.optional(),
          search: z.string().trim().min(1).max(120).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conds: string[] = [];
      const params: unknown[] = [];
      if (input?.office) { params.push(input.office); conds.push(`office = $${params.length}`); }
      if (input?.uf) { params.push(input.uf); conds.push(`uf = $${params.length}`); }
      if (input?.status) { params.push(input.status); conds.push(`candidacy_status = $${params.length}`); }
      if (input?.search) {
        params.push(`%${input.search}%`);
        conds.push(`(name ILIKE $${params.length} OR public_name ILIKE $${params.length})`);
      }

      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const r = await ctx.pool.query(
        `SELECT id, name, public_name, party, office, uf, municipality_ibge,
                photo_url, candidacy_status, source_url, updated_at
           FROM candidates ${where}
          ORDER BY updated_at DESC LIMIT 100`,
        params,
      );
      return r.rows;
    }),

  // Moderação (F1: sem estado "REJEITADO" no schema — remover é a ação de
  // curadoria pra sugestão inválida/duplicada/spam).
  remove: resolverProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const r = await ctx.pool.query(
      `DELETE FROM candidates WHERE id = $1 AND candidacy_status = 'PRE_ANUNCIADO'`,
      [input.id],
    );
    if (!r.rowCount)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "candidato não encontrado ou já avançou de fase (não é mais PRE_ANUNCIADO)",
      });
    return { removed: true };
  }),
});
