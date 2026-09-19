const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const invitationHandler = require('../api/invitation');

function responseCapture() {
  const headers = new Map();
  return {
    headers,
    statusCode: null,
    body: '',
    setHeader(name, value) { headers.set(name, value); },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; }
  };
}

test('Invitation media is deferred before the browser starts downloading hidden galleries', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'invitation.html'), 'utf8');
  const images = source.match(/<img\b[^>]*>/g) || [];
  const hero = images.find((image) => image.includes('id="hero-image"'));

  assert.ok(images.length > 20);
  assert.match(hero, /loading="eager"/);
  assert.match(hero, /fetchpriority="high"/);
  assert.ok(images.every((image) => /loading="(?:eager|lazy)"/.test(image)));
  assert.ok(images.filter((image) => image !== hero).every((image) => /loading="lazy"/.test(image)));
  assert.match(source, /<audio id="background-music" loop preload="none"/);
  assert.match(source, /rel="preconnect" href="https:\/\/images\.unsplash\.com"/);
});

test('Background music waits for the guest action before assigning the audio source', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'background-music.js'), 'utf8');
  let sourceAttribute = null;
  let loadCount = 0;
  let playCount = 0;
  const audio = {
    paused: true,
    volume: 0,
    loop: false,
    getAttribute(name) { return name === 'src' ? sourceAttribute : null; },
    removeAttribute(name) { if (name === 'src') sourceAttribute = null; },
    set src(value) { sourceAttribute = value; },
    get src() { return sourceAttribute || ''; },
    load() { loadCount += 1; },
    pause() { this.paused = true; },
    async play() { playCount += 1; this.paused = false; },
    addEventListener() {}
  };
  const button = {
    classList: { add() {}, remove() {} },
    setAttribute() {},
    querySelector() { return { textContent: '' }; },
    addEventListener() {}
  };
  const document = {
    getElementById(id) {
      if (id === 'background-music') return audio;
      if (id === 'music-toggle-btn') return button;
      return null;
    },
    querySelector() { return null; },
    addEventListener() {},
    body: { appendChild() {} }
  };
  const window = { document };
  const sandbox = { window, document, sessionStorage: { getItem() { return null; }, setItem() {} } };
  vm.runInNewContext(source, sandbox, { filename: 'background-music.js' });

  sandbox.window.BackgroundMusic.apply({
    backgroundMusicUrl: 'https://cdn.example.test/music.mp3',
    backgroundMusicEnabled: true
  });
  assert.equal(sourceAttribute, null);
  assert.equal(loadCount, 0);

  await sandbox.window.BackgroundMusic.play();
  assert.equal(sourceAttribute, 'https://cdn.example.test/music.mp3');
  assert.equal(loadCount, 1);
  assert.equal(playCount, 1);
  assert.match(source, /youtubePlayer && youtubeVideoId !== ytId\) destroyYouTubePlayer\(\);/);
  assert.match(source, /wantAutoplay && !userPaused && shouldAutoplayNow\(\)\) void play\(\);/);
});

test('Invitation browsers skip the server-side Supabase metadata lookup', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => { fetchCount += 1; throw new Error('must not fetch'); };
  const response = responseCapture();

  try {
    await invitationHandler({
      url: '/pages/invitation.html?event=demo',
      headers: { host: 'example.test', 'user-agent': 'Mozilla/5.0' }
    }, response);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(fetchCount, 0);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get('Vary'), 'User-Agent');
  assert.match(response.headers.get('Cache-Control'), /s-maxage=60/);
  assert.match(response.body, /<title>Invitation<\/title>/);
});

test('Invitation share crawlers retain personalized metadata', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      json: async () => ({
        title: 'Mariage de Noella et Hervé',
        mainText: 'Nous vous attendons.',
        welcomeImage: 'https://cdn.example.test/share.jpg'
      })
    };
  };
  const response = responseCapture();

  try {
    await invitationHandler({
      url: '/pages/invitation.html?event=mariage-de-herve-et-noella',
      headers: { host: 'example.test', 'user-agent': 'facebookexternalhit/1.1' }
    }, response);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(fetchCount, 1);
  assert.match(response.body, /<title>Mariage de Noella et Hervé<\/title>/);
  assert.match(response.body, /https:\/\/cdn\.example\.test\/share\.jpg/);
});
