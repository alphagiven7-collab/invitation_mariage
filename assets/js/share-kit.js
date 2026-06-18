/**
 * Kit promotion Michelline — v2 efficacité
 */
(function () {
    const SITE_BASE = "https://alphagiven7-collab.github.io/invitation_mariage";
    const OFFRES_URL = SITE_BASE + "/pages/offres.html";
    const SHORT_URL = SITE_BASE + "/o.html";
    const DEMO_URL = SITE_BASE + "/pages/invitation.html?event=yanick-keren";
    const WA_PHONE = "243845370370";
    const WA_DISPLAY = "+243 845 370 370";
    const BRAND = "Michelline";
    const CHECKLIST_KEY = "michelline_share_kit_checks";
    const PREVIEW_BASE = "../assets/images/previews/";
    const IMAGES_BASE = "../assets/images/";

    /** Galerie téléchargeable complète (Phase 1) */
    const GALLERY_ASSETS = [
        { file: "previews/preview-accueil.png", label: "Aperçu — Accueil hub", group: "Aperçus pages" },
        { file: "previews/preview-offres.png", label: "Aperçu — Offres", group: "Aperçus pages" },
        { file: "previews/preview-kit.png", label: "Aperçu — Kit promo", group: "Aperçus pages" },
        { file: "previews/preview-demo.png", label: "Aperçu — Démo invitation", group: "Aperçus pages" },
        { file: "michelline-hero-envelopes.png", label: "Hero enveloppes", group: "Visuels marque" },
        { file: "prints/envelope-classique.png", label: "Enveloppe Classique", group: "Modèles imprimés" },
        { file: "prints/envelope-elegance.png", label: "Enveloppe Élégance Rose", group: "Modèles imprimés" },
        { file: "prints/envelope-prestige.png", label: "Enveloppe Prestige Doré", group: "Modèles imprimés" },
    ];

    /** Liens publics — URL + image d'aperçu de la page destination */
    const PUBLIC_LINKS = {
        hub: {
            url: SITE_BASE + "/",
            label: "Accueil public",
            desc: "Hub Michelline — porte d'entrée du site",
            preview: "preview-accueil.png",
            copyKey: "hub",
        },
        short: {
            url: SHORT_URL,
            label: "Lien court o.html",
            desc: "Redirige vers les offres — idéal bio & statuts",
            preview: "preview-offres.png",
            copyKey: "short",
        },
        offres: {
            url: OFFRES_URL,
            label: "Page offres complète",
            desc: "Tarifs 25 / 50 / 75 $ · numérique & cartes",
            preview: "preview-offres.png",
            copyKey: "offres",
        },
        kit: {
            url: SITE_BASE + "/pages/partager.html",
            label: "Kit promotion",
            desc: "QR, visuels, textes — outils de partage",
            preview: "preview-kit.png",
            copyKey: "kit",
        },
        demo: {
            url: DEMO_URL,
            label: "Démo invitation live",
            desc: "Enveloppe · RSVP · QR · menu boissons",
            preview: "preview-demo.png",
            copyKey: "demo",
        },
    };

    const HASHTAGS = "#MariageRDC #WeddingKinshasa #InvitationDigitale #Michelline #Mariage2026 #RDC #Afrique #MariageCongolais #SaveTheDate";

    const CAPTIONS = {
        whatsapp: `💍 ${BRAND} — invitations numériques + cartes imprimées\n\n✅ Enveloppe digitale sur WhatsApp\n✅ RSVP en 30 sec · QR jour J\n✅ Dès 25 $ · Premium 50 $ (+ 30 cartes)\n\n👉 ${SHORT_URL}\n📱 Devis : ${WA_DISPLAY}`,

        whatsapp_demo: `✨ Voyez une vraie invitation en action 👇\n\nEnveloppe personnalisée → RSVP → QR code jour J\n\n🔗 Démo live :\n${DEMO_URL}\n\n💬 Devis : ${WA_DISPLAY}`,

        whatsapp_tarifs: `💌 Tarifs ${BRAND} (RDC & Afrique)\n\n• Essentiel — 25 $ (80 invités)\n• Premium — 50 $ (200 invités + 30 cartes)\n• Platinum — 75 $ (500 invités + 50 cartes Élégance)\n\n👉 ${SHORT_URL}\n📱 ${WA_DISPLAY}`,

        whatsapp_print: `🖨️ Cartes & enveloppes imprimées — ${BRAND}\n\nClassique · Élégance Rose · Prestige Doré\nCombo digital + papier : −10 %\n\nOffres : ${SHORT_URL}\nWhatsApp : ${WA_DISPLAY}`,

        whatsapp_dm: `Bonjour [Prénom] 👋\n\nJe suis [Votre nom], ${BRAND} — invitations numériques pour mariages (RDC & diaspora).\n\nVos invités reçoivent une enveloppe sur WhatsApp, confirment en ligne (RSVP) et un QR code le jour J.\n\n✨ Démo : ${DEMO_URL}\n💰 Tarifs : ${SHORT_URL}\n\nDate prévue : [Date] · Combien d'invités environ ?`,

        whatsapp_relance: `Bonjour [Prénom] 😊\n\nPetit rappel — avez-vous pu voir la démo d'invitation ${BRAND} ?\n\n🔗 ${DEMO_URL}\n\nJe peux vous envoyer un devis sur mesure en 2 min.`,

        whatsapp_story: `💍 Invitation numérique dès 25 $\nRSVP · QR · WhatsApp\n👇 ${SHORT_URL}`,

        instagram: `Votre mariage mérite une invitation à la hauteur 💌\n\n📲 Enveloppe digitale + RSVP mobile\n📱 QR code jour J\n🖨️ Cartes physiques en option\n\nDès 25 $ · Premium 50 $ (+ 30 cartes)\n\nLien en bio 👇\nRDC & Afrique 🌍`,

        instagram_reel: `POV : vos invités reçoivent leur invitation sur WhatsApp 💍\n\nRSVP en 30 sec · QR jour J · Diaspora incluse\n\n${BRAND} — dès 25 $\n\n#MariageRDC #Michelline`,

        instagram_story: `Invitation numérique 💌\nRSVP + QR + WhatsApp\nDès 25 $ → lien en bio`,

        facebook: `${BRAND} — invitations numériques & cartes imprimées (RDC & Afrique).\n\n✓ Enveloppe personnalisée + RSVP mobile\n✓ QR code jour J (accès, table, boissons)\n✓ Cartes Classique / Élégance / Prestige\n\nTarifs : ${SHORT_URL}\nDémo live : ${DEMO_URL}\nWhatsApp : ${WA_DISPLAY}`,

        tiktok: `Invitation mariage version 2026 💍\n\nPlus de cartes perdues — tout sur le téléphone 📲\nRSVP live + QR jour J\n\n${BRAND} · dès 25 $\nLien : ${SHORT_URL}`,

        bio_whatsapp: `${BRAND} 💍 Invitations numériques · RSVP · QR\nDès 25 $ · RDC & Afrique\n👉 ${SHORT_URL}`,

        bio_instagram: `💍 Invitations numériques · RSVP · QR\nRDC & Afrique 🌍\nDès 25 $ · Premium + cartes\n👇 Offres & démo`,

        group_facebook: `Bonjour le groupe 👋\n\nJe partage ${BRAND} — invitations numériques pour mariages (RSVP, WhatsApp, QR jour J). Démo gratuite :\n${DEMO_URL}\n\nTarifs : ${SHORT_URL}\n(Pas de spam — pour couples en préparation 🙏)`,
    };

    /** Statut WhatsApp du jour (rotation L→D) */
    const DAILY_STATUS = [
        "whatsapp",
        "whatsapp_demo",
        "whatsapp_tarifs",
        "whatsapp_print",
        "whatsapp",
        "whatsapp_demo",
        "whatsapp_story",
    ];

    function qrImgUrl(data, size) {
        return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(data)}`;
    }

    function toast(msg) {
        let el = document.getElementById("share-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "share-toast";
            el.className = "share-toast";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add("share-toast--show");
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove("share-toast--show"), 2200);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            toast("Copié !");
            return true;
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
                toast("Copié !");
                return true;
            } catch {
                toast("Sélectionnez le texte manuellement");
                return false;
            } finally {
                document.body.removeChild(ta);
            }
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }
    }

    function drawBaseCard(ctx, w, h, opts) {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#fdf2f8");
        grad.addColorStop(0.5, "#eef4ff");
        grad.addColorStop(1, "#fce8ef");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "rgba(255,255,255,0.8)";
        roundRect(ctx, 48, 48, w - 96, h - 96, 32);
        ctx.fill();

        ctx.textAlign = "center";
        ctx.fillStyle = "#db2777";
        ctx.font = "italic 72px Georgia, 'Great Vibes', serif";
        ctx.fillText(BRAND, w / 2, opts.titleY || 195);

        ctx.fillStyle = "#6b7280";
        ctx.font = "600 22px Montserrat, sans-serif";
        ctx.fillText("RDC & AFRIQUE", w / 2, (opts.titleY || 195) + 55);

        if (opts.headline) {
            ctx.fillStyle = "#1f2937";
            ctx.font = "600 34px Montserrat, sans-serif";
            ctx.fillText(opts.headline, w / 2, (opts.titleY || 195) + 120);
        }
        if (opts.subline) {
            ctx.fillStyle = "#4b5563";
            ctx.font = "400 24px Montserrat, sans-serif";
            ctx.fillText(opts.subline, w / 2, (opts.titleY || 195) + 162);
        }
    }

    function loadQr(url, size) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = qrImgUrl(url, size);
        });
    }

    async function drawFeedCard(canvas) {
        const w = 1080;
        const h = 1080;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        drawBaseCard(ctx, w, h, {
            headline: "Invitations numériques",
            subline: "RSVP · QR · WhatsApp",
        });
        const qr = await loadQr(SHORT_URL, 280);
        const qrSize = 280;
        const qrX = (w - qrSize) / 2;
        const qrY = 520;
        if (qr) {
            ctx.fillStyle = "#fff";
            roundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 16);
            ctx.fill();
            ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
        }
        ctx.fillStyle = "#9ca3af";
        ctx.font = "500 20px Montserrat, sans-serif";
        ctx.fillText(SHORT_URL.replace("https://", ""), w / 2, qrY + qrSize + 44);
        ctx.fillStyle = "#374151";
        ctx.font = "600 22px Montserrat, sans-serif";
        ctx.fillText("Dès 25 $ · " + WA_DISPLAY, w / 2, qrY + qrSize + 82);
    }

    async function drawStoryCard(canvas) {
        const w = 1080;
        const h = 1920;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#4c1d95");
        grad.addColorStop(0.4, "#831843");
        grad.addColorStop(1, "#1f2937");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = "center";
        ctx.fillStyle = "#fbcfe8";
        ctx.font = "italic 96px Georgia, 'Great Vibes', serif";
        ctx.fillText(BRAND, w / 2, 280);

        ctx.fillStyle = "#fff";
        ctx.font = "600 42px Montserrat, sans-serif";
        ctx.fillText("Invitation numérique", w / 2, 420);
        ctx.font = "400 32px Montserrat, sans-serif";
        ctx.fillText("RSVP · QR · WhatsApp", w / 2, 480);

        ctx.fillStyle = "#f9a8d4";
        ctx.font = "700 56px Montserrat, sans-serif";
        ctx.fillText("Dès 25 $", w / 2, 600);

        const qr = await loadQr(SHORT_URL, 320);
        const qrSize = 320;
        const qrY = 720;
        const qrX = (w - qrSize) / 2;
        if (qr) {
            ctx.fillStyle = "#fff";
            roundRect(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 20);
            ctx.fill();
            ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
        }
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "500 24px Montserrat, sans-serif";
        ctx.fillText("Scannez · o.html", w / 2, qrY + qrSize + 60);
        ctx.fillText(WA_DISPLAY, w / 2, qrY + qrSize + 100);
    }

    async function drawTarifsCard(canvas) {
        const w = 1080;
        const h = 1080;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        drawBaseCard(ctx, w, h, { titleY: 160, headline: "Forfaits numériques", subline: "" });

        const plans = [
            { name: "Essentiel", price: "25 $", detail: "80 invités · RSVP" },
            { name: "Premium ⭐", price: "50 $", detail: "200 invités · +30 cartes" },
            { name: "Platinum", price: "75 $", detail: "500 invités · +50 cartes" },
        ];
        let y = 340;
        plans.forEach((p) => {
            ctx.fillStyle = "#f9fafb";
            roundRect(ctx, 120, y, w - 240, 100, 16);
            ctx.fill();
            ctx.textAlign = "left";
            ctx.fillStyle = "#1f2937";
            ctx.font = "600 28px Montserrat, sans-serif";
            ctx.fillText(p.name, 150, y + 40);
            ctx.fillStyle = "#db2777";
            ctx.font = "700 32px Montserrat, sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(p.price, w - 150, y + 40);
            ctx.textAlign = "left";
            ctx.fillStyle = "#6b7280";
            ctx.font = "400 22px Montserrat, sans-serif";
            ctx.fillText(p.detail, 150, y + 78);
            y += 120;
        });
        ctx.textAlign = "center";
        ctx.fillStyle = "#374151";
        ctx.font = "600 24px Montserrat, sans-serif";
        ctx.fillText(WA_DISPLAY, w / 2, y + 40);
        ctx.fillStyle = "#9ca3af";
        ctx.font = "500 20px Montserrat, sans-serif";
        ctx.fillText(SHORT_URL.replace("https://", ""), w / 2, y + 78);
    }

    async function downloadCanvas(canvas, filename) {
        const link = document.createElement("a");
        link.download = filename;
        link.href = canvas.toDataURL("image/png");
        link.click();
        toast("Image téléchargée !");
    }

    function wireQrImages() {
        document.querySelectorAll("[data-qr-target]").forEach((img) => {
            const target = img.getAttribute("data-qr-target");
            let url = SHORT_URL;
            if (target === "demo") url = DEMO_URL;
            else if (target === "offres") url = OFFRES_URL;
            const size = img.getAttribute("data-qr-size") || "220";
            img.src = qrImgUrl(url, size);
        });
    }

    function wireCopyButtons() {
        document.querySelectorAll("[data-copy]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = btn.getAttribute("data-copy");
                if (key === "short") copyText(SHORT_URL);
                else if (key === "offres") copyText(OFFRES_URL);
                else if (key === "demo") copyText(DEMO_URL);
                else if (key === "wa") copyText(`https://wa.me/${WA_PHONE}`);
                else if (key === "hub") copyText(SITE_BASE + "/");
                else if (key === "kit") copyText(SITE_BASE + "/pages/partager.html");
                else if (key === "hashtags") copyText(HASHTAGS);
                else if (key === "daily") {
                    const dayKey = DAILY_STATUS[new Date().getDay()];
                    copyText(CAPTIONS[dayKey] || CAPTIONS.whatsapp);
                } else if (CAPTIONS[key]) copyText(CAPTIONS[key]);
            });
        });
    }

    function wireCaptionTabs() {
        const tabs = document.querySelectorAll(".share-msg-tab");
        const panels = document.querySelectorAll(".share-msg-panel");
        if (!tabs.length) return;

        function showPanel(key) {
            panels.forEach((p) => {
                p.hidden = p.getAttribute("data-panel") !== key;
            });
            tabs.forEach((t) => {
                t.classList.toggle("share-msg-tab--active", t.getAttribute("data-tab") === key);
            });
        }

        tabs.forEach((tab) => {
            tab.addEventListener("click", () => showPanel(tab.getAttribute("data-tab")));
        });

        document.querySelectorAll(".share-msg-panel pre[data-caption]").forEach((pre) => {
            const key = pre.getAttribute("data-caption");
            if (CAPTIONS[key]) pre.textContent = CAPTIONS[key];
        });
    }

    function initDailyStatus() {
        const el = document.getElementById("share-daily-status");
        const pre = document.getElementById("share-daily-pre");
        if (!el || !pre) return;
        const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
        const key = DAILY_STATUS[new Date().getDay()];
        el.textContent = "Statut recommandé — " + days[new Date().getDay()];
        pre.textContent = CAPTIONS[key] || CAPTIONS.whatsapp;
    }

    function wireWaShare() {
        const btn = document.getElementById("share-wa-broadcast");
        if (!btn) return;
        const dayKey = DAILY_STATUS[new Date().getDay()];
        btn.href = `https://wa.me/?text=${encodeURIComponent(CAPTIONS[dayKey] || CAPTIONS.whatsapp)}`;
        btn.target = "_blank";
        btn.rel = "noopener";
    }

    async function downloadGalleryAsset(asset) {
        const link = document.createElement("a");
        link.href = IMAGES_BASE + asset.file + "?v=49";
        link.download = asset.file.split("/").pop();
        link.click();
    }

    async function downloadAllGallery() {
        toast("Téléchargement de " + GALLERY_ASSETS.length + " images…");
        for (let i = 0; i < GALLERY_ASSETS.length; i += 1) {
            await downloadGalleryAsset(GALLERY_ASSETS[i]);
            await new Promise((r) => setTimeout(r, 400));
        }
        toast("Galerie téléchargée !");
    }

    function renderGallery() {
        const root = document.getElementById("share-gallery-grid");
        if (!root) return;
        root.innerHTML = "";
        GALLERY_ASSETS.forEach((asset, idx) => {
            const item = document.createElement("article");
            item.className = "share-gallery-item";
            item.innerHTML = `
                <img src="${IMAGES_BASE}${asset.file}?v=49" alt="${asset.label}" loading="lazy" width="320" height="200">
                <div class="share-gallery-item-body">
                    <span class="share-gallery-tag">${asset.group}</span>
                    <p><strong>${asset.label}</strong></p>
                    <button type="button" class="share-btn share-btn--outline share-btn--tiny" data-gallery-dl="${idx}">Télécharger</button>
                </div>`;
            root.appendChild(item);
        });
        root.querySelectorAll("[data-gallery-dl]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const asset = GALLERY_ASSETS[Number(btn.getAttribute("data-gallery-dl"))];
                if (asset) downloadGalleryAsset(asset);
                toast("Téléchargement lancé");
            });
        });
    }

    function wireGallery() {
        renderGallery();
        document.getElementById("share-download-all-gallery")?.addEventListener("click", downloadAllGallery);
    }

    function wireDownloads() {
        const canvas = document.getElementById("share-export-canvas");
        if (!canvas) return;

        const map = {
            "share-download-feed": () => drawFeedCard(canvas).then(() => downloadCanvas(canvas, "michelline-feed-1080.png")),
            "share-download-story": () => drawStoryCard(canvas).then(() => downloadCanvas(canvas, "michelline-story-1080x1920.png")),
            "share-download-tarifs": () => drawTarifsCard(canvas).then(() => downloadCanvas(canvas, "michelline-tarifs-1080.png")),
        };

        Object.keys(map).forEach((id) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener("click", map[id]);
        });

        document.querySelectorAll("[data-qr-download]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const target = btn.getAttribute("data-qr-download");
                let url = SHORT_URL;
                if (target === "demo") url = DEMO_URL;
                else if (target === "offres") url = OFFRES_URL;
                window.open(qrImgUrl(url, 600), "_blank");
                toast("QR ouvert — enregistrez l'image");
            });
        });
    }

    function saveChecklist() {
        const states = [];
        document.querySelectorAll(".share-checklist input[type=checkbox]").forEach((cb) => {
            states.push(cb.checked ? "1" : "0");
        });
        try {
            localStorage.setItem(CHECKLIST_KEY, states.join(""));
        } catch {
            /* ignore */
        }
    }

    function restoreChecklist() {
        let raw = "";
        try {
            raw = localStorage.getItem(CHECKLIST_KEY) || "";
        } catch {
            return;
        }
        document.querySelectorAll(".share-checklist input[type=checkbox]").forEach((cb, i) => {
            cb.checked = raw[i] === "1";
        });
    }

    function wireChecklist() {
        restoreChecklist();
        document.querySelectorAll(".share-checklist input[type=checkbox]").forEach((cb) => {
            cb.addEventListener("change", saveChecklist);
        });
    }

    function wirePreviewDownloads() {
        document.querySelectorAll("[data-preview-download]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const file = btn.getAttribute("data-preview-download");
                const link = document.createElement("a");
                link.href = PREVIEW_BASE + file + "?v=47";
                link.download = file;
                link.click();
                toast("Image aperçu téléchargée");
            });
        });
    }

    function initHashtags() {
        const el = document.getElementById("share-hashtags");
        if (el) el.textContent = HASHTAGS;
    }

    document.addEventListener("DOMContentLoaded", () => {
        wireQrImages();
        wireCopyButtons();
        wireCaptionTabs();
        wireWaShare();
        wireDownloads();
        wireChecklist();
        wirePreviewDownloads();
        wireGallery();
        initHashtags();
        initDailyStatus();
    });

    window.ShareKit = { OFFRES_URL, SHORT_URL, DEMO_URL, PUBLIC_LINKS, CAPTIONS, GALLERY_ASSETS, copyText };
})();
