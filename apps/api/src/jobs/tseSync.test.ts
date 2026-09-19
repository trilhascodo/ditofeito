import { describe, it, expect } from "vitest";
import { officeFromCargo, statusFromTse, titleCase, umaPessoaPorDisputa } from "./tseSync.js";
import { compositeScore, type PairRow } from "./matcher.js";

describe("officeFromCargo", () => {
  it("só cargos majoritários com mercado", () => {
    expect(officeFromCargo("SENADOR")).toBe("SENADOR");
    expect(officeFromCargo("Governador")).toBe("GOVERNADOR");
    expect(officeFromCargo("PRESIDENTE")).toBe("PRESIDENTE");
    expect(officeFromCargo("VICE-GOVERNADOR")).toBeNull();
    expect(officeFromCargo("1º SUPLENTE")).toBeNull();
    expect(officeFromCargo("DEPUTADO FEDERAL")).toBeNull();
  });
});

describe("statusFromTse", () => {
  it("deferido (com ou sem recurso) segue na disputa", () => {
    expect(statusFromTse("DEFERIDO")).toBe("DEFERIDO");
    expect(statusFromTse("DEFERIDO COM RECURSO")).toBe("DEFERIDO");
  });
  it("indeferido com recurso ainda está na urna (sub judice)", () => {
    expect(statusFromTse("INDEFERIDO COM RECURSO")).toBe("REGISTRADO");
    expect(statusFromTse("CANCELADO COM RECURSO")).toBe("REGISTRADO");
  });
  it("saídas definitivas", () => {
    expect(statusFromTse("INDEFERIDO")).toBe("INDEFERIDO");
    expect(statusFromTse("CANCELADO")).toBe("INDEFERIDO");
    expect(statusFromTse("RENÚNCIA")).toBe("RENUNCIOU");
    expect(statusFromTse("FALECIDO")).toBe("FALECIDO");
  });
  it("aguardando julgamento conta como registrado", () => {
    expect(statusFromTse("AGUARDANDO JULGAMENTO")).toBe("REGISTRADO");
    expect(statusFromTse("")).toBe("REGISTRADO");
  });
});

describe("titleCase", () => {
  it("nome de urna do TSE vira rótulo legível", () => {
    expect(titleCase("CIDÔNIO GONÇALVES")).toBe("Cidônio Gonçalves");
    expect(titleCase("ROSEANA SARNEY DA SILVA")).toBe("Roseana Sarney da Silva");
    expect(titleCase("DR.HILTON GONÇALO")).toBe("Dr.Hilton Gonçalo");
    expect(titleCase("MARIA DO SOCORRO SANTA-ROSA")).toBe("Maria do Socorro Santa-Rosa");
  });
});

// O motivo do corte próprio da sync (0.85): sem data de nascimento na base,
// nome idêntico + mesmo partido fica em 0.875 — abaixo dos 0.92 do matcher.
describe("score de casamento sem data de nascimento", () => {
  const base: PairRow = {
    candidate_id: "c", sq_candidato: "1", sim_civil: 0.3, sim_urna: 1, best_alias_sim: 0,
    party_equal: true, birth_equal: false, birth_known: false, cand_tokens: "FUFUCA", tse_tokens: "ANDRE LUIZ CARVALHO RIBEIRO",
  };
  it("nome de urna idêntico + mesmo partido = 0.875", () => {
    expect(compositeScore(base).score).toBeCloseTo(0.875, 3);
  });
  it("partido diferente cai pra faixa de pendente", () => {
    const s = compositeScore({ ...base, party_equal: false }).score;
    expect(s).toBeGreaterThanOrEqual(0.7);
    expect(s).toBeLessThan(0.85);
  });
});

describe("umaPessoaPorDisputa", () => {
  const guto = (sq: string, dsSituacao = "") => ({
    sqCandidato: sq, nmCandidato: "RICARDO AUGUSTO MANGUE SCHIAVETTO", nmUrna: "GUTO SCHIAVETTO",
    nrCandidato: 144, sgPartido: "MISSÃO", dsCargo: "SENADOR", sgUf: "SP", dtNascimento: "1982-01-23",
    dsSituacao, cpf: "30360769802", office: "SENADOR",
  });
  it("2 pedidos da mesma pessoa pro mesmo cargo viram 1 (o mais recente)", () => {
    const r = umaPessoaPorDisputa([guto("250002553928"), guto("250002554075")]);
    expect(r.map((x) => x.sqCandidato)).toEqual(["250002554075"]);
  });
  it("prefere o pedido que segue na disputa, mesmo sendo o mais antigo", () => {
    const r = umaPessoaPorDisputa([guto("250002553928", "APTO"), guto("250002554075", "INAPTO")]);
    expect(r.map((x) => x.sqCandidato)).toEqual(["250002553928"]);
  });
  it("cargos diferentes não são duplicata", () => {
    const r = umaPessoaPorDisputa([guto("1"), { ...guto("2"), office: "GOVERNADOR", dsCargo: "GOVERNADOR" }]);
    expect(r).toHaveLength(2);
  });
});
