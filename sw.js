const CACHE = "invitation-v1";
const ASSETS = [
    "./pages/invitation.html",
    "./assets/css/app.css",
    "./assets/js/app.js"
];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
    self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
    e.respondWith(
        caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
    );
});
