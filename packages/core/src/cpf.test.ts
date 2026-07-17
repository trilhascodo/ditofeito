import { describe, it, expect } from "vitest";
import { isValidCpf, formatCpf, onlyDigits } from "./cpf.js";

describe("isValidCpf", () => {
  it("aceita CPFs com dígito verificador correto, com ou sem máscara", () => {
    expect(isValidCpf("111.444.777-35")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
    expect(isValidCpf("123.456.789-09")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidCpf("111.444.777-36")).toBe(false);
  });

  it("rejeita sequências triviais (mesmo dígito repetido)", () => {
    expect(isValidCpf("000.000.000-00")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
  });

  it("rejeita tamanho errado", () => {
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
});

describe("formatCpf", () => {
  it("formata incrementalmente conforme os dígitos chegam", () => {
    expect(formatCpf("111")).toBe("111");
    expect(formatCpf("111444")).toBe("111.444");
    expect(formatCpf("111444777")).toBe("111.444.777");
    expect(formatCpf("11144477735")).toBe("111.444.777-35");
  });
});

describe("onlyDigits", () => {
  it("remove tudo que não for dígito", () => {
    expect(onlyDigits("111.444.777-35")).toBe("11144477735");
  });
});
