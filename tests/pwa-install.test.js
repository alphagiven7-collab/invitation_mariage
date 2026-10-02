const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto, createHash } = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/pwa-install.js"), "utf8");

class Node {
    constructor(tag = "div", attrs = {}) {
        this.tagName = tag.toUpperCase();
        this.attributes = { ...attrs };
        this.children = [];
        this.hidden = true;
        this.listeners = {};
        this.textContent = "";
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); return child; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    click() { return this.listeners.click?.({ target: this }); }
}

function storedKey(mode, eventId, token = "") {
    return `michelline_pwa_${createHash("sha256").update(JSON.stringify([mode, eventId, token])).digest("hex")}`;
}

function harness({ mode = "invitation", eventId = "event-a", token = "token-one", storage = new Map(), standalone = false, ua = "Chrome", storageDenied = false, crypto = webcrypto } = {}) {
    const listeners = {}, documentListeners = {};
    const organizer = new Node("div", { "data-pwa-install": "organizer" });
    const invitation = new Node("div", { "data-pwa-install": "invitation" });
    const confirmation = new Node("div", { "data-pwa-install": "invitation" });
    const trigger = new Node("button", { "data-pwa-install-trigger": "" });
    let manifest = null;
    const document = {
        head: { appendChild(node) { manifest = node; } },
        createElement: tag => new Node(tag),
        querySelector: selector => selector === 'link[rel="manifest"]' ? manifest : null,
        querySelectorAll: selector => selector === "[data-pwa-install]" ? [organizer, invitation, confirmation] : selector === "[data-pwa-install-trigger]" ? [trigger] : [],
        addEventListener(name, fn) { documentListeners[name] = fn; }
    };
    const media = { matches: standalone, addEventListener(name, fn) { this.listener = fn; } };
    const window = {
        crypto,
        location: { pathname: `/pages/${mode === "organizer" ? "admin" : "invitation"}.html`, search: `?${new URLSearchParams({ event: eventId, ...(token ? { t: token } : {}) })}` },
        matchMedia: () => media,
        addEventListener(name, fn) { listeners[name] = fn; }
    };
    const localStorage = {
        getItem(key) { if (storageDenied) throw new Error("Storage denied"); return storage.get(key) || null; },
        setItem(key, value) { if (storageDenied) throw new Error("Storage denied"); storage.set(key, value); }
    };
    vm.runInNewContext(source, { window, navigator: { userAgent: ua }, document, localStorage, URLSearchParams, TextEncoder, Uint8Array, Date, WeakMap, console });
    const api = window.PwaInstall;
    return { api, window, media, organizer, invitation, confirmation, trigger, storage, manifest: () => manifest, emit: (name, event = {}) => listeners[name]?.(event), documentListeners };
}

async function waitFor(predicate) {
    for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 2));
    }
    assert.fail("Expected UI state was not reached");
}

function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
function byClass(node, className) { return descendants(node).find(child => child.className === className); }
function offerInvitation(h, options = {}) { return h.api.offerInvitation({ eventId: "event-a", token: "token-one", ...options }); }
function promptEvent(outcome = "accepted") {
    return { calls: 0, prevented: false, preventDefault() { this.prevented = true; }, prompt() { this.calls++; return Promise.resolve({ outcome }); } };
}

test("manifest context is prepared before confirmation while installation cards stay hidden", async () => {
    const h = harness();
    assert.equal(h.manifest().href, "/api/pwa-manifest?mode=invitation&event=event-a&t=token-one");
    assert.equal(h.invitation.hidden, true);
    assert.equal(h.trigger.hidden, true);
    const prompt = promptEvent();
    h.emit("beforeinstallprompt", prompt);
    assert.equal(prompt.prevented, true);
    assert.equal(prompt.calls, 0);
    assert.equal(h.invitation.hidden, true);
    offerInvitation(h, { offlineReady: true });
    await waitFor(() => !h.invitation.hidden);
    assert.equal(h.confirmation.hidden, false);
    assert.equal(h.organizer.hidden, true);
    assert.match(byClass(h.invitation, "pwa-install-note").textContent, /enregistrées sur cet appareil/);
    const install = h.api.install();
    assert.equal(prompt.calls, 1, "native prompt must run synchronously in the click stack");
    assert.equal(await install, true);
    assert.equal(h.invitation.hidden, true);
    await h.api.install();
    assert.equal(prompt.calls, 1, "a native event is single use");
});

test("dismissal persists per invitation, survives an early native event, and manual action can resume", async () => {
    const storage = new Map();
    const h = harness({ storage });
    offerInvitation(h);
    await waitFor(() => !h.invitation.hidden);
    byClass(h.invitation, "pwa-install-later").click();
    assert.equal(h.invitation.hidden, true);
    assert.equal(h.confirmation.hidden, true);
    assert.equal(h.trigger.hidden, false);
    const key = storedKey("invitation", "event-a", "token-one");
    assert(JSON.parse(storage.get(key)).dismissedUntil > Date.now());
    assert([...storage.keys()].every(value => !value.includes("token-one")));
    const reload = harness({ storage });
    const prompt = promptEvent();
    reload.emit("beforeinstallprompt", prompt);
    offerInvitation(reload);
    await waitFor(() => !reload.trigger.hidden);
    assert.equal(reload.invitation.hidden, true, "early prompt must not erase the saved cooldown");
    await reload.api.install();
    assert.equal(prompt.calls, 1);
    const another = harness({ storage, token: "token-two" });
    offerInvitation(another, { token: "token-two" });
    await waitFor(() => !another.invitation.hidden);
});

test("changing invitation discards a native prompt prepared for the previous event or token", async () => {
    const h = harness();
    const first = promptEvent();
    h.emit("beforeinstallprompt", first);
    offerInvitation(h, { token: "token-two" });
    await waitFor(() => !h.invitation.hidden);
    assert.equal(await h.api.install(), false);
    assert.equal(first.calls, 0);
    assert.equal(byClass(h.invitation, "pwa-install-help").hidden, false);
    assert.match(h.manifest().href, /t=token-two$/);
    const replacement = promptEvent();
    h.emit("beforeinstallprompt", replacement);
    assert.equal(await h.api.install(), true);
    assert.equal(replacement.calls, 1);
});

test("iOS fallback gives inline instructions without native prompting or moving focus", async () => {
    const h = harness({ mode: "organizer", ua: "Mozilla/5.0 (iPhone) AppleWebKit Safari" });
    h.api.offerOrganizer({ eventId: "event-a" });
    await waitFor(() => !h.organizer.hidden);
    const title = byClass(h.organizer, "pwa-install-title");
    await h.api.install();
    assert.equal(byClass(h.organizer, "pwa-install-help").hidden, false);
    assert.equal(byClass(h.organizer, "pwa-install-help-title").textContent, "Sur iPhone ou iPad");
    assert.match(byClass(h.organizer, "pwa-install-help-note").textContent, /nouvelle connexion/);
    assert.equal(byClass(h.organizer, "pwa-install-primary").getAttribute("aria-expanded"), "true");
    h.api.refresh();
    assert.equal(byClass(h.organizer, "pwa-install-title"), title, "refresh preserves existing DOM and focus");
    assert.doesNotMatch(h.manifest().href, /[?&]t=/);
});

test("standalone and installed apps hide all offers; a new browser prompt allows a reinstall", async () => {
    const standalone = harness({ standalone: true });
    offerInvitation(standalone);
    assert.equal(standalone.invitation.hidden, true);
    assert.equal(await standalone.api.install(), false);
    const storage = new Map();
    const h = harness({ storage });
    offerInvitation(h);
    await waitFor(() => !h.invitation.hidden);
    h.emit("appinstalled");
    assert.equal(h.invitation.hidden, true);
    assert.equal(h.trigger.hidden, true);
    assert.equal(JSON.parse(storage.get(storedKey("invitation", "event-a", "token-one"))).installed, true);
    const reload = harness({ storage });
    offerInvitation(reload);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(reload.invitation.hidden, true);
    reload.emit("beforeinstallprompt", promptEvent());
    await waitFor(() => !reload.invitation.hidden);
});

test("installation completion cannot mark a different invitation as installed", async () => {
    const h = harness();
    offerInvitation(h);
    await waitFor(() => !h.invitation.hidden);
    h.emit("beforeinstallprompt", promptEvent());
    await h.api.install();
    offerInvitation(h, { token: "token-two" });
    await waitFor(() => !h.invitation.hidden);
    h.emit("appinstalled");
    assert.equal(h.invitation.hidden, false);
    assert.equal(JSON.parse(h.storage.get(storedKey("invitation", "event-a", "token-one"))).installed, true);
});

test("storage restrictions and rejected native prompt retain the manual installation path", async () => {
    const h = harness({ storageDenied: true });
    offerInvitation(h);
    await waitFor(() => !h.invitation.hidden);
    const prompt = promptEvent();
    prompt.prompt = () => Promise.reject(new Error("Not supported"));
    h.emit("beforeinstallprompt", prompt);
    assert.equal(await h.api.install(), false);
    assert.equal(byClass(h.invitation, "pwa-install-help").hidden, false);
    assert.equal(byClass(h.invitation, "pwa-install-primary").disabled, false);
    const withoutCrypto = harness({ crypto: {} });
    offerInvitation(withoutCrypto);
    await waitFor(() => !withoutCrypto.invitation.hidden);
    assert.equal(await withoutCrypto.api.install(), false);
});

test("a dismissed native prompt is not reused and applies the same cooldown", async () => {
    const h = harness();
    offerInvitation(h);
    await waitFor(() => !h.invitation.hidden);
    const prompt = promptEvent("dismissed");
    h.emit("beforeinstallprompt", prompt);
    assert.equal(await h.api.install(), false);
    assert.equal(h.invitation.hidden, true);
    assert.equal(h.trigger.hidden, false);
    await h.api.install();
    assert.equal(prompt.calls, 1);
    assert.equal(h.invitation.hidden, false);
    assert.equal(byClass(h.invitation, "pwa-install-help").hidden, false);
});

test("revocation clears cards and manual triggers until access is explicitly offered again", async () => {
    const h = harness();
    offerInvitation(h);
    await waitFor(() => !h.invitation.hidden);
    const previous = promptEvent();
    h.emit("beforeinstallprompt", previous);
    h.api.clearOffer();
    assert.equal(h.invitation.hidden, true);
    assert.equal(h.confirmation.hidden, true);
    assert.equal(h.trigger.hidden, true);
    const later = promptEvent();
    h.emit("beforeinstallprompt", later);
    h.api.refresh();
    assert.equal(h.invitation.hidden, true);
    assert.equal(await h.api.install(), false);
    assert.equal(previous.calls, 0);
    assert.equal(later.calls, 0);
    offerInvitation(h);
    assert.equal(h.invitation.hidden, false);
});
