-- Dois momentos de celebração novos: bolão resolvido (hoje ninguém é avisado
-- quando um bolão com amigos resolve) e marco de sequência de acertos
-- (streak_current já existia, nunca era comemorado).
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('MARKET_RESOLVED', 'MARKET_VOIDED', 'NEW_COMMENT',
                  'SPONSOR_REVIEW_APPROVED', 'SPONSOR_REVIEW_REJECTED',
                  'BOLAO_CLOSING_SOON', 'GROUP_JOINED',
                  'BOLAO_RESOLVED', 'STREAK_MILESTONE'));
