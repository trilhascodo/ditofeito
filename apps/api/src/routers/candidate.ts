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

const OFFICE = z.enum([
  "PRESIDENTE", "GOVERNADOR", "SENADOR",
  "DEP_FEDERAL", "DEP_ESTADUAL", "PREFEITO", "VEREADOR",
]);
const CANDIDACY_STATUS = z.enum([
  "PRE_ANUNCIADO", "PRE_REIVINDICADO", "REGISTRADO",
  "DEFERIDO", "INDEFERIDO", "RENUNCIOU", "FALECIDO", "NAO_REGISTROU",
]);

// Status que significam "saiu da disputa" — indeferimento, abandono,
// não-registro (exclusão por não participação) ou falecimento. Fora desse
// conjunto, o candidato segue na disputa (inclusive REGISTRADO/DEFERIDO), e
// nenhum mercado é mexido.
const EXIT_STATUSES = new Set(["INDEFERIDO", "RENUNCIOU", "FALECIDO", "NAO_REGISTROU"]);

// Tira o candidato de um MULTI "quem vence" quando ninguém tocou nele: sem
// trade, sem posição, sem palpite de bolão, sem resolução. Nesse caso não há
// aposta de ninguém pra proteger — o outcome é só uma linha errada (ex.:
// pré-candidato que o gerador pegou e que nunca concorreu ao cargo). LMSR
// renormaliza os preços dos outros sozinho (a massa dele se redistribui), o
// que é o certo: quem está fora da disputa não tem chance. Com qualquer
// aposta nele, devolve false e o admin decide (anular o MULTI inteiro puniria
// quem apostou nos outros candidatos — ver updateStatus).
async function removeUntouchedOutcome(pool: Pool, marketId: string, candidateId: string): Promise<boolean> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Mesmo lock do executeTrade (domain/trade.ts) — nenhum trade entra no meio.
    const m = await c.query(`SELECT status FROM markets WHERE id = $1 FOR UPDATE`, [marketId]);
    if (!m.rowCount || !["DRAFT", "OPEN", "CLOSED"].includes(m.rows[0].status as string)) {
      await c.query("ROLLBACK");
      return false;
    }
    const o = await c.query(
      `SELECT id FROM market_outcomes WHERE market_id = $1 AND candidate_id = $2`, [marketId, candidateId]);
    if (!o.rowCount) { await c.query("ROLLBACK"); return true; }
    const outcomeId = o.rows[0].id as string;
    const used = await c.query(
      `SELECT EXISTS (SELECT 1 FROM trades WHERE outcome_id = $1)
           OR EXISTS (SELECT 1 FROM positions WHERE outcome_id = $1 AND shares > 0)
           OR EXISTS (SELECT 1 FROM bolao_palpites WHERE guess_outcome_id = $1)
           OR EXISTS (SELECT 1 FROM resolutions WHERE resolved_outcome_id = $1) AS used`,
      [outcomeId]);
    if (used.rows[0].used) { await c.query("ROLLBACK"); return false; }
    await c.query(`DELETE FROM price_snapshots WHERE outcome_id = $1`, [outcomeId]);
    await c.query(`DELETE FROM positions WHERE outcome_id = $1`, [outcomeId]);
    await c.query(`DELETE FROM market_outcomes WHERE id = $1`, [outcomeId]);
    await c.query("COMMIT");
    return true;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

// Rascunho nunca foi público (market.remove segue a mesma regra) — o
// "será eleito?" de quem saiu da disputa só some, não precisa ser anulado.
async function deleteDraftMarket(pool: Pool, marketId: string): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`DELETE FROM sponsorships WHERE market_id = $1`, [marketId]);
    await c.query(`DELETE FROM markets WHERE id = $1 AND status = 'DRAFT'`, [marketId]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

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
  // (removeUntouchedOutcome); com aposta, devolve em skippedMarkets pro admin.
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
      const cand = await ctx.pool.query(`SELECT id FROM candidates WHERE id = $1`, [input.id]);
      if (!cand.rowCount) throw new TRPCError({ code: "NOT_FOUND", message: "candidato não encontrado" });

      await ctx.pool.query(
        `UPDATE candidates SET candidacy_status = $2, updated_at = now() WHERE id = $1`,
        [input.id, input.candidacyStatus],
      );

      const voidedMarkets: string[] = [];
      const skippedMarkets: string[] = [];
      const removedFromMarkets: string[] = [];
      const deletedDrafts: string[] = [];
      if (EXIT_STATUSES.has(input.candidacyStatus)) {
        const markets = await ctx.pool.query(
          `SELECT m.id, m.slug, m.status,
                  (SELECT count(*) FROM market_outcomes mo2
                     WHERE mo2.market_id = m.id AND mo2.candidate_id IS NOT NULL) AS candidate_outcomes
             FROM market_outcomes mo JOIN markets m ON m.id = mo.market_id
            WHERE mo.candidate_id = $1`,
          [input.id],
        );
        for (const row of markets.rows) {
          const slug = row.slug as string;
          if (Number(row.candidate_outcomes) > 1) {
            if (await removeUntouchedOutcome(ctx.pool, row.id as string, input.id)) removedFromMarkets.push(slug);
            else skippedMarkets.push(slug);
            continue;
          }
          if (row.status === "DRAFT") {
            await deleteDraftMarket(ctx.pool, row.id as string);
            deletedDrafts.push(slug);
            continue;
          }
          if (!["OPEN", "CLOSED"].includes(row.status as string)) continue; // já anulado/resolvido, nada a fazer
          try {
            await voidMarket(ctx.pool, {
              marketId: row.id as string, resolverUserId: ctx.user.id,
              justification: input.justification!, sourceUrl: input.sourceUrl!,
            });
            voidedMarkets.push(slug);
          } catch (e) {
            throwAsTRPC(e);
          }
        }
      }
      return { ok: true, voidedMarkets, skippedMarkets, removedFromMarkets, deletedDrafts };
    }),
});
