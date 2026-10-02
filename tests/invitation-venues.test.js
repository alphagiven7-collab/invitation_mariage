const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup(config = {}) {
  const element = () => ({
    textContent: '', innerHTML: '', hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
    removeAttribute(name) { delete this[name]; }
  });
  const elements = Object.fromEntries([
    'venue-title', 'venue-address', 'venue-kind', 'venue-time', 'venue-primary-card',
    'venue-additional-list', 'venues-empty', 'venue-map-link', 'venue-map-embed',
    'venue-map-fallback', 'map-image', 'food-menu-panel', 'food-menu-list', 'food-menu-title',
    'invitation-menu-section', 'drink-menu-section'
  ].map((id) => [id, element()]));
  const document = { getElementById: (id) => elements[id] || null };
  const EventConfig = { getConfig: () => config };
  const window = { document, EventConfig, location: { href: 'https://invitation.test/' }, addEventListener() {} };
  const sandbox = { document, window, EventConfig, URL };
  vm.runInNewContext(source('assets/js/content-blocks.js'), sandbox);
  sandbox.ContentBlocks = window.ContentBlocks;
  vm.runInNewContext(source('assets/js/personnalisation.js'), sandbox);
  return { ...sandbox, elements, blocks: window.ContentBlocks };
}

test('legacy venue details are converted without overriding explicitly cleared fields', () => {
  const { blocks } = setup();
  const state = {
    venue: 'Ancienne salle', venueDetails: { address: 'Ancienne adresse', time: '19h30', lat: '-4', lng: '15', mapImage: 'https://images.test/map.jpg' },
    links: { map: 'https://maps.google.com/?q=old' }, venueTitle: 'Nouvelle salle', venueAddress: 'Nouvelle adresse',
    venueLat: '', venueLng: '', mapLink: ''
  };
  const [venue] = blocks.normalizeVenues(state);
  assert.equal(venue.name, 'Nouvelle salle');
  assert.equal(venue.address, 'Nouvelle adresse');
  assert.equal(venue.time, '19h30');
  assert.equal(venue.lat, '');
  assert.equal(venue.lng, '');
  assert.equal(venue.mapLink, '');
  assert.equal(venue.mapImage, 'https://images.test/map.jpg');
  assert.equal(blocks.buildMapUrl(blocks.venueToLegacy(venue)), 'https://maps.google.com/?q=Nouvelle%20adresse');
  assert.deepEqual(plain(blocks.normalizeVenues({ ...state, venues: [] })), []);
});

test('each venue displays its own label, time and safe itinerary while the first keeps export fields', () => {
  const { blocks, elements } = setup();
  blocks.applyVenue({ venues: [
    { id: 'civil', type: 'civil', name: 'Hôtel de ville', address: 'Place centrale', time: '11h00', mapLink: 'https://maps.app.goo.gl/civil' },
    { id: 'religious', type: 'religious', name: '<Église>', address: 'Rue des fleurs', time: '14h00', mapLink: 'javascript:alert(1)' },
    { id: 'party', type: 'other', label: 'Soirée en famille', name: 'Jardin', address: 'Rue du parc', time: '19h00' }
  ] });
  assert.equal(elements['venue-title'].textContent, 'Hôtel de ville');
  assert.equal(elements['venue-address'].textContent, 'Place centrale');
  assert.equal(elements['venue-kind'].textContent, 'Mariage civil');
  assert.equal(elements['venue-time'].textContent, '11h00');
  assert.equal(elements['venue-map-link'].href, 'https://maps.app.goo.gl/civil');
  const more = elements['venue-additional-list'].innerHTML;
  assert.match(more, /Cérémonie religieuse/);
  assert.match(more, /&lt;Église&gt;/);
  assert.match(more, /14h00/);
  assert.match(more, /Soirée en famille/);
  assert.match(more, /19h00/);
  assert.match(more, /q=Rue%20des%20fleurs/);
  assert.match(more, /q=Rue%20du%20parc/);
  assert.doesNotMatch(more, /javascript:|id="venue-title"/);
  assert.equal(elements['venues-empty'].hidden, true);
});

test('removing every venue clears the previous address, map and additional cards', () => {
  const { blocks, elements } = setup();
  blocks.applyVenue({ venueTitle: 'Ancienne salle', venueAddress: 'Ancienne adresse' });
  blocks.applyVenue({ venues: [], venueTitle: 'Doit rester ignoré' });
  assert.equal(elements['venue-title'].textContent, '');
  assert.equal(elements['venue-address'].textContent, '');
  assert.equal(elements['venue-map-link'].href, '');
  assert.equal(elements['venue-map-link'].hidden, true);
  assert.equal(elements['venue-map-embed'].src, undefined);
  assert.equal(elements['venue-primary-card'].hidden, true);
  assert.equal(elements['venues-empty'].hidden, false);
  assert.equal(elements['venue-additional-list'].innerHTML, '');
});

test('editor payload roundtrip preserves venue order, custom labels, food menu and legacy primary fields', () => {
  const event = {
    venues: [
      { id: 'ceremony', type: 'religious', name: 'Chapelle', address: 'Rue A', time: '13h00', mapLink: 'https://maps.app.goo.gl/one' },
      { id: 'dinner', type: 'other', label: 'Dîner', name: 'Restaurant', address: 'Rue B', time: '19h00', lat: '-4.1', lng: '15.2' }
    ],
    foodMenu: [{ title: 'Buffet', description: 'Saveurs de saison' }], foodMenuTitle: 'Notre menu',
    sections: { venue: true, foodMenu: true }, backgroundMusicUrl: '/music.mp3'
  };
  const editor = setup(event);
  const initial = editor.getConfigDefaults();
  const payload = editor.toDashboardPayload(initial);
  const restored = setup(plain(payload)).getConfigDefaults();
  assert.deepEqual(plain(restored.venues), plain(initial.venues));
  assert.deepEqual(plain(restored.foodMenu), event.foodMenu);
  assert.equal(restored.foodMenuTitle, 'Notre menu');
  assert.equal(payload.venueTitle, 'Chapelle');
  assert.equal(payload.venueAddress, 'Rue A');
  assert.equal(payload.venueTime, '13h00');
  assert.equal(payload.backgroundMusicUrl, '/music.mp3');
  const cleared = editor.toDashboardPayload({ ...initial, venues: [] });
  assert.deepEqual(plain(cleared.venues), []);
  assert.equal(cleared.venueTitle, '');
  assert.equal(cleared.mapLink, '');
  assert.deepEqual(plain(setup(plain(cleared)).getConfigDefaults().venues), []);
});

test('opening and saving a legacy venue keeps its scheduled time', () => {
  const editor = setup({ venue: 'Salle historique', venueDetails: { address: 'Rue A' }, venueTime: '16h45' });
  const defaults = editor.getConfigDefaults();
  assert.equal(defaults.venueTime, '16h45');
  const payload = editor.toDashboardPayload(defaults);
  assert.equal(payload.venues[0].time, '16h45');
  assert.equal(payload.venueTime, '16h45');
});

test('editor uses the published event date instead of the demonstration countdown date', () => {
  const editor = setup({ eventDate: '2027-05-22T11:00' });
  const defaults = editor.getConfigDefaults();
  assert.equal(defaults.countdownDate, '2027-05-22T11:00');
  assert.equal(editor.toDashboardPayload(defaults).eventDate, '2027-05-22T11:00');
});

test('food menu stays optional and escapes client text without changing drink preferences', () => {
  const { blocks, elements } = setup();
  blocks.renderFoodMenu({ foodMenu: [{ title: 'Entrée <chef>', description: 'Salade & légumes' }] });
  assert.equal(elements['food-menu-panel'].hidden, false);
  assert.match(elements['food-menu-list'].innerHTML, /Entrée &lt;chef&gt;/);
  assert.match(elements['food-menu-list'].innerHTML, /Salade &amp; légumes/);
  blocks.renderFoodMenu({ foodMenu: [] });
  assert.equal(elements['food-menu-panel'].hidden, true);
  assert.equal(elements['food-menu-list'].innerHTML, '');
});
