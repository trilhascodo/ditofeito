-- ============================================================================
-- MIGRAÇÃO 024 — APAGA TODO MERCADO ANULADO (VOIDED)
-- Decisão explícita de produto: ao contrário da limpeza de "registro-*"
-- (migrations/023, que só apagava mercado sem nenhuma atividade real), esta
-- apaga TODO mercado com status VOIDED, mesmo os que já tiveram previsão real
-- com pontos devolvidos — perde o rastro público desse histórico de
-- propósito, por escolha direta do time (a alternativa "só os sem atividade"
-- foi oferecida e recusada).
--
-- O bug que motivou o pedido (anulado aparecendo na grade de mercados
-- ativos) já foi corrigido em market.list (router) antes desta migração —
-- isso aqui é limpeza de dados, não o fix do bug em si.
-- ============================================================================

DO $$
DECLARE
  deletados int;
BEGIN
  CREATE TEMP TABLE alvo_voided AS SELECT id FROM markets WHERE status = 'VOIDED';

  -- market_outcomes/notifications/news têm ON DELETE CASCADE — não precisam
  -- de DELETE manual. O resto não tem cascade (RESTRICT), precisa vir antes
  -- do DELETE em markets.
  DELETE FROM comments        WHERE market_id IN (SELECT id FROM alvo_voided);
  DELETE FROM sponsorships    WHERE market_id IN (SELECT id FROM alvo_voided);
  DELETE FROM price_snapshots WHERE market_id IN (SELECT id FROM alvo_voided);
  DELETE FROM positions       WHERE market_id IN (SELECT id FROM alvo_voided);
  DELETE FROM trades          WHERE market_id IN (SELECT id FROM alvo_voided);
  DELETE FROM resolutions     WHERE market_id IN (SELECT id FROM alvo_voided);
  DELETE FROM markets         WHERE id IN (SELECT id FROM alvo_voided);
  GET DIAGNOSTICS deletados = ROW_COUNT;

  RAISE NOTICE 'migração 024: % mercados anulados apagados (com todo trade/posição/resolução associada)', deletados;

  DROP TABLE alvo_voided;
END $$;
