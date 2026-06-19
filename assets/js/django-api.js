/**
 * Client API Django — remplace events/*.json et (optionnel) Supabase invités
 */
const DjangoAPI = (() => {
    function cfg() {
        return window.DJANGO_API_CONFIG || { enabled: false, baseUrl: "", legacyAssetBase: "" };
    }

    function isEnabled() {
        const c = cfg();
        return !!(c.enabled && c.baseUrl);
    }

    function apiBase() {
        return String(cfg().baseUrl || "").replace(/\/+$/, "");
    }

    function legacyAssetBase() {
        const c = cfg();
        return (c.legacyAssetBase || "https://alphagiven7-collab.github.io/invitation_mariage/").replace(/\/?$/, "/");
    }

    async function request(path, options = {}) {
        const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
        const headers = { Accept: "application/json", ...(options.headers || {}) };
        if (options.body && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
        }
        const res = await fetch(url, { ...options, headers });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`DjangoAPI ${res.status}: ${text.slice(0, 180)}`);
        }
        if (res.status === 204) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }

    function resolveAssetUrl(url) {
        if (!url || /^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
        const clean = url.replace(/^(\.\.\/)+/, "");
        return legacyAssetBase() + clean;
    }

    function normalizeEventConfig(data) {
        if (!data || !data.branding) return data;
        const branding = { ...data.branding };
        ["welcomeImage", "heroImage", "ogShareImage"].forEach((key) => {
            if (branding[key]) branding[key] = resolveAssetUrl(branding[key]);
        });
        return { ...data, branding };
    }

    async function fetchEvent(slug) {
        const data = await request(`/events/${encodeURIComponent(slug)}/`);
        return normalizeEventConfig(data);
    }

    async function getGuests(eventId) {
        const rows = await request(`/events/${encodeURIComponent(eventId)}/guests/`);
        return Array.isArray(rows) ? rows : [];
    }

    function mapGuestToPayload(guest) {
        return {
            slug: guest.slug,
            fullName: guest.fullName,
            phone: guest.phone || "",
            email: guest.email || "",
            group: guest.group || "",
            token: guest.token,
            status: guest.status || "pending",
            qrApproved: !!guest.qrApproved,
            accessCode: guest.accessCode || "",
            tableNumber: guest.tableNumber || "",
            drinkChoices: guest.drinkChoices || [],
            profilePhotoUrl: guest.profilePhotoUrl || "",
            adults: guest.adults || 1,
            children: guest.children || 0,
            rsvpMessage: guest.rsvpMessage || "",
            respondedAt: guest.respondedAt || null,
            checkedInAt: guest.checkedInAt || null
        };
    }

    async function upsertGuest(eventId, guest) {
        const body = mapGuestToPayload(guest);
        const data = await request(`/events/${encodeURIComponent(eventId)}/guests/`, {
            method: "POST",
            body: JSON.stringify(body)
        });
        return { guest: data, cloudSynced: true };
    }

    async function removeGuest(eventId, guest) {
        const slug = guest.slug || guest.id;
        if (!slug) return { removed: false, cloudSynced: false };
        await request(
            `/events/${encodeURIComponent(eventId)}/guests/${encodeURIComponent(slug)}/`,
            { method: "DELETE" }
        );
        return { removed: true, cloudSynced: true, reason: "ok" };
    }

    return {
        isEnabled,
        fetchEvent,
        getGuests,
        upsertGuest,
        removeGuest,
        resolveAssetUrl
    };
})();

window.DjangoAPI = DjangoAPI;
