/** Attribution d'un compte organisateur par numero, avec email Auth interne. */
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABAS_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_SECRET;
const { normalizePhone, emailFromPhone: organizerEmail } = require("../assets/js/organizer-identity.js");

function send(response, status, data) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(status).json(data);
}

async function supabase(path, { method = "GET", token, body, prefer } = {}) {
    const isServiceKey = token === SUPABASE_SERVICE_ROLE_KEY;
    const result = await fetch(`${SUPABASE_URL}${path}`, {
        method,
        headers: {
            apikey: token === SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY,
            ...(!isServiceKey || !token.startsWith("sb_secret_") ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(prefer ? { Prefer: prefer } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    const raw = await result.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw }; }
    if (!result.ok) {
        const error = new Error(data?.msg || data?.message || data?.error_description || "Service Supabase indisponible.");
        error.status = result.status;
        throw error;
    }
    return data;
}

async function isPlatformAdmin(accessToken) {
    const user = await supabase("/auth/v1/user", { token: accessToken });
    if (!user?.id) return false;
    return await supabase("/rest/v1/rpc/is_platform_admin", {
        method: "POST", token: accessToken, body: {}
    }) === true;
}

async function getAssignment(eventId) {
    const rows = await supabase(
        `/rest/v1/event_guest_managers?event_id=eq.${encodeURIComponent(eventId)}&select=event_id,user_id,phone&limit=1`,
        { token: SUPABASE_SERVICE_ROLE_KEY }
    );
    return rows?.[0] || null;
}

async function getAssignmentByPhone(phone) {
    const rows = await supabase(
        `/rest/v1/event_guest_managers?phone=eq.${encodeURIComponent(phone)}&select=event_id&limit=1`,
        { token: SUPABASE_SERVICE_ROLE_KEY }
    );
    return rows?.[0] || null;
}

async function eventExists(eventId) {
    const rows = await supabase(
        `/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`,
        { token: SUPABASE_SERVICE_ROLE_KEY }
    );
    return !!rows?.[0];
}

async function assign(eventId, phone, password) {
    const existing = await getAssignment(eventId);
    if (existing?.phone === phone) {
        // Migre aussi les anciens comptes Phone sans changer leur identifiant RLS.
        await supabase(`/auth/v1/admin/users/${encodeURIComponent(existing.user_id)}`, {
            method: "PUT", token: SUPABASE_SERVICE_ROLE_KEY,
            body: { email: organizerEmail(phone), email_confirm: true, ...(password ? { password } : {}) }
        });
        return { phone, updated: !!password };
    }
    if (!password) throw Object.assign(new Error("Un mot de passe est requis pour ce numéro."), { status: 400 });
    const assignedElsewhere = await getAssignmentByPhone(phone);
    if (assignedElsewhere && assignedElsewhere.event_id !== eventId) {
        throw Object.assign(new Error("Ce numéro est déjà attribué à un autre événement."), { status: 409 });
    }

    // Un numero nouveau obtient une identite propre a cet evenement. L'ancien
    // compte perd aussitot ses droits des que la ligne est remplacee.
    const created = await supabase("/auth/v1/admin/users", {
        method: "POST", token: SUPABASE_SERVICE_ROLE_KEY,
        body: { email: organizerEmail(phone), password, email_confirm: true }
    });
    const userId = created?.id || created?.user?.id;
    if (!userId) throw new Error("Supabase n'a pas confirmé la création du compte.");
    try {
        await supabase("/rest/v1/event_guest_managers?on_conflict=event_id", {
            method: "POST", token: SUPABASE_SERVICE_ROLE_KEY,
            prefer: "resolution=merge-duplicates,return=representation",
            body: { event_id: eventId, user_id: userId, phone, updated_at: new Date().toISOString() }
        });
    } catch (error) {
        await supabase(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
            method: "DELETE", token: SUPABASE_SERVICE_ROLE_KEY
        }).catch(() => {});
        throw error;
    }
    if (existing?.user_id) {
        await supabase(`/auth/v1/admin/users/${encodeURIComponent(existing.user_id)}`, {
            method: "DELETE", token: SUPABASE_SERVICE_ROLE_KEY
        }).catch(() => {});
    }
    return { phone, updated: true };
}

async function handler(request, response) {
    if (!["GET", "PUT"].includes(request.method)) {
        response.setHeader("Allow", "GET, PUT");
        return send(response, 405, { error: "Méthode non autorisée." });
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
        return send(response, 503, { error: "Attribution organisateur non configurée sur le serveur." });
    }
    const accessToken = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || "")?.[1];
    if (!accessToken) return send(response, 401, { error: "Connexion administrateur requise." });
    try {
        if (!await isPlatformAdmin(accessToken)) {
            return send(response, 403, { error: "Administrateur plateforme requis." });
        }
        let payload = request.method === "PUT" ? request.body || {} : {};
        if (typeof payload === "string") {
            try { payload = JSON.parse(payload); }
            catch { return send(response, 400, { error: "Données invalides." }); }
        }
        const queryEvent = new URL(request.url, "https://local.invalid").searchParams.get("event");
        const eventId = String(payload.eventId || queryEvent || "").trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventId)) {
            return send(response, 400, { error: "Événement invalide." });
        }
        if (!await eventExists(eventId)) return send(response, 404, { error: "Événement introuvable." });
        if (request.method === "GET") {
            const assignment = await getAssignment(eventId);
            return send(response, 200, { phone: assignment?.phone || "" });
        }
        const phone = normalizePhone(payload.phone);
        const password = String(payload.password || "");
        if (!phone) {
            return send(response, 400, { error: "Saisissez un numéro valide, par exemple 812 345 678 (+243 par défaut)." });
        }
        if (password && (password.length < 12 || password.length > 128)) {
            return send(response, 400, { error: "Le mot de passe doit contenir entre 12 et 128 caractères." });
        }
        return send(response, 200, await assign(eventId, phone, password));
    } catch (error) {
        console.error("Organizer assignment failed", error.status || 500, error.message);
        const status = error.status === 400 || error.status === 409 ? error.status : 502;
        return send(response, status, { error: status === 409
            ? "Ce numéro est déjà utilisé par un autre compte."
            : status === 400 ? error.message : "Attribution impossible. Vérifiez le numéro et la configuration Supabase." });
    }
}

module.exports = handler;
