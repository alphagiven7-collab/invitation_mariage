/**
 * Compression + upload Supabase Storage pour photos/audio personnalisation
 * (évite localStorage saturé et permet sync téléphone ↔ ordinateur)
 */
const MediaUpload = (() => {
    const MAX_EDGE = 1280;
    const JPEG_QUALITY = 0.82;
    const MAX_DATA_URL_BYTES = 400000;

    function cfg() {
        return window.SUPABASE_CONFIG || { enabled: false, url: "", anonKey: "" };
    }

    function canUpload() {
        const c = cfg();
        const session = window.AuthGuard && AuthGuard.getSession ? AuthGuard.getSession() : null;
        return !!(
            c.enabled && c.url && c.anonKey && window.CloudAPI && CloudAPI.isEnabled() &&
            session?.accessToken && session?.userId
        );
    }

    function isCloudConfigured() {
        const c = cfg();
        return !!(c.enabled && c.url && c.anonKey && window.CloudAPI && CloudAPI.isEnabled());
    }

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(",");
        const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
        const bin = atob(parts[1] || "");
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    function getBlobExtension(blob) {
        const type = (blob?.type || "").toLowerCase();
        if (type.includes("png")) return "png";
        if (type.includes("webp")) return "webp";
        if (type.includes("gif")) return "gif";
        if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
        if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
        if (type.includes("wav")) return "wav";
        if (type.includes("ogg")) return "ogg";
        if (type.includes("aac") || type.includes("m4a") || type.includes("mp4")) return "m4a";
        if (type.startsWith("audio/")) return "mp3";
        return "jpg";
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Image illisible"));
            };
            img.src = url;
        });
    }

    async function compressImageFile(file, maxEdge = MAX_EDGE) {
        if (!file || !file.type.startsWith("image/")) {
            throw new Error("Fichier image attendu");
        }
        const img = await loadImageFromFile(file);
        let { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const blob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
        });
        if (!blob) throw new Error("Compression impossible");
        return blob;
    }

    async function uploadBlob(eventId, blob, label = "asset") {
        if (!canUpload()) {
            throw new Error("Votre session administrateur a expiré. Reconnectez-vous avant d'importer un média.");
        }
        const ext = getBlobExtension(blob);
        const safe = String(label).replace(/[^a-z0-9_-]/gi, "-").slice(0, 40);
        const path = `${eventId}/${Date.now()}-${safe}.${ext}`;
        const c = cfg();
        const session = AuthGuard.getSession();
        const res = await fetch(`${c.url}/storage/v1/object/event-assets/${path}`, {
            method: "POST",
            headers: {
                apikey: c.anonKey,
                Authorization: `Bearer ${session.accessToken}`,
                "Content-Type": blob.type || (ext === "mp3" ? "audio/mpeg" : "image/jpeg"),
                "x-upsert": "true"
            },
            body: blob
        });
        if (!res.ok) {
            const details = await res.text().catch(() => "");
            console.warn("MediaUpload: échec upload", res.status, details);
            throw new Error(res.status === 401 || res.status === 403
                ? "Téléversement refusé. Vérifiez votre connexion et les politiques Supabase Storage."
                : "Le média n'a pas pu être envoyé à Supabase Storage.");
        }
        return `${c.url}/storage/v1/object/public/event-assets/${path}`;
    }

    async function processAudioFile(file, eventId, label = "audio") {
        if (!file) throw new Error("Fichier audio manquant");
        if (isCloudConfigured()) return uploadBlob(eventId, file, label);
        if (file.size > 3 * 1024 * 1024) {
            throw new Error("Fichier audio volumineux (> 3 Mo). Activez Supabase Storage pour les fichiers audio lourds ou privilégiez un lien MP3 direct / YouTube.");
        }
        const dataUrl = await blobToDataUrl(file);
        return dataUrl;
    }

    async function processFile(file, eventId, label) {
        if (!file) throw new Error("Fichier manquant");
        const isAudio = (file.type && file.type.startsWith("audio/")) || /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name || "");
        if (isAudio) {
            return processAudioFile(file, eventId, label);
        }
        const blob = await compressImageFile(file);
        if (canUpload()) return uploadBlob(eventId, blob, label);
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl.length > MAX_DATA_URL_BYTES * 4) {
            throw new Error("Image encore trop lourde après compression.");
        }
        return dataUrl;
    }

    async function externalizeValue(eventId, value, label) {
        if (!value || typeof value !== "string") return value;
        if (!value.startsWith("data:")) return value;
        if (!canUpload()) return value;
        try {
            const blob = dataUrlToBlob(value);
            const url = await uploadBlob(eventId, blob, label);
            return url || value;
        } catch {
            return value;
        }
    }

    async function externalizeDashboardMedia(payload, eventId) {
        if (!payload || !eventId) return payload;
        const out = { ...payload };
        const scalar = [
            "heroImage", "welcomeImage", "mapImage", "aboutImage",
            "shareImage", "guestbookCoverImage", "backgroundMusicUrl"
        ];
        for (const key of scalar) {
            if (out[key]) out[key] = await externalizeValue(eventId, out[key], key);
        }
        const arrays = [
            "bestPhotos", "bestGridImages", "bestMarqueeImages",
            "galleryPreviewImages", "galleryModalImages", "dressImages"
        ];
        for (const key of arrays) {
            if (!Array.isArray(out[key])) continue;
            out[key] = await Promise.all(
                out[key].map((v, i) => externalizeValue(eventId, v, `${key}-${i}`))
            );
        }
        return out;
    }

    return {
        compressImageFile,
        processFile,
        processAudioFile,
        uploadBlob,
        externalizeDashboardMedia,
        canUpload,
        dataUrlToBlob,
        blobToDataUrl
    };
})();

window.MediaUpload = MediaUpload;
