/**
 * Auth privée Michelline — partagée (centre, objectifs, …)
 */
(function (global) {
    const VALID_CODES = ["MICHELLINE-HQ-2026", "MICHELLINE-PLAN-30J"];
    const SESSION_KEY = "michelline_private_ok";

    function normalizeCode(value) {
        return String(value || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "")
            .replace(/_/g, "-");
    }

    const VALID_NORM = VALID_CODES.map(normalizeCode);

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
            /* ignore */
        }
    }

    function lock() {
        try {
            sessionStorage.removeItem(SESSION_KEY);
        } catch {
            /* ignore */
        }
    }

    function codeIsValid(raw) {
        const val = normalizeCode(raw);
        const alt = val.replace(/-/g, "");
        return VALID_NORM.some((code) => val === code || alt === code.replace(/-/g, ""));
    }

    /**
     * @param {object} opts
     * @param {string} opts.gateId
     * @param {string} opts.mainId
     * @param {string} [opts.formId]
     * @param {string} [opts.inputId]
     * @param {string} [opts.errorId]
     * @param {string} [opts.logoutId]
     * @param {string} [opts.unlockedClass='michelline-private-unlocked']
     * @param {function} [opts.onUnlock]
     */
    function init(opts) {
        const unlockedClass = opts.unlockedClass || "michelline-private-unlocked";
        const gate = document.getElementById(opts.gateId);
        const main = document.getElementById(opts.mainId);
        const form = opts.formId ? document.getElementById(opts.formId) : null;
        const input = opts.inputId ? document.getElementById(opts.inputId) : null;
        const errorEl = opts.errorId ? document.getElementById(opts.errorId) : null;
        const logout = opts.logoutId ? document.getElementById(opts.logoutId) : null;

        function showError(msg) {
            if (!errorEl) return;
            errorEl.textContent = msg;
            errorEl.hidden = false;
        }

        function showMain() {
            if (!gate || !main) return;
            document.body.classList.add(unlockedClass);
            gate.hidden = true;
            gate.setAttribute("aria-hidden", "true");
            main.hidden = false;
            main.removeAttribute("aria-hidden");
            if (typeof opts.onUnlock === "function") opts.onUnlock();
        }

        function showGate() {
            if (!gate || !main) return;
            document.body.classList.remove(unlockedClass);
            gate.hidden = false;
            gate.removeAttribute("aria-hidden");
            main.hidden = true;
            main.setAttribute("aria-hidden", "true");
            if (input) input.value = "";
            if (errorEl) errorEl.hidden = true;
        }

        function tryUnlock() {
            if (!input) return;
            if (codeIsValid(input.value)) {
                unlock();
                showMain();
                if (errorEl) errorEl.hidden = true;
            } else {
                showError("Code incorrect — MICHELLINE-HQ-2026");
            }
        }

        if (isUnlocked()) showMain();
        else showGate();

        if (form) {
            form.addEventListener("submit", (e) => {
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

        global.addEventListener("pageshow", (e) => {
            if (e.persisted && isUnlocked()) showMain();
        });
    }

    global.MichellinePrivateAuth = {
        VALID_CODES,
        SESSION_KEY,
        isUnlocked,
        unlock,
        lock,
        codeIsValid,
        init,
    };
})(window);
