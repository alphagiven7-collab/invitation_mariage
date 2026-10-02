-- PROPOSITION A RELIRE : aucune execution en production sans validation.
-- A executer APRES SUPABASE-PLATFORM-HARDENING.sql et SUPABASE-ORGANIZER-ACCESS.sql.
-- Migration additive et rejouable. Elle ne change ni les identites, ni les
-- tokens, ni les reponses RSVP, ni group_name. table_number reste le libelle
-- compatible avec les invitations et exports existants.
-- Capacite indicative : aucune limite ne bloque une affectation ou un RSVP.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.events') IS NULL
       OR to_regclass('public.guests') IS NULL
       OR to_regclass('public.event_guest_managers') IS NULL
       OR to_regprocedure('public.can_manage_guests(text)') IS NULL
       OR to_regprocedure('public.get_guest_invite(text)') IS NULL
       OR to_regprocedure('public.submit_guest_rsvp(text,text,text,text,integer,integer,text,jsonb,text)') IS NULL
       OR to_regprocedure('public.replace_managed_guests(text,jsonb)') IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'guests'
             AND column_name = 'table_number' AND data_type = 'text'
       )
       OR NOT COALESCE((SELECT relrowsecurity FROM pg_class
                       WHERE oid = to_regclass('public.guests')), FALSE) THEN
        RAISE EXCEPTION 'Prerequis manquants : appliquer PLATFORM-HARDENING et ORGANIZER-ACCESS avant EVENT-TABLES.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    -- Collation C : deux libelles de casse/espacement differents restent distincts.
    name TEXT COLLATE "C" NOT NULL CHECK (name <> ''),
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT event_tables_event_name_key UNIQUE (event_id, name),
    CONSTRAINT event_tables_event_id_key UNIQUE (event_id, id)
);

ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS table_id UUID;
CREATE INDEX IF NOT EXISTS guests_event_table_id_idx
    ON public.guests (event_id, table_id) WHERE table_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.guests'::regclass
          AND conname = 'guests_event_table_fk'
    ) THEN
        ALTER TABLE public.guests ADD CONSTRAINT guests_event_table_fk
            FOREIGN KEY (event_id, table_id)
            REFERENCES public.event_tables (event_id, id)
            ON DELETE NO ACTION;
    END IF;
END;
$$;

-- Reprise exacte, y compris espaces/casse historiques, sans modifier le texte.
-- Les NULL et chaines strictement vides restent sans table.
INSERT INTO public.event_tables (event_id, name)
SELECT DISTINCT event_id, table_number COLLATE "C"
FROM public.guests
WHERE table_id IS NULL AND table_number IS NOT NULL AND table_number <> ''
ON CONFLICT (event_id, name) DO NOTHING;

UPDATE public.guests AS g
SET table_id = t.id
FROM public.event_tables AS t
WHERE g.table_id IS NULL AND g.event_id = t.event_id
  AND g.table_number COLLATE "C" = t.name;

ALTER TABLE public.event_tables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_tables FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_tables TO authenticated;
GRANT ALL ON public.event_tables TO service_role;
DROP POLICY IF EXISTS event_tables_manager_read ON public.event_tables;
CREATE POLICY event_tables_manager_read ON public.event_tables
    FOR SELECT TO authenticated
    USING (public.can_manage_guests(event_id));

-- Helper prive : preserve exactement le libelle transmis. L'import historique
-- conserve sa propre normalisation ; cette fonction ne lui en ajoute aucune.
-- Seuls les triggers/RPC SECURITY DEFINER autorises l'appellent.
CREATE OR REPLACE FUNCTION public.resolve_legacy_guest_table_id(p_event_id TEXT, p_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    resolved_id UUID;
BEGIN
    IF p_name IS NULL OR p_name = '' THEN RETURN NULL; END IF;
    INSERT INTO public.event_tables (event_id, name)
    VALUES (p_event_id, p_name)
    ON CONFLICT (event_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO resolved_id;
    RETURN resolved_id;
END;
$$;

-- Compatibilite des imports : un nouveau libelle cree/reutilise une table
-- dans le meme evenement. Une ancienne fiche liee ne peut pas ecraser un
-- renommage recent en renvoyant son ancien table_number.
CREATE OR REPLACE FUNCTION public.sync_guest_managed_table()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    current_name TEXT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.table_id IS NOT DISTINCT FROM OLD.table_id
           AND NEW.table_number IS NOT DISTINCT FROM OLD.table_number
           AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN
            RETURN NEW;
        END IF;
        IF OLD.table_id IS NOT NULL AND NEW.table_id IS NULL THEN
            NEW.table_number := NULL;
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.table_id IS NOT NULL THEN
        SELECT name INTO current_name
        FROM public.event_tables
        WHERE event_id = NEW.event_id AND id = NEW.table_id
        FOR KEY SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Table absente de cet evenement' USING ERRCODE = '23503';
        END IF;
        NEW.table_number := current_name;
    ELSIF NEW.table_number IS NOT NULL AND NEW.table_number <> '' THEN
        NEW.table_id := public.resolve_legacy_guest_table_id(NEW.event_id, NEW.table_number);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_guest_managed_table ON public.guests;
CREATE TRIGGER sync_guest_managed_table
    BEFORE INSERT OR UPDATE OF event_id, table_id, table_number ON public.guests
    FOR EACH ROW EXECUTE FUNCTION public.sync_guest_managed_table();

-- Le renommage synchronise uniquement le snapshot, dans la meme transaction.
-- Ce trigger couvre aussi une operation administrative via service_role.
CREATE OR REPLACE FUNCTION public.sync_managed_table_name()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.event_id IS DISTINCT FROM OLD.event_id THEN
        RAISE EXCEPTION 'Une table ne peut pas changer d identifiant ou d evenement' USING ERRCODE = '22023';
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE public.guests
        SET table_number = NEW.name
        WHERE event_id = NEW.event_id AND table_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_managed_table_name ON public.event_tables;
CREATE TRIGGER sync_managed_table_name
    AFTER UPDATE OF id, event_id, name ON public.event_tables
    FOR EACH ROW EXECUTE FUNCTION public.sync_managed_table_name();

CREATE OR REPLACE FUNCTION public.create_managed_table(
    p_event_id TEXT, p_name TEXT, p_capacity INTEGER DEFAULT NULL
)
RETURNS public.event_tables
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    created_table public.event_tables;
BEGIN
    IF auth.uid() IS NULL OR public.can_manage_guests(p_event_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acces refuse a cet evenement' USING ERRCODE = '42501';
    END IF;
    IF p_name IS NULL OR btrim(p_name) = '' OR char_length(p_name) > 120
       OR (p_capacity IS NOT NULL AND p_capacity <= 0) THEN
        RAISE EXCEPTION 'Nom de table ou capacite invalide' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.event_tables (event_id, name, capacity)
    VALUES (p_event_id, p_name, p_capacity) RETURNING * INTO created_table;
    RETURN created_table;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_managed_table(
    p_event_id TEXT, p_table_id UUID, p_name TEXT, p_capacity INTEGER DEFAULT NULL
)
RETURNS public.event_tables
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    updated_table public.event_tables;
BEGIN
    IF auth.uid() IS NULL OR public.can_manage_guests(p_event_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acces refuse a cet evenement' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO updated_table FROM public.event_tables
    WHERE event_id = p_event_id AND id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Table absente de cet evenement' USING ERRCODE = '22023';
    END IF;
    -- Un ancien nom atypique peut rester tel quel lors d'un changement de capacite.
    IF p_name IS NULL OR p_name = ''
       OR (p_name IS DISTINCT FROM updated_table.name AND (btrim(p_name) = '' OR char_length(p_name) > 120))
       OR (p_capacity IS NOT NULL AND p_capacity <= 0) THEN
        RAISE EXCEPTION 'Nom de table ou capacite invalide' USING ERRCODE = '22023';
    END IF;
    UPDATE public.event_tables
    SET name = p_name, capacity = p_capacity
    WHERE event_id = p_event_id AND id = p_table_id
    RETURNING * INTO updated_table;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Table absente de cet evenement' USING ERRCODE = '22023';
    END IF;
    RETURN updated_table;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_managed_table(p_event_id TEXT, p_table_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR public.can_manage_guests(p_event_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acces refuse a cet evenement' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.event_tables
    WHERE event_id = p_event_id AND id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Table absente de cet evenement' USING ERRCODE = '22023';
    END IF;
    UPDATE public.guests SET table_id = NULL, table_number = NULL
    WHERE event_id = p_event_id AND table_id = p_table_id;
    DELETE FROM public.event_tables WHERE event_id = p_event_id AND id = p_table_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_managed_table(
    p_event_id TEXT, p_guest_ids UUID[], p_table_id UUID DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    expected_count INTEGER;
    selected_count INTEGER;
    changed_count INTEGER;
BEGIN
    IF auth.uid() IS NULL OR public.can_manage_guests(p_event_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acces refuse a cet evenement' USING ERRCODE = '42501';
    END IF;
    IF p_guest_ids IS NULL OR array_position(p_guest_ids, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'Liste d invites invalide' USING ERRCODE = '22023';
    END IF;
    IF p_table_id IS NOT NULL THEN
        PERFORM 1 FROM public.event_tables
        WHERE event_id = p_event_id AND id = p_table_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Table absente de cet evenement' USING ERRCODE = '22023';
        END IF;
    END IF;
    SELECT count(DISTINCT guest_id) INTO expected_count FROM unnest(p_guest_ids) AS ids(guest_id);
    -- Verifier TOUS les identifiants et verrouiller les fiches avant toute ecriture.
    PERFORM id FROM public.guests
    WHERE event_id = p_event_id AND id = ANY(p_guest_ids)
    ORDER BY id FOR UPDATE;
    GET DIAGNOSTICS selected_count = ROW_COUNT;
    IF selected_count <> expected_count THEN
        RAISE EXCEPTION 'Un invite est absent de cet evenement' USING ERRCODE = '22023';
    END IF;
    UPDATE public.guests
    SET table_id = p_table_id,
        table_number = CASE WHEN p_table_id IS NULL THEN NULL ELSE table_number END
    WHERE event_id = p_event_id AND id = ANY(p_guest_ids);
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    RETURN changed_count;
END;
$$;

-- Le remplacement CSV exprime une nouvelle affectation volontaire pour les
-- fiches sans reponse. Il doit donc modifier table_id ET le snapshot : changer
-- seulement table_number serait, a juste titre, traite comme une fiche ancienne.
-- Adapter uniquement cette affectation dans la fonction DEJA installee conserve
-- ses controles can_manage_guests, sa preservation RSVP, son proprietaire et ACL.
-- Toute implementation inattendue annule la migration complete pour revue.
DO $$
DECLARE
    current_definition TEXT;
    old_assignment CONSTANT TEXT := 'table_number = incoming_table';
    new_assignment CONSTANT TEXT := E'table_id = public.resolve_legacy_guest_table_id(target_event_id, incoming_table),\n                    table_number = incoming_table';
    occurrences INTEGER;
BEGIN
    SELECT pg_get_functiondef(oid) INTO current_definition
    FROM pg_proc
    WHERE oid = 'public.replace_managed_guests(text,jsonb)'::regprocedure
      AND prosecdef = TRUE AND prorettype = 'jsonb'::regtype;
    IF current_definition IS NULL
       OR position('NOT public.can_manage_guests(target_event_id)' IN current_definition) = 0
       OR position('group_name = incoming_group,' IN current_definition) = 0
       OR position('WHERE id = target_guest.id;' IN current_definition) = 0 THEN
        RAISE EXCEPTION 'Implementation replace_managed_guests inattendue : verifier ORGANIZER-ACCESS avant EVENT-TABLES.';
    END IF;
    occurrences := (length(current_definition) - length(replace(current_definition, old_assignment, '')))
        / length(old_assignment);
    IF occurrences <> 1 THEN
        RAISE EXCEPTION 'Affectation CSV ambigue : aucune adaptation automatique de replace_managed_guests.';
    END IF;
    IF position(new_assignment IN current_definition) > 0 THEN
        RETURN;
    END IF;
    IF position('resolve_legacy_guest_table_id' IN current_definition) > 0 THEN
        RAISE EXCEPTION 'Adaptation CSV inconnue : verifier replace_managed_guests avant de poursuivre.';
    END IF;
    EXECUTE replace(current_definition, old_assignment, new_assignment);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_legacy_guest_table_id(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_guest_managed_table() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_managed_table_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_managed_table(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_managed_table(TEXT, UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_managed_table(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_managed_table(TEXT, UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_managed_table(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_managed_table(TEXT, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_managed_table(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_managed_table(TEXT, UUID[], UUID) TO authenticated;

-- get_guest_invite (SETOF guests) et les RPC RSVP SECURITY DEFINER existantes
-- conservent leur corps, leurs droits, et voient la colonne additive table_id.
-- Le trigger ne se declenche pas pour une simple mise a jour du statut RSVP.
NOTIFY pgrst, 'reload schema';
COMMIT;
