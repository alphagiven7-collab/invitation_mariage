/**
 * Indicateur de chargement sur boutons (RSVP, sauvegarde, etc.)
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

    return { setLoading, whileLoading };
})();

window.ButtonLoading = ButtonLoading;
