/**
 * Authentification administrateur Supabase Auth.
 * Les anciens codes locaux ne constituent pas une autorisation cloud.
 */
const AuthGuard = (() => {
    const SESSION_KEY = "wedding_admin_session";
    const LOGOUT_KEY = "wedding_admin_signed_out_at";
    const VERIFY_TTL = 60_000;
    let memorySession = null;
    let verifiedSessionKey = "";
    let verifiedAt = 0;
    let sessionState = "unverified";
    let sessionRevision = 0;
    let pendingRefresh = null;
    let pendingRefreshForced = false;
    let locallySignedOut = false;

    function getSupabaseConfig() {
        return window.SUPABASE_CONFIG || { enabled: false, url: "", anonKey: "" };
    }

    function isSupabaseEnabled() {
        const config = getSupabaseConfig();
        return !!(config.enabled && config.url && config.anonKey);
    }

    function getStorageAdapters() {
        const adapters = [];
        for (const key of ["localStorage", "sessionStorage"]) {
            try {
                const storage = window[key] || (key === "localStorage"
                    ? (typeof localStorage !== "undefined" ? localStorage : null)
                    : (typeof sessionStorage !== "undefined" ? sessionStorage : null));
                if (storage && !adapters.includes(storage)) adapters.push(storage);
            } catch { /* Certains modes privés bloquent l'accès au stockage. */ }
        }
        return adapters;
    }

    function getLogoutTime() {
        let timestamp = 0;
        for (const storage of getStorageAdapters()) {
            try { timestamp = Math.max(timestamp, Number(storage.getItem(LOGOUT_KEY)) || 0); } catch {}
        }
        return timestamp;
    }

    function getStoredSession() {
        if (locallySignedOut) return null;
        const candidates = memorySession ? [memorySession] : [];
        const logoutAt = getLogoutTime();
        for (const storage of getStorageAdapters()) {
            try {
                const session = JSON.parse(storage.getItem(SESSION_KEY) || "null");
                if (session) candidates.push(session);
            } catch { /* Une autre copie, ou la mémoire, peut rester utilisable. */ }
        }
        return candidates.filter((session) => session && typeof session.accessToken === "string"
            && session.accessToken && (!logoutAt || Number(session.at) > logoutAt))
            .sort((left, right) => (Number(right.at) || 0) - (Number(left.at) || 0))[0] || null;
    }

    function sessionKey(session) {
        return session ? JSON.stringify([session.accessToken, session.refreshToken, session.userId, session.role, session.eventId]) : "";
    }

    function getSession() {
        const session = getStoredSession();
        if (!session || sessionState !== "authenticated" || sessionKey(session) !== verifiedSessionKey) return null;
        return !session.expiresAt || Date.now() >= session.expiresAt ? null : session;
    }

    function setSession(data) {
        locallySignedOut = false;
        const stored = { ...data, at: Math.max(Date.now(), getLogoutTime() + 1) };
        const adapters = getStorageAdapters();
        for (const storage of adapters) {
            try {
                storage.setItem(SESSION_KEY, JSON.stringify(stored));
                // Supprimer la copie historique pour ne pas restaurer un ancien token.
                for (const other of adapters) {
                    if (other !== storage) { try { other.removeItem(SESSION_KEY); } catch {} }
                }
                memorySession = null;
                return stored;
            } catch { /* Repli sessionStorage puis mémoire, sans stocker le mot de passe. */ }
        }
        memorySession = stored;
        return stored;
    }

    function clearSession() {
        const logoutAt = Math.max(Date.now(), (Number(getStoredSession()?.at) || 0) + 1);
        sessionRevision += 1;
        locallySignedOut = true;
        memorySession = null;
        verifiedSessionKey = "";
        verifiedAt = 0;
        sessionState = "signed-out";
        for (const storage of getStorageAdapters()) {
            try { storage.setItem(LOGOUT_KEY, String(logoutAt)); } catch {}
            try { storage.removeItem(SESSION_KEY); } catch {}
        }
        emitSignedOut();
    }

    function emitSignedOut() {
        if (window.dispatchEvent && typeof CustomEvent !== "undefined") {
            window.dispatchEvent(new CustomEvent("auth:signed-out"));
        }
    }

    function markVerified(session) {
        verifiedSessionKey = sessionKey(session);
        verifiedAt = Date.now();
        sessionState = "authenticated";
        return session;
    }

    function getSessionStatus() {
        if (getSession()) return "authenticated";
        if (!getStoredSession()) return "signed-out";
        return sessionState === "offline" ? "offline" : "unverified";
    }

    function getResumeUrl(session = getSession()) {
        if (!session || sessionKey(session) !== sessionKey(getSession())) return "/pages/login.html";
        return session.role === "platform" ? "/pages/evenements.html"
            : `/pages/admin.html?event=${encodeURIComponent(session.eventId)}`;
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

    function responseError(data, response) {
        const error = new Error(data.error_description || data.msg || data.message || "Vérification de connexion impossible.");
        error.code = data.error_code || data.code;
        error.status = response.status;
        error.sessionInvalid = [401, 403].includes(response.status);
        return error;
    }

    async function fetchAuth(url, options) {
        if (typeof AbortController === "undefined" || typeof setTimeout === "undefined") return fetch(url, options);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try { return await fetch(url, { ...options, signal: controller.signal }); }
        finally { clearTimeout(timeout); }
    }

    async function requestAuth(path, body, accessToken = "") {
        const config = getSupabaseConfig();
        const response = await fetchAuth(`${config.url}/auth/v1/${path}`, {
            method: "POST",
            headers: {
                apikey: config.anonKey,
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            ...(path === "logout" ? { keepalive: true } : {})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = responseError(data, response);
            if (path.includes("grant_type=refresh_token") && response.status === 400) error.sessionInvalid = true;
            throw error;
        }
        return data;
    }

    async function getProfile(accessToken, userId) {
        const config = getSupabaseConfig();
        const response = await fetchAuth(
            `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
            {
                headers: {
                    apikey: config.anonKey,
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
        if (!response.ok) throw responseError(await response.json().catch(() => ({})), response);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("Profil Supabase illisible.");
        return Array.isArray(rows) ? rows[0] || null : null;
    }

    async function getCurrentUser(accessToken) {
        const config = getSupabaseConfig();
        const response = await fetchAuth(`${config.url}/auth/v1/user`, {
            headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` }
        });
        const user = await response.json().catch(() => ({}));
        if (!response.ok) throw responseError(user, response);
        if (!user.id) throw new Error("Session Supabase illisible.");
        return user;
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
        const response = await fetchAuth(`${config.url}/rest/v1/rpc/can_manage_guests`, {
            method: "POST",
            headers,
            body
        });
        if (response.status === 404) {
            // Une base pas encore migree conserve l'acces des comptes email existants.
            const legacy = await fetchAuth(`${config.url}/rest/v1/rpc/can_manage_event`, {
                method: "POST", headers, body
            });
            if (!legacy.ok) throw responseError(await legacy.json().catch(() => ({})), legacy);
            return (await legacy.json()) === true;
        }
        if (!response.ok) throw responseError(await response.json().catch(() => ({})), response);
        return (await response.json()) === true;
    }

    async function authorizeSession(session, user) {
        if (session.userId && user.id !== session.userId) {
            throw Object.assign(new Error("L'identité de la session a changé."), { sessionInvalid: true });
        }
        const profile = await getProfile(session.accessToken, user.id);
        const platformAdmin = profile?.role === "platform";
        const eventId = platformAdmin ? null : session.eventId;
        if (!platformAdmin && !await canManageGuests(session.accessToken, eventId)) {
            throw Object.assign(new Error("Ce compte n'est plus autorisé pour cet événement."), { sessionInvalid: true });
        }
        return { ...session, role: platformAdmin ? "platform" : "organizer", eventId, userId: user.id,
            email: user.email || session.email || "", phone: user.phone || session.phone || "" };
    }

    async function loginWithPassword(identifier, password, eventId) {
        if (!isSupabaseEnabled()) throw new Error("Supabase Auth n'est pas configuré.");
        const revision = ++sessionRevision;
        verifiedSessionKey = "";
        sessionState = "unverified";
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
            expiresAt: auth.expires_at ? Number(auth.expires_at) * 1000 : Date.now() + (Number(auth.expires_in) || 3600) * 1000,
            at: Date.now()
        };
        if (revision !== sessionRevision) throw new Error("Connexion interrompue. Réessayez.");
        const stored = setSession(session);
        markVerified(stored);
        return { ok: true, role: stored.role, session: stored };
    }

    async function verifyStoredSession({ force = false, requestedToken } = {}) {
        let previous = getStoredSession();
        if (!previous || !isSupabaseEnabled()) return null;
        const revision = sessionRevision;
        let expectedKey = sessionKey(previous);
        const isCurrent = () => revision === sessionRevision && expectedKey === sessionKey(getStoredSession());
        try {
            let user;
            const needsRefresh = !previous.expiresAt || Date.now() >= previous.expiresAt - 60_000
                || (force && previous.refreshToken && previous.refreshToken === requestedToken);
            if (!needsRefresh) {
                try { user = await getCurrentUser(previous.accessToken); }
                catch (error) {
                    if (!error.sessionInvalid || !previous.refreshToken) throw error;
                }
            }
            if (!user) {
                if (!previous.refreshToken) throw Object.assign(new Error("Session expirée."), { sessionInvalid: true });
                const auth = await requestAuth("token?grant_type=refresh_token", { refresh_token: previous.refreshToken });
                if (!isCurrent()) return null;
                if (!auth.access_token) throw new Error("Session Supabase illisible.");
                user = auth.user?.id ? auth.user : await getCurrentUser(auth.access_token);
                if (!isCurrent()) return null;
                // Conserver le nouveau refresh token même si la vérification des
                // droits échoue ensuite à cause d'une panne temporaire.
                previous = setSession({ ...previous, accessToken: auth.access_token,
                    refreshToken: auth.refresh_token || previous.refreshToken,
                    expiresAt: auth.expires_at ? Number(auth.expires_at) * 1000
                        : Date.now() + (Number(auth.expires_in) || 3600) * 1000 });
                expectedKey = sessionKey(previous);
            }
            const authorized = await authorizeSession(previous, user);
            if (!isCurrent()) return null;
            const stored = sessionKey(authorized) === sessionKey(previous) ? authorized : setSession(authorized);
            return markVerified(stored);
        } catch (error) {
            if (!isCurrent()) return null;
            if (error.sessionInvalid) clearSession();
            else {
                verifiedSessionKey = "";
                sessionState = "offline";
            }
            return null;
        }
    }

    function refreshSession(options = {}) {
        if (pendingRefresh) {
            if (options.force && !pendingRefreshForced) return pendingRefresh.then(() => refreshSession(options));
            return pendingRefresh;
        }
        const current = getSession();
        if (!options.force && current && Date.now() < verifiedAt + VERIFY_TTL
            && Date.now() < current.expiresAt - 60_000) return Promise.resolve(current);
        const requestedToken = getStoredSession()?.refreshToken;
        const run = () => verifyStoredSession({ force: options.force === true, requestedToken });
        const locks = window.navigator?.locks;
        const task = locks?.request ? locks.request(`${SESSION_KEY}:refresh`, run) : run();
        const pending = Promise.resolve(task).catch(() => {
            verifiedSessionKey = "";
            sessionState = "offline";
            return null;
        }).finally(() => {
            if (pendingRefresh === pending) { pendingRefresh = null; pendingRefreshForced = false; }
        });
        pendingRefreshForced = options.force === true;
        pendingRefresh = pending;
        return pending;
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
        const session = getStoredSession();
        clearSession();
        if (session?.accessToken && isSupabaseEnabled()) {
            requestAuth("logout", {}, session.accessToken).catch(() => {});
        }
        window.location.href = "./login.html";
    }

    window.addEventListener?.("storage", (event) => {
        if (event.key !== SESSION_KEY && event.key !== LOGOUT_KEY) return;
        sessionRevision += 1;
        locallySignedOut = false;
        verifiedSessionKey = "";
        memorySession = null;
        sessionState = "unverified";
        if (!getStoredSession()) {
            sessionState = "signed-out";
            emitSignedOut();
        } else {
            // Revalider le token remplacé dans un autre onglet, sans le renouveler.
            if (pendingRefresh) void pendingRefresh.then(() => refreshSession());
            else void refreshSession();
        }
    });

    return {
        loginWithPassword,
        refreshSession,
        logout,
        getSession,
        getSessionStatus,
        getResumeUrl,
        isPlatformAdmin,
        isEventAdmin,
        isGuestManager,
        requireAdmin,
        requireGuestManager,
        isSupabaseEnabled
    };
})();

window.AuthGuard = AuthGuard;
