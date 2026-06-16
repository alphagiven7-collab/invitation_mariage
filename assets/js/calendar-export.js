/**
 * Export calendrier .ics — ajout en un clic (Google, Apple, Outlook)
 */
const CalendarExport = (() => {
    function foldLine(line) {
        const max = 73;
        if (line.length <= max) return line;
        let out = "";
        let rest = line;
        out += `${rest.slice(0, max)}\r\n`;
        rest = rest.slice(max);
        while (rest.length > 0) {
            out += ` ${rest.slice(0, max - 1)}\r\n`;
            rest = rest.slice(max - 1);
        }
        return out.replace(/\r?\n$/, "");
    }

    function escapeIcs(text) {
        return (text || "")
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\n/g, "\\n");
    }

    function formatIcsLocal(date) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
    }

    function formatIcsUtc(date) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
    }

    function getEventMeta() {
        const title = document.getElementById("hero-title")?.textContent.trim()
            || document.getElementById("hero-subtitle")?.textContent.trim()
            || "Mariage";
        const venueTitle = document.getElementById("venue-title")?.textContent.trim() || "";
        const venueAddress = document.getElementById("venue-address")?.textContent.trim() || "";
        const location = [venueTitle, venueAddress].filter(Boolean).join(", ");
        const description = document.getElementById("invite-main-text")?.textContent.trim()
            || "Invitation au mariage — merci de confirmer votre présence sur le site.";
        const siteUrl = document.getElementById("meta-og-url")?.content
            || window.location.href.split("?")[0];

        let startMs = window.EventCountdown ? EventCountdown.getTarget() : Date.now();
        if (Number.isNaN(startMs)) startMs = Date.now();

        const start = new Date(startMs);
        const end = new Date(startMs + 4 * 3600000);

        const eventId = window.EventConfig && EventConfig.isReady()
            ? EventConfig.getEventId()
            : "wedding";

        return { title, location, description, siteUrl, start, end, eventId };
    }

    function buildIcs() {
        const meta = getEventMeta();
        const uid = `${meta.eventId}-${formatIcsLocal(meta.start)}@invitation-mariage`;
        const now = new Date();

        const lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//InvitationMariage//FR",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            `UID:${uid}`,
            `DTSTAMP:${formatIcsUtc(now)}`,
            `DTSTART:${formatIcsLocal(meta.start)}`,
            `DTEND:${formatIcsLocal(meta.end)}`,
            `SUMMARY:${escapeIcs(meta.title)}`,
            `DESCRIPTION:${escapeIcs(`${meta.description}\\n\\n${meta.siteUrl}`)}`,
            meta.location ? `LOCATION:${escapeIcs(meta.location)}` : "",
            `URL:${escapeIcs(meta.siteUrl)}`,
            "STATUS:CONFIRMED",
            "BEGIN:VALARM",
            "TRIGGER:-P1D",
            "ACTION:DISPLAY",
            `DESCRIPTION:Rappel — ${escapeIcs(meta.title)} demain`,
            "END:VALARM",
            "BEGIN:VALARM",
            "TRIGGER:-PT2H",
            "ACTION:DISPLAY",
            `DESCRIPTION:${escapeIcs(meta.title)} dans 2 heures`,
            "END:VALARM",
            "END:VEVENT",
            "END:VCALENDAR"
        ].filter(Boolean);

        return lines.map(foldLine).join("\r\n") + "\r\n";
    }

    function downloadIcs() {
        const meta = getEventMeta();
        const ics = buildIcs();
        const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const slug = meta.title
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") || "mariage";
        a.href = url;
        a.download = `${slug}.ics`;
        a.click();
        URL.revokeObjectURL(url);

        if (window.CloudAPI && EventConfig?.isReady()) {
            CloudAPI.track(EventConfig.getEventId(), "calendar_export", {});
        }
        if (typeof showToast === "function") {
            showToast("Fichier calendrier téléchargé — ouvrez-le pour l'ajouter.");
        }
    }

    function init() {
        const btn = document.getElementById("add-to-calendar-btn");
        if (!btn || btn.dataset.loaderBound === "1") return;
        if (window.ButtonLoading) {
            ButtonLoading.bindClick(btn, () => downloadIcs(), "Préparation…");
        } else {
            btn.addEventListener("click", downloadIcs);
        }
    }

    return { buildIcs, downloadIcs, getEventMeta, init };
})();

window.CalendarExport = CalendarExport;
