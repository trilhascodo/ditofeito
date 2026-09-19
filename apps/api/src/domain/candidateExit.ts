// ============================================================================
// candidateExit.ts — o que acontece com os mercados quando um candidato sai da
// disputa (indeferido, renunciou, faleceu, não registrou).
//
// Compartilhado entre a tela do admin (candidate.updateStatus) e a
// sincronização com o TSE (jobs/tseSync.ts). Roda DENTRO da transação de quem
// chama (PoolClient): a sync aplica dezenas de saídas num commit só, e o modo
// simulação desfaz tudo com ROLLBACK. Anular mercado publicado (voidMarket)
// abre a própria transação e manda e-mail — por isso não acontece aqui: volta
// em `toVoid` pra quem chama anular DEPOIS do commit.
// ============================================================================
import type { PoolClient } from "pg";

export const EXIT_STATUSES = new Set(["INDEFERIDO", "RENUNCIOU", "FALECIDO", "NAO_REGISTROU"]);

export interface ExitEffects {
  /** MULTI "quem vence" de onde a linha do candidato saiu (ninguém tinha apostado nele). */
  removedFromMarkets: string[];
  /** "será eleito?" ainda em rascunho — nunca foi público, só some. */
  deletedDrafts: string[];
  /** "será eleito?" publicado — quem chama anula com voidMarket após o commit. */
  toVoid: { id: string; slug: string }[];
  /** MULTI em que já há aposta nele — fica pro admin decidir. */
  skippedMarkets: string[];
}

// Tira o candidato de um MULTI quando ninguém tocou nele: sem trade, sem
// posição, sem palpite de bolão, sem resolução. Nesse caso não há aposta de
// ninguém pra proteger — o outcome é só uma linha errada. LMSR renormaliza os
// preços dos outros sozinho (a massa dele se redistribui), o que é o certo:
// quem está fora da disputa não tem chance. Com qualquer aposta nele, devolve
// false (anular o MULTI inteiro puniria quem apostou nos outros candidatos).
async function removeUntouchedOutcome(c: PoolClient, marketId: string, candidateId: string): Promise<boolean> {
  // Mesmo lock do executeTrade (domain/trade.ts) — nenhum trade entra no meio.
  const m = await c.query(`SELECT status FROM markets WHERE id = $1 FOR UPDATE`, [marketId]);
  if (!m.rowCount || !["DRAFT", "OPEN", "CLOSED"].includes(m.rows[0].status as string)) return false;
  const o = await c.query(
    `SELECT id FROM market_outcomes WHERE market_id = $1 AND candidate_id = $2`, [marketId, candidateId]);
  if (!o.rowCount) return true;
  const outcomeId = o.rows[0].id as string;
  const used = await c.query(
    `SELECT EXISTS (SELECT 1 FROM trades WHERE outcome_id = $1)
         OR EXISTS (SELECT 1 FROM positions WHERE outcome_id = $1 AND shares > 0)
         OR EXISTS (SELECT 1 FROM bolao_palpites WHERE guess_outcome_id = $1)
         OR EXISTS (SELECT 1 FROM resolutions WHERE resolved_outcome_id = $1) AS used`,
    [outcomeId]);
  if (used.rows[0].used) return false;
  await c.query(`DELETE FROM price_snapshots WHERE outcome_id = $1`, [outcomeId]);
  await c.query(`DELETE FROM positions WHERE outcome_id = $1`, [outcomeId]);
  await c.query(`DELETE FROM market_outcomes WHERE id = $1`, [outcomeId]);
  return true;
}

/** Aplica os efeitos de saída nos mercados do candidato. Não muda o status
 *  do candidato (quem chama já fez isso) e não anula nada publicado (ver
 *  `toVoid`). Pressupõe transação aberta em `c`. */
export async function applyExitToMarkets(c: PoolClient, candidateId: string): Promise<ExitEffects> {
  const fx: ExitEffects = { removedFromMarkets: [], deletedDrafts: [], toVoid: [], skippedMarkets: [] };
  const markets = await c.query(
    `SELECT m.id, m.slug, m.status,
            (SELECT count(*) FROM market_outcomes mo2
               WHERE mo2.market_id = m.id AND mo2.candidate_id IS NOT NULL) AS candidate_outcomes
       FROM market_outcomes mo JOIN markets m ON m.id = mo.market_id
      WHERE mo.candidate_id = $1`,
    [candidateId],
  );
  for (const row of markets.rows) {
    const id = row.id as string;
    const slug = row.slug as string;
    if (Number(row.candidate_outcomes) > 1) {
      if (await removeUntouchedOutcome(c, id, candidateId)) fx.removedFromMarkets.push(slug);
      else fx.skippedMarkets.push(slug);
    } else if (row.status === "DRAFT") {
      // Patrocínio pode ter sido vinculado ao rascunho — sem cascade no
      // schema (RESTRICT), mesmo cuidado de market.remove.
      await c.query(`DELETE FROM sponsorships WHERE market_id = $1`, [id]);
      await c.query(`DELETE FROM markets WHERE id = $1 AND status = 'DRAFT'`, [id]);
      fx.deletedDrafts.push(slug);
    } else if (["OPEN", "CLOSED"].includes(row.status as string)) {
      fx.toVoid.push({ id, slug });
    } // já anulado/resolvido: nada a fazer
  }
  return fx;
}
