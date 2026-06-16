const WeddingDB = (() => {
    function getEventKey() {
        if (window.EventConfig && EventConfig.isReady()) {
            return EventConfig.getEventId();
        }
        const params = new URLSearchParams(window.location.search);
        return params.get("event") || "yanick-keren";
    }

    function scopedKey(suffix) {
        return `wedding_event_${getEventKey()}_${suffix}`;
    }

    const KEY = () => scopedKey("app_db_v1");

    const defaults = {
        settings: {
            title: "Mariage de Josue et Divine",
            subtitle: "Josue et Divine",
            message: "Merci de célébrer ce moment précieux avec nous.",
            primaryColor: "#4caf50",
            accentColor: "#ec4899",
            heroImage: "../assets/images/hero.jpg",
            welcomeImage: "../assets/images/welcome.jpg",
            bestPhotos: [
                "../assets/images/photo-1.jpg",
                "../assets/images/photo-2.jpg",
                "../assets/images/photo-3.jpg",
                "../assets/images/photo-4.jpg"
            ]
        },
        rsvps: [],
        guestbook: []
    };

    function load() {
        try {
            const raw = localStorage.getItem(KEY());
            if (!raw) return structuredClone(defaults);
            return { ...structuredClone(defaults), ...JSON.parse(raw) };
        } catch {
            return structuredClone(defaults);
        }
    }

    function save(db) {
        localStorage.setItem(KEY(), JSON.stringify(db));
    }

    function getSettings() {
        return load().settings;
    }

    function updateSettings(next) {
        const db = load();
        db.settings = { ...db.settings, ...next };
        save(db);
        return db.settings;
    }

    function addRSVP(payload) {
        const db = load();
        db.rsvps.unshift({ ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
        save(db);
        return db.rsvps;
    }

    function addGuestbook(payload) {
        const db = load();
        db.guestbook.unshift({ ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
        save(db);
        return db.guestbook;
    }

    function getRSVPs() {
        return load().rsvps;
    }

    function getGuestbook() {
        return load().guestbook;
    }

    function exportAll() {
        return load();
    }

    return {
        getSettings,
        updateSettings,
        addRSVP,
        addGuestbook,
        getRSVPs,
        getGuestbook,
        exportAll
    };
})();
