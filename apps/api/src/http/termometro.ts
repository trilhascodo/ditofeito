// ============================================================================
// termometro.ts — Widget agregado "Termômetro DitoFeito": várias posições
// (mercados) de uma categoria numa lista compacta, pra embutir em blog/site
// de terceiro. Diferente de /embed/:slug (embed.ts, 1 mercado só) — aqui é
// um painel com vários, pensado pro outreach de blogs políticos (cada um
// embute o termômetro geral, com o mercado do candidato local em destaque).
//
//   GET /embed/termometro?categoria=<slug>&destaque=<marketSlug>&limit=<n>
//       &utm_source=...&utm_medium=...&utm_campaign=...
//
// Mesmos requisitos de produto do embed.ts (zero dependência externa,
// cacheável, frame-ancestors * liberado, disclaimer Lei 9.504 quando tem
// mercado eleitoral na lista) — reaproveita EMBED_CONFIG/esc/pct/DISCLAIMER
// de lá em vez de duplicar.
// ============================================================================
import type { Pool } from "pg";
import type express from "express";
import { lmsrPrices } from "@ditofeito/core";
import { EMBED_CONFIG, esc, pct, DISCLAIMER } from "./embed.js";
import { asyncHandler } from "./asyncHandler.js";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

export interface TermometroItem {
  slug: string; title: string; label: string; price: number; delta: number; isElectoral: boolean;
}

// Mesma lógica de outcome "manchete" + delta 24h do market.trending (router
// tRPC) — reimplementada aqui porque este é um endpoint HTTP puro (como todo
// embed.ts), não pode chamar o router tRPC direto.
export async function getTermometroData(
  pool: Pool, opts: { categorySlug?: string; destaqueSlug?: string; limit?: number },
): Promise<TermometroItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const params: unknown[] = [];
  let where = "m.status = 'OPEN'";
  if (opts.categorySlug) { params.push(opts.categorySlug); where += ` AND c.slug = $${params.length}`; }

  const r = await pool.query(
    `SELECT m.id, m.slug, m.title, m.type, m.liquidity_b, m.is_electoral
       FROM markets m JOIN categories c ON c.id = m.category_id
      WHERE ${where}`,
    params,
  );
  if (!r.rowCount) return [];
  const marketIds = r.rows.map((row) => row.id as string);

  const out = await pool.query(
    `SELECT market_id, id, label, q, is_catchall FROM market_outcomes
      WHERE market_id = ANY($1) ORDER BY market_id, display_order, id`,
    [marketIds],
  );
  const outcomesByMarket = new Map<string, { id: string; label: string; q: number; isCatchall: boolean }[]>();
  for (const o of out.rows) {
    const arr = outcomesByMarket.get(o.market_id) ?? [];
    arr.push({ id: o.id, label: o.label, q: Number(o.q), isCatchall: o.is_catchall });
    outcomesByMarket.set(o.market_id, arr);
  }

  const leaderByMarket = new Map<string, { outcomeId: string; label: string; price: number }>();
  for (const row of r.rows) {
    const outcomes = outcomesByMarket.get(row.id as string) ?? [];
    const prices = lmsrPrices(outcomes.map((o) => o.q), Number(row.liquidity_b));
    let idx = row.type === "BINARY" ? outcomes.findIndex((o) => o.label === "SIM") : -1;
    if (idx < 0) {
      let best = -1;
      outcomes.forEach((o, i) => { if (!o.isCatchall && (best < 0 || prices[i] > prices[best])) best = i; });
      idx = best;
    }
    if (idx >= 0) leaderByMarket.set(row.id as string, { outcomeId: outcomes[idx].id, label: outcomes[idx].label, price: prices[idx] });
  }

  const leaderIds = [...leaderByMarket.values()].map((l) => l.outcomeId);
  const snaps = leaderIds.length ? await pool.query(
    `SELECT DISTINCT ON (outcome_id) outcome_id, price
       FROM price_snapshots
      WHERE outcome_id = ANY($1) AND ts <= now() - interval '24 hours'
      ORDER BY outcome_id, ts DESC`,
    [leaderIds],
  ) : { rows: [] as { outcome_id: string; price: string }[] };
  const price24hByOutcome = new Map<string, number>();
  for (const s of snaps.rows) price24hByOutcome.set(s.outcome_id, Number(s.price));

  const items: TermometroItem[] = [];
  for (const row of r.rows) {
    const leader = leaderByMarket.get(row.id as string);
    if (!leader) continue;
    const before = price24hByOutcome.get(leader.outcomeId);
    // Mercado novo (sem snapshot de 24h atrás ainda) entra com delta 0 em vez
    // de ser descartado — diferente do market.trending (top-5 "quem mais se
    // moveu"), aqui é um painel de categoria: excluir deixaria buraco.
    items.push({
      slug: row.slug as string, title: row.title as string,
      label: leader.label, price: leader.price,
      delta: before === undefined ? 0 : leader.price - before,
      isElectoral: row.is_electoral as boolean,
    });
  }

  items.sort((a, b) => {
    if (opts.destaqueSlug) {
      if (a.slug === opts.destaqueSlug) return -1;
      if (b.slug === opts.destaqueSlug) return 1;
    }
    return Math.abs(b.delta) - Math.abs(a.delta);
  });

  return items.slice(0, limit);
}

function fmtDelta(d: number): string {
  const seta = d > 0 ? "▲" : d < 0 ? "▼" : "•";
  return `${seta} ${(Math.abs(d) * 100).toFixed(1)}`;
}

export function renderTermometroHtml(
  items: TermometroItem[],
  opts: { categoryName?: string; destaqueSlug?: string; utmQuery: string },
): string {
  const heading = opts.categoryName ? `Termômetro — ${opts.categoryName}` : "Termômetro DitoFeito";
  const hasElectoral = items.some((i) => i.isElectoral);

  const rows = items.map((it) => {
    const url = `${EMBED_CONFIG.baseUrl}/m/${it.slug}${opts.utmQuery}`;
    const destaque = it.slug === opts.destaqueSlug;
    const corDelta = it.delta > 0 ? "#0F8F5F" : it.delta < 0 ? "#C93A1F" : "#5C6672";
    return `<a class="row${destaque ? " destaque" : ""}" href="${url}" target="_blank" rel="noopener">
      <span class="ttl" title="${esc(it.title)}">${esc(it.title)}</span>
      <span class="pct">${pct(it.price)}</span>
      <span class="delta" style="color:${corDelta}">${fmtDelta(it.delta)}</span>
    </a>`;
  }).join("\n");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:light}
  body{margin:0;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;
       background:#FAF8F3;color:#1E2733}
  .card{border:1px solid #E3DDD0;border-radius:10px;padding:14px 16px;max-width:420px}
  .head{font-weight:600;font-size:15px;margin:0 0 10px;color:#1E2733}
  .row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #E3DDD0;
       text-decoration:none;color:inherit}
  .row:last-of-type{border-bottom:0}
  .row.destaque{background:#E8DFF7;margin:0 -10px;padding:8px 10px;border-radius:8px;border-bottom:0}
  .ttl{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
  .pct{font-weight:700;font-variant-numeric:tabular-nums;width:48px;text-align:right;color:#4F2E99}
  .delta{font-weight:600;font-variant-numeric:tabular-nums;width:66px;text-align:right;font-size:12px}
  .foot{display:flex;justify-content:space-between;align-items:center;
        margin-top:10px;padding-top:10px;border-top:1px solid #E3DDD0}
  .brand{font:700 13px Georgia,serif;color:#1E2733;text-decoration:none}
  .brand b{color:#4F2E99}
  .selo{display:inline-block;font:600 9px ui-monospace,monospace;color:#4F2E99;
        border:1.5px solid #4F2E99;border-radius:3px;padding:0 3px;margin-left:3px;
        transform:rotate(-3deg);vertical-align:2px}
  .disc{font-size:10px;color:#5C6672;margin-top:8px}
  .empty{color:#5C6672;font-size:13px;padding:8px 0;margin:0}
</style></head><body>
<div class="card">
  <p class="head">${esc(heading)}</p>
  ${items.length ? rows : `<p class="empty">Nenhum mercado aberto no momento.</p>`}
  <div class="foot">
    <a class="brand" href="${EMBED_CONFIG.baseUrl}/${opts.utmQuery}" target="_blank" rel="noopener">Dito<b>Feito</b><span class="selo">✓</span></a>
    <span style="font-size:11px;color:#5C6672">participe da previsão</span>
  </div>
  ${hasElectoral ? `<p class="disc">${DISCLAIMER}</p>` : ""}
</div>
</body></html>`;
}

function readUtmQuery(query: express.Request["query"]): string {
  const utm = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith("utm_") && typeof v === "string") utm.set(k, v);
  }
  const s = utm.toString();
  return s ? `?${s}` : "";
}

export function mountTermometro(app: express.Express, pool: Pool) {
  app.get("/embed/termometro", asyncHandler(async (req, res) => {
    const categoria = typeof req.query.categoria === "string" ? req.query.categoria : undefined;
    const destaque = typeof req.query.destaque === "string" ? req.query.destaque : undefined;
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;

    let categoryName: string | undefined;
    if (categoria) {
      const c = await pool.query(`SELECT name FROM categories WHERE slug = $1`, [categoria]);
      categoryName = c.rows[0]?.name as string | undefined;
    }

    const items = await getTermometroData(pool, { categorySlug: categoria, destaqueSlug: destaque, limit });
    res.set({
      "Cache-Control": `public, s-maxage=${EMBED_CONFIG.cacheSeconds}, stale-while-revalidate=300`,
      "Content-Security-Policy": "frame-ancestors *",
    });
    res.type("html").send(renderTermometroHtml(items, {
      categoryName, destaqueSlug: destaque, utmQuery: readUtmQuery(req.query),
    }));
  }));
}

// Snippet que o blog cola no site (kit de outreach entrega isso já
// preenchido com a categoria e o mercado do candidato local):
// <iframe src="{base}/embed/termometro?categoria={slug}&destaque={marketSlug}
//   &utm_source=blog&utm_medium=embed&utm_campaign={nome-do-blog}"
//   width="420" height="320" style="border:0" loading="lazy"
//   title="Termômetro DitoFeito"></iframe>
