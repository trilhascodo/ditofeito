import { describe, it, expect } from "vitest";
import { isStreakMilestone } from "./streak.js";

describe("isStreakMilestone", () => {
  it("não marca sequências pequenas antes do primeiro marco", () => {
    expect(isStreakMilestone(1)).toBe(false);
    expect(isStreakMilestone(2)).toBe(false);
  });

  it("marca em 3", () => {
    expect(isStreakMilestone(3)).toBe(true);
  });

  it("não marca em 4 (entre marcos)", () => {
    expect(isStreakMilestone(4)).toBe(false);
  });

  it("marca a cada múltiplo de 5 a partir de 5", () => {
    expect(isStreakMilestone(5)).toBe(true);
    expect(isStreakMilestone(10)).toBe(true);
    expect(isStreakMilestone(15)).toBe(true);
  });

  it("não marca múltiplos de 5 fora da sequência (ex.: 6, 11)", () => {
    expect(isStreakMilestone(6)).toBe(false);
    expect(isStreakMilestone(11)).toBe(false);
  });
});
