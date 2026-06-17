/**
 * Accès privé — page objectifs (code côté client, static site)
 */
(function () {
    const CODE = "MICHELLINE-PLAN-30J";
    const SESSION_KEY = "michelline_objectifs_ok";
    const CHECKLIST_KEY = "michelline_objectifs_checks";

    function isUnlocked() {
        return sessionStorage.getItem(SESSION_KEY) === "1";
    }

    function unlock() {
        sessionStorage.setItem(SESSION_KEY, "1");
    }

    function lock() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    function showMain() {
        document.getElementById("objectifs-gate").hidden = true;
        document.getElementById("objectifs-main").hidden = false;
        restoreChecklist();
    }

    function showGate() {
        document.getElementById("objectifs-gate").hidden = false;
        document.getElementById("objectifs-main").hidden = true;
        document.getElementById("objectifs-code").value = "";
        document.getElementById("objectifs-gate-error").hidden = true;
    }

    function saveChecklist() {
        const states = [];
        document.querySelectorAll(".objectifs-checklist input[type=checkbox]").forEach((cb) => {
            states.push(cb.checked ? "1" : "0");
        });
        localStorage.setItem(CHECKLIST_KEY, states.join(""));
    }

    function restoreChecklist() {
        const raw = localStorage.getItem(CHECKLIST_KEY);
        if (!raw) return;
        document.querySelectorAll(".objectifs-checklist input[type=checkbox]").forEach((cb, i) => {
            cb.checked = raw[i] === "1";
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (isUnlocked()) showMain();

        document.getElementById("objectifs-unlock").addEventListener("click", () => {
            const val = document.getElementById("objectifs-code").value.trim();
            if (val === CODE) {
                unlock();
                showMain();
            } else {
                document.getElementById("objectifs-gate-error").hidden = false;
            }
        });

        document.getElementById("objectifs-code").addEventListener("keydown", (e) => {
            if (e.key === "Enter") document.getElementById("objectifs-unlock").click();
        });

        document.getElementById("objectifs-logout").addEventListener("click", () => {
            lock();
            showGate();
        });

        document.querySelectorAll(".objectifs-checklist input[type=checkbox]").forEach((cb) => {
            cb.addEventListener("change", saveChecklist);
        });
    });
})();
