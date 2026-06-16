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
        try {
            const json = JSON.stringify(payload);
            localStorage.setItem(scopedKey(eventId), json);
            localStorage.setItem(LEGACY_KEY, json);
            return true;
        } catch (e) {
            console.warn("DashboardSync: localStorage plein ou inaccessible", e);
            return false;
        }
    }

    async function load(eventId, baseDefaults = {}, options = {}) {
        const preferLocal = options.preferLocal === true;
        let cloud = null;
        if (window.CloudAPI && CloudAPI.isEnabled() && !preferLocal) {
            cloud = await CloudAPI.getEventSettings(eventId);
        }
        const local = readLocal(eventId);
        if (preferLocal && local) {
            return { ...(baseDefaults || {}), ...stripMeta(local), _savedAt: local._savedAt };
        }
        return mergeStates(baseDefaults, cloud, local);
    }

    async function save(eventId, payload) {
        let prepared = { ...(payload || {}) };
        if (window.MediaUpload && MediaUpload.externalizeDashboardMedia) {
            try {
                prepared = await MediaUpload.externalizeDashboardMedia(prepared, eventId);
            } catch (e) {
                console.warn("DashboardSync: upload médias", e);
            }
        }

        const enriched = {
            ...stripMeta(prepared),
            _savedAt: new Date().toISOString()
        };
        const localOk = writeLocal(eventId, enriched);

        let cloudResult = { cloud: false };
        if (window.CloudAPI && CloudAPI.isEnabled()) {
            cloudResult = await CloudAPI.saveEventSettings(eventId, enriched);
            if (cloudResult.cloud && localOk) {
                writeLocal(eventId, { ...enriched, _cloudUpdatedAt: cloudResult.updatedAt });
            }
        }
        return { saved: localOk || cloudResult.cloud, localOk, ...cloudResult };
    }

    /** Remplace Yanick/Keren (cache local ou cloud) par l'identité du JSON événement. */
    function syncIdentityFromConfig(state, cfg) {
        if (!cfg) return { state: state || {}, changed: false };

        const next = state ? { ...state } : {};
        let changed = false;
        const rev = cfg.identityRevision || 1;
        const stateRev = next._identityRevision || 0;
        const identityBlob = [next.title, next.subtitle, next.coupleLeft, next.coupleRight].join(" ");
        const hasLegacy = /yanick|keren/i.test(identityBlob);

        if (hasLegacy || stateRev < rev) {
            if (cfg.title && next.title !== cfg.title) {
                next.title = cfg.title;
                changed = true;
            }
            if (cfg.subtitle && next.subtitle !== cfg.subtitle) {
                next.subtitle = cfg.subtitle;
                changed = true;
            }
            if (cfg.coupleLeft && next.coupleLeft !== cfg.coupleLeft) {
                next.coupleLeft = cfg.coupleLeft;
                changed = true;
            }
            if (cfg.coupleRight && next.coupleRight !== cfg.coupleRight) {
                next.coupleRight = cfg.coupleRight;
                changed = true;
            }
            if (next._identityRevision !== rev) {
                next._identityRevision = rev;
                changed = true;
            }
        }

        if ((!next.coupleLeft || !next.coupleRight) && next.subtitle) {
            const m = next.subtitle.match(/^(.+?)\s+(?:et|&|\+)\s+(.+)$/i);
            if (m) {
                if (!next.coupleLeft) {
                    next.coupleLeft = m[1].trim();
                    changed = true;
                }
                if (!next.coupleRight) {
                    next.coupleRight = m[2].trim();
                    changed = true;
                }
            }
        }

        return { state: next, changed };
    }

    return {
        LEGACY_KEY,
        scopedKey,
        mergeStates,
        readLocal,
        writeLocal,
        load,
        save,
        stripMeta,
        syncIdentityFromConfig
    };
})();

window.DashboardSync = DashboardSync;
