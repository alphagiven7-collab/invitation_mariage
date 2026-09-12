-- Fiabilité multi-événements : exécuter une seule fois dans Supabase SQL Editor.
-- Prérequis : docs/SUPABASE-SETUP.sql, SUPABASE-GUEST-EXTRAS.sql,
-- SUPABASE-CHECK-INS.sql et SUPABASE-STORAGE.sql.

-- La création d'un événement depuis l'admin doit pouvoir insérer sa ligne parent.
DROP POLICY IF EXISTS "events_insert" ON events;
CREATE POLICY "events_insert" ON events FOR INSERT WITH CHECK (true);

-- CloudAPI met à jour la réponse existante lorsque le même invité répond à nouveau.
DROP POLICY IF EXISTS "rsvps_update" ON rsvps;
CREATE POLICY "rsvps_update" ON rsvps FOR UPDATE USING (true) WITH CHECK (true);

-- Une seule réponse courante par invité et par événement.
-- Les RSVP anonymes sans guest_id restent possibles, mais ne reçoivent pas de QR.
-- Conserve la réponse la plus récente lorsque des doublons historiques existent.
DELETE FROM rsvps
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY event_id, guest_id
                ORDER BY created_at DESC, id DESC
            ) AS duplicate_rank
        FROM rsvps
        WHERE guest_id IS NOT NULL
    ) AS ranked_rsvps
    WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS rsvps_one_response_per_guest
    ON rsvps (event_id, guest_id)
    WHERE guest_id IS NOT NULL;