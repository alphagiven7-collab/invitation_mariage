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
    let initPromise = null;

    function getEventId() {
        const params = new URLSearchParams(window.location.search);
        return (params.get("event") || DEFAULT_EVENT).trim().toLowerCase();
    }

    function storageKey(suffix) {
        return `wedding_event_${eventId}_${suffix}`;
    }

    function publicConfigCacheKey(slug) {
        return `wedding_event_${String(slug || "").trim().toLowerCase()}_public_config`;
    }

    function readCachedPublicConfig(slug) {
        try {
            const cached = JSON.parse(localStorage.getItem(publicConfigCacheKey(slug)) || "null");
            return cached && cached.title ? cached : null;
        } catch {
            return null;
        }
    }

    function cachePublicConfig(slug, eventConfig) {
        if (!eventConfig?.title) return;
        try {
            localStorage.setItem(publicConfigCacheKey(slug), JSON.stringify(eventConfig));
        } catch {
            // Le cache est une optimisation PWA ; l'invitation reste utilisable sans lui.
        }
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

    async function getAvailableEvents() {
        const bySlug = new Map();
        [...BUILTIN_EVENTS, ...getCustomEvents()].forEach((event) => {
            if (event?.slug) bySlug.set(event.slug, event);
        });

        if (window.CloudAPI?.isEnabled?.() && typeof CloudAPI.getEvents === "function") {
            try {
                const cloudEvents = await CloudAPI.getEvents();
                (Array.isArray(cloudEvents) ? cloudEvents : []).forEach((event) => {
                    if (!event?.slug) return;
                    bySlug.set(event.slug, { ...bySlug.get(event.slug), ...event });
                });
            } catch (error) {
                // La liste locale reste utilisable quand le compte courant ne peut pas lire les événements cloud.
                console.warn("EventConfig: liste d'événements cloud indisponible", error);
            }
        }
        return [...bySlug.values()];
    }

    function createEvent(data) {
        if (!data || !data.title) throw new Error("Le titre de l'événement est requis.");
        const rawSlug = (data.slug || data.title)
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        const slug = rawSlug || `event-${Date.now()}`;
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
            ownerEmail: String(data.ownerEmail || "").trim().toLowerCase(),
            rsvpMode: data.rsvpMode || "personal",
            confirmationContacts: data.confirmationContacts || { male: "", female: "" },
            dressCodeMen: data.dressCodeMen || "",
            dressCodeWomen: data.dressCodeWomen || "",
            branding: {
                primaryColor: data.primaryColor || "#5c1830",
                accentColor: data.accentColor || "#ec4899",
                welcomeImage: data.welcomeImage || "",
                heroImage: data.heroImage || ""
            },
            sections: {
                rsvp: true,
                program: true,
                practical: true,
                venue: true,
                about: true,
                music: true,
                messages: true,
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
        [
            "config", "settings", "dashboard_state", "guests", "deleted_guests", "guest_name", "public_config",
            "checkin_roster", "check_ins", "check_ins_pending"
        ].forEach((suffix) => {
            localStorage.removeItem(`wedding_event_${normalizedSlug}_${suffix}`);
        });
        localStorage.removeItem(`wedding_preview_${normalizedSlug}`);
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
        const fileConfigPromise = isBuiltIn
            ? fetch(`../events/${slug}.json`, { cache: "no-store" })
                .then((res) => res.ok ? res.json() : null)
                .catch(() => null)
            : Promise.resolve(null);

        // Les réglages sauvegardés sont publics en lecture uniquement via RPC.
        // Cette étape est indispensable pour les visiteurs anonymes, bloqués par RLS
        // sur la table event_settings elle-même.
        const cloudConfigPromise = window.CloudAPI
            && typeof CloudAPI.getPublicEventConfig === "function"
            && CloudAPI.isEnabled()
            ? CloudAPI.getPublicEventConfig(slug)
                .then((config) => ({ config, reachable: true }))
                .catch(() => ({ config: null, reachable: false }))
            : Promise.resolve({ config: null, reachable: false });
        const [fileConfig, cloudResult] = await Promise.all([fileConfigPromise, cloudConfigPromise]);
        const cloudSettings = cloudResult.config;
        if (cloudSettings && cloudSettings.title) {
            const resolved = fileConfig ? deepMerge(fileConfig, cloudSettings) : cloudSettings;
            cachePublicConfig(slug, resolved);
            return resolved;
        }

        if (fileConfig) return fileConfig;

        // Une copie publique n'est utilisée qu'après un échec réseau/RPC. Une
        // réponse valide mais vide (événement dépublié) ne réactive donc pas un
        // ancien lien par erreur.
        const cached = readCachedPublicConfig(slug);
        if (!cloudResult.reachable && cached) return cached;

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

    function init() {
        if (ready && config) return Promise.resolve(config);
        if (initPromise) return initPromise;

        const requestedEventId = getEventId();
        eventId = requestedEventId;
        initPromise = fetchEventJson(requestedEventId)
            .then((loadedConfig) => {
                config = loadedConfig;
                ready = true;
                window.dispatchEvent(new CustomEvent("eventconfig:ready", { detail: config }));
                return config;
            })
            .catch((error) => {
                config = null;
                ready = false;
                showEventLoadError(requestedEventId);
                throw error;
            })
            .finally(() => {
                // Une erreur reste retentable, tandis que les appels simultanés
                // pendant le chargement partagent la même requête réseau.
                initPromise = null;
            });
        return initPromise;
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
        document.documentElement.style.setProperty("--hero-overlay-opacity", String(config.heroOverlayOpacity ?? 0.58));
        document.documentElement.style.setProperty("--hero-title-font", config.heroTitleFont || "Playfair Display");
        document.documentElement.style.setProperty("--hero-subtitle-font", config.heroSubtitleFont || "Montserrat");
        document.documentElement.style.setProperty("--hero-title-size", `${config.heroTitleSize ?? 48}px`);
        document.documentElement.style.setProperty("--hero-title-color", config.heroTitleColor || "#ffffff");
        document.documentElement.style.setProperty("--hero-subtitle-size", `${config.heroSubtitleSize ?? 18}px`);
        document.documentElement.style.setProperty("--hero-subtitle-color", config.heroSubtitleColor || "#ffffff");
        setText("venue-title", config.venue);
        setText("couple-name-left", config.coupleLeft);
        setText("couple-name-right", config.coupleRight);
        [
            ["men", config.dressCodeMen],
            ["women", config.dressCodeWomen]
        ].forEach(([side, value]) => {
            document.querySelectorAll(`[data-dress-code="${side}"]`).forEach((element) => {
                element.textContent = value || "";
            });
        });

        [
            ["dressPatternMen", "dress-pattern-men", "dress-pattern-men-wrap"],
            ["dressPatternWomen", "dress-pattern-women", "dress-pattern-women-wrap"]
        ].forEach(([configKey, imageId, wrapId]) => {
            const image = document.getElementById(imageId);
            const wrap = document.getElementById(wrapId);
            const source = String(config[configKey] || "").trim();
            if (image && source) image.src = source;
            wrap?.classList.toggle("hidden", !source);
        });
        const dressPatterns = document.getElementById("dress-patterns");
        const hasMenPattern = !!String(config.dressPatternMen || "").trim();
        const hasWomenPattern = !!String(config.dressPatternWomen || "").trim();
        const patternCount = Number(hasMenPattern) + Number(hasWomenPattern);
        dressPatterns?.classList.toggle("hidden", patternCount === 0);

        const dressDetails = document.getElementById("dress-code-details");
        if (dressDetails) {
            dressDetails.classList.toggle("hidden", patternCount > 0 || (!config.dressCodeMen && !config.dressCodeWomen));
        }

        const heroImage = document.getElementById("hero-image");
        const heroImageUrl = config.heroImage || config.branding?.heroImage;
        if (heroImage && heroImageUrl) heroImage.src = heroImageUrl;

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
            if (config.primaryColor || config.branding.primaryColor) {
                document.documentElement.style.setProperty("--primary-color", config.primaryColor || config.branding.primaryColor);
            }
            if (config.accentColor || config.branding.accentColor) {
                document.documentElement.style.setProperty("--accent-color", config.accentColor || config.branding.accentColor);
            }
            const welcomeImage = config.welcomeImage || config.branding.welcomeImage;
            const heroImage = config.heroImage || config.branding.heroImage;
            if (welcomeImage) {
                document.documentElement.style.setProperty("--welcome-image-url", `url('${welcomeImage}')`);
            }
            if (heroImage) {
                document.documentElement.style.setProperty("--hero-image-url", `url('${heroImage}')`);
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
        const welcomeImage = config.welcomeImage || config.branding?.welcomeImage;
        if (welcomeImage) {
            const ogImg = document.getElementById("meta-og-image");
            const twImg = document.getElementById("meta-twitter-image");
            if (ogImg) ogImg.content = welcomeImage;
            if (twImg) twImg.content = welcomeImage;
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
        getAvailableEvents,
        loadEvent: fetchEventJson,
        createEvent,
        publishEvent,
        discardLocalEvent,
        isReady: () => ready
    };
})();

window.EventConfig = EventConfig;
