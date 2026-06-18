/**
 * Commander un modèle — parcours UX sur mesure (offres.html)
 */
(function () {
    const WHATSAPP_PHONE = "243845370370";
    const BRAND = "Michelline";

    const MODELS = {
        mariage: {
            id: "mariage",
            label: "Mariage",
            emoji: "💍",
            demo: "./invitation.html?event=yanick-keren",
            palette: ["#6b2c3e", "#c9a962", "#fdf2f8"]
        },
        anniversaire: {
            id: "anniversaire",
            label: "Anniversaire",
            emoji: "🎂",
            demo: "./invitation.html?event=anniversaire-grace",
            palette: ["#7c3aed", "#f59e0b", "#faf5ff"]
        },
        conference: {
            id: "conference",
            label: "Conférence",
            emoji: "🎤",
            demo: "./invitation.html?event=conference-tech-2026",
            palette: ["#2563eb", "#06b6d4", "#eff6ff"]
        },
        surmesure: {
            id: "surmesure",
            label: "Sur mesure",
            emoji: "✦",
            demo: "",
            palette: ["#831843", "#c9a962", "#fafafa"]
        }
    };

    const MOODS = [
        { id: "elegant", label: "Élégant" },
        { id: "moderne", label: "Moderne" },
        { id: "festif", label: "Festif" },
        { id: "corporate", label: "Corporate" },
        { id: "romantique", label: "Romantique" },
        { id: "minimal", label: "Minimaliste" }
    ];

    const EXTRAS = [
        { id: "rsvp", label: "RSVP en ligne" },
        { id: "qr", label: "QR code jour J" },
        { id: "drinks", label: "Menu boissons" },
        { id: "print", label: "Cartes physiques" },
        { id: "guestbook", label: "Livre d'or" },
        { id: "reminders", label: "Relances auto" }
    ];

    let step = 1;
    let state = createEmptyState();

    function createEmptyState() {
        return {
            model: "mariage",
            eventName: "",
            eventDate: "",
            guestCount: "",
            city: "",
            mood: "elegant",
            extras: ["rsvp", "qr"],
            notes: "",
            contactName: "",
            contactPhone: ""
        };
    }

    function $(id) {
        return document.getElementById(id);
    }

    function qsa(sel, root) {
        return Array.from((root || document).querySelectorAll(sel));
    }

    function buildWhatsAppUrl() {
        const model = MODELS[state.model] || MODELS.mariage;
        const mood = MOODS.find((m) => m.id === state.mood)?.label || state.mood;
        const extras = state.extras
            .map((id) => EXTRAS.find((e) => e.id === id)?.label)
            .filter(Boolean)
            .join(", ");

        const lines = [
            `Bonjour ${BRAND}, je souhaite commander un modèle *${model.label}*.`,
            "",
            `📌 Événement : ${state.eventName || "—"}`,
            `📅 Date : ${state.eventDate || "—"}`,
            `👥 Invités : ${state.guestCount || "—"}`,
            `📍 Ville : ${state.city || "—"}`,
            `🎨 Ambiance : ${mood}`,
            extras ? `✨ Options : ${extras}` : "",
            state.notes ? `💬 Notes : ${state.notes}` : "",
            "",
            `Contact : ${state.contactName || "—"} · ${state.contactPhone || "—"}`
        ].filter(Boolean);

        return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(lines.join("\n"))}`;
    }

    function updateProgress() {
        qsa("[data-commander-step-dot]").forEach((dot) => {
            const n = Number(dot.getAttribute("data-commander-step-dot"));
            dot.classList.toggle("is-active", n === step);
            dot.classList.toggle("is-done", n < step);
        });
        qsa("[data-commander-panel]").forEach((panel) => {
            panel.hidden = Number(panel.getAttribute("data-commander-panel")) !== step;
        });
        const back = $("commander-back");
        const next = $("commander-next");
        const send = $("commander-send");
        if (back) back.hidden = step === 1;
        if (next) next.hidden = step === 3;
        if (send) send.hidden = step !== 3;
        syncSummary();
    }

    function syncSummary() {
        const model = MODELS[state.model];
        const mood = MOODS.find((m) => m.id === state.mood)?.label || "";
        const extras = state.extras
            .map((id) => EXTRAS.find((e) => e.id === id)?.label)
            .filter(Boolean)
            .join(" · ");

        const set = (id, val) => {
            const el = $(id);
            if (el) el.textContent = val || "—";
        };

        set("commander-summary-model", model ? `${model.emoji} ${model.label}` : "—");
        set("commander-summary-event", state.eventName);
        set("commander-summary-date", state.eventDate);
        set("commander-summary-guests", state.guestCount);
        set("commander-summary-city", state.city);
        set("commander-summary-mood", mood);
        set("commander-summary-extras", extras || "—");
        set("commander-summary-notes", state.notes || "—");
    }

    function readFormFields() {
        state.eventName = $("commander-event-name")?.value.trim() || "";
        state.eventDate = $("commander-event-date")?.value || "";
        state.guestCount = $("commander-guest-count")?.value.trim() || "";
        state.city = $("commander-city")?.value.trim() || "";
        state.notes = $("commander-notes")?.value.trim() || "";
        state.contactName = $("commander-contact-name")?.value.trim() || "";
        state.contactPhone = $("commander-contact-phone")?.value.trim() || "";
    }

    function validateStep() {
        readFormFields();
        if (step === 2) {
            if (!state.eventName || state.eventName.length < 2) {
                toast("Indiquez le nom de l'événement.");
                return false;
            }
            if (!state.guestCount) {
                toast("Indiquez le nombre d'invités estimé.");
                return false;
            }
        }
        if (step === 3) {
            if (!state.contactName || state.contactName.length < 2) {
                toast("Votre prénom est requis.");
                return false;
            }
            if ((state.contactPhone || "").replace(/\D/g, "").length < 9) {
                toast("Numéro WhatsApp invalide (9 chiffres min.).");
                return false;
            }
        }
        return true;
    }

    function toast(msg) {
        const el = $("commander-toast");
        if (!el) return alert(msg);
        el.textContent = msg;
        el.classList.add("is-visible");
        clearTimeout(toast._t);
        toast._t = setTimeout(() => el.classList.remove("is-visible"), 2400);
    }

    function openModal(presetModel) {
        const modal = $("commander-modal");
        if (!modal) return;
        step = 1;
        state = createEmptyState();
        if (presetModel && MODELS[presetModel]) state.model = presetModel;

        qsa(".commander-model-card").forEach((card) => {
            card.classList.toggle("is-selected", card.getAttribute("data-model") === state.model);
        });
        qsa(".commander-mood-chip").forEach((chip) => {
            chip.classList.toggle("is-selected", chip.getAttribute("data-mood") === state.mood);
        });
        qsa(".commander-extra-chip input").forEach((input) => {
            input.checked = state.extras.includes(input.value);
        });

        ["commander-event-name", "commander-event-date", "commander-guest-count", "commander-city",
            "commander-notes", "commander-contact-name", "commander-contact-phone"].forEach((id) => {
            const el = $(id);
            if (el) el.value = "";
        });

        updateProgress();
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("commander-open");
        $("commander-event-name")?.focus();
    }

    function closeModal() {
        const modal = $("commander-modal");
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("commander-open");
    }

    function bindModelCards() {
        qsa(".commander-model-card").forEach((card) => {
            card.addEventListener("click", () => {
                state.model = card.getAttribute("data-model") || "mariage";
                qsa(".commander-model-card").forEach((c) => c.classList.remove("is-selected"));
                card.classList.add("is-selected");
            });
        });
    }

    function bindMoodChips() {
        qsa(".commander-mood-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                state.mood = chip.getAttribute("data-mood") || "elegant";
                qsa(".commander-mood-chip").forEach((c) => c.classList.remove("is-selected"));
                chip.classList.add("is-selected");
            });
        });
    }

    function bindExtras() {
        qsa(".commander-extra-chip input").forEach((input) => {
            input.addEventListener("change", () => {
                state.extras = qsa(".commander-extra-chip input:checked").map((i) => i.value);
            });
        });
    }

    function bindTriggers() {
        qsa("[data-open-commander]").forEach((el) => {
            el.addEventListener("click", (e) => {
                e.preventDefault();
                openModal(el.getAttribute("data-open-commander") || "");
            });
        });
    }

    function bindModalControls() {
        $("commander-close")?.addEventListener("click", closeModal);
        $("commander-backdrop")?.addEventListener("click", closeModal);
        $("commander-back")?.addEventListener("click", () => {
            if (step > 1) {
                step -= 1;
                updateProgress();
            }
        });
        $("commander-next")?.addEventListener("click", () => {
            if (!validateStep()) return;
            if (step < 3) {
                step += 1;
                updateProgress();
            }
        });
        $("commander-send")?.addEventListener("click", () => {
            if (!validateStep()) return;
            window.open(buildWhatsAppUrl(), "_blank", "noopener");
            toast("Ouverture WhatsApp — votre demande est prête à envoyer.");
            setTimeout(closeModal, 800);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && document.body.classList.contains("commander-open")) {
                closeModal();
            }
        });
    }

    function init() {
        bindModelCards();
        bindMoodChips();
        bindExtras();
        bindTriggers();
        bindModalControls();
    }

    document.addEventListener("DOMContentLoaded", init);

    window.OffresCommander = { open: openModal, MODELS };
})();
