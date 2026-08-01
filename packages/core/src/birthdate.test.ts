import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hasMinAge } from "./birthdate.js";

describe("hasMinAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("aceita quem já fez aniversário este ano", () => {
    expect(hasMinAge("2013-07-31", 13)).toBe(true); // fez 13 ontem
    expect(hasMinAge("2013-08-01", 13)).toBe(true); // faz 13 hoje
  });

  it("rejeita quem ainda não fez aniversário este ano", () => {
    expect(hasMinAge("2013-08-02", 13)).toBe(false); // faz 13 amanhã
    expect(hasMinAge("2013-12-31", 13)).toBe(false);
  });

  it("rejeita data inválida", () => {
    expect(hasMinAge("não é data", 13)).toBe(false);
    expect(hasMinAge("", 13)).toBe(false);
  });

  it("lida com quem tem bem mais que o mínimo", () => {
    expect(hasMinAge("1990-01-01", 13)).toBe(true);
  });
});
