const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeElement() {
    const classes = new Set();
    return {
        children: [],
        attributes: {},
        classList: { add: (...items) => items.forEach((item) => classes.add(item)), contains: (item) => classes.has(item) },
        setAttribute(name, value) { this.attributes[name] = value; },
        appendChild(child) { this.children.push(...(child.isFragment ? child.children : [child])); },
        set innerHTML(value) { if (value === '') this.children = []; },
        get innerHTML() { return ''; },
        textContent: '',
        hidden: true
    };
}

test('invitation date renders its real month, leap day and opening date', () => {
    const elements = Object.fromEntries([
        'calendar-days', 'calendar-month-label', 'hero-date', 'invite-card-date', 'event-day',
        'event-weekday', 'event-month-year', 'event-time-range'
    ].map((id) => [id, makeElement()]));
    const document = {
        getElementById: (id) => elements[id] || null,
        createElement: () => makeElement(),
        createDocumentFragment: () => ({ isFragment: true, children: [], appendChild(child) { this.children.push(child); } })
    };
    const context = { document, window: {} };
    const source = fs.readFileSync(path.join(__dirname, '../assets/js/countdown.js'), 'utf8');
    vm.runInNewContext(source, context);

    context.window.EventCountdown.applyDateToUI('2028-02-29T19:30');
    const cells = elements['calendar-days'].children;
    assert.equal(cells.length, 30); // Tuesday start: one spacer plus 29 days.
    const eventCell = cells.find((cell) => cell.id === 'calendar-event-day');
    assert.equal(eventCell.textContent, '29');
    assert.match(elements['calendar-month-label'].textContent, /février 2028/i);
    assert.match(elements['hero-date'].textContent, /29 février 2028.*19h30/i);
    assert.equal(elements['hero-date'].hidden, false);
    assert.match(elements['invite-card-date'].textContent, /29 février 2028/i);

    context.window.EventCountdown.applyDateToUI('2026-11-01T16:00');
    assert.equal(elements['calendar-days'].children.length, 36); // Sunday start: six spacers plus 30 days.
    assert.equal(elements['calendar-days'].children.filter((cell) => cell.id === 'calendar-event-day').length, 1);
    assert.equal(elements['calendar-days'].children.find((cell) => cell.id === 'calendar-event-day').textContent, '1');
    assert.match(elements['calendar-month-label'].textContent, /novembre 2026/i);
});
