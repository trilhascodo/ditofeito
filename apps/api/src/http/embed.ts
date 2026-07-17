// ============================================================================
// embed.ts — Widget embedável + card de compartilhamento (WhatsApp/OG)
//
// Endpoints públicos (fora do tRPC — são artefatos HTTP cacheáveis):
//   GET /embed/:slug        -> HTML autocontido (iframe em sites de campanha)
//   GET /api/pub/:slug.json -> dados p/ integrações (o "índice" em miniatura)
//   GET /card/:slug.svg     -> card 1200x630 (fonte; útil pra depurar)
//   GET /card/:slug.png     -> card 1200x630 raster p/ og:image — é este que
//                              vai na meta tag, WhatsApp não renderiza SVG
//   GET /share/:slug        -> HTML com <meta og:*> de verdade; só alcançado
//                              via nginx quando o User-Agent é bot de rede
//                              social (o SPA não tem meta tag por rota)
//
// Requisitos de produto embutidos:
//   - Zero dependência externa no HTML (funciona em qualquer site, offline-ish)
//   - Disclaimer Lei 9.504 DENTRO do artefato quando is_electoral
//   - Link de volta com UTM (o embed é canal de aquisição)
//   - Cache: s-maxage=60 + stale-while-revalidate (CDN absorve a campanha)
//   - frame-ancestors * (embed é o objetivo; NUNCA X-Frame-Options: DENY aqui)
// ============================================================================
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import type { Pool } from "pg";
import { lmsrPrices } from "@ditofeito/core";

export const EMBED_CONFIG = {
  baseUrl: "https://ditofeito.com",
  brand: "DitoFeito",
  sparklineDays: 30,
  sparklinePoints: 60,                     // downsample p/ SVG leve
  cacheSeconds: 60,
} as const;

const DISCLAIMER =
  "Agregado de opiniões de participantes. Não é pesquisa eleitoral (Lei 9.504/97).";

// Paleta neutra p/ outcomes (sem cor partidária — neutralidade visual).
// Mesma paleta de apps/web/src/pages/MarketPage.tsx (CORES) — o widget
// embedado em site de terceiro é o principal canal de reconhecimento de
// marca fora do próprio site, não pode parecer um widget azul genérico.
const CORES = ["#4F2E99", "#C93A1F", "#0F8F5F", "#B8860B", "#0E7490", "#888780"];

// ---------------------------------------------------------------------------
// 1. DADOS PÚBLICOS DO MERCADO
// ---------------------------------------------------------------------------
export interface PublicMarketData {
  slug: string; title: string; status: string; isElectoral: boolean;
  closeAt: string; type: "BINARY" | "MULTI"; categoryName: string;
  outcomes: { label: string; price: number; isCatchall: boolean }[];
  /** série p/ sparkline: por outcome, pontos [t(0..1), price] */
  series: { label: string; points: [number, number][] }[];
  /** só quando status === 'RESOLVED' — outcome vencedor (carimbo "FEITO") */
  resolvedOutcomeLabel: string | null;
  updatedAt: string;
}

export async function getMarketPublicData(
  pool: Pool, slug: string,
): Promise<PublicMarketData | null> {
  const m = await pool.query(
    `SELECT m.id, m.slug, m.title, m.status, m.is_electoral, m.close_at, m.type,
            m.liquidity_b, c.name AS category_name
       FROM markets m JOIN categories c ON c.id = m.category_id
      WHERE m.slug = $1
        AND m.status IN ('OPEN','CLOSED','RESOLVED')`, [slug]);
  if (!m.rowCount) return null;
  const mk = m.rows[0];

  const out = await pool.query(
    `SELECT id, label, q, is_catchall FROM market_outcomes
      WHERE market_id = $1 ORDER BY display_order, id`, [mk.id]);
  const prices = lmsrPrices(out.rows.map((r) => Number(r.q)), Number(mk.liquidity_b));

  // Sparkline: snapshots da janela, downsampled por bucket de tempo
  const snaps = await pool.query(
    `WITH win AS (
       SELECT outcome_id, price, ts,
              extract(epoch FROM ts) AS ep
         FROM price_snapshots
        WHERE market_id = $1 AND ts > now() - ($2 || ' days')::interval
     ), lim AS (SELECT min(ep) AS t0, max(ep) AS t1 FROM win)
     SELECT w.outcome_id,
            width_bucket(w.ep, lim.t0, lim.t1 + 1, $3) AS bucket,
            avg(w.price) AS price,
            (avg(w.ep) - lim.t0) / greatest(lim.t1 - lim.t0, 1) AS t
       FROM win w, lim
      GROUP BY w.outcome_id, bucket, lim.t0, lim.t1
      ORDER BY w.outcome_id, bucket`,
    [mk.id, EMBED_CONFIG.sparklineDays, EMBED_CONFIG.sparklinePoints]);

  const byOutcome = new Map<string, [number, number][]>();
  for (const s of snaps.rows) {
    const arr = byOutcome.get(s.outcome_id) ?? [];
    arr.push([Number(s.t), Number(s.price)]);
    byOutcome.set(s.outcome_id, arr);
  }

  let resolvedOutcomeLabel: string | null = null;
  if (mk.status === "RESOLVED") {
    const res = await pool.query(
      `SELECT o.label FROM resolutions r JOIN market_outcomes o ON o.id = r.resolved_outcome_id
        WHERE r.market_id = $1 AND r.kind = 'RESOLVED'`, [mk.id]);
    resolvedOutcomeLabel = res.rows[0]?.label ?? null;
  }

  return {
    slug: mk.slug, title: mk.title, status: mk.status,
    isElectoral: mk.is_electoral, closeAt: mk.close_at, type: mk.type,
    categoryName: mk.category_name,
    outcomes: out.rows.map((r, i) => ({
      label: r.label, price: prices[i], isCatchall: r.is_catchall })),
    series: out.rows.map((r) => ({
      label: r.label, points: byOutcome.get(r.id) ?? [] })),
    resolvedOutcomeLabel,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 2. WIDGET HTML (autocontido; sem JS externo; ~4 KB)
// ---------------------------------------------------------------------------
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;");
const pct = (p: number) => `${(p * 100).toFixed(p >= 0.995 ? 1 : 0)}%`;

function sparklinePath(pts: [number, number][], w: number, h: number): string {
  if (pts.length < 2) return "";
  return pts.map(([t, p], i) =>
    `${i ? "L" : "M"}${(t * w).toFixed(1)},${(h - p * h).toFixed(1)}`).join(" ");
}

/** Outcome "manchete" p/ card e compartilhamento: SIM em BINARY, líder
 *  (excluindo OUTROS) em MULTI — mesma escolha nos dois lugares. */
function pickLeadingOutcome(d: PublicMarketData) {
  if (d.type === "BINARY") return d.outcomes.find((o) => o.label === "SIM");
  return [...d.outcomes].filter((o) => !o.isCatchall).sort((a, b) => b.price - a.price)[0];
}

export function renderEmbedHtml(d: PublicMarketData): string {
  const url = `${EMBED_CONFIG.baseUrl}/m/${d.slug}?utm_source=embed&utm_medium=widget`;
  // BINARY: destaque no SIM | MULTI: top 4 por preço (catchall sempre por último)
  const vis = d.type === "BINARY"
    ? d.outcomes.filter((o) => o.label === "SIM")
    : [...d.outcomes].sort((a, b) =>
        (a.isCatchall ? 1 : 0) - (b.isCatchall ? 1 : 0) || b.price - a.price
      ).slice(0, 4);

  const resolvido = d.status === "RESOLVED" && d.resolvedOutcomeLabel;
  const linhas = vis.map((o, i) => {
    const serie = d.series.find((s) => s.label === o.label);
    const path = sparklinePath(serie?.points ?? [], 120, 28);
    const cor = d.type === "BINARY" ? CORES[0] : CORES[i % CORES.length];
    const lbl = resolvido && d.type === "BINARY"
      ? `Feito: ${d.resolvedOutcomeLabel}`
      : d.type === "BINARY" ? "Chance de SIM" : o.label;
    return `<div class="row">
      <span class="lbl" title="${esc(o.label)}">${esc(lbl)}</span>
      <svg class="spark" viewBox="0 0 120 28" preserveAspectRatio="none">${
        path ? `<path d="${path}" fill="none" stroke="${cor}" stroke-width="2"/>` : ""
      }</svg>
      <span class="pct" style="color:${cor}">${pct(o.price)}</span>
    </div>`;
  }).join("\n");

  const badge = d.status === "RESOLVED" ? `<span class="badge">RESOLVIDO</span>`
              : d.status === "CLOSED"   ? `<span class="badge">ENCERRADO</span>` : "";

  // Sem fonte externa (requisito "zero dependência" — funciona offline em
  // qualquer site de terceiro): Georgia é o próprio fallback de --serif no
  // resto do produto (tokens.css), não uma escolha nova pra esse widget.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:light}
  body{margin:0;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;
       background:#FAF8F3;color:#1E2733}
  .card{border:1px solid #E3DDD0;border-radius:10px;padding:14px 16px;max-width:420px}
  .title{font-weight:600;font-size:15px;margin:0 0 10px}
  .title a{color:inherit;text-decoration:none}
  .row{display:flex;align-items:center;gap:10px;padding:5px 0}
  .lbl{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#5C6672}
  .spark{width:120px;height:28px;flex:none}
  .pct{font-weight:700;font-variant-numeric:tabular-nums;width:52px;text-align:right}
  .foot{display:flex;justify-content:space-between;align-items:center;
        margin-top:10px;padding-top:10px;border-top:1px solid #E3DDD0}
  .brand{font:700 13px Georgia,serif;color:#1E2733;text-decoration:none}
  .brand b{color:#4F2E99}
  .selo{display:inline-block;font:600 9px ui-monospace,monospace;color:#4F2E99;
        border:1.5px solid #4F2E99;border-radius:3px;padding:0 3px;margin-left:3px;
        transform:rotate(-3deg);vertical-align:2px}
  .badge{font-size:10px;font-weight:700;background:#F1EDE4;color:#5C6672;
         border-radius:99px;padding:2px 8px;margin-left:8px;vertical-align:middle}
  .disc{font-size:10px;color:#5C6672;margin-top:8px}
</style></head><body>
<div class="card">
  <p class="title"><a href="${url}" target="_blank" rel="noopener">${esc(d.title)}</a>${badge}</p>
  ${linhas}
  <div class="foot">
    <a class="brand" href="${url}" target="_blank" rel="noopener">Dito<b>Feito</b><span class="selo">✓</span></a>
    <span style="font-size:11px;color:#5C6672">participe da previsão</span>
  </div>
  ${d.isElectoral ? `<p class="disc">${DISCLAIMER}</p>` : ""}
</div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// 3. CARD OG 1200x630 (og:image -> preview no WhatsApp/redes)
//    Paleta/tipografia = identidade-ditofeito.md (papel/violeta + IBM Plex),
//    nunca o azul/navy genérico de placeholder. renderCardSvg gera o SVG;
//    renderCardPng converte pra PNG com as fontes embutidas (WhatsApp exige
//    raster — não pré-visualiza SVG).
// ---------------------------------------------------------------------------
const TOKENS = {
  papel: "#FAF8F3", tinta: "#1E2733", grafite: "#5C6672",
  violeta: "#4F2E99", linha: "#E3DDD0",
} as const;

// Sem engine de layout real disponível pro SVG (não é canvas/DOM), então
// quebra de linha é heurística por largura média de glifo — mas por PIXEL,
// não por nº de caracteres fixo. O bug que isso substitui: título cortado
// em 70 chars vazava do canvas 1200px pra qualquer título que não fosse
// curto (e a maioria dos enunciados de mercado não é).
const AVG_CHAR_WIDTH_EM = 0.58; // IBM Plex Sans 600, medido contra render real

function wrapText(text: string, maxWidthPx: number, fontSizePx: number, maxLines: number): string[] {
  const maxChars = Math.max(4, Math.floor(maxWidthPx / (fontSizePx * AVG_CHAR_WIDTH_EM)));
  const words = text.split(/\s+/).filter(Boolean);
  const allLines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) allLines.push(current);
      current = word.length <= maxChars ? word : word.slice(0, maxChars);
    }
  }
  if (current) allLines.push(current);
  if (allLines.length <= maxLines) return allLines;

  const shown = allLines.slice(0, maxLines);
  const last = shown[maxLines - 1];
  const room = Math.max(1, maxChars - 1);
  shown[maxLines - 1] = (last.length > room ? last.slice(0, room).trimEnd() : last) + "…";
  return shown;
}

const cardDateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

export function renderCardSvg(d: PublicMarketData): string {
  const lider = pickLeadingOutcome(d);
  const serie = d.series.find((s) => s.label === lider?.label);

  const TITLE_SIZE = 40;
  const TITLE_LINE_H = 50;
  const titleLines = wrapText(d.title, 1040, TITLE_SIZE, 2);
  const extraLine = titleLines.length > 1 ? 1 : 0;

  const numberY = 310 + extraLine * TITLE_LINE_H;
  const labelY = numberY + 55;
  const sparkY = numberY - 90;
  const path = sparklinePath(serie?.points ?? [], 560, 150);

  // Mercado RESOLVED não é mais "chance de X%" — é resultado decidido
  // (identidade §4: carimbo "FEITO" sobre o outcome vencedor). Card
  // compartilhado tempos depois de resolvido não pode parecer aposta ainda
  // em aberto.
  const labelTexto = d.status === "RESOLVED" && d.resolvedOutcomeLabel
    ? `feito: ${d.resolvedOutcomeLabel}`
    : d.type === "BINARY" ? "chance de SIM" : (lider?.label ?? "");
  const labelWrapped = wrapText(labelTexto, 420, 34, 1)[0] ?? "";

  const dataEncerra = `encerra ${cardDateFmt.format(new Date(d.closeAt))}`;
  const statusBadge = d.status === "RESOLVED" ? "FEITO ✓"
                     : d.status === "CLOSED"   ? "ENCERRADO" : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${TOKENS.papel}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${TOKENS.violeta}"/>
  <text x="80" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="600"
        letter-spacing="1.4" fill="${TOKENS.grafite}">${esc(d.categoryName.toUpperCase())}</text>
  ${statusBadge ? `<text x="1120" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="700"
        letter-spacing="1.4" fill="${TOKENS.violeta}" text-anchor="end">${esc(statusBadge)}</text>` : ""}
  ${titleLines.map((line, i) => `<text x="80" y="${118 + i * TITLE_LINE_H}" font-family="IBM Plex Sans" font-size="${TITLE_SIZE}"
        font-weight="600" fill="${TOKENS.tinta}">${esc(line)}</text>`).join("\n  ")}
  <text x="80" y="${numberY}" font-family="IBM Plex Mono" font-size="130"
        font-weight="700" fill="${TOKENS.violeta}">${pct(lider?.price ?? 0)}</text>
  <text x="80" y="${labelY}" font-family="IBM Plex Mono" font-size="34"
        font-weight="600" fill="${TOKENS.grafite}">${esc(labelWrapped)}</text>
  <g transform="translate(560,${sparkY})">
    ${path ? `<path d="${path}" fill="none" stroke="${TOKENS.violeta}" stroke-width="5"
      stroke-linecap="round" stroke-linejoin="round"/>` : ""}
  </g>
  <text x="80" y="540" font-family="IBM Plex Serif" font-size="34" font-weight="700" fill="${TOKENS.tinta}">Dito<tspan fill="${TOKENS.violeta}">Feito</tspan></text>
  <g transform="translate(300,524) rotate(-8)">
    <circle r="22" fill="none" stroke="${TOKENS.violeta}" stroke-width="2.5"/>
    <text x="0" y="8" font-family="IBM Plex Mono" font-size="22" font-weight="700"
          fill="${TOKENS.violeta}" text-anchor="middle">✓</text>
  </g>
  <text x="1120" y="551" font-family="IBM Plex Mono" font-size="18" fill="${TOKENS.grafite}" text-anchor="end">${esc(dataEncerra)}</text>
  ${d.isElectoral ? `<text x="80" y="590" font-family="IBM Plex Sans"
        font-size="20" fill="${TOKENS.grafite}">${DISCLAIMER}</text>` : ""}
</svg>`;
}

// ---------------------------------------------------------------------------
// 3c. CARD OG GENÉRICO DA HOME (og:image de ditofeito.com — sem mercado
//     específico, só marca + prova social simples). Mesmo canvas 1200x630
//     e paleta do card de mercado, pra manter consistência quando os dois
//     tipos de link circulam juntos numa conversa.
// ---------------------------------------------------------------------------
export function renderHomeCardSvg(openMarketsCount: number): string {
  const stat = openMarketsCount > 0
    ? `${openMarketsCount} mercado${openMarketsCount === 1 ? "" : "s"} aberto${openMarketsCount === 1 ? "" : "s"} agora`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${TOKENS.papel}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${TOKENS.violeta}"/>
  <text x="80" y="300" font-family="IBM Plex Serif" font-size="90" font-weight="700" fill="${TOKENS.tinta}">Dito<tspan fill="${TOKENS.violeta}">Feito</tspan></text>
  <g transform="translate(1040,265) rotate(-8)">
    <circle r="34" fill="none" stroke="${TOKENS.violeta}" stroke-width="4"/>
    <text x="0" y="13" font-family="IBM Plex Mono" font-size="36" font-weight="700"
          fill="${TOKENS.violeta}" text-anchor="middle">✓</text>
  </g>
  <text x="80" y="368" font-family="IBM Plex Sans" font-size="32" font-weight="500" fill="${TOKENS.grafite}">Mercado de previsão por reputação — pontos, não dinheiro.</text>
  ${stat ? `<text x="80" y="540" font-family="IBM Plex Mono" font-size="24" font-weight="600" fill="${TOKENS.violeta}">${esc(stat)}</text>` : ""}
</svg>`;
}

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");
const CARD_FONT_FILES = [
  path.join(FONTS_DIR, "IBMPlexSans-Variable.ttf"),
  path.join(FONTS_DIR, "IBMPlexMono-Bold.ttf"),
  path.join(FONTS_DIR, "IBMPlexMono-SemiBold.ttf"),
  path.join(FONTS_DIR, "IBMPlexSerif-Bold.ttf"),
];

function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: CARD_FONT_FILES,
      loadSystemFonts: false, // determinístico — não depende do que o container tem instalado
      defaultFontFamily: "IBM Plex Sans",
    },
  });
  return resvg.render().asPng();
}

export function renderCardPng(d: PublicMarketData): Buffer {
  return svgToPng(renderCardSvg(d));
}

export function renderHomeCardPng(openMarketsCount: number): Buffer {
  return svgToPng(renderHomeCardSvg(openMarketsCount));
}

// ---------------------------------------------------------------------------
// 3b. PÁGINA DE COMPARTILHAMENTO (/share/:slug) — meta tags og:* de verdade
//    apps/web é uma SPA: o index.html estático não tem og:image nenhum pra
//    /m/:slug, então compartilhar o link direto não mostra nada. Em vez de
//    SSR completo, o nginx detecta o crawler de rede social (WhatsApp,
//    Twitterbot, facebookexternalhit etc. — ver infra/nginx/) e desvia SÓ
//    ele pra cá; humano continua recebendo a SPA normalmente. Publicado
//    aqui (não em /m/:slug) porque a API não deve competir com a rota da
//    SPA — quem decide se um pedido é bot ou não é o nginx, na borda.
// ---------------------------------------------------------------------------
export function renderShareHtml(d: PublicMarketData): string {
  const url = `${EMBED_CONFIG.baseUrl}/m/${d.slug}`;
  const cardUrl = `${EMBED_CONFIG.baseUrl}/card/${d.slug}.png`;
  const lider = pickLeadingOutcome(d);
  const desc = d.status === "RESOLVED" && d.resolvedOutcomeLabel
    ? `Feito: ${d.resolvedOutcomeLabel} — pode escrever.`
    : lider
    ? `${d.type === "BINARY" ? "Chance de SIM" : lider.label}: ${pct(lider.price)} — pode escrever.`
    : "pode escrever.";

  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<title>${esc(d.title)} — ${esc(EMBED_CONFIG.brand)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(EMBED_CONFIG.brand)}">
<meta property="og:title" content="${esc(d.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${cardUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(d.title)}">
<meta name="twitter:image" content="${cardUrl}">
<meta http-equiv="refresh" content="0; url=${url}">
</head><body>
<p>Redirecionando… <a href="${url}">clique aqui</a> se a página não abrir sozinha.</p>
</body></html>`;
}

// ---------------------------------------------------------------------------
// 3d. SITEMAP.XML — gerado na hora a partir dos mercados publicados (nunca
//    DRAFT); mais simples que gerar em build time e sempre reflete o banco.
// ---------------------------------------------------------------------------
async function renderSitemap(pool: Pool): Promise<string> {
  const r = await pool.query(
    `SELECT slug, created_at FROM markets WHERE status != 'DRAFT' ORDER BY created_at DESC`);
  const iso = (d: Date) => new Date(d).toISOString();
  const staticUrls = [
    { loc: `${EMBED_CONFIG.baseUrl}/`, priority: "1.0" },
    { loc: `${EMBED_CONFIG.baseUrl}/entrar`, priority: "0.3" },
    { loc: `${EMBED_CONFIG.baseUrl}/cadastro`, priority: "0.3" },
  ];
  const urls = [
    ...staticUrls.map((u) => `<url><loc>${u.loc}</loc><priority>${u.priority}</priority></url>`),
    ...r.rows.map((m) =>
      `<url><loc>${EMBED_CONFIG.baseUrl}/m/${m.slug}</loc><lastmod>${iso(m.created_at)}</lastmod><priority>0.8</priority></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}

// ---------------------------------------------------------------------------
// 4. WIRING HTTP (Express — rotas públicas, fora do tRPC, cacheáveis na CDN)
// ---------------------------------------------------------------------------
import type express from "express";
import { asyncHandler } from "./asyncHandler.js";

export function mountEmbed(app: express.Express, pool: Pool) {
  const cache = (res: express.Response) => res.set({
    "Cache-Control": `public, s-maxage=${EMBED_CONFIG.cacheSeconds}, stale-while-revalidate=300`,
    "Content-Security-Policy": "frame-ancestors *",   // embed liberado
  });
  app.get("/sitemap.xml", asyncHandler(async (req, res) => {
    res.set({ "Cache-Control": `public, s-maxage=3600, stale-while-revalidate=86400` });
    res.type("application/xml").send(await renderSitemap(pool));
  }));
  app.get("/embed/:slug", asyncHandler(async (req, res) => {
    const d = await getMarketPublicData(pool, req.params.slug);
    if (!d) return res.status(404).send("mercado não encontrado");
    cache(res); res.type("html").send(renderEmbedHtml(d));
  }));
  // Só alcançada via nginx quando o User-Agent é um crawler de rede social
  // (ver infra/nginx/) — humano nunca deveria bater aqui de propósito.
  app.get("/share/:slug", asyncHandler(async (req, res) => {
    const d = await getMarketPublicData(pool, req.params.slug);
    if (!d) return res.status(404).send("mercado não encontrado");
    cache(res); res.type("html").send(renderShareHtml(d));
  }));
  app.get("/api/pub/:slug.json", asyncHandler(async (req, res) => {
    const d = await getMarketPublicData(pool, req.params.slug);
    if (!d) return res.status(404).json({ erro: "não encontrado" });
    cache(res); res.json(d);
  }));
  // Card genérico da home (og:image de ditofeito.com) — registrado antes do
  // /card/:slug.* genérico, senão "home" seria lido como um slug de mercado.
  app.get("/card/home.svg", asyncHandler(async (req, res) => {
    const r = await pool.query(`SELECT count(*)::int AS n FROM markets WHERE status = 'OPEN'`);
    cache(res); res.type("image/svg+xml").send(renderHomeCardSvg(r.rows[0].n));
  }));
  app.get("/card/home.png", asyncHandler(async (req, res) => {
    const r = await pool.query(`SELECT count(*)::int AS n FROM markets WHERE status = 'OPEN'`);
    cache(res); res.type("image/png").send(renderHomeCardPng(r.rows[0].n));
  }));
  app.get("/card/:slug.svg", asyncHandler(async (req, res) => {
    const d = await getMarketPublicData(pool, req.params.slug);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/svg+xml").send(renderCardSvg(d));
  }));
  // PNG é o que vai em og:image — WhatsApp (e a maioria dos crawlers de
  // preview) não renderiza SVG em og:image, só raster.
  app.get("/card/:slug.png", asyncHandler(async (req, res) => {
    const d = await getMarketPublicData(pool, req.params.slug);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/png").send(renderCardPng(d));
  }));
}

// Snippet que o candidato cola no site dele (página do mercado exibe pronto):
// <iframe src="{base}/embed/{slug}" width="440" height="260"
//         style="border:0" loading="lazy" title="Previsão"></iframe>
