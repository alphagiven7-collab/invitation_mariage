const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://invitation.test';
const personal = `${origin}/pages/invitation.html?event=maries&t=token-a`;

function worker(fetch = async () => { throw new TypeError('offline'); }) {
    const handlers = {};
    const stores = new Map();
    const cache = (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const values = stores.get(name);
        const key = (request) => typeof request === 'string' ? request : request.url;
        return {
            put: async (request, response) => values.set(key(request), response.clone()),
            match: async (request) => values.get(key(request))?.clone(),
            delete: async (request) => values.delete(key(request)),
            keys: async () => [...values.keys()].map(url => ({ url }))
        };
    };
    const caches = {
        open: async (name) => cache(name), keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        match: async (request) => {
            for (const name of stores.keys()) { const result = await cache(name).match(request); if (result) return result; }
        }
    };
    const self = { location: { origin }, clients: { claim: async () => {} }, skipWaiting() {}, addEventListener: (name, fn) => { handlers[name] = fn; } };
    vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), { self, caches, fetch, URL, Response, Promise, Set });
    return {
        caches, handlers,
        async get(url, opts = {}) {
            let answer;
            const tasks = [];
            handlers.fetch({ request: { method: 'GET', url, headers: { has: () => false }, ...opts }, respondWith: p => { answer = p; }, waitUntil: p => tasks.push(p) });
            const response = await answer;
            await Promise.all(tasks);
            return response;
        },
        async message(source, data) {
            let result;
            let task;
            handlers.message({ source: { url: source }, data, ports: [{ postMessage: value => { result = value; } }], waitUntil: p => { task = p; } });
            await task;
            return result;
        }
    };
}

test('offline navigation keeps event and personal token isolated', async () => {
    const sw = worker();
    await (await sw.caches.open('wedding-saved-invitations-v1')).put(personal, new Response('personal-shell'));
    assert.equal(await (await sw.get(`${personal}&utm_source=whatsapp`)).text(), 'personal-shell');
    for (const url of [personal.replace('token-a', 'token-b'), personal.replace('maries', 'other'), `${origin}/pages/invitation.html?event=maries`]) {
        assert.equal((await sw.get(url)).status, 503);
    }
});

test('server denials never fall back to a saved invitation', async () => {
    const sw = worker(async () => new Response('revoked', { status: 403 }));
    await (await sw.caches.open('wedding-saved-invitations-v1')).put(personal, new Response('old-shell'));
    assert.equal((await sw.get(personal)).status, 403);
});

test('current cache wins over an older prepared page and assets regardless of cache creation order', async () => {
    const sw = worker();
    const saved = await sw.caches.open('wedding-saved-invitations-v1');
    const current = await sw.caches.open('invitation-v63');
    const asset = `${origin}/assets/css/style.css`;
    const oldVersion = `${origin}/assets/js/app.js?v=80`;
    await saved.put(asset, new Response('old-style'));
    await saved.put(oldVersion, new Response('saved-versioned-script'));
    await saved.put(personal, new Response('old-page'));
    await saved.put(`${personal}&utm_source=whatsapp`, new Response('old-page-with-query'));
    await current.put(asset, new Response('new-style'));
    await current.put(personal, new Response('new-page'));
    assert.equal(await (await sw.get(asset)).text(), 'new-style');
    assert.equal(await (await sw.get(personal)).text(), 'new-page');
    assert.equal(await (await sw.get(`${personal}&utm_source=whatsapp`)).text(), 'new-page');
    assert.equal(await (await sw.get(oldVersion)).text(), 'saved-versioned-script');
});

test('personal invitation preparation requires every critical asset', async () => {
    const requests = [];
    const sw = worker(async (url) => { requests.push(url); return new Response('asset'); });
    const result = await sw.message(personal, { type: 'PREPARE_INVITATION', pageUrl: personal, required: [`${origin}/assets/js/app.js?v=81`], optional: ['https://bad.test/private-data'] });
    assert.equal(result.ok, true);
    assert.deepEqual(requests, [personal, `${origin}/assets/js/app.js?v=81`]);
    const failed = worker(async (url) => new Response('x', { status: url.includes('app.js') ? 404 : 200 }));
    const previous = await failed.caches.open('wedding-saved-invitations-v1');
    await previous.put(personal, new Response('previous-complete-shell'));
    assert.equal((await failed.message(personal, { type: 'PREPARE_INVITATION', pageUrl: personal, required: [`${origin}/assets/js/app.js?v=81`] })).ok, false);
    assert.equal(await (await previous.match(personal)).text(), 'previous-complete-shell');
});

test('worker cannot prepare another invitation or API payload through messages', async () => {
    const requests = [];
    const sw = worker(async (url) => { requests.push(url); return new Response('data'); });
    assert.equal(await sw.message(personal, { type: 'PREPARE_INVITATION', pageUrl: personal.replace('token-a', 'token-b') }), undefined);
    const result = await sw.message(personal, { type: 'PREPARE_INVITATION', pageUrl: personal, required: [`${origin}/api/organizer?event=maries`] });
    assert.equal(result.ok, false);
    assert.deepEqual(requests, [personal]);
});

test('organizer preparation saves only its shell and static assets for the offline access gate', async () => {
    const sw = worker(async () => new Response('static-shell'));
    const admin = `${origin}/pages/admin.html?event=maries`;
    const result = await sw.message(admin, { type: 'PREPARE_ORGANIZER', pageUrl: admin, required: [`${origin}/assets/js/auth.js?v=62`] });
    assert.equal(result.ok, true);
    const cache = await sw.caches.open('wedding-saved-invitations-v1');
    assert.ok(await cache.match(admin));
    assert.equal(await sw.message(personal, { type: 'PREPARE_ORGANIZER', pageUrl: admin }), undefined);
    assert.equal(await sw.message(admin, { type: 'PREPARE_ORGANIZER', pageUrl: admin.replace('maries', 'other') }), undefined);
});

test('known revocation removes only the appropriate saved pages', async () => {
    const sw = worker();
    const cache = await sw.caches.open('wedding-saved-invitations-v1');
    const otherToken = personal.replace('token-a', 'token-b');
    const otherEvent = personal.replace('maries', 'other');
    for (const url of [personal, otherToken, otherEvent]) await cache.put(url, new Response('shell'));
    await sw.message(personal, { type: 'FORGET_INVITATION', scope: 'guest' });
    assert.equal(await cache.match(personal), undefined);
    assert.ok(await cache.match(otherToken));
    await sw.message(personal, { type: 'FORGET_INVITATION', scope: 'event' });
    assert.equal(await cache.match(otherToken), undefined);
    assert.ok(await cache.match(otherEvent));
});

test('worker never intercepts auth, RPC, API, writes, signed media or audio range', async () => {
    const sw = worker();
    for (const [url, options] of [
        [`${origin}/api/pwa-manifest?mode=invitation`, {}],
        ['https://project.supabase.co/auth/v1/token', {}],
        ['https://project.supabase.co/rest/v1/rpc/get_guest_invite', {}],
        ['https://project.supabase.co/storage/v1/object/sign/event-assets/photo.png?token=x', {}],
        [`${origin}/assets/x.mp3`, {}],
        [`${origin}/assets/x.jpg`, { method: 'POST' }],
        [`${origin}/assets/video`, { headers: { has: () => true } }]
    ]) assert.equal(await sw.get(url, options), undefined, url);
});

test('worker upgrade retains the complete offline shell while removing stale general caches', async () => {
    const sw = worker();
    await sw.caches.open('invitation-v62');
    await sw.caches.open('invitation-v63');
    await sw.caches.open('wedding-saved-invitations-v1');
    let done;
    sw.handlers.activate({ waitUntil: promise => { done = promise; } });
    await done;
    assert.deepEqual(await sw.caches.keys(), ['invitation-v63', 'wedding-saved-invitations-v1']);
});
