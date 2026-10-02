const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function namedError(name) {
    return Object.assign(new Error(name), { name });
}

function musicHarness({ storedPause = false, storageBlocked = true } = {}) {
    const gateListeners = {}, listeners = {}, buttonListeners = {}, audioListeners = {}, windowListeners = {};
    const listenerOptions = {}, attributes = {}, timers = new Map(), classes = new Set();
    const preferences = new Map(storedPause ? [['wedding_event_test_music_paused', '1']] : []);
    let src = null, attempts = 0, loads = 0, allowPlayback = false, playImplementation = null, timerId = 0;
    const hint = { hidden: true };
    const audio = {
        paused: true, ended: false, readyState: 4, error: null,
        getAttribute() { return src; }, set src(value) { src = value; },
        removeAttribute() { src = null; },
        load() { loads++; this.error = null; this.paused = true; this.readyState = 4; },
        addEventListener(type, listener) { audioListeners[type] = listener; },
        pause() { this.paused = true; audioListeners.pause?.(); },
        play() {
            attempts++;
            if (playImplementation) return playImplementation(this);
            if (!allowPlayback) return Promise.reject(namedError('NotAllowedError'));
            this.paused = false;
            audioListeners.play?.();
            if (this.readyState >= 2 && !this.error) audioListeners.playing?.();
            return Promise.resolve();
        }
    };
    const button = { classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); } },
        setAttribute(name, value) { attributes[name] = value; }, querySelector() { return {}; },
        addEventListener(type, fn) { buttonListeners[type] = fn; } };
    const document = {
        visibilityState: 'visible',
        getElementById(id) { return {
            'background-music': audio, 'music-toggle-btn': button, 'music-playback-hint': hint,
            'welcome-gate': { addEventListener(type, fn) { gateListeners[type] = fn; } }
        }[id]; },
        addEventListener(type, fn, options) {
            assert.notEqual(options?.once, true);
            listeners[type] = fn;
            listenerOptions[type] = options;
        }
    };
    const EventConfig = { getEventId: () => 'test' };
    const window = { document, EventConfig, addEventListener(type, listener) { windowListeners[type] = listener; } };
    vm.runInNewContext(source('assets/js/background-music.js'), {
        window, document, EventConfig,
        setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        sessionStorage: {
            getItem(key) { if (storageBlocked) throw new Error('Storage blocked'); return preferences.get(key) || null; },
            setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); preferences.set(key, value); }
        }
    });
    window.BackgroundMusic.init();
    return { music: window.BackgroundMusic, audio, hint, document, gateListeners, listeners, buttonListeners,
        audioListeners, windowListeners, listenerOptions, attributes, classes, preferences,
        allow: () => { allowPlayback = true; playImplementation = null; },
        setPlayback: (implementation) => { playImplementation = implementation; },
        attempts: () => attempts, loads: () => loads, source: () => src,
        pendingTimers: () => [...timers.values()].map(({ delay }) => delay),
        runTimer() {
            const [id, timer] = timers.entries().next().value || [];
            assert.ok(timer, 'A recovery timer must be scheduled');
            timers.delete(id);
            timer.fn();
        }
    };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('blocked audio retries on later Safari touchend gestures without showing a prompt and honors an explicit pause', async () => {
    const h = musicHarness();
    h.music.apply({ backgroundMusicUrl: '/music.mp3' });
    h.gateListeners.pointerdown();
    await tick();
    assert.equal(h.hint.hidden, true);
    h.listeners.click();
    await tick();
    h.allow();
    h.listeners.touchend();
    assert.equal(h.audio.paused, false, 'play invoked synchronously on touchend');
    await tick();
    assert.equal(h.hint.hidden, true);
    h.buttonListeners.click();
    const count = h.attempts();
    h.listeners.click();
    h.gateListeners.touchend();
    await tick();
    assert.equal(h.audio.paused, true);
    assert.equal(h.attempts(), count, 'Voluntary pause must survive later gestures');
});

test('a gesture before the music configuration arrives still arms later playback at the gate', async () => {
    const h = musicHarness();
    h.gateListeners.pointerdown();
    h.music.apply({ backgroundMusicUrl: '/late.mp3' });
    await tick();
    h.allow();
    h.listeners.click();
    assert.equal(h.audio.paused, false);
});

test('direct entry arms music before the configuration arrives without requiring a gate gesture', async () => {
    const h = musicHarness();
    h.allow();
    h.music.armAutoplay();
    h.music.apply({ backgroundMusicUrl: '' });
    assert.equal(h.attempts(), 0);
    h.music.apply({ backgroundMusicUrl: '/late.mp3' });
    await tick();
    assert.equal(h.attempts(), 1);
    assert.equal(h.attributes['data-music-state'], 'playing');
});

test('autoplay denial stays blocked without network retries and a captured page gesture starts playback', async () => {
    const h = musicHarness();
    h.music.apply({ backgroundMusicUrl: '/music.mp3' });
    h.music.armAutoplay();
    await tick();
    assert.equal(h.attributes['data-music-state'], 'blocked');
    assert.deepEqual(h.pendingTimers(), []);
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
        assert.equal(h.listenerOptions[type].capture, true, `${type} must run before a target can stop bubbling`);
    }
    h.allow();
    h.listeners.pointerup({ target: { closest: () => null } });
    assert.equal(h.audio.paused, false, 'The captured gesture calls play synchronously');
    await tick();
    assert.equal(h.attributes['data-music-state'], 'playing');
});

test('a terminal media error reloads the same URL on the next gesture', async () => {
    const h = musicHarness();
    h.music.apply({ backgroundMusicUrl: '/music.mp3' });
    h.music.armAutoplay();
    await tick();
    h.audio.error = { code: 2 };
    h.audioListeners.error();
    assert.equal(h.attributes['data-music-state'], 'error');
    h.allow();
    h.listeners.click();
    await tick();
    assert.equal(h.source(), '/music.mp3');
    assert.equal(h.loads(), 2);
    assert.equal(h.audio.error, null);
    assert.equal(h.attributes['data-music-state'], 'playing');
    assert.deepEqual(h.pendingTimers(), []);
});

test('a media element without decoded data or with an error is never displayed as playing', async () => {
    const h = musicHarness();
    h.music.apply({ backgroundMusicUrl: '/music.mp3' });
    h.audio.readyState = 0;
    h.allow();
    assert.equal(await h.music.play(), false);
    assert.equal(h.audio.paused, false);
    assert.equal(h.attributes['aria-pressed'], 'false');
    assert.notEqual(h.attributes['data-music-state'], 'playing');
    h.audio.readyState = 4;
    h.audio.error = { code: 3 };
    h.music.refreshUi();
    assert.equal(h.attributes['aria-pressed'], 'false');
    assert.notEqual(h.attributes['data-music-state'], 'playing');
});

for (const outcome of ['resolve', 'reject']) {
    test(`a late ${outcome} from the previous track leaves the current track playing`, async () => {
        const h = musicHarness();
        let settlePrevious;
        const previousPlay = new Promise((resolve, reject) => {
            settlePrevious = outcome === 'resolve' ? resolve : () => reject(namedError('NetworkError'));
        });
        h.setPlayback(() => previousPlay);
        h.music.apply({ backgroundMusicUrl: '/old.mp3' });
        h.music.armAutoplay();
        h.allow();
        h.music.apply({ backgroundMusicUrl: '/new.mp3' });
        await tick();
        settlePrevious();
        await tick();
        assert.equal(h.source(), '/new.mp3');
        assert.equal(h.audio.paused, false);
        assert.equal(h.attributes['data-music-state'], 'playing');
        assert.deepEqual(h.pendingTimers(), []);
    });
}

test('online, pageshow and returning to a visible page resume music and respect an explicit pause', async () => {
    const h = musicHarness();
    h.allow();
    h.music.apply({ backgroundMusicUrl: '/music.mp3' });
    h.music.armAutoplay();
    await tick();
    for (const resume of [h.windowListeners.online, h.windowListeners.pageshow, h.listeners.visibilitychange]) {
        h.audio.paused = true;
        const before = h.attempts();
        h.document.visibilityState = 'hidden';
        resume();
        assert.equal(h.attempts(), before);
        h.document.visibilityState = 'visible';
        resume();
        await tick();
        assert.equal(h.attempts(), before + 1);
        assert.equal(h.audio.paused, false);
    }
    h.buttonListeners.click();
    const pausedAttempts = h.attempts();
    h.windowListeners.online();
    h.windowListeners.pageshow();
    h.listeners.visibilitychange();
    await tick();
    assert.equal(h.audio.paused, true);
    assert.equal(h.attempts(), pausedAttempts);
});

test('persistent network errors use at most two scheduled retries and recover on a later gesture', async () => {
    const h = musicHarness();
    h.setPlayback((audio) => {
        audio.error = { code: 2 };
        audio.paused = true;
        h.audioListeners.error();
        return Promise.reject(namedError('NetworkError'));
    });
    h.music.apply({ backgroundMusicUrl: '/music.mp3' });
    h.music.armAutoplay();
    await tick();
    assert.deepEqual(h.pendingTimers(), [1500]);
    h.runTimer();
    await tick();
    assert.deepEqual(h.pendingTimers(), [3000]);
    h.runTimer();
    await tick();
    assert.equal(h.attempts(), 3);
    assert.deepEqual(h.pendingTimers(), []);
    h.allow();
    h.listeners.touchend();
    await tick();
    assert.equal(h.attempts(), 4);
    assert.equal(h.attributes['data-music-state'], 'playing');
});

test('a saved pause survives configuration, gate entry and page lifecycle until the guest enables music', async () => {
    const h = musicHarness({ storedPause: true, storageBlocked: false });
    h.allow();
    h.music.armAutoplay();
    h.music.apply({ backgroundMusicUrl: '/music.mp3' });
    h.music.onGuestEnter();
    h.gateListeners.pointerdown();
    h.windowListeners.pageshow();
    h.windowListeners.online();
    h.listeners.visibilitychange();
    await tick();
    assert.equal(h.attempts(), 0);
    assert.equal(h.attributes['data-music-state'], 'paused');
    h.buttonListeners.click();
    await tick();
    assert.equal(h.attributes['data-music-state'], 'playing');
    assert.equal(h.preferences.get('wedding_event_test_music_paused'), '0');
});

test('refreshing music controls cannot reveal an empty or disabled track', () => {
    const h = musicHarness();
    for (const state of [
        { backgroundMusicUrl: '' },
        { backgroundMusicUrl: '/music.mp3', backgroundMusicEnabled: false },
        { backgroundMusicUrl: '/music.mp3', sections: { music: false } }
    ]) {
        h.music.apply(state);
        h.classes.delete('hidden');
        h.music.refreshUi();
        assert.ok(h.classes.has('hidden'));
        assert.equal(h.attributes['aria-hidden'], 'true');
        assert.equal(h.attributes['data-music-state'], 'disabled');
    }
});

test('service worker lets Safari range requests through and reuses versioned assets without refetching', async () => {
    const handlers = {};
    let fetches = 0;
    const cached = { cached: true };
    vm.runInNewContext(source('sw.js'), {
        URL, Response,
        self: { location: { origin: 'https://invitation.test' }, addEventListener(name, fn) { handlers[name] = fn; } },
        caches: { open: async () => ({ match: async () => cached }) },
        fetch: async () => { fetches++; return { status: 500 }; }
    });
    let response;
    const event = (url, range = false, destination = '') => ({
        request: { method: 'GET', url: `https://invitation.test${url}`, headers: { has: () => range }, destination },
        respondWith(value) { response = value; }, waitUntil() {}
    });
    for (const input of [event('/music.mp3'), event('/media', true), event('/stream', false, 'audio')]) {
        handlers.fetch(input);
        assert.equal(response, undefined);
    }
    handlers.fetch(event('/assets/css/app.css?v=76'));
    assert.equal(await response, cached);
    assert.equal(fetches, 0);
    handlers.fetch(event('/assets/photo.jpg'));
    await response;
    assert.equal(fetches, 1, 'Unversioned resources still revalidate');
});
