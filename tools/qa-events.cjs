// Vérification locale, navigateur isolé et réponses réseau fictives uniquement.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, webkit } = require(path.join(process.env.TEMP, 'michelline-ui-check/node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'qa-output');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const records = [
    { id: 'sarah-daniel', slug: 'sarah-daniel', title: 'Sarah & Daniel', type: 'wedding', created_at: '2026-08-12T10:00:00Z', config_json: { eventDate: '2026-10-24T17:00:00+01:00', venue: 'Fleuve Congo Hôtel · Kinshasa', branding: { welcomeImage: '/assets/images/models/model-mariage.png' } } },
    { id: 'grace', slug: 'grace', title: 'Les 30 ans de Grâce', type: 'birthday', created_at: '2026-07-04T10:00:00Z', config_json: { eventDate: '2026-08-22', venue: 'Jardin des Palmiers · Gombe' } },
    { id: 'conference', slug: 'conference', title: 'Rencontres & perspectives', type: 'conference', created_at: '2026-09-18T10:00:00Z', config_json: { eventDate: '2026-11-10', venue: 'Centre culturel · Kinshasa' } }
];
const guests = [
    ...Array.from({ length: 140 }, (_, i) => ({ event_id: 'sarah-daniel', status: i < 100 ? 'yes' : i < 130 ? 'pending' : 'no', adults: 1, children: 0 })),
    ...Array.from({ length: 80 }, (_, i) => ({ event_id: 'grace', status: i < 75 ? 'yes' : 'no', adults: 1, children: 0 })),
    ...Array.from({ length: 200 }, (_, i) => ({ event_id: 'conference', status: i < 160 ? 'yes' : 'pending', adults: 1, children: 0 }))
];
let payments = {
    'sarah-daniel': { totalCents: 25000, receivedCents: 10000, currency: 'USD', updatedAt: '2026-09-20' },
    grace: { totalCents: 15000, receivedCents: 15000, currency: 'USD', updatedAt: '2026-09-20' },
    conference: { totalCents: 30000, receivedCents: 0, currency: 'USD', updatedAt: '2026-09-20' }
};
let goal = null;
let loginPayload;
const errors = [];
async function mock(context) {
    await context.route('https://qotolnmwoceahrnldlbw.supabase.co/**', async (route) => {
        const url = route.request().url();
        let data = [];
        let status = 200;
        if (url.includes('/auth/v1/token')) { loginPayload = route.request().postDataJSON(); data = { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }; status = 400; }
        else if (url.includes('/rest/v1/events?')) data = records;
        else if (url.includes('/rest/v1/event_settings?')) data = [];
        else if (url.includes('/rest/v1/guests?')) data = guests;
        else if (url.includes('get_public_event_config')) data = { id: 'demo', slug: 'demo', title: 'Démo Michelline', type: 'wedding' };
        await route.fulfill({ status, json: data });
    });
    await context.route('**/api/event-billing*', async (route) => {
        const request = route.request();
        const id = new URL(request.url()).searchParams.get('event');
        if (new URL(request.url()).searchParams.get('resource') === 'goal') {
            goal = request.postDataJSON();
            await route.fulfill({ json: { goal } });
        } else if (request.method() === 'PUT') {
            payments[id] = { ...request.postDataJSON(), updatedAt: new Date().toISOString() };
            await route.fulfill({ json: { payment: payments[id] } });
        } else await route.fulfill({ json: { payments, goal } });
    });
}
const server = http.createServer((req, res) => {
    const target = path.resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    fs.readFile(target, (err, data) => { if (err) res.writeHead(404).end(); else { res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); res.end(data); } });
});
(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = process.env.QA_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
        await mock(context);
        await context.addInitScript(() => localStorage.setItem('wedding_admin_session', JSON.stringify({ role: 'platform', accessToken: 'qa-only', expiresAt: Date.now() + 3600000 })));
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${base}/pages/evenements.html`);
        await page.locator('.event-card').first().waitFor();
        assert.equal(await page.locator('.event-card').count(), 3);
        assert.equal(await page.locator('#events-guests').textContent(), '420');
        await page.locator('#goal-edit').click();
        await page.locator('#goal-target').fill('500,50');
        await page.locator('#goal-save').click();
        await page.locator('#goal-dialog').waitFor({ state: 'hidden' });
        assert.equal(goal.targetCents, 50050);
        assert.match(await page.locator('#goal-progress-label').textContent(), /49 %/);
        await page.screenshot({ path: path.join(output, 'events-desktop.png'), fullPage: true });
        await page.locator('[data-event-id="sarah-daniel"] [data-action="payment"]').click();
        await page.locator('#payment-total').fill('250,50');
        await page.locator('#payment-received').fill('250,50');
        await page.screenshot({ path: path.join(output, 'payment-desktop.png') });
        await page.locator('#payment-save').click();
        await page.locator('#payment-dialog').waitFor({ state: 'hidden' });
        assert.equal(payments['sarah-daniel'].receivedCents, 25050);
        assert.match(await page.locator('#goal-progress-label').textContent(), /80 %/);
        await page.locator('#events-refresh').click();
        await page.waitForFunction(() => !document.getElementById('events-refresh').disabled);
        assert.match(await page.locator('[data-event-id="sarah-daniel"] .event-finance-head').textContent(), /Payé/);
        await page.locator('#events-payment-filter').selectOption('paid');
        assert.equal(await page.locator('.event-card').count(), 2);
        await page.locator('#events-search').fill('grace');
        assert.equal(await page.locator('.event-card').count(), 1);
        assert.match(await page.locator('#goal-progress-label').textContent(), /80 %/);
        await page.locator('#events-search').fill('');
        await page.locator('#events-payment-filter').selectOption('all');
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile overflow');
        await page.screenshot({ path: path.join(output, 'events-mobile.png'), fullPage: true });
        await context.close();

        const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        await mock(loginContext);
        const login = await loginContext.newPage();
        login.on('pageerror', (error) => errors.push(error.message));
        await login.goto(`${base}/pages/login.html?event=demo`);
        await login.locator('#login-email').fill('0812 345 678');
        await login.locator('#login-password').fill('password-for-local-qa');
        assert.equal(await login.locator('#login-email').inputValue(), '812345678');
        await login.locator('[data-password-toggle]').click();
        assert.equal(await login.locator('#login-password').getAttribute('type'), 'text');
        await login.locator('[data-password-toggle]').click();
        assert.equal(await login.locator('#login-password').getAttribute('type'), 'password');
        await login.screenshot({ path: path.join(output, 'login-mobile.png') });
        await login.locator('button[type="submit"]').click();
        await login.locator('#login-error:not(.hidden)').waitFor();
        assert.equal(loginPayload.email, '243812345678@organizer.michelline-invitations.vercel.app');
        await login.locator('#login-admin-mode').click();
        assert.equal(await login.locator('.phone-prefix').isVisible(), false);
        await login.locator('#login-email').fill('admin@example.test');
        await login.locator('button[type="submit"]').click();
        await login.waitForResponse((response) => response.url().includes('/auth/v1/token'));
        assert.equal(loginPayload.email, 'admin@example.test');
        await loginContext.close();
        assert.deepEqual(errors, []);
        console.log('QA OK: affichage bureau/mobile, paiement, sauvegarde/rechargement, filtres, numéro +243 et bouton œil.');
    } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
