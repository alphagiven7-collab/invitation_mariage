/**
 * Gestion des invités — local + cloud (Supabase)
 * Étapes 2, 3, 4
 */
const GuestManager = (() => {
    let cache = null;
    let cacheEventId = null;

    function getEventId() {
        if (window.EventConfig && EventConfig.isReady()) return EventConfig.getEventId();
        const params = new URLSearchParams(window.location.search);
        return params.get("event") || "demo";
    }

    function storageKey() {
        return `wedding_event_${getEventId()}_guests`;
    }

    function slugify(name) {
        const slug = (name || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        return slug;
    }

    function similarity(left, right) {
        const a = slugify(left);
        const b = slugify(right);
        if (!a || !b) return 0;
        if (a === b) return 1;
        const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
        for (let row = 1; row <= a.length; row++) {
            let diagonal = previous[0];
            previous[0] = row;
            for (let column = 1; column <= b.length; column++) {
                const above = previous[column];
                previous[column] = Math.min(
                    previous[column] + 1,
                    previous[column - 1] + 1,
                    diagonal + (a[row - 1] === b[column - 1] ? 0 : 1)
                );
                diagonal = above;
            }
        }
        return 1 - previous[b.length] / Math.max(a.length, b.length);
    }

    function buildGuestSlug(fullName, token) {
        const slug = slugify(fullName);
        if (slug) return slug;
        return `invite-${String(token || generateToken()).slice(0, 10)}`;
    }

    function generateToken() {
        if (window.crypto && crypto.randomUUID) {
            return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        }
        return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
    }

    // No implicit country: local numbers cannot safely be equated to international ones.
    function normalizePhone(value) {
        const text = String(value || "").trim();
        if (!/^[+\d\s().-]*$/.test(text)) return text;
        return text.replace(/\D/g, "").replace(/^00/, "");
    }

    function identityKey(guest) {
        const name = String(guest.fullName || "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
        return JSON.stringify([name, normalizePhone(guest.phone), String(guest.email || "").trim().toLowerCase()]);
    }

    function createGuest(row) {
        const fullName = String(row.fullName || "").trim();
        const token = generateToken();
        return {
            id: crypto.randomUUID(),
            slug: buildGuestSlug(fullName, token),
            fullName,
            phone: String(row.phone || "").trim(),
            email: String(row.email || "").trim(),
            group: String(row.tableName || row.group || "").trim(),
            token,
            status: "pending",
            qrApproved: false,
            accessCode: "",
            tableNumber: String(row.tableNumber || "").trim(),
            drinkChoices: [],
            profilePhotoUrl: String(row.profilePhotoUrl || "").trim(),
            adults: 1,
            children: 0,
            rsvpMessage: "",
            respondedAt: null,
            createdAt: new Date().toISOString()
        };
    }

    function buildInviteLink(guest) {
        const base = EventConfig.buildInvitationBaseUrl();
        const params = new URLSearchParams();
        params.set("event", getEventId());
        params.set("t", guest.token);
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
        const eventId = getEventId();
        const cloudEnabled = !!window.CloudAPI?.isEnabled?.();
        if (cache && cacheEventId === eventId && !force) return cache;
        if (cloudEnabled) {
            cache = await CloudAPI.getGuests(eventId);
        } else {
            try {
                const raw = localStorage.getItem(storageKey());
                cache = raw ? JSON.parse(raw) : [];
            } catch {
                cache = [];
            }
        }
        cacheEventId = eventId;
        return cache;
    }

    async function persistGuests(guests) {
        const eventId = getEventId();
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            cache = null;
        } else {
            cache = guests;
            localStorage.setItem(storageKey(), JSON.stringify(guests));
        }
    }

    async function addGuest({ fullName, phone = "", email = "", group = "", tableNumber = "", profilePhotoUrl = "" }) {
        const trimmedName = (fullName || "").trim();
        if (trimmedName.length < 2) return { guest: null, duplicate: false, cloudSynced: false };

        await loadGuests(true);
        const draft = createGuest({ fullName: trimmedName, phone, email, group, tableNumber, profilePhotoUrl });
        const slug = draft.slug;
        const guests = [...(await loadGuests())];
        const existing = guests.find((g) => identityKey(g) === identityKey(draft));
        if (existing) {
            return { guest: existing, duplicate: true, cloudSynced: true };
        }
        if (guests.some((g) => g.slug === draft.slug)) draft.slug += `-${draft.token}`;

        if (window.CloudAPI && CloudAPI.restoreDeletedGuest) {
            CloudAPI.restoreDeletedGuest(getEventId(), { slug, token: draft.token });
        }

        const guest = draft;
        let saved = guest;
        let cloudSynced = !(window.CloudAPI && CloudAPI.isEnabled());
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            try {
                const result = await CloudAPI.upsertGuest(getEventId(), guest, { createOnly: true });
                saved = result?.guest || null;
                cloudSynced = !!result?.cloudSynced;
            } catch (e) {
                console.warn("GuestManager.addGuest cloud sync", e);
                saved = null;
                cloudSynced = false;
            }
            if (!saved || !cloudSynced) {
                return { guest: null, duplicate: false, cloudSynced: false };
            }
        } else {
            guests.push(guest);
            await persistGuests(guests);
        }

        cache = null;
        await loadGuests(true);
        return { guest: saved, duplicate: false, cloudSynced };
    }

    async function findByToken(token) {
        if (!token) return null;
        if (window.CloudAPI && CloudAPI.isEnabled() && CloudAPI.getGuestByInviteToken) {
            const guest = await CloudAPI.getGuestByInviteToken(token);
            if (guest && guest.eventId === getEventId()) return guest;
            return null;
        }
        const guests = await loadGuests();
        return guests.find((g) => g.token === token) || null;
    }

    async function findBySlug(slug) {
        if (!slug) return null;
        const guests = await loadGuests();
        return guests.find((g) => g.slug === slug) || null;
    }

    async function findByName(fullName) {
        if (!fullName || fullName.trim().length < 2) return null;
        const guests = await loadGuests();
        const normalized = fullName.trim().toLowerCase();
        return guests.find((g) => g.fullName.trim().toLowerCase() === normalized) || null;
    }

    async function updateGuest(id, patch) {
        const guests = await loadGuests();
        const idx = guests.findIndex((g) => g.id === id);
        if (idx === -1) return null;

        const next = { ...guests[idx], ...patch };
        if (patch.fullName && patch.fullName.trim() !== guests[idx].fullName) {
            next.fullName = patch.fullName.trim();
        }
        if (patch.phone !== undefined) next.phone = (patch.phone || "").trim();
        if (patch.email !== undefined) next.email = (patch.email || "").trim();
        if (["fullName", "phone", "email"].some((key) => patch[key] !== undefined) &&
            identityKey(next) !== identityKey(guests[idx]) &&
            guests.some((guest) => guest.id !== id && identityKey(guest) === identityKey(next))) return null;
        if (patch.group !== undefined) next.group = (patch.group || "").trim();
        if (patch.qrApproved !== undefined) next.qrApproved = !!patch.qrApproved;
        if (patch.accessCode !== undefined) next.accessCode = String(patch.accessCode || "").trim().toUpperCase();
        if (patch.tableNumber !== undefined) next.tableNumber = String(patch.tableNumber || "").trim();
        if (patch.drinkChoices !== undefined) {
            next.drinkChoices = Array.isArray(patch.drinkChoices) ? patch.drinkChoices : [];
        }
        if (patch.profilePhotoUrl !== undefined) next.profilePhotoUrl = String(patch.profilePhotoUrl || "").trim();
        if (patch.checkedInAt !== undefined) next.checkedInAt = patch.checkedInAt || null;
        let saved = next;
        let cloudSynced = !(window.CloudAPI && CloudAPI.isEnabled());
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            try {
                const result = await CloudAPI.upsertGuest(getEventId(), next, { requireExisting: true });
                saved = result?.guest || null;
                cloudSynced = !!result?.cloudSynced;
            } catch (e) {
                console.warn("GuestManager.updateGuest cloud sync", e);
                saved = null;
                cloudSynced = false;
            }
            if (!saved || !cloudSynced) {
                return { guest: null, cloudSynced: false, error: "La modification n'a pas été enregistrée dans Supabase." };
            }
        }
        guests[idx] = saved;
        await persistGuests(guests);
        cache = null;
        await loadGuests(true);
        return { guest: saved, cloudSynced };
    }

    async function recordRSVP({ guestId, fullName, phone, status, adults, children, message, drinkChoices, inviteToken, profilePhotoUrl }) {
        if (!inviteToken) {
            throw new Error("Cette invitation est réservée aux personnes ajoutées par l'organisateur. Contactez l'organisateur pour être ajouté(e) à la liste.");
        }
        if (inviteToken && window.CloudAPI && CloudAPI.isEnabled() && CloudAPI.submitGuestRsvp) {
            const cloudGuest = await CloudAPI.submitGuestRsvp(getEventId(), inviteToken, {
                phone,
                status,
                adults,
                children,
                message,
                drinkChoices,
                profilePhotoUrl
            });
            if (!cloudGuest || cloudGuest.eventId !== getEventId()) return null;
            cache = null;
            cacheEventId = null;
            return cloudGuest;
        }
        await loadGuests(true);
        const guests = await loadGuests();
        let guest = guestId ? guests.find((g) => g.id === guestId) : null;
        if (!guest && fullName) {
            guest = guests.find((g) => g.fullName.toLowerCase() === fullName.toLowerCase());
        }
        if (!guest || guest.token !== inviteToken) {
            throw new Error("Cette invitation est réservée aux personnes ajoutées par l'organisateur. Contactez l'organisateur pour être ajouté(e) à la liste.");
        }
        if (guest.status !== "pending") return { ...guest, alreadyConfirmed: true };

        const nextAccessCode = guest.accessCode || guest.token.slice(0, 8).toUpperCase();

        const patch = {
            status: status === "yes" ? "yes" : status === "no" ? "no" : "pending",
            adults: Number(adults) || 1,
            children: Number(children) || 0,
            rsvpMessage: message || "",
            phone: phone || guest.phone,
            drinkChoices: Array.isArray(drinkChoices) ? drinkChoices : guest.drinkChoices || [],
            accessCode: nextAccessCode,
            respondedAt: new Date().toISOString(),
            qrApproved: status === "yes"
        };
        if (profilePhotoUrl) patch.profilePhotoUrl = profilePhotoUrl;

        const updated = await updateGuest(guest.id, patch);

        if (window.CloudAPI && CloudAPI.isEnabled()) {
            const syncedGuest = updated?.guest || updated || guest;
            const synced = await CloudAPI.upsertGuest(getEventId(), syncedGuest);
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
        cacheEventId = null;
        return updated?.guest || updated;
    }

    function parseCsvRecords(text, separator = null) {
        const source = String(text || "").replace(/^\uFEFF/, "");
        if (!separator) {
            const first = source.split(/\r\n|\n|\r/).find((line) => line.trim()) || "";
            const counts = { ",": 0, ";": 0, "\t": 0 };
            let quoted = false;
            for (let i = 0; i < first.length; i++) {
                if (first[i] === '"') {
                    if (quoted && first[i + 1] === '"') i++;
                    else quoted = !quoted;
                } else if (!quoted && first[i] in counts) counts[first[i]]++;
            }
            separator = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        }
        const records = [];
        const lineNumbers = [];
        let record = [], field = "", quoted = false, closed = false, line = 1, startLine = 1;
        const finishField = () => { record.push(field.trim()); field = ""; closed = false; };
        const finishRecord = () => { finishField(); records.push(record); lineNumbers.push(startLine); record = []; };
        for (let i = 0; i < source.length; i++) {
            const c = source[i];
            if (c === '"') {
                if (quoted && source[i + 1] === '"') { field += '"'; i++; }
                else if (quoted) { quoted = false; closed = true; }
                else if (!field.trim() && !closed) { field = ""; quoted = true; }
                else throw new Error(`Ligne ${line} : guillemet inattendu.`);
            } else if (c === separator && !quoted) finishField();
            else if (c === "\n" || c === "\r") {
                if (c === "\r" && source[i + 1] === "\n") i++;
                if (quoted) field += "\n";
                else finishRecord();
                line++;
                if (!quoted) startLine = line;
            } else {
                if (closed && c.trim()) throw new Error(`Ligne ${line} : caractère après un guillemet fermant.`);
                field += c;
            }
        }
        if (quoted) throw new Error(`Ligne ${startLine} : guillemets non fermés. Corrigez le fichier avant importation.`);
        if (field || record.length || closed) finishRecord();
        Object.defineProperty(records, "lineNumbers", { value: lineNumbers });
        return records;
    }

    function parseCSV(text) {
        const records = parseCsvRecords(text);
        const first = records.findIndex((record) => record.some(Boolean));
        if (first < 0) throw new Error("Le fichier CSV est vide.");
        const normalizeHeader = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .trim().toLowerCase().replace(/[\s-]+/g, "_");
        const header = records[first].map(normalizeHeader);
        const aliases = {
            fullName: ["nom", "name", "full_name", "fullname"],
            phone: ["contact", "telephone", "phone", "tel", "mobile"],
            email: ["email", "mail"], group: ["groupe", "group", "group_name"],
            tableNumber: ["table", "table_number", "numero_table", "num_table"],
            tableName: ["table_name"], guestType: ["guest_type"]
        };
        const indexes = {};
        for (const [key, names] of Object.entries(aliases)) {
            const found = header.map((h, i) => names.includes(h) ? i : -1).filter((i) => i >= 0);
            if (found.length > 1) throw new Error(`Colonne ambiguë : ${names[0]} apparaît plusieurs fois.`);
            indexes[key] = found[0] ?? -1;
        }
        if (indexes.fullName < 0) throw new Error("Colonne 'nom' obligatoire dans le CSV.");
        const rows = [], rejected = [];
        records.forEach((cols, i) => {
            if (i === first) return;
            const line = records.lineNumbers[i];
            let reason = !cols.some(Boolean) ? "Ligne vide" : cols.length !== header.length ?
                `${cols.length} colonnes au lieu de ${header.length}` : "";
            const row = {};
            for (const [key, index] of Object.entries(indexes)) {
                if (index >= 0 || !["tableName", "guestType"].includes(key)) row[key] = index >= 0 ? cols[index] || "" : "";
            }
            if (!reason && row.fullName.trim().length < 2) reason = "Nom absent ou trop court";
            if (!reason && Object.values(row).some((value) => value.includes("\uFFFD"))) reason = "Encodage illisible";
            if (reason) rejected.push({ line, reason });
            else {
                row.phone = normalizePhone(row.phone);
                Object.defineProperty(row, "csvLine", { value: line });
                rows.push(row);
            }
        });
        Object.defineProperty(rows, "report", { value: { total: records.length - 1, rejected } });
        return rows;
    }

    function decodeCSV(buffer) {
        const bytes = new Uint8Array(buffer);
        if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder("utf-16le").decode(bytes);
        if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder("utf-16be").decode(bytes);
        try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
        catch { return new TextDecoder("windows-1252").decode(bytes); }
    }

    async function previewImport(rows, existing = null) {
        const guests = existing || await loadGuests(true);
        const known = new Set(guests.map(identityKey));
        const valid = [], duplicates = [], rejected = [...(rows.report?.rejected || [])];
        rows.forEach((row, index) => {
            const line = row.csvLine || index + 2;
            if (String(row.fullName || "").trim().length < 2) {
                rejected.push({ line, reason: "Nom absent ou trop court" });
            } else if (known.has(identityKey(row))) {
                duplicates.push({ line, fullName: row.fullName, reason: "Nom et contacts identiques (liste ou fichier)" });
            } else { known.add(identityKey(row)); valid.push(row); }
        });
        return { total: rows.report?.total ?? rows.length, valid, duplicates, rejected };
    }

    async function previewCsvCorrections(rows) {
        const guests = await loadGuests(true);
        const eligible = guests.filter((guest) => guest.status === "pending" && !String(guest.tableNumber || "").trim());
        const usedIds = new Set();
        const matches = [];
        const unmatched = [];

        rows.filter((row) => String(row.tableNumber || "").trim()).forEach((row) => {
            const options = eligible
                .filter((guest) => !usedIds.has(guest.id))
                .map((guest) => ({ guest, score: similarity(guest.fullName, row.fullName) }))
                .sort((left, right) => right.score - left.score);
            const best = options[0];
            if (!best || best.score < 0.72) {
                unmatched.push(row);
                return;
            }
            usedIds.add(best.guest.id);
            matches.push({
                guestId: best.guest.id,
                currentName: best.guest.fullName,
                importedName: row.fullName,
                tableNumber: String(row.tableNumber).trim(),
                tableName: String(row.tableName || "").trim(),
                score: best.score
            });
        });
        return { matches, unmatched, eligible: eligible.length };
    }

    async function applyCsvCorrections(corrections) {
        const selected = Array.isArray(corrections) ? corrections : [];
        if (!selected.length) return { updated: 0, cloudSynced: true };
        const guests = await loadGuests(true);
        const byId = new Map(guests.map((guest) => [guest.id, guest]));
        const updates = selected.map((correction) => {
            const guest = byId.get(correction.guestId);
            if (!guest || guest.status !== "pending" || String(guest.tableNumber || "").trim()) return null;
            return {
                ...guest,
                fullName: correction.importedName,
                tableNumber: correction.tableNumber,
                group: correction.tableName || guest.group
            };
        }).filter(Boolean);
        if (!updates.length) return { updated: 0, cloudSynced: true };

        const updatedById = new Map(updates.map((guest) => [guest.id, guest]));
        const merged = guests.map((guest) => updatedById.get(guest.id) || guest);
        await persistGuests(merged);
        let cloudSynced = true;
        if (window.CloudAPI?.isEnabled?.()) {
            for (let start = 0; start < updates.length; start += 3) {
                const batch = updates.slice(start, start + 3);
                const results = await Promise.all(batch.map((guest) =>
                    CloudAPI.upsertGuest(getEventId(), guest, { saveLocal: false, requireExisting: true }).catch(() => null)
                ));
                if (results.some((result) => !result?.cloudSynced)) cloudSynced = false;
            }
        }
        cache = merged;
        cacheEventId = getEventId();
        return { updated: updates.length, cloudSynced };
    }

    function hasConfirmedPhone(guest) {
        return guest.status === "yes" && String(guest.phone || "").replace(/\D/g, "").length >= 9;
    }

    async function replaceGuestsExceptConfirmedWithPhone(rows) {
        if (!rows.length || rows.report?.rejected.some((entry) => entry.reason !== "Ligne vide")) {
            throw new Error("Remplacement annulé : le CSV est vide ou contient des lignes invalides.");
        }
        const guests = await loadGuests(true);
        const replaceableIds = guests
            .filter((guest) => !hasConfirmedPhone(guest))
            .map((guest) => guest.id);
        if (replaceableIds.length) {
            const deleted = await removeGuests(replaceableIds);
            if (!deleted.cloudSynced) {
                throw new Error("La suppression cloud n'a pas abouti. Aucun nouvel invité n'a été importé.");
            }
        }
        const imported = await importCSVRows(rows);
        return { removed: replaceableIds.length, ...imported };
    }

    let importRunning = false;
    async function importCSVRows(rows, options = {}) {
        if (importRunning) throw new Error("Une importation est déjà en cours. Attendez sa fin avant de réessayer.");
        importRunning = true;
        try { return await performCSVImport(rows, options); }
        finally { importRunning = false; }
    }

    async function performCSVImport(rows, { onProgress } = {}) {
        const existing = await loadGuests(true);
        const preview = await previewImport(rows, existing);
        const knownSlugs = new Set(existing.map((guest) => guest.slug));
        const additions = preview.valid.map((row) => {
            const guest = createGuest(row);
            if (knownSlugs.has(guest.slug)) guest.slug += `-${guest.token}`;
            knownSlugs.add(guest.slug);
            guest.csvLine = row.csvLine;
            return guest;
        });
        const skipped = preview.duplicates.length + preview.rejected.length;
        if (!additions.length) {
            onProgress?.({ completed: 0, total: 0, percent: 100 });
            return { imported: 0, skipped };
        }

        if (window.CloudAPI && CloudAPI.isEnabled()) {
            let imported = 0;
            let failed = 0;
            const errors = [];
            let completed = 0;
            for (let start = 0; start < additions.length; start += 3) {
                const batch = additions.slice(start, start + 3);
                const results = await Promise.all(batch.map((guest) =>
                    CloudAPI.upsertGuest(getEventId(), guest, { saveLocal: false, createOnly: true }).catch((error) => ({ error: error.message }))
                ));
                results.forEach((result, index) => {
                    if (result?.guest && result.cloudSynced) imported++;
                    else {
                        failed++;
                        errors.push({ line: batch[index].csvLine, fullName: batch[index].fullName,
                            reason: result?.error || "Enregistrement Supabase refusé : vérifiez votre connexion et vos droits." });
                    }
                });
                completed += batch.length;
                onProgress?.({
                    completed,
                    total: additions.length,
                    percent: Math.round((completed / additions.length) * 100)
                });
            }
            cache = null;
            let warning = "";
            try { await loadGuests(true); }
            catch (error) { warning = `Import traité, mais actualisation impossible : ${error.message}`; }
            return { imported, skipped, failed, errors, warning };
        }

        const merged = [...existing, ...additions];
        await persistGuests(merged);
        cache = merged;
        cacheEventId = getEventId();
        onProgress?.({ completed: additions.length, total: additions.length, percent: 100 });
        return { imported: additions.length, skipped, failed: 0 };
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
        if (!guestId) return { removed: false, cloudSynced: false };
        let result = { removed: true, cloudSynced: true };
        if (window.CloudAPI?.isEnabled?.()) {
            result = await CloudAPI.removeGuestCloud(getEventId(), guestId);
        } else {
            const guests = (await loadGuests()).filter((g) => g.id !== guestId);
            await persistGuests(guests);
        }
        cache = null;
        await loadGuests(true);
        return result;
    }

    async function removeGuests(guestIds) {
        const ids = [...new Set((guestIds || []).filter(Boolean))];
        if (!ids.length) return { removed: 0, cloudSynced: true };
        let result;
        if (window.CloudAPI?.isEnabled?.() && window.CloudAPI?.removeGuestsCloud) {
            const guests = await loadGuests();
            result = await CloudAPI.removeGuestsCloud(getEventId(), ids, guests);
        } else {
            const guests = await loadGuests();
            const remaining = guests.filter((guest) => !ids.includes(guest.id));
            await persistGuests(remaining);
            result = { removed: guests.length - remaining.length, cloudSynced: true };
        }
        cache = null;
        cacheEventId = null;
        return result;
    }

    function duplicateScore(guest) {
        return (guest.status === "yes" ? 100 : 0)
            + (guest.qrApproved ? 20 : 0)
            + (guest.phone ? 4 : 0)
            + (guest.email ? 2 : 0)
            + (guest.tableNumber ? 1 : 0);
    }

    async function findDuplicateGuests() {
        const groups = new Map();
        for (const guest of await loadGuests(true)) {
            if (!String(guest.fullName || "").trim()) continue;
            const key = identityKey(guest);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(guest);
        }
        return [...groups.values()].filter((group) => group.length > 1).map((group) =>
            group.sort((a, b) => duplicateScore(b) - duplicateScore(a) ||
                String(a.createdAt || "").localeCompare(String(b.createdAt || ""))));
    }

    async function removeDuplicateGuests(selectedIds, { confirmed = false } = {}) {
        if (!confirmed || !Array.isArray(selectedIds)) throw new Error("Confirmation et sélection des doublons requises.");
        const groups = await findDuplicateGuests();
        const selected = new Set(selectedIds);
        const allowed = new Set();
        for (const group of groups) {
            if (group.every((guest) => selected.has(guest.id))) throw new Error("Conservez au moins un invité par groupe.");
            group.forEach((guest) => allowed.add(guest.id));
        }
        if (selectedIds.some((id) => !allowed.has(id))) throw new Error("La liste a changé. Relancez la détection des doublons.");
        return removeGuests(selectedIds);
    }

    return {
        loadGuests,
        addGuest,
        findByToken,
        findBySlug,
        findByName,
        updateGuest,
        recordRSVP,
        parseCSV,
        decodeCSV,
        previewImport,
        normalizePhone,
        findDuplicateGuests,
        parseCsvRecords,
        importCSVRows,
        previewCsvCorrections,
        applyCsvCorrections,
        replaceGuestsExceptConfirmedWithPhone,
        getStats,
        getPendingGuests,
        buildInviteLink,
        buildWhatsAppLink,
        getMessageTemplate,
        setMessageTemplate,
        exportLinksCSV,
        exportRSVPReport,
        regenerateToken,
        removeGuest,
        removeGuests,
        removeDuplicateGuests,
    };
})();

window.GuestManager = GuestManager;
