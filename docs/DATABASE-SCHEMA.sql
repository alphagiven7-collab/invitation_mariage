-- Schéma SQLite pour backend futur (100+ invités par événement)
-- Compatible migration vers PostgreSQL (Supabase)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'client', -- platform_admin | client
    full_name     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    owner_id      TEXT NOT NULL REFERENCES users(id),
    type          TEXT NOT NULL DEFAULT 'wedding', -- wedding | birthday | conference
    title         TEXT NOT NULL,
    subtitle      TEXT,
    message       TEXT,
    event_date    TEXT,
    venue         TEXT,
    primary_color TEXT DEFAULT '#4caf50',
    accent_color  TEXT DEFAULT '#ec4899',
    config_json   TEXT, -- sections ON/OFF, images, liens
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guests (
    id            TEXT PRIMARY KEY,
    event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    slug          TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    phone         TEXT,
    email         TEXT,
    group_name    TEXT,
    token         TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'pending', -- pending | yes | no
    adults        INTEGER DEFAULT 1,
    children      INTEGER DEFAULT 0,
    rsvp_message  TEXT,
    responded_at  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(event_id, slug)
);

CREATE TABLE IF NOT EXISTS rsvps (
    id            TEXT PRIMARY KEY,
    event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_id      TEXT REFERENCES guests(id) ON DELETE SET NULL,
    full_name     TEXT NOT NULL,
    phone         TEXT,
    status        TEXT NOT NULL,
    adults        INTEGER DEFAULT 1,
    children      INTEGER DEFAULT 0,
    message       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guestbook_messages (
    id            TEXT PRIMARY KEY,
    event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_id      TEXT REFERENCES guests(id) ON DELETE SET NULL,
    author_name   TEXT NOT NULL,
    message       TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(event_id);
CREATE INDEX IF NOT EXISTS idx_guests_token ON guests(token);
CREATE INDEX IF NOT EXISTS idx_guests_status ON guests(event_id, status);
CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
