/**
 * Couche cloud (Supabase REST) avec repli localStorage
 * Étapes 3, 4, 7
 */
const CloudAPI = (() => {
    function cfg() {
        return window.SUPABASE_CONFIG || { enabled: false, url: "", anonKey: "" };
    }

    function isDjangoEnabled() {
        return !!(window.DjangoAPI && DjangoAPI.isEnabled());
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
            const errText = await res.text().catch(() => "");
            console.warn("CloudAPI", table, method, res.status, errText.slice(0, 240));
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

    function readGuestsLocal(eventId) {
        try {
            const raw = localStorage.getItem(localKey(eventId, "guests"));
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function mergeGuestLists(cloudGuests, localGuests) {
        const map = new Map();
        (cloudGuests || []).forEach((guest) => {
            if (guest && guest.slug) map.set(guest.slug, guest);
        });
        (localGuests || []).forEach((local) => {
            if (!local || !local.slug) return;
            const cloud = map.get(local.slug);
            if (cloud) {
                map.set(local.slug, {
                    ...local,
                    ...cloud,
                    id: cloud.id || local.id,
                    accessCode: local.accessCode || cloud.accessCode || "",
                    tableNumber: local.tableNumber || cloud.tableNumber || "",
                    drinkChoices: (local.drinkChoices && local.drinkChoices.length)
                        ? local.drinkChoices
                        : (cloud.drinkChoices || []),
                    profilePhotoUrl: local.profilePhotoUrl || cloud.profilePhotoUrl || ""
                });
            } else {
                map.set(local.slug, local);
            }
        });
        return Array.from(map.values());
    }

    function extractGuestRow(result) {
        if (Array.isArray(result) && result[0]) return result[0];
        if (result && result.id) return result;
        return null;
    }

    // --- Invités ---
    async function getGuests(eventId) {
        if (isDjangoEnabled()) {
            try {
                const djangoGuests = await DjangoAPI.getGuests(eventId);
                const localGuests = readGuestsLocal(eventId);
                const merged = djangoGuests.length || localGuests.length
                    ? mergeGuestLists(djangoGuests, localGuests)
                    : [];
                return filterDeletedGuests(eventId, merged);
            } catch (err) {
                console.warn("CloudAPI: Django getGuests fallback.", err);
            }
        }

        let cloudGuests = [];
        const cloud = await request("guests", {
            query: `?event_id=eq.${eventId}&order=created_at.desc`
        });
        if (Array.isArray(cloud)) {
            cloudGuests = cloud.map(mapGuestFromCloud);
        }
        const localGuests = readGuestsLocal(eventId);
        const merged = cloudGuests.length || localGuests.length
            ? mergeGuestLists(cloudGuests, localGuests)
            : [];
        return filterDeletedGuests(eventId, merged);
    }

    async function saveGuestsLocal(eventId, guests) {
        localStorage.setItem(localKey(eventId, "guests"), JSON.stringify(guests));
    }

    function restoreDeletedGuest(eventId, guest) {
        if (!guest) return;
        const list = getDeletedGuestsMeta(eventId).filter((entry) => {
            if (guest.slug && entry.slug === guest.slug) return false;
            if (guest.id && entry.id === guest.id) return false;
            if (guest.token && entry.token === guest.token) return false;
            return true;
        });
        localStorage.setItem(deletedGuestsKey(eventId), JSON.stringify(list));
    }

    function guestPayloadVariants(eventId, guest) {
        const minimal = {
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
        const withQr = { ...minimal, qr_approved: !!guest.qrApproved };
        const withExtras = {
            ...withQr,
            access_code: guest.accessCode || null,
            table_number: guest.tableNumber || null,
            drink_choices: guest.drinkChoices && guest.drinkChoices.length
                ? JSON.stringify(guest.drinkChoices)
                : null,
            profile_photo_url: guest.profilePhotoUrl || null
        };
        return [withExtras, withQr, minimal];
    }

    async function writeGuestRecord(method, query, payloads) {
        for (const body of payloads) {
            const result = await request("guests", {
                method,
                query,
                body,
                prefer: "return=representation"
            });
            const row = extractGuestRow(result);
            if (row) return row;
        }
        return null;
    }

    async function upsertGuest(eventId, guest) {
        let workingGuest = { ...guest };

        if (isDjangoEnabled()) {
            try {
                const result = await DjangoAPI.upsertGuest(eventId, workingGuest);
                const merged = result.guest;
                const guests = readGuestsLocal(eventId).filter((g) => g.slug !== merged.slug);
                guests.unshift(merged);
                await saveGuestsLocal(eventId, guests);
                return { guest: merged, cloudSynced: true };
            } catch (err) {
                console.warn("CloudAPI: Django upsert fallback.", err);
            }
        }

        let cloudGuest = null;

        if (isEnabled()) {
            const payloadsFor = () => guestPayloadVariants(eventId, workingGuest);
            const existing = await request("guests", {
                query: `?event_id=eq.${eventId}&slug=eq.${encodeURIComponent(workingGuest.slug)}&select=id`
            });

            if (existing && existing.length) {
                const cloudId = existing[0].id;
                cloudGuest = await writeGuestRecord("PATCH", `?id=eq.${cloudId}`, payloadsFor());
            } else {
                cloudGuest = await writeGuestRecord("POST", "", payloadsFor());
                if (!cloudGuest) {
                    workingGuest = { ...workingGuest, token: generateGuestToken() };
                    cloudGuest = await writeGuestRecord("POST", "", payloadsFor());
                }
            }
        }

        const merged = cloudGuest ? mapGuestFromCloud(cloudGuest) : workingGuest;
        const guests = readGuestsLocal(eventId).filter((g) => g.slug !== merged.slug);
        guests.unshift(merged);
        await saveGuestsLocal(eventId, guests);
        return {
            guest: merged,
            cloudSynced: !isEnabled() || !!cloudGuest
        };
    }

    function generateGuestToken() {
        if (window.crypto && crypto.randomUUID) {
            return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        }
        return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
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

        if (isDjangoEnabled()) {
            try {
                const result = await DjangoAPI.removeGuest(eventId, target);
                return { removed: true, cloudSynced: result.cloudSynced, reason: "ok" };
            } catch (err) {
                console.warn("CloudAPI: Django delete fallback.", err);
            }
        }

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

    // --- Personnalisation (event_settings) ---
    async function getEventSettings(eventId) {
        if (!isEnabled()) {
            const raw = localStorage.getItem(localKey(eventId, "dashboard_state"))
                || localStorage.getItem("wedding_dashboard_state");
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch {
                return null;
            }
        }

        const rows = await request("event_settings", {
            query: `?event_id=eq.${encodeURIComponent(eventId)}&select=dashboard_json,updated_at&limit=1`
        });
        if (!Array.isArray(rows) || !rows[0]) return null;

        const row = rows[0];
        const json = row.dashboard_json || {};
        return {
            ...json,
            _cloudUpdatedAt: row.updated_at || null
        };
    }

    async function saveEventSettings(eventId, payload) {
        const clean = { ...(payload || {}) };
        delete clean._cloudUpdatedAt;

        localStorage.setItem(localKey(eventId, "dashboard_state"), JSON.stringify(payload));
        localStorage.setItem("wedding_dashboard_state", JSON.stringify(payload));

        if (!isEnabled()) {
            return { cloud: false, reason: "offline" };
        }

        const now = new Date().toISOString();
        const existing = await request("event_settings", {
            query: `?event_id=eq.${encodeURIComponent(eventId)}&select=event_id&limit=1`
        });

        let ok = false;
        if (Array.isArray(existing) && existing.length) {
            const patched = await request("event_settings", {
                method: "PATCH",
                query: `?event_id=eq.${encodeURIComponent(eventId)}`,
                body: { dashboard_json: clean, updated_at: now },
                prefer: "return=minimal"
            });
            ok = patched === true;
        } else {
            const inserted = await request("event_settings", {
                method: "POST",
                body: {
                    event_id: eventId,
                    dashboard_json: clean,
                    updated_at: now
                },
                prefer: "return=minimal"
            });
            ok = inserted === true;
        }

        if (!ok) {
            const sizeKb = Math.round(JSON.stringify(clean).length / 1024);
            console.warn(
                "CloudAPI: échec sauvegarde event_settings",
                `(~${sizeKb} Ko). Vérifiez event_settings + bucket event-assets (docs/SUPABASE-STORAGE.sql).`
            );
        }
        return { cloud: ok, updatedAt: now, sizeKb: Math.round(JSON.stringify(clean).length / 1024) };
    }

    function parseDrinkChoices(value) {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return String(value).split(",").map((v) => v.trim()).filter(Boolean);
        }
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
            qrApproved: !!(row.qr_approved ?? row.qrApproved),
            accessCode: row.access_code || row.accessCode || "",
            tableNumber: row.table_number || row.tableNumber || "",
            drinkChoices: parseDrinkChoices(row.drink_choices ?? row.drinkChoices),
            profilePhotoUrl: row.profile_photo_url || row.profilePhotoUrl || "",
            adults: row.adults || 1,
            children: row.children || 0,
            rsvpMessage: row.rsvp_message || "",
            respondedAt: row.responded_at,
            checkedInAt: row.checked_in_at || row.checkedInAt || null,
            createdAt: row.created_at
        };
    }

    async function getCheckIns(eventId, opts = {}) {
        if (!isEnabled()) return null;
        let query = `?event_id=eq.${encodeURIComponent(eventId)}&select=*&order=scanned_at.desc`;
        if (opts.token) {
            query += `&guest_token=eq.${encodeURIComponent(opts.token)}`;
        }
        const rows = await request("check_ins", { query });
        return Array.isArray(rows) ? rows : [];
    }

    async function insertCheckIn(row) {
        if (!isEnabled()) return null;
        const res = await request("check_ins", {
            method: "POST",
            body: row,
            prefer: "return=representation"
        });
        if (Array.isArray(res) && res.length) return res[0];
        return res;
    }

    async function markGuestCheckedIn(eventId, guestId, checkedInAt) {
        if (!isEnabled() || !guestId) return false;
        const res = await request("guests", {
            method: "PATCH",
            query: `?id=eq.${encodeURIComponent(guestId)}&event_id=eq.${encodeURIComponent(eventId)}`,
            body: { checked_in_at: checkedInAt },
            prefer: "return=minimal"
        });
        return res === true;
    }

    function mapGuestToCloudBase(eventId, guest) {
        return {
            event_id: eventId,
            slug: guest.slug,
            full_name: guest.fullName,
            phone: guest.phone || "",
            email: guest.email || "",
            group_name: guest.group || "",
            token: guest.token,
            status: guest.status || "pending",
            qr_approved: !!guest.qrApproved,
            adults: guest.adults || 1,
            children: guest.children || 0,
            rsvp_message: guest.rsvpMessage || "",
            responded_at: guest.respondedAt || null
        };
    }

    function mapGuestToCloud(eventId, guest) {
        return {
            ...mapGuestToCloudBase(eventId, guest),
            access_code: guest.accessCode || null,
            table_number: guest.tableNumber || null,
            drink_choices: guest.drinkChoices && guest.drinkChoices.length
                ? JSON.stringify(guest.drinkChoices)
                : null,
            profile_photo_url: guest.profilePhotoUrl || null,
            checked_in_at: guest.checkedInAt || null
        };
    }

    return {
        isEnabled,
        getGuests,
        saveGuestsLocal,
        restoreDeletedGuest,
        upsertGuest,
        syncAllGuests,
        removeGuestCloud,
        recordRSVP,
        getRSVPs,
        addGuestbookMessage,
        getGuestbookMessages,
        track,
        getAnalytics,
        getEventSettings,
        saveEventSettings,
        getCheckIns,
        insertCheckIn,
        markGuestCheckedIn
    };
})();

window.CloudAPI = CloudAPI;
