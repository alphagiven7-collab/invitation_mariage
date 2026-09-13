const CACHE = "invitation-v51";

self.addEventListener("install", (e) => {
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;

    const url = new URL(e.request.url);
    
    // Pour les pages HTML : toujours réseau, avec fallback cache
    if (url.pathname.endsWith(".html") || url.pathname.endsWith("/") || !url.pathname.split("/").pop().includes(".")) {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Pour tout le reste (JS, CSS, images, JSON) : réseau d'abord
    e.respondWith(
        fetch(e.request)
            .then((res) => {
                if (res && res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, clone));
                }
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});