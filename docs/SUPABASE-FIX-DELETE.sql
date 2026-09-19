-- DEPRECIE — ne pas executer.
--
-- Cet ancien correctif creait une politique guests_delete USING (true), qui
-- permettait la suppression publique d'invites. Il est remplace par :
--   docs/SUPABASE-PLATFORM-HARDENING.sql
--
-- Le fichier echoue volontairement afin d'eviter de reintroduire cette faille.
DO $$
BEGIN
    RAISE EXCEPTION 'SUPABASE-FIX-DELETE.sql est obsolete. Executez SUPABASE-PLATFORM-HARDENING.sql selon docs/SUPABASE-SETUP.md.';
END;
$$;
