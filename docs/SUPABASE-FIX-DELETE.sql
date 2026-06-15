-- ============================================================
-- SUPABASE : autoriser la suppression des invités
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1. Politique DELETE (obligatoire si RLS activé)
DROP POLICY IF EXISTS "guests_delete" ON guests;
CREATE POLICY "guests_delete" ON guests FOR DELETE USING (true);

-- 2. Vérification (doit retourner la policy guests_delete)
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'guests';
