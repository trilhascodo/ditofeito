import type { Request, Response, NextFunction, RequestHandler } from "express";

// Express 4 não encaminha rejeição de Promise para next() sozinho — uma
// falha inesperada (ex.: banco fora do ar) vira unhandled rejection e
// derruba o processo inteiro, não só a requisição. Todo handler async
// precisa passar por aqui.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => { fn(req, res, next).catch(next); };
}
