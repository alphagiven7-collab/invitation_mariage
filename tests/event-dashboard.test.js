const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const identity = require('../assets/js/organizer-identity.js');
const metrics = require('../assets/js/event-metrics.js');

test('equivalent Congolese phone spellings keep exactly the same login identity', () => {
    const examples = ['812345678', '0812345678', '812 345 678', '+243 812 345 678', '243812345678', '00243 (0) 812-345-678', '+243 (0)812.345.678', '０８１２３４５６７８', '٠٨١٢٣٤٥٦٧٨'];
    for (const value of examples) {
        assert.equal(identity.normalizePhone(value), '+243812345678', value);
        assert.equal(identity.emailFromPhone(value), '243812345678@organizer.michelline-invitations.vercel.app');
    }
    assert.equal(identity.normalizePhone('+33 6 12 34 56 78'), '+33612345678');
    for (const value of ['', '243', '812', '81234567890', 'abc812345678', '+243812345678+']) assert.equal(identity.normalizePhone(value), null, value);
});

test('money calculations retain cents and distinguish no record, unpaid, partial and paid', () => {
    assert.equal(metrics.parseAmount('1 200,10'), 120010);
    assert.equal(metrics.parseAmount('0.29'), 29);
    for (const input of ['-10', '', '1.111', '1e4', 'Infinity', '1,2.3']) assert.equal(metrics.parseAmount(input), null);
    assert.equal(metrics.paymentState(null).status, 'unset');
    assert.equal(metrics.paymentState({ totalCents: 100, receivedCents: 0 }).status, 'unpaid');
    assert.equal(metrics.paymentState({ totalCents: 100, receivedCents: 29 }).balance, 71);
    assert.equal(metrics.paymentState({ totalCents: 100, receivedCents: 29 }).status, 'partial');
    assert.equal(metrics.paymentState({ totalCents: 100, receivedCents: 101 }).balance, 0);
    assert.equal(metrics.paymentState({ totalCents: 100, receivedCents: 101 }).status, 'paid');
});

test('event countdown uses calendar dates in Kinshasa and ends the event the following day', () => {
    const now = new Date('2026-09-27T23:30:00Z'); // 28 September in Kinshasa
    assert.equal(metrics.timing('2026-09-28', now).status, 'today');
    assert.equal(metrics.timing('2026-09-27', now).status, 'completed');
    assert.equal(metrics.timing('2026-09-29', now).days, 1);
    assert.equal(metrics.timing('2026-02-30', now).status, 'undated');
    assert.equal(metrics.timing('', now).status, 'undated');
});

test('overview counts all guest pages per event and preserves authoritative IDs and creation dates', async () => {
    const calls = [];
    const window = {
        SUPABASE_CONFIG: { enabled: true, url: 'https://supabase.test', anonKey: 'public' },
        AuthGuard: { isPlatformAdmin: () => true, getSession: () => ({ accessToken: 'admin' }) }
    };
    const sandbox = { window, AuthGuard: window.AuthGuard, console, fetch: async (url) => {
        calls.push(url);
        let data;
        if (url.includes('/events?')) data = [{ id: 'a', slug: 'a', title: 'A', created_at: '2026-01-01', config_json: { id: 'wrong', createdAt: '2020-01-01' } }, { id: 'b', slug: 'b', title: 'B' }];
        else if (url.includes('/event_settings?')) data = [{ event_id: 'a', dashboard_json: { eventDate: '2026-10-01', id: 'wrong-again', createdAt: '2000-01-01' } }];
        else if (url.includes('offset=0')) data = Array.from({ length: 500 }, () => ({ event_id: 'a', status: 'yes', adults: 2, children: 1 }));
        else data = [{ event_id: 'a', status: 'no' }, { event_id: 'b', status: 'pending' }];
        return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    } };
    vm.runInNewContext(fs.readFileSync('assets/js/cloud-api.js', 'utf8'), sandbox);
    const events = await window.CloudAPI.getEventsOverview();
    assert.equal(events[0].id, 'a');
    assert.equal(events[0].createdAt, '2026-01-01');
    assert.equal(events[0].eventDate, '2026-10-01');
    assert.equal(events[0].stats.guests, 501);
    assert.equal(events[0].stats.confirmed, 500);
    assert.equal(events[0].stats.attendees, 1500);
    assert.equal(events[1].stats.pending, 1);
    assert.ok(calls.some((url) => url.includes('offset=500')));
});
