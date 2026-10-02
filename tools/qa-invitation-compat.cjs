// Contrôles locaux avec données fictives et vraie lecture d’un fichier WAV.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, webkit } = require(path.join(process.env.TEMP, 'michelline-ui-check/node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
let wave = Buffer.alloc(44 + 44100 * 2);
wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(44100, 24); wave.writeUInt32LE(88200, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
for (let i = 0; i < 44100; i++) wave.writeInt16LE(Math.round(Math.sin(i / 44100 * Math.PI * 880) * 200), 44 + i * 2);
wave = fs.readFileSync(path.join(__dirname, 'qa-output/test-audio.mp3'));
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/qa-tone.mp3') {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        if (range) {
            const start = Number(range[1]), end = range[2] ? Math.min(wave.length - 1, Number(range[2])) : wave.length - 1;
            res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${wave.length}`, 'Content-Length': end - start + 1 });
            res.end(wave.subarray(start, end + 1));
        } else { res.setHeader('Content-Length', wave.length); res.end(wave); }
        return;
    }
    const target = path.resolve(root, `.${url.pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    fs.readFile(target, (error, data) => {
        if (error) res.writeHead(404).end();
        else { res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); res.end(data); }
    });
});
(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browsers = process.env.QA_BROWSER === 'webkit' ? [['webkit', await webkit.launch()]]
        : [['chromium', await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })]];
    try {
        for (const [engine, browser] of browsers) {
            const probe = await browser.newPage();
            await probe.setContent(`<audio id="probe" src="${base}/qa-tone.mp3"></audio><button onclick="document.getElementById('probe').play().then(()=>window.probeResult='ok').catch(e=>window.probeResult=e.name)">Lire</button>`);
            await probe.locator('button').click();
            await probe.waitForFunction(() => window.probeResult);
            const nativeAudio = await probe.evaluate(() => window.probeResult === 'ok');
            console.log(`${engine}: lecture native minimale sans application = ${await probe.evaluate(() => window.probeResult)}`);
            await probe.close();
            for (const width of [360, 390, 768]) {
                const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
                const config = { id: 'qa-wedding', slug: 'qa-wedding', type: 'wedding', title: 'Noëlla & Hervé', subtitle: 'Noëlla & Hervé', rsvpMode: 'open', eventDate: '2027-05-22', backgroundMusicUrl: `${base}/qa-tone.mp3`, backgroundMusicEnabled: true };
                await context.route('**/*', async (route) => {
                    const url = route.request().url();
                    if (url.includes('supabase.co')) {
                        await route.fulfill({ json: url.includes('get_public_event_config') ? config : [] });
                    } else if (url.startsWith(base)) await route.continue();
                    else await route.abort();
                });
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', (error) => errors.push(error.message));
                await page.goto(`${base}/pages/invitation.html?event=qa-wedding`);
                await page.waitForFunction(() => !document.body.classList.contains('app-loading') && window.BackgroundMusic?.getSettings().backgroundMusicUrl);
                await page.locator('#gate-guest-name-input').fill('Invité de test');
                if (nativeAudio) {
                await page.locator('#music-toggle-btn').click();
                await page.waitForFunction(() => !document.getElementById('background-music').paused, null, { timeout: 10000 }).catch(async (error) => {
                    console.log(await page.evaluate(() => { const a = document.getElementById('background-music'); return { paused: a.paused, error: a.error?.message, code: a.error?.code, ready: a.readyState, network: a.networkState, src: a.currentSrc, supported: a.canPlayType('audio/mpeg'), hint: document.getElementById('music-playback-hint').textContent }; }));
                    throw error;
                });
                assert.equal(await page.locator('#welcome-gate').isVisible(), true, 'Music starts at the gate');
                await page.locator('#music-toggle-btn').click();
                }
                await page.locator('#gate-enter-btn').click();
                await page.locator('#welcome-gate').waitFor({ state: 'hidden' });
                if (nativeAudio) {
                assert.equal(await page.evaluate(() => document.getElementById('background-music').paused), true, 'Gate opening respects pause');
                await page.locator('#music-toggle-btn').click();
                await page.waitForFunction(() => !document.getElementById('background-music').paused);
                }
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Invitation has no horizontal overflow');
                await page.locator('#confirm-presence-btn').click();
                await page.locator('#rsvp-modal').waitFor({ state: 'visible' });
                await page.locator('input[name="rsvp-status"][value="no"]').check();
                assert.equal(await page.locator('input[name="rsvp-status"][value="no"]').isChecked(), true);
                await page.screenshot({ path: path.join(root, `tools/qa-output/rsvp-${engine}-${width}.png`) });
                assert.deepEqual(errors, []);
                console.log(`${engine} ${width}px: gate, RSVP and overflow OK; audio ${nativeAudio ? 'OK' : 'NON VALIDÉ : moteur local sans lecture MP3'}`);
                await context.close();
            }
        }
    } finally { for (const [, browser] of browsers) await browser.close(); server.close(); }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
