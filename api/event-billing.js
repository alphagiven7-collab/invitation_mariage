/** Suivi en USD, dans un bucket privé. Aucun montant dans la configuration publique. */
const BUCKET = "platform-event-billing";
const MAX_CENTS = 99999999900;
const GOAL_PATH = '_platform/goal.json';

function fail(status, message) { return Object.assign(new Error(message), { status }); }
function missing(error) {
    return error.status === 404 || ["NoSuchBucket", "NoSuchKey"].includes(error.code)
        || (error.status === 400 && /^(?:Bucket not found|Object not found|The resource was not found)$/i.test(error.message));
}

async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const send = (status, data) => res.status(status).json(data);
    if (!["GET", "PUT", "DELETE"].includes(req.method)) {
        res.setHeader("Allow", "GET, PUT, DELETE");
        return send(405, { error: "Méthode non autorisée." });
    }
    const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    const anon = process.env.SUPABASE_ANON_KEY;
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
        || process.env.SUPABAS_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_SECRET;
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "")?.[1];
    if (!token) return send(401, { error: "Connexion administrateur requise." });
    if (!url || !anon || !secret) return send(503, { error: "Le suivi des paiements n'est pas configuré sur le serveur." });

    async function call(path, { method = "GET", body, user = false, headers = {} } = {}) {
        const key = user ? anon : secret;
        const response = await fetch(`${url}${path}`, {
            method, cache: "no-store", signal: AbortSignal.timeout(15000),
            headers: {
                apikey: key,
                ...(user || !key.startsWith("sb_secret_") ? { Authorization: `Bearer ${user ? token : key}` } : {}),
                "Content-Type": "application/json", ...headers
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : null; } catch { throw fail(502, "Réponse du stockage illisible."); }
        if (!response.ok) throw Object.assign(fail(response.status, data?.message || data?.msg || "Service indisponible."), { code: data?.code || data?.error });
        return data;
    }

    async function privateBucket(create = false) {
        let bucket;
        try { bucket = await call(`/storage/v1/bucket/${BUCKET}`); }
        catch (error) {
            if (!missing(error)) throw error;
            if (!create) return false;
            try {
                await call("/storage/v1/bucket", { method: "POST", body: {
                    id: BUCKET, name: BUCKET, public: false,
                    file_size_limit: 16384, allowed_mime_types: ["application/json"]
                } });
            } catch (creationError) {
                if (creationError.status !== 409 && creationError.code !== "BucketAlreadyExists") throw creationError;
            }
            bucket = await call(`/storage/v1/bucket/${BUCKET}`);
        }
        if (bucket?.public !== false) throw fail(503, "Le stockage financier doit être privé. Contactez l'administrateur plateforme.");
        return true;
    }

    async function readPayment(event) {
        let data;
        try { data = await call(`/storage/v1/object/${BUCKET}/${encodeURIComponent(event.id)}/billing.json`); }
        catch (error) { if (missing(error)) return null; throw error; }
        // Une suppression puis une recréation avec le même slug ne réutilise pas les anciens montants.
        if (data?.eventCreatedAt !== event.created_at) return null;
        if (data.currency !== "USD" || !Number.isSafeInteger(data.totalCents) || !Number.isSafeInteger(data.receivedCents)
            || data.totalCents < 0 || data.receivedCents < 0) throw fail(502, "Données de paiement invalides.");
        return data;
    }

    try {
        let user;
        try {
            user = await call("/auth/v1/user", { user: true });
        } catch (error) { if ([401, 403].includes(error.status)) throw fail(401, "Votre session a expiré. Reconnectez-vous."); throw error; }
        if (!user?.id || await call("/rest/v1/rpc/is_platform_admin", { method: "POST", user: true, body: {} }) !== true) {
            return send(403, { error: "Administrateur plateforme requis." });
        }
        const params = new URL(req.url, "https://local.invalid").searchParams;
        if (params.get('resource') === 'goal') {
            if (req.method !== 'PUT') return send(405, { error: 'Utilisez PUT pour modifier l’objectif.' });
            let body = req.body;
            if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw fail(400, 'Données invalides.'); } }
            if (!body || !Number.isSafeInteger(body.targetCents) || body.targetCents <= 0 || body.targetCents > MAX_CENTS || body.currency !== 'USD') {
                throw fail(400, 'Saisissez un objectif supérieur à zéro en USD, avec deux décimales maximum.');
            }
            await privateBucket(true);
            const goal = { targetCents: body.targetCents, currency: 'USD', updatedAt: new Date().toISOString(), updatedBy: user.id };
            await call(`/storage/v1/object/${BUCKET}/${GOAL_PATH}`, {
                method: 'POST', body: goal, headers: { 'x-upsert': 'true', 'Cache-Control': 'max-age=0' }
            });
            return send(200, { goal });
        }
        const eventId = params.get("event");
        if (req.method !== "GET" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventId || "")) throw fail(400, "Événement invalide.");
        if (req.method === "DELETE") {
            if (await privateBucket()) await call(`/storage/v1/object/${BUCKET}`, {
                method: "DELETE", body: { prefixes: [`${eventId}/billing.json`] }
            });
            return send(200, { deleted: true });
        }
        if (req.method === "GET") {
            if (!await privateBucket()) return send(200, { payments: {}, goal: null });
            let goal = null;
            try { goal = await call(`/storage/v1/object/${BUCKET}/${GOAL_PATH}`); }
            catch (error) { if (!missing(error)) throw error; }
            if (goal && (goal.currency !== 'USD' || !Number.isSafeInteger(goal.targetCents) || goal.targetCents <= 0 || goal.targetCents > MAX_CENTS)) {
                throw fail(502, 'Objectif financier invalide.');
            }
            const events = [];
            for (let offset = 0; ; offset += 500) {
                const page = await call(`/rest/v1/events?select=id,created_at&order=id.asc&limit=500&offset=${offset}`);
                if (!Array.isArray(page)) throw fail(502, "Liste des événements indisponible.");
                events.push(...page);
                if (page.length < 500) break;
            }
            const payments = {};
            for (let i = 0; i < events.length; i += 6) {
                await Promise.all(events.slice(i, i + 6).map(async (event) => {
                    const payment = await readPayment(event);
                    if (payment) payments[event.id] = payment;
                }));
            }
            return send(200, { payments, goal });
        }
        let body = req.body;
        if (typeof body === "string") { try { body = JSON.parse(body); } catch { throw fail(400, "Données invalides."); } }
        if (!body || ![body.totalCents, body.receivedCents].every((amount) => Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_CENTS)
            || (body.currency && body.currency !== "USD") || typeof (body.note || "") !== "string" || (body.note || "").length > 500) {
            throw fail(400, "Saisissez des montants positifs en USD, avec deux décimales maximum, et une note de 500 caractères maximum.");
        }
        const events = await call(`/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=id,created_at&limit=1`);
        if (!events?.[0]) throw fail(404, "Événement introuvable.");
        await privateBucket(true);
        const payment = {
            eventId, eventCreatedAt: events[0].created_at, currency: "USD",
            totalCents: body.totalCents, receivedCents: body.receivedCents, note: (body.note || "").trim(),
            updatedAt: new Date().toISOString(), updatedBy: user.id
        };
        await call(`/storage/v1/object/${BUCKET}/${eventId}/billing.json`, {
            method: "POST", body: payment, headers: { "x-upsert": "true", "Cache-Control": "max-age=0" }
        });
        return send(200, { payment });
    } catch (error) {
        const status = [400, 401, 403, 404, 503].includes(error.status) ? error.status : 502;
        return send(status, { error: [400, 401, 404, 503].includes(status) ? error.message
            : "Impossible de lire ou d'enregistrer les paiements. Réessayez dans un instant." });
    }
}
module.exports = handler;
