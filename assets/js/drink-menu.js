/**
 * Menu des boissons — cartes visuelles, sélection multiple optionnelle
 */
const DrinkMenu = (() => {
    const DEFAULT_ITEMS = [
        {
            id: "champagne",
            name: "Champagne",
            description: "Bulles fines & festive",
            imageUrl: "https://images.unsplash.com/photo-1519677100109-f976370db247?auto=format&fit=crop&w=500&q=80"
        },
        {
            id: "vin-rouge",
            name: "Vin rouge",
            description: "Cépage sélectionné",
            imageUrl: "https://images.unsplash.com/photo-1510818131224-0016b2e85605?auto=format&fit=crop&w=500&q=80"
        },
        {
            id: "vin-blanc",
            name: "Vin blanc",
            description: "Fraîcheur & élégance",
            imageUrl: "https://images.unsplash.com/photo-1569529466461-2e03124697b8?auto=format&fit=crop&w=500&q=80"
        },
        {
            id: "jus-fruits",
            name: "Jus de fruits",
            description: "Mangue, orange, ananas",
            imageUrl: "https://images.unsplash.com/photo-1613478223719-2ab1183d1777?auto=format&fit=crop&w=500&q=80"
        },
        {
            id: "eau",
            name: "Eau minérale",
            description: "Plate ou gazeuse",
            imageUrl: "https://images.unsplash.com/photo-1548839140-29a7491761af?auto=format&fit=crop&w=500&q=80"
        },
        {
            id: "soft",
            name: "Soft / soda",
            description: "Cola, tonic, limonade",
            imageUrl: "https://images.unsplash.com/photo-1622483767028-3fb1460979ed?auto=format&fit=crop&w=500&q=80"
        }
    ];

    let menuItems = [];
    let selected = new Set();
    let eventId = "yanick-keren";

    function getEventId() {
        if (window.EventConfig && EventConfig.isReady && EventConfig.isReady()) {
            return EventConfig.getEventId();
        }
        return new URLSearchParams(window.location.search).get("event") || eventId;
    }

    function storageKey() {
        return `wedding_drink_pick_${getEventId()}`;
    }

    function slugify(text) {
        return (text || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    }

    function escapeHtml(str) {
        return (str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function normalizeMenu(state) {
        if (Array.isArray(state?.drinkMenu) && state.drinkMenu.length) {
            return state.drinkMenu
                .slice(0, 8)
                .map((item, index) => ({
                    id: item.id || slugify(item.name) || `drink-${index}`,
                    name: String(item.name || "").trim(),
                    description: String(item.description || "").trim(),
                    imageUrl: String(item.imageUrl || DEFAULT_ITEMS[index % DEFAULT_ITEMS.length].imageUrl).trim()
                }))
                .filter((item) => item.name);
        }
        const legacy = Array.isArray(state?.drinkMenuOptions) ? state.drinkMenuOptions : [];
        if (legacy.length) {
            return legacy.slice(0, 8).map((name, index) => ({
                id: slugify(name) || `drink-${index}`,
                name: String(name).trim(),
                description: "",
                imageUrl: DEFAULT_ITEMS[index % DEFAULT_ITEMS.length].imageUrl
            })).filter((item) => item.name);
        }
        return DEFAULT_ITEMS.slice();
    }

    function loadSelection() {
        try {
            const raw = sessionStorage.getItem(storageKey());
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                selected = new Set(parsed.filter(Boolean));
            }
        } catch (e) {}
    }

    function saveSelection() {
        try {
            sessionStorage.setItem(storageKey(), JSON.stringify(Array.from(selected)));
        } catch (e) {}
    }

    function renderCards(container, { compact = false } = {}) {
        if (!container) return;
        if (!menuItems.length) {
            container.innerHTML = "";
            return;
        }
        container.innerHTML = menuItems.map((item) => {
            const checked = selected.has(item.name) ? "checked" : "";
            const selectedClass = selected.has(item.name) ? " is-selected" : "";
            return `
                <label class="drink-card${selectedClass}${compact ? " drink-card--compact" : ""}" data-drink-name="${escapeHtml(item.name)}">
                    <input type="checkbox" class="drink-card-input" name="guest-drink" value="${escapeHtml(item.name)}" ${checked}>
                    <div class="drink-card-media">
                        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">
                        <span class="drink-card-check" aria-hidden="true">✓</span>
                    </div>
                    <div class="drink-card-body">
                        <strong class="drink-card-title">${escapeHtml(item.name)}</strong>
                        ${item.description ? `<span class="drink-card-desc">${escapeHtml(item.description)}</span>` : ""}
                    </div>
                </label>`;
        }).join("");

        container.querySelectorAll(".drink-card-input").forEach((input) => {
            input.addEventListener("change", () => {
                if (input.checked) selected.add(input.value);
                else selected.delete(input.value);
                saveSelection();
                syncAllContainers();
            });
        });
    }

    function syncAllContainers() {
        document.querySelectorAll(".drink-card-input").forEach((input) => {
            const shouldCheck = selected.has(input.value);
            input.checked = shouldCheck;
            const card = input.closest(".drink-card");
            if (card) card.classList.toggle("is-selected", shouldCheck);
        });
    }

    function apply(state) {
        eventId = getEventId();
        menuItems = normalizeMenu(state);
        loadSelection();

        const pageSection = document.getElementById("drink-menu-section");
        const pageGrid = document.getElementById("drink-menu-grid");
        const rsvpSection = document.getElementById("rsvp-drinks-section");
        const rsvpGrid = document.getElementById("rsvp-drink-options");
        const titleEl = document.getElementById("drink-menu-title");
        const subtitleEl = document.getElementById("drink-menu-subtitle");
        const rsvpHint = document.getElementById("rsvp-drinks-hint");

        const title = state?.drinkMenuTitle || "Menu des boissons";
        const subtitle = state?.drinkMenuSubtitle
            || "Sélectionnez vos préférences pour le jour J (optionnel, plusieurs choix possibles).";

        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle;
        if (rsvpHint) rsvpHint.textContent = subtitle;

        if (!menuItems.length) {
            pageSection?.classList.add("hidden");
            rsvpSection?.classList.add("hidden");
            if (pageGrid) pageGrid.innerHTML = "";
            if (rsvpGrid) rsvpGrid.innerHTML = "";
            return;
        }

        pageSection?.classList.remove("hidden");
        rsvpSection?.classList.remove("hidden");
        renderCards(pageGrid, { compact: false });
        renderCards(rsvpGrid, { compact: true });
        syncAllContainers();

        if (window.lucide && typeof lucide.createIcons === "function") {
            lucide.createIcons();
        }
    }

    function getSelected() {
        return Array.from(selected).filter(Boolean);
    }

    function setSelected(names) {
        selected = new Set((names || []).filter(Boolean));
        saveSelection();
        syncAllContainers();
    }

    function syncToRsvp() {
        syncAllContainers();
    }

    return {
        DEFAULT_ITEMS,
        normalizeMenu,
        apply,
        getSelected,
        setSelected,
        syncToRsvp
    };
})();

window.DrinkMenu = DrinkMenu;
