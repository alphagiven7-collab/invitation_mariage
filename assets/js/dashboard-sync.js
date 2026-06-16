/**
 * Sync personnalisation — localStorage + Supabase event_settings
 */
const DashboardSync = (() => {
    const LEGACY_KEY = "wedding_dashboard_state";

    function scopedKey(eventId) {
        return `wedding_event_${eventId}_dashboard_state`;
    }

    function stripMeta(obj) {
        if (!obj || typeof obj !== "object") return {};
        const out = { ...obj };
        delete out._savedAt;
        delete out._cloudUpdatedAt;
        return out;
    }

    function mergeStates(base, cloud, local) {
        const foundation = { ...(base || {}) };

        const cloudData = cloud ? stripMeta(cloud) : null;
        const localData = local ? stripMeta(local) : null;

        if (!cloudData && !localData) return foundation;

        const cloudTime = cloud?._cloudUpdatedAt ? new Date(cloud._cloudUpdatedAt).getTime() : 0;
        const localTime = local?._savedAt ? new Date(local._savedAt).getTime() : 0;

        if (localData && (!cloudData || localTime >= cloudTime)) {
            return { ...foundation, ...cloudData, ...localData, _savedAt: local._savedAt, _cloudUpdatedAt: cloud?._cloudUpdatedAt };
        }
        if (cloudData) {
            return { ...foundation, ...cloudData, _cloudUpdatedAt: cloud._cloudUpdatedAt, _savedAt: local?._savedAt };
        }
        return { ...foundation, ...localData, _savedAt: local._savedAt };
    }

    function readLocal(eventId) {
        try {
            const raw = localStorage.getItem(scopedKey(eventId)) || localStorage.getItem(LEGACY_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function writeLocal(eventId, payload) {
        const json = JSON.stringify(payload);
        localStorage.setItem(scopedKey(eventId), json);
        localStorage.setItem(LEGACY_KEY, json);
    }

    async function load(eventId, baseDefaults = {}) {
        let cloud = null;
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            cloud = await CloudAPI.getEventSettings(eventId);
        }
        const local = readLocal(eventId);
        return mergeStates(baseDefaults, cloud, local);
    }

    async function save(eventId, payload) {
        const enriched = {
            ...stripMeta(payload),
            _savedAt: new Date().toISOString()
        };
        writeLocal(eventId, enriched);

        let cloudResult = { cloud: false };
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            cloudResult = await CloudAPI.saveEventSettings(eventId, enriched);
        }
        return { saved: true, ...cloudResult };
    }

    return {
        LEGACY_KEY,
        scopedKey,
        mergeStates,
        readLocal,
        writeLocal,
        load,
        save,
        stripMeta
    };
})();

window.DashboardSync = DashboardSync;
