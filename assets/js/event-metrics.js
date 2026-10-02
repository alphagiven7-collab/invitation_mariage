((root) => {
    function calendarDay(value) {
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const date = new Date(`${value}T00:00:00Z`);
            return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
        }
        const zoned = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}+01:00` : value;
        const date = value instanceof Date ? value : new Date(zoned);
        if (!value || Number.isNaN(date.getTime())) return null;
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Kinshasa", year: "numeric", month: "2-digit", day: "2-digit"
        }).formatToParts(date);
        const part = (type) => parts.find((item) => item.type === type).value;
        return `${part("year")}-${part("month")}-${part("day")}`;
    }
    function timing(value, now = new Date()) {
        const day = calendarDay(value);
        if (!day) return { status: "undated", days: null, label: "Date à définir" };
        const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${calendarDay(now)}T00:00:00Z`)) / 86400000);
        return { days, status: days < 0 ? "completed" : days === 0 ? "today" : "upcoming",
            label: days < 0 ? "Terminé" : days === 0 ? "Aujourd'hui" : `Dans ${days} jour${days > 1 ? "s" : ""}` };
    }
    function dateLabel(value) {
        const day = calendarDay(value);
        return day ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)) : "Non renseignée";
    }
    function parseAmount(value) {
        const clean = String(value ?? "").trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
        if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
        const [whole, fraction = ""] = clean.split(".");
        const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
        return Number.isSafeInteger(cents) && cents <= 99999999900 ? cents : null;
    }
    const money = (cents) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", currencyDisplay: "code" }).format(cents / 100);
    function paymentState(payment) {
        if (!payment) return { status: "unset", label: "À renseigner", balance: null, percent: 0 };
        const balance = Math.max(0, payment.totalCents - payment.receivedCents);
        const status = !balance ? "paid" : payment.receivedCents > 0 ? "partial" : "unpaid";
        return { status, balance, percent: payment.totalCents ? Math.min(100, Math.round(payment.receivedCents / payment.totalCents * 100)) : 100,
            label: payment.totalCents === 0 && payment.receivedCents === 0 ? "Offert" : { paid: "Payé", partial: "Partiellement payé", unpaid: "Impayé" }[status] };
    }
    const metrics = { calendarDay, timing, dateLabel, parseAmount, money, paymentState };
    if (typeof module !== "undefined" && module.exports) module.exports = metrics;
    else root.EventMetrics = metrics;
})(typeof window !== "undefined" ? window : globalThis);
