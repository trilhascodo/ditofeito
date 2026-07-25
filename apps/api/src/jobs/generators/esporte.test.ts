import { describe, it, expect } from "vitest";
import { slugify } from "./esporte.js";

describe("slugify", () => {
  it("remove acentos, espaços e maiúsculas", () => {
    expect(slugify("São Paulo x Atlético-MG")).toBe("sao-paulo-x-atletico-mg");
  });
});
