// CLI: tira do ar todos os mercados de candidato isolado ("Fulano será
// eleito?") — decisão de produto de 2026-09-19: fica só o mercado de disputa
// de cada UF ("quem vence" de governador/presidente, "mais votado" de senador),
// com os candidatos registrados no TSE. O gerador parou de criar esses
// binários (GERADOR_CONFIG.criarBinarios = false).
//
//   - rascunho: apagado (nunca foi público — mesma regra de market.remove);
//   - publicado (aberto/encerrado): ANULADO — publicado não se apaga, some da
//     home e quem previu recebe os pontos de volta (voidMarket);
//   - resolvido/anulado: não mexe.
// Mercados sem candidato ("haverá 2º turno?") e os MULTI de disputa não entram.
//
// Uso (na VPS): docker compose -f infra/docker-compose.yml exec api node apps/api/dist/jobs/run-limpar-candidatos.js [--aplicar]
//   sem --aplicar: só lista o que seria feito.
import { getPool } from "@ditofeito/db";
import { voidMarket } from "../domain/trade.js";
import { APP_CONFIG } from "../config.js";

const aplicar = process.argv.includes("--aplicar");
const JUSTIFICATIVA =
  "Mercados individuais por candidato foram descontinuados: a disputa segue no mercado do estado " +
  "(\"quem vence\" / \"mais votado\"), com todos os candidatos registrados no TSE. Pontos devolvidos.";

async function main() {
  const pool = getPool();
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!sys.rowCount) throw new Error("Seed ausente: usuário 'sistema'");

  const r = await pool.query(
    `SELECT m.id, m.slug, m.status,
            (SELECT count(*) FROM trades t WHERE t.market_id = m.id)::int AS trades
       FROM markets m
      WHERE m.type = 'BINARY' AND m.status IN ('DRAFT','OPEN','CLOSED')
        AND EXISTS (SELECT 1 FROM market_outcomes o WHERE o.market_id = m.id AND o.candidate_id IS NOT NULL)
      ORDER BY m.status DESC, m.slug`);
  const drafts = r.rows.filter((x) => x.status === "DRAFT");
  const publicados = r.rows.filter((x) => x.status !== "DRAFT");

  console.log(aplicar ? "== APLICANDO ==" : "== SIMULAÇÃO (nada muda — rode com --aplicar) ==");
  console.log(`${drafts.length} rascunho(s) "será eleito?" ${aplicar ? "apagados" : "a apagar"}.`);
  console.log(`${publicados.length} publicado(s) ${aplicar ? "anulados" : "a anular"}:`);
  for (const p of publicados) console.log(`  - ${p.slug}${p.trades ? ` (${p.trades} previsão(ões) — pontos devolvidos)` : ""}`);
  if (!aplicar) return;

  let apagados = 0;
  const falhas: string[] = [];
  for (const d of drafts) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`DELETE FROM sponsorships WHERE market_id = $1`, [d.id]);
      await c.query(`DELETE FROM markets WHERE id = $1 AND status = 'DRAFT'`, [d.id]);
      await c.query("COMMIT");
      apagados++;
    } catch (e) {
      await c.query("ROLLBACK");
      falhas.push(`${d.slug}: ${e instanceof Error ? e.message : e}`);
    } finally {
      c.release();
    }
  }
  let anulados = 0;
  for (const p of publicados) {
    try {
      await voidMarket(pool, {
        marketId: p.id, resolverUserId: sys.rows[0].id,
        justification: JUSTIFICATIVA, sourceUrl: `${APP_CONFIG.webOrigin}/metodologia`,
      });
      anulados++;
    } catch (e) {
      falhas.push(`${p.slug}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\nFeito: ${apagados} rascunho(s) apagado(s), ${anulados} publicado(s) anulado(s).`);
  if (falhas.length) { console.log("Não deu pra mexer em:"); for (const f of falhas) console.log(`  - ${f}`); }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
