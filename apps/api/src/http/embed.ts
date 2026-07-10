// ============================================================================
// embed.ts — Widget embedável + card de compartilhamento (WhatsApp/OG)
//
// Endpoints públicos (fora do tRPC — são artefatos HTTP cacheáveis):
//   GET /embed/:slug        -> HTML autocontido (iframe em sites de campanha)
//   GET /api/pub/:slug.json -> dados p/ integrações (o "índice" em miniatura)
//   GET /card/:slug.svg     -> card 1200x630 p/ og:image (WhatsApp/redes)
//
// Requisitos de produto embutidos:
//   - Zero dependência externa no HTML (funciona em qualquer site, offline-ish)
//   - Disclaimer Lei 9.504 DENTRO do artefato quando is_electoral
//   - Link de volta com UTM (o embed é canal de aquisição)
//   - Cache: s-maxage=60 + stale-while-revalidate (CDN absorve a campanha)
//   - frame-ancestors * (embed é o objetivo; NUNCA X-Frame-Options: DENY aqui)
// ============================================================================
import type { Pool } from "pg";
import { lmsrPrices } from "@ditofeito/core";

export const EMBED_CONFIG = {
  baseUrl: "https://ditofeito.com.br",
  brand: "DitoFeito",
  sparklineDays: 30,
  sparklinePoints: 60,                     // downsample p/ SVG leve
  cacheSeconds: 60,
} as const;

const DISCLAIMER =
  "Agregado de opiniões de participantes. Não é pesquisa eleitoral (Lei 9.504/97).";

// Paleta neutra p/ outcomes (sem cor partidária — neutralidade visual)
const CORES = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed",
               "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#6b7280"];

// ---------------------------------------------------------------------------
// 1. DADOS PÚBLICOS DO MERCADO
// ---------------------------------------------------------------------------
export interface PublicMarketData {
  slug: string; title: string; status: string; isElectoral: boolean;
  closeAt: string; type: "BINARY" | "MULTI";
  outcomes: { label: string; price: number; isCatchall: boolean }[];
  /** série p/ sparkline: por outcome, pontos [t(0..1), price] */
  series: { label: string; points: [number, number][] }[];
  updatedAt: string;
}

export async function getMarketPublicData(
  pool: Pool, slug: string,
): Promise<PublicMarketData | null> {
  const m = await pool.query(
    `SELECT id, slug, title, status, is_electoral, close_at, type, liquidity_b
       FROM markets WHERE slug = $1
        AND status IN ('OPEN','CLOSED','RESOLVED')`, [slug]);
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

  return {
    slug: mk.slug, title: mk.title, status: mk.status,
    isElectoral: mk.is_electoral, closeAt: mk.close_at, type: mk.type,
    outcomes: out.rows.map((r, i) => ({
      label: r.label, price: prices[i], isCatchall: r.is_catchall })),
    series: out.rows.map((r) => ({
      label: r.label, points: byOutcome.get(r.id) ?? [] })),
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

export function renderEmbedHtml(d: PublicMarketData): string {
  const url = `${EMBED_CONFIG.baseUrl}/m/${d.slug}?utm_source=embed&utm_medium=widget`;
  // BINARY: destaque no SIM | MULTI: top 4 por preço (catchall sempre por último)
  const vis = d.type === "BINARY"
    ? d.outcomes.filter((o) => o.label === "SIM")
    : [...d.outcomes].sort((a, b) =>
        (a.isCatchall ? 1 : 0) - (b.isCatchall ? 1 : 0) || b.price - a.price
      ).slice(0, 4);

  const linhas = vis.map((o, i) => {
    const serie = d.series.find((s) => s.label === o.label);
    const path = sparklinePath(serie?.points ?? [], 120, 28);
    const cor = d.type === "BINARY" ? CORES[0] : CORES[i % CORES.length];
    return `<div class="row">
      <span class="lbl" title="${esc(o.label)}">${esc(
        d.type === "BINARY" ? "Chance de SIM" : o.label)}</span>
      <svg class="spark" viewBox="0 0 120 28" preserveAspectRatio="none">${
        path ? `<path d="${path}" fill="none" stroke="${cor}" stroke-width="2"/>` : ""
      }</svg>
      <span class="pct" style="color:${cor}">${pct(o.price)}</span>
    </div>`;
  }).join("\n");

  const badge = d.status === "RESOLVED" ? `<span class="badge">RESOLVIDO</span>`
              : d.status === "CLOSED"   ? `<span class="badge">ENCERRADO</span>` : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:light}
  body{margin:0;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;
       background:#fff;color:#111827}
  .card{border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;max-width:420px}
  .title{font-weight:600;font-size:15px;margin:0 0 10px}
  .title a{color:inherit;text-decoration:none}
  .row{display:flex;align-items:center;gap:10px;padding:5px 0}
  .lbl{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#374151}
  .spark{width:120px;height:28px;flex:none}
  .pct{font-weight:700;font-variant-numeric:tabular-nums;width:52px;text-align:right}
  .foot{display:flex;justify-content:space-between;align-items:center;
        margin-top:10px;padding-top:10px;border-top:1px solid #f3f4f6}
  .brand{font-size:12px;font-weight:700;color:#2563eb;text-decoration:none}
  .badge{font-size:10px;font-weight:700;background:#f3f4f6;color:#6b7280;
         border-radius:99px;padding:2px 8px;margin-left:8px;vertical-align:middle}
  .disc{font-size:10px;color:#9ca3af;margin-top:8px}
</style></head><body>
<div class="card">
  <p class="title"><a href="${url}" target="_blank" rel="noopener">${esc(d.title)}</a>${badge}</p>
  ${linhas}
  <div class="foot">
    <a class="brand" href="${url}" target="_blank" rel="noopener">${esc(EMBED_CONFIG.brand)} →</a>
    <span style="font-size:11px;color:#9ca3af">participe da previsão</span>
  </div>
  ${d.isElectoral ? `<p class="disc">${DISCLAIMER}</p>` : ""}
</div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// 3. CARD OG 1200x630 (og:image -> preview no WhatsApp/redes)
//    SVG puro; converter p/ PNG no deploy (resvg/sharp) — WhatsApp exige raster.
// ---------------------------------------------------------------------------
export function renderCardSvg(d: PublicMarketData): string {
  const lider = [...d.outcomes]
    .filter((o) => !o.isCatchall && o.label !== "NÃO")
    .sort((a, b) => b.price - a.price)[0];
  const serie = d.series.find((s) => s.label === lider?.label);
  const path = sparklinePath(serie?.points ?? [], 640, 160);
  const titulo = d.title.length > 70 ? d.title.slice(0, 67) + "…" : d.title;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0f172a"/>
  <rect x="0" y="0" width="1200" height="8" fill="#2563eb"/>
  <text x="80" y="120" font-family="Segoe UI,Roboto,sans-serif" font-size="40"
        font-weight="600" fill="#e2e8f0">${esc(titulo)}</text>
  <text x="80" y="330" font-family="Segoe UI,Roboto,sans-serif" font-size="150"
        font-weight="800" fill="#3b82f6">${pct(lider?.price ?? 0)}</text>
  <text x="80" y="390" font-family="Segoe UI,Roboto,sans-serif" font-size="34"
        fill="#94a3b8">${esc(d.type === "BINARY" ? "chance de SIM" : (lider?.label ?? ""))}</text>
  <g transform="translate(480,240)">
    ${path ? `<path d="${path}" fill="none" stroke="#3b82f6" stroke-width="5"
      stroke-linecap="round" stroke-linejoin="round"/>` : ""}
  </g>
  <text x="80" y="530" font-family="Segoe UI,Roboto,sans-serif" font-size="30"
        font-weight="700" fill="#e2e8f0">${esc(EMBED_CONFIG.brand)}</text>
  ${d.isElectoral ? `<text x="80" y="580" font-family="Segoe UI,Roboto,sans-serif"
        font-size="20" fill="#64748b">${DISCLAIMER}</text>` : ""}
</svg>`;
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
  app.get("/embed/:slug", asyncHandler(async (req, res) => {
    const d = await getMarketPublicData(pool, req.params.slug);
    if (!d) return res.status(404).send("mercado não encontrado");
    cache(res); res.type("html").send(renderEmbedHtml(d));
  }));
  app.get("/api/pub/:slug.json", asyncHandler(async (req, res) => {
    const d = await getMarketPublicData(pool, req.params.slug);
    if (!d) return res.status(404).json({ erro: "não encontrado" });
    cache(res); res.json(d);
  }));
  app.get("/card/:slug.svg", asyncHandler(async (req, res) => {
    const d = await getMarketPublicData(pool, req.params.slug);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/svg+xml").send(renderCardSvg(d));
  }));
}

// Snippet que o candidato cola no site dele (página do mercado exibe pronto):
// <iframe src="{base}/embed/{slug}" width="440" height="260"
//         style="border:0" loading="lazy" title="Previsão"></iframe>
