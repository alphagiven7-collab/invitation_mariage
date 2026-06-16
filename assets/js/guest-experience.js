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
        if (Array.isArray(guest.drinkChoices) && guest.drinkChoices.length && window.DrinkMenu) {
            DrinkMenu.setSelected(guest.drinkChoices);
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

    async function tryRestoreConfirmation() {
        if (!window.GuestManager) return;
        const token = (getParams().get("t") || "").trim();
        let guest = null;
        let saved = null;

        if (token) {
            try { guest = await GuestManager.findByToken(token); } catch (e) {}
            saved = localStorage.getItem(`wedding_confirm_${token}`);
        } else {
            const name = (localStorage.getItem("wedding_guest_name_simple") || "").trim();
            if (name) {
                try { guest = await GuestManager.findByName(name); } catch (e) {}
                saved = localStorage.getItem(`wedding_confirm_name_${slugify(name)}`);
            }
        }

        if (!saved || !guest || guest.status !== "yes") return;
        try {
            const data = JSON.parse(saved);
            if (canShowQrCode(guest, data.payload)) {
                setTimeout(() => showConfirmation(data.payload, data.code, guest), 800);
            }
        } catch (e) {}
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
            await tryRestoreConfirmation();
            return true;
        }
        await tryRestoreConfirmation();
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

    function buildQrPayload(payload, code, guest) {
        const drinks = payload.drinkChoices || guest?.drinkChoices || [];
        return JSON.stringify({
            code,
            accessCode: buildAccessCode(guest) || code,
            table: getGuestTableLabel(guest),
            drinks: Array.isArray(drinks) ? drinks : [],
            event: getEventId(),
            name: payload.name,
            phone: payload.phone,
            status: payload.status,
            adults: payload.adults,
            children: payload.children,
            confirmedAt: payload.sentAt,
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
        return !!(payload && payload.status === "yes");
    }

    function saveConfirmationCache(payload, code) {
        const token = (getParams().get("t") || "").trim();
        const data = JSON.stringify({ payload, code });
        if (token) {
            localStorage.setItem(`wedding_confirm_${token}`, data);
        }
        if (payload.name) {
            localStorage.setItem(`wedding_confirm_name_${slugify(payload.name)}`, data);
        }
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

    function showConfirmation(payload, code, guest) {
        const resolvedGuest = guest || profile;
        const isYes = payload.status === "yes";
        const showQr = canShowQrCode(resolvedGuest, payload);
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        const eventTitle = (cfg && cfg.title) ? cfg.title : "Mariage de Josue et Divine";
        const meta = getConfirmationMeta();
        const accessCode = buildAccessCode(resolvedGuest) || code;
        const tableLabel = getGuestTableLabel(resolvedGuest);
        const drinks = payload.drinkChoices || resolvedGuest?.drinkChoices || [];
        const drinksLabel = drinks.length ? drinks.join(" · ") : "Non précisé";

        document.getElementById("confirm-title").textContent = isYes
            ? "Présence confirmée avec joie"
            : "Réponse enregistrée avec gratitude";
        document.getElementById("confirm-subtitle").textContent = isYes
            ? "Votre place est réservée — gardez cette carte pour le jour J"
            : "Merci d'avoir pris le temps de répondre";
        document.getElementById("confirm-guest-line").textContent = payload.name;
        document.getElementById("confirm-detail-line").textContent = isYes
            ? `${eventTitle} · ${payload.adults} adulte(s) · ${payload.children} enfant(s)`
            : "Vous avez indiqué ne pas pouvoir être présent(e).";

        const coupleWrap = document.getElementById("confirm-couple-photos");
        const photoLeft = document.getElementById("confirm-photo-left");
        const photoRight = document.getElementById("confirm-photo-right");
        const leftUrl = (resolvedGuest && resolvedGuest.profilePhotoUrl) || meta.couplePhotoLeft || "";
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
        if (isYes && infoGrid && accessEl && tableEl && drinksEl) {
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
        const downloadBtn = document.getElementById("confirm-download-btn");

        if (showQr) {
            if (codeLine) {
                codeLine.textContent = `Code : ${accessCode}`;
                codeLine.classList.remove("hidden");
            }
            setQrImage(buildQrPayload(payload, accessCode, resolvedGuest));
            if (qrWrap) qrWrap.classList.remove("hidden");
            if (pendingWrap) pendingWrap.classList.add("hidden");
            if (qrHint) {
                qrHint.textContent = "Scannez ce QR à l'entrée : code d'accès, table et boissons inclus.";
                qrHint.classList.remove("hidden");
            }
            if (downloadBtn) downloadBtn.classList.remove("hidden");
            lastConfirmationExport = { payload, accessCode, tableLabel, drinksLabel, eventTitle, guest: resolvedGuest, meta };
        } else {
            if (qrWrap) qrWrap.classList.add("hidden");
            if (pendingWrap) pendingWrap.classList.add("hidden");
            if (codeLine) codeLine.classList.add("hidden");
            if (qrHint) qrHint.classList.add("hidden");
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

        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });

        try {
            const canvas = document.createElement("canvas");
            canvas.width = 900;
            canvas.height = 1280;
            const ctx = canvas.getContext("2d");
            const gradient = ctx.createLinearGradient(0, 0, 900, 1280);
            gradient.addColorStop(0, "#ecfdf5");
            gradient.addColorStop(1, "#fff1f2");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "#0f766e";
            ctx.fillRect(0, 0, canvas.width, 180);
            ctx.fillStyle = "#ffffff";
            ctx.font = "700 42px Georgia, serif";
            ctx.textAlign = "center";
            ctx.fillText("Carte d'accès", canvas.width / 2, 70);
            ctx.font = "400 24px Arial, sans-serif";
            ctx.fillText(data.eventTitle, canvas.width / 2, 120);

            ctx.fillStyle = "#0f172a";
            ctx.font = "700 36px Georgia, serif";
            ctx.fillText(data.payload.name, canvas.width / 2, 250);
            ctx.font = "400 22px Arial, sans-serif";
            ctx.fillStyle = "#475569";
            ctx.fillText(`${data.payload.adults} adulte(s) · ${data.payload.children} enfant(s)`, canvas.width / 2, 295);

            const boxY = 340;
            const boxH = 220;
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 2;
            roundRect(ctx, 60, boxY, canvas.width - 120, boxH, 20, true, true);
            ctx.fillStyle = "#64748b";
            ctx.font = "600 18px Arial, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("CODE D'ACCÈS", 90, boxY + 45);
            ctx.fillStyle = "#0f172a";
            ctx.font = "700 34px monospace";
            ctx.fillText(data.accessCode, 90, boxY + 85);
            ctx.fillStyle = "#64748b";
            ctx.font = "600 18px Arial, sans-serif";
            ctx.fillText("TABLE", 90, boxY + 130);
            ctx.fillStyle = "#0f172a";
            ctx.font = "700 28px Arial, sans-serif";
            ctx.fillText(data.tableLabel, 90, boxY + 165);
            ctx.fillStyle = "#64748b";
            ctx.font = "600 18px Arial, sans-serif";
            ctx.fillText("BOISSONS", 470, boxY + 130);
            ctx.fillStyle = "#0f172a";
            ctx.font = "700 22px Arial, sans-serif";
            wrapText(ctx, data.drinksLabel, 470, boxY + 165, 340, 28);

            const qr = await loadImage(qrImg.src);
            const qrSize = 320;
            const qrX = (canvas.width - qrSize) / 2;
            const qrY = 610;
            ctx.fillStyle = "#ffffff";
            roundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 24, true, true);
            ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

            ctx.fillStyle = "#64748b";
            ctx.font = "400 20px Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Présentez ce QR code le jour J", canvas.width / 2, 980);

            const slug = (data.payload.name || "invite").replace(/[^\w\-]+/g, "_").slice(0, 40);
            const link = document.createElement("a");
            link.download = `carte-acces-${slug}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            showToast("Carte téléchargée.");
        } catch (e) {
            showToast("Téléchargement impossible — réessayez.");
        }
    }

    function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = String(text || "").split(" ");
        let line = "";
        let drawY = y;
        for (let i = 0; i < words.length; i += 1) {
            const test = `${line}${words[i]} `;
            if (ctx.measureText(test).width > maxWidth && i > 0) {
                ctx.fillText(line, x, drawY);
                line = `${words[i]} `;
                drawY += lineHeight;
            } else {
                line = test;
            }
        }
        ctx.fillText(line, x, drawY);
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
                drinkChoices: typeof window.collectSelectedDrinks === "function"
                    ? window.collectSelectedDrinks()
                    : [],
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

            let updatedGuest = null;
            if (window.GuestManager) {
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
                        inviteToken: token || ""
                    });
                } catch (e) {}
                if (!updatedGuest && payload.name) {
                    try { updatedGuest = await GuestManager.findByName(payload.name); } catch (e) {}
                }
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
        showConfirmation,
        canShowQrCode,
        hasPersonalInviteToken
    };
})();

window.GuestExperience = GuestExperience;
