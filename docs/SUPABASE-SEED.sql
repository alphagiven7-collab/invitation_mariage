-- Données initiales après SUPABASE-SETUP.sql

INSERT INTO events (id, slug, title, type, config_json)
VALUES
  ('yanick-keren', 'yanick-keren', 'Mariage de Yanick et Keren', 'wedding', '{}'),
  ('anniversaire-grace', 'anniversaire-grace', 'Anniversaire de Grace', 'birthday', '{}'),
  ('conference-tech-2026', 'conference-tech-2026', 'Conférence Tech Kinshasa 2026', 'conference', '{}')
ON CONFLICT (id) DO NOTHING;
