/**
 * Impression de l'invitation affichée, avec contenu personnel lorsque disponible.
 */
const InvitationPdf = (() => {
    const WIDTH = 1240;
    const HEIGHT = 1754;
    let automaticPrintScheduled = false;

    function showToast(message) {
        if (typeof window.showToast === "function") window.showToast(message);
        else window.alert(message);
    }

    function loadImage(source) {
        return new Promise((resolve, reject) => {
            if (!source) return reject(new Error("Image absente"));
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Image indisponible"));
            image.src = source;
        });
    }

    function drawCoverImage(context, image, x, y, width, height) {
        const ratio = Math.max(width / image.width, height / image.height);
        const renderedWidth = image.width * ratio;
        const renderedHeight = image.height * ratio;
        context.drawImage(image, x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight);
    }

    function wrapText(context, text, width) {
        const words = String(text || "").split(/\s+/).filter(Boolean);
        const lines = [];
        let line = "";
        words.forEach((word) => {
            const candidate = line ? `${line} ${word}` : word;
            if (line && context.measureText(candidate).width > width) {
                lines.push(line);
                line = word;
            } else line = candidate;
        });
        if (line) lines.push(line);
        return lines;
    }

    function drawCenteredLines(context, text, y, width, lineHeight, maxLines) {
        wrapText(context, text, width).slice(0, maxLines).forEach((line, index) => {
            context.fillText(line, WIDTH / 2, y + index * lineHeight);
        });
    }

    function getPersonalGuest() {
        const guest = window.GuestExperience && GuestExperience.getProfile && GuestExperience.getProfile();
        const token = new URLSearchParams(window.location.search).get("t") || "";
        return guest && guest.token === token ? guest : null;
    }

    function hasPersonalToken() {
        return !!new URLSearchParams(window.location.search).get("t");
    }

    async function waitForPersonalGuest() {
        const currentGuest = getPersonalGuest();
        if (currentGuest || !hasPersonalToken()) return currentGuest;

        return new Promise((resolve) => {
            const timeout = window.setTimeout(() => resolve(getPersonalGuest()), 4000);
            window.addEventListener("guestprofile:ready", () => {
                window.clearTimeout(timeout);
                resolve(getPersonalGuest());
            }, { once: true });
        });
    }

    function formatDate() {
        const date = window.EventCountdown && EventCountdown.getTarget ? new Date(EventCountdown.getTarget()) : null;
        if (!date || Number.isNaN(date.getTime())) return "";
        return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }

    function getTimeRange() {
        return document.getElementById("event-time-range")?.textContent.trim() || "";
    }

    async function qrDataUrl(target) {
        if (window.QRCode?.toDataURL) {
            return new Promise((resolve, reject) => {
                QRCode.toDataURL(target, { width: 260, margin: 2, color: { dark: "#5c2032", light: "#ffffff" } }, (error, url) => {
                    if (error) reject(error);
                    else resolve(url);
                });
            });
        }
        throw new Error("QR code indisponible");
    }

    function updateButton() {
        const button = document.getElementById("download-invitation-pdf-btn");
        if (button) button.classList.remove("hidden");
    }

    async function waitForPrintImages() {
        const images = Array.from(document.querySelectorAll("#main-view img"));
        await Promise.all(images.map(async (image) => {
            if (!image.complete) {
                await new Promise((resolve) => {
                    image.addEventListener("load", resolve, { once: true });
                    image.addEventListener("error", resolve, { once: true });
                });
            }
            if (image.decode) {
                try { await image.decode(); } catch { /* Keep printing if an optional image is unavailable. */ }
            }
        }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    async function createCanvas(guest) {
        const config = window.EventConfig?.getConfig?.() || {};
        const canvas = document.createElement("canvas");
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const context = canvas.getContext("2d");
        const primary = config.primaryColor || config.branding?.primaryColor || "#5c2032";
        const accent = config.accentColor || config.branding?.accentColor || "#c9a962";
        const title = document.getElementById("hero-title")?.textContent.trim() || config.title || "Invitation";
        const subtitle = document.getElementById("hero-subtitle")?.textContent.trim() || config.subtitle || "";
        const venue = [document.getElementById("venue-title")?.textContent.trim(), document.getElementById("venue-address")?.textContent.trim()].filter(Boolean).join("\n");
        const hero = document.getElementById("hero-image")?.src || config.heroImage || config.branding?.heroImage || "";

        context.fillStyle = "#fbf8f4";
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.fillStyle = primary;
        context.fillRect(0, 0, WIDTH, 610);
        try {
            const image = await loadImage(hero);
            context.save();
            context.globalAlpha = 0.38;
            drawCoverImage(context, image, 0, 0, WIDTH, 610);
            context.restore();
        } catch { /* A color cover keeps the PDF usable when an external image blocks CORS. */ }
        context.fillStyle = "rgba(0, 0, 0, 0.28)";
        context.fillRect(0, 0, WIDTH, 610);
        context.textAlign = "center";
        context.fillStyle = "#ffffff";
        context.font = "italic 76px Georgia, serif";
        drawCenteredLines(context, subtitle || title, 250, 1050, 90, 2);
        context.font = "600 30px sans-serif";
        context.fillText("INVITATION PERSONNELLE", WIDTH / 2, 410);

        context.fillStyle = "#ffffff";
        context.shadowColor = "rgba(52, 25, 32, 0.16)";
        context.shadowBlur = 25;
        context.fillRect(100, 510, WIDTH - 200, 870);
        context.shadowBlur = 0;
        context.strokeStyle = accent;
        context.lineWidth = 3;
        context.strokeRect(122, 532, WIDTH - 244, 826);
        context.fillStyle = accent;
        context.fillRect(WIDTH / 2 - 55, 585, 110, 4);
        context.fillStyle = primary;
        context.font = "italic 50px Georgia, serif";
        context.fillText(title, WIDTH / 2, 690);
        context.fillStyle = "#5b4d4d";
        context.font = "28px sans-serif";
        context.fillText("Cette invitation est réservée à", WIDTH / 2, 790);
        context.fillStyle = primary;
        context.font = "bold 52px Georgia, serif";
        drawCenteredLines(context, guest.fullName, 865, 900, 60, 2);
        context.fillStyle = accent;
        context.fillRect(WIDTH / 2 - 180, 960, 360, 2);
        context.fillStyle = "#5b4d4d";
        context.font = "600 29px sans-serif";
        context.fillText(formatDate(), WIDTH / 2, 1035);
        context.font = "28px sans-serif";
        context.fillText(getTimeRange(), WIDTH / 2, 1085);
        context.font = "26px sans-serif";
        venue.split("\n").filter(Boolean).slice(0, 2).forEach((line, index) => context.fillText(line, WIDTH / 2, 1155 + index * 38));

        try {
            const qr = await qrDataUrl(window.location.href);
            const qrImage = await loadImage(qr);
            context.fillStyle = "#ffffff";
            context.fillRect(WIDTH / 2 - 145, 1235, 290, 290);
            context.drawImage(qrImage, WIDTH / 2 - 125, 1255, 250, 250);
        } catch {
            context.fillStyle = "#766767";
            context.font = "23px sans-serif";
            context.fillText("Votre invitation personnelle", WIDTH / 2, 1375);
        }
        context.fillStyle = "#766767";
        context.font = "23px sans-serif";
        context.fillText("Conservez cette invitation personnelle", WIDTH / 2, 1580);
        context.font = "20px sans-serif";
        context.fillText("Michelline Invitations", WIDTH / 2, 1660);
        return canvas;
    }

    function download() {
        window.focus();
        window.print();
    }

    function printAutomatically() {
        if (automaticPrintScheduled || new URLSearchParams(window.location.search).get("print") !== "1") return;
        automaticPrintScheduled = true;
        setTimeout(() => download(), 250);
    }

    function init() {
        const button = document.getElementById("download-invitation-pdf-btn");
        if (!button || button.dataset.bound) return;
        button.dataset.bound = "1";
        button.addEventListener("click", download);
        window.addEventListener("guestprofile:ready", updateButton);
        window.addEventListener("personalinvitation:ready", () => {
            printAutomatically();
        }, { once: true });
        window.addEventListener("eventconfig:ready", () => {
            updateButton();
            printAutomatically();
        }, { once: true });
        updateButton();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return { init, updateButton, download, waitForPrintImages };
})();

window.InvitationPdf = InvitationPdf;