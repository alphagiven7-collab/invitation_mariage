const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/event-billing.js');
const response = (data, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
function reply() {
    return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
}
async function withBackend(run, backend) {
    const prior = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY'].map((name) => [name, process.env[name]]));
    const fetch = global.fetch;
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_ANON_KEY = 'public';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_private';
    global.fetch = backend;
    try { await run(); } finally {
        global.fetch = fetch;
        for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    }
}
const request = (method, body) => ({ method, url: '/api/event-billing?event=mariage-a', headers: { authorization: 'Bearer user-token' }, body });

test('billing denies anonymous and organizer access before reading private storage', async () => {
    let calls = 0;
    await withBackend(async () => {
        const anon = reply();
        await handler({ method: 'GET', headers: {} }, anon);
        assert.equal(anon.statusCode, 401);
        assert.equal(calls, 0);
        const denied = reply();
        await handler(request('GET'), denied);
        assert.equal(denied.statusCode, 403);
        assert.equal(calls, 2);
    }, async (url, options) => {
        calls++;
        assert.equal(options.headers.apikey, 'public');
        if (url.endsWith('/auth/v1/user')) return response({ id: 'organizer' });
        if (url.endsWith('/rpc/is_platform_admin')) return response(false);
        throw new Error('No storage access allowed');
    });
});

test('platform payment persists in a private bucket and can be read back without public event writes', async () => {
    let bucket = false, stored;
    await withBackend(async () => {
        const saved = reply();
        await handler(request('PUT', { totalCents: 15050, receivedCents: 5050, currency: 'USD', note: 'Acompte' }), saved);
        assert.equal(saved.statusCode, 200);
        assert.equal(stored.totalCents, 15050);
        assert.equal(stored.updatedBy, 'admin');
        const loaded = reply();
        await handler(request('GET'), loaded);
        assert.equal(loaded.data.payments['mariage-a'].receivedCents, 5050);
        assert.equal(JSON.stringify(loaded.data).includes('sb_secret'), false);
        assert.equal(loaded.headers['Cache-Control'], 'no-store');
    }, async (url, options) => {
        if (url.endsWith('/auth/v1/user')) return response({ id: 'admin' });
        if (url.endsWith('/rpc/is_platform_admin')) return response(true);
        assert.equal(options.headers.apikey, 'sb_secret_private');
        assert.equal(options.headers.Authorization, undefined);
        if (url.includes('/rest/v1/events?')) { assert.equal(options.method, 'GET'); return response([{ id: 'mariage-a', created_at: '2026-09-01' }]); }
        if (url.endsWith('/storage/v1/bucket') && options.method === 'POST') {
            assert.equal(JSON.parse(options.body).public, false);
            bucket = true;
            return response({});
        }
        if (url.includes('/storage/v1/bucket/')) return bucket ? response({ public: false }) : response({ message: 'Bucket not found' }, 400);
        if (options.method === 'POST' && url.includes('/object/platform-event-billing/')) { stored = JSON.parse(options.body); return response({ Key: 'saved' }); }
        if (url.endsWith('/_platform/goal.json')) return response({ message: 'Object not found' }, 404);
        if (options.method === 'GET' && url.includes('/object/platform-event-billing/')) return response(stored);
        throw new Error(`Unexpected ${url}`);
    });
});

test('invalid or fractional-cent amounts are rejected before storage access', async () => {
    await withBackend(async () => {
        for (const totalCents of [-1, 1.1, '100', null]) {
            const result = reply();
            await handler(request('PUT', { totalCents, receivedCents: 0 }), result);
            assert.equal(result.statusCode, 400);
        }
    }, async (url) => {
        if (url.endsWith('/auth/v1/user')) return response({ id: 'admin' });
        if (url.endsWith('/rpc/is_platform_admin')) return response(true);
        throw new Error('Invalid amounts must not reach storage');
    });
});

test('public bucket and storage outages never become an empty payment list', async () => {
    for (const bucketResponse of [response({ public: true }), response({ message: 'Service unavailable' }, 500)]) {
        await withBackend(async () => {
            const result = reply();
            await handler(request('GET'), result);
            assert.ok(result.statusCode >= 500);
            assert.equal(result.data.payments, undefined);
        }, async (url) => {
            if (url.endsWith('/auth/v1/user')) return response({ id: 'admin' });
            if (url.endsWith('/rpc/is_platform_admin')) return response(true);
            return bucketResponse;
        });
    }
});


test('global goal is private, persists in cents, and does not replace event payments', async () => {
    let storedGoal = null;
    const goalRequest = (targetCents) => ({ ...request('PUT', { targetCents, currency: 'USD' }), url: '/api/event-billing?resource=goal' });
    await withBackend(async () => {
        for (const amount of [0, -10, 0.5, '100', null, 99999999901]) {
            const invalid = reply();
            await handler(goalRequest(amount), invalid);
            assert.equal(invalid.statusCode, 400);
        }
        for (const targetCents of [500050, 800000]) {
            const saved = reply();
            await handler(goalRequest(targetCents), saved);
            assert.equal(saved.statusCode, 200);
            assert.equal(saved.data.goal.targetCents, targetCents);
            assert.equal(storedGoal.updatedBy, 'admin');
        }
        const loaded = reply();
        await handler(request('GET'), loaded);
        assert.equal(loaded.statusCode, 200);
        assert.equal(loaded.data.goal.targetCents, 800000);
        assert.equal(loaded.data.payments['mariage-a'].receivedCents, 5000);
    }, async (url, options) => {
        if (url.endsWith('/auth/v1/user')) return response({ id: 'admin' });
        if (url.endsWith('/rpc/is_platform_admin')) return response(true);
        if (url.includes('/storage/v1/bucket/')) return response({ public: false });
        if (url.includes('/rest/v1/events?')) return response([{ id: 'mariage-a', created_at: '2026-09-01' }]);
        if (url.endsWith('/_platform/goal.json')) {
            assert.equal(options.headers.apikey, 'sb_secret_private');
            if (options.method === 'POST') storedGoal = JSON.parse(options.body);
            return response(storedGoal);
        }
        if (url.endsWith('/mariage-a/billing.json')) {
            assert.equal(options.method, 'GET');
            return response({ eventCreatedAt: '2026-09-01', currency: 'USD', totalCents: 10000, receivedCents: 5000 });
        }
        throw new Error('Unexpected backend operation');
    });
});

test('organizers cannot change the platform financial goal', async () => {
    await withBackend(async () => {
        const denied = reply();
        await handler({ ...request('PUT', { targetCents: 10000, currency: 'USD' }), url: '/api/event-billing?resource=goal' }, denied);
        assert.equal(denied.statusCode, 403);
    }, async (url) => {
        if (url.endsWith('/auth/v1/user')) return response({ id: 'organizer' });
        if (url.endsWith('/rpc/is_platform_admin')) return response(false);
        throw new Error('Must not access private storage');
    });
});
