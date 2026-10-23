// CLI: APAGA do banco todos os mercados eleitorais de 2026, menos os
// "2º turno: quem vence?" (slug quem-vence-2turno-*). Decisão do dono em
// 2026-10-23: os 47 resolvidos no 1º turno enchiam a home de mercado parado;
// apagar foi escolhido de propósito em vez de só esconder (a alternativa foi
// oferecida e recusada) — mesma exceção à regra "publicado não se apaga" que
// migrations/024 e o reset de 2026-09-18 já abriram.
//
// O que entra: categoria eleicoes-2026, qualquer status (resolvido, aberto,
// encerrado, rascunho), exceto quem-vence-2turno-*. Inclui os "quem vence a
// disputa" originais de presidente e das UFs com 2º turno — a pergunta segue
// viva no mercado de 2º turno.
//
// Pontos: aberto/encerrado com posição é ANULADO antes (voidMarket devolve o
// comprometido, com notificação/e-mail). Pagamento de resolvido fica no
// ledger (ref_id não tem FK) — ninguém perde o que já ganhou, e a cadeia de
// hash não é tocada. Reputação é recalculada a partir dos eventos que sobram.
//
// Simulação por padrão: roda o DELETE inteiro e dá ROLLBACK (prova que
// nenhuma FK ficou de fora). --aplicar executa de verdade. Rode via
// infra/scripts/apagar-1turno.sh, que faz o pg_dump antes.
import { getPool } from "@ditofeito/db";
import { voidMarket } from "../domain/trade.js";
import { APP_CONFIG } from "../config.js";

const aplicar = process.argv.includes("--aplicar");
const JUSTIFICATIVA =
  "Mercados do 1º turno de 2026 foram retirados do site. A disputa segue no mercado de 2º turno. Pontos devolvidos.";

const pool = getPool();

async function alvos() {
  const r = await pool.query(
    `SELECT m.id, m.slug, m.status,
            (SELECT count(*) FROM trades t WHERE t.market_id = m.id)::int AS trades,
            EXISTS (SELECT 1 FROM positions p WHERE p.market_id = m.id AND p.cost_basis > 0) AS tem_posicao
       FROM markets m JOIN categories c ON c.id = m.category_id
      WHERE c.slug = 'eleicoes-2026' AND m.slug NOT LIKE 'quem-vence-2turno-%'
      ORDER BY m.status, m.slug`);
  return r.rows as { id: string; slug: string; status: string; trades: number; tem_posicao: boolean }[];
}

async function apagar(ids: string[]) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`CREATE TEMP TABLE alvo ON COMMIT DROP AS SELECT unnest($1::uuid[]) AS id`, [ids]);
    const afetados = await c.query(
      `SELECT DISTINCT user_id FROM reputation_events WHERE market_id IN (SELECT id FROM alvo)`);

    // Sem CASCADE implícito além do que o schema já declara (outcomes,
    // notificações, news, shares, palpites de bolão): se alguma tabela nova
    // apontar pra markets e ficar de fora daqui, o DELETE final falha e nada
    // é apagado.
    const n: Record<string, number> = {};
    const del = async (nome: string, sql: string) => {
      const r = await c.query(sql);
      n[nome] = r.rowCount ?? 0;
    };
    await del("boloes", `DELETE FROM boloes WHERE market_id IN (SELECT id FROM alvo)`);
    await del("comentarios", `DELETE FROM comments WHERE market_id IN (SELECT id FROM alvo)`);
    await del("patrocinios", `DELETE FROM sponsorships WHERE market_id IN (SELECT id FROM alvo)`);
    await del("vindication_cards", `DELETE FROM vindication_cards WHERE market_id IN (SELECT id FROM alvo)`);
    await del("reputation_events", `DELETE FROM reputation_events WHERE market_id IN (SELECT id FROM alvo)`);
    await del("price_snapshots", `DELETE FROM price_snapshots WHERE market_id IN (SELECT id FROM alvo)`);
    await del("posicoes", `DELETE FROM positions WHERE market_id IN (SELECT id FROM alvo)`);
    await del("previsoes", `DELETE FROM trades WHERE market_id IN (SELECT id FROM alvo)`);
    await del("resolucoes", `DELETE FROM resolutions WHERE market_id IN (SELECT id FROM alvo)`);
    await del("mercados", `DELETE FROM markets WHERE id IN (SELECT id FROM alvo)`);

    // Reputação = soma dos eventos que sobraram. Sequência não dá pra
    // reconstruir (acerto/erro não fica gravado no evento) — mantida, e
    // zerada só quando o usuário fica sem nenhuma previsão resolvida.
    await c.query(
      `UPDATE user_reputation ur SET
         resolved_count = x.n,
         brier_sum      = x.s,
         brier_mean     = CASE WHEN x.n > 0 THEN x.s / x.n END,
         skill_score    = x.k,
         streak_current = CASE WHEN x.n > 0 THEN ur.streak_current ELSE 0 END,
         streak_best    = CASE WHEN x.n > 0 THEN ur.streak_best ELSE 0 END,
         updated_at     = now()
        FROM (SELECT u.user_id, count(e.id)::int AS n,
                     coalesce(sum(e.brier), 0) AS s, coalesce(sum(e.skill_delta), 0) AS k
                FROM unnest($1::uuid[]) AS u(user_id)
                LEFT JOIN reputation_events e ON e.user_id = u.user_id
               GROUP BY u.user_id) x
       WHERE ur.user_id = x.user_id`,
      [afetados.rows.map((r) => r.user_id)]);

    await c.query(aplicar ? "COMMIT" : "ROLLBACK");
    console.log(`\n${aplicar ? "APAGADO" : "APAGARIA (simulação, ROLLBACK)"}:`);
    for (const [k, v] of Object.entries(n)) console.log(`  ${k.padEnd(18)} ${v}`);
    console.log(`  reputação recalculada p/ ${afetados.rowCount} usuário(s)`);
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

async function main() {
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  if (!sys.rowCount) throw new Error("Seed ausente: usuário 'sistema'");
  console.log(aplicar ? "== APLICANDO ==" : "== SIMULAÇÃO (nada muda — rode com --aplicar) ==");

  const lista = await alvos();
  const porStatus = new Map<string, number>();
  for (const m of lista) porStatus.set(m.status, (porStatus.get(m.status) ?? 0) + 1);
  console.log(`${lista.length} mercado(s) eleitorais a apagar: ` +
    [...porStatus].map(([s, k]) => `${k} ${s}`).join(", "));
  for (const m of lista) {
    if (m.status !== "RESOLVED" || m.trades) {
      console.log(`  - ${m.status.padEnd(8)} ${m.slug}${m.trades ? ` (${m.trades} previsão(ões))` : ""}`);
    }
  }
  const mantidos = await pool.query(
    `SELECT slug, status FROM markets WHERE slug LIKE 'quem-vence-2turno-%' ORDER BY slug`);
  console.log(`Mantidos (${mantidos.rowCount}): ${mantidos.rows.map((r) => `${r.slug} [${r.status}]`).join(", ")}`);

  const anular = lista.filter((m) => ["OPEN", "CLOSED"].includes(m.status) && m.tem_posicao);
  console.log(`\n${anular.length} com posição aberta — ${aplicar ? "anulando (pontos devolvidos)" : "seriam anulados antes (pontos devolvidos)"}`);
  if (aplicar) {
    for (const m of anular) {
      const r = await voidMarket(pool, {
        marketId: m.id, resolverUserId: sys.rows[0].id,
        justification: JUSTIFICATIVA, sourceUrl: `${APP_CONFIG.webOrigin}/`,
      });
      console.log(`  ANULADO ${m.slug} (${r.refunds} devolução(ões))`);
    }
  }

  await apagar(lista.map((m) => m.id));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
