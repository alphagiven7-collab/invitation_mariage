const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function response(data, status = 200) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(data)
  };
}

function cloudSetup(fetch) {
  const config = { enabled: true, url: 'https://example.test', anonKey: 'anon-key' };
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    fetch,
    crypto: { randomUUID: () => 'message-id' },
    SUPABASE_CONFIG: config,
    window: { SUPABASE_CONFIG: config },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'cloud-api.js'), 'utf8'),
    sandbox,
    { filename: 'cloud-api.js' }
  );
  return sandbox.window.CloudAPI;
}

function element() {
  return {
    value: '', content: '', src: '', textContent: '', innerHTML: '', checked: false,
    dataset: {}, style: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
    cloneNode() { return element(); }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    focus() {}
  };
}

function invitationApp(postGuestbookMessage) {
  const nodes = new Map();
  const getNode = (id) => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const store = {};
  const eventConfig = {
    init: async () => {}, isReady: () => true, getEventId: () => 'event-test',
    getConfig: () => ({}), applyToPage() {}, storageKey: (key) => `wedding_event_event-test_${key}`
  };
  const cloud = {
    isEnabled: () => true,
    getPublicGuestbookMessages: async () => [],
    postGuestbookMessage,
    track: async () => {}
  };
  const document = {
    body: element(), documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } }, title: 'Invitation',
    getElementById: getNode, createElement: element, querySelector: () => element(), querySelectorAll: () => [],
    addEventListener() {}
  };
  const window = {
    location: { search: '?t=invite-token', href: 'https://example.test/pages/invitation.html?t=invite-token', origin: 'https://example.test', pathname: '/pages/invitation.html' },
    EventConfig: eventConfig, CloudAPI: cloud, addEventListener() {}, open() {}
  };
  const sandbox = {
    console: { warn() {}, log() {}, error() {} }, document, window, EventConfig: eventConfig, CloudAPI: cloud,
    URLSearchParams, URL, navigator: {}, getComputedStyle: () => ({ getPropertyValue: () => '' }), localStorage: {
      getItem(key) { return store[key] || null; }, setItem(key, value) { store[key] = String(value); }, removeItem(key) { delete store[key]; }
    }, setTimeout: (callback) => { callback(); return 0; }, clearTimeout() {}, setInterval, clearInterval,
    requestAnimationFrame: (callback) => callback(),
    globalThis: null, global: null
  };
  window.window = window;
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app.js'), 'utf8'),
    sandbox,
    { filename: 'app.js' }
  );
  return { getNode, store, window };
}

test('Public message RPCs preserve every row returned by Supabase', async () => {
  const calls = [];
  const cloud = cloudSetup(async (url, options) => {
    calls.push({ url, options });
    if (url.includes('get_public_guestbook_messages')) {
      return response([
        { author_name: 'Marie', message: 'Félicitations', created_at: '2026-09-18T10:00:00Z' },
        { author_name: 'Paul', message: 'Tous nos vœux', created_at: '2026-09-18T09:00:00Z' }
      ]);
    }
    return response([
      { author_name: 'Aline', message: 'Hâte de vous voir', created_at: '2026-09-18T08:00:00Z' },
      { author_name: 'David', message: 'Belle célébration', created_at: '2026-09-18T07:00:00Z' }
    ]);
  });

  const guestbook = await cloud.getPublicGuestbookMessages('event-test');
  const rsvp = await cloud.getPublicRsvpMessages('event-test');

  assert.equal(guestbook.length, 2);
  assert.equal(guestbook[1].author_name, 'Paul');
  assert.equal(rsvp.length, 2);
  assert.equal(rsvp[1].author_name, 'David');
  assert.ok(calls.every(({ options }) => options.method === 'POST'));
});

test('Public message errors stay explicit and a guestbook publication needs server confirmation', async () => {
  const unavailable = cloudSetup(async () => response({ message: 'Fonction get_public_rsvp_messages absente' }, 404));
  await assert.rejects(
    unavailable.getPublicRsvpMessages('event-test'),
    /Fonction get_public_rsvp_messages absente/
  );

  const rejected = cloudSetup(async () => response({ message: 'Invitation introuvable' }, 400));
  await assert.rejects(
    rejected.postGuestbookMessage('event-test', 'bad-token', 'Bonjour'),
    /Invitation introuvable/
  );

  const unconfirmed = cloudSetup(async () => response([]));
  await assert.rejects(
    unconfirmed.postGuestbookMessage('event-test', 'token', 'Bonjour'),
    /n'a pas confirmé/
  );

  const offline = cloudSetup(async () => { throw new Error('network down'); });
  await assert.rejects(
    offline.getPublicGuestbookMessages('event-test'),
    /Impossible de joindre le service/
  );
});

test('Open RSVP sends its confirmation message to the hardened RPC contract', async () => {
  const calls = [];
  const cloud = cloudSetup(async (url, options) => {
    calls.push({ url, options });
    return response({ id: 'rsvp-open' });
  });

  await cloud.submitOpenRsvp('event-test', {
    fullName: 'Aline Mbala',
    status: 'yes',
    side: 'female',
    drinkChoices: ['Jus'],
    message: 'Heureuse de partager ce moment avec vous.'
  });

  const call = calls.find(({ url }) => url.includes('/rpc/submit_open_rsvp'));
  assert.ok(call);
  assert.deepEqual(JSON.parse(call.options.body), {
    p_event_id: 'event-test',
    p_full_name: 'Aline Mbala',
    p_status: 'yes',
    p_side: 'female',
    p_drink_choices: ['Jus'],
    p_message: 'Heureuse de partager ce moment avec vous.'
  });

  const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SUPABASE-PLATFORM-HARDENING.sql'), 'utf8');
  assert.match(sql, /p_drink_choices JSONB DEFAULT '\[\]'::jsonb,\s*p_message TEXT DEFAULT ''/);
  assert.match(sql, /rsvp_message = clean_message/);
  assert.match(sql, /saved_guest\.status, saved_guest\.adults, saved_guest\.children, saved_guest\.rsvp_message/);

  const guestExperience = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-experience.js'), 'utf8');
  assert.match(guestExperience, /rsvp-message-field"\)\?\.classList\.remove\("hidden"\)/);
  assert.match(guestExperience, /drinkChoices: payload\.drinkChoices,\s*message: payload\.message/);
});

test('Open RSVP cannot overwrite an existing guest from a name alone', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SUPABASE-PLATFORM-HARDENING.sql'), 'utf8');
  const openStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.submit_open_rsvp');
  const publicStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.submit_public_rsvp');
  const deleteStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.delete_managed_guest');
  const openRsvp = sql.slice(openStart, publicStart);
  const legacyPublicRsvp = sql.slice(publicStart, deleteStart);

  for (const source of [openRsvp, legacyPublicRsvp]) {
    assert.match(source, /pg_advisory_xact_lock\(hashtextextended\('guest-import:' \|\| target_event_id, 0\)\)/);
    assert.match(source, /IF matching_count > 0 THEN\s*RAISE EXCEPTION 'Un invite avec ce nom est deja enregistre/);
    assert.doesNotMatch(source, /UPDATE public\.guests/);
  }
});

test('Guestbook keeps its confirmed cloud snapshot when a new message is published', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app.js'), 'utf8');
  const loader = source.slice(source.indexOf('async function loadGuestbookMessages'), source.indexOf('async function publishGuestMessage'));
  const publisher = source.slice(source.indexOf('async function publishGuestMessage'), source.indexOf('function exportRsvpData'));

  assert.match(source, /function cacheGuestbookMessages\(messages\)/);
  assert.match(loader, /cacheGuestbookMessages\(messages\);/);
  assert.match(loader, /const cachedMessages = readLocalJson\(eventStorageKey\('guestbook_messages'\), \[\]\);/);
  assert.match(publisher, /messages\.unshift\(newItem\);\s*cacheGuestbookMessages\(messages\);/);
});

test('Personal RSVP validates optional phone input before it reaches the RPC', () => {
  const guestExperience = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-experience.js'), 'utf8');
  const submit = guestExperience.slice(guestExperience.indexOf('async function submitRsvp'), guestExperience.indexOf('function bindHandlers'));
  const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SUPABASE-PLATFORM-HARDENING.sql'), 'utf8');

  assert.match(guestExperience, /function normalizeOptionalPhone\(phone\)/);
  assert.match(submit, /const normalizedPhone = normalizeOptionalPhone\(payload\.phone\);/);
  assert.match(submit, /payload\.phone = normalizedPhone;/);
  assert.ok(sql.includes("raw_phone !~ '^[+0-9 ().-]+$'"));
  assert.match(sql, /Telephone invalide : laissez le champ vide ou saisissez au moins 9 chiffres/);
});

test('Historical RSVP messages remain visible without an attached guest record', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SUPABASE-PLATFORM-HARDENING.sql'), 'utf8');
  const messages = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_public_rsvp_messages'), sql.indexOf('CREATE OR REPLACE FUNCTION public.submit_guest_rsvp'));
  const replacement = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.replace_managed_guests'), sql.indexOf('-- Les politiques permissives historiques'));

  assert.match(messages, /COALESCE\(NULLIF\(g\.full_name, ''\), r\.full_name\)/);
  assert.match(messages, /LEFT JOIN public\.guests g/);
  assert.match(replacement, /r\.guest_id IS NULL[\s\S]{0,180}guest_name_identity\(r\.full_name\)/);
});

test('Guestbook does not announce or cache a cloud publication rejected by Supabase', async () => {
  const app = invitationApp(async () => { throw new Error('Invitation introuvable'); });
  app.getNode('guestbook-textarea').value = 'Tous mes vœux de bonheur';

  await app.window.publishGuestMessage({});

  assert.match(app.getNode('toast').textContent, /Invitation introuvable/);
  assert.equal(app.getNode('guestbook-textarea').value, 'Tous mes vœux de bonheur');
  assert.equal(app.store.wedding_event_event_test_guestbook_messages, undefined);
});

test('RSVP fallback accepts a blank optional phone number', async () => {
  const app = invitationApp(async () => ({ author_name: 'Marie', message: 'OK' }));
  app.getNode('rsvp-name').value = 'Marie Sans Téléphone';
  app.getNode('rsvp-phone').value = '';

  await app.window.submitRsvp({ preventDefault() {}, submitter: app.getNode('rsvp-submit-btn') });

  const saved = JSON.parse(app.store['wedding_event_event-test_rsvp_data']);
  assert.equal(saved.phone, '');
  assert.equal(saved.status, 'yes');
  assert.doesNotMatch(app.getNode('toast').textContent, /Téléphone invalide/);
});

test('a personal RSVP waits for the in-flight token lookup before rejecting access', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-experience.js'), 'utf8');
  assert.match(source, /let initPromise = null/);
  assert.match(source, /async function resolvePersonalInviteIfNeeded\(isOpenRsvp\)/);
  const openRsvp = source.slice(source.indexOf('async function openRsvp'), source.indexOf('function buildConfirmCode'));
  const submitRsvp = source.slice(source.indexOf('async function submitRsvp'), source.indexOf('function bindHandlers'));
  const resolver = source.slice(source.indexOf('async function resolvePersonalInviteIfNeeded'), source.indexOf('function prefillRsvp'));
  assert.match(resolver, /if \(profile\?\.id && hasPersonalInviteToken\(profile\)\) return profile;/);
  assert.match(openRsvp, /await resolvePersonalInviteIfNeeded\(isOpenRsvp\)/);
  assert.match(submitRsvp, /await resolvePersonalInviteIfNeeded\(isOpenRsvp\)/);
});
