import { Pool } from "pg";

let pool: Pool | undefined;

/** Pool singleton do processo. DATABASE_URL vem do .env (nunca hardcoded — lição CarToken). */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL ausente no ambiente");
    pool = new Pool({ connectionString });
  }
  return pool;
}

export type { Pool, PoolClient } from "pg";
