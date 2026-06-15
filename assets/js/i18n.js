/**
 * Multilingue FR / EN (Étape 8)
 */
const I18n = (() => {
    const LANG_KEY = "wedding_lang";
    const strings = {
        fr: {
            openInvitation: "Ouvrir mon invitation",
            confirmPresence: "Confirmer ma présence",
            guestbook: "Ouvrir le livre d'or",
            welcomeBack: "Quel bonheur de vous revoir,",
            enterName: "Veuillez saisir votre nom pour découvrir votre invitation personnelle.",
            rsvpSent: "RSVP envoyé. Merci pour votre réponse.",
            rsvpConfirmed: "RSVP envoyé. Merci, votre présence est confirmée !"
        },
        en: {
            openInvitation: "Open my invitation",
            confirmPresence: "Confirm my attendance",
            guestbook: "Open guestbook",
            welcomeBack: "So happy to see you again,",
            enterName: "Please enter your name to discover your personal invitation.",
            rsvpSent: "RSVP sent. Thank you for your response.",
            rsvpConfirmed: "RSVP sent. Thank you, your attendance is confirmed!"
        }
    };

    function getLang() {
        const params = new URLSearchParams(window.location.search);
        return params.get("lang") || localStorage.getItem(LANG_KEY) || "fr";
    }

    function setLang(lang) {
        localStorage.setItem(LANG_KEY, lang);
        apply(lang);
    }

    function t(key) {
        const lang = getLang();
        return (strings[lang] && strings[lang][key]) || strings.fr[key] || key;
    }

    function apply(lang) {
        const map = {
            "gate-open-btn-label": "openInvitation",
            "confirm-presence-label": "confirmPresence",
            "guestbook-open-label": "guestbook"
        };
        Object.entries(map).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = t(key);
        });
        const langToggle = document.getElementById("lang-toggle-btn");
        if (langToggle) langToggle.textContent = lang === "fr" ? "EN" : "FR";
    }

    function toggle() {
        setLang(getLang() === "fr" ? "en" : "fr");
    }

    return { getLang, setLang, t, apply, toggle };
})();

window.I18n = I18n;
