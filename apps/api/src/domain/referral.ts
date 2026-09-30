// ============================================================================
// referral.ts — "Traga gente, ganhe pontos" (migrations/047_referral_rewards.sql)
//
// Pontos não-conversíveis pra quem traz audiência pelo link pessoal ?ref=.
// Nunca por clique em anúncio (estragaria a métrica do patrocinador) e nunca
// dinheiro. Dois créditos:
//   REF_VISIT  — visitantes únicos do dia, pago pelo job noturno.
//   REF_SIGNUP — cadastro indicado, pago quando o novo usuário ATIVA: CPF
//                confirmado (1 conta por pessoa) + ao menos 1 palpite.
// ============================================================================
import type { Pool } from "pg";
import { appendLedger } from "./trade.js";
import { notify } from "./notify.js";

export const REFERRAL_CONFIG = {
  pointsPerVisitor: 2,
  maxVisitorsPerDay: 50,
  pointsPerSignup: 100,
  maxSignupsPerMonth: 20,
  /** Janela do "primeiro link" guardado no navegador (web/src/lib/attribution.ts). */
  attributionDays: 30,
} as const;

const TZ = "America/Sao_Paulo";
export const REF_CODE_PATTERN = /^[a-z0-9]{6,12}$/;

/** Código ?ref= -> id de quem indicou (null se inválido, inexistente ou banido). */
export async function resolveRefCode(pool: Pool, code: string | undefined | null): Promise<string | null> {
  if (!code || !REF_CODE_PATTERN.test(code)) return null;
  const r = await pool.query(`SELECT id FROM users WHERE ref_code = $1 AND NOT is_banned`, [code]);
  return (r.rows[0]?.id as string | undefined) ?? null;
}

/**
 * Paga REF_SIGNUP se o usuário indicado acabou de cumprir a ativação.
 * Idempotente e barato quando não há nada a fazer — chamado depois de cada
 * palpite (trade e bolão) e da confirmação de CPF. Nunca deveria derrubar o
 * fluxo principal: quem chama captura o erro.
 */
export async function tryActivateReferral(pool: Pool, inviteeId: string): Promise<void> {
  const pre = await pool.query(
    `SELECT referred_by FROM users
      WHERE id = $1 AND referred_by IS NOT NULL AND referral_activated_at IS NULL AND cpf IS NOT NULL`,
    [inviteeId],
  );
  if (!pre.rowCount) return;
  const referrerId = pre.rows[0].referred_by as string;

  const c = await pool.connect();
  let notifyBody: string | null = null;
  try {
    await c.query("BEGIN");
    // Lock em ordem estável nos dois usuários (mesmo padrão de
    // grupos.ts::joinByCode) — appendLedger pressupõe lock já tomado.
    const users = await c.query(
      `SELECT id, display_name, is_banned, cpf, referral_activated_at FROM users
        WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [[inviteeId, referrerId]],
    );
    const invitee = users.rows.find((u) => u.id === inviteeId);
    const referrer = users.rows.find((u) => u.id === referrerId);
    if (!invitee || !referrer || invitee.referral_activated_at || !invitee.cpf) {
      await c.query("ROLLBACK");
      return;
    }

    const palpitou = await c.query(
      `SELECT EXISTS (SELECT 1 FROM trades WHERE user_id = $1)
           OR EXISTS (SELECT 1 FROM bolao_palpites WHERE user_id = $1) AS ok`,
      [inviteeId],
    );
    if (!palpitou.rows[0].ok) {
      await c.query("ROLLBACK");
      return;
    }

    // Marca ativado mesmo sem pagar (teto do mês, indicador banido) — senão
    // toda ação futura do convidado tentaria de novo.
    await c.query(`UPDATE users SET referral_activated_at = now() WHERE id = $1`, [inviteeId]);

    const month = await c.query(
      `SELECT count(*)::int AS n FROM referral_rewards
        WHERE user_id = $1 AND kind = 'SIGNUP'
          AND date_trunc('month', created_at AT TIME ZONE '${TZ}') = date_trunc('month', now() AT TIME ZONE '${TZ}')`,
      [referrerId],
    );
    if (!referrer.is_banned && month.rows[0].n < REFERRAL_CONFIG.maxSignupsPerMonth) {
      const ins = await c.query(
        `INSERT INTO referral_rewards (user_id, kind, invitee_id, quantity, points)
         VALUES ($1, 'SIGNUP', $2, 1, $3) ON CONFLICT DO NOTHING RETURNING id`,
        [referrerId, inviteeId, REFERRAL_CONFIG.pointsPerSignup],
      );
      if (ins.rowCount) {
        await appendLedger(c, referrerId, REFERRAL_CONFIG.pointsPerSignup, "REF_SIGNUP", "user", inviteeId);
        notifyBody = `${invitee.display_name} chegou pelo seu link e fez o primeiro palpite — +${REFERRAL_CONFIG.pointsPerSignup} pontos.`;
        await notify(c, referrerId, "REFERRAL_ACTIVATED", notifyBody);
      }
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Dispara tryActivateReferral sem nunca propagar erro pro fluxo principal. */
export function activateReferralInBackground(pool: Pool, inviteeId: string): void {
  tryActivateReferral(pool, inviteeId).catch((e) =>
    console.error("[referral] falha ao ativar indicação", inviteeId, e));
}

/**
 * Credita REF_VISIT de um dia (default: ontem, horário de Brasília).
 * Idempotente por (usuário, dia) — rodar duas vezes não paga em dobro.
 */
export async function creditReferralVisits(
  pool: Pool, day?: string,
): Promise<{ day: string; credited: number; points: number }> {
  const d = day ?? (await pool.query(
    `SELECT ((now() AT TIME ZONE '${TZ}')::date - 1)::text AS d`)).rows[0].d as string;

  const r = await pool.query(
    `SELECT pv.ref_user_id, count(DISTINCT pv.visitor_hash)::int AS n
       FROM page_views pv
      WHERE pv.ref_user_id IS NOT NULL
        AND (pv.created_at AT TIME ZONE '${TZ}')::date = $1::date
      GROUP BY pv.ref_user_id`,
    [d],
  );

  let credited = 0;
  let total = 0;
  for (const row of r.rows) {
    const userId = row.ref_user_id as string;
    const visitors = Math.min(Number(row.n), REFERRAL_CONFIG.maxVisitorsPerDay);
    const points = visitors * REFERRAL_CONFIG.pointsPerVisitor;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const u = await c.query(`SELECT is_banned FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (!u.rowCount || u.rows[0].is_banned) {
        await c.query("ROLLBACK");
        continue;
      }
      const ins = await c.query(
        `INSERT INTO referral_rewards (user_id, kind, day, quantity, points)
         VALUES ($1, 'VISIT', $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
        [userId, d, visitors, points],
      );
      if (ins.rowCount) {
        await appendLedger(c, userId, points, "REF_VISIT", null, null);
        credited++;
        total += points;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      console.error("[referral] falha ao creditar visitas", userId, d, e);
    } finally {
      c.release();
    }
  }
  return { day: d, credited, points: total };
}
