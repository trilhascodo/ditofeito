// ============================================================================
// trade.ts — Coração concorrente da plataforma
//
// Garantias:
//  1. Serialização por mercado: FOR UPDATE na linha do mercado. Todo trade no
//     mesmo mercado enfileira; mercados diferentes rodam em paralelo.
//  2. Serialização por usuário: FOR UPDATE na linha do usuário (saldo/ledger).
//  3. Ordem fixa de locks (mercado -> usuário) = zero deadlock entre trades.
//  4. Ledger hash-encadeado: entry_hash = sha256(prev || user || delta || reason || ts).
//  5. Snapshot de preços de TODOS os outcomes a cada trade (LMSR move todos).
//
// API (plugável em router tRPC; validação Zod na borda):
//   executeTrade  — BUY (gasta pontos) | SELL (vende shares)
//   resolveMarket — paga 1 ponto/share vencedora + grava reputação (Brier/skill)
//   voidMarket    — devolve cost_basis de todas as posições
// ============================================================================
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  lmsrPrices, tradeCost, sharesForPoints,
  brierScore, userImpliedProbs, skillDelta,
} from "@ditofeito/core";
import { notify } from "./notify.js";
import { sendTransactionalEmail } from "../lib/email.js";
import { APP_CONFIG } from "../config.js";

interface QueuedEmail { to: string; subject: string; html: string }

// Dispara DEPOIS que a transação já commitou (nunca dentro do BEGIN/COMMIT —
// e-mail é chamada de rede pro Resend, não pode segurar lock de linha nem
// derrubar a resolução se falhar). Cada envio tem catch próprio: um e-mail
// que falha não deveria afetar os outros.
async function flushEmailQueue(pool: Pool, queue: QueuedEmail[]): Promise<void> {
  for (const msg of queue) {
    await sendTransactionalEmail(pool, msg).catch((e) => console.error("[trade] envio de e-mail falhou", e));
  }
}

// ------------------------------- Config -------------------------------------
export const TRADE_CONFIG = {
  /** Exposição máxima (pontos gastos acumulados) por usuário por mercado.
   *  Anti-manipulação da fase de base pequena; subir conforme a liquidez real. */
  maxExposurePerMarket: 1000,
  /** Alerta POSICAO_DOMINANTE: um usuário com mais que esta fração das shares
   *  de um outcome gera flag para revisão (não bloqueia). */
  dominantShareFraction: 0.5,
} as const;

export interface TradeInput {
  userId: string;
  marketId: string;
  outcomeId: string;
  side: "BUY" | "SELL";
  /** BUY: pontos a gastar | SELL: shares a vender */
  amount: number;
}

export interface TradeResult {
  tradeId: string;
  shares: number;
  costPoints: number;        // >0 debitou | <0 creditou
  priceBefore: number;
  priceAfter: number;
  newBalance: number;
  flags: string[];           // ex.: ['POSICAO_DOMINANTE']
}

// ------------------------------ Ledger --------------------------------------
function entryHash(
  prevHash: string, userId: string, delta: string, reason: string, ts: string,
): string {
  return createHash("sha256")
    .update(`${prevHash}|${userId}|${delta}|${reason}|${ts}`)
    .digest("hex");
}

/** Apende no ledger do usuário. PRESSUPÕE lock FOR UPDATE já tomado no user. */
export async function appendLedger(
  c: PoolClient, userId: string, delta: number, reason: string,
  refType: string | null, refId: string | null,
): Promise<{ newBalance: number }> {
  const last = await c.query(
    `SELECT entry_hash, balance_after FROM point_ledger
      WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [userId]);
  const prevHash = last.rows[0]?.entry_hash ?? "GENESIS";
  const prevBalance = Number(last.rows[0]?.balance_after ?? 0);
  const newBalance = prevBalance + delta;
  if (newBalance < 0) throw new TradeError("SALDO_INSUFICIENTE",
    `Saldo ${prevBalance.toFixed(2)} insuficiente para débito de ${(-delta).toFixed(2)}`);

  const ts = (await c.query(`SELECT clock_timestamp()::text AS ts`)).rows[0].ts;
  const deltaStr = delta.toFixed(4);
  const hash = entryHash(prevHash, userId, deltaStr, reason, ts);
  await c.query(
    `INSERT INTO point_ledger
       (user_id, delta, balance_after, reason, ref_type, ref_id, prev_hash, entry_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz)`,
    [userId, deltaStr, newBalance.toFixed(4), reason, refType, refId, prevHash, hash, ts]);
  return { newBalance };
}

export class TradeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// ------------------------------ Trade ---------------------------------------
export async function executeTrade(pool: Pool, input: TradeInput): Promise<TradeResult> {
  if (!(input.amount > 0)) throw new TradeError("VALOR_INVALIDO", "amount deve ser > 0");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // LOCK 1: mercado — serializa todos os trades deste mercado
    const mkt = await c.query(
      `SELECT id, status, close_at, liquidity_b FROM markets
        WHERE id = $1 FOR UPDATE`, [input.marketId]);
    if (!mkt.rowCount) throw new TradeError("MERCADO_INEXISTENTE", "Mercado não encontrado");
    const m = mkt.rows[0];
    if (m.status !== "OPEN") throw new TradeError("MERCADO_FECHADO", `Status: ${m.status}`);
    if (new Date(m.close_at) <= new Date())
      throw new TradeError("MERCADO_ENCERRADO", "Prazo de negociação expirado");

    // LOCK 2: usuário — serializa o ledger deste usuário
    const usr = await c.query(
      `SELECT id, is_banned FROM users WHERE id = $1 FOR UPDATE`, [input.userId]);
    if (!usr.rowCount || usr.rows[0].is_banned)
      throw new TradeError("USUARIO_INVALIDO", "Usuário inexistente ou suspenso");

    // Estado LMSR (ordem estável por display_order p/ índice do vetor q)
    const out = await c.query(
      `SELECT id, q FROM market_outcomes WHERE market_id = $1
        ORDER BY display_order, id`, [input.marketId]);
    const q = out.rows.map((r) => Number(r.q));
    const idx = out.rows.findIndex((r) => r.id === input.outcomeId);
    if (idx < 0) throw new TradeError("OUTCOME_INVALIDO", "Outcome não pertence ao mercado");
    const b = Number(m.liquidity_b);

    // Shares e custo
    let shares: number;
    if (input.side === "BUY") {
      shares = sharesForPoints(q, b, idx, input.amount);
      if (shares <= 0) throw new TradeError("VALOR_INVALIDO", "Pontos insuficientes p/ 1 share");
    } else {
      const pos = await c.query(
        `SELECT shares FROM positions
          WHERE user_id=$1 AND market_id=$2 AND outcome_id=$3 FOR UPDATE`,
        [input.userId, input.marketId, input.outcomeId]);
      const owned = Number(pos.rows[0]?.shares ?? 0);
      if (owned < input.amount)
        throw new TradeError("SHARES_INSUFICIENTES", `Possui ${owned}, tentou vender ${input.amount}`);
      shares = -input.amount;
    }
    const { cost, pricesBefore, pricesAfter } = tradeCost(q, b, idx, shares);
    // cost > 0 no BUY (debita) | cost < 0 no SELL (credita |cost|)

    // Anti-manipulação: teto de exposição por mercado (só BUY)
    const flags: string[] = [];
    if (input.side === "BUY") {
      const exp = await c.query(
        `SELECT coalesce(sum(cost_basis),0) AS total FROM positions
          WHERE user_id=$1 AND market_id=$2`, [input.userId, input.marketId]);
      if (Number(exp.rows[0].total) + cost > TRADE_CONFIG.maxExposurePerMarket)
        throw new TradeError("LIMITE_EXPOSICAO",
          `Exposição máxima de ${TRADE_CONFIG.maxExposurePerMarket} pontos por mercado`);
    }

    // Ledger (débito/crédito) — TRADE_BUY debita, TRADE_SELL credita
    const reason = input.side === "BUY" ? "TRADE_BUY" : "TRADE_SELL";
    const { newBalance } = await appendLedger(
      c, input.userId, -cost, reason, "market", input.marketId);

    // Atualiza q do outcome negociado
    await c.query(
      `UPDATE market_outcomes SET q = q + $1 WHERE id = $2`,
      [shares.toFixed(6), input.outcomeId]);

    // Posição (upsert). SELL reduz cost_basis proporcionalmente às shares vendidas.
    if (input.side === "BUY") {
      await c.query(
        `INSERT INTO positions (user_id, market_id, outcome_id, shares, cost_basis, updated_at)
         VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (user_id, market_id, outcome_id) DO UPDATE SET
           shares = positions.shares + EXCLUDED.shares,
           cost_basis = positions.cost_basis + EXCLUDED.cost_basis,
           updated_at = now()`,
        [input.userId, input.marketId, input.outcomeId,
         shares.toFixed(6), cost.toFixed(4)]);
    } else {
      await c.query(
        `UPDATE positions SET
           cost_basis = cost_basis * (1 - $4::numeric / shares),
           shares     = shares - $4::numeric,
           updated_at = now()
         WHERE user_id=$1 AND market_id=$2 AND outcome_id=$3`,
        [input.userId, input.marketId, input.outcomeId, input.amount.toFixed(6)]);
    }

    // Trade + snapshots de TODOS os outcomes (LMSR move todos os preços)
    const t = await c.query(
      `INSERT INTO trades (market_id, outcome_id, user_id, side, shares, cost_points, price_before, price_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [input.marketId, input.outcomeId, input.userId, input.side,
       Math.abs(shares).toFixed(6), cost.toFixed(4),
       pricesBefore[idx].toFixed(6), pricesAfter[idx].toFixed(6)]);
    const snapTs = (await c.query(`SELECT clock_timestamp() AS ts`)).rows[0].ts;
    for (let i = 0; i < out.rows.length; i++) {
      await c.query(
        `INSERT INTO price_snapshots (market_id, outcome_id, price, ts)
         VALUES ($1,$2,$3,$4)`,
        [input.marketId, out.rows[i].id, pricesAfter[i].toFixed(6), snapTs]);
    }

    // Flag POSICAO_DOMINANTE (não bloqueia; alimenta fila de revisão)
    if (input.side === "BUY") {
      const tot = await c.query(
        `SELECT coalesce(sum(shares),0) AS total,
                coalesce((SELECT shares FROM positions
                  WHERE user_id=$1 AND market_id=$2 AND outcome_id=$3),0) AS mine
           FROM positions WHERE market_id=$2 AND outcome_id=$3`,
        [input.userId, input.marketId, input.outcomeId]);
      const { total, mine } = tot.rows[0];
      if (Number(total) > 0 && Number(mine) / Number(total) > TRADE_CONFIG.dominantShareFraction)
        flags.push("POSICAO_DOMINANTE");
    }

    await c.query("COMMIT");
    return {
      tradeId: t.rows[0].id, shares: Math.abs(shares), costPoints: cost,
      priceBefore: pricesBefore[idx], priceAfter: pricesAfter[idx],
      newBalance, flags,
    };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally { c.release(); }
}

// ---------------------------- Resolução --------------------------------------
export async function resolveMarket(
  pool: Pool,
  p: { marketId: string; winningOutcomeId: string; resolverUserId: string;
       justification: string; sourceUrl: string },
): Promise<{ payouts: number; totalPaid: number }> {
  const c = await pool.connect();
  const emailQueue: QueuedEmail[] = [];
  let txResult: { payouts: number; totalPaid: number };
  try {
    await c.query("BEGIN");
    const mkt = await c.query(
      `SELECT id, status, title, slug FROM markets WHERE id = $1 FOR UPDATE`, [p.marketId]);
    if (!mkt.rowCount) throw new TradeError("MERCADO_INEXISTENTE", "não encontrado");
    if (!["OPEN", "CLOSED"].includes(mkt.rows[0].status))
      throw new TradeError("STATUS_INVALIDO", `Mercado ${mkt.rows[0].status}`);

    // Preços finais (baseline p/ skill) e vencedor
    const out = await c.query(
      `SELECT id, q, label FROM market_outcomes WHERE market_id=$1 ORDER BY display_order, id`,
      [p.marketId]);
    const b = Number((await c.query(
      `SELECT liquidity_b FROM markets WHERE id=$1`, [p.marketId])).rows[0].liquidity_b);
    const finalPrices = lmsrPrices(out.rows.map((r) => Number(r.q)), b);
    const winIdx = out.rows.findIndex((r) => r.id === p.winningOutcomeId);
    if (winIdx < 0) throw new TradeError("OUTCOME_INVALIDO", "vencedor não pertence ao mercado");

    await c.query(
      `INSERT INTO resolutions (market_id, kind, resolved_outcome_id, justification, source_url, resolved_by)
       VALUES ($1,'RESOLVED',$2,$3,$4,$5)`,
      [p.marketId, p.winningOutcomeId, p.justification, p.sourceUrl, p.resolverUserId]);
    await c.query(`UPDATE markets SET status='RESOLVED' WHERE id=$1`, [p.marketId]);

    // Payout: 1 ponto por share vencedora (ordem estável de usuários p/ lock)
    const winners = await c.query(
      `SELECT user_id, shares FROM positions
        WHERE market_id=$1 AND outcome_id=$2 AND shares > 0
        ORDER BY user_id`, [p.marketId, p.winningOutcomeId]);
    let totalPaid = 0;
    for (const w of winners.rows) {
      await c.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [w.user_id]);
      const payout = Number(w.shares);
      await appendLedger(c, w.user_id, payout, "RESOLUTION_PAYOUT", "market", p.marketId);
      totalPaid += payout;
      // Card de vindicação — só pra quem acertou (é a prova pública de "eu
      // disse", não faz sentido pra quem perdeu). Idempotente: se resolveMarket
      // for chamado de novo pro mesmo mercado (não deveria, mas por garantia).
      await c.query(
        `INSERT INTO vindication_cards (user_id, market_id) VALUES ($1,$2)
         ON CONFLICT (user_id, market_id) DO NOTHING`,
        [w.user_id, p.marketId]);
    }

    // Mesma definição de "acertou" usada no payout e no card de vindicação —
    // shares>0 no outcome vencedor. Sequência usa isso, não Brier: é sobre
    // acertar a direção, não sobre calibração fina do preço de entrada.
    const winnerIds = new Set(winners.rows.map((w) => w.user_id as string));

    // Reputação: Brier do usuário (preço médio de entrada) vs Brier do mercado
    const holders = await c.query(
      `SELECT user_id,
              array_agg(outcome_id ORDER BY outcome_id) AS oids,
              array_agg(CASE WHEN shares>0 THEN cost_basis/shares END ORDER BY outcome_id) AS avg_px
         FROM positions WHERE market_id=$1 GROUP BY user_id ORDER BY user_id`,
      [p.marketId]);
    const outcomeOrder = out.rows.map((r) => r.id as string);
    for (const h of holders.rows) {
      const avgByOutcome: (number | null)[] = outcomeOrder.map((oid) => {
        const i = (h.oids as string[]).indexOf(oid);
        const v = i >= 0 ? h.avg_px[i] : null;
        return v === null || v === undefined ? null : Number(v);
      });
      const probs = userImpliedProbs(avgByOutcome, finalPrices);
      const { userBrier, marketBrier, delta } = skillDelta(probs, finalPrices, winIdx);
      const won = winnerIds.has(h.user_id as string);
      await c.query(
        `INSERT INTO reputation_events (user_id, market_id, brier, market_brier, skill_delta)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, market_id) DO NOTHING`,
        [h.user_id, p.marketId, userBrier.toFixed(6), marketBrier.toFixed(6), delta.toFixed(4)]);
      // Sequência de acerto — coluna existia desde o F0, nunca foi escrita
      // (todo mundo mostrava "0" pra sempre no perfil/ranking). Acertou:
      // +1; errou: zera. streak_best só sobe, nunca desce.
      await c.query(
        `INSERT INTO user_reputation AS ur
           (user_id, resolved_count, brier_sum, brier_mean, skill_score, streak_current, streak_best, updated_at)
         VALUES ($1, 1, $2, $2, $3, CASE WHEN $4 THEN 1 ELSE 0 END, CASE WHEN $4 THEN 1 ELSE 0 END, now())
         ON CONFLICT (user_id) DO UPDATE SET
           resolved_count = ur.resolved_count + 1,
           brier_sum  = ur.brier_sum + $2,
           brier_mean = (ur.brier_sum + $2) / (ur.resolved_count + 1),
           skill_score = ur.skill_score + $3,
           streak_current = CASE WHEN $4 THEN ur.streak_current + 1 ELSE 0 END,
           streak_best = GREATEST(ur.streak_best, CASE WHEN $4 THEN ur.streak_current + 1 ELSE 0 END),
           updated_at = now()`,
        [h.user_id, userBrier.toFixed(6), delta.toFixed(4), won],
      );
    }

    // Notifica quem tinha posição aberta — ganhador ou não, todo mundo que
    // arriscou pontos merece saber que o mercado resolveu (é o gatilho que
    // traz de volta sem precisar lembrar sozinho). E-mail além do sino: quem
    // não visita o site não vê o sino nunca.
    const winLabel = out.rows[winIdx].label as string;
    const title = mkt.rows[0].title as string;
    const slug = mkt.rows[0].slug as string;
    const marketUrl = `${APP_CONFIG.webOrigin}/m/${slug}`;
    const activeHolders = await c.query(
      `SELECT DISTINCT p.user_id, u.email, u.email_notifications
         FROM positions p JOIN users u ON u.id = p.user_id
        WHERE p.market_id = $1 AND p.shares > 0`, [p.marketId]);
    for (const row of activeHolders.rows) {
      const uid = row.user_id as string;
      const won = winnerIds.has(uid);
      const body = won
        ? `"${title}" resolveu: ${winLabel}. Você ganhou pontos — confira.`
        : `"${title}" resolveu: ${winLabel}. Não foi dessa vez.`;
      await notify(c, uid, "MARKET_RESOLVED", body, { marketId: p.marketId });
      if (row.email_notifications) {
        emailQueue.push({
          to: row.email as string,
          subject: `"${title}" resolveu — DitoFeito`,
          html: `<p>${body}</p><p><a href="${marketUrl}">${marketUrl}</a></p>`,
        });
      }
    }

    await c.query("COMMIT");
    txResult = { payouts: winners.rowCount ?? 0, totalPaid };
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  await flushEmailQueue(pool, emailQueue);
  return txResult;
}

// ---------------------------- Anulação ---------------------------------------
export async function voidMarket(
  pool: Pool,
  p: { marketId: string; resolverUserId: string; justification: string; sourceUrl: string },
): Promise<{ refunds: number }> {
  const c = await pool.connect();
  const emailQueue: QueuedEmail[] = [];
  let txResult: { refunds: number };
  try {
    await c.query("BEGIN");
    const mkt = await c.query(
      `SELECT status, title, slug FROM markets WHERE id=$1 FOR UPDATE`, [p.marketId]);
    if (!mkt.rowCount || !["OPEN", "CLOSED"].includes(mkt.rows[0].status))
      throw new TradeError("STATUS_INVALIDO", "mercado não anulável");
    await c.query(
      `INSERT INTO resolutions (market_id, kind, justification, source_url, resolved_by)
       VALUES ($1,'VOIDED',$2,$3,$4)`,
      [p.marketId, p.justification, p.sourceUrl, p.resolverUserId]);
    await c.query(`UPDATE markets SET status='VOIDED' WHERE id=$1`, [p.marketId]);
    const pos = await c.query(
      `SELECT p.user_id, sum(p.cost_basis) AS basis, u.email, u.email_notifications
         FROM positions p JOIN users u ON u.id = p.user_id
        WHERE p.market_id=$1 GROUP BY p.user_id, u.email, u.email_notifications
       HAVING sum(p.cost_basis) > 0
        ORDER BY p.user_id`, [p.marketId]);
    const title = mkt.rows[0].title as string;
    const marketUrl = `${APP_CONFIG.webOrigin}/m/${mkt.rows[0].slug as string}`;
    for (const r of pos.rows) {
      await c.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [r.user_id]);
      await appendLedger(c, r.user_id, Number(r.basis), "MARKET_VOIDED", "market", p.marketId);
      const body = `"${title}" foi anulado — seus pontos comprometidos foram devolvidos.`;
      await notify(c, r.user_id, "MARKET_VOIDED", body, { marketId: p.marketId });
      if (r.email_notifications) {
        emailQueue.push({
          to: r.email as string, subject: `"${title}" foi anulado — DitoFeito`,
          html: `<p>${body}</p><p><a href="${marketUrl}">${marketUrl}</a></p>`,
        });
      }
    }
    await c.query("COMMIT");
    txResult = { refunds: pos.rowCount ?? 0 };
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  await flushEmailQueue(pool, emailQueue);
  return txResult;
}

// --------------------- Auditoria do ledger (job/endpoint) --------------------
export async function verifyLedgerChain(pool: Pool, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT user_id, delta, reason, prev_hash, entry_hash, created_at::text AS ts
       FROM point_ledger WHERE user_id=$1 ORDER BY id`, [userId]);
  let prev = "GENESIS";
  for (const r of rows) {
    if (r.prev_hash !== prev) return false;
    const h = entryHash(prev, r.user_id, Number(r.delta).toFixed(4), r.reason, r.ts);
    if (h !== r.entry_hash) return false;
    prev = r.entry_hash;
  }
  return true;
}
