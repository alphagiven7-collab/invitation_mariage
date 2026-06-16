-- Supabase: exécuter dans SQL Editor (https://supabase.com/dashboard)
-- Active Row Level Security pour usage public sécurisé

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    owner_email TEXT,
    type TEXT DEFAULT 'wedding',
    title TEXT NOT NULL,
    config_json JSONB DEFAULT '{}',
    admin_code_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    group_name TEXT,
    token TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending',
    adults INT DEFAULT 1,
    children INT DEFAULT 0,
    rsvp_message TEXT,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(event_id, slug)
);

CREATE TABLE IF NOT EXISTS rsvps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL,
    adults INT DEFAULT 1,
    children INT DEFAULT 0,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guestbook_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    guest_token TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE guestbook_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Lecture publique invités (via token dans l'app)
CREATE POLICY "guests_read" ON guests FOR SELECT USING (true);
CREATE POLICY "guests_insert" ON guests FOR INSERT WITH CHECK (true);
CREATE POLICY "guests_update" ON guests FOR UPDATE USING (true);
CREATE POLICY "guests_delete" ON guests FOR DELETE USING (true);

CREATE POLICY "rsvps_insert" ON rsvps FOR INSERT WITH CHECK (true);
CREATE POLICY "rsvps_read" ON rsvps FOR SELECT USING (true);

CREATE POLICY "guestbook_insert" ON guestbook_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "guestbook_read" ON guestbook_messages FOR SELECT USING (true);

CREATE POLICY "analytics_insert" ON analytics_events FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_read" ON analytics_events FOR SELECT USING (true);

CREATE POLICY "events_read" ON events FOR SELECT USING (true);

-- Personnalisation dashboard (programme, GPS, infos pratiques, visuels)
CREATE TABLE IF NOT EXISTS event_settings (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    dashboard_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_settings_read" ON event_settings FOR SELECT USING (true);
CREATE POLICY "event_settings_insert" ON event_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "event_settings_update" ON event_settings FOR UPDATE USING (true);
