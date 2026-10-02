/** Tables d'un événement : registre privé et affectations indépendantes du RSVP. */
const TableManager = (() => {
    let cache = null;
    let cacheEvent = null;
    let pending = null;
    let pendingEvent = null;
    let revision = 0;

    function eventId() {
        return window.EventConfig?.getEventId?.()
            || new URLSearchParams(window.location.search).get("event") || "demo";
    }

    function cloudEnabled() { return !!window.CloudAPI?.isEnabled?.(); }
    function tablesKey(id) { return `wedding_event_${id}_tables`; }
    function guestsKey(id) { return `wedding_event_${id}_guests`; }

    function invalidate() {
        revision += 1;
        cache = null;
        cacheEvent = null;
        pending = null;
        pendingEvent = null;
        window.GuestManager?.invalidateCache?.();
    }

    function tableName(guest) { return String(guest?.tableNumber || guest?.table || ""); }

    function getGuestTableId(guest, tables) {
        if (guest?.tableId) return tables.some((table) => table.id === guest.tableId) ? guest.tableId : null;
        const name = tableName(guest);
        return name.trim() ? tables.find((table) => table.name === name)?.id || null : null;
    }

    function getSeatCount(guest) {
        if (guest?.status === "no") return 0;
        const count = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 0
            ? Math.floor(Number(value)) : fallback;
        return Math.max(1, count(guest?.adults ?? 1, 1) + count(guest?.children ?? 0, 0));
    }

    function getSummary(tables, guests) {
        const summaries = tables.map((table) => ({ ...table, occupied: 0, guestCount: 0, guests: [], overCapacity: false }));
        const byId = new Map(summaries.map((table) => [table.id, table]));
        const byName = new Map(summaries.map((table) => [table.name, table]));
        for (const guest of guests) {
            const table = guest.tableId ? byId.get(guest.tableId) : byName.get(tableName(guest));
            if (!table) continue;
            table.guests.push(guest);
            table.guestCount += 1;
            table.occupied += getSeatCount(guest);
        }
        summaries.forEach((table) => { table.overCapacity = table.capacity !== null && table.occupied > table.capacity; });
        return summaries;
    }

    function validate(input, previousName) {
        const rawName = String(input.name ?? "");
        const unchanged = previousName !== undefined && rawName === previousName;
        const name = unchanged ? rawName : rawName.trim();
        if (!name || (!unchanged && name.length > 120)) throw new Error("Le nom ou numéro de table doit contenir entre 1 et 120 caractères.");
        const capacity = input.capacity === null || input.capacity === undefined || input.capacity === ""
            ? null : Number(input.capacity);
        if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 2147483647)) {
            throw new Error("La capacité doit être un nombre entier positif, ou rester vide.");
        }
        return { name, capacity };
    }

    // Deux écritures locales synchrones, restaurées en cas de quota insuffisant.
    // En cloud, les opérations équivalentes sont des transactions SQL.
    function saveLocal(id, tables, guests) {
        const key = tablesKey(id);
        const previous = localStorage.getItem(key);
        localStorage.setItem(key, JSON.stringify(tables));
        try {
            if (guests) localStorage.setItem(guestsKey(id), JSON.stringify(guests));
        } catch (error) {
            if (previous === null) localStorage.removeItem(key);
            else localStorage.setItem(key, previous);
            throw error;
        }
    }

    async function readLocal(id) {
        const raw = localStorage.getItem(tablesKey(id));
        const tables = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(tables)) throw new Error("Les tables enregistrées ne peuvent pas être lues.");
        const names = new Set(tables.map((table) => table.name));
        let added = false;
        for (const guest of await GuestManager.loadGuests()) {
            const name = tableName(guest);
            if (!name.trim() || names.has(name)) continue;
            tables.push({ id: guest.tableId || crypto.randomUUID(), eventId: id, name, capacity: null });
            names.add(name);
            added = true;
        }
        if (added) saveLocal(id, tables);
        return tables;
    }

    async function loadTables(force = false) {
        const id = eventId();
        if (pending && pendingEvent === id) return pending;
        if (!force && cache && cacheEvent === id) return cache;
        const currentRevision = revision;
        const request = (async () => {
            const tables = cloudEnabled() ? await CloudAPI.getTables(id) : await readLocal(id);
            if (currentRevision === revision) { cache = tables; cacheEvent = id; }
            return tables;
        })();
        pending = request;
        pendingEvent = id;
        try { return await request; }
        finally { if (pending === request) { pending = null; pendingEvent = null; } }
    }

    async function createTable(input) {
        const data = validate(input);
        const id = eventId();
        let result;
        if (cloudEnabled()) result = await CloudAPI.createTable(id, data);
        else {
            const tables = await loadTables(true);
            if (tables.some((table) => table.name === data.name)) throw new Error("Une table porte déjà ce nom.");
            result = { ...data, id: crypto.randomUUID(), eventId: id };
            saveLocal(id, [...tables, result]);
        }
        invalidate();
        return result;
    }

    async function updateTable(tableId, input) {
        const id = eventId();
        const tables = await loadTables(true);
        const previous = tables.find((table) => table.id === tableId);
        if (!previous) throw new Error("Cette table n'existe plus.");
        const data = validate(input, previous.name);
        let result;
        if (cloudEnabled()) result = await CloudAPI.updateTable(id, tableId, data);
        else {
            if (tables.some((table) => table.id !== tableId && table.name === data.name)) throw new Error("Une table porte déjà ce nom.");
            result = { ...previous, ...data };
            const guests = (await GuestManager.loadGuests(true)).map((guest) => getGuestTableId(guest, tables) === tableId
                ? { ...guest, tableId, tableNumber: data.name,
                    ...(Object.hasOwn(guest, "table") ? { table: data.name } : {}) } : guest);
            saveLocal(id, tables.map((table) => table.id === tableId ? result : table), guests);
        }
        invalidate();
        return result;
    }

    async function deleteTable(tableId) {
        const id = eventId();
        if (cloudEnabled()) await CloudAPI.deleteTable(id, tableId);
        else {
            const tables = await loadTables(true);
            if (!tables.some((table) => table.id === tableId)) throw new Error("Cette table n'existe plus.");
            const guests = (await GuestManager.loadGuests(true)).map((guest) => getGuestTableId(guest, tables) === tableId
                ? { ...guest, tableId: null, tableNumber: "",
                    ...(Object.hasOwn(guest, "table") ? { table: "" } : {}) } : guest);
            saveLocal(id, tables.filter((table) => table.id !== tableId), guests);
        }
        invalidate();
    }

    async function assignGuests(guestIds, tableId) {
        const ids = [...new Set(guestIds || [])];
        if (!ids.length) throw new Error("Sélectionnez au moins un invité.");
        if (ids.some((id) => typeof id !== "string" || !id)) throw new Error("La sélection d'invités est invalide.");
        const id = eventId();
        let result;
        if (cloudEnabled()) result = await CloudAPI.assignGuestTable(id, ids, tableId);
        else {
            const tables = await loadTables(true);
            const table = tableId ? tables.find((item) => item.id === tableId) : null;
            if (tableId && !table) throw new Error("Cette table n'existe plus.");
            result = await GuestManager.applyLocalTableAssignment(ids, table?.id, table?.name);
        }
        invalidate();
        return result;
    }

    return { loadTables, createTable, updateTable, deleteTable, assignGuests, getSummary, getGuestTableId, getSeatCount, invalidate };
})();

window.TableManager = TableManager;
