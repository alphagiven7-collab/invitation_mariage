/**
 * Charge la configuration d'un événement via ?event=slug
 * Fusionne avec les overrides localStorage (personnalisation)
 */
const EventConfig = (() => {
    const DEFAULT_EVENT = "yanick-keren";
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

    async function fetchEventJson(slug) {
        const res = await fetch(`../events/${slug}.json`);
        if (!res.ok) throw new Error(`Event ${slug} not found`);
        return res.json();
    }

    function sanitizeLegacyIdentityOverrides(partial, base) {
        if (!partial || !base) return partial;
        const blob = JSON.stringify(partial);
        if (!/yanick|keren/i.test(blob)) return partial;
        const out = { ...partial };
        ["title", "subtitle", "coupleLeft", "coupleRight"].forEach((key) => {
            if (/yanick|keren/i.test(String(out[key] || ""))) {
                if (base[key]) out[key] = base[key];
                else delete out[key];
            }
        });
        return out;
    }

    async function init() {
        if (ready && config) return config;
        eventId = getEventId();
        try {
            config = await fetchEventJson(eventId);
        } catch {
            eventId = DEFAULT_EVENT;
            config = await fetchEventJson(DEFAULT_EVENT);
        }

        const overridesRaw = localStorage.getItem(storageKey("settings"));
        if (overridesRaw) {
            try {
                const parsed = sanitizeLegacyIdentityOverrides(JSON.parse(overridesRaw), config);
                const original = JSON.parse(overridesRaw);
                config = deepMerge(config, parsed);
                if (JSON.stringify(parsed) !== JSON.stringify(original)) {
                    localStorage.setItem(storageKey("settings"), JSON.stringify(parsed));
                }
            } catch {
                /* ignore invalid JSON */
            }
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
        isReady: () => ready
    };
})();

window.EventConfig = EventConfig;
