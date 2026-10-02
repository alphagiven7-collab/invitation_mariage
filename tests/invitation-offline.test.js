const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = (name) => fs.readFileSync(path.join(__dirname, '../assets/js', name), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const reply = (value, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(value) });
const guest = (eventId = 'event-a', token = 'token-a', extra = {}) => ({
    id: `guest-${token}`, eventId, token, fullName: 'Marie Dupont', status: 'yes',
    tableId: 'table-1', tableNumber: 'Rose', adults: 2, children: 1,
    qrApproved: true, accessCode: 'TOKEN-A', profilePhotoUrl: 'https://example.test/photo.jpg',
    drinkChoices: ['Eau'], rsvpMessage: 'A bientot', respondedAt: '2026-10-02T12:00:00Z', ...extra
});
const cloudGuest = (extra = {}) => ({
    id: 'guest-token-a', event_id: 'event-a', token: 'token-a', full_name: 'Marie Dupont', status: 'yes',
    table_id: 'table-1', table_number: 'Rose', adults: 2, children: 1, qr_approved: true, access_code: 'TOKEN-A',
    ...extra
});

function harness(options = {}) {
    const data = new Map();
    const events = [];
    let activeFetch = options.fetch || (async () => reply([cloudGuest()]));
    const localStorage = {
        get length() { return data.size; },
        key(i) { return [...data.keys()][i] ?? null; },
        getItem(key) { return data.get(key) ?? null; },
        setItem(key, value) { data.set(key, String(value)); },
        removeItem(key) { data.delete(key); }
    };
    const config = { enabled: true, url: 'https://api.example.test', anonKey: 'public-test-key' };
    const window = {
        location: { search: '?event=event-a&t=token-a', pathname: '/pages/invitation.html' },
        SUPABASE_CONFIG: config,
        EventConfig: { getEventId: () => 'event-a' },
        dispatchEvent(event) { events.push(event); }
    };
    const sandbox = {
        window, localStorage, navigator: { onLine: true }, URLSearchParams,
        crypto: { randomUUID: () => 'analytics-test-id' },
        CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
        fetch: (...args) => activeFetch(...args), console: { warn() {}, log() {}, error() {} }
    };
    const context = vm.createContext(sandbox);
    vm.runInContext(source('invitation-offline.js'), context);
    vm.runInContext(source('cloud-api.js'), context);
    return {
        data, events, localStorage, window, sandbox, offline: window.InvitationOffline, cloud: window.CloudAPI,
        setFetch(fn) { activeFetch = fn; },
        loadEventConfig(cloud) {
            if (cloud) Object.assign(window.CloudAPI, cloud);
            sandbox.CloudAPI = window.CloudAPI;
            vm.runInContext(source('event-config.js'), context);
            return window.EventConfig;
        }
    };
}

test('optional analytics never reject or send requests when an offline copy is displayed', async () => {
    const h = harness();
    let requests = 0;
    h.setFetch(async () => { requests++; throw new TypeError('network unavailable'); });
    h.sandbox.navigator.onLine = false;
    assert.equal(await h.cloud.track('event-a', 'view'), false);
    assert.equal(requests, 0);
    h.sandbox.navigator.onLine = true;
    assert.equal(await h.cloud.track('event-a', 'view'), false);
    assert.equal(requests, 1, 'A network interruption is absorbed by the tracking call');
    h.offline.markOffline({ eventId: 'event-a', source: 'guest' });
    assert.equal(await h.cloud.track('event-a', 'view'), false);
    assert.equal(requests, 1, 'A cached copy does not create offline analytics writes');
    assert.equal(h.data.size, 0);
});

test('optional analytics tolerate denied writes and unavailable browser storage', async () => {
    const h = harness();
    h.setFetch(async () => reply(null, 403));
    assert.equal(await h.cloud.track('event-a', 'view'), false);
    assert.equal(h.data.size, 0);
    h.setFetch(async () => reply(null, 204));
    h.localStorage.setItem = () => { throw new Error('quota exceeded'); };
    assert.equal(await h.cloud.track('event-a', 'view'), false);
    h.localStorage.setItem = (key, value) => h.data.set(key, String(value));
    h.data.set('wedding_event_event-a_analytics', '{invalid JSON');
    assert.equal(await h.cloud.track('event-a', 'view'), false);
    h.data.delete('wedding_event_event-a_analytics');
    assert.equal(await h.cloud.track('event-a', 'view', { guestToken: 'token-a' }), true);
    assert.equal(JSON.parse(h.data.get('wedding_event_event-a_analytics'))[0].guest_token, 'token-a');
});

test('personal offline copies isolate exact event and token and retain only invitation fields', () => {
    const h = harness();
    assert.equal(h.offline.saveGuest('event-a', 'token-a', guest('event-a', 'token-a', {
        phone: 'private phone', email: 'private email', group: 'private group', accessToken: 'secret',
        otherGuests: [{ fullName: 'Another person' }]
    })), true);
    h.offline.saveGuest('event-a', 'token-b', guest('event-a', 'token-b', { fullName: 'Paul' }));
    h.offline.saveGuest('event-b', 'token-a', guest('event-b', 'token-a', { fullName: 'Alice' }));
    h.offline.saveGuest('event:a', 'token:b', guest('event:a', 'token:b', { fullName: 'Escaped identity' }));
    assert.equal(h.offline.readGuest('event-a', 'token-a').fullName, 'Marie Dupont');
    assert.equal(h.offline.readGuest('event-a', 'token-b').fullName, 'Paul');
    assert.equal(h.offline.readGuest('event-b', 'token-a').fullName, 'Alice');
    assert.equal(h.offline.readGuest('event:a', 'token:b').fullName, 'Escaped identity');
    assert.equal(h.offline.readGuest('event-a', 'unknown'), null);
    assert.equal(h.offline.readGuest('EVENT-A', 'token-a'), null);
    const saved = h.offline.readGuest('event-a', 'token-a');
    for (const key of ['phone', 'email', 'group', 'accessToken', 'otherGuests']) assert.equal(saved[key], undefined);
    saved.tableNumber = 'Not persisted';
    assert.equal(h.offline.readGuest('event-a', 'token-a').tableNumber, 'Rose');
    assert.equal(h.events.length, 0, 'Reading eligibility does not announce an offline display');
});

test('unverified, pending, declined and mismatched profiles cannot create an offline copy', () => {
    const h = harness();
    for (const invalid of [null, {}, guest('other-event'), guest('event-a', 'other-token'),
        guest('event-a', 'token-a', { id: '' }), guest('event-a', 'token-a', { status: 'pending' }),
        guest('event-a', 'token-a', { status: 'no' })]) {
        assert.equal(h.offline.saveGuest('event-a', 'token-a', invalid), false);
    }
    assert.equal(h.data.size, 0);
    h.data.set('wedding_event_event-a_guests', JSON.stringify([guest()]));
    h.data.set('wedding_event_event-a_confirm_token-a', JSON.stringify({ payload: { status: 'yes', name: 'Marie Dupont' } }));
    assert.equal(h.offline.readGuest('event-a', 'token-a'), null, 'Generic lists/confirmation payloads never become a verified snapshot');
});

test('revocation removes only the targeted personal copies and survives storage errors in the current document', () => {
    const h = harness();
    h.offline.saveGuest('event-a', 'token-a', guest());
    h.offline.saveGuest('event-a', 'token-b', guest('event-a', 'token-b'));
    h.offline.saveGuest('event-ab', 'token-a', guest('event-ab'));
    h.data.set('wedding_admin_session', 'admin-session');
    h.data.set('wedding_event_event-a_confirm_token-a', 'old-confirmation');
    h.offline.forgetGuest('event-a', 'token-a');
    assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
    assert(h.offline.readGuest('event-a', 'token-b'));
    assert.equal(h.data.has('wedding_event_event-a_confirm_token-a'), false);
    assert.deepEqual(plain(h.events.at(-1).detail), { eventId: 'event-a', token: 'token-a', scope: 'guest' });
    h.offline.forgetEvent('event-a');
    assert.equal(h.offline.readGuest('event-a', 'token-b'), null);
    assert(h.offline.readGuest('event-ab', 'token-a'));
    assert.equal(h.data.get('wedding_admin_session'), 'admin-session');
    h.localStorage.removeItem = () => { throw new Error('storage blocked'); };
    h.offline.forgetGuest('event-ab', 'token-a');
    assert.equal(h.offline.readGuest('event-ab', 'token-a'), null);
});

test('quota failures do not report a prepared copy or keep an obsolete table assignment', () => {
    const h = harness();
    h.offline.saveGuest('event-a', 'token-a', guest());
    h.localStorage.setItem = () => { throw new Error('quota'); };
    assert.equal(h.offline.saveGuest('event-a', 'token-a', guest('event-a', 'token-a', { tableNumber: 'New table' })), false);
    assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
});

test('cloud lookup always tries the server first, refreshes the table and falls back only during outages', async () => {
    const h = harness();
    h.offline.saveGuest('event-a', 'token-a', guest());
    let calls = 0;
    h.setFetch(async () => { calls++; return reply([cloudGuest({ table_number: 'Jasmin', table_id: 'table-2' })]); });
    assert.equal((await h.cloud.getGuestByInviteToken('token-a')).tableNumber, 'Jasmin');
    assert.equal(calls, 1);
    assert.equal(h.offline.readGuest('event-a', 'token-a').tableNumber, 'Jasmin');
    h.setFetch(async () => { throw new TypeError('Network failed'); });
    assert.equal((await h.cloud.getGuestByInviteToken('token-a')).tableNumber, 'Jasmin');
    assert.equal(h.offline.isOffline(), true);
    assert.equal(h.events.at(-1).type, 'offlineinvitation:used');
    h.setFetch(async () => reply({ message: 'Temporarily unavailable' }, 503));
    assert.equal((await h.cloud.getGuestByInviteToken('token-a')).tableId, 'table-2');
    h.setFetch(async () => ({ ok: true, status: 200, text: async () => { throw new Error('Connection lost during body'); } }));
    assert.equal((await h.cloud.getGuestByInviteToken('token-a')).tableNumber, 'Jasmin');
});

test('authoritative empty, wrong-token and wrong-event cloud responses erase a personal copy', async () => {
    for (const returned of [[], [cloudGuest({ token: 'other-token' })], [cloudGuest({ event_id: 'event-b' })]]) {
        const h = harness({ fetch: async () => reply(returned) });
        h.offline.saveGuest('event-a', 'token-a', guest());
        assert.equal(await h.cloud.getGuestByInviteToken('token-a'), null);
        assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
        assert.equal(h.events.at(-1).type, 'invitation:revoked');
        h.setFetch(async () => { throw new TypeError('Offline'); });
        await assert.rejects(h.cloud.getGuestByInviteToken('token-a'), { code: 'NETWORK_ERROR' });
    }
});

test('4xx and malformed responses never fall back to a confirmed copy', async () => {
    for (const status of [400, 401, 403, 404, 429]) {
        const h = harness({ fetch: async () => reply({ message: 'Denied' }, status) });
        h.offline.saveGuest('event-a', 'token-a', guest());
        await assert.rejects(h.cloud.getGuestByInviteToken('token-a'), { status });
        assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
    }
    const h = harness({ fetch: async () => ({ ok: true, status: 200, text: async () => 'not JSON' }) });
    h.offline.saveGuest('event-a', 'token-a', guest());
    await assert.rejects(h.cloud.getGuestByInviteToken('token-a'), { code: 'INVALID_RESPONSE' });
    assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
});

test('pending/no cloud profiles remain valid online but cannot retain a confirmed offline invitation', async () => {
    for (const status of ['pending', 'no']) {
        const h = harness({ fetch: async () => reply([cloudGuest({ status })]) });
        h.offline.saveGuest('event-a', 'token-a', guest());
        assert.equal((await h.cloud.getGuestByInviteToken('token-a')).status, status);
        assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
        assert.equal(h.events.some(e => e.type === 'invitation:revoked'), false, 'A valid pending invitation is not a revoked link');
    }
});

test('a successful RSVP stores only its server-validated profile and never substitutes an offline success', async () => {
    const h = harness();
    const confirmed = await h.cloud.submitGuestRsvp('event-a', 'token-a', { status: 'yes' });
    assert.equal(confirmed.status, 'yes');
    assert(h.offline.readGuest('event-a', 'token-a'));
    h.setFetch(async () => reply([cloudGuest({ status: 'no' })]));
    assert.equal((await h.cloud.submitGuestRsvp('event-a', 'token-a', { status: 'no' })).status, 'no');
    assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
    h.offline.saveGuest('event-a', 'token-a', guest());
    h.setFetch(async () => { throw new Error('Network failed'); });
    await assert.rejects(h.cloud.submitGuestRsvp('event-a', 'token-a', { status: 'yes' }), { code: 'NETWORK_ERROR' });
    h.setFetch(async () => reply([cloudGuest({ event_id: 'event-b' })]));
    assert.equal(await h.cloud.submitGuestRsvp('event-a', 'token-a', { status: 'yes' }), null);
    assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
});

test('event depublication purges public config and all personal snapshots before any later outage', async () => {
    for (const response of [() => Promise.resolve(null), () => Promise.reject(Object.assign(new Error('Denied'), { status: 403 })),
        () => Promise.reject(Object.assign(new Error('Missing'), { status: 404 }))]) {
        const h = harness();
        const key = 'wedding_event_event-a_public_config';
        h.data.set(key, JSON.stringify({ id: 'event-a', title: 'Old public config' }));
        h.offline.saveGuest('event-a', 'token-a', guest());
        h.offline.saveGuest('event-b', 'token-a', guest('event-b'));
        let load = response;
        const eventConfig = h.loadEventConfig({ isEnabled: () => true, getPublicEventConfig: () => load() });
        await assert.rejects(eventConfig.loadEvent('event-a'), /introuvable/);
        assert.equal(h.data.has(key), false);
        assert.equal(h.offline.readGuest('event-a', 'token-a'), null);
        assert(h.offline.readGuest('event-b', 'token-a'));
        load = () => Promise.reject(Object.assign(new Error('Offline'), { code: 'NETWORK_ERROR' }));
        await assert.rejects(eventConfig.loadEvent('event-a'), /introuvable/);
    }
});

test('public config fallback permits network/5xx only, emits an offline event, and retains built-in pages', async () => {
    const h = harness();
    h.data.set('wedding_event_event-a_public_config', JSON.stringify({ id: 'event-a', title: 'Available offline' }));
    let failure = Object.assign(new Error('Offline'), { code: 'NETWORK_ERROR' });
    const eventConfig = h.loadEventConfig({ isEnabled: () => true, getPublicEventConfig: async () => { throw failure; } });
    assert.equal((await eventConfig.loadEvent('event-a')).title, 'Available offline');
    assert.equal(h.events.at(-1).type, 'offlineinvitation:used');
    failure = Object.assign(new Error('Unavailable'), { status: 503 });
    assert.equal((await eventConfig.loadEvent('event-a')).title, 'Available offline');
    failure = Object.assign(new Error('Bad request'), { status: 422 });
    await assert.rejects(eventConfig.loadEvent('event-a'), /introuvable/);
    failure = Object.assign(new Error('Invalid response'), { code: 'INVALID_RESPONSE' });
    await assert.rejects(eventConfig.loadEvent('event-a'), /introuvable/);
    h.setFetch(async () => ({ ok: true, json: async () => ({ id: 'demo', title: 'Built-in demonstration' }) }));
    assert.equal((await eventConfig.loadEvent('demo')).title, 'Built-in demonstration');
});
