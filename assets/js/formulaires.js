function bindForms() {
    const rsvpForm = document.getElementById("rsvp-form");
    const guestbookForm = document.getElementById("guestbook-form");

    rsvpForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById("rsvp-name").value.trim(),
            phone: document.getElementById("rsvp-phone").value.trim(),
            status: document.getElementById("rsvp-status").value,
            guests: Number(document.getElementById("rsvp-guests").value || 1),
            message: document.getElementById("rsvp-message").value.trim()
        };
        if (!payload.name || !payload.phone) {
            alert("Nom et téléphone sont obligatoires.");
            return;
        }
        WeddingDB.addRSVP(payload);
        rsvpForm.reset();
        alert("RSVP enregistré.");
        renderStats();
    });

    guestbookForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const payload = {
            author: document.getElementById("book-author").value.trim() || "Invité",
            message: document.getElementById("book-message").value.trim()
        };
        if (!payload.message) {
            alert("Message requis.");
            return;
        }
        WeddingDB.addGuestbook(payload);
        guestbookForm.reset();
        renderGuestbook();
    });
}

function renderStats() {
    const rsvps = WeddingDB.getRSVPs();
    document.getElementById("rsvp-count").textContent = String(rsvps.length);
}

function renderGuestbook() {
    const list = WeddingDB.getGuestbook();
    const root = document.getElementById("guestbook-list");
    root.innerHTML = "";
    list.slice(0, 20).forEach((item) => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `<strong>${item.author}</strong><p>${item.message}</p><small>${new Date(item.createdAt).toLocaleString("fr-FR")}</small>`;
        root.appendChild(card);
    });
}

function exportMiniDB() {
    const data = WeddingDB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wedding-mini-db.json";
    a.click();
    URL.revokeObjectURL(url);
}

window.addEventListener("DOMContentLoaded", () => {
    bindForms();
    renderStats();
    renderGuestbook();
});
