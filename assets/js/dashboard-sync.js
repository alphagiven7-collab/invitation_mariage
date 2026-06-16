/**
 * Sync personnalisation — localStorage + Supabase event_settings
 */
const DashboardSync = (() => {
    const LEGACY_KEY = "wedding_dashboard_state";
    const PREVIEW_PREFIX = "wedding_preview_";

    function scopedKey(eventId) {
        return `wedding_event_${eventId}_dashboard_state`;
    }

    function previewKey(eventId) {
        return `${PREVIEW_PREFIX}${eventId}`;
    }

    function stripMeta(obj) {
        if (!obj || typeof obj !== "object") return {};
        const out = { ...obj };
        delete out._savedAt;
        delete out._cloudUpdatedAt;
        return out;
    }

    function countRemoteMedia(state) {
        if (!state) return 0;
        let n = 0;
        const scalars = [
            "heroImage", "welcomeImage", "mapImage", "aboutImage",
            "shareImage", "guestbookCoverImage", "backgroundMusicUrl"
        ];
        scalars.forEach((key) => {
            const v = state[key];
            if (typeof v === "string" && /^https?:\/\//i.test(v)) n += 1;
        });
        const arrays = [
            "bestPhotos", "bestGridImages", "bestMarqueeImages",
            "galleryPreviewImages", "galleryModalImages", "dressImages"
        ];
        arrays.forEach((key) => {
            if (!Array.isArray(state[key])) return;
            n += state[key].filter((v) => typeof v === "string" && /^https?:\/\//i.test(v)).length;
        });
        return n;
    }

    function mergeStates(base, cloud, local, options = {}) {
        const foundation = { ...(base || {}) };
        const cloudData = cloud ? stripMeta(cloud) : null;
        const localData = local ? stripMeta(local) : null;

        if (!cloudData && !localData) return foundation;

        const cloudTime = cloud?._cloudUpdatedAt ? new Date(cloud._cloudUpdatedAt).getTime() : 0;
        const localTime = local?._savedAt ? new Date(local._savedAt).getTime() : 0;

        if (options.preferCloud && cloudData) {
            return {
                ...foundation,
                ...localData,
                ...cloudData,
                _cloudUpdatedAt: cloud._cloudUpdatedAt,
                _savedAt: local?._savedAt
            };
        }

        const cloudMedia = countRemoteMedia(cloudData);
        const localMedia = countRemoteMedia(localData);
        if (cloudData && cloudMedia > localMedia) {
            return {
                ...foundation,
                ...localData,
                ...cloudData,
                _cloudUpdatedAt: cloud._cloudUpdatedAt,
                _savedAt: local?._savedAt
            };
        }

        if (cloudData && cloudTime > localTime + 5000) {
            return {
                ...foundation,
                ...localData,
                ...cloudData,
                _cloudUpdatedAt: cloud._cloudUpdatedAt,
                _savedAt: local?._savedAt
            };
        }

        if (localData && (!cloudData || localTime >= cloudTime)) {
            return {
                ...foundation,
                ...cloudData,
                ...localData,
                _savedAt: local._savedAt,
                _cloudUpdatedAt: cloud?._cloudUpdatedAt
            };
        }
        if (cloudData) {
            return {
                ...foundation,
                ...cloudData,
                _cloudUpdatedAt: cloud._cloudUpdatedAt,
                _savedAt: local?._savedAt
            };
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

    function readPreview(eventId) {
        try {
            const raw = sessionStorage.getItem(previewKey(eventId));
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

    function writePreview(eventId, payload) {
        try {
            sessionStorage.setItem(previewKey(eventId), JSON.stringify(payload));
            return true;
        } catch (e) {
            return false;
        }
    }

    async function load(eventId, baseDefaults = {}, options = {}) {
        const preferLocal = options.preferLocal === true;
        const preferCloud = options.preferCloud === true;

        let cloud = null;
        if (window.CloudAPI && CloudAPI.isEnabled() && !preferLocal) {
            cloud = await CloudAPI.getEventSettings(eventId);
        }

        const local = readLocal(eventId);

        if (preferLocal) {
            const preview = readPreview(eventId);
            if (preview) {
                return { ...(baseDefaults || {}), ...stripMeta(preview), _savedAt: preview._savedAt };
            }
            if (local) {
                return { ...(baseDefaults || {}), ...stripMeta(local), _savedAt: local._savedAt };
            }
        }

        return mergeStates(baseDefaults, cloud, local, { preferCloud: preferCloud || !preferLocal });
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
        previewKey,
        mergeStates,
        readLocal,
        readPreview,
        writeLocal,
        writePreview,
        load,
        save,
        stripMeta,
        syncIdentityFromConfig,
        countRemoteMedia
    };
})();

window.DashboardSync = DashboardSync;
