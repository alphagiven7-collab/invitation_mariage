const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const script = (name) => fs.readFileSync(`assets/js/${name}.js`, 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function localHarness(initial = []) {
    let eventId = 'wedding';
    let rejectGuestWrites = false;
    const store = new Map([['wedding_event_wedding_guests', JSON.stringify(initial)]]);
    const EventConfig = { getEventId: () => eventId, isReady: () => true,
        buildInvitationBaseUrl: () => 'https://invitation.test/pages/invitation.html' };
    const localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => {
        if (rejectGuestWrites && key.endsWith('_guests')) throw new Error('Quota exceeded');
        store.set(key, value);
    }, removeItem: (key) => store.delete(key) };
    const sandbox = { window: { EventConfig, crypto: { randomUUID }, location: { search: '' } }, EventConfig,
        crypto: { randomUUID }, localStorage, URLSearchParams, console };
    vm.runInNewContext(script('guest-manager'), sandbox);
    sandbox.GuestManager = sandbox.window.GuestManager;
    vm.runInNewContext(script('table-manager'), sandbox);
    return { tables: sandbox.window.TableManager, guests: sandbox.window.GuestManager, store,
        rejectGuestWrites() { rejectGuestWrites = true; },
        switchEvent(id) { eventId = id; } };
}

function guest(id, extra = {}) {
    return { id, fullName: `Invité ${id}`, token: `token-${id}`, slug: id, status: 'pending', adults: 1, children: 0, ...extra };
}

test('legacy table labels are recovered exactly without turning groups into tables or changing guests', async () => {
    const initial = [guest('a', { tableNumber: '12', group: 'Famille' }), guest('b', { tableNumber: 'Roses' }),
        guest('c', { tableNumber: 'roses' }), guest('d', { group: 'Sans table' })];
    const h = localHarness(initial);
    const tables = await h.tables.loadTables();
    assert.deepEqual(plain(tables.map((t) => t.name)), ['12', 'Roses', 'roses']);
    assert(tables.every((t) => t.capacity === null));
    assert.deepEqual(plain(await h.guests.loadGuests()), initial);
    assert.equal(h.tables.getGuestTableId(initial[3], tables), null);
});

test('table CRUD and grouped assignment preserve identities, personal links and RSVP data', async () => {
    const a = guest('a', { status: 'yes', adults: 2, children: 1, rsvpMessage: 'Merci', checkedInAt: '2026-10-02', group: 'Amis', drinkChoices: ['eau'] });
    const b = guest('b', { tableNumber: 'Ancienne' });
    const h = localHarness([a, b]);
    const beforeLink = h.guests.buildInviteLink(a);
    const table = await h.tables.createTable({ name: 'Roses', capacity: '10' });
    assert.equal(table.capacity, 10);
    assert.deepEqual(plain(await h.tables.assignGuests(['a', 'b', 'a'], table.id)), { updatedCount: 2 });
    let saved = await h.guests.loadGuests();
    assert.equal(saved[0].tableId, table.id);
    assert.equal(saved[0].tableNumber, 'Roses');
    assert.equal(h.guests.buildInviteLink(saved[0]), beforeLink);
    for (const key of Object.keys(a)) if (key !== 'tableNumber') assert.deepEqual(plain(saved[0][key]), a[key]);
    await h.tables.updateTable(table.id, { name: 'Table d’honneur', capacity: 12 });
    saved = await h.guests.loadGuests();
    assert(saved.every((g) => g.tableNumber === 'Table d’honneur'));
    await h.tables.deleteTable(table.id);
    saved = await h.guests.loadGuests();
    assert.equal(saved.length, 2);
    assert(saved.every((g) => g.tableId === null && g.tableNumber === ''));
    assert.equal(saved[0].rsvpMessage, 'Merci');
    assert.equal(saved[0].token, a.token);
    assert.equal(saved[0].group, 'Amis');
});

test('occupied places reserve adults and children before RSVP and exclude declined invitations', () => {
    const h = localHarness();
    const guests = [guest('a', { tableId: 't', adults: 2, children: 1 }), guest('b', { tableId: 't', status: 'yes', adults: 0, children: 2 }),
        guest('c', { tableId: 't', status: 'no', adults: 8 }), guest('d')];
    const [table] = h.tables.getSummary([{ id: 't', name: '3', capacity: 4 }], guests);
    assert.equal(table.occupied, 5);
    assert.equal(table.guestCount, 3);
    assert.equal(table.overCapacity, true);
    assert.equal(table.guests.length, 3, 'Declined invitations remain visible, but reserve no seats');
});

for (const action of ['unassign', 'delete']) {
    test(`a legacy table alias cannot restore a table after ${action}`, async () => {
        const initial = guest('legacy', { table: 'Roses', status: 'yes', rsvpMessage: 'Présente' });
        const h = localHarness([initial]);
        const [table] = await h.tables.loadTables();
        await h.tables.updateTable(table.id, { name: 'Jasmin', capacity: null });
        assert.equal((await h.guests.loadGuests())[0].table, 'Jasmin');
        if (action === 'unassign') await h.tables.assignGuests(['legacy'], null);
        else await h.tables.deleteTable(table.id);
        const [saved] = await h.guests.loadGuests();
        assert.equal(saved.tableNumber || saved.table || '', '');
        assert.equal(saved.token, initial.token);
        assert.equal(saved.rsvpMessage, initial.rsvpMessage);
        const tables = await h.tables.loadTables(true);
        assert.equal(tables.length, action === 'delete' ? 0 : 1);
        assert.equal(h.tables.getGuestTableId(saved, tables), null);
    });
}

test('invalid and cross-event assignments never partially update the selected guests', async () => {
    const initial = [guest('a'), guest('b')];
    const h = localHarness(initial);
    const table = await h.tables.createTable({ name: '1', capacity: null });
    await assert.rejects(h.tables.assignGuests(['a', 'missing'], table.id), /liste des invités/);
    assert.deepEqual(plain(await h.guests.loadGuests()), initial);
    h.switchEvent('other');
    assert.equal((await h.tables.loadTables()).length, 0);
    await assert.rejects(h.tables.assignGuests(['a'], table.id), /table n'existe plus/);
    h.switchEvent('wedding');
    assert.equal((await h.tables.loadTables())[0].id, table.id);
});

test('table validation and duplicate names leave existing metadata intact', async () => {
    const h = localHarness();
    for (const capacity of [0, -1, 2.5, 'dix', Infinity]) {
        await assert.rejects(h.tables.createTable({ name: 'Roses', capacity }), /capacité/);
    }
    await assert.rejects(h.tables.createTable({ name: ' ', capacity: 5 }), /nom ou numéro/);
    const table = await h.tables.createTable({ name: 'Roses', capacity: '' });
    await assert.rejects(h.tables.createTable({ name: 'Roses', capacity: 8 }), /déjà/);
    assert.equal((await h.tables.loadTables())[0].capacity, null);
    assert.equal((await h.tables.loadTables())[0].id, table.id);
});

test('a failed local save never makes an unsaved assignment appear in the guest cache', async () => {
    const initial = [guest('a')];
    const h = localHarness(initial);
    const table = await h.tables.createTable({ name: 'Roses', capacity: null });
    h.rejectGuestWrites();
    await assert.rejects(h.tables.assignGuests(['a'], table.id), /Quota exceeded/);
    assert.deepEqual(plain(await h.guests.loadGuests()), initial);
    assert.deepEqual(JSON.parse(h.store.get('wedding_event_wedding_guests')), initial);
});

test('changing capacity preserves an exact historical table name beyond the new input limit', async () => {
    const name = 'Ancienne table '.repeat(10);
    const h = localHarness([guest('a', { tableNumber: name })]);
    const [table] = await h.tables.loadTables();
    await h.tables.updateTable(table.id, { name, capacity: 12 });
    assert.equal((await h.tables.loadTables())[0].name, name);
    assert.equal((await h.guests.loadGuests())[0].tableNumber, name);
    await assert.rejects(h.tables.updateTable(table.id, { name: 'Autre table '.repeat(20), capacity: 12 }), /120 caractères/);
});

test('hundreds of invitations share cached table reads and summaries count every person', async () => {
    const h = localHarness(Array.from({ length: 650 }, (_, i) => guest(`g-${i}`, { tableNumber: String(i % 50), adults: 2 })));
    const tables = await h.tables.loadTables();
    assert.equal(await h.tables.loadTables(), tables);
    const summaries = h.tables.getSummary(tables, await h.guests.loadGuests());
    assert.equal(summaries.length, 50);
    assert.equal(summaries.reduce((sum, t) => sum + t.occupied, 0), 1300);
});

function cloudHarness(respond, authorized = true) {
    const calls = [];
    const AuthGuard = { isGuestManager: () => authorized, getSession: () => ({ accessToken: 'organizer-token' }) };
    const window = { SUPABASE_CONFIG: { enabled: true, url: 'https://cloud.test', anonKey: 'publishable' }, AuthGuard };
    const sandbox = { window, AuthGuard, console: { warn() {} }, localStorage: { removeItem() {} },
        fetch: async (url, options) => {
            calls.push({ url, ...options });
            const result = await respond(url, options);
            return { ok: !result.status || result.status < 400, status: result.status || 200, text: async () => JSON.stringify(result.data) };
        } };
    vm.runInNewContext(script('cloud-api'), sandbox);
    return { cloud: window.CloudAPI, calls, sandbox };
}

test('bulk assignment sends one scoped RPC and never rewrites any RSVP or invitation token', async () => {
    const h = cloudHarness(() => ({ data: 600 }));
    const ids = Array.from({ length: 600 }, () => randomUUID());
    const result = await h.cloud.assignGuestTable('wedding', ids, 'table-id');
    assert.equal(result.updatedCount, 600);
    assert.equal(h.calls.length, 1);
    assert.match(h.calls[0].url, /rpc\/assign_managed_table$/);
    assert.deepEqual(JSON.parse(h.calls[0].body), { p_event_id: 'wedding', p_guest_ids: ids, p_table_id: 'table-id' });
    assert.equal(h.calls[0].headers.Authorization, 'Bearer organizer-token');
});

test('a missing table migration is distinguished from a rejected permission and never uses local guests', async () => {
    const unavailable = cloudHarness(() => ({ status: 404, data: { code: 'PGRST205', message: 'event_tables absent' } }));
    await assert.rejects(unavailable.cloud.getTables('wedding'), { code: 'TABLES_NOT_READY' });
    const denied = cloudHarness(() => ({ status: 403, data: { code: '42501', message: 'Permission denied' } }));
    await assert.rejects(denied.cloud.getTables('wedding'), { code: '42501' });
    const anonymous = cloudHarness(() => { throw new Error('must not fetch'); }, false);
    await assert.rejects(anonymous.cloud.getTables('wedding'), /Connexion organisateur/);
    assert.equal(anonymous.calls.length, 0);
});

test('editing a contact patches only that field and preserves zero adults from the fresh database response', async () => {
    const h = cloudHarness(() => ({ data: [{ id: 'g', event_id: 'wedding', full_name: 'Marie', token: 'existing',
        status: 'yes', adults: 0, children: 2, phone: '+33123456789', table_id: 'stable', table_number: 'Roses' }] }));
    const result = await h.cloud.patchGuest('wedding', 'g', { phone: '+33123456789' });
    assert.deepEqual(JSON.parse(h.calls[0].body), { phone: '+33123456789' });
    assert.match(h.calls[0].url, /event_id=eq.wedding/);
    assert.equal(result.guest.status, 'yes');
    assert.equal(result.guest.tableId, 'stable');
    assert.equal(result.guest.adults, 0);
});

test('an explicit table ID on creation cannot disappear through an old-schema fallback', async () => {
    const h = cloudHarness(() => ({ status: 400, data: { message: 'unknown table_id' } }));
    await assert.rejects(h.cloud.upsertGuest('wedding', { id: 'g', fullName: 'Marie', tableId: 't' }, { createOnly: true }), /table_id/);
    assert.equal(h.calls.length, 1);
    assert.equal(JSON.parse(h.calls[0].body).table_id, 't');
});
