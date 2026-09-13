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
let pendingWelcomeFile = null;
let pendingWelcomePreviewUrl = "";

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
    if (window.AdminPresence) await AdminPresence.renderTable();
    await renderAnalytics();
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
        el.textContent = "☁️ Supabase connecté";
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
    if (titleInput) setTimeout(() => titleInput.focus(), 80);
}

function closeCreateEventModal() {
    const modal = document.getElementById("create-event-modal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
}

function openEventCreatedModal(eventObj) {
    const modal = document.getElementById("event-created-modal");
    if (!modal) return;
    document.getElementById("event-created-name").textContent = eventObj.title;
    const invUrl = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "invitation.html")}?event=${eventObj.slug}`;
    document.getElementById("event-created-link-invitation").textContent = invUrl;
    document.getElementById("event-created-admin-code").textContent = eventObj.adminCode || "—";

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
        const fullName = document.getElementById("guest-name").value.trim();
        if (fullName.length < 2) {
            showToast("Nom obligatoire (2 caractères minimum).");
            return;
        }
        const result = await GuestManager.addGuest({
            fullName,
            phone: document.getElementById("guest-phone").value.trim(),
            email: document.getElementById("guest-email").value.trim(),
            group: document.getElementById("guest-group").value.trim()
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
        const id = document.getElementById("edit-guest-id").value;
        const result = await GuestManager.updateGuest(id, {
            fullName: document.getElementById("edit-guest-name").value.trim(),
            phone: document.getElementById("edit-guest-phone").value.trim(),
            email: document.getElementById("edit-guest-email").value.trim(),
            group: document.getElementById("edit-guest-group").value.trim(),
            status: document.getElementById("edit-guest-status").value,
            adults: Number(document.getElementById("edit-guest-adults").value) || 0,
            children: Number(document.getElementById("edit-guest-children").value) || 0,
            qrApproved: document.getElementById("edit-guest-qr-approved").checked,
            accessCode: document.getElementById("edit-guest-access-code").value.trim(),
            tableNumber: document.getElementById("edit-guest-table").value.trim(),
            profilePhotoUrl: document.getElementById("edit-guest-profile-photo").value.trim()
        });
        const updated = result?.guest || result;
        if (!updated) {
            showToast("Erreur : un autre invité porte déjà ce nom");
            return;
        }
        closeEditModal();
        await refreshAll();
        if (result && result.cloudSynced === false && CloudAPI.isEnabled()) {
            showToast("Modifications enregistrées localement (sync cloud en attente)");
            return;
        }
        showToast("Invité mis à jour");
    });

    document.getElementById("edit-cancel-btn").addEventListener("click", closeEditModal);

    document.getElementById("edit-envelope-png-btn")?.addEventListener("click", async () => {
        const id = document.getElementById("edit-guest-id").value;
        const guest = guestsCache.find((g) => g.id === id);
        if (!guest || !window.EnvelopeExport) return;
        const ok = await EnvelopeExport.downloadForGuest(guest);
        showToast(ok ? "Enveloppe + QR téléchargée" : "Export impossible");
    });
    document.getElementById("edit-modal-close-btn")?.addEventListener("click", closeEditModal);
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
    const newCode = document.getElementById("new-event-admin-code");
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
            if (!newCode.dataset.customized && val) {
                newCode.value = `${val.toUpperCase().slice(0, 10)}-2026`;
            }
        }
    });
    newSlug?.addEventListener("input", () => {
        newSlug.dataset.customized = "true";
    });
    newCode?.addEventListener("input", () => {
        newCode.dataset.customized = "true";
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
        const dateVal = document.getElementById("new-event-date")?.value;
        const venue = document.getElementById("new-event-venue")?.value.trim() || "Kinshasa";
        const adminCode = newCode.value.trim() || `${slug.toUpperCase()}-2026`;
        const welcomeImage = newWelcomeImage?.value.trim() || "";
        if (!welcomeImage && !pendingWelcomeFile) {
            showToast("Ajoutez une photo d'accueil pour cette invitation.");
            return;
        }

        let created = null;
        try {
            created = EventConfig.createEvent({
                title,
                slug,
                type,
                coupleLeft,
                coupleRight,
                eventDate: dateVal ? new Date(dateVal).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
                venue,
                adminCode,
                welcomeImage
            });

            const publication = await EventConfig.publishEvent(created);
            if (window.CloudAPI && CloudAPI.isEnabled() && !publication.cloud) {
                throw new Error("Publication Supabase impossible. L'invitation n'est pas prête à être partagée.");
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
            showToast(err.message || "Erreur création événement");
        }
    });
});
