// ============================================================================
// marketFactory.ts — núcleo de criação idempotente de mercado + outcomes.
//
// Extraído de gerador.ts (eleitoral) e do router market.create: os dois
// faziam o mesmo INSERT em markets/market_outcomes com dedupe por slug
// (ON CONFLICT DO NOTHING). Agora é um só ponto, reusado pelos geradores
// de esporte/financeiro além do endpoint manual do admin.
//
// Não decide se publica direto ou fica em DRAFT — quem chama passa `status`
// já resolvido (cada gerador tem sua própria política, ver GERADOR_CONFIG e
// equivalentes em generators/*.ts).
// ============================================================================
import type { PoolClient } from "pg";

export interface MarketOutcomeInput {
  label: string;
  candidateId?: string;
  isCatchall?: boolean;
}

export interface CreateMarketInput {
  slug: string;
  title: string;
  description?: string;
  categoryId: string;
  groupId?: string;
  type: "BINARY" | "MULTI";
  outcomes: MarketOutcomeInput[];
  liquidityB: number;
  status: "DRAFT" | "OPEN";
  resolutionCriteria: string;
  resolutionSource: string;
  closeAt: string;
  resolveBy: string;
  isElectoral?: boolean;
  createdBy: string;
  regionUf?: string | null;
}

export interface CreateMarketResult {
  created: boolean; // false = slug já existia (idempotência), nada foi tocado
  marketId: string;
}

/** Cria mercado + outcomes em uma única transação; ON CONFLICT (slug) DO
 *  NOTHING = idempotente, seguro rodar em cron repetido. Espera rodar dentro
 *  de uma transação já aberta pelo chamador (BEGIN/COMMIT é responsabilidade
 *  de quem orquestra, pra permitir agrupar várias criações num só commit). */
export async function createMarketIdempotent(
  client: PoolClient,
  input: CreateMarketInput,
): Promise<CreateMarketResult> {
  const m = await client.query(
    `INSERT INTO markets (slug, title, description, category_id, group_id, type,
                          liquidity_b, status, resolution_criteria, resolution_source,
                          close_at, resolve_by, is_electoral, created_by, region_uf)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [
      input.slug, input.title, input.description ?? null, input.categoryId,
      input.groupId ?? null, input.type, input.liquidityB.toFixed(4), input.status,
      input.resolutionCriteria, input.resolutionSource, input.closeAt, input.resolveBy,
      input.isElectoral ?? false, input.createdBy, input.regionUf ?? null,
    ],
  );
  if (!m.rowCount) return { created: false, marketId: "" };

  const marketId = m.rows[0].id as string;
  // Catchall ("OUTROS") sempre por último na exibição, independente da posição
  // no array de entrada — mesma convenção do gerador eleitoral (display_order 999).
  let nextOrder = 0;
  for (const o of input.outcomes) {
    const displayOrder = o.isCatchall ? 999 : nextOrder++;
    await client.query(
      `INSERT INTO market_outcomes (market_id, label, candidate_id, is_catchall, display_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [marketId, o.label, o.candidateId ?? null, o.isCatchall ?? false, displayOrder],
    );
  }
  return { created: true, marketId };
}
