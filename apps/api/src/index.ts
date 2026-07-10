import "dotenv/config";
import express from "express";
import { getPool } from "@ditofeito/db";
import { mountEmbed } from "./http/embed.js";
import { startJobs } from "./jobs/schedule.js";

const app = express();
app.use(express.json());

const pool = getPool();

// Rotas públicas do embed: HTTP puro, cacheável na CDN, fora do tRPC.
mountEmbed(app, pool);

// TODO F0→F1: montar envelope tRPC (routers/market, trade, candidate, comment, admin)
// mapeando TradeError.code -> TRPCError, conforme README §6.3.

app.get("/health", (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV !== "test") {
  startJobs(pool);
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`[api] ouvindo em :${port}`));
}

export { app };
