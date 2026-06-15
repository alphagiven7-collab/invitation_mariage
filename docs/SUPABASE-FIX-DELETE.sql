-- Exécuter dans Supabase → SQL Editor si la suppression d'invités ne fonctionne pas
-- Cause : politique RLS DELETE manquante sur la table guests

DROP POLICY IF EXISTS "guests_delete" ON guests;
CREATE POLICY "guests_delete" ON guests FOR DELETE USING (true);
