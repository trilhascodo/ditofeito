// ============================================================================
// adClick.ts — /ir/:sponsorshipId: registra o clique e redireciona pro site
// do patrocinador. Rota HTTP pura (não tRPC) de propósito: um redirect real
// (302) é mais confiável que capturar onClick no navegador antes da página
// sair — não depende do beacon chegar a tempo.
// ============================================================================
import type express from "express";
import type { Pool } from "pg";
import { visitorHash } from "../lib/visitorHash.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { asyncHandler } from "./asyncHandler.js";

export function mountAdClick(app: express.Express, pool: Pool) {
  app.get("/ir/:sponsorshipId", asyncHandler(async (req, res) => {
    const r = await pool.query(
      `SELECT s.site_url FROM sponsorships sp JOIN sponsors s ON s.id = sp.sponsor_id WHERE sp.id = $1`,
      [req.params.sponsorshipId],
    );
    if (!r.rowCount || !r.rows[0].site_url) return res.status(404).send("patrocínio não encontrado");
    // Clique alimenta a mesma métrica de negociação/preço que impressão —
    // difícil de forjar importa aqui também. Estourar o limite nunca quebra
    // o redirect (usuário real sempre chega no site do patrocinador), só
    // pula o registro do evento.
    const hash = visitorHash(req.ip, req.get("user-agent"));
    if (checkRateLimit(`click:${hash}`, 20, 60_000)) {
      await pool.query(
        `INSERT INTO ad_events (sponsorship_id, kind, visitor_hash) VALUES ($1,'CLICK',$2)`,
        [req.params.sponsorshipId, hash],
      );
    }
    res.redirect(302, r.rows[0].site_url as string);
  }));
}
