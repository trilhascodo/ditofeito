-- Analytics próprio (sem cookie, sem terceiro) — visitor_hash é
-- sha256(salt-do-dia + ip + user-agent); o salt roda em memória do processo
-- da API e nunca é persistido, então o hash não é reversível pro IP real.
CREATE TABLE page_views (
  id            bigserial PRIMARY KEY,
  path          text NOT NULL,
  referrer_host text,
  visitor_hash  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_page_views_created_at ON page_views(created_at);
CREATE INDEX idx_page_views_path ON page_views(path, created_at);
