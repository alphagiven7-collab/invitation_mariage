const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPersonalization(config, dashboardSync = null) {
  const eventConfig = {
    getConfig: () => config,
    getEventId: () => 'mariage',
    isReady: () => true
  };
  const contentBlocks = { getDefaultsFromConfig: () => ({}) };
  const window = {
    EventConfig: eventConfig,
    ContentBlocks: contentBlocks,
    DashboardSync: dashboardSync,
    addEventListener() {}
  };
  const sandbox = {
    window,
    EventConfig: eventConfig,
    ContentBlocks: contentBlocks,
    DashboardSync: dashboardSync
  };
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'js', 'personnalisation.js'),
    'utf8'
  );
  vm.runInNewContext(source, sandbox, { filename: 'personnalisation.js' });
  return sandbox;
}

test('photo editor recovers uploaded images from public top-level config', () => {
  const saved = {
    welcomeImage: 'https://example.com/welcome.jpg',
    heroImage: 'https://example.com/hero.jpg',
    bestPhotos: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
    branding: { welcomeImage: '', heroImage: '' }
  };
  const editor = loadPersonalization(saved);
  const defaults = editor.getConfigDefaults();

  assert.equal(defaults.welcomeImage, saved.welcomeImage);
  assert.equal(defaults.heroImage, saved.heroImage);
  assert.deepEqual(Array.from(defaults.bestPhotos), saved.bestPhotos);
});

test('loading photo editor never saves an identity normalization automatically', async () => {
  const saved = {
    welcomeImage: 'https://example.com/welcome.jpg',
    heroImage: 'https://example.com/hero.jpg',
    bestPhotos: ['https://example.com/one.jpg']
  };
  let saveCalls = 0;
  const dashboardSync = {
    async load() { return { ...saved, title: 'Invitation' }; },
    syncIdentityFromConfig(state) {
      return { state: { ...state, coupleLeft: 'Dave' }, changed: true };
    },
    async save() { saveCalls += 1; }
  };
  const editor = loadPersonalization(saved, dashboardSync);
  const state = await editor.loadStateFromSync();

  assert.equal(state.coupleLeft, 'Dave');
  assert.equal(state.welcomeImage, saved.welcomeImage);
  assert.deepEqual(Array.from(state.bestPhotos), saved.bestPhotos);
  assert.equal(saveCalls, 0);
});

test('published photos replace empty and stock photos from a stale local edit', async () => {
  const published = {
    welcomeImage: 'https://storage.example/mariage/welcome.jpg',
    heroImage: 'https://storage.example/mariage/hero.jpg',
    bestPhotos: ['https://storage.example/mariage/one.jpg']
  };
  const dashboardSync = {
    async load() {
      return {
        welcomeImage: '',
        heroImage: 'https://images.unsplash.com/photo-old',
        bestPhotos: ['https://images.unsplash.com/photo-default']
      };
    }
  };
  const editor = loadPersonalization(published, dashboardSync);
  const state = await editor.loadStateFromSync();

  assert.equal(state.welcomeImage, published.welcomeImage);
  assert.equal(state.heroImage, published.heroImage);
  assert.deepEqual(Array.from(state.bestPhotos), published.bestPhotos);
});
