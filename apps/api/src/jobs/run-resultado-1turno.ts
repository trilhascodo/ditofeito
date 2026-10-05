// CLI: fecha o 1º turno de 04/10/2026 nos mercados de disputa.
//
//   1. Resolve os 27 "senador mais votado" (1º colocado de cada UF) e os 20
//      "quem vence" de governador decididos no 1º turno.
//   2. Cria os "2º turno: quem vence?" (MULTI com os 2 finalistas, candidate_id
//      copiado do "quem vence" da disputa) pra presidente e as 7 UFs com
//      2º turno. O "quem vence" original dessas disputas continua aberto e
//      resolve no vencedor do 2º turno, como diz o critério dele.
//
// Resultados conferidos em 05/10 (TSE / imprensa com 100% das urnas). O
// vencedor é achado pelo rótulo exato da opção — se não bater com exatamente
// uma opção, o item é PULADO e listado, nada é resolvido no chute.
//
// Simulação por padrão (tudo em ROLLBACK); --aplicar executa. Idempotente:
// mercado já resolvido ou 2º turno já criado é só listado.
//
// Uso (na VPS): docker compose -f infra/docker-compose.yml exec -T api node apps/api/dist/jobs/run-resultado-1turno.js [--aplicar]
import { getPool } from "@ditofeito/db";
import { suggestB } from "@ditofeito/core";
import { createMarketIdempotent, type MarketOutcomeInput } from "../domain/marketFactory.js";
import { resolveMarket } from "../domain/trade.js";
import { CALENDARIO_2026 } from "./gerador.js";
import { UF_DE } from "./senado.js";

const aplicar = process.argv.includes("--aplicar");

const FONTE_SENADO = "https://www.opovo.com.br/noticias/politica/eleicoes/2026/10/04/resultado-eleicoes-2026-senadores-eleitos-por-cada-estado.html";
const FONTE_GOV = "https://www.gazetadopovo.com.br/eleicoes/2026/lista-20-governadores-eleitos-primeiro-turno/";
const FONTE_2T = "https://agenciabrasil.ebc.com.br/politica/noticia/2026-10/sete-estados-terao-segundo-turno-para-governador";
const FONTE_PRES = "https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/flavio-bolsonaro-e-lula-vao-disputar-o-2o-turno-para-a-presidencia-da-republica";

// UF → [rótulo exato da opção vencedora, % dos votos válidos]
const SENADO: Record<string, [string, string]> = {
  AC: ["Marcio Bittar (PL)", "25,59%"],
  AL: ["Arthur Lira (PP)", "28,87%"],
  AP: ["Rayssa Furlan (PODE)", "29,98%"],
  AM: ["Eduardo Braga (MDB)", "32,28%"],
  BA: ["Rui Costa (PT)", "30,07%"],
  CE: ["Cid Gomes (PSB)", "31,22%"],
  DF: ["Michelle Bolsonaro (PL)", "29,05%"],
  ES: ["Renato Casagrande (PSB)", "24,70%"],
  GO: ["Gustavo Gayer (PL)", "24,53%"],
  MA: ["FUFUCA (PP)", "21,43%"],
  MT: ["Mauro Mendes (UNIÃO)", "33,21%"],
  MS: ["Reinaldo Azambuja (PL)", "34,64%"],
  MG: ["Domingos Sávio (PL)", "24,21%"],
  PA: ["Helder (MDB)", "26,10%"],
  PB: ["Joao Azevêdo (PSB)", "32,50%"],
  PR: ["Filipe Barros (PL)", "27,25%"],
  PE: ["Humberto Costa (PT)", "27,19%"],
  PI: ["Marcelo Castro (MDB)", "35,67%"],
  RJ: ["Carlos Portinho (PL)", "26,77%"],
  RN: ["Styvenson Valentim (PODE)", "29,25%"],
  RS: ["Sanderson (PL)", "30,11%"],
  RO: ["Dr. Fernando Máximo (PL)", "31,97%"],
  RR: ["Nicoletti (PL)", "22,68%"],
  SC: ["Carol de Toni (PL)", "33,46%"],
  SP: ["Guilherme Derrite (PP)", "30,59%"],
  SE: ["Rogerio Carvalho (PT)", "21,91%"],
  TO: ["Eduardo Gomes (PL)", "27,22%"],
};

const GOV_ELEITO: Record<string, [string, string]> = {
  AL: ["Jhc (PSDB)", "52,19%"],
  AP: ["Dr. Furlan (PSD)", "62,75%"],
  BA: ["Jerônimo Rodrigues (PT)", "55,73%"],
  CE: ["Elmano de Freitas (PT)", "53,16%"],
  GO: ["Daniel Vilela (MDB)", "59,17%"],
  MA: ["Braide (PSD)", "54,06%"],
  MT: ["Otaviano Pivetta (REPUBLICANOS)", "60,77%"],
  MS: ["Eduardo Riedel (PP)", "67,07%"],
  MG: ["Cleitinho Azevedo (REPUBLICANOS)", "55,40%"],
  PA: ["Dr. Daniel (PODE)", "51,38%"],
  PB: ["Lucas Ribeiro (PP)", "64,30%"],
  PR: ["Sergio Moro (PL)", "50,10%"],
  PE: ["Raquel Lyra (PSD)", "53,26%"],
  PI: ["Rafael Fonteles (PT)", "70,90%"],
  RS: ["Luciano Zucco (PL)", "58,05%"],
  RO: ["Marcos Rogério (PL)", "56,86%"],
  RR: ["Arthur Henrique (PL)", "69,13%"],
  SC: ["Jorginho Mello (PL)", "68,98%"],
  SP: ["Tarcísio de Freitas (REPUBLICANOS)", "62,65%"],
  SE: ["Fábio (PSD)", "59,27%"],
};

// Disputas com 2º turno: [1º colocado, 2º colocado] (rótulos exatos do "quem vence").
// publicar=false nasce em DRAFT — RJ: os votos de Garotinho (sub judice) ainda
// podem dar a vitória a Ruas no 1º turno e cancelar o 2º turno.
interface SegundoTurno { uf: string | null; finalistas: [string, string]; publicar: boolean }
const SEGUNDO_TURNO: SegundoTurno[] = [
  { uf: null, finalistas: ["Flavio Bolsonaro (PL)", "Lula (PT)"], publicar: true },
  { uf: "AC", finalistas: ["Mailza Assis (PP)", "Alan Rick (REPUBLICANOS)"], publicar: true },
  { uf: "AM", finalistas: ["Omar Aziz (PSD)", "Professora Maria do Carmo (PL)"], publicar: true },
  { uf: "DF", finalistas: ["Celina Leão (PP)", "Leandro Grass (PT)"], publicar: true },
  { uf: "ES", finalistas: ["Lorenzo Pazolini (REPUBLICANOS)", "Ricardo Ferraço (MDB)"], publicar: true },
  { uf: "RJ", finalistas: ["Douglas Ruas (PL)", "Eduardo Paes (PSD)"], publicar: false },
  { uf: "RN", finalistas: ["Allyson (UNIÃO)", "Cadu de Lula (PT)"], publicar: true },
  { uf: "TO", finalistas: ["Professora Dorinha (UNIÃO)", "Vicentinho Júnior (PSDB)"], publicar: true },
];

const pool = getPool();

async function mercado(slug: string) {
  const m = await pool.query(`SELECT id, status FROM markets WHERE slug = $1`, [slug]);
  if (!m.rowCount) return null;
  const o = await pool.query(
    `SELECT id, label, candidate_id FROM market_outcomes WHERE market_id = $1 ORDER BY display_order`,
    [m.rows[0].id]);
  return { id: m.rows[0].id as string, status: m.rows[0].status as string,
           outcomes: o.rows as { id: string; label: string; candidate_id: string | null }[] };
}

let sistemaId = "";
const pulados: string[] = [];

async function resolver(slug: string, rotulo: string, justification: string, sourceUrl: string) {
  const m = await mercado(slug);
  if (!m) { pulados.push(`${slug} — mercado não existe`); return; }
  if (!["OPEN", "CLOSED"].includes(m.status)) { console.log(`JÁ ${m.status.padEnd(8)} ${slug}`); return; }
  const hits = m.outcomes.filter((o) => o.label === rotulo);
  if (hits.length !== 1) { pulados.push(`${slug} — opção "${rotulo}" não encontrada (${hits.length})`); return; }
  if (!aplicar) { console.log(`RESOLVERIA ${slug} → ${rotulo}`); return; }
  const r = await resolveMarket(pool, {
    marketId: m.id, winningOutcomeId: hits[0].id, resolverUserId: sistemaId, justification, sourceUrl,
  });
  console.log(`RESOLVIDO  ${slug} → ${rotulo} (${r.payouts} acertos, ${r.totalPaid.toFixed(0)} pts)`);
}

async function criarSegundoTurno(d: SegundoTurno, categoryId: string) {
  const cargo = d.uf ? "governador" : "presidente";
  const base = d.uf ? `quem-vence-disputa-governador-${d.uf.toLowerCase()}-2026` : "quem-vence-disputa-presidente-2026";
  const slug = d.uf ? `quem-vence-2turno-governador-${d.uf.toLowerCase()}-2026` : "quem-vence-2turno-presidente-2026";
  const src = await mercado(base);
  if (!src) { pulados.push(`${slug} — "${base}" não existe`); return; }
  const outcomes: MarketOutcomeInput[] = [];
  for (const f of d.finalistas) {
    const o = src.outcomes.find((x) => x.label === f);
    if (!o) { pulados.push(`${slug} — finalista "${f}" não está em ${base}`); return; }
    outcomes.push({ label: o.label, candidateId: o.candidate_id ?? undefined });
  }
  const nomes = d.finalistas.map((f) => f.replace(/ \(.*\)$/, "")).join(" x ");
  const onde = d.uf ? ` ${UF_DE[d.uf]}` : " da República";
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { created } = await createMarketIdempotent(c, {
      slug, categoryId, type: "MULTI", outcomes,
      title: `2º turno para ${cargo}${onde}: ${nomes} — quem vence?`,
      liquidityB: suggestB(2, 150),
      status: d.publicar ? "OPEN" : "DRAFT",
      resolutionCriteria:
        `Resolve no candidato declarado eleito ${cargo}${onde} no 2º turno de 25/10/2026, conforme a ` +
        `totalização do TSE. Anula se o 2º turno não acontecer (ex.: decisão da Justiça Eleitoral que ` +
        `defina o resultado já no 1º turno) ou for adiado/anulado.`,
      resolutionSource: "TSE — resultado oficial do 2º turno (resultados.tse.jus.br)",
      closeAt: CALENDARIO_2026.segundoTurno, resolveBy: CALENDARIO_2026.prazoResolucaoEleito,
      isElectoral: true, createdBy: sistemaId, regionUf: d.uf,
    });
    await c.query(aplicar ? "COMMIT" : "ROLLBACK");
    const estado = !created ? "JÁ EXISTE" : !aplicar ? "CRIARIA  " : d.publicar ? "CRIADO   " : "RASCUNHO ";
    console.log(`${estado} ${slug} (${nomes})`);
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

async function main() {
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  const cat = await pool.query(`SELECT id FROM categories WHERE slug = 'eleicoes-2026'`);
  if (!sys.rowCount || !cat.rowCount) throw new Error("Seed ausente: usuário 'sistema' / categoria 'eleicoes-2026'");
  sistemaId = sys.rows[0].id;
  console.log(aplicar ? "== APLICANDO ==" : "== SIMULAÇÃO (use --aplicar) ==");

  for (const [uf, [rotulo, pct]] of Object.entries(SENADO)) {
    await resolver(`mais-votado-senador-${uf.toLowerCase()}-2026`, rotulo,
      `${rotulo} foi o candidato a senador mais votado ${UF_DE[uf]} em 04/10/2026, com ${pct} dos votos válidos (totalização com 100% das urnas).`,
      FONTE_SENADO);
  }
  for (const [uf, [rotulo, pct]] of Object.entries(GOV_ELEITO)) {
    await resolver(`quem-vence-disputa-governador-${uf.toLowerCase()}-2026`, rotulo,
      `${rotulo} foi eleito governador ${UF_DE[uf]} no 1º turno de 04/10/2026, com ${pct} dos votos válidos.`,
      FONTE_GOV);
  }
  for (const d of SEGUNDO_TURNO) await criarSegundoTurno(d, cat.rows[0].id);

  if (pulados.length) console.log(`\nPULADOS (${pulados.length}):\n  ${pulados.join("\n  ")}`);
  console.log(`\nFontes: ${FONTE_2T} | ${FONTE_PRES}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
