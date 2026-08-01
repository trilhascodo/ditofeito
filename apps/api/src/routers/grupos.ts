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
import { appendLedger } from "../domain/trade.js";
import { notify } from "../domain/notify.js";
import { sendTransactionalEmail } from "../lib/email.js";

// Mesmo teto de comments.ts (COMMENT_RATE_LIMIT) — mural de grupo é bem
// menor em volume (poucos membros vs. mercado público), mas o risco de
// spam/script é o mesmo tipo de mutation.
const POST_RATE_LIMIT = { max: 5, windowMs: 60_000 };

// Pontos não-conversíveis (mesma moeda do SIGNUP_BONUS) — modestos de
// propósito, é reputação, não incentivo financeiro.
const REFERRAL_BONUS = { referrerPoints: 100, joineePoints: 50 };

async function assertMember(pool: Pool, groupId: string, userId: string): Promise<void> {
  const r = await pool.query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  );
  if (!r.rowCount) throw new TRPCError({ code: "FORBIDDEN", message: "você não é membro deste grupo" });
}

const guessTypeSchema = z.enum(["WINNER", "SCORE", "NUMBER"]);

// Bolão sobre mercado curado (comportamento original) OU sobre evento
// próprio do grupo (custom, sem mercado por trás — ver
// migrations/036_bolao_custom.sql). outcomes só é usado/exigido quando
// guessType === "WINNER" — checado no corpo da mutation, não dá pra
// expressar isso no discriminatedUnion sem duplicar o schema por guessType.
const bolaoCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("MARKET"),
    groupId: z.string().uuid(), marketId: z.string().uuid(), guessType: guessTypeSchema,
  }),
  z.object({
    kind: z.literal("CUSTOM"),
    groupId: z.string().uuid(), guessType: guessTypeSchema,
    title: z.string().trim().min(1).max(200),
    criteria: z.string().trim().min(1).max(1000),
    closeAt: z.string().datetime(),
    outcomes: z.array(z.string().trim().min(1).max(80)).min(2).max(10).optional(),
  }),
]);

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
      const client = await ctx.pool.connect();
      let queuedEmail: { to: string; subject: string; html: string } | null = null;
      let result: { id: string; name: string };
      try {
        await client.query("BEGIN");
        const g = await client.query(
          `SELECT id, name, created_by FROM groups WHERE invite_code = $1 FOR UPDATE`,
          [input.code],
        );
        if (!g.rowCount) throw new TRPCError({ code: "NOT_FOUND", message: "código de convite inválido" });
        const groupId = g.rows[0].id as string;
        const groupName = g.rows[0].name as string;
        const ownerId = g.rows[0].created_by as string;

        // ON CONFLICT DO NOTHING + RETURNING: rowCount 0 = já era membro
        // (reabriu o link de convite) — nesse caso não dá bônus de novo nem
        // notifica o dono outra vez.
        const ins = await client.query(
          `INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING RETURNING user_id`,
          [groupId, ctx.user.id],
        );

        if (ins.rowCount && ownerId !== ctx.user.id) {
          // Lock em ordem estável (menor id primeiro) nos dois usuários
          // envolvidos — appendLedger pressupõe lock já tomado (ver
          // comentário em domain/trade.ts), e aqui são dois usuários já
          // existentes (ordem fixa evita deadlock com outra transação que
          // toque os mesmos dois em ordem inversa).
          const ids = [ownerId, ctx.user.id].sort();
          const users = await client.query(
            `SELECT id, email, email_notifications FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
            [ids],
          );
          const owner = users.rows.find((u) => u.id === ownerId);

          await appendLedger(client, ownerId, REFERRAL_BONUS.referrerPoints, "REFERRAL_BONUS", "group", groupId);
          await appendLedger(client, ctx.user.id, REFERRAL_BONUS.joineePoints, "GROUP_JOIN_BONUS", "group", groupId);

          const body = `${ctx.user.displayName} entrou no seu grupo "${groupName}" pelo seu convite — +${REFERRAL_BONUS.referrerPoints} pontos.`;
          await notify(client, ownerId, "GROUP_JOINED", body, { groupId });

          if (owner?.email_notifications) {
            queuedEmail = {
              to: owner.email as string,
              subject: "Alguém entrou no seu grupo — DitoFeito",
              html: `<p>${body}</p>`,
            };
          }
        }

        await client.query("COMMIT");
        result = { id: groupId, name: groupName };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      // E-mail só depois do COMMIT + client liberado (nunca dentro da
      // transação — chamada de rede não pode segurar lock de linha), mesmo
      // princípio de flushEmailQueue em domain/trade.ts.
      if (queuedEmail) {
        sendTransactionalEmail(ctx.pool, queuedEmail)
          .catch((e) => console.error("[grupos] envio de e-mail de indicação falhou", e));
      }
      return result;
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
                   LEFT JOIN markets m ON m.id = b.market_id
                  WHERE b.group_id = g.id
                    AND (m.status = 'OPEN' OR (b.market_id IS NULL AND b.custom_close_at > now()))
                 ) AS active_boloes_count
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
        `SELECT b.id, b.guess_type, b.resolved_at, b.market_id,
                b.custom_title, b.custom_close_at,
                m.title AS market_title, m.status AS market_status, m.close_at,
                (SELECT count(*) FROM bolao_palpites bp WHERE bp.bolao_id = b.id) AS palpite_count,
                EXISTS(
                  SELECT 1 FROM bolao_palpites bp2 WHERE bp2.bolao_id = b.id AND bp2.user_id = $2
                ) AS has_my_guess
           FROM boloes b LEFT JOIN markets m ON m.id = b.market_id
          WHERE b.group_id = $1
          ORDER BY b.created_at DESC`,
        [input.groupId, ctx.user.id],
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
        boloes: boloes.rows.map((b) => {
          const isCustom = b.market_id === null;
          return {
            id: b.id as string,
            guessType: b.guess_type as GuessType,
            status: statusBolao(
              isCustom ? null : (b.market_status as string), b.guess_type as GuessType,
              b.resolved_at as Date | null, isCustom ? (b.custom_close_at as Date) : undefined,
            ),
            marketId: b.market_id as string | null,
            marketTitle: (isCustom ? b.custom_title : b.market_title) as string,
            marketStatus: isCustom ? null : (b.market_status as string),
            closeAt: (isCustom ? b.custom_close_at : b.close_at) as Date,
            palpiteCount: Number(b.palpite_count),
            hasMyGuess: b.has_my_guess as boolean,
          };
        }),
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
      .input(bolaoCreateSchema)
      .mutation(async ({ ctx, input }) => {
        await assertMember(ctx.pool, input.groupId, ctx.user.id);

        if (input.kind === "MARKET") {
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
        }

        // kind === "CUSTOM" — evento que o próprio grupo definiu, sem
        // mercado curado por trás (ver migrations/036_bolao_custom.sql).
        if (new Date(input.closeAt) <= new Date())
          throw new TRPCError({ code: "BAD_REQUEST", message: "o prazo precisa ser no futuro" });
        if (input.guessType === "WINNER" && (!input.outcomes || input.outcomes.length < 2))
          throw new TRPCError({ code: "BAD_REQUEST", message: "informe pelo menos 2 opções" });

        const client = await ctx.pool.connect();
        try {
          await client.query("BEGIN");
          const r = await client.query(
            `INSERT INTO boloes (group_id, created_by, guess_type, custom_title, custom_criteria, custom_close_at)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [input.groupId, ctx.user.id, input.guessType, input.title, input.criteria, input.closeAt],
          );
          const bolaoId = r.rows[0].id as string;
          if (input.guessType === "WINNER") {
            for (const [i, label] of input.outcomes!.entries()) {
              await client.query(
                `INSERT INTO bolao_custom_outcomes (bolao_id, label, display_order) VALUES ($1,$2,$3)`,
                [bolaoId, label, i],
              );
            }
          }
          await client.query("COMMIT");
          return { id: bolaoId };
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
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
          `SELECT b.group_id, b.guess_type, b.market_id, b.custom_close_at,
                  m.status AS market_status, m.close_at
             FROM boloes b LEFT JOIN markets m ON m.id = b.market_id
            WHERE b.id = $1`,
          [input.bolaoId],
        );
        if (!b.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
        const row = b.rows[0];
        await assertMember(ctx.pool, row.group_id as string, ctx.user.id);

        const isCustom = row.market_id === null;
        const isOpen = isCustom
          ? new Date(row.custom_close_at as Date) > new Date()
          : row.market_status === "OPEN" && new Date(row.close_at as Date) > new Date();
        if (!isOpen) throw new TRPCError({ code: "BAD_REQUEST", message: "prazo de palpite encerrado" });

        const guessType = row.guess_type as GuessType;
        if (guessType === "WINNER") {
          if (!input.guessOutcomeId) throw new TRPCError({ code: "BAD_REQUEST", message: "escolha um resultado" });
          // Sem FK única cobrindo os dois casos (ver migrations/036_bolao_custom.sql),
          // valida na aplicação que o outcome pertence ao conjunto certo.
          const validOutcome = isCustom
            ? await ctx.pool.query(
                `SELECT 1 FROM bolao_custom_outcomes WHERE id = $1 AND bolao_id = $2`,
                [input.guessOutcomeId, input.bolaoId],
              )
            : await ctx.pool.query(
                `SELECT 1 FROM market_outcomes WHERE id = $1 AND market_id = $2`,
                [input.guessOutcomeId, row.market_id],
              );
          if (!validOutcome.rowCount)
            throw new TRPCError({ code: "BAD_REQUEST", message: "resultado inválido pra esse bolão" });
        }
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
                  b.market_id, b.custom_title, b.custom_criteria, b.custom_close_at,
                  b.resolved_custom_outcome_id,
                  m.slug AS market_slug, m.title AS market_title,
                  m.status AS market_status, m.close_at,
                  r.resolved_outcome_id
             FROM boloes b
             LEFT JOIN markets m ON m.id = b.market_id
             LEFT JOIN resolutions r ON r.market_id = m.id
            WHERE b.id = $1`,
          [input.bolaoId],
        );
        if (!b.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
        const row = b.rows[0];
        await assertMember(ctx.pool, row.group_id as string, ctx.user.id);

        const isCustom = row.market_id === null;
        const guessType = row.guess_type as GuessType;
        const effectiveTitle = isCustom ? (row.custom_title as string) : (row.market_title as string);
        const effectiveCloseAt = isCustom ? (row.custom_close_at as Date) : (row.close_at as Date);
        const status = statusBolao(
          isCustom ? null : (row.market_status as string), guessType, row.resolved_at as Date | null,
          isCustom ? (row.custom_close_at as Date) : undefined,
        );
        const closeAtPassed = new Date(effectiveCloseAt) <= new Date();

        const outcomes = isCustom
          ? await ctx.pool.query(
              `SELECT id, label FROM bolao_custom_outcomes WHERE bolao_id = $1 ORDER BY display_order`,
              [input.bolaoId],
            )
          : await ctx.pool.query(
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
          isCustom,
          criteria: isCustom ? (row.custom_criteria as string) : null,
          marketId: row.market_id as string | null,
          marketSlug: isCustom ? null : (row.market_slug as string),
          marketTitle: effectiveTitle,
          marketStatus: isCustom ? null : (row.market_status as string),
          closeAt: effectiveCloseAt,
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
                  outcomeId: (isCustom ? row.resolved_custom_outcome_id : row.resolved_outcome_id) as string | null,
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
        customOutcomeId: z.string().uuid().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const b = await ctx.pool.query(
          `SELECT b.created_by, b.guess_type, b.market_id, b.custom_close_at, m.status AS market_status
             FROM boloes b LEFT JOIN markets m ON m.id = b.market_id
            WHERE b.id = $1`,
          [input.bolaoId],
        );
        if (!b.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
        const row = b.rows[0];
        if (row.created_by !== ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "só quem criou o bolão resolve" });

        const guessType = row.guess_type as GuessType;
        const isCustom = row.market_id === null;

        if (isCustom) {
          // Sem mercado por trás, TODO guessType (inclusive WINNER) precisa
          // de resolução manual — nada resolve sozinho.
          if (new Date(row.custom_close_at as Date) > new Date())
            throw new TRPCError({ code: "BAD_REQUEST", message: "o prazo de palpite ainda não encerrou" });
          if (guessType === "WINNER") {
            if (!input.customOutcomeId)
              throw new TRPCError({ code: "BAD_REQUEST", message: "escolha um resultado" });
            const valid = await ctx.pool.query(
              `SELECT 1 FROM bolao_custom_outcomes WHERE id = $1 AND bolao_id = $2`,
              [input.customOutcomeId, input.bolaoId],
            );
            if (!valid.rowCount) throw new TRPCError({ code: "BAD_REQUEST", message: "resultado inválido" });
          }
          if (guessType === "SCORE" && (input.homeScore == null || input.awayScore == null))
            throw new TRPCError({ code: "BAD_REQUEST", message: "informe o placar completo" });
          if (guessType === "NUMBER" && input.number == null)
            throw new TRPCError({ code: "BAD_REQUEST", message: "informe um número" });

          await ctx.pool.query(
            `UPDATE boloes
                SET resolved_home_score = $2, resolved_away_score = $3, resolved_number = $4,
                    resolved_custom_outcome_id = $5, resolved_at = now()
              WHERE id = $1`,
            [input.bolaoId, input.homeScore ?? null, input.awayScore ?? null, input.number ?? null,
              input.customOutcomeId ?? null],
          );
          return { ok: true };
        }

        if (row.market_status !== "RESOLVED")
          throw new TRPCError({ code: "BAD_REQUEST", message: "o mercado ainda não foi resolvido" });
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
