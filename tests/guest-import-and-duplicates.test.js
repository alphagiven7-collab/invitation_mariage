const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

function setup(cloud = null, initial = []) {
  const store = { wedding_event_test_guests: JSON.stringify(initial) };
  const config = { isReady: () => true, getEventId: () => 'test' };
  const sandbox = { console, URLSearchParams, TextDecoder, Uint8Array, crypto: { randomUUID }, EventConfig: config,
    CloudAPI: cloud, window: { EventConfig: config, CloudAPI: cloud, crypto: { randomUUID } },
    localStorage: { getItem: (key) => store[key] || null, setItem: (key, value) => { store[key] = value; } } };
  vm.runInNewContext(fs.readFileSync('assets/js/guest-manager.js', 'utf8'), sandbox);
  return sandbox.window.GuestManager;
}

for (const separator of [',', ';', '\t']) {
  test(`CSV separator ${JSON.stringify(separator)}, accents, blanks and rejection accounting`, async () => {
    const manager = setup();
    const source = '\uFEFF\r\n' + ['nom', 'contact', 'table'].join(separator) + '\r\n' +
      ['"Élodie, Noël"', '"+243 (999) 123-456"', '"Table; 4"'].join(separator) + '\r\n\r\n' +
      ['A', '', ''].join(separator) + '\r\n' + ['Bob', '123'].join(separator) + '\r\n';
    const rows = manager.parseCSV(source);
    assert.equal(rows[0].fullName, 'Élodie, Noël');
    assert.equal(rows[0].phone, '243999123456');
    assert.equal(rows[0].tableNumber, 'Table; 4');
    const preview = await manager.previewImport(rows);
    assert.equal(preview.total, 5);
    assert.equal(preview.valid.length, 1);
    assert.equal(preview.rejected.length, 4);
    assert.equal(preview.valid.length + preview.duplicates.length + preview.rejected.length, preview.total);
    const result = await manager.importCSVRows(rows);
    assert.equal(result.imported, 1);
    assert.equal(result.skipped, 4);
  });
}

test('CSV quotes, embedded newlines and malformed headers produce accurate diagnostics', () => {
  const manager = setup();
  const rows = manager.parseCSV('nom,table\n"Marie ""Mimi""\nNoël",8\n');
  assert.equal(rows[0].fullName, 'Marie "Mimi"\nNoël');
  assert.equal(rows.report.total, 1);
  for (const [csv, error] of [
    ['nom,table\n"Marie,8', /Ligne 2.*non fermés/],
    ['nom,table\nMa"rie,8', /guillemet inattendu/],
    ['nom,table\n"Marie"oops,8', /après un guillemet/],
    ['contact,table\n123,8', /nom.*obligatoire/],
    ['nom,contact,téléphone\nMarie,123,123', /ambiguë/],
    ['\n\n', /vide/]
  ]) assert.throws(() => manager.parseCSV(csv), error);
});

test('CSV supports UTF-8, Windows-1252 and UTF-16 BOMs', () => {
  const manager = setup();
  assert.match(manager.decodeCSV(Buffer.from('nom\nÉlodie')), /Élodie/);
  assert.match(manager.decodeCSV(Buffer.from([110, 111, 109, 10, 201, 108, 111, 100, 105, 101])), /Élodie/);
  assert.match(manager.decodeCSV(Buffer.concat([Buffer.from([255, 254]), Buffer.from('nom\nÉlodie', 'utf16le')])), /Élodie/);
});

test('Normalizes international prefixes without guessing country and rejects a repeated name', async () => {
  const manager = setup();
  assert.equal(manager.normalizePhone('+243 (999) 123-456'), manager.normalizePhone('00243 999 123 456'));
  assert.notEqual(manager.normalizePhone('0999 123 456'), manager.normalizePhone('+243999123456'));
  const rows = manager.parseCSV('nom;contact;table\nÉlodie Noël;+243 999 123 456;1\nÉlodie Noël;00243999123456;1\nÉlodie Noël;00243999888888;2\nPaul Noël;00243999123456;1\nElodie Noël;00243999123456;1');
  const preview = await manager.previewImport(rows);
  assert.equal(preview.valid.length, 3);
  assert.equal(preview.duplicates.length, 2);
  const result = await manager.importCSVRows(rows);
  assert.equal(result.imported, 3);
  const guests = await manager.loadGuests();
  assert.equal(new Set(guests.map((g) => g.slug)).size, 3);
  assert.equal((await manager.importCSVRows(rows)).imported, 0);
});

test('Manual addition and renaming reject an existing normalized name, regardless of contact', async () => {
  const manager = setup();
  const first = await manager.addGuest({ fullName: 'Marie Noël', phone: '+243 999' });
  const repeated = await manager.addGuest({ fullName: '  marie   Noël ', phone: '+243 888' });
  const other = await manager.addGuest({ fullName: 'Paul Noël', phone: '+243 777' });
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.guest.id, first.guest.id);
  assert.equal(await manager.updateGuest(other.guest.id, { fullName: 'Marie Noël' }), null);
});

test('Rechecks duplicates after preview and after renaming a guest', async () => {
  const manager = setup();
  const rows = manager.parseCSV('nom,contact\nMarie Noël,123');
  assert.equal((await manager.previewImport(rows)).valid.length, 1);
  const guest = (await manager.addGuest({ fullName: 'Ancien nom', phone: '123' })).guest;
  await manager.updateGuest(guest.id, { fullName: 'Marie Noël' });
  assert.equal((await manager.importCSVRows(rows)).imported, 0);
});

test('Guests can be added without a phone number and the old country-prefix default is not stored', async () => {
  const manager = setup();
  const withoutPhone = await manager.addGuest({ fullName: 'Marie Sans Téléphone' });
  const prefixOnly = await manager.addGuest({ fullName: 'Paul Préfixe', phone: '+243 ' });
  assert.equal(withoutPhone.guest.phone, '');
  assert.equal(prefixOnly.guest.phone, '');
  assert.equal((await manager.loadGuests()).length, 2);
});

test('Marking a guest as a couple preserves their invitation data and cannot create a duplicate', async () => {
  const manager = setup();
  const first = (await manager.addGuest({ fullName: 'Marie Noël', phone: '+243 999', tableNumber: '8' })).guest;
  const token = first.token;
  const slug = first.slug;
  const id = first.id;
  const marked = await manager.markGuestAsCouple(first.id);
  assert.equal(marked.guest.fullName, 'Couple Marie Noël');
  assert.equal(marked.guest.phone, '+243 999');
  assert.equal(marked.guest.tableNumber, '8');
  assert.equal(marked.guest.token, token);
  assert.equal(marked.guest.slug, slug);
  assert.equal(marked.guest.id, id);
  assert.equal((await manager.markGuestAsCouple(first.id)).alreadyCouple, true);

  const conflictManager = setup(null, [
    { id: 'paul', fullName: 'Paul Noël', phone: '', status: 'pending' },
    { id: 'couple-paul', fullName: 'Couple Paul Noël', phone: '+243 999', status: 'pending' }
  ]);
  const conflict = await conflictManager.markGuestAsCouple('paul');
  assert.equal(conflict.guest, null);
  assert.equal(conflict.duplicate, true);
});

test('A couple label and the same bare name are treated as the same guest name', async () => {
  const manager = setup();
  const first = await manager.addGuest({ fullName: 'Couple Paul Noël' });
  const repeated = await manager.addGuest({ fullName: 'Paul Noël', phone: '+243 999' });
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.guest.id, first.guest.id);
});

test('Name lookup keeps an old bare name compatible after it is marked as a couple', async () => {
  const manager = setup();
  const guest = (await manager.addGuest({ fullName: 'Marie Noël' })).guest;
  await manager.markGuestAsCouple(guest.id);
  assert.equal((await manager.findByName('Marie Noël')).id, guest.id);
});

test('CSV Couple row renames an existing guest without replacing their invitation data', async () => {
  const initial = [{
    id: 'marie', slug: 'marie-noel', token: 'same-token', fullName: 'Marie Noël',
    phone: '+243 999', email: 'marie@example.test', group: 'Famille', tableNumber: '8',
    status: 'yes', adults: 2, children: 1, qrApproved: true
  }];
  const manager = setup(null, initial);
  const rows = manager.parseCSV('nom,contact,table\nCOUPLE   marie   Noël,+243 000,99\nCouple Marie Noël,,\nCouple Paul Noël,,2');
  const preview = await manager.previewImport(rows);
  assert.equal(preview.valid.length, 1);
  assert.equal(preview.coupleUpdates.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(preview.coupleUpdates[0])), {
    line: 2, guestId: 'marie', currentName: 'Marie Noël', fullName: 'Couple Marie Noël'
  });
  assert.equal(preview.duplicates.length, 1);

  const result = await manager.importCSVRows(rows);
  assert.deepEqual({ imported: result.imported, renamedCouples: result.renamedCouples, skipped: result.skipped, failed: result.failed },
    { imported: 1, renamedCouples: 1, skipped: 1, failed: 0 });
  const guests = await manager.loadGuests();
  const renamed = guests.find((guest) => guest.id === 'marie');
  assert.equal(renamed.fullName, 'Couple Marie Noël');
  assert.equal(renamed.token, 'same-token');
  assert.equal(renamed.slug, 'marie-noel');
  assert.equal(renamed.phone, '+243 999');
  assert.equal(renamed.tableNumber, '8');
  assert.equal(renamed.status, 'yes');
  assert.equal(guests.some((guest) => guest.fullName === 'Couple Paul Noël'), true);
});

test('Cloud CSV Couple rename PATCHes the existing guest and reports a rename separately', async () => {
  const cloudGuests = [{ id: 'marie', slug: 'marie-noel', token: 'token', fullName: 'Marie Noël', status: 'pending' }];
  const calls = [];
  const cloud = {
    isEnabled: () => true,
    getGuests: async () => cloudGuests,
    upsertGuest: async (eventId, guest, options) => {
      calls.push({ eventId, guest, options });
      cloudGuests[0] = { ...guest };
      return { guest, cloudSynced: true };
    }
  };
  const manager = setup(cloud);
  const result = await manager.importCSVRows(manager.parseCSV('nom\nCouple Marie Noël'));
  assert.equal(result.imported, 0);
  assert.equal(result.renamedCouples, 1);
  assert.equal(result.failed, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].guest.fullName, 'Couple Marie Noël');
  assert.equal(calls[0].options.requireExisting, true);
  assert.equal(calls[0].options.createOnly, undefined);
});

test('CSV Couple rejects an ambiguous match and leaves an already-coupled guest untouched', async () => {
  const ambiguous = setup(null, [
    { id: 'bare', fullName: 'Marie Noël', status: 'pending' },
    { id: 'couple', fullName: 'Couple Marie Noël', status: 'pending' }
  ]);
  const rows = ambiguous.parseCSV('nom\nCouple Marie Noël');
  const preview = await ambiguous.previewImport(rows);
  assert.equal(preview.coupleUpdates.length, 0);
  assert.equal(preview.rejected.length, 1);
  assert.match(preview.rejected[0].reason, /Plusieurs invités correspondent/);
  assert.equal((await ambiguous.importCSVRows(rows)).renamedCouples, 0);
  assert.deepEqual(JSON.parse(JSON.stringify((await ambiguous.loadGuests()).map((guest) => guest.fullName))),
    ['Marie Noël', 'Couple Marie Noël']);

  const calls = [];
  const cloud = {
    isEnabled: () => true,
    getGuests: async () => [{ id: 'couple', fullName: 'Couple Paul Noël', status: 'pending' }],
    upsertGuest: async (...args) => { calls.push(args); return { guest: args[1], cloudSynced: true }; }
  };
  const alreadyCoupled = setup(cloud);
  const alreadyRows = alreadyCoupled.parseCSV('nom\nCouple Paul Noël');
  const alreadyPreview = await alreadyCoupled.previewImport(alreadyRows);
  assert.equal(alreadyPreview.coupleUpdates.length, 0);
  assert.equal(alreadyPreview.duplicates.length, 1);
  assert.equal((await alreadyCoupled.importCSVRows(alreadyRows)).renamedCouples, 0);
  assert.equal(calls.length, 0);
});

test('Duplicate deletion requires explicit selection, confirmation and a retained guest', async () => {
  const initial = [
    { id: '1', fullName: 'Marie Noël', phone: '+243 999', status: 'yes' },
    { id: '2', fullName: 'Marie Noël', phone: '00243-999', status: 'pending' },
    { id: '3', fullName: 'Marie Noël', phone: '00243-111', status: 'pending' },
    { id: '4', fullName: 'Paul Noël', phone: '00243-999', status: 'pending' }
  ];
  const manager = setup(null, initial);
  assert.equal((await manager.findDuplicateGuests()).length, 1);
  await assert.rejects(manager.removeDuplicateGuests(['2']), /Confirmation/);
  await assert.rejects(manager.removeDuplicateGuests(['1', '2', '3'], { confirmed: true }), /Conservez/);
  await assert.rejects(manager.removeDuplicateGuests(['4'], { confirmed: true }), /liste a changé/);
  assert.equal((await manager.removeDuplicateGuests(['2'], { confirmed: true })).removed, 1);
  assert.equal((await manager.loadGuests()).length, 3);
  assert.equal((await manager.loadGuests()).find((guest) => guest.id === '1').status, 'yes');
});

test('Duplicate review keeps the entry with a phone before the entry without one', async () => {
  const manager = setup(null, [
    { id: 'no-phone', fullName: 'Marie Noël', phone: '', status: 'pending', createdAt: '2026-01-01' },
    { id: 'phone', fullName: 'Marie Noël', phone: '+243 999', status: 'pending', createdAt: '2026-01-02' }
  ]);
  const [group] = await manager.findDuplicateGuests();
  assert.equal(group[0].id, 'phone');
  assert.equal(group[1].id, 'no-phone');
});

test('Cloud import reports per-row failures and never claims failed inserts succeeded', async () => {
  const cloud = { isEnabled: () => true, getGuests: async () => [],
    upsertGuest: async (event, guest, options) => {
      assert.equal(options.createOnly, true);
      if (guest.fullName === 'Marie') throw new Error('Supabase (403) : permission refusée');
      return { guest, cloudSynced: true };
    } };
  const manager = setup(cloud);
  const result = await manager.importCSVRows(manager.parseCSV('nom,table\nMarie,1\nPaul,2'));
  assert.equal(result.imported, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.errors[0].line, 2);
  assert.match(result.errors[0].reason, /403/);
});

test('Invalid replacement never deletes the current list', async () => {
  const manager = setup(null, [{ id: '1', fullName: 'Marie', status: 'pending' }]);
  await assert.rejects(manager.replaceGuestsExceptConfirmedWithPhone(manager.parseCSV('nom,table\n,3')), /annulé/);
  assert.equal((await manager.loadGuests()).length, 1);
});

function cloudSetup(fetch) {
  const config = { enabled: true, url: 'https://example.test', anonKey: 'test' };
  const auth = { isEventAdmin: () => true, getSession: () => ({ accessToken: 'test' }) };
  const sandbox = { console, fetch, crypto: { randomUUID }, SUPABASE_CONFIG: config, AuthGuard: auth,
    window: { SUPABASE_CONFIG: config, AuthGuard: auth },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  vm.runInNewContext(fs.readFileSync('assets/js/cloud-api.js', 'utf8'), sandbox);
  return sandbox.window.CloudAPI;
}
const response = (data, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });

test('Cloud createOnly uses POST with ID and table, never PATCH or lossy payload fallback', async () => {
  const calls = [];
  const cloud = cloudSetup(async (url, options) => {
    calls.push(options);
    return response([{ ...JSON.parse(options.body), id: 'new-id' }]);
  });
  const result = await cloud.upsertGuest('test', { id: 'new-id', slug: 'marie', fullName: 'Marie', token: 'token', tableNumber: '8' }, { createOnly: true });
  assert.equal(result.cloudSynced, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(JSON.parse(calls[0].body).table_number, '8');
  const denied = cloudSetup(async () => response({ message: 'column table_number missing' }, 400));
  await assert.rejects(denied.upsertGuest('test', { id: 'id' }, { createOnly: true }), /table_number missing/);
});

test('Cloud requireExisting uses a scoped PATCH and never creates a missing guest', async () => {
  const guest = {
    id: 'marie-id', slug: 'marie-noel', token: 'same-token', fullName: 'Couple Marie Noël',
    phone: '+243 999', status: 'yes', adults: 2, children: 1, tableNumber: '8'
  };
  const calls = [];
  const cloud = cloudSetup(async (url, options) => {
    calls.push({ url, options });
    const body = JSON.parse(options.body);
    return response([{ ...body, id: guest.id }]);
  });
  const saved = await cloud.upsertGuest('test', guest, { requireExisting: true });
  assert.equal(saved.cloudSynced, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.match(calls[0].url, /id=eq.marie-id&event_id=eq.test/);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.slug, 'marie-noel');
  assert.equal(payload.token, 'same-token');
  assert.equal(payload.status, 'yes');
  assert.equal(payload.phone, '+243 999');
  assert.equal(payload.table_number, '8');

  const missingCalls = [];
  const missing = cloudSetup(async (url, options) => {
    missingCalls.push({ url, options });
    return response([]);
  });
  const absent = await missing.upsertGuest('test', guest, { requireExisting: true });
  assert.equal(absent.guest, null);
  assert.equal(absent.cloudSynced, false);
  assert.ok(missingCalls.length > 0);
  assert.ok(missingCalls.every((call) => call.options.method === 'PATCH'));
});

test('Cloud paginates large lists and surfaces a failed subsequent page', async () => {
  const queries = [];
  const cloud = cloudSetup(async (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    queries.push(offset);
    return response(Array.from({ length: offset === 0 ? 500 : 2 }, (_, i) => ({ id: `${offset + i}`, full_name: 'Invité' })));
  });
  assert.equal((await cloud.getGuests('test')).length, 502);
  assert.deepEqual(queries, [0, 500]);
  const denied = cloudSetup(async (url) => new URL(url).searchParams.get('offset') === '0' ?
    response(Array.from({ length: 500 }, (_, i) => ({ id: `${i}` }))) : response({ message: 'session expirée' }, 401));
  await assert.rejects(denied.getGuests('test'), /session expirée/);
});

test('Concurrent imports are rejected until the active import finishes', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const manager = setup({ isEnabled: () => true, getGuests: async () => { await gate; return []; },
    upsertGuest: async (event, guest) => ({ guest, cloudSynced: true }) });
  const rows = manager.parseCSV('nom\nMarie');
  const first = manager.importCSVRows(rows);
  await assert.rejects(manager.importCSVRows(rows), /déjà en cours/);
  release();
  assert.equal((await first).imported, 1);
});

test('A failed reload after successful writes retains the actual imported count', async () => {
  let reads = 0;
  const manager = setup({ isEnabled: () => true,
    getGuests: async () => { if (++reads > 1) throw new Error('réseau indisponible'); return []; },
    upsertGuest: async (event, guest) => ({ guest, cloudSynced: true }) });
  const result = await manager.importCSVRows(manager.parseCSV('nom\nMarie'));
  assert.equal(result.imported, 1);
  assert.equal(result.failed, 0);
  assert.match(result.warning, /actualisation impossible/);
});

test('Import review shows counts and rejection reasons and supports cancel before approval', async () => {
  const nodes = new Map();
  const element = () => ({ textContent: '', disabled: false, children: [], dataset: {},
    classList: { add() {}, remove() {} }, setAttribute() {}, focus() {},
    appendChild(child) { this.children.push(child); } });
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    createElement: element };
  const sandbox = { document, window: { addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync('assets/js/admin.js', 'utf8'), sandbox);
  const preview = { total: 3, valid: [{}], duplicates: [{ line: 3, fullName: '<img>', reason: 'Doublon' }],
    rejected: [{ line: 4, reason: 'Nom absent' }] };
  const pending = sandbox.reviewImport(preview);
  const details = document.getElementById('import-preview-details');
  assert.match(details.textContent, /3 ligne.*1 invité.*1 doublon.*1 ligne/s);
  assert.match(details.textContent, /Ligne 4.*Nom absent/);
  assert.match(details.textContent, /<img>/); // displayed via textContent, never interpreted as HTML
  document.getElementById('import-preview-cancel').onclick();
  assert.equal(await pending, false);
  const approved = sandbox.reviewImport(preview);
  document.getElementById('import-preview-apply').onclick();
  assert.equal(await approved, true);
  const empty = sandbox.reviewImport({ total: 1, valid: [], duplicates: [], rejected: [{ line: 2, reason: 'Vide' }] });
  assert.equal(document.getElementById('import-preview-apply').disabled, true);
  document.getElementById('import-preview-cancel').onclick();
  assert.equal(await empty, false);
  const coupleOnly = sandbox.reviewImport({
    total: 1, valid: [], coupleUpdates: [{ line: 2, currentName: 'Marie Noël', fullName: 'Couple Marie Noël' }],
    duplicates: [], rejected: []
  });
  assert.equal(document.getElementById('import-preview-apply').disabled, false);
  assert.match(document.getElementById('import-preview-details').textContent, /sera renommé en Couple Marie Noël/);
  document.getElementById('import-preview-cancel').onclick();
  assert.equal(await coupleOnly, false);
});

test('Import outcome keeps per-row error explanations and reload warnings visible', () => {
  const sandbox = { window: { addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync('assets/js/admin.js', 'utf8'), sandbox);
  const message = sandbox.importOutcome({ imported: 2, skipped: 3, failed: 1,
    errors: [{ line: 7, fullName: 'Marie', reason: 'Supabase (403) : accès refusé' }], warning: 'Actualisation impossible' });
  assert.match(message, /2 importé.*3 ignoré.*1 échec/);
  assert.match(message, /Ligne 7 \(Marie\).*403/);
  assert.match(message, /Actualisation impossible/);
});
