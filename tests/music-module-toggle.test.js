const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'background-music.js'), 'utf8'
);

function createHarness({ youtube = false, manualReadiness = false } = {}) {
  let sourceAttribute = null;
  let playCount = 0;
  let pauseCount = 0;
  let destroyedCount = 0;
  let player = null;
  const players = [], listeners = {};
  const buttonClasses = new Set();
  const audio = {
    paused: true,
    ended: false,
    readyState: 4,
    getAttribute(name) { return name === 'src' ? sourceAttribute : null; },
    removeAttribute(name) { if (name === 'src') sourceAttribute = null; },
    set src(value) { sourceAttribute = value; },
    load() {},
    addEventListener() {},
    pause() { this.paused = true; pauseCount += 1; },
    async play() { this.paused = false; playCount += 1; }
  };
  const button = {
    classList: {
      add(name) { buttonClasses.add(name); },
      remove(name) { buttonClasses.delete(name); }
    },
    setAttribute() {},
    querySelector() { return { textContent: '' }; },
    addEventListener() {}
  };
  const host = { innerHTML: '', appendChild() {} };
  const document = {
    getElementById(id) {
      return {
        'background-music': audio,
        'music-toggle-btn': button,
        'youtube-music-host': host
      }[id] || null;
    },
    createElement() { return {}; },
    addEventListener(type, listener) { listeners[type] = listener; },
    body: { appendChild() {} }
  };
  const YT = {
    PlayerState: { PLAYING: 1 },
    Player: class {
      constructor(_id, options) {
        player = this;
        players.push(this);
        this.events = options.events;
        this.state = 0;
        this.destroyed = false;
        if (!manualReadiness) queueMicrotask(() => this.ready());
      }
      ready() { this.events.onReady({ target: this }); }
      fail() { this.state = -1; this.events.onError({ target: this }); }
      setVolume() {}
      getPlayerState() { return this.state; }
      playVideo() {
        if (this.destroyed) throw new Error('The destroyed player cannot play');
        this.state = 1;
        playCount += 1;
      }
      pauseVideo() { this.state = 0; pauseCount += 1; }
      destroy() { this.destroyed = true; this.state = -1; destroyedCount += 1; }
    }
  };
  const window = { document, ...(youtube ? { YT } : {}) };
  vm.runInNewContext(source, {
    window, document, YT, setTimeout, clearTimeout,
    sessionStorage: { getItem() { return null; }, setItem() {} }
  }, { filename: 'background-music.js' });
  return {
    music: window.BackgroundMusic,
    audio,
    buttonClasses,
    players,
    listeners,
    player: () => player,
    source: () => sourceAttribute,
    plays: () => playCount,
    pauses: () => pauseCount,
    destroys: () => destroyedCount
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('disabling the music module stops MP3 and prevents guest actions from restarting it', async () => {
  const h = createHarness();
  const state = { backgroundMusicUrl: '/music.mp3', sections: { music: true } };
  h.music.apply(state);
  h.music.armAutoplay();
  await tick();
  assert.equal(h.audio.paused, false);
  assert.equal(h.plays(), 1);

  h.music.apply({ ...state, sections: { music: false } });
  assert.equal(h.audio.paused, true);
  assert.equal(h.source(), null);
  assert.ok(h.buttonClasses.has('hidden'));

  h.music.toggle();
  h.music.armAutoplay();
  h.music.onGuestEnter();
  await tick();
  assert.equal(h.plays(), 1);
});

test('disabling the music module stops YouTube and prevents it from restarting', async () => {
  const h = createHarness({ youtube: true });
  const state = { backgroundMusicUrl: 'https://youtu.be/ABCDEFGHIJK', sections: { music: true } };
  h.music.apply(state);
  h.music.armAutoplay();
  await tick();
  assert.ok(h.player());
  assert.ok(h.plays() > 0);

  h.music.apply({ ...state, sections: { music: false } });
  assert.ok(h.pauses() > 0);
  assert.equal(h.destroys(), 1);
  assert.ok(h.buttonClasses.has('hidden'));
  const playsWhenDisabled = h.plays();

  h.music.toggle();
  h.music.armAutoplay();
  h.music.onGuestEnter();
  await tick();
  assert.equal(h.plays(), playsWhenDisabled);
});

test('rapid retry gestures after a YouTube error preserve the replacement until it is ready', async () => {
  const h = createHarness({ youtube: true, manualReadiness: true });
  h.music.init();
  h.music.apply({ backgroundMusicUrl: 'https://youtu.be/ABCDEFGHIJK' });
  await tick();
  h.player().ready();
  await tick();
  h.music.armAutoplay();
  await tick();
  h.player().fail();

  h.listeners.pointerdown();
  await tick();
  const replacement = h.player();
  assert.equal(h.players.length, 2);
  assert.equal(h.destroys(), 1);
  h.listeners.pointerup();
  h.listeners.click();
  const pendingPlayback = h.music.play();
  replacement.ready();

  assert.equal(await pendingPlayback, true, 'Retry must settle when the replacement is ready');
  await tick();
  assert.equal(h.players.length, 2);
  assert.equal(h.destroys(), 1, 'Subsequent gestures must not destroy the pending replacement');
  assert.equal(replacement.destroyed, false);
  assert.equal(replacement.getPlayerState(), 1);
});
