-- Bucket pour photos personnalisation (sync multi-appareils)
-- Exécuter dans Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'event-assets',
    'event-assets',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "event_assets_public_read" ON storage.objects;
DROP POLICY IF EXISTS "event_assets_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "event_assets_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "event_assets_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "event_assets_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "event_assets_owner_delete" ON storage.objects;

CREATE POLICY "event_assets_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'event-assets');

-- Les fichiers sont publics en lecture pour les afficher dans les invitations.
-- L'ecriture est limitee au proprietaire de l'evenement du premier dossier.
CREATE POLICY "event_assets_owner_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'event-assets'
        AND public.can_manage_event((storage.foldername(name))[1])
    );

CREATE POLICY "event_assets_owner_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'event-assets'
        AND public.can_manage_event((storage.foldername(name))[1])
    )
    WITH CHECK (
        bucket_id = 'event-assets'
        AND public.can_manage_event((storage.foldername(name))[1])
    );

CREATE POLICY "event_assets_owner_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'event-assets'
        AND public.can_manage_event((storage.foldername(name))[1])
    );
