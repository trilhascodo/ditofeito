import { describe, it, expect } from "vitest";
import { agremiacoes } from "./deputados.js";
import type { TseCandidateRow } from "../lib/tseCsv.js";

const base: TseCandidateRow = {
  sqCandidato: "1", nmCandidato: "X", nmUrna: "X", nrCandidato: 1, sgPartido: "PL", dsCargo: "DEPUTADO FEDERAL",
  sgUf: "MA", dtNascimento: null, dsSituacao: "", cpf: "", nmPartido: "PARTIDO LIBERAL",
  nrFederacao: "-1", nmFederacao: "", dsComposicaoFederacao: "",
};
const fe = (sg: string, extra: Partial<TseCandidateRow> = {}): TseCandidateRow => ({
  ...base, sgPartido: sg, nrFederacao: "1", nmFederacao: "FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL", ...extra,
});

describe("agremiacoes", () => {
  const rows: TseCandidateRow[] = [
    base, { ...base, sqCandidato: "2" }, { ...base, sqCandidato: "3" },
    fe("PT"), fe("PT"), fe("PC do B"), fe("PV"),
    { ...base, sgPartido: "PSOL", nrFederacao: "2", nmFederacao: "FEDERAÇÃO PSOL REDE - PSOL REDE" },
    { ...base, sgPartido: "NOVO" },
    { ...base, sgPartido: "PCO", dsSituacao: "INDEFERIDO" },           // fora: indeferido
    { ...base, sgPartido: "MDB", dsCargo: "DEPUTADO ESTADUAL" },         // outra casa
    { ...base, sgPartido: "PP", sgUf: "SP" },                            // outra UF
  ];

  it("federação conta como uma só, com os partidos de quem concorre por ela", () => {
    const r = agremiacoes(rows, "FEDERAL", "MA");
    expect(r.map((a) => a.label)).toEqual([
      "Federação Brasil da Esperança (PC do B, PT, PV)", // 4 candidatos
      "PL",                                               // 3
      "Federação PSOL Rede (PSOL)",                       // 1 (empate por nome)
      "NOVO",
    ]);
    expect(r[0].candidatos).toBe(4);
  });

  it("separa casa e UF; estadual inclui distrital (DF)", () => {
    expect(agremiacoes(rows, "ESTADUAL", "MA").map((a) => a.label)).toEqual(["MDB"]);
    expect(agremiacoes([{ ...base, dsCargo: "DEPUTADO DISTRITAL", sgUf: "DF" }], "ESTADUAL", "DF")).toHaveLength(1);
  });
});
