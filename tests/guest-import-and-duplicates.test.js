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
