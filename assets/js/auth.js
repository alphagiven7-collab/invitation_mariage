/**
 * Authentification administrateur Supabase Auth.
 * Les anciens codes locaux ne constituent pas une autorisation cloud.
 */
const AuthGuard = (() => {
    const SESSION_KEY = "wedding_admin_session";

    function getSupabaseConfig() {
        return window.SUPABASE_CONFIG || { enabled: false, url: "", anonKey: "" };
    }

    function isSupabaseEnabled() {
        const config = getSupabaseConfig();
        return !!(config.enabled && config.url && config.anonKey);
    }

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
        return s.role === "event" && s.eventId === eventId && !!s.accessToken;
    }

    async function requestAuth(path, body, accessToken = "") {
        const config = getSupabaseConfig();
        const response = await fetch(`${config.url}/auth/v1/${path}`, {
            method: "POST",
            headers: {
                apikey: config.anonKey,
                Authorization: `Bearer ${accessToken || config.anonKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error_description || data.msg || "Connexion Supabase impossible.");
        return data;
    }

    async function getProfile(accessToken, userId) {
        const config = getSupabaseConfig();
        const response = await fetch(
            `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
            {
                headers: {
                    apikey: config.anonKey,
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
        if (!response.ok) return null;
        const rows = await response.json().catch(() => []);
        return Array.isArray(rows) ? rows[0] || null : null;
    }

    async function ownsEvent(accessToken, userId, eventId) {
        if (!eventId) return false;
        const config = getSupabaseConfig();
        const response = await fetch(
            `${config.url}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
            {
                headers: {
                    apikey: config.anonKey,
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
        if (!response.ok) return false;
        const rows = await response.json().catch(() => []);
        return Array.isArray(rows) && rows.length > 0;
    }

    async function loginWithPassword(email, password, eventId) {
        if (!isSupabaseEnabled()) throw new Error("Supabase Auth n'est pas configuré.");
        const auth = await requestAuth("token?grant_type=password", { email, password });
        const user = auth.user;
        if (!user?.id || !auth.access_token) throw new Error("Session Supabase invalide.");

        const profile = await getProfile(auth.access_token, user.id);
        const platformAdmin = profile?.role === "platform";
        const eventAdmin = !platformAdmin && await ownsEvent(auth.access_token, user.id, eventId);
        if (!platformAdmin && !eventAdmin) {
            throw new Error("Ce compte n'est pas autorisé pour cet événement.");
        }

        const session = {
            role: platformAdmin ? "platform" : "event",
            eventId: platformAdmin ? null : eventId,
            userId: user.id,
            email: user.email || email,
            accessToken: auth.access_token,
            refreshToken: auth.refresh_token || "",
            expiresAt: auth.expires_in ? Date.now() + auth.expires_in * 1000 : 0,
            at: Date.now()
        };
        setSession(session);
        return { ok: true, role: session.role, session };
    }

    function requireAdmin(eventId) {
        if (isEventAdmin(eventId)) return true;
        const params = new URLSearchParams(window.location.search);
        window.location.href = `./login.html?event=${eventId || params.get("event") || "yanick-keren"}&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return false;
    }

    function logout() {
        const session = getSession();
        clearSession();
        if (session?.accessToken && isSupabaseEnabled()) {
            requestAuth("logout", {}, session.accessToken).catch(() => {});
        }
        window.location.href = "./login.html";
    }

    return {
        loginWithPassword,
        logout,
        getSession,
        isPlatformAdmin,
        isEventAdmin,
        requireAdmin,
        isSupabaseEnabled
    };
})();

window.AuthGuard = AuthGuard;
