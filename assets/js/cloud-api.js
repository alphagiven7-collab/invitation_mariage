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
        if (method === "DELETE") headers.Prefer = prefer || "return=minimal";
        const res = await fetch(`${cfg().url}/rest/v1/${table}${query}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        if (method === "DELETE") {
            if (res.ok) return true;
            const errText = await res.text().catch(() => "");
            console.warn("CloudAPI DELETE", table, res.status, errText);
            return false;
        }
        if (!res.ok) {
            console.warn("CloudAPI", table, method, res.status);
            return null;
        }
        if (res.status === 204) return true;
        const text = await res.text();
        if (!text) return true;
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    function deletedGuestsKey(eventId) {
        return localKey(eventId, "deleted_guests");
    }

    function getDeletedGuestsMeta(eventId) {
        try {
            return JSON.parse(localStorage.getItem(deletedGuestsKey(eventId)) || "[]");
        } catch {
            return [];
        }
    }

    function markGuestDeleted(eventId, guest) {
        if (!guest) return;
        const list = getDeletedGuestsMeta(eventId);
        const entry = {
            id: guest.id,
            slug: guest.slug || "",
            token: guest.token || "",
            at: new Date().toISOString()
        };
        const exists = list.some((d) =>
            (entry.id && d.id === entry.id) ||
            (entry.slug && d.slug === entry.slug) ||
            (entry.token && d.token === entry.token)
        );
        if (!exists) list.push(entry);
        localStorage.setItem(deletedGuestsKey(eventId), JSON.stringify(list));
    }

    function filterDeletedGuests(eventId, guests) {
        const deleted = getDeletedGuestsMeta(eventId);
        if (!deleted.length) return guests;
        const ids = new Set(deleted.map((d) => d.id).filter(Boolean));
        const slugs = new Set(deleted.map((d) => d.slug).filter(Boolean));
        const tokens = new Set(deleted.map((d) => d.token).filter(Boolean));
        return guests.filter((g) =>
            !ids.has(g.id) && !slugs.has(g.slug) && !(g.token && tokens.has(g.token))
        );
    }

    function localKey(eventId, suffix) {
        return `wedding_event_${eventId}_${suffix}`;
    }

    // --- Invités ---
    async function getGuests(eventId) {
        let guests = [];
        const cloud = await request("guests", {
            query: `?event_id=eq.${eventId}&order=created_at.desc`
        });
        if (Array.isArray(cloud)) {
            guests = cloud.map(mapGuestFromCloud);
        } else {
            const raw = localStorage.getItem(localKey(eventId, "guests"));
            guests = raw ? JSON.parse(raw) : [];
        }
        return filterDeletedGuests(eventId, guests);
    }

    async function saveGuestsLocal(eventId, guests) {
        localStorage.setItem(localKey(eventId, "guests"), JSON.stringify(guests));
    }

    async function upsertGuest(eventId, guest) {
        const payload = mapGuestToCloud(eventId, guest);
        let cloudGuest = null;

        if (isEnabled()) {
            if (guest.id) {
                cloudGuest = await request("guests", {
                    method: "PATCH",
                    query: `?id=eq.${guest.id}`,
                    body: payload,
                    prefer: "return=representation"
                });
                if (Array.isArray(cloudGuest) && cloudGuest[0]) cloudGuest = cloudGuest[0];
            }
            if (!cloudGuest) {
                const existing = await request("guests", {
                    query: `?event_id=eq.${eventId}&slug=eq.${encodeURIComponent(guest.slug)}&select=id`
                });
                if (existing && existing.length) {
                    cloudGuest = await request("guests", {
                        method: "PATCH",
                        query: `?id=eq.${existing[0].id}`,
                        body: payload,
                        prefer: "return=representation"
                    });
                    if (Array.isArray(cloudGuest) && cloudGuest[0]) cloudGuest = cloudGuest[0];
                } else {
                    cloudGuest = await request("guests", {
                        method: "POST",
                        body: payload,
                        prefer: "return=representation"
                    });
                    if (Array.isArray(cloudGuest) && cloudGuest[0]) cloudGuest = cloudGuest[0];
                }
            }
        }

        const merged = cloudGuest ? mapGuestFromCloud(cloudGuest) : guest;
        const guests = (await getGuests(eventId)).filter((g) => g.id !== merged.id && g.slug !== guest.slug);
        guests.unshift(merged);
        await saveGuestsLocal(eventId, guests);
        return merged;
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
        const allGuests = await getGuests(eventId);
        const target = allGuests.find((g) => g.id === guestId);
        if (!target) {
            markGuestDeleted(eventId, { id: guestId });
            return { removed: true, cloudSynced: false, reason: "not_found" };
        }

        markGuestDeleted(eventId, target);
        const guests = allGuests.filter((g) => g.id !== guestId);
        await saveGuestsLocal(eventId, guests);

        if (!isEnabled()) {
            return { removed: true, cloudSynced: true, reason: "local_only" };
        }

        let cloudSynced = false;
        const tries = [
            `?id=eq.${guestId}`,
            target.slug ? `?event_id=eq.${eventId}&slug=eq.${encodeURIComponent(target.slug)}` : null,
            target.token ? `?event_id=eq.${eventId}&token=eq.${encodeURIComponent(target.token)}` : null
        ].filter(Boolean);

        for (const query of tries) {
            const deleted = await request("guests", { method: "DELETE", query });
            if (deleted === true) {
                cloudSynced = true;
                break;
            }
        }

        if (!cloudSynced) {
            console.warn(
                "CloudAPI: invité masqué localement mais Supabase DELETE a échoué. " +
                "Exécutez docs/SUPABASE-FIX-DELETE.sql et vérifiez la clé anon (eyJ…)."
            );
        }

        return { removed: true, cloudSynced, reason: cloudSynced ? "ok" : "cloud_delete_failed" };
    }

    // --- RSVP ---
    async function recordRSVP(eventId, data) {
        let resolvedGuestId = data.guestId || null;
        if (isEnabled() && data.fullName) {
            const slug = (data.fullName || "")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            const found = await request("guests", {
                query: `?event_id=eq.${eventId}&slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`
            });
            if (found && found[0]) resolvedGuestId = found[0].id;
        }

        const payload = {
            event_id: eventId,
            guest_id: resolvedGuestId,
            full_name: data.fullName,
            phone: data.phone || "",
            status: data.status,
            adults: Number(data.adults) || 1,
            children: Number(data.children) || 0,
            message: data.message || ""
        };
        if (isEnabled()) {
            await request("rsvps", { method: "POST", body: payload, prefer: "return=representation" });
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
