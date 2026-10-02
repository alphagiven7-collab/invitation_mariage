-- A executer APRES SUPABASE-PLATFORM-HARDENING.sql et SUPABASE-STORAGE-RLS.sql.
-- Les comptes organisateurs utilisent un email Auth interne derive du numero.
-- Ils sont crees par /api/organizer, jamais par le navigateur.

CREATE TABLE IF NOT EXISTS public.event_guest_managers (
    event_id TEXT PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.event_guest_managers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_guest_managers FROM anon, authenticated;
GRANT ALL ON public.event_guest_managers TO service_role;

-- Les anciens proprietaires/collaborateurs restent habilites a gerer les invites.
-- La personnalisation et l'administration generale deviennent reservees a la plateforme.
CREATE OR REPLACE FUNCTION public.can_manage_guests(p_event_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public.is_platform_admin()
        OR EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.event_collaborators WHERE event_id = p_event_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.event_guest_managers WHERE event_id = p_event_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_event_id IS NOT NULL AND public.is_platform_admin();
$$;

DROP POLICY IF EXISTS "events_manager_read" ON public.events;
CREATE POLICY "events_manager_read" ON public.events
    FOR SELECT USING (public.can_manage_guests(id));

DROP POLICY IF EXISTS "guests_owner_all" ON public.guests;
DROP POLICY IF EXISTS "guests_manager_all" ON public.guests;
CREATE POLICY "guests_manager_all" ON public.guests
    FOR ALL USING (public.can_manage_guests(event_id))
    WITH CHECK (public.can_manage_guests(event_id));

DROP POLICY IF EXISTS "rsvps_owner_all" ON public.rsvps;
DROP POLICY IF EXISTS "rsvps_manager_all" ON public.rsvps;
CREATE POLICY "rsvps_manager_all" ON public.rsvps
    FOR ALL USING (public.can_manage_guests(event_id))
    WITH CHECK (public.can_manage_guests(event_id));

DROP POLICY IF EXISTS "check_ins_owner_all" ON public.check_ins;
DROP POLICY IF EXISTS "check_ins_manager_all" ON public.check_ins;
CREATE POLICY "check_ins_manager_all" ON public.check_ins
    FOR ALL USING (public.can_manage_guests(event_id))
    WITH CHECK (public.can_manage_guests(event_id));

-- Les deux RPC d'import/suppression utilisent le controle partage par la gestion invite.
-- On conserve leur implementation de la migration de durcissement et remplace
-- uniquement le controle d'acces via le corps de la fonction ci-dessous.
DO $$
DECLARE fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid, pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('delete_managed_guest', 'replace_managed_guests')
    LOOP
        IF position('NOT public.can_manage_guests(target_event_id)' IN fn.definition) > 0 THEN
            CONTINUE;
        END IF;
        IF position('NOT public.can_manage_event(target_event_id)' IN fn.definition) = 0 THEN
            RAISE EXCEPTION 'Controle d acces RPC absent: %', fn.oid::regprocedure;
        END IF;
        EXECUTE replace(fn.definition,
            'NOT public.can_manage_event(target_event_id)',
            'NOT public.can_manage_guests(target_event_id)');
    END LOOP;
END;
$$;

-- Les photos de fiches invites peuvent etre ajoutees sans autoriser les medias
-- de personnalisation. MediaUpload nomme ces objets <event>/<date>-guest-profile.jpg.
DROP POLICY IF EXISTS "event_assets_guest_photo_insert" ON storage.objects;
DROP POLICY IF EXISTS "event_assets_guest_photo_select" ON storage.objects;
CREATE POLICY "event_assets_guest_photo_select" ON storage.objects
    FOR SELECT TO authenticated USING (
        bucket_id = 'event-assets'
        AND public.can_manage_guests((storage.foldername(name))[1])
        AND storage.filename(name) ~ '^[0-9]+-guest-profile\.(jpg|jpeg|png|webp)$'
    );
CREATE POLICY "event_assets_guest_photo_insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'event-assets'
        AND public.can_manage_guests((storage.foldername(name))[1])
        AND storage.filename(name) ~ '^[0-9]+-guest-profile\.(jpg|jpeg|png|webp)$'
    );
DROP POLICY IF EXISTS "event_assets_guest_photo_update" ON storage.objects;
CREATE POLICY "event_assets_guest_photo_update" ON storage.objects
    FOR UPDATE TO authenticated USING (
        bucket_id = 'event-assets'
        AND public.can_manage_guests((storage.foldername(name))[1])
        AND storage.filename(name) ~ '^[0-9]+-guest-profile\.(jpg|jpeg|png|webp)$'
    ) WITH CHECK (
        bucket_id = 'event-assets'
        AND public.can_manage_guests((storage.foldername(name))[1])
        AND storage.filename(name) ~ '^[0-9]+-guest-profile\.(jpg|jpeg|png|webp)$'
    );

REVOKE ALL ON FUNCTION public.can_manage_guests(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_guests(TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
.