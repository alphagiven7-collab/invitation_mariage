/**
 * Parcours invité — accueil, préremplissage, RSVP, confirmation QR
 * Chargé EN DERNIER pour écraser les handlers de app.js
 */
const GuestExperience = (() => {
    let profile = null;
    let initDone = false;

    function getParams() {
        return new URLSearchParams(window.location.search);
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
        return getParams().get("event") || "yanick-keren";
    }

    function getCoupleLabel() {
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        return (cfg && cfg.subtitle) ? cfg.subtitle : "Josue & Divine";
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

    function applyProfile(guest) {
        if (!guest || !guest.fullName) return;
        profile = guest;
        window.currentGuestProfile = guest;
        window.guestName = guest.fullName;
        localStorage.setItem("wedding_guest_name_simple", guest.fullName);

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
    }

    function showPersonalWelcome(guest) {
        document.getElementById("gate-name-input-container")?.classList.add("hidden");
        document.getElementById("gate-welcome-back-container")?.classList.add("hidden");
        document.querySelector("#welcome-gate .text-gray-500.mb-5")?.classList.add("hidden");

        const personal = document.getElementById("gate-personal-container");
        if (!personal) return;
        personal.classList.remove("hidden");
        personal.classList.add("gate-personal-visible");

        const first = (guest.fullName || "Invité").split(" ")[0];
        const couple = getCoupleLabel();
        const greeting = document.getElementById("gate-personal-greeting");
        const message = document.getElementById("gate-personal-message");
        if (greeting) greeting.textContent = `Cher/Chère ${guest.fullName}`;
        if (message) {
            message.innerHTML =
                `<strong>${couple}</strong> ont le bonheur de vous inviter <strong>personnellement</strong> à célébrer leur union.<br><br>` +
                `Cette enveloppe a été préparée uniquement pour vous, <strong>${first}</strong>. ` +
                `Votre présence serait pour eux un immense bonheur.`;
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

    async function initAsync() {
        if (initDone) return !!profile;
        initDone = true;

        if (window.EventConfig && EventConfig.init) {
            try {
                await EventConfig.init();
                if (EventConfig.applyToPage) EventConfig.applyToPage();
            } catch (e) {}
        }

        const guest = await resolveGuestFromUrl();
        if (guest) {
            applyProfile(guest);
            showPersonalWelcome(guest);
            const token = getParams().get("t");
            if (token && window.CloudAPI && CloudAPI.isEnabled()) {
                try {
                    CloudAPI.track(getEventId(), "guest_link_open", { guestToken: token });
                } catch (e) {}
            }
            return true;
        }
        return false;
    }

    function prefillRsvp() {
        if (profile) {
            applyProfile(profile);
            return;
        }
        const saved = (localStorage.getItem("wedding_guest_name_simple") || "").trim();
        if (saved) applyProfile({ fullName: saved, phone: "", status: "pending", adults: 1, children: 0 });
    }

    function openRsvp() {
        prefillRsvp();
        if (typeof window.openModal === "function") {
            window.openModal("rsvp-modal");
        } else {
            document.getElementById("rsvp-modal")?.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        }
    }

    function buildConfirmCode(guest, payload) {
        const tok = (guest && guest.token) ? guest.token.slice(0, 8).toUpperCase() : "INV";
        return `YK26-${tok}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }

    function setQrImage(data) {
        const img = document.getElementById("rsvp-qr-image");
        if (!img) return;
        const fallbackUrl =
            `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}`;
        if (window.QRCode && typeof QRCode.toDataURL === "function") {
            QRCode.toDataURL(data, { width: 220, margin: 2, color: { dark: "#1a472a", light: "#ffffff" } }, (err, url) => {
                img.src = (!err && url) ? url : fallbackUrl;
            });
        } else {
            img.src = fallbackUrl;
        }
    }

    function showConfirmation(payload, code) {
        const isYes = payload.status === "yes";
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        const eventTitle = (cfg && cfg.title) ? cfg.title : "Mariage de Josue et Divine";

        document.getElementById("confirm-title").textContent = isYes
            ? "Présence confirmée avec joie"
            : "Réponse enregistrée avec gratitude";
        document.getElementById("confirm-subtitle").textContent = isYes
            ? "Nous avons hâte de vous accueillir"
            : "Merci d'avoir pris le temps de répondre";
        document.getElementById("confirm-guest-line").textContent = payload.name;
        document.getElementById("confirm-detail-line").textContent = isYes
            ? `${eventTitle} · ${payload.adults} adulte(s) · ${payload.children} enfant(s)`
            : "Vous avez indiqué ne pas pouvoir être présent(e).";
        document.getElementById("confirm-code-line").textContent = code;

        const qrData = JSON.stringify({
            code,
            event: getEventId(),
            name: payload.name,
            phone: payload.phone,
            status: payload.status,
            adults: payload.adults,
            children: payload.children,
            confirmedAt: payload.sentAt
        });
        setQrImage(qrData);

        const modal = document.getElementById("rsvp-confirmation-modal");
        if (typeof window.openModal === "function") {
            window.openModal("rsvp-confirmation-modal");
        } else if (modal) {
            modal.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        }
    }

    function validatePhone(phone) {
        return (phone || "").replace(/\D/g, "").length >= 9;
    }

    async function submitRsvp(event) {
        event.preventDefault();
        const submitBtn = document.getElementById("rsvp-submit-btn") || event.submitter;

        const run = async () => {
            prefillRsvp();

            const payload = {
                name: (document.getElementById("rsvp-name")?.value || "").trim(),
                phone: (document.getElementById("rsvp-phone")?.value || "").trim(),
                status: document.getElementById("rsvp-status")?.value || "yes",
                adults: document.getElementById("rsvp-adults")?.value || "1",
                children: document.getElementById("rsvp-children")?.value || "0",
                message: (document.getElementById("rsvp-message")?.value || "").trim(),
                sentAt: new Date().toISOString()
            };

            if (!payload.name || payload.name.length < 2) {
                showToast("Nom obligatoire (2 caractères minimum).");
                return;
            }
            if (!validatePhone(payload.phone)) {
                showToast("Téléphone invalide (9 chiffres minimum).");
                return;
            }

            localStorage.setItem("wedding_rsvp_data", JSON.stringify(payload));
            localStorage.setItem("wedding_rsvp_status", payload.status);

            if (window.GuestManager) {
                const token = getParams().get("t");
                let guestByToken = null;
                if (token) {
                    try { guestByToken = await GuestManager.findByToken(token); } catch (e) {}
                }
                try {
                    await GuestManager.recordRSVP({
                        guestId: guestByToken ? guestByToken.id : null,
                        fullName: payload.name,
                        phone: payload.phone,
                        status: payload.status,
                        adults: payload.adults,
                        children: payload.children,
                        message: payload.message
                    });
                } catch (e) {}
            }

            if (window.CloudAPI && EventConfig && EventConfig.isReady && EventConfig.isReady()) {
                try {
                    CloudAPI.track(getEventId(), "rsvp_submit", { status: payload.status });
                } catch (e) {}
            }

            if (typeof window.closeModal === "function") {
                window.closeModal("rsvp-modal");
            } else {
                document.getElementById("rsvp-modal")?.classList.add("hidden");
            }

            const confirmCode = buildConfirmCode(profile, payload);
            const token = getParams().get("t");
            if (token) {
                localStorage.setItem(`wedding_confirm_${token}`, JSON.stringify({ payload, code: confirmCode }));
            }

            showConfirmation(payload, confirmCode);
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

        const form = document.getElementById("rsvp-form");
        if (form) {
            form.addEventListener("submit", submitRsvp);
        }
    }

    function boot() {
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
        showConfirmation
    };
})();

window.GuestExperience = GuestExperience;
