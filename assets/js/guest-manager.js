/**
 * Gestion des invités (localStorage, scopé par événement)
 * Prêt pour migration vers API/SQLite
 */
const GuestManager = (() => {
    function storageKey() {
        if (window.EventConfig) return EventConfig.storageKey("guests");
        return "wedding_guests_default";
    }

    function loadGuests() {
        try {
            const raw = localStorage.getItem(storageKey());
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function saveGuests(guests) {
        localStorage.setItem(storageKey(), JSON.stringify(guests));
    }

    function slugify(name) {
        return (name || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    }

    function generateToken() {
        if (window.crypto && crypto.randomUUID) {
            return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        }
        return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
    }

    function buildInviteLink(guest) {
        const base = EventConfig.buildInvitationBaseUrl();
        const params = new URLSearchParams();
        params.set("event", EventConfig.getEventId());
        params.set("guest", guest.slug);
        params.set("t", guest.token);
        return `${base}?${params.toString()}`;
    }

    function buildWhatsAppLink(guest, messageTemplate) {
        const phone = (guest.phone || "").replace(/\D/g, "");
        const link = buildInviteLink(guest);
        const msg = (messageTemplate || "Bonjour {nom}, voici votre invitation : {lien}")
            .replace("{nom}", guest.fullName)
            .replace("{lien}", link);
        const encoded = encodeURIComponent(msg);
        return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    }

    function addGuest({ fullName, phone = "", email = "", group = "" }) {
        if (!fullName || fullName.trim().length < 2) return null;
        const guests = loadGuests();
        const slug = slugify(fullName);
        const existing = guests.find((g) => g.slug === slug);
        if (existing) return existing;

        const guest = {
            id: crypto.randomUUID(),
            slug,
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            group: group.trim(),
            token: generateToken(),
            status: "pending",
            adults: 1,
            children: 0,
            rsvpMessage: "",
            respondedAt: null,
            createdAt: new Date().toISOString()
        };
        guests.push(guest);
        saveGuests(guests);
        return guest;
    }

    function findByToken(token) {
        if (!token) return null;
        return loadGuests().find((g) => g.token === token) || null;
    }

    function findBySlug(slug) {
        if (!slug) return null;
        return loadGuests().find((g) => g.slug === slug) || null;
    }

    function updateGuest(id, patch) {
        const guests = loadGuests();
        const idx = guests.findIndex((g) => g.id === id);
        if (idx === -1) return null;
        guests[idx] = { ...guests[idx], ...patch };
        saveGuests(guests);
        return guests[idx];
    }

    function recordRSVP({ guestId, fullName, phone, status, adults, children, message }) {
        const guests = loadGuests();
        let guest = guestId ? guests.find((g) => g.id === guestId) : null;
        if (!guest && fullName) {
            guest = addGuest({ fullName, phone });
        }
        if (!guest) return null;

        return updateGuest(guest.id, {
            status: status === "yes" ? "yes" : status === "no" ? "no" : "pending",
            adults: Number(adults) || 1,
            children: Number(children) || 0,
            rsvpMessage: message || "",
            phone: phone || guest.phone,
            respondedAt: new Date().toISOString()
        });
    }

    function parseCSV(text) {
        const lines = text.trim().split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) return { imported: 0, skipped: 0, guests: [] };

        const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const nameIdx = header.findIndex((h) => ["nom", "name", "full_name", "fullname"].includes(h));
        const phoneIdx = header.findIndex((h) => ["telephone", "phone", "tel", "mobile"].includes(h));
        const groupIdx = header.findIndex((h) => ["groupe", "group", "group_name"].includes(h));
        const emailIdx = header.findIndex((h) => ["email", "mail"].includes(h));

        if (nameIdx === -1) throw new Error("Colonne 'nom' obligatoire dans le CSV");

        let imported = 0;
        let skipped = 0;
        const results = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map((c) => c.trim());
            const fullName = cols[nameIdx];
            if (!fullName) {
                skipped++;
                continue;
            }
            const before = loadGuests().length;
            const guest = addGuest({
                fullName,
                phone: phoneIdx >= 0 ? cols[phoneIdx] : "",
                group: groupIdx >= 0 ? cols[groupIdx] : "",
                email: emailIdx >= 0 ? cols[emailIdx] : ""
            });
            if (loadGuests().length > before || guest) {
                imported++;
                results.push(guest);
            } else {
                skipped++;
            }
        }
        return { imported, skipped, guests: results };
    }

    function getStats() {
        const guests = loadGuests();
        return {
            total: guests.length,
            yes: guests.filter((g) => g.status === "yes").length,
            no: guests.filter((g) => g.status === "no").length,
            pending: guests.filter((g) => g.status === "pending").length,
            adults: guests.filter((g) => g.status === "yes").reduce((s, g) => s + (g.adults || 0), 0),
            children: guests.filter((g) => g.status === "yes").reduce((s, g) => s + (g.children || 0), 0)
        };
    }

    function exportLinksCSV() {
        const guests = loadGuests();
        const header = "nom,telephone,groupe,statut,lien";
        const rows = guests.map((g) => {
            const link = buildInviteLink(g);
            return `"${g.fullName}","${g.phone || ""}","${g.group || ""}","${g.status}","${link}"`;
        });
        return [header, ...rows].join("\n");
    }

    function regenerateToken(guestId) {
        const guest = updateGuest(guestId, { token: generateToken() });
        return guest;
    }

    function removeGuest(guestId) {
        const guests = loadGuests().filter((g) => g.id !== guestId);
        saveGuests(guests);
    }

    return {
        loadGuests,
        addGuest,
        findByToken,
        findBySlug,
        updateGuest,
        recordRSVP,
        parseCSV,
        getStats,
        buildInviteLink,
        buildWhatsAppLink,
        exportLinksCSV,
        regenerateToken,
        removeGuest
    };
})();

window.GuestManager = GuestManager;
