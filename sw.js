const CACHE = "invitation-v62";

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

    // Supabase et les autres services distants ne doivent jamais être mis en cache.
    if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

    // Safari charge les médias par plages d’octets. Laisser le serveur répondre en 206.
    if (e.request.headers.has('range') || ['audio', 'video'].includes(e.request.destination)
        || /\.(?:mp3|m4a|aac|ogg|wav|mp4|webm)$/i.test(url.pathname)) return;

    const isPage = url.pathname.endsWith(".html")
        || url.pathname.endsWith("/")
        || !url.pathname.split("/").pop().includes(".");

    const refresh = () => fetch(e.request).then((response) => {
        if (response && response.status === 200) {
            const copy = response.clone();
            e.waitUntil(caches.open(CACHE).then((cache) => cache.put(e.request, copy)).catch(() => undefined));
        }
        return response;
    });

    // Les pages doivent refléter immédiatement les changements publiés.
    if (isPage) {
        e.respondWith(
            refresh().catch(() =>
                caches.match(e.request).then((cached) =>
                    cached || new Response("Connexion indisponible", { status: 503 })
                )
            )
        );
        return;
    }

    // Les ressources versionnées sont immuables : servir le cache en priorité.
    e.respondWith(
        caches.match(e.request).catch(() => undefined).then((cached) => {
            if (cached) {
                if (!url.searchParams.has('v')) e.waitUntil(refresh().catch(() => undefined));
                return cached;
            }
            return refresh().catch(() => new Response("Ressource indisponible", { status: 503 }));
        })
    );
});
