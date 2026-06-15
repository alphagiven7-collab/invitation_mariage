/**
 * Gestion des invités — local + cloud (Supabase)
 * Étapes 2, 3, 4
 */
const GuestManager = (() => {
    let cache = null;

    function getEventId() {
        if (window.EventConfig && EventConfig.isReady()) return EventConfig.getEventId();
        const params = new URLSearchParams(window.location.search);
        return params.get("event") || "yanick-keren";
    }

    function storageKey() {
        return `wedding_event_${getEventId()}_guests`;
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
        params.set("event", getEventId());
        params.set("guest", guest.slug);
        params.set("nom", guest.fullName);
        params.set("t", guest.token);
        const phone = (guest.phone || "").replace(/\s/g, "");
        if (phone) params.set("tel", phone);
        return `${base}?${params.toString()}`;
    }

    function buildWhatsAppLink(guest, messageTemplate) {
        const phone = (guest.phone || "").replace(/\D/g, "");
        const link = buildInviteLink(guest);
        const tpl = messageTemplate || getMessageTemplate();
        const msg = tpl.replace("{nom}", guest.fullName).replace("{lien}", link);
        const encoded = encodeURIComponent(msg);
        return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    }

    function getMessageTemplate() {
        return localStorage.getItem(`wedding_event_${getEventId()}_wa_template`)
            || "Bonjour {nom}, vous êtes invité(e) à notre événement. Confirmez via : {lien}";
    }

    function setMessageTemplate(text) {
        localStorage.setItem(`wedding_event_${getEventId()}_wa_template`, text);
    }

    async function loadGuests(force = false) {
        if (cache && !force) return cache;
        if (window.CloudAPI) {
            cache = await CloudAPI.getGuests(getEventId());
        } else {
            try {
                const raw = localStorage.getItem(storageKey());
                cache = raw ? JSON.parse(raw) : [];
            } catch {
                cache = [];
            }
        }
        return cache;
    }

    async function persistGuests(guests) {
        cache = guests;
        if (window.CloudAPI) {
            await CloudAPI.syncAllGuests(getEventId(), guests);
        } else {
            localStorage.setItem(storageKey(), JSON.stringify(guests));
        }
    }

    async function addGuest({ fullName, phone = "", email = "", group = "" }) {
        if (!fullName || fullName.trim().length < 2) return null;
        const guests = await loadGuests();
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
        await persistGuests(guests);
        if (window.CloudAPI) await CloudAPI.upsertGuest(getEventId(), guest);
        return guest;
    }

    async function findByToken(token) {
        if (!token) return null;
        const guests = await loadGuests();
        return guests.find((g) => g.token === token) || null;
    }

    async function findBySlug(slug) {
        if (!slug) return null;
        const guests = await loadGuests();
        return guests.find((g) => g.slug === slug) || null;
    }

    async function updateGuest(id, patch) {
        const guests = await loadGuests();
        const idx = guests.findIndex((g) => g.id === id);
        if (idx === -1) return null;

        const next = { ...guests[idx], ...patch };
        if (patch.fullName && patch.fullName.trim() !== guests[idx].fullName) {
            next.fullName = patch.fullName.trim();
            next.slug = slugify(next.fullName);
            const conflict = guests.find((g) => g.id !== id && g.slug === next.slug);
            if (conflict) return null;
        }
        if (patch.phone !== undefined) next.phone = (patch.phone || "").trim();
        if (patch.email !== undefined) next.email = (patch.email || "").trim();
        if (patch.group !== undefined) next.group = (patch.group || "").trim();

        guests[idx] = next;
        await persistGuests(guests);
        if (window.CloudAPI) await CloudAPI.upsertGuest(getEventId(), guests[idx]);
        cache = null;
        return guests[idx];
    }

    async function recordRSVP({ guestId, fullName, phone, status, adults, children, message }) {
        await loadGuests(true);
        const guests = await loadGuests();
        let guest = guestId ? guests.find((g) => g.id === guestId) : null;
        if (!guest && fullName) {
            guest = guests.find((g) => g.fullName.toLowerCase() === fullName.toLowerCase());
        }
        if (!guest && fullName) {
            guest = await addGuest({ fullName, phone });
        }
        if (!guest) return null;

        const updated = await updateGuest(guest.id, {
            status: status === "yes" ? "yes" : status === "no" ? "no" : "pending",
            adults: Number(adults) || 1,
            children: Number(children) || 0,
            rsvpMessage: message || "",
            phone: phone || guest.phone,
            respondedAt: new Date().toISOString()
        });

        if (window.CloudAPI && CloudAPI.isEnabled()) {
            const synced = await CloudAPI.upsertGuest(getEventId(), { ...guest, ...updated });
            await CloudAPI.recordRSVP(getEventId(), {
                guestId: synced ? synced.id : guest.id,
                fullName: fullName || guest.fullName,
                phone: phone || guest.phone,
                status,
                adults,
                children,
                message
            });
        }
        cache = null;
        return updated;
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

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
            const fullName = cols[nameIdx];
            if (!fullName) continue;
            rows.push({
                fullName,
                phone: phoneIdx >= 0 ? cols[phoneIdx] : "",
                group: groupIdx >= 0 ? cols[groupIdx] : "",
                email: emailIdx >= 0 ? cols[emailIdx] : ""
            });
        }
        return rows;
    }

    async function importCSVRows(rows) {
        let imported = 0;
        let skipped = 0;
        for (const row of rows) {
            const before = (await loadGuests()).length;
            const g = await addGuest(row);
            const after = (await loadGuests()).length;
            if (after > before || g) imported++;
            else skipped++;
        }
        await loadGuests(true);
        return { imported, skipped };
    }

    async function getStats() {
        const guests = await loadGuests();
        return {
            total: guests.length,
            yes: guests.filter((g) => g.status === "yes").length,
            no: guests.filter((g) => g.status === "no").length,
            pending: guests.filter((g) => g.status === "pending").length,
            adults: guests.filter((g) => g.status === "yes").reduce((s, g) => s + (g.adults || 0), 0),
            children: guests.filter((g) => g.status === "yes").reduce((s, g) => s + (g.children || 0), 0)
        };
    }

    async function getPendingGuests() {
        return (await loadGuests()).filter((g) => g.status === "pending");
    }

    async function exportLinksCSV() {
        const guests = await loadGuests();
        const header = "nom,telephone,email,groupe,statut,adultes,enfants,lien";
        const rows = guests.map((g) => {
            const link = buildInviteLink(g);
            return `"${g.fullName}","${g.phone || ""}","${g.email || ""}","${g.group || ""}","${g.status}",${g.adults || 0},${g.children || 0},"${link}"`;
        });
        return [header, ...rows].join("\n");
    }

    async function exportRSVPReport() {
        const guests = await loadGuests();
        const header = "nom,telephone,groupe,statut,adultes,enfants,message,repondu_le";
        const rows = guests.map((g) =>
            `"${g.fullName}","${g.phone || ""}","${g.group || ""}","${g.status}",${g.adults || 0},${g.children || 0},"${(g.rsvpMessage || "").replace(/"/g, "'")}","${g.respondedAt || ""}"`
        );
        return [header, ...rows].join("\n");
    }

    async function regenerateToken(guestId) {
        return updateGuest(guestId, { token: generateToken() });
    }

    async function removeGuest(guestId) {
        if (!guestId) return false;
        let ok = true;
        if (window.CloudAPI) {
            ok = await CloudAPI.removeGuestCloud(getEventId(), guestId);
        } else {
            const guests = (await loadGuests()).filter((g) => g.id !== guestId);
            await persistGuests(guests);
        }
        cache = null;
        await loadGuests(true);
        return ok;
    }

    return {
        loadGuests,
        addGuest,
        findByToken,
        findBySlug,
        updateGuest,
        recordRSVP,
        parseCSV,
        importCSVRows,
        getStats,
        getPendingGuests,
        buildInviteLink,
        buildWhatsAppLink,
        getMessageTemplate,
        setMessageTemplate,
        exportLinksCSV,
        exportRSVPReport,
        regenerateToken,
        removeGuest
    };
})();

window.GuestManager = GuestManager;
