-- ============================================================================
-- MIGRAÇÃO 012 — f_norm_name QUEBRAVA EM RESTORE (search_path vazio)
-- pg_dump/pg_restore sempre zera o search_path no início do restore
-- (`SELECT pg_catalog.set_config('search_path', '', false)`), por segurança
-- (padrão desde o Postgres 11). f_norm_name (migrations/002_tse.sql) chamava
-- unaccent(...) sem qualificar o schema — funciona numa sessão normal (que
-- tem "public" no search_path por padrão), mas quebra durante restore.
-- Achado rodando infra/scripts/restore-test.sh de verdade contra um backup
-- real — exatamente o tipo de problema que esse teste existe pra pegar.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.f_norm_name(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT trim(regexp_replace(
           upper(public.unaccent('public.unaccent', coalesce(t,''))),
           '[^A-Z0-9 ]| +', ' ', 'g'))
$$;
