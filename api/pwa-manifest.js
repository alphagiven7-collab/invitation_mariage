const { createHash } = require("node:crypto");

function readContext(request) {
    const url = new URL(request.url, "https://manifest.invalid");
    const mode = url.searchParams.get("mode");
    const eventId = (url.searchParams.get("event") || "").trim().toLowerCase();
    const token = (url.searchParams.get("t") || "").trim();
    if (!["organizer", "invitation"].includes(mode)) return null;
    if (!/^[a-z0-9][a-z0-9_-]{0,159}$/.test(eventId)) return null;
    if (token && !/^[a-zA-Z0-9_-]{1,256}$/.test(token)) return null;
    if (["mode", "event", "t"].some(key => url.searchParams.getAll(key).length > 1)) return null;
    return { mode, eventId, token: mode === "invitation" ? token : "" };
}

function buildManifest({ mode, eventId, token }) {
    const organizer = mode === "organizer";
    const params = new URLSearchParams({ event: eventId });
    if (!organizer && token) params.set("t", token);
    const invitationId = createHash("sha256").update(JSON.stringify([eventId, token])).digest("hex");
    return {
        id: organizer ? `/pwa/organizer/${encodeURIComponent(eventId)}` : `/pwa/invitation/${invitationId}`,
        name: organizer ? "Michelline — Organisation" : "Michelline — Mon invitation",
        short_name: organizer ? "Organisation" : "Mon invitation",
        description: organizer ? "Votre espace pour organiser votre événement." : "Retrouvez votre invitation et votre carte d’accès.",
        lang: "fr",
        start_url: `/pages/${organizer ? "admin" : "invitation"}.html?${params}`,
        scope: "/",
        display: "standalone",
        background_color: "#fffaf7",
        theme_color: "#5c1830",
        prefer_related_applications: false,
        icons: [
            { src: "/assets/images/pwa-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/assets/images/pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/assets/images/pwa-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
    };
}

module.exports = (request, response) => {
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("CDN-Cache-Control", "no-store");
    response.setHeader("Vercel-CDN-Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(request.method || "GET")) {
        response.setHeader("Allow", "GET, HEAD");
        response.statusCode = 405;
        return response.end();
    }
    const context = readContext(request);
    if (!context) {
        response.statusCode = 400;
        return response.end();
    }
    response.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    response.statusCode = 200;
    return response.end(request.method === "HEAD" ? undefined : JSON.stringify(buildManifest(context)));
};
