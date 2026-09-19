const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadContentBlocks(document = undefined) {
  const window = { location: { href: "https://invitation.example/pages/invitation.html" } };
  const sandbox = { window, URL, console, document };
  vm.runInNewContext(fs.readFileSync("assets/js/content-blocks.js", "utf8"), sandbox);
  return window.ContentBlocks;
}

function loadAdminPresence() {
  const window = {};
  const sandbox = { window, console };
  vm.runInNewContext(fs.readFileSync("assets/js/admin-presence.js", "utf8"), sandbox);
  return window.AdminPresence;
}

async function resolveLoginRedirect(redirect) {
  const html = fs.readFileSync("pages/login.html", "utf8");
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((source) => source.includes("requestedRedirect"));
  assert.ok(script, "le script de redirection de connexion doit être présent");

  let locationHref = `https://invitation.example/pages/login.html?event=demo&redirect=${encodeURIComponent(redirect)}`;
  const location = {
    origin: "https://invitation.example",
    get search() { return new URL(locationHref).search; },
    get href() { return locationHref; },
    set href(value) { locationHref = value; }
  };
  let onDomReady;
  const sandbox = {
    URL,
    URLSearchParams,
    EventConfig: { init: async () => {}, getEventId: () => "demo" },
    AuthGuard: { isEventAdmin: () => true },
    document: { getElementById: () => { throw new Error("Le formulaire ne doit pas être atteint"); } },
    window: {
      location,
      addEventListener: (type, listener) => { if (type === "DOMContentLoaded") onDomReady = listener; }
    }
  };
  vm.runInNewContext(script, sandbox);
  await onDomReady();
  return locationHref;
}

test("map links only accept HTTPS and embed only trusted Google Maps URLs", () => {
  const blocks = loadContentBlocks();
  assert.equal(blocks.sanitizeExternalUrl("javascript:alert(1)"), "");
  assert.equal(blocks.sanitizeExternalUrl("data:text/html,test"), "");
  assert.equal(blocks.sanitizeExternalUrl("http://maps.google.com/?q=Kinshasa"), "");
  assert.equal(
    blocks.buildMapUrl({ mapLink: "javascript:alert(1)", venueAddress: "Kinshasa" }),
    "https://maps.google.com/?q=Kinshasa"
  );
  assert.equal(
    blocks.buildMapEmbedUrl({ mapLink: "https://not-google.example/?q=Kinshasa" }),
    ""
  );
  assert.equal(
    blocks.buildMapEmbedUrl({ mapLink: "https://www.google.com/maps?q=Kinshasa" }),
    "https://maps.google.com/maps?q=Kinshasa&z=16&output=embed"
  );
});

test("practical-info icons escape quotes before being inserted into an HTML attribute", () => {
  let markup = "";
  const root = {
    set innerHTML(value) { markup = value; },
    get innerHTML() { return markup; }
  };
  const blocks = loadContentBlocks({
    getElementById(id) { return id === "practical-info-list" ? root : null; }
  });

  blocks.renderPracticalInfo([{
    icon: 'info" onmouseover="alert(1)',
    title: "Information",
    text: "Texte"
  }]);

  assert.match(markup, /data-lucide="info&quot; onmouseover=&quot;alert\(1\)"/);
  assert.doesNotMatch(markup, /data-lucide="info" onmouseover=/);
});

test("login only follows same-origin redirects after authentication", async () => {
  assert.equal(
    await resolveLoginRedirect("javascript:alert(document.domain)"),
    "./admin.html?event=demo"
  );
  assert.equal(
    await resolveLoginRedirect("https://attacker.example/collect"),
    "./admin.html?event=demo"
  );
  assert.equal(
    await resolveLoginRedirect("/pages/personnalisation.html?event=demo#preview"),
    "/pages/personnalisation.html?event=demo#preview"
  );
});

test("guest QR generation never sends invitation data to the external QR service", () => {
  const source = fs.readFileSync("assets/js/guest-experience.js", "utf8");
  assert.doesNotMatch(source, /api\.qrserver\.com/i);
  assert.match(source, /QR code indisponible/);
});

test("modal transition keeps focus inside the newly opened confirmation", () => {
  const source = fs.readFileSync("assets/js/guest-experience.js", "utf8");
  const openAccessibility = source.slice(
    source.indexOf("function openModalAccessibility"),
    source.indexOf("function closeModalAccessibility")
  );
  const closeAccessibility = source.slice(
    source.indexOf("function closeModalAccessibility"),
    source.indexOf("function closeActiveModal")
  );

  assert.match(openAccessibility, /closingParentModal\?\.__returnFocus \|\| active/);
  assert.match(closeAccessibility, /if \(getActiveModal\(\)\) return;/);
});

test("analytics labels are rendered as text rather than interpolated HTML", () => {
  const source = fs.readFileSync("assets/js/admin.js", "utf8");
  const analytics = source.slice(source.indexOf("async function renderAnalytics"), source.indexOf("async function renderRSVPList"));
  assert.doesNotMatch(analytics, /summary\.innerHTML/);
  assert.match(analytics, /label\.textContent = eventType/);
});

test("event RLS blocks direct creation and ownership takeover", () => {
  const sql = fs.readFileSync("docs/SUPABASE-PLATFORM-HARDENING.sql", "utf8");
  assert.doesNotMatch(sql, /CREATE POLICY "events_owner_all"/);
  assert.match(sql, /CREATE POLICY "events_platform_insert" ON public\.events\s+FOR INSERT WITH CHECK \(public\.is_platform_admin\(\)\)/);
  assert.match(sql, /CREATE POLICY "events_manager_update" ON public\.events\s+FOR UPDATE USING \(public\.can_manage_event\(id\)\)\s+WITH CHECK \(public\.can_manage_event\(id\)\)/);
  assert.match(sql, /CREATE TRIGGER prevent_event_owner_takeover/);
  assert.match(sql, /NEW\.owner_id IS DISTINCT FROM OLD\.owner_id[\s\S]{0,120}public\.is_platform_admin\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.prevent_event_owner_takeover\(\) FROM PUBLIC/);
});

test("presence CSV exports neutralize spreadsheet formulas", () => {
  const presence = loadAdminPresence();
  assert.equal(presence.formatCsvCell('=HYPERLINK("https://example.test")'), '"\'=HYPERLINK(""https://example.test"")"');
  assert.equal(presence.formatCsvCell('@SUM(A1:A2)'), '"\'@SUM(A1:A2)"');
  assert.equal(presence.formatCsvCell('Marie\nNoël'), '"Marie Noël"');
});
