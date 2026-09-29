const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadContentBlocks() {
  const elements = {
    'venue-title': { textContent: 'Lieu initial' },
    'venue-address': { textContent: 'Adresse initiale' },
    'venue-map-link': { href: '' }
  };
  const window = { location: { href: 'https://invitation.example/pages/invitation.html' } };
  const document = { getElementById: (id) => elements[id] || null };
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/content-blocks.js'), 'utf8');
  vm.runInNewContext(source, { window, document, URL, console });
  return { blocks: window.ContentBlocks, elements };
}

test('shared invitation shows the latest venue name and address from public configuration', () => {
  const { blocks, elements } = loadContentBlocks();
  // The public RPC merges the original event config with dashboard settings.
  const publicConfig = {
    venue: 'Ancien nom du lieu',
    venueDetails: { address: 'Ancienne adresse', lat: '-1.1', lng: '15.1' },
    links: { map: 'https://maps.google.com/?q=Ancienne%20adresse' },
    venueTitle: 'Nouveau nom du lieu',
    venueAddress: 'Nouvelle adresse, Kinshasa',
    mapLink: '',
    venueLat: '',
    venueLng: ''
  };

  blocks.applyVenue(blocks.getDefaultsFromConfig(publicConfig));

  assert.equal(elements['venue-title'].textContent, 'Nouveau nom du lieu');
  assert.equal(elements['venue-address'].textContent, 'Nouvelle adresse, Kinshasa');
  assert.equal(elements['venue-map-link'].href, 'https://maps.google.com/?q=Nouvelle%20adresse%2C%20Kinshasa');
});

test('shared invitation still supports legacy venue fields', () => {
  const { blocks, elements } = loadContentBlocks();
  blocks.applyVenue(blocks.getDefaultsFromConfig({
    venue: 'Nom historique',
    venueDetails: { address: 'Adresse historique' }
  }));

  assert.equal(elements['venue-title'].textContent, 'Nom historique');
  assert.equal(elements['venue-address'].textContent, 'Adresse historique');
});
