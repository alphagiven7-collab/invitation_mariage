-- À exécuter après SUPABASE-SETUP.sql et SUPABASE-RLS-CORE.sql.
-- Ne supprime et ne fusionne aucune donnée existante.
-- Empêche les nouvelles insertions concurrentes du même nom dans un événement.
BEGIN;

CREATE OR REPLACE FUNCTION public.guest_import_identity(p_name TEXT, p_phone TEXT, p_email TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT jsonb_build_array(
        regexp_replace(lower(trim(normalize(coalesce(p_name, ''), NFC))), '\s+', ' ', 'g'),
        '',
        ''
    )::text;
$$;

CREATE OR REPLACE FUNCTION public.prevent_guest_import_duplicate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    identity_value TEXT := public.guest_import_identity(NEW.full_name, NEW.phone, NEW.email);
BEGIN
    -- Sérialise les insertions du même événement sans bloquer les autres événements.
    PERFORM pg_advisory_xact_lock(hashtextextended('guest-import:' || NEW.event_id, 0));
    IF EXISTS (
        SELECT 1 FROM public.guests g
        WHERE g.event_id = NEW.event_id
          AND public.guest_import_identity(g.full_name, g.phone, g.email) = identity_value
    ) THEN
        RAISE EXCEPTION 'Doublon : un invité avec ce nom existe déjà dans cet événement.'
            USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_guest_import_duplicate ON public.guests;
CREATE TRIGGER prevent_guest_import_duplicate
    BEFORE INSERT ON public.guests FOR EACH ROW
    EXECUTE FUNCTION public.prevent_guest_import_duplicate();

COMMIT;
