/** Identité commune à la connexion et à l'attribution serveur. */
((root) => {
    const domain = "organizer.michelline-invitations.vercel.app";
    function normalizePhone(value) {
        let phone = String(value ?? "").normalize("NFKC").trim()
            .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
            .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
            .replace(/[\s()./\-\u2010-\u2015\u200e\u200f]/g, "");
        if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
        if (/^2430?\d{9}$/.test(phone)) phone = `+${phone}`;
        if (/^0?\d{9}$/.test(phone)) phone = `+243${phone.replace(/^0/, "")}`;
        if (phone.startsWith("+243")) {
            const national = phone.slice(4).replace(/^0/, "");
            return /^[1-9]\d{8}$/.test(national) ? `+243${national}` : null;
        }
        return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
    }
    function emailFromPhone(value) {
        const phone = normalizePhone(value);
        if (!phone) throw new Error("Saisissez un numéro valide, par exemple 812 345 678 (+243 par défaut).");
        return `${phone.slice(1)}@${domain}`;
    }
    const identity = { normalizePhone, emailFromPhone };
    if (typeof module !== "undefined" && module.exports) module.exports = identity;
    else root.OrganizerIdentity = identity;
})(typeof window !== "undefined" ? window : globalThis);
