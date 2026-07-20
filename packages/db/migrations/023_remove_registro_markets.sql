-- ============================================================================
-- MIGRAÇÃO 023 — APOSENTA A PERGUNTA "VAI REGISTRAR CANDIDATURA?"
-- Decisão de produto: mercados slug 'registro-*' (gerarBinariosCandidatos,
-- gerador.ts) saem de circulação — o código também foi ajustado nesse commit
-- pra nunca mais criar esse tipo (senão o cron diário de 6h recriava tudo de
-- novo pelos mesmos pré-candidatos).
--
-- Só apaga o que nunca teve atividade real de usuário (sem trade, sem
-- comentário, sem resolução) — qualquer 'registro-*' que já tenha previsão
-- de alguém fica de fora do DELETE (contado no NOTICE) pra decisão manual
-- via Anular no admin, nunca some sem rastro escondido numa migration.
-- ============================================================================

DO $$
DECLARE
  deletados int;
  restantes int;
BEGIN
  CREATE TEMP TABLE alvo_registro AS
    SELECT m.id FROM markets m
     WHERE m.slug LIKE 'registro-%'
       AND NOT EXISTS (SELECT 1 FROM trades t WHERE t.market_id = m.id)
       AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.market_id = m.id)
       AND NOT EXISTS (SELECT 1 FROM resolutions r WHERE r.market_id = m.id);

  DELETE FROM sponsorships WHERE market_id IN (SELECT id FROM alvo_registro);
  DELETE FROM markets WHERE id IN (SELECT id FROM alvo_registro);
  GET DIAGNOSTICS deletados = ROW_COUNT;

  SELECT count(*) INTO restantes FROM markets WHERE slug LIKE 'registro-%';

  RAISE NOTICE 'migração 023: % mercados "registro-*" apagados, % ficaram de fora (tinham previsão/comentário/resolução real — revisar manualmente / usar Anular)',
    deletados, restantes;

  DROP TABLE alvo_registro;
END $$;
