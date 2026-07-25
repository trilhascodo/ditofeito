// ============================================================================
// financeiro.ts — Sugestão automática de mercados sobre ações B3 e câmbio
//
// Diferente de esporte/eleições: aqui não existe um "evento" pronto pra virar
// mercado — o próprio limiar de preço é uma escolha editorial. Este gerador
// SUGERE o limiar (preço atual + margem, arredondado pra um valor redondo) e
// SEMPRE nasce em DRAFT — nunca publica direto, mesmo com publicarDireto=true
// em outro lugar. Fica na fila de revisão que já existe (AdminMarkets, aba
// Rascunho); editor ajusta o texto via market.update e publica via
// market.publish quando achar o limiar razoável.
//
// Fonte de preço: brapi.dev (cobre B3 + câmbio no mesmo provider). Formato
// de resposta abaixo é o documentado publicamente — CONFERIR antes de ativar
// em produção (mesma ressalva de esporte.ts pra API externa nova).
//
// Só propõe um novo limiar por instrumento se não existir mercado
// DRAFT/OPEN dele ainda em aberto — evita flood do mesmo ticker toda semana.
// ============================================================================
import type { Pool, PoolClient } from "pg";
import { suggestB } from "@ditofeito/core";
import { createMarketIdempotent } from "../../domain/marketFactory.js";
import { FINANCE_CONFIG } from "../../config.js";
import { slugify } from "./esporte.js";

export const FINANCEIRO_CONFIG = {
  horizonteDias: 45,
  depth: 40, // suggestB(2, depth) — BINARY, mesma profundidade do binário eleitoral
  acoes: ["PETR4", "VALE3", "ITUB4", "BBDC4", "ABEV3", "WEGE3", "MGLU3", "B3SA3"] as const,
  // Câmbio fora por ora: testado contra a chave real (jul/2026) e o endpoint
  // /v2/currency do brapi.dev respondeu "FEATURE_NOT_AVAILABLE" no plano
  // gratuito assinado. Reativar é só popular este array de novo quando tiver
  // plano com acesso (ou trocar de fonte pra câmbio).
  cambio: [] as { par: string; label: string }[],
} as const;

/** Passo de arredondamento proporcional à magnitude do preço — câmbio usa
 *  passo fino (0,10) porque a faixa de preço (~R$5) não combina com o passo
 *  de ação de mesma magnitude (0,50 seria grosseiro demais pra variação diária). */
function stepPara(preco: number, tipo: "ACAO" | "CAMBIO"): number {
  if (tipo === "CAMBIO") return 0.1;
  if (preco < 10) return 0.5;
  if (preco < 100) return 5;
  return 50;
}

/** Sugere limiar de alta (~10% acima do preço atual, arredondado pra um valor
 *  redondo). Sempre estritamente acima do preço atual, mesmo após arredondar. */
export function sugerirLimiar(precoAtual: number, tipo: "ACAO" | "CAMBIO"): number {
  const step = stepPara(precoAtual, tipo);
  const alvo = precoAtual * 1.1;
  let arredondado = Math.round(alvo / step) * step;
  if (arredondado <= precoAtual) arredondado += step;
  return Math.round(arredondado * 100) / 100;
}

interface QuoteResp { results?: { regularMarketPrice: number }[] }

async function fetchPrecoAcao(ticker: string): Promise<number | null> {
  const url = new URL(`${FINANCE_CONFIG.brapiBaseUrl}/quote/${ticker}`);
  if (FINANCE_CONFIG.brapiToken) url.searchParams.set("token", FINANCE_CONFIG.brapiToken);
  const r = await fetch(url);
  if (!r.ok) { console.warn(`[financeiro] brapi quote ${ticker} respondeu ${r.status}`); return null; }
  const body = (await r.json()) as QuoteResp;
  return body.results?.[0]?.regularMarketPrice ?? null;
}

interface CurrencyResp { currency?: { bidPrice: string }[] }

async function fetchPrecoCambio(par: string): Promise<number | null> {
  const url = new URL(`${FINANCE_CONFIG.brapiBaseUrl}/v2/currency`);
  url.searchParams.set("currency", par);
  if (FINANCE_CONFIG.brapiToken) url.searchParams.set("token", FINANCE_CONFIG.brapiToken);
  const r = await fetch(url);
  if (!r.ok) { console.warn(`[financeiro] brapi currency ${par} respondeu ${r.status}`); return null; }
  const body = (await r.json()) as CurrencyResp;
  const bid = body.currency?.[0]?.bidPrice;
  return bid ? Number(bid) : null;
}

interface PropostaLimiar {
  slug: string; title: string; resolutionCriteria: string;
  closeAt: string; resolveBy: string;
}

/** Monta a proposta (título/critério/slug/datas) sem tocar banco — reusado
 *  pela escrita real (criarMercadoLimiar) e pelo dry-run (ver run-financeiro.ts). */
function construirPropostaLimiar(p: {
  instrumentoSlug: string; label: string; precoAtual: number; limiar: number;
}): PropostaLimiar {
  const alvo = new Date(Date.now() + FINANCEIRO_CONFIG.horizonteDias * 86_400_000);
  const resolveBy = new Date(alvo.getTime() + 86_400_000);
  const limiarFmt = p.limiar.toFixed(2);
  const alvoFmt = alvo.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const cicloSlug = `${alvo.getUTCFullYear()}${String(alvo.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    slug: `financeiro-${p.instrumentoSlug}-acima-${limiarFmt.replace(".", "")}-${cicloSlug}`,
    title: `${p.label} ultrapassa R$ ${limiarFmt} até ${alvoFmt}?`,
    resolutionCriteria:
      `Resolve SIM se a cotação de fechamento de ${p.label} no pregão de ${alvoFmt} ` +
      `for maior que R$ ${limiarFmt}. Resolve NÃO caso contrário. ` +
      `Preço de referência no momento em que este mercado foi proposto: R$ ${p.precoAtual.toFixed(2)}.`,
    closeAt: alvo.toISOString(),
    resolveBy: resolveBy.toISOString(),
  };
}

async function criarMercadoLimiar(
  c: PoolClient,
  p: { instrumentoSlug: string; label: string; precoAtual: number; limiar: number;
       categoriaId: string; sistemaUserId: string },
): Promise<boolean> {
  const proposta = construirPropostaLimiar(p);
  const { created } = await createMarketIdempotent(c, {
    slug: proposta.slug,
    title: proposta.title,
    categoryId: p.categoriaId,
    type: "BINARY",
    liquidityB: suggestB(2, FINANCEIRO_CONFIG.depth),
    status: "DRAFT", // sempre editorial — não usa flag de publicação direta
    resolutionCriteria: proposta.resolutionCriteria,
    resolutionSource: "B3 — cotação oficial de fechamento (dado de referência: brapi.dev)",
    closeAt: proposta.closeAt,
    resolveBy: proposta.resolveBy,
    createdBy: p.sistemaUserId,
    outcomes: [{ label: "SIM" }, { label: "NÃO" }],
  });
  return created;
}

async function proporSeAusente(
  c: PoolClient,
  opts: { instrumentoSlug: string; label: string; tipo: "ACAO" | "CAMBIO";
         precoAtual: number | null; categoriaId: string; sistemaUserId: string },
): Promise<boolean> {
  if (opts.precoAtual == null) return false;
  const existente = await c.query(
    `SELECT 1 FROM markets WHERE slug LIKE $1 AND status IN ('DRAFT','OPEN') LIMIT 1`,
    [`financeiro-${opts.instrumentoSlug}-acima-%`],
  );
  if (existente.rowCount) return false;
  const limiar = sugerirLimiar(opts.precoAtual, opts.tipo);
  return criarMercadoLimiar(c, {
    instrumentoSlug: opts.instrumentoSlug, label: opts.label,
    precoAtual: opts.precoAtual, limiar,
    categoriaId: opts.categoriaId, sistemaUserId: opts.sistemaUserId,
  });
}

export async function gerarMercadosFinanceiro(
  pool: Pool,
  opts: { categoriaEconomiaId: string; sistemaUserId: string },
): Promise<{ criados: number }> {
  const c = await pool.connect();
  let criados = 0;
  try {
    await c.query("BEGIN");
    for (const ticker of FINANCEIRO_CONFIG.acoes) {
      const preco = await fetchPrecoAcao(ticker);
      const ok = await proporSeAusente(c, {
        instrumentoSlug: slugify(ticker), label: ticker, tipo: "ACAO", precoAtual: preco,
        categoriaId: opts.categoriaEconomiaId, sistemaUserId: opts.sistemaUserId,
      });
      if (ok) criados++;
    }
    for (const moeda of FINANCEIRO_CONFIG.cambio) {
      const preco = await fetchPrecoCambio(moeda.par);
      const ok = await proporSeAusente(c, {
        instrumentoSlug: slugify(moeda.par), label: moeda.label, tipo: "CAMBIO", precoAtual: preco,
        categoriaId: opts.categoriaEconomiaId, sistemaUserId: opts.sistemaUserId,
      });
      if (ok) criados++;
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

export async function rodarGeradorFinanceiro(pool: Pool) {
  const cat = await pool.query(`SELECT id FROM categories WHERE slug = 'economia'`);
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!cat.rowCount || !sys.rowCount)
    throw new Error("Seed ausente: categoria 'economia' e usuário 'sistema'");
  return gerarMercadosFinanceiro(pool, {
    categoriaEconomiaId: cat.rows[0].id,
    sistemaUserId: sys.rows[0].id,
  });
}

// ---------------------------------------------------------------------------
// Dry-run: busca preço real e monta a proposta, mas NUNCA escreve no banco
// (não dá nem pra checar "já existe um em aberto" sem banco — então pode
// repetir instrumento entre execuções, diferente do gerador de verdade).
// Serve pra testar a integração com brapi.dev sem Postgres local.
// ---------------------------------------------------------------------------
export async function dryRunFinanceiro(): Promise<PropostaLimiar[]> {
  const propostas: PropostaLimiar[] = [];
  for (const ticker of FINANCEIRO_CONFIG.acoes) {
    const preco = await fetchPrecoAcao(ticker);
    if (preco == null) continue;
    propostas.push(construirPropostaLimiar({
      instrumentoSlug: slugify(ticker), label: ticker,
      precoAtual: preco, limiar: sugerirLimiar(preco, "ACAO"),
    }));
  }
  for (const moeda of FINANCEIRO_CONFIG.cambio) {
    const preco = await fetchPrecoCambio(moeda.par);
    if (preco == null) continue;
    propostas.push(construirPropostaLimiar({
      instrumentoSlug: slugify(moeda.par), label: moeda.label,
      precoAtual: preco, limiar: sugerirLimiar(preco, "CAMBIO"),
    }));
  }
  return propostas;
}
