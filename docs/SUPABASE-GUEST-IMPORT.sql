-- Integrite des invites importes.
-- A executer apres SUPABASE-SETUP.sql, SUPABASE-RLS-CORE.sql et
-- SUPABASE-PLATFORM-HARDENING.sql.
--
-- Regle metier : un nom normalise ne peut apparaitre qu'une fois par evenement.
-- Le telephone et l'e-mail restent facultatifs et ne servent pas de cle de
-- dedoublonnage : deux fiches du meme nom doivent etre examinees dans l'admin,
-- pas distinguees artificiellement par un contact different.
--
-- Cette migration ne supprime ni ne fusionne de donnees. Si des doublons
-- historiques existent, elle s'arrete avec leur liste : utilisez l'outil de
-- revue des doublons dans Gestion des invites, puis relancez ce script.

BEGIN;

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

-- Signature historique conservee pour les scripts SQL privilegies. Les deux
-- derniers arguments sont volontairement ignores : la regle est par nom.
-- Ce n'est pas une RPC publique : les ecritures passent par les fonctions
-- securisees de la migration de fiabilisation.
CREATE OR REPLACE FUNCTION public.guest_import_identity(p_name TEXT, p_phone TEXT, p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT public.guest_name_identity(p_name);
$$;

REVOKE ALL ON FUNCTION public.guest_import_identity(TEXT, TEXT, TEXT) FROM PUBLIC;

-- Le controle est fait avant de creer l'index. Ainsi, aucun echec ne laisse
-- une suppression, fusion ou index partiel dans la base.
DO $$
DECLARE
    duplicate_summary TEXT;
BEGIN
    SELECT string_agg(
        format('%s / %s (%s fiches)', event_id, identity_value, duplicate_count),
        ', ' ORDER BY event_id, identity_value
    ) INTO duplicate_summary
    FROM (
        SELECT
            event_id,
            public.guest_name_identity(full_name) AS identity_value,
            count(*) AS duplicate_count
        FROM public.guests
        GROUP BY event_id, public.guest_name_identity(full_name)
        HAVING count(*) > 1
        ORDER BY count(*) DESC, public.guest_name_identity(full_name)
        LIMIT 20
    ) duplicates;

    IF duplicate_summary IS NOT NULL THEN
        RAISE EXCEPTION
            'Des doublons historiques existent. Resolvez-les dans Gestion des invites avant d''activer la contrainte unique.'
            USING DETAIL = duplicate_summary,
                  HINT = 'Conservez la fiche confirmee ou celle avec contact, puis relancez SUPABASE-GUEST-IMPORT.sql.';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS guests_unique_name_identity_per_event
    ON public.guests (event_id, public.guest_name_identity(full_name));

CREATE OR REPLACE FUNCTION public.prevent_guest_import_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    identity_value TEXT := public.guest_name_identity(NEW.full_name);
BEGIN
    IF char_length(identity_value) < 2 THEN
        RAISE EXCEPTION 'Le nom de l''invite doit contenir au moins deux caracteres.'
            USING ERRCODE = '23514';
    END IF;

    -- Conserve un message metier clair et serialize les imports concurrents,
    -- y compris avec replace_managed_guests qui prend cette meme serrure.
    -- L'index unique ci-dessus reste la garantie finale au niveau SQL.
    PERFORM pg_advisory_xact_lock(hashtextextended('guest-import:' || NEW.event_id, 0));
    IF EXISTS (
        SELECT 1
        FROM public.guests g
        WHERE g.event_id = NEW.event_id
          AND g.id IS DISTINCT FROM NEW.id
          AND public.guest_name_identity(g.full_name) = identity_value
    ) THEN
        RAISE EXCEPTION 'Doublon : un invite avec ce nom existe deja dans cet evenement.'
            USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_guest_import_duplicate ON public.guests;
CREATE TRIGGER prevent_guest_import_duplicate
    BEFORE INSERT OR UPDATE OF event_id, full_name ON public.guests
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_guest_import_duplicate();

COMMIT;

-- Diagnostic lecture seule, utile avant de relancer la migration si elle a
-- signale des doublons :
-- SELECT event_id, public.guest_name_identity(full_name) AS nom_normalise,
--        count(*) AS fiches, array_agg(id ORDER BY created_at) AS invite_ids
-- FROM public.guests
-- GROUP BY event_id, public.guest_name_identity(full_name)
-- HAVING count(*) > 1
-- ORDER BY event_id, nom_normalise;
