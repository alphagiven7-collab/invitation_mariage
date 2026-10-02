const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('the disabled drink menu stays hidden and does not submit saved choices', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'drink-menu.js'), 'utf8');
  const classes = new Set(['hidden']);
  const attributes = new Map();
  const storage = new Map();
  const section = {
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); }
    },
    setAttribute(name, value) { attributes.set(name, value); }
  };
  const grid = { innerHTML: '', querySelectorAll() { return []; } };
  const fields = {
    'drink-menu-section': section,
    'drink-menu-grid': grid,
    'drink-menu-title': { textContent: '' },
    'drink-menu-subtitle': { textContent: '' }
  };
  const document = {
    getElementById(id) { return fields[id] || null; },
    querySelectorAll() { return []; }
  };
  const sessionStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); }
  };
  const DrinkGenericImages = {
    getDefaultItems() { return [{ name: 'Eau', imageUrl: '/eau.jpg' }]; },
    resolveImageUrl(item) { return item.imageUrl || '/eau.jpg'; },
    fallbackUrl() { return '/eau.jpg'; }
  };
  const window = { location: { search: '?event=example' }, DrinkGenericImages };
  vm.runInNewContext(source, {
    window, document, sessionStorage, DrinkGenericImages, URLSearchParams
  }, { filename: 'drink-menu.js' });

  window.DrinkMenu.apply({ sections: { drinkMenu: true } });
  window.DrinkMenu.setSelected(['Eau']);
  assert.equal(classes.has('hidden'), false);
  assert.deepEqual(Array.from(window.DrinkMenu.getSelected()), ['Eau']);

  // Empty custom lists still fall back to default drinks; the explicit switch wins.
  window.DrinkMenu.apply({ sections: { drinkMenu: false }, drinkMenu: [] });
  assert.equal(classes.has('hidden'), true);
  assert.equal(attributes.get('aria-hidden'), 'true');
  assert.equal(grid.innerHTML, '');
  assert.deepEqual(Array.from(window.DrinkMenu.getSelected()), []);
  assert.equal(storage.get('wedding_drink_pick_example'), '["Eau"]');

  window.DrinkMenu.apply({ sections: { drinkMenu: true } });
  assert.equal(classes.has('hidden'), false);
  assert.equal(attributes.get('aria-hidden'), 'false');
  assert.deepEqual(Array.from(window.DrinkMenu.getSelected()), ['Eau']);
});
