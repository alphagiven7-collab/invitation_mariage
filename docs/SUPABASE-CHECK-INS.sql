-- DEPRECIE — ne pas executer.
--
-- check_ins est cree et protege par SUPABASE-RLS-CORE.sql. Cet ancien script
-- ajoutait des politiques publiques. Utilisez la migration canonique pour une
-- installation ou une mise a niveau securisee :
--   docs/SUPABASE-PLATFORM-HARDENING.sql
DO $$
BEGIN
    RAISE EXCEPTION 'SUPABASE-CHECK-INS.sql est obsolete. Executez SUPABASE-PLATFORM-HARDENING.sql selon docs/SUPABASE-SETUP.md.';
END;
$$;
