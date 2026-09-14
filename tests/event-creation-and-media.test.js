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

test('CloudAPI keeps local guests visible when the admin session is unavailable', async () => {
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

  const guests = await sandbox.window.CloudAPI.getGuests('event-test');
  assert.equal(guests.length, 1);
  assert.equal(guests[0].fullName, 'Sarah Martin');
});

test('CloudAPI keeps only the latest RSVP shown for each guest', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'cloud-api.js'), 'utf8');
  const rsvps = [
    { id: 'newer', guest_id: 'guest-1', full_name: 'Sarah Martin', created_at: '2026-09-14T11:00:00Z' },
    { id: 'older', guest_id: 'guest-1', full_name: 'Sarah Martin', created_at: '2026-09-14T10:00:00Z' },
    { id: 'other', guest_id: 'guest-2', full_name: 'Marc Martin', created_at: '2026-09-14T09:00:00Z' }
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
