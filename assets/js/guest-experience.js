/**
 * Parcours invité — accueil, préremplissage, RSVP, confirmation QR
 * Chargé EN DERNIER pour écraser les handlers de app.js
 */
const GuestExperience = (() => {
    let profile = null;
    let initDone = false;
    let initPromise = null;
    let rsvpProfilePhotoUrl = "";

    function unwrapGuest(g) {
        if (!g) return null;
        if (g.guest) return g.guest;
        return g;
    }

    function getParams() {
        return new URLSearchParams(window.location.search);
    }

    function isPrintRequested() {
        return getParams().get("print") === "1";
    }

    function slugToName(slug) {
        return (slug || "")
            .split("-")
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
    }

    function getEventId() {
        if (window.EventConfig && EventConfig.isReady && EventConfig.isReady()) {
            return EventConfig.getEventId();
        }
        return getParams().get("event") || "demo";
    }

    function eventStorageKey(suffix) {
        return `wedding_event_${getEventId()}_${suffix}`;
    }

    function getCoupleLabel() {
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        if (cfg) {
            if (cfg.coupleLeft && cfg.coupleRight) return `${cfg.coupleLeft} & ${cfg.coupleRight}`;
            if (cfg.subtitle) return cfg.subtitle;
            if (cfg.title) return cfg.title;
        }
        return "Les mariés";
    }

    function showToast(msg) {
        if (typeof window.showToast === "function") {
            window.showToast(msg);
            return;
        }
        const toast = document.getElementById("toast");
        if (toast) {
            toast.textContent = msg;
            toast.classList.add("show");
            setTimeout(() => toast.classList.remove("show"), 2200);
        } else {
            alert(msg);
        }
    }

    const ACCESSIBLE_MODAL_IDS = [
        "rsvp-confirmation-modal",
        "guest-list-required-modal",
        "rsvp-modal",
        "best-photos-modal",
        "gallery-modal",
        "guestbook-modal",
        "about-modal",
        "customizer-page"
    ];

    function isVisibleModal(modal) {
        return !!modal
            && !modal.classList.contains("hidden")
            && modal.getAttribute("aria-hidden") !== "true";
    }

    function getActiveModal() {
        return ACCESSIBLE_MODAL_IDS
            .map((id) => document.getElementById(id))
            .find(isVisibleModal) || null;
    }

    function getModalFocusables(modal) {
        if (!modal) return [];
        return [...modal.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    }

    function openModalAccessibility(modal, preferredFocus) {
        if (!modal) return;
        const active = document.activeElement;
        // Une confirmation peut s'ouvrir pendant que le formulaire RSVP se ferme.
        // Dans ce cas, le focus actif est encore dans la modale devenue aria-hidden :
        // la nouvelle modale doit reprendre son point de retour initial, pas ce
        // bouton bientôt caché.
        const closingParentModal = active?.closest?.('[role="dialog"][aria-hidden="true"]');
        const returnFocus = closingParentModal?.__returnFocus || active;
        modal.__returnFocus = returnFocus && typeof returnFocus.focus === "function" ? returnFocus : null;
        modal.setAttribute("aria-hidden", "false");
        window.setTimeout(() => {
            if (!isVisibleModal(modal)) return;
            const target = preferredFocus
                || modal.querySelector("[autofocus], [data-modal-initial-focus]")
                || getModalFocusables(modal)[0];
            if (target && typeof target.focus === "function") target.focus();
            else {
                modal.setAttribute("tabindex", "-1");
                modal.focus?.();
            }
        }, 0);
    }

    function closeModalAccessibility(modal, delay = 0) {
        if (!modal) return;
        modal.setAttribute("aria-hidden", "true");
        const restoreFocus = () => {
            const target = modal.__returnFocus;
            modal.__returnFocus = null;
            // Une modale plus récente (par exemple la confirmation RSVP) garde
            // le focus : ne jamais le renvoyer sous son overlay.
            if (getActiveModal()) return;
            if (target && document.contains(target) && typeof target.focus === "function") target.focus();
        };
        window.setTimeout(restoreFocus, delay);
    }

    function closeActiveModal(modal) {
        if (!modal) return;
        if (modal.id === "guest-list-required-modal") {
            closeInvitationRequiredModal();
            return;
        }
        if (modal.id === "best-photos-modal" && typeof window.closeBestPhotosGallery === "function") {
            window.closeBestPhotosGallery();
            return;
        }
        if (modal.id === "customizer-page" && typeof window.closeCustomizer === "function") {
            window.closeCustomizer();
            return;
        }
        if (typeof window.closeModal === "function") {
            window.closeModal(modal.id);
            return;
        }
        modal.classList.add("hidden");
        closeModalAccessibility(modal);
        document.body.style.overflow = "auto";
    }

    function handleModalKeyboard(event) {
        const modal = getActiveModal();
        if (!modal) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeActiveModal(modal);
            return;
        }
        if (event.key !== "Tab") return;
        const focusables = getModalFocusables(modal);
        if (!focusables.length) {
            event.preventDefault();
            modal.focus?.();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function handleKeyboardActivation(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target.closest?.("[data-keyboard-activate]");
        if (!target) return;
        event.preventDefault();
        target.click();
    }

    function wrapModalFunction(name, { open = false, close = false, delay = 0, modalId = "" } = {}) {
        const original = window[name];
        if (typeof original !== "function" || original.__accessibleModalWrapped) return;
        const wrapped = function (...args) {
            const modal = document.getElementById(modalId || args[0]);
            const result = original.apply(this, args);
            if (open && modal && !modal.classList.contains("hidden")) openModalAccessibility(modal);
            if (close) closeModalAccessibility(modal, delay);
            return result;
        };
        wrapped.__accessibleModalWrapped = true;
        window[name] = wrapped;
    }

    function setupModalAccessibility() {
        ACCESSIBLE_MODAL_IDS.forEach((id) => {
            const modal = document.getElementById(id);
            if (!modal) return;
            modal.setAttribute("role", modal.getAttribute("role") || "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-hidden", modal.classList.contains("hidden") ? "true" : "false");
        });
        wrapModalFunction("openModal", { open: true });
        wrapModalFunction("closeModal", { close: true, delay: 320 });
        wrapModalFunction("openBestPhotosGallery", { open: true, modalId: "best-photos-modal" });
        wrapModalFunction("closeBestPhotosGallery", { close: true, modalId: "best-photos-modal" });
        wrapModalFunction("openCustomizer", { open: true, modalId: "customizer-page" });
        wrapModalFunction("closeCustomizer", { close: true, modalId: "customizer-page" });
    }

    function showInvitationRequiredModal() {
        const eventConfig = window.EventConfig?.getConfig?.() || {};
        if (isOpenRsvpEvent(eventConfig)) {
            if (typeof window.openModal === "function") window.openModal("rsvp-modal");
            else document.getElementById("rsvp-modal")?.classList.remove("hidden");
            return;
        }
        const modal = document.getElementById("guest-list-required-modal");
        if (!modal) {
            showToast("Vous n'êtes pas encore sur la liste des invités. Contactez l'organisateur afin d'être ajouté(e) avant de confirmer votre présence.");
            return;
        }
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        document.body.style.overflow = "hidden";
        openModalAccessibility(modal, document.getElementById("guest-list-required-close"));
    }

    function closeInvitationRequiredModal() {
        const modal = document.getElementById("guest-list-required-modal");
        if (!modal || modal.classList.contains("hidden")) return;
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        document.body.classList.remove("overflow-hidden");
        document.body.style.overflow = "auto";
        closeModalAccessibility(modal);
    }

    document.addEventListener("keydown", handleModalKeyboard);
    document.addEventListener("keydown", handleKeyboardActivation);

    function applyProfile(guest) {
        if (!guest || !guest.fullName) return;
        profile = guest;
        window.currentGuestProfile = guest;
        window.guestName = guest.fullName;
        window.dispatchEvent(new CustomEvent("guestprofile:ready"));
        localStorage.setItem(eventStorageKey("guest_name"), guest.fullName);

        const display = document.getElementById("display-guest-name");
        if (display) display.textContent = guest.fullName;

        const setField = (id, val) => {
            const el = document.getElementById(id);
            if (!el || val === undefined || val === null || val === "") return;
            el.value = String(val);
            el.classList.add("rsvp-prefilled");
        };

        setField("rsvp-name", guest.fullName);
        setField("rsvp-phone", guest.phone || "");
        if (guest.adults !== undefined) setField("rsvp-adults", guest.adults);
        if (guest.children !== undefined) setField("rsvp-children", guest.children);
        if (guest.status === "yes" || guest.status === "no") {
            const st = document.getElementById("rsvp-status");
            if (st) st.value = guest.status;
        }
        if (Array.isArray(guest.drinkChoices) && guest.drinkChoices.length && window.DrinkMenu) {
            DrinkMenu.setSelected(guest.drinkChoices);
        }
        if (guest.profilePhotoUrl) {
            rsvpProfilePhotoUrl = guest.profilePhotoUrl;
            const preview = document.getElementById("rsvp-profile-preview");
            if (preview) {
                preview.src = guest.profilePhotoUrl;
                preview.classList.remove("hidden");
            }
        }
    }

    function lockPersonalDetails() {
        const nameField = document.getElementById("rsvp-name");
        if (!nameField) return;
        nameField.disabled = true;
        nameField.closest("div")?.classList.add("hidden");
    }

    async function handleRsvpPhotoUpload(event) {
        const file = event.target?.files?.[0];
        if (!file) return;
        if (!window.MediaUpload) {
            showToast("Upload indisponible.");
            return;
        }
        try {
            const url = await MediaUpload.processFile(file, getEventId(), "guest-profile");
            rsvpProfilePhotoUrl = url;
            const preview = document.getElementById("rsvp-profile-preview");
            if (preview) {
                preview.src = url;
                preview.classList.remove("hidden");
            }
            showToast("Photo ajoutée à votre carte.");
        } catch (e) {
            showToast(e.message || "Photo illisible — essayez une autre image.");
        }
    }

    function showPersonalWelcome(guest) {
        document.getElementById("gate-name-input-container")?.classList.add("hidden");
        document.getElementById("gate-welcome-back-container")?.classList.add("hidden");
        document.querySelector("#welcome-gate .text-gray-500.mb-5")?.classList.add("hidden");

        const personal = document.getElementById("gate-personal-container");
        if (!personal) return;
        personal.classList.remove("hidden");
        personal.classList.add("gate-personal-visible");

        const fullName = String(guest.fullName || "Invité").trim();
        const first = /^couple\s+/i.test(fullName) ? fullName : fullName.split(" ")[0];
        const couple = getCoupleLabel();
        const greeting = document.getElementById("gate-personal-greeting");
        const message = document.getElementById("gate-personal-message");
        const hint = document.getElementById("welcome-gate-hint");
        if (hint) hint.textContent = `${first}, ouvrez votre enveloppe`;
        if (greeting) greeting.textContent = `${first},`;
        if (message) {
            message.replaceChildren();
            const coupleStrong = document.createElement("strong");
            coupleStrong.textContent = couple;
            const personalStrong = document.createElement("strong");
            personalStrong.textContent = "personnellement";
            const firstStrong = document.createElement("strong");
            firstStrong.textContent = first;
            message.append(
                coupleStrong,
                " ont le bonheur de vous inviter ",
                personalStrong,
                " à célébrer leur union.",
                document.createElement("br"),
                document.createElement("br"),
                "Cette enveloppe a été préparée uniquement pour vous, ",
                firstStrong,
                ". Votre présence serait pour eux un immense bonheur."
            );
        }
    }

    function guestFromUrlParams() {
        const params = getParams();
        const guestParam = (params.get("nom") || params.get("guest") || "").trim();
        const tel = (params.get("tel") || params.get("phone") || "").trim();
        const token = (params.get("t") || "").trim();
        if (!guestParam) return null;

        const fullName = guestParam.includes("-") && !guestParam.includes(" ")
            ? slugToName(guestParam)
            : decodeURIComponent(guestParam.replace(/\+/g, " "));

        return {
            fullName,
            phone: tel,
            token,
            status: "pending",
            adults: 1,
            children: 0
        };
    }

    async function resolveGuestFromUrl() {
        const params = getParams();
        const token = (params.get("t") || "").trim();
        const urlGuest = guestFromUrlParams();

        if (window.GuestManager && token) {
            try {
                const byToken = await GuestManager.findByToken(token);
                if (byToken) {
                    return { ...byToken, phone: byToken.phone || (urlGuest && urlGuest.phone) || "" };
                }
            } catch (e) {}
        }

        if (window.GuestManager && urlGuest) {
            try {
                const bySlug = await GuestManager.findBySlug(
                    params.get("guest") || slugify(urlGuest.fullName)
                );
                if (bySlug) {
                    return { ...bySlug, phone: bySlug.phone || urlGuest.phone || "" };
                }
            } catch (e) {}
        }

        return urlGuest;
    }

    function slugify(name) {
        return (name || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    }

    function initSync() {
        const guest = guestFromUrlParams();
        if (!guest) return false;
        applyProfile(guest);
        showPersonalWelcome(guest);
        return true;
    }

    async function tryRestoreConfirmation(resolvedGuest = null) {
        if (!window.GuestManager) return;
        const token = (getParams().get("t") || "").trim();
        // Une fiche obtenue via le token vient déjà de la RPC protégée. La
        // réutiliser évite une seconde requête identique au démarrage.
        let guest = token && resolvedGuest?.id && hasPersonalInviteToken(resolvedGuest)
            ? resolvedGuest
            : null;
        let saved = null;

        if (token) {
            if (!guest) {
                try { guest = await GuestManager.findByToken(token); } catch (e) {}
            }
            saved = localStorage.getItem(eventStorageKey(`confirm_${token}`));
        } else {
            const name = (localStorage.getItem(eventStorageKey("guest_name")) || "").trim();
            if (name) {
                try { guest = await GuestManager.findByName(name); } catch (e) {}
                saved = localStorage.getItem(eventStorageKey(`confirm_name_${slugify(name)}`));
            }
        }

        if (!guest || guest.status !== "yes") return;
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (canShowQrCode(guest, data.payload)) {
                    setTimeout(() => showAlreadyConfirmed(guest), 800);
                }
                return;
            } catch (e) {}
        }

        const payload = {
            name: guest.fullName,
            phone: guest.phone || "",
            status: guest.status,
            adults: guest.adults || 1,
            children: guest.children || 0,
            message: guest.rsvpMessage || "",
            drinkChoices: guest.drinkChoices || []
        };
        if (canShowQrCode(guest, payload)) {
            setTimeout(() => showAlreadyConfirmed(guest), 800);
        }
    }

    function initAsync() {
        if (initPromise) return initPromise;
        initPromise = (async () => {
            if (initDone) return !!profile;
            initDone = true;

            if (window.EventConfig && EventConfig.init) {
                try {
                    await EventConfig.init();
                    if (EventConfig.applyToPage) EventConfig.applyToPage();
                    applyRsvpModeForm();
                    // Ces messages ne conditionnent pas l'accès à un lien
                    // personnel. Leur chargement peut avancer en parallèle du
                    // lookup par token, sans retarder l'accueil de l'invité.
                    void loadPublicRsvpMessages();
                } catch (error) {
                    console.warn("Initialisation de l'invitation impossible", error);
                    renderPublicRsvpMessages([]);
                    const empty = document.getElementById("rsvp-messages-empty");
                    if (empty) {
                        empty.textContent = "Les messages RSVP sont momentanément indisponibles. Réessayez plus tard.";
                        empty.classList.remove("hidden");
                    }
                }
            }

            const guest = await resolveGuestFromUrl();
            if (guest) {
                applyProfile(guest);
                lockPersonalDetails();
                showPersonalWelcome(guest);
                if ((guest.status === "yes" || isPrintRequested())
                    && hasPersonalInviteToken(guest)
                    && typeof window.openMainSite === "function") {
                    await window.openMainSite(null, { skipLoader: true });
                }
                if (isPrintRequested()) window.dispatchEvent(new CustomEvent("personalinvitation:ready"));
                const token = getParams().get("t");
                if (token && window.CloudAPI && CloudAPI.isEnabled()) {
                    try {
                        CloudAPI.track(getEventId(), "guest_link_open", { guestToken: token });
                    } catch (e) {}
                }
                if (!isPrintRequested()) await tryRestoreConfirmation(guest);
                return true;
            }
            if (!isPrintRequested()) await tryRestoreConfirmation();
            return false;
        })();
        return initPromise;
    }

    async function resolvePersonalInviteIfNeeded(isOpenRsvp) {
        const token = (getParams().get("t") || "").trim();
        if (isOpenRsvp || !token) return profile;
        // initSync peut préremplir l'écran depuis ?guest=… avant que la fiche
        // protégée par token ne soit résolue. Cette fiche provisoire ne suffit
        // jamais à autoriser un RSVP personnel.
        if (profile?.id && hasPersonalInviteToken(profile)) return profile;
        try {
            await initAsync();
        } catch (error) {
            console.warn("Résolution de l'invitation personnelle impossible", error);
        }
        return profile;
    }

    function prefillRsvp() {
        if (profile) {
            applyProfile(profile);
            return;
        }
        const saved = (localStorage.getItem(eventStorageKey("guest_name")) || "").trim();
        if (saved) applyProfile({ fullName: saved, phone: "", status: "pending", adults: 1, children: 0 });
    }

    function isOpenRsvpEvent(config = window.EventConfig?.getConfig?.() || {}) {
        return config.rsvpMode === "open" || config.type === "open-rsvp";
    }

    function applyRsvpModeForm() {
        const eventConfig = window.EventConfig?.getConfig?.() || {};
        const isOpenRsvp = isOpenRsvpEvent(eventConfig);
        const families = eventConfig.confirmationFamilies || {};
        const maleFamily = String(families.male || "").trim() || "Côté de la famille de l'homme";
        const femaleFamily = String(families.female || "").trim() || "Côté de la famille de la femme";
        const maleChoice = document.getElementById("open-rsvp-male-family");
        const femaleChoice = document.getElementById("open-rsvp-female-family");
        if (maleChoice) maleChoice.textContent = maleFamily;
        if (femaleChoice) femaleChoice.textContent = femaleFamily;
        document.getElementById("dress-marquee-wrapper")?.classList.toggle("hidden", isOpenRsvp);
        const dressPatterns = document.getElementById("dress-patterns");
        dressPatterns?.classList.toggle("open-rsvp-attire", isOpenRsvp);
        dressPatterns?.classList.toggle("grid-cols-1", isOpenRsvp);
        dressPatterns?.classList.toggle("grid-cols-2", !isOpenRsvp);
        document.getElementById("rsvp-phone-field")?.classList.toggle("hidden", isOpenRsvp);
        document.getElementById("rsvp-count-fields")?.classList.toggle("hidden", isOpenRsvp);
        // Un RSVP ouvert peut aussi laisser un vœu public : le champ reste
        // disponible dans les deux parcours de confirmation.
        document.getElementById("rsvp-message-field")?.classList.remove("hidden");
        document.getElementById("rsvp-photo-field")?.classList.toggle("hidden", isOpenRsvp);
        document.getElementById("rsvp-drinks-section")?.classList.remove("hidden");
        document.getElementById("open-rsvp-side-field")?.classList.toggle("hidden", !isOpenRsvp);
        document.querySelectorAll('input[name="open-rsvp-side"]').forEach((field) => {
            field.required = isOpenRsvp;
        });
        const submitButton = document.getElementById("rsvp-submit-btn");
        if (submitButton) submitButton.textContent = isOpenRsvp
            ? "Envoyer ma réponse et ouvrir WhatsApp"
            : "Envoyer ma réponse RSVP";
        ["rsvp-phone", "rsvp-adults", "rsvp-children", "rsvp-message"].forEach((id) => {
            const field = document.getElementById(id);
            if (!field) return;
            field.disabled = false;
            field.readOnly = false;
        });
        document.getElementById("rsvp-phone")?.removeAttribute("required");
    }

    function initials(fullName) {
        return String(fullName || "Invité")
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "IN";
    }

    function renderPublicRsvpMessages(messages) {
        const list = document.getElementById("rsvp-messages-list");
        const empty = document.getElementById("rsvp-messages-empty");
        if (!list || !empty) return;

        const visibleMessages = Array.isArray(messages) ? messages : [];
        list.replaceChildren();
        empty.classList.toggle("hidden", visibleMessages.length > 0);
        if (!visibleMessages.length) {
            empty.textContent = "Les premiers messages apparaîtront ici.";
        }
        visibleMessages.forEach((message) => {
            const item = document.createElement("article");
            item.className = "border border-rose-100 bg-rose-50/40 rounded-xl p-4";
            const header = document.createElement("div");
            header.className = "flex items-center gap-2 mb-2";
            const avatar = document.createElement("span");
            avatar.className = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-700";
            avatar.textContent = initials(message.author_name || message.authorName);
            const metadata = document.createElement("div");
            const author = document.createElement("p");
            author.className = "text-xs font-bold text-gray-800";
            author.textContent = message.author_name || message.authorName || "Invité";
            const date = document.createElement("p");
            date.className = "text-[10px] text-gray-400";
            const sentAt = message.created_at || message.createdAt;
            date.textContent = sentAt ? new Date(sentAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
            const body = document.createElement("p");
            body.className = "text-xs leading-relaxed text-gray-600";
            body.textContent = message.message || "";
            metadata.append(author, date);
            header.append(avatar, metadata);
            item.append(header, body);
            list.appendChild(item);
        });
    }

    async function loadPublicRsvpMessages() {
        if (!window.CloudAPI?.isEnabled?.()) {
            renderPublicRsvpMessages([]);
            return [];
        }
        try {
            if (!window.EventConfig?.isReady?.()) {
                throw new Error("La configuration de l'invitation n'est pas disponible.");
            }
            if (!window.CloudAPI.getPublicRsvpMessages) {
                throw new Error("Le service des messages RSVP n'est pas disponible.");
            }
            const messages = await CloudAPI.getPublicRsvpMessages(getEventId());
            const visibleMessages = Array.isArray(messages) ? messages : [];
            renderPublicRsvpMessages(visibleMessages);
            return visibleMessages;
        } catch (error) {
            console.warn("Chargement des messages RSVP impossible", error);
            renderPublicRsvpMessages([]);
            const empty = document.getElementById("rsvp-messages-empty");
            if (empty) {
                empty.textContent = "Les messages RSVP sont momentanément indisponibles. Réessayez plus tard.";
                empty.classList.remove("hidden");
            }
            return null;
        }
    }

    async function openRsvp() {
        if (window.EventConfig?.init && !window.EventConfig.isReady?.()) {
            try { await EventConfig.init(); } catch (error) {
                showToast("Impossible de charger la configuration de cette invitation.");
                return;
            }
        }
        applyRsvpModeForm();
        const eventConfig = window.EventConfig?.getConfig?.() || {};
        const isOpenRsvp = isOpenRsvpEvent(eventConfig);
        await resolvePersonalInviteIfNeeded(isOpenRsvp);
        prefillRsvp();
        const hasPersonalInvite = hasPersonalInviteToken(profile) && !!profile?.id;
        if (!isOpenRsvp && !hasPersonalInvite) {
            showInvitationRequiredModal();
            return;
        }
        if (hasPersonalInvite && profile.status !== "pending") {
            showAlreadyConfirmed(profile);
            return;
        }
        if (typeof window.openModal === "function") {
            window.openModal("rsvp-modal");
        } else {
            document.getElementById("rsvp-modal")?.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        }
    }

    function buildConfirmCode(guest, payload) {
        const access = buildAccessCode(guest);
        if (access) return access;
        const tok = (guest && guest.token) ? guest.token.slice(0, 8).toUpperCase() : "INV";
        return `YK26-${tok}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }

    function buildAccessCode(guest) {
        if (guest && guest.accessCode) return String(guest.accessCode).trim().toUpperCase();
        if (guest && guest.token) return guest.token.slice(0, 8).toUpperCase();
        return "";
    }

    function getGuestTableLabel(guest) {
        const table = guest && (guest.tableNumber || guest.table);
        if (table) return String(table).trim();
        return "En cours d'attribution";
    }

    function getConfirmationMeta() {
        return window.__eventConfirmationMeta || {};
    }

    function formatEventDateLabel() {
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        const activeDate = cfg?.countdownDate
            || (window.EventCountdown && EventCountdown.getTarget
            ? EventCountdown.getTarget()
            : cfg?.eventDate);
        if (!activeDate) return "";
        try {
            return new Date(activeDate).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
            });
        } catch {
            return "";
        }
    }

    function buildCheckInQrData(guest) {
        if (window.CheckinUrl && guest && guest.token) {
            return CheckinUrl.buildCheckInUrl(guest, getEventId());
        }
        return "";
    }

    function buildQrPayload(payload, code, guest) {
        const url = buildCheckInQrData(guest);
        if (url) return url;
        const drinks = payload.drinkChoices || guest?.drinkChoices || [];
        return JSON.stringify({
            code,
            accessCode: buildAccessCode(guest) || code,
            table: getGuestTableLabel(guest),
            drinks: Array.isArray(drinks) ? drinks : [],
            event: getEventId(),
            name: payload.name,
            token: guest?.token || ""
        });
    }

    let lastConfirmationExport = null;

    function hasPersonalInviteToken(guest) {
        const token = (getParams().get("t") || "").trim();
        if (!token) return false;
        const g = guest || profile;
        return !!(g && g.token && g.token === token);
    }

    function canShowQrCode(guest, payload) {
        return !!(
            payload
            && payload.status === "yes"
            && guest
            && guest.status === "yes"
            && guest.qrApproved
            && hasPersonalInviteToken(guest)
        );
    }

    function saveConfirmationCache(payload, code) {
        const token = (getParams().get("t") || "").trim();
        const data = JSON.stringify({ payload, code });
        if (token) {
            localStorage.setItem(eventStorageKey(`confirm_${token}`), data);
        }
        if (payload.name) {
            localStorage.setItem(eventStorageKey(`confirm_name_${slugify(payload.name)}`), data);
        }
    }

    function setQrImage(data, onReady) {
        const img = document.getElementById("rsvp-qr-image");
        if (!img) {
            if (typeof onReady === "function") onReady("");
            return;
        }
        const done = (url) => {
            img.src = url;
            img.alt = "QR code confirmation";
            if (typeof onReady === "function") onReady(url);
        };
        const unavailable = () => {
            img.removeAttribute("src");
            img.alt = "QR code indisponible";
            if (typeof onReady === "function") onReady("");
        };
        if (window.QRCode && typeof QRCode.toDataURL === "function") {
            try {
                QRCode.toDataURL(data, { width: 220, margin: 2, color: { dark: "#1a472a", light: "#ffffff" } }, (err, url) => {
                    if (!err && url) done(url);
                    else unavailable();
                });
            } catch {
                unavailable();
            }
        } else {
            unavailable();
        }
    }

    function showConfirmation(payload, code, guest) {
        const resolvedGuest = unwrapGuest(guest) || profile;
        if (rsvpProfilePhotoUrl && resolvedGuest) {
            resolvedGuest.profilePhotoUrl = rsvpProfilePhotoUrl;
        } else if (resolvedGuest && resolvedGuest.profilePhotoUrl) {
            rsvpProfilePhotoUrl = resolvedGuest.profilePhotoUrl;
        }
        if (payload && rsvpProfilePhotoUrl) {
            payload.profilePhotoUrl = rsvpProfilePhotoUrl;
        }
        const isYes = payload.status === "yes";
        const showQr = canShowQrCode(resolvedGuest, payload);
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        const eventTitle = (cfg && cfg.title) ? cfg.title : (document.title || "Invitation");
        const meta = getConfirmationMeta();
        const accessCode = buildAccessCode(resolvedGuest) || code;
        const tableLabel = getGuestTableLabel(resolvedGuest);
        const drinks = payload.drinkChoices || resolvedGuest?.drinkChoices || [];
        const drinksLabel = drinks.length ? drinks.join(" · ") : "Non précisé";

        document.getElementById("confirm-title").textContent = payload.alreadyConfirmed
            ? "Invitation déjà confirmée"
            : isYes
            ? "Présence confirmée avec joie"
            : "Réponse enregistrée avec gratitude";
        document.getElementById("confirm-subtitle").textContent = payload.alreadyConfirmed
            ? "Votre carte d'accès est disponible. En cas de problème, contactez l'organisateur."
            : isYes
            ? "Votre place est réservée — gardez cette carte pour le jour J"
            : "Merci d'avoir pris le temps de répondre";
        document.getElementById("confirm-guest-line").textContent = payload.name;
        const eventDateEl = document.getElementById("confirm-event-date");
        const dateLabel = formatEventDateLabel();
        if (eventDateEl) {
            if (dateLabel) {
                eventDateEl.textContent = dateLabel;
                eventDateEl.classList.remove("hidden");
            } else {
                eventDateEl.classList.add("hidden");
            }
        }
        document.getElementById("confirm-detail-line").textContent = isYes
            ? `${eventTitle} · ${payload.adults} adulte(s) · ${payload.children} enfant(s)`
            : "Vous avez indiqué ne pas pouvoir être présent(e).";

        const coupleWrap = document.getElementById("confirm-couple-photos");
        const photoLeft = document.getElementById("confirm-photo-left");
        const photoRight = document.getElementById("confirm-photo-right");
        const guestPhotoWrap = document.getElementById("confirm-guest-photo-wrap");
        const guestPhotoEl = document.getElementById("confirm-guest-photo");
        const profileUrl = resolvedGuest?.profilePhotoUrl || rsvpProfilePhotoUrl || "";
        if (guestPhotoWrap && guestPhotoEl) {
            if (showQr && profileUrl) {
                guestPhotoWrap.classList.remove("hidden");
                guestPhotoEl.src = profileUrl;
                guestPhotoEl.alt = payload.name;
            } else {
                guestPhotoWrap.classList.add("hidden");
            }
        }
        const leftUrl = meta.couplePhotoLeft || "";
        const rightUrl = meta.couplePhotoRight || "";
        if (coupleWrap && photoLeft && photoRight && (leftUrl || rightUrl)) {
            coupleWrap.classList.remove("hidden");
            if (leftUrl) {
                photoLeft.src = leftUrl;
                photoLeft.alt = getCoupleLabel();
                photoLeft.classList.remove("hidden");
            } else {
                photoLeft.classList.add("hidden");
            }
            if (rightUrl) {
                photoRight.src = rightUrl;
                photoRight.alt = getCoupleLabel();
                photoRight.classList.remove("hidden");
            } else {
                photoRight.classList.add("hidden");
            }
        } else if (coupleWrap) {
            coupleWrap.classList.add("hidden");
        }

        const infoGrid = document.getElementById("confirm-info-grid");
        const accessEl = document.getElementById("confirm-access-code");
        const tableEl = document.getElementById("confirm-table-line");
        const drinksEl = document.getElementById("confirm-drinks-line");
        if (showQr && infoGrid && accessEl && tableEl && drinksEl) {
            infoGrid.classList.remove("hidden");
            accessEl.textContent = accessCode;
            tableEl.textContent = tableLabel;
            drinksEl.textContent = drinksLabel;
        } else if (infoGrid) {
            infoGrid.classList.add("hidden");
        }

        const qrWrap = document.getElementById("confirm-qr-wrap");
        const pendingWrap = document.getElementById("confirm-pending-wrap");
        const codeLine = document.getElementById("confirm-code-line");
        const qrHint = document.getElementById("confirm-qr-hint");
        const privateWarning = document.getElementById("confirm-private-warning");
        const downloadBtn = document.getElementById("confirm-download-btn");

        if (showQr) {
            if (codeLine) {
                codeLine.textContent = `Code : ${accessCode}`;
                codeLine.classList.remove("hidden");
            }
            if (qrWrap) qrWrap.classList.remove("hidden");
            if (pendingWrap) pendingWrap.classList.add("hidden");
            if (qrHint) {
                qrHint.textContent = "Présentez ce QR à l'entrée — le staff confirme votre accès, table et boissons.";
                qrHint.classList.remove("hidden");
            }
            if (privateWarning) privateWarning.classList.remove("hidden");
            if (downloadBtn) downloadBtn.classList.remove("hidden");
            lastConfirmationExport = {
                payload, accessCode, tableLabel, drinksLabel, eventTitle, guest: resolvedGuest, meta, dateLabel
            };
            setQrImage(buildQrPayload(payload, accessCode, resolvedGuest), (url) => {
                if (url) return;
                if (qrWrap) qrWrap.classList.add("hidden");
                if (downloadBtn) downloadBtn.classList.add("hidden");
                if (qrHint) {
                    qrHint.textContent = "Votre confirmation est enregistrée. Le QR code n'a pas pu être généré sur cet appareil : rouvrez votre invitation ou contactez l'organisateur.";
                    qrHint.classList.remove("hidden");
                }
                lastConfirmationExport = null;
            });
        } else {
            if (qrWrap) qrWrap.classList.add("hidden");
            if (pendingWrap) pendingWrap.classList.toggle("hidden", !isYes);
            const pendingText = document.getElementById("confirm-pending-text");
            if (pendingText && isYes) {
                pendingText.textContent = "Votre présence est enregistrée. Votre QR code sera disponible après validation par l'organisateur.";
            }
            if (codeLine) codeLine.classList.add("hidden");
            if (qrHint) qrHint.classList.add("hidden");
            if (privateWarning) privateWarning.classList.add("hidden");
            if (downloadBtn) downloadBtn.classList.add("hidden");
            lastConfirmationExport = null;
        }

        const modal = document.getElementById("rsvp-confirmation-modal");
        if (typeof window.openModal === "function") {
            window.openModal("rsvp-confirmation-modal");
        } else if (modal) {
            modal.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        }
    }

    async function downloadConfirmationPass() {
        const data = lastConfirmationExport;
        if (!data) {
            showToast("Aucune carte à télécharger.");
            return;
        }
        const qrImg = document.getElementById("rsvp-qr-image");
        if (!qrImg || !qrImg.src) {
            showToast("QR code indisponible.");
            return;
        }
        if (!window.AccessPassExport) {
            showToast("Export carte indisponible.");
            return;
        }
        try {
            const passData = AccessPassExport.buildData({
                payload: data.payload,
                guest: data.guest,
                accessCode: data.accessCode,
                tableLabel: data.tableLabel,
                drinksLabel: data.drinksLabel,
                eventTitle: data.eventTitle,
                dateLabel: data.dateLabel,
                meta: data.meta,
                qrSrc: qrImg.src
            });
            await AccessPassExport.download(passData);
            showToast("Carte d'accès téléchargée.");
        } catch (e) {
            showToast("Téléchargement impossible — réessayez.");
        }
    }

    function showAlreadyConfirmed(guest) {
        const payload = {
            name: guest.fullName,
            status: "yes",
            adults: guest.adults || 1,
            children: guest.children || 0,
            drinkChoices: guest.drinkChoices || [],
            alreadyConfirmed: true
        };
        showToast("Cette invitation a déjà été confirmée.");
        showConfirmation(payload, buildConfirmCode(guest, payload), guest);
    }

    function normalizeOptionalPhone(phone) {
        const text = String(phone || "").trim();
        if (!text) return "";
        if (!/^[+\d\s().-]+$/.test(text)) return null;
        const digits = text.replace(/\D/g, "").replace(/^00/, "");
        return digits.length >= 9 ? digits : null;
    }

    function redirectOpenRsvpToWhatsApp(payload, eventConfig, contactType) {
        const contact = eventConfig?.confirmationContacts?.[contactType];
        const phone = String(contact || "").replace(/\D/g, "");
        if (!phone) {
            showToast("Le numéro WhatsApp du côté choisi n'est pas encore configuré.");
            return;
        }
        const contactLabel = String(eventConfig?.confirmationFamilies?.[contactType] || "").trim()
            || (contactType === "male" ? "Côté de la famille de l'homme" : "Côté de la famille de la femme");
        const response = payload.status === "yes" ? "Je serai présent(e)" : "Je ne pourrai pas être présent(e)";
        const drinks = payload.drinkChoices.length ? payload.drinkChoices.join(", ") : "Non précisé";
        const defaultMessage = [
            "Bonjour,",
            "",
            `${payload.name} a répondu pour ${eventConfig.title || "l'événement"}.`,
            `Réponse : ${response}`,
            `Côté : ${contactLabel}`,
            `Boissons : ${drinks}`,
            "",
            "Merci de prendre cette confirmation en compte."
        ].join("\n");
        const replacements = {
            nom: payload.name,
            evenement: eventConfig.title || "Invitation",
            reponse: response,
            cote: contactLabel,
            boissons: drinks
        };
        const message = String(eventConfig.openRsvpWhatsAppMessage || defaultMessage)
            .replace(/^Confirmation RSVP envoyée depuis Michelline Invitations\s*$/gim, "")
            .replace(/\{(nom|evenement|reponse|cote|boissons)\}/g, (_, key) => replacements[key])
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    }

    async function submitRsvp(event) {
        event.preventDefault();
        const submitBtn = document.getElementById("rsvp-submit-btn") || event.submitter;

        const run = async () => {
            if (window.EventConfig?.init && !window.EventConfig.isReady?.()) {
                try { await EventConfig.init(); } catch (error) {
                    showToast("Impossible de charger la configuration de cette invitation.");
                    return;
                }
            }

            const eventConfig = window.EventConfig?.getConfig?.() || {};
            const isOpenRsvp = isOpenRsvpEvent(eventConfig);
            await resolvePersonalInviteIfNeeded(isOpenRsvp);
            prefillRsvp();
            const hasPersonalInvite = hasPersonalInviteToken(profile) && !!profile?.id;
            if (!isOpenRsvp && !hasPersonalInvite) {
                showInvitationRequiredModal();
                return;
            }
            if (hasPersonalInvite && profile.status !== "pending") {
                showAlreadyConfirmed(profile);
                return;
            }

            const payload = {
                name: (document.getElementById("rsvp-name")?.value || "").trim(),
                phone: (document.getElementById("rsvp-phone")?.value || "").trim(),
                status: document.querySelector('input[name="rsvp-status"]:checked')?.value || "yes",
                adults: document.getElementById("rsvp-adults")?.value || "1",
                children: document.getElementById("rsvp-children")?.value || "0",
                message: (document.getElementById("rsvp-message")?.value || "").trim(),
                drinkChoices: typeof window.collectSelectedDrinks === "function"
                    ? window.collectSelectedDrinks()
                    : [],
                sentAt: new Date().toISOString()
            };

            if (!payload.name || payload.name.length < 2) {
                showToast("Nom obligatoire (2 caractères minimum).");
                return;
            }
            const normalizedPhone = normalizeOptionalPhone(payload.phone);
            if (normalizedPhone === null) {
                showToast("Téléphone invalide (9 chiffres minimum). Laissez le champ vide si vous n'en avez pas.");
                return;
            }
            payload.phone = normalizedPhone;
            const openRsvpSide = document.querySelector('input[name="open-rsvp-side"]:checked')?.value || "";
            if (isOpenRsvp && !openRsvpSide) {
                showToast("Choisissez le côté homme ou femme.");
                return;
            }
            localStorage.setItem(eventStorageKey("rsvp_data"), JSON.stringify(payload));
            localStorage.setItem(eventStorageKey("rsvp_status"), payload.status);

            let updatedGuest = null;
            if (!hasPersonalInvite) {
                if (!window.CloudAPI?.isEnabled?.() || !window.CloudAPI?.submitOpenRsvp) {
                    showToast("Confirmation indisponible. Réessayez avec une connexion Internet.");
                    return;
                }
                try {
                    await CloudAPI.submitOpenRsvp(getEventId(), {
                        fullName: payload.name,
                        status: payload.status,
                        side: openRsvpSide,
                        drinkChoices: payload.drinkChoices,
                        message: payload.message
                    });
                } catch (error) {
                    showToast(error.message || "Votre réponse n'a pas été enregistrée.");
                    return;
                }
            }
            if (hasPersonalInvite && window.GuestManager) {
                const token = getParams().get("t");
                let guestByToken = null;
                if (token) {
                    try { guestByToken = await GuestManager.findByToken(token); } catch (e) {}
                }
                try {
                    updatedGuest = await GuestManager.recordRSVP({
                        guestId: guestByToken ? guestByToken.id : null,
                        fullName: payload.name,
                        phone: payload.phone,
                        status: payload.status,
                        adults: payload.adults,
                        children: payload.children,
                        message: payload.message,
                        drinkChoices: payload.drinkChoices,
                        inviteToken: token || "",
                        profilePhotoUrl: rsvpProfilePhotoUrl || unwrapGuest(guestByToken)?.profilePhotoUrl || ""
                    });
                } catch (e) {
                    if (token && window.CloudAPI && CloudAPI.isEnabled()) {
                        showToast(e.message || "Votre réponse n'a pas été enregistrée. Vérifiez votre connexion et réessayez.");
                        return;
                    }
                }
                updatedGuest = unwrapGuest(updatedGuest);
                if (token && window.CloudAPI && CloudAPI.isEnabled() && !updatedGuest) {
                    showToast("Votre réponse n'a pas été enregistrée. Vérifiez votre connexion et réessayez.");
                    return;
                }
                if (!updatedGuest || updatedGuest.token !== token || updatedGuest.eventId !== getEventId()) {
                    showToast("Votre invitation n'a pas été trouvée. Contactez l'organisateur afin d'être ajouté(e) à la liste.");
                    return;
                }
            }

            if (window.CloudAPI && EventConfig && EventConfig.isReady && EventConfig.isReady()) {
                try {
                    CloudAPI.track(getEventId(), "rsvp_submit", { status: payload.status });
                } catch (e) {}
            }
            await loadPublicRsvpMessages();

            if (typeof window.closeModal === "function") {
                window.closeModal("rsvp-modal");
            } else {
                document.getElementById("rsvp-modal")?.classList.add("hidden");
            }

            if (isOpenRsvp) {
                redirectOpenRsvpToWhatsApp(payload, eventConfig, openRsvpSide);
                return;
            }

            if (!hasPersonalInvite) {
                showConfirmation(payload, "", null);
                return;
            }

            const confirmCode = buildConfirmCode(updatedGuest || profile, payload);
            saveConfirmationCache(payload, confirmCode);
            if (updatedGuest) profile = updatedGuest;

            showConfirmation(payload, confirmCode, updatedGuest || profile);
        };

        if (window.ButtonLoading && submitBtn) {
            await ButtonLoading.whileLoading(submitBtn, run(), "Envoi en cours…");
        } else {
            await run();
        }
    }

    function bindHandlers() {
        window.confirmPresence = openRsvp;
        window.submitRsvp = submitRsvp;
        window.downloadConfirmationPass = downloadConfirmationPass;

        const rsvpForm = document.getElementById("rsvp-form");
        if (rsvpForm && !rsvpForm.dataset.guestExperienceBound) {
            rsvpForm.addEventListener("submit", submitRsvp);
            rsvpForm.dataset.guestExperienceBound = "true";
        }

        const photoInput = document.getElementById("rsvp-profile-photo");
        if (photoInput && !photoInput.dataset.guestExperienceBound) {
            photoInput.addEventListener("change", handleRsvpPhotoUpload);
            photoInput.dataset.guestExperienceBound = "true";
        }
    }

    function boot() {
        setupModalAccessibility();
        initSync();
        bindHandlers();
        initAsync().catch(() => {});
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    return {
        init: initAsync,
        initSync,
        getProfile: () => profile,
        applyProfile,
        prefillRsvp,
        openRsvp,
        submitRsvp,
        buildConfirmCode,
        showConfirmation,
        canShowQrCode,
        hasPersonalInviteToken,
        showInvitationRequiredModal,
        closeInvitationRequiredModal
    };
})();

window.GuestExperience = GuestExperience;
    window.closeInvitationRequiredModal = GuestExperience.closeInvitationRequiredModal;
window.chooseOpenRsvpContact = GuestExperience.chooseOpenRsvpContact;
