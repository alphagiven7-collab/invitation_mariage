/**
 * Menu des boissons — cartes visuelles, sélection multiple optionnelle
 */
const DrinkMenu = (() => {
    function getDefaults() {
        if (window.DrinkGenericImages && typeof DrinkGenericImages.getDefaultItems === "function") {
            return DrinkGenericImages.getDefaultItems();
        }
        return [];
    }

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

    function resolveItemImage(item, index) {
        if (window.DrinkGenericImages && typeof DrinkGenericImages.resolveImageUrl === "function") {
            return DrinkGenericImages.resolveImageUrl(item, index);
        }
        return String(item?.imageUrl || "").trim();
    }

    function normalizeMenu(state) {
        const defaults = getDefaults();
        if (Array.isArray(state?.drinkMenu) && state.drinkMenu.length) {
            return state.drinkMenu
                .slice(0, 8)
                .map((item, index) => ({
                    id: item.id || slugify(item.name) || `drink-${index}`,
                    name: String(item.name || "").trim(),
                    description: String(item.description || "").trim(),
                    imageUrl: resolveItemImage(item, index)
                }))
                .filter((item) => item.name);
        }
        const legacy = Array.isArray(state?.drinkMenuOptions) ? state.drinkMenuOptions : [];
        if (legacy.length) {
            return legacy.slice(0, 8).map((name, index) => {
                const id = slugify(name) || `drink-${index}`;
                return {
                    id,
                    name: String(name).trim(),
                    description: "",
                    imageUrl: resolveItemImage({ id, name }, index)
                };
            }).filter((item) => item.name);
        }
        return defaults.slice();
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
        container.innerHTML = menuItems.map((item, index) => {
            const checked = selected.has(item.name) ? "checked" : "";
            const selectedClass = selected.has(item.name) ? " is-selected" : "";
            const fallback = window.DrinkGenericImages
                ? DrinkGenericImages.fallbackUrl(index)
                : item.imageUrl;
            return `
                <label class="drink-card${selectedClass}${compact ? " drink-card--compact" : ""}" data-drink-name="${escapeHtml(item.name)}">
                    <input type="checkbox" class="drink-card-input" name="guest-drink" value="${escapeHtml(item.name)}" ${checked}>
                    <div class="drink-card-media">
                        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" data-fallback="${escapeHtml(fallback)}" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback;}">
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
        getDefaultItems: getDefaults,
        normalizeMenu,
        apply,
        getSelected,
        setSelected,
        syncToRsvp
    };
})();

window.DrinkMenu = DrinkMenu;
