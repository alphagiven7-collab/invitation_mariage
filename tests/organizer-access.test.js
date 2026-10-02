const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function response(data, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(data) };
}

function reply() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; }
  };
}

test("phone login gets guest access to one event and never customization access", async () => {
  const state = {};
  const calls = [];
  const window = {
    SUPABASE_CONFIG: { enabled: true, url: "https://supabase.test", anonKey: "anon" },
    localStorage: {
      getItem(key) { return state[key] || null; },
      setItem(key, value) { state[key] = value; },
      removeItem(key) { delete state[key]; }
    },
    location: { pathname: "/pages/admin.html", search: "", href: "" }
  };
  const sandbox = {
    window, localStorage: window.localStorage, sessionStorage: window.localStorage,
    URLSearchParams, JSON, Date, console,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/auth/v1/token")) {
        return { ok: true, json: async () => ({ user: { id: "phone-user", email: "243900000000@organizer.michelline-invitations.vercel.app" }, access_token: "access", expires_in: 3600 }) };
      }
      if (url.includes("/profiles?")) return { ok: true, json: async () => [{ role: "client" }] };
      if (url.includes("/rpc/can_manage_guests")) return { ok: true, json: async () => true };
      throw new Error(`Unexpected request: ${url}`);
    }
  };
  vm.runInNewContext(fs.readFileSync("assets/js/organizer-identity.js", "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync("assets/js/auth.js", "utf8"), sandbox);
  const auth = window.AuthGuard;
  const result = await auth.loginWithPassword("0900 000 000", "secure-password", "mariage-a");
  assert.equal(result.role, "organizer");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: "243900000000@organizer.michelline-invitations.vercel.app", password: "secure-password"
  });
  assert.equal(result.session.phone, "+243900000000");
  assert.equal(auth.isGuestManager("mariage-a"), true);
  assert.equal(auth.isGuestManager("mariage-b"), false);
  assert.equal(auth.isEventAdmin("mariage-a"), false);
  assert.equal(auth.requireAdmin("mariage-a"), false);
  assert.match(window.location.href, /login\.html/);
});

test("organizer API rejects a non-platform token before touching the service account", async () => {
  const prior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "secret";
  const handler = require("../api/organizer.js");
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return response({ id: "client-user" });
    if (url.endsWith("/rpc/is_platform_admin")) return response(false);
    throw new Error(`Service request must not occur: ${url}`);
  };
  try {
    const res = reply();
    await handler({
      method: "PUT", url: "/api/organizer?event=mariage-a",
      headers: { authorization: "Bearer client-token" },
      body: { eventId: "mariage-a", phone: "+243900000000", password: "secure-password" }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(({ options }) => options.headers.apikey === "anon"));
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("organizer API recognizes the secret variable currently configured in Vercel", async () => {
  const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABAS_SECRET_KEY", "SUPABASE_SERVICE_ROLE_SECRET"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "anon";
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABAS_SECRET_KEY = "sb_secret_test";
  delete require.cache[require.resolve("../api/organizer.js")];
  try {
    const handler = require("../api/organizer.js");
    const res = reply();
    await handler({ method: "GET", url: "/api/organizer?event=mariage-a", headers: {} }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    delete require.cache[require.resolve("../api/organizer.js")];
  }
});

test("platform admin can assign a phone to an existing event without exposing the secret key", async () => {
  const originalFetch = global.fetch;
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY
  };
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete require.cache[require.resolve("../api/organizer.js")];
  const handler = require("../api/organizer.js");
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return response({ id: "platform-user" });
    if (url.endsWith("/rpc/is_platform_admin")) return response(true);
    if (url.includes("/rest/v1/events?")) return response([{ id: "mariage-a" }]);
    if (url.includes("/rest/v1/event_guest_managers?event_id=")) return response([]);
    if (url.includes("/rest/v1/event_guest_managers?phone=")) return response([]);
    if (url.endsWith("/auth/v1/admin/users")) return response({ id: "organizer-user" });
    if (url.includes("/rest/v1/event_guest_managers?on_conflict=")) return response([{ event_id: "mariage-a" }]);
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  try {
    const res = reply();
    await handler({
      method: "PUT", url: "/api/organizer?event=mariage-a",
      headers: { authorization: "Bearer platform-jwt" },
      body: { eventId: "mariage-a", phone: "+243900000000", password: "secure-password" }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.phone, "+243900000000");
    const creation = calls.find(({ url }) => url.endsWith("/auth/v1/admin/users"));
    assert.deepEqual(JSON.parse(creation.options.body), {
      email: "243900000000@organizer.michelline-invitations.vercel.app",
      password: "secure-password", email_confirm: true
    });
    assert.equal(creation.options.headers.apikey, "sb_secret_test");
    assert.equal(creation.options.headers.Authorization, undefined);
    assert.equal(calls[0].options.headers.Authorization, "Bearer platform-jwt");
    assert.equal(JSON.stringify(res.data).includes("sb_secret"), false);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    delete require.cache[require.resolve("../api/organizer.js")];
  }
});

test("saving an existing organizer phone adds an email login to the same user", async () => {
  const originalFetch = global.fetch;
  const previous = Object.fromEntries(
    ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY"].map((name) => [name, process.env[name]])
  );
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete require.cache[require.resolve("../api/organizer.js")];
  const handler = require("../api/organizer.js");
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return response({ id: "platform-user" });
    if (url.endsWith("/rpc/is_platform_admin")) return response(true);
    if (url.includes("/rest/v1/events?")) return response([{ id: "mariage-a" }]);
    if (url.includes("/rest/v1/event_guest_managers?event_id=")) {
      return response([{ event_id: "mariage-a", user_id: "existing-organizer", phone: "+243900000000" }]);
    }
    if (url.endsWith("/auth/v1/admin/users/existing-organizer")) return response({ id: "existing-organizer" });
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  try {
    const res = reply();
    await handler({
      method: "PUT", url: "/api/organizer?event=mariage-a",
      headers: { authorization: "Bearer platform-jwt" },
      body: { eventId: "mariage-a", phone: "+243900000000", password: "" }
    }, res);
    assert.equal(res.statusCode, 200);
    const update = calls.find(({ url }) => url.endsWith("/auth/v1/admin/users/existing-organizer"));
    assert.equal(update.options.method, "PUT");
    assert.deepEqual(JSON.parse(update.options.body), {
      email: "243900000000@organizer.michelline-invitations.vercel.app", email_confirm: true
    });
    assert.equal(calls.some(({ url }) => url.endsWith("/auth/v1/admin/users")), false);
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    delete require.cache[require.resolve("../api/organizer.js")];
  }
});

test("organizer migration separates guest rights from event customization", () => {
  const sql = fs.readFileSync("docs/SUPABASE-ORGANIZER-ACCESS.sql", "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.event_guest_managers/);
  assert.match(sql, /user_id UUID NOT NULL UNIQUE/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_manage_event[\s\S]*?SELECT p_event_id IS NOT NULL AND public\.is_platform_admin\(\)/);
  assert.match(sql, /CREATE POLICY "guests_manager_all"[\s\S]*?public\.can_manage_guests\(event_id\)/);
  assert.match(sql, /CREATE POLICY "rsvps_manager_all"[\s\S]*?public\.can_manage_guests\(event_id\)/);
  assert.match(sql, /NOT public\.can_manage_guests\(target_event_id\)/);
});
