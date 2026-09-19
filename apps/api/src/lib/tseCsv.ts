// ============================================================================
// tseCsv.ts — lê o consulta_cand_<ano>.zip dos dados abertos do TSE
// (https://dadosabertos.tse.jus.br — "Candidatos <ano>"). O mesmo conteúdo
// que o DivulgaCandContas mostra, em arquivo: um CSV por UF + um _BRASIL com
// tudo; Latin-1, separado por ";", campos entre aspas, 1ª linha = cabeçalho.
//
// Leitor de zip mínimo aqui mesmo (diretório central + inflateRaw do zlib):
// o arquivo tem < 4 GB (sem zip64) e só precisamos de uma entrada — não vale
// uma dependência nova na API por isso.
// ============================================================================
import { inflateRawSync } from "node:zlib";

export interface TseCandidateRow {
  sqCandidato: string;
  nmCandidato: string;
  nmUrna: string;
  nrCandidato: number | null;
  sgPartido: string;
  dsCargo: string;
  sgUf: string;          // "BR" pra presidente
  dtNascimento: string | null; // ISO yyyy-mm-dd
  dsSituacao: string;    // DS_DETALHE_SITUACAO_CAND (DEFERIDO, INDEFERIDO COM RECURSO, RENÚNCIA...)
}

// ------------------------------- zip ---------------------------------------
function zipEntries(buf: Buffer): { name: string; read: () => Buffer }[] {
  // End of Central Directory: assinatura 0x06054b50 nos últimos ~64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("arquivo não é um .zip válido (EOCD não encontrado)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; read: () => Buffer }[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("diretório central do zip corrompido");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("latin1", p + 46, p + 46 + nameLen);
    out.push({
      name,
      read: () => {
        const lNameLen = buf.readUInt16LE(localOff + 26);
        const lExtraLen = buf.readUInt16LE(localOff + 28);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const data = buf.subarray(start, start + compSize);
        if (method === 0) return data;
        if (method === 8) return inflateRawSync(data);
        throw new Error(`método de compressão ${method} não suportado (${name})`);
      },
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ------------------------------- csv ---------------------------------------
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const NULO = new Set(["", "#NULO#", "#NULO", "#NE#", "#NE"]);
const val = (s: string | undefined) => (s === undefined || NULO.has(s.trim()) ? "" : s.trim());

function parseCsv(text: string): TseCandidateRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = parseLine(lines[0]).map((h) => h.trim().toUpperCase());
  const col = (name: string, required = true) => {
    const i = header.indexOf(name);
    if (i < 0 && required)
      throw new Error(`coluna ${name} não encontrada no CSV do TSE — cabeçalho: ${header.join(", ")}`);
    return i;
  };
  const iSq = col("SQ_CANDIDATO"), iNome = col("NM_CANDIDATO"), iUrna = col("NM_URNA_CANDIDATO");
  const iNr = col("NR_CANDIDATO"), iPart = col("SG_PARTIDO"), iCargo = col("DS_CARGO");
  const iUf = col("SG_UF"), iNasc = col("DT_NASCIMENTO", false);
  const iSit = header.indexOf("DS_DETALHE_SITUACAO_CAND") >= 0
    ? header.indexOf("DS_DETALHE_SITUACAO_CAND") : col("DS_SITUACAO_CANDIDATURA");
  // Depois do 1º turno o arquivo repete quem vai ao 2º com NR_TURNO=2 — só o 1º importa aqui.
  const iTurno = col("NR_TURNO", false);

  const bySq = new Map<string, TseCandidateRow>();
  for (let n = 1; n < lines.length; n++) {
    const f = parseLine(lines[n]);
    if (iTurno >= 0 && val(f[iTurno]) && val(f[iTurno]) !== "1") continue;
    const sq = val(f[iSq]);
    if (!sq) continue;
    const nasc = iNasc >= 0 ? val(f[iNasc]) : "";
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(nasc);
    bySq.set(sq, {
      sqCandidato: sq,
      nmCandidato: val(f[iNome]),
      nmUrna: val(f[iUrna]) || val(f[iNome]),
      nrCandidato: Number(val(f[iNr])) || null,
      sgPartido: val(f[iPart]),
      dsCargo: val(f[iCargo]),
      sgUf: val(f[iUf]),
      dtNascimento: m ? `${m[3]}-${m[2]}-${m[1]}` : null,
      dsSituacao: val(f[iSit]),
    });
  }
  return [...bySq.values()];
}

/** Aceita o .zip inteiro do TSE ou um .csv já extraído. No zip, prefere o
 *  arquivo _BRASIL (tem todas as UFs); sem ele, junta os CSVs por UF. */
export function readConsultaCand(buf: Buffer): TseCandidateRow[] {
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (!isZip) return parseCsv(buf.toString("latin1"));
  const csvs = zipEntries(buf).filter((e) => /\.csv$/i.test(e.name));
  if (!csvs.length) throw new Error("nenhum .csv dentro do zip");
  const brasil = csvs.find((e) => /_BRASIL\.csv$/i.test(e.name));
  const chosen = brasil ? [brasil] : csvs;
  const all = new Map<string, TseCandidateRow>();
  for (const e of chosen) for (const r of parseCsv(e.read().toString("latin1"))) all.set(r.sqCandidato, r);
  return [...all.values()];
}
