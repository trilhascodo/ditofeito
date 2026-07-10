-- Seeds mínimos de F0 (plano-construcao.md §3): usuário sistema + categoria
-- eleitoral. Sem eles, gerador.rodarGerador() lança "Seed ausente".
-- Idempotente (ON CONFLICT DO NOTHING) — seguro rodar mais de uma vez.

-- password_hash = '!' — nunca casa com argon2.verify(); usuário sistema não
-- faz login por senha, só existe como created_by/resolved_by de registros automáticos.
INSERT INTO users (handle, display_name, email, password_hash, role)
VALUES ('sistema', 'Sistema DitoFeito', 'sistema@ditofeito.com', '!', 'ADMIN')
ON CONFLICT (handle) DO NOTHING;

INSERT INTO categories (slug, name, vertical, brand_safe)
VALUES ('eleicoes-2026', 'Eleições 2026', 'POLITICA', false)
ON CONFLICT (slug) DO NOTHING;

-- Verticais não-políticas (decisão 10/jul/2026: mercados de esporte/cultura
-- pop como atrativo de engajamento, sem o limite de só política). brand_safe
-- = true aqui pro contrário de eleições — são exatamente as categorias
-- elegíveis pro patrocínio nativo (sponsors/sponsorships) quando existir.
INSERT INTO categories (slug, name, vertical, brand_safe) VALUES
  ('esportes', 'Esportes', 'ESPORTE', true),
  ('entretenimento', 'Entretenimento & Cultura Pop', 'ENTRETENIMENTO', true)
ON CONFLICT (slug) DO NOTHING;

-- "Menções": mercados de "expressão X foi dita em evento/discurso Y" —
-- mecânica, não tema (mistura Oscar, política, figura pública). vertical
-- OUTROS porque não é um assunto único; brand_safe=false porque a própria
-- categoria pode conter mercado político (ex.: presidente/pronunciamento)
-- mesmo quando o mercado individual não é (decisão 10/jul/2026).
INSERT INTO categories (slug, name, vertical, brand_safe)
VALUES ('mencoes', 'Menções', 'OUTROS', false)
ON CONFLICT (slug) DO NOTHING;

-- Moderadores reais: cadastrar manualmente via admin (não inventar contas aqui).
