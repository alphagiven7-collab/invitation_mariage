-- Check-in jour J — exécuter dans Supabase SQL Editor
-- Après SUPABASE-SETUP.sql et SUPABASE-GUEST-EXTRAS.sql

CREATE TABLE IF NOT EXISTS check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
    guest_token TEXT NOT NULL,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scanned_by TEXT,
    device_id TEXT,
    UNIQUE (event_id, guest_token)
);

CREATE INDEX IF NOT EXISTS idx_check_ins_event ON check_ins(event_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_event_time ON check_ins(event_id, scanned_at DESC);

ALTER TABLE guests ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "check_ins_read" ON check_ins FOR SELECT USING (true);
CREATE POLICY "check_ins_insert" ON check_ins FOR INSERT WITH CHECK (true);
