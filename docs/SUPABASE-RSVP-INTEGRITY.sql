-- Integrite des confirmations RSVP et des suppressions d'invites.
-- A executer une fois dans Supabase SQL Editor, apres SUPABASE-RLS-CORE.sql.

CREATE OR REPLACE FUNCTION public.delete_managed_guest(
    p_event_id TEXT,
    p_guest_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_manage_event(p_event_id) THEN
        RAISE EXCEPTION 'Organisateur non autorisé pour cet événement';
    END IF;

    DELETE FROM public.rsvps
    WHERE event_id = p_event_id AND guest_id = p_guest_id;

    DELETE FROM public.guests
    WHERE id = p_guest_id AND event_id = p_event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invité introuvable pour cet événement';
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_managed_guest(TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_rsvp_messages(p_event_id TEXT)
RETURNS TABLE(author_name TEXT, message TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
        SELECT g.full_name, r.message, r.created_at
        FROM public.rsvps r
        INNER JOIN public.guests g
                ON g.id = r.guest_id AND g.event_id = r.event_id
        WHERE r.event_id = p_event_id
            AND r.status = 'yes'
            AND char_length(trim(COALESCE(r.message, ''))) > 0
        ORDER BY r.created_at DESC
        LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_rsvp_messages(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_guest_rsvp(
    p_event_id TEXT,
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
    SELECT * INTO updated_guest
    FROM public.guests
    WHERE event_id = p_event_id AND token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation introuvable';
    END IF;
    IF updated_guest.status <> 'pending' THEN
        RAISE EXCEPTION 'Cette invitation a déjà reçu une réponse. Contactez l''organisateur en cas de problème.';
    END IF;
    IF p_status <> 'yes' THEN
        RAISE EXCEPTION 'Cette invitation doit être confirmée par l''organisateur pour être refusée.';
    END IF;

    UPDATE public.guests
    SET status = 'yes',
        phone = trim(COALESCE(p_phone, '')),
        adults = GREATEST(COALESCE(p_adults, 1), 1),
        children = GREATEST(COALESCE(p_children, 0), 0),
        rsvp_message = trim(COALESCE(p_message, '')),
        drink_choices = COALESCE(p_drink_choices, '[]'::jsonb)::text,
        profile_photo_url = COALESCE(NULLIF(p_profile_photo_url, ''), profile_photo_url),
        access_code = COALESCE(access_code, UPPER(LEFT(token, 8))),
        qr_approved = TRUE,
        responded_at = now()
    WHERE id = updated_guest.id
    RETURNING * INTO updated_guest;

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

GRANT EXECUTE ON FUNCTION public.submit_guest_rsvp(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, JSONB, TEXT) TO anon, authenticated;