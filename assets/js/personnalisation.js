const DASHBOARD_KEY = "wedding_dashboard_state";

function toDateTimeLocalValue(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DEFAULT_STATE = {
    title: "Mariage de Yanick et Keren",
    subtitle: "Yanick et Keren",
    mainText: "La cérémonie, suivie d'une réception, se tiendra le jeudi 30 avril 2026 à partir de 19h30.",
    welcomeImage: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
    heroImage: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80",
    primaryColor: "#4caf50",
    accentColor: "#ec4899",
    bestPhotos: [
        "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=700&q=80",
        "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=700&q=80"
    ],
    countdownDate: "2026-04-30T19:30"
};

function filesToDataUrls(files) {
    return Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Impossible de lire l'image"));
        reader.readAsDataURL(file);
    })));
}

function parseList(value, max = 12) {
    return (value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, max);
}

function loadState() {
    try {
        const raw = localStorage.getItem(DASHBOARD_KEY);
        if (!raw) return { ...DEFAULT_STATE };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_STATE, ...parsed };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

function readFormState() {
    return {
        title: document.getElementById("title").value.trim(),
        subtitle: document.getElementById("subtitle").value.trim(),
        mainText: document.getElementById("message").value.trim(),
        heroImage: document.getElementById("heroImage").value.trim(),
        welcomeImage: document.getElementById("welcomeImage").value.trim(),
        primaryColor: document.getElementById("primaryColor").value,
        accentColor: document.getElementById("accentColor").value,
        bestPhotos: parseList(document.getElementById("bestPhotos").value, 12),
        countdownDate: document.getElementById("eventDate")?.value || ""
    };
}

function toDashboardPayload(formState) {
    const photos = formState.bestPhotos;
    return {
        title: formState.title,
        subtitle: formState.subtitle,
        mainText: formState.mainText,
        welcomeImage: formState.welcomeImage,
        heroImage: formState.heroImage,
        primaryColor: formState.primaryColor,
        accentColor: formState.accentColor,
        bestGridImages: [photos[0], photos[1]].filter(Boolean),
        bestMarqueeImages: [
            photos[0], photos[1], photos[2], photos[3], photos[4], photos[5]
        ].filter(Boolean),
        galleryPreviewImages: [photos[0], photos[1], photos[2]].filter(Boolean),
        galleryModalImages: [photos[0], photos[1], photos[2], photos[3]].filter(Boolean),
        shareImage: photos[0] || formState.heroImage,
        countdownDate: formState.countdownDate || ""
    };
}

function renderPreview(urls) {
    const root = document.getElementById("best-photos-preview");
    root.innerHTML = "";
    urls.filter(Boolean).forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        root.appendChild(img);
    });
}

function renderSinglePreview(fieldId, previewId) {
    const src = document.getElementById(fieldId).value.trim();
    const img = document.getElementById(previewId);
    if (!img) return;
    img.src = src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='100%25' height='100%25' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' fill='%2364758b' dominant-baseline='middle' text-anchor='middle' font-family='Arial'%3EApercu image%3C/text%3E%3C/svg%3E";
}

function hydrateForm(state) {
    document.getElementById("title").value = state.title || "";
    document.getElementById("subtitle").value = state.subtitle || "";
    document.getElementById("message").value = state.mainText || state.message || "";
    document.getElementById("primaryColor").value = state.primaryColor || "#4caf50";
    document.getElementById("accentColor").value = state.accentColor || "#ec4899";
    document.getElementById("heroImage").value = state.heroImage || "";
    document.getElementById("welcomeImage").value = state.welcomeImage || "";
    const photos = state.bestPhotos || state.bestGridImages || [];
    document.getElementById("bestPhotos").value = photos.join(", ");
    const eventDateField = document.getElementById("eventDate");
    if (eventDateField) {
        eventDateField.value = state.countdownDate
            ? toDateTimeLocalValue(state.countdownDate)
            : "";
    }
    renderPreview(photos);
    renderSinglePreview("heroImage", "preview-heroImage");
    renderSinglePreview("welcomeImage", "preview-welcomeImage");
}

async function bindUploader(inputId, targetFieldId, multiple = false, max = 1) {
    const input = document.getElementById(inputId);
    input.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const urls = await filesToDataUrls(multiple ? files.slice(0, max) : [files[0]]);
        const field = document.getElementById(targetFieldId);
        if (multiple) {
            const existing = parseList(field.value, max);
            field.value = [...existing, ...urls].slice(0, max).join(", ");
            renderPreview(parseList(field.value, max));
        } else {
            field.value = urls[0];
            if (targetFieldId === "heroImage") renderSinglePreview("heroImage", "preview-heroImage");
            if (targetFieldId === "welcomeImage") renderSinglePreview("welcomeImage", "preview-welcomeImage");
        }
        e.target.value = "";
    });
}

function applyPreview() {
    const state = readFormState();
    const payload = toDashboardPayload(state);
    localStorage.setItem(DASHBOARD_KEY, JSON.stringify(payload));
    alert("Aperçu appliqué à l'invitation.");
}

function saveSettings(e) {
    e.preventDefault();
    const state = readFormState();
    const payload = toDashboardPayload(state);
    localStorage.setItem(DASHBOARD_KEY, JSON.stringify(payload));
    if (window.WeddingDB && typeof WeddingDB.updateSettings === "function") {
        WeddingDB.updateSettings({
            title: state.title,
            subtitle: state.subtitle,
            message: state.mainText,
            primaryColor: state.primaryColor,
            accentColor: state.accentColor,
            heroImage: state.heroImage,
            welcomeImage: state.welcomeImage,
            bestPhotos: state.bestPhotos
        });
    }
    alert("Personnalisation sauvegardée.");
}

function resetDashboard() {
    localStorage.removeItem(DASHBOARD_KEY);
    hydrateForm(DEFAULT_STATE);
    alert("Configuration réinitialisée.");
}

window.addEventListener("DOMContentLoaded", async () => {
    await EventConfig.init();
    const cfg = EventConfig.getConfig();
    const state = loadState();
    if (!state.countdownDate && cfg && cfg.eventDate) {
        state.countdownDate = toDateTimeLocalValue(cfg.eventDate);
    }
    hydrateForm(state);
    document.getElementById("settings-form").addEventListener("submit", saveSettings);
    document.getElementById("apply-preview-btn").addEventListener("click", applyPreview);
    document.getElementById("reset-btn").addEventListener("click", resetDashboard);
    document.getElementById("bestPhotos").addEventListener("input", () => renderPreview(parseList(document.getElementById("bestPhotos").value, 12)));
    document.getElementById("heroImage").addEventListener("input", () => renderSinglePreview("heroImage", "preview-heroImage"));
    document.getElementById("welcomeImage").addEventListener("input", () => renderSinglePreview("welcomeImage", "preview-welcomeImage"));
    await bindUploader("upload-hero", "heroImage");
    await bindUploader("upload-welcome", "welcomeImage");
    await bindUploader("upload-best", "bestPhotos", true, 12);
});
