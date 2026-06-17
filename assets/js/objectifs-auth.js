/**
 * Accès privé — page objectifs (code côté client, static site)
 */
(function () {
    const CODE = "MICHELLINE-PLAN-30J";
    const SESSION_KEY = "michelline_objectifs_ok";
    const CHECKLIST_KEY = "michelline_objectifs_checks";

    function normalizeCode(value) {
        return String(value || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "")
            .replace(/_/g, "-");
    }

    const CODE_NORM = normalizeCode(CODE);

    function isUnlocked() {
        try {
            return sessionStorage.getItem(SESSION_KEY) === "1";
        } catch {
            return false;
        }
    }

    function unlock() {
        try {
            sessionStorage.setItem(SESSION_KEY, "1");
        } catch {
            /* mode privé strict — session per onglet seulement via body class */
        }
    }

    function lock() {
        try {
            sessionStorage.removeItem(SESSION_KEY);
        } catch {
            /* ignore */
        }
        document.body.classList.remove("objectifs-unlocked");
    }

    function showMain() {
        const gate = document.getElementById("objectifs-gate");
        const main = document.getElementById("objectifs-main");
        if (!gate || !main) return;

        document.body.classList.add("objectifs-unlocked");
        gate.hidden = true;
        gate.setAttribute("aria-hidden", "true");
        main.hidden = false;
        main.removeAttribute("aria-hidden");
        restoreChecklist();
    }

    function showGate() {
        const gate = document.getElementById("objectifs-gate");
        const main = document.getElementById("objectifs-main");
        const input = document.getElementById("objectifs-code");
        const errorEl = document.getElementById("objectifs-gate-error");
        if (!gate || !main) return;

        document.body.classList.remove("objectifs-unlocked");
        gate.hidden = false;
        gate.removeAttribute("aria-hidden");
        main.hidden = true;
        main.setAttribute("aria-hidden", "true");
        if (input) input.value = "";
        if (errorEl) errorEl.hidden = true;
    }

    function showError(message) {
        const errorEl = document.getElementById("objectifs-gate-error");
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.hidden = false;
    }

    function tryUnlock() {
        const input = document.getElementById("objectifs-code");
        if (!input) return;

        const val = normalizeCode(input.value);
        const alt = val.replace(/-/g, "");

        if (val === CODE_NORM || alt === CODE_NORM.replace(/-/g, "")) {
            unlock();
            showMain();
            return;
        }

        showError("Code incorrect — utilisez : MICHELLINE-PLAN-30J");
    }

    function saveChecklist() {
        const states = [];
        document.querySelectorAll(".objectifs-checklist input[type=checkbox]").forEach((cb) => {
            states.push(cb.checked ? "1" : "0");
        });
        try {
            localStorage.setItem(CHECKLIST_KEY, states.join(""));
        } catch {
            /* ignore */
        }
    }

    function restoreChecklist() {
        let raw = "";
        try {
            raw = localStorage.getItem(CHECKLIST_KEY) || "";
        } catch {
            return;
        }
        if (!raw) return;
        document.querySelectorAll(".objectifs-checklist input[type=checkbox]").forEach((cb, i) => {
            cb.checked = raw[i] === "1";
        });
    }

    function bindChecklist() {
        document.querySelectorAll(".objectifs-checklist input[type=checkbox]").forEach((cb) => {
            cb.addEventListener("change", saveChecklist);
        });
    }

    function init() {
        const form = document.getElementById("objectifs-gate-form");
        const unlockBtn = document.getElementById("objectifs-unlock");
        const input = document.getElementById("objectifs-code");
        const logout = document.getElementById("objectifs-logout");

        if (isUnlocked()) {
            showMain();
        } else {
            showGate();
        }

        if (form) {
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                tryUnlock();
            });
        }

        if (unlockBtn && !form) {
            unlockBtn.addEventListener("click", (e) => {
                e.preventDefault();
                tryUnlock();
            });
        }

        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    tryUnlock();
                }
            });
        }

        if (logout) {
            logout.addEventListener("click", () => {
                lock();
                showGate();
            });
        }

        bindChecklist();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.addEventListener("pageshow", (e) => {
        if (e.persisted && isUnlocked()) showMain();
    });
})();
