// ============================================================================
// adClick.ts — /ir/:sponsorshipId: registra o clique e redireciona pro site
// do patrocinador. Rota HTTP pura (não tRPC) de propósito: um redirect real
// (302) é mais confiável que capturar onClick no navegador antes da página
// sair — não depende do beacon chegar a tempo.
// ============================================================================
import type express from "express";
import type { Pool } from "pg";
import { visitorHash } from "../lib/visitorHash.js";
import { asyncHandler } from "./asyncHandler.js";

export function mountAdClick(app: express.Express, pool: Pool) {
  app.get("/ir/:sponsorshipId", asyncHandler(async (req, res) => {
    const r = await pool.query(
      `SELECT s.site_url FROM sponsorships sp JOIN sponsors s ON s.id = sp.sponsor_id WHERE sp.id = $1`,
      [req.params.sponsorshipId],
    );
    if (!r.rowCount || !r.rows[0].site_url) return res.status(404).send("patrocínio não encontrado");
    const hash = visitorHash(req.ip, req.get("user-agent"));
    await pool.query(
      `INSERT INTO ad_events (sponsorship_id, kind, visitor_hash) VALUES ($1,'CLICK',$2)`,
      [req.params.sponsorshipId, hash],
    );
    res.redirect(302, r.rows[0].site_url as string);
  }));
}
