-- Champs invité : code d'accès, table, boissons, photo profil (carte QR jour J)
-- Exécuter dans Supabase → SQL Editor

ALTER TABLE guests ADD COLUMN IF NOT EXISTS access_code TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS drink_choices TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
