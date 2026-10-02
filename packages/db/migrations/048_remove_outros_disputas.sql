-- ============================================================================
-- 048 — Tira "OUTROS" dos mercados de disputa entre candidatos
-- O registro de candidaturas de 2026 fechou e a lista vem do TSE (tseSync),
-- então não existe candidato fora da lista: "OUTROS" era uma opção que não
-- pode acontecer e ainda roubava probabilidade dos candidatos reais.
--
-- Alcance: MULTI em que TODAS as opções não-catchall são candidatos
-- (candidate_id preenchido) — quem vence, mais votado no 1º turno, senado.
-- Mercados de deputados (opções = partidos, sem candidate_id) ficam como estão.
--
-- Só remove o "OUTROS" que ninguém tocou (mesma regra de
-- domain/candidateExit.ts::removeUntouchedOutcome): sem trade, posição,
-- palpite de bolão nem resolução. Com uso, deixa e avisa (NOTICE) — esse
-- caso precisa de decisão manual. LMSR renormaliza os preços sozinho.
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT o.id, m.slug, m.id AS market_id
      FROM market_outcomes o
      JOIN markets m ON m.id = o.market_id
     WHERE o.is_catchall
       AND m.type = 'MULTI'
       AND m.status IN ('DRAFT', 'OPEN', 'CLOSED')
       AND NOT EXISTS (SELECT 1 FROM market_outcomes o2
                        WHERE o2.market_id = m.id AND NOT o2.is_catchall
                          AND o2.candidate_id IS NULL)
       AND (SELECT count(*) FROM market_outcomes o3
             WHERE o3.market_id = m.id AND NOT o3.is_catchall) >= 2
  LOOP
    IF EXISTS (SELECT 1 FROM trades WHERE outcome_id = r.id)
       OR EXISTS (SELECT 1 FROM positions WHERE outcome_id = r.id AND shares > 0)
       OR EXISTS (SELECT 1 FROM bolao_palpites WHERE guess_outcome_id = r.id)
       OR EXISTS (SELECT 1 FROM resolutions WHERE resolved_outcome_id = r.id) THEN
      RAISE NOTICE '048: OUTROS mantido em % (tem previsões)', r.slug;
      CONTINUE;
    END IF;
    DELETE FROM price_snapshots WHERE outcome_id = r.id;
    DELETE FROM positions WHERE outcome_id = r.id;
    DELETE FROM market_outcomes WHERE id = r.id;
    UPDATE markets SET resolution_criteria = regexp_replace(
             resolution_criteria,
             '\s*Candidato não listado( nominalmente)? resolve em "?OUTROS"?\.', '', 'g')
     WHERE id = r.market_id;
    RAISE NOTICE '048: OUTROS removido de %', r.slug;
  END LOOP;
END $$;
