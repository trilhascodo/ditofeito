import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const SEEDS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "seeds",
);

export async function runSeeds(): Promise<void> {
  const pool = getPool();
  const sql = await readFile(path.join(SEEDS_DIR, "001_seed.sql"), "utf8");
  await pool.query(sql);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeeds()
    .then(() => { console.log("seeds aplicados"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
