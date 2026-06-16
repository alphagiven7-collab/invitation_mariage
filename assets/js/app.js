        const DESIGNER_ACCESS_CODE = 'YANICK-KEREN-ADMIN';
        const designerModeKey = 'wedding_designer_mode';
        const dashboardStateKey = 'wedding_dashboard_state';
        const rsvpListKey = 'wedding_rsvp_list';
        const guestbookListKey = 'wedding_guestbook_messages';
        let isDesignerMode = localStorage.getItem(designerModeKey) === '1';
        let guestName = '';
        let currentGuestProfile = null;
        let defaultCustomizationState = null;
        let bestGalleryImages = [];
        let bestGalleryIndex = 0;
        let bestGalleryInterval = null;

        function applyGuestName(name) {
            const display = (name || '').trim().length > 1 ? name.trim() : 'Invite(e)';
            const el = document.getElementById('display-guest-name');
            if (el) el.textContent = display;
        }

        function enterExperience(ev) {
            const run = () => {
                const input = document.getElementById('gate-guest-name-input').value.trim();
                if (input.length < 2) {
                    showToast('Entrez votre nom');
                    return;
                }
                guestName = input;
                localStorage.setItem('wedding_guest_name_simple', guestName);
                openMainSite(ev, { skipLoader: true });
            };
            if (window.ButtonLoading) {
                return ButtonLoading.runWithLoader(ev, 'gate-enter-btn', run, 'Ouverture…');
            }
            return run();
        }

        function openMainSite(ev, options = {}) {
            const { skipLoader = false } = options;
            const run = () => {
                if (!guestName) {
                    guestName = (localStorage.getItem('wedding_guest_name_simple') || '').trim();
                }
                if (window.GuestExperience && GuestExperience.getProfile()) {
                    applyGuestProfile(GuestExperience.getProfile());
                } else if (currentGuestProfile) {
                    applyGuestProfile(currentGuestProfile);
                }
                applyGuestName(guestName);
                if (window.BackgroundMusic) BackgroundMusic.armAutoplay();
                const gate = document.getElementById('welcome-gate');
                const main = document.getElementById('main-view');
                gate.classList.add('opacity-0', 'pointer-events-none');
                return new Promise((resolve) => {
                    setTimeout(() => {
                        gate.classList.add('hidden');
                        main.classList.remove('hidden');
                        requestAnimationFrame(() => main.classList.remove('opacity-0'));
                        document.body.style.overflow = 'auto';
                        if (window.BackgroundMusic) BackgroundMusic.onGuestEnter();
                        resolve();
                    }, 450);
                });
            };
            const fallbackId = ev && ev.currentTarget && ev.currentTarget.id
                ? ev.currentTarget.id
                : 'gate-welcome-open-btn';
            if (!skipLoader && window.ButtonLoading) {
                return ButtonLoading.runWithLoader(ev, fallbackId, run, 'Chargement…');
            }
            return run();
        }

        function slugToDisplayName(slug) {
            return (slug || '')
                .split('-')
                .filter(Boolean)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        }

        function applyGuestProfile(guest) {
            if (!guest) return;
            currentGuestProfile = guest;
            guestName = guest.fullName || guestName;
            applyGuestName(guestName);
            localStorage.setItem('wedding_guest_name_simple', guestName);

            const setVal = (id, val, markPrefilled = true) => {
                const el = document.getElementById(id);
                if (!el || val === undefined || val === null || val === '') return;
                el.value = val;
                if (markPrefilled) el.classList.add('rsvp-prefilled');
            };

            setVal('rsvp-name', guest.fullName);
            setVal('rsvp-phone', guest.phone);
            if (guest.adults) setVal('rsvp-adults', guest.adults, false);
            if (guest.children !== undefined) setVal('rsvp-children', guest.children, false);
            if (guest.status === 'yes' || guest.status === 'no') {
                setVal('rsvp-status', guest.status, false);
            }
            if (guest.rsvpMessage) setVal('rsvp-message', guest.rsvpMessage);
            if (Array.isArray(guest.drinkChoices) && guest.drinkChoices.length && window.DrinkMenu) {
                DrinkMenu.setSelected(guest.drinkChoices);
            }

            const guestbookArea = document.getElementById('guestbook-textarea');
            if (guestbookArea && guestName) {
                guestbookArea.placeholder = `Votre message pour ${guestName.split(' ')[0]} et le couple...`;
            }
        }

        function showPersonalizedWelcome(guest) {
            const genericIntro = document.querySelector('#welcome-gate .text-gray-500.mb-5');
            if (genericIntro) genericIntro.classList.add('hidden');

            document.getElementById('gate-name-input-container').classList.add('hidden');
            document.getElementById('gate-welcome-back-container').classList.add('hidden');
            document.getElementById('gate-personal-container').classList.remove('hidden');

            const cfg = EventConfig.getConfig && EventConfig.getConfig();
            const couple = (cfg && cfg.subtitle) ? cfg.subtitle : 'Josue & Divine';
            const firstName = (guest.fullName || '').split(' ')[0];

            document.getElementById('gate-personal-greeting').textContent = `Cher/Chère ${guest.fullName}`;
            document.getElementById('gate-personal-message').innerHTML =
                `<strong>${couple}</strong> ont le bonheur de vous inviter <strong>personnellement</strong> à célébrer leur union.<br><br>` +
                `Cette enveloppe a été préparée uniquement pour vous, <strong>${firstName}</strong>. ` +
                `Votre présence serait pour eux un immense bonheur.`;
        }

        function buildConfirmationCode(guest, payload) {
            const token = (guest && guest.token) ? guest.token.slice(0, 8).toUpperCase() : 'GUEST';
            const stamp = Date.now().toString(36).slice(-4).toUpperCase();
            return `YK26-${token}-${stamp}`;
        }

        function showRsvpConfirmation(payload, confirmCode, guest) {
            if (window.GuestExperience && GuestExperience.showConfirmation) {
                GuestExperience.showConfirmation(payload, confirmCode, guest || currentGuestProfile);
                return;
            }
            const cfg = EventConfig.getConfig && EventConfig.getConfig();
            const eventTitle = (cfg && cfg.title) ? cfg.title : 'Mariage de Josue et Divine';
            const isYes = payload.status === 'yes';

            document.getElementById('confirm-title').textContent = isYes
                ? 'Présence confirmée avec joie'
                : 'Réponse enregistrée';
            document.getElementById('confirm-subtitle').textContent = isYes
                ? 'Nous avons hâte de vous accueillir'
                : 'Merci d\'avoir pris le temps de répondre';
            document.getElementById('confirm-guest-line').textContent = payload.name;
            document.getElementById('confirm-detail-line').textContent = isYes
                ? `${eventTitle} · ${payload.adults} adulte(s) · ${payload.children} enfant(s)`
                : `Vous avez indiqué ne pas pouvoir être présent(e).`;
            document.getElementById('confirm-code-line').textContent = confirmCode;

            const qrPayload = JSON.stringify({
                code: confirmCode,
                event: EventConfig.getEventId ? EventConfig.getEventId() : 'yanick-keren',
                name: payload.name,
                phone: payload.phone,
                status: payload.status,
                adults: payload.adults,
                children: payload.children,
                confirmedAt: payload.sentAt
            });
            document.getElementById('rsvp-qr-image').src =
                `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`;

            openModal('rsvp-confirmation-modal');
        }

        function buildWhatsAppDonationUrl(state) {
            const couple = (state && state.subtitle)
                || document.getElementById('hero-subtitle')?.textContent?.trim()
                || 'Josue et Divine';
            const phone = (
                (state && state.whatsappDonationPhone)
                || document.getElementById('donation-btn')?.dataset.whatsapp
                || ''
            ).replace(/\D/g, '');
            let message = (state && state.donationWhatsAppMessage)
                || document.getElementById('donation-btn')?.dataset.waMessage
                || `Bonjour ${couple}, je souhaite vous faire un don pour votre mariage. Merci de me communiquer les modalités.`;
            message = message.replace(/\{couple\}/gi, couple);
            if (phone) {
                return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
            }
            return normalizeUrl(
                (state && state.donationLink)
                || document.getElementById('donation-btn')?.dataset.link
                || 'https://www.paypal.com'
            );
        }

        function prefillRsvpForm() {
            if (currentGuestProfile) {
                applyGuestProfile(currentGuestProfile);
                return;
            }
            if (guestName) {
                const rsvpName = document.getElementById('rsvp-name');
                if (rsvpName && !rsvpName.value) rsvpName.value = guestName;
            }
        }

        async function initEntryFlow() {
            if (window.GuestExperience) {
                const personalized = await GuestExperience.init();
                if (personalized) {
                    currentGuestProfile = GuestExperience.getProfile();
                    return;
                }
            }

            const urlParams = new URLSearchParams(window.location.search);
            const token = (urlParams.get('t') || '').trim();
            const guestParam = (urlParams.get('guest') || urlParams.get('nom') || '').trim();

            if (window.GuestManager && token) {
                const guestByToken = await GuestManager.findByToken(token);
                if (guestByToken) {
                    applyGuestProfile(guestByToken);
                    showPersonalizedWelcome(guestByToken);
                    if (window.CloudAPI && EventConfig.isReady()) {
                        CloudAPI.track(EventConfig.getEventId(), 'guest_link_open', { guestToken: token });
                    }
                    if (guestByToken.status === 'yes' || guestByToken.status === 'no') {
                        const saved = localStorage.getItem(`wedding_confirm_${token}`);
                        if (saved) {
                            try {
                                const data = JSON.parse(saved);
                                const showQr = window.GuestExperience
                                    ? GuestExperience.canShowQrCode(guestByToken, data.payload)
                                    : guestByToken.qrApproved;
                                if (showQr) {
                                    setTimeout(() => showRsvpConfirmation(data.payload, data.code, guestByToken), 800);
                                }
                            } catch (e) {}
                        }
                    }
                    return;
                }
            }

            let resolvedName = guestParam;
            let guestFromSlug = null;
            if (window.GuestManager && guestParam && !guestParam.includes(' ')) {
                guestFromSlug = await GuestManager.findBySlug(guestParam);
                if (guestFromSlug) resolvedName = guestFromSlug.fullName;
            }

            if (guestFromSlug || (token && guestParam)) {
                const pseudoGuest = guestFromSlug || {
                    fullName: slugToDisplayName(guestParam) || decodeURIComponent(guestParam),
                    phone: '',
                    token: token || '',
                    status: 'pending'
                };
                applyGuestProfile(pseudoGuest);
                showPersonalizedWelcome(pseudoGuest);
                return;
            }

            const savedName = (localStorage.getItem('wedding_guest_name_simple') || '').trim();
            const startName = resolvedName ? decodeURIComponent(resolvedName.replace(/\+/g, ' ')) : savedName;
            if (startName) {
                guestName = startName;
                document.getElementById('gate-name-input-container').classList.add('hidden');
                document.getElementById('gate-welcome-back-container').classList.remove('hidden');
                document.getElementById('gate-welcome-back-name').textContent = guestName;
                applyGuestName(guestName);
                prefillRsvpForm();
            }
        }

        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 1800);
        }

        function applyDesignerVisibility() {
            const isPreviewMode = document.body.classList.contains('preview-mode');
            const btn = document.getElementById('designer-customize-btn');
            const accessBtn = document.getElementById('designer-access-btn');
            if (isPreviewMode) {
                if (btn) btn.classList.add('hidden');
                if (accessBtn) accessBtn.classList.add('hidden');
                const floatTools = document.getElementById('app-floating-tools');
                if (floatTools) floatTools.classList.add('hidden');
                return;
            }
            if (isDesignerMode) {
                btn.classList.remove('hidden');
                document.getElementById('designer-access-btn').textContent = 'Concepteur actif';
            } else {
                btn.classList.add('hidden');
                document.getElementById('designer-access-btn').textContent = 'Mode concepteur';
            }
        }

        function requestDesignerAccess() {
            const code = window.prompt('Code concepteur');
            if (!code) return;
            if (code === DESIGNER_ACCESS_CODE) {
                isDesignerMode = true;
                localStorage.setItem(designerModeKey, '1');
                applyDesignerVisibility();
                showToast('Mode concepteur activé');
                if (typeof openCustomizer === 'function') {
                    openCustomizer();
                } else {
                    window.location.href = './personnalisation.html' + (EventConfig.isReady() ? EventConfig.preserveEventQuery() : '');
                }
            } else {
                showToast('Code incorrect');
            }
        }

        function getCssUrlVariable(variableName) {
            const raw = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
            const match = raw.match(/^url\(['"]?(.*?)['"]?\)$/);
            return match ? match[1] : '';
        }

        function toDateTimeLocal(ms) {
            const date = new Date(ms);
            const pad = value => String(value).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        function parseImageList(value) {
            return (value || '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean);
        }

        function normalizeColor(value, fallback) {
            if (!value) return fallback;
            const trimmed = value.trim();
            if (trimmed.startsWith('#')) return trimmed;
            const rgb = trimmed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
            if (!rgb) return fallback;
            const hex = rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('');
            return `#${hex}`;
        }

        function applyImageList(ids, urls) {
            const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
            ids.forEach((id, index) => {
                if (!urls[index]) return;
                const el = document.getElementById(id);
                if (!el) return;
                let src = urls[index];
                if (isPreview && /^https?:\/\//i.test(src)) {
                    src += `${src.includes('?') ? '&' : '?'}_pv=${Date.now()}`;
                }
                el.src = src;
            });
        }

        function setCssImageVar(name, imageUrl) {
            if (!imageUrl) return;
            const safe = String(imageUrl).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            document.documentElement.style.setProperty(name, `url("${safe}")`);
        }

        function normalizeUrl(value) {
            const raw = (value || '').trim();
            if (!raw) return '';
            if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
            return `https://${raw}`;
        }

        function readLocalJson(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (error) {
                return fallback;
            }
        }

        function downloadJsonFile(filename, data) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        }

        function fileToDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
                reader.readAsDataURL(file);
            });
        }

        async function handleImageUploadToField(event, targetInputId) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            if (file.size > 1.5 * 1024 * 1024) {
                showToast('Image trop lourde. Maximum conseille: 1.5 MB.');
                event.target.value = '';
                return;
            }
            try {
                const dataUrl = await fileToDataUrl(file);
                const targetInput = document.getElementById(targetInputId);
                if (!targetInput) return;
                targetInput.value = dataUrl;
                applyCustomization();
                showToast('Image importee. N oubliez pas de sauvegarder.');
            } catch (error) {
                showToast('Import impossible pour cette image.');
            } finally {
                event.target.value = '';
            }
        }

        async function appendImagesToListField(event, fieldId, maxItems) {
            const files = Array.from(event.target.files || []);
            if (!files.length) return;

            const tooLarge = files.find(file => file.size > 1.5 * 1024 * 1024);
            if (tooLarge) {
                showToast('Une image depasse 1.5 MB. Import annule.');
                event.target.value = '';
                return;
            }

            const input = document.getElementById(fieldId);
            if (!input) return;
            const existing = parseImageList(input.value);

            try {
                const imported = [];
                for (const file of files) {
                    imported.push(await fileToDataUrl(file));
                }
                const merged = [...existing, ...imported].slice(0, maxItems);
                input.value = merged.join(', ');
                applyCustomization();
                showToast('Photos ajoutees. Pensez a sauvegarder.');
            } catch (error) {
                showToast('Import de photos echoue.');
            } finally {
                event.target.value = '';
            }
        }

        function getCurrentCustomizationState() {
            let savedBlocks = {};
            try {
                const raw = localStorage.getItem(dashboardStateKey);
                if (raw) savedBlocks = JSON.parse(raw);
            } catch { /* ignore */ }

            return {
                title: document.getElementById('hero-title').textContent.trim(),
                subtitle: document.getElementById('hero-subtitle').textContent.trim(),
                coupleLeft: document.getElementById('couple-name-left').textContent.trim(),
                coupleRight: document.getElementById('couple-name-right').textContent.trim(),
                reserveText: document.getElementById('reserve-deadline-text').textContent.trim(),
                mainText: document.getElementById('invite-main-text').textContent.trim(),
                day: document.getElementById('event-day').textContent.trim(),
                monthYear: document.getElementById('event-month-year').textContent.trim(),
                timeRange: document.getElementById('event-time-range').textContent.trim(),
                countdownDate: toDateTimeLocal(window.EventCountdown ? EventCountdown.getTarget() : Date.now()),
                welcomeImage: getCssUrlVariable('--welcome-image-url'),
                heroImage: getCssUrlVariable('--hero-image-url'),
                aboutImage: document.getElementById('about-cover-image').src,
                mapImage: document.getElementById('map-image').src,
                aboutTitle: document.getElementById('about-story-title').textContent.trim(),
                aboutStory1: document.getElementById('about-story-paragraph-1').textContent.trim(),
                aboutStory2: document.getElementById('about-story-paragraph-2').textContent.trim(),
                venueTitle: document.getElementById('venue-title').textContent.trim(),
                venueAddress: document.getElementById('venue-address').textContent.trim(),
                venueLat: savedBlocks.venueLat || '',
                venueLng: savedBlocks.venueLng || '',
                programSectionTitle: savedBlocks.programSectionTitle || document.getElementById('program-section-title')?.textContent.trim() || '',
                practicalSectionTitle: savedBlocks.practicalSectionTitle || document.getElementById('practical-info-title')?.textContent.trim() || '',
                program: savedBlocks.program || (window.ContentBlocks ? ContentBlocks.DEFAULT_PROGRAM : []),
                practicalInfo: savedBlocks.practicalInfo || (window.ContentBlocks ? ContentBlocks.DEFAULT_PRACTICAL : []),
                dressImages: Array.from({ length: 8 }, (_, i) => document.getElementById(`dress-photo-${i + 1}`).src),
                bestGridImages: [document.getElementById('best-photo-1').src, document.getElementById('best-photo-2').src],
                bestMarqueeImages: Array.from({ length: 6 }, (_, i) => document.getElementById(`best-marquee-${i + 1}`).src),
                guestbookCoverImage: document.getElementById('guestbook-cover-image').src,
                galleryPreviewImages: Array.from({ length: 3 }, (_, i) => document.getElementById(`gallery-preview-image-${i + 1}`).src),
                galleryModalImages: Array.from({ length: 4 }, (_, i) => document.getElementById(`gallery-modal-image-${i + 1}`).src),
                primaryColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#4caf50',
                accentColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#ec4899',
                rsvpLink: document.getElementById('rsvp-form').dataset.externalLink || '',
                donationLink: document.getElementById('donation-btn').dataset.link || 'https://www.paypal.com',
                mapLink: document.getElementById('venue-map-link').href || '',
                supportEmail: (document.getElementById('support-email-link').href || '').replace(/^mailto:/i, '').split('?')[0],
                siteUrl: document.getElementById('meta-og-url').content || window.location.href,
                shareImage: document.getElementById('meta-og-image').content || document.getElementById('about-cover-image').src,
                metaDescription: document.getElementById('meta-description').content || ''
            };
        }

        function populateCustomizerFields(state) {
            document.getElementById('custom-title').value = state.title || '';
            document.getElementById('custom-subtitle').value = state.subtitle || '';
            document.getElementById('custom-couple-left').value = state.coupleLeft || '';
            document.getElementById('custom-couple-right').value = state.coupleRight || '';
            document.getElementById('custom-reserve-text').value = state.reserveText || '';
            document.getElementById('custom-main-text').value = state.mainText || '';
            document.getElementById('custom-day').value = state.day || '';
            document.getElementById('custom-month-year').value = state.monthYear || '';
            document.getElementById('custom-time-range').value = state.timeRange || '';
            document.getElementById('custom-countdown-date').value = state.countdownDate || '';
            document.getElementById('custom-welcome-image').value = state.welcomeImage || '';
            document.getElementById('custom-hero-image').value = state.heroImage || '';
            document.getElementById('custom-about-image').value = state.aboutImage || '';
            document.getElementById('custom-map-image').value = state.mapImage || '';
            document.getElementById('custom-about-title').value = state.aboutTitle || '';
            document.getElementById('custom-about-story-1').value = state.aboutStory1 || '';
            document.getElementById('custom-about-story-2').value = state.aboutStory2 || '';
            document.getElementById('custom-venue-title').value = state.venueTitle || '';
            document.getElementById('custom-venue-address').value = state.venueAddress || '';
            document.getElementById('custom-dress-images').value = (state.dressImages || []).join(', ');
            document.getElementById('custom-best-grid-images').value = (state.bestGridImages || []).join(', ');
            document.getElementById('custom-best-marquee-images').value = (state.bestMarqueeImages || []).join(', ');
            document.getElementById('custom-guestbook-cover-image').value = state.guestbookCoverImage || '';
            document.getElementById('custom-gallery-preview-images').value = (state.galleryPreviewImages || []).join(', ');
            document.getElementById('custom-gallery-modal-images').value = (state.galleryModalImages || []).join(', ');
            document.getElementById('custom-primary-color').value = normalizeColor(state.primaryColor, '#4caf50');
            document.getElementById('custom-accent-color').value = normalizeColor(state.accentColor, '#ec4899');
            document.getElementById('custom-rsvp-link').value = state.rsvpLink || '';
            document.getElementById('custom-donation-link').value = state.donationLink || '';
            document.getElementById('custom-map-link').value = state.mapLink || '';
            document.getElementById('custom-support-email').value = state.supportEmail || '';
            document.getElementById('custom-site-url').value = state.siteUrl || '';
            document.getElementById('custom-share-image').value = state.shareImage || '';
            document.getElementById('custom-meta-description').value = state.metaDescription || '';
        }

        function parseCoupleFromSubtitle(subtitle) {
            const s = (subtitle || "").trim();
            const m = s.match(/^(.+?)\s+(?:et|&|\+)\s+(.+)$/i);
            if (m) return { left: m[1].trim(), right: m[2].trim() };
            return { left: s, right: "" };
        }

        function escapeHtml(str) {
            return (str || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");
        }

        function formatCoupleLabel(state) {
            if (state.coupleLeft || state.coupleRight) {
                return [state.coupleLeft, state.coupleRight].filter(Boolean).join(" et ");
            }
            return state.subtitle || "";
        }

        function shadeHexColor(hex, amount = -18) {
            const raw = (hex || "#ec4899").replace("#", "");
            if (raw.length !== 6) return hex || "#db2777";
            const num = parseInt(raw, 16);
            const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
            const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
            const b = Math.max(0, Math.min(255, (num & 255) + amount));
            return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        }

        function applyRsvpButtonColors(color) {
            const from = color || "#ec4899";
            document.documentElement.style.setProperty("--rsvp-from", from);
            document.documentElement.style.setProperty("--rsvp-to", shadeHexColor(from, -22));
        }

        function applyInviteIntroParagraph(state) {
            const el = document.getElementById("invite-intro-paragraph");
            if (!el) return;
            const couple = formatCoupleLabel(state);
            if (state.inviteIntro) {
                el.innerHTML = state.inviteIntro.replace(
                    /\{couple\}/gi,
                    `<strong id="invite-couple-display" class="invite-emphasis">${escapeHtml(couple)}</strong>`
                );
            } else if (couple) {
                el.innerHTML =
                    `C'est avec une grande joie que <strong id="invite-couple-display" class="invite-emphasis">${escapeHtml(couple)}</strong> vous invitent à célébrer leur mariage.`;
            }
        }

        async function syncAndApplyDashboardState(dashboardState, eventId, cfg) {
            const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
            if (window.DashboardSync && DashboardSync.syncIdentityFromConfig) {
                const sync = DashboardSync.syncIdentityFromConfig(dashboardState, cfg);
                dashboardState = sync.state;
                if (sync.changed && eventId && !isPreview) {
                    try {
                        await DashboardSync.save(eventId, dashboardState);
                    } catch {
                        /* local save best-effort */
                    }
                }
            } else if (dashboardState) {
                dashboardState = enrichDashboardCoupleNames(dashboardState);
            }
            if (dashboardState) applyCustomizationState(dashboardState);
            return dashboardState;
        }

        function enrichDashboardCoupleNames(state) {
            if (!state) return state;
            const cfg = window.EventConfig && EventConfig.getConfig ? EventConfig.getConfig() : null;
            if (window.DashboardSync && DashboardSync.syncIdentityFromConfig && cfg) {
                return DashboardSync.syncIdentityFromConfig(state, cfg).state;
            }
            if ((!state.coupleLeft || !state.coupleRight) && state.subtitle) {
                const p = parseCoupleFromSubtitle(state.subtitle);
                if (!state.coupleLeft) state.coupleLeft = p.left;
                if (!state.coupleRight) state.coupleRight = p.right;
            }
            return state;
        }

        function applyCustomizationState(state) {
            if (state.title) document.getElementById('hero-title').textContent = state.title;
            if (state.subtitle) document.getElementById('hero-subtitle').textContent = state.subtitle;
            if (state.coupleLeft) document.getElementById('couple-name-left').textContent = state.coupleLeft;
            if (state.coupleRight) document.getElementById('couple-name-right').textContent = state.coupleRight;
            applyInviteIntroParagraph(state);
            if (state.inviteSecondary) {
                const sec = document.getElementById('invite-secondary-text');
                if (sec) sec.textContent = state.inviteSecondary;
            }
            if (state.welcomeMessage) {
                const wm = document.getElementById('welcome-gate-message');
                if (wm) wm.textContent = state.welcomeMessage;
            }
            if (state.gateHint) {
                const gh = document.getElementById('welcome-gate-hint');
                if (gh) gh.textContent = state.gateHint;
            }
            if (state.rsvpDeadlineText) {
                const dl = document.getElementById('gate-rsvp-deadline');
                if (dl) dl.textContent = state.rsvpDeadlineText;
                const modalDl = document.getElementById('rsvp-modal-deadline');
                if (modalDl) modalDl.textContent = state.rsvpDeadlineText;
            }
            if (state.subtitle) {
                const gateTitle = document.getElementById('welcome-gate-title');
                if (gateTitle) {
                    gateTitle.textContent = state.subtitle.replace(/\s+et\s+/i, ' & ');
                }
                document.title = state.title || document.title;
            }
            if (state.reserveText) {
                document.getElementById('reserve-deadline-text').textContent = state.reserveText;
                const confirmLabel = document.getElementById('confirm-presence-label');
                if (confirmLabel) confirmLabel.textContent = state.reserveText;
            }
            if (window.DrinkMenu) {
                DrinkMenu.apply(state);
            }
            const drinkNames = (state.drinkMenu || []).map((item) => item.name).filter(Boolean);
            window.__eventConfirmationMeta = {
                couplePhotoLeft: state.confirmationCouplePhoto1 || state.aboutImage || '',
                couplePhotoRight: state.confirmationCouplePhoto2 || state.heroImage || '',
                drinkMenuOptions: drinkNames.length ? drinkNames : (state.drinkMenuOptions || [])
            };
            if (state.mainText) document.getElementById('invite-main-text').textContent = state.mainText;
            if (state.day) document.getElementById('event-day').textContent = state.day;
            if (state.monthYear) document.getElementById('event-month-year').textContent = state.monthYear;
            if (state.timeRange) document.getElementById('event-time-range').textContent = state.timeRange;
            if (state.venueTitle) document.getElementById('venue-title').textContent = state.venueTitle;
            if (state.venueAddress) document.getElementById('venue-address').textContent = state.venueAddress;
            if (state.aboutTitle) document.getElementById('about-story-title').textContent = state.aboutTitle;
            if (state.aboutStory1) document.getElementById('about-story-paragraph-1').textContent = state.aboutStory1;
            if (state.aboutStory2) document.getElementById('about-story-paragraph-2').textContent = state.aboutStory2;

            if (state.welcomeImage) setCssImageVar('--welcome-image-url', state.welcomeImage);
            if (state.heroImage) setCssImageVar('--hero-image-url', state.heroImage);
            if (state.aboutImage) {
                document.getElementById('about-cover-image').src = state.aboutImage;
                document.getElementById('about-modal-image').src = state.aboutImage;
            }
            if (state.mapImage) document.getElementById('map-image').src = state.mapImage;

            if (state.countdownDate) {
                const parsedDate = new Date(state.countdownDate).getTime();
                if (!Number.isNaN(parsedDate) && window.EventCountdown) {
                    EventCountdown.setTarget(parsedDate);
                    EventCountdown.applyDateToUI(state.countdownDate);
                    EventCountdown.tick();
                }
            }

            if (state.dressCodeTitle) {
                const dressTitle = document.getElementById('dress-code-title');
                if (dressTitle) dressTitle.textContent = state.dressCodeTitle;
            }
            if (Array.isArray(state.dressImages)) {
                applyImageList(['dress-photo-1', 'dress-photo-2', 'dress-photo-3', 'dress-photo-4', 'dress-photo-5', 'dress-photo-6', 'dress-photo-7', 'dress-photo-8'], state.dressImages);
            }
            if (Array.isArray(state.bestPhotos) && state.bestPhotos.length) {
                applyImageList(['best-photo-1', 'best-photo-2'], state.bestPhotos.slice(0, 2));
                applyImageList(
                    ['best-marquee-1', 'best-marquee-2', 'best-marquee-3', 'best-marquee-4', 'best-marquee-5', 'best-marquee-6'],
                    state.bestPhotos.slice(0, 6)
                );
                applyImageList(
                    ['gallery-preview-image-1', 'gallery-preview-image-2', 'gallery-preview-image-3'],
                    state.bestPhotos.slice(0, 3)
                );
                applyImageList(
                    ['gallery-modal-image-1', 'gallery-modal-image-2', 'gallery-modal-image-3', 'gallery-modal-image-4'],
                    state.bestPhotos.slice(0, 4)
                );
            } else {
                if (Array.isArray(state.bestGridImages)) {
                    applyImageList(['best-photo-1', 'best-photo-2'], state.bestGridImages);
                }
                if (Array.isArray(state.bestMarqueeImages)) {
                    applyImageList(['best-marquee-1', 'best-marquee-2', 'best-marquee-3', 'best-marquee-4', 'best-marquee-5', 'best-marquee-6'], state.bestMarqueeImages);
                }
                if (Array.isArray(state.galleryPreviewImages)) {
                    applyImageList(['gallery-preview-image-1', 'gallery-preview-image-2', 'gallery-preview-image-3'], state.galleryPreviewImages);
                }
                if (Array.isArray(state.galleryModalImages)) {
                    applyImageList(['gallery-modal-image-1', 'gallery-modal-image-2', 'gallery-modal-image-3', 'gallery-modal-image-4'], state.galleryModalImages);
                }
            }
            if (state.guestbookCoverImage) {
                document.getElementById('guestbook-cover-image').src = state.guestbookCoverImage;
            }

            const primaryColor = state.primaryColor || '#4caf50';
            const accentColor = state.accentColor || '#ec4899';
            document.documentElement.style.setProperty('--primary-color', primaryColor);
            document.documentElement.style.setProperty('--accent-color', accentColor);
            applyRsvpButtonColors(state.rsvpButtonColor || accentColor);
            document.getElementById('queue-btn').style.backgroundColor = primaryColor;
            document.getElementById('couple-name-right').style.color = primaryColor;
            document.getElementById('donation-btn').style.backgroundColor = accentColor;
            document.getElementById('couple-name-left').style.color = accentColor;

            const donationBtn = document.getElementById('donation-btn');
            const mapUrl = normalizeUrl(state.mapLink || 'https://maps.google.com/?q=Sultani+River+Kinshasa');
            const siteUrl = normalizeUrl(state.siteUrl || window.location.href);
            const shareImage = normalizeUrl(state.shareImage || document.getElementById('about-cover-image').src);
            const description = state.metaDescription || 'Invitation officielle au mariage de Josue et Divine.';
            const supportEmail = (state.supportEmail || 'contact@josue-divine.com').trim();

            donationBtn.dataset.link = normalizeUrl(state.donationLink || 'https://www.paypal.com');
            donationBtn.dataset.whatsapp = (state.whatsappDonationPhone || '').trim();
            donationBtn.dataset.waMessage = state.donationWhatsAppMessage || '';
            document.getElementById('rsvp-form').dataset.externalLink = normalizeUrl(state.rsvpLink || '');
            document.getElementById('venue-map-link').href = mapUrl;
            document.getElementById('support-email-link').href = `mailto:${supportEmail}?subject=Contact%20Mariage%20Josue%20Divine`;

            document.getElementById('meta-description').content = description;
            document.getElementById('meta-og-title').content = document.getElementById('hero-title').textContent.trim();
            document.getElementById('meta-og-description').content = description;
            document.getElementById('meta-og-url').content = siteUrl;
            document.getElementById('meta-og-image').content = shareImage;
            document.getElementById('meta-twitter-title').content = document.getElementById('hero-title').textContent.trim();
            document.getElementById('meta-twitter-description').content = description;
            document.getElementById('meta-twitter-image').content = shareImage;

            if (window.ContentBlocks) ContentBlocks.apply(state);
            if (window.BackgroundMusic) BackgroundMusic.apply(state);
        }

        async function applyPreviewDashboardState(state) {
            if (!state) return;
            const cfg = window.EventConfig && EventConfig.getConfig ? EventConfig.getConfig() : null;
            const defaults = window.ContentBlocks ? ContentBlocks.getDefaultsFromConfig(cfg) : {};
            const merged = { ...defaults, ...state };
            applyCustomizationState(merged);
            if (window.ContentBlocks) ContentBlocks.apply(merged);
            if (window.EventCountdown && merged.countdownDate) {
                const parsed = new Date(merged.countdownDate).getTime();
                if (!Number.isNaN(parsed)) {
                    EventCountdown.setTarget(parsed);
                    EventCountdown.applyDateToUI(merged.countdownDate);
                    EventCountdown.tick();
                }
            }
            if (window.BackgroundMusic) BackgroundMusic.apply(merged);
            const params = new URLSearchParams(window.location.search);
            if (params.get("preview") === "1") {
                const main = document.getElementById("main-view");
                const gate = document.getElementById("welcome-gate");
                if (main && gate && main.classList.contains("hidden")) {
                    openMainSite(null, { skipLoader: true });
                }
            }
        }

        function openCustomizer() {
            if (!isDesignerMode) return showToast('Acces reserve au concepteur');
            const q = window.EventConfig && EventConfig.preserveEventQuery
                ? EventConfig.preserveEventQuery()
                : `?event=${EventConfig.getEventId ? EventConfig.getEventId() : 'yanick-keren'}`;
            window.location.href = `./personnalisation.html${q}`;
        }

        function closeCustomizer() {
            document.getElementById('customizer-page').classList.add('hidden');
            document.body.style.overflow = 'auto';
        }

        function getExistingDashboardBlocks() {
            const scopedKey = window.EventConfig && EventConfig.isReady()
                ? EventConfig.storageKey('dashboard_state')
                : dashboardStateKey;
            try {
                const raw = localStorage.getItem(scopedKey) || localStorage.getItem(dashboardStateKey);
                return raw ? JSON.parse(raw) : {};
            } catch {
                return {};
            }
        }

        function applyCustomization() {
            const existing = getExistingDashboardBlocks();
            const state = {
                ...existing,
                title: document.getElementById('custom-title').value.trim(),
                subtitle: document.getElementById('custom-subtitle').value.trim(),
                coupleLeft: document.getElementById('custom-couple-left').value.trim(),
                coupleRight: document.getElementById('custom-couple-right').value.trim(),
                reserveText: document.getElementById('custom-reserve-text').value.trim(),
                mainText: document.getElementById('custom-main-text').value.trim(),
                day: document.getElementById('custom-day').value.trim(),
                monthYear: document.getElementById('custom-month-year').value.trim(),
                timeRange: document.getElementById('custom-time-range').value.trim(),
                countdownDate: document.getElementById('custom-countdown-date').value,
                welcomeImage: document.getElementById('custom-welcome-image').value.trim(),
                heroImage: document.getElementById('custom-hero-image').value.trim(),
                aboutImage: document.getElementById('custom-about-image').value.trim(),
                mapImage: document.getElementById('custom-map-image').value.trim(),
                aboutTitle: document.getElementById('custom-about-title').value.trim(),
                aboutStory1: document.getElementById('custom-about-story-1').value.trim(),
                aboutStory2: document.getElementById('custom-about-story-2').value.trim(),
                venueTitle: document.getElementById('custom-venue-title').value.trim(),
                venueAddress: document.getElementById('custom-venue-address').value.trim(),
                dressImages: parseImageList(document.getElementById('custom-dress-images').value),
                bestGridImages: parseImageList(document.getElementById('custom-best-grid-images').value),
                bestMarqueeImages: parseImageList(document.getElementById('custom-best-marquee-images').value),
                guestbookCoverImage: document.getElementById('custom-guestbook-cover-image').value.trim(),
                galleryPreviewImages: parseImageList(document.getElementById('custom-gallery-preview-images').value),
                galleryModalImages: parseImageList(document.getElementById('custom-gallery-modal-images').value),
                primaryColor: document.getElementById('custom-primary-color').value,
                accentColor: document.getElementById('custom-accent-color').value,
                rsvpLink: document.getElementById('custom-rsvp-link').value.trim(),
                donationLink: document.getElementById('custom-donation-link').value.trim(),
                mapLink: document.getElementById('custom-map-link').value.trim(),
                supportEmail: document.getElementById('custom-support-email').value.trim(),
                siteUrl: document.getElementById('custom-site-url').value.trim(),
                shareImage: document.getElementById('custom-share-image').value.trim(),
                metaDescription: document.getElementById('custom-meta-description').value.trim()
            };
            applyCustomizationState(state);
            showToast('Aperçu mis à jour');
            return state;
        }

        function saveCustomization() {
            const state = applyCustomization();
            const scopedKey = window.EventConfig && EventConfig.isReady()
                ? EventConfig.storageKey('dashboard_state')
                : dashboardStateKey;
            localStorage.setItem(scopedKey, JSON.stringify(state));
            localStorage.setItem(dashboardStateKey, JSON.stringify(state));
            if (window.DashboardSync && EventConfig.isReady()) {
                DashboardSync.save(EventConfig.getEventId(), state).catch(() => {});
            }
            showToast('Personnalisation sauvegardée');
        }

        function resetCustomization() {
            if (!defaultCustomizationState) return;
            populateCustomizerFields(defaultCustomizationState);
            applyCustomizationState(defaultCustomizationState);
            localStorage.removeItem(dashboardStateKey);
            showToast('Configuration reinitialisee');
        }

        function applyTheme(dark) {
            document.documentElement.classList.toggle('dark-mode', dark);
            document.body.classList.toggle('dark-mode', dark);
            document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
            localStorage.setItem('wedding_theme_mode', dark ? 'dark' : 'light');
            const input = document.getElementById('theme-toggle-input');
            if (input) input.checked = dark;
            const themeMeta = document.querySelector('meta[name="theme-color"]');
            if (themeMeta) {
                themeMeta.setAttribute('content', dark ? '#0f172a' : '#4caf50');
            }
        }

        function syncThemeFromStorage() {
            applyTheme(localStorage.getItem('wedding_theme_mode') === 'dark');
        }

        function toggleTheme() {
            const input = document.getElementById('theme-toggle-input');
            applyTheme(input ? !input.checked : !document.body.classList.contains('dark-mode'));
        }

        function confirmPresence(ev) {
            const run = () => {
                if (window.GuestExperience) {
                    GuestExperience.openRsvp();
                    return;
                }
                prefillRsvpForm();
                openModal('rsvp-modal');
            };
            if (window.ButtonLoading) {
                return ButtonLoading.runWithLoader(ev, 'reserve-deadline-btn', run, 'Ouverture…');
            }
            return run();
        }

        function validatePhone(phone) {
            const digits = (phone || '').replace(/\D/g, '');
            return digits.length >= 9;
        }

        async function submitRsvp(event) {
            event.preventDefault();
            const submitBtn = document.getElementById('rsvp-submit-btn') || event.submitter;

            const run = async () => {
                const payload = {
                    name: document.getElementById('rsvp-name').value.trim(),
                    phone: document.getElementById('rsvp-phone').value.trim(),
                    status: document.getElementById('rsvp-status').value,
                    adults: document.getElementById('rsvp-adults').value,
                    children: document.getElementById('rsvp-children').value,
                    message: document.getElementById('rsvp-message').value.trim(),
                    sentAt: new Date().toISOString()
                };
                if (!payload.name || payload.name.length < 2) {
                    showToast('Nom obligatoire (2 caractères minimum).');
                    return;
                }
                if (!validatePhone(payload.phone)) {
                    showToast('Téléphone invalide (9 chiffres minimum).');
                    return;
                }
                localStorage.setItem('wedding_rsvp_data', JSON.stringify(payload));
                const rsvpList = readLocalJson(rsvpListKey, []);
                rsvpList.unshift(payload);
                localStorage.setItem(rsvpListKey, JSON.stringify(rsvpList));
                localStorage.setItem('wedding_rsvp_status', payload.status);

                if (window.GuestManager) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const token = urlParams.get('t');
                    const guestByToken = token ? await GuestManager.findByToken(token) : null;
                    await GuestManager.recordRSVP({
                        guestId: guestByToken ? guestByToken.id : null,
                        fullName: payload.name,
                        phone: payload.phone,
                        status: payload.status,
                        adults: payload.adults,
                        children: payload.children,
                        message: payload.message,
                        inviteToken: token || ''
                    });
                }

                if (window.CloudAPI && EventConfig.isReady()) {
                    CloudAPI.track(EventConfig.getEventId(), 'rsvp_submit', { status: payload.status });
                }

                const externalRsvpLink = (document.getElementById('rsvp-form').dataset.externalLink || '').trim();
                closeModal('rsvp-modal');

                const confirmCode = window.GuestExperience
                    ? GuestExperience.buildConfirmCode(currentGuestProfile, payload)
                    : buildConfirmationCode(currentGuestProfile, payload);
                const urlParams = new URLSearchParams(window.location.search);
                const token = urlParams.get('t');
                if (token) {
                    localStorage.setItem(`wedding_confirm_${token}`, JSON.stringify({ payload, code: confirmCode }));
                }
                if (payload.name) {
                    const slug = payload.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    localStorage.setItem(`wedding_confirm_name_${slug}`, JSON.stringify({ payload, code: confirmCode }));
                }

                if (window.GuestExperience) {
                    GuestExperience.showConfirmation(payload, confirmCode, currentGuestProfile);
                } else {
                    showRsvpConfirmation(payload, confirmCode, currentGuestProfile);
                }

                if (externalRsvpLink) {
                    setTimeout(() => window.open(externalRsvpLink, '_blank'), 400);
                }
            };

            if (window.ButtonLoading && submitBtn) {
                await ButtonLoading.whileLoading(submitBtn, run(), 'Envoi en cours…');
            } else {
                await run();
            }
        }

        function startQuiz() {
            const cfg = EventConfig.getConfig && EventConfig.getConfig();
            const quizNames = (cfg && cfg.subtitle)
                ? cfg.subtitle.replace(/\s+et\s+/i, '/').replace(/\s*&\s*/i, '/')
                : 'Josue/Divine';
            const answer = window.prompt(`Quiz: Qui est le plus romantique ? (${quizNames})`);
            if (!answer) return;
            showToast('Merci pour votre reponse: ' + answer);
        }

        function openDonationLink(ev) {
            const run = () => {
                const donationUrl = buildWhatsAppDonationUrl();
                window.open(donationUrl, '_blank');
                const isWa = donationUrl.includes('wa.me');
                showToast(isWa ? 'WhatsApp ouvert — envoyez votre message de don.' : 'Page de don ouverte.');
            };
            if (window.ButtonLoading) {
                return ButtonLoading.runWithLoader(ev, 'donation-btn', run, 'Ouverture…');
            }
            return run();
        }

        function openQueueInfo() {
            showToast('Votre groupe est en attente de planification.');
        }

        function renderGuestbookMessages(messages) {
            const container = document.getElementById('guestbook-messages');
            if (!container) return;
            container.innerHTML = '';
            messages.forEach(item => {
                const initials = (item.author || 'Invité')
                    .split(' ')
                    .map(word => word[0] || '')
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || 'IN';
                const card = document.createElement('div');
                card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-50';
                card.innerHTML = `
                    <div class="flex items-center space-x-2 mb-2">
                        <div class="w-8 h-8 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center font-bold text-xs">${initials}</div>
                        <div>
                            <p class="text-xs font-bold msg-author"></p>
                            <p class="text-[9px] text-gray-400 msg-time"></p>
                        </div>
                    </div>
                    <p class="text-xs text-gray-600 msg-content"></p>`;
                card.querySelector('.msg-author').textContent = item.author || 'Invité';
                card.querySelector('.msg-time').textContent = item.sentAt ? new Date(item.sentAt).toLocaleString('fr-FR') : "A l'instant";
                card.querySelector('.msg-content').textContent = item.message || '';
                container.appendChild(card);
            });
        }

        async function loadGuestbookMessages() {
            let messages = readLocalJson(guestbookListKey, []);
            if (window.CloudAPI && EventConfig.isReady()) {
                const cloud = await CloudAPI.getGuestbookMessages(EventConfig.getEventId());
                if (cloud && cloud.length) {
                    messages = cloud.map((m) => ({
                        author: m.author_name || m.authorName,
                        message: m.message,
                        sentAt: m.created_at
                    }));
                }
            }
            if (Array.isArray(messages) && messages.length) {
                renderGuestbookMessages(messages);
            }
        }

        async function publishGuestMessage(ev) {
            const publishBtn = window.ButtonLoading
                ? ButtonLoading.resolveButton(ev, 'guestbook-publish-btn')
                : document.getElementById('guestbook-publish-btn');

            const run = async () => {
                const textarea = document.getElementById('guestbook-textarea');
                const message = textarea.value.trim();
                if (!message || message.length < 3) {
                    showToast('Message trop court (3 caractères min).');
                    return;
                }

                const author = guestName || 'Invité';
                const newItem = { author, message, sentAt: new Date().toISOString() };
                const messages = readLocalJson(guestbookListKey, []);
                messages.unshift(newItem);
                localStorage.setItem(guestbookListKey, JSON.stringify(messages));

                if (window.CloudAPI && EventConfig.isReady()) {
                    await CloudAPI.addGuestbookMessage(EventConfig.getEventId(), {
                        authorName: author,
                        message
                    });
                    CloudAPI.track(EventConfig.getEventId(), 'guestbook_post', {});
                }

                renderGuestbookMessages(messages);
                textarea.value = '';
                showToast('Message publié dans le livre d\'or.');
            };

            if (window.ButtonLoading && publishBtn) {
                await ButtonLoading.whileLoading(publishBtn, run(), 'Publication…');
            } else {
                await run();
            }
        }

        function exportRsvpData() {
            const rows = readLocalJson(rsvpListKey, []);
            downloadJsonFile('rsvp-data.json', rows);
            showToast('Export RSVP téléchargé.');
        }

        function exportGuestbookData() {
            const rows = readLocalJson(guestbookListKey, []);
            downloadJsonFile('livre-or-data.json', rows);
            showToast('Export livre d\'or téléchargé.');
        }

        function copyGuestInvitationLink() {
            const baseUrl = document.getElementById('meta-og-url').content || window.location.origin + window.location.pathname;
            const shareLink = `${baseUrl}?guest=Nom+Invite`;
            navigator.clipboard.writeText(shareLink)
                .then(() => showToast('Lien invité copié.'))
                .catch(() => showToast('Impossible de copier le lien.'));
        }

        function collectBestGalleryImages() {
            const ids = [
                'best-photo-1', 'best-photo-2',
                'best-marquee-1', 'best-marquee-2', 'best-marquee-3', 'best-marquee-4', 'best-marquee-5', 'best-marquee-6',
                'gallery-modal-image-1', 'gallery-modal-image-2', 'gallery-modal-image-3', 'gallery-modal-image-4'
            ];
            const urls = ids
                .map(id => document.getElementById(id))
                .filter(Boolean)
                .map(el => el.src)
                .filter(Boolean);
            return Array.from(new Set(urls));
        }

        function renderBestGalleryDots() {
            const dots = document.getElementById('best-gallery-dots');
            dots.innerHTML = '';
            bestGalleryImages.forEach((_, index) => {
                const dot = document.createElement('button');
                dot.className = `w-2.5 h-2.5 rounded-full transition ${index === bestGalleryIndex ? 'bg-white' : 'bg-white/35'}`;
                dot.setAttribute('aria-label', `Photo ${index + 1}`);
                dot.onclick = () => setBestGallerySlide(index);
                dots.appendChild(dot);
            });
        }

        function setBestGallerySlide(index) {
            if (!bestGalleryImages.length) return;
            if (index < 0) index = bestGalleryImages.length - 1;
            if (index >= bestGalleryImages.length) index = 0;
            bestGalleryIndex = index;

            const image = document.getElementById('best-gallery-main-image');
            image.classList.remove('best-gallery-image-animate');
            void image.offsetWidth;
            image.src = bestGalleryImages[bestGalleryIndex];
            image.classList.add('best-gallery-image-animate');

            document.getElementById('best-gallery-caption').textContent = `Photo ${bestGalleryIndex + 1} / ${bestGalleryImages.length}`;
            renderBestGalleryDots();
        }

        function changeBestGallerySlide(step) {
            setBestGallerySlide(bestGalleryIndex + step);
        }

        function startBestGalleryAutoplay() {
            stopBestGalleryAutoplay();
            bestGalleryInterval = setInterval(() => changeBestGallerySlide(1), 3500);
        }

        function stopBestGalleryAutoplay() {
            if (bestGalleryInterval) {
                clearInterval(bestGalleryInterval);
                bestGalleryInterval = null;
            }
        }

        function openBestPhotosGallery() {
            bestGalleryImages = collectBestGalleryImages();
            if (!bestGalleryImages.length) {
                showToast('Aucune photo disponible.');
                return;
            }
            document.getElementById('best-photos-modal').classList.remove('hidden');
            document.body.classList.add('best-gallery-open');
            document.body.style.overflow = 'hidden';
            setBestGallerySlide(0);
            startBestGalleryAutoplay();
        }

        function closeBestPhotosGallery() {
            document.getElementById('best-photos-modal').classList.add('hidden');
            document.body.classList.remove('best-gallery-open');
            document.body.style.overflow = 'auto';
            stopBestGalleryAutoplay();
        }

        function collectSelectedDrinks() {
            return window.DrinkMenu ? DrinkMenu.getSelected() : [];
        }

        // Système de modales (Pages)
        function openModal(id) {
            if (id === 'rsvp-modal') {
                if (typeof prefillRsvpForm === 'function') prefillRsvpForm();
                if (window.DrinkMenu) DrinkMenu.syncToRsvp();
            }
            const modal = document.getElementById(id);
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.classList.remove('modal-leave');
            modal.classList.add('modal-enter');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(id) {
            const modal = document.getElementById(id);
            if (!modal) return;
            modal.classList.remove('modal-enter');
            modal.classList.add('modal-leave');
            setTimeout(() => {
                if (!document.getElementById(id)) return;
                modal.classList.add('hidden');
                document.body.style.overflow = 'auto';
            }, 300);
        }

        syncThemeFromStorage();
        const themeSwitch = document.getElementById('theme-switch');
        if (themeSwitch) {
            let lastThemeToggle = 0;
            const handleThemeToggle = (event) => {
                event.preventDefault();
                const now = Date.now();
                if (now - lastThemeToggle < 400) return;
                lastThemeToggle = now;
                toggleTheme();
            };
            themeSwitch.addEventListener('click', handleThemeToggle);
            themeSwitch.addEventListener('touchend', handleThemeToggle, { passive: false });
        }
        if (!document.getElementById('meta-og-url').content) {
            document.getElementById('meta-og-url').content = window.location.href;
        }
        if (!document.getElementById('meta-og-image').content) {
            const fallbackImage = document.getElementById('about-cover-image').src;
            document.getElementById('meta-og-image').content = fallbackImage;
            document.getElementById('meta-twitter-image').content = fallbackImage;
        }
        document.addEventListener('keydown', (event) => {
            const isBestGalleryOpen = !document.getElementById('best-photos-modal').classList.contains('hidden');
            if (!isBestGalleryOpen) return;
            if (event.key === 'Escape') closeBestPhotosGallery();
            if (event.key === 'ArrowRight') changeBestGallerySlide(1);
            if (event.key === 'ArrowLeft') changeBestGallerySlide(-1);
        });
        loadGuestbookMessages();

        const isPreviewModePage = new URLSearchParams(window.location.search).get('preview') === '1';
        const previewMessageQueue = [];

        if (isPreviewModePage) {
            window.addEventListener('message', (event) => {
                if (event.origin !== window.location.origin) return;
                if (!event.data || event.data.type !== 'WEDDING_PREVIEW_STATE') return;
                previewMessageQueue.push(event.data.payload);
                if (typeof applyPreviewDashboardState === 'function') {
                    applyPreviewDashboardState(event.data.payload).catch(() => {});
                }
            });
        }

        (async function bootstrapApp() {
            const isPreviewMode = isPreviewModePage;

            if (window.EventConfig) {
                try {
                    await EventConfig.init();
                    if (!isPreviewMode) EventConfig.applyToPage();
                } catch (e) {}
            }

            if (window.I18n) {
                I18n.apply(I18n.getLang());
            }

            document.querySelectorAll('img:not([loading])').forEach((img, i) => {
                if (i > 2) img.loading = 'lazy';
            });

            if (window.CloudAPI && EventConfig.isReady() && !isPreviewMode) {
                CloudAPI.track(EventConfig.getEventId(), 'page_view', {});
            }

            if ('serviceWorker' in navigator && !isPreviewMode) {
                navigator.serviceWorker.register('../sw.js?v=25').catch(() => {});
            }

            defaultCustomizationState = getCurrentCustomizationState();
            const scopedDashboardKey = window.EventConfig && EventConfig.isReady()
                ? EventConfig.storageKey('dashboard_state')
                : dashboardStateKey;
            let dashboardState = null;

            if (window.DashboardSync && EventConfig.isReady()) {
                const cfg = EventConfig.getConfig();
                const defaults = window.ContentBlocks
                    ? ContentBlocks.getDefaultsFromConfig(cfg)
                    : {};
                try {
                    dashboardState = await DashboardSync.load(
                        EventConfig.getEventId(),
                        defaults,
                        { preferLocal: isPreviewMode, preferCloud: !isPreviewMode }
                    );
                    const hasLocalCursorImages = JSON.stringify(dashboardState).includes('file:///C:/Users/AL/.cursor');
                    if (hasLocalCursorImages) {
                        localStorage.removeItem(scopedDashboardKey);
                        localStorage.removeItem(dashboardStateKey);
                        dashboardState = await DashboardSync.load(
                            EventConfig.getEventId(),
                            defaults,
                            { preferCloud: true }
                        );
                    }
                    if (dashboardState) {
                        dashboardState = await syncAndApplyDashboardState(
                            dashboardState,
                            EventConfig.getEventId(),
                            cfg
                        );
                    }
                } catch (e) {
                    dashboardState = null;
                }
            } else {
                const savedState = localStorage.getItem(scopedDashboardKey) || localStorage.getItem(dashboardStateKey);
                if (savedState) {
                    try {
                        dashboardState = JSON.parse(savedState);
                        const hasLocalCursorImages = JSON.stringify(dashboardState).includes('file:///C:/Users/AL/.cursor');
                        if (hasLocalCursorImages) {
                            localStorage.removeItem(scopedDashboardKey);
                            localStorage.removeItem(dashboardStateKey);
                            dashboardState = null;
                        } else {
                            const cfg = EventConfig.getConfig && EventConfig.getConfig();
                            dashboardState = await syncAndApplyDashboardState(
                                dashboardState,
                                EventConfig.getEventId ? EventConfig.getEventId() : null,
                                cfg
                            );
                        }
                    } catch (e) {}
                }
            }

            if (window.EventCountdown) {
                EventCountdown.initFromConfig(
                    EventConfig.getConfig && EventConfig.getConfig(),
                    dashboardState
                );
            }

            if (window.ContentBlocks) {
                const cfg = EventConfig.getConfig && EventConfig.getConfig();
                const defaults = ContentBlocks.getDefaultsFromConfig(cfg);
                const merged = { ...defaults, ...(dashboardState || {}) };
                ContentBlocks.apply(merged);
            }

            if (window.BackgroundMusic) {
                const cfg = EventConfig.getConfig && EventConfig.getConfig();
                const defaults = window.ContentBlocks ? ContentBlocks.getDefaultsFromConfig(cfg) : {};
                const merged = { ...defaults, ...(dashboardState || {}) };
                BackgroundMusic.apply(merged);
                BackgroundMusic.init();
            }

            await initEntryFlow();

            if (isPreviewMode) {
                guestName = guestName || 'Aperçu';
                openMainSite(null, { skipLoader: true });
                document.body.classList.add('preview-mode');

                let latestPreview = previewMessageQueue.length
                    ? previewMessageQueue[previewMessageQueue.length - 1]
                    : null;
                if (!latestPreview && window.DashboardSync && EventConfig.isReady()) {
                    latestPreview = DashboardSync.readPreview(EventConfig.getEventId());
                }
                if (latestPreview) {
                    await applyPreviewDashboardState(latestPreview);
                } else if (dashboardState) {
                    await applyPreviewDashboardState(dashboardState);
                }
            }

            if (window.CalendarExport) CalendarExport.init();

            applyDesignerVisibility();
        })();

        // Fallback listeners uniquement si pas d'onclick inline (évite double déclenchement)
        const gateOpenBtn = document.getElementById('gate-enter-btn');
        if (gateOpenBtn && !gateOpenBtn.getAttribute('onclick')) {
            gateOpenBtn.addEventListener('click', enterExperience);
        }
        const gateBackBtn = document.getElementById('gate-welcome-open-btn');
        if (gateBackBtn && !gateBackBtn.getAttribute('onclick')) {
            gateBackBtn.addEventListener('click', openMainSite);
        }
        const personalGateBtn = document.getElementById('gate-personal-open-btn');
        if (personalGateBtn && !personalGateBtn.getAttribute('onclick')) {
            personalGateBtn.addEventListener('click', openMainSite);
        }
        const reserveBtn = document.getElementById('reserve-deadline-btn');
        if (reserveBtn && !reserveBtn.getAttribute('onclick')) {
            reserveBtn.addEventListener('click', confirmPresence);
        }
        const confirmPresenceBtn = document.getElementById('confirm-presence-btn');
        if (confirmPresenceBtn && !confirmPresenceBtn.getAttribute('onclick')) {
            confirmPresenceBtn.addEventListener('click', confirmPresence);
        }

        // Garantit l'accès depuis les attributs onclick du HTML
        window.enterExperience = enterExperience;
        window.applyPreviewDashboardState = applyPreviewDashboardState;
        window.openMainSite = openMainSite;
        window.openModal = openModal;
        window.closeModal = closeModal;
        window.openCustomizer = openCustomizer;
        window.closeCustomizer = closeCustomizer;
        window.applyCustomization = applyCustomization;
        window.saveCustomization = saveCustomization;
        window.resetCustomization = resetCustomization;
        window.openBestPhotosGallery = openBestPhotosGallery;
        window.closeBestPhotosGallery = closeBestPhotosGallery;
        window.collectSelectedDrinks = collectSelectedDrinks;
        window.changeBestGallerySlide = changeBestGallerySlide;
        window.requestDesignerAccess = requestDesignerAccess;
        window.publishGuestMessage = publishGuestMessage;
        window.openDonationLink = openDonationLink;
        window.startQuiz = startQuiz;
        window.confirmPresence = confirmPresence;
        window.openQueueInfo = openQueueInfo;
        window.submitRsvp = submitRsvp;
            window.applyTheme = applyTheme;
            window.toggleTheme = toggleTheme;
        if (window.I18n) window.I18n = I18n;