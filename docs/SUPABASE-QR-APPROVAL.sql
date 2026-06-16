-- Validation QR admin — exécuter dans Supabase SQL Editor
ALTER TABLE guests ADD COLUMN IF NOT EXISTS qr_approved BOOLEAN DEFAULT FALSE;
