// CLI: publica os mercados de disputa de governador e Senado de todas as UFs,
// só os que passam na conferência com o TSE (domain/tseCheck.ts — o mesmo
// painel do admin). O resto aparece listado com o motivo, pra corrigir e
// rodar de novo.
//
// Por UF:
//   - governador: "quem vence" (rascunho criado pelo gerador) — publica se ✅;
//   - senado: "quem será o senador mais votado?" (senado.ts) — cria se não
//     existir e publica se todos os candidatos ativos estão vinculados ao TSE;
//   - "quem vence" de senador que sobrou de antes da correção do gerador: o
//     rascunho é apagado; publicado só é listado (anular pelo admin).
// Simulação por padrão; --aplicar executa. Idempotente — rodar de novo depois
// de corrigir só mexe no que faltava.
//
// Uso (na VPS): docker compose -f infra/docker-compose.yml exec api node apps/api/dist/jobs/run-publicar-disputas.js [--aplicar] [--uf CE,RJ]
import type { Pool } from "pg";
import { getPool } from "@ditofeito/db";
import { checkMarketAgainstTse, type TseCheck } from "../domain/tseCheck.js";
import { UF_DE, ensureSenateMarket, senateCandidates, senateSlug } from "./senado.js";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const ufArg = args.includes("--uf") ? (args[args.indexOf("--uf") + 1] ?? "") : "";
const UFS = ufArg ? ufArg.toUpperCase().split(",").map((s) => s.trim()).filter(Boolean) : Object.keys(UF_DE);

function problemas(ck: TseCheck): string[] {
  const p: string[] = [];
  if (!ck.disputaNoTse) p.push("disputa ainda não sincronizada com o TSE (run-tse-sync)");
  if (ck.foraDoTse.length) p.push(`sem registro no TSE: ${ck.foraDoTse.join(", ")}`);
  if (ck.faltando.length) p.push(`registrados que faltam: ${ck.faltando.join(", ")}`);
  if (ck.semVinculo.length) p.push(`opções sem vínculo: ${ck.semVinculo.join(", ")}`);
  return p; // maiúsculas não bloqueia — corrige pelo botão no admin
}

async function marketBySlug(pool: Pool, slug: string) {
  const r = await pool.query(`SELECT id, status FROM markets WHERE slug = $1`, [slug]);
  return r.rows[0] as { id: string; status: string } | undefined;
}

async function publicar(pool: Pool, id: string) {
  await pool.query(`UPDATE markets SET status = 'OPEN' WHERE id = $1 AND status = 'DRAFT'`, [id]);
}

async function main() {
  const pool = getPool();
  const faz = aplicar ? "" : " (simulação)";
  let publicados = 0;
  const pendencias: string[] = [];
  console.log(aplicar ? "== APLICANDO ==" : "== SIMULAÇÃO (nada muda — rode com --aplicar) ==");

  for (const uf of UFS) {
    const linhas: string[] = [];

    // --- governador ---
    const gov = await marketBySlug(pool, `quem-vence-disputa-governador-${uf.toLowerCase()}-2026`);
    if (!gov) {
      linhas.push("governador: sem mercado \"quem vence\" (menos de 2 candidatos ativos? rode a sync do TSE e o gerador)");
      pendencias.push(`${uf} governador`);
    } else {
      const p = problemas(await checkMarketAgainstTse(pool, gov.id));
      if (gov.status === "DRAFT" && !p.length) {
        if (aplicar) await publicar(pool, gov.id);
        linhas.push(`governador: PUBLICADO${faz}`); publicados++;
      } else if (gov.status === "DRAFT") {
        linhas.push(`governador: NÃO publicado — ${p.join("; ")}`); pendencias.push(`${uf} governador`);
      } else {
        linhas.push(`governador: já estava ${gov.status}${p.length ? ` — atenção: ${p.join("; ")}` : ""}`);
      }
    }

    // --- senado ---
    const cands = await senateCandidates(pool, uf);
    const senTse = await pool.query(`SELECT 1 FROM tse_staging WHERE office = 'SENADOR' AND sg_uf = $1 LIMIT 1`, [uf]);
    const semTse = cands.filter((c) => !c.tse_sq_candidato).map((c) => c.nome);
    const sen = await marketBySlug(pool, senateSlug(uf));
    const pSen = !senTse.rowCount ? ["disputa ainda não sincronizada com o TSE (run-tse-sync)"]
      : cands.length < 2 ? ["menos de 2 candidatos ativos"]
      : semTse.length ? [`sem vínculo com o TSE: ${semTse.join(", ")}`]
      : sen ? problemas(await checkMarketAgainstTse(pool, sen.id)) : [];
    if (sen && sen.status !== "DRAFT") {
      linhas.push(`senado: já estava ${sen.status}${pSen.length ? ` — atenção: ${pSen.join("; ")}` : ""}`);
    } else if (pSen.length) {
      linhas.push(`senado: NÃO publicado — ${pSen.join("; ")}`); pendencias.push(`${uf} senado`);
    } else {
      if (aplicar) await ensureSenateMarket(pool, uf, true);
      linhas.push(`senado: ${sen ? "PUBLICADO" : "CRIADO e publicado"}${faz} (${cands.length} candidatos)`); publicados++;
    }

    // --- "quem vence" de senador antigo (vencedor único não serve pra 2 vagas) ---
    const velho = await marketBySlug(pool, `quem-vence-disputa-senador-${uf.toLowerCase()}-2026`);
    if (velho?.status === "DRAFT") {
      if (aplicar) {
        await pool.query(`DELETE FROM sponsorships WHERE market_id = $1`, [velho.id]);
        await pool.query(`DELETE FROM markets WHERE id = $1 AND status = 'DRAFT'`, [velho.id]);
      }
      linhas.push(`"quem vence" de senador (rascunho antigo): apagado${faz}`);
    } else if (velho && ["OPEN", "CLOSED"].includes(velho.status)) {
      linhas.push(`"quem vence" de senador PUBLICADO — anule pelo admin (2 vagas, não tem vencedor único)`);
      pendencias.push(`${uf} anular quem-vence de senador`);
    }

    console.log(`\n${uf}\n  ${linhas.join("\n  ")}`);
  }

  console.log(`\n${publicados} mercado(s) ${aplicar ? "publicados" : "seriam publicados"}.`);
  if (pendencias.length) console.log(`Pendências: ${pendencias.join(", ")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
