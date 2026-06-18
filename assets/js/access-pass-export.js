/**
 * Carte d'accès premium — rendu canvas (invitation physique)
 */
const AccessPassExport = (() => {
    const W = 900;
    const H = 1280;

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
            if (!src) {
                reject(new Error("no src"));
                return;
            }
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("load failed"));
            img.src = src;
        });
    }

    function drawPaperBase(ctx) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#faf6f1");
        g.addColorStop(0.5, "#f5ebe3");
        g.addColorStop(1, "#f9f5f0");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    async function drawCoupleBackground(ctx, url) {
        if (!url) return false;
        try {
            const img = await loadImage(url);
            ctx.save();
            roundRect(ctx, 36, 36, W - 72, H - 72, 28);
            ctx.clip();
            const scale = Math.max(W / img.width, H / img.height);
            const iw = img.width * scale;
            const ih = img.height * scale;
            ctx.globalAlpha = 0.38;
            ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
            ctx.globalAlpha = 1;
            ctx.fillStyle = "rgba(249, 245, 240, 0.72)";
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
            return true;
        } catch {
            return false;
        }
    }

    function drawCornerFlorals(ctx) {
        const spots = [
            [0, 0], [W, 0], [0, H], [W, H]
        ];
        spots.forEach(([cx, cy], i) => {
            ctx.save();
            ctx.translate(cx, cy);
            if (i === 1 || i === 3) ctx.scale(-1, 1);
            if (i >= 2) ctx.scale(1, -1);
            for (let p = 0; p < 5; p++) {
                ctx.fillStyle = `rgba(212, 165, 165, ${0.22 - p * 0.02})`;
                ctx.beginPath();
                ctx.ellipse(40 + p * 8, 30 + p * 6, 28 - p * 3, 20 - p * 2, 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = "rgba(201, 169, 98, 0.25)";
            ctx.beginPath();
            ctx.arc(55, 45, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    function drawGoldFrame(ctx) {
        ctx.strokeStyle = "#c9a962";
        ctx.lineWidth = 3;
        roundRect(ctx, 36, 36, W - 72, H - 72, 28);
        ctx.stroke();
        ctx.lineWidth = 1;
        roundRect(ctx, 48, 48, W - 96, H - 96, 22);
        ctx.stroke();
    }

    async function drawGuestMedallion(ctx, url, y) {
        const r = 78;
        const cx = W / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#c9a962";
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, y, r, 0, Math.PI * 2);
        ctx.clip();
        if (url) {
            try {
                const img = await loadImage(url);
                const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
                const iw = img.width * scale;
                const ih = img.height * scale;
                ctx.drawImage(img, cx - iw / 2, y - ih / 2, iw, ih);
            } catch {
                ctx.fillStyle = "#e8dcd4";
                ctx.fillRect(cx - r, y - r, r * 2, r * 2);
            }
        } else {
            ctx.fillStyle = "#e8dcd4";
            ctx.fillRect(cx - r, y - r, r * 2, r * 2);
        }
        ctx.restore();
    }

    function drawInfoBand(ctx, y, accessCode, tableLabel, drinksLabel) {
        const bandH = 118;
        ctx.fillStyle = "rgba(235, 220, 210, 0.92)";
        roundRect(ctx, 72, y, W - 144, bandH, 14);
        ctx.fill();
        ctx.strokeStyle = "rgba(201, 169, 98, 0.55)";
        ctx.lineWidth = 1.5;
        roundRect(ctx, 72, y, W - 144, bandH, 14);
        ctx.stroke();

        const cols = [
            { label: "CODE", value: accessCode, x: 150 },
            { label: "TABLE", value: tableLabel, x: W / 2 },
            { label: "BOISSONS", value: drinksLabel, x: W - 150 }
        ];
        cols.forEach((col, i) => {
            if (i > 0) {
                ctx.strokeStyle = "rgba(201, 169, 98, 0.45)";
                ctx.beginPath();
                ctx.moveTo(72 + (W - 144) * (i / 3), y + 18);
                ctx.lineTo(72 + (W - 144) * (i / 3), y + bandH - 18);
                ctx.stroke();
            }
            ctx.textAlign = "center";
            ctx.fillStyle = "#8b6b6b";
            ctx.font = "600 14px Montserrat, sans-serif";
            ctx.fillText(col.label, col.x, y + 38);
            ctx.fillStyle = "#5c2032";
            ctx.font = i === 2 ? "600 16px Montserrat, sans-serif" : "700 26px Georgia, serif";
            const val = String(col.value || "—");
            if (i === 2 && val.length > 18) {
                ctx.font = "600 13px Montserrat, sans-serif";
            }
            ctx.fillText(val.length > 28 ? val.slice(0, 26) + "…" : val, col.x, y + 78);
        });
    }

    function getCoupleBgUrl(meta) {
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        return (cfg && cfg.branding && (cfg.branding.heroImage || cfg.branding.welcomeImage))
            || meta?.couplePhotoLeft
            || meta?.couplePhotoRight
            || "";
    }

    function getCoupleLabel() {
        const cfg = window.EventConfig && EventConfig.getConfig && EventConfig.getConfig();
        const sub = (cfg && cfg.subtitle) ? cfg.subtitle : "Josue et Divine";
        return sub.replace(/\s+et\s+/i, " & ");
    }

    function buildData({ payload, guest, accessCode, tableLabel, drinksLabel, eventTitle, dateLabel, meta, qrSrc }) {
        const g = guest || {};
        return {
            guestName: payload?.name || g.fullName || "Invité(e)",
            coupleLabel: getCoupleLabel(),
            eventTitle: eventTitle || "Mariage",
            dateLabel: dateLabel || "",
            accessCode: accessCode || "",
            tableLabel: tableLabel || "—",
            drinksLabel: drinksLabel || "—",
            profilePhotoUrl: g.profilePhotoUrl || payload?.profilePhotoUrl || "",
            coupleBgUrl: getCoupleBgUrl(meta),
            qrSrc: qrSrc || ""
        };
    }

    async function render(ctx, data) {
        drawPaperBase(ctx);
        await drawCoupleBackground(ctx, data.coupleBgUrl);
        drawCornerFlorals(ctx);
        drawGoldFrame(ctx);

        let y = 200;
        if (data.profilePhotoUrl) {
            await drawGuestMedallion(ctx, data.profilePhotoUrl, y);
            y = 310;
        } else {
            y = 230;
        }

        ctx.textAlign = "center";
        ctx.fillStyle = "#6b2c3e";
        ctx.font = "italic 52px Georgia, 'Great Vibes', serif";
        ctx.fillText(data.coupleLabel, W / 2, y);

        ctx.font = "600 16px Montserrat, sans-serif";
        ctx.fillStyle = "#c9a962";
        ctx.fillText("CARTE D'ACCÈS · JOUR J", W / 2, y + 42);

        if (data.dateLabel) {
            ctx.font = "700 18px Montserrat, sans-serif";
            ctx.fillStyle = "#5c2032";
            ctx.fillText(data.dateLabel.toUpperCase(), W / 2, y + 78);
        }

        ctx.font = "600 28px Georgia, serif";
        ctx.fillStyle = "#4a3030";
        ctx.fillText(data.guestName, W / 2, y + (data.dateLabel ? 118 : 90));

        drawInfoBand(ctx, y + (data.dateLabel ? 145 : 115), data.accessCode, data.tableLabel, data.drinksLabel);

        const bandBottom = y + (data.dateLabel ? 145 : 115) + 118 + 36;
        if (data.qrSrc) {
            try {
                const qr = await loadImage(data.qrSrc);
                const qs = 260;
                const qx = (W - qs) / 2;
                const qy = bandBottom;
                ctx.fillStyle = "#fff";
                roundRect(ctx, qx - 14, qy - 14, qs + 28, qs + 28, 16);
                ctx.fill();
                ctx.strokeStyle = "#c9a962";
                ctx.lineWidth = 3;
                roundRect(ctx, qx - 14, qy - 14, qs + 28, qs + 28, 16);
                ctx.stroke();
                ctx.drawImage(qr, qx, qy, qs, qs);
            } catch {
                /* QR optional */
            }
        }

        ctx.fillStyle = "#7a6363";
        ctx.font = "600 14px Montserrat, sans-serif";
        ctx.fillText("PRÉSENTEZ CE QR À L'ENTRÉE", W / 2, H - 72);
    }

    async function drawToCanvas(data) {
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        await render(ctx, data);
        return canvas;
    }

    async function download(data) {
        const canvas = await drawToCanvas(data);
        const slug = (data.guestName || "invite").replace(/[^\w\-]+/g, "_").slice(0, 40);
        const link = document.createElement("a");
        link.download = `carte-acces-${slug}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        return canvas;
    }

    async function renderPreview(canvasEl, data) {
        if (!canvasEl) return;
        canvasEl.width = W;
        canvasEl.height = H;
        const ctx = canvasEl.getContext("2d");
        await render(ctx, data);
    }

    return { buildData, download, drawToCanvas, renderPreview, W, H };
})();

window.AccessPassExport = AccessPassExport;
