/**
 * Kit promotion Michelline — QR, copie lien, export visuel, captions
 */
(function () {
    const SITE_BASE = "https://alphagiven7-collab.github.io/invitation_mariage";
    const OFFRES_URL = SITE_BASE + "/pages/offres.html";
    const SHORT_URL = SITE_BASE + "/o.html";
    const DEMO_URL = SITE_BASE + "/pages/invitation.html?event=yanick-keren";
    const WA_PHONE = "243845370370";
    const WA_DISPLAY = "+243 845 370 370";

    const CAPTIONS = {
        whatsapp: `💍 Michelline — invitations digital + impression physique\n✅ RSVP mobile · QR jour J · modèles imprimés\n👉 ${SHORT_URL}\n📱 Devis : ${WA_DISPLAY}`,
        instagram: `Votre mariage mérite une invitation à la hauteur 💌\n\nDigital : RSVP, WhatsApp, QR code\nPhysique : cartes imprimées premium\n\nTarifs sur le lien en bio\nRDC & Afrique 🌍\n\n#MariageRDC #WeddingKinshasa #InvitationDigitale #Michelline #Mariage2026`,
        facebook: `Michelline — invitations digitales & impressions physiques pour votre mariage (RDC & Afrique).\n\n✓ Enveloppe personnalisée + RSVP mobile\n✓ QR code jour J\n✓ Cartes imprimées sur mesure\n\nTarifs et démo : ${SHORT_URL}\nWhatsApp : ${WA_DISPLAY}`
    };

    function qrImgUrl(data, size) {
        return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(data)}`;
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
                toast("Copie impossible — sélectionnez le texte");
                return false;
            } finally {
                document.body.removeChild(ta);
            }
        }
    }

    function drawShareCard(canvas) {
        const w = 1080;
        const h = 1080;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");

        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#fdf2f8");
        grad.addColorStop(0.5, "#eef4ff");
        grad.addColorStop(1, "#fce8ef");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(48, 48, w - 96, h - 96, 32);
            ctx.fill();
        } else {
            ctx.fillRect(48, 48, w - 96, h - 96);
        }

        ctx.textAlign = "center";
        ctx.fillStyle = "#db2777";
        ctx.font = "italic 72px Georgia, serif";
        ctx.fillText("Michelline", w / 2, 180);

        ctx.fillStyle = "#6b7280";
        ctx.font = "600 22px Montserrat, sans-serif";
        ctx.fillText("RDC & AFRIQUE", w / 2, 230);

        ctx.fillStyle = "#1f2937";
        ctx.font = "600 36px Montserrat, sans-serif";
        ctx.fillText("Invitations digital", w / 2, 320);
        ctx.fillText("& impressions", w / 2, 368);

        ctx.fillStyle = "#4b5563";
        ctx.font = "400 26px Montserrat, sans-serif";
        ctx.fillText("RSVP · QR · WhatsApp", w / 2, 440);

        ctx.fillStyle = "#db2777";
        ctx.font = "600 28px Montserrat, sans-serif";
        ctx.fillText("Digital & impressions", w / 2, 520);

        const qrSize = 280;
        const qrX = (w - qrSize) / 2;
        const qrY = 620;
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = function () {
                ctx.fillStyle = "#fff";
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 16);
                    ctx.fill();
                } else {
                    ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
                }
                ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
                ctx.fillStyle = "#9ca3af";
                ctx.font = "500 22px Montserrat, sans-serif";
                ctx.fillText(SHORT_URL.replace("https://", ""), w / 2, qrY + qrSize + 48);
                ctx.fillStyle = "#374151";
                ctx.font = "600 24px Montserrat, sans-serif";
                ctx.fillText(WA_DISPLAY, w / 2, qrY + qrSize + 88);
                resolve();
            };
            img.onerror = resolve;
            img.src = qrImgUrl(SHORT_URL, 280);
        });
    }

    async function downloadShareCard() {
        const canvas = document.getElementById("share-export-canvas");
        if (!canvas) return;
        await drawShareCard(canvas);
        const link = document.createElement("a");
        link.download = "michelline-partage-instagram.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
        toast("Image téléchargée !");
    }

    function wireQrImages() {
        document.querySelectorAll("[data-qr-target]").forEach((img) => {
            const url = img.getAttribute("data-qr-target") === "demo" ? DEMO_URL : SHORT_URL;
            const size = img.getAttribute("data-qr-size") || "220";
            img.src = qrImgUrl(url, size);
            img.alt = "QR code vers " + url;
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
                else if (CAPTIONS[key]) copyText(CAPTIONS[key]);
            });
        });
    }

    function wireWaShare() {
        const btn = document.getElementById("share-wa-broadcast");
        if (!btn) return;
        btn.href = `https://wa.me/?text=${encodeURIComponent(CAPTIONS.whatsapp)}`;
        btn.target = "_blank";
        btn.rel = "noopener";
    }

    function initHashtags() {
        const el = document.getElementById("share-hashtags");
        if (el) {
            el.textContent = "#MariageRDC #WeddingKinshasa #InvitationDigitale #Michelline #Mariage2026 #RDC #Afrique";
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        wireQrImages();
        wireCopyButtons();
        wireWaShare();
        initHashtags();
        const dl = document.getElementById("share-download-card");
        if (dl) dl.addEventListener("click", downloadShareCard);

        document.querySelectorAll(".share-caption pre").forEach((pre) => {
            const key = pre.getAttribute("data-caption");
            if (CAPTIONS[key]) pre.textContent = CAPTIONS[key];
        });
    });

    window.ShareKit = { OFFRES_URL, SHORT_URL, DEMO_URL, copyText, downloadShareCard };
})();
