/* Installation et reprise : la copie invitée n'accorde aucun droit organisateur. */
window.PwaRuntime = (() => {
    let preparing = null;
    let prepared = false;
    let organizerEvent = '';
    let organizerIdentity = '';
    let checkingSession = null;
    let usedOffline = false;
    let revoked = false;
    const params = new URLSearchParams(window.location.search);
    const isInvitation = window.location.pathname.endsWith('/invitation.html');
    const isOrganizer = window.location.pathname.endsWith('/admin.html');
    const isPreview = params.has('preview') || params.has('print');
    const eventId = () => (params.get('event') || 'demo').trim().toLowerCase();
    const token = () => (params.get('t') || '').trim();

    function canonicalUrl() {
        const url = new URL('/pages/invitation.html', window.location.origin);
        url.searchParams.set('event', eventId());
        if (token()) url.searchParams.set('t', token());
        return url.href;
    }

    function collectResources() {
        const required = new Set();
        const optional = new Set();
        const add = (value, essential = false) => {
            if (!value || /^(data|blob):/.test(value)) return;
            try {
                const url = new URL(value, window.location.href);
                (essential && url.origin === window.location.origin ? required : optional).add(url.href);
            } catch { /* URL non exploitable */ }
        };
        document.querySelectorAll('script[src], link[rel="stylesheet"]').forEach((element) => add(element.src || element.href, true));
        document.querySelectorAll('img[src]').forEach((element) => add(element.currentSrc || element.src));
        document.querySelectorAll('[style]').forEach((element) => {
            for (const match of element.style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1]);
        });
        (window.EventConfig?.getConfig?.()?.bestPhotos || []).forEach((value) => add(value));
        return { required: [...required], optional: [...optional] };
    }

    async function prepareInvitation() {
        if (prepared) return true;
        if (preparing) return preparing;
        if (!('serviceWorker' in navigator) || !window.MessageChannel || navigator.onLine === false) return false;
        preparing = (async () => {
            try {
                await navigator.serviceWorker.register('/sw.js?v=63');
                // ready ne garantit pas que le premier onglet est déjà contrôlé.
                const registration = await Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise((resolve) => setTimeout(() => resolve(null), 10000))
                ]);
                const worker = navigator.serviceWorker.controller || registration?.active;
                if (!worker) return false;
                const resources = collectResources();
                return await new Promise((resolve) => {
                    const channel = new MessageChannel();
                    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 30000);
                    channel.port1.onmessage = (event) => {
                        clearTimeout(timer);
                        channel.port1.close();
                        prepared = event.data?.ok === true;
                        resolve(prepared);
                    };
                    const pageUrl = isOrganizer
                        ? new URL(`/pages/admin.html?event=${encodeURIComponent(organizerEvent)}`, window.location.origin).href
                        : canonicalUrl();
                    worker.postMessage({ type: isOrganizer ? 'PREPARE_ORGANIZER' : 'PREPARE_INVITATION', pageUrl, ...resources }, [channel.port2]);
                });
            } catch { return false; }
        })().finally(() => { preparing = null; });
        return preparing;
    }

    function offlineNotice() {
        usedOffline = true;
        if (!isInvitation || isPreview || revoked) return;
        let notice = document.getElementById('invitation-offline-status');
        if (!notice) {
            notice = document.createElement('p');
            notice.id = 'invitation-offline-status';
            notice.className = 'pwa-offline-status';
            notice.setAttribute('role', 'status');
            document.body.prepend(notice);
        }
        notice.textContent = 'Hors connexion · Dernière invitation enregistrée. Les réponses, messages, GPS et musique en ligne nécessitent Internet.';
    }

    async function offerInvitation(guest = null, { publicConfirmed = false } = {}) {
        if (!isInvitation || isPreview || revoked) return;
        if (token()) {
            if (!guest?.id || guest.status !== 'yes' || guest.eventId !== eventId() || guest.token !== token()) return;
        } else if (!publicConfirmed) return;
        else {
            try { localStorage.setItem(`wedding_event_${eventId()}_pwa_open_confirmed`, '1'); } catch {}
        }
        // L'offre apparaît immédiatement après confirmation, sans attendre les photos.
        window.PwaInstall?.offerInvitation({ eventId: eventId(), token: token(), offlineReady: prepared });
        const ready = await prepareInvitation();
        const savedProfile = !token() || !!window.InvitationOffline?.readGuest(eventId(), token());
        if (!revoked) window.PwaInstall?.offerInvitation({ eventId: eventId(), token: token(), offlineReady: ready && savedProfile });
    }

    function blockOrganizer(message = 'Connexion Internet nécessaire pour vérifier votre accès. Votre session reste mémorisée.') {
        if (!isOrganizer) return;
        document.body.classList.add('pwa-session-pending');
        const gate = document.getElementById('pwa-session-gate');
        if (!gate) return;
        gate.hidden = false;
        const text = gate.querySelector('[data-session-message]');
        if (text) text.textContent = message;
    }

    function revealOrganizer() {
        document.body.classList.remove('pwa-session-pending');
        const gate = document.getElementById('pwa-session-gate');
        if (gate) gate.hidden = true;
    }

    async function checkOrganizer() {
        if (checkingSession) return checkingSession;
        if (!organizerEvent) return;
        blockOrganizer('Vérification de votre accès…');
        checkingSession = (async () => {
            await window.AuthGuard?.refreshSession({ force: true });
            if (window.AuthGuard?.getSessionStatus?.() === 'offline') {
                blockOrganizer();
                return;
            }
            if (!window.AuthGuard?.isGuestManager(organizerEvent)) {
                window.location.replace(`/pages/login.html?event=${encodeURIComponent(organizerEvent)}`);
                return;
            }
            revealOrganizer();
        })().catch(() => blockOrganizer()).finally(() => { checkingSession = null; });
        return checkingSession;
    }

    function enableOrganizer(id) {
        if (!window.AuthGuard?.isGuestManager(id)) return;
        organizerEvent = id;
        const session = window.AuthGuard.getSession();
        organizerIdentity = JSON.stringify([session.userId, session.role, session.eventId]);
        revealOrganizer();
        void prepareInvitation();
        window.PwaInstall?.offerOrganizer({ eventId: id });
        setInterval(() => {
            if (document.visibilityState === 'visible' && navigator.onLine !== false) void checkOrganizer();
        }, 5 * 60 * 1000);
    }

    function revokeInvitation(event) {
        const detail = event.detail || {};
        if (!isInvitation || detail.eventId !== eventId() || (detail.scope !== 'event' && detail.token !== token())) return;
        revoked = true;
        prepared = false;
        window.PwaInstall?.clearOffer?.();
        navigator.serviceWorker?.controller?.postMessage({ type: 'FORGET_INVITATION', scope: detail.scope });
        // Retirer toute carte déjà affichée avant de recharger/ouvrir un autre onglet.
        document.querySelectorAll('[data-pwa-install="invitation"]').forEach((node) => { node.hidden = true; });
        document.getElementById('rsvp-confirmation-modal')?.classList.add('hidden');
        const table = document.getElementById('invite-table-assignment');
        if (table) table.hidden = true;
        const name = document.getElementById('display-guest-name');
        if (name) name.textContent = 'Invité(e)';
    }

    window.addEventListener('offlineinvitation:used', offlineNotice);
    window.addEventListener('invitation:revoked', revokeInvitation);
    window.addEventListener('eventconfig:ready', () => {
        const cfg = window.EventConfig?.getConfig?.() || {};
        const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone;
        let saved = false;
        try { saved = localStorage.getItem(`wedding_event_${eventId()}_pwa_open_confirmed`) === '1'; } catch {}
        if (!token() && (cfg.rsvpMode === 'open' || cfg.type === 'open-rsvp') && (saved || standalone)) {
            // Attendre l'application des photos/couleurs à la page.
            setTimeout(() => { void offerInvitation(null, { publicConfirmed: true }); }, 500);
        }
    });
    window.addEventListener('offline', () => {
        if (isInvitation) offlineNotice();
        if (isOrganizer) blockOrganizer();
    });
    window.addEventListener('online', () => {
        if (isInvitation && (usedOffline || window.InvitationOffline?.isOffline())) window.location.reload();
        if (isOrganizer) window.location.reload();
    });
    window.addEventListener('pageshow', (event) => {
        if (isOrganizer && event.persisted) void checkOrganizer();
        if (isInvitation && event.persisted) window.location.reload();
    });
    document.addEventListener('visibilitychange', () => {
        if (!isOrganizer || !organizerEvent) return;
        if (document.visibilityState === 'hidden') blockOrganizer('Vérification de votre accès…');
        else void checkOrganizer();
    });
    window.addEventListener('auth:signed-out', () => {
        if (isOrganizer) {
            window.PwaInstall?.clearOffer?.();
            blockOrganizer('Votre session est terminée.');
            document.querySelector('.dash-wrap')?.replaceChildren();
            window.GuestManager?.invalidateCache?.();
            window.TableManager?.invalidate?.();
        }
    });
    window.addEventListener('storage', (event) => {
        if (!isOrganizer || !organizerIdentity || event.key !== 'wedding_admin_session' || !event.newValue) return;
        try {
            const session = JSON.parse(event.newValue);
            if (JSON.stringify([session.userId, session.role, session.eventId]) !== organizerIdentity) {
                blockOrganizer('Reprise de votre session…');
                document.querySelector('.dash-wrap')?.replaceChildren();
                window.location.reload();
            }
        } catch { blockOrganizer(); }
    });
    document.getElementById('pwa-session-retry')?.addEventListener('click', () => window.location.reload());
    if (!isPreview && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=63').catch(() => {});
    if (isInvitation && navigator.onLine === false) offlineNotice();
    return { offerInvitation, enableOrganizer, blockOrganizer, prepareInvitation, collectResources, isRevoked: () => revoked };
})();
