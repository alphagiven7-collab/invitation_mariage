-- Migration canonique de fiabilisation de la plateforme.
--
-- A executer UNE SEULE FOIS dans Supabase SQL Editor, apres :
--   1. SUPABASE-SETUP.sql
--   2. SUPABASE-AUTH-FOUNDATION.sql
--   3. SUPABASE-GUEST-EXTRAS.sql
--   4. SUPABASE-RLS-CORE.sql
--
-- SUPABASE-GUEST-IMPORT.sql peut etre execute apres cette migration. Cette
-- separation permet de verrouiller RSVP, livre d'or et RLS immediatement, meme
-- lorsque des doublons historiques doivent encore etre examines.
--
-- Cette migration est idempotente. Elle ne fusionne ni ne supprime de fiches
-- invite existantes. La RPC replace_managed_guests ne supprime que les invites
-- encore "pending" lorsqu'elle est appelee explicitement par un organisateur.
--
-- Ne pas executer ensuite les scripts historiques SUPABASE-FIX-DELETE.sql,
-- SUPABASE-RELIABILITY-MIGRATION.sql, SUPABASE-RSVP-INTEGRITY.sql ou
-- SUPABASE-OPEN-RSVP.sql : ils ont ete remplaces par cette migration et peuvent
-- reintroduire des droits publics ou des RPC RSVP incompletes.

BEGIN;

-- Echec explicite avant toute modification si les prerequis ne sont pas poses.
DO $$
BEGIN
    IF to_regclass('public.events') IS NULL
       OR to_regclass('public.guests') IS NULL
       OR to_regclass('public.rsvps') IS NULL
       OR to_regclass('public.guestbook_messages') IS NULL
       OR to_regclass('public.analytics_events') IS NULL
       OR to_regclass('public.event_settings') IS NULL
       OR to_regclass('public.check_ins') IS NULL
       OR to_regclass('public.event_collaborators') IS NULL
       OR to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'Prerequis manquant : executez SUPABASE-SETUP.sql, SUPABASE-AUTH-FOUNDATION.sql et SUPABASE-RLS-CORE.sql avant cette migration.';
    END IF;

    IF to_regprocedure('public.can_manage_event(text)') IS NULL
       OR to_regprocedure('public.is_platform_admin()') IS NULL
       OR to_regprocedure('public.create_managed_event(jsonb)') IS NULL
       OR to_regprocedure('public.delete_managed_event(text)') IS NULL THEN
        RAISE EXCEPTION 'Fonctions de droits manquantes : executez SUPABASE-RLS-CORE.sql avant cette migration.';
    END IF;

    IF to_regclass('public.rsvps_one_response_per_guest') IS NULL THEN
        RAISE EXCEPTION 'Index RSVP manquant : executez la version actuelle de SUPABASE-RLS-CORE.sql avant cette migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'events'
          AND column_name = 'owner_id'
    ) THEN
        RAISE EXCEPTION 'La colonne events.owner_id est absente : executez SUPABASE-AUTH-FOUNDATION.sql avant cette migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'events'
          AND column_name = 'is_published'
    ) THEN
        RAISE EXCEPTION 'La colonne events.is_published est absente : executez la version actuelle de SUPABASE-RLS-CORE.sql avant cette migration.';
    END IF;
END;
$$;

-- SUPABASE-GUEST-EXTRAS.sql est un prerequis documente, mais ces ajouts sont
-- repetes sans danger afin que les fonctions RSVP soient coherentes.
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS access_code TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS drink_choices TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS qr_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- Les champs de configuration ci-dessous sont prives. La configuration
-- publique ne doit jamais les contenir, meme si un client admin les envoie
-- accidentellement dans dashboard_json.
CREATE OR REPLACE FUNCTION public.strip_public_event_secrets(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT COALESCE(p_payload, '{}'::jsonb)
        - 'adminCode'
        - 'admin_code'
        - 'adminPassword'
        - 'admin_password'
        - 'ownerEmail'
        - 'owner_email'
        - 'ownerId'
        - 'owner_id';
$$;

CREATE OR REPLACE FUNCTION public.sanitize_event_config_json()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.config_json := public.strip_public_event_secrets(NEW.config_json);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_event_settings_json()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.dashboard_json := public.strip_public_event_secrets(NEW.dashboard_json);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_event_config_json ON public.events;
CREATE TRIGGER sanitize_event_config_json
    BEFORE INSERT OR UPDATE OF config_json ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.sanitize_event_config_json();

DROP TRIGGER IF EXISTS sanitize_event_settings_json ON public.event_settings;
CREATE TRIGGER sanitize_event_settings_json
    BEFORE INSERT OR UPDATE OF dashboard_json ON public.event_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.sanitize_event_settings_json();

-- Retire aussi les copies historiques deja presentes dans les deux JSON publics.
UPDATE public.events
SET config_json = public.strip_public_event_secrets(config_json)
WHERE config_json IS DISTINCT FROM public.strip_public_event_secrets(config_json);

UPDATE public.event_settings
SET dashboard_json = public.strip_public_event_secrets(dashboard_json)
WHERE dashboard_json IS DISTINCT FROM public.strip_public_event_secrets(dashboard_json);

-- Helpers utilises par les RPC et la politique analytics. Ils ne retournent
-- aucune configuration ni donnee personnelle.
CREATE OR REPLACE FUNCTION public.is_published_event(p_event_identifier TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.events e
        WHERE (e.id = p_event_identifier OR e.slug = p_event_identifier)
          AND e.is_published = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.guest_name_identity(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT regexp_replace(
        regexp_replace(
            lower(trim(normalize(COALESCE(p_name, ''), NFC))),
            '[[:space:]]+',
            ' ',
            'g'
        ),
        '^couple([[:space:]]+|$)',
        '',
        'i'
    );
$$;

CREATE OR REPLACE FUNCTION public.guest_display_name(
    p_existing_name TEXT,
    p_requested_name TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    WITH cleaned AS (
        SELECT
            regexp_replace(trim(COALESCE(p_existing_name, '')), '[[:space:]]+', ' ', 'g') AS existing_name,
            regexp_replace(trim(COALESCE(p_requested_name, '')), '[[:space:]]+', ' ', 'g') AS requested_name
    )
    SELECT CASE
        WHEN existing_name ~* '^couple[[:space:]]+'
         AND requested_name !~* '^couple[[:space:]]+'
         AND existing_name <> ''
        THEN existing_name
        WHEN requested_name ~* '^couple[[:space:]]+'
         AND existing_name !~* '^couple[[:space:]]+'
         AND existing_name <> ''
        THEN 'Couple ' || regexp_replace(existing_name, '^couple[[:space:]]+', '', 'i')
        ELSE requested_name
    END
    FROM cleaned;
$$;

-- La configuration publique est limitee a un evenement publie et ne contient
-- jamais le compte proprietaire, les anciens codes admin ou mots de passe.
CREATE OR REPLACE FUNCTION public.get_public_event_config(p_event_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.strip_public_event_secrets(
        jsonb_build_object(
            'id', e.id,
            'slug', e.slug,
            'type', e.type,
            'title', e.title
        )
        || COALESCE(e.config_json, '{}'::jsonb)
        || COALESCE(s.dashboard_json, '{}'::jsonb)
    )
    FROM public.events e
    LEFT JOIN public.event_settings s ON s.event_id = e.id
    WHERE (e.id = p_event_id OR e.slug = p_event_id)
      AND e.is_published = TRUE
    LIMIT 1;
$$;

-- Un token individuel ne donne acces qu'a son invite et seulement tant que
-- l'evenement est publie.
CREATE OR REPLACE FUNCTION public.get_guest_invite(p_token TEXT)
RETURNS SETOF public.guests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT g.*
    FROM public.guests g
    INNER JOIN public.events e ON e.id = g.event_id
    WHERE g.token = p_token
      AND e.is_published = TRUE
    LIMIT 1;
$$;

-- Liste publique du livre d'or : aucun message d'un brouillon ou evenement
-- depublication ne peut etre lu par RPC anonyme.
CREATE OR REPLACE FUNCTION public.get_public_guestbook_messages(p_event_id TEXT)
RETURNS TABLE(author_name TEXT, message TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT gm.author_name, gm.message, gm.created_at
    FROM public.guestbook_messages gm
    INNER JOIN public.events e ON e.id = gm.event_id
    WHERE (e.id = p_event_id OR e.slug = p_event_id)
      AND e.is_published = TRUE
    ORDER BY gm.created_at DESC
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
    target_event_id TEXT;
    invite public.guests;
    clean_message TEXT := trim(COALESCE(p_message, ''));
BEGIN
    SELECT e.id INTO target_event_id
    FROM public.events e
    WHERE (e.id = p_event_id OR e.slug = p_event_id)
      AND e.is_published = TRUE
    LIMIT 1;

    IF target_event_id IS NULL THEN
        RAISE EXCEPTION 'Invitation introuvable ou non publiee';
    END IF;
    IF char_length(clean_message) < 3 OR char_length(clean_message) > 1000 THEN
        RAISE EXCEPTION 'Le message doit contenir entre 3 et 1000 caracteres';
    END IF;

    SELECT * INTO invite
    FROM public.guests
    WHERE event_id = target_event_id
      AND token = p_token
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation introuvable';
    END IF;

    RETURN QUERY
    INSERT INTO public.guestbook_messages AS inserted (event_id, guest_id, author_name, message)
    VALUES (target_event_id, invite.id, invite.full_name, clean_message)
    RETURNING inserted.author_name, inserted.message, inserted.created_at;
END;
$$;

-- Liste publique des messages de confirmation. Seules les confirmations
-- positives avec un texte sont rendues publiques, et uniquement pour un
-- evenement publie.
CREATE OR REPLACE FUNCTION public.get_public_rsvp_messages(p_event_id TEXT)
RETURNS TABLE(author_name TEXT, message TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(NULLIF(g.full_name, ''), r.full_name), r.message, r.created_at
    FROM public.rsvps r
    LEFT JOIN public.guests g
        ON g.id = r.guest_id
       AND g.event_id = r.event_id
    INNER JOIN public.events e ON e.id = r.event_id
    WHERE (e.id = p_event_id OR e.slug = p_event_id)
      AND e.is_published = TRUE
      AND r.status = 'yes'
      AND char_length(trim(COALESCE(r.message, ''))) > 0
    ORDER BY r.created_at DESC
    LIMIT 50;
$$;

-- RSVP personnalise : le telephone est facultatif. Une valeur vide laisse le
-- numero deja enregistre intact. Les reponses "yes" et "no" sont coherentes
-- avec les deux choix proposes par le formulaire.
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
    target_event_id TEXT;
    updated_guest public.guests;
    normalized_status TEXT := lower(trim(COALESCE(p_status, '')));
    clean_message TEXT := trim(COALESCE(p_message, ''));
    raw_phone TEXT := trim(COALESCE(p_phone, ''));
    normalized_phone TEXT := '';
BEGIN
    SELECT e.id INTO target_event_id
    FROM public.events e
    WHERE (e.id = p_event_id OR e.slug = p_event_id)
      AND e.is_published = TRUE
    LIMIT 1;

    IF target_event_id IS NULL THEN
        RAISE EXCEPTION 'Invitation introuvable ou non publiee';
    END IF;
    IF normalized_status NOT IN ('yes', 'no') THEN
        RAISE EXCEPTION 'Reponse de presence invalide';
    END IF;
    IF char_length(clean_message) > 1500 THEN
        RAISE EXCEPTION 'Le message RSVP ne peut pas depasser 1500 caracteres';
    END IF;
    IF raw_phone <> '' THEN
        IF raw_phone !~ '^[+0-9 ().-]+$'
           OR char_length(regexp_replace(raw_phone, '[^0-9]', '', 'g')) < 9 THEN
            RAISE EXCEPTION 'Telephone invalide : laissez le champ vide ou saisissez au moins 9 chiffres';
        END IF;
        normalized_phone := regexp_replace(raw_phone, '[^0-9]', '', 'g');
        IF normalized_phone LIKE '00%' THEN
            normalized_phone := substr(normalized_phone, 3);
        END IF;
    END IF;

    SELECT * INTO updated_guest
    FROM public.guests
    WHERE event_id = target_event_id
      AND token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation introuvable';
    END IF;
    IF COALESCE(updated_guest.status, 'pending') <> 'pending' THEN
        RAISE EXCEPTION 'Cette invitation a deja recu une reponse. Contactez l''organisateur en cas de probleme.';
    END IF;

    UPDATE public.guests
    SET status = normalized_status,
        phone = COALESCE(NULLIF(normalized_phone, ''), phone),
        adults = CASE
            WHEN normalized_status = 'yes' THEN GREATEST(COALESCE(p_adults, 1), 1)
            ELSE 0
        END,
        children = CASE
            WHEN normalized_status = 'yes' THEN GREATEST(COALESCE(p_children, 0), 0)
            ELSE 0
        END,
        rsvp_message = clean_message,
        drink_choices = COALESCE(p_drink_choices, '[]'::jsonb)::TEXT,
        profile_photo_url = COALESCE(NULLIF(trim(COALESCE(p_profile_photo_url, '')), ''), profile_photo_url),
        access_code = CASE
            WHEN normalized_status = 'yes' THEN COALESCE(access_code, UPPER(LEFT(token, 8)))
            ELSE access_code
        END,
        qr_approved = (normalized_status = 'yes'),
        responded_at = now()
    WHERE id = updated_guest.id
    RETURNING * INTO updated_guest;

    INSERT INTO public.rsvps (event_id, guest_id, full_name, phone, status, adults, children, message)
    VALUES (
        updated_guest.event_id,
        updated_guest.id,
        updated_guest.full_name,
        updated_guest.phone,
        updated_guest.status,
        updated_guest.adults,
        updated_guest.children,
        updated_guest.rsvp_message
    )
    ON CONFLICT (event_id, guest_id) WHERE guest_id IS NOT NULL
    DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        status = EXCLUDED.status,
        adults = EXCLUDED.adults,
        children = EXCLUDED.children,
        message = EXCLUDED.message,
        created_at = now();

    RETURN updated_guest;
END;
$$;

-- RSVP ouvert : ce parcours n'est autorise que lorsque l'evenement publie est
-- explicitement configure avec rsvpMode = "open" ou type = "open-rsvp".
-- La signature precedente est remplacee (et non surchargee) pour que tous les
-- appels passent par la version qui conserve le message de confirmation.
DROP FUNCTION IF EXISTS public.submit_open_rsvp(TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.submit_open_rsvp(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_open_rsvp(
    p_event_id TEXT,
    p_full_name TEXT,
    p_status TEXT,
    p_side TEXT,
    p_drink_choices JSONB DEFAULT '[]'::jsonb,
    p_message TEXT DEFAULT ''
)
RETURNS public.rsvps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_event_id TEXT;
    saved_guest public.guests;
    saved_rsvp public.rsvps;
    normalized_status TEXT := lower(trim(COALESCE(p_status, '')));
    clean_name TEXT := regexp_replace(trim(COALESCE(p_full_name, '')), '[[:space:]]+', ' ', 'g');
    clean_message TEXT := trim(COALESCE(p_message, ''));
    name_identity TEXT;
    side_label TEXT;
    matching_count INTEGER;
    final_name TEXT;
    new_token TEXT;
BEGIN
    SELECT e.id INTO target_event_id
    FROM public.events e
    LEFT JOIN public.event_settings s ON s.event_id = e.id
    WHERE (e.id = p_event_id OR e.slug = p_event_id)
      AND e.is_published = TRUE
      AND (
          e.type = 'open-rsvp'
          OR lower(COALESCE(NULLIF(s.dashboard_json->>'rsvpMode', ''), NULLIF(e.config_json->>'rsvpMode', ''), 'personal')) = 'open'
      )
    LIMIT 1;

    IF target_event_id IS NULL THEN
        RAISE EXCEPTION 'Cette invitation exige un lien personnel ou le RSVP ouvert n''est pas active.';
    END IF;
    IF char_length(clean_name) < 2
       OR char_length(public.guest_name_identity(clean_name)) < 2 THEN
        RAISE EXCEPTION 'Nom invalide';
    END IF;
    IF normalized_status NOT IN ('yes', 'no') THEN
        RAISE EXCEPTION 'Reponse de presence invalide';
    END IF;
    IF char_length(clean_message) > 1500 THEN
        RAISE EXCEPTION 'Le message RSVP ne peut pas depasser 1500 caracteres';
    END IF;

    side_label := CASE lower(trim(COALESCE(p_side, '')))
        WHEN 'male' THEN 'Cote homme'
        WHEN 'female' THEN 'Cote femme'
        ELSE NULL
    END;
    IF side_label IS NULL THEN
        RAISE EXCEPTION 'Cote de confirmation invalide';
    END IF;

    -- Le RSVP ouvert ne peut jamais reprendre la fiche d'un invite deja cree :
    -- sans lien personnel, un simple homonyme ne doit pas pouvoir modifier une
    -- reponse existante. La serrure couvre aussi deux envois simultanes du meme
    -- nom avant que l'index d'import ne soit installe.
    PERFORM pg_advisory_xact_lock(hashtextextended('guest-import:' || target_event_id, 0));
    name_identity := public.guest_name_identity(clean_name);
    SELECT count(*) INTO matching_count
    FROM public.guests
    WHERE event_id = target_event_id
      AND public.guest_name_identity(full_name) = name_identity;

    IF matching_count > 0 THEN
        RAISE EXCEPTION 'Un invite avec ce nom est deja enregistre. Utilisez votre lien personnel ou contactez l''organisateur.';
    END IF;

    new_token := replace(gen_random_uuid()::TEXT, '-', '');
    INSERT INTO public.guests (
        event_id, slug, full_name, group_name, token, status,
        adults, children, rsvp_message, drink_choices, responded_at, qr_approved
    ) VALUES (
        target_event_id, 'guest-' || new_token, clean_name, side_label, new_token, normalized_status,
        CASE WHEN normalized_status = 'yes' THEN 1 ELSE 0 END, 0,
        clean_message, COALESCE(p_drink_choices, '[]'::jsonb)::TEXT, now(), FALSE
    )
    RETURNING * INTO saved_guest;

    INSERT INTO public.rsvps (event_id, guest_id, full_name, phone, status, adults, children, message)
    VALUES (
        target_event_id, saved_guest.id, saved_guest.full_name, saved_guest.phone,
        saved_guest.status, saved_guest.adults, saved_guest.children, saved_guest.rsvp_message
    )
    ON CONFLICT (event_id, guest_id) WHERE guest_id IS NOT NULL
    DO UPDATE SET
        full_name = EXCLUDED.full_name,
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

-- Compatibilite avec l'ancien parcours RSVP public. Il est maintenant soumis
-- a la meme condition explicite de RSVP ouvert et ne peut plus modifier une
-- invitation personnelle.
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
    target_event_id TEXT;
    saved_guest public.guests;
    saved_rsvp public.rsvps;
    clean_name TEXT := regexp_replace(trim(COALESCE(p_full_name, '')), '[[:space:]]+', ' ', 'g');
    clean_message TEXT := trim(COALESCE(p_message, ''));
    name_identity TEXT;
    matching_count INTEGER;
    final_name TEXT;
    new_token TEXT;
    raw_phone TEXT := trim(COALESCE(p_phone, ''));
    normalized_phone TEXT := '';
BEGIN
    SELECT e.id INTO target_event_id
    FROM public.events e
    LEFT JOIN public.event_settings s ON s.event_id = e.id
    WHERE (e.id = p_event_id OR e.slug = p_event_id)
      AND e.is_published = TRUE
      AND (
          e.type = 'open-rsvp'
          OR lower(COALESCE(NULLIF(s.dashboard_json->>'rsvpMode', ''), NULLIF(e.config_json->>'rsvpMode', ''), 'personal')) = 'open'
      )
    LIMIT 1;

    IF target_event_id IS NULL THEN
        RAISE EXCEPTION 'Cette invitation exige un lien personnel ou le RSVP ouvert n''est pas active.';
    END IF;
    IF char_length(clean_name) < 2
       OR char_length(public.guest_name_identity(clean_name)) < 2 THEN
        RAISE EXCEPTION 'Nom invalide';
    END IF;
    IF char_length(clean_message) > 1500 THEN
        RAISE EXCEPTION 'Le message RSVP ne peut pas depasser 1500 caracteres';
    END IF;
    IF raw_phone <> '' THEN
        IF raw_phone !~ '^[+0-9 ().-]+$'
           OR char_length(regexp_replace(raw_phone, '[^0-9]', '', 'g')) < 9 THEN
            RAISE EXCEPTION 'Telephone invalide : laissez le champ vide ou saisissez au moins 9 chiffres';
        END IF;
        normalized_phone := regexp_replace(raw_phone, '[^0-9]', '', 'g');
        IF normalized_phone LIKE '00%' THEN
            normalized_phone := substr(normalized_phone, 3);
        END IF;
    END IF;

    -- Comme le RSVP ouvert ci-dessus, ce chemin historique n'a aucun droit de
    -- modifier une fiche existante a partir du seul nom saisi.
    PERFORM pg_advisory_xact_lock(hashtextextended('guest-import:' || target_event_id, 0));
    name_identity := public.guest_name_identity(clean_name);
    SELECT count(*) INTO matching_count
    FROM public.guests
    WHERE event_id = target_event_id
      AND public.guest_name_identity(full_name) = name_identity;

    IF matching_count > 0 THEN
        RAISE EXCEPTION 'Un invite avec ce nom est deja enregistre. Utilisez votre lien personnel ou contactez l''organisateur.';
    END IF;

    new_token := replace(gen_random_uuid()::TEXT, '-', '');
    INSERT INTO public.guests (
        event_id, slug, full_name, phone, token, status,
        adults, children, rsvp_message, responded_at, qr_approved
    ) VALUES (
        target_event_id, 'guest-' || new_token, clean_name,
        NULLIF(normalized_phone, ''), new_token, 'yes',
        GREATEST(COALESCE(p_adults, 1), 1), GREATEST(COALESCE(p_children, 0), 0),
        clean_message, now(), FALSE
    )
    RETURNING * INTO saved_guest;

    INSERT INTO public.rsvps (event_id, guest_id, full_name, phone, status, adults, children, message)
    VALUES (
        target_event_id, saved_guest.id, saved_guest.full_name, saved_guest.phone,
        'yes', saved_guest.adults, saved_guest.children, saved_guest.rsvp_message
    )
    ON CONFLICT (event_id, guest_id) WHERE guest_id IS NOT NULL
    DO UPDATE SET
        full_name = EXCLUDED.full_name,
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

-- Suppression reservee a un organisateur de l'evenement. La suppression d'un
-- invite et de ses RSVP lies est atomique.
CREATE OR REPLACE FUNCTION public.delete_managed_guest(
    p_event_id TEXT,
    p_guest_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_event_id TEXT;
BEGIN
    SELECT id INTO target_event_id
    FROM public.events
    WHERE id = p_event_id OR slug = p_event_id
    LIMIT 1;

    IF target_event_id IS NULL OR NOT public.can_manage_event(target_event_id) THEN
        RAISE EXCEPTION 'Organisateur non autorise pour cet evenement';
    END IF;

    DELETE FROM public.rsvps
    WHERE event_id = target_event_id
      AND guest_id = p_guest_id;

    DELETE FROM public.guests
    WHERE id = p_guest_id
      AND event_id = target_event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invite introuvable pour cet evenement';
    END IF;

    RETURN TRUE;
END;
$$;

-- Remplacement transactionnel de la liste depuis un CSV deja previsualise.
-- Contrat RPC :
--   replace_managed_guests({
--     p_event_id: 'mon-evenement',
--     p_imported_guests: [{ fullName, phone?, email?, group?, tableNumber? }]
--   })
-- Les alias full_name/nom, contact, group_name, table_number/table sont aussi
-- acceptes. Une erreur annule toute la transaction : le client ne doit mettre
-- a jour son cache local qu'apres une reponse RPC reussie.
CREATE OR REPLACE FUNCTION public.replace_managed_guests(
    p_event_id TEXT,
    p_imported_guests JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_event_id TEXT;
    row_value JSONB;
    requested_name TEXT;
    incoming_phone TEXT;
    incoming_email TEXT;
    incoming_group TEXT;
    incoming_table TEXT;
    row_identity TEXT;
    target_guest public.guests;
    touched_ids UUID[] := ARRAY[]::UUID[];
    created_count INTEGER := 0;
    updated_count INTEGER := 0;
    preserved_count INTEGER := 0;
    renamed_couples_count INTEGER := 0;
    removed_count INTEGER := 0;
    preserved_omitted_count INTEGER := 0;
    matching_count INTEGER;
    has_rsvp_response BOOLEAN := FALSE;
    final_name TEXT;
    new_token TEXT;
    created_guest_id UUID;
BEGIN
    SELECT id INTO target_event_id
    FROM public.events
    WHERE id = p_event_id OR slug = p_event_id
    LIMIT 1;

    IF target_event_id IS NULL OR NOT public.can_manage_event(target_event_id) THEN
        RAISE EXCEPTION 'Organisateur non autorise pour cet evenement';
    END IF;
    IF p_imported_guests IS NULL OR jsonb_typeof(p_imported_guests) <> 'array' THEN
        RAISE EXCEPTION 'La liste importee doit etre un tableau JSON';
    END IF;
    IF jsonb_array_length(p_imported_guests) = 0 THEN
        RAISE EXCEPTION 'Le remplacement complet exige au moins un invite valide';
    END IF;
    IF jsonb_array_length(p_imported_guests) > 5000 THEN
        RAISE EXCEPTION 'Le remplacement est limite a 5000 invites par operation';
    END IF;

    -- Utilise exactement la serrure du trigger d'import : un remplacement et
    -- une insertion ou mise a jour classique du meme evenement ne peuvent pas
    -- se croiser. PostgreSQL autorise sa reacquisition par cette transaction
    -- lorsque le trigger s'execute sur les lignes creees ou renommees.
    PERFORM pg_advisory_xact_lock(hashtextextended('guest-import:' || target_event_id, 0));

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_imported_guests) AS input(value)
        WHERE jsonb_typeof(input.value) <> 'object'
           OR char_length(trim(COALESCE(
                NULLIF(input.value->>'fullName', ''),
                NULLIF(input.value->>'full_name', ''),
                NULLIF(input.value->>'nom', ''),
                ''
           ))) < 2
           OR char_length(public.guest_name_identity(COALESCE(
                NULLIF(input.value->>'fullName', ''),
                NULLIF(input.value->>'full_name', ''),
                NULLIF(input.value->>'nom', ''),
                ''
           ))) < 2
    ) THEN
        RAISE EXCEPTION 'Chaque ligne importee doit contenir un nom de deux caracteres minimum';
    END IF;

    IF EXISTS (
        WITH incoming AS (
            SELECT public.guest_name_identity(COALESCE(
                NULLIF(value->>'fullName', ''),
                NULLIF(value->>'full_name', ''),
                NULLIF(value->>'nom', ''),
                ''
            )) AS identity_value
            FROM jsonb_array_elements(p_imported_guests) AS input(value)
        )
        SELECT 1
        FROM incoming
        GROUP BY identity_value
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Le fichier contient plusieurs lignes pour le meme nom. Resolvez-les avant le remplacement.';
    END IF;

    -- Aucun choix automatique n'est fait en presence de doublons historiques.
    IF EXISTS (
        WITH incoming AS (
            SELECT DISTINCT public.guest_name_identity(COALESCE(
                NULLIF(value->>'fullName', ''),
                NULLIF(value->>'full_name', ''),
                NULLIF(value->>'nom', ''),
                ''
            )) AS identity_value
            FROM jsonb_array_elements(p_imported_guests) AS input(value)
        ), matches AS (
            SELECT public.guest_name_identity(g.full_name) AS identity_value, count(*) AS duplicate_count
            FROM public.guests g
            INNER JOIN incoming i
                ON i.identity_value = public.guest_name_identity(g.full_name)
            WHERE g.event_id = target_event_id
            GROUP BY public.guest_name_identity(g.full_name)
        )
        SELECT 1 FROM matches WHERE duplicate_count > 1
    ) THEN
        RAISE EXCEPTION 'Des doublons existants correspondent au fichier. Examinez-les avant le remplacement.';
    END IF;

    FOR row_value IN SELECT value FROM jsonb_array_elements(p_imported_guests) AS input(value)
    LOOP
        requested_name := regexp_replace(trim(COALESCE(
            NULLIF(row_value->>'fullName', ''),
            NULLIF(row_value->>'full_name', ''),
            NULLIF(row_value->>'nom', ''),
            ''
        )), '[[:space:]]+', ' ', 'g');
        incoming_phone := NULLIF(trim(COALESCE(
            NULLIF(row_value->>'phone', ''),
            NULLIF(row_value->>'contact', ''),
            ''
        )), '');
        incoming_email := NULLIF(trim(COALESCE(row_value->>'email', '')), '');
        incoming_group := NULLIF(trim(COALESCE(
            NULLIF(row_value->>'group', ''),
            NULLIF(row_value->>'group_name', ''),
            NULLIF(row_value->>'tableName', ''),
            ''
        )), '');
        incoming_table := NULLIF(trim(COALESCE(
            NULLIF(row_value->>'tableNumber', ''),
            NULLIF(row_value->>'table_number', ''),
            NULLIF(row_value->>'table', ''),
            ''
        )), '');
        row_identity := public.guest_name_identity(requested_name);

        SELECT count(*) INTO matching_count
        FROM public.guests
        WHERE event_id = target_event_id
          AND public.guest_name_identity(full_name) = row_identity;

        IF matching_count > 1 THEN
            RAISE EXCEPTION 'Des doublons sont apparus pendant le remplacement. Aucun changement n''a ete conserve.';
        END IF;

        SELECT * INTO target_guest
        FROM public.guests
        WHERE event_id = target_event_id
          AND public.guest_name_identity(full_name) = row_identity
        FOR UPDATE;

        IF FOUND THEN
            touched_ids := array_append(touched_ids, target_guest.id);
            SELECT EXISTS (
            SELECT 1
                FROM public.rsvps r
                WHERE r.event_id = target_event_id
                  AND lower(trim(COALESCE(r.status, ''))) IN ('yes', 'no')
                  AND (
                      r.guest_id = target_guest.id
                      OR (
                          r.guest_id IS NULL
                          AND public.guest_name_identity(r.full_name) = row_identity
                      )
                  )
            ) INTO has_rsvp_response;

            IF COALESCE(target_guest.status, 'pending') <> 'pending' OR has_rsvp_response THEN
                -- Toute reponse RSVP est conservee, avec ou sans telephone.
                preserved_count := preserved_count + 1;
                final_name := CASE
                    WHEN requested_name ~* '^couple[[:space:]]+'
                    THEN public.guest_display_name(target_guest.full_name, requested_name)
                    ELSE target_guest.full_name
                END;
                IF target_guest.full_name IS DISTINCT FROM final_name THEN
                    UPDATE public.guests
                    SET full_name = final_name
                    WHERE id = target_guest.id;
                    renamed_couples_count := renamed_couples_count + 1;
                END IF;
            ELSE
                final_name := public.guest_display_name(target_guest.full_name, requested_name);
                UPDATE public.guests
                SET full_name = final_name,
                    phone = incoming_phone,
                    email = incoming_email,
                    group_name = incoming_group,
                    table_number = incoming_table
                WHERE id = target_guest.id;
                updated_count := updated_count + 1;
                IF target_guest.full_name IS DISTINCT FROM final_name
                   AND final_name ~* '^couple[[:space:]]+' THEN
                    renamed_couples_count := renamed_couples_count + 1;
                END IF;
            END IF;
        ELSE
            new_token := replace(gen_random_uuid()::TEXT, '-', '');
            INSERT INTO public.guests (
                event_id, slug, full_name, phone, email, group_name, token,
                status, adults, children, table_number, qr_approved
            ) VALUES (
                target_event_id, 'guest-' || new_token, requested_name,
                incoming_phone, incoming_email, incoming_group, new_token,
                'pending', 1, 0, incoming_table, FALSE
            )
            RETURNING id INTO created_guest_id;
            touched_ids := array_append(touched_ids, created_guest_id);
            created_count := created_count + 1;
        END IF;
    END LOOP;

    -- Les reponses RSVP historiques sont conservees meme si un ancien bug a
    -- laisse le statut de leur fiche a "pending".
    SELECT count(*) INTO preserved_omitted_count
    FROM public.guests g
    WHERE g.event_id = target_event_id
      AND COALESCE(g.status, 'pending') = 'pending'
      AND NOT (g.id = ANY(touched_ids))
      AND EXISTS (
          SELECT 1
          FROM public.rsvps r
          WHERE r.event_id = target_event_id
            AND lower(trim(COALESCE(r.status, ''))) IN ('yes', 'no')
            AND (
                r.guest_id = g.id
                OR (
                    r.guest_id IS NULL
                    AND public.guest_name_identity(r.full_name) = public.guest_name_identity(g.full_name)
                )
            )
      );
    preserved_count := preserved_count + preserved_omitted_count;

    -- Seuls les invites sans aucune reponse RSVP peuvent etre retires. Si une
    -- ecriture precedente echoue, PostgreSQL annule toute la fonction.
    DELETE FROM public.guests AS g
    WHERE g.event_id = target_event_id
      AND COALESCE(g.status, 'pending') = 'pending'
      AND NOT (g.id = ANY(touched_ids))
      AND NOT EXISTS (
          SELECT 1
          FROM public.rsvps r
          WHERE r.event_id = target_event_id
            AND lower(trim(COALESCE(r.status, ''))) IN ('yes', 'no')
            AND (
                r.guest_id = g.id
                OR (
                    r.guest_id IS NULL
                    AND public.guest_name_identity(r.full_name) = public.guest_name_identity(g.full_name)
                )
            )
      );
    GET DIAGNOSTICS removed_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'created', created_count,
        'updated', updated_count,
        'preserved', preserved_count,
        'renamedCouples', renamed_couples_count,
        'removed', removed_count
    );
END;
$$;

-- Les politiques permissives historiques sont supprimees puis les politiques
-- strictes de RLS sont recreees. Les RPC SECURITY DEFINER ci-dessus constituent
-- les seuls parcours anonymes intentionnels.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guestbook_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_collaborators ENABLE ROW LEVEL SECURITY;

-- Un collaborateur peut administrer le contenu de son evenement, mais ne
-- peut ni creer un evenement en direct, ni se l'attribuer, ni le supprimer.
-- La creation et la suppression passent par les RPC plateforme dediees.
CREATE OR REPLACE FUNCTION public.prevent_event_owner_takeover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
       AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Seul un administrateur plateforme peut transferer la propriete d''un evenement';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_event_owner_takeover ON public.events;
CREATE TRIGGER prevent_event_owner_takeover
    BEFORE UPDATE OF owner_id ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_event_owner_takeover();

DROP POLICY IF EXISTS "events_read" ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
DROP POLICY IF EXISTS "events_owner_all" ON public.events;
DROP POLICY IF EXISTS "events_manager_read" ON public.events;
DROP POLICY IF EXISTS "events_platform_insert" ON public.events;
DROP POLICY IF EXISTS "events_manager_update" ON public.events;
DROP POLICY IF EXISTS "events_platform_delete" ON public.events;
CREATE POLICY "events_manager_read" ON public.events
    FOR SELECT USING (public.can_manage_event(id));
CREATE POLICY "events_platform_insert" ON public.events
    FOR INSERT WITH CHECK (public.is_platform_admin());
CREATE POLICY "events_manager_update" ON public.events
    FOR UPDATE USING (public.can_manage_event(id))
    WITH CHECK (public.can_manage_event(id));
CREATE POLICY "events_platform_delete" ON public.events
    FOR DELETE USING (public.is_platform_admin());

DROP POLICY IF EXISTS "event_collaborators_owner_read" ON public.event_collaborators;
CREATE POLICY "event_collaborators_owner_read" ON public.event_collaborators
    FOR SELECT USING (public.can_manage_event(event_id));

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
    FOR INSERT WITH CHECK (
        public.is_published_event(event_id)
        AND char_length(trim(event_type)) BETWEEN 1 AND 80
        AND trim(event_type) ~ '^[a-z0-9_.:-]+$'
        AND char_length(COALESCE(guest_token, '')) <= 256
        AND octet_length(COALESCE(meta, '{}'::jsonb)::TEXT) <= 4096
    );

-- Les fonctions ne doivent pas etre appelees via le privilege PUBLIC implicite.
REVOKE ALL ON FUNCTION public.strip_public_event_secrets(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_name_identity(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_display_name(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_event_owner_takeover() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_event(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_managed_event(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_managed_event(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_managed_guest(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_managed_guests(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_event_config(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_guest_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_guestbook_messages(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_guestbook_message(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_rsvp_messages(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_guest_rsvp(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_open_rsvp(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_public_rsvp(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_published_event(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_event(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_managed_event(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_managed_event(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_managed_guest(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_managed_guests(TEXT, JSONB) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_published_event(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_event_config(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_invite(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_guestbook_messages(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_guestbook_message(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_rsvp_messages(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_rsvp(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_open_rsvp(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_rsvp(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT) TO anon, authenticated;

-- Demande a PostgREST/Supabase de recharger les signatures RPC apres le commit.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification manuelle apres execution (lecture seule) :
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('events', 'guests', 'rsvps', 'event_settings', 'guestbook_messages', 'analytics_events', 'check_ins')
-- ORDER BY tablename, policyname;
