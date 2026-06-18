/**
 * Page staff check-in — scan QR + retour visuel
 */
(function () {
    let scanner = null;
    let busy = false;
    let deviceId = "";

    function getEventId() {
        const p = new URLSearchParams(window.location.search);
        return p.get("event") || (window.EventConfig && EventConfig.getEventId()) || "yanick-keren";
    }

    function vibrate(pattern) {
        if (navigator.vibrate) navigator.vibrate(pattern);
    }

    function beep(kind) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            if (kind === "success") {
                osc.frequency.value = 880;
                gain.gain.value = 0.08;
            } else if (kind === "duplicate") {
                osc.frequency.value = 440;
                gain.gain.value = 0.06;
            } else {
                osc.frequency.value = 220;
                gain.gain.value = 0.07;
            }
            osc.start();
            setTimeout(() => { osc.stop(); ctx.close(); }, kind === "success" ? 120 : 180);
        } catch {
            /* silent */
        }
    }

    function showResult(result, guest) {
        const box = document.getElementById("checkin-result");
        if (!box) return;
        box.className = "checkin-result checkin-result--show";
        const map = {
            success: "checkin-result--success",
            duplicate: "checkin-result--duplicate",
            invalid: "checkin-result--invalid",
            error: "checkin-result--error"
        };
        box.classList.add(map[result.status] || "checkin-result--error");

        const title = document.getElementById("checkin-result-title");
        const msg = document.getElementById("checkin-result-msg");
        const grid = document.getElementById("checkin-result-grid");

        if (title) {
            title.textContent = result.status === "success"
                ? guest?.fullName || "Invité"
                : result.status === "duplicate"
                    ? "Déjà scanné"
                    : "Accès refusé";
        }
        if (msg) msg.textContent = result.message;

        if (grid && guest && (result.status === "success" || result.status === "duplicate")) {
            const s = CheckinAPI.guestSummary(guest);
            grid.innerHTML = `
                <div><span>Table</span><strong>${s.table}</strong></div>
                <div><span>Personnes</span><strong>${s.adults} ad. · ${s.children} enf.</strong></div>
                <div style="grid-column:1/-1"><span>Boissons</span><strong>${s.drinks}</strong></div>
            `;
            grid.classList.remove("hidden");
        } else if (grid) {
            grid.innerHTML = "";
            grid.classList.add("hidden");
        }

        if (result.status === "success") {
            vibrate(80);
            beep("success");
        } else if (result.status === "duplicate") {
            vibrate([60, 40, 60]);
            beep("duplicate");
        } else {
            vibrate([100, 50, 100]);
            beep("error");
        }
    }

    async function handleToken(token) {
        if (busy || !token) return;
        busy = true;
        const eventId = getEventId();
        const staff = (document.getElementById("checkin-staff-name")?.value || "").trim();
        const result = await CheckinAPI.performCheckIn(eventId, token, {
            scannedBy: staff || null,
            deviceId: deviceId || null
        });
        showResult(result, result.guest);
        setTimeout(() => { busy = false; }, 1200);
    }

    async function onScan(decodedText) {
        const parsed = CheckinUrl.parseScannedValue(decodedText);
        if (!parsed || !parsed.token) return;
        await handleToken(parsed.token);
    }

    async function startScanner() {
        const el = document.getElementById("checkin-reader");
        if (!el || !window.Html5Qrcode) return;
        scanner = new Html5Qrcode("checkin-reader");
        try {
            await scanner.start(
                { facingMode: "environment" },
                { fps: 8, qrbox: { width: 220, height: 220 } },
                onScan,
                () => {}
            );
        } catch (e) {
            el.innerHTML = '<p style="padding:1rem;text-align:center;color:#94a3b8;font-size:0.75rem">Caméra indisponible — saisissez le token manuellement.</p>';
        }
    }

    function initDeviceId() {
        const key = "michelline_checkin_device";
        try {
            deviceId = localStorage.getItem(key) || "";
            if (!deviceId) {
                deviceId = "dev-" + Math.random().toString(36).slice(2, 10);
                localStorage.setItem(key, deviceId);
            }
        } catch {
            deviceId = "dev-anon";
        }
    }

    window.addEventListener("DOMContentLoaded", async () => {
        initDeviceId();
        await EventConfig.init();
        const eventId = getEventId();
        if (!AuthGuard.isEventAdmin(eventId)) {
            AuthGuard.requireAdmin(eventId);
            return;
        }

        document.getElementById("checkin-event-label").textContent = EventConfig.getConfig()?.title || eventId;

        document.getElementById("checkin-manual-btn")?.addEventListener("click", () => {
            const raw = document.getElementById("checkin-manual-token")?.value || "";
            const parsed = CheckinUrl.parseScannedValue(raw);
            if (parsed?.token) handleToken(parsed.token);
        });

        document.getElementById("checkin-manual-token")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") document.getElementById("checkin-manual-btn")?.click();
        });

        startScanner();
    });

    window.addEventListener("beforeunload", () => {
        if (scanner && scanner.stop) scanner.stop().catch(() => {});
    });
})();
