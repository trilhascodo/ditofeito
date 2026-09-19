// ============================================================================
// candidate.ts — Sugestão comunitária de pré-candidato + fila de moderação.
// Escopo da F1 (plano-construcao.md §3): suggest + list. Reivindicação de
// perfil (claim) é F2 — exige o form com campos-TSE pra dar match quase
// determinístico depois (README §4), fora do escopo agora de propósito.
// ============================================================================
import { z } from "zod";
import type { Pool } from "pg";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, resolverProcedure, adminProcedure } from "../trpc/trpc.js";
import { rodarGerador } from "../jobs/gerador.js";
import { voidMarket } from "../domain/trade.js";
import { throwAsTRPC } from "../trpc/errors.js";
import { EXIT_STATUSES, applyExitToMarkets, type ExitEffects } from "../domain/candidateExit.js";

const OFFICE = z.enum([
  "PRESIDENTE", "GOVERNADOR", "SENADOR",
  "DEP_FEDERAL", "DEP_ESTADUAL", "PREFEITO", "VEREADOR",
]);
const CANDIDACY_STATUS = z.enum([
  "PRE_ANUNCIADO", "PRE_REIVINDICADO", "REGISTRADO",
  "DEFERIDO", "INDEFERIDO", "RENUNCIOU", "FALECIDO", "NAO_REGISTROU",
]);

const candidateFields = z.object({
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
});
const hasUfIfNeeded = (d: { office: string; uf?: string }) => d.office === "PRESIDENTE" || !!d.uf;
const UF_REQUIRED = { message: "uf é obrigatória para esse cargo", path: ["uf"] };

const suggestInput = candidateFields.refine(hasUfIfNeeded, UF_REQUIRED);

// Cadastro direto pelo admin — a lista do gerador vem de sugestão/importação
// e deixava de fora gente que de fato concorre (ex.: "Policial Edjane" pra
// governador/SP), sem nenhum jeito de incluir pela tela. Entra já com o
// status que o admin confirmou (normalmente REGISTRADO, candidatura oficial).
const createInput = candidateFields
  .extend({ candidacyStatus: z.enum(["PRE_ANUNCIADO", "REGISTRADO", "DEFERIDO"]).default("REGISTRADO") })
  .refine(hasUfIfNeeded, UF_REQUIRED);

async function insertCandidate(
  pool: Pool, input: z.infer<typeof candidateFields>, status: string,
): Promise<string> {
  try {
    // ballot_name (nome de urna) é NOT NULL no schema, mas só existe de
    // verdade após o registro no TSE — usa o nome público/civil como
    // estimativa até lá (mesmo padrão de fallback do gerador.ts).
    const ballotName = input.publicName ?? input.name;
    const r = await pool.query(
      `INSERT INTO candidates
         (name, ballot_name, public_name, party, office, uf, municipality_ibge, photo_url,
          source_url, candidacy_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        input.name, ballotName, input.publicName ?? null, input.party, input.office,
        input.uf ?? null, input.municipalityIbge ?? null, input.photoUrl ?? null,
        input.sourceUrl, status,
      ],
    );
    return r.rows[0].id as string;
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new TRPCError({
        code: "CONFLICT",
        message: "já existe um candidato com esse nome, cargo e UF",
      });
    throw e;
  }
}

export const candidateRouter = router({
  suggest: protectedProcedure.input(suggestInput).mutation(async ({ ctx, input }) => {
    return { id: await insertCandidate(ctx.pool, input, "PRE_ANUNCIADO") };
  }),

  // Já roda o gerador em seguida: o candidato entra como opção do "quem
  // vence" da disputa (se já existe, via sync de outcomes) e ganha o
  // rascunho "será eleito?" — sem precisar lembrar do botão do gerador.
  create: resolverProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const { candidacyStatus, ...fields } = input;
    const id = await insertCandidate(ctx.pool, fields, candidacyStatus);
    const gerador = await rodarGerador(ctx.pool);
    return { id, gerador };
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
                photo_url, candidacy_status, source_url, updated_at,
                -- gerador (jobs/gerador.ts) roda por cron e pode criar mercado pra
                -- candidato ainda PRE_ANUNCIADO, antes de qualquer moderação — a fila
                -- (AdminCandidates.tsx) usa isso pra não oferecer "Remover" num
                -- candidato que já não pode mais sair do banco (FK
                -- market_outcomes_candidate_id_fkey, ver candidate.remove abaixo).
                EXISTS(SELECT 1 FROM market_outcomes mo WHERE mo.candidate_id = candidates.id) AS has_market_outcome
           FROM candidates ${where}
          ORDER BY updated_at DESC LIMIT 100`,
        params,
      );
      return r.rows;
    }),

  // Moderação (F1: sem estado "REJEITADO" no schema — remover é a ação de
  // curadoria pra sugestão inválida/duplicada/spam).
  remove: resolverProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    // O gerador (jobs/gerador.ts) cria mercado/outcome pra candidato ainda
    // PRE_ANUNCIADO (roda por cron, não espera moderação) — se isso já
    // aconteceu, DELETE quebra na FK market_outcomes_candidate_id_fkey.
    // Checa antes pra dar um erro que explica o motivo, em vez de deixar o
    // erro cru do Postgres subir pro admin (ver AdminCandidates.tsx).
    const outcome = await ctx.pool.query(
      `SELECT 1 FROM market_outcomes WHERE candidate_id = $1 LIMIT 1`, [input.id],
    );
    if (outcome.rowCount)
      // Anular o mercado NÃO libera isso — voidMarket só muda markets.status
      // e devolve pontos, nunca apaga market_outcomes (mesmo espírito de
      // market.remove: publicado é registro permanente, ver comentário lá).
      // Então não existe caminho pra remover a sugestão depois desse ponto —
      // nem sugere um passo intermediário que não resolveria.
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Esse pré-candidato já virou mercado (o gerador rodou antes da moderação) — "
          + "o registro fica permanente, igual qualquer mercado publicado (anular não muda isso, "
          + "só devolve os pontos de quem apostou). Não é mais uma sugestão pendente pra remover.",
      });

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

  // Normalmente roda sozinho às 6h (schedule.ts) — este botão existe pra não
  // depender de esperar o cron (ou de SSH na VPS pra rodar o CLI) toda vez
  // que candidato novo entra e precisa virar mercado na hora.
  runGerador: adminProcedure.mutation(async ({ ctx }) => {
    return rodarGerador(ctx.pool);
  }),

  // Manutenção de status (desistência/indeferimento/não-registro/falecimento
  // ANTES do lote automático pós-prazo — ver jobs/matcher.ts::markNonRegistered
  // — ou pra corrigir manualmente a qualquer momento). Quando o novo status é
  // de saída (EXIT_STATUSES), anula automaticamente o(s) mercado(s) BINÁRIO(S)
  // "será eleito?" desse candidato (1 candidato = 1 outcome não-catchall no
  // mercado — anular não afeta mais ninguém, é seguro; em rascunho, só apaga).
  // NUNCA anula um MULTI "quem vence a disputa" (vários candidatos como
  // outcome — anular puniria quem apostou nos outros, que continuam
  // concorrendo): tira só a linha do candidato se ninguém apostou nele
  // (domain/candidateExit.ts); com aposta, devolve em skippedMarkets pro admin.
  updateStatus: resolverProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        candidacyStatus: CANDIDACY_STATUS,
        // Só exigido quando o novo status é de saída — é a justificativa/fonte
        // que vai pro registro de anulação (resolutions.justification/source_url
        // são NOT NULL), mesmo padrão de admin.ts::voidMarket.
        justification: z.string().trim().min(10).optional(),
        sourceUrl: z.string().url().optional(),
      }).refine(
        (d) => !EXIT_STATUSES.has(d.candidacyStatus) || (d.justification && d.sourceUrl),
        { message: "justificativa e fonte são obrigatórias pra marcar saída da disputa", path: ["justification"] },
      ),
    )
    .mutation(async ({ ctx, input }) => {
      // Status + efeitos nos mercados numa transação só (domain/candidateExit.ts,
      // mesma lógica da sync com o TSE); anular "será eleito?" publicado fica
      // pra depois do commit — voidMarket abre transação própria e manda e-mail.
      const c = await ctx.pool.connect();
      let fx: ExitEffects = { removedFromMarkets: [], deletedDrafts: [], toVoid: [], skippedMarkets: [] };
      try {
        await c.query("BEGIN");
        const r = await c.query(
          `UPDATE candidates SET candidacy_status = $2, updated_at = now() WHERE id = $1`,
          [input.id, input.candidacyStatus],
        );
        if (!r.rowCount) throw new TRPCError({ code: "NOT_FOUND", message: "candidato não encontrado" });
        if (EXIT_STATUSES.has(input.candidacyStatus)) fx = await applyExitToMarkets(c, input.id);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }

      const voidedMarkets: string[] = [];
      for (const m of fx.toVoid) {
        try {
          await voidMarket(ctx.pool, {
            marketId: m.id, resolverUserId: ctx.user.id,
            justification: input.justification!, sourceUrl: input.sourceUrl!,
          });
          voidedMarkets.push(m.slug);
        } catch (e) {
          throwAsTRPC(e);
        }
      }
      return {
        ok: true, voidedMarkets, skippedMarkets: fx.skippedMarkets,
        removedFromMarkets: fx.removedFromMarkets, deletedDrafts: fx.deletedDrafts,
      };
    }),
});
