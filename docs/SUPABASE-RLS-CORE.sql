-- Verrouillage RLS des donnees critiques multi-evenements.
-- Prerequis : SUPABASE-AUTH-FOUNDATION.sql doit etre execute et chaque evenement
-- existant doit avoir un owner_id. Deployer le nouveau JavaScript avant ce script.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'platform'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_platform_admin() OR EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND owner_id = auth.uid()
    );
$$;

-- Donne uniquement les champs necessaires a une invitation publique.
CREATE OR REPLACE FUNCTION public.get_public_event_config(p_event_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (
        jsonb_build_object(
            'id', e.id,
            'slug', e.slug,
            'type', e.type,
            'title', e.title
        ) || COALESCE(s.dashboard_json, e.config_json, '{}'::jsonb)
    ) - 'adminCode' - 'admin_code'
    FROM public.events e
    LEFT JOIN public.event_settings s ON s.event_id = e.id
    WHERE e.id = p_event_id;
$$;

-- Le token individuel donne acces a un seul invite, jamais a la liste complete.
CREATE OR REPLACE FUNCTION public.get_guest_invite(p_token TEXT)
RETURNS SETOF public.guests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.guests WHERE token = p_token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.submit_guest_rsvp(
    p_token TEXT,
    p_phone TEXT,
    p_status TEXT,
    p_adults INTEGER,
    p_children INTEGER,
    p_message TEXT,
    p_drink_choices JSONB DEFAULT '[]'::jsonb,
    p_profile_photo_url TEXT DEFAULT ''
)
RETURNS public.guests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_guest public.guests;
BEGIN
    IF p_status NOT IN ('yes', 'no') THEN
        RAISE EXCEPTION 'Statut RSVP invalide';
    END IF;

    UPDATE public.guests
    SET phone = COALESCE(NULLIF(p_phone, ''), phone),
        status = p_status,
        adults = GREATEST(COALESCE(p_adults, 1), 1),
        children = GREATEST(COALESCE(p_children, 0), 0),
        rsvp_message = COALESCE(p_message, ''),
        drink_choices = COALESCE(p_drink_choices, '[]'::jsonb)::text,
        profile_photo_url = COALESCE(NULLIF(p_profile_photo_url, ''), profile_photo_url),
        access_code = COALESCE(access_code, UPPER(LEFT(token, 8))),
        responded_at = now()
    WHERE token = p_token
    RETURNING * INTO updated_guest;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation introuvable';
    END IF;

    INSERT INTO public.rsvps (event_id, guest_id, full_name, phone, status, adults, children, message)
    VALUES (
        updated_guest.event_id, updated_guest.id, updated_guest.full_name,
        updated_guest.phone, updated_guest.status, updated_guest.adults,
        updated_guest.children, updated_guest.rsvp_message
    )
    ON CONFLICT (event_id, guest_id) WHERE guest_id IS NOT NULL
    DO UPDATE SET
        phone = EXCLUDED.phone,
        status = EXCLUDED.status,
        adults = EXCLUDED.adults,
        children = EXCLUDED.children,
        message = EXCLUDED.message,
        created_at = now();

    RETURN updated_guest;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_event_config(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_invite(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_rsvp(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, JSONB, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_guestbook_messages(p_event_id TEXT)
RETURNS TABLE(author_name TEXT, message TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT author_name, message, created_at
    FROM public.guestbook_messages
    WHERE event_id = p_event_id
    ORDER BY created_at DESC
    LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.post_guestbook_message(
    p_event_id TEXT,
    p_token TEXT,
    p_message TEXT
)
RETURNS TABLE(author_name TEXT, message TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    invite public.guests;
BEGIN
    IF char_length(trim(COALESCE(p_message, ''))) < 3 THEN
        RAISE EXCEPTION 'Message trop court';
    END IF;
    SELECT * INTO invite FROM public.guests
    WHERE event_id = p_event_id AND token = p_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation introuvable';
    END IF;
    RETURN QUERY
    INSERT INTO public.guestbook_messages (event_id, guest_id, author_name, message)
    VALUES (p_event_id, invite.id, invite.full_name, trim(p_message))
    RETURNING guestbook_messages.author_name, guestbook_messages.message, guestbook_messages.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_guestbook_messages(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_guestbook_message(TEXT, TEXT, TEXT) TO anon, authenticated;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guestbook_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_read" ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
DROP POLICY IF EXISTS "events_owner_all" ON public.events;
CREATE POLICY "events_owner_all" ON public.events
    FOR ALL USING (public.can_manage_event(id))
    WITH CHECK (public.is_platform_admin() OR owner_id = auth.uid());

DROP POLICY IF EXISTS "guests_read" ON public.guests;
DROP POLICY IF EXISTS "guests_insert" ON public.guests;
DROP POLICY IF EXISTS "guests_update" ON public.guests;
DROP POLICY IF EXISTS "guests_delete" ON public.guests;
DROP POLICY IF EXISTS "guests_owner_all" ON public.guests;
CREATE POLICY "guests_owner_all" ON public.guests
    FOR ALL USING (public.can_manage_event(event_id))
    WITH CHECK (public.can_manage_event(event_id));

DROP POLICY IF EXISTS "rsvps_read" ON public.rsvps;
DROP POLICY IF EXISTS "rsvps_insert" ON public.rsvps;
DROP POLICY IF EXISTS "rsvps_update" ON public.rsvps;
DROP POLICY IF EXISTS "rsvps_owner_all" ON public.rsvps;
CREATE POLICY "rsvps_owner_all" ON public.rsvps
    FOR ALL USING (public.can_manage_event(event_id))
    WITH CHECK (public.can_manage_event(event_id));

DROP POLICY IF EXISTS "event_settings_read" ON public.event_settings;
DROP POLICY IF EXISTS "event_settings_insert" ON public.event_settings;
DROP POLICY IF EXISTS "event_settings_update" ON public.event_settings;
DROP POLICY IF EXISTS "event_settings_owner_all" ON public.event_settings;
CREATE POLICY "event_settings_owner_all" ON public.event_settings
    FOR ALL USING (public.can_manage_event(event_id))
    WITH CHECK (public.can_manage_event(event_id));

DROP POLICY IF EXISTS "check_ins_read" ON public.check_ins;
DROP POLICY IF EXISTS "check_ins_insert" ON public.check_ins;
DROP POLICY IF EXISTS "check_ins_owner_all" ON public.check_ins;
CREATE POLICY "check_ins_owner_all" ON public.check_ins
    FOR ALL USING (public.can_manage_event(event_id))
    WITH CHECK (public.can_manage_event(event_id));

DROP POLICY IF EXISTS "guestbook_read" ON public.guestbook_messages;
DROP POLICY IF EXISTS "guestbook_insert" ON public.guestbook_messages;
DROP POLICY IF EXISTS "guestbook_owner_all" ON public.guestbook_messages;
CREATE POLICY "guestbook_owner_all" ON public.guestbook_messages
    FOR ALL USING (public.can_manage_event(event_id))
    WITH CHECK (public.can_manage_event(event_id));

DROP POLICY IF EXISTS "analytics_read" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_insert" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_owner_read" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_public_insert" ON public.analytics_events;
CREATE POLICY "analytics_owner_read" ON public.analytics_events
    FOR SELECT USING (public.can_manage_event(event_id));
CREATE POLICY "analytics_public_insert" ON public.analytics_events
    FOR INSERT WITH CHECK (true);