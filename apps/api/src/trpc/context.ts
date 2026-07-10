import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Pool } from "pg";
import { getSessionUser, type SessionUser } from "../domain/auth.js";
import { AUTH_CONFIG } from "../config.js";

export function createContextFactory(pool: Pool) {
  return async function createContext({ req }: CreateExpressContextOptions) {
    const token = req.cookies?.[AUTH_CONFIG.sessionCookieName] as string | undefined;
    const user: SessionUser | null = token ? await getSessionUser(pool, token) : null;
    return { pool, user };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContextFactory>>>;
