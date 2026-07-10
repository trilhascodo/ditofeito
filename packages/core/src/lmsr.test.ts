import { describe, it, expect } from "vitest";
import { lmsrCost, lmsrPrices, tradeCost, sharesForPoints, maxSubsidy } from "./lmsr.js";

describe("lmsr invariantes (README §3)", () => {
  it("soma dos preços = 1 no estado inicial e após 20 trades sequenciais", () => {
    const q = [717, 694, 655, 0, 321];
    const b = 150;
    expect(lmsrPrices(q, b).reduce((a, x) => a + x, 0)).toBeCloseTo(1, 9);

    for (let k = 0; k < 20; k++) {
      const i = k % q.length;
      const sh = sharesForPoints(q, b, i, 40);
      q[i] += sh;
      expect(lmsrPrices(q, b).reduce((a, x) => a + x, 0)).toBeCloseTo(1, 6);
    }
  });

  it("ledger ≡ função de custo: Σ custos individuais = C(q_final) − C(q_inicial)", () => {
    const q0 = [100, 100];
    const q = q0.slice();
    const b = 40;
    let totalCusto = 0;
    for (let k = 0; k < 20; k++) {
      const i = k % 2;
      const sh = sharesForPoints(q, b, i, 20);
      totalCusto += tradeCost(q, b, i, sh).cost;
      q[i] += sh;
    }
    const custoTeorico = lmsrCost(q, b) - lmsrCost(q0, b);
    expect(totalCusto).toBeCloseTo(custoTeorico, 3);
  });

  it("maxSubsidy(b, N) = b·ln(N)", () => {
    expect(maxSubsidy(40, 2)).toBeCloseTo(40 * Math.log(2), 9);
  });

  it("sharesForPoints é o inverso de tradeCost (custo de comprar as shares = pontos gastos)", () => {
    const q = [50, 30, 20];
    const b = 40;
    const pts = 25;
    const sh = sharesForPoints(q, b, 1, pts);
    const { cost } = tradeCost(q, b, 1, sh);
    expect(cost).toBeCloseTo(pts, 3);
  });
});
