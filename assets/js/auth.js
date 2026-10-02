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

    function getSessionStorage() {
        if (window.localStorage) return window.localStorage;
        if (typeof localStorage !== "undefined") return localStorage;
        if (window.sessionStorage) return window.sessionStorage;
        return sessionStorage;
    }

    function getStoredSession() {
        try {
            const storage = getSessionStorage();
            const sessionStorageValue = typeof sessionStorage !== "undefined"
                ? sessionStorage.getItem(SESSION_KEY)
                : null;
            return JSON.parse(storage.getItem(SESSION_KEY) || sessionStorageValue || "null");
        } catch {
            return null;
        }
    }

    function getSession() {
        const session = getStoredSession();
        return session?.expiresAt && Date.now() >= session.expiresAt ? null : session;
    }

    function setSession(data) {
        getSessionStorage().setItem(SESSION_KEY, JSON.stringify(data));
    }

    function clearSession() {
        getSessionStorage().removeItem(SESSION_KEY);
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    }

    function isPlatformAdmin() {
        const s = getSession();
        return s && s.role === "platform";
    }

    function isEventAdmin(eventId) {
        const s = getSession();
        return !!(s?.role === "platform" && s.accessToken && eventId);
    }

    function isGuestManager(eventId) {
        const s = getSession();
        return !!(s?.accessToken && (s.role === "platform"
            || ((s.role === "organizer" || s.role === "event") && s.eventId === eventId)));
    }

    async function requestAuth(path, body, accessToken = "") {
        const config = getSupabaseConfig();
        const response = await fetch(`${config.url}/auth/v1/${path}`, {
            method: "POST",
            headers: {
                apikey: config.anonKey,
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error_description || data.msg || "Connexion Supabase impossible.");
            error.code = data.error_code;
            throw error;
        }
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

    async function canManageGuests(accessToken, eventId) {
        if (!eventId) return false;
        const config = getSupabaseConfig();
        const headers = {
            apikey: config.anonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        };
        const body = JSON.stringify({ p_event_id: eventId });
        const response = await fetch(`${config.url}/rest/v1/rpc/can_manage_guests`, {
            method: "POST",
            headers,
            body
        });
        if (response.status === 404) {
            // Une base pas encore migree conserve l'acces des comptes email existants.
            const legacy = await fetch(`${config.url}/rest/v1/rpc/can_manage_event`, {
                method: "POST", headers, body
            });
            return legacy.ok && (await legacy.json().catch(() => false)) === true;
        }
        return response.ok && (await response.json().catch(() => false)) === true;
    }

    async function loginWithPassword(identifier, password, eventId) {
        if (!isSupabaseEnabled()) throw new Error("Supabase Auth n'est pas configuré.");
        const isEmail = identifier.includes("@");
        const phone = isEmail ? "" : window.OrganizerIdentity.normalizePhone(identifier);
        const credential = { email: isEmail ? identifier.trim() : window.OrganizerIdentity.emailFromPhone(identifier) };
        let auth;
        try {
            auth = await requestAuth("token?grant_type=password", { ...credential, password });
        } catch (error) {
            if (error.code === "invalid_credentials") {
                throw new Error(isEmail
                    ? "Email ou mot de passe incorrect."
                    : "Numéro ou mot de passe incorrect. Pour un ancien compte, faites réenregistrer l'accès par l'administrateur.");
            }
            throw error;
        }
        const user = auth.user;
        if (!user?.id || !auth.access_token) throw new Error("Session Supabase invalide.");

        const profile = await getProfile(auth.access_token, user.id);
        const platformAdmin = profile?.role === "platform";
        const guestManager = !platformAdmin && await canManageGuests(auth.access_token, eventId);
        if (!platformAdmin && !guestManager) {
            throw new Error("Ce compte n'est pas autorisé pour cet événement.");
        }

        const session = {
            role: platformAdmin ? "platform" : "organizer",
            eventId: platformAdmin ? null : eventId,
            userId: user.id,
            email: user.email || (isEmail ? identifier : ""),
            phone: isEmail ? (user.phone || "") : phone,
            accessToken: auth.access_token,
            refreshToken: auth.refresh_token || "",
            expiresAt: auth.expires_in ? Date.now() + auth.expires_in * 1000 : 0,
            at: Date.now()
        };
        setSession(session);
        return { ok: true, role: session.role, session };
    }

    async function refreshSession() {
        const previous = getStoredSession();
        if (!previous || !previous.refreshToken || !isSupabaseEnabled()) return getSession();

        // A session still valid for more than one minute does not need a network call.
        if (previous.expiresAt && Date.now() < previous.expiresAt - 60_000) return previous;

        try {
            const auth = await requestAuth("token?grant_type=refresh_token", {
                refresh_token: previous.refreshToken
            });
            const user = auth.user || {};
            if (!auth.access_token || !(user.id || previous.userId)) {
                throw new Error("Session Supabase invalide.");
            }

            const userId = user.id || previous.userId;
            const profile = await getProfile(auth.access_token, userId);
            const platformAdmin = profile?.role === "platform";
            const eventId = platformAdmin ? null : previous.eventId;
            const guestManager = !platformAdmin && eventId
                ? await canManageGuests(auth.access_token, eventId)
                : false;
            if (!platformAdmin && !guestManager) {
                throw new Error("Ce compte n'est plus autorisé pour cet événement.");
            }

            const expiresAt = auth.expires_at
                ? Number(auth.expires_at) * 1000
                : Date.now() + (Number(auth.expires_in) || 3600) * 1000;
            const refreshed = {
                ...previous,
                role: platformAdmin ? "platform" : "organizer",
                eventId,
                userId,
                email: user.email || previous.email || "",
                phone: user.phone || previous.phone || "",
                accessToken: auth.access_token,
                refreshToken: auth.refresh_token || previous.refreshToken,
                expiresAt,
                at: Date.now()
            };
            setSession(refreshed);
            return refreshed;
        } catch (error) {
            console.warn("AuthGuard: renouvellement de session impossible", error);
            clearSession();
            return null;
        }
    }

    function requireAdmin(eventId) {
        if (isEventAdmin(eventId)) return true;
        const params = new URLSearchParams(window.location.search);
        window.location.href = `./login.html?event=${eventId || params.get("event") || "demo"}&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return false;
    }

    function requireGuestManager(eventId) {
        if (isGuestManager(eventId)) return true;
        const params = new URLSearchParams(window.location.search);
        window.location.href = `./login.html?event=${encodeURIComponent(eventId || params.get("event") || "demo")}&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
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
        refreshSession,
        logout,
        getSession,
        isPlatformAdmin,
        isEventAdmin,
        isGuestManager,
        requireAdmin,
        requireGuestManager,
        isSupabaseEnabled
    };
})();

window.AuthGuard = AuthGuard;
