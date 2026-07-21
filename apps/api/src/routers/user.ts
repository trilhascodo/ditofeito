// ============================================================================
// user.ts — Saldo/reputação, posições e extrato do ledger do usuário logado.
// Alimenta a página de perfil da F1 (plano-construcao.md §3: "perfil próprio
// (posições + extrato do ledger)"). Auth em si (signup/login) fica em
// apps/api/src/http/auth.ts — HTTP puro, não tRPC.
// ============================================================================
import { z } from "zod";
import { lmsrPrices } from "@ditofeito/core";
import { router, protectedProcedure, publicProcedure } from "../trpc/trpc.js";
import {
  changePassword, requestEmailChange, updateProfile, deleteAccount,
} from "../domain/auth.js";
import { throwAsTRPC } from "../trpc/errors.js";

// Mínimo de previsões resolvidas pra entrar no ranking público — sem isso,
// 1 acerto de sorte já colocaria alguém em 1º lugar (skill_score de amostra
// pequena não é comparável ao de quem já resolveu dezenas).
const LEADERBOARD_MIN_RESOLVED = 5;

// Mesma regra do CHECK de users.handle (001_schema.sql) e do signupSchema.
const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export const userRouter = router({
  // Card de vindicação do próprio usuário pra um mercado (null se não ganhou
  // esse mercado, ou se ainda não resolveu) — token gerado em
  // trade.ts::resolveMarket, só existe pra quem acertou.
  myVindicationCard: protectedProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT share_token FROM vindication_cards WHERE user_id = $1 AND market_id = $2`,
        [ctx.user.id, input.marketId],
      );
      return r.rowCount ? { shareToken: r.rows[0].share_token as string } : null;
    }),


  me: protectedProcedure.query(async ({ ctx }) => {
    const bal = await ctx.pool.query(
      `SELECT balance_after FROM point_ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [ctx.user.id],
    );
    const rep = await ctx.pool.query(
      `SELECT resolved_count, brier_mean, skill_score, streak_current, streak_best
         FROM user_reputation WHERE user_id = $1`,
      [ctx.user.id],
    );
    const pref = await ctx.pool.query(
      `SELECT email, email_notifications, region_uf, region_city, share_location_on_trades,
              (password_hash IS NOT NULL) AS has_password
         FROM users WHERE id = $1`, [ctx.user.id],
    );
    return {
      ...ctx.user,
      email: pref.rows[0]?.email as string,
      hasPassword: pref.rows[0]?.has_password ?? false,
      emailNotifications: pref.rows[0]?.email_notifications ?? true,
      regionUf: pref.rows[0]?.region_uf ?? null,
      regionCity: pref.rows[0]?.region_city ?? null,
      shareLocationOnTrades: pref.rows[0]?.share_location_on_trades ?? false,
      balance: bal.rowCount ? Number(bal.rows[0].balance_after) : 0,
      reputation: rep.rowCount
        ? {
            resolvedCount: rep.rows[0].resolved_count as number,
            brierMean: rep.rows[0].brier_mean !== null ? Number(rep.rows[0].brier_mean) : null,
            skillScore: Number(rep.rows[0].skill_score),
            streakCurrent: rep.rows[0].streak_current as number,
            streakBest: rep.rows[0].streak_best as number,
          }
        : null,
    };
  }),

  // Opt-out de e-mail de notificação (resolução/anulação de mercado) — sino
  // no header continua funcionando independente disso, essa preferência é
  // só do canal por e-mail.
  setEmailNotifications: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE users SET email_notifications = $2, updated_at = now() WHERE id = $1`,
        [ctx.user.id, input.enabled],
      );
      return { ok: true };
    }),

  // Região autodeclarada (opcional, sem geo-IP) — base pra segmentar
  // patrocínio regional (sponsor.ts) e, depois, priorizar a grade de
  // mercados por região.
  setRegion: protectedProcedure
    .input(z.object({
      regionUf: z.string().length(2).optional(),
      regionCity: z.string().trim().max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE users SET region_uf = $2, region_city = $3, updated_at = now() WHERE id = $1`,
        [ctx.user.id, input.regionUf ?? null, input.regionCity?.trim() || null],
      );
      return { ok: true };
    }),

  // Opt-in pra anexar a UF (por geolocalização do dispositivo) em cada
  // previsão registrada — usado só como corroboração estatística agregada
  // do resultado, nunca exposto por usuário individual (ver trade.ts e
  // market.regionBreakdown). Front confirma a permissão do navegador antes
  // de ligar (useUfGeolocation.ts), então chegar aqui como true já significa
  // consentimento explícito e verificado.
  setShareLocationOnTrades: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE users SET share_location_on_trades = $2, updated_at = now() WHERE id = $1`,
        [ctx.user.id, input.enabled],
      );
      return { ok: true };
    }),

  // Nome de usuário/exibição — únicos campos de identidade que ainda não
  // tinham autoatendimento.
  updateProfile: protectedProcedure
    .input(z.object({
      handle: z.string().regex(HANDLE_PATTERN, "3–30 caracteres: a-z, 0-9, _").optional(),
      displayName: z.string().trim().min(1).max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await updateProfile(ctx.pool, ctx.user.id, input);
      } catch (e) { throwAsTRPC(e); }
      return { ok: true };
    }),

  // Troca de senha estando logado — currentPassword só é exigido se a conta
  // já tiver uma (conta só-Google pode "adicionar" senha direto).
  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().max(200).optional(),
      newPassword: z.string().min(8).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await changePassword(ctx.pool, ctx.user.id, input, ctx.sessionToken);
      } catch (e) { throwAsTRPC(e); }
      return { ok: true };
    }),

  // 1ª etapa da troca de e-mail — manda confirmação pro e-mail novo, só
  // aplica quando o link é clicado (rota HTTP /auth/confirm-email-change).
  requestEmailChange: protectedProcedure
    .input(z.object({
      newEmail: z.string().trim().toLowerCase().email(),
      password: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await requestEmailChange(ctx.pool, ctx.user.id, input);
      } catch (e) { throwAsTRPC(e); }
      return { ok: true };
    }),

  // Apagar = anonimizar (ver domain/auth.ts::deleteAccount e
  // 030_account_self_service.sql) — nunca some com comentários/previsões
  // já públicos, só some com o que identifica a pessoa.
  deleteAccount: protectedProcedure
    .input(z.object({ password: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteAccount(ctx.pool, ctx.user.id, input);
      } catch (e) { throwAsTRPC(e); }
      return { ok: true };
    }),

  myPositions: protectedProcedure.query(async ({ ctx }) => {
    const pos = await ctx.pool.query(
      `SELECT p.market_id, p.outcome_id, p.shares, p.cost_basis, p.updated_at,
              m.slug, m.title, m.status, m.liquidity_b
         FROM positions p
         JOIN markets m ON m.id = p.market_id
        WHERE p.user_id = $1 AND p.shares > 0
        ORDER BY p.updated_at DESC`,
      [ctx.user.id],
    );
    if (!pos.rowCount) return [];

    const marketIds = [...new Set(pos.rows.map((r) => r.market_id as string))];
    const out = await ctx.pool.query(
      `SELECT market_id, id, label, q, display_order FROM market_outcomes
        WHERE market_id = ANY($1) ORDER BY market_id, display_order, id`,
      [marketIds],
    );
    const byMarket = new Map<string, { id: string; label: string; q: number }[]>();
    for (const o of out.rows) {
      const arr = byMarket.get(o.market_id) ?? [];
      arr.push({ id: o.id, label: o.label, q: Number(o.q) });
      byMarket.set(o.market_id, arr);
    }

    return pos.rows.map((r) => {
      const outcomes = byMarket.get(r.market_id as string) ?? [];
      const prices = lmsrPrices(outcomes.map((o) => o.q), Number(r.liquidity_b));
      const idx = outcomes.findIndex((o) => o.id === r.outcome_id);
      return {
        marketSlug: r.slug as string, marketTitle: r.title as string, marketStatus: r.status as string,
        outcomeId: r.outcome_id as string, outcomeLabel: idx >= 0 ? outcomes[idx].label : null,
        shares: Number(r.shares), costBasis: Number(r.cost_basis),
        currentPrice: idx >= 0 ? prices[idx] : null,
      };
    });
  }),

  myLedger: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT id, delta, balance_after, reason, ref_type, ref_id, created_at
           FROM point_ledger WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
        [ctx.user.id, input?.limit ?? 50],
      );
      return r.rows;
    }),

  // Ranking público por skill_score — handle/reputação já são públicos por
  // natureza do produto (Termos.tsx §privacidade: "previsões, posições e
  // comentários"), então não expõe nada que não estivesse já implícito.
  // Filtra banidos e quem tem poucas previsões resolvidas (ver
  // LEADERBOARD_MIN_RESOLVED). Se o visitante estiver logado, também devolve
  // a própria posição no ranking (null se ainda não qualifica).
  leaderboard: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const top = await ctx.pool.query(
        `SELECT u.handle, u.display_name, u.avatar_url,
                r.resolved_count, r.brier_mean, r.skill_score, r.streak_current, r.streak_best,
                RANK() OVER (ORDER BY r.skill_score DESC) AS rank
           FROM user_reputation r
           JOIN users u ON u.id = r.user_id
          WHERE r.resolved_count >= $2 AND u.is_banned = false
          ORDER BY r.skill_score DESC, r.resolved_count DESC
          LIMIT $1`,
        [limit, LEADERBOARD_MIN_RESOLVED],
      );

      let myRank: number | null = null;
      if (ctx.user) {
        const mine = await ctx.pool.query(
          `SELECT rank FROM (
             SELECT r.user_id, RANK() OVER (ORDER BY r.skill_score DESC) AS rank
               FROM user_reputation r JOIN users u ON u.id = r.user_id
              WHERE r.resolved_count >= $2 AND u.is_banned = false
           ) t WHERE user_id = $1`,
          [ctx.user.id, LEADERBOARD_MIN_RESOLVED],
        );
        myRank = mine.rowCount ? Number(mine.rows[0].rank) : null;
      }

      return {
        minResolved: LEADERBOARD_MIN_RESOLVED,
        myRank,
        rows: top.rows.map((row) => ({
          rank: Number(row.rank),
          handle: row.handle as string,
          displayName: row.display_name as string,
          avatarUrl: row.avatar_url as string | null,
          resolvedCount: row.resolved_count as number,
          brierMean: row.brier_mean !== null ? Number(row.brier_mean) : null,
          skillScore: Number(row.skill_score),
          streakCurrent: row.streak_current as number,
          streakBest: row.streak_best as number,
        })),
      };
    }),
});
