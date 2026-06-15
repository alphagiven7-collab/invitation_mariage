let galleryImages = [];
let galleryIndex = 0;

function applySettings() {
    const s = WeddingDB.getSettings();
    document.documentElement.style.setProperty("--primary-color", s.primaryColor);
    document.documentElement.style.setProperty("--accent-color", s.accentColor);
    document.documentElement.style.setProperty("--hero-image", `url('${s.heroImage}')`);
    document.documentElement.style.setProperty("--welcome-image", `url('${s.welcomeImage}')`);

    document.getElementById("hero-title").textContent = s.title;
    document.getElementById("hero-subtitle").textContent = s.subtitle;
    document.getElementById("invite-message").textContent = s.message;

    galleryImages = s.bestPhotos.filter(Boolean);
    const grid = document.getElementById("best-photo-grid");
    grid.innerHTML = "";
    galleryImages.forEach((src, i) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = `photo-${i + 1}`;
        img.onclick = () => openGallery(i);
        grid.appendChild(img);
    });
}

function openGallery(index = 0) {
    if (!galleryImages.length) return;
    galleryIndex = index;
    document.getElementById("gallery-modal").classList.add("open");
    document.body.style.overflow = "hidden";
    renderGallery();
}

function closeGallery() {
    document.getElementById("gallery-modal").classList.remove("open");
    document.body.style.overflow = "auto";
}

function moveGallery(step) {
    galleryIndex += step;
    if (galleryIndex < 0) galleryIndex = galleryImages.length - 1;
    if (galleryIndex >= galleryImages.length) galleryIndex = 0;
    renderGallery();
}

function renderGallery() {
    const main = document.getElementById("gallery-main-image");
    main.src = galleryImages[galleryIndex];
    document.getElementById("gallery-count").textContent = `Photo ${galleryIndex + 1} / ${galleryImages.length}`;

    const dots = document.getElementById("gallery-dots");
    dots.innerHTML = "";
    galleryImages.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.className = `dot ${i === galleryIndex ? "active" : ""}`;
        dot.onclick = () => {
            galleryIndex = i;
            renderGallery();
        };
        dots.appendChild(dot);
    });
}

document.addEventListener("keydown", (e) => {
    const opened = document.getElementById("gallery-modal").classList.contains("open");
    if (!opened) return;
    if (e.key === "ArrowRight") moveGallery(1);
    if (e.key === "ArrowLeft") moveGallery(-1);
    if (e.key === "Escape") closeGallery();
});

window.addEventListener("DOMContentLoaded", applySettings);
