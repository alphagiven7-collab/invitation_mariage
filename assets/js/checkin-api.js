/**
 * API check-in — Supabase + repli localStorage
 */
const CheckinAPI = (() => {
    function localKey(eventId) {
        return `wedding_event_${eventId}_check_ins`;
    }

    function pendingKey(eventId) {
        return `wedding_event_${eventId}_check_ins_pending`;
    }

    function staffRosterKey(eventId) {
        return `wedding_event_${eventId}_checkin_roster`;
    }

    function readLocal(eventId) {
        try {
            return JSON.parse(localStorage.getItem(localKey(eventId)) || "[]");
        } catch {
            return [];
        }
    }

    function writeLocal(eventId, list) {
        localStorage.setItem(localKey(eventId), JSON.stringify(list));
    }

    function readCachedGuestRoster(eventId) {
        try {
            const roster = JSON.parse(localStorage.getItem(staffRosterKey(eventId)) || "[]");
            return Array.isArray(roster) ? roster : [];
        } catch {
            return [];
        }
    }

    function cacheGuestRoster(eventId, roster) {
        if (!Array.isArray(roster)) return readCachedGuestRoster(eventId);
        const validRoster = roster.filter(Boolean);
        try {
            localStorage.setItem(staffRosterKey(eventId), JSON.stringify(validRoster));
        } catch {
            // Keep the loaded roster available for this session if local storage fails.
        }
        return validRoster;
    }

    function findGuestInRoster(roster, token) {
        return (Array.isArray(roster) ? roster : [])
            .find((guest) => guest && (guest.token || guest.guest_token) === token) || null;
    }

    function readPending(eventId) {
        try {
            return JSON.parse(localStorage.getItem(pendingKey(eventId)) || "[]");
        } catch {
            return [];
        }
    }

    function writePending(eventId, list) {
        localStorage.setItem(pendingKey(eventId), JSON.stringify(list));
    }

    function saveLocalCheckIn(eventId, row, { pending = false } = {}) {
        const local = readLocal(eventId).filter((item) => item.guest_token !== row.guest_token);
        const localRow = { ...row };
        if (pending) localRow.pending_sync = true;
        else delete localRow.pending_sync;
        local.unshift(localRow);
        writeLocal(eventId, local);

        return localRow;
    }

    function saveOfflineCheckIn(eventId, row) {
        const offlineRow = saveLocalCheckIn(eventId, row, { pending: true });

        const pending = readPending(eventId).filter((item) => item.guest_token !== row.guest_token);
        pending.push(offlineRow);
        writePending(eventId, pending);
        return offlineRow;
    }

    function markLocalCheckInSynced(eventId, token) {
        writeLocal(eventId, readLocal(eventId).map((item) => item.guest_token === token
            ? { ...item, pending_sync: false }
            : item));
    }

    function formatTime(iso) {
        if (!iso) return "";
        try {
            return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    }

    async function findGuestByToken(eventId, token) {
        const manager = window.GuestManager;
        if (manager?.loadGuests) {
            try {
                // Sans forcer un rechargement, GuestManager peut utiliser la liste déjà
                // chargée avant la perte de connexion.
                const cached = cacheGuestRoster(eventId, await manager.loadGuests());
                const guest = findGuestInRoster(cached, token);
                if (guest) return guest;

                // Si le token n'est pas dans ce cache, une actualisation reste utile
                // lorsqu'une connexion est disponible.
                const refreshed = cacheGuestRoster(eventId, await manager.loadGuests(true));
                return findGuestInRoster(refreshed, token);
            } catch {
                // Une copie persistée d'une liste chargée antérieurement reste
                // exploitable pour laisser le staff continuer hors ligne.
                return findGuestInRoster(readCachedGuestRoster(eventId), token);
            }
        }
        return findGuestInRoster(readCachedGuestRoster(eventId), token);
    }

    async function warmGuestRoster(eventId) {
        const manager = window.GuestManager;
        if (!manager?.loadGuests) return readCachedGuestRoster(eventId);
        try {
            // Store a staff-only copy because CloudAPI may clear its general guest cache.
            return cacheGuestRoster(eventId, await manager.loadGuests(true));
        } catch {
            return readCachedGuestRoster(eventId);
        }
    }

    async function getExistingCheckIn(eventId, token) {
        const local = readLocal(eventId).find((r) => r.guest_token === token) || null;
        if (local) return local;
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            try {
                const rows = await CloudAPI.getCheckIns(eventId, { token });
                return rows && rows.length ? rows[0] : null;
            } catch {
                return null;
            }
        }
        return null;
    }

    async function listCheckIns(eventId) {
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            try {
                const cloud = await CloudAPI.getCheckIns(eventId) || [];
                const known = new Set(cloud.map((item) => item.guest_token));
                return [...cloud, ...readLocal(eventId).filter((item) => !known.has(item.guest_token))];
            } catch {
                return readLocal(eventId);
            }
        }
        return readLocal(eventId);
    }

    async function syncPendingCheckIns(eventId) {
        if (!window.CloudAPI?.isEnabled?.()) return { synced: 0, pending: readPending(eventId).length };
        const pending = readPending(eventId);
        if (!pending.length) return { synced: 0, pending: 0 };

        const remaining = [];
        let synced = 0;
        for (const row of pending) {
            try {
                const inserted = await CloudAPI.insertCheckIn({
                    event_id: row.event_id,
                    guest_id: row.guest_id,
                    guest_token: row.guest_token,
                    scanned_at: row.scanned_at,
                    scanned_by: row.scanned_by,
                    device_id: row.device_id
                });
                if (!inserted) {
                    let existing = null;
                    try {
                        const rows = await CloudAPI.getCheckIns(eventId, { token: row.guest_token });
                        existing = rows && rows.length ? rows[0] : null;
                    } catch {
                        existing = null;
                    }
                    if (existing) {
                        markLocalCheckInSynced(eventId, row.guest_token);
                        synced++;
                        continue;
                    }
                    remaining.push(row);
                    continue;
                }
                if (row.guest_id) await CloudAPI.markGuestCheckedIn(eventId, row.guest_id, row.scanned_at);
                markLocalCheckInSynced(eventId, row.guest_token);
                synced++;
            } catch {
                remaining.push(row);
            }
        }
        writePending(eventId, remaining);
        return { synced, pending: remaining.length };
    }

    async function performCheckIn(eventId, token, meta = {}) {
        await syncPendingCheckIns(eventId).catch(() => {});
        const guest = await findGuestByToken(eventId, token);
        if (!guest) {
            return { ok: false, status: "invalid", message: "QR invalide — invité inconnu" };
        }
        if (guest.status !== "yes") {
            return {
                ok: false,
                status: "invalid",
                message: guest.status === "no"
                    ? "RSVP refusé — accès non autorisé"
                    : "RSVP non confirmé — accès refusé"
            };
        }
        if (!guest.qrApproved) {
            return {
                ok: false,
                status: "invalid",
                message: "QR non validé par l'organisateur — accès refusé"
            };
        }

        const existing = await getExistingCheckIn(eventId, token);
        if (existing) {
            const at = existing.scanned_at || existing.scannedAt;
            return {
                ok: false,
                status: "duplicate",
                message: `Déjà entré à ${formatTime(at)}`,
                guest,
                checkIn: existing
            };
        }

        const row = {
            event_id: eventId,
            guest_id: guest.id || null,
            guest_token: token,
            scanned_at: new Date().toISOString(),
            scanned_by: meta.scannedBy || null,
            device_id: meta.deviceId || null
        };

        if (window.CloudAPI && CloudAPI.isEnabled()) {
            let inserted = null;
            try {
                inserted = await CloudAPI.insertCheckIn(row);
            } catch {
                inserted = null;
            }
            if (!inserted) {
                let again = null;
                try {
                    const rows = await CloudAPI.getCheckIns(eventId, { token });
                    again = rows && rows.length ? rows[0] : null;
                } catch {
                    again = null;
                }
                if (again) {
                    return {
                        ok: false,
                        status: "duplicate",
                        message: `Déjà entré à ${formatTime(again.scanned_at || again.scannedAt)}`,
                        guest,
                        checkIn: again
                    };
                }
                const queued = saveOfflineCheckIn(eventId, row);
                return {
                    ok: true,
                    status: "pending",
                    message: "Entrée enregistrée hors connexion. Synchronisation Supabase en attente.",
                    guest,
                    checkIn: queued
                };
            }
            // Conserve aussi un scan déjà synchronisé : le contrôle des doublons
            // continue alors de fonctionner si la connexion disparaît ensuite.
            saveLocalCheckIn(eventId, row);
            await CloudAPI.markGuestCheckedIn(eventId, guest.id, row.scanned_at);
        } else {
            saveLocalCheckIn(eventId, row);
            if (window.GuestManager && guest.id) {
                await GuestManager.updateGuest(guest.id, { checkedInAt: row.scanned_at });
            }
        }

        return {
            ok: true,
            status: "success",
            message: "Bienvenue !",
            guest,
            checkIn: row
        };
    }

    function guestSummary(guest, payload) {
        const adults = payload?.adults ?? guest?.adults ?? 1;
        const children = payload?.children ?? guest?.children ?? 0;
        const table = guest?.tableNumber || "—";
        const drinks = Array.isArray(guest?.drinkChoices) && guest.drinkChoices.length
            ? guest.drinkChoices.join(" · ")
            : "—";
        return {
            name: guest?.fullName || "Invité",
            adults,
            children,
            table,
            drinks,
            accessCode: guest?.accessCode || (guest?.token ? guest.token.slice(0, 8).toUpperCase() : "")
        };
    }

    return {
        performCheckIn,
        listCheckIns,
        getExistingCheckIn,
        syncPendingCheckIns,
        warmGuestRoster,
        formatTime,
        guestSummary
    };
})();

window.CheckinAPI = CheckinAPI;
