// ============================================================================
// inviteCard.ts — Card de convite de grupo (compartilhável)
//
// Mesmo padrão de vindication.ts: invite_code de groups já é público (é o
// próprio mecanismo de entrada, ver grupos.ts::joinByCode) — este arquivo só
// dá um canal de distribuição bonito pra ele, pra funcionar como link de
// aquisição em WhatsApp/Telegram/Facebook (que não renderizam og:image sem
// uma página HTML de verdade — o SPA não serve pra isso).
//
// Quando o grupo é kind='ENQUETE' (grupo de propósito único criado por
// grupos.ts::createEnquete, ver 043_enquete_publica.sql), o card mostra a
// pergunta/opções do bolão em vez do resumo genérico "N membros" — é o
// formato pensado pra ser colado em Instagram/Facebook por quem criou.
//
// Endpoints públicos:
//   GET /card/convite/:code.png -> raster 1200x630 (og:image)
//   GET /card/convite/:code.svg -> fonte, útil pra depurar
//   GET /convite/:code          -> página com og:image de verdade + botão que
//                                  leva pro SPA (/grupos/entrar/:code), onde
//                                  a pessoa de fato entra no grupo/palpita
// ============================================================================
import type { Pool } from "pg";
import { EMBED_CONFIG, TOKENS, esc, wrapText, svgToPng } from "./embed.js";
import type { GuessType } from "../domain/bolao.js";

export interface InviteCardData {
  kind: "GRUPO" | "ENQUETE";
  name: string;
  creatorDisplayName: string;
  memberCount: number;
  activeBoloesCount: number;
  enquete: {
    title: string;
    guessType: GuessType;
    outcomes: string[];
    palpiteCount: number;
  } | null;
}

export async function getInviteCardData(pool: Pool, code: string): Promise<InviteCardData | null> {
  const r = await pool.query(
    `SELECT g.id, g.name, g.kind, u.display_name AS creator_name,
            (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
            (SELECT count(*) FROM boloes b
               LEFT JOIN markets m ON m.id = b.market_id
              WHERE b.group_id = g.id
                AND (m.status = 'OPEN' OR (b.market_id IS NULL AND b.custom_close_at > now()))
             ) AS active_boloes_count
       FROM groups g JOIN users u ON u.id = g.created_by
      WHERE g.invite_code = $1`,
    [code],
  );
  if (!r.rowCount) return null;
  const row = r.rows[0];
  const kind = row.kind as "GRUPO" | "ENQUETE";

  let enquete: InviteCardData["enquete"] = null;
  if (kind === "ENQUETE") {
    const b = await pool.query(
      `SELECT b.id, b.guess_type, b.custom_title,
              (SELECT count(*) FROM bolao_palpites bp WHERE bp.bolao_id = b.id) AS palpite_count
         FROM boloes b WHERE b.group_id = $1 ORDER BY b.created_at LIMIT 1`,
      [row.id],
    );
    if (b.rowCount) {
      const outcomes = await pool.query(
        `SELECT label FROM bolao_custom_outcomes WHERE bolao_id = $1 ORDER BY display_order`,
        [b.rows[0].id],
      );
      enquete = {
        title: b.rows[0].custom_title as string,
        guessType: b.rows[0].guess_type as GuessType,
        outcomes: outcomes.rows.map((o) => o.label as string),
        palpiteCount: Number(b.rows[0].palpite_count),
      };
    }
  }

  return {
    kind,
    name: row.name as string,
    creatorDisplayName: row.creator_name as string,
    memberCount: Number(row.member_count),
    activeBoloesCount: Number(row.active_boloes_count),
    enquete,
  };
}

function guessTypeSummary(guessType: GuessType, outcomes: string[]): string {
  if (guessType === "WINNER") return outcomes.slice(0, 4).join("   ·   ");
  if (guessType === "SCORE") return "Palpite de placar exato";
  return "Palpite de número";
}

function renderEnqueteCardSvg(d: InviteCardData & { enquete: NonNullable<InviteCardData["enquete"]> }): string {
  const titleLines = wrapText(d.enquete.title, 1040, 44, 3);
  const summaryY = 152 + titleLines.length * 52 + 14;
  const countY = summaryY + 50;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${TOKENS.papel}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${TOKENS.violeta}"/>
  <text x="80" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="600"
        letter-spacing="1.4" fill="${TOKENS.violeta}">ENQUETE DE ${esc(d.creatorDisplayName.toUpperCase())}</text>
  <text x="1120" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="700"
        letter-spacing="1.4" fill="${TOKENS.violeta}" text-anchor="end">DÁ SEU PALPITE</text>
  ${titleLines.map((line, i) => `<text x="80" y="${152 + i * 52}" font-family="IBM Plex Sans" font-size="44"
        font-weight="700" fill="${TOKENS.tinta}">${esc(line)}</text>`).join("\n  ")}
  <text x="80" y="${summaryY}" font-family="IBM Plex Mono" font-size="22" font-weight="600" fill="${TOKENS.violeta}">
    ${esc(guessTypeSummary(d.enquete.guessType, d.enquete.outcomes))}
  </text>
  <text x="80" y="${countY}" font-family="IBM Plex Sans" font-size="18" fill="${TOKENS.grafite}">
    ${d.enquete.palpiteCount} palpite${d.enquete.palpiteCount === 1 ? "" : "s"} até agora — conta verificada, sem voto repetido
  </text>
  <text x="80" y="540" font-family="IBM Plex Serif" font-size="34" font-weight="700" fill="${TOKENS.tinta}">Dito<tspan fill="${TOKENS.violeta}">Feito</tspan></text>
  <text x="1120" y="521" font-family="IBM Plex Mono" font-size="18" font-weight="700"
        fill="${TOKENS.violeta}" text-anchor="end">PALPITE ENTRE AMIGOS</text>
</svg>`;
}

export function renderInviteCardSvg(d: InviteCardData): string {
  if (d.kind === "ENQUETE" && d.enquete) return renderEnqueteCardSvg(d as Parameters<typeof renderEnqueteCardSvg>[0]);

  const titleLines = wrapText(d.name, 1040, 44, 2);
  const extraLine = titleLines.length > 1 ? 1 : 0;
  const metaY = 260 + extraLine * 52;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${TOKENS.papel}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${TOKENS.violeta}"/>
  <text x="80" y="64" font-family="IBM Plex Mono" font-size="18" font-weight="600"
        letter-spacing="1.4" fill="${TOKENS.violeta}">VOCÊ FOI CONVIDADO</text>
  <text x="80" y="112" font-family="IBM Plex Sans" font-size="24" font-weight="600" fill="${TOKENS.grafite}">
    Entra no grupo de ${esc(d.creatorDisplayName)}:
  </text>
  ${titleLines.map((line, i) => `<text x="80" y="${152 + i * 52}" font-family="IBM Plex Sans" font-size="44"
        font-weight="700" fill="${TOKENS.tinta}">${esc(line)}</text>`).join("\n  ")}
  <text x="80" y="${metaY}" font-family="IBM Plex Mono" font-size="24" font-weight="600" fill="${TOKENS.violeta}">
    ${d.memberCount} membro${d.memberCount === 1 ? "" : "s"}${
      d.activeBoloesCount > 0
        ? ` · ${d.activeBoloesCount} bolão${d.activeBoloesCount === 1 ? "" : "ões"} rolando`
        : ""
    }
  </text>
  <text x="80" y="540" font-family="IBM Plex Serif" font-size="34" font-weight="700" fill="${TOKENS.tinta}">Dito<tspan fill="${TOKENS.violeta}">Feito</tspan></text>
  <text x="1120" y="521" font-family="IBM Plex Mono" font-size="18" font-weight="700"
        fill="${TOKENS.violeta}" text-anchor="end">PALPITE ENTRE AMIGOS</text>
</svg>`;
}

export function renderInviteCardPng(d: InviteCardData): Buffer {
  return svgToPng(renderInviteCardSvg(d));
}

export function renderInviteHtml(d: InviteCardData, code: string): string {
  const joinUrl = `${EMBED_CONFIG.baseUrl}/grupos/entrar/${code}`;
  const cardUrl = `${EMBED_CONFIG.baseUrl}/card/convite/${code}.png`;
  const isEnquete = d.kind === "ENQUETE" && d.enquete;
  const pageTitle = isEnquete ? d.enquete!.title : `Convite pro grupo "${d.name}"`;
  const desc = isEnquete
    ? `${d.creatorDisplayName} criou uma enquete no DitoFeito: "${d.enquete!.title}" — ${d.enquete!.palpiteCount} palpite${d.enquete!.palpiteCount === 1 ? "" : "s"} até agora, conta verificada.`
    : `${d.creatorDisplayName} te convidou pro grupo "${d.name}" — ${d.memberCount} membro${
        d.memberCount === 1 ? "" : "s"
      } já palpitando no DitoFeito.`;

  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pageTitle)} — DitoFeito</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="DitoFeito">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${cardUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${EMBED_CONFIG.baseUrl}/convite/${code}">
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
<a class="btn" href="${joinUrl}">${isEnquete ? "Dar meu palpite" : "Entrar no grupo"}</a>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Wiring HTTP
// ---------------------------------------------------------------------------
import type express from "express";
import { asyncHandler } from "./asyncHandler.js";

export function mountInviteCard(app: express.Express, pool: Pool) {
  const cache = (res: express.Response) => res.set({
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
  });
  app.get("/card/convite/:code.svg", asyncHandler(async (req, res) => {
    const d = await getInviteCardData(pool, req.params.code);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/svg+xml").send(renderInviteCardSvg(d));
  }));
  app.get("/card/convite/:code.png", asyncHandler(async (req, res) => {
    const d = await getInviteCardData(pool, req.params.code);
    if (!d) return res.status(404).send("");
    cache(res); res.type("image/png").send(renderInviteCardPng(d));
  }));
  app.get("/convite/:code", asyncHandler(async (req, res) => {
    const d = await getInviteCardData(pool, req.params.code);
    if (!d) return res.status(404).send("convite não encontrado");
    cache(res); res.type("html").send(renderInviteHtml(d, req.params.code));
  }));
}
