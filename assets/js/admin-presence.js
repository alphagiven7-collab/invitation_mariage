/**
 * Onglet Présence jour J — admin
 */
const AdminPresence = (() => {
    let pollTimer = null;
    let checkInsCache = [];

    function getEventId() {
        return EventConfig.getEventId();
    }

    async function loadData() {
        await GuestManager.loadGuests(true);
        const guests = await GuestManager.loadGuests();
        checkInsCache = (window.CheckinAPI && CheckinAPI.listCheckIns)
            ? await CheckinAPI.listCheckIns(getEventId())
            : [];
        return { guests, checkIns: checkInsCache };
    }

    function tokenFromCheckIn(row) {
        return row.guest_token || row.guestToken || "";
    }

    function timeFromCheckIn(row) {
        const iso = row.scanned_at || row.scannedAt;
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleString("fr-FR", {
                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
            });
        } catch {
            return "—";
        }
    }

    function buildPresenceRows(guests, checkIns) {
        const byToken = new Map();
        (checkIns || []).forEach((c) => {
            const t = tokenFromCheckIn(c);
            if (t) byToken.set(t, c);
        });
        return guests.map((g) => {
            const ci = g.token ? byToken.get(g.token) : null;
            return {
                guest: g,
                checkedIn: !!ci || !!g.checkedInAt,
                scannedAt: ci ? timeFromCheckIn(ci) : (g.checkedInAt ? timeFromCheckIn({ scanned_at: g.checkedInAt }) : "—"),
                staff: ci?.scanned_by || ci?.scannedBy || "—"
            };
        });
    }

    async function renderStats(guests, checkIns) {
        const yes = guests.filter((g) => g.status === "yes");
        const entered = buildPresenceRows(guests, checkIns).filter((r) => r.checkedIn);
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        set("presence-stat-entered", entered.length);
        set("presence-stat-expected", yes.length);
        set("presence-stat-pending", Math.max(0, yes.length - entered.length));
        set("presence-stat-not-confirmed", guests.filter((g) => g.status !== "yes").length);
    }

    async function renderTable(filter = "") {
        const { guests, checkIns } = await loadData();
        await renderStats(guests, checkIns);
        const q = filter.toLowerCase().trim();
        let rows = buildPresenceRows(guests, checkIns);
        if (q) {
            rows = rows.filter((r) =>
                r.guest.fullName.toLowerCase().includes(q)
                || (r.guest.phone || "").includes(q)
                || (r.guest.group || "").toLowerCase().includes(q)
            );
        }
        rows.sort((a, b) => {
            if (a.checkedIn !== b.checkedIn) return a.checkedIn ? -1 : 1;
            return (a.guest.fullName || "").localeCompare(b.guest.fullName || "", "fr");
        });

        const tbody = document.getElementById("presence-table-body");
        const empty = document.getElementById("presence-empty");
        if (!tbody) return;
        tbody.innerHTML = "";
        if (!rows.length) {
            empty?.classList.remove("hidden");
            return;
        }
        empty?.classList.add("hidden");

        rows.forEach((row) => {
            const g = row.guest;
            const tr = document.createElement("tr");
            const statusHtml = row.checkedIn
                ? `<span class="admin-badge admin-badge-yes">Entré</span>`
                : g.status === "yes"
                    ? `<span class="admin-badge admin-badge-pending">Attendu</span>`
                    : `<span class="admin-badge admin-badge-no">Non confirmé</span>`;
            tr.innerHTML = `
                <td><strong>${escapeHtml(g.fullName)}</strong></td>
                <td>${statusHtml}</td>
                <td>${escapeHtml(row.scannedAt)}</td>
                <td>${escapeHtml(g.tableNumber || "—")}</td>
                <td>${g.adults || 0} / ${g.children || 0}</td>
                <td>${escapeHtml(row.staff)}</td>`;
            tbody.appendChild(tr);
        });
    }

    function escapeHtml(str) {
        return (str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function exportCsv() {
        loadData().then(({ guests, checkIns }) => {
            const rows = buildPresenceRows(guests, checkIns);
            const lines = ["Nom;Statut;Heure entrée;Table;Adultes;Enfants;Staff"];
            rows.forEach((r) => {
                const g = r.guest;
                let stat = "Non confirmé";
                if (r.checkedIn) stat = "Entré";
                else if (g.status === "yes") stat = "Attendu";
                lines.push([
                    g.fullName,
                    stat,
                    r.scannedAt,
                    g.tableNumber || "",
                    g.adults || 0,
                    g.children || 0,
                    r.staff
                ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
            });
            const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `presence-${getEventId()}-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
        });
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(() => {
            const panel = document.getElementById("tab-presence");
            if (panel && panel.classList.contains("active")) {
                renderTable(document.getElementById("presence-search")?.value || "");
            }
        }, 15000);
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    function init() {
        document.getElementById("presence-export-csv")?.addEventListener("click", exportCsv);
        document.getElementById("presence-refresh")?.addEventListener("click", () => {
            renderTable(document.getElementById("presence-search")?.value || "");
        });
        const search = document.getElementById("presence-search");
        if (search) {
            search.addEventListener("input", () => renderTable(search.value));
        }
        startPolling();
    }

    return { init, renderTable, stopPolling };
})();

window.AdminPresence = AdminPresence;
