import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { getPool } from "@ditofeito/db";
import { mountEmbed } from "./http/embed.js";
import { mountVindication } from "./http/vindication.js";
import { mountAuth } from "./http/auth.js";
import { startJobs } from "./jobs/schedule.js";
import { APP_CONFIG } from "./config.js";
import { appRouter } from "./routers/_app.js";
import { createContextFactory } from "./trpc/context.js";

// Anotação explícita: com declaration:true, inferir o tipo do Express aqui
// sem anotação vira TS2742 (o tipo interno não é "nomeável" a partir do
// pnpm store aninhado ao gerar o .d.ts que apps/web importa).
const app: express.Express = express();
// Atrás de nginx (TLS termina lá): sem isso, req.ip vira o IP do proxy e
// req.secure fica sempre false, mesmo com a conexão real em HTTPS.
app.set("trust proxy", 1);
const pool = getPool();

// Rotas públicas do embed primeiro: HTML/SVG/JSON cacheáveis na CDN, sem
// CORS restrito (frame-ancestors * é o requisito ali, não Access-Control).
mountEmbed(app, pool);
mountVindication(app, pool);

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: APP_CONFIG.webOrigin, credentials: true }));
mountAuth(app, pool);

app.use(
  "/trpc",
  createExpressMiddleware({ router: appRouter, createContext: createContextFactory(pool) }),
);

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
