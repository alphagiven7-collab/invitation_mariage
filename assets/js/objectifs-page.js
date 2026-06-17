/**
 * Checklist page objectifs — sauvegarde locale
 */
(function () {
    const CHECKLIST_KEY = "michelline_objectifs_checks";

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

    function initAuth() {
        MichellinePrivateAuth.init({
            gateId: "objectifs-gate",
            mainId: "objectifs-main",
            formId: "objectifs-gate-form",
            inputId: "objectifs-code",
            errorId: "objectifs-gate-error",
            logoutId: "objectifs-logout",
            unlockedClass: "objectifs-unlocked",
            onUnlock: restoreChecklist,
        });
        bindChecklist();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAuth);
    } else {
        initAuth();
    }
})();
