-- ============================================================================
-- MIGRAÇÃO 035 — LOOP DE ENGAJAMENTO
-- Fecha o ciclo do que 031-034 abriram (convite compartilhável, card de
-- vindicação de bolão, cadastro sem CPF): agora precisa trazer as pessoas de
-- volta. Duas notificações novas (prazo de bolão fechando, novo membro via
-- convite) e dois motivos novos de crédito no ledger (bônus de indicação).
-- ============================================================================

-- group_id: único jeito de linkar GROUP_JOINED (não tem mercado nenhum) e de
-- fazer BOLAO_CLOSING_SOON apontar pro GRUPO (onde mora a ação de palpitar,
-- /grupos/:id/bolao/:id) em vez do mercado (/m/:slug, que é a página de
-- LMSR — destino errado pro lembrete de bolão).
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('MARKET_RESOLVED', 'MARKET_VOIDED', 'NEW_COMMENT',
                  'SPONSOR_REVIEW_APPROVED', 'SPONSOR_REVIEW_REJECTED',
                  'BOLAO_CLOSING_SOON', 'GROUP_JOINED'));

-- REFERRAL_BONUS (dono do grupo) / GROUP_JOIN_BONUS (quem entrou) — mesma
-- moeda não-conversível do SIGNUP_BONUS, dado dentro da mesma transação que
-- grava o INSERT em group_members (ver routers/grupos.ts::joinByCode).
ALTER TABLE point_ledger DROP CONSTRAINT point_ledger_reason_check;
ALTER TABLE point_ledger ADD CONSTRAINT point_ledger_reason_check
  CHECK (reason IN ('SIGNUP_BONUS','DAILY_BONUS','TRADE_BUY','TRADE_SELL',
                    'RESOLUTION_PAYOUT','MARKET_VOIDED','ADMIN_ADJUST',
                    'REFERRAL_BONUS','GROUP_JOIN_BONUS'));
