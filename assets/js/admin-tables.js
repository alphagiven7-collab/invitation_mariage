/* Gestion des tables : les écritures passent par TableManager. */
window.AdminTables = (() => {
    let tables = [];
    let guests = [];
    let summaries = [];
    let ready = false;
    let legacyAllowed = false;
    let loaded = false;
    let loading = null;
    let selectedTableId = null;
    let occupantsLimit = 50;
    let originalGuestTableId = null;
    let hooks = {};
    const byId = (id) => document.getElementById(id);
    const manager = () => window.TableManager;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function tableLabel(name) {
        return /^table\b/i.test(name) ? name : `Table ${name}`;
    }

    function occupancy(table) {
        return `${table.occupied} / ${table.capacity ?? '—'} places`;
    }

    function setAvailability(message = '') {
        for (const id of ['tables-availability', 'guest-tables-note']) {
            const notice = byId(id);
            if (notice) { notice.textContent = message; notice.hidden = !message; }
        }
        for (const id of ['table-form', 'tables-list-section', 'guest-table-bulk', 'guest-table-filter']) {
            if (byId(id)) byId(id).hidden = !ready;
        }
        for (const prefix of ['guest', 'edit-guest']) {
            byId(`${prefix}-table`).hidden = ready;
            byId(`${prefix}-table`).disabled = ready || !legacyAllowed;
            byId(`${prefix}-table-select`).hidden = !ready;
            byId(`${prefix}-table-select`).disabled = !ready;
            const label = document.querySelector(`[data-table-field-label="${prefix}"]`);
            if (label) label.htmlFor = ready ? `${prefix}-table-select` : `${prefix}-table`;
        }
        if (!ready) byId('table-occupants-panel').hidden = true;
    }

    async function load(force = false) {
        if (loading) return loading;
        if (loaded && !force) return ready;
        loading = (async () => {
            try {
                if (!manager()) throw Object.assign(new Error('Tables indisponibles.'), { code: 'TABLES_NOT_READY' });
                tables = await manager().loadTables(force);
                ready = true;
                legacyAllowed = false;
                setAvailability();
                syncGuests(guests);
            } catch (error) {
                ready = false;
                legacyAllowed = error.code === 'TABLES_NOT_READY';
                const message = error.code === 'TABLES_NOT_READY'
                    ? 'La gestion des tables doit être activée pour cet événement. Les tables déjà saisies restent disponibles.'
                    : 'Impossible de charger les tables. Réessayez avec « Actualiser ».';
                setAvailability(message);
            } finally {
                loaded = true;
                loading = null;
            }
            return ready;
        })();
        return loading;
    }

    function fillOptions(select, { filter = false, selected = select?.value || '' } = {}) {
        if (!select) return;
        select.replaceChildren();
        const add = (value, label) => {
            const option = element('option', '', label);
            option.value = value;
            select.appendChild(option);
        };
        if (filter) add('all', 'Toutes les tables');
        add(filter ? 'none' : '', 'Sans table');
        summaries.forEach((table) => add(table.id, `${tableLabel(table.name)} · ${occupancy(table)}`));
        select.value = selected;
        if (select.selectedIndex === -1) select.value = filter ? 'all' : '';
    }

    function syncGuests(nextGuests) {
        guests = nextGuests || [];
        if (!ready) return;
        summaries = manager().getSummary(tables, guests);
        for (const id of ['guest-table-select', 'edit-guest-table-select', 'bulk-table-select']) fillOptions(byId(id));
        fillOptions(byId('guest-table-filter'), { filter: true });
        renderCards();
        renderOccupants();
    }

    function getGuestTableId(guest) {
        return ready ? manager().getGuestTableId(guest, tables) : null;
    }

    function getGuestLabel(guest) {
        const id = getGuestTableId(guest);
        return tables.find((table) => table.id === id)?.name || String(guest?.tableNumber || '').trim() || '—';
    }

    function matchesFilter(guest) {
        if (!ready) return true;
        const filter = byId('guest-table-filter')?.value || 'all';
        const id = getGuestTableId(guest);
        if (filter === 'all') return true;
        if (filter === 'none') return !id && !String(guest.tableNumber || '').trim();
        return id === filter;
    }

    function updateSelection(ids = []) {
        const count = ids.length;
        byId('guest-selected-count').textContent = count ? `${count} invité${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}` : 'Aucun invité sélectionné';
        byId('assign-selected-table-btn').disabled = !ready || !count;
    }

    function creationAssignment() {
        if (!ready) return legacyAllowed ? { tableNumber: byId('guest-table').value.trim() } : {};
        const id = byId('guest-table-select').value || null;
        return { tableId: id, tableNumber: tables.find((table) => table.id === id)?.name || '' };
    }

    function openGuest(guest) {
        originalGuestTableId = getGuestTableId(guest);
        if (ready) byId('edit-guest-table-select').value = originalGuestTableId || '';
    }

    function editedAssignment() {
        const tableId = byId('edit-guest-table-select').value || null;
        return { changed: ready && tableId !== originalGuestTableId, tableId };
    }

    function resetForm() {
        byId('table-form').reset();
        byId('table-edit-id').value = '';
        byId('table-save-btn').textContent = 'Créer la table';
        byId('table-cancel-btn').hidden = true;
    }

    async function refreshAfterMutation() {
        await load(true);
        syncGuests(await window.GuestManager.loadGuests(true));
        await hooks.refresh?.();
    }

    function warnIfOverCapacity(tableId) {
        const table = summaries.find((item) => item.id === tableId);
        return table?.overCapacity ? ` Attention : ${tableLabel(table.name)} dépasse sa capacité (${occupancy(table)}).` : '';
    }

    async function assign(ids, tableId) {
        const result = await manager().assignGuests(ids, tableId);
        await refreshAfterMutation();
        return `${result.updatedCount ?? ids.length} invité(s) ${tableId ? 'affecté(s).' : 'sans table.'}${warnIfOverCapacity(tableId)}`;
    }

    function renderCards() {
        if (!ready) return;
        const search = (byId('table-search').value || '').trim().toLocaleLowerCase('fr');
        const list = summaries.filter((table) => table.name.toLocaleLowerCase('fr').includes(search));
        const grid = byId('tables-grid');
        grid.replaceChildren();
        const assigned = summaries.reduce((sum, table) => sum + table.guestCount, 0);
        byId('tables-summary').textContent = `${tables.length} table(s) · ${assigned} invité(s) placé(s)`;
        byId('tables-empty').hidden = !!list.length;
        byId('tables-empty').textContent = tables.length ? 'Aucune table ne correspond à cette recherche.' : 'Aucune table. Créez la première table ci-dessus.';
        list.forEach((table) => {
            const card = element('article', `table-card${table.overCapacity ? ' table-card--full' : ''}`);
            card.append(element('h3', '', tableLabel(table.name)));
            card.append(element('p', 'table-occupancy', occupancy(table)));
            card.append(element('p', 'table-card-meta', `${table.guestCount} invitation(s)${table.capacity == null ? ' · capacité à définir' : ''}`));
            if (table.overCapacity) card.append(element('p', 'table-capacity-warning', 'Capacité dépassée'));
            const actions = element('div', 'table-card-actions');
            for (const [action, label, className] of [['view', 'Voir les invités', 'admin-btn-primary'], ['edit', 'Modifier', 'admin-btn-ghost'], ['delete', 'Supprimer', 'admin-btn-danger']]) {
                const button = element('button', `admin-btn ${className}`, label);
                button.type = 'button';
                button.dataset.tableAction = action;
                button.dataset.tableId = table.id;
                actions.appendChild(button);
            }
            card.appendChild(actions);
            grid.appendChild(card);
        });
    }

    function renderOccupants() {
        const table = summaries.find((item) => item.id === selectedTableId);
        const panel = byId('table-occupants-panel');
        panel.hidden = !ready || !table;
        if (!table || !ready) return;
        byId('table-occupants-title').textContent = tableLabel(table.name);
        byId('table-occupants-summary').textContent = `${occupancy(table)} · ${table.guestCount} invitation(s)${warnIfOverCapacity(table.id)}`;
        const list = byId('table-occupants-list');
        list.replaceChildren();
        const occupants = [...table.guests].sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr'));
        if (!occupants.length) list.appendChild(element('li', 'admin-empty', 'Aucun invité à cette table. Affectez des invités depuis leur liste.'));
        occupants.slice(0, occupantsLimit).forEach((guest) => {
            const row = element('li', 'table-occupant');
            const identity = element('div', 'table-occupant-identity');
            identity.append(element('strong', '', guest.fullName));
            const status = { yes: 'Confirmé', no: 'Refus', pending: 'En attente' }[guest.status] || 'En attente';
            identity.append(element('small', '', `${status} · ${manager().getSeatCount(guest)} place(s)`));
            const select = element('select', 'admin-select');
            select.setAttribute('aria-label', `Table de ${guest.fullName}`);
            fillOptions(select, { selected: table.id });
            const move = element('button', 'admin-btn admin-btn-ghost', 'Déplacer');
            move.type = 'button';
            move.disabled = true;
            select.addEventListener('change', () => { move.disabled = select.value === table.id; });
            move.addEventListener('click', async () => {
                move.disabled = true;
                try { window.showToast(await assign([guest.id], select.value || null)); }
                catch (error) { window.showToast(error.message || 'Affectation impossible.'); move.disabled = false; }
            });
            row.append(identity, select, move);
            list.appendChild(row);
        });
        const more = byId('table-occupants-more');
        more.hidden = occupants.length <= occupantsLimit;
        more.textContent = `Afficher plus (${Math.max(0, occupants.length - occupantsLimit)})`;
    }

    async function render() {
        if (!await load()) return;
        syncGuests(await window.GuestManager.loadGuests());
    }

    function init(options) {
        hooks = options || {};
        byId('table-cancel-btn').addEventListener('click', resetForm);
        byId('table-search').addEventListener('input', renderCards);
        byId('table-occupants-close').addEventListener('click', () => { selectedTableId = null; renderOccupants(); });
        byId('table-occupants-more').addEventListener('click', () => { occupantsLimit += 50; renderOccupants(); });
        byId('tables-refresh-btn').addEventListener('click', async () => {
            const button = byId('tables-refresh-btn');
            button.disabled = true;
            try { await refreshAfterMutation(); }
            catch (error) { window.showToast(error.message || 'Actualisation impossible.'); }
            finally { button.disabled = false; }
        });
        byId('table-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = byId('table-save-btn');
            const name = byId('table-name').value;
            const rawCapacity = byId('table-capacity').value.trim();
            const capacity = rawCapacity ? Number(rawCapacity) : null;
            if (!name || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) return;
            button.disabled = true;
            try {
                const id = byId('table-edit-id').value;
                if (id) await manager().updateTable(id, { name, capacity });
                else await manager().createTable({ name, capacity });
                resetForm();
                await refreshAfterMutation();
                window.showToast(`Table enregistrée.${warnIfOverCapacity(id)}`);
            } catch (error) { window.showToast(error.message || 'Table non enregistrée.'); }
            finally { button.disabled = false; }
        });
        byId('tables-grid').addEventListener('click', async (event) => {
            const button = event.target.closest('[data-table-action]');
            if (!button) return;
            const table = summaries.find((item) => item.id === button.dataset.tableId);
            if (!table) return;
            if (button.dataset.tableAction === 'view') {
                selectedTableId = table.id;
                occupantsLimit = 50;
                renderOccupants();
                byId('table-occupants-title').focus();
                byId('table-occupants-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else if (button.dataset.tableAction === 'edit') {
                byId('table-edit-id').value = table.id;
                byId('table-name').value = table.name;
                byId('table-capacity').value = table.capacity ?? '';
                byId('table-save-btn').textContent = 'Enregistrer la table';
                byId('table-cancel-btn').hidden = false;
                byId('table-name').focus();
            } else {
                if (!window.confirm(`Supprimer ${tableLabel(table.name)} ? ${table.guestCount ? `${table.guestCount} invité(s) seront sans table. Leurs invitations et réponses seront conservées.` : 'Cette table est vide.'}`)) return;
                button.disabled = true;
                try {
                    await manager().deleteTable(table.id);
                    if (byId('table-edit-id').value === table.id) resetForm();
                    await refreshAfterMutation();
                    window.showToast('Table supprimée.');
                } catch (error) { window.showToast(error.message || 'Suppression impossible.'); button.disabled = false; }
            }
        });
        byId('assign-selected-table-btn').addEventListener('click', async () => {
            const ids = hooks.getSelectedIds?.() || [];
            if (!ids.length || !ready) return;
            const button = byId('assign-selected-table-btn');
            const tableId = byId('bulk-table-select').value || null;
            button.disabled = true;
            try {
                const message = await assign(ids, tableId);
                hooks.clearSelection?.();
                await hooks.refresh?.();
                window.showToast(message);
            } catch (error) { window.showToast(error.message || 'Affectation impossible.'); }
            finally { updateSelection(hooks.getSelectedIds?.() || []); }
        });
    }

    return { init, load, render, syncGuests, updateSelection, matchesFilter, getGuestLabel,
        creationAssignment, openGuest, editedAssignment, isReady: () => ready, canEditLegacy: () => legacyAllowed };
})();
