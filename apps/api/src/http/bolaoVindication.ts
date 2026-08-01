// ============================================================================
// bolaoVindication.ts — Card de vindicação de bolão ("eu disse", compartilhável)
//
// Mesmo padrão de vindication.ts (prova pública compartilhável), mas pro
// palpite acertado dentro de um bolão de grupo em vez de posição num
// mercado LMSR — token gerado sob demanda em grupos.ts::bolao.detail (ver
// comentário lá: WINNER não tem mutation de resolução própria pra
// interceptar, ao contrário de trade.ts::resolveMarket).
//
// Endpoints públicos (mesmo padrão de embed.ts/vindication.ts):
//   GET /card/bolao-vindicacao/:token.png -> raster 1200x630 (og:image)
//   GET /card/bolao-vindicacao/:token.svg -> fonte, útil pra depurar
//   GET /bolao-vindicacao/:token          -> página com og:image de verdade +
//                                            link de volta pro bolão
// ============================================================================
import type { Pool } from "pg";
import { EMBED_CONFIG, TOKENS, esc, wrapText, svgToPng } from "./embed.js";
import type { GuessType } from "../domain/bolao.js";

export interface BolaoVindicationData {
  displayName: string; handle: string;
  groupName: string;
  marketTitle: string; marketSlug: string;
  guessType: GuessType;
  guessLabel: string; // já formatado: label do outcome, "2 x 1" ou o número
}

function formatGuessLabel(
  guessType: GuessType,
  outcomeLabel: string | null,
  homeScore: number | null,
  awayScore: number | null,
  guessNumber: number | null,
): string {
  if (guessType === "WINNER") return outcomeLabel ?? "—";
  if (guessType === "SCORE") return `${homeScore ?? "—"} x ${awayScore ?? "—"}`;
  return guessNumber !== null ? String(guessNumber) : "—";
}

export async function getBolaoVindicationData(pool: Pool, token: string): Promise<BolaoVindicationData | null> {
  const r = await pool.query(
    `SELECT u.display_name, u.handle, g.name AS group_name,
            m.title AS market_title, m.slug AS market_slug, b.guess_type,
            mo.label AS outcome_label, bp.guess_home_score, bp.guess_away_score, bp.guess_number
       FROM bolao_vindication_cards bvc
       JOIN boloes b ON b.id = bvc.bolao_id
       JOIN groups g ON g.id = b.group_id
       JOIN markets m ON m.id = b.market_id
       JOIN users u ON u.id = bvc.user_id
       JOIN bolao_palpites bp ON bp.bolao_id = bvc.bolao_id AND bp.user_id = bvc.user_id
       LEFT JOIN market_outcomes mo ON mo.id = bp.guess_outcome_id
      WHERE bvc.share_token = $1`,
    [token],
  );
  if (!r.rowCount) return null;
  const row = r.rows[0];
  const guessType = row.guess_type as GuessType;
  return {
    displayName: row.display_name as string, handle: row.handle as string,
    groupName: row.group_name as string,
    marketTitle: row.market_title as string, marketSlug: row.market_slug as string,
    guessType,
    guessLabel: formatGuessLabel(
      guessType, row.outcome_label as string | null,
      row.guess_home_score as number | null, row.guess_away_score as number | null,
      row.guess_number !== null ? Number(row.guess_number) : null,
    ),
  };
}

export function renderBolaoVindicationSvg(d: BolaoVindicationData): string {
  const titleLines = wrapText(d.marketTitle, 1040, 34, 2);
  const extraLine = titleLines.length > 1 ? 1 : 0;
  const numberY = 300 + extraLine * 44;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${TOKENS.papel}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${TOKENS.violeta}"/>
  <text x="80" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="600"
        letter-spacing="1.4" fill="${TOKENS.violeta}">VOCÊ ACERTOU O BOLÃO · ${esc(d.groupName.toUpperCase())}</text>
  <text x="1120" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="700"
        letter-spacing="1.4" fill="${TOKENS.violeta}" text-anchor="end">FEITO ✓</text>
  <text x="80" y="112" font-family="IBM Plex Sans" font-size="24" font-weight="600" fill="${TOKENS.grafite}">
    @${esc(d.handle)} apostou:
  </text>
  ${titleLines.map((line, i) => `<text x="80" y="${152 + i * 44}" font-family="IBM Plex Sans" font-size="34"
        font-weight="600" fill="${TOKENS.tinta}">${esc(line)}</text>`).join("\n  ")}
  <text x="80" y="${numberY}" font-family="IBM Plex Mono" font-size="90"
        font-weight="700" fill="${TOKENS.violeta}">${esc(d.guessLabel)}</text>
  <text x="80" y="${numberY + 46}" font-family="IBM Plex Mono" font-size="26"
        font-weight="600" fill="${TOKENS.grafite}">foi o palpite de ${esc(d.displayName)} — e foi isso que aconteceu</text>
  <text x="80" y="540" font-family="IBM Plex Serif" font-size="34" font-weight="700" fill="${TOKENS.tinta}">Dito<tspan fill="${TOKENS.violeta}">Feito</tspan></text>
  <g transform="translate(300,524) rotate(-8)">
    <circle r="22" fill="none" stroke="${TOKENS.violeta}" stroke-width="2.5"/>
    <text x="0" y="8" font-family="IBM Plex Mono" font-size="22" font-weight="700"
          fill="${TOKENS.violeta}" text-anchor="middle">✓</text>
  </g>
  <text x="1120" y="521" font-family="IBM Plex Mono" font-size="18" font-weight="700"
        fill="${TOKENS.violeta}" text-anchor="end">PALPITE ENTRE AMIGOS</text>
</svg>`;
}

export function renderBolaoVindicationPng(d: BolaoVindicationData): Buffer {
  return svgToPng(renderBolaoVindicationSvg(d));
}

export function renderBolaoVindicationHtml(d: BolaoVindicationData, token: string): string {
  const marketUrl = `${EMBED_CONFIG.baseUrl}/m/${d.marketSlug}`;
  const shareUrl = `${EMBED_CONFIG.baseUrl}/bolao-vindicacao/${token}`;
  const cardUrl = `${EMBED_CONFIG.baseUrl}/card/bolao-vindicacao/${token}.png`;
  const desc = `${d.displayName} acertou "${d.guessLabel}" no bolão do grupo "${d.groupName}" — ${d.marketTitle}.`;

  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.displayName)} acertou o bolão — DitoFeito</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="DitoFeito">
<meta property="og:title" content="${esc(d.displayName)} acertou o bolão: ${esc(d.marketTitle)}">
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

export function mountBolaoVindication(app: express.Express, pool: Pool) {
  const cache = (res: express.Response) => res.set({
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
  });
  app.get("/card/bolao-vindicacao/:token.svg", asyncHandler(async (req, res) => {
    const d = await getBolaoVindicationData(pool, req.params.token);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/svg+xml").send(renderBolaoVindicationSvg(d));
  }));
  app.get("/card/bolao-vindicacao/:token.png", asyncHandler(async (req, res) => {
    const d = await getBolaoVindicationData(pool, req.params.token);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/png").send(renderBolaoVindicationPng(d));
  }));
  app.get("/bolao-vindicacao/:token", asyncHandler(async (req, res) => {
    const d = await getBolaoVindicationData(pool, req.params.token);
    if (!d) return res.status(404).send("card não encontrado");
    cache(res); res.type("html").send(renderBolaoVindicationHtml(d, req.params.token));
  }));
}
