import type { Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import { getSessionUser } from "../domain/auth.js";
import { AUTH_CONFIG } from "../config.js";

/** Preenche req.user quando há cookie de sessão válido; nunca bloqueia (roda
 *  em toda requisição — uma falha de banco aqui não pode derrubar a API, só
 *  degrada para "não autenticado"). */
export function optionalAuth(pool: Pool) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[AUTH_CONFIG.sessionCookieName] as string | undefined;
    if (!token) return next();
    try {
      req.user = (await getSessionUser(pool, token)) ?? undefined;
    } catch (e) {
      console.error("[auth] optionalAuth falhou, seguindo como anônimo", e);
    }
    next();
  };
}

/** Exige sessão válida — usar depois de optionalAuth nas rotas que precisam. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ erro: "NAO_AUTENTICADO" });
  next();
}
