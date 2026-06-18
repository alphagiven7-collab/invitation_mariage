/**
 * API check-in — Supabase + repli localStorage
 */
const CheckinAPI = (() => {
    function localKey(eventId) {
        return `wedding_event_${eventId}_check_ins`;
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

    function formatTime(iso) {
        if (!iso) return "";
        try {
            return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    }

    async function findGuestByToken(eventId, token) {
        if (window.GuestManager) {
            await GuestManager.loadGuests(true);
            const all = await GuestManager.loadGuests();
            return all.find((g) => g.token === token) || null;
        }
        return null;
    }

    async function getExistingCheckIn(eventId, token) {
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            const rows = await CloudAPI.getCheckIns(eventId, { token });
            return rows && rows.length ? rows[0] : null;
        }
        return readLocal(eventId).find((r) => r.guest_token === token) || null;
    }

    async function listCheckIns(eventId) {
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            return CloudAPI.getCheckIns(eventId) || [];
        }
        return readLocal(eventId);
    }

    async function performCheckIn(eventId, token, meta = {}) {
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
            const inserted = await CloudAPI.insertCheckIn(row);
            if (!inserted) {
                const again = await getExistingCheckIn(eventId, token);
                if (again) {
                    return {
                        ok: false,
                        status: "duplicate",
                        message: `Déjà entré à ${formatTime(again.scanned_at || again.scannedAt)}`,
                        guest,
                        checkIn: again
                    };
                }
                return { ok: false, status: "error", message: "Erreur réseau — réessayez" };
            }
            await CloudAPI.markGuestCheckedIn(eventId, guest.id, row.scanned_at);
        } else {
            const list = readLocal(eventId);
            list.push({ ...row, guest_token: token });
            writeLocal(eventId, list);
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
        formatTime,
        guestSummary
    };
})();

window.CheckinAPI = CheckinAPI;
