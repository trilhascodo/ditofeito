import { describe, it, expect } from "vitest";
import { normalizeSource, sourceFromSearch } from "./source.js";

describe("normalizeSource", () => {
  it("aceita rótulo simples e normaliza caixa/espaço", () => {
    expect(normalizeSource(" WhatsApp ")).toBe("whatsapp");
    expect(normalizeSource("ig_story-2026.09")).toBe("ig_story-2026.09");
  });
  it("rejeita vazio, caractere estranho e texto longo", () => {
    expect(normalizeSource("")).toBeUndefined();
    expect(normalizeSource(null)).toBeUndefined();
    expect(normalizeSource("fulano@email.com")).toBeUndefined();
    expect(normalizeSource("a b")).toBeUndefined();
    expect(normalizeSource("x".repeat(41))).toBeUndefined();
  });
});

describe("sourceFromSearch", () => {
  it("origem vence utm_source", () => {
    expect(sourceFromSearch("?origem=whatsapp&utm_source=newsletter")).toBe("whatsapp");
  });
  it("usa utm_source sem origem", () => {
    expect(sourceFromSearch("?utm_source=Instagram")).toBe("instagram");
  });
  it("infere Meta/Google pelos IDs de clique", () => {
    expect(sourceFromSearch("?fbclid=IwAR0abc")).toBe("facebook-instagram");
    expect(sourceFromSearch("?gclid=Cj0abc")).toBe("google-ads");
  });
  it("origem inválida cai pro próximo sinal", () => {
    expect(sourceFromSearch("?origem=%3Cscript%3E&fbclid=x")).toBe("facebook-instagram");
  });
  it("sem sinal nenhum", () => {
    expect(sourceFromSearch("")).toBeUndefined();
    expect(sourceFromSearch("?busca=lula")).toBeUndefined();
  });
});
