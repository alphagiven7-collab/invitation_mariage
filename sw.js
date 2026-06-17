const CACHE = "invitation-v45";

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
    const isHtml =
        url.pathname.endsWith(".html") ||
        url.pathname.endsWith("/") ||
        !url.pathname.split("/").pop().includes(".");

    /* Pages HTML : toujours le réseau en priorité (évite ancienne version cachée) */
    if (isHtml) {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    const isStatic =
        url.pathname.includes("/assets/js/") ||
        url.pathname.includes("/assets/css/") ||
        url.pathname.includes("/assets/images/");

    if (!isStatic) return;

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
