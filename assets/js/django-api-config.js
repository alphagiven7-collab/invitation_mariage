/**
 * API Django — auto-active en local (localhost / 127.0.0.1)
 * Sur GitHub Pages : repli JSON + Supabase (enabled effectif = false)
 */
(function () {
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    window.DJANGO_API_CONFIG = {
        enabled: isLocal,
        baseUrl: "http://127.0.0.1:8000/api",
        legacyAssetBase: "https://alphagiven7-collab.github.io/invitation_mariage/"
    };
})();
