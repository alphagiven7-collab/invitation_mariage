const fs = require("node:fs/promises");
const path = require("node:path");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://qotolnmwoceahrnldlbw.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_J0_MF6G6iptQfYY1nSeIvA_YFZ0r9BO";

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function replaceMeta(html, id, value) {
    const pattern = new RegExp(`(<meta[^>]+id="${id}"[^>]+content=")[^"]*(")`, "i");
    return html.replace(pattern, `$1${escapeHtml(value)}$2`);
}

function getShareImage(config) {
    return config.shareImage
        || config.branding?.ogShareImage
        || config.branding?.heroImage
        || config.heroImage
        || config.branding?.welcomeImage
        || config.welcomeImage
        || config.mapImage
        || "";
}

async function getEventConfig(eventId) {
    if (!eventId) return null;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_event_config`, {
        method: "POST",
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_event_id: eventId })
    });
    if (!response.ok) return null;
    return response.json();
}

module.exports = async (request, response) => {
    const template = await fs.readFile(path.join(process.cwd(), "pages", "invitation.html"), "utf8");
    const host = request.headers["x-forwarded-host"] || request.headers.host || "michelline-invitations.vercel.app";
    const protocol = request.headers["x-forwarded-proto"] || "https";
    const url = new URL(request.url, `${protocol}://${host}`);
    const eventId = (url.searchParams.get("event") || "").trim().toLowerCase();
    let html = template;

    try {
        const config = await getEventConfig(eventId);
        if (config?.title) {
            const image = getShareImage(config);
            const description = config.mainText || config.welcomeMessage || config.message || "Invitation à un événement.";
            html = html.replace("<title>Invitation</title>", `<title>${escapeHtml(config.title)}</title>`);
            html = replaceMeta(html, "meta-description", description);
            html = replaceMeta(html, "meta-og-title", config.title);
            html = replaceMeta(html, "meta-og-description", description);
            html = replaceMeta(html, "meta-twitter-title", config.title);
            html = replaceMeta(html, "meta-twitter-description", description);
            html = replaceMeta(html, "meta-og-url", url.href);
            if (image) {
                html = replaceMeta(html, "meta-og-image", image);
                html = replaceMeta(html, "meta-twitter-image", image);
                html = html.replace(
                    /(<meta property="og:image:secure_url" content=")[^"]*(")/i,
                    `$1${escapeHtml(image)}$2`
                );
            }
        }
    } catch (error) {
        console.warn("Invitation share metadata unavailable", error.message);
    }

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    response.status(200).send(html);
};