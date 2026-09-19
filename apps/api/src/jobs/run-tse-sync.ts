// CLI: alinha candidatos (presidente, governador, senador) com o registro
// oficial do TSE — ver tseSync.ts. SEM --aplicar é só simulação: mostra, por
// disputa, quem casa, quem entra, quem sai e o que acontece nos mercados, e
// desfaz tudo.
//
// Uso (na VPS, a partir da raiz do repo):
//   docker compose -f infra/docker-compose.yml exec api node apps/api/dist/jobs/run-tse-sync.js [opções]
//
// Opções:
//   --uf MA,SP,BR          só essas UFs (BR = presidente). Padrão: todas.
//   --aceitar-pendentes    casa também os pares duvidosos listados como PENDENTE
//   --aplicar              grava (sem isso, simulação)
//   --arquivo -            lê o .zip/.csv do stdin em vez de baixar do TSE:
//                          ... exec -T api node apps/api/dist/jobs/run-tse-sync.js --arquivo - < consulta_cand_2026.zip
import { createHash } from "node:crypto";
import { getPool } from "@ditofeito/db";
import { readConsultaCand } from "../lib/tseCsv.js";
import { syncCandidatesWithTse, formatReport } from "./tseSync.js";

const TSE_ZIP_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of process.stdin) chunks.push(ch as Buffer);
  return Buffer.concat(chunks);
}

async function download(): Promise<Buffer> {
  console.log(`baixando ${TSE_ZIP_URL} ...`);
  const res = await fetch(TSE_ZIP_URL, { headers: { "User-Agent": "Mozilla/5.0 (DitoFeito; sync de candidatos)" } });
  if (!res.ok)
    throw new Error(`TSE respondeu ${res.status}. Baixe o consulta_cand_2026.zip em ` +
      `https://dadosabertos.tse.jus.br/dataset/candidatos-2026 e passe com --arquivo - (ver cabeçalho).`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const buf = opt("--arquivo") === "-" ? await readStdin() : await download();
  const rows = readConsultaCand(buf);
  const fileVersion = `consulta_cand_2026 sha256:${createHash("sha256").update(buf).digest("hex").slice(0, 12)}`;
  const ufs = (opt("--uf") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const result = await syncCandidatesWithTse(getPool(), {
    rows, fileVersion, ufs, aceitarPendentes: flag("--aceitar-pendentes"), aplicar: flag("--aplicar"),
  });
  console.log(formatReport(result));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
