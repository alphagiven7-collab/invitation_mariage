-- Politiques Storage pour le bucket public event-assets.
-- Exécuter après SUPABASE-RLS-CORE.sql. Ne pas exécuter le fichier
-- SUPABASE-STORAGE.sql incomplet.

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-assets', 'event-assets', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "event_assets_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "event_assets_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "event_assets_owner_delete" ON storage.objects;

CREATE POLICY "event_assets_owner_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'event-assets'
    AND public.can_manage_event((storage.foldername(name))[1])
);

CREATE POLICY "event_assets_owner_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'event-assets'
    AND public.can_manage_event((storage.foldername(name))[1])
)
WITH CHECK (
    bucket_id = 'event-assets'
    AND public.can_manage_event((storage.foldername(name))[1])
);

CREATE POLICY "event_assets_owner_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'event-assets'
    AND public.can_manage_event((storage.foldername(name))[1])
);