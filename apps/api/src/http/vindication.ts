// ============================================================================
// vindication.ts — Card de vindicação ("eu disse", compartilhável)
//
// Pico emocional da plataforma: prova pública de que alguém tinha razão, no
// exato momento em que o mercado resolve. share_token é opaco (uuid), gerado
// em trade.ts::resolveMarket só pra quem ganhou — não dá pra adivinhar o de
// outra pessoa nem gerar um card falso pra quem perdeu.
//
// Endpoints públicos (mesmo padrão de embed.ts):
//   GET /card/vindicacao/:token.png -> raster 1200x630 (og:image)
//   GET /card/vindicacao/:token.svg -> fonte, útil pra depurar
//   GET /vindicacao/:token          -> página com og:image de verdade +
//                                      link de volta pro mercado (o card
//                                      compartilhado é canal de aquisição)
// ============================================================================
import type { Pool } from "pg";
import { EMBED_CONFIG, TOKENS, esc, wrapText, svgToPng } from "./embed.js";

const cardPct = (p: number) => `${(p * 100).toFixed(p >= 0.995 ? 1 : 0)}%`;

export interface VindicationData {
  displayName: string; handle: string;
  marketTitle: string; marketSlug: string;
  winningLabel: string;
  entryPrice: number;      // probabilidade média que a pessoa pagou (cost_basis/shares)
  pointsWon: number;       // 1 ponto por share vencedora
  skillDelta: number | null; // quanto bateu o mercado (reputation_events.skill_delta)
}

export async function getVindicationData(pool: Pool, token: string): Promise<VindicationData | null> {
  const r = await pool.query(
    `SELECT u.display_name, u.handle, m.title AS market_title, m.slug AS market_slug,
            mo.label AS winning_label, p.shares, p.cost_basis, re.skill_delta
       FROM vindication_cards vc
       JOIN users u ON u.id = vc.user_id
       JOIN markets m ON m.id = vc.market_id
       JOIN resolutions r ON r.market_id = m.id AND r.kind = 'RESOLVED'
       JOIN market_outcomes mo ON mo.id = r.resolved_outcome_id
       JOIN positions p ON p.user_id = vc.user_id AND p.market_id = vc.market_id
                        AND p.outcome_id = mo.id
       LEFT JOIN reputation_events re ON re.user_id = vc.user_id AND re.market_id = vc.market_id
      WHERE vc.share_token = $1`,
    [token],
  );
  if (!r.rowCount) return null;
  const row = r.rows[0];
  const shares = Number(row.shares);
  return {
    displayName: row.display_name as string, handle: row.handle as string,
    marketTitle: row.market_title as string, marketSlug: row.market_slug as string,
    winningLabel: row.winning_label as string,
    entryPrice: shares > 0 ? Number(row.cost_basis) / shares : 0,
    pointsWon: shares,
    skillDelta: row.skill_delta !== null ? Number(row.skill_delta) : null,
  };
}

export function renderVindicationSvg(d: VindicationData): string {
  const titleLines = wrapText(d.marketTitle, 1040, 34, 2);
  const extraLine = titleLines.length > 1 ? 1 : 0;
  const numberY = 300 + extraLine * 44;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${TOKENS.papel}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${TOKENS.violeta}"/>
  <text x="80" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="600"
        letter-spacing="1.4" fill="${TOKENS.violeta}">VOCÊ ACERTOU</text>
  <text x="1120" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="700"
        letter-spacing="1.4" fill="${TOKENS.violeta}" text-anchor="end">FEITO ✓</text>
  <text x="80" y="112" font-family="IBM Plex Sans" font-size="24" font-weight="600" fill="${TOKENS.grafite}">
    @${esc(d.handle)} disse:
  </text>
  ${titleLines.map((line, i) => `<text x="80" y="${152 + i * 44}" font-family="IBM Plex Sans" font-size="34"
        font-weight="600" fill="${TOKENS.tinta}">${esc(line)}</text>`).join("\n  ")}
  <text x="80" y="${numberY}" font-family="IBM Plex Mono" font-size="130"
        font-weight="700" fill="${TOKENS.violeta}">${cardPct(d.entryPrice)}</text>
  <text x="80" y="${numberY + 46}" font-family="IBM Plex Mono" font-size="26"
        font-weight="600" fill="${TOKENS.grafite}">foi a chance que ${esc(d.displayName)} apostou em "${esc(d.winningLabel)}"</text>
  <text x="80" y="540" font-family="IBM Plex Serif" font-size="34" font-weight="700" fill="${TOKENS.tinta}">Dito<tspan fill="${TOKENS.violeta}">Feito</tspan></text>
  <g transform="translate(300,524) rotate(-8)">
    <circle r="22" fill="none" stroke="${TOKENS.violeta}" stroke-width="2.5"/>
    <text x="0" y="8" font-family="IBM Plex Mono" font-size="22" font-weight="700"
          fill="${TOKENS.violeta}" text-anchor="middle">✓</text>
  </g>
  <text x="1120" y="521" font-family="IBM Plex Mono" font-size="22" font-weight="700"
        fill="${TOKENS.violeta}" text-anchor="end">+${d.pointsWon.toFixed(0)} pts</text>
  ${d.skillDelta !== null && d.skillDelta > 0
    ? `<text x="1120" y="551" font-family="IBM Plex Mono" font-size="16" fill="${TOKENS.grafite}" text-anchor="end">bateu o mercado</text>`
    : ""}
</svg>`;
}

export function renderVindicationPng(d: VindicationData): Buffer {
  return svgToPng(renderVindicationSvg(d));
}

export function renderVindicationHtml(d: VindicationData, token: string): string {
  const marketUrl = `${EMBED_CONFIG.baseUrl}/m/${d.marketSlug}`;
  const shareUrl = `${EMBED_CONFIG.baseUrl}/vindicacao/${token}`;
  const cardUrl = `${EMBED_CONFIG.baseUrl}/card/vindicacao/${token}.png`;
  const desc = `${d.displayName} disse ${cardPct(d.entryPrice)} em "${d.winningLabel}" — e foi isso que aconteceu.`;

  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.displayName)} acertou — ${esc(d.marketTitle)} — DitoFeito</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="DitoFeito">
<meta property="og:title" content="${esc(d.displayName)} acertou: ${esc(d.marketTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${cardUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${shareUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${cardUrl}">
<style>
  :root{color-scheme:light}
  body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#FAF8F3;color:#1E2733;
       display:flex;flex-direction:column;align-items:center;padding:32px 20px}
  img{max-width:100%;width:600px;border-radius:12px;border:1px solid #E3DDD0;box-shadow:0 8px 24px rgba(30,39,51,.12)}
  p{max-width:600px;text-align:center;color:#5C6672}
  a.btn{display:inline-block;margin-top:12px;font-weight:600;color:#fff;background:#4F2E99;
        border-radius:8px;padding:12px 22px;text-decoration:none}
</style></head><body>
<img src="${cardUrl}" alt="${esc(desc)}">
<p>${esc(desc)}</p>
<a class="btn" href="${marketUrl}">Ver o mercado no DitoFeito</a>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Wiring HTTP
// ---------------------------------------------------------------------------
import type express from "express";
import { asyncHandler } from "./asyncHandler.js";

export function mountVindication(app: express.Express, pool: Pool) {
  const cache = (res: express.Response) => res.set({
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
  });
  app.get("/card/vindicacao/:token.svg", asyncHandler(async (req, res) => {
    const d = await getVindicationData(pool, req.params.token);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/svg+xml").send(renderVindicationSvg(d));
  }));
  app.get("/card/vindicacao/:token.png", asyncHandler(async (req, res) => {
    const d = await getVindicationData(pool, req.params.token);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/png").send(renderVindicationPng(d));
  }));
  app.get("/vindicacao/:token", asyncHandler(async (req, res) => {
    const d = await getVindicationData(pool, req.params.token);
    if (!d) return res.status(404).send("card não encontrado");
    cache(res); res.type("html").send(renderVindicationHtml(d, req.params.token));
  }));
}
