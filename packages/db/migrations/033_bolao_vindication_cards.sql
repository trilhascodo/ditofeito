-- ============================================================================
-- MIGRAÇÃO 033 — CARD DE VINDICAÇÃO DE BOLÃO
-- Mesmo mecanismo de vindication_cards (017_vindication_cards.sql), chaveado
-- por bolão em vez de mercado: um mesmo mercado pode ter bolões em vários
-- grupos, cada um com seu próprio conjunto de vencedores e seu próprio card
-- ("você acertou o bolão do grupo X", não "você acertou o mercado").
--
-- Sem trigger de resolução único pra WINNER (o status vira RESOLVIDO só
-- lendo markets.status, sem nenhuma mutation própria — ver domain/bolao.ts
-- statusBolao), então ao contrário de vindication_cards (criado dentro da
-- transação de trade.ts::resolveMarket), este é criado sob demanda e
-- idempotente na própria leitura de groups.bolao.detail quando o usuário
-- logado está entre os vencedores.
-- ============================================================================

CREATE TABLE bolao_vindication_cards (
  bolao_id    uuid NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  share_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bolao_id, user_id)
);
CREATE UNIQUE INDEX idx_bolao_vindication_share_token ON bolao_vindication_cards(share_token);
