/**
 * Indicateur de chargement sur boutons (RSVP, sauvegarde, porte d'entrée, etc.)
 */
const ButtonLoading = (() => {
    function setLoading(btn, loading, loadingText = "Chargement…") {
        if (!btn) return;
        if (loading) {
            if (!btn.dataset.btnOriginalHtml) {
                btn.dataset.btnOriginalHtml = btn.innerHTML;
            }
            btn.disabled = true;
            btn.setAttribute("aria-busy", "true");
            btn.classList.add("is-loading");
            btn.innerHTML =
                `<span class="btn-spinner" aria-hidden="true"></span><span>${loadingText}</span>`;
            return;
        }
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.classList.remove("is-loading");
        if (btn.dataset.btnOriginalHtml) {
            btn.innerHTML = btn.dataset.btnOriginalHtml;
        }
    }

    async function whileLoading(btn, promise, loadingText) {
        setLoading(btn, true, loadingText);
        try {
            return await promise;
        } finally {
            setLoading(btn, false);
        }
    }

    function resolveButton(ev, fallbackId) {
        if (ev && ev.currentTarget instanceof HTMLButtonElement) {
            return ev.currentTarget;
        }
        if (ev && ev.target && typeof ev.target.closest === "function") {
            const fromTarget = ev.target.closest("button.btn-with-loader, button.is-loading");
            if (fromTarget) return fromTarget;
        }
        if (fallbackId) {
            return document.getElementById(fallbackId);
        }
        return null;
    }

    function runWithLoader(ev, fallbackId, fn, loadingText = "Chargement…") {
        const btn = resolveButton(ev, fallbackId);
        if (!btn || !btn.classList.contains("btn-with-loader")) {
            return Promise.resolve(fn());
        }
        return whileLoading(btn, Promise.resolve().then(fn), loadingText);
    }

    function bindClick(btn, handler, loadingText = "Chargement…") {
        if (!btn || btn.dataset.loaderBound === "1") return;
        btn.dataset.loaderBound = "1";
        btn.addEventListener("click", (ev) => {
            if (btn.disabled || btn.classList.contains("is-loading")) {
                ev.preventDefault();
                return;
            }
            ev.preventDefault();
            whileLoading(btn, Promise.resolve().then(() => handler(ev)), loadingText);
        });
    }

    return { setLoading, whileLoading, resolveButton, runWithLoader, bindClick };
})();

window.ButtonLoading = ButtonLoading;
