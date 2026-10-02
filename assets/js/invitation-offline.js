/** Copie personnelle en lecture seule, distincte des listes organisateur. */
const InvitationOffline = (() => {
    const PREFIX = "michelline_personal_invitation_v1:";
    const blockedKeys = new Set();
    const blockedEvents = new Set();
    let usedOfflineCopy = false;

    function keyFor(eventId, token) {
        if (typeof eventId !== "string" || !eventId || typeof token !== "string" || !token) return null;
        return `${PREFIX}${encodeURIComponent(eventId)}:${encodeURIComponent(token)}`;
    }

    function emit(name, detail) {
        if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        }
    }

    function sanitizeGuest(eventId, token, guest) {
        if (!guest || typeof guest !== "object" || typeof guest.id !== "string" || !guest.id
            || guest.eventId !== eventId || guest.token !== token || guest.status !== "yes"
            || typeof guest.fullName !== "string" || !guest.fullName) return null;
        const text = (value) => typeof value === "string" ? value : "";
        return {
            id: guest.id, eventId, token, status: "yes", fullName: guest.fullName,
            tableNumber: text(guest.tableNumber),
            tableId: typeof guest.tableId === "string" ? guest.tableId : null,
            adults: Number.isInteger(guest.adults) && guest.adults >= 0 ? guest.adults : 1,
            children: Number.isInteger(guest.children) && guest.children >= 0 ? guest.children : 0,
            qrApproved: guest.qrApproved === true,
            accessCode: text(guest.accessCode), profilePhotoUrl: text(guest.profilePhotoUrl),
            rsvpMessage: text(guest.rsvpMessage), respondedAt: text(guest.respondedAt),
            drinkChoices: Array.isArray(guest.drinkChoices)
                ? guest.drinkChoices.filter((choice) => typeof choice === "string") : []
        };
    }

    function saveGuest(eventId, token, guest) {
        const key = keyFor(eventId, token);
        const safeGuest = sanitizeGuest(eventId, token, guest);
        if (!key || !safeGuest) return false;
        try {
            localStorage.setItem(key, JSON.stringify({ version: 1, eventId, token, savedAt: new Date().toISOString(), guest: safeGuest }));
            blockedKeys.delete(key);
            blockedEvents.delete(eventId);
            return true;
        } catch {
            // Un echec de stockage ne transforme jamais un RSVP serveur reussi en erreur.
            forgetGuest(eventId, token, { notify: false });
            return false;
        }
    }

    function readGuest(eventId, token) {
        const key = keyFor(eventId, token);
        if (!key || blockedKeys.has(key) || blockedEvents.has(eventId)) return null;
        try {
            const saved = JSON.parse(localStorage.getItem(key) || "null");
            if (!saved || saved.version !== 1 || saved.eventId !== eventId || saved.token !== token) return null;
            return sanitizeGuest(eventId, token, saved.guest);
        } catch {
            return null;
        }
    }

    function forgetGuest(eventId, token, options = {}) {
        const key = keyFor(eventId, token);
        if (!key) return;
        blockedKeys.add(key);
        try { localStorage.removeItem(key); } catch { /* blocage memoire conserve */ }
        try { localStorage.removeItem(`wedding_event_${eventId}_confirm_${token}`); } catch { /* cache historique */ }
        if (options.notify !== false) emit("invitation:revoked", { eventId, token, scope: "guest" });
    }

    function forgetEvent(eventId) {
        if (typeof eventId !== "string" || !eventId) return;
        blockedEvents.add(eventId);
        const prefix = `${PREFIX}${encodeURIComponent(eventId)}:`;
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(prefix)) keys.push(key);
            }
            for (const key of keys) {
                try { forgetGuest(eventId, decodeURIComponent(key.slice(prefix.length)), { notify: false }); } catch { /* cle invalide */ }
            }
        } catch { /* blocage de tout l'evenement meme si le stockage est inaccessible */ }
        emit("invitation:revoked", { eventId, scope: "event" });
    }

    function isOffline() {
        return usedOfflineCopy || (typeof navigator !== "undefined" && navigator.onLine === false);
    }

    function markOffline(detail = {}) {
        usedOfflineCopy = true;
        emit("offlineinvitation:used", detail);
    }

    return { saveGuest, readGuest, forgetGuest, forgetEvent, isOffline, markOffline };
})();

window.InvitationOffline = InvitationOffline;
