const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('EventConfig.createEvent prepares an unpublished event without persisting it locally', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'event-config.js'), 'utf8');

  const store = {};
  const sandbox = {
    console,
    URLSearchParams,
    CustomEvent: class {},
    window: {
      location: { search: '?event=nouveau-test' },
      dispatchEvent() {}
    },
    localStorage: {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; }
    }
  };

  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(source, sandbox, { filename: 'event-config.js' });

  const EventConfig = sandbox.window.EventConfig;
  const ev = EventConfig.createEvent({
    title: "Mariage de Sarah & Marc",
    type: "wedding",
    coupleLeft: "Sarah",
    coupleRight: "Marc",
    ownerEmail: "sarah@example.test",
    welcomeImage: "https://cdn.example.test/sarah-marc-accueil.jpg"
  });

  assert.equal(ev.slug, 'mariage-de-sarah-marc');
  assert.equal(ev.title, 'Mariage de Sarah & Marc');
  assert.equal(ev.branding.welcomeImage, 'https://cdn.example.test/sarah-marc-accueil.jpg');
  assert.equal(ev.ownerEmail, 'sarah@example.test');
  assert.equal(store['wedding_custom_events'], undefined);
  assert.equal(store['wedding_event_mariage-de-sarah-marc_config'], undefined);
  assert.ok(!EventConfig.getRegisteredEvents().some(e => e.slug === 'mariage-de-sarah-marc'));

  assert.throws(
    () => EventConfig.createEvent({ title: 'Copie démo', slug: 'demo' }),
    /réservé à une démo existante/
  );
});

test('EventConfig.createEvent keeps open RSVP contacts separate from personal events', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'event-config.js'), 'utf8');
  const sandbox = {
    console,
    URLSearchParams,
    window: { location: { search: '?event=ouvert-test' } },
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'event-config.js' });

  const event = sandbox.window.EventConfig.createEvent({
    title: 'Soiree ouverte',
    type: 'open-rsvp',
    rsvpMode: 'open',
    confirmationContacts: { male: '+243810000001', female: '+243810000002' }
  });

  assert.equal(event.type, 'open-rsvp');
  assert.equal(event.rsvpMode, 'open');
  assert.equal(event.confirmationContacts.male, '+243810000001');
  assert.equal(event.confirmationContacts.female, '+243810000002');
});

test('EventConfig discards dedicated staff check-in data with a custom event', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'event-config.js'), 'utf8');
  const store = {
    wedding_custom_events: JSON.stringify([{ slug: 'event-test', title: 'Événement test' }]),
    'wedding_event_event-test_checkin_roster': JSON.stringify([{ token: 'abc' }]),
    'wedding_event_event-test_check_ins': JSON.stringify([{ guest_token: 'abc' }]),
    'wedding_event_event-test_check_ins_pending': JSON.stringify([{ guest_token: 'def' }])
  };
  const sandbox = {
    console,
    URLSearchParams,
    window: { location: { search: '?event=event-test' } },
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); },
      removeItem(key) { delete store[key]; }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'event-config.js' });

  assert.equal(sandbox.window.EventConfig.discardLocalEvent('event-test'), true);
  assert.equal(store['wedding_event_event-test_checkin_roster'], undefined);
  assert.equal(store['wedding_event_event-test_check_ins'], undefined);
  assert.equal(store['wedding_event_event-test_check_ins_pending'], undefined);
});

test('EventConfig ignores stale local configuration for the built-in demo', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'event-config.js'), 'utf8');
  const store = {
    'wedding_event_demo_config': JSON.stringify({ title: 'Ancienne copie locale' })
  };
  const sandbox = {
    console,
    URLSearchParams,
    CustomEvent: class {},
    fetch: async () => ({ ok: true, json: async () => ({ id: 'demo', title: 'JSON officiel' }) }),
    window: { location: { search: '?event=demo' }, dispatchEvent() {} },
    localStorage: {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = String(v); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'event-config.js' });

  await sandbox.window.EventConfig.init();
  assert.equal(sandbox.window.EventConfig.getConfig().title, 'JSON officiel');
  assert.equal(
    sandbox.window.EventConfig.getRegisteredEvents().find((event) => event.slug === 'demo').title,
    'Démo Michelline'
  );
});

test('EventConfig loads a cloud-only client event when no local JSON exists', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'event-config.js'), 'utf8');
    let requestedSlug = '';
  const cloudApi = {
    isEnabled: () => true,
    getEventSettings: async () => null,
        getPublicEventConfig: async (slug) => {
          requestedSlug = slug;
          return {
          id: 'client-exemple',
      title: 'Mariage de Léa et Marc',
      coupleLeft: 'Léa',
      coupleRight: 'Marc',
      backgroundMusicUrl: 'https://cdn.example.test/musique.mp3'
          };
        }
  };
  const sandbox = {
    console,
    URLSearchParams,
    CustomEvent: class {},
    fetch: async () => ({ ok: false }),
    CloudAPI: cloudApi,
    window: { location: { search: '?event=client-exemple' }, dispatchEvent() {}, CloudAPI: cloudApi },
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'event-config.js' });

  await sandbox.window.EventConfig.init();
  const config = sandbox.window.EventConfig.getConfig();
  assert.equal(requestedSlug, 'client-exemple');
  assert.equal(config.title, 'Mariage de Léa et Marc');
  assert.equal(config.coupleLeft, 'Léa');
  assert.equal(config.venue, undefined);
  assert.equal(config.backgroundMusicUrl, 'https://cdn.example.test/musique.mp3');
});

test('EventConfig reuses a cached public client event after a cloud outage', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'event-config.js'), 'utf8');
  const store = {
    'wedding_event_client-offline_public_config': JSON.stringify({
      id: 'client-offline', slug: 'client-offline', title: 'Mariage hors ligne', venue: 'Lubumbashi'
    })
  };
  const cloudApi = {
    isEnabled: () => true,
    getPublicEventConfig: async () => { throw new Error('network unavailable'); }
  };
  const sandbox = {
    console,
    URLSearchParams,
    CustomEvent: class {},
    fetch: async () => { throw new Error('network unavailable'); },
    CloudAPI: cloudApi,
    window: { location: { search: '?event=client-offline' }, dispatchEvent() {}, CloudAPI: cloudApi },
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'event-config.js' });

  await sandbox.window.EventConfig.init();
  assert.equal(sandbox.window.EventConfig.getConfig().title, 'Mariage hors ligne');
});

test('AuthGuard accepts a collaborator authorized for an event', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'auth.js'), 'utf8');
  const storage = {};
  const requestedUrls = [];
  const sandbox = {
    console,
    URLSearchParams,
    sessionStorage: {
      getItem(key) { return storage[key] || null; },
      setItem(key, value) { storage[key] = String(value); },
      removeItem(key) { delete storage[key]; }
    },
    window: {
      SUPABASE_CONFIG: { enabled: true, url: 'https://supabase.example.test', anonKey: 'anon-key' },
      location: { href: '', pathname: '/pages/login.html', search: '' }
    },
    fetch: async (url) => {
      requestedUrls.push(url);
      if (url.includes('/auth/v1/token')) {
        return { ok: true, json: async () => ({ user: { id: 'user-42', email: 'collaborator@example.test' }, access_token: 'token', expires_in: 3600 }) };
      }
      if (url.includes('/profiles?')) return { ok: true, json: async () => [{ role: 'client' }] };
      if (url.includes('/rpc/can_manage_event')) return { ok: true, json: async () => true };
      throw new Error(`Unexpected URL: ${url}`);
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'auth.js' });

  const result = await sandbox.window.AuthGuard.loginWithPassword('collaborator@example.test', 'secret', 'event-42');
  assert.equal(result.role, 'event');
  assert.equal(sandbox.window.AuthGuard.isEventAdmin('event-42'), true);
  assert.ok(requestedUrls.some((url) => url.includes('/rpc/can_manage_event')));
});

test('CloudAPI never displays local guests when the Supabase admin session is unavailable', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'cloud-api.js'), 'utf8');
  const store = {
    'wedding_event_event-test_guests': JSON.stringify([
      { id: 'guest-1', slug: 'sarah-martin', fullName: 'Sarah Martin', status: 'pending' }
    ])
  };
  const authGuard = { isEventAdmin: () => false };
  const sandbox = {
    console,
    URLSearchParams,
    SUPABASE_CONFIG: { enabled: true, url: 'https://example.test', anonKey: 'anon-key' },
    AuthGuard: authGuard,
    window: { SUPABASE_CONFIG: { enabled: true, url: 'https://example.test', anonKey: 'anon-key' }, AuthGuard: authGuard },
    localStorage: {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = String(v); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'cloud-api.js' });

  await assert.rejects(
    sandbox.window.CloudAPI.getGuests('event-test'),
    /Connexion organisateur requise/
  );
});

test('CloudAPI uses the Supabase guest list instead of stale local guest data', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'cloud-api.js'), 'utf8');
  const store = {
    'wedding_event_event-test_guests': JSON.stringify([
      { id: 'old-guest', slug: 'old-guest', fullName: 'Ancienne liste locale', status: 'pending' }
    ])
  };
  const authGuard = { isEventAdmin: () => true, getSession: () => ({ accessToken: 'token' }) };
  const sandbox = {
    console,
    URLSearchParams,
    SUPABASE_CONFIG: { enabled: true, url: 'https://example.test', anonKey: 'anon-key' },
    AuthGuard: authGuard,
    window: { SUPABASE_CONFIG: { enabled: true, url: 'https://example.test', anonKey: 'anon-key' }, AuthGuard: authGuard },
    fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify([
      { id: 'cloud-guest', event_id: 'event-test', slug: 'cloud-guest', full_name: 'Liste Supabase', status: 'yes' }
    ]) }),
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'cloud-api.js' });

  const guests = await sandbox.window.CloudAPI.getGuests('event-test');
  assert.equal(guests.length, 1);
  assert.equal(guests[0].fullName, 'Liste Supabase');
});

test('CloudAPI clears Storage before deleting the event that authorizes that cleanup', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'cloud-api.js'), 'utf8');
  const calls = [];
  const authGuard = { getSession: () => ({ accessToken: 'token' }) };
  const sandbox = {
    console,
    URLSearchParams,
    SUPABASE_CONFIG: { enabled: true, url: 'https://example.test', anonKey: 'anon-key' },
    AuthGuard: authGuard,
    window: { SUPABASE_CONFIG: { enabled: true, url: 'https://example.test', anonKey: 'anon-key' }, AuthGuard: authGuard },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/storage/v1/object/list/event-assets')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url.includes('/rpc/delete_managed_event')) {
        return { ok: true, status: 200, text: async () => 'true' };
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'cloud-api.js' });

  const result = await sandbox.window.CloudAPI.deleteEvent('event-test');
  assert.equal(result.deleted, true);
  assert.ok(calls.findIndex(({ url }) => url.includes('/storage/v1/object/list/event-assets'))
    < calls.findIndex(({ url }) => url.includes('/rpc/delete_managed_event')));
});

test('CloudAPI keeps only the latest RSVP shown for each guest', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'cloud-api.js'), 'utf8');
  const rsvps = [
    { id: 'newer', guest_id: 'guest-1', full_name: 'Sarah Martin', phone: '06-01-02-03-04', created_at: '2026-09-14T11:00:00Z' },
    { id: 'older', guest_id: null, full_name: 'Sarah Martin', phone: '06 01 02 03 04', created_at: '2026-09-14T10:00:00Z' },
    { id: 'other', guest_id: 'guest-2', full_name: 'Marc Martin', phone: '06 01 02 03 04', created_at: '2026-09-14T09:00:00Z' }
  ];
  const sandbox = {
    console,
    URLSearchParams,
    fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(rsvps) }),
    window: { SUPABASE_CONFIG: { enabled: true, url: 'https://example.test', anonKey: 'anon-key' } },
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'cloud-api.js' });

  const visibleRsvps = await sandbox.window.CloudAPI.getRSVPs('event-test');
  assert.deepEqual(Array.from(visibleRsvps, (rsvp) => rsvp.id), ['newer', 'other']);
});

test('DashboardSync does not read the legacy shared dashboard state for another event', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'dashboard-sync.js'), 'utf8');
  const store = {
    wedding_dashboard_state: JSON.stringify({ welcomeImage: 'photo-demo-partagee.jpg' }),
    'wedding_event_mariage-sarah_dashboard_state': JSON.stringify({ welcomeImage: 'photo-sarah.jpg' })
  };
  const sandbox = {
    console,
    window: {},
    localStorage: {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = String(v); }
    }
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: 'dashboard-sync.js' });

  const eventState = sandbox.window.DashboardSync.readLocal('mariage-sarah');
  assert.equal(eventState.welcomeImage, 'photo-sarah.jpg');
  assert.equal(sandbox.window.DashboardSync.readLocal('autre-evenement'), null);
});

test('GuestManager persists an edited guest before syncing it', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-manager.js'), 'utf8');
  const store = {};
  let nextId = 0;
  const sandbox = {
    console,
    URLSearchParams,
    crypto: { randomUUID: () => `uuid-${++nextId}` },
    EventConfig: { isReady: () => true, getEventId: () => 'event-test' },
    window: {
      EventConfig: { isReady: () => true, getEventId: () => 'event-test' },
      crypto: { randomUUID: () => `uuid-${++nextId}` }
    },
    localStorage: {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = String(v); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'guest-manager.js' });

  const manager = sandbox.window.GuestManager;
  const created = await manager.addGuest({ fullName: 'Sarah Martin' });
  const updated = await manager.updateGuest(created.guest.id, {
    status: 'yes',
    tableNumber: '12',
    qrApproved: true
  });

  assert.equal(updated.guest.status, 'yes');
  assert.equal(updated.guest.tableNumber, '12');
  assert.equal(updated.guest.qrApproved, true);
  const saved = JSON.parse(store['wedding_event_event-test_guests']);
  assert.equal(JSON.stringify(saved[0]), JSON.stringify(updated.guest));
});

test('GuestManager immediately approves the QR for a confirmed RSVP', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-manager.js'), 'utf8');
  const store = {};
  let nextId = 0;
  const eventConfig = { isReady: () => true, getEventId: () => 'event-test' };
  const sandbox = {
    console,
    URLSearchParams,
    crypto: { randomUUID: () => `uuid-${++nextId}` },
    EventConfig: eventConfig,
    window: { EventConfig: eventConfig, crypto: { randomUUID: () => `uuid-${++nextId}` } },
    localStorage: {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = String(v); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'guest-manager.js' });

  const manager = sandbox.window.GuestManager;
  const created = await manager.addGuest({ fullName: 'Sarah Martin', phone: '+243999999999' });
  const confirmed = await manager.recordRSVP({
    guestId: created.guest.id,
    fullName: 'Sarah Martin',
    phone: '+243999999999',
    status: 'yes',
    adults: 2,
    children: 0,
    message: '',
    drinkChoices: [],
    inviteToken: created.guest.token,
    profilePhotoUrl: ''
  });

  assert.equal(confirmed.status, 'yes');
  assert.equal(confirmed.qrApproved, true);
  assert.equal(confirmed.accessCode, confirmed.token.slice(0, 8).toUpperCase());

  const secondAttempt = await manager.recordRSVP({
    guestId: created.guest.id,
    fullName: 'Sarah Martin',
    phone: '+243999999999',
    status: 'yes',
    adults: 1,
    children: 0,
    message: '',
    drinkChoices: ['Jus'],
    inviteToken: created.guest.token,
    profilePhotoUrl: ''
  });
  assert.equal(secondAttempt.alreadyConfirmed, true);
  assert.equal(JSON.stringify(secondAttempt.drinkChoices), '[]');
});

test('GuestManager refuses an RSVP without a personal invitation token', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-manager.js'), 'utf8');
  const store = {};
  const eventConfig = { isReady: () => true, getEventId: () => 'event-test' };
  const sandbox = {
    console,
    URLSearchParams,
    crypto: { randomUUID: () => 'uuid-1' },
    EventConfig: eventConfig,
    window: { EventConfig: eventConfig, crypto: { randomUUID: () => 'uuid-1' } },
    localStorage: {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = String(v); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'guest-manager.js' });

  await assert.rejects(
    sandbox.window.GuestManager.recordRSVP({ fullName: 'Personne inconnue', status: 'yes', inviteToken: '' }),
    /réservée aux personnes ajoutées/
  );
  assert.equal(store['wedding_event_event-test_guests'], undefined);
});

test('GuestManager parses quoted CSV values and counts duplicate imports as skipped', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-manager.js'), 'utf8');
  const store = {};
  let nextId = 0;
  const eventConfig = {
    isReady: () => true,
    getEventId: () => 'event-test',
    buildInvitationBaseUrl: () => 'https://example.test/pages/invitation.html'
  };
  const sandbox = {
    console,
    URLSearchParams,
    crypto: { randomUUID: () => `uuid-${++nextId}` },
    EventConfig: eventConfig,
    window: { EventConfig: eventConfig, crypto: { randomUUID: () => `uuid-${++nextId}` } },
    localStorage: {
      getItem(k) { return store[k] || null; },
      setItem(k, v) { store[k] = String(v); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'guest-manager.js' });

  const manager = sandbox.window.GuestManager;
  const minimalRows = manager.parseCSV('\uFEFFnom,table\n"Aline Kabeya",Table 4');
  assert.deepEqual(JSON.parse(JSON.stringify(minimalRows[0])), {
    fullName: 'Aline Kabeya',
    phone: '',
    group: '',
    email: '',
    tableNumber: 'Table 4'
  });
  const rows = manager.parseCSV('nom,telephone,groupe,email\n"Sarah, Martin",+243999,"Famille, proche",sarah@example.test');
  assert.equal(rows[0].fullName, 'Sarah, Martin');
  assert.equal(rows[0].group, 'Famille, proche');
  const first = await manager.importCSVRows(rows);
  const second = await manager.importCSVRows(rows);
  assert.deepEqual({ imported: first.imported, skipped: first.skipped }, { imported: 1, skipped: 0 });
  assert.deepEqual({ imported: second.imported, skipped: second.skipped }, { imported: 0, skipped: 1 });
});

test('GuestManager previews CSV corrections only for pending guests without a table', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-manager.js'), 'utf8');
  const store = {};
  let nextId = 0;
  const eventConfig = {
    isReady: () => true,
    getEventId: () => 'event-test',
    buildInvitationBaseUrl: () => 'https://example.test/pages/invitation.html'
  };
  const sandbox = {
    console,
    URLSearchParams,
    crypto: { randomUUID: () => `uuid-${++nextId}` },
    EventConfig: eventConfig,
    window: { EventConfig: eventConfig, crypto: { randomUUID: () => `uuid-${++nextId}` } },
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'guest-manager.js' });

  const manager = sandbox.window.GuestManager;
  const pending = (await manager.addGuest({ fullName: 'Valeri Sukami' })).guest;
  const confirmed = (await manager.addGuest({ fullName: 'David Lokaya' })).guest;
  await manager.updateGuest(confirmed.id, { status: 'yes' });
  const assigned = (await manager.addGuest({ fullName: 'Nelson M.' })).guest;
  await manager.updateGuest(assigned.id, { tableNumber: '13' });

  const preview = await manager.previewCsvCorrections([
    { fullName: 'Valere Sukami', tableNumber: '17', tableName: 'Juges' },
    { fullName: 'David Lokaya', tableNumber: '14', tableName: 'Esaie' },
    { fullName: 'Nelson M.', tableNumber: '13', tableName: 'Ecclesiaste' }
  ]);
  assert.equal(preview.matches.length, 1);
  assert.equal(preview.matches[0].guestId, pending.id);
  assert.equal(preview.matches[0].tableNumber, '17');

  const result = await manager.applyCsvCorrections(preview.matches);
  assert.equal(result.updated, 1);
  const guests = await manager.loadGuests();
  assert.equal(guests.find((guest) => guest.id === pending.id).fullName, 'Valere Sukami');
  assert.equal(guests.find((guest) => guest.id === confirmed.id).status, 'yes');
  assert.equal(guests.find((guest) => guest.id === assigned.id).tableNumber, '13');
});

test('GuestManager preserves every RSVP response, including confirmations without a phone number, during CSV replacement', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-manager.js'), 'utf8');
  const store = {};
  let nextId = 0;
  const eventConfig = {
    isReady: () => true,
    getEventId: () => 'event-test',
    buildInvitationBaseUrl: () => 'https://example.test/pages/invitation.html'
  };
  const sandbox = {
    console,
    URLSearchParams,
    crypto: { randomUUID: () => `uuid-${++nextId}` },
    EventConfig: eventConfig,
    window: { EventConfig: eventConfig, crypto: { randomUUID: () => `uuid-${++nextId}` } },
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'guest-manager.js' });

  const manager = sandbox.window.GuestManager;
  await manager.addGuest({ fullName: 'Ancien nom erroné' });
  const confirmed = (await manager.addGuest({ fullName: 'Invité confirmé', phone: '+243 999 123 456' })).guest;
  await manager.updateGuest(confirmed.id, { status: 'yes' });
  const confirmedWithoutPhone = (await manager.addGuest({ fullName: 'Confirmé sans téléphone' })).guest;
  await manager.updateGuest(confirmedWithoutPhone.id, { status: 'yes' });
  const assigned = (await manager.addGuest({ fullName: 'Déjà placé', tableNumber: '8' })).guest;

  const result = await manager.replaceGuestsExceptConfirmedWithPhone([
    { fullName: 'Nelson', tableNumber: '13', tableName: 'Ecclésiaste' },
    { fullName: 'David', tableNumber: '13', tableName: 'Ecclésiaste' }
  ]);
  assert.deepEqual({ removed: result.removed, imported: result.imported }, { removed: 2, imported: 2 });
  const guests = await manager.loadGuests();
  assert.equal(guests.some((guest) => guest.fullName === 'Ancien nom erroné'), false);
  assert.equal(guests.find((guest) => guest.id === confirmed.id).status, 'yes');
  assert.equal(guests.find((guest) => guest.id === confirmed.id).phone, '+243 999 123 456');
  assert.equal(guests.find((guest) => guest.id === confirmedWithoutPhone.id).status, 'yes');
  assert.equal(guests.find((guest) => guest.id === confirmedWithoutPhone.id).phone, '');
  assert.equal(guests.some((guest) => guest.id === assigned.id), false);
  assert.equal(guests.find((guest) => guest.fullName === 'Nelson').tableNumber, '13');
});

test('CheckinAPI refuses unapproved QR codes and records approved guests per event', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'checkin-api.js'), 'utf8');
  const store = {};
  let guest = {
    id: 'guest-1',
    token: 'approved-token',
    fullName: 'Sarah Martin',
    status: 'yes',
    qrApproved: false
  };
  const guestManager = {
    loadGuests: async () => [guest],
    updateGuest: async () => {}
  };
  const sandbox = {
    console,
    Date,
    GuestManager: guestManager,
    window: {
      GuestManager: guestManager
    },
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); }
    }
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: 'checkin-api.js' });

  const denied = await sandbox.window.CheckinAPI.performCheckIn('event-test', guest.token);
  assert.equal(denied.status, 'invalid');
  assert.match(denied.message, /non validé/);

  guest = { ...guest, qrApproved: true };
  const accepted = await sandbox.window.CheckinAPI.performCheckIn('event-test', guest.token);
  assert.equal(accepted.status, 'success');
  const saved = JSON.parse(store['wedding_event_event-test_check_ins']);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].guest_token, guest.token);
});

test('CheckinAPI queues an accepted scan locally when Supabase is unavailable', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'checkin-api.js'), 'utf8');
  const guest = {
    id: 'guest-offline', token: 'offline-token', fullName: 'Aline Martin',
    status: 'yes', qrApproved: true
  };
  const store = {
    // CloudAPI may clear this generic cache; CheckinAPI must use its own one.
    'wedding_event_event-test_guests': JSON.stringify([])
  };
  const loadCalls = [];
  let cloudAvailable = true;
  const guestManager = {
    loadGuests: async (force) => {
      loadCalls.push(force);
      if (!cloudAvailable) throw new Error('liste Supabase indisponible');
      return [guest];
    },
    updateGuest: async () => {}
  };
  const cloud = {
    isEnabled: () => true,
    getCheckIns: async () => {
      if (!cloudAvailable) throw new Error('hors ligne');
      return [];
    },
    insertCheckIn: async () => {
      if (!cloudAvailable) throw new Error('hors ligne');
      return { id: 'checkin-online' };
    },
    markGuestCheckedIn: async () => false
  };
  const sandbox = {
    console,
    Date,
    GuestManager: guestManager,
    CloudAPI: cloud,
    window: { GuestManager: guestManager, CloudAPI: cloud },
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); }
    }
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: 'checkin-api.js' });

  const api = sandbox.window.CheckinAPI;
  const warmed = await api.warmGuestRoster('event-test');
  assert.equal(warmed.length, 1);
  assert.deepEqual(JSON.parse(store['wedding_event_event-test_checkin_roster']), [guest]);
  assert.deepEqual(JSON.parse(store['wedding_event_event-test_guests']), []);
  assert.equal(loadCalls[0], true);

  cloudAvailable = false;
  const accepted = await api.performCheckIn('event-test', guest.token, { scannedBy: 'Staff' });
  assert.equal(accepted.status, 'pending');
  assert.match(accepted.message, /Synchronisation/);
  assert.equal(JSON.parse(store['wedding_event_event-test_check_ins']).length, 1);
  assert.equal(JSON.parse(store['wedding_event_event-test_check_ins_pending']).length, 1);
  assert.equal(loadCalls[1], undefined);

  const repeat = await api.performCheckIn('event-test', guest.token);
  assert.equal(repeat.status, 'duplicate');
});

test('CheckinAPI valide une file locale déjà synchronisée par un autre appareil', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'checkin-api.js'), 'utf8');
  const row = {
    event_id: 'event-test', guest_id: 'guest-shared', guest_token: 'shared-token',
    scanned_at: '2026-09-18T10:00:00.000Z', pending_sync: true
  };
  const store = {
    'wedding_event_event-test_check_ins': JSON.stringify([row]),
    'wedding_event_event-test_check_ins_pending': JSON.stringify([row])
  };
  let lookupToken = '';
  const cloud = {
    isEnabled: () => true,
    insertCheckIn: async () => null,
    getCheckIns: async (_eventId, options) => {
      lookupToken = options.token;
      return [{ ...row, id: 'remote-checkin', pending_sync: undefined }];
    },
    markGuestCheckedIn: async () => true
  };
  const sandbox = {
    console,
    Date,
    CloudAPI: cloud,
    window: { CloudAPI: cloud },
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); }
    }
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: 'checkin-api.js' });

  const result = await sandbox.window.CheckinAPI.syncPendingCheckIns('event-test');
  assert.equal(result.synced, 1);
  assert.equal(result.pending, 0);
  assert.equal(lookupToken, 'shared-token');
  assert.deepEqual(JSON.parse(store['wedding_event_event-test_check_ins_pending']), []);
  assert.equal(JSON.parse(store['wedding_event_event-test_check_ins'])[0].pending_sync, false);
});

test('CheckinAPI garde un scan Supabase réussi pour détecter un doublon hors ligne', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'checkin-api.js'), 'utf8');
  const store = {};
  const guest = {
    id: 'guest-synced', token: 'synced-token', fullName: 'Marc Martin',
    status: 'yes', qrApproved: true
  };
  let online = true;
  const guestManager = {
    loadGuests: async () => [guest],
    updateGuest: async () => {}
  };
  const cloud = {
    isEnabled: () => online,
    getCheckIns: async () => [],
    insertCheckIn: async (row) => ({ ...row, id: 'checkin-1' }),
    markGuestCheckedIn: async () => true
  };
  const sandbox = {
    console,
    Date,
    GuestManager: guestManager,
    CloudAPI: cloud,
    window: { GuestManager: guestManager, CloudAPI: cloud },
    localStorage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = String(value); }
    }
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: 'checkin-api.js' });

  const api = sandbox.window.CheckinAPI;
  const accepted = await api.performCheckIn('event-test', guest.token);
  assert.equal(accepted.status, 'success');
  assert.equal(JSON.parse(store['wedding_event_event-test_check_ins']).length, 1);
  assert.equal(store['wedding_event_event-test_check_ins_pending'], undefined);

  online = false;
  const repeat = await api.performCheckIn('event-test', guest.token);
  assert.equal(repeat.status, 'duplicate');
});

test('GuestManager resolves cloud invitation tokens without loading the guest list', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-manager.js'), 'utf8');
  let getGuestsCalls = 0;
  let receivedToken = '';
  const eventConfig = {
    isReady: () => true,
    getEventId: () => 'event-test',
    buildInvitationBaseUrl: () => 'https://example.test/pages/invitation.html'
  };
  const cloudApi = {
    isEnabled: () => true,
    getGuests: async () => { getGuestsCalls++; return []; },
    getGuestByInviteToken: async (token) => {
      receivedToken = token;
      return { id: 'guest-1', eventId: 'event-test', token, fullName: 'Sarah Martin' };
    }
  };
  const sandbox = {
    console,
    URLSearchParams,
    EventConfig: eventConfig,
    CloudAPI: cloudApi,
    window: { EventConfig: eventConfig, CloudAPI: cloudApi },
    localStorage: { getItem() { return null; }, setItem() {} },
    crypto: { randomUUID: () => 'uuid-1' }
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.crypto = sandbox.crypto;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'guest-manager.js' });

  const guest = await sandbox.window.GuestManager.findByToken('secret-invite-token');
  assert.equal(receivedToken, 'secret-invite-token');
  assert.equal(guest.fullName, 'Sarah Martin');
  assert.equal(getGuestsCalls, 0);
});
