-- Seeds mínimos de F0 (plano-construcao.md §3): usuário sistema + categoria
-- eleitoral. Sem eles, gerador.rodarGerador() lança "Seed ausente".
-- Idempotente (ON CONFLICT DO NOTHING) — seguro rodar mais de uma vez.

-- password_hash = '!' — nunca casa com argon2.verify(); usuário sistema não
-- faz login por senha, só existe como created_by/resolved_by de registros automáticos.
INSERT INTO users (handle, display_name, email, password_hash, role)
VALUES ('sistema', 'Sistema DitoFeito', 'sistema@ditofeito.com.br', '!', 'ADMIN')
ON CONFLICT (handle) DO NOTHING;

INSERT INTO categories (slug, name, vertical, brand_safe)
VALUES ('eleicoes-2026', 'Eleições 2026', 'POLITICA', false)
ON CONFLICT (slug) DO NOTHING;

-- Moderadores reais: cadastrar manualmente via admin (não inventar contas aqui).
