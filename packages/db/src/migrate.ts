// Runner de migração simples e idempotente: aplica migrations/*.sql em ordem
// numérica, registrando cada arquivo já aplicado em schema_migrations.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

export async function runMigrations(): Promise<{ applied: string[] }> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM schema_migrations WHERE filename = $1`,
      [file],
    );
    if (rowCount) continue;

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)`,
        [file],
      );
      await client.query("COMMIT");
      applied.push(file);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`Falha ao aplicar ${file}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  return { applied };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(({ applied }) => {
      console.log(applied.length ? `Aplicadas: ${applied.join(", ")}` : "Nada a aplicar — já em dia.");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
