import { describe, it, expect } from "vitest";
import { sugerirLimiar } from "./financeiro.js";

describe("sugerirLimiar", () => {
  it("ação < R$10: arredonda pra múltiplo de 0,50, sempre acima do preço atual", () => {
    const limiar = sugerirLimiar(8.2, "ACAO");
    expect(limiar).toBeGreaterThan(8.2);
    expect((limiar * 2) % 1).toBeCloseTo(0, 9); // múltiplo de 0,50
  });

  it("ação entre R$10 e R$100: arredonda pra múltiplo de 5", () => {
    const limiar = sugerirLimiar(38, "ACAO"); // +10% = 41.8
    expect(limiar).toBeGreaterThan(38);
    expect(limiar % 5).toBeCloseTo(0, 9);
    expect(limiar).toBeCloseTo(40, 9);
  });

  it("ação >= R$100: arredonda pra múltiplo de 50", () => {
    const limiar = sugerirLimiar(120, "ACAO"); // +10% = 132
    expect(limiar).toBeGreaterThan(120);
    expect(limiar % 50).toBeCloseTo(0, 9);
    expect(limiar).toBeCloseTo(150, 9);
  });

  it("câmbio: passo fino (0,10), não o passo grosseiro de ação de mesma magnitude", () => {
    const limiar = sugerirLimiar(5.4, "CAMBIO"); // +10% = 5.94
    expect(limiar).toBeGreaterThan(5.4);
    expect((limiar * 10) % 1).toBeCloseTo(0, 9); // múltiplo de 0,10
    expect(limiar).toBeCloseTo(5.9, 9);
  });

  it("nunca sugere limiar igual ou abaixo do preço atual mesmo após arredondar pra baixo", () => {
    // preço tal que preço*1.10 arredonda pro próprio preço ou abaixo dele
    const preco = 10.01; // +10% = 11.011 -> arredonda (passo 5) pra 10, que é < preço
    const limiar = sugerirLimiar(preco, "ACAO");
    expect(limiar).toBeGreaterThan(preco);
  });
});
