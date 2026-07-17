-- ============================================================================
-- MIGRAÇÃO 008 — POSICIONAMENTO DE ANÚNCIO NA HOME
-- sponsorships.is_home já dizia "isso é um slot da home"; agora diz ONDE.
-- Default SIDEBAR preserva o comportamento de hoje pras linhas existentes.
-- ============================================================================

ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS home_placement text NOT NULL DEFAULT 'SIDEBAR'
  CHECK (home_placement IN ('SIDEBAR', 'BANNER', 'GRID'));
