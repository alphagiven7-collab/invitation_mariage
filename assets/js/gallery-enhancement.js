(() => {
    'use strict';

    const modal = document.getElementById('best-photos-modal');
    const photo = document.getElementById('best-gallery-main-image');
    const caption = document.getElementById('best-gallery-caption');
    const thumbnails = document.getElementById('best-gallery-dots');
    if (!modal || !photo || !caption || !thumbnails || !photo.parentElement) return;

    const stage = photo.parentElement;
    const ambient = document.createElement('div');
    const ambientPrevious = document.createElement('img');
    const ambientCurrent = document.createElement('img');
    const outgoing = document.createElement('img');
    const error = document.createElement('p');
    const progress = document.createElement('div');
    const progressFill = document.createElement('span');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preloads = new Map();
    let currentSource = '';
    let requestedSource = '';
    let requestId = 0;
    let cancelImageWait = () => {};
    let finishTimer = 0;
    let preloadTimer = 0;

    modal.classList.add('best-gallery-enhanced');
    stage.classList.add('best-gallery-stage');
    photo.classList.add('best-gallery-photo');
    photo.loading = 'eager';
    caption.setAttribute('aria-live', 'polite');
    caption.setAttribute('aria-atomic', 'true');

    ambient.className = 'best-gallery-ambient';
    ambient.setAttribute('aria-hidden', 'true');
    ambientPrevious.className = 'best-gallery-ambient-previous';
    ambientCurrent.className = 'best-gallery-ambient-current';
    ambientPrevious.alt = '';
    ambientCurrent.alt = '';
    ambient.append(ambientPrevious, ambientCurrent);
    modal.insertBefore(ambient, modal.querySelector('.best-photos-backdrop'));

    outgoing.className = 'best-gallery-outgoing';
    outgoing.alt = '';
    outgoing.setAttribute('aria-hidden', 'true');
    stage.insertBefore(outgoing, photo);

    error.className = 'best-gallery-error';
    error.setAttribute('role', 'status');
    error.textContent = 'Cette photo est momentanément indisponible.';
    stage.appendChild(error);

    progress.className = 'best-gallery-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.appendChild(progressFill);
    thumbnails.parentElement.insertBefore(progress, thumbnails);

    function clearPending() {
        cancelImageWait();
        cancelImageWait = () => {};
        window.clearTimeout(finishTimer);
        window.clearTimeout(preloadTimer);
        stage.classList.remove('is-revealing', 'is-error');
        ambient.classList.remove('is-changing');
    }

    function updateProgress() {
        const buttons = Array.from(thumbnails.querySelectorAll('button'));
        const index = buttons.findIndex(button => button.classList.contains('is-active'));
        progressFill.style.width = buttons.length && index >= 0
            ? `${((index + 1) / buttons.length) * 100}%`
            : '0%';
    }

    function preloadNeighbors(id) {
        if (navigator.connection?.saveData || /2g/.test(navigator.connection?.effectiveType || '')) return;
        preloadTimer = window.setTimeout(() => {
            if (id !== requestId || modal.classList.contains('hidden')) return;
            const buttons = Array.from(thumbnails.querySelectorAll('button'));
            const index = buttons.findIndex(button => button.classList.contains('is-active'));
            if (index < 0 || buttons.length < 2) return;
            for (const offset of [-1, 1]) {
                const target = buttons[(index + offset + buttons.length) % buttons.length].querySelector('img');
                const src = target?.src;
                if (!src || preloads.has(src)) continue;
                const preload = new Image();
                preload.src = src;
                preloads.set(src, preload);
                if (preloads.size > 4) preloads.delete(preloads.keys().next().value);
            }
        }, 450);
    }

    function setAmbient(src) {
        const previous = ambientCurrent.getAttribute('src');
        if (previous && previous !== src) {
            ambientPrevious.src = previous;
        } else {
            ambientPrevious.removeAttribute('src');
        }
        ambientCurrent.src = src;
        if (reduceMotion.matches) return;
        ambient.classList.remove('is-changing');
        void ambient.offsetWidth;
        ambient.classList.add('is-changing');
    }

    function reveal(src, id) {
        if (id !== requestId || modal.classList.contains('hidden') || photo.src !== src) return;
        cancelImageWait();
        cancelImageWait = () => {};
        currentSource = src;
        setAmbient(src);
        stage.classList.remove('is-waiting', 'is-error');
        if (reduceMotion.matches) {
            outgoing.removeAttribute('src');
            stage.classList.remove('has-outgoing');
        } else {
            stage.classList.add('is-revealing');
            finishTimer = window.setTimeout(() => {
                if (id !== requestId) return;
                stage.classList.remove('is-revealing', 'has-outgoing');
                outgoing.removeAttribute('src');
                ambient.classList.remove('is-changing');
                ambientPrevious.removeAttribute('src');
            }, 820);
        }
        preloadNeighbors(id);
    }

    function fail(src, id) {
        if (id !== requestId || photo.src !== src) return;
        cancelImageWait();
        cancelImageWait = () => {};
        stage.classList.remove('is-waiting', 'has-outgoing');
        stage.classList.add('is-error');
        outgoing.removeAttribute('src');
    }

    function onPhotoChange() {
        if (modal.classList.contains('hidden')) return;
        const src = photo.getAttribute('src') ? photo.src : '';
        if (!src || src === requestedSource) return;
        clearPending();
        requestedSource = src;
        const id = ++requestId;
        if (currentSource && currentSource !== src) {
            outgoing.src = currentSource;
            stage.classList.add('has-outgoing');
        } else {
            outgoing.removeAttribute('src');
            stage.classList.remove('has-outgoing');
        }
        stage.classList.add('is-waiting');

        const onLoad = () => reveal(src, id);
        const onError = () => fail(src, id);
        photo.addEventListener('load', onLoad);
        photo.addEventListener('error', onError);
        cancelImageWait = () => {
            photo.removeEventListener('load', onLoad);
            photo.removeEventListener('error', onError);
        };

        if (photo.complete) {
            if (photo.naturalWidth > 0) reveal(src, id);
            else fail(src, id);
        }
    }

    function onVisibilityChange() {
        const isOpen = !modal.classList.contains('hidden');
        modal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        if (isOpen) {
            onPhotoChange();
            return;
        }
        ++requestId;
        clearPending();
        currentSource = '';
        requestedSource = '';
        stage.classList.remove('is-waiting', 'has-outgoing');
        outgoing.removeAttribute('src');
        ambientCurrent.removeAttribute('src');
        ambientPrevious.removeAttribute('src');
        progressFill.style.width = '0%';
        preloads.clear();
    }

    new MutationObserver(onPhotoChange).observe(photo, { attributes: true, attributeFilter: ['src'] });
    new MutationObserver(onVisibilityChange).observe(modal, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(updateProgress).observe(thumbnails, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || modal.classList.contains('hidden')) return;
        const focusable = Array.from(modal.querySelectorAll('button:not([disabled])'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!modal.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    onVisibilityChange();
})();
