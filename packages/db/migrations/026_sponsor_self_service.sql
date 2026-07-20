-- ============================================================================
-- MIGRAÇÃO 026 — AUTOATENDIMENTO DE ANUNCIANTE (conta + campanha + arte)
-- Inverte quem digita: hoje admin cria sponsor, vincula usuário e monta cada
-- patrocínio manualmente. Aqui o anunciante aplica pra conta, pede a própria
-- campanha e sobe a própria arte — admin só aprova/rejeita, nunca perde o
-- controle editorial (regra §7 da Metodologia: nunca publicidade de
-- candidato/partido/comitê, e isso não dá pra checar automaticamente numa
-- imagem, por isso arte sempre passa por revisão humana antes de ir ao ar).
-- ============================================================================

-- Aplicação de conta de anunciante — mesmo padrão de market_requests
-- (021_market_requests.sql): usuário comum propõe, admin decide.
CREATE TABLE sponsor_applications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id),
  company_name   text NOT NULL,
  requested_plan text NOT NULL CHECK (requested_plan IN ('BASICO', 'PROFISSIONAL', 'PREMIUM')),
  site_url       text,
  logo_url       text,
  message        text,
  status         text NOT NULL DEFAULT 'NOVO' CHECK (status IN ('NOVO', 'APROVADO', 'REJEITADO')),
  admin_note     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsor_applications_status ON sponsor_applications(status, created_at DESC);
-- Uma aplicação NOVO por vez por usuário — evita duplicata de clique duplo ou
-- reenvio em loop enquanto a primeira ainda não foi revisada.
CREATE UNIQUE INDEX sponsor_applications_pending_user
  ON sponsor_applications (user_id) WHERE status = 'NOVO';

-- Aprovação de campanha (sponsorship). Default APPROVED preserva 100% do
-- comportamento atual pra tudo que o admin já cria manualmente em
-- AdminSponsors.tsx — só campanhas pedidas via autoatendimento nascem PENDING.
ALTER TABLE sponsorships
  ADD COLUMN approval_status text NOT NULL DEFAULT 'APPROVED'
    CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  ADD COLUMN admin_note text;

-- Arte em revisão — coexiste com creative_url (o que está ao vivo agora);
-- pending some quando aprovada (copiada pra creative_url) ou rejeitada
-- (descartada). Enquanto isso a arte antiga continua no ar sem interrupção.
ALTER TABLE sponsors
  ADD COLUMN pending_creative_url text,
  ADD COLUMN creative_review_status text NOT NULL DEFAULT 'NONE'
    CHECK (creative_review_status IN ('NONE', 'PENDING', 'APPROVED', 'REJECTED')),
  ADD COLUMN creative_admin_note text;

-- Dois kinds genéricos reaproveitados nos três pontos de decisão (aplicação,
-- campanha, arte) — o texto de `body` já diferencia o que foi decidido, evita
-- inflar o CHECK com kinds quase idênticos por domínio.
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('MARKET_RESOLVED', 'MARKET_VOIDED', 'NEW_COMMENT',
                  'SPONSOR_REVIEW_APPROVED', 'SPONSOR_REVIEW_REJECTED'));
