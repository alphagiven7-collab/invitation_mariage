/**
 * Charge la configuration d'un événement via ?event=slug
 * Fusionne avec les overrides localStorage (personnalisation)
 */
const EventConfig = (() => {
    const DEFAULT_EVENT = "demo";
    const BUILTIN_EVENTS = [
        { id: "demo", slug: "demo", title: "Démo Michelline", type: "wedding" },
        { id: "anniversaire-grace", slug: "anniversaire-grace", title: "Anniversaire de Grace", type: "birthday" },
        { id: "conference-tech-2026", slug: "conference-tech-2026", title: "Conférence Tech Kinshasa 2026", type: "conference" }
    ];
    let eventId = DEFAULT_EVENT;
    let config = null;
    let ready = false;

    function getEventId() {
        const params = new URLSearchParams(window.location.search);
        return (params.get("event") || DEFAULT_EVENT).trim().toLowerCase();
    }

    function storageKey(suffix) {
        return `wedding_event_${eventId}_${suffix}`;
    }

    function deepMerge(base, patch) {
        const out = { ...base };
        Object.keys(patch || {}).forEach((key) => {
            if (patch[key] && typeof patch[key] === "object" && !Array.isArray(patch[key])) {
                out[key] = deepMerge(base[key] || {}, patch[key]);
            } else {
                out[key] = patch[key];
            }
        });
        return out;
    }

    function getCustomEvents() {
        try {
            return JSON.parse(localStorage.getItem("wedding_custom_events") || "[]");
        } catch {
            return [];
        }
    }

    function getRegisteredEvents() {
        return [...BUILTIN_EVENTS];
    }

    function createEvent(data) {
        if (!data || !data.title) throw new Error("Le titre de l'événement est requis.");
        const rawSlug = (data.slug || data.title)
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        const slug = rawSlug || `event-${Date.now()}`;
        const adminCode = (data.adminCode || `${slug.toUpperCase().slice(0, 12)}-2026`).replace(/\s+/g, "-");
        const isBuiltIn = BUILTIN_EVENTS.some((event) => event.slug === slug);
        if (isBuiltIn) {
            throw new Error("Cet identifiant est réservé à une démo existante. Choisissez un autre slug.");
        }

        const newEvent = {
            id: slug,
            slug: slug,
            type: data.type || "wedding",
            title: data.title,
            subtitle: data.subtitle || (data.coupleLeft && data.coupleRight ? `${data.coupleLeft} & ${data.coupleRight}` : data.title),
            coupleLeft: data.coupleLeft || "",
            coupleRight: data.coupleRight || "",
            welcomeMessage: data.welcomeMessage || "Avec amour et joie, nous vous ouvrons cette enveloppe de bonheur.",
            mainText: data.mainText || "Rejoignez-nous pour célébrer cet événement unique.",
            eventDate: data.eventDate || new Date(Date.now() + 30 * 86400000).toISOString(),
            venue: data.venue || "Kinshasa",
            rsvpDeadline: data.rsvpDeadline || new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
            adminCode: adminCode,
            branding: {
                primaryColor: data.primaryColor || "#5c1830",
                accentColor: data.accentColor || "#ec4899",
                welcomeImage: data.welcomeImage || "",
                heroImage: data.heroImage || ""
            },
            sections: {
                quiz: true,
                donation: true,
                guestbook: true,
                gallery: true,
                countdown: true,
                dressCode: true
            },
            createdAt: new Date().toISOString()
        };

        return newEvent;
    }

    async function publishEvent(event) {
        if (!window.CloudAPI || typeof CloudAPI.createEvent !== "function") {
            return { cloud: false, reason: "cloud_unavailable" };
        }
        return CloudAPI.createEvent(event);
    }

    function discardLocalEvent(slug) {
        const normalizedSlug = String(slug || "").trim().toLowerCase();
        if (!normalizedSlug || BUILTIN_EVENTS.some((event) => event.slug === normalizedSlug)) return false;

        const customs = getCustomEvents();
        const remaining = customs.filter((event) => event && event.slug !== normalizedSlug);
        if (remaining.length === customs.length) return false;

        localStorage.setItem("wedding_custom_events", JSON.stringify(remaining));
        ["config", "settings", "dashboard_state"].forEach((suffix) => {
            localStorage.removeItem(`wedding_event_${normalizedSlug}_${suffix}`);
        });
        return true;
    }

    async function fetchEventJson(slug) {
        if (window.DjangoAPI && DjangoAPI.isEnabled()) {
            try {
                return await DjangoAPI.fetchEvent(slug);
            } catch (err) {
                console.warn("EventConfig: Django API indisponible, repli JSON local.", err);
            }
        }

        const isBuiltIn = BUILTIN_EVENTS.some((event) => event.slug === slug);

        // Le JSON versionné fournit les valeurs de départ de la démo.
        let fileConfig = null;
        try {
            const res = await fetch(`../events/${slug}.json`, { cache: "no-store" });
            if (res.ok) fileConfig = await res.json();
        } catch (e) {
            /* ignore network/fetch error */
        }

        // Les réglages sauvegardés sont publics en lecture uniquement via RPC.
        // Cette étape est indispensable pour les visiteurs anonymes, bloqués par RLS
        // sur la table event_settings elle-même.
        if (window.CloudAPI && typeof CloudAPI.getPublicEventConfig === "function" && CloudAPI.isEnabled()) {
            try {
                const cloudSettings = await CloudAPI.getPublicEventConfig(slug);
                if (cloudSettings && cloudSettings.title) {
                    return fileConfig ? deepMerge(fileConfig, cloudSettings) : cloudSettings;
                }
            } catch {}
        }

        if (fileConfig) return fileConfig;

        throw new Error(`Événement introuvable : ${slug}`);
    }

    function sanitizeLegacyIdentityOverrides(partial, base) {
        if (!partial || !base) return partial;
        return partial;
    }

    function showEventLoadError(slug) {
        if (typeof document === "undefined" || !document.body) return;
        document.title = "Invitation introuvable";
        document.body.replaceChildren();
        const main = document.createElement("main");
        main.style.cssText = "max-width:38rem;margin:12vh auto;padding:2rem;font-family:system-ui,sans-serif;text-align:center";
        const heading = document.createElement("h1");
        heading.textContent = "Invitation introuvable";
        const message = document.createElement("p");
        message.textContent = `Le lien de l'événement « ${slug} » est invalide ou n'est pas encore publié.`;
        main.append(heading, message);
        document.body.appendChild(main);
    }

    async function init() {
        if (ready && config) return config;
        eventId = getEventId();
        try {
            config = await fetchEventJson(eventId);
        } catch (error) {
            config = null;
            ready = false;
            showEventLoadError(eventId);
            throw error;
        }

        ready = true;
        window.dispatchEvent(new CustomEvent("eventconfig:ready", { detail: config }));
        return config;
    }

    function getConfig() {
        return config;
    }

    function saveOverrides(partial) {
        config = deepMerge(config || {}, partial);
        localStorage.setItem(storageKey("settings"), JSON.stringify(partial));
        return config;
    }

    function applyToPage() {
        if (!config) return;

        document.title = config.title || document.title;

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el && value) el.textContent = value;
        };

        setText("hero-title", config.title);
        setText("hero-subtitle", config.subtitle);
        setText("venue-title", config.venue);
        setText("couple-name-left", config.coupleLeft);
        setText("couple-name-right", config.coupleRight);

        const coupleDisplay = document.getElementById("invite-couple-display");
        if (coupleDisplay) {
            if (config.coupleLeft || config.coupleRight) {
                coupleDisplay.textContent = [config.coupleLeft, config.coupleRight].filter(Boolean).join(" et ");
            } else if (config.subtitle) {
                coupleDisplay.textContent = config.subtitle;
            }
        }

        const welcomeGateTitle = document.getElementById("welcome-gate-title");
        if (welcomeGateTitle && config.subtitle) {
            welcomeGateTitle.textContent = config.subtitle.replace(/\s+et\s+/i, " & ");
        }

        const welcomeMsg = document.querySelector("#welcome-gate .text-gray-500");
        if (welcomeMsg && config.welcomeMessage) welcomeMsg.textContent = config.welcomeMessage;

        const mainText = document.getElementById("invitation-main-text");
        if (mainText && config.mainText) mainText.textContent = config.mainText;

        if (config.branding) {
            if (config.branding.primaryColor) {
                document.documentElement.style.setProperty("--primary-color", config.branding.primaryColor);
            }
            if (config.branding.accentColor) {
                document.documentElement.style.setProperty("--accent-color", config.branding.accentColor);
            }
            if (config.branding.welcomeImage) {
                document.documentElement.style.setProperty("--welcome-image-url", `url('${config.branding.welcomeImage}')`);
            }
            if (config.branding.heroImage) {
                document.documentElement.style.setProperty("--hero-image-url", `url('${config.branding.heroImage}')`);
            }
        }

        if (config.eventDate && window.EventCountdown) {
            EventCountdown.setTarget(config.eventDate);
            EventCountdown.applyDateToUI(config.eventDate);
        }

        const metaTitle = document.getElementById("meta-og-title");
        const metaDesc = document.getElementById("meta-og-description");
        const metaDesc2 = document.getElementById("meta-description");
        const metaTwitterTitle = document.getElementById("meta-twitter-title");
        const metaTwitterDesc = document.getElementById("meta-twitter-description");
        if (metaTitle && config.title) {
            metaTitle.content = config.title;
            if (metaTwitterTitle) metaTwitterTitle.content = config.title;
        }
        const desc = config.mainText || config.welcomeMessage || "";
        if (metaDesc && desc) metaDesc.content = desc.slice(0, 160);
        if (metaDesc2 && desc) metaDesc2.content = desc.slice(0, 160);
        if (metaTwitterDesc && desc) metaTwitterDesc.content = desc.slice(0, 160);
        if (config.branding && (config.branding.ogShareImage || config.branding.heroImage)) {
            const ogImg = document.getElementById("meta-og-image");
            const twImg = document.getElementById("meta-twitter-image");
            const shareImg = config.branding.ogShareImage || config.branding.heroImage;
            if (ogImg) ogImg.content = shareImg;
            if (twImg) twImg.content = shareImg;
        }

        if (config.gateHint) {
            const gateHint = document.getElementById("welcome-gate-hint");
            if (gateHint) gateHint.textContent = config.gateHint;
        }
    }

    function buildInvitationBaseUrl() {
        const path = window.location.pathname.replace(/[^/]+$/, "invitation.html");
        return `${window.location.origin}${path}`;
    }

    function preserveEventQuery(extraParams = {}) {
        const params = new URLSearchParams();
        params.set("event", eventId);
        Object.entries(extraParams).forEach(([k, v]) => {
            if (v) params.set(k, v);
        });
        return `?${params.toString()}`;
    }

    return {
        init,
        getEventId,
        getConfig,
        saveOverrides,
        applyToPage,
        storageKey,
        buildInvitationBaseUrl,
        preserveEventQuery,
        getRegisteredEvents,
        loadEvent: fetchEventJson,
        createEvent,
        publishEvent,
        discardLocalEvent,
        isReady: () => ready
    };
})();

window.EventConfig = EventConfig;
