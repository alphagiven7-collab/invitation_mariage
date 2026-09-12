const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('EventConfig.createEvent correctly initializes and registers a new event in localStorage', () => {
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
    welcomeImage: "https://cdn.example.test/sarah-marc-accueil.jpg"
  });

  assert.equal(ev.slug, 'mariage-de-sarah-marc');
  assert.equal(ev.title, 'Mariage de Sarah & Marc');
  assert.equal(ev.branding.welcomeImage, 'https://cdn.example.test/sarah-marc-accueil.jpg');
  assert.ok(store['wedding_custom_events']);

  const registered = EventConfig.getRegisteredEvents();
  assert.ok(registered.some(e => e.slug === 'mariage-de-sarah-marc'));

  assert.throws(
    () => EventConfig.createEvent({ title: 'Copie démo', slug: 'yanick-keren' }),
    /réservé à une démo existante/
  );
  assert.throws(
    () => EventConfig.createEvent({ title: 'Copie locale', slug: 'mariage-de-sarah-marc' }),
    /déjà utilisé/
  );

  assert.equal(EventConfig.discardLocalEvent('mariage-de-sarah-marc'), true);
  assert.ok(!EventConfig.getRegisteredEvents().some(e => e.slug === 'mariage-de-sarah-marc'));
  assert.equal(store['wedding_event_mariage-de-sarah-marc_config'], undefined);
});

test('EventConfig ignores stale local configuration for a built-in demo', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'event-config.js'), 'utf8');
  const store = {
    'wedding_event_yanick-keren_config': JSON.stringify({ title: 'Ancienne copie locale' })
  };
  const sandbox = {
    console,
    URLSearchParams,
    CustomEvent: class {},
    fetch: async () => ({ ok: true, json: async () => ({ id: 'yanick-keren', title: 'JSON officiel' }) }),
    window: { location: { search: '?event=yanick-keren' }, dispatchEvent() {} },
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
    sandbox.window.EventConfig.getRegisteredEvents().find((event) => event.slug === 'yanick-keren').title,
    'Démo'
  );
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
  const rows = manager.parseCSV('nom,telephone,groupe,email\n"Sarah, Martin",+243999,"Famille, proche",sarah@example.test');
  assert.equal(rows[0].fullName, 'Sarah, Martin');
  assert.equal(rows[0].group, 'Famille, proche');
  const first = await manager.importCSVRows(rows);
  const second = await manager.importCSVRows(rows);
  assert.deepEqual({ imported: first.imported, skipped: first.skipped }, { imported: 1, skipped: 0 });
  assert.deepEqual({ imported: second.imported, skipped: second.skipped }, { imported: 0, skipped: 1 });
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
