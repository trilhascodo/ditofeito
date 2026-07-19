import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, resolverProcedure, adminProcedure } from "../trpc/trpc.js";

// Papéis que dá pra setar por aqui — SPONSOR fica de fora de propósito:
// precisa de sponsor_id junto (sponsor.linkUser cuida disso atomicamente,
// setRole sozinho deixaria a conta SPONSOR órfã sem patrocinador vinculado).
const ASSIGNABLE_ROLES = ["USER", "MODERATOR", "RESOLVER", "ADMIN"] as const;

export const moderationRouter = router({
  // ---- Diretório de usuários (busca por handle/e-mail/nome + ações) --------
  listUsers: adminProcedure
    .input(z.object({ search: z.string().trim().max(120).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const search = input?.search || null;
      const r = await ctx.pool.query(
        `SELECT u.id, u.handle, u.display_name, u.email, u.role, u.is_banned, u.created_at,
                u.sponsor_id,
                COALESCE((SELECT balance_after FROM point_ledger
                           WHERE user_id = u.id ORDER BY id DESC LIMIT 1), 0) AS balance,
                r.skill_score, r.resolved_count
           FROM users u
           LEFT JOIN user_reputation r ON r.user_id = u.id
          WHERE $1::text IS NULL
             OR u.handle ILIKE '%' || $1 || '%'
             OR u.email ILIKE '%' || $1 || '%'
             OR u.display_name ILIKE '%' || $1 || '%'
          ORDER BY u.created_at DESC
          LIMIT 100`,
        [search],
      );
      return r.rows.map((row) => ({
        id: row.id as string, handle: row.handle as string, displayName: row.display_name as string,
        email: row.email as string, role: row.role as string, isBanned: row.is_banned as boolean,
        createdAt: row.created_at as string, isSponsor: row.sponsor_id !== null,
        balance: Number(row.balance),
        skillScore: row.skill_score !== null ? Number(row.skill_score) : null,
        resolvedCount: row.resolved_count as number | null,
      }));
    }),

  unbanUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`UPDATE users SET is_banned = false, updated_at = now() WHERE id = $1`,
        [input.userId]);
      return { ok: true };
    }),

  setRole: adminProcedure
    .input(z.object({ userId: z.string().uuid(), role: z.enum(ASSIGNABLE_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id && input.role !== "ADMIN")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode tirar seu próprio acesso de admin" });
      await ctx.pool.query(`UPDATE users SET role = $2, updated_at = now() WHERE id = $1`,
        [input.userId, input.role]);
      return { ok: true };
    }),

  // Clusters de contas criadas do mesmo IP — sinalização pra revisão manual,
  // não bloqueia ninguém (IP compartilhado — casa/wifi/faculdade — é
  // falso-positivo esperado). Rotina diária do operador (plano-construcao.md).
  listSuspiciousAccounts: resolverProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT signup_ip,
              COUNT(*) AS total,
              json_agg(json_build_object(
                'id', id, 'handle', handle, 'email', email,
                'createdAt', created_at, 'isBanned', is_banned
              ) ORDER BY created_at) AS accounts
         FROM users
        WHERE signup_ip IS NOT NULL
        GROUP BY signup_ip
       HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 100`,
    );
    return r.rows.map((row) => ({
      signupIp: row.signup_ip as string,
      total: Number(row.total),
      accounts: row.accounts as Array<
        { id: string; handle: string; email: string; createdAt: string; isBanned: boolean }
      >,
    }));
  }),

  banUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`UPDATE users SET is_banned = true, updated_at = now() WHERE id = $1`,
        [input.userId]);
      return { ok: true };
    }),
});
