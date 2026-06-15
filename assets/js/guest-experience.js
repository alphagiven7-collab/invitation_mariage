/**
 * Parcours invité personnalisé — lien unique, accueil, préremplissage, QR
 */
const GuestExperience = (() => {
    let profile = null;

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
        if (window.EventConfig && EventConfig.isReady()) return EventConfig.getEventId();
        return getParams().get("event") || "yanick-keren";
    }

    function getCoupleLabel() {
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        return (cfg && cfg.subtitle) ? cfg.subtitle : "Yanick & Keren";
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
            el.value = val;
            el.classList.add("rsvp-prefilled");
        };

        setField("rsvp-name", guest.fullName);
        setField("rsvp-phone", guest.phone || "");
        if (guest.adults) setField("rsvp-adults", guest.adults);
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

        const first = guest.fullName.split(" ")[0];
        const couple = getCoupleLabel();
        document.getElementById("gate-personal-greeting").textContent = `Cher/Chère ${guest.fullName}`;
        document.getElementById("gate-personal-message").innerHTML =
            `<strong>${couple}</strong> ont le bonheur de vous inviter <strong>personnellement</strong> à célébrer leur union.<br><br>` +
            `Cette enveloppe a été préparée uniquement pour vous, <strong>${first}</strong>. ` +
            `Votre présence serait pour eux un immense bonheur.`;
    }

    async function resolveGuestFromUrl() {
        const params = getParams();
        const token = (params.get("t") || "").trim();
        const guestParam = (params.get("guest") || params.get("nom") || "").trim();

        if (window.GuestManager && token) {
            const byToken = await GuestManager.findByToken(token);
            if (byToken) return byToken;
        }

        if (window.GuestManager && guestParam && !guestParam.includes(" ")) {
            const bySlug = await GuestManager.findBySlug(guestParam);
            if (bySlug) return bySlug;
        }

        if (guestParam) {
            const name = guestParam.includes(" ")
                ? decodeURIComponent(guestParam.replace(/\+/g, " "))
                : slugToName(guestParam);
            return { fullName: name, phone: "", token: token || "", status: "pending" };
        }

        return null;
    }

    function prefillRsvp() {
        if (profile) {
            applyProfile(profile);
            return;
        }
        const saved = (localStorage.getItem("wedding_guest_name_simple") || "").trim();
        if (saved) applyProfile({ fullName: saved, phone: "", status: "pending" });
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
        const eventTitle = (cfg && cfg.title) ? cfg.title : "Mariage de Yanick et Keren";

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

        if (typeof window.openModal === "function") {
            window.openModal("rsvp-confirmation-modal");
        } else {
            document.getElementById("rsvp-confirmation-modal")?.classList.remove("hidden");
        }
    }

    async function init() {
        if (window.EventConfig && EventConfig.init) {
            try { await EventConfig.init(); EventConfig.applyToPage(); } catch (e) {}
        }

        const guest = await resolveGuestFromUrl();
        if (guest) {
            applyProfile(guest);
            showPersonalWelcome(guest);
            const token = getParams().get("t");
            if (token && window.CloudAPI && CloudAPI.isEnabled()) {
                CloudAPI.track(getEventId(), "guest_link_open", { guestToken: token });
            }
            return true;
        }
        return false;
    }

    return {
        init,
        getProfile: () => profile,
        applyProfile,
        prefillRsvp,
        openRsvp,
        buildConfirmCode,
        showConfirmation
    };
})();

window.GuestExperience = GuestExperience;
window.confirmPresence = function () {
    GuestExperience.openRsvp();
};
