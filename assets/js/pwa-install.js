(function () {
    "use strict";

    const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
    let current = null;
    let deferredPrompt = null;
    let pendingInstallContext = null;
    let nextCardId = 0;
    const cards = new WeakMap();
    const displayMode = window.matchMedia?.("(display-mode: standalone)");

    function isStandalone() {
        return !!(displayMode?.matches || navigator.standalone);
    }

    function normalizeContext({ mode, eventId, token = "" } = {}) {
        const normalizedEvent = String(eventId || "").trim().toLowerCase();
        const normalizedToken = mode === "invitation" ? String(token || "").trim() : "";
        if (!["organizer", "invitation"].includes(mode)) return null;
        if (!/^[a-z0-9][a-z0-9_-]{0,159}$/.test(normalizedEvent)) return null;
        if (normalizedToken && !/^[a-zA-Z0-9_-]{1,256}$/.test(normalizedToken)) return null;
        return { mode, eventId: normalizedEvent, token: normalizedToken };
    }

    function sameContext(left, right) {
        return !!left && !!right && left.mode === right.mode && left.eventId === right.eventId && left.token === right.token;
    }

    function savePreferences(context) {
        if (!context?.storageKey) return;
        try {
            localStorage.setItem(context.storageKey, JSON.stringify({
                dismissedUntil: context.dismissedUntil,
                installed: context.installed
            }));
        } catch (_) { /* Storage may be unavailable in private browsing. */ }
    }

    async function loadPreferences(context) {
        try {
            // Do not put the invitation token in a localStorage key.
            const data = new TextEncoder().encode(JSON.stringify([context.mode, context.eventId, context.token]));
            const hash = await window.crypto.subtle.digest("SHA-256", data);
            context.storageKey = `michelline_pwa_${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`;
            const stored = JSON.parse(localStorage.getItem(context.storageKey) || "null");
            if (!context.preferencesChanged && stored && typeof stored === "object") {
                context.dismissedUntil = Number(stored.dismissedUntil) || 0;
                context.installed = !context.promptSeen && stored.installed === true;
            }
            if (isStandalone() && current === context) context.installed = true;
            if (context.preferencesChanged || context.installed || context.promptSeen) savePreferences(context);
        } catch (_) { /* The offer still works without persistent preferences. */ }
        context.preferencesReady = true;
        if (current === context) refresh();
    }

    function configure(options) {
        const context = normalizeContext(options);
        if (!context) return false;
        if (sameContext(current, context)) return true;
        deferredPrompt = null;
        current = {
            ...context,
            eligible: false,
            offlineReady: false,
            installed: isStandalone(),
            accepted: false,
            dismissedUntil: 0,
            preferencesReady: false,
            preferencesChanged: false,
            promptSeen: false,
            showHelp: false,
            busy: false,
            storageKey: ""
        };
        const params = new URLSearchParams({ mode: context.mode, event: context.eventId });
        if (context.token) params.set("t", context.token);
        let manifest = document.querySelector('link[rel="manifest"]');
        if (!manifest) {
            manifest = document.createElement("link");
            manifest.rel = "manifest";
            document.head.appendChild(manifest);
        }
        manifest.href = `/api/pwa-manifest?${params}`;
        void loadPreferences(current);
        refresh();
        return true;
    }

    function instructions(mode) {
        const ua = navigator.userAgent || "";
        const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        if (ios) {
            return {
                title: "Sur iPhone ou iPad",
                text: "Ouvrez le menu Partager de votre navigateur, puis choisissez « Sur l’écran d’accueil » et « Ajouter ». Si cette option n’apparaît pas, ouvrez ce lien dans Safari.",
                note: mode === "organizer" ? "Ouvrez l’application une première fois avec Internet. Une nouvelle connexion à votre compte peut être demandée." : "Ouvrez l’application une première fois avec Internet."
            };
        }
        if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) {
            return { title: "Sur votre Mac", text: "Dans Safari, ouvrez Fichier puis « Ajouter au Dock ». Si cette option n’est pas disponible, ajoutez cette page à vos favoris.", note: "Ouvrez l’application une première fois avec Internet." };
        }
        return {
            title: "Depuis votre navigateur",
            text: "Ouvrez le menu du navigateur et choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur ordinateur, l’icône d’installation peut aussi apparaître dans la barre d’adresse. Si aucune option n’est proposée, ajoutez cette page à vos favoris.",
            note: "Ouvrez l’application une première fois avec Internet."
        };
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function createCard(host) {
        const id = `pwa-install-${++nextCardId}`;
        const card = element("section", "pwa-install-card");
        card.setAttribute("aria-labelledby", `${id}-title`);
        const icon = element("img", "pwa-install-icon");
        icon.src = "/assets/images/pwa-icon-192.png";
        icon.alt = "";
        icon.width = 46;
        icon.height = 46;
        const content = element("div", "pwa-install-content");
        const title = element("h3", "pwa-install-title");
        title.id = `${id}-title`;
        const description = element("p", "pwa-install-description");
        const note = element("p", "pwa-install-note");
        const actions = element("div", "pwa-install-actions");
        const button = element("button", "pwa-install-primary");
        button.type = "button";
        button.setAttribute("aria-controls", `${id}-help`);
        button.addEventListener("click", () => { void install(); });
        const later = element("button", "pwa-install-later", "Plus tard");
        later.type = "button";
        later.addEventListener("click", dismiss);
        actions.append(button, later);
        const help = element("div", "pwa-install-help");
        help.id = `${id}-help`;
        const helpTitle = element("h4", "pwa-install-help-title");
        const helpText = element("p");
        const helpNote = element("p", "pwa-install-help-note");
        help.append(helpTitle, helpText, helpNote);
        content.append(title, description, note, actions, help);
        card.append(icon, content);
        host.appendChild(card);
        const refs = { title, description, note, button, help, helpTitle, helpText, helpNote };
        cards.set(host, refs);
        return refs;
    }

    function refresh() {
        const context = current;
        const available = !!(context?.eligible && context.preferencesReady && !context.installed && !context.accepted && !isStandalone());
        const showCard = available && context.preferencesReady && context.dismissedUntil <= Date.now();
        document.querySelectorAll("[data-pwa-install]").forEach(host => {
            const matches = context && host.getAttribute("data-pwa-install") === context.mode;
            host.hidden = !(showCard && matches);
            if (host.hidden) return;
            const refs = cards.get(host) || createCard(host);
            const organizer = context.mode === "organizer";
            refs.title.textContent = organizer ? "Votre organisation, à portée de main" : "Gardez votre invitation sur votre téléphone";
            refs.description.textContent = organizer ? "Retrouvez votre espace de gestion depuis l’écran d’accueil." : "Ajoutez votre invitation à l’écran d’accueil pour la retrouver facilement le jour de l’événement.";
            refs.note.textContent = organizer ? "Une connexion Internet reste nécessaire pour gérer votre événement." : context.offlineReady ? "Votre invitation et votre carte d’accès sont enregistrées sur cet appareil." : "Ouvrez l’application une première fois avec Internet.";
            refs.button.textContent = context.busy ? "Installation…" : organizer ? "Installer l’application" : "Installer mon invitation";
            refs.button.disabled = context.busy;
            refs.button.setAttribute("aria-expanded", String(context.showHelp));
            refs.help.hidden = !context.showHelp;
            const help = instructions(context.mode);
            refs.helpTitle.textContent = help.title;
            refs.helpText.textContent = help.text;
            refs.helpNote.textContent = help.note;
        });
        document.querySelectorAll("[data-pwa-install-trigger]").forEach(button => {
            const mode = button.getAttribute("data-pwa-install-trigger");
            button.hidden = !(available && (!mode || mode === context.mode));
            button.disabled = !!context?.busy;
        });
    }

    function dismiss() {
        if (!current) return;
        current.dismissedUntil = Date.now() + COOLDOWN_MS;
        current.showHelp = false;
        current.preferencesChanged = true;
        savePreferences(current);
        refresh();
    }

    async function install() {
        const context = current;
        if (!context?.eligible || context.installed || context.accepted || isStandalone() || context.busy) return false;
        context.dismissedUntil = 0;
        context.preferencesChanged = true;
        savePreferences(context);
        const prompt = deferredPrompt;
        if (!prompt || prompt.context !== context) {
            context.showHelp = true;
            refresh();
            return false;
        }
        deferredPrompt = null;
        context.busy = true;
        context.showHelp = false;
        pendingInstallContext = context;
        refresh();
        try {
            // Keep this call before the first await: native prompts require the click gesture.
            const result = await prompt.event.prompt();
            const choice = result?.outcome ? result : await prompt.event.userChoice;
            if (choice?.outcome === "accepted") context.accepted = true;
            else {
                if (pendingInstallContext === context) pendingInstallContext = null;
                context.dismissedUntil = Date.now() + COOLDOWN_MS;
                savePreferences(context);
            }
            return choice?.outcome === "accepted";
        } catch (_) {
            if (pendingInstallContext === context) pendingInstallContext = null;
            context.showHelp = true;
            return false;
        } finally {
            context.busy = false;
            if (current === context) refresh();
        }
    }

    function offer(mode, options = {}) {
        if (!configure({ ...options, mode })) return false;
        current.eligible = true;
        current.offlineReady = options.offlineReady === true;
        refresh();
        return true;
    }

    function clearOffer() {
        if (current) {
            current.eligible = false;
            current.showHelp = false;
        }
        deferredPrompt = null;
        refresh();
    }

    window.addEventListener("beforeinstallprompt", event => {
        if (!current) return;
        event.preventDefault();
        deferredPrompt = { event, context: current };
        // A fresh prompt also means a previously installed copy may have been removed.
        current.installed = false;
        current.accepted = false;
        current.promptSeen = true;
        savePreferences(current);
        refresh();
    });
    window.addEventListener("appinstalled", () => {
        const context = pendingInstallContext || current;
        if (!context) return;
        context.installed = true;
        context.preferencesChanged = true;
        pendingInstallContext = null;
        if (current === context) deferredPrompt = null;
        savePreferences(context);
        refresh();
    });
    const onDisplayModeChange = () => {
        if (current && isStandalone()) {
            current.installed = true;
            current.preferencesChanged = true;
            savePreferences(current);
        }
        refresh();
    };
    if (displayMode?.addEventListener) displayMode.addEventListener("change", onDisplayModeChange);
    else displayMode?.addListener?.(onDisplayModeChange);
    document.addEventListener("click", event => {
        const trigger = event.target.closest?.("[data-pwa-install-trigger]");
        if (trigger && !trigger.hidden) { event.preventDefault(); void install(); }
    });
    document.addEventListener("DOMContentLoaded", refresh);

    window.PwaInstall = {
        configure,
        offerOrganizer: options => offer("organizer", options),
        offerInvitation: options => offer("invitation", options),
        clearOffer,
        install,
        refresh
    };

    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const mode = /\/admin\.html$/.test(pathname) ? "organizer" : /\/invitation\.html$/.test(pathname) ? "invitation" : "";
    if (mode) configure({ mode, eventId: params.get("event"), token: params.get("t") });
})();
