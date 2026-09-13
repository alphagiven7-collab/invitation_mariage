const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMediaUpload(fetch) {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'js', 'media-upload.js'),
    'utf8'
  );
  const cloudApi = { isEnabled: () => true };
  const authGuard = {
    getSession: () => ({ accessToken: 'client-token', userId: 'client-id' })
  };
  const sandbox = {
    Blob,
    Uint8Array,
    atob,
    console,
    Date: class extends Date {
      static now() { return 1760000000000; }
    },
    fetch,
    CloudAPI: cloudApi,
    AuthGuard: authGuard,
    window: {
      SUPABASE_CONFIG: {
        enabled: true,
        url: 'https://project.supabase.co',
        anonKey: 'public-key'
      },
      CloudAPI: cloudApi,
      AuthGuard: authGuard
    }
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: 'media-upload.js' });
  return sandbox.window.MediaUpload;
}

test('MediaUpload sends audio to the current event folder and returns its public URL', async () => {
  let request;
  const MediaUpload = loadMediaUpload(async (url, options) => {
    request = { url, options };
    return { ok: true };
  });

  const audio = new Blob(['audio-content'], { type: 'audio/mpeg' });
  const url = await MediaUpload.processAudioFile(audio, 'mariage-sarah-marc', 'background-music');

  assert.match(request.url, /\/storage\/v1\/object\/event-assets\/mariage-sarah-marc\/1760000000000-background-music\.mp3$/);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer client-token');
  assert.equal(request.options.headers['Content-Type'], 'audio/mpeg');
  assert.equal(request.options.body, audio);
  assert.match(url, /\/storage\/v1\/object\/public\/event-assets\/mariage-sarah-marc\/1760000000000-background-music\.mp3$/);
});

test('MediaUpload reports a Storage permission failure for audio', async () => {
  const MediaUpload = loadMediaUpload(async () => ({
    ok: false,
    status: 403,
    text: async () => 'permission denied'
  }));

  await assert.rejects(
    () => MediaUpload.processAudioFile(new Blob(['audio'], { type: 'audio/mpeg' }), 'mariage-test'),
    /Téléversement refusé/
  );
});