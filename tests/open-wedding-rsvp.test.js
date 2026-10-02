const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('An open wedding shows the open RSVP form without an invite token', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-experience.js'), 'utf8');
  const toggles = new Map();
  const fields = new Map();
  function field(id) {
    if (!fields.has(id)) {
      fields.set(id, {
        classList: {
          toggle(name, hidden) { toggles.set(`${id}:${name}`, hidden); },
          remove() {}
        },
        removeAttribute() {},
        setAttribute() {},
        value: '',
        textContent: ''
      });
    }
    return fields.get(id);
  }
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById: field,
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
  let openedModal = '';
  const EventConfig = {
    isReady() { return true; },
    getConfig() {
      return {
        type: 'wedding',
        rsvpMode: 'open',
        confirmationFamilies: { male: 'Famille A', female: 'Famille B' }
      };
    },
    getEventId() { return 'mariage-ouvert'; }
  };
  const window = {
    document,
    EventConfig,
    location: { search: '?event=mariage-ouvert' },
    openModal(id) { openedModal = id; }
  };
  const sandbox = {
    window, document, EventConfig, URLSearchParams,
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  vm.runInNewContext(source, sandbox, { filename: 'guest-experience.js' });

  await window.GuestExperience.openRsvp();

  assert.equal(openedModal, 'rsvp-modal');
  assert.equal(toggles.get('open-rsvp-side-field:hidden'), false);
  assert.equal(toggles.get('rsvp-phone-field:hidden'), true);
  assert.equal(field('open-rsvp-male-family').textContent, 'Famille A');
  assert.equal(toggles.get('rsvp-extra-details:hidden'), true);
  assert.equal(field('rsvp-submit-btn').textContent, 'Enregistrer et ouvrir WhatsApp');
});

test('An assigned table appears on the invitation before the guest confirms', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'guest-experience.js'), 'utf8');
  const fields = new Map();
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById(id) {
      if (!fields.has(id)) fields.set(id, { hidden: true, textContent: '', classList: { add() {} } });
      return fields.get(id);
    }
  };
  const EventConfig = { isReady: () => true, getEventId: () => 'mariage-test' };
  const window = { document, EventConfig, location: { search: '?event=mariage-test' }, dispatchEvent() {} };
  vm.runInNewContext(source, {
    window, document, EventConfig, URLSearchParams,
    CustomEvent: class {},
    localStorage: { setItem() {} }
  }, { filename: 'guest-experience.js' });

  window.GuestExperience.applyProfile({ fullName: 'Marie', status: 'pending', tableNumber: '12' });
  assert.equal(fields.get('invite-table-assignment').hidden, false);
  assert.equal(fields.get('invite-table-number').textContent, '12');

  window.GuestExperience.applyProfile({ fullName: 'Paul', status: 'pending' });
  assert.equal(fields.get('invite-table-assignment').hidden, true);
});

test('The drink menu stays on the invitation outside the RSVP form', () => {
  const invitation = fs.readFileSync(path.join(__dirname, '..', 'pages', 'invitation.html'), 'utf8');
  const drinkMenu = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'drink-menu.js'), 'utf8');
  assert.match(invitation, /id="drink-menu-section"/);
  assert.doesNotMatch(invitation, /id="rsvp-drinks-section"/);
  assert.doesNotMatch(drinkMenu, /rsvp-drink-options/);
});
