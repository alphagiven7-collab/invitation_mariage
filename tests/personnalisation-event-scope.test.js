const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('getDashboardStorageKey uses an event-specific key when DashboardSync is unavailable', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'personnalisation.js'), 'utf8');

  const sandbox = {
    console,
    setTimeout() {},
    clearTimeout() {},
    FileReader: class {},
    URLSearchParams,
    URL,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    navigator: {},
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return {}; },
      documentElement: { style: {} }
    },
    window: {
      location: { search: '' },
      addEventListener() {},
      document: null,
      EventConfig: { isReady: () => true, getEventId: () => 'demo-event' },
      localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
      },
      DashboardSync: null,
      CloudAPI: null,
      AuthGuard: null,
      ContentBlocks: null,
      DrinkGenericImages: null,
      DrinkMenu: null,
      ButtonLoading: null,
      MediaUpload: null,
      WeddingDB: null
    }
  };

  sandbox.window.document = sandbox.document;
  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(source, sandbox, { filename: 'personnalisation.js' });

  assert.equal(sandbox.getDashboardStorageKey('event-42'), 'wedding_event_event-42_dashboard_state');
});

test('DashboardSync keeps a newer local save when the cloud state is older', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'dashboard-sync.js'), 'utf8');
  const sandbox = { console, window: {}, localStorage: { getItem() { return null; }, setItem() {} } };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: 'dashboard-sync.js' });

  const state = sandbox.window.DashboardSync.mergeStates(
    { title: 'Défaut' },
    { title: 'Ancien cloud', _cloudUpdatedAt: '2026-01-01T10:00:00.000Z' },
    { title: 'Modification récente', _savedAt: '2026-01-01T10:05:00.000Z' },
    { preferCloud: true }
  );
  assert.equal(state.title, 'Modification récente');
});
