/**
 * Compte à rebours — date modifiable, jour J, après l'événement
 */
const EventCountdown = (() => {
    let targetMs = new Date("2026-04-30T19:30:00").getTime();
    let timerId = null;

    function pad(n) {
        return n < 10 ? "0" + n : String(n);
    }

    function parseTarget(value) {
        if (value === undefined || value === null || value === "") return null;
        const t = typeof value === "number" ? value : new Date(value).getTime();
        return Number.isNaN(t) ? null : t;
    }

    function isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
    }

    function applyDateToUI(isoOrMs) {
        const t = parseTarget(isoOrMs);
        if (!t) return;
        const d = new Date(t);
        const dayEl = document.getElementById("event-day");
        const monthEl = document.getElementById("event-month-year");
        const timeEl = document.getElementById("event-time-range");
        const calLabel = document.getElementById("calendar-month-label");

        if (dayEl) dayEl.textContent = String(d.getDate());
        if (monthEl) {
            monthEl.textContent = d.toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric"
            });
        }
        if (timeEl) {
            const start = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                .replace(":", "h");
            const endDate = new Date(t + 4 * 3600000);
            const end = endDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                .replace(":", "h");
            timeEl.textContent = `${start} - ${end}`;
        }
        if (calLabel) {
            calLabel.textContent = d.toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric"
            });
        }
        const dayCell = document.getElementById("calendar-event-day");
        if (dayCell) dayCell.textContent = String(d.getDate());
    }

    function setTarget(value) {
        const t = parseTarget(value);
        if (t !== null) {
            targetMs = t;
            window.eventCountdownTarget = targetMs;
        }
        return targetMs;
    }

    function getTarget() {
        return targetMs;
    }

    function tick() {
        const daysEl = document.getElementById("days");
        const hoursEl = document.getElementById("hours");
        const minutesEl = document.getElementById("minutes");
        const secondsEl = document.getElementById("seconds");
        const statusEl = document.getElementById("countdown-status");
        if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

        const now = Date.now();
        const distance = targetMs - now;
        const eventDate = new Date(targetMs);
        const nowDate = new Date();

        if (distance > 0) {
            const days = Math.floor(distance / 86400000);
            const hours = Math.floor((distance % 86400000) / 3600000);
            const minutes = Math.floor((distance % 3600000) / 60000);
            const seconds = Math.floor((distance % 60000) / 1000);
            daysEl.textContent = pad(days);
            hoursEl.textContent = pad(hours);
            minutesEl.textContent = pad(minutes);
            secondsEl.textContent = pad(seconds);
            if (statusEl) {
                statusEl.textContent = days === 0
                    ? "Plus que quelques heures… ✨"
                    : "";
                statusEl.classList.remove("countdown-status-celebrate", "countdown-status-past");
            }
            return;
        }

        if (isSameDay(nowDate, eventDate)) {
            const elapsed = Math.abs(distance);
            const hours = Math.floor((elapsed % 86400000) / 3600000);
            const minutes = Math.floor((elapsed % 3600000) / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            daysEl.textContent = "00";
            hoursEl.textContent = pad(hours);
            minutesEl.textContent = pad(minutes);
            secondsEl.textContent = pad(seconds);
            if (statusEl) {
                statusEl.textContent = distance >= 0 || elapsed < 600000
                    ? "C'est le grand jour ! 🎉"
                    : "Profitez de la fête ! 💃🕺";
                statusEl.classList.add("countdown-status-celebrate");
                statusEl.classList.remove("countdown-status-past");
            }
            return;
        }

        daysEl.textContent = "00";
        hoursEl.textContent = "00";
        minutesEl.textContent = "00";
        secondsEl.textContent = "00";
        if (statusEl) {
            statusEl.textContent = "Merci d'avoir célébré avec nous 💕";
            statusEl.classList.add("countdown-status-past");
            statusEl.classList.remove("countdown-status-celebrate");
        }
    }

    function start() {
        if (timerId) clearInterval(timerId);
        tick();
        timerId = setInterval(tick, 1000);
    }

    function initFromConfig(config, dashboardState) {
        if (dashboardState && dashboardState.countdownDate) {
            setTarget(dashboardState.countdownDate);
            applyDateToUI(dashboardState.countdownDate);
        } else if (config && config.eventDate) {
            setTarget(config.eventDate);
            applyDateToUI(config.eventDate);
        }
        start();
    }

    return {
        setTarget,
        getTarget,
        applyDateToUI,
        tick,
        start,
        initFromConfig
    };
})();

window.EventCountdown = EventCountdown;
