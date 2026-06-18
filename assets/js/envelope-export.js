/**
 * Export PNG enveloppe + QR par invité (admin / WhatsApp)
 */
const EnvelopeExport = (() => {
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    function formatEventDate(cfg) {
        if (!cfg || !cfg.eventDate) return "";
        try {
            return new Date(cfg.eventDate).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
            });
        } catch {
            return "";
        }
    }

    async function qrDataUrl(url) {
        if (window.QRCode && QRCode.toDataURL) {
            return new Promise((resolve) => {
                QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: "#5c2032", light: "#ffffff" } }, (err, data) => {
                    resolve(!err && data ? data : null);
                });
            });
        }
        return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
    }

    async function drawEnvelopePng(guest, options = {}) {
        const cfg = window.EventConfig && EventConfig.getConfig ? EventConfig.getConfig() : {};
        const eventId = options.eventId || (EventConfig && EventConfig.getEventId()) || "yanick-keren";
        const checkUrl = CheckinUrl.buildCheckInUrl(guest, eventId);
        const inviteUrl = GuestManager.buildInviteLink(guest);
        const qrTarget = guest.status === "yes" && checkUrl ? checkUrl : inviteUrl;

        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = 1280;
        const ctx = canvas.getContext("2d");

        const grad = ctx.createLinearGradient(0, 0, 900, 1280);
        grad.addColorStop(0, "#f9f5f0");
        grad.addColorStop(0.5, "#f5e6e8");
        grad.addColorStop(1, "#faf6f1");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "rgba(201, 169, 98, 0.5)";
        ctx.lineWidth = 3;
        roundRect(ctx, 40, 40, 820, 1200, 28);
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = "#c9a962";
        ctx.fillRect(420, 55, 60, 2);

        ctx.fillStyle = "#6b2c3e";
        ctx.font = "italic 52px Georgia, 'Great Vibes', serif";
        ctx.fillText((cfg.subtitle || cfg.title || "Invitation").replace(/\s+et\s+/i, " & "), 450, 130);

        const dateLabel = formatEventDate(cfg);
        if (dateLabel) {
            ctx.font = "600 20px Montserrat, sans-serif";
            ctx.fillStyle = "#8b6b6b";
            ctx.fillText(dateLabel, 450, 175);
        }

        ctx.fillStyle = "rgba(255,255,255,0.85)";
        roundRect(ctx, 120, 220, 660, 380, 20);
        ctx.fill();
        ctx.strokeStyle = "rgba(201, 169, 98, 0.35)";
        ctx.lineWidth = 2;
        roundRect(ctx, 120, 220, 660, 380, 20);
        ctx.stroke();

        ctx.fillStyle = "#6b2c3e";
        ctx.font = "700 36px Georgia, serif";
        ctx.fillText(guest.fullName || "Invité(e)", 450, 310);

        const first = (guest.fullName || "").split(" ")[0];
        ctx.font = "400 22px Montserrat, sans-serif";
        ctx.fillStyle = "#5c4f4f";
        ctx.fillText(`${first}, ouvrez votre enveloppe`, 450, 360);
        ctx.font = "400 18px Montserrat, sans-serif";
        ctx.fillStyle = "#8b6b6b";
        ctx.fillText("Scannez le QR pour confirmer votre entrée le jour J", 450, 400);

        const qrSrc = await qrDataUrl(qrTarget);
        const qrImg = await loadImage(qrSrc);
        const qs = 260;
        const qx = (900 - qs) / 2;
        const qy = 640;
        ctx.fillStyle = "#fff";
        roundRect(ctx, qx - 14, qy - 14, qs + 28, qs + 28, 16);
        ctx.fill();
        ctx.drawImage(qrImg, qx, qy, qs, qs);

        ctx.fillStyle = "#a89090";
        ctx.font = "500 16px Montserrat, sans-serif";
        ctx.fillText("Michelline · Invitation digitale", 450, 960);

        return canvas;
    }

    async function downloadForGuest(guest) {
        try {
            const canvas = await drawEnvelopePng(guest);
            const slug = (guest.fullName || "invite").replace(/[^\w\-]+/g, "_").slice(0, 36);
            const link = document.createElement("a");
            link.download = `enveloppe-${slug}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            return true;
        } catch (e) {
            console.warn("EnvelopeExport", e);
            return false;
        }
    }

    return { downloadForGuest, drawEnvelopePng };
})();

window.EnvelopeExport = EnvelopeExport;
