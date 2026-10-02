const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'personnalisation.js'), 'utf8'
);

function loadEditor(config, document = {}) {
  const EventConfig = { getConfig: () => config };
  const ContentBlocks = { getDefaultsFromConfig: () => ({}) };
  const window = { EventConfig, ContentBlocks, addEventListener() {} };
  const sandbox = { window, document, EventConfig, ContentBlocks };
  vm.runInNewContext(source, sandbox, { filename: 'personnalisation.js' });
  return sandbox;
}

test('editor keeps disabled public modules and music setting when reopening', () => {
  const editor = loadEditor({
    sections: { music: false, calendar: false, drinkMenu: false },
    backgroundMusicEnabled: false,
    backgroundMusicVolume: 0.2,
    backgroundMusicUrl: '',
    ambiance: { enabled: true, volume: 0.8, musicUrl: '/old.mp3' }
  });
  const defaults = editor.getConfigDefaults();

  assert.equal(defaults.sections.music, false);
  assert.equal(defaults.sections.calendar, false);
  assert.equal(defaults.sections.drinkMenu, false);
  assert.equal(defaults.backgroundMusicEnabled, false);
  assert.equal(defaults.backgroundMusicVolume, 0.2);
  assert.equal(defaults.backgroundMusicUrl, '');
  assert.equal(editor.toDashboardPayload({ sections: defaults.sections }).sections.music, false);
});

test('disabling either music control stops the editor audio preview', () => {
  const listeners = new Map();
  const control = (name) => ({
    checked: true,
    addEventListener(type, callback) { listeners.set(`${name}:${type}`, callback); }
  });
  const moduleToggle = control('module');
  const enabledToggle = control('enabled');
  let pauses = 0;
  const preview = { currentTime: 12, pause() { pauses += 1; } };
  const fields = {
    backgroundMusicVolume: control('volume'),
    'music-volume-label': { textContent: '' },
    'perso-music-preview': preview,
    backgroundMusicUrl: { value: '/music.mp3' },
    backgroundMusicEnabled: enabledToggle
  };
  const document = {
    getElementById: (id) => fields[id] || null,
    querySelector: (selector) => selector === '[data-module-toggle="music"]' ? moduleToggle : null
  };
  const editor = loadEditor({}, document);
  editor.wireMusicControls();

  moduleToggle.checked = false;
  listeners.get('module:change')();
  assert.equal(pauses, 1);
  assert.equal(preview.currentTime, 0);

  moduleToggle.checked = true;
  enabledToggle.checked = false;
  listeners.get('enabled:change')();
  assert.equal(pauses, 2);
});
