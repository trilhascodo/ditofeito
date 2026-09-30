// ============================================================================
// referral.ts — link pessoal ?ref= e o painel "Seu link" do perfil (047).
// Regras de crédito moram em domain/referral.ts.
// ============================================================================
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc/trpc.js";
import { REFERRAL_CONFIG } from "../domain/referral.js";

const TZ = "America/Sao_Paulo";

export const referralRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT u.ref_code,
              (SELECT count(DISTINCT visitor_hash)::int FROM page_views
                WHERE ref_user_id = u.id
                  AND (created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date) AS visitors_today,
              (SELECT coalesce(sum(quantity), 0)::int FROM referral_rewards
                WHERE user_id = u.id AND kind = 'VISIT'
                  AND date_trunc('month', day) = date_trunc('month', (now() AT TIME ZONE '${TZ}')::date)) AS visitors_month,
              (SELECT count(*)::int FROM users i
                WHERE i.referred_by = u.id AND i.referral_activated_at IS NULL) AS signups_pending,
              (SELECT count(*)::int FROM referral_rewards
                WHERE user_id = u.id AND kind = 'SIGNUP') AS signups_activated,
              (SELECT coalesce(sum(points), 0)::int FROM referral_rewards WHERE user_id = u.id) AS points_total
         FROM users u WHERE u.id = $1`,
      [ctx.user.id],
    );
    const row = r.rows[0];
    return {
      refCode: row.ref_code as string,
      visitorsToday: Math.min(Number(row.visitors_today), REFERRAL_CONFIG.maxVisitorsPerDay),
      visitorsMonth: Number(row.visitors_month),
      signupsPending: Number(row.signups_pending),
      signupsActivated: Number(row.signups_activated),
      pointsTotal: Number(row.points_total),
      config: REFERRAL_CONFIG,
    };
  }),

  // Admin > Audiência: quem mais trouxe gente — e onde olhar primeiro se
  // alguém estiver forjando visita (banir em Admin > Usuários corta créditos
  // futuros; domain/referral.ts ignora indicador banido).
  topReferrers: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const r = await ctx.pool.query(
        `SELECT u.id, u.handle, u.display_name, u.is_banned,
                coalesce(sum(rr.quantity) FILTER (WHERE rr.kind = 'VISIT'), 0)::int AS visitors,
                count(*) FILTER (WHERE rr.kind = 'SIGNUP')::int AS signups,
                coalesce(sum(rr.points), 0)::int AS points
           FROM referral_rewards rr JOIN users u ON u.id = rr.user_id
          WHERE rr.created_at > now() - ($1 || ' days')::interval
          GROUP BY u.id
          ORDER BY points DESC
          LIMIT 20`,
        [days],
      );
      return r.rows.map((row) => ({
        userId: row.id as string, handle: row.handle as string, displayName: row.display_name as string,
        isBanned: row.is_banned as boolean, visitors: Number(row.visitors),
        signups: Number(row.signups), points: Number(row.points),
      }));
    }),
});
