/**
 * Images génériques locales pour le menu boissons (SVG, sans dépendance externe)
 */
const DrinkGenericImages = (() => {
    const FILE_BY_ID = {
        champagne: "champagne.svg",
        "vin-rouge": "vin-rouge.svg",
        "vin-blanc": "vin-blanc.svg",
        "jus-fruits": "jus-fruits.svg",
        jus: "jus-fruits.svg",
        eau: "eau.svg",
        soft: "soft.svg",
        cocktail: "generic.svg",
        biere: "generic.svg"
    };

    const ORDER = [
        "champagne.svg",
        "vin-rouge.svg",
        "vin-blanc.svg",
        "jus-fruits.svg",
        "eau.svg",
        "soft.svg",
        "generic.svg",
        "generic.svg"
    ];

    const DEFAULT_ITEMS = [
        { id: "champagne", name: "Champagne", description: "Bulles fines & festive", imageKey: "champagne" },
        { id: "vin-rouge", name: "Vin rouge", description: "Cépage sélectionné", imageKey: "vin-rouge" },
        { id: "vin-blanc", name: "Vin blanc", description: "Fraîcheur & élégance", imageKey: "vin-blanc" },
        { id: "jus-fruits", name: "Jus de fruits", description: "Mangue, orange, ananas", imageKey: "jus-fruits" },
        { id: "eau", name: "Eau minérale", description: "Plate ou gazeuse", imageKey: "eau" },
        { id: "soft", name: "Soft / soda", description: "Cola, tonic, limonade", imageKey: "soft" }
    ];

    function assetsBase() {
        const path = window.location.pathname || "";
        if (path.includes("/pages/")) return "../assets/images/drinks/";
        return "./assets/images/drinks/";
    }

    function slugify(text) {
        return (text || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    }

    function urlForFile(filename) {
        return `${assetsBase()}${filename}`;
    }

    function urlForId(id, index = 0) {
        const key = slugify(id);
        const file = FILE_BY_ID[key] || ORDER[index % ORDER.length] || "generic.svg";
        return urlForFile(file);
    }

    function resolveImageUrl(item, index = 0) {
        const custom = String(item?.imageUrl || "").trim();
        if (custom) return custom;
        const id = item?.id || slugify(item?.name);
        return urlForId(id, index);
    }

    function getDefaultItems() {
        return DEFAULT_ITEMS.map((item, index) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            imageUrl: urlForId(item.imageKey || item.id, index)
        }));
    }

    function fallbackUrl(index = 0) {
        return urlForFile(ORDER[index % ORDER.length] || "generic.svg");
    }

    return {
        DEFAULT_ITEMS,
        ORDER,
        assetsBase,
        urlForFile,
        urlForId,
        resolveImageUrl,
        getDefaultItems,
        fallbackUrl,
        slugify
    };
})();

window.DrinkGenericImages = DrinkGenericImages;
