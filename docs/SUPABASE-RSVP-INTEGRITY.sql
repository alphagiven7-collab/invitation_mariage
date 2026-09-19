-- DEPRECIE — ne pas executer.
--
-- Cette ancienne version de submit_guest_rsvp ecrasait un telephone vide,
-- refusait les RSVP "non" et exposait les messages sans verifier la publication.
-- Toutes ses responsabilites sont couvertes par :
--   docs/SUPABASE-PLATFORM-HARDENING.sql
DO $$
BEGIN
    RAISE EXCEPTION 'SUPABASE-RSVP-INTEGRITY.sql est obsolete. Executez SUPABASE-PLATFORM-HARDENING.sql selon docs/SUPABASE-SETUP.md.';
END;
$$;
