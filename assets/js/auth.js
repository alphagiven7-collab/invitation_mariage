/**
 * Authentification admin (Étape 5)
 * - Admin plateforme : code global
 * - Admin événement : code dans events/*.json → adminCode
 */
const AuthGuard = (() => {
    const PLATFORM_CODE = "YANICK-KEREN-ADMIN";
    const SESSION_KEY = "wedding_admin_session";

    function getSession() {
        try {
            return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
        } catch {
            return null;
        }
    }

    function setSession(data) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    }

    function clearSession() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    function isPlatformAdmin() {
        const s = getSession();
        return s && s.role === "platform";
    }

    function isEventAdmin(eventId) {
        const s = getSession();
        if (!s) return false;
        if (s.role === "platform") return true;
        return s.role === "event" && s.eventId === eventId;
    }

    function login(code, eventId) {
        if (code === PLATFORM_CODE) {
            setSession({ role: "platform", eventId: null, at: Date.now() });
            return { ok: true, role: "platform" };
        }
        const config = window.EventConfig && EventConfig.getConfig();
        const eventCode = config && config.adminCode;
        if (eventCode && code === eventCode && eventId) {
            setSession({ role: "event", eventId, at: Date.now() });
            return { ok: true, role: "event" };
        }
        return { ok: false };
    }

    function requireAdmin(eventId) {
        if (isEventAdmin(eventId)) return true;
        const params = new URLSearchParams(window.location.search);
        window.location.href = `./login.html?event=${eventId || params.get("event") || "yanick-keren"}&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return false;
    }

    function logout() {
        clearSession();
        window.location.href = "./login.html";
    }

    return {
        login,
        logout,
        getSession,
        isPlatformAdmin,
        isEventAdmin,
        requireAdmin,
        PLATFORM_CODE
    };
})();

window.AuthGuard = AuthGuard;
