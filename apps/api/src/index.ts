import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { getPool } from "@ditofeito/db";
import { mountEmbed } from "./http/embed.js";
import { mountAuth } from "./http/auth.js";
import { startJobs } from "./jobs/schedule.js";
import { APP_CONFIG } from "./config.js";

const app = express();
const pool = getPool();

// Rotas públicas do embed primeiro: HTML/SVG/JSON cacheáveis na CDN, sem
// CORS restrito (frame-ancestors * é o requisito ali, não Access-Control).
mountEmbed(app, pool);

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: APP_CONFIG.webOrigin, credentials: true }));
mountAuth(app, pool);

// TODO F0→F1: montar envelope tRPC (routers/market, trade, candidate, comment, admin)
// mapeando TradeError.code -> TRPCError, conforme README §6.3.

app.get("/health", (_req, res) => res.json({ ok: true }));

// Rede de segurança final: qualquer erro que escapou de um handler (via
// asyncHandler) cai aqui em vez de derrubar o processo. DEVE ser o último
// app.use — Express reconhece pela assinatura de 4 argumentos.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] erro não tratado", err);
  if (res.headersSent) return;
  res.status(500).json({ erro: "ERRO_INTERNO" });
});

if (process.env.NODE_ENV !== "test") {
  startJobs(pool);
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`[api] ouvindo em :${port}`));
}

export { app };
