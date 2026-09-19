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

    async function request(table, { method = "GET", query = "", body = null, prefer = "", throwOnError = false } = {}) {
        if (!isEnabled()) return null;
        const adminSession = window.AuthGuard && AuthGuard.getSession ? AuthGuard.getSession() : null;
        const accessToken = adminSession?.accessToken || cfg().anonKey;
        const headers = {
            apikey: cfg().anonKey,
            Authorization: `Bearer ${accessToken}`,
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
            if (throwOnError) {
                let message = "";
                try { message = JSON.parse(errText).message || ""; } catch {}
                throw new Error(`Supabase (${res.status}) : ${message || "requête refusée"}`);
            }
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

    async function requestRpc(functionName, body, options = {}) {
        const expectsArray = options.expectArray === true;
        if (!isEnabled()) return expectsArray ? [] : null;
        const adminSession = window.AuthGuard && AuthGuard.getSession ? AuthGuard.getSession() : null;
        const accessToken = adminSession?.accessToken || cfg().anonKey;
        let response;
        try {
            response = await fetch(`${cfg().url}/rest/v1/rpc/${functionName}`, {
                method: "POST",
                headers: {
                    apikey: cfg().anonKey,
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body || {})
            });
        } catch (error) {
            const message = "Impossible de joindre le service. Vérifiez votre connexion puis réessayez.";
            console.warn("CloudAPI RPC", functionName, error);
            if (options.throwOnError) throw new Error(message);
            throw error;
        }
        if (!response.ok) {
            const error = await response.text().catch(() => "");
            let message = "";
            try {
                const parsed = JSON.parse(error);
                message = parsed.message || parsed.hint || parsed.details || "";
            } catch {}
            console.warn("CloudAPI RPC", functionName, response.status, error.slice(0, 240));
            if (options.throwOnError) {
                throw new Error(message || `Supabase a refusé la requête (${response.status}).`);
            }
            return null;
        }
        const raw = await response.text().catch(() => "");
        let data = null;
        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch {
                const message = "La réponse du service est illisible. Réessayez plus tard.";
                console.warn("CloudAPI RPC", functionName, message);
                if (options.throwOnError) throw new Error(message);
                return expectsArray ? [] : null;
            }
        }
        if (expectsArray) {
            if (data === null) return [];
            if (Array.isArray(data)) return data;
            const message = "Le service a renvoyé une réponse inattendue.";
            console.warn("CloudAPI RPC", functionName, message, data);
            if (options.throwOnError) throw new Error(message);
            return [];
        }
        return Array.isArray(data) ? data[0] || null : data;
    }

    async function requestStorage(path, { method = "GET", body = null } = {}) {
        const session = window.AuthGuard && AuthGuard.getSession ? AuthGuard.getSession() : null;
        if (!session?.accessToken) {
            throw new Error("Votre session administrateur a expiré. Reconnectez-vous avant de supprimer l'événement.");
        }
        const response = await fetch(`${cfg().url}/storage/v1/${path}`, {
            method,
            headers: {
                apikey: cfg().anonKey,
                Authorization: `Bearer ${session.accessToken}`,
                "Content-Type": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!response.ok) {
            const details = await response.text().catch(() => "");
            throw new Error(`Suppression des médias refusée par Supabase Storage (${response.status}). ${details}`.trim());
        }
        return response.json().catch(() => null);
    }

    async function deleteEventAssets(eventId) {
        const prefix = `${String(eventId || "").trim()}/`;
        if (prefix === "/") return 0;
        let deletedCount = 0;

        while (true) {
            const objects = await requestStorage("object/list/event-assets", {
                method: "POST",
                body: { prefix, limit: 1000, offset: 0 }
            });
            const paths = (Array.isArray(objects) ? objects : [])
                .filter((object) => object?.name && object.id)
                .map((object) => object.name.startsWith(prefix) ? object.name : `${prefix}${object.name}`);
            if (!paths.length) return deletedCount;

            await requestStorage("object/event-assets", {
                method: "DELETE",
                body: { prefixes: paths }
            });
            deletedCount += paths.length;
            if (paths.length < 1000) return deletedCount;
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

    async function requestAllRows(table, query) {
        const rows = [];
        let offset = 0;
        const separator = query.includes("?") ? "&" : "?";
        while (true) {
            const page = await request(table, {
                query: `${query}${separator}limit=500&offset=${offset}`,
                throwOnError: true
            });
            if (!Array.isArray(page)) throw new Error(`Synchronisation Supabase impossible pour ${table}.`);
            rows.push(...page);
            if (page.length < 500) return rows;
            offset += page.length;
        }
    }

    // --- Invités ---
    async function getGuests(eventId) {
        const isEventAdmin = window.AuthGuard && AuthGuard.isEventAdmin
            ? AuthGuard.isEventAdmin(eventId)
            : false;
        if (isEnabled() && !isEventAdmin) {
            throw new Error("Connexion organisateur requise pour charger les invités Supabase.");
        }
        if (isDjangoEnabled()) {
            try {
                const djangoGuests = await DjangoAPI.getGuests(eventId);
                await saveGuestsLocal(eventId, djangoGuests);
                return djangoGuests;
            } catch (err) {
                console.warn("CloudAPI: Django getGuests fallback.", err);
            }
        }

        if (!isEnabled()) return readGuestsLocal(eventId);
        const cloudGuests = (await requestAllRows(
            "guests",
            `?event_id=eq.${encodeURIComponent(eventId)}&order=created_at.desc,id.asc`
        )).map(mapGuestFromCloud);
        await saveGuestsLocal(eventId, cloudGuests);
        return cloudGuests;
    }

    async function saveGuestsLocal(eventId, guests) {
        if (isEnabled()) {
            if (typeof localStorage.removeItem === "function") {
                localStorage.removeItem(localKey(eventId, "guests"));
            }
            return;
        }
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

    async function upsertGuest(eventId, guest, { saveLocal = true, requireExisting = false, createOnly = false } = {}) {
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
            if (createOnly) {
                // Explicit insert: never overwrite an existing invitation, token or RSVP.
                const result = await request("guests", {
                    method: "POST", body: { ...payloadsFor()[0], id: workingGuest.id },
                    prefer: "return=representation", throwOnError: true
                });
                cloudGuest = extractGuestRow(result);
                if (!cloudGuest) throw new Error("Supabase n'a pas confirmé la création de l'invité.");
            } else if (workingGuest.id) {
                cloudGuest = await writeGuestRecord(
                    "PATCH",
                    `?id=eq.${encodeURIComponent(workingGuest.id)}&event_id=eq.${encodeURIComponent(eventId)}`,
                    payloadsFor()
                );
                if (!cloudGuest) return { guest: null, cloudSynced: false };
            } else {
                const existing = await request("guests", {
                    query: `?event_id=eq.${eventId}&slug=eq.${encodeURIComponent(workingGuest.slug)}&select=id`
                });
                if (existing && existing.length) {
                    const cloudId = existing[0].id;
                    cloudGuest = await writeGuestRecord("PATCH", `?id=eq.${cloudId}`, payloadsFor());
                }
            }
            if (requireExisting && !cloudGuest) {
                return { guest: null, cloudSynced: false };
            }
            if (!cloudGuest) {
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
                if (saveLocal) await saveGuestsLocal(eventId, guests);
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
            return { removed: false, cloudSynced: false, reason: "not_found" };
        }

        if (isDjangoEnabled()) {
            try {
                const result = await DjangoAPI.removeGuest(eventId, target);
                if (result.cloudSynced) {
                    markGuestDeleted(eventId, target);
                    await saveGuestsLocal(eventId, allGuests.filter((guest) => guest.id !== guestId));
                }
                return { removed: true, cloudSynced: result.cloudSynced, reason: "ok" };
            } catch (err) {
                console.warn("CloudAPI: Django delete fallback.", err);
            }
        }

        if (!isEnabled()) {
            markGuestDeleted(eventId, target);
            await saveGuestsLocal(eventId, allGuests.filter((guest) => guest.id !== guestId));
            return { removed: true, cloudSynced: true, reason: "local_only" };
        }

        const deleted = await requestRpc("delete_managed_guest", {
            p_event_id: eventId,
            p_guest_id: guestId
        });
        if (deleted !== true) {
            console.warn(
                "CloudAPI: suppression refusée ou migration Supabase manquante. " +
                "Exécutez docs/SUPABASE-PLATFORM-HARDENING.sql dans Supabase."
            );
            return { removed: false, cloudSynced: false, reason: "cloud_delete_failed" };
        }

        markGuestDeleted(eventId, target);
        await saveGuestsLocal(eventId, allGuests.filter((guest) => guest.id !== guestId));
        return { removed: true, cloudSynced: true, reason: "ok" };
    }

    async function removeGuestsCloud(eventId, guestIds, knownGuests = null) {
        const ids = [...new Set((guestIds || []).filter(Boolean))];
        if (!ids.length) return { removed: 0, cloudSynced: true };
        const results = [];
        for (const guestId of ids) {
            try { results.push(await removeGuestCloud(eventId, guestId)); }
            catch (error) { results.push({ removed: false, cloudSynced: false, reason: error.message }); }
        }
        return {
            removed: results.filter((result) => result.removed).length,
            cloudSynced: results.every((result) => result.cloudSynced)
        };
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
            const query = resolvedGuestId
                ? `?event_id=eq.${encodeURIComponent(eventId)}&guest_id=eq.${encodeURIComponent(resolvedGuestId)}&select=id&limit=1`
                : "";
            const existing = query ? await request("rsvps", { query }) : null;
            if (Array.isArray(existing) && existing[0]?.id) {
                await request("rsvps", {
                    method: "PATCH",
                    query: `?id=eq.${encodeURIComponent(existing[0].id)}`,
                    body: payload,
                    prefer: "return=representation"
                });
            } else {
                await request("rsvps", { method: "POST", body: payload, prefer: "return=representation" });
            }
        }
        const key = localKey(eventId, "rsvps");
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        const localIndex = resolvedGuestId
            ? list.findIndex((item) => item.guest_id === resolvedGuestId)
            : -1;
        const localRecord = { ...payload, id: localIndex >= 0 ? list[localIndex].id : crypto.randomUUID(), created_at: new Date().toISOString() };
        if (localIndex >= 0) list[localIndex] = localRecord;
        else list.unshift(localRecord);
        localStorage.setItem(key, JSON.stringify(list));
        return payload;
    }

    async function submitPublicRsvp(eventId, data) {
        return requestRpc("submit_public_rsvp", {
            p_event_id: eventId,
            p_full_name: data.fullName,
            p_phone: data.phone || "",
            p_adults: Number(data.adults) || 1,
            p_children: Number(data.children) || 0,
            p_message: data.message || ""
        }, { throwOnError: true });
    }

    async function submitOpenRsvp(eventId, data) {
        return requestRpc("submit_open_rsvp", {
            p_event_id: eventId,
            p_full_name: data.fullName,
            p_status: data.status === "no" ? "no" : "yes",
            p_side: data.side,
            p_drink_choices: Array.isArray(data.drinkChoices) ? data.drinkChoices : [],
            p_message: data.message || ""
        }, { throwOnError: true });
    }

    async function getRSVPs(eventId) {
        if (isEnabled()) {
            const cloud = await requestAllRows(
                "rsvps",
                `?event_id=eq.${encodeURIComponent(eventId)}&order=created_at.desc,id.asc`
            );
            return keepLatestRsvpPerGuest(cloud);
        }
        const raw = localStorage.getItem(localKey(eventId, "rsvps"));
        return raw ? keepLatestRsvpPerGuest(JSON.parse(raw)) : [];
    }

    function keepLatestRsvpPerGuest(rsvps) {
        const identities = new Set();
        return (Array.isArray(rsvps) ? rsvps : []).filter((rsvp) => {
            if (!rsvp) return false;
            const fullName = String(rsvp.full_name || rsvp.fullName || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
            const phone = String(rsvp.phone || "").replace(/\D/g, "");
            const identity = fullName && phone
                ? `contact:${fullName}:${phone}`
                : rsvp.guest_id ? `guest:${rsvp.guest_id}` : "";
            if (!identity || identities.has(identity)) return !identity;
            identities.add(identity);
            return true;
        });
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

    async function deleteGuestbookMessage(eventId, messageId) {
        if (!messageId) return false;
        if (isEnabled()) {
            return request("guestbook_messages", {
                method: "DELETE",
                query: `?id=eq.${encodeURIComponent(messageId)}&event_id=eq.${encodeURIComponent(eventId)}`
            });
        }
        const key = localKey(eventId, "guestbook");
        const messages = JSON.parse(localStorage.getItem(key) || "[]").filter((message) => message.id !== messageId);
        localStorage.setItem(key, JSON.stringify(messages));
        return true;
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
            return requestAllRows(
                "analytics_events",
                `?event_id=eq.${encodeURIComponent(eventId)}&order=created_at.desc,id.asc`
            );
        }
        return local;
    }

    // --- Personnalisation (event_settings) ---
    async function getEventSettings(eventId) {
        if (!isEnabled()) {
            const raw = localStorage.getItem(localKey(eventId, "dashboard_state"));
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

    async function getPublicEventConfig(eventId) {
        return requestRpc("get_public_event_config", { p_event_id: eventId }, { throwOnError: true });
    }

    async function getEvents() {
        if (!isEnabled()) {
            throw new Error("Supabase n'est pas configuré : la liste des événements cloud est indisponible.");
        }
        const events = await request("events", {
            query: "?select=id,slug,type,title,config_json,created_at&order=created_at.desc"
        });
        if (events === null) {
            throw new Error("Impossible de charger les événements. Vérifiez votre connexion et les droits du compte plateforme.");
        }
        return Array.isArray(events) ? events.map((event) => ({
            id: event.id,
            slug: event.slug,
            type: event.type,
            title: event.title,
            createdAt: event.created_at,
            ...(event.config_json || {})
        })) : [];
    }

    async function getGuestByInviteToken(token) {
        const guest = await requestRpc("get_guest_invite", { p_token: token });
        return guest ? mapGuestFromCloud(guest) : null;
    }

    async function submitGuestRsvp(eventId, token, data) {
        const guest = await requestRpc("submit_guest_rsvp", {
            p_event_id: eventId,
            p_token: token,
            p_phone: data.phone || "",
            p_status: data.status === "yes" ? "yes" : "no",
            p_adults: Number(data.adults) || 1,
            p_children: Number(data.children) || 0,
            p_message: data.message || "",
            p_drink_choices: Array.isArray(data.drinkChoices) ? data.drinkChoices : [],
            p_profile_photo_url: data.profilePhotoUrl || ""
        }, { throwOnError: true });
        return guest ? mapGuestFromCloud(guest) : null;
    }

    async function getPublicGuestbookMessages(eventId) {
        return requestRpc(
            "get_public_guestbook_messages",
            { p_event_id: eventId },
            { expectArray: true, throwOnError: true }
        );
    }

    async function getPublicRsvpMessages(eventId) {
        return requestRpc(
            "get_public_rsvp_messages",
            { p_event_id: eventId },
            { expectArray: true, throwOnError: true }
        );
    }

    async function postGuestbookMessage(eventId, token, message) {
        const created = await requestRpc("post_guestbook_message", {
            p_event_id: eventId,
            p_token: token,
            p_message: message
        }, { throwOnError: true });
        if (!created || !created.message) {
            throw new Error("Le livre d'or n'a pas confirmé la publication du message.");
        }
        return created;
    }

    async function createEvent(event) {
        if (!event || !event.id || !event.slug || !event.title) {
            throw new Error("Configuration d'événement incomplète.");
        }
        if (!isEnabled()) return { cloud: false, reason: "offline" };

        const created = await requestRpc("create_managed_event", { p_event: event }, { throwOnError: true });
        if (!created || !created.id) {
            return { cloud: false, reason: "event_create_failed" };
        }
        return { cloud: true, reason: "ok", event: created };
    }

    async function deleteEvent(eventId) {
        if (!eventId) throw new Error("Identifiant d'événement manquant.");
        if (!isEnabled()) throw new Error("Supabase n'est pas configuré.");
        let mediaCleanupWarning = "";
        try {
            // Les politiques Storage verifient encore can_manage_event(eventId).
            // L'evenement doit donc exister pendant le nettoyage de son dossier.
            await deleteEventAssets(eventId);
        } catch (error) {
            console.warn("CloudAPI: nettoyage Storage impossible", error);
            mediaCleanupWarning = " L'événement a été supprimé, mais certains médias pourront rester dans le stockage.";
        }
        const deleted = await requestRpc(
            "delete_managed_event",
            { p_event_id: eventId },
            { throwOnError: true }
        );
        if (deleted !== true) throw new Error("Suppression de l'événement impossible.");
        return { deleted: true, mediaCleanupWarning };
    }

    async function replaceGuestList(eventId, guests) {
        if (!eventId || !Array.isArray(guests)) {
            throw new Error("Liste d'invités invalide.");
        }
        if (!window.AuthGuard?.isEventAdmin?.(eventId)) {
            throw new Error("Connexion organisateur requise pour remplacer la liste.");
        }
        const result = await requestRpc("replace_managed_guests", {
            p_event_id: eventId,
            p_imported_guests: guests
        }, { throwOnError: true });
        if (!result || typeof result !== "object") {
            throw new Error("Supabase n'a pas confirmé le remplacement de la liste.");
        }
        return { cloudSynced: true, ...result };
    }

    async function saveEventSettings(eventId, payload) {
        const clean = { ...(payload || {}) };
        delete clean._cloudUpdatedAt;
        // Les réglages sont exposés aux visiteurs via une RPC publique : ne jamais y écrire de secret organisateur.
        delete clean.ownerEmail;
        delete clean.owner_email;
        delete clean.adminCode;
        delete clean.admin_code;

        localStorage.setItem(localKey(eventId, "dashboard_state"), JSON.stringify(payload));

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
                `(~${sizeKb} Ko). Vérifiez event_settings + bucket event-assets (docs/SUPABASE-STORAGE-RLS.sql).`
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
            eventId: row.event_id,
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
        return requestAllRows("check_ins", query);
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
        removeGuestsCloud,
        syncAllGuests,
        removeGuestCloud,
        recordRSVP,
        submitPublicRsvp,
        submitOpenRsvp,
        getRSVPs,
        addGuestbookMessage,
        getGuestbookMessages,
        deleteGuestbookMessage,
        track,
        getAnalytics,
        createEvent,
        deleteEvent,
        deleteEventAssets,
        replaceGuestList,
        getEvents,
        getEventSettings,
        getPublicEventConfig,
        getGuestByInviteToken,
        submitGuestRsvp,
        getPublicGuestbookMessages,
        getPublicRsvpMessages,
        postGuestbookMessage,
        saveEventSettings,
        getCheckIns,
        insertCheckIn,
        markGuestCheckedIn
    };
})();

window.CloudAPI = CloudAPI;
