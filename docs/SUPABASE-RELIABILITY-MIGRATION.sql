-- DEPRECIE — ne pas executer.
--
-- Cet ancien script recreait events_insert et rsvps_update avec USING (true).
-- La migration canonique restaure les politiques RLS strictes et les RPC
-- transactionnelles : docs/SUPABASE-PLATFORM-HARDENING.sql.
DO $$
BEGIN
    RAISE EXCEPTION 'SUPABASE-RELIABILITY-MIGRATION.sql est obsolete. Executez SUPABASE-PLATFORM-HARDENING.sql selon docs/SUPABASE-SETUP.md.';
END;
$$;
