-- RSVP public, avec ou sans liste prealable. Executez ce script une fois dans Supabase SQL Editor.
-- Prerequis: docs/SUPABASE-RLS-CORE.sql et la table event_settings.

CREATE OR REPLACE FUNCTION public.submit_public_rsvp(
    p_event_id TEXT,
    p_full_name TEXT,
    p_phone TEXT,
    p_adults INTEGER DEFAULT 1,
    p_children INTEGER DEFAULT 0,
    p_message TEXT DEFAULT ''
)
RETURNS public.rsvps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    saved_rsvp public.rsvps;
    saved_guest public.guests;
    normalized_name TEXT := lower(trim(COALESCE(p_full_name, '')));
    guest_slug TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND is_published = TRUE
    ) THEN
        RAISE EXCEPTION 'Invitation introuvable ou non publiee';
    END IF;
    IF length(trim(COALESCE(p_full_name, ''))) < 2 THEN
        RAISE EXCEPTION 'Nom invalide';
    END IF;

    guest_slug := regexp_replace(
        translate(normalized_name, 'àáâäçèéêëìíîïñòóôöùúûüýÿ', 'aaaaceeeeiiiinoooouuuuyy'),
        '[^a-z0-9]+', '-', 'g'
    );
    guest_slug := trim(both '-' from guest_slug);

    SELECT * INTO saved_guest
    FROM public.guests
    WHERE event_id = p_event_id AND slug = guest_slug
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.guests
        SET phone = COALESCE(NULLIF(trim(COALESCE(p_phone, '')), ''), phone),
            status = 'yes',
            adults = GREATEST(1, LEAST(COALESCE(p_adults, 1), 10)),
            children = GREATEST(0, LEAST(COALESCE(p_children, 0), 10)),
            rsvp_message = trim(COALESCE(p_message, '')),
            responded_at = now()
        WHERE id = saved_guest.id
        RETURNING * INTO saved_guest;
    ELSE
        INSERT INTO public.guests (
            event_id, slug, full_name, phone, token, status, adults, children, rsvp_message, responded_at, qr_approved
        ) VALUES (
            p_event_id, guest_slug, trim(p_full_name), trim(COALESCE(p_phone, '')),
            replace(gen_random_uuid()::text, '-', ''), 'yes',
            GREATEST(1, LEAST(COALESCE(p_adults, 1), 10)),
            GREATEST(0, LEAST(COALESCE(p_children, 0), 10)),
            trim(COALESCE(p_message, '')), now(), FALSE
        ) RETURNING * INTO saved_guest;
    END IF;

    INSERT INTO public.rsvps (event_id, guest_id, full_name, phone, status, adults, children, message)
    VALUES (p_event_id, saved_guest.id, saved_guest.full_name, saved_guest.phone, 'yes',
        GREATEST(1, LEAST(COALESCE(p_adults, 1), 10)),
        GREATEST(0, LEAST(COALESCE(p_children, 0), 10)), trim(COALESCE(p_message, '')))
    ON CONFLICT (event_id, guest_id) WHERE guest_id IS NOT NULL
    DO UPDATE SET
        phone = EXCLUDED.phone,
        status = EXCLUDED.status,
        adults = EXCLUDED.adults,
        children = EXCLUDED.children,
        message = EXCLUDED.message,
        created_at = now()
    RETURNING * INTO saved_rsvp;
    RETURN saved_rsvp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_rsvp(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT) TO anon, authenticated;

-- Parcours RSVP ouvert simplifié : nom, présence et côté choisi.
-- Le côté est enregistré dans guests.group_name et aucune donnée de contact
-- n'est rendue publique par cette fonction.
DROP FUNCTION IF EXISTS public.submit_open_rsvp(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_open_rsvp(
    p_event_id TEXT,
    p_full_name TEXT,
    p_status TEXT,
    p_side TEXT,
    p_drink_choices JSONB DEFAULT '[]'::jsonb
)
RETURNS public.rsvps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    saved_guest public.guests;
    saved_rsvp public.rsvps;
    normalized_name TEXT := lower(trim(COALESCE(p_full_name, '')));
    guest_slug TEXT;
    side_label TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND is_published = TRUE
    ) THEN
        RAISE EXCEPTION 'Invitation introuvable ou non publiée';
    END IF;
    IF char_length(trim(COALESCE(p_full_name, ''))) < 2 THEN
        RAISE EXCEPTION 'Nom invalide';
    END IF;
    IF p_status NOT IN ('yes', 'no') THEN
        RAISE EXCEPTION 'Réponse de présence invalide';
    END IF;
    side_label := CASE p_side
        WHEN 'male' THEN 'Côté homme'
        WHEN 'female' THEN 'Côté femme'
        ELSE NULL
    END;
    IF side_label IS NULL THEN
        RAISE EXCEPTION 'Côté de confirmation invalide';
    END IF;

    guest_slug := trim(both '-' FROM regexp_replace(
        translate(normalized_name, 'àáâäçèéêëìíîïñòóôöùúûüýÿ', 'aaaaceeeeiiiinoooouuuuyy'),
        '[^a-z0-9]+', '-', 'g'
    ));

    SELECT * INTO saved_guest
    FROM public.guests
    WHERE event_id = p_event_id AND slug = guest_slug
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.guests
        SET group_name = side_label,
            status = p_status,
            adults = 1,
            children = 0,
            drink_choices = COALESCE(p_drink_choices, '[]'::jsonb)::text,
            responded_at = now()
        WHERE id = saved_guest.id
        RETURNING * INTO saved_guest;
    ELSE
        INSERT INTO public.guests (
            event_id, slug, full_name, group_name, token, status, adults, children, drink_choices, responded_at, qr_approved
        ) VALUES (
            p_event_id, guest_slug, trim(p_full_name), side_label,
            replace(gen_random_uuid()::text, '-', ''), p_status, 1, 0,
            COALESCE(p_drink_choices, '[]'::jsonb)::text, now(), FALSE
        ) RETURNING * INTO saved_guest;
    END IF;

    INSERT INTO public.rsvps (event_id, guest_id, full_name, phone, status, adults, children, message)
    VALUES (p_event_id, saved_guest.id, saved_guest.full_name, '', p_status, 1, 0, '')
    ON CONFLICT (event_id, guest_id) WHERE guest_id IS NOT NULL
    DO UPDATE SET
        full_name = EXCLUDED.full_name,
        status = EXCLUDED.status,
        adults = EXCLUDED.adults,
        children = EXCLUDED.children,
        created_at = now()
    RETURNING * INTO saved_rsvp;

    RETURN saved_rsvp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_open_rsvp(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- Répare les confirmations publiques déjà reçues avant cette mise à jour.
-- Elles deviennent visibles dans la liste administrateur, sans QR approuvé.
INSERT INTO public.guests (
    event_id, slug, full_name, phone, token, status, adults, children, rsvp_message, responded_at, qr_approved
)
SELECT DISTINCT ON (r.event_id, guest_slug)
    r.event_id,
    guest_slug,
    trim(r.full_name),
    trim(COALESCE(r.phone, '')),
    replace(gen_random_uuid()::text, '-', ''),
    'yes',
    GREATEST(1, LEAST(COALESCE(r.adults, 1), 10)),
    GREATEST(0, LEAST(COALESCE(r.children, 0), 10)),
    trim(COALESCE(r.message, '')),
    r.created_at,
    FALSE
FROM (
    SELECT
        r.*,
        trim(both '-' from regexp_replace(
            translate(
                lower(trim(COALESCE(r.full_name, ''))),
                'àáâäçèéêëìíîïñòóôöùúûüýÿ',
                'aaaaceeeeiiiinoooouuuuyy'
            ),
            '[^a-z0-9]+', '-', 'g'
        )) AS guest_slug
    FROM public.rsvps r
    WHERE r.guest_id IS NULL
) r
WHERE r.guest_slug <> ''
ORDER BY r.event_id, guest_slug, r.created_at DESC
ON CONFLICT (event_id, slug) DO NOTHING;

-- Conserve une seule réponse orpheline par invité potentiel.
DELETE FROM public.rsvps r
USING (
    SELECT id, row_number() OVER (
        PARTITION BY event_id, trim(both '-' FROM regexp_replace(
            translate(lower(trim(COALESCE(full_name, ''))),
                'àáâäçèéêëìíîïñòóôöùúûüýÿ', 'aaaaceeeeiiiinoooouuuuyy'),
            '[^a-z0-9]+', '-', 'g'
        ))
        ORDER BY created_at DESC, id DESC
    ) AS duplicate_rank
    FROM public.rsvps
    WHERE guest_id IS NULL
) ranked
WHERE r.id = ranked.id AND ranked.duplicate_rank > 1;

-- Quand un invité possède déjà un RSVP, le plus récent des deux est conservé.
UPDATE public.rsvps linked
SET full_name = orphan.full_name,
    phone = orphan.phone,
    status = orphan.status,
    adults = orphan.adults,
    children = orphan.children,
    message = orphan.message,
    created_at = orphan.created_at
FROM public.rsvps orphan
INNER JOIN public.guests g
    ON g.event_id = orphan.event_id
    AND g.slug = trim(both '-' FROM regexp_replace(
        translate(lower(trim(COALESCE(orphan.full_name, ''))),
            'àáâäçèéêëìíîïñòóôöùúûüýÿ', 'aaaaceeeeiiiinoooouuuuyy'),
        '[^a-z0-9]+', '-', 'g'
    ))
WHERE orphan.guest_id IS NULL
  AND linked.event_id = orphan.event_id
  AND linked.guest_id = g.id
  AND orphan.created_at > linked.created_at;

-- Les RSVP orphelins déjà fusionnés sont supprimés avant tout rattachement.
DELETE FROM public.rsvps orphan
USING public.guests g, public.rsvps linked
WHERE orphan.guest_id IS NULL
  AND g.event_id = orphan.event_id
  AND g.slug = trim(both '-' FROM regexp_replace(
      translate(lower(trim(COALESCE(orphan.full_name, ''))),
          'àáâäçèéêëìíîïñòóôöùúûüýÿ', 'aaaaceeeeiiiinoooouuuuyy'),
      '[^a-z0-9]+', '-', 'g'
  ))
  AND linked.event_id = orphan.event_id
  AND linked.guest_id = g.id;

-- Les RSVP restants n'ont plus de concurrent et peuvent être rattachés.
UPDATE public.rsvps orphan
SET guest_id = g.id
FROM public.guests g
WHERE orphan.guest_id IS NULL
  AND orphan.event_id = g.event_id
  AND g.slug = trim(both '-' FROM regexp_replace(
      translate(lower(trim(COALESCE(orphan.full_name, ''))),
          'àáâäçèéêëìíîïñòóôöùúûüýÿ', 'aaaaceeeeiiiinoooouuuuyy'),
      '[^a-z0-9]+', '-', 'g'
  ));