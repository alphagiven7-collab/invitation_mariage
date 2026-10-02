const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function musicHarness() {
    const gateListeners = {}, listeners = {}, buttonListeners = {};
    let src = null, attempts = 0, allowPlayback = false;
    const hint = { hidden: true };
    const audio = {
        paused: true, ended: false,
        getAttribute() { return src; }, set src(value) { src = value; },
        load() {}, addEventListener() {}, pause() { this.paused = true; },
        play() { attempts++; if (!allowPlayback) return Promise.reject(new Error('NotAllowedError')); this.paused = false; return Promise.resolve(); }
    };
    const button = { classList: { add() {}, remove() {} }, setAttribute() {}, querySelector() { return {}; },
        addEventListener(type, fn) { buttonListeners[type] = fn; } };
    const document = {
        getElementById(id) { return {
            'background-music': audio, 'music-toggle-btn': button, 'music-playback-hint': hint,
            'welcome-gate': { addEventListener(type, fn) { gateListeners[type] = fn; } }
        }[id]; },
        addEventListener(type, fn, options) { assert.notEqual(options?.once, true); listeners[type] = fn; }
    };
    const window = { document };
    vm.runInNewContext(source('assets/js/background-music.js'), {
        window, document,
        sessionStorage: { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } }
    });
    window.BackgroundMusic.init();
    return { music: window.BackgroundMusic, audio, hint, gateListeners, listeners, buttonListeners,
        allow: () => { allowPlayback = true; }, attempts: () => attempts };
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

test('service worker lets Safari range requests through and reuses versioned assets without refetching', async () => {
    const handlers = {};
    let fetches = 0;
    const cached = { cached: true };
    vm.runInNewContext(source('sw.js'), {
        URL, Response,
        self: { location: { origin: 'https://invitation.test' }, addEventListener(name, fn) { handlers[name] = fn; } },
        caches: { match: async () => cached },
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
