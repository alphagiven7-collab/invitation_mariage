/**
 * Blocs de contenu personnalisables — programme, lieu, infos pratiques
 */
const ContentBlocks = (() => {
    const PROGRAM_COLORS = ["blue", "green", "pink", "purple", "indigo", "amber"];
    const COLOR_CLASSES = {
        blue: { bg: "bg-blue-50", text: "text-blue-500" },
        green: { bg: "bg-green-50", text: "text-green-500" },
        pink: { bg: "bg-pink-50", text: "text-pink-500" },
        purple: { bg: "bg-purple-50", text: "text-purple-500" },
        indigo: { bg: "bg-indigo-50", text: "text-indigo-500" },
        amber: { bg: "bg-amber-50", text: "text-amber-600" }
    };

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
        return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function buildMapUrl(state) {
        if (state.mapLink) return state.mapLink;
        if (state.venueLat && state.venueLng) {
            return `https://maps.google.com/?q=${encodeURIComponent(state.venueLat)},${encodeURIComponent(state.venueLng)}`;
        }
        if (state.venueAddress) {
            return `https://maps.google.com/?q=${encodeURIComponent(state.venueAddress)}`;
        }
        return "https://maps.google.com/?q=Sultani+River+Kinshasa";
    }

    function buildMapEmbedUrl(state) {
        if (state.mapLink && state.mapLink.includes("google") && state.mapLink.includes("maps")) {
            const qMatch = state.mapLink.match(/[?&]q=([^&]+)/);
            if (qMatch) {
                return `https://maps.google.com/maps?q=${qMatch[1]}&z=16&output=embed`;
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
        if (!root || !Array.isArray(steps) || !steps.length) return;

        const line = `<div class="absolute inset-0 ml-[1.1rem] -translate-x-px h-full w-0.5 bg-gradient-to-b from-transparent via-gray-200 to-transparent pointer-events-none" aria-hidden="true"></div>`;

        root.innerHTML = line + steps.map((step, i) => {
            const color = COLOR_CLASSES[step.color] || COLOR_CLASSES[PROGRAM_COLORS[i % PROGRAM_COLORS.length]];
            const colorKey = step.color || PROGRAM_COLORS[i % PROGRAM_COLORS.length];
            const cls = COLOR_CLASSES[colorKey] || color;
            return `
            <div class="relative flex items-center justify-between group is-active">
                <div class="flex items-center justify-center w-9 h-9 rounded-full border-2 border-white ${cls.bg} ${cls.text} shadow shrink-0 z-10">
                    <span class="text-[10px] font-bold">${i + 1}</span>
                </div>
                <div class="w-[calc(100%-3rem)] pl-4 font-medium">
                    <p class="text-[10px] text-gray-400 program-step-time">${escapeHtml(step.time)}</p>
                    <p class="text-sm text-gray-800 program-step-title">${escapeHtml(step.title)}</p>
                </div>
            </div>`;
        }).join("");

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
        if (state.venueTitle) {
            const el = document.getElementById("venue-title");
            if (el) el.textContent = state.venueTitle;
        }
        if (state.venueAddress) {
            const el = document.getElementById("venue-address");
            if (el) el.textContent = state.venueAddress;
        }
        if (state.mapImage) {
            const img = document.getElementById("map-image");
            if (img) img.src = state.mapImage;
        }
        const mapUrl = buildMapUrl(state);
        const link = document.getElementById("venue-map-link");
        if (link) link.href = mapUrl;

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
    }

    function getDefaultsFromConfig(cfg) {
        if (!cfg) return {};
        const out = {};
        if (cfg.venue) {
            out.venueTitle = typeof cfg.venue === "string" ? cfg.venue : cfg.venue.title;
            out.venueAddress = cfg.venueDetails?.address || cfg.venueAddress || "";
            out.mapLink = cfg.links?.map || cfg.venueDetails?.mapLink || "";
            out.venueLat = cfg.venueDetails?.lat || "";
            out.venueLng = cfg.venueDetails?.lng || "";
            out.mapImage = cfg.venueDetails?.mapImage || "";
        }
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
        if (cfg.rsvpDeadlineText) out.rsvpDeadlineText = cfg.rsvpDeadlineText;
        if (cfg.rsvpButtonColor) out.rsvpButtonColor = cfg.rsvpButtonColor;
        if (cfg.aboutTitle) out.aboutTitle = cfg.aboutTitle;
        if (cfg.aboutStory1) out.aboutStory1 = cfg.aboutStory1;
        if (cfg.aboutStory2) out.aboutStory2 = cfg.aboutStory2;
        if (cfg.branding?.primaryColor) out.primaryColor = cfg.branding.primaryColor;
        if (cfg.branding?.accentColor) out.accentColor = cfg.branding.accentColor;
        if (cfg.links?.donation) out.donationLink = cfg.links.donation;
        if (cfg.links?.whatsappDonation) out.whatsappDonationPhone = cfg.links.whatsappDonation;
        if (cfg.links?.donationWhatsAppMessage) out.donationWhatsAppMessage = cfg.links.donationWhatsAppMessage;
        if (cfg.dressCodeTitle) out.dressCodeTitle = cfg.dressCodeTitle;
        if (cfg.dressImages) out.dressImages = cfg.dressImages;
        if (cfg.links?.supportEmail) out.supportEmail = cfg.links.supportEmail;
        if (cfg.metaDescription) out.metaDescription = cfg.metaDescription;
        return out;
    }

    return {
        apply,
        renderProgram,
        renderPracticalInfo,
        applyVenue,
        buildMapUrl,
        buildMapEmbedUrl,
        copyGpsToClipboard,
        getDefaultsFromConfig,
        DEFAULT_PROGRAM,
        DEFAULT_PRACTICAL
    };
})();

window.ContentBlocks = ContentBlocks;
