const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const handler = require("../api/pwa-manifest");

function manifest(query, method = "GET") {
    const response = {
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        end(body) { this.body = body; }
    };
    handler({ method, url: `/api/pwa-manifest?${query}` }, response);
    return { ...response, json: response.body ? JSON.parse(response.body) : null };
}

test("organizer installation starts in its event dashboard without carrying invitation or auth parameters", () => {
    const result = manifest("mode=organizer&event=mariage-test&t=guest-secret&access_token=ignored");
    assert.equal(result.statusCode, 200);
    assert.equal(result.json.start_url, "/pages/admin.html?event=mariage-test");
    assert.equal(result.json.id, "/pwa/organizer/mariage-test");
    assert.equal(result.json.scope, "/");
    assert.equal(result.json.display, "standalone");
    assert.equal(result.json.prefer_related_applications, false);
    assert.doesNotMatch(result.body, /guest-secret|access_token|ignored/);
});

test("each invitation keeps its exact token in start_url and has a separate opaque installation identity", () => {
    const first = manifest("mode=invitation&event=event-a&t=token-one").json;
    const same = manifest("mode=invitation&event=event-a&t=token-one").json;
    const otherGuest = manifest("mode=invitation&event=event-a&t=token-two").json;
    const otherEvent = manifest("mode=invitation&event=event-b&t=token-one").json;
    assert.equal(first.start_url, "/pages/invitation.html?event=event-a&t=token-one");
    assert.match(first.id, /^\/pwa\/invitation\/[a-f0-9]{64}$/);
    assert.equal(first.id, same.id);
    assert.notEqual(first.id, otherGuest.id);
    assert.notEqual(first.id, otherEvent.id);
    assert.doesNotMatch(first.id, /token-one|event-a/);
    assert.equal(first.name, otherGuest.name);
    assert.equal(first.short_name, "Mon invitation");
    assert.equal(manifest("mode=invitation&event=event-a").json.start_url, "/pages/invitation.html?event=event-a");
});

test("personal manifests cannot be reused by browser or CDN caches", () => {
    const result = manifest("mode=invitation&event=event-a&t=token-one");
    assert.match(result.headers["Content-Type"], /^application\/manifest\+json/);
    assert.match(result.headers["Cache-Control"], /private.*no-store/);
    assert.equal(result.headers["CDN-Cache-Control"], "no-store");
    assert.equal(result.headers["Vercel-CDN-Cache-Control"], "no-store");
    assert.equal(result.headers["Referrer-Policy"], "no-referrer");
    const head = manifest("mode=invitation&event=event-a&t=token-one", "HEAD");
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, undefined);
});

test("manifest rejects malformed context, conflicting parameters and mutation methods", () => {
    for (const query of ["", "mode=other&event=event-a", "mode=invitation", "mode=invitation&event=//evil.test", "mode=invitation&event=event-a&t=foo%0abar", "mode=organizer&event=event-a&event=event-b", `mode=invitation&event=event-a&t=${"x".repeat(257)}`]) {
        assert.equal(manifest(query).statusCode, 400, query);
    }
    const post = manifest("mode=organizer&event=event-a", "POST");
    assert.equal(post.statusCode, 405);
    assert.equal(post.headers.Allow, "GET, HEAD");
});

test("installable manifest points to real PNG icons with their declared dimensions", () => {
    const icons = manifest("mode=organizer&event=event-a").json.icons;
    assert(icons.some(icon => icon.sizes === "192x192"));
    assert(icons.some(icon => icon.sizes === "512x512" && icon.purpose === "maskable"));
    for (const icon of [...icons, { src: "/assets/images/pwa-icon-180.png", sizes: "180x180" }]) {
        const png = fs.readFileSync(path.join(__dirname, "..", icon.src));
        assert.equal(png.subarray(1, 4).toString(), "PNG");
        assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    }
});
