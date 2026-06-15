/**
 * Couche cloud (Supabase REST) avec repli localStorage
 * Étapes 3, 4, 7
 */
const CloudAPI = (() => {
    function cfg() {
        return window.SUPABASE_CONFIG || { enabled: false, url: "", anonKey: "" };
    }

    function isEnabled() {
        const c = cfg();
        return c.enabled && c.url && c.anonKey;
    }

    async function request(table, { method = "GET", query = "", body = null, prefer = "" } = {}) {
        if (!isEnabled()) return null;
        const headers = {
            apikey: cfg().anonKey,
            Authorization: `Bearer ${cfg().anonKey}`,
            "Content-Type": "application/json"
        };
        if (prefer) headers.Prefer = prefer;
        const res = await fetch(`${cfg().url}/rest/v1/${table}${query}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) {
            console.warn("CloudAPI", table, res.status);
            return null;
        }
        if (res.status === 204) return true;
        return res.json();
    }

    function localKey(eventId, suffix) {
        return `wedding_event_${eventId}_${suffix}`;
    }

    // --- Invités ---
    async function getGuests(eventId) {
        const cloud = await request("guests", {
            query: `?event_id=eq.${eventId}&order=created_at.desc`
        });
        if (cloud) {
            return cloud.map(mapGuestFromCloud);
        }
        const raw = localStorage.getItem(localKey(eventId, "guests"));
        return raw ? JSON.parse(raw) : [];
    }

    async function saveGuestsLocal(eventId, guests) {
        localStorage.setItem(localKey(eventId, "guests"), JSON.stringify(guests));
    }

    async function upsertGuest(eventId, guest) {
        const payload = mapGuestToCloud(eventId, guest);
        if (isEnabled()) {
            const existing = await request("guests", {
                query: `?event_id=eq.${eventId}&slug=eq.${guest.slug}&select=id`
            });
            if (existing && existing.length) {
                await request("guests", {
                    method: "PATCH",
                    query: `?id=eq.${existing[0].id}`,
                    body: payload
                });
            } else {
                await request("guests", {
                    method: "POST",
                    body: payload,
                    prefer: "return=representation"
                });
            }
        }
        const guests = await getGuests(eventId);
        const idx = guests.findIndex((g) => g.id === guest.id || g.slug === guest.slug);
        if (idx >= 0) guests[idx] = guest;
        else guests.push(guest);
        await saveGuestsLocal(eventId, guests);
        return guest;
    }

    async function syncAllGuests(eventId, guests) {
        await saveGuestsLocal(eventId, guests);
        if (!isEnabled()) return guests;
        for (const g of guests) {
            await upsertGuest(eventId, g);
        }
        return guests;
    }

    async function removeGuestCloud(eventId, guestId) {
        const guests = (await getGuests(eventId)).filter((g) => g.id !== guestId);
        await saveGuestsLocal(eventId, guests);
        if (isEnabled()) {
            await request("guests", { method: "DELETE", query: `?id=eq.${guestId}` });
        }
    }

    // --- RSVP ---
    async function recordRSVP(eventId, data) {
        const payload = {
            event_id: eventId,
            guest_id: data.guestId || null,
            full_name: data.fullName,
            phone: data.phone || "",
            status: data.status,
            adults: Number(data.adults) || 1,
            children: Number(data.children) || 0,
            message: data.message || ""
        };
        if (isEnabled()) {
            await request("rsvps", { method: "POST", body: payload });
        }
        const key = localKey(eventId, "rsvps");
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        list.unshift({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(list));
        return payload;
    }

    async function getRSVPs(eventId) {
        const cloud = await request("rsvps", {
            query: `?event_id=eq.${eventId}&order=created_at.desc`
        });
        if (cloud) return cloud;
        const raw = localStorage.getItem(localKey(eventId, "rsvps"));
        return raw ? JSON.parse(raw) : [];
    }

    // --- Livre d'or ---
    async function addGuestbookMessage(eventId, { authorName, message, guestId = null }) {
        const payload = {
            event_id: eventId,
            guest_id: guestId,
            author_name: authorName,
            message
        };
        if (isEnabled()) {
            await request("guestbook_messages", { method: "POST", body: payload });
        }
        const key = localKey(eventId, "guestbook");
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        list.unshift({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(list));
        return payload;
    }

    async function getGuestbookMessages(eventId) {
        const cloud = await request("guestbook_messages", {
            query: `?event_id=eq.${eventId}&order=created_at.desc&limit=50`
        });
        if (cloud) return cloud;
        const raw = localStorage.getItem(localKey(eventId, "guestbook"));
        return raw ? JSON.parse(raw) : [];
    }

    // --- Analytics ---
    async function track(eventId, eventType, meta = {}) {
        const payload = {
            event_id: eventId,
            event_type: eventType,
            guest_token: meta.guestToken || null,
            meta
        };
        if (isEnabled()) {
            await request("analytics_events", { method: "POST", body: payload });
        }
        const key = localKey(eventId, "analytics");
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        list.push({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
        if (list.length > 500) list.splice(0, list.length - 500);
        localStorage.setItem(key, JSON.stringify(list));
    }

    async function getAnalytics(eventId) {
        const raw = localStorage.getItem(localKey(eventId, "analytics"));
        const local = raw ? JSON.parse(raw) : [];
        if (isEnabled()) {
            const cloud = await request("analytics_events", {
                query: `?event_id=eq.${eventId}&order=created_at.desc&limit=200`
            });
            if (cloud) return cloud;
        }
        return local;
    }

    function mapGuestFromCloud(row) {
        return {
            id: row.id,
            slug: row.slug,
            fullName: row.full_name,
            phone: row.phone || "",
            email: row.email || "",
            group: row.group_name || "",
            token: row.token,
            status: row.status || "pending",
            adults: row.adults || 1,
            children: row.children || 0,
            rsvpMessage: row.rsvp_message || "",
            respondedAt: row.responded_at,
            createdAt: row.created_at
        };
    }

    function mapGuestToCloud(eventId, guest) {
        return {
            event_id: eventId,
            slug: guest.slug,
            full_name: guest.fullName,
            phone: guest.phone || "",
            email: guest.email || "",
            group_name: guest.group || "",
            token: guest.token,
            status: guest.status || "pending",
            adults: guest.adults || 1,
            children: guest.children || 0,
            rsvp_message: guest.rsvpMessage || "",
            responded_at: guest.respondedAt || null
        };
    }

    return {
        isEnabled,
        getGuests,
        upsertGuest,
        syncAllGuests,
        removeGuestCloud,
        recordRSVP,
        getRSVPs,
        addGuestbookMessage,
        getGuestbookMessages,
        track,
        getAnalytics
    };
})();

window.CloudAPI = CloudAPI;
