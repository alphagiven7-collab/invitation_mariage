/**
 * Centre de commande — init auth + copie codes
 */
(function () {
    function initAuth() {
        MichellinePrivateAuth.init({
            gateId: "centre-gate",
            mainId: "centre-main",
            formId: "centre-gate-form",
            inputId: "centre-code",
            errorId: "centre-gate-error",
            logoutId: "centre-logout",
            unlockedClass: "centre-unlocked",
        });
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return Promise.resolve();
    }

    function bindCopyButtons() {
        document.querySelectorAll("[data-copy-code]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const code = btn.getAttribute("data-copy-code");
                if (!code) return;
                copyText(code).then(() => {
                    const prev = btn.textContent;
                    btn.textContent = "Copié ✓";
                    setTimeout(() => { btn.textContent = prev; }, 1500);
                });
            });
        });
    }

    function init() {
        initAuth();
        bindCopyButtons();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
