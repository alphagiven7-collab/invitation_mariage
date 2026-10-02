const CACHE = "invitation-v63";
// Une invitation préparée garde ensemble son HTML et ses dépendances, y compris
// après une mise à jour du worker. Aucune réponse d'API n'entre dans ce cache.
const OFFLINE_CACHE = "wedding-saved-invitations-v1";

async function matchCached(request, canonical = null) {
    // CacheStorage.match searches by cache creation order. A prepared copy may
    // predate this worker, so explicitly prefer resources refreshed by it.
    for (const name of [CACHE, OFFLINE_CACHE]) {
        try {
            const cache = await caches.open(name);
            const exact = await cache.match(request);
            if (exact) return exact;
            const normalized = canonical ? await cache.match(canonical) : null;
            if (normalized) return normalized;
        } catch {}
    }
    return null;
}

function invitationUrl(value) {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || url.pathname !== '/pages/invitation.html') return null;
    const eventId = (url.searchParams.get('event') || '').trim().toLowerCase();
    if (!eventId || url.searchParams.has('preview') || url.searchParams.has('print')) return null;
    const canonical = new URL('/pages/invitation.html', self.location.origin);
    canonical.searchParams.set('event', eventId);
    const token = (url.searchParams.get('t') || '').trim();
    if (token) canonical.searchParams.set('t', token);
    return canonical.href;
}

function organizerUrl(value) {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || url.pathname !== '/pages/admin.html') return null;
    const id = (url.searchParams.get('event') || '').trim().toLowerCase();
    if (!id) return null;
    const canonical = new URL('/pages/admin.html', self.location.origin);
    canonical.searchParams.set('event', id);
    return canonical.href;
}

function publicAsset(url) {
    if (url.origin === self.location.origin) {
        return url.pathname.startsWith('/assets/') && /\.(?:js|css|png|jpe?g|webp|svg|gif|ico|woff2?)$/i.test(url.pathname);
    }
    return url.protocol === 'https:' && (
        ['fonts.googleapis.com', 'fonts.gstatic.com', 'images.unsplash.com'].includes(url.hostname)
        || (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/'))
    );
}

self.addEventListener('message', (event) => {
    const data = event.data || {};
    const sourcePage = event.source?.url;
    if (!sourcePage || new URL(sourcePage).origin !== self.location.origin) return;
    if (data.type === 'PREPARE_INVITATION' || data.type === 'PREPARE_ORGANIZER') {
        const canonical = data.type === 'PREPARE_ORGANIZER' ? organizerUrl : invitationUrl;
        const page = canonical(sourcePage);
        if (!page || page !== canonical(data.pageUrl)) return;
        event.waitUntil((async () => {
            try {
                const cache = await caches.open(OFFLINE_CACHE);
                const required = [...new Set([page, ...(data.required || [])])].slice(0, 90);
                const optional = [...new Set(data.optional || [])].slice(0, 80);
                let pageResponse = null;
                const store = async (value, essential) => {
                    const url = new URL(value, self.location.origin);
                    if (url.href !== page && !publicAsset(url)) {
                        if (essential) throw new Error('Ressource non autorisée');
                        return;
                    }
                    const response = await fetch(url.href, { credentials: url.origin === self.location.origin ? 'same-origin' : 'omit', cache: 'reload' });
                    if (!response.ok || response.redirected) throw new Error('Ressource indisponible');
                    if (url.href === page) pageResponse = response;
                    else await cache.put(url.href, response);
                };
                // Petits lots pour ne pas saturer les téléphones et connexions mobiles.
                for (let i = 0; i < required.length; i += 5) {
                    await Promise.all(required.slice(i, i + 5).map((url) => store(url, true)));
                }
                // Ne remplacer la page préparée qu'une fois ses dépendances
                // disponibles : une préparation interrompue conserve l'ancienne.
                if (pageResponse) await cache.put(page, pageResponse);
                for (let i = 0; i < optional.length; i += 5) {
                    await Promise.all(optional.slice(i, i + 5).map((url) => store(url, false).catch(() => undefined)));
                }
                event.ports?.[0]?.postMessage({ ok: true });
            } catch {
                event.ports?.[0]?.postMessage({ ok: false });
            }
        })());
    }
    if (data.type === 'FORGET_INVITATION') {
        const current = invitationUrl(sourcePage);
        if (!current) return;
        const currentUrl = new URL(current);
        event.waitUntil((async () => {
            for (const name of [CACHE, OFFLINE_CACHE]) {
                const cache = await caches.open(name);
                for (const request of await cache.keys()) {
                    const candidate = invitationUrl(request.url);
                    if (!candidate) continue;
                    const sameEvent = new URL(candidate).searchParams.get('event') === currentUrl.searchParams.get('event');
                    if (candidate === current || (data.scope === 'event' && sameEvent)) await cache.delete(request);
                }
            }
        })());
    }
});

self.addEventListener("install", (e) => {
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys
                .filter((key) => key.startsWith("invitation-") && key !== CACHE)
                .map((key) => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;

    const url = new URL(e.request.url);

    // API et sessions toujours réseau. Seuls des fichiers publics externes sont
    // éligibles, pas les RPC, données administrateur ni liens Storage signés.
    if (url.pathname.startsWith("/api/") || (url.origin !== self.location.origin && !publicAsset(url))) return;

    // Safari charge les médias par plages d’octets. Laisser le serveur répondre en 206.
    if (e.request.headers.has('range') || ['audio', 'video'].includes(e.request.destination)
        || /\.(?:mp3|m4a|aac|ogg|wav|mp4|webm)$/i.test(url.pathname)) return;

    const isPage = url.pathname.endsWith(".html")
        || url.pathname.endsWith("/")
        || !url.pathname.split("/").pop().includes(".");

    const refresh = () => fetch(e.request).then((response) => {
        if (response && response.status === 200 && !response.redirected) {
            const copy = response.clone();
            e.waitUntil(caches.open(CACHE).then((cache) => cache.put(e.request, copy)).catch(() => undefined));
        }
        return response;
    });

    // Les pages doivent refléter immédiatement les changements publiés.
    if (isPage) {
        e.respondWith(
            refresh().catch(async () => {
                const personalPage = invitationUrl(e.request.url) || organizerUrl(e.request.url);
                // Conserver event ET token : jamais de repli vers une autre invitation.
                const saved = await matchCached(e.request, personalPage);
                return saved || new Response("Connexion indisponible. Ouvrez d’abord cette page avec Internet pour l’enregistrer sur cet appareil.", { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            })
        );
        return;
    }

    // Les ressources versionnées sont immuables : servir le cache en priorité.
    e.respondWith(
        matchCached(e.request).then((cached) => {
            if (cached) {
                if (!url.searchParams.has('v')) e.waitUntil(refresh().catch(() => undefined));
                return cached;
            }
            return refresh().catch(() => new Response("Ressource indisponible", { status: 503 }));
        })
    );
});
