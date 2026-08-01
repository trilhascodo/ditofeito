// ============================================================================
// grupos.ts — grupos privados + bolão (palpite sobre um mercado existente).
// Todo endpoint aqui é protectedProcedure (usuário comum, não precisa ser
// admin/resolver) — a única autorização extra é "ser membro do grupo" (ou
// "ter criado o bolão", só pra resolveExtra). Ver domain/bolao.ts pra lógica
// de vencedores e migrations/031_boloes.sql pro modelo de dados.
// ============================================================================
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Pool } from "pg";
import { router, protectedProcedure, publicProcedure } from "../trpc/trpc.js";
import { calcularVencedores, statusBolao, type GuessType } from "../domain/bolao.js";
import { checkRateLimit } from "../lib/rateLimit.js";

// Mesmo teto de comments.ts (COMMENT_RATE_LIMIT) — mural de grupo é bem
// menor em volume (poucos membros vs. mercado público), mas o risco de
// spam/script é o mesmo tipo de mutation.
const POST_RATE_LIMIT = { max: 5, windowMs: 60_000 };

async function assertMember(pool: Pool, groupId: string, userId: string): Promise<void> {
  const r = await pool.query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  );
  if (!r.rowCount) throw new TRPCError({ code: "FORBIDDEN", message: "você não é membro deste grupo" });
}

const guessTypeSchema = z.enum(["WINNER", "SCORE", "NUMBER"]);

const groupsSubRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.pool.connect();
      try {
        await client.query("BEGIN");
        const inviteCode = randomBytes(6).toString("base64url");
        const g = await client.query(
          `INSERT INTO groups (name, invite_code, created_by) VALUES ($1,$2,$3) RETURNING id`,
          [input.name, inviteCode, ctx.user.id],
        );
        const groupId = g.rows[0].id as string;
        await client.query(
          `INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)`,
          [groupId, ctx.user.id],
        );
        await client.query("COMMIT");
        return { id: groupId, name: input.name, inviteCode };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }),

  joinByCode: protectedProcedure
    .input(z.object({ code: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const g = await ctx.pool.query(`SELECT id, name FROM groups WHERE invite_code = $1`, [input.code]);
      if (!g.rowCount) throw new TRPCError({ code: "NOT_FOUND", message: "código de convite inválido" });
      const groupId = g.rows[0].id as string;
      await ctx.pool.query(
        `INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [groupId, ctx.user.id],
      );
      return { id: groupId, name: g.rows[0].name as string };
    }),

  // Pública — alimenta a página de convite (/grupos/entrar/:code) e o card OG
  // (http/inviteCard.ts) pra quem ainda nem tem conta. Só expõe o que já é
  // visível pra qualquer um que tenha o link: nada de lista de membros aqui.
  previewByCode: publicProcedure
    .input(z.object({ code: z.string().trim().min(1) }))
    .query(async ({ ctx, input }) => {
      const g = await ctx.pool.query(
        `SELECT g.name, u.display_name AS creator_name,
                (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
                (SELECT count(*) FROM boloes b
                   JOIN markets m ON m.id = b.market_id
                  WHERE b.group_id = g.id AND m.status = 'OPEN') AS active_boloes_count
           FROM groups g JOIN users u ON u.id = g.created_by
          WHERE g.invite_code = $1`,
        [input.code],
      );
      if (!g.rowCount) throw new TRPCError({ code: "NOT_FOUND", message: "código de convite inválido" });
      const row = g.rows[0];
      return {
        name: row.name as string,
        creatorDisplayName: row.creator_name as string,
        memberCount: Number(row.member_count),
        activeBoloesCount: Number(row.active_boloes_count),
      };
    }),

  myGroups: protectedProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT g.id, g.name, g.invite_code, g.created_by,
              (SELECT count(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
         FROM groups g JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = $1
        ORDER BY g.created_at DESC`,
      [ctx.user.id],
    );
    return r.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      inviteCode: row.invite_code as string,
      isOwner: row.created_by === ctx.user.id,
      memberCount: Number(row.member_count),
    }));
  }),

  detail: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.pool, input.groupId, ctx.user.id);
      const group = await ctx.pool.query(
        `SELECT id, name, invite_code, created_by FROM groups WHERE id = $1`,
        [input.groupId],
      );
      if (!group.rowCount) throw new TRPCError({ code: "NOT_FOUND" });

      const members = await ctx.pool.query(
        `SELECT u.handle, u.display_name, u.avatar_url
           FROM group_members gm JOIN users u ON u.id = gm.user_id
          WHERE gm.group_id = $1
          ORDER BY gm.joined_at`,
        [input.groupId],
      );

      const boloes = await ctx.pool.query(
        `SELECT b.id, b.guess_type, b.resolved_at,
                m.id AS market_id, m.title AS market_title, m.status AS market_status, m.close_at,
                (SELECT count(*) FROM bolao_palpites bp WHERE bp.bolao_id = b.id) AS palpite_count
           FROM boloes b JOIN markets m ON m.id = b.market_id
          WHERE b.group_id = $1
          ORDER BY b.created_at DESC`,
        [input.groupId],
      );

      return {
        id: group.rows[0].id as string,
        name: group.rows[0].name as string,
        inviteCode: group.rows[0].invite_code as string,
        isOwner: group.rows[0].created_by === ctx.user.id,
        members: members.rows.map((m) => ({
          handle: m.handle as string,
          displayName: m.display_name as string,
          avatarUrl: m.avatar_url as string | null,
        })),
        boloes: boloes.rows.map((b) => ({
          id: b.id as string,
          guessType: b.guess_type as GuessType,
          status: statusBolao(b.market_status as string, b.guess_type as GuessType, b.resolved_at as Date | null),
          marketId: b.market_id as string,
          marketTitle: b.market_title as string,
          marketStatus: b.market_status as string,
          closeAt: b.close_at as Date,
          palpiteCount: Number(b.palpite_count),
        })),
      };
    }),

  posts: router({
    list: protectedProcedure
      .input(z.object({ groupId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        await assertMember(ctx.pool, input.groupId, ctx.user.id);
        const r = await ctx.pool.query(
          `SELECT p.id, p.body, p.created_at, u.handle, u.display_name, u.avatar_url
             FROM group_posts p JOIN users u ON u.id = p.user_id
            WHERE p.group_id = $1
            ORDER BY p.created_at DESC
            LIMIT 200`,
          [input.groupId],
        );
        return r.rows.map((row) => ({
          id: row.id as string,
          body: row.body as string,
          createdAt: row.created_at as Date,
          handle: row.handle as string,
          displayName: row.display_name as string,
          avatarUrl: row.avatar_url as string | null,
        }));
      }),

    create: protectedProcedure
      .input(z.object({ groupId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        await assertMember(ctx.pool, input.groupId, ctx.user.id);
        if (!checkRateLimit(`group-post:${ctx.user.id}`, POST_RATE_LIMIT.max, POST_RATE_LIMIT.windowMs))
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Devagar — espera um minuto antes de postar de novo." });
        await ctx.pool.query(
          `INSERT INTO group_posts (group_id, user_id, body) VALUES ($1,$2,$3)`,
          [input.groupId, ctx.user.id, input.body],
        );
        return { ok: true };
      }),
  }),

  bolao: router({
    create: protectedProcedure
      .input(z.object({
        groupId: z.string().uuid(), marketId: z.string().uuid(), guessType: guessTypeSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        await assertMember(ctx.pool, input.groupId, ctx.user.id);
        const mkt = await ctx.pool.query(`SELECT status FROM markets WHERE id = $1`, [input.marketId]);
        if (!mkt.rowCount) throw new TRPCError({ code: "NOT_FOUND", message: "mercado não encontrado" });
        if (mkt.rows[0].status !== "OPEN")
          throw new TRPCError({ code: "BAD_REQUEST", message: "só dá pra criar bolão em mercado aberto" });
        try {
          const r = await ctx.pool.query(
            `INSERT INTO boloes (group_id, market_id, created_by, guess_type)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [input.groupId, input.marketId, ctx.user.id, input.guessType],
          );
          return { id: r.rows[0].id as string };
        } catch (e) {
          if ((e as { code?: string }).code === "23505")
            throw new TRPCError({
              code: "CONFLICT",
              message: "já existe um bolão desse tipo pra esse mercado neste grupo",
            });
          throw e;
        }
      }),

    submitPalpite: protectedProcedure
      .input(z.object({
        bolaoId: z.string().uuid(),
        guessOutcomeId: z.string().uuid().optional(),
        guessHomeScore: z.number().int().optional(),
        guessAwayScore: z.number().int().optional(),
        guessNumber: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const b = await ctx.pool.query(
          `SELECT b.group_id, b.guess_type, m.status AS market_status, m.close_at
             FROM boloes b JOIN markets m ON m.id = b.market_id
            WHERE b.id = $1`,
          [input.bolaoId],
        );
        if (!b.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
        const row = b.rows[0];
        await assertMember(ctx.pool, row.group_id as string, ctx.user.id);
        if (row.market_status !== "OPEN" || new Date(row.close_at as Date) <= new Date())
          throw new TRPCError({ code: "BAD_REQUEST", message: "prazo de palpite encerrado" });

        const guessType = row.guess_type as GuessType;
        if (guessType === "WINNER" && !input.guessOutcomeId)
          throw new TRPCError({ code: "BAD_REQUEST", message: "escolha um resultado" });
        if (guessType === "SCORE" && (input.guessHomeScore == null || input.guessAwayScore == null))
          throw new TRPCError({ code: "BAD_REQUEST", message: "informe o placar completo" });
        if (guessType === "NUMBER" && input.guessNumber == null)
          throw new TRPCError({ code: "BAD_REQUEST", message: "informe um número" });

        await ctx.pool.query(
          `INSERT INTO bolao_palpites
             (bolao_id, user_id, guess_outcome_id, guess_home_score, guess_away_score, guess_number)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (bolao_id, user_id) DO UPDATE SET
             guess_outcome_id = EXCLUDED.guess_outcome_id,
             guess_home_score = EXCLUDED.guess_home_score,
             guess_away_score = EXCLUDED.guess_away_score,
             guess_number = EXCLUDED.guess_number,
             updated_at = now()`,
          [
            input.bolaoId, ctx.user.id, input.guessOutcomeId ?? null,
            input.guessHomeScore ?? null, input.guessAwayScore ?? null, input.guessNumber ?? null,
          ],
        );
        return { ok: true };
      }),

    detail: protectedProcedure
      .input(z.object({ bolaoId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const b = await ctx.pool.query(
          `SELECT b.id, b.group_id, b.guess_type, b.created_by,
                  b.resolved_home_score, b.resolved_away_score, b.resolved_number, b.resolved_at,
                  m.id AS market_id, m.slug AS market_slug, m.title AS market_title,
                  m.status AS market_status, m.close_at,
                  r.resolved_outcome_id
             FROM boloes b
             JOIN markets m ON m.id = b.market_id
             LEFT JOIN resolutions r ON r.market_id = m.id
            WHERE b.id = $1`,
          [input.bolaoId],
        );
        if (!b.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
        const row = b.rows[0];
        await assertMember(ctx.pool, row.group_id as string, ctx.user.id);

        const guessType = row.guess_type as GuessType;
        const status = statusBolao(row.market_status as string, guessType, row.resolved_at as Date | null);
        const closeAtPassed = new Date(row.close_at as Date) <= new Date();

        const outcomes = await ctx.pool.query(
          `SELECT id, label FROM market_outcomes WHERE market_id = $1 ORDER BY display_order`,
          [row.market_id],
        );
        const minhaLinha = await ctx.pool.query(
          `SELECT guess_outcome_id, guess_home_score, guess_away_score, guess_number
             FROM bolao_palpites WHERE bolao_id = $1 AND user_id = $2`,
          [input.bolaoId, ctx.user.id],
        );

        const base = {
          id: row.id as string,
          groupId: row.group_id as string,
          guessType,
          marketId: row.market_id as string,
          marketSlug: row.market_slug as string,
          marketTitle: row.market_title as string,
          marketStatus: row.market_status as string,
          closeAt: row.close_at as Date,
          status,
          isCreator: row.created_by === ctx.user.id,
          outcomes: outcomes.rows.map((o) => ({ id: o.id as string, label: o.label as string })),
          myGuess: minhaLinha.rowCount
            ? {
                outcomeId: minhaLinha.rows[0].guess_outcome_id as string | null,
                homeScore: minhaLinha.rows[0].guess_home_score as number | null,
                awayScore: minhaLinha.rows[0].guess_away_score as number | null,
                number:
                  minhaLinha.rows[0].guess_number !== null ? Number(minhaLinha.rows[0].guess_number) : null,
              }
            : null,
        };

        // Palpite de outro membro só aparece depois do prazo — antes disso
        // vira cola, não previsão (só a contagem de quem já palpitou).
        if (!closeAtPassed) {
          const count = await ctx.pool.query(
            `SELECT count(*) FROM bolao_palpites WHERE bolao_id = $1`, [input.bolaoId]);
          return {
            ...base, palpitesVisiveis: false,
            palpiteCount: Number(count.rows[0].count), palpites: [], vencedores: [],
            myVindicationToken: null as string | null,
          };
        }

        const palpites = await ctx.pool.query(
          `SELECT bp.user_id, bp.guess_outcome_id, bp.guess_home_score, bp.guess_away_score, bp.guess_number,
                  u.handle, u.display_name, u.avatar_url
             FROM bolao_palpites bp JOIN users u ON u.id = bp.user_id
            WHERE bp.bolao_id = $1`,
          [input.bolaoId],
        );
        const palpitesMapeados = palpites.rows.map((p) => ({
          userId: p.user_id as string,
          handle: p.handle as string,
          displayName: p.display_name as string,
          avatarUrl: p.avatar_url as string | null,
          guessOutcomeId: p.guess_outcome_id as string | null,
          guessHomeScore: p.guess_home_score as number | null,
          guessAwayScore: p.guess_away_score as number | null,
          guessNumber: p.guess_number !== null ? Number(p.guess_number) : null,
        }));

        const vencedores =
          status === "RESOLVIDO"
            ? calcularVencedores(
                palpitesMapeados.map((p) => ({
                  userId: p.userId, guessOutcomeId: p.guessOutcomeId,
                  guessHomeScore: p.guessHomeScore, guessAwayScore: p.guessAwayScore,
                  guessNumber: p.guessNumber,
                })),
                guessType,
                {
                  outcomeId: row.resolved_outcome_id as string | null,
                  homeScore: row.resolved_home_score as number | null,
                  awayScore: row.resolved_away_score as number | null,
                  number: row.resolved_number !== null ? Number(row.resolved_number) : null,
                },
              )
            : [];

        // Card de vindicação de bolão: ao contrário do de mercado (criado
        // dentro da transação de trade.ts::resolveMarket), WINNER não tem
        // nenhuma mutation de "resolver" própria — o status vem só de
        // markets.status (ver domain/bolao.ts::statusBolao). Então em vez de
        // achar um ponto de escrita único, gera sob demanda aqui: idempotente
        // (ON CONFLICT), só pro usuário logado, só se ele venceu.
        let myVindicationToken: string | null = null;
        if (status === "RESOLVIDO" && vencedores.includes(ctx.user.id)) {
          const card = await ctx.pool.query(
            `INSERT INTO bolao_vindication_cards (bolao_id, user_id) VALUES ($1,$2)
             ON CONFLICT (bolao_id, user_id) DO UPDATE SET user_id = EXCLUDED.user_id
             RETURNING share_token`,
            [input.bolaoId, ctx.user.id],
          );
          myVindicationToken = card.rows[0].share_token as string;
        }

        return {
          ...base, palpitesVisiveis: true,
          palpiteCount: palpitesMapeados.length, palpites: palpitesMapeados, vencedores,
          myVindicationToken,
        };
      }),

    resolveExtra: protectedProcedure
      .input(z.object({
        bolaoId: z.string().uuid(),
        homeScore: z.number().int().optional(),
        awayScore: z.number().int().optional(),
        number: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const b = await ctx.pool.query(
          `SELECT b.created_by, b.guess_type, m.status AS market_status
             FROM boloes b JOIN markets m ON m.id = b.market_id
            WHERE b.id = $1`,
          [input.bolaoId],
        );
        if (!b.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
        const row = b.rows[0];
        if (row.created_by !== ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "só quem criou o bolão resolve" });
        if (row.market_status !== "RESOLVED")
          throw new TRPCError({ code: "BAD_REQUEST", message: "o mercado ainda não foi resolvido" });

        const guessType = row.guess_type as GuessType;
        if (guessType === "WINNER")
          throw new TRPCError({ code: "BAD_REQUEST", message: "bolão de 'quem ganha' resolve sozinho" });
        if (guessType === "SCORE" && (input.homeScore == null || input.awayScore == null))
          throw new TRPCError({ code: "BAD_REQUEST", message: "informe o placar completo" });
        if (guessType === "NUMBER" && input.number == null)
          throw new TRPCError({ code: "BAD_REQUEST", message: "informe um número" });

        await ctx.pool.query(
          `UPDATE boloes
              SET resolved_home_score = $2, resolved_away_score = $3, resolved_number = $4, resolved_at = now()
            WHERE id = $1`,
          [input.bolaoId, input.homeScore ?? null, input.awayScore ?? null, input.number ?? null],
        );
        return { ok: true };
      }),
  }),
});

export const groupsRouter = groupsSubRouter;
