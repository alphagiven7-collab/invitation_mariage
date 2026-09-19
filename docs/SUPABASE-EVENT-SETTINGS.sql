-- DEPRECIE — ne pas executer.
--
-- event_settings est cree par SUPABASE-SETUP.sql. Cet ancien script recreait
-- des politiques publiques. La migration canonique gere maintenant la
-- personnalisation cloud et retire les champs prives de la configuration :
--   docs/SUPABASE-PLATFORM-HARDENING.sql
DO $$
BEGIN
    RAISE EXCEPTION 'SUPABASE-EVENT-SETTINGS.sql est obsolete. Executez SUPABASE-PLATFORM-HARDENING.sql selon docs/SUPABASE-SETUP.md.';
END;
$$;
