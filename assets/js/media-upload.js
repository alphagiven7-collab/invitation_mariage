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
        return c.enabled && c.url && c.anonKey && window.CloudAPI && CloudAPI.isEnabled();
    }

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(",");
        const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
        const bin = atob(parts[1] || "");
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
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
        if (!canUpload()) return null;
        const ext = (blob.type || "image/jpeg").includes("png") ? "png" : "jpg";
        const safe = String(label).replace(/[^a-z0-9_-]/gi, "-").slice(0, 40);
        const path = `${eventId}/${Date.now()}-${safe}.${ext}`;
        const c = cfg();
        const res = await fetch(`${c.url}/storage/v1/object/event-assets/${path}`, {
            method: "POST",
            headers: {
                apikey: c.anonKey,
                Authorization: `Bearer ${c.anonKey}`,
                "Content-Type": blob.type || "image/jpeg",
                "x-upsert": "true"
            },
            body: blob
        });
        if (!res.ok) {
            console.warn("MediaUpload: échec upload", res.status, await res.text().catch(() => ""));
            return null;
        }
        return `${c.url}/storage/v1/object/public/event-assets/${path}`;
    }

    async function processFile(file, eventId, label) {
        const blob = await compressImageFile(file);
        if (canUpload()) {
            const url = await uploadBlob(eventId, blob, label);
            if (url) return url;
        }
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
        externalizeDashboardMedia,
        canUpload,
        dataUrlToBlob
    };
})();

window.MediaUpload = MediaUpload;
