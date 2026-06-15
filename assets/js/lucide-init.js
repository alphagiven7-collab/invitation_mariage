/** Initialise Lucide une seule fois — évite l'erreur removeChild */
window.initLucideIconsOnce = function initLucideIconsOnce() {
    if (window.__lucideIconsDone) return;
    const pending = document.querySelectorAll("i[data-lucide]");
    if (!pending.length) {
        window.__lucideIconsDone = true;
        return;
    }
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        try {
            window.lucide.createIcons();
        } catch (e) {
            console.warn("Lucide:", e.message);
        }
    }
    window.__lucideIconsDone = true;
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", window.initLucideIconsOnce);
} else {
    window.initLucideIconsOnce();
}
