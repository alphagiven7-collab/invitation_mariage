const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const SESSION_KEY = "wedding_admin_session";

function storage(initial = {}) {
  const values = { ...initial };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    removeItem(key) { delete values[key]; },
    values
  };
}

function jsonResponse(data, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => data
  };
}

function loadAuth(session, fetch) {
  const localStorage = storage(session ? { [SESSION_KEY]: JSON.stringify(session) } : {});
  const sessionStorage = storage();
  const config = { enabled: true, url: "https://example.test", anonKey: "anon-key" };
  const window = { SUPABASE_CONFIG: config, localStorage, sessionStorage, location: { search: "", pathname: "/pages/admin.html" } };
  const sandbox = {
    window,
    localStorage,
    sessionStorage,
    fetch,
    URLSearchParams,
    console: { warn() {} },
    Date,
    JSON
  };
  vm.runInNewContext(fs.readFileSync("assets/js/auth.js", "utf8"), sandbox, { filename: "auth.js" });
  return { auth: window.AuthGuard, localStorage };
}

test("expired organizer session is refreshed before admin access is checked", async () => {
  const calls = [];
  const previous = {
    role: "event", eventId: "mariage-test", userId: "user-1", email: "owner@example.test",
    accessToken: "expired", refreshToken: "refresh-1", expiresAt: Date.now() - 1
  };
  const { auth, localStorage } = loadAuth(previous, async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("token?grant_type=refresh_token")) {
      return jsonResponse({
        access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600,
        user: { id: "user-1", email: "owner@example.test" }
      });
    }
    if (url.includes("/profiles?")) return jsonResponse([{ role: "event" }]);
    if (url.includes("/rpc/can_manage_event")) return jsonResponse(true);
    throw new Error(`unexpected request ${url}`);
  });

  const refreshed = await auth.refreshSession();

  assert.equal(refreshed.accessToken, "new-access");
  assert.equal(refreshed.refreshToken, "new-refresh");
  assert.equal(auth.isEventAdmin("mariage-test"), true);
  assert.equal(JSON.parse(localStorage.getItem(SESSION_KEY)).accessToken, "new-access");
  assert.equal(calls.length, 3);
});

test("a rejected refresh clears the expired session", async () => {
  const previous = {
    role: "event", eventId: "mariage-test", userId: "user-1", accessToken: "expired",
    refreshToken: "invalid", expiresAt: Date.now() - 1
  };
  const { auth, localStorage } = loadAuth(previous, async () =>
    jsonResponse({ error_description: "Invalid refresh token" }, 400)
  );

  assert.equal(await auth.refreshSession(), null);
  assert.equal(auth.getSession(), null);
  assert.equal(localStorage.getItem(SESSION_KEY), null);
});

test("a fresh session does not make an unnecessary refresh request", async () => {
  const previous = {
    role: "event", eventId: "mariage-test", userId: "user-1", accessToken: "fresh",
    refreshToken: "refresh-1", expiresAt: Date.now() + 120_000
  };
  let requests = 0;
  const { auth } = loadAuth(previous, async () => {
    requests += 1;
    throw new Error("network should not be used");
  });

  const session = await auth.refreshSession();
  assert.equal(session.accessToken, "fresh");
  assert.equal(requests, 0);
});

test("admin pages refresh a stored session before testing its role", () => {
  for (const file of ["assets/js/admin.js", "assets/js/personnalisation.js", "assets/js/checkin-page.js", "assets/js/evenements-page.js"]) {
    const source = fs.readFileSync(file, "utf8");
    const refreshAt = source.indexOf("refreshSession");
    const authorizationAt = source.indexOf("requireAdmin") >= 0
      ? source.indexOf("requireAdmin")
      : source.indexOf("isPlatformAdmin");
    assert.ok(refreshAt >= 0, `${file} must refresh its session`);
    assert.ok(refreshAt < authorizationAt, `${file} must refresh before authorization`);
  }
});
