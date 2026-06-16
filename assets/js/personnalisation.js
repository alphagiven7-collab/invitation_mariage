const LEGACY_DASHBOARD_KEY = "wedding_dashboard_state";

const PROGRAM_COLORS = [
    { value: "blue", label: "Bleu" },
    { value: "green", label: "Vert" },
    { value: "pink", label: "Rose" },
    { value: "purple", label: "Violet" },
    { value: "indigo", label: "Indigo" },
    { value: "amber", label: "Ambre" }
];

const PRACTICAL_ICONS = [
    { value: "car", label: "Voiture / parking" },
    { value: "bed", label: "Hébergement" },
    { value: "wine", label: "Boisson" },
    { value: "shirt", label: "Tenue" },
    { value: "bus", label: "Transport" },
    { value: "gift", label: "Cadeau" },
    { value: "phone", label: "Contact" },
    { value: "info", label: "Info" }
];

function slugifyDrink(text) {
    return (text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function getDefaultDrinkMenu() {
    if (window.DrinkGenericImages && typeof DrinkGenericImages.getDefaultItems === "function") {
        return DrinkGenericImages.getDefaultItems();
    }
    return [];
}

function resolveDrinkImage(item, index) {
    if (window.DrinkGenericImages && typeof DrinkGenericImages.resolveImageUrl === "function") {
        return DrinkGenericImages.resolveImageUrl(item, index);
    }
    return String(item?.imageUrl || "").trim();
}

function normalizeDrinkMenuState(state) {
    if (window.DrinkMenu && typeof DrinkMenu.normalizeMenu === "function") {
        return DrinkMenu.normalizeMenu(state || {});
    }
    const defaults = getDefaultDrinkMenu();
    if (Array.isArray(state?.drinkMenu) && state.drinkMenu.length) {
        return state.drinkMenu.slice(0, 8).map((item, index) => ({
            id: item.id || slugifyDrink(item.name) || `drink-${index}`,
            name: String(item.name || "").trim(),
            description: String(item.description || "").trim(),
            imageUrl: resolveDrinkImage(item, index)
        })).filter((item) => item.name);
    }
    const legacy = Array.isArray(state?.drinkMenuOptions) ? state.drinkMenuOptions : [];
    if (legacy.length) {
        return legacy.slice(0, 8).map((name, index) => {
            const id = slugifyDrink(name) || `drink-${index}`;
            return {
                id,
                name: String(name).trim(),
                description: "",
                imageUrl: resolveDrinkImage({ id, name }, index)
            };
        }).filter((item) => item.name);
    }
    return defaults.map((item) => ({ ...item }));
}

function toDateTimeLocalValue(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseCoupleFromSubtitle(subtitle) {
    const s = (subtitle || "").trim();
    const m = s.match(/^(.+?)\s+(?:et|&|\+)\s+(.+)$/i);
    if (m) return { left: m[1].trim(), right: m[2].trim() };
    return { left: s, right: "" };
}

function getConfigDefaults() {
    const cfg = window.EventConfig && EventConfig.getConfig ? EventConfig.getConfig() : null;
    const blocks = window.ContentBlocks ? ContentBlocks.getDefaultsFromConfig(cfg) : {};
    return {
        program: blocks.program || ContentBlocks?.DEFAULT_PROGRAM || [],
        practicalInfo: blocks.practicalInfo || ContentBlocks?.DEFAULT_PRACTICAL || [],
        programSectionTitle: cfg?.programSectionTitle || "Programme de la journée",
        practicalSectionTitle: cfg?.practicalSectionTitle || "Informations pratiques",
        venueTitle: blocks.venueTitle || "",
        venueAddress: blocks.venueAddress || "",
        venueLat: blocks.venueLat || "",
        venueLng: blocks.venueLng || "",
        mapLink: blocks.mapLink || cfg?.links?.map || "",
        mapImage: blocks.mapImage || "",
        title: cfg?.title || "Mariage de Josue et Divine",
        subtitle: cfg?.subtitle || "Josue et Divine",
        coupleLeft: cfg?.coupleLeft || "Divine",
        coupleRight: cfg?.coupleRight || "Josue",
        welcomeMessage: cfg?.welcomeMessage || "",
        gateHint: cfg?.gateHint || "",
        inviteIntro: cfg?.inviteIntro || "C'est avec une grande joie que {couple} vous invitent à célébrer leur mariage.",
        inviteSecondary: cfg?.inviteSecondary || "Ils seraient honorés de vous compter parmi leurs invités pour célébrer cette union sacrée et partager le bonheur de leur engagement.",
        reserveText: cfg?.reserveText || "Confirmer ma présence",
        rsvpDeadlineText: cfg?.rsvpDeadlineText || (cfg?.rsvpDeadline ? `Merci de confirmer avant le ${cfg.rsvpDeadline}` : ""),
        rsvpButtonColor: cfg?.rsvpButtonColor || cfg?.branding?.accentColor || "#ec4899",
        aboutTitle: cfg?.aboutTitle || "Notre Histoire",
        aboutStory1: cfg?.aboutStory1 || "",
        aboutStory2: cfg?.aboutStory2 || "",
        aboutImage: cfg?.branding?.aboutImage || "",
        donationLink: cfg?.links?.donation || "",
        whatsappDonationPhone: cfg?.links?.whatsappDonation || cfg?.whatsappDonationPhone || "",
        donationWhatsAppMessage: cfg?.links?.donationWhatsAppMessage || "",
        dressCodeTitle: cfg?.dressCodeTitle || "Tenue élégante",
        dressImages: cfg?.dressImages || [],
        supportEmail: cfg?.links?.supportEmail || "",
        rsvpLink: cfg?.links?.rsvp || "",
        metaDescription: cfg?.metaDescription || cfg?.title || "",
        backgroundMusicUrl: cfg?.ambiance?.musicUrl || cfg?.backgroundMusicUrl || "",
        backgroundMusicVolume: cfg?.ambiance?.volume ?? 0.35,
        backgroundMusicEnabled: cfg?.ambiance?.enabled !== false,
        drinkMenuTitle: cfg?.drinkMenuTitle || "Menu des boissons",
        drinkMenuSubtitle: cfg?.drinkMenuSubtitle || "Sélectionnez vos préférences pour le jour J (optionnel, plusieurs choix possibles).",
        drinkMenu: normalizeDrinkMenuState(cfg),
        drinkMenuOptions: cfg?.drinkMenuOptions || getDefaultDrinkMenu().map((item) => item.name),
        confirmationCouplePhoto1: cfg?.confirmationCouplePhoto1 || "",
        confirmationCouplePhoto2: cfg?.confirmationCouplePhoto2 || ""
    };
}

const DEFAULT_STATE = {
    title: "Mariage de Josue et Divine",
    subtitle: "Josue et Divine",
    coupleLeft: "Divine",
    coupleRight: "Josue",
    mainText: "La cérémonie, suivie d'une réception, se tiendra le jeudi 30 avril 2026 à partir de 19h30.",
    welcomeImage: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
    heroImage: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80",
    primaryColor: "#4caf50",
    accentColor: "#ec4899",
    bestPhotos: [
        "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=700&q=80",
        "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=700&q=80"
    ],
    countdownDate: "2026-04-30T19:30",
    welcomeMessage: "Avec amour, nous vous ouvrons cette enveloppe de bonheur.",
    gateHint: "Veuillez saisir votre nom pour découvrir votre invitation personnelle.",
    inviteIntro: "C'est avec une grande joie que {couple} vous invitent à célébrer leur mariage.",
    inviteSecondary: "Ils seraient honorés de vous compter parmi leurs invités pour célébrer cette union sacrée et partager le bonheur de leur engagement.",
    reserveText: "Confirmer ma présence",
    rsvpDeadlineText: "Merci de confirmer avant le 25 avril 2026",
    rsvpButtonColor: "#ec4899",
    aboutTitle: "Notre Histoire",
    aboutStory1: "",
    aboutStory2: "",
    aboutImage: "",
    donationLink: "https://www.paypal.com",
    whatsappDonationPhone: "",
    donationWhatsAppMessage: "Bonjour {couple}, je souhaite vous faire un don pour votre mariage. Merci de me communiquer les modalités.",
    dressCodeTitle: "Tenue élégante",
    dressImages: [],
    supportEmail: "contact@josue-divine.com",
    rsvpLink: "",
    metaDescription: "Invitation officielle au mariage de Josue et Divine.",
    backgroundMusicUrl: "",
    backgroundMusicVolume: 0.35,
    backgroundMusicEnabled: true,
    drinkMenuTitle: "Menu des boissons",
    drinkMenuSubtitle: "Sélectionnez vos préférences pour le jour J (optionnel, plusieurs choix possibles).",
    drinkMenu: [],
    drinkMenuOptions: ["Champagne", "Vin rouge", "Vin blanc", "Jus de fruits", "Eau", "Soft"],
    confirmationCouplePhoto1: "",
    confirmationCouplePhoto2: ""
};

let toastTimer = null;
let previewTimer = null;
let previewPaused = false;

function getEventId() {
    return window.EventConfig && EventConfig.isReady()
        ? EventConfig.getEventId()
        : "yanick-keren";
}

function updateCloudStatus(lastSave) {
    const pill = document.getElementById("cloud-status");
    if (!pill) return;
    if (!window.CloudAPI || !CloudAPI.isEnabled()) {
        pill.textContent = "Mode local (cloud désactivé)";
        pill.className = "admin-cloud-pill offline";
        return;
    }
        if (lastSave && lastSave.cloud) {
            pill.textContent = "Sync cloud active";
            pill.className = "admin-cloud-pill online";
        } else if (lastSave && lastSave.localOk === false) {
            pill.textContent = "Stockage local plein — utilisez Sauvegarder";
            pill.className = "admin-cloud-pill offline";
        } else if (lastSave && lastSave.cloud === false) {
        pill.textContent = "Sauvé localement — sync cloud en attente";
        pill.className = "admin-cloud-pill offline";
    } else {
        pill.textContent = "Cloud connecté";
        pill.className = "admin-cloud-pill online";
    }
}

function showToast(message) {
    const el = document.getElementById("perso-toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

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

function loadStateLocalOnly() {
    const cfgDefaults = getConfigDefaults();
    const base = { ...DEFAULT_STATE, ...cfgDefaults };
    try {
        const eventId = getEventId();
        const scoped = window.DashboardSync
            ? DashboardSync.scopedKey(eventId)
            : LEGACY_DASHBOARD_KEY;
        const raw = localStorage.getItem(scoped) || localStorage.getItem(LEGACY_DASHBOARD_KEY);
        if (!raw) return base;
        return { ...base, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_STATE, ...getConfigDefaults() };
    }
}

async function loadStateFromSync() {
    const cfgDefaults = getConfigDefaults();
    const base = { ...DEFAULT_STATE, ...cfgDefaults };
    const eventId = getEventId();
    const cfg = window.EventConfig && EventConfig.getConfig ? EventConfig.getConfig() : null;

    if (window.DashboardSync) {
        let state = await DashboardSync.load(eventId, base, { preferCloud: true });
        if (DashboardSync.syncIdentityFromConfig && cfg) {
            const sync = DashboardSync.syncIdentityFromConfig(state, cfg);
            state = sync.state;
            if (sync.changed) {
                try {
                    await DashboardSync.save(eventId, state);
                } catch {
                    /* ignore */
                }
            }
        }
        return state;
    }
    return loadStateLocalOnly();
}

function readProgramFromEditor() {
    const root = document.getElementById("program-editor");
    if (!root) return [];
    return Array.from(root.querySelectorAll(".perso-dynamic-item")).map((row) => ({
        time: row.querySelector('[data-field="time"]')?.value.trim() || "",
        title: row.querySelector('[data-field="title"]')?.value.trim() || "",
        color: row.querySelector('[data-field="color"]')?.value || "blue"
    })).filter((step) => step.time || step.title);
}

function readPracticalFromEditor() {
    const root = document.getElementById("practical-editor");
    if (!root) return [];
    return Array.from(root.querySelectorAll(".perso-dynamic-item")).map((row) => ({
        icon: row.querySelector('[data-field="icon"]')?.value || "info",
        title: row.querySelector('[data-field="title"]')?.value.trim() || "",
        text: row.querySelector('[data-field="text"]')?.value.trim() || ""
    })).filter((item) => item.title || item.text);
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
        countdownDate: document.getElementById("eventDate")?.value || "",
        venueTitle: document.getElementById("venueTitle").value.trim(),
        venueAddress: document.getElementById("venueAddress").value.trim(),
        venueLat: document.getElementById("venueLat").value.trim(),
        venueLng: document.getElementById("venueLng").value.trim(),
        mapLink: document.getElementById("mapLink").value.trim(),
        mapImage: document.getElementById("mapImage").value.trim(),
        programSectionTitle: document.getElementById("programSectionTitle").value.trim(),
        practicalSectionTitle: document.getElementById("practicalSectionTitle").value.trim(),
        program: readProgramFromEditor(),
        practicalInfo: readPracticalFromEditor(),
        coupleLeft: document.getElementById("coupleNameLeft").value.trim(),
        coupleRight: document.getElementById("coupleNameRight").value.trim(),
        inviteIntro: document.getElementById("inviteIntro").value.trim(),
        inviteSecondary: document.getElementById("inviteSecondary").value.trim(),
        welcomeMessage: document.getElementById("welcomeMessage").value.trim(),
        gateHint: document.getElementById("gateHint").value.trim(),
        reserveText: document.getElementById("reserveText").value.trim(),
        rsvpDeadlineText: document.getElementById("rsvpDeadlineText").value.trim(),
        rsvpButtonColor: document.getElementById("rsvpButtonColor").value,
        aboutTitle: document.getElementById("aboutTitle").value.trim(),
        aboutStory1: document.getElementById("aboutStory1").value.trim(),
        aboutStory2: document.getElementById("aboutStory2").value.trim(),
        aboutImage: document.getElementById("aboutImage").value.trim(),
        donationLink: document.getElementById("donationLink").value.trim(),
        whatsappDonationPhone: document.getElementById("whatsappDonationPhone").value.trim(),
        donationWhatsAppMessage: document.getElementById("donationWhatsAppMessage").value.trim(),
        dressCodeTitle: document.getElementById("dressCodeTitle").value.trim(),
        dressImages: parseList(document.getElementById("dressImages").value, 8),
        supportEmail: document.getElementById("supportEmail").value.trim(),
        rsvpLink: document.getElementById("rsvpLink").value.trim(),
        metaDescription: document.getElementById("metaDescription").value.trim(),
        backgroundMusicUrl: document.getElementById("backgroundMusicUrl").value.trim(),
        backgroundMusicVolume: Number(document.getElementById("backgroundMusicVolume").value) / 100,
        backgroundMusicEnabled: document.getElementById("backgroundMusicEnabled").checked,
        drinkMenuTitle: document.getElementById("drinkMenuTitle").value.trim(),
        drinkMenuSubtitle: document.getElementById("drinkMenuSubtitle").value.trim(),
        drinkMenu: collectDrinkMenuFromEditor(),
        drinkMenuOptions: collectDrinkMenuFromEditor().map((item) => item.name),
        confirmationCouplePhoto1: document.getElementById("confirmationCouplePhoto1").value.trim(),
        confirmationCouplePhoto2: document.getElementById("confirmationCouplePhoto2").value.trim()
    };
}

function toDashboardPayload(formState) {
    const photos = formState.bestPhotos || [];
    return {
        title: formState.title,
        subtitle: formState.subtitle,
        coupleLeft: formState.coupleLeft,
        coupleRight: formState.coupleRight,
        mainText: formState.mainText,
        welcomeImage: formState.welcomeImage,
        heroImage: formState.heroImage,
        primaryColor: formState.primaryColor,
        accentColor: formState.accentColor,
        bestPhotos: photos,
        bestGridImages: [photos[0], photos[1]].filter(Boolean),
        bestMarqueeImages: [
            photos[0], photos[1], photos[2], photos[3], photos[4], photos[5]
        ].filter(Boolean),
        galleryPreviewImages: [photos[0], photos[1], photos[2]].filter(Boolean),
        galleryModalImages: [photos[0], photos[1], photos[2], photos[3]].filter(Boolean),
        shareImage: photos[0] || formState.heroImage,
        message: formState.mainText,
        countdownDate: formState.countdownDate || "",
        venueTitle: formState.venueTitle,
        venueAddress: formState.venueAddress,
        venueLat: formState.venueLat,
        venueLng: formState.venueLng,
        mapLink: formState.mapLink,
        mapImage: formState.mapImage,
        programSectionTitle: formState.programSectionTitle,
        practicalSectionTitle: formState.practicalSectionTitle,
        program: formState.program,
        practicalInfo: formState.practicalInfo,
        backgroundMusicUrl: formState.backgroundMusicUrl,
        backgroundMusicVolume: formState.backgroundMusicVolume,
        backgroundMusicEnabled: formState.backgroundMusicEnabled,
        inviteIntro: formState.inviteIntro,
        inviteSecondary: formState.inviteSecondary,
        welcomeMessage: formState.welcomeMessage,
        gateHint: formState.gateHint,
        reserveText: formState.reserveText,
        rsvpDeadlineText: formState.rsvpDeadlineText,
        rsvpButtonColor: formState.rsvpButtonColor,
        aboutTitle: formState.aboutTitle,
        aboutStory1: formState.aboutStory1,
        aboutStory2: formState.aboutStory2,
        aboutImage: formState.aboutImage,
        donationLink: formState.donationLink,
        whatsappDonationPhone: formState.whatsappDonationPhone,
        donationWhatsAppMessage: formState.donationWhatsAppMessage,
        dressCodeTitle: formState.dressCodeTitle,
        dressImages: formState.dressImages,
        supportEmail: formState.supportEmail,
        rsvpLink: formState.rsvpLink,
        metaDescription: formState.metaDescription,
        drinkMenuTitle: formState.drinkMenuTitle,
        drinkMenuSubtitle: formState.drinkMenuSubtitle,
        drinkMenu: formState.drinkMenu,
        drinkMenuOptions: (formState.drinkMenu || []).map((item) => item.name).filter(Boolean),
        confirmationCouplePhoto1: formState.confirmationCouplePhoto1,
        confirmationCouplePhoto2: formState.confirmationCouplePhoto2
    };
}

function renderDressPreview(urls) {
    const root = document.getElementById("dress-photos-preview");
    if (!root) return;
    root.innerHTML = "";
    urls.filter(Boolean).forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "Aperçu tenue";
        root.appendChild(img);
    });
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

function buildProgramRow(step, index) {
    const colorOptions = PROGRAM_COLORS.map((c) =>
        `<option value="${c.value}"${step.color === c.value ? " selected" : ""}>${c.label}</option>`
    ).join("");
    const row = document.createElement("div");
    row.className = "perso-dynamic-item";
    row.innerHTML = `
        <div class="perso-dynamic-item-head">
            <span>Étape ${index + 1}</span>
            <button type="button" class="perso-remove-btn" data-action="remove">Supprimer</button>
        </div>
        <div class="dash-grid-2">
            <label>
                <span class="dash-field-label">Horaire</span>
                <input data-field="time" class="admin-input" value="${escapeAttr(step.time)}" placeholder="19h30 - 20h00">
            </label>
            <label>
                <span class="dash-field-label">Couleur</span>
                <select data-field="color" class="admin-input perso-color-select">${colorOptions}</select>
            </label>
        </div>
        <label class="mt-2 block">
            <span class="dash-field-label">Intitulé</span>
            <input data-field="title" class="admin-input" value="${escapeAttr(step.title)}" placeholder="Ex : Arrivée des invités">
        </label>`;
    row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        row.remove();
        reindexProgramRows();
        schedulePreviewRefresh(200);
    });
    return row;
}

function buildPracticalRow(item, index) {
    const iconOptions = PRACTICAL_ICONS.map((c) =>
        `<option value="${c.value}"${item.icon === c.value ? " selected" : ""}>${c.label}</option>`
    ).join("");
    const row = document.createElement("div");
    row.className = "perso-dynamic-item";
    row.innerHTML = `
        <div class="perso-dynamic-item-head">
            <span>Info ${index + 1}</span>
            <button type="button" class="perso-remove-btn" data-action="remove">Supprimer</button>
        </div>
        <div class="dash-grid-2">
            <label>
                <span class="dash-field-label">Icône</span>
                <select data-field="icon" class="admin-input">${iconOptions}</select>
            </label>
            <label>
                <span class="dash-field-label">Titre</span>
                <input data-field="title" class="admin-input" value="${escapeAttr(item.title)}" placeholder="PARKING">
            </label>
        </div>
        <label class="mt-2 block">
            <span class="dash-field-label">Description</span>
            <textarea data-field="text" class="admin-input" rows="2" style="min-height:64px;resize:vertical" placeholder="Texte affiché aux invités">${escapeHtml(item.text)}</textarea>
        </label>`;
    row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        row.remove();
        reindexPracticalRows();
        schedulePreviewRefresh(200);
    });
    return row;
}

function escapeAttr(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function reindexProgramRows() {
    document.querySelectorAll("#program-editor .perso-dynamic-item-head span").forEach((el, i) => {
        el.textContent = `Étape ${i + 1}`;
    });
}

function reindexPracticalRows() {
    document.querySelectorAll("#practical-editor .perso-dynamic-item-head span").forEach((el, i) => {
        el.textContent = `Info ${i + 1}`;
    });
}

function renderDrinkEditor(items) {
    const root = document.getElementById("drink-menu-editor");
    if (!root) return;
    root.innerHTML = "";
    (items || []).slice(0, 8).forEach((item, index) => root.appendChild(buildDrinkRow(item, index)));
}

function collectDrinkMenuFromEditor() {
    const root = document.getElementById("drink-menu-editor");
    if (!root) return [];
    return Array.from(root.querySelectorAll(".perso-drink-row"))
        .map((row, index) => ({
            id: slugifyDrink(row.querySelector('[data-field="name"]')?.value) || `drink-${index}`,
            name: (row.querySelector('[data-field="name"]')?.value || "").trim(),
            description: (row.querySelector('[data-field="description"]')?.value || "").trim(),
            imageUrl: (row.querySelector('[data-field="imageUrl"]')?.value || "").trim()
        }))
        .filter((item) => item.name)
        .slice(0, 8);
}

function reindexDrinkRows() {
    document.querySelectorAll("#drink-menu-editor .perso-drink-row").forEach((row, index) => {
        const label = row.querySelector(".perso-dynamic-item-head span");
        if (label) label.textContent = `Boisson ${index + 1}`;
    });
}

const DRINK_PREVIEW_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='100%25' height='100%25' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' fill='%2364758b' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='14'%3EBoisson%3C/text%3E%3C/svg%3E";

async function handleDrinkRowUpload(event, imageField, preview) {
    const file = (event.target.files || [])[0];
    event.target.value = "";
    if (!file || !imageField) return;
    try {
        const eventId = getEventId();
        const url = window.MediaUpload
            ? await MediaUpload.processFile(file, eventId, "drinkMenuImage")
            : (await filesToDataUrls([file]))[0];
        imageField.value = url;
        if (preview) preview.src = url || DRINK_PREVIEW_PLACEHOLDER;
        showToast(String(url).startsWith("http") ? "Photo importée et envoyée au cloud." : "Photo importée — sauvegardez pour sync.");
        schedulePreviewRefresh(300);
    } catch (err) {
        showToast(err.message || "Impossible d'importer cette photo.");
    }
}

function buildDrinkRow(item, index) {
    const previewSrc = item.imageUrl || DRINK_PREVIEW_PLACEHOLDER;
    const row = document.createElement("div");
    row.className = "perso-dynamic-item perso-drink-row";
    row.innerHTML = `
        <div class="perso-dynamic-item-head">
            <span>Boisson ${index + 1}</span>
            <button type="button" class="perso-remove-btn" data-action="remove">Supprimer</button>
        </div>
        <div class="dash-grid-2">
            <label>
                <span class="dash-field-label">Nom</span>
                <input data-field="name" class="admin-input" value="${escapeAttr(item.name)}" placeholder="Champagne">
            </label>
            <label>
                <span class="dash-field-label">Description courte</span>
                <input data-field="description" class="admin-input" value="${escapeAttr(item.description)}" placeholder="Bulles fines &amp; festive">
            </label>
        </div>
        <label class="mt-2 block">
            <span class="dash-field-label">Image (URL)</span>
            <input data-field="imageUrl" class="admin-input" value="${escapeAttr(item.imageUrl)}" placeholder="https://…">
        </label>
        <div class="flex flex-wrap items-center gap-3 mt-2">
            <img data-role="preview" class="perso-drink-preview" src="${escapeAttr(previewSrc)}" alt="">
            <label class="perso-add-btn cursor-pointer">
                Importer une photo
                <input type="file" accept="image/*" class="hidden drink-row-upload">
            </label>
        </div>`;
    row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        row.remove();
        reindexDrinkRows();
        schedulePreviewRefresh(200);
    });
    const imageField = row.querySelector('[data-field="imageUrl"]');
    const preview = row.querySelector('[data-role="preview"]');
    imageField.addEventListener("input", () => {
        preview.src = imageField.value.trim() || DRINK_PREVIEW_PLACEHOLDER;
        schedulePreviewRefresh(300);
    });
    row.querySelector(".drink-row-upload")?.addEventListener("change", (e) => handleDrinkRowUpload(e, imageField, preview));
    row.querySelectorAll("input[data-field]").forEach((input) => {
        input.addEventListener("input", () => schedulePreviewRefresh(300));
    });
    return row;
}

function renderProgramEditor(steps) {
    const root = document.getElementById("program-editor");
    root.innerHTML = "";
    (steps || []).forEach((step, i) => root.appendChild(buildProgramRow(step, i)));
}

function renderPracticalEditor(items) {
    const root = document.getElementById("practical-editor");
    root.innerHTML = "";
    (items || []).forEach((item, i) => root.appendChild(buildPracticalRow(item, i)));
}

function hydrateForm(state) {
    document.getElementById("title").value = state.title || "";
    document.getElementById("subtitle").value = state.subtitle || "";
    if (!state.coupleLeft && !state.coupleRight && state.subtitle) {
        const parsed = parseCoupleFromSubtitle(state.subtitle);
        state.coupleLeft = state.coupleLeft || parsed.left;
        state.coupleRight = state.coupleRight || parsed.right;
    }
    document.getElementById("coupleNameLeft").value = state.coupleLeft || "";
    document.getElementById("coupleNameRight").value = state.coupleRight || "";
    document.getElementById("inviteIntro").value = state.inviteIntro || "";
    document.getElementById("inviteSecondary").value = state.inviteSecondary || "";
    document.getElementById("welcomeMessage").value = state.welcomeMessage || "";
    document.getElementById("gateHint").value = state.gateHint || "";
    document.getElementById("reserveText").value = state.reserveText || "";
    document.getElementById("rsvpDeadlineText").value = state.rsvpDeadlineText || "";
    document.getElementById("rsvpButtonColor").value = state.rsvpButtonColor || "#ec4899";
    document.getElementById("aboutTitle").value = state.aboutTitle || "";
    document.getElementById("aboutStory1").value = state.aboutStory1 || "";
    document.getElementById("aboutStory2").value = state.aboutStory2 || "";
    document.getElementById("aboutImage").value = state.aboutImage || "";
    document.getElementById("donationLink").value = state.donationLink || "";
    document.getElementById("whatsappDonationPhone").value = state.whatsappDonationPhone || "";
    document.getElementById("donationWhatsAppMessage").value = state.donationWhatsAppMessage || "";
    document.getElementById("dressCodeTitle").value = state.dressCodeTitle || "Tenue élégante";
    document.getElementById("dressImages").value = (state.dressImages || []).join(", ");
    document.getElementById("supportEmail").value = state.supportEmail || "";
    document.getElementById("rsvpLink").value = state.rsvpLink || "";
    document.getElementById("metaDescription").value = state.metaDescription || "";
    document.getElementById("message").value = state.mainText || state.message || "";
    document.getElementById("primaryColor").value = state.primaryColor || "#4caf50";
    document.getElementById("accentColor").value = state.accentColor || "#ec4899";
    document.getElementById("heroImage").value = state.heroImage || "";
    document.getElementById("welcomeImage").value = state.welcomeImage || "";
    document.getElementById("venueTitle").value = state.venueTitle || "";
    document.getElementById("venueAddress").value = state.venueAddress || "";
    document.getElementById("venueLat").value = state.venueLat || "";
    document.getElementById("venueLng").value = state.venueLng || "";
    document.getElementById("mapLink").value = state.mapLink || "";
    document.getElementById("mapImage").value = state.mapImage || "";
    document.getElementById("programSectionTitle").value = state.programSectionTitle || "Programme de la journée";
    document.getElementById("practicalSectionTitle").value = state.practicalSectionTitle || "Informations pratiques";
    document.getElementById("backgroundMusicUrl").value = state.backgroundMusicUrl || "";
    document.getElementById("backgroundMusicEnabled").checked = state.backgroundMusicEnabled !== false;
    const volPct = Math.round((state.backgroundMusicVolume ?? 0.35) * 100);
    document.getElementById("backgroundMusicVolume").value = String(volPct);
    document.getElementById("music-volume-label").textContent = String(volPct);
    document.getElementById("drinkMenuTitle").value = state.drinkMenuTitle || "Menu des boissons";
    document.getElementById("drinkMenuSubtitle").value = state.drinkMenuSubtitle
        || "Sélectionnez vos préférences pour le jour J (optionnel, plusieurs choix possibles).";
    renderDrinkEditor(normalizeDrinkMenuState(state));
    document.getElementById("confirmationCouplePhoto1").value = state.confirmationCouplePhoto1 || "";
    document.getElementById("confirmationCouplePhoto2").value = state.confirmationCouplePhoto2 || "";

    const photos = state.bestPhotos || state.bestGridImages || state.bestMarqueeImages || [];
    document.getElementById("bestPhotos").value = Array.isArray(photos) ? photos.join(", ") : "";
    const eventDateField = document.getElementById("eventDate");
    if (eventDateField) {
        eventDateField.value = state.countdownDate
            ? toDateTimeLocalValue(state.countdownDate)
            : "";
    }
    renderProgramEditor(state.program || []);
    renderPracticalEditor(state.practicalInfo || []);
    renderPreview(photos);
    renderDressPreview(state.dressImages || []);
    renderSinglePreview("heroImage", "preview-heroImage");
    renderSinglePreview("welcomeImage", "preview-welcomeImage");
    renderSinglePreview("mapImage", "preview-mapImage");
    renderSinglePreview("aboutImage", "preview-aboutImage");
}

function wireMusicControls() {
    const vol = document.getElementById("backgroundMusicVolume");
    const volLabel = document.getElementById("music-volume-label");
    const preview = document.getElementById("perso-music-preview");
    const urlField = document.getElementById("backgroundMusicUrl");

    if (vol && volLabel) {
        vol.addEventListener("input", () => {
            volLabel.textContent = vol.value;
            if (preview && preview.src) preview.volume = Number(vol.value) / 100;
        });
    }

    document.getElementById("test-music-btn")?.addEventListener("click", async () => {
        const src = urlField?.value.trim();
        if (!src) {
            showToast("Ajoutez une URL ou importez un fichier audio.");
            return;
        }
        if (window.BackgroundMusic && BackgroundMusic.parseYouTubeId && BackgroundMusic.parseYouTubeId(src)) {
            showToast("Lien YouTube détecté — ouvrez l'invitation et touchez ♪ pour écouter.");
            return;
        }
        if (!preview) return;
        preview.volume = Number(vol?.value || 35) / 100;
        preview.src = src;
        try {
            await preview.play();
            showToast("Lecture en cours…");
        } catch {
            showToast("Impossible de lire — vérifiez le format ou l'URL.");
        }
    });

    document.getElementById("stop-music-btn")?.addEventListener("click", () => {
        if (!preview) return;
        preview.pause();
        preview.currentTime = 0;
    });

    const upload = document.getElementById("upload-music");
    upload?.addEventListener("change", async (e) => {
        const file = (e.target.files || [])[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast("Fichier trop volumineux (max 5 Mo).");
            e.target.value = "";
            return;
        }
        try {
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            urlField.value = dataUrl;
            showToast("Audio importé — sauvegardez pour l'appliquer à l'invitation.");
            schedulePreviewRefresh(400);
        } catch {
            showToast("Impossible de lire le fichier audio.");
        }
        e.target.value = "";
    });
}

async function wireUploader(inputId, targetFieldId, previewId, multiple = false, max = 1) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const eventId = getEventId();
        const field = document.getElementById(targetFieldId);

        try {
            if (window.ButtonLoading) {
                ButtonLoading.setLoading(input.closest("label") || input, true, "Import…");
            }
            if (multiple) {
                const urls = [];
                for (const file of files.slice(0, max)) {
                    const url = window.MediaUpload
                        ? await MediaUpload.processFile(file, eventId, targetFieldId)
                        : (await filesToDataUrls([file]))[0];
                    urls.push(url);
                }
                const existing = parseList(field.value, max);
                field.value = [...existing, ...urls].slice(0, max).join(", ");
                if (targetFieldId === "dressImages") {
                    renderDressPreview(parseList(field.value, max));
                } else {
                    renderPreview(parseList(field.value, max));
                }
            } else {
                const url = window.MediaUpload
                    ? await MediaUpload.processFile(files[0], eventId, targetFieldId)
                    : (await filesToDataUrls([files[0]]))[0];
                field.value = url;
                if (previewId) renderSinglePreview(targetFieldId, previewId);
            }
            if (String(field.value).startsWith("http")) {
                showToast("Photo importée et envoyée au cloud.");
            } else {
                showToast("Photo importée — cliquez Sauvegarder pour sync multi-appareils.");
            }
            schedulePreviewRefresh(300);
            if (window.MediaUpload && MediaUpload.canUpload && MediaUpload.canUpload()) {
                setTimeout(() => {
                    persistDashboard(toDashboardPayload(readFormState()), { cloudMessage: false })
                        .then(() => refreshLivePreview(true))
                        .catch(() => refreshLivePreview(true));
                }, 400);
            } else {
                setTimeout(() => refreshLivePreview(true), 200);
            }
        } catch (err) {
            showToast(err.message || "Impossible d'importer cette photo.");
        } finally {
            if (window.ButtonLoading) {
                ButtonLoading.setLoading(input.closest("label") || input, false);
            }
            e.target.value = "";
        }
    });
}

async function persistDashboard(payload, { cloudMessage = true } = {}) {
    const eventId = getEventId();
    if (window.DashboardSync) {
        const result = await DashboardSync.save(eventId, payload);
        updateCloudStatus(result);
        if (cloudMessage) {
            if (result.cloud) {
                showToast("Sauvegardé et synchronisé — visible sur tous vos appareils.");
            } else if (result.localOk === false) {
                showToast("Mémoire saturée. Exécutez docs/SUPABASE-STORAGE.sql puis réimportez les photos.");
            } else if (window.MediaUpload && !MediaUpload.canUpload()) {
                showToast("Sauvegardé localement — configurez Supabase Storage pour sync multi-appareils.");
            } else {
                showToast("Sauvegardé localement — sync cloud échouée. Vérifiez Supabase (event_settings + Storage).");
            }
        }
        return result;
    }
    localStorage.setItem(LEGACY_DASHBOARD_KEY, JSON.stringify(payload));
    updateCloudStatus(null);
    return { saved: true, cloud: false };
}

function refreshLivePreview(forceReload = false) {
    if (previewPaused) return;
    const payload = toDashboardPayload(readFormState());
    const eventId = getEventId();
    const enriched = { ...payload, _savedAt: new Date().toISOString() };

    if (window.DashboardSync) {
        DashboardSync.writePreview(eventId, enriched);
    }

    const iframe = document.getElementById("live-preview");
    if (!iframe) return;

    const postPreview = () => {
        try {
            iframe.contentWindow?.postMessage(
                { type: "WEDDING_PREVIEW_STATE", payload: enriched },
                window.location.origin
            );
            if (iframe.contentWindow?.applyPreviewDashboardState) {
                iframe.contentWindow.applyPreviewDashboardState(enriched);
            }
        } catch (e) {
            /* iframe pas prête */
        }
    };

    const qs = new URLSearchParams({ event: eventId, preview: "1", _: String(Date.now()) });
    const nextSrc = `./invitation.html?${qs.toString()}`;

    const sameBase = iframe.src && iframe.src.includes("invitation.html") && iframe.src.includes("preview=1");
    if (!forceReload && sameBase && iframe.dataset.previewReady === "1") {
        postPreview();
        return;
    }

    iframe.onload = () => {
        iframe.dataset.previewReady = "1";
        [150, 500, 1200, 2200].forEach((ms) => setTimeout(postPreview, ms));
    };
    iframe.src = nextSrc;
}

function schedulePreviewRefresh(delay = 700) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshLivePreview, delay);
}

function wirePreviewAutoRefresh() {
    const form = document.getElementById("settings-form");
    if (!form) return;

    form.addEventListener("input", (e) => {
        if (e.target.type === "file") return;
        schedulePreviewRefresh();
    });
    form.addEventListener("change", (e) => {
        if (e.target.type === "file") {
            setTimeout(refreshLivePreview, 400);
        }
    });

    document.getElementById("add-program-step")?.addEventListener("click", () => schedulePreviewRefresh(200));
    document.getElementById("add-practical-item")?.addEventListener("click", () => schedulePreviewRefresh(200));

    document.getElementById("refresh-preview-btn")?.addEventListener("click", () => {
        refreshLivePreview();
        showToast("Aperçu rafraîchi.");
    });
}

function applyPreview() {
    const btn = document.getElementById("apply-preview-btn");
    const run = () => {
        const payload = toDashboardPayload(readFormState());
        return persistDashboard(payload, { cloudMessage: false }).then(() => {
            refreshLivePreview();
            showToast("Aperçu appliqué.");
        });
    };
    if (window.ButtonLoading && btn) {
        ButtonLoading.whileLoading(btn, run(), "Application…");
    } else {
        run();
    }
}

async function saveSettings(e) {
    e.preventDefault();
    const saveBtn = document.getElementById("save-settings-btn");
    const run = async () => {
        const state = readFormState();
        const payload = toDashboardPayload(state);
        await persistDashboard(payload);

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
        refreshLivePreview(true);
    };

    if (window.ButtonLoading && saveBtn) {
        await ButtonLoading.whileLoading(saveBtn, run(), "Sauvegarde…");
    } else {
        await run();
    }
}

async function resetDashboard() {
    const eventId = getEventId();
    localStorage.removeItem(LEGACY_DASHBOARD_KEY);
    if (window.DashboardSync) {
        localStorage.removeItem(DashboardSync.scopedKey(eventId));
    }
    hydrateForm({ ...DEFAULT_STATE, ...getConfigDefaults() });
    schedulePreviewRefresh(300);
    showToast("Configuration réinitialisée.");
}

function initScrollSpy() {
    const links = Array.from(document.querySelectorAll(".perso-nav a"));
    const sections = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = entry.target.id;
            links.forEach((link) => {
                link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
            });
        });
    }, { root: null, rootMarin: "-20% 0px -60% 0px", threshold: 0.1 });

    sections.forEach((sec) => observer.observe(sec));
    if (links[0]) links[0].classList.add("active");
}

function wireNavLinks() {
    if (!window.EventConfig || !EventConfig.preserveEventQuery) return;
    const q = EventConfig.preserveEventQuery();
    ["link-view-invitation", "link-open-invitation"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.href = `./invitation.html${q}`;
    });
    const admin = document.getElementById("link-admin");
    if (admin) admin.href = `./admin.html${q}`;
}

window.addEventListener("DOMContentLoaded", async () => {
    await EventConfig.init();
    const eventId = getEventId();
    if (window.AuthGuard && !AuthGuard.requireAdmin(eventId)) return;

    wireNavLinks();
    updateCloudStatus(null);

    document.getElementById("perso-logout-btn")?.addEventListener("click", () => {
        if (window.AuthGuard) AuthGuard.logout();
    });

    const cfg = EventConfig.getConfig();
    const state = await loadStateFromSync();
    if (!state.countdownDate && cfg && cfg.eventDate) {
        state.countdownDate = toDateTimeLocalValue(cfg.eventDate);
    }
    hydrateForm(state);

    document.getElementById("settings-form").addEventListener("submit", saveSettings);
    document.getElementById("apply-preview-btn").addEventListener("click", applyPreview);
    document.getElementById("reset-btn").addEventListener("click", resetDashboard);
    document.getElementById("add-program-step").addEventListener("click", () => {
        const root = document.getElementById("program-editor");
        const count = root.querySelectorAll(".perso-dynamic-item").length;
        root.appendChild(buildProgramRow({ time: "", title: "", color: PROGRAM_COLORS[count % PROGRAM_COLORS.length].value }, count));
    });
    document.getElementById("add-practical-item").addEventListener("click", () => {
        const root = document.getElementById("practical-editor");
        const count = root.querySelectorAll(".perso-dynamic-item").length;
        root.appendChild(buildPracticalRow({ icon: "info", title: "", text: "" }, count));
    });
    document.getElementById("add-drink-item")?.addEventListener("click", () => {
        const root = document.getElementById("drink-menu-editor");
        const count = root.querySelectorAll(".perso-drink-row").length;
        if (count >= 8) {
            showToast("Maximum 8 boissons.");
            return;
        }
        const fallbackImage = window.DrinkGenericImages
            ? DrinkGenericImages.fallbackUrl(count)
            : (getDefaultDrinkMenu()[count]?.imageUrl || "");
        root.appendChild(buildDrinkRow({ name: "", description: "", imageUrl: fallbackImage }, count));
    });

    document.getElementById("drinkMenuTitle")?.addEventListener("input", () => schedulePreviewRefresh());
    document.getElementById("drinkMenuSubtitle")?.addEventListener("input", () => schedulePreviewRefresh());

    document.getElementById("subtitle").addEventListener("input", () => {
        const left = document.getElementById("coupleNameLeft");
        const right = document.getElementById("coupleNameRight");
        if (!left.value.trim() && !right.value.trim()) {
            const p = parseCoupleFromSubtitle(document.getElementById("subtitle").value);
            left.value = p.left;
            right.value = p.right;
        }
        schedulePreviewRefresh();
    });

    document.getElementById("bestPhotos").addEventListener("input", () => renderPreview(parseList(document.getElementById("bestPhotos").value, 12)));
    document.getElementById("dressImages").addEventListener("input", () => renderDressPreview(parseList(document.getElementById("dressImages").value, 8)));
    document.getElementById("heroImage").addEventListener("input", () => renderSinglePreview("heroImage", "preview-heroImage"));
    document.getElementById("welcomeImage").addEventListener("input", () => renderSinglePreview("welcomeImage", "preview-welcomeImage"));
    document.getElementById("mapImage").addEventListener("input", () => renderSinglePreview("mapImage", "preview-mapImage"));
    document.getElementById("aboutImage").addEventListener("input", () => renderSinglePreview("aboutImage", "preview-aboutImage"));

    await wireUploader("upload-hero", "heroImage", "preview-heroImage");
    await wireUploader("upload-welcome", "welcomeImage", "preview-welcomeImage");
    await wireUploader("upload-map", "mapImage", "preview-mapImage");
    await wireUploader("upload-about", "aboutImage", "preview-aboutImage");
    await wireUploader("upload-best", "bestPhotos", null, true, 12);
    await wireUploader("upload-dress", "dressImages", null, true, 8);

    initScrollSpy();
    wirePreviewAutoRefresh();
    wireMusicControls();
    refreshLivePreview();
});
