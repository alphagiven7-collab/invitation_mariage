// Initialiser les icônes Lucide (sans bloquer le reste)
        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }
        const DESIGNER_ACCESS_CODE = 'YANICK-KEREN-ADMIN';
        const designerModeKey = 'wedding_designer_mode';
        const dashboardStateKey = 'wedding_dashboard_state';
        const rsvpListKey = 'wedding_rsvp_list';
        const guestbookListKey = 'wedding_guestbook_messages';
let isDesignerMode = localStorage.getItem(designerModeKey) === '1';
        let countDownDate = new Date("Apr 30, 2026 19:30:00").getTime();
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

        function enterExperience() {
            const input = document.getElementById('gate-guest-name-input').value.trim();
            if (input.length < 2) {
                showToast('Entrez votre nom');
                return;
            }
            guestName = input;
            localStorage.setItem('wedding_guest_name_simple', guestName);
            openMainSite();
        }

        function openMainSite() {
            if (!guestName) {
                guestName = (localStorage.getItem('wedding_guest_name_simple') || '').trim();
            }
            if (currentGuestProfile) applyGuestProfile(currentGuestProfile);
            applyGuestName(guestName);
            const gate = document.getElementById('welcome-gate');
            const main = document.getElementById('main-view');
            gate.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                gate.classList.add('hidden');
                main.classList.remove('hidden');
                requestAnimationFrame(() => main.classList.remove('opacity-0'));
                document.body.style.overflow = 'auto';
            }, 450);
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
            const couple = (cfg && cfg.subtitle) ? cfg.subtitle : 'Yanick & Keren';
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

        function showRsvpConfirmation(payload, confirmCode) {
            const cfg = EventConfig.getConfig && EventConfig.getConfig();
            const eventTitle = (cfg && cfg.title) ? cfg.title : 'Mariage de Yanick et Keren';
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
                                setTimeout(() => showRsvpConfirmation(data.payload, data.code), 800);
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
            const btn = document.getElementById('designer-customize-btn');
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
            ids.forEach((id, index) => {
                if (urls[index]) {
                    const el = document.getElementById(id);
                    if (el) el.src = urls[index];
                }
            });
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
;
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
                countdownDate: toDateTimeLocal(countDownDate),
                welcomeImage: getCssUrlVariable('--welcome-image-url'),
                heroImage: getCssUrlVariable('--hero-image-url'),
                aboutImage: document.getElementById('about-cover-image').src,
                mapImage: document.getElementById('map-image').src,
                aboutTitle: document.getElementById('about-story-title').textContent.trim(),
                aboutStory1: document.getElementById('about-story-paragraph-1').textContent.trim(),
                aboutStory2: document.getElementById('about-story-paragraph-2').textContent.trim(),
                venueTitle: document.getElementById('venue-title').textContent.trim(),
                venueAddress: document.getElementById('venue-address').textContent.trim(),
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

        function applyCustomizationState(state) {
            if (state.title) document.getElementById('hero-title').textContent = state.title;
            if (state.subtitle) document.getElementById('hero-subtitle').textContent = state.subtitle;
            if (state.coupleLeft) document.getElementById('couple-name-left').textContent = state.coupleLeft;
            if (state.coupleRight) document.getElementById('couple-name-right').textContent = state.coupleRight;
            if (state.reserveText) document.getElementById('reserve-deadline-text').textContent = state.reserveText;
            if (state.mainText) document.getElementById('invite-main-text').textContent = state.mainText;
            if (state.day) document.getElementById('event-day').textContent = state.day;
            if (state.monthYear) document.getElementById('event-month-year').textContent = state.monthYear;
            if (state.timeRange) document.getElementById('event-time-range').textContent = state.timeRange;
            if (state.venueTitle) document.getElementById('venue-title').textContent = state.venueTitle;
            if (state.venueAddress) document.getElementById('venue-address').textContent = state.venueAddress;
            if (state.aboutTitle) document.getElementById('about-story-title').textContent = state.aboutTitle;
            if (state.aboutStory1) document.getElementById('about-story-paragraph-1').textContent = state.aboutStory1;
            if (state.aboutStory2) document.getElementById('about-story-paragraph-2').textContent = state.aboutStory2;

            if (state.welcomeImage) document.documentElement.style.setProperty('--welcome-image-url', `url('${state.welcomeImage}')`);
            if (state.heroImage) document.documentElement.style.setProperty('--hero-image-url', `url('${state.heroImage}')`);
            if (state.aboutImage) {
                document.getElementById('about-cover-image').src = state.aboutImage;
                document.getElementById('about-modal-image').src = state.aboutImage;
            }
            if (state.mapImage) document.getElementById('map-image').src = state.mapImage;

            if (state.countdownDate) {
                const parsedDate = new Date(state.countdownDate).getTime();
                if (!Number.isNaN(parsedDate)) countDownDate = parsedDate;
            }

            if (Array.isArray(state.dressImages)) {
                applyImageList(['dress-photo-1', 'dress-photo-2', 'dress-photo-3', 'dress-photo-4', 'dress-photo-5', 'dress-photo-6', 'dress-photo-7', 'dress-photo-8'], state.dressImages);
            }
            if (Array.isArray(state.bestGridImages)) {
                applyImageList(['best-photo-1', 'best-photo-2'], state.bestGridImages);
            }
            if (Array.isArray(state.bestMarqueeImages)) {
                applyImageList(['best-marquee-1', 'best-marquee-2', 'best-marquee-3', 'best-marquee-4', 'best-marquee-5', 'best-marquee-6'], state.bestMarqueeImages);
            }
            if (state.guestbookCoverImage) {
                document.getElementById('guestbook-cover-image').src = state.guestbookCoverImage;
            }
            if (Array.isArray(state.galleryPreviewImages)) {
                applyImageList(['gallery-preview-image-1', 'gallery-preview-image-2', 'gallery-preview-image-3'], state.galleryPreviewImages);
            }
            if (Array.isArray(state.galleryModalImages)) {
                applyImageList(['gallery-modal-image-1', 'gallery-modal-image-2', 'gallery-modal-image-3', 'gallery-modal-image-4'], state.galleryModalImages);
            }

            const primaryColor = state.primaryColor || '#4caf50';
            const accentColor = state.accentColor || '#ec4899';
            document.documentElement.style.setProperty('--primary-color', primaryColor);
            document.documentElement.style.setProperty('--accent-color', accentColor);
            document.getElementById('confirm-presence-btn').style.backgroundColor = primaryColor;
            document.getElementById('queue-btn').style.backgroundColor = primaryColor;
            document.getElementById('couple-name-right').style.color = primaryColor;
            document.getElementById('donation-btn').style.backgroundColor = accentColor;
            document.getElementById('couple-name-left').style.color = accentColor;
            document.getElementById('reserve-deadline-btn').style.borderColor = accentColor;

            const donationUrl = normalizeUrl(state.donationLink || 'https://www.paypal.com');
            const mapUrl = normalizeUrl(state.mapLink || 'https://maps.google.com/?q=Sultani+River+Kinshasa');
            const siteUrl = normalizeUrl(state.siteUrl || window.location.href);
            const shareImage = normalizeUrl(state.shareImage || document.getElementById('about-cover-image').src);
            const description = state.metaDescription || 'Invitation officielle au mariage de Yanick et Keren.';
            const supportEmail = (state.supportEmail || 'weddingplanner@yanick-keren.com').trim();

            document.getElementById('donation-btn').dataset.link = donationUrl;
            document.getElementById('rsvp-form').dataset.externalLink = normalizeUrl(state.rsvpLink || '');
            document.getElementById('venue-map-link').href = mapUrl;
            document.getElementById('support-email-link').href = `mailto:${supportEmail}?subject=Contact%20Mariage%20Yanick%20Keren`;

            document.getElementById('meta-description').content = description;
            document.getElementById('meta-og-title').content = document.getElementById('hero-title').textContent.trim();
            document.getElementById('meta-og-description').content = description;
            document.getElementById('meta-og-url').content = siteUrl;
            document.getElementById('meta-og-image').content = shareImage;
            document.getElementById('meta-twitter-title').content = document.getElementById('hero-title').textContent.trim();
            document.getElementById('meta-twitter-description').content = description;
            document.getElementById('meta-twitter-image').content = shareImage;
        }

        function openCustomizer() {
            if (!isDesignerMode) return showToast('Acces reserve au concepteur');
            populateCustomizerFields(getCurrentCustomizationState());
            document.getElementById('customizer-page').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeCustomizer() {
            document.getElementById('customizer-page').classList.add('hidden');
            document.body.style.overflow = 'auto';
        }

        function applyCustomization() {
            const state = {
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
            localStorage.setItem(dashboardStateKey, JSON.stringify(state));
            showToast('Personnalisation sauvegardée');
        }

        function resetCustomization() {
            if (!defaultCustomizationState) return;
            populateCustomizerFields(defaultCustomizationState);
            applyCustomizationState(defaultCustomizationState);
            localStorage.removeItem(dashboardStateKey);
            showToast('Configuration reinitialisee');
        }

        function toggleTheme() {
            document.body.classList.toggle('dark-mode');
            const dark = document.body.classList.contains('dark-mode');
            localStorage.setItem('wedding_theme_mode', dark ? 'dark' : 'light');
            document.getElementById('toggle-theme-btn').textContent = dark ? 'Light' : 'Dark';
        }

        function confirmPresence() {
            prefillRsvpForm();
            openModal('rsvp-modal');
        }

        function validatePhone(phone) {
            const digits = (phone || '').replace(/\D/g, '');
            return digits.length >= 9;
        }

        async function submitRsvp(event) {
            event.preventDefault();
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
                    message: payload.message
                });
            }

            if (window.CloudAPI && EventConfig.isReady()) {
                CloudAPI.track(EventConfig.getEventId(), 'rsvp_submit', { status: payload.status });
            }

            const externalRsvpLink = (document.getElementById('rsvp-form').dataset.externalLink || '').trim();
            closeModal('rsvp-modal');

            const confirmCode = buildConfirmationCode(currentGuestProfile, payload);
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('t');
            if (token) {
                localStorage.setItem(`wedding_confirm_${token}`, JSON.stringify({ payload, code: confirmCode }));
            }

            showRsvpConfirmation(payload, confirmCode);

            if (externalRsvpLink) {
                setTimeout(() => window.open(externalRsvpLink, '_blank'), 400);
            }
        }

        function startQuiz() {
            const answer = window.prompt('Quiz: Qui est le plus romantique ? (Yanick/Keren)');
            if (!answer) return;
            showToast('Merci pour votre reponse: ' + answer);
        }

        function openDonationLink() {
            const donationUrl = document.getElementById('donation-btn').dataset.link || 'https://www.paypal.com';
            window.open(donationUrl, '_blank');
            showToast('Page de don ouverte.');
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

        async function publishGuestMessage() {
            const textarea = document.getElementById('guestbook-textarea');
            const message = textarea.value.trim();
            if (!message || message.length < 3) return showToast('Message trop court (3 caractères min).');

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
            document.body.style.overflow = 'hidden';
            setBestGallerySlide(0);
            startBestGalleryAutoplay();
        }

        function closeBestPhotosGallery() {
            document.getElementById('best-photos-modal').classList.add('hidden');
            document.body.style.overflow = 'auto';
            stopBestGalleryAutoplay();
        }

        // Système de modales (Pages)
        function openModal(id) {
            if (id === 'rsvp-modal') prefillRsvpForm();
            const modal = document.getElementById(id);
            modal.classList.remove('hidden');
            modal.classList.remove('modal-leave');
            modal.classList.add('modal-enter');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(id) {
            const modal = document.getElementById(id);
            modal.classList.remove('modal-enter');
            modal.classList.add('modal-leave');
            setTimeout(() => {
                modal.classList.add('hidden');
                document.body.style.overflow = 'auto';
            }, 300); // Correspond à la durée de l'animation CSS
        }

        // Compte à rebours
        const x = setInterval(function() {
            const now = new Date().getTime();
            const distance = countDownDate - now;

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            document.getElementById("days").innerHTML = days < 10 ? '0'+days : days;
            document.getElementById("hours").innerHTML = hours < 10 ? '0'+hours : hours;
            document.getElementById("minutes").innerHTML = minutes < 10 ? '0'+minutes : minutes;
            document.getElementById("seconds").innerHTML = seconds < 10 ? '0'+seconds : seconds;

            if (distance < 0) {
                clearInterval(x);
                document.getElementById("days").innerHTML = "00";
                document.getElementById("hours").innerHTML = "00";
                document.getElementById("minutes").innerHTML = "00";
                document.getElementById("seconds").innerHTML = "00";
            }
        }, 1000);

        const savedTheme = localStorage.getItem('wedding_theme_mode');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            document.getElementById('toggle-theme-btn').textContent = 'Light';
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

        (async function bootstrapApp() {
            if (window.EventConfig) {
                try {
                    await EventConfig.init();
                    EventConfig.applyToPage();
                    const cfg = EventConfig.getConfig();
                    if (cfg && cfg.eventDate) {
                        countDownDate = new Date(cfg.eventDate).getTime();
                    }
                } catch (e) {}
            }

            if (window.I18n) {
                I18n.apply(I18n.getLang());
            }

            document.querySelectorAll('img:not([loading])').forEach((img, i) => {
                if (i > 2) img.loading = 'lazy';
            });

            if (window.CloudAPI && EventConfig.isReady()) {
                CloudAPI.track(EventConfig.getEventId(), 'page_view', {});
            }

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('../sw.js').catch(() => {});
            }

            defaultCustomizationState = getCurrentCustomizationState();
            const scopedDashboardKey = window.EventConfig && EventConfig.isReady()
                ? EventConfig.storageKey('dashboard_state')
                : dashboardStateKey;
            const savedState = localStorage.getItem(scopedDashboardKey) || localStorage.getItem(dashboardStateKey);
            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    const hasLocalCursorImages = JSON.stringify(state).includes('file:///C:/Users/AL/.cursor');
                    if (hasLocalCursorImages) {
                        localStorage.removeItem(scopedDashboardKey);
                        localStorage.removeItem(dashboardStateKey);
                    } else {
                        applyCustomizationState(state);
                    }
                } catch (e) {}
            }

            await initEntryFlow();
            applyDesignerVisibility();
        })();

        // Fallback: si les onclick inline échouent, ces listeners prennent le relais
        const gateOpenBtn = document.querySelector('#gate-name-input-container button');
        if (gateOpenBtn) {
            gateOpenBtn.addEventListener('click', enterExperience);
        }
        const gateBackBtn = document.querySelector('#gate-welcome-back-container button');
        if (gateBackBtn) {
            gateBackBtn.addEventListener('click', openMainSite);
        }

        // Garantit l'accès depuis les attributs onclick du HTML
        window.enterExperience = enterExperience;
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
        window.changeBestGallerySlide = changeBestGallerySlide;
        window.requestDesignerAccess = requestDesignerAccess;
        window.publishGuestMessage = publishGuestMessage;
        window.openDonationLink = openDonationLink;
        window.startQuiz = startQuiz;
        window.confirmPresence = confirmPresence;
        window.openQueueInfo = openQueueInfo;
        window.submitRsvp = submitRsvp;
        window.toggleTheme = toggleTheme;
        if (window.I18n) window.I18n = I18n;