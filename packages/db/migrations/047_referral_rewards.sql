-- ============================================================================
-- 047 — "Traga gente, ganhe pontos" (link pessoal ?ref=)
-- Mesmo espírito do bônus de convite de grupo (035): pontos não-conversíveis
-- pra quem traz audiência — nunca dinheiro, nunca por clique em anúncio (isso
-- estragaria a métrica que o patrocinador paga, ver routers/adEvents.ts).
--
--   REF_VISIT  — visitantes únicos que chegaram pelo link da pessoa num dia,
--                creditado de madrugada pelo job (jobs/referralRewards.ts).
--   REF_SIGNUP — cadastro vindo do link, pago só quando o novo usuário ATIVA
--                (CPF confirmado + 1º palpite) — conta falsa não rende nada.
--
-- Também conserta o CHECK do ledger: 044 reescreveu a lista sem
-- REFERRAL_BONUS/GROUP_JOIN_BONUS (035), então entrar num grupo pelo convite
-- de outra pessoa (grupos.ts::joinByCode) violava o CHECK e desfazia tudo.
-- ============================================================================

ALTER TABLE point_ledger DROP CONSTRAINT point_ledger_reason_check;
ALTER TABLE point_ledger ADD CONSTRAINT point_ledger_reason_check CHECK (reason IN (
  'SIGNUP_BONUS', 'DAILY_BONUS', 'TRADE_BUY', 'TRADE_SELL', 'RESOLUTION_PAYOUT',
  'MARKET_VOIDED', 'ADMIN_ADJUST', 'TOPUP',
  'REFERRAL_BONUS', 'GROUP_JOIN_BONUS',
  'REF_VISIT', 'REF_SIGNUP'
));

ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('MARKET_RESOLVED', 'MARKET_VOIDED', 'NEW_COMMENT',
                  'SPONSOR_REVIEW_APPROVED', 'SPONSOR_REVIEW_REJECTED',
                  'BOLAO_CLOSING_SOON', 'GROUP_JOINED',
                  'BOLAO_RESOLVED', 'STREAK_MILESTONE',
                  'REFERRAL_ACTIVATED'));

-- Código curto e público do link pessoal (não é segredo — só identifica quem
-- indicou). Default volátil = cada linha existente ganha o seu no ADD COLUMN.
ALTER TABLE users
  ADD COLUMN ref_code text NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 8),
  ADD COLUMN referred_by uuid REFERENCES users(id),
  ADD COLUMN referral_activated_at timestamptz;

-- Visita que chegou por um link ?ref= (só a sessão de chegada — ver
-- web/src/lib/attribution.ts). Base do crédito diário REF_VISIT.
ALTER TABLE page_views ADD COLUMN ref_user_id uuid REFERENCES users(id);
CREATE INDEX idx_page_views_ref ON page_views (ref_user_id, created_at) WHERE ref_user_id IS NOT NULL;

-- Trilha do que foi pago e trava de idempotência (job pode rodar duas vezes,
-- ativação pode ser tentada de vários caminhos). Pontos em si vivem no ledger.
CREATE TABLE referral_rewards (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),        -- quem indicou (recebe)
  kind        text NOT NULL CHECK (kind IN ('VISIT', 'SIGNUP')),
  day         date,                                      -- VISIT: dia (America/Sao_Paulo)
  invitee_id  uuid REFERENCES users(id),                 -- SIGNUP: quem ativou
  quantity    integer NOT NULL,                          -- VISIT: visitantes únicos | SIGNUP: 1
  points      integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'VISIT' AND day IS NOT NULL) OR (kind = 'SIGNUP' AND invitee_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_referral_visit_day ON referral_rewards (user_id, day) WHERE kind = 'VISIT';
CREATE UNIQUE INDEX uq_referral_signup ON referral_rewards (invitee_id) WHERE kind = 'SIGNUP';
CREATE INDEX idx_referral_rewards_user ON referral_rewards (user_id, created_at DESC);
