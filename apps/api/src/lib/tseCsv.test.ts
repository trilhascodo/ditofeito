import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readConsultaCand } from "./tseCsv.js";

// Recorte do layout real do consulta_cand (Latin-1, ";", aspas, #NULO#).
const HEADER = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "DS_CARGO", "SQ_CANDIDATO", "NR_CANDIDATO",
  "NM_CANDIDATO", "NM_URNA_CANDIDATO", "SG_PARTIDO", "DT_NASCIMENTO", "DS_DETALHE_SITUACAO_CAND"];
const row = (f: string[]) => f.map((x) => `"${x}"`).join(";");
const CSV = [
  row(HEADER),
  row(["2026", "1", "MA", "SENADOR", "100001", "111", "ANDRE LUIZ CARVALHO RIBEIRO", "FUFUCA", "PP", "22/11/1989", "DEFERIDO"]),
  row(["2026", "1", "MA", "SENADOR", "100002", "133", "ELIZIANE PEREIRA GAMA MELO", "ELIZIANE GAMA", "PT", "#NULO#", "AGUARDANDO JULGAMENTO"]),
  row(["2026", "1", "MA", "SENADOR", "100003", "333", "HILTON GONÇALO DE SOUSA", "DR.HILTON GONÇALO", "MOBILIZA", "01/02/1970", "INDEFERIDO COM RECURSO"]),
  // mesmo candidato repetido no 2º turno — tem que ser ignorado
  row(["2026", "2", "MA", "SENADOR", "100001", "111", "ANDRE LUIZ CARVALHO RIBEIRO", "FUFUCA", "PP", "22/11/1989", "DEFERIDO"]),
].join("\r\n") + "\r\n";

function zipOf(files: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = deflateRawSync(content);
    const n = Buffer.from(name, "latin1");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(content.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(content.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, data); centrals.push(ch, n);
    off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("readConsultaCand", () => {
  it("lê o CSV em Latin-1, trata #NULO# e ignora o 2º turno", () => {
    const rows = readConsultaCand(Buffer.from(CSV, "latin1"));
    expect(rows).toHaveLength(3);
    const fufuca = rows.find((r) => r.sqCandidato === "100001")!;
    expect(fufuca).toMatchObject({
      nmUrna: "FUFUCA", sgPartido: "PP", sgUf: "MA", dsCargo: "SENADOR",
      nrCandidato: 111, dtNascimento: "1989-11-22", dsSituacao: "DEFERIDO",
    });
    expect(rows.find((r) => r.sqCandidato === "100002")!.dtNascimento).toBeNull();
    expect(rows.find((r) => r.sqCandidato === "100003")!.nmCandidato).toBe("HILTON GONÇALO DE SOUSA");
  });

  it("no zip, usa o _BRASIL quando existe", () => {
    const zip = zipOf({
      "leiame.pdf": Buffer.from("x"),
      "consulta_cand_2026_MA.csv": Buffer.from(row(HEADER), "latin1"),
      "consulta_cand_2026_BRASIL.csv": Buffer.from(CSV, "latin1"),
    });
    expect(readConsultaCand(zip)).toHaveLength(3);
  });

  it("no zip sem _BRASIL, junta os CSVs por UF", () => {
    const zip = zipOf({ "consulta_cand_2026_MA.csv": Buffer.from(CSV, "latin1") });
    expect(readConsultaCand(zip).map((r) => r.sqCandidato).sort()).toEqual(["100001", "100002", "100003"]);
  });

  it("explica o cabeçalho quando o layout do TSE muda", () => {
    expect(() => readConsultaCand(Buffer.from(row(["SG_UF", "NM_CANDIDATO"]) + "\n", "latin1")))
      .toThrow(/SQ_CANDIDATO não encontrada/);
  });
});
