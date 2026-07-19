// ============================================================================
// adClick.ts — registra clique e redireciona. Rota HTTP pura (não tRPC) de
// propósito: um redirect real (302) é mais confiável que capturar onClick no
// navegador antes da página sair — não depende do beacon chegar a tempo.
//
//   /ir/:sponsorshipId                    -> site do patrocinador
//   /ir/:sponsorshipId/social/:socialLinkId -> rede social do patrocinador
//
// Os dois contam pra mesma métrica (ad_events, sponsorship_id) — clique é
// clique, rede social não é canal "à parte" pra efeito de CTR/negociação.
// ============================================================================
import type express from "express";
import type { Pool } from "pg";
import { visitorHash } from "../lib/visitorHash.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { asyncHandler } from "./asyncHandler.js";

// Clique alimenta a mesma métrica de negociação/preço que impressão —
// difícil de forjar importa aqui também. Estourar o limite nunca quebra o
// redirect (usuário real sempre chega no destino), só pula o registro.
async function recordClick(pool: Pool, req: express.Request, sponsorshipId: string): Promise<void> {
  const hash = visitorHash(req.ip, req.get("user-agent"));
  if (checkRateLimit(`click:${hash}`, 20, 60_000)) {
    await pool.query(
      `INSERT INTO ad_events (sponsorship_id, kind, visitor_hash) VALUES ($1,'CLICK',$2)`,
      [sponsorshipId, hash],
    );
  }
}

export function mountAdClick(app: express.Express, pool: Pool) {
  app.get("/ir/:sponsorshipId/social/:socialLinkId", asyncHandler(async (req, res) => {
    // Confirma que o link é mesmo do patrocinador dessa sponsorship — evita
    // atribuir clique a um patrocínio arbitrário via URL forjada.
    const r = await pool.query(
      `SELECT sl.url FROM sponsor_social_links sl
         JOIN sponsorships sp ON sp.sponsor_id = sl.sponsor_id
        WHERE sl.id = $1 AND sp.id = $2`,
      [req.params.socialLinkId, req.params.sponsorshipId],
    );
    if (!r.rowCount) return res.status(404).send("link não encontrado");
    await recordClick(pool, req, req.params.sponsorshipId);
    res.redirect(302, r.rows[0].url as string);
  }));

  app.get("/ir/:sponsorshipId", asyncHandler(async (req, res) => {
    const r = await pool.query(
      `SELECT s.site_url FROM sponsorships sp JOIN sponsors s ON s.id = sp.sponsor_id WHERE sp.id = $1`,
      [req.params.sponsorshipId],
    );
    if (!r.rowCount || !r.rows[0].site_url) return res.status(404).send("patrocínio não encontrado");
    await recordClick(pool, req, req.params.sponsorshipId);
    res.redirect(302, r.rows[0].site_url as string);
  }));
}
