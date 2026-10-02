/**
 * Blocs de contenu personnalisables — programme, lieu, infos pratiques
 */
const ContentBlocks = (() => {
    const PROGRAM_COLORS = ["blue", "green", "pink", "purple", "indigo", "amber"];
    const DEFAULT_DRESS_CODE_COLORS = ["#f4e1e1", "#5a2a35", "#2d3748"];
    const VENUE_TYPES = { civil: "Mariage civil", religious: "Cérémonie religieuse", reception: "Réception", other: "Autre rendez-vous" };

    function normalizeVenues(state = {}) {
        const legacy = {
            name: state.venueTitle ?? (typeof state.venue === "string" ? state.venue : state.venue?.title) ?? "",
            address: state.venueAddress ?? state.venueDetails?.address ?? "",
            time: state.venueTime ?? state.venueDetails?.time ?? "",
            mapLink: state.mapLink ?? state.links?.map ?? state.venueDetails?.mapLink ?? "",
            lat: state.venueLat ?? state.venueDetails?.lat ?? "",
            lng: state.venueLng ?? state.venueDetails?.lng ?? "",
            mapImage: state.mapImage ?? state.venueDetails?.mapImage ?? ""
        };
        const entries = Array.isArray(state.venues) ? state.venues : [legacy];
        return entries.filter((entry) => entry && typeof entry === "object").map((entry, index) => {
            const read = (key) => String(entry[key] ?? "").trim();
            return {
                id: read("id") || `venue-${index + 1}`,
                type: Object.hasOwn(VENUE_TYPES, entry.type) ? entry.type : "other",
                label: read("label"),
                name: read("name"), address: read("address"), time: read("time"),
                mapLink: sanitizeExternalUrl(entry.mapLink),
                lat: read("lat"), lng: read("lng"), mapImage: read("mapImage")
            };
        }).filter((venue) => venue.name || venue.address || venue.time || venue.mapLink || venue.lat || venue.lng);
    }

    function venueLabel(venue) {
        return venue.label || VENUE_TYPES[venue.type] || VENUE_TYPES.other;
    }

    function venueToLegacy(venue = {}) {
        return {
            venueTitle: venue.name || "", venueAddress: venue.address || "", venueTime: venue.time || "",
            venueLat: venue.lat || "", venueLng: venue.lng || "", mapLink: venue.mapLink || "", mapImage: venue.mapImage || ""
        };
    }
    const DEFAULT_PROGRAM = [
        { time: "19h30 - 20h00", title: "Arrivée des invités", color: "blue" },
        { time: "20h00 - 20h30", title: "Emplacements", color: "green" },
        { time: "20h30 - 21h00", title: "Entrée des mariés", color: "pink" },
        { time: "21h00 - 23h30", title: "Danses et spectacles", color: "purple" }
    ];

    const DEFAULT_PRACTICAL = [
        { icon: "car", title: "PARKING", text: "Le parking est disponible, disposant de 200 places." },
        { icon: "bed", title: "HÉBERGEMENT", text: "Hôtel le Pullman à 5 min." },
        { icon: "wine", title: "BOÎTE À BOISSON", text: "Merci de ne pas apporter de boisson de l'extérieur." }
    ];

    function escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function sanitizeExternalUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        try {
            const url = new URL(raw, window.location?.href || "https://example.invalid/");
            return url.protocol === "https:" ? url.href : "";
        } catch {
            return "";
        }
    }

    function isGoogleMapsUrl(url) {
        const host = String(url.hostname || "").toLowerCase();
        return host === "maps.app.goo.gl"
            || host === "google.com"
            || host.endsWith(".google.com");
    }

    function buildMapUrl(state) {
        const customMapUrl = sanitizeExternalUrl(state.mapLink);
        if (customMapUrl) return customMapUrl;
        if (state.venueLat && state.venueLng) {
            return `https://maps.google.com/?q=${encodeURIComponent(state.venueLat)},${encodeURIComponent(state.venueLng)}`;
        }
        if (state.venueAddress) {
            return `https://maps.google.com/?q=${encodeURIComponent(state.venueAddress)}`;
        }
        if (state.venueTitle) return `https://maps.google.com/?q=${encodeURIComponent(state.venueTitle)}`;
        return "";
    }

    function buildMapEmbedUrl(state) {
        const customMapUrl = sanitizeExternalUrl(state.mapLink);
        if (customMapUrl) {
            const mapUrl = new URL(customMapUrl);
            if (isGoogleMapsUrl(mapUrl)) {
                const query = mapUrl.searchParams.get("q");
                if (query) {
                    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
                }
            }
        }
        if (state.venueLat && state.venueLng) {
            return `https://maps.google.com/maps?q=${encodeURIComponent(`${state.venueLat},${state.venueLng}`)}&z=16&output=embed`;
        }
        const query = state.venueAddress || state.venueTitle;
        if (query) {
            return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
        }
        return "";
    }

    function getGpsText(state) {
        if (!state.venueLat && !state.venueLng) return "";
        return `${state.venueLat || ""}, ${state.venueLng || ""}`.replace(/^,\s*|,\s*$/g, "").trim();
    }

    async function copyGpsToClipboard(state) {
        const text = getGpsText(state);
        if (!text) return false;
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            return true;
        }
    }

    function applyMapEmbed(state) {
        const embed = document.getElementById("venue-map-embed");
        const fallback = document.getElementById("venue-map-fallback");
        const embedUrl = buildMapEmbedUrl(state);

        if (embed && embedUrl) {
            embed.src = embedUrl;
            embed.classList.remove("hidden");
            if (fallback) fallback.classList.add("hidden");
            return;
        }

        if (embed) {
            embed.classList.add("hidden");
            embed.removeAttribute("src");
        }
        if (fallback) fallback.classList.remove("hidden");
    }

    function renderProgram(steps) {
        const root = document.getElementById("program-timeline");
        if (!root || !Array.isArray(steps)) return;
        if (!steps.length) {
            root.innerHTML = '<p class="program-empty">Le programme sera bientôt annoncé.</p>';
            return;
        }

        root.innerHTML = '<ol class="program-list" role="list">' + steps.map((step, i) => {
            const colorKey = PROGRAM_COLORS.includes(step.color) ? step.color : PROGRAM_COLORS[i % PROGRAM_COLORS.length];
            const time = String(step.time || "").trim();
            const title = String(step.title || "").trim();
            return `
            <li class="program-step" data-color="${colorKey}">
                <span class="program-step-number" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
                <div class="program-step-card">
                    ${time ? `<span class="program-step-time">${escapeHtml(time)}</span>` : ""}
                    ${title ? `<p class="program-step-title">${escapeHtml(title)}</p>` : ""}
                </div>
            </li>`;
        }).join("") + '</ol>';

        if (window.initLucideIconsOnce) window.initLucideIconsOnce();
    }

    function renderPracticalInfo(items) {
        const root = document.getElementById("practical-info-list");
        const countEl = document.getElementById("practical-info-count");
        if (!root || !Array.isArray(items)) return;

        if (countEl) countEl.textContent = `${items.length} info${items.length > 1 ? "s" : ""}`;

        root.innerHTML = items.map((item) => `
            <div class="flex items-start space-x-3 px-2 practical-info-item">
                <div class="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                    <i data-lucide="${escapeHtml(item.icon || "info")}" class="w-4 h-4 text-gray-500"></i>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-700 practical-info-title">${escapeHtml(item.title)}</p>
                    <p class="text-[11px] text-gray-500 practical-info-text">${escapeHtml(item.text)}</p>
                </div>
            </div>`).join("");

        if (window.initLucideIconsOnce) window.initLucideIconsOnce();
    }

    function applyVenue(state) {
        const venues = normalizeVenues(state);
        const first = venues[0];
        state = venueToLegacy(first);
        const primary = document.getElementById("venue-primary-card");
        if (primary) primary.hidden = !first;
        const empty = document.getElementById("venues-empty");
        if (empty) empty.hidden = venues.length > 0;
        for (const [id, text] of [["venue-kind", first ? venueLabel(first) : ""], ["venue-time", first?.time || ""]]) {
            const element = document.getElementById(id);
            if (element) { element.textContent = text; element.hidden = !text; }
        }
        {
            const el = document.getElementById("venue-title");
            if (el) el.textContent = state.venueTitle;
        }
        {
            const el = document.getElementById("venue-address");
            if (el) el.textContent = state.venueAddress;
        }
        const img = document.getElementById("map-image");
        if (img) {
            if (state.mapImage) img.src = state.mapImage;
            else img.removeAttribute("src");
        }
        const mapUrl = buildMapUrl(state);
        const link = document.getElementById("venue-map-link");
        if (link) { link.href = mapUrl; link.hidden = !mapUrl; }

        const wazeLink = document.getElementById("venue-waze-link");
        if (wazeLink) {
            if (state.venueLat && state.venueLng) {
                wazeLink.href = `https://waze.com/ul?ll=${encodeURIComponent(state.venueLat)},${encodeURIComponent(state.venueLng)}&navigate=yes`;
                wazeLink.classList.remove("hidden");
            } else if (state.venueAddress) {
                wazeLink.href = `https://waze.com/ul?q=${encodeURIComponent(state.venueAddress)}&navigate=yes`;
                wazeLink.classList.remove("hidden");
            } else {
                wazeLink.classList.add("hidden");
            }
        }

        applyMapEmbed(state);

        const gpsLine = document.getElementById("venue-gps-line");
        const copyGpsBtn = document.getElementById("copy-gps-btn");
        if (gpsLine && (state.venueLat || state.venueLng)) {
            gpsLine.textContent = `GPS : ${state.venueLat || "—"}, ${state.venueLng || "—"}`;
            gpsLine.classList.remove("hidden");
            if (copyGpsBtn) copyGpsBtn.classList.remove("hidden");
        } else {
            if (gpsLine) gpsLine.classList.add("hidden");
            if (copyGpsBtn) copyGpsBtn.classList.add("hidden");
        }

        if (copyGpsBtn) {
            copyGpsBtn.onclick = async () => {
                const ok = await copyGpsToClipboard(state);
                if (ok && typeof showToast === "function") {
                    showToast("Coordonnées GPS copiées.");
                }
            };
        }
        const additional = document.getElementById("venue-additional-list");
        if (additional) {
            additional.innerHTML = venues.slice(1).map((venue) => {
                const mapState = venueToLegacy(venue);
                const url = buildMapUrl(mapState);
                const embed = buildMapEmbedUrl(mapState);
                return `<article class="event-venue-card">
                    <div class="event-venue-content">
                        <p class="event-venue-kicker">${escapeHtml(venueLabel(venue))}</p>
                        <h3 class="event-venue-name">${escapeHtml(venue.name || venueLabel(venue))}</h3>
                        ${venue.time ? `<p class="event-venue-time">${escapeHtml(venue.time)}</p>` : ""}
                        ${venue.address ? `<p class="event-venue-address">${escapeHtml(venue.address)}</p>` : ""}
                        ${url ? `<a class="event-venue-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Ouvrir l’itinéraire ↗</a>` : ""}
                    </div>
                    ${embed ? `<iframe class="event-venue-map" src="${escapeHtml(embed)}" title="${escapeHtml(`Carte : ${venue.name || venueLabel(venue)}`)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : ""}
                </article>`;
            }).join("");
        }
    }

    function normalizeFoodMenu(items) {
        return (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object")
            .map((item) => ({ title: String(item.title || "").trim(), description: String(item.description || "").trim() }))
            .filter((item) => item.title || item.description);
    }

    function renderFoodMenu(state) {
        const panel = document.getElementById("food-menu-panel");
        const list = document.getElementById("food-menu-list");
        if (!panel || !list) return;
        const items = normalizeFoodMenu(state.foodMenu);
        panel.hidden = state.sections?.foodMenu === false || !items.length;
        const title = document.getElementById("food-menu-title");
        if (title) title.textContent = state.foodMenuTitle || "À notre table";
        list.innerHTML = items.map((item) => `<div class="event-menu-course">
            ${item.title ? `<h4>${escapeHtml(item.title)}</h4>` : ""}
            ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
        </div>`).join("");
        const section = document.getElementById("invitation-menu-section");
        const drinks = document.getElementById("drink-menu-section");
        if (section) section.hidden = panel.hidden && (!drinks || drinks.classList.contains("hidden"));
    }

    function applySectionVisibility(sections) {
        if (!sections || typeof sections !== "object") return;
        document.querySelectorAll("[data-event-section]").forEach((element) => {
            const key = element.dataset.eventSection;
            if (!key || sections[key] === undefined) return;
            element.classList.toggle("hidden", sections[key] === false);
        });
    }

    function applyDressCodeColors(colors) {
        DEFAULT_DRESS_CODE_COLORS.forEach((fallback, index) => {
            const swatch = document.querySelector(`[data-dress-code-color="${index}"]`);
            if (!swatch) return;
            const selected = Array.isArray(colors) ? colors[index] : "";
            swatch.style.backgroundColor = /^#[0-9a-f]{6}$/i.test(selected || "") ? selected : fallback;
        });
    }

    function apply(state) {
        if (!state) return;
        if (state.programSectionTitle) {
            const t = document.getElementById("program-section-title");
            if (t) t.textContent = state.programSectionTitle;
        }
        if (state.practicalSectionTitle) {
            const t = document.getElementById("practical-info-title");
            if (t) t.textContent = state.practicalSectionTitle;
        }
        renderProgram(state.program || DEFAULT_PROGRAM);
        renderPracticalInfo(state.practicalInfo || DEFAULT_PRACTICAL);
        applyVenue(state);
        renderFoodMenu(state);
        applyDressCodeColors(state.dressCodeColors);
        applySectionVisibility(state.sections);
    }

    function formatRsvpDeadline(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
        if (Number.isNaN(date.getTime())) return `Merci de confirmer avant le ${raw}`;
        return `Merci de confirmer avant le ${date.toLocaleDateString("fr-FR", {
            day: "numeric", month: "long", year: "numeric"
        })}`;
    }

    function getDefaultsFromConfig(cfg) {
        if (!cfg) return {};
        const out = {};
        const legacyVenueTitle = typeof cfg.venue === "string" ? cfg.venue : cfg.venue?.title;
        out.venueTitle = cfg.venueTitle ?? legacyVenueTitle ?? "";
        out.venueAddress = cfg.venueAddress ?? cfg.venueDetails?.address ?? "";
        out.venueTime = cfg.venueTime ?? cfg.venueDetails?.time ?? "";
        out.mapLink = cfg.mapLink ?? cfg.links?.map ?? cfg.venueDetails?.mapLink ?? "";
        out.venueLat = cfg.venueLat ?? cfg.venueDetails?.lat ?? "";
        out.venueLng = cfg.venueLng ?? cfg.venueDetails?.lng ?? "";
        out.mapImage = cfg.mapImage ?? cfg.venueDetails?.mapImage ?? "";
        if (Array.isArray(cfg.venues)) out.venues = normalizeVenues(cfg);
        out.foodMenu = normalizeFoodMenu(cfg.foodMenu);
        out.foodMenuTitle = cfg.foodMenuTitle || "À notre table";
        if (cfg.program) out.program = cfg.program;
        if (cfg.practicalInfo) out.practicalInfo = cfg.practicalInfo;
        if (cfg.title) out.title = cfg.title;
        if (cfg.subtitle) out.subtitle = cfg.subtitle;
        if (cfg.coupleLeft) out.coupleLeft = cfg.coupleLeft;
        if (cfg.coupleRight) out.coupleRight = cfg.coupleRight;
        if (cfg.welcomeMessage) out.welcomeMessage = cfg.welcomeMessage;
        if (cfg.gateHint) out.gateHint = cfg.gateHint;
        if (cfg.inviteIntro) out.inviteIntro = cfg.inviteIntro;
        if (cfg.inviteSecondary) out.inviteSecondary = cfg.inviteSecondary;
        if (cfg.reserveText) out.reserveText = cfg.reserveText;
        if (cfg.rsvpDeadlineText || cfg.rsvpDeadline) {
            out.rsvpDeadlineText = cfg.rsvpDeadlineText || formatRsvpDeadline(cfg.rsvpDeadline);
        }
        if (cfg.sections) out.sections = cfg.sections;
        if (cfg.rsvpButtonColor) out.rsvpButtonColor = cfg.rsvpButtonColor;
        if (cfg.aboutTitle) out.aboutTitle = cfg.aboutTitle;
        if (cfg.aboutStory1) out.aboutStory1 = cfg.aboutStory1;
        if (cfg.aboutStory2) out.aboutStory2 = cfg.aboutStory2;
        if (cfg.branding?.primaryColor) out.primaryColor = cfg.branding.primaryColor;
        if (cfg.branding?.accentColor) out.accentColor = cfg.branding.accentColor;
        if (cfg.links?.donation) out.donationLink = cfg.links.donation;
        if (cfg.links?.whatsappDonation) out.whatsappDonationPhone = cfg.links.whatsappDonation;
        if (cfg.links?.donationWhatsAppMessage) out.donationWhatsAppMessage = cfg.links.donationWhatsAppMessage;
        if (cfg.giftMessage) out.giftMessage = cfg.giftMessage;
        if (cfg.dressCodeTitle) out.dressCodeTitle = cfg.dressCodeTitle;
        if (Array.isArray(cfg.dressCodeColors)) out.dressCodeColors = cfg.dressCodeColors;
        if (cfg.dressImages) out.dressImages = cfg.dressImages;
        if (cfg.links?.supportEmail) out.supportEmail = cfg.links.supportEmail;
        if (cfg.metaDescription) out.metaDescription = cfg.metaDescription;
        if (cfg.backgroundMusicUrl || cfg.ambiance?.musicUrl) {
            out.backgroundMusicUrl = cfg.backgroundMusicUrl || cfg.ambiance.musicUrl;
        }
        if (cfg.backgroundMusicVolume !== undefined || cfg.ambiance?.volume !== undefined) {
            out.backgroundMusicVolume = cfg.backgroundMusicVolume ?? cfg.ambiance.volume;
        }
        if (cfg.backgroundMusicEnabled !== undefined || cfg.ambiance?.enabled !== undefined) {
            out.backgroundMusicEnabled = cfg.backgroundMusicEnabled ?? cfg.ambiance.enabled;
        }
        return out;
    }

    return {
        apply,
        renderProgram,
        renderPracticalInfo,
        applyVenue,
        normalizeVenues,
        venueToLegacy,
        venueLabel,
        VENUE_TYPES,
        normalizeFoodMenu,
        renderFoodMenu,
        buildMapUrl,
        buildMapEmbedUrl,
        sanitizeExternalUrl,
        applySectionVisibility,
        applyDressCodeColors,
        formatRsvpDeadline,
        copyGpsToClipboard,
        getDefaultsFromConfig,
        DEFAULT_PROGRAM,
        DEFAULT_PRACTICAL,
        DEFAULT_DRESS_CODE_COLORS
    };
})();

window.ContentBlocks = ContentBlocks;
