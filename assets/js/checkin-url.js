/**
 * URL check-in jour J — QR scannable (remplace JSON)
 */
const CheckinUrl = (() => {
    function buildCheckInBaseUrl() {
        const path = window.location.pathname.replace(/[^/]+$/, "checkin.html");
        return `${window.location.origin}${path}`;
    }

    function buildCheckInUrl(guest, eventId) {
        const eid = eventId
            || (window.EventConfig && EventConfig.getEventId && EventConfig.getEventId())
            || "yanick-keren";
        const token = guest && guest.token ? String(guest.token).trim() : "";
        if (!token) return "";
        const params = new URLSearchParams();
        params.set("event", eid);
        params.set("t", token);
        return `${buildCheckInBaseUrl()}?${params.toString()}`;
    }

    function parseScannedValue(raw) {
        const text = String(raw || "").trim();
        if (!text) return null;
        try {
            if (/^https?:\/\//i.test(text)) {
                const url = new URL(text);
                const t = (url.searchParams.get("t") || "").trim();
                const event = (url.searchParams.get("event") || "").trim();
                if (t) return { token: t, eventId: event || null };
            }
        } catch {
            /* not a URL */
        }
        if (text.length >= 8 && text.length <= 64 && /^[\w-]+$/i.test(text)) {
            return { token: text, eventId: null };
        }
        return null;
    }

    return { buildCheckInBaseUrl, buildCheckInUrl, parseScannedValue };
})();

window.CheckinUrl = CheckinUrl;
