(() => {
    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function eventTypeLabel(type) {
        const labels = {
            wedding: "Mariage",
            birthday: "Anniversaire",
            conference: "Conférence",
            party: "Événement"
        };
        return labels[type] || "Événement";
    }

    function eventTypeIcon(type) {
        const icons = { wedding: "💍", birthday: "🎂", conference: "🎤", party: "🎉" };
        return icons[type] || "✦";
    }

    async function getEventDetails(summary) {
        if (!window.EventConfig || !EventConfig.loadEvent) return summary;
        try {
            return await EventConfig.loadEvent(summary.slug);
        } catch {
            return summary;
        }
    }

    function mergeEvents(cloudEvents, localEvents) {
        const bySlug = new Map();
        [...(cloudEvents || []), ...(localEvents || [])].forEach((event) => {
            if (!event?.slug) return;
            bySlug.set(event.slug, { ...bySlug.get(event.slug), ...event });
        });
        return Array.from(bySlug.values());
    }

    function getRecentlyCreatedEvent() {
        try {
            const raw = sessionStorage.getItem("wedding_recently_created_event");
            sessionStorage.removeItem("wedding_recently_created_event");
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function getInvitationUrl(slug) {
        const url = new URL("./invitation.html", window.location.href);
        url.searchParams.set("event", slug);
        return url.toString();
    }

    async function shareInvitation(slug, title) {
        const url = getInvitationUrl(slug);
        const text = `Voici votre invitation : ${title}`;
        try {
            if (navigator.share) {
                await navigator.share({ title, text, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            alert("Lien de l'invitation copié.");
        } catch (error) {
            if (error?.name === "AbortError") return;
            window.prompt("Copiez ce lien d'invitation :", url);
        }
    }

    async function deleteEvent(slug, title) {
        const firstConfirmation = window.confirm(
            `Supprimer définitivement l'événement « ${title} » ?\n\nLes invités, RSVP, check-in, réglages et médias seront effacés.`
        );
        if (!firstConfirmation) return;
        const typed = window.prompt(`Pour confirmer, écrivez SUPPRIMER :\n\n${title}`);
        if (typed !== "SUPPRIMER") return;

        try {
            await CloudAPI.deleteEvent(slug);
            EventConfig.discardLocalEvent(slug);
            const card = document.querySelector(`[data-event-slug="${CSS.escape(slug)}"]`);
            card?.remove();
            const remaining = document.querySelectorAll("[data-event-slug]").length;
            document.getElementById("events-count").textContent = String(remaining);
            document.getElementById("events-empty").classList.toggle("hidden", remaining !== 0);
            document.getElementById("events-feedback").textContent = "Événement supprimé définitivement.";
        } catch (error) {
            window.alert(error.message || "Suppression impossible.");
        }
    }

    function renderEvent(event) {
        const slug = escapeHtml(event.slug);
        const title = escapeHtml(event.title || event.slug);
        const subtitle = escapeHtml(event.subtitle || [event.coupleLeft, event.coupleRight].filter(Boolean).join(" & "));
        const welcomeImage = event.branding?.welcomeImage || "";
        const image = welcomeImage
            ? `<img class="event-card-image" src="${escapeHtml(welcomeImage)}" alt="Photo d'accueil de ${title}">`
            : '<div class="event-card-image event-card-image--empty">Aucune photo d’accueil</div>';

        return `<article class="event-card" data-event-slug="${slug}" data-search="${`${event.title || ""} ${event.slug || ""} ${event.type || ""}`.toLowerCase()}">
            ${image}
            <div class="event-card-body">
                <div class="event-card-meta">
                    <span>${eventTypeIcon(event.type)} ${eventTypeLabel(event.type)}</span>
                    <span>${event.createdAt ? new Date(event.createdAt).toLocaleDateString("fr-FR") : "Démo"}</span>
                </div>
                <h2 class="event-card-title">${title}</h2>
                <p class="event-card-subtitle">${subtitle}</p>
                <code class="event-card-slug">?event=${slug}</code>
                <div class="event-card-actions">
                    <a class="admin-btn admin-btn-primary" href="./personnalisation.html?event=${slug}">Personnaliser</a>
                    <a class="admin-btn admin-btn-success" href="./admin.html?event=${slug}">Invités</a>
                    <a class="admin-btn admin-btn-ghost" href="./checkin.html?event=${slug}">Check-in</a>
                    <button type="button" class="admin-btn admin-btn-ghost" data-share-event="${slug}" data-share-title="${title}">Partager</button>
                    <a class="admin-btn admin-btn-ghost event-card-preview" href="./invitation.html?event=${slug}" target="_blank" rel="noopener">Voir l'invitation</a>
                    <button type="button" class="admin-btn admin-btn-danger event-card-delete" data-delete-event="${slug}" data-delete-title="${title}">Supprimer</button>
                </div>
            </div>
        </article>`;
    }

    async function init() {
        await EventConfig.init();
        if (!AuthGuard.isPlatformAdmin()) {
            const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
            window.location.href = `./login.html?redirect=${redirect}`;
            return;
        }

        const grid = document.getElementById("events-grid");
        const count = document.getElementById("events-count");
        const feedback = document.getElementById("events-feedback");
        const empty = document.getElementById("events-empty");
        const localEvents = EventConfig.getRegisteredEvents();
        let cloudEvents;
        try {
            cloudEvents = window.CloudAPI && CloudAPI.getEvents
                ? await CloudAPI.getEvents()
                : [];
        } catch (error) {
            grid.innerHTML = "";
            count.textContent = "0";
            feedback.textContent = error.message || "Impossible de charger les événements.";
            empty.classList.remove("hidden");
            return;
        }
        const recentlyCreated = getRecentlyCreatedEvent();
        const summaries = mergeEvents(
            recentlyCreated ? [recentlyCreated, ...cloudEvents] : cloudEvents,
            localEvents
        );
        const events = await Promise.all(summaries.map(getEventDetails));

        grid.innerHTML = events.map(renderEvent).join("");
        grid.querySelectorAll("[data-share-event]").forEach((button) => {
            button.addEventListener("click", () => {
                shareInvitation(button.dataset.shareEvent, button.dataset.shareTitle);
            });
        });
        grid.querySelectorAll("[data-delete-event]").forEach((button) => {
            button.addEventListener("click", () => {
                deleteEvent(button.dataset.deleteEvent, button.dataset.deleteTitle);
            });
        });
        count.textContent = String(events.length);
        feedback.textContent = "Les événements auxquels votre compte a accès sont affichés ici.";
        empty.classList.toggle("hidden", events.length !== 0);

        document.getElementById("events-search").addEventListener("input", (e) => {
            const query = e.target.value.trim().toLowerCase();
            let visible = 0;
            grid.querySelectorAll(".event-card").forEach((card) => {
                const matches = !query || card.dataset.search.includes(query);
                card.hidden = !matches;
                if (matches) visible += 1;
            });
            empty.classList.toggle("hidden", visible !== 0);
            feedback.textContent = query
                ? `${visible} événement(s) trouvé(s).`
                : "Les événements auxquels votre compte a accès sont affichés ici.";
        });

        document.getElementById("events-logout-btn").addEventListener("click", () => AuthGuard.logout());
    }

    window.addEventListener("DOMContentLoaded", init);
})();
