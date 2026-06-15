function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
}

function statusBadge(status) {
    const map = {
        yes: '<span class="badge badge-yes">Confirmé</span>',
        no: '<span class="badge badge-no">Refus</span>',
        pending: '<span class="badge badge-pending">En attente</span>'
    };
    return map[status] || map.pending;
}

function renderStats() {
    const stats = GuestManager.getStats();
    document.getElementById("stat-total").textContent = stats.total;
    document.getElementById("stat-yes").textContent = stats.yes;
    document.getElementById("stat-no").textContent = stats.no;
    document.getElementById("stat-pending").textContent = stats.pending;
    document.getElementById("stat-adults").textContent = stats.adults;
}

function getFilteredGuests() {
    const search = (document.getElementById("guest-search").value || "").toLowerCase();
    const filter = document.getElementById("guest-filter").value;
    return GuestManager.loadGuests().filter((g) => {
        const matchFilter = filter === "all" || g.status === filter;
        const matchSearch = !search || g.fullName.toLowerCase().includes(search) || (g.phone || "").includes(search);
        return matchFilter && matchSearch;
    });
}

function renderGuestsTable() {
    const guests = getFilteredGuests();
    const tbody = document.getElementById("guests-table-body");
    const empty = document.getElementById("guests-empty");
    tbody.innerHTML = "";

    if (!guests.length) {
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    guests.forEach((guest) => {
        const tr = document.createElement("tr");
        const link = GuestManager.buildInviteLink(guest);
        const waLink = GuestManager.buildWhatsAppLink(guest);
        tr.innerHTML = `
            <td><strong>${guest.fullName}</strong></td>
            <td>${guest.phone || "—"}</td>
            <td>${guest.group || "—"}</td>
            <td>${statusBadge(guest.status)}</td>
            <td>
                <div class="flex flex-wrap gap-1">
                    <button type="button" class="dash-btn dash-btn-ghost text-xs px-2 py-1" data-copy="${link}">Copier lien</button>
                    <a href="${waLink}" target="_blank" class="dash-btn dash-btn-ghost text-xs px-2 py-1">WhatsApp</a>
                    <button type="button" class="dash-btn dash-btn-ghost text-xs px-2 py-1" data-remove="${guest.id}">Suppr.</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const link = btn.dataset.copy;
            try {
                await navigator.clipboard.writeText(link);
                showToast("Lien copié");
            } catch {
                showToast(link);
            }
        });
    });

    tbody.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
            if (confirm("Supprimer cet invité ?")) {
                GuestManager.removeGuest(btn.dataset.remove);
                renderStats();
                renderGuestsTable();
                showToast("Invité supprimé");
            }
        });
    });
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function preserveEventLinks() {
    const q = EventConfig.preserveEventQuery();
    document.getElementById("back-invitation-link").href = `./invitation.html${q}`;
    document.getElementById("back-custom-link").href = `./personnalisation.html${q}`;
}

window.addEventListener("DOMContentLoaded", async () => {
    await EventConfig.init();
    const config = EventConfig.getConfig();
    if (config && config.title) {
        document.getElementById("admin-event-title").textContent = `Invités — ${config.title}`;
    }
    preserveEventLinks();
    renderStats();
    renderGuestsTable();

    document.getElementById("add-guest-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const guest = GuestManager.addGuest({
            fullName: document.getElementById("guest-name").value,
            phone: document.getElementById("guest-phone").value,
            group: document.getElementById("guest-group").value
        });
        if (!guest) {
            showToast("Nom invalide");
            return;
        }
        e.target.reset();
        renderStats();
        renderGuestsTable();
        showToast(`Invité ajouté — lien prêt`);
    });

    document.getElementById("import-csv-btn").addEventListener("click", () => {
        const fileInput = document.getElementById("csv-file-input");
        const file = fileInput.files[0];
        if (!file) {
            showToast("Choisissez un fichier CSV");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const result = GuestManager.parseCSV(reader.result);
                document.getElementById("import-result").textContent =
                    `${result.imported} invité(s) importé(s), ${result.skipped} ignoré(s).`;
                renderStats();
                renderGuestsTable();
                showToast("Import terminé");
            } catch (err) {
                showToast(err.message || "Erreur CSV");
            }
        };
        reader.readAsText(file);
    });

    document.getElementById("export-links-btn").addEventListener("click", () => {
        const csv = GuestManager.exportLinksCSV();
        const eventId = EventConfig.getEventId();
        downloadCSV(csv, `invites-liens-${eventId}.csv`);
        showToast("Export téléchargé");
    });

    document.getElementById("guest-search").addEventListener("input", renderGuestsTable);
    document.getElementById("guest-filter").addEventListener("change", renderGuestsTable);
});
