const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const guest = {
    id: 'guest-a', eventId: 'event-a', token: 'token-a', fullName: 'Marie Dupont',
    status: 'yes', qrApproved: true, tableNumber: 'Rose', adults: 1, children: 0,
    profilePhotoUrl: 'https://images.example.test/profile.jpg'
};
const payload = { name: guest.fullName, status: 'yes', adults: 1, children: 0 };

function harness(options = {}) {
    const fields = new Map();
    const listeners = new Map();
    const documentListeners = new Map();
    const timers = [];
    const qrCallbacks = [];
    const data = new Map();
    const calls = { lookups: 0, opened: 0, exports: 0, offers: 0 };
    function field(id) {
        if (id === 'gate-personal-container') return null;
        if (fields.has(id)) return fields.get(id);
        const classes = new Set(['hidden']);
        const attributes = new Map();
        const node = {
            id, value: '', textContent: '', src: '', style: {}, dataset: {}, hidden: false,
            classList: {
                add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                contains: name => classes.has(name),
                toggle(name, force) {
                    if (force ?? !classes.has(name)) classes.add(name);
                    else classes.delete(name);
                }
            },
            setAttribute: (name, value) => attributes.set(name, value),
            getAttribute: name => attributes.get(name) ?? null,
            removeAttribute(name) { attributes.delete(name); if (name === 'src') this.src = ''; },
            addEventListener() {}, replaceChildren() {}, append() {}, appendChild() {},
            querySelectorAll: () => [], querySelector: () => null, closest: () => null
        };
        fields.set(id, node);
        return node;
    }
    const document = {
        readyState: 'loading', title: 'Invitation', body: { style: {} },
        getElementById: field, querySelectorAll: () => [], querySelector: () => null,
        addEventListener: (name, fn) => documentListeners.set(name, fn),
        createElement: name => field(`created-${name}-${fields.size}`)
    };
    const EventConfig = {
        init: options.init || (async () => {}), isReady: () => true,
        getEventId: () => 'event-a', getConfig: () => ({ title: 'Marriage', type: 'wedding', rsvpMode: 'private' }),
        applyToPage() {}
    };
    const GuestManager = {
        async findByToken() { calls.lookups++; return options.lookup ? options.lookup() : { ...guest }; }
    };
    const QRCode = { toDataURL: (data, settings, callback) => qrCallbacks.push(callback) };
    const AccessPassExport = { buildData: data => data, download: async () => { calls.exports++; } };
    const setTimeout = (fn, ms) => { const timer = { fn, ms, cancelled: false }; timers.push(timer); return timer; };
    const clearTimeout = timer => { timer.cancelled = true; };
    const window = {
        document, EventConfig, GuestManager, QRCode, AccessPassExport, setTimeout, clearTimeout,
        location: { search: options.search ?? '?event=event-a&t=token-a' },
        addEventListener: (name, fn) => listeners.set(name, fn),
        dispatchEvent: event => listeners.get(event.type)?.(event),
        openModal(id) { calls.opened++; field(id).classList.remove('hidden'); },
        closeModal(id) { field(id).classList.add('hidden'); },
        showToast() {}, openMainSite: async () => {},
        PwaRuntime: { offerInvitation: () => { calls.offers++; } }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/guest-experience.js'), 'utf8'), {
        window, document, EventConfig, GuestManager, QRCode, AccessPassExport,
        URLSearchParams, navigator: { onLine: true }, setTimeout, clearTimeout,
        console: { warn() {} },
        CustomEvent: class { constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; } },
        localStorage: {
            getItem: key => data.get(key) ?? null,
            setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)
        }
    });
    return {
        api: window.GuestExperience, window, field, calls, timers, qrCallbacks, data,
        boot: () => documentListeners.get('DOMContentLoaded')(),
        revoke: detail => window.dispatchEvent({ type: 'invitation:revoked', detail })
    };
}

test('revocation is scoped to the current event and an exact nonempty personal token', () => {
    const h = harness();
    h.api.applyProfile({ ...guest });
    for (const detail of [
        { eventId: 'event-b', scope: 'event' },
        { eventId: 'event-a', scope: 'guest', token: 'token-b' },
        { eventId: 'event-a', scope: 'guest' },
        { eventId: 'event-a', token: 'token-a' }
    ]) assert.equal(h.api.revokeInvitation(detail), false);
    assert.equal(h.api.getProfile().id, guest.id);
    assert.equal(h.api.canShowQrCode(guest, payload), true);
    assert.equal(h.api.revokeInvitation({ eventId: 'event-a', scope: 'event' }), true);
    assert.equal(h.api.getProfile(), null);
    const publicPage = harness({ search: '?event=event-a' });
    assert.equal(publicPage.api.revokeInvitation({ eventId: 'event-a', scope: 'guest', token: '' }), false);
    assert.equal(publicPage.api.revokeInvitation({ eventId: 'event-a', scope: 'event' }), true);
});

test('revoked invitations cannot reopen a delayed confirmation or repopulate their profile', async () => {
    const h = harness();
    h.boot();
    assert.equal(await h.api.init(), true);
    const restore = h.timers.find(timer => timer.ms === 800);
    assert.ok(restore, 'A confirmed guest has a delayed card to restore');
    h.revoke({ eventId: 'event-a', scope: 'guest', token: 'token-a' });
    assert.equal(restore.cancelled, true);
    restore.fn(); // Even an already queued callback cannot reopen a revoked card.
    h.api.showConfirmation(payload, 'code', guest);
    h.api.applyProfile(guest);
    await h.api.openRsvp();
    await h.api.submitRsvp({ preventDefault() {} });
    assert.equal(await h.api.init(), false);
    assert.equal(h.calls.opened, 0);
    assert.equal(h.api.getProfile(), null);
    assert.equal(h.api.canShowQrCode(guest, payload), false);
    assert.equal(h.window.currentGuestProfile, null);
    assert.equal(h.field('invite-table-assignment').hidden, true);
    assert.equal(h.field('rsvp-name').value, '');
    assert.equal(h.data.has('wedding_event_event-a_guest_name'), false);
});

test('revocation hides an existing QR and blocks late QR callbacks and exports', async () => {
    const h = harness();
    h.boot();
    await h.api.init();
    h.api.showConfirmation(payload, 'code', { ...guest });
    h.qrCallbacks.at(-1)(null, 'data:image/png;base64,verified-card');
    await h.window.downloadConfirmationPass();
    assert.equal(h.calls.exports, 1, 'The verified card was exportable before revocation');
    h.api.showConfirmation(payload, 'code', { ...guest });
    const delayedQr = h.qrCallbacks.at(-1);
    h.revoke({ eventId: 'event-a', scope: 'event' });
    assert.equal(h.field('rsvp-confirmation-modal').classList.contains('hidden'), true);
    assert.equal(h.field('rsvp-qr-image').src, '');
    delayedQr(null, 'data:image/png;base64,stale-card');
    await h.window.downloadConfirmationPass();
    assert.equal(h.field('rsvp-qr-image').src, '');
    assert.equal(h.calls.exports, 1);
});

test('failed public configuration stops guest lookup and card restoration', async () => {
    const h = harness({ init: async () => { throw new Error('event unavailable'); } });
    assert.equal(await h.api.init(), false);
    assert.equal(h.calls.lookups, 0);
    assert.equal(h.api.getProfile(), null);
    assert.equal(h.timers.filter(timer => timer.ms === 800).length, 0);
    assert.equal(h.calls.offers, 0);
});

test('a guest response arriving after revocation cannot restore the removed profile', async () => {
    let resolveGuest;
    let signalLookup;
    const lookupStarted = new Promise(resolve => { signalLookup = resolve; });
    const h = harness({ lookup: () => new Promise(resolve => { resolveGuest = resolve; signalLookup(); }) });
    const pending = h.api.init();
    await lookupStarted;
    assert.equal(h.calls.lookups, 1);
    h.revoke({ eventId: 'event-a', scope: 'event' });
    resolveGuest({ ...guest });
    assert.equal(await pending, false);
    assert.equal(h.api.getProfile(), null);
    assert.equal(h.calls.offers, 0);
    assert.equal(h.timers.filter(timer => timer.ms === 800).length, 0);
});
