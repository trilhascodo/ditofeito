import { z } from "zod";
import { router, resolverProcedure, adminProcedure } from "../trpc/trpc.js";

export const moderationRouter = router({
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
