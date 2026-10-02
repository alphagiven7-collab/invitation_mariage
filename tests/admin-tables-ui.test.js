const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/admin.js', 'utf8');
const start = source.indexOf('    document.getElementById("edit-guest-form").addEventListener("submit"');
const end = source.indexOf('    document.getElementById("edit-cancel-btn")', start);

function editHarness({ phone = '', assignmentChanged = true, failAssignment = false } = {}) {
    let handler;
    const patches = [];
    const assignments = [];
    const guest = { id: 'guest-1', fullName: 'Marie', phone: '', email: '', status: 'pending', adults: 1,
        children: 0, qrApproved: false, accessCode: '', profilePhotoUrl: '', tableId: 'old', tableNumber: '8' };
    const nodes = {
        'edit-guest-form': { addEventListener(_type, listener) { handler = listener; } },
        'edit-guest-save-btn': { textContent: 'Enregistrer', disabled: false },
        'edit-guest-id': { value: guest.id },
        'edit-guest-name': { value: guest.fullName },
        'edit-guest-phone': { value: phone },
        'edit-guest-email': { value: '' },
        'edit-guest-status': { value: 'pending' },
        'edit-guest-adults': { value: '1' },
        'edit-guest-children': { value: '0' },
        'edit-guest-qr-approved': { checked: false },
        'edit-guest-access-code': { value: '' },
        'edit-guest-profile-photo': { value: '' }
    };
    const AdminTables = { isReady: () => true, canEditLegacy: () => false,
        editedAssignment: () => ({ changed: assignmentChanged, tableId: 'new' }) };
    const context = {
        window: { AdminTables }, AdminTables,
        document: { getElementById: (id) => nodes[id] },
        editGuestOriginal: { ...guest }, guestsCache: [guest],
        GuestManager: { async updateGuest(id, patch) {
            patches.push({ id, patch: JSON.parse(JSON.stringify(patch)) });
            // RSVP arrived while the organizer had this form open.
            Object.assign(guest, patch, { status: 'yes', adults: 2 });
            return { guest: { ...guest }, cloudSynced: true };
        } },
        TableManager: { async assignGuests(ids, tableId) {
            assignments.push({ ids: [...ids], tableId });
            if (failAssignment) { failAssignment = false; throw new Error('Connexion interrompue'); }
            guest.tableId = tableId;
        } },
        showToast() {}, async renderGuestsTable() {}, closeEditModal() {}, async refreshCurrentTab() {}
    };
    vm.runInNewContext(source.slice(start, end), context);
    return { submit: () => handler({ preventDefault() {} }), guest, patches, assignments, nodes };
}

test('changing only an assigned table never sends a guest or RSVP patch', async () => {
    const h = editHarness();
    await h.submit();
    assert.deepEqual(h.patches, []);
    assert.deepEqual(h.assignments, [{ ids: ['guest-1'], tableId: 'new' }]);
    assert.equal(h.guest.status, 'pending');
    assert.equal(h.nodes['edit-guest-save-btn'].disabled, false);
});

test('retrying a failed table assignment preserves a newer RSVP and only patches the changed contact once', async () => {
    const h = editHarness({ phone: '+243999999999', failAssignment: true });
    await h.submit();
    await h.submit();
    assert.deepEqual(h.patches, [{ id: 'guest-1', patch: { phone: '+243999999999' } }]);
    assert.equal(h.assignments.length, 2);
    assert.equal(h.guest.status, 'yes');
    assert.equal(h.guest.adults, 2);
    assert.equal(h.guest.tableId, 'new');
});

test('saving an unchanged guest does not write an assignment or a guest patch', async () => {
    const h = editHarness({ assignmentChanged: false });
    await h.submit();
    assert.deepEqual(h.patches, []);
    assert.deepEqual(h.assignments, []);
});
