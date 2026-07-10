// ============================================================================
// LMSR (Logarithmic Market Scoring Rule) — núcleo de precificação
// + Brier score multi-resultado para reputação
// Puro e sem dependências: fácil de testar com vitest e validar com Zod na borda.
// ============================================================================

/** Custo total do estado do mercado: C(q) = b · ln( Σ exp(q_i / b) )
 *  Implementado com log-sum-exp estável (evita overflow com q grande). */
export function lmsrCost(q: number[], b: number): number {
  const m = Math.max(...q);
  const sum = q.reduce((acc, qi) => acc + Math.exp((qi - m) / b), 0);
  return b * (m / b + Math.log(sum));
}

/** Preço (= probabilidade implícita) de cada outcome: softmax(q / b). Soma 1. */
export function lmsrPrices(q: number[], b: number): number[] {
  const m = Math.max(...q);
  const exps = q.map((qi) => Math.exp((qi - m) / b));
  const sum = exps.reduce((a, e) => a + e, 0);
  return exps.map((e) => e / sum);
}

/** Custo em pontos para comprar `shares` do outcome `i` (negativo p/ venda).
 *  custo = C(q') − C(q), onde q' = q com q_i += shares. */
export function tradeCost(
  q: number[],
  b: number,
  outcomeIndex: number,
  shares: number, // >0 compra, <0 venda
): { cost: number; pricesBefore: number[]; pricesAfter: number[] } {
  const pricesBefore = lmsrPrices(q, b);
  const qAfter = q.slice();
  qAfter[outcomeIndex] += shares;
  const cost = lmsrCost(qAfter, b) - lmsrCost(q, b);
  return { cost, pricesBefore, pricesAfter: lmsrPrices(qAfter, b) };
}

/** Inverso: quantas shares um orçamento de `points` compra no outcome `i`.
 *  Resolve por busca binária (função de custo é monótona em shares). */
export function sharesForPoints(
  q: number[],
  b: number,
  outcomeIndex: number,
  points: number,
  tolerance = 1e-6,
): number {
  let lo = 0;
  let hi = points; // custo por share < 1 ⇒ shares > points; expandir se preciso
  while (tradeCost(q, b, outcomeIndex, hi).cost < points) hi *= 2;
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2;
    if (tradeCost(q, b, outcomeIndex, mid).cost < points) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Perda máxima do subsídio (em pontos) de um mercado: b · ln(N).
 *  Use para dimensionar b e monitorar a inflação total de pontos. */
export function maxSubsidy(b: number, nOutcomes: number): number {
  return b * Math.log(nOutcomes);
}

/** Regra prática de liquidez inicial: mais outcomes ⇒ mais b p/ estabilidade. */
export function suggestB(nOutcomes: number, depth: number = 40): number {
  return depth * Math.log(Math.max(nOutcomes, 2));
}

// ============================================================================
// REPUTAÇÃO — Brier multi-resultado + skill vs. baseline do mercado
// ============================================================================

/** Brier multi-resultado: Σ (p_i − o_i)², onde o = vetor one-hot do resultado.
 *  Intervalo [0, 2]. Menor = melhor. */
export function brierScore(probs: number[], winnerIndex: number): number {
  return probs.reduce((acc, p, i) => {
    const o = i === winnerIndex ? 1 : 0;
    return acc + (p - o) ** 2;
  }, 0);
}

/** Probabilidades implícitas da POSIÇÃO do usuário: preço médio de aquisição
 *  por outcome, renormalizado. Usuário sem posição em um outcome ⇒ herda o
 *  preço final do mercado nele (não é penalizado nem premiado pelo que ignorou). */
export function userImpliedProbs(
  avgEntryPriceByOutcome: (number | null)[], // null = sem posição
  finalMarketPrices: number[],
): number[] {
  const raw = avgEntryPriceByOutcome.map((p, i) =>
    p === null ? finalMarketPrices[i] : p,
  );
  const sum = raw.reduce((a, x) => a + x, 0);
  return raw.map((x) => x / sum);
}

/** Skill: quanto o usuário bateu o consenso. >0 = melhor que o mercado. */
export function skillDelta(
  userProbs: number[],
  marketFinalPrices: number[],
  winnerIndex: number,
): { userBrier: number; marketBrier: number; delta: number } {
  const userBrier = brierScore(userProbs, winnerIndex);
  const marketBrier = brierScore(marketFinalPrices, winnerIndex);
  return { userBrier, marketBrier, delta: marketBrier - userBrier };
}
