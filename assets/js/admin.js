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

function downloadFile(content, filename, type = "text/csv") {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function renderStats() {
    GuestManager.loadGuests && await GuestManager.loadGuests(true);
    const stats = await GuestManager.getStats();
    document.getElementById("stat-total").textContent = stats.total;
    document.getElementById("stat-yes").textContent = stats.yes;
    document.getElementById("stat-no").textContent = stats.no;
    document.getElementById("stat-pending").textContent = stats.pending;
    document.getElementById("stat-adults").textContent = stats.adults;
    document.getElementById("stat-children").textContent = stats.children;
}

async function getFilteredGuests() {
    const search = (document.getElementById("guest-search").value || "").toLowerCase();
    const filter = document.getElementById("guest-filter").value;
    const guests = await GuestManager.loadGuests();
    return guests.filter((g) => {
        const matchFilter = filter === "all" || g.status === filter;
        const matchSearch = !search || g.fullName.toLowerCase().includes(search) || (g.phone || "").includes(search);
        return matchFilter && matchSearch;
    });
}

async function renderGuestsTable() {
    const guests = await getFilteredGuests();
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
                <button type="button" class="dash-btn dash-btn-ghost text-xs px-2 py-1" data-copy="${link}">Lien</button>
                <a href="${waLink}" target="_blank" class="dash-btn dash-btn-ghost text-xs px-2 py-1">WA</a>
                <button type="button" class="dash-btn dash-btn-ghost text-xs px-2 py-1" data-remove="${guest.id}">×</button>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(btn.dataset.copy);
                showToast("Lien copié");
            } catch {
                showToast(btn.dataset.copy);
            }
        });
    });
    tbody.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (confirm("Supprimer ?")) {
                await GuestManager.removeGuest(btn.dataset.remove);
                await refreshAll();
                showToast("Supprimé");
            }
        });
    });
}

async function renderRelances() {
    const pending = await GuestManager.getPendingGuests();
    const root = document.getElementById("relances-list");
    root.innerHTML = "";
    if (!pending.length) {
        root.innerHTML = '<p class="dash-tip">Tous les invités ont répondu 🎉</p>';
        return;
    }
    pending.forEach((guest) => {
        const wa = GuestManager.buildWhatsAppLink(guest);
        const div = document.createElement("div");
        div.className = "flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200";
        div.innerHTML = `<span><strong>${guest.fullName}</strong> — ${guest.phone || "pas de tél."}</span>`;
        const a = document.createElement("a");
        a.href = wa;
        a.target = "_blank";
        a.className = "dash-btn dash-btn-ghost text-xs";
        a.textContent = "Relancer WhatsApp";
        div.appendChild(a);
        root.appendChild(div);
    });
}

async function renderAnalytics() {
    const eventId = EventConfig.getEventId();
    const events = await CloudAPI.getAnalytics(eventId);
    const counts = {};
    events.forEach((e) => {
        counts[e.event_type] = (counts[e.event_type] || 0) + 1;
    });
    const summary = document.getElementById("analytics-summary");
    summary.innerHTML = Object.entries(counts).map(([k, v]) =>
        `<div class="stat-card"><strong>${v}</strong><span>${k}</span></div>`
    ).join("") || '<p class="dash-tip">Aucune donnée analytics.</p>';

    const list = document.getElementById("analytics-list");
    list.innerHTML = events.slice(0, 30).map((e) =>
        `<li class="text-slate-600">${new Date(e.created_at).toLocaleString()} — <strong>${e.event_type}</strong></li>`
    ).join("");
}

async function renderRSVPList() {
    const eventId = EventConfig.getEventId();
    const rsvps = CloudAPI.isEnabled() ? await CloudAPI.getRSVPs(eventId) : [];
    const tbody = document.getElementById("rsvps-table-body");
    const empty = document.getElementById("rsvps-empty");
    tbody.innerHTML = "";
    if (!rsvps.length) {
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");
    rsvps.forEach((r) => {
        const tr = document.createElement("tr");
        const st = r.status === "yes" ? "Confirmé" : r.status === "no" ? "Refus" : r.status;
        tr.innerHTML = `<td><strong>${r.full_name || r.fullName}</strong></td><td>${r.phone || "—"}</td><td>${st}</td><td>${r.adults || 0}</td><td>${r.children || 0}</td><td>${r.created_at ? new Date(r.created_at).toLocaleString("fr-FR") : "—"}</td>`;
        tbody.appendChild(tr);
    });
}

async function refreshAll() {
    await renderStats();
    await renderGuestsTable();
    await renderRelances();
    await renderRSVPList();
    await renderAnalytics();
}

function setupTabs() {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
        });
    });
}

window.addEventListener("DOMContentLoaded", async () => {
    await EventConfig.init();
    const eventId = EventConfig.getEventId();
    if (!AuthGuard.requireAdmin(eventId)) return;

    const config = EventConfig.getConfig();
    if (config && config.title) {
        document.getElementById("admin-event-title").textContent = `Invités — ${config.title}`;
    }

    const q = EventConfig.preserveEventQuery();
    document.getElementById("back-invitation-link").href = `./invitation.html${q}`;
    document.getElementById("back-custom-link").href = `./personnalisation.html${q}`;

    document.getElementById("cloud-status").textContent = CloudAPI.isEnabled()
        ? "☁️ Supabase actif"
        : "💾 Mode local (configurez Supabase)";

    document.getElementById("wa-template").value = GuestManager.getMessageTemplate();
    setupTabs();
    await refreshAll();

    document.getElementById("refresh-btn").addEventListener("click", async () => {
        await refreshAll();
        showToast("Données actualisées");
    });

    document.getElementById("logout-btn").addEventListener("click", () => AuthGuard.logout());

    document.getElementById("save-wa-template").addEventListener("click", () => {
        GuestManager.setMessageTemplate(document.getElementById("wa-template").value);
        showToast("Message enregistré");
    });

    document.getElementById("add-guest-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        await GuestManager.addGuest({
            fullName: document.getElementById("guest-name").value,
            phone: document.getElementById("guest-phone").value,
            group: document.getElementById("guest-group").value
        });
        e.target.reset();
        await refreshAll();
        showToast("Invité ajouté");
    });

    document.getElementById("import-csv-btn").addEventListener("click", () => {
        const file = document.getElementById("csv-file-input").files[0];
        if (!file) return showToast("Choisissez un CSV");
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const rows = GuestManager.parseCSV(reader.result);
                const result = await GuestManager.importCSVRows(rows);
                document.getElementById("import-result").textContent =
                    `${result.imported} importé(s), ${result.skipped} ignoré(s).`;
                await refreshAll();
                showToast("Import OK");
            } catch (err) {
                showToast(err.message);
            }
        };
        reader.readAsText(file);
    });

    document.getElementById("export-links-btn").addEventListener("click", async () => {
        downloadFile(await GuestManager.exportLinksCSV(), `liens-${eventId}.csv`);
    });
    document.getElementById("export-rsvp-btn").addEventListener("click", async () => {
        downloadFile(await GuestManager.exportRSVPReport(), `rsvp-${eventId}.csv`);
    });
    document.getElementById("export-json-btn").addEventListener("click", async () => {
        const data = {
            guests: await GuestManager.loadGuests(),
            rsvps: await CloudAPI.getRSVPs(eventId),
            analytics: await CloudAPI.getAnalytics(eventId)
        };
        downloadFile(JSON.stringify(data, null, 2), `export-${eventId}.json`, "application/json");
    });

    document.getElementById("guest-search").addEventListener("input", renderGuestsTable);
    document.getElementById("guest-filter").addEventListener("change", renderGuestsTable);
});
