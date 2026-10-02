const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pages', 'invitation.html'), 'utf8');

test('invitation follows the requested reading order and finishes with the working RSVP button', () => {
  const order = [...html.matchAll(/data-invitation-section="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ['invitation', 'about', 'program', 'dressCode', 'menu', 'gifts', 'guestbook', 'gallery', 'countdown', 'venues', 'rsvp']);
  const finalSection = html.slice(html.indexOf('data-invitation-section="rsvp"'), html.indexOf('</main>'));
  assert.match(finalSection, /id="confirm-presence-btn"[^>]+onclick="confirmPresence\(event\)"/);
  assert.match(finalSection, /data-event-section="rsvp"/);
  assert.match(html, /id="background-music"/);
  assert.match(html, /id="invite-table-assignment"/);
});

test('reorganized invitation and editor keep DOM IDs unique', () => {
  for (const page of ['invitation.html', 'personnalisation.html']) {
    const content = fs.readFileSync(path.join(__dirname, '..', 'pages', page), 'utf8');
    const ids = [...content.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${page} must not duplicate IDs when sections move`);
  }
});
