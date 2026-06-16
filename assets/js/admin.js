function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2400);
}

function statusBadge(status) {
    const map = {
        yes: '<span class="admin-badge admin-badge-yes">Confirmé</span>',
        no: '<span class="admin-badge admin-badge-no">Refus</span>',
        pending: '<span class="admin-badge admin-badge-pending">En attente</span>'
    };
    return map[status] || map.pending;
}

function escapeHtml(str) {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
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

let guestsCache = [];

function openEditModal(guest) {
    document.getElementById("edit-guest-id").value = guest.id;
    document.getElementById("edit-guest-name").value = guest.fullName || "";
    document.getElementById("edit-guest-phone").value = guest.phone || "";
    document.getElementById("edit-guest-email").value = guest.email || "";
    document.getElementById("edit-guest-group").value = guest.group || "";
    document.getElementById("edit-guest-status").value = guest.status || "pending";
    document.getElementById("edit-guest-adults").value = guest.adults ?? 1;
    document.getElementById("edit-guest-children").value = guest.children ?? 0;
    document.getElementById("edit-guest-qr-approved").checked = !!guest.qrApproved;
    document.getElementById("edit-modal-subtitle").textContent =
        `Lien actuel : ${GuestManager.buildInviteLink(guest).slice(0, 60)}…`;
    const modal = document.getElementById("edit-guest-modal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
}

function closeEditModal() {
    const modal = document.getElementById("edit-guest-modal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
}

async function renderStats() {
    if (GuestManager.loadGuests) await GuestManager.loadGuests(true);
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
    guestsCache = await GuestManager.loadGuests();
    return guestsCache.filter((g) => {
        const matchFilter = filter === "all" || g.status === filter;
        const matchSearch = !search
            || g.fullName.toLowerCase().includes(search)
            || (g.phone || "").includes(search)
            || (g.group || "").toLowerCase().includes(search);
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
            <td>
                <strong>${escapeHtml(guest.fullName)}</strong>
                ${guest.email ? `<br><span class="text-xs text-slate-400">${escapeHtml(guest.email)}</span>` : ""}
            </td>
            <td>${escapeHtml(guest.phone || "—")}</td>
            <td>${escapeHtml(guest.group || "—")}</td>
            <td>${statusBadge(guest.status)}${guest.qrApproved ? ' <span class="admin-badge admin-badge-yes" title="QR validé">QR ✓</span>' : ''}</td>
            <td>
                <div class="admin-actions">
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-icon" data-edit="${guest.id}" title="Modifier">✎</button>
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-icon" data-copy="${encodeURIComponent(link)}" title="Copier le lien">🔗</button>
                    ${guest.status === "yes" && !guest.qrApproved ? `<button type="button" class="admin-btn admin-btn-success admin-btn-icon" data-approve-qr="${guest.id}" title="Valider QR">QR</button>` : ""}
                    <a href="${waLink}" target="_blank" class="admin-btn admin-btn-ghost admin-btn-icon" title="WhatsApp">💬</a>
                    <button type="button" class="admin-btn admin-btn-danger admin-btn-icon" data-remove="${guest.id}" title="Supprimer">×</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const link = decodeURIComponent(btn.dataset.copy);
            try {
                await navigator.clipboard.writeText(link);
                showToast("Lien copié dans le presse-papiers");
            } catch {
                showToast(link);
            }
        });
    });

    tbody.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const guest = guestsCache.find((g) => g.id === btn.dataset.edit);
            if (guest) openEditModal(guest);
        });
    });

    tbody.querySelectorAll("[data-approve-qr]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const updated = await GuestManager.updateGuest(btn.dataset.approveQr, { qrApproved: true });
            if (updated) {
                showToast(`QR validé pour ${updated.fullName}`);
                await refreshAll();
            }
        });
    });

    tbody.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const guest = guestsCache.find((g) => g.id === btn.dataset.remove);
            const name = guest ? guest.fullName : "cet invité";
            if (!confirm(`Supprimer ${name} ? Cette action est irréversible.`)) return;
            const result = await GuestManager.removeGuest(btn.dataset.remove);
            await refreshAll();
            if (result.removed && result.cloudSynced) {
                showToast(`${name} supprimé(e) définitivement`);
            } else if (result.removed) {
                showToast(`${name} supprimé(e) — si l'invité revient, exécutez SUPABASE-FIX-DELETE.sql dans Supabase`);
            } else {
                showToast("Suppression impossible");
            }
        });
    });
}

async function renderRelances() {
    const pending = await GuestManager.getPendingGuests();
    const root = document.getElementById("relances-list");
    root.innerHTML = "";
    if (!pending.length) {
        root.innerHTML = '<div class="admin-empty"><div class="admin-empty-icon">🎉</div><p>Tous les invités ont répondu !</p></div>';
        return;
    }
    pending.forEach((guest) => {
        const wa = GuestManager.buildWhatsAppLink(guest);
        const div = document.createElement("div");
        div.className = "admin-relance-item";
        div.innerHTML = `
            <div>
                <strong>${escapeHtml(guest.fullName)}</strong>
                <span class="text-xs text-slate-500 block">${escapeHtml(guest.phone || "Pas de téléphone")}</span>
            </div>`;
        const a = document.createElement("a");
        a.href = wa;
        a.target = "_blank";
        a.className = "admin-btn admin-btn-success";
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
        `<div class="admin-stat total"><div class="admin-stat-value">${v}</div><div class="admin-stat-label">${k}</div></div>`
    ).join("") || '<div class="admin-empty"><p>Aucune donnée analytics.</p></div>';

    const list = document.getElementById("analytics-list");
    list.innerHTML = events.slice(0, 30).map((e) =>
        `<li>${new Date(e.created_at).toLocaleString("fr-FR")} — <strong>${escapeHtml(e.event_type)}</strong></li>`
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
        const st = r.status === "yes" ? statusBadge("yes") : r.status === "no" ? statusBadge("no") : statusBadge("pending");
        tr.innerHTML = `<td><strong>${escapeHtml(r.full_name || r.fullName)}</strong></td><td>${escapeHtml(r.phone || "—")}</td><td>${st}</td><td>${r.adults || 0}</td><td>${r.children || 0}</td><td>${r.created_at ? new Date(r.created_at).toLocaleString("fr-FR") : "—"}</td>`;
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

function updateCloudStatus() {
    const el = document.getElementById("cloud-status");
    if (CloudAPI.isEnabled()) {
        el.textContent = "☁️ Supabase connecté";
        el.className = "admin-cloud-pill online";
    } else {
        el.textContent = "💾 Mode local — configurez Supabase";
        el.className = "admin-cloud-pill offline";
    }
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

    updateCloudStatus();
    document.getElementById("wa-template").value = GuestManager.getMessageTemplate();
    setupTabs();
    await refreshAll();

    document.getElementById("refresh-btn").addEventListener("click", async () => {
        await GuestManager.loadGuests(true);
        await refreshAll();
        showToast("Données actualisées");
    });

    document.getElementById("logout-btn").addEventListener("click", () => AuthGuard.logout());

    document.getElementById("save-wa-template").addEventListener("click", () => {
        GuestManager.setMessageTemplate(document.getElementById("wa-template").value);
        showToast("Message WhatsApp enregistré");
    });

    document.getElementById("add-guest-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        await GuestManager.addGuest({
            fullName: document.getElementById("guest-name").value,
            phone: document.getElementById("guest-phone").value,
            email: document.getElementById("guest-email").value,
            group: document.getElementById("guest-group").value
        });
        e.target.reset();
        await refreshAll();
        showToast("Invité ajouté avec succès");
    });

    document.getElementById("edit-guest-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("edit-guest-id").value;
        const updated = await GuestManager.updateGuest(id, {
            fullName: document.getElementById("edit-guest-name").value.trim(),
            phone: document.getElementById("edit-guest-phone").value.trim(),
            email: document.getElementById("edit-guest-email").value.trim(),
            group: document.getElementById("edit-guest-group").value.trim(),
            status: document.getElementById("edit-guest-status").value,
            adults: Number(document.getElementById("edit-guest-adults").value) || 0,
            children: Number(document.getElementById("edit-guest-children").value) || 0,
            qrApproved: document.getElementById("edit-guest-qr-approved").checked
        });
        if (!updated) {
            showToast("Erreur : un autre invité porte déjà ce nom");
            return;
        }
        closeEditModal();
        await refreshAll();
        showToast("Invité mis à jour");
    });

    document.getElementById("edit-cancel-btn").addEventListener("click", closeEditModal);
    document.getElementById("edit-guest-modal").addEventListener("click", (e) => {
        if (e.target.id === "edit-guest-modal") closeEditModal();
    });

    document.getElementById("import-csv-btn").addEventListener("click", () => {
        const file = document.getElementById("csv-file-input").files[0];
        if (!file) return showToast("Choisissez un fichier CSV");
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const rows = GuestManager.parseCSV(reader.result);
                const result = await GuestManager.importCSVRows(rows);
                document.getElementById("import-result").textContent =
                    `${result.imported} importé(s), ${result.skipped} ignoré(s).`;
                await refreshAll();
                showToast("Import terminé");
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
