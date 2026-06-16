const CACHE = "invitation-v16";
const PRECACHE = [
    "./assets/css/app.css"
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);
    const isAppAsset = url.pathname.includes("/assets/js/") ||
        url.pathname.includes("/pages/") ||
        url.pathname.endsWith("invitation.html");

    if (e.request.method !== "GET" || !isAppAsset) return;

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
