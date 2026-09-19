// ============================================================================
// deputados.ts — mercados de bancada (deputado federal e estadual) por UF.
//
// Deputado tem centenas de candidatos por UF e a eleição é proporcional: as
// vagas vão pras agremiações (partido isolado ou federação — federação conta
// como uma só no quociente) e depois pros mais votados de cada uma. Mercado
// por candidato ou por partido espalharia as previsões em dezenas de mercados
// parados; o mercado de disputa aqui é um MULTI por UF e casa: "qual partido
// ou federação elegerá mais deputados?", com as agremiações que têm
// candidatos no arquivo do TSE (consulta_cand_2026) como opções.
// ============================================================================
import type { TseCandidateRow } from "../lib/tseCsv.js";
import { statusFromTse, titleCase } from "./tseSync.js";

export type Casa = "FEDERAL" | "ESTADUAL";
const CARGOS: Record<Casa, string[]> = {
  FEDERAL: ["DEPUTADO FEDERAL"],
  ESTADUAL: ["DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL"], // DF elege distritais
};
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
const EXIT = new Set(["INDEFERIDO", "RENUNCIOU", "FALECIDO"]);

/** "FEDERAÇÃO PSOL REDE" -> "Federação PSOL REDE": title case, mas sigla de
 *  partido da própria federação fica como o TSE escreve. */
function nomeFederacao(nome: string, partidos: Set<string>): string {
  const siglas = new Map([...partidos].map((p) => [norm(p), p]));
  return titleCase(nome).split(" ").map((w) => siglas.get(norm(w)) ?? w).join(" ");
}

export interface Agremiacao { key: string; label: string; candidatos: number }

/** Agremiações com ao menos 1 candidato ativo pra casa/UF, das maiores
 *  chapas pras menores. Federação: "Federação Brasil da Esperança (PC do B,
 *  PT, PV)" — nome sem a sigla do fim, partidos de quem concorre por ela. */
export function agremiacoes(rows: TseCandidateRow[], casa: Casa, uf: string): Agremiacao[] {
  const cargos = new Set(CARGOS[casa].map(norm));
  const grupos = new Map<string, { nome: string; federacao: boolean; partidos: Set<string>; n: number }>();
  for (const r of rows) {
    if (r.sgUf.toUpperCase() !== uf || !cargos.has(norm(r.dsCargo))) continue;
    if (EXIT.has(statusFromTse(r.dsSituacao))) continue;
    const fed = !!r.nrFederacao && r.nrFederacao !== "-1" && !!r.nmFederacao;
    const key = fed ? `F${r.nrFederacao}` : `P${r.sgPartido}`;
    const g = grupos.get(key) ?? {
      nome: fed ? r.nmFederacao.split(" - ")[0] : r.sgPartido,
      federacao: fed, partidos: new Set<string>(), n: 0,
    };
    g.partidos.add(r.sgPartido);
    g.n++;
    grupos.set(key, g);
  }
  return [...grupos.entries()]
    .map(([key, g]) => ({
      key,
      label: g.federacao ? `${nomeFederacao(g.nome, g.partidos)} (${[...g.partidos].sort().join(", ")})` : g.nome,
      candidatos: g.n,
    }))
    .sort((a, b) => b.candidatos - a.candidatos || a.label.localeCompare(b.label, "pt-BR"));
}
