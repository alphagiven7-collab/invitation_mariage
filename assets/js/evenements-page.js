(() => {
    const M = window.EventMetrics;
    const $ = (id) => document.getElementById(id);
    let events = [];
    let payments = {};
    let goal = null;
    let savingGoal = false;
    let billingReady = false;
    let selectedId = null;
    let loading = false;
    let saving = false;
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const searchText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const typeLabel = (type) => ({ wedding: "Mariage", birthday: "Anniversaire", conference: "Conférence", party: "Événement ouvert" }[type] || "Événement");

    async function billingRequest(method = "GET", eventId = "", body, resource = '') {
        await AuthGuard.refreshSession();
        const token = AuthGuard.getSession()?.accessToken;
        if (!token || !AuthGuard.isPlatformAdmin()) throw new Error("Votre session a expiré. Reconnectez-vous.");
        const query = resource ? `?resource=${encodeURIComponent(resource)}` : eventId ? `?event=${encodeURIComponent(eventId)}` : '';
        const response = await fetch(`/api/event-billing${query}`, {
            method, cache: "no-store",
            headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Suivi des paiements indisponible.");
        return result;
    }

    function renderSummary() {
        $('goal-edit').disabled = !billingReady;
        $('events-count').textContent = events.length;
        $('events-upcoming').textContent = events.filter((event) => ["upcoming", "today"].includes(M.timing(event.eventDate).status)).length;
        $('events-completed').textContent = events.filter((event) => M.timing(event.eventDate).status === "completed").length;
        $('events-guests').textContent = events.reduce((sum, event) => sum + event.stats.guests, 0).toLocaleString('fr-FR');
        $('events-confirmed').textContent = `${events.reduce((sum, event) => sum + event.stats.confirmed, 0).toLocaleString('fr-FR')} confirmation(s) de présence`;
        if (!billingReady) {
            ['finance-received', 'finance-balance', 'finance-status'].forEach((id) => { $(id).textContent = '—'; });
            $('finance-coverage').textContent = loading ? 'Chargement des paiements…' : 'Paiements indisponibles pour le moment';
            $('goal-amount').textContent = '—';
            $('goal-progress-label').textContent = loading ? 'Chargement de l’objectif…' : 'Objectif indisponible';
            $('goal-progress').value = 0;
            $('goal-remaining').textContent = '';
            return;
        }
        const known = events.map((event) => payments[event.id]).filter(Boolean);
        const paid = known.filter((payment) => M.paymentState(payment).status === 'paid').length;
        const received = known.reduce((sum, payment) => sum + payment.receivedCents, 0);
        $('finance-received').textContent = M.money(received);
        $('finance-balance').textContent = M.money(known.reduce((sum, payment) => sum + M.paymentState(payment).balance, 0));
        $('finance-coverage').textContent = `${known.length} règlement(s) renseigné(s) · ${events.length - known.length} à compléter`;
        $('finance-status').textContent = `${paid} payé(s) · ${known.length - paid} à encaisser`;
        const progress = goal ? Math.floor(received / goal.targetCents * 100) : 0;
        $('goal-edit').textContent = goal ? 'Modifier l’objectif' : 'Fixer un objectif';
        $('goal-amount').textContent = goal ? M.money(goal.targetCents) : 'Votre prochain cap';
        $('goal-progress-label').textContent = goal ? `${progress.toLocaleString('fr-FR')} % atteint · ${M.money(received)} reçus` : 'Aucun objectif défini';
        $('goal-progress').value = Math.min(100, progress);
        $('goal-progress').setAttribute('aria-valuetext', goal ? `${progress} % de l’objectif atteint` : 'Aucun objectif défini');
        $('goal-remaining').textContent = !goal ? 'Fixez un montant pour suivre votre progression.' : received >= goal.targetCents
            ? `Objectif atteint${received > goal.targetCents ? ` · ${M.money(received - goal.targetCents)} au-delà du montant visé` : ''}.`
            : `Encore ${M.money(goal.targetCents - received)} à encaisser pour atteindre votre objectif.`;
    }

    function safeImage(value) {
        if (!value) return '';
        try { const url = new URL(value, window.location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
        catch { return ''; }
    }

    function renderEvent(event) {
        const id = escape(event.id);
        const slug = escape(encodeURIComponent(event.slug));
        const title = escape(event.title || event.slug);
        const when = M.timing(event.eventDate);
        const payment = billingReady ? payments[event.id] : null;
        const finance = M.paymentState(payment);
        const image = safeImage(event.welcomeImage || event.branding?.welcomeImage);
        const stats = event.stats;
        return `<article class="event-card" data-event-id="${id}">
            <div class="event-card-cover">${image ? `<img class="event-card-image" loading="lazy" src="${escape(image)}" alt="">` : `<div class="event-cover-placeholder" aria-hidden="true">${escape((event.title || 'M').slice(0, 1))}</div>`}<span class="event-badge ${when.status}">${escape(when.label)}</span></div>
            <div class="event-card-body">
                <p class="event-card-category">${escape(typeLabel(event.type))}</p><h3>${title}</h3>
                <p class="event-venue">${escape(event.venue || event.subtitle || 'Lieu à préciser')}</p>
                <div class="event-dates"><div><span>Date de l'événement</span>${escape(M.dateLabel(event.eventDate))}</div><div><span>Créé le</span>${escape(M.dateLabel(event.createdAt))}</div></div>
                <div class="event-guest-stats"><div><strong>${stats.guests}</strong><span>Invités inscrits</span></div><div><strong>${stats.confirmed}</strong><span>Confirmés</span></div><div><strong>${stats.pending}</strong><span>En attente</span></div></div>
                <p class="event-attendees">${stats.attendees} personne(s) attendue(s) · ${stats.declined} refus</p>
                <div class="event-finance"><div class="event-finance-head"><span>Règlement · USD</span><span class="event-badge ${finance.status}">${billingReady ? finance.label : 'Indisponible'}</span></div>
                    <div class="event-finance-amounts"><div><strong>${payment ? M.money(payment.receivedCents) : '—'}</strong><span>${payment ? `Reçu sur ${M.money(payment.totalCents)}` : 'Montant reçu'}</span></div><div><strong>${payment ? M.money(finance.balance) : '—'}</strong><span>Reste à payer</span></div></div>
                    <progress max="100" value="${finance.percent}" aria-label="Part du montant réglée"></progress>
                    <button type="button" class="event-finance-edit" data-action="payment" ${billingReady ? '' : 'disabled'}>${payment ? 'Modifier le paiement' : 'Renseigner le paiement'}</button>
                </div>
                <div class="event-card-actions"><a class="events-primary" href="./admin.html?event=${slug}">Gérer les invités</a><a class="events-secondary" href="./personnalisation.html?event=${slug}">Personnaliser</a></div>
                <div class="event-card-footer"><a href="./invitation.html?event=${slug}" target="_blank" rel="noopener">Invitation ↗</a><button type="button" data-action="share">Partager</button><a href="./checkin.html?event=${slug}">Entrées</a><button type="button" class="event-delete" data-action="delete">Supprimer</button></div>
            </div></article>`;
    }

    function renderEvents() {
        const query = searchText($('events-search').value.trim());
        const dateFilter = $('events-date-filter').value;
        const paymentFilter = $('events-payment-filter').value;
        const visible = events.filter((event) => {
            const match = searchText(`${event.title} ${event.slug} ${event.venue || ''} ${typeLabel(event.type)}`).includes(query);
            return match && (dateFilter === 'all' || M.timing(event.eventDate).status === dateFilter)
                && (paymentFilter === 'all' || (billingReady && M.paymentState(payments[event.id]).status === paymentFilter));
        });
        const sort = $('events-sort').value;
        visible.sort((a, b) => {
            if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'fr');
            if (sort === 'created') return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
            const x = M.timing(a.eventDate), y = M.timing(b.eventDate);
            const rank = { today: 0, upcoming: 1, undated: 2, completed: 3 };
            return rank[x.status] - rank[y.status] || (x.status === 'completed' ? y.days - x.days : (x.days || 0) - (y.days || 0));
        });
        $('events-grid').innerHTML = visible.map(renderEvent).join('');
        $('events-empty').hidden = visible.length !== 0;
        $('events-feedback').textContent = `${visible.length} événement(s) affiché(s) sur ${events.length} · Les confirmations correspondent aux réponses « Oui ».`;
        renderSummary();
    }

    async function load() {
        if (loading) return;
        loading = true;
        $('events-refresh').disabled = true;
        $('events-grid').setAttribute('aria-busy', 'true');
        $('events-feedback').textContent = 'Actualisation des événements…';
        try {
            await AuthGuard.refreshSession();
            const [overview, billing] = await Promise.allSettled([
                CloudAPI.getEventsOverview().then((value) => { events = value; renderEvents(); }),
                billingRequest()
            ]);
            if (overview.status === 'rejected') throw overview.reason;
            billingReady = billing.status === 'fulfilled';
            payments = billingReady ? billing.value.payments : {};
            goal = billingReady ? billing.value.goal || null : null;
            $('billing-feedback').hidden = billingReady;
            $('billing-feedback').textContent = billingReady ? '' : `${billing.reason.message} Les montants restent masqués jusqu'à la prochaine actualisation.`;
            renderEvents();
        } catch (error) {
            $('events-feedback').textContent = `${error.message || 'Chargement impossible.'} Utilisez Actualiser pour réessayer.${events.length ? ' Les données affichées sont celles du dernier chargement réussi.' : ''}`;
        } finally {
            loading = false;
            renderSummary();
            $('events-refresh').disabled = false;
            $('events-grid').setAttribute('aria-busy', 'false');
        }
    }

    function previewBalance() {
        const total = M.parseAmount($('payment-total').value), received = M.parseAmount($('payment-received').value);
        $('payment-balance-preview').textContent = total === null || received === null ? 'Saisissez les deux montants en USD.'
            : received > total ? `Excédent reçu : ${M.money(received - total)}` : `Reste à payer : ${M.money(total - received)}`;
    }

    function openGoal() {
        if (!billingReady) return;
        $('goal-form').reset();
        $('goal-target').value = goal ? (goal.targetCents / 100).toFixed(2) : '';
        $('goal-error').textContent = '';
        $('goal-dialog').showModal();
    }

    async function saveGoal(event) {
        event.preventDefault();
        if (savingGoal) return;
        const targetCents = M.parseAmount($('goal-target').value);
        if (targetCents === null || targetCents <= 0) {
            $('goal-error').textContent = 'Saisissez un montant supérieur à zéro, avec deux décimales maximum.';
            return;
        }
        savingGoal = true;
        ['goal-save', 'goal-close', 'goal-cancel'].forEach((id) => { $(id).disabled = true; });
        $('goal-error').textContent = '';
        try {
            const result = await billingRequest('PUT', '', { targetCents, currency: 'USD' }, 'goal');
            if (!result.goal) throw new Error('L’objectif n’a pas été enregistré. Réessayez.');
            goal = result.goal;
            renderSummary();
            $('goal-dialog').close();
        } catch (error) { $('goal-error').textContent = error.message; }
        finally {
            savingGoal = false;
            ['goal-save', 'goal-close', 'goal-cancel'].forEach((id) => { $(id).disabled = false; });
        }
    }

    function openPayment(event) {
        if (!billingReady) return;
        selectedId = event.id;
        const payment = payments[event.id];
        $('payment-form').reset();
        $('payment-event-name').textContent = event.title || event.slug;
        $('payment-total').value = payment ? (payment.totalCents / 100).toFixed(2) : '';
        $('payment-received').value = payment ? (payment.receivedCents / 100).toFixed(2) : '0.00';
        $('payment-note').value = payment?.note || '';
        $('payment-last-update').textContent = payment ? `Dernier enregistrement : ${M.dateLabel(payment.updatedAt)}. Visible uniquement par l'administration.` : "Visible uniquement par l'administration.";
        $('payment-error').textContent = '';
        previewBalance();
        $('payment-dialog').showModal();
    }

    async function savePayment(e) {
        e.preventDefault();
        if (saving) return;
        const totalCents = M.parseAmount($('payment-total').value), receivedCents = M.parseAmount($('payment-received').value);
        if (totalCents === null || receivedCents === null) {
            $('payment-error').textContent = 'Saisissez des montants valides, avec au maximum deux décimales (ex. 150,50).';
            return;
        }
        saving = true;
        ['payment-save', 'payment-close', 'payment-cancel'].forEach((id) => { $(id).disabled = true; });
        $('payment-error').textContent = '';
        try {
            const result = await billingRequest('PUT', selectedId, { totalCents, receivedCents, currency: 'USD', note: $('payment-note').value });
            if (!result.payment) throw new Error("L'enregistrement n'a pas été confirmé. Réessayez.");
            payments[selectedId] = result.payment;
            renderEvents();
            $('payment-dialog').close();
            $('events-feedback').textContent = 'Paiement enregistré. Les montants et le statut sont à jour.';
        } catch (error) { $('payment-error').textContent = error.message; }
        finally {
            saving = false;
            ['payment-save', 'payment-close', 'payment-cancel'].forEach((id) => { $(id).disabled = false; });
        }
    }

    async function share(event) {
        const url = new URL(`./invitation.html?event=${encodeURIComponent(event.slug)}`, window.location.href).href;
        try {
            if (navigator.share) await navigator.share({ title: event.title, text: `Voici votre invitation : ${event.title}`, url });
            else { await navigator.clipboard.writeText(url); $('events-feedback').textContent = "Lien d'invitation copié."; }
        } catch (error) { if (error.name !== 'AbortError') window.prompt("Copiez le lien d'invitation :", url); }
    }

    async function remove(event, button) {
        if (!window.confirm(`Supprimer définitivement « ${event.title} » ?\nLes invités, réponses, réglages, médias et le suivi du paiement seront supprimés.`)) return;
        button.disabled = true;
        try {
            const result = await CloudAPI.deleteEvent(event.id);
            EventConfig.discardLocalEvent(event.slug);
            let warning = result?.mediaCleanupWarning || '';
            try { await billingRequest('DELETE', event.id); }
            catch { warning += ' Le suivi financier reste conservé dans le stockage privé.'; }
            events = events.filter((item) => item.id !== event.id);
            delete payments[event.id];
            renderEvents();
            $('events-feedback').textContent = `Événement supprimé.${warning}`;
        } catch (error) { button.disabled = false; $('events-feedback').textContent = error.message || 'Suppression impossible.'; }
    }

    async function init() {
        await AuthGuard.refreshSession();
        if (!AuthGuard.isPlatformAdmin()) {
            window.location.href = `./login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
            return;
        }
        $('events-logout-btn').addEventListener('click', () => AuthGuard.logout());
        $('events-refresh').addEventListener('click', load);
        $('events-search').addEventListener('input', renderEvents);
        ['events-date-filter', 'events-payment-filter', 'events-sort'].forEach((id) => $(id).addEventListener('change', renderEvents));
        $('events-grid').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const event = events.find((item) => item.id === button.closest('[data-event-id]').dataset.eventId);
            if (!event) return;
            if (button.dataset.action === 'payment') openPayment(event);
            if (button.dataset.action === 'share') share(event);
            if (button.dataset.action === 'delete') remove(event, button);
        });
        $('payment-form').addEventListener('submit', savePayment);
        $('goal-edit').addEventListener('click', openGoal);
        $('goal-form').addEventListener('submit', saveGoal);
        ['goal-close', 'goal-cancel'].forEach((id) => $(id).addEventListener('click', () => $('goal-dialog').close()));
        $('goal-dialog').addEventListener('cancel', (event) => { if (savingGoal) event.preventDefault(); });
        $('goal-dialog').addEventListener('close', () => $('goal-edit').focus());
        ['payment-total', 'payment-received'].forEach((id) => $(id).addEventListener('input', previewBalance));
        $('payment-settle').addEventListener('click', () => { $('payment-received').value = $('payment-total').value; previewBalance(); });
        ['payment-close', 'payment-cancel'].forEach((id) => $(id).addEventListener('click', () => $('payment-dialog').close()));
        $('payment-dialog').addEventListener('cancel', (e) => { if (saving) e.preventDefault(); });
        $('payment-dialog').addEventListener('close', () => {
            [...document.querySelectorAll('[data-event-id]')].find((card) => card.dataset.eventId === selectedId)?.querySelector('[data-action="payment"]')?.focus();
        });
        await load();
    }
    window.addEventListener('DOMContentLoaded', init);
})();
