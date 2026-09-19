const CACHE = "invitation-v58";

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

    const isPage = url.pathname.endsWith(".html")
        || url.pathname.endsWith("/")
        || !url.pathname.split("/").pop().includes(".");

    const refresh = () => fetch(e.request).then((response) => {
        if (response && response.ok) {
            caches.open(CACHE).then((cache) => cache.put(e.request, response.clone()));
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
        caches.match(e.request).then((cached) => {
            if (cached) {
                e.waitUntil(refresh().catch(() => undefined));
                return cached;
            }
            return refresh().catch(() => new Response("Ressource indisponible", { status: 503 }));
        })
    );
});
