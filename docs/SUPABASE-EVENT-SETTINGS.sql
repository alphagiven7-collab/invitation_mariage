-- Migration : table event_settings (personnalisation cloud)
-- Exécuter dans Supabase SQL Editor après SUPABASE-SETUP.sql

CREATE TABLE IF NOT EXISTS event_settings (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    dashboard_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_settings_read" ON event_settings;
DROP POLICY IF EXISTS "event_settings_insert" ON event_settings;
DROP POLICY IF EXISTS "event_settings_update" ON event_settings;

CREATE POLICY "event_settings_read" ON event_settings FOR SELECT USING (true);
CREATE POLICY "event_settings_insert" ON event_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "event_settings_update" ON event_settings FOR UPDATE USING (true);

-- Seed vide pour yanick-keren (optionnel — le JSON sera rempli au premier save)
INSERT INTO event_settings (event_id, dashboard_json)
VALUES ('yanick-keren', '{}')
ON CONFLICT (event_id) DO NOTHING;
