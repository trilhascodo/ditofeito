// ============================================================================
// esporte.ts — Geração automática de mercados esportivos
//
// Fonte: "Football Prediction API" no RapidAPI (football-prediction-api.p.
// rapidapi.com — NÃO é o api-sports.io/API-Football original do plano; a
// chave assinada em jul/2026 é dessa API. Formato e alcance testados contra
// dado real:
//   - GET /api/v2/predictions?market=classic&iso_date=YYYY-MM-DD[&federation=X]
//   - Brasileirão Série A = federation=CONMEBOL, competition_cluster=Brazil,
//     competition_name=Serie A (confirmado: "Santos SP" x "Chapecoense SC" em
//     25/jul/2026). Copa do Brasil: mesmo padrão, competition_name diferente
//     — assumido, não confirmado ainda (não caiu nenhum jogo na amostra).
//   - IMPORTANTE: a API só responde pra hoje/amanhã — datas mais à frente dão
//     404 (testado: 404 em qualquer federação, não é limite de plano). Isso
//     encurta a janela de antecedência da criação de mercado pra ~1-2 dias
//     antes do jogo (rodando diário, ainda cobre tudo, só com menos tempo de
//     negociação antes do fechamento do que o gerador eleitoral).
//   - Sem campo de rodada/round na resposta — grupo de navegação por rodada
//     (que o plano original previa) não dá pra fazer; mercados de uma mesma
//     competição não ficam agrupados em market_groups por ora.
//   - Seleção Brasileira: sem endpoint dedicado por seleção — filtra
//     home_team/away_team == "Brazil" em qualquer federação/competição.
//     NÃO CONFIRMADO contra jogo real (não caiu nenhum na amostra de teste).
//   - Horário: start_date vem sem timezone explícito ("2026-07-25T20:00:00").
//     Assumido UTC (mais seguro pra um servidor rodando em UTC) — CONFERIR
//     no primeiro jogo real que passar por aqui antes de confiar de olhos
//     fechados (comparar com horário de kickoff real divulgado pela CBF).
//
// Idempotente por slug (id do item embutido) — mesmo padrão dos outros
// geradores.
// ============================================================================
import type { Pool, PoolClient } from "pg";
import { suggestB } from "@ditofeito/core";
import { createMarketIdempotent } from "../../domain/marketFactory.js";
import { SPORTS_CONFIG } from "../../config.js";

export const ESPORTE_CONFIG = {
  depth: 60, // suggestB(3, depth) — 3 outcomes fixos (mandante/Empate/visitante)
  resolveByHorasApósApito: 6,
  diasJanela: 2, // hoje + amanhã — é o alcance real confirmado da API (ver nota acima)
  clubes: [
    { competitionName: "Serie A", nome: "Brasileirão Série A" },
    { competitionName: "Copa do Brasil", nome: "Copa do Brasil" },
  ] as const,
  clusterBrasil: "Brazil",
  federationClubes: "CONMEBOL",
  selecaoNome: "Seleção Brasileira",
  selecaoTeamName: "Brazil",
} as const;

interface PredictionItem {
  id: number;
  federation: string;
  competition_cluster: string;
  competition_name: string;
  home_team: string;
  away_team: string;
  start_date: string;
  status: string; // "pending" | "won" | "lost" | "postponed" | ...
}

async function fetchPredictions(isoDate: string): Promise<PredictionItem[]> {
  const url = new URL(`${SPORTS_CONFIG.footballPredictionBaseUrl}/api/v2/predictions`);
  url.searchParams.set("market", "classic");
  url.searchParams.set("iso_date", isoDate);
  const r = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": SPORTS_CONFIG.apiFootballKey,
      "X-RapidAPI-Host": SPORTS_CONFIG.footballPredictionHost,
    },
  });
  if (r.status === 404) return []; // API sem dado pra essa data ainda (janela curta, ver nota do módulo)
  if (!r.ok) throw new Error(`football-prediction-api respondeu ${r.status}`);
  const body = (await r.json()) as { data: PredictionItem[] };
  return body.data ?? [];
}

export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** UTC assumido (ver nota do módulo) — o "Z" é adicionado explicitamente
 *  pra não deixar o JS interpretar a string como horário local do processo. */
function parseStartDateUtc(s: string): Date {
  return new Date(s.endsWith("Z") ? s : `${s}Z`);
}

/** Só cria mercado pra jogo que ainda não começou de verdade — "pending" no
 *  status da API cobre "ainda sem resultado" (que inclui jogo ao vivo), então
 *  o corte por horário é o que garante que só entra jogo futuro. */
function isJogoFuturo(item: PredictionItem): boolean {
  return item.status === "pending" && parseStartDateUtc(item.start_date).getTime() > Date.now();
}

async function criarMercadoJogo(
  c: PoolClient,
  item: PredictionItem,
  opts: { categoriaId: string; sistemaUserId: string; competicaoNome: string; publicarDireto: boolean },
): Promise<{ criado: boolean }> {
  const kickoff = parseStartDateUtc(item.start_date);
  const resolveBy = new Date(kickoff.getTime() + ESPORTE_CONFIG.resolveByHorasApósApito * 3600_000);
  const dataFmt = kickoff.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const { created } = await createMarketIdempotent(c, {
    slug: `jogo-${item.id}`,
    title: `${item.home_team} x ${item.away_team} — ${opts.competicaoNome}, ${dataFmt}: quem vence?`,
    categoryId: opts.categoriaId,
    type: "MULTI",
    liquidityB: suggestB(3, ESPORTE_CONFIG.depth),
    status: opts.publicarDireto ? "OPEN" : "DRAFT",
    resolutionCriteria:
      `Resolve pelo resultado oficial da partida ao fim do tempo regulamentar ` +
      `(90min + acréscimos). Disputa por pênaltis/prorrogação em mata-mata NÃO ` +
      `altera o resultado deste mercado — só o placar da partida em si conta.`,
    resolutionSource: `${opts.competicaoNome} — súmula oficial (referência: Football Prediction API)`,
    closeAt: kickoff.toISOString(),
    resolveBy: resolveBy.toISOString(),
    createdBy: opts.sistemaUserId,
    outcomes: [{ label: item.home_team }, { label: "Empate" }, { label: item.away_team }],
  });
  return { criado: created };
}

function isoDatasDaJanela(): string[] {
  const out: string[] = [];
  for (let i = 0; i < ESPORTE_CONFIG.diasJanela; i++) {
    const d = new Date(Date.now() + i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** 1 fetch por dia (sem filtro de federação) e filtra tudo client-side —
 *  evita gastar 3x a cota diária da API buscando clube+clube+seleção separado. */
export async function gerarMercadosEsporte(
  pool: Pool,
  opts: { categoriaEsporteId: string; sistemaUserId: string; publicarDireto?: boolean },
): Promise<{ criados: number }> {
  if (!SPORTS_CONFIG.apiFootballKey) {
    console.warn("[esporte] API_FOOTBALL_KEY ausente — gerador não roda");
    return { criados: 0 };
  }
  const publicarDireto = opts.publicarDireto ?? false;
  const c = await pool.connect();
  let criados = 0;
  try {
    await c.query("BEGIN");
    for (const isoDate of isoDatasDaJanela()) {
      const itens = await fetchPredictions(isoDate);
      for (const item of itens) {
        if (!isJogoFuturo(item)) continue;

        const clube = ESPORTE_CONFIG.clubes.find(
          (cl) =>
            item.federation === ESPORTE_CONFIG.federationClubes &&
            item.competition_cluster === ESPORTE_CONFIG.clusterBrasil &&
            item.competition_name === cl.competitionName,
        );
        const ehSelecao =
          item.home_team === ESPORTE_CONFIG.selecaoTeamName ||
          item.away_team === ESPORTE_CONFIG.selecaoTeamName;

        if (!clube && !ehSelecao) continue;

        const r = await criarMercadoJogo(c, item, {
          categoriaId: opts.categoriaEsporteId,
          sistemaUserId: opts.sistemaUserId,
          competicaoNome: clube?.nome ?? ESPORTE_CONFIG.selecaoNome,
          publicarDireto,
        });
        if (r.criado) criados++;
      }
    }
    await c.query("COMMIT");
    return { criados };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function rodarGeradorEsporte(pool: Pool, opts: { publicarDireto?: boolean } = {}) {
  const cat = await pool.query(`SELECT id FROM categories WHERE slug = 'esportes'`);
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!cat.rowCount || !sys.rowCount)
    throw new Error("Seed ausente: categoria 'esportes' e usuário 'sistema'");
  return gerarMercadosEsporte(pool, {
    categoriaEsporteId: cat.rows[0].id,
    sistemaUserId: sys.rows[0].id,
    publicarDireto: opts.publicarDireto,
  });
}

// ---------------------------------------------------------------------------
// Dry-run: busca e filtra igual ao gerador de verdade, mas NUNCA escreve no
// banco — só imprime o que seria criado. Existe pra dar pra testar a
// integração com a API real sem precisar de um Postgres local (ver
// run-esporte.ts --dry-run).
// ---------------------------------------------------------------------------
export interface MercadoProposto {
  slug: string; title: string; closeAt: string; resolveBy: string; competicaoNome: string;
}

export async function dryRunEsporte(): Promise<MercadoProposto[]> {
  if (!SPORTS_CONFIG.apiFootballKey) {
    console.warn("[esporte] API_FOOTBALL_KEY ausente — nada pra testar");
    return [];
  }
  const propostos: MercadoProposto[] = [];
  for (const isoDate of isoDatasDaJanela()) {
    const itens = await fetchPredictions(isoDate);
    for (const item of itens) {
      if (!isJogoFuturo(item)) continue;
      const clube = ESPORTE_CONFIG.clubes.find(
        (cl) =>
          item.federation === ESPORTE_CONFIG.federationClubes &&
          item.competition_cluster === ESPORTE_CONFIG.clusterBrasil &&
          item.competition_name === cl.competitionName,
      );
      const ehSelecao =
        item.home_team === ESPORTE_CONFIG.selecaoTeamName || item.away_team === ESPORTE_CONFIG.selecaoTeamName;
      if (!clube && !ehSelecao) continue;

      const kickoff = parseStartDateUtc(item.start_date);
      const resolveBy = new Date(kickoff.getTime() + ESPORTE_CONFIG.resolveByHorasApósApito * 3600_000);
      const dataFmt = kickoff.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const competicaoNome = clube?.nome ?? ESPORTE_CONFIG.selecaoNome;
      propostos.push({
        slug: `jogo-${item.id}`,
        title: `${item.home_team} x ${item.away_team} — ${competicaoNome}, ${dataFmt}: quem vence?`,
        closeAt: kickoff.toISOString(),
        resolveBy: resolveBy.toISOString(),
        competicaoNome,
      });
    }
  }
  return propostos;
}
