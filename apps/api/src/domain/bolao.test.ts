import { describe, it, expect } from "vitest";
import { calcularVencedores, statusBolao } from "./bolao.js";

describe("calcularVencedores", () => {
  it("WINNER: só quem escolheu o outcome vencedor", () => {
    const palpites = [
      { userId: "a", guessOutcomeId: "flamengo" },
      { userId: "b", guessOutcomeId: "vasco" },
      { userId: "c", guessOutcomeId: "flamengo" },
    ];
    expect(calcularVencedores(palpites, "WINNER", { outcomeId: "flamengo" })).toEqual(["a", "c"]);
  });

  it("SCORE: exige os dois números batendo — empate parcial não conta", () => {
    const palpites = [
      { userId: "a", guessHomeScore: 2, guessAwayScore: 1 },
      { userId: "b", guessHomeScore: 2, guessAwayScore: 0 },
      { userId: "c", guessHomeScore: 2, guessAwayScore: 1 },
    ];
    expect(calcularVencedores(palpites, "SCORE", { homeScore: 2, awayScore: 1 })).toEqual(["a", "c"]);
  });

  it("NUMBER: só o número exato", () => {
    const palpites = [
      { userId: "a", guessNumber: 42318 },
      { userId: "b", guessNumber: 40000 },
    ];
    expect(calcularVencedores(palpites, "NUMBER", { number: 42318 })).toEqual(["a"]);
  });

  it("ninguém acerta -> lista vazia, não cai pro palpite mais próximo", () => {
    const palpites = [
      { userId: "a", guessNumber: 100 },
      { userId: "b", guessNumber: 999 },
    ];
    expect(calcularVencedores(palpites, "NUMBER", { number: 500 })).toEqual([]);
  });

  it("sem resultado real ainda -> ninguém vence (não explode)", () => {
    const palpites = [{ userId: "a", guessOutcomeId: "flamengo" }];
    expect(calcularVencedores(palpites, "WINNER", { outcomeId: null })).toEqual([]);
  });
});

describe("statusBolao", () => {
  it("mercado ainda aberto/fechado -> OPEN", () => {
    expect(statusBolao("OPEN", "SCORE", null)).toBe("OPEN");
    expect(statusBolao("CLOSED", "SCORE", null)).toBe("OPEN");
  });

  it("mercado anulado -> VOID, independente do tipo", () => {
    expect(statusBolao("VOIDED", "WINNER", null)).toBe("VOID");
  });

  it("WINNER resolve sozinho assim que o mercado resolve", () => {
    expect(statusBolao("RESOLVED", "WINNER", null)).toBe("RESOLVIDO");
  });

  it("SCORE/NUMBER esperam o valor real ser preenchido à parte", () => {
    expect(statusBolao("RESOLVED", "SCORE", null)).toBe("AGUARDANDO_RESOLUCAO");
    expect(statusBolao("RESOLVED", "SCORE", new Date())).toBe("RESOLVIDO");
  });
});
