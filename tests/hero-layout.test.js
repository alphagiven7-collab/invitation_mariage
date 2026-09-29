const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('the invitation shows the full hero photo by default and applies saved framing', async () => {
  const css = new Map();
  const hero = { dataset: {} };
  const image = { src: '' };
  const document = {
    title: '',
    documentElement: { style: { setProperty(name, value) { css.set(name, value); } } },
    getElementById(id) { return id === 'hero-image' ? image : null; },
    querySelector(selector) { return selector === '.hero-bg' ? hero : null; },
    querySelectorAll() { return []; }
  };
  const window = { location: { search: '?event=demo' }, dispatchEvent() {} };
  const sandbox = {
    document,
    window,
    URLSearchParams,
    CustomEvent: class {},
    fetch: async () => ({ ok: true, json: async () => ({
      title: 'Invitation test',
      heroImage: 'https://example.test/photo.jpg'
    }) }),
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  window.window = window;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'event-config.js'), 'utf8'),
    sandbox,
    { filename: 'event-config.js' }
  );

  const config = window.EventConfig;
  await config.init();
  config.applyToPage();
  assert.equal(hero.dataset.imageFit, 'contain');
  assert.equal(css.get('--hero-image-position-x'), '50%');
  assert.equal(css.get('--hero-image-position-y'), '50%');
  assert.equal(image.src, 'https://example.test/photo.jpg');

  config.saveOverrides({ heroImageFit: 'cover', heroImagePositionX: 150, heroImagePositionY: -20 });
  config.applyToPage();
  assert.equal(hero.dataset.imageFit, 'cover');
  assert.equal(css.get('--hero-image-position-x'), '100%');
  assert.equal(css.get('--hero-image-position-y'), '0%');
});
