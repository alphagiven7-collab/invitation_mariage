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

function guestTableLabel(guest) {
    const number = String(guest?.tableNumber || "").trim();
    const name = String(guest?.group || guest?.tableName || "").trim();
    if (number && name) return `${number} · ${name}`;
    return number || name || "—";
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
let selectedGuestIds = new Set();
let pendingWelcomeFile = null;
let pendingWelcomePreviewUrl = "";
let pendingCsvCorrections = [];

function importSummary(preview) {
    return `${preview.total} ligne(s) de données (hors en-tête, retours à la ligne dans les cellules regroupés), ` +
        `${preview.valid.length} invité(s) valide(s) à importer, ${preview.duplicates.length} doublon(s), ` +
        `${preview.rejected.length} ligne(s) ignorée(s).`;
}

function importOutcome(result) {
    return `${result.imported} importé(s), ${result.skipped} ignoré(s), ${result.failed || 0} échec(s).` +
        (result.errors || []).map((entry) => ` Ligne ${entry.line || "?"} (${entry.fullName}) : ${entry.reason}`).join(" ") +
        (result.warning ? ` ${result.warning}` : "");
}

function showImportPreview(preview) {
    const result = document.getElementById("import-result");
    result.textContent = importSummary(preview);
    const details = document.createElement("ul");
    for (const entry of [...preview.rejected, ...preview.duplicates]) {
        const item = document.createElement("li");
        item.textContent = `Ligne ${entry.line} : ${entry.fullName || ""} — ${entry.reason}`;
        details.appendChild(item);
    }
    result.appendChild(details);
}

function reviewImport(preview) {
    showImportPreview(preview);
    const modal = document.getElementById("import-preview-modal");
    document.getElementById("import-preview-details").textContent = importSummary(preview) + "\n\n" +
        [...preview.rejected, ...preview.duplicates].map((entry) =>
            `Ligne ${entry.line} : ${entry.fullName || ""} — ${entry.reason}`).join("\n");
    const apply = document.getElementById("import-preview-apply");
    const cancel = document.getElementById("import-preview-cancel");
    apply.disabled = !preview.valid.length;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    cancel.focus();
    return new Promise((resolve) => {
        const finish = (value) => {
            modal.classList.remove("open");
            modal.setAttribute("aria-hidden", "true");
            apply.onclick = cancel.onclick = null;
            modal.onkeydown = null;
            document.getElementById("import-csv-btn").focus();
            resolve(value);
        };
        apply.onclick = () => finish(true);
        cancel.onclick = () => finish(false);
        modal.onkeydown = (event) => { if (event.key === "Escape") finish(false); };
    });
}

function closeCsvCorrectionsModal() {
    const modal = document.getElementById("csv-corrections-modal");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
}

function showCsvCorrections(preview) {
    pendingCsvCorrections = preview.matches;
    document.getElementById("csv-corrections-summary").textContent =
        `${preview.matches.length} correction(s) proposée(s) parmi ${preview.eligible} invité(s) non confirmés sans table. ${preview.unmatched.length} nom(s) restent sans correspondance.`;
    const list = document.getElementById("csv-corrections-list");
    list.replaceChildren();
    preview.matches.forEach((match, index) => {
        const label = document.createElement("label");
        label.className = "csv-correction-item";
        const confidence = Math.round(match.score * 100);
        label.innerHTML = `<input type="checkbox" data-correction-index="${index}" ${confidence >= 82 ? "checked" : ""}>
            <span><strong>${escapeHtml(match.currentName)}</strong> devient <strong>${escapeHtml(match.importedName)}</strong><br>
            <small>Table ${escapeHtml(match.tableNumber)}${match.tableName ? ` · ${escapeHtml(match.tableName)}` : ""} · correspondance ${confidence}%</small></span>`;
        list.appendChild(label);
    });
    if (!preview.matches.length) list.textContent = "Aucune correspondance suffisamment fiable n'a été trouvée. Aucun invité ne sera modifié.";
    const modal = document.getElementById("csv-corrections-modal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
}

function openEditModal(guest) {
    document.getElementById("edit-guest-id").value = guest.id;
    document.getElementById("edit-guest-name").value = guest.fullName || "";
    document.getElementById("edit-guest-phone").value = guest.phone || "";
    document.getElementById("edit-guest-email").value = guest.email || "";
    document.getElementById("edit-guest-table").value = guest.tableNumber || "";
    document.getElementById("edit-guest-status").value = guest.status || "pending";
    document.getElementById("edit-guest-adults").value = guest.adults ?? 1;
    document.getElementById("edit-guest-children").value = guest.children ?? 0;
    document.getElementById("edit-guest-qr-approved").checked = !!guest.qrApproved;
    document.getElementById("edit-guest-access-code").value = guest.accessCode || "";
    document.getElementById("edit-guest-table").value = guest.tableNumber || "";
    document.getElementById("edit-guest-profile-photo").value = guest.profilePhotoUrl || "";
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
    ["stat-total", "stat-yes", "stat-no", "stat-pending", "stat-adults", "stat-children"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = "…";
    });
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
            || (g.tableNumber || "").toLowerCase().includes(search);
        return matchFilter && matchSearch;
    }).sort((left, right) => {
        if (left.status === "yes" && right.status !== "yes") return -1;
        if (right.status === "yes" && left.status !== "yes") return 1;
        return String(left.fullName || "").localeCompare(String(right.fullName || ""), "fr");
    });
}

async function renderGuestsTable() {
    const guests = await getFilteredGuests();
    const tbody = document.getElementById("guests-table-body");
    const empty = document.getElementById("guests-empty");
    tbody.innerHTML = "";
    const visibleIds = new Set(guests.map((guest) => guest.id));
    selectedGuestIds = new Set([...selectedGuestIds].filter((id) => visibleIds.has(id)));

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
            <td data-label="Sélection"><input type="checkbox" class="guest-select" data-select-guest="${guest.id}" ${selectedGuestIds.has(guest.id) ? "checked" : ""} aria-label="Sélectionner ${escapeHtml(guest.fullName)}"></td>
            <td data-label="Invité">
                <strong>${escapeHtml(guest.fullName)}</strong>
                ${/^couple\s+/i.test(String(guest.fullName || "").trim())
                    ? '<span class="admin-badge admin-badge-couple">Couple</span>'
                    : `<button type="button" class="admin-btn admin-btn-ghost admin-btn-couple" data-couple="${guest.id}" title="Marquer ${escapeHtml(guest.fullName)} comme couple" aria-label="Marquer ${escapeHtml(guest.fullName)} comme couple">👫 Couple</button>`}
                ${guest.email ? `<br><span class="text-xs text-slate-400">${escapeHtml(guest.email)}</span>` : ""}
            </td>
            <td data-label="Contact">${escapeHtml(guest.phone || "—")}</td>
            <td data-label="Table">${escapeHtml(guestTableLabel(guest))}</td>
            <td data-label="Statut">${statusBadge(guest.status)}${guest.qrApproved ? ' <span class="admin-badge admin-badge-yes" title="QR validé">QR ✓</span>' : ''}</td>
            <td data-label="Actions">
                <div class="admin-actions">
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-icon" data-envelope="${guest.id}" title="Enveloppe + QR PNG">📥</button>
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-icon" data-edit="${guest.id}" title="Modifier">✎</button>
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-icon" data-copy="${encodeURIComponent(link)}" title="Copier le lien">🔗</button>
                    ${guest.status === "yes" && !guest.qrApproved ? `<button type="button" class="admin-btn admin-btn-success admin-btn-icon" data-approve-qr="${guest.id}" title="Valider QR">QR</button>` : ""}
                    <a href="${waLink}" target="_blank" class="admin-btn admin-btn-ghost admin-btn-icon" title="WhatsApp">💬</a>
                    <button type="button" class="admin-btn admin-btn-danger admin-btn-icon" data-remove="${guest.id}" title="Supprimer">×</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    const selectAll = document.getElementById("select-all-guests");
    const deleteSelected = document.getElementById("delete-selected-guests-btn");
    if (selectAll) {
        selectAll.checked = guests.length > 0 && guests.every((guest) => selectedGuestIds.has(guest.id));
        selectAll.indeterminate = selectedGuestIds.size > 0 && !selectAll.checked;
        selectAll.onchange = () => {
            guests.forEach((guest) => {
                if (selectAll.checked) selectedGuestIds.add(guest.id);
                else selectedGuestIds.delete(guest.id);
            });
            renderGuestsTable();
        };
    }
    if (deleteSelected) deleteSelected.disabled = selectedGuestIds.size === 0;
    tbody.querySelectorAll("[data-select-guest]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedGuestIds.add(checkbox.dataset.selectGuest);
            else selectedGuestIds.delete(checkbox.dataset.selectGuest);
            renderGuestsTable();
        });
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

    tbody.querySelectorAll("[data-couple]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const guest = guestsCache.find((item) => item.id === btn.dataset.couple);
            if (!guest) return;
            btn.disabled = true;
            try {
                const result = await GuestManager.markGuestAsCouple(guest.id);
                if (result?.guest) {
                    showToast(`${result.guest.fullName} enregistré comme couple.`);
                    await refreshAll();
                } else if (result?.duplicate) {
                    showToast("Un autre invité porte déjà ce nom de couple.");
                } else {
                    showToast("Impossible de marquer cet invité comme couple.");
                }
            } catch (error) {
                showToast(error.message || "Impossible de marquer cet invité comme couple.");
            } finally {
                btn.disabled = false;
            }
        });
    });

    tbody.querySelectorAll("[data-envelope]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const guest = guestsCache.find((g) => g.id === btn.dataset.envelope);
            if (!guest || !window.EnvelopeExport) return;
            const ok = await EnvelopeExport.downloadForGuest(guest);
            showToast(ok ? `PNG généré — ${guest.fullName}` : "Export impossible");
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

async function renderAdminGuestbook() {
    const list = document.getElementById("admin-guestbook-list");
    const empty = document.getElementById("admin-guestbook-empty");
    if (!list || !empty) return;
    const messages = await CloudAPI.getGuestbookMessages(EventConfig.getEventId());
    list.replaceChildren();
    empty.classList.toggle("hidden", messages.length > 0);
    messages.forEach((message) => {
        const item = document.createElement("article");
        item.className = "admin-guestbook-item";
        const details = document.createElement("div");
        const author = document.createElement("strong");
        author.textContent = message.author_name || message.authorName || "Invité";
        const date = document.createElement("small");
        date.textContent = message.created_at ? new Date(message.created_at).toLocaleString("fr-FR") : "";
        const content = document.createElement("p");
        content.textContent = message.message || "";
        details.append(author, date, content);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "admin-btn admin-btn-danger";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", async () => {
            if (!confirm("Supprimer ce message du livre d'or ?")) return;
            remove.disabled = true;
            const deleted = await CloudAPI.deleteGuestbookMessage(EventConfig.getEventId(), message.id);
            if (!deleted) {
                remove.disabled = false;
                showToast("Suppression impossible. Vérifiez votre connexion organisateur.");
                return;
            }
            await renderAdminGuestbook();
            showToast("Message supprimé.");
        });
        item.append(details, remove);
        list.appendChild(item);
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
    const guestsById = new Map((await GuestManager.loadGuests()).map((guest) => [guest.id, guest]));
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
        const guest = guestsById.get(r.guest_id || r.guestId);
        const st = r.status === "yes" ? statusBadge("yes") : r.status === "no" ? statusBadge("no") : statusBadge("pending");
        const message = String(r.message || "").trim();
        tr.innerHTML = `<td><strong>${escapeHtml(guest?.fullName || r.full_name || r.fullName)}</strong></td><td>${escapeHtml(r.phone || guest?.phone || "—")}</td><td>${st}</td><td>${r.adults || 0}</td><td>${r.children || 0}</td><td data-label="Message" title="${escapeHtml(message)}">${escapeHtml(message || "—")}</td><td>${r.created_at ? new Date(r.created_at).toLocaleString("fr-FR") : "—"}</td>`;
        tbody.appendChild(tr);
    });
}

async function refreshAll() {
    try {
        const results = await Promise.allSettled([
            renderStats(),
            renderGuestsTable(),
            renderRelances(),
            renderRSVPList(),
            renderAdminGuestbook(),
            window.AdminPresence ? AdminPresence.renderTable() : Promise.resolve(),
            renderAnalytics()
        ]);
        const failure = results.find((result) => result.status === "rejected");
        if (failure) throw failure.reason;
    } catch (error) {
        const status = document.getElementById("cloud-status");
        if (status) {
            status.textContent = `⚠️ Synchronisation indisponible · ${EventConfig.getEventId()}`;
            status.className = "admin-cloud-pill offline";
        }
        showToast(error.message || "Synchronisation cloud indisponible.");
    }
}

function setupTabs() {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
            if (tab.dataset.tab === "presence" && window.AdminPresence) {
                AdminPresence.renderTable(document.getElementById("presence-search")?.value || "");
            }
        });
    });
}

function updateCloudStatus() {
    const el = document.getElementById("cloud-status");
    if (CloudAPI.isEnabled()) {
        el.textContent = `☁️ Supabase · ${EventConfig.getEventId()}`;
        el.className = "admin-cloud-pill online";
    } else {
        el.textContent = "💾 Mode local — configurez Supabase";
        el.className = "admin-cloud-pill offline";
    }
}

function populateEventSwitcher(currentEventId) {
    const switcher = document.getElementById("admin-event-switcher");
    if (!switcher || !window.EventConfig || !EventConfig.getRegisteredEvents) return;
    const platformAdmin = window.AuthGuard && AuthGuard.isPlatformAdmin();
    const events = platformAdmin
        ? EventConfig.getRegisteredEvents()
        : EventConfig.getRegisteredEvents().filter((event) => event.slug === currentEventId);
    switcher.innerHTML = "";
    events.forEach((ev) => {
        const opt = document.createElement("option");
        opt.value = ev.slug;
        opt.textContent = `${ev.type === "birthday" ? "🎂" : ev.type === "conference" ? "🎤" : "💍"} ${ev.title || ev.slug}`;
        if (ev.slug === currentEventId) opt.selected = true;
        switcher.appendChild(opt);
    });

    switcher.disabled = !platformAdmin;
    switcher.onchange = () => {
        const target = switcher.value;
        if (target && target !== currentEventId) {
            window.location.href = `./admin.html?event=${encodeURIComponent(target)}`;
        }
    };
}

function openCreateEventModal() {
    const modal = document.getElementById("create-event-modal");
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    const titleInput = document.getElementById("new-event-title");
    const ownerInput = document.getElementById("new-event-owner-email");
    const session = window.AuthGuard?.getSession?.();
    if (ownerInput && !ownerInput.value && session?.email) ownerInput.value = session.email;
    if (titleInput) setTimeout(() => titleInput.focus(), 80);
}

function closeCreateEventModal() {
    const modal = document.getElementById("create-event-modal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
}

function openEventCreatedModal(eventObj) {
    try {
        sessionStorage.setItem("wedding_recently_created_event", JSON.stringify(eventObj));
    } catch {}
    const modal = document.getElementById("event-created-modal");
    if (!modal) return;
    document.getElementById("event-created-name").textContent = eventObj.title;
    const invUrl = new URL("invitation.html", window.location.href);
    invUrl.searchParams.set("event", eventObj.slug);
    document.getElementById("event-created-link-invitation").textContent = invUrl.toString();
    document.getElementById("event-created-owner-email").textContent = eventObj.ownerEmail || "—";

    document.getElementById("event-created-action-perso").href = `./personnalisation.html?event=${eventObj.slug}`;
    document.getElementById("event-created-action-admin").href = `./admin.html?event=${eventObj.slug}`;
    document.getElementById("event-created-action-view").href = `./invitation.html?event=${eventObj.slug}`;

    document.getElementById("event-created-download-json").onclick = () => {
        downloadFile(JSON.stringify(eventObj, null, 2), `${eventObj.slug}.json`, "application/json");
    };

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
}

function closeEventCreatedModal() {
    const modal = document.getElementById("event-created-modal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
}

window.addEventListener("DOMContentLoaded", async () => {
    const requestedEvent = new URLSearchParams(window.location.search).get("event");
    const session = window.AuthGuard?.getSession?.();
    if (!requestedEvent && session?.role === "event" && session.eventId) {
        window.location.replace(`./admin.html?event=${encodeURIComponent(session.eventId)}`);
        return;
    }
    await EventConfig.init();
    const eventId = EventConfig.getEventId();
    if (!AuthGuard.requireAdmin(eventId)) return;
    const platformAdmin = AuthGuard.isPlatformAdmin();
    document.getElementById("all-events-link")?.classList.toggle("hidden", !platformAdmin);
    document.getElementById("create-event-open-btn")?.classList.toggle("hidden", !platformAdmin);

    const config = EventConfig.getConfig();
    if (config && config.title) {
        document.getElementById("admin-event-title").textContent = `Invités — ${config.title}`;
    }

    populateEventSwitcher(eventId);

    const q = EventConfig.preserveEventQuery();
    document.getElementById("back-invitation-link").href = `./invitation.html${q}`;
    document.getElementById("back-custom-link").href = `./personnalisation.html${q}`;
    const checkinHref = `./checkin.html${q}`;
    document.getElementById("checkin-link").href = checkinHref;
    const pcl = document.getElementById("presence-checkin-link");
    if (pcl) pcl.href = checkinHref;

    updateCloudStatus();
    document.getElementById("wa-template").value = GuestManager.getMessageTemplate();
    setupTabs();
    if (window.AdminPresence) AdminPresence.init();
    await refreshAll();

    document.getElementById("refresh-btn").addEventListener("click", async () => {
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
        const fullName = document.getElementById("guest-name").value.trim();
        if (fullName.length < 2) {
            showToast("Nom obligatoire (2 caractères minimum).");
            return;
        }
        let profilePhotoUrl = "";
        const photoFile = document.getElementById("guest-profile-photo").files[0];
        if (photoFile) {
            try {
                profilePhotoUrl = await MediaUpload.processFile(photoFile, eventId, "guest-profile");
            } catch (error) {
                showToast(error.message || "Photo impossible à ajouter.");
                return;
            }
        }
        const result = await GuestManager.addGuest({
            fullName,
            phone: document.getElementById("guest-phone").value.trim(),
            email: document.getElementById("guest-email").value.trim(),
            tableNumber: document.getElementById("guest-table").value.trim(),
            profilePhotoUrl
        });
        e.target.reset();
        await GuestManager.loadGuests(true);
        await refreshAll();
        if (!result || !result.guest) {
            showToast("Impossible d'ajouter cet invité.");
            return;
        }
        if (result.duplicate) {
            showToast(`Invité déjà présent : ${result.guest.fullName}`);
            return;
        }
        if (!result.cloudSynced && CloudAPI.isEnabled()) {
            showToast(`Invité ajouté localement : ${result.guest.fullName} (cloud en attente)`);
            return;
        }
        showToast(`Invité ajouté : ${result.guest.fullName}`);
    });

    document.getElementById("edit-guest-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const saveButton = document.getElementById("edit-guest-save-btn");
        const initialLabel = saveButton?.textContent || "Enregistrer";
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Enregistrement…";
        }
        const id = document.getElementById("edit-guest-id").value;
        try {
            const result = await GuestManager.updateGuest(id, {
                fullName: document.getElementById("edit-guest-name").value.trim(),
                phone: document.getElementById("edit-guest-phone").value.trim(),
                email: document.getElementById("edit-guest-email").value.trim(),
                status: document.getElementById("edit-guest-status").value,
                adults: Number(document.getElementById("edit-guest-adults").value) || 0,
                children: Number(document.getElementById("edit-guest-children").value) || 0,
                qrApproved: document.getElementById("edit-guest-qr-approved").checked,
                accessCode: document.getElementById("edit-guest-access-code").value.trim(),
                tableNumber: document.getElementById("edit-guest-table").value.trim(),
                profilePhotoUrl: document.getElementById("edit-guest-profile-photo").value.trim()
            });
            const updated = result?.guest || null;
            if (!updated) {
                showToast(result?.error || "Modification non enregistrée. Vérifiez votre connexion Supabase.");
                return;
            }
            guestsCache = guestsCache.map((guest) => guest.id === updated.id ? updated : guest);
            await renderGuestsTable();
            closeEditModal();
            showToast(`Modification enregistrée : ${updated.fullName}`);
            await refreshAll();
        } catch (error) {
            showToast(error.message || "Modification impossible.");
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = initialLabel;
            }
        }
    });

    document.getElementById("edit-cancel-btn").addEventListener("click", closeEditModal);

    document.getElementById("edit-invitation-pdf-btn")?.addEventListener("click", () => {
        const id = document.getElementById("edit-guest-id").value;
        const guest = guestsCache.find((g) => g.id === id);
        if (!guest?.token) {
            showToast("Lien personnel indisponible pour cet invité.");
            return;
        }
        const link = new URL(GuestManager.buildInviteLink(guest));
        link.searchParams.set("print", "1");
        window.open(link.toString(), "_blank", "noopener");
    });
    document.getElementById("edit-modal-close-btn")?.addEventListener("click", closeEditModal);
    document.getElementById("edit-guest-modal").addEventListener("click", (e) => {
        if (e.target.id === "edit-guest-modal") closeEditModal();
    });

    document.getElementById("import-csv-btn").addEventListener("click", () => {
        const file = document.getElementById("csv-file-input").files[0];
        if (!file) return showToast("Choisissez un fichier CSV");
        const importButton = document.getElementById("import-csv-btn");
        const progress = document.getElementById("csv-import-progress");
        const progressBar = document.getElementById("csv-import-progress-bar");
        const progressPercent = document.getElementById("csv-import-progress-percent");
        const progressLabel = document.getElementById("csv-import-progress-label");
        const updateProgress = ({ completed, total, percent }) => {
            progressBar.style.width = `${percent}%`;
            progressPercent.textContent = `${percent} %`;
            progressLabel.textContent = total ? `${completed} invité(s) traité(s) sur ${total}` : "Aucun nouvel invité à importer.";
        };
        progress?.classList.remove("hidden");
        updateProgress({ completed: 0, total: 0, percent: 0 });
        importButton.disabled = true;
        importButton.textContent = "Importation…";
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const rows = GuestManager.parseCSV(GuestManager.decodeCSV(reader.result));
                const preview = await GuestManager.previewImport(rows);
                if (!await reviewImport(preview)) return;
                const result = await GuestManager.importCSVRows(rows, { onProgress: updateProgress });
                document.getElementById("import-result").textContent = importOutcome(result);
                try { await refreshAll(); }
                catch (error) { showToast(`Import traité ; actualisation impossible : ${error.message}`); return; }
                showToast(result.failed ? "Import partiel : vérifiez les échecs de synchronisation." : "Import terminé");
            } catch (err) {
                document.getElementById("import-result").textContent = err.message;
                showToast(err.message);
            } finally {
                progress?.classList.add("hidden");
                importButton.disabled = false;
                importButton.textContent = "Importer";
            }
        };
        reader.onerror = () => {
            progress?.classList.add("hidden");
            importButton.disabled = false;
            importButton.textContent = "Importer";
            document.getElementById("import-result").textContent = "Lecture du fichier CSV impossible.";
            showToast("Lecture du fichier CSV impossible.");
        };
        reader.readAsArrayBuffer(file);
    });

    document.getElementById("preview-csv-corrections-btn")?.addEventListener("click", () => {
        const file = document.getElementById("csv-file-input").files[0];
        if (!file) return showToast("Choisissez le CSV corrigé.");
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const rows = GuestManager.parseCSV(GuestManager.decodeCSV(reader.result));
                const guests = await GuestManager.loadGuests(true);
                const retained = guests.filter((guest) => guest.status === "yes" && String(guest.phone || "").replace(/\D/g, "").length >= 9);
                const preview = await GuestManager.previewImport(rows, retained);
                if (!await reviewImport(preview)) return;
                const replaceable = guests.filter((guest) =>
                    !(guest.status === "yes" && String(guest.phone || "").replace(/\D/g, "").length >= 9)
                ).length;
                if (!confirm(
                    `${replaceable} invité(s) seront supprimés puis remplacés par ${rows.length} invité(s) du CSV. ` +
                    "Seuls les invités confirmés avec un numéro de téléphone valide seront conservés. Continuer ?"
                )) return;
                const button = document.getElementById("preview-csv-corrections-btn");
                button.disabled = true;
                button.textContent = "Remplacement en cours…";
                const result = await GuestManager.replaceGuestsExceptConfirmedWithPhone(rows);
                document.getElementById("import-result").textContent =
                    `${result.removed} ancien(s) invité(s) retiré(s). ${importOutcome(result)}`;
                await refreshAll();
                showToast(result.failed ? "Remplacement partiel : consultez les erreurs d'importation." : "Liste remplacée; confirmations avec téléphone conservées.");
                button.disabled = false;
                button.textContent = "Remplacer toute la liste sauf les confirmations";
            } catch (error) {
                const button = document.getElementById("preview-csv-corrections-btn");
                button.disabled = false;
                button.textContent = "Remplacer toute la liste sauf les confirmations";
                showToast(error.message || "Remplacement impossible.");
            }
        };
        reader.onerror = () => showToast("Lecture du fichier CSV impossible.");
        reader.readAsArrayBuffer(file);
    });

    const duplicatesModal = document.getElementById("duplicates-modal");
    const closeDuplicates = () => {
        duplicatesModal.classList.remove("open");
        duplicatesModal.setAttribute("aria-hidden", "true");
        document.getElementById("detect-duplicates-btn").focus();
    };
    document.getElementById("duplicates-cancel").addEventListener("click", closeDuplicates);
    duplicatesModal.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDuplicates(); });
    document.getElementById("detect-duplicates-btn").addEventListener("click", async () => {
        try {
            const groups = await GuestManager.findDuplicateGuests();
            const list = document.getElementById("duplicates-list");
            list.replaceChildren();
            document.getElementById("duplicates-summary").textContent = groups.length ?
                `${groups.length} groupe(s) à examiner. Un nom ne peut apparaître qu'une fois. Les fiches sans téléphone sont sélectionnées quand une fiche du même nom possède un numéro ; vérifiez les autres fiches avant suppression.` :
                "Aucun nom en double détecté.";
            groups.forEach((group) => {
                const section = document.createElement("fieldset");
                const legend = document.createElement("legend");
                legend.textContent = group[0].fullName;
                section.appendChild(legend);
                group.forEach((guest, index) => {
                    const label = document.createElement("label");
                    label.className = "csv-correction-item";
                    const input = document.createElement("input");
                    input.type = "checkbox";
                    input.dataset.duplicateId = guest.id;
                    input.checked = !String(guest.phone || "").trim() && group.some((item) => String(item.phone || "").trim());
                    const description = document.createElement("span");
                    description.textContent = `${guest.fullName} · ${guest.phone || "Sans téléphone"} · ${guest.email || "Sans email"} · Table ${guestTableLabel(guest)} · ${guest.status} · ${guest.createdAt || ""}${index === 0 ? " · Conservation suggérée" : ""}`;
                    label.append(input, description);
                    section.appendChild(label);
                });
                list.appendChild(section);
            });
            duplicatesModal.classList.add("open");
            duplicatesModal.setAttribute("aria-hidden", "false");
            document.getElementById("duplicates-cancel").focus();
        } catch (error) { showToast(error.message); }
    });
    document.getElementById("duplicates-delete").addEventListener("click", async (event) => {
        const ids = [...duplicatesModal.querySelectorAll("[data-duplicate-id]:checked")].map((input) => input.dataset.duplicateId);
        if (!ids.length) return showToast("Sélectionnez les fiches à supprimer.");
        if (!confirm(`Supprimer définitivement ${ids.length} fiche(s) sélectionnée(s) et leurs réponses associées ?`)) return;
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const result = await GuestManager.removeDuplicateGuests(ids, { confirmed: true });
            document.getElementById("duplicates-summary").textContent = `${result.removed} fiche(s) supprimée(s).` +
                (result.cloudSynced ? "" : " Certaines suppressions ont échoué. Vérifiez vos droits et la migration SUPABASE-RSVP-INTEGRITY.sql, puis relancez la détection.");
            document.getElementById("duplicates-list").replaceChildren();
            await refreshAll();
        } catch (error) { document.getElementById("duplicates-summary").textContent = error.message; }
        finally { button.disabled = false; }
    });
    document.getElementById("csv-corrections-apply-btn")?.addEventListener("click", async () => {
        const selected = [...document.querySelectorAll("[data-correction-index]:checked")]
            .map((input) => pendingCsvCorrections[Number(input.dataset.correctionIndex)]);
        if (!selected.length) return showToast("Sélectionnez au moins une correction.");
        const button = document.getElementById("csv-corrections-apply-btn");
        button.disabled = true;
        button.textContent = "Application…";
        const result = await GuestManager.applyCsvCorrections(selected);
        button.disabled = false;
        button.textContent = "Appliquer les corrections sélectionnées";
        closeCsvCorrectionsModal();
        await refreshAll();
        showToast(`${result.updated} invité(s) corrigé(s)${result.cloudSynced ? "" : " localement; synchronisation cloud à réessayer"}`);
    });
    document.getElementById("csv-corrections-close-btn")?.addEventListener("click", closeCsvCorrectionsModal);
    document.getElementById("csv-corrections-cancel-btn")?.addEventListener("click", closeCsvCorrectionsModal);
    document.getElementById("csv-corrections-modal")?.addEventListener("click", (event) => {
        if (event.target.id === "csv-corrections-modal") closeCsvCorrectionsModal();
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
    document.getElementById("delete-selected-guests-btn").addEventListener("click", async () => {
        const ids = [...selectedGuestIds];
        if (!ids.length) return;
        if (!confirm(`Supprimer ${ids.length} invité(s) ? Cette action est irréversible.`)) return;
        const button = document.getElementById("delete-selected-guests-btn");
        button.disabled = true;
        button.textContent = "Suppression en cours…";
        const result = await GuestManager.removeGuests(ids);
        selectedGuestIds.clear();
        await refreshAll();
        button.textContent = "Supprimer la sélection";
        showToast(`${result.removed} invité(s) supprimé(s)${result.cloudSynced ? "" : " localement; synchronisation cloud à réessayer"}`);
    });

    // Modal Créer un événement
    document.getElementById("create-event-open-btn")?.addEventListener("click", openCreateEventModal);
    document.getElementById("create-event-close-btn")?.addEventListener("click", closeCreateEventModal);
    document.getElementById("create-event-cancel-btn")?.addEventListener("click", closeCreateEventModal);
    document.getElementById("create-event-modal")?.addEventListener("click", (e) => {
        if (e.target.id === "create-event-modal") closeCreateEventModal();
    });

    document.getElementById("event-created-close-btn")?.addEventListener("click", closeEventCreatedModal);
    document.getElementById("event-created-modal")?.addEventListener("click", (e) => {
        if (e.target.id === "event-created-modal") closeEventCreatedModal();
    });

    // Auto slugify
    const newTitle = document.getElementById("new-event-title");
    const newSlug = document.getElementById("new-event-slug");
    const newOwnerEmail = document.getElementById("new-event-owner-email");
    const newWelcomeImage = document.getElementById("new-event-welcome-image");
    const newWelcomeUpload = document.getElementById("new-event-welcome-upload");
    const newWelcomePreview = document.getElementById("new-event-welcome-preview");
    newTitle?.addEventListener("input", () => {
        if (!newSlug.dataset.customized) {
            const val = newTitle.value
                .toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
            newSlug.value = val;
        }
    });
    newSlug?.addEventListener("input", () => {
        newSlug.dataset.customized = "true";
    });
    newWelcomeImage?.addEventListener("input", () => {
        const src = newWelcomeImage.value.trim();
        if (!src || !newWelcomePreview) return;
        newWelcomePreview.src = src;
        newWelcomePreview.classList.remove("hidden");
    });
    newWelcomeUpload?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (pendingWelcomePreviewUrl) {
            URL.revokeObjectURL(pendingWelcomePreviewUrl);
        }
        pendingWelcomeFile = file;
        pendingWelcomePreviewUrl = URL.createObjectURL(file);
        newWelcomeImage.value = "";
        if (newWelcomePreview) {
            newWelcomePreview.src = pendingWelcomePreviewUrl;
            newWelcomePreview.classList.remove("hidden");
        }
        showToast("Photo prête : elle sera envoyée après la création de l'invitation.");
        e.target.value = "";
    });

    document.getElementById("create-event-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitButton = document.getElementById("create-event-submit-btn");
        const errorBox = document.getElementById("create-event-error");
        if (submitButton?.disabled) return;
        if (errorBox) {
            errorBox.hidden = true;
            errorBox.textContent = "";
        }
        const form = e.currentTarget;
        if (!AuthGuard.isPlatformAdmin()) {
            showToast("Seul l'administrateur plateforme peut créer un événement.");
            return;
        }
        const title = newTitle.value.trim();
        const slug = newSlug.value.trim();
        if (!title || !slug) {
            showToast("Titre et Slug obligatoires.");
            return;
        }
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
            showToast("Le slug utilise seulement lettres, chiffres et tirets.");
            return;
        }
        const coupleLeft = document.getElementById("new-event-couple-left")?.value.trim() || "";
        const coupleRight = document.getElementById("new-event-couple-right")?.value.trim() || "";
        const type = document.getElementById("new-event-type")?.value || "wedding";
        const isOpenRsvp = type === "open-rsvp";
        const maleContact = document.getElementById("new-event-contact-male")?.value.trim() || "";
        const femaleContact = document.getElementById("new-event-contact-female")?.value.trim() || "";
        if (isOpenRsvp && (!maleContact || !femaleContact)) {
            showToast("Ajoutez les contacts WhatsApp Homme et Femme.");
            return;
        }
        const dateVal = document.getElementById("new-event-date")?.value;
        const venue = document.getElementById("new-event-venue")?.value.trim() || "Kinshasa";
        const ownerEmail = newOwnerEmail?.value.trim().toLowerCase() || "";
        if (!ownerEmail) {
            showToast("L'e-mail du compte client est requis.");
            return;
        }
        const welcomeImage = newWelcomeImage?.value.trim() || "";

        let created = null;
        let published = false;
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Création en cours…";
        }
        try {
            created = EventConfig.createEvent({
                title,
                slug,
                type,
                coupleLeft,
                coupleRight,
                eventDate: dateVal ? new Date(dateVal).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
                venue,
                ownerEmail,
                welcomeImage,
                rsvpMode: isOpenRsvp ? "open" : "personal",
                confirmationContacts: { male: maleContact, female: femaleContact }
            });

            const publication = await EventConfig.publishEvent(created);
            if (window.CloudAPI && CloudAPI.isEnabled() && !publication.cloud) {
                throw new Error("Publication Supabase impossible. L'invitation n'est pas prête à être partagée.");
            }
            published = !!publication.cloud;

            if (window.CloudAPI && CloudAPI.isEnabled() && typeof CloudAPI.saveEventSettings === "function") {
                const savedSettings = await CloudAPI.saveEventSettings(created.id, created);
                if (!savedSettings.cloud) {
                    throw new Error("L'invitation a été créée, mais sa configuration n'a pas été enregistrée dans Supabase.");
                }
            }

            if (pendingWelcomeFile) {
                const uploadedWelcomeImage = await MediaUpload.processFile(
                    pendingWelcomeFile,
                    created.id,
                    "welcome-image"
                );
                created.branding = { ...created.branding, welcomeImage: uploadedWelcomeImage };
                const savedImage = await CloudAPI.saveEventSettings(created.id, {
                    ...created,
                    welcomeImage: uploadedWelcomeImage
                });
                if (!savedImage.cloud) {
                    throw new Error("Invitation créée, mais l'image d'accueil n'a pas été sauvegardée. Ouvrez Personnaliser et réessayez l'import.");
                }
            }

            pendingWelcomeFile = null;
            if (pendingWelcomePreviewUrl) URL.revokeObjectURL(pendingWelcomePreviewUrl);
            pendingWelcomePreviewUrl = "";
            closeCreateEventModal();
            populateEventSwitcher(eventId);
            openEventCreatedModal(created);
            showToast(`Événement ${title} créé avec succès !`);
        } catch (err) {
            if (created && published) {
                closeCreateEventModal();
                openEventCreatedModal(created);
                showToast("Invitation créée. La photo n'a pas été enregistrée : ouvrez Personnaliser pour réessayer.");
                return;
            }
            const message = err.message || "Erreur création événement";
            if (errorBox) {
                errorBox.textContent = message;
                errorBox.hidden = false;
            }
            showToast(message);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Créer l'invitation →";
            }
        }
    });

    document.getElementById("new-event-type")?.addEventListener("change", (event) => {
        const settings = document.getElementById("new-event-open-rsvp-settings");
        settings?.classList.toggle("hidden", event.target.value !== "open-rsvp");
    });
});
