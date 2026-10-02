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

function loadAuth(session, fetch, overrides = {}) {
  const localStorage = overrides.localStorage || storage(session ? { [SESSION_KEY]: JSON.stringify(session) } : {});
  const sessionStorage = overrides.sessionStorage || storage();
  const config = { enabled: true, url: "https://example.test", anonKey: "anon-key" };
  const events = [];
  const listeners = {};
  const window = { SUPABASE_CONFIG: config, localStorage, sessionStorage,
    location: { search: "", pathname: "/pages/admin.html" },
    addEventListener(name, listener) { listeners[name] = listener; },
    dispatchEvent(event) { events.push(event); },
    ...overrides.window
  };
  const sandbox = {
    window,
    localStorage,
    sessionStorage,
    fetch,
    URLSearchParams,
    console: { warn() {} },
    Date,
    JSON,
    CustomEvent: class { constructor(type) { this.type = type; } }
  };
  vm.runInNewContext(fs.readFileSync("assets/js/auth.js", "utf8"), sandbox, { filename: "auth.js" });
  return { auth: window.AuthGuard, localStorage, sessionStorage, events, listeners, window };
}

test("expired organizer session is refreshed for guest management only", async () => {
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
    if (url.includes("/rpc/can_manage_guests")) return jsonResponse(true);
    throw new Error(`unexpected request ${url}`);
  });

  const refreshed = await auth.refreshSession();

  assert.equal(refreshed.accessToken, "new-access");
  assert.equal(refreshed.refreshToken, "new-refresh");
  assert.equal(auth.isGuestManager("mariage-test"), true);
  assert.equal(auth.isEventAdmin("mariage-test"), false);
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

test("existing email owners can still log in while the guest migration is pending", async () => {
  const calls = [];
  const { auth } = loadAuth(null, async (url) => {
    calls.push(url);
    if (url.includes("/auth/v1/token?")) return jsonResponse({
      user: { id: "owner-1", email: "owner@example.test" },
      access_token: "owner-jwt", expires_in: 3600
    });
    if (url.includes("/profiles?")) return jsonResponse([{ role: "client" }]);
    if (url.includes("/rpc/can_manage_guests")) return jsonResponse({ code: "PGRST202" }, 404);
    if (url.includes("/rpc/can_manage_event")) return jsonResponse(true);
    throw new Error(`unexpected request ${url}`);
  });

  const result = await auth.loginWithPassword("owner@example.test", "secret", "mariage-test");
  assert.equal(result.role, "organizer");
  assert.equal(auth.isGuestManager("mariage-test"), true);
  assert.ok(calls.some((url) => url.includes("/rpc/can_manage_event")));
});

test("a fresh stored session checks current server identity and rights once without rotating its token", async () => {
  const previous = {
    role: "event", eventId: "mariage-test", userId: "user-1", accessToken: "fresh",
    refreshToken: "refresh-1", expiresAt: Date.now() + 120_000
  };
  const calls = [];
  const { auth } = loadAuth(previous, async (url) => {
    calls.push(url);
    if (url.endsWith('/auth/v1/user')) return jsonResponse({ id:'user-1' });
    if (url.includes('/profiles?')) return jsonResponse([{ role:'client' }]);
    if (url.includes('/rpc/can_manage_guests')) return jsonResponse(true);
    throw new Error(`unexpected request ${url}`);
  });

  assert.equal(auth.getSession(), null, 'Stored roles alone do not authorize a reopened app');
  assert.equal(auth.getSessionStatus(), 'unverified');
  const session = await auth.refreshSession();
  assert.equal(session.accessToken, "fresh");
  assert.equal(auth.getSessionStatus(), 'authenticated');
  assert.equal(auth.getResumeUrl(session), '/pages/admin.html?event=mariage-test');
  await auth.refreshSession();
  assert.equal(calls.length, 3, 'Repeated calls share the short verification cache');
  assert.equal(calls.some(url=>url.includes('grant_type=refresh_token')), false);
});

function previousSession(patch = {}) {
  return { role:'organizer', eventId:'mariage-test', userId:'user-1', accessToken:'old-access',
    refreshToken:'old-refresh', expiresAt:Date.now()+3_600_000, at:Date.now()-1000, ...patch };
}

function authorizedResponse(url) {
  if (url.includes('grant_type=refresh_token')) return jsonResponse({ access_token:'new-access', refresh_token:'new-refresh',
    expires_in:3600, user:{id:'user-1'} });
  if (url.endsWith('/auth/v1/user')) return jsonResponse({id:'user-1'});
  if (url.includes('/profiles?')) return jsonResponse([{role:'client'}]);
  if (url.includes('/rpc/can_manage_guests')) return jsonResponse(true);
  throw new Error(`unexpected request ${url}`);
}

test('forcing PWA resume rotates a fresh session and deduplicates simultaneous callers', async () => {
  const calls = [];
  const h = loadAuth(previousSession(), async url=>{calls.push(url);return authorizedResponse(url);});
  const [a,b] = await Promise.all([h.auth.refreshSession({force:true}), h.auth.refreshSession({force:true})]);
  assert.equal(a.accessToken, 'new-access');
  assert.equal(b.accessToken, 'new-access');
  assert.equal(calls.filter(url=>url.includes('grant_type=refresh_token')).length,1);
  assert.equal(h.auth.isGuestManager('another-event'),false);
});

test('revoked event permissions clear even a fresh access token and notify the app without token data', async () => {
  const h = loadAuth(previousSession(), async url=>url.includes('/rpc/can_manage_guests')
    ? jsonResponse(false) : authorizedResponse(url));
  assert.equal(await h.auth.refreshSession(), null);
  assert.equal(h.auth.getSessionStatus(), 'signed-out');
  assert.equal(h.localStorage.getItem(SESSION_KEY),null);
  assert.equal(h.events[0].type,'auth:signed-out');
  assert.equal(h.events[0].detail,undefined);
  assert.equal(h.auth.getResumeUrl(),'/pages/login.html');
});

test('network failure blocks access without deleting credentials and recovers without a password', async () => {
  let offline = true;
  const previous = previousSession({ expiresAt:Date.now()-1 });
  const h = loadAuth(previous, async url=>{
    if(offline) throw new TypeError('Network unavailable');
    return authorizedResponse(url);
  });
  assert.equal(await h.auth.refreshSession({force:true}),null);
  assert.equal(h.auth.getSessionStatus(),'offline');
  assert.equal(h.auth.getSession(),null);
  assert.equal(h.auth.isGuestManager('mariage-test'),false);
  assert.equal(JSON.parse(h.localStorage.getItem(SESSION_KEY)).refreshToken,'old-refresh');
  offline=false;
  assert.equal((await h.auth.refreshSession({force:true})).accessToken,'new-access');
});

test('a rotated token survives a temporary failure while verifying permissions', async () => {
  const h=loadAuth(previousSession(),async url=>url.includes('/profiles?')
    ? jsonResponse({message:'unavailable'},503) : authorizedResponse(url));
  assert.equal(await h.auth.refreshSession({force:true}),null);
  assert.equal(h.auth.getSessionStatus(),'offline');
  assert.equal(JSON.parse(h.localStorage.getItem(SESSION_KEY)).refreshToken,'new-refresh');
  assert.equal(h.auth.getSession(),null);
});

test('logout wins over a late refresh response and attempts server revocation with keepalive', async () => {
  let release;
  const calls=[];
  const h=loadAuth(previousSession(),async(url,options)=>{
    calls.push({url,options});
    if(url.includes('grant_type=refresh_token')) await new Promise(resolve=>{release=resolve;});
    if(url.endsWith('/logout')) return jsonResponse({});
    return authorizedResponse(url);
  });
  const refresh=h.auth.refreshSession({force:true});
  h.auth.logout();
  release();
  assert.equal(await refresh,null);
  assert.equal(h.auth.getSession(),null);
  assert.equal(h.localStorage.getItem(SESSION_KEY),null);
  assert.equal(h.auth.getSessionStatus(),'signed-out');
  const logout=calls.find(call=>call.url.endsWith('/logout'));
  assert.equal(logout.options.keepalive,true);
  assert.equal(h.window.location.href,'./login.html');
});

test('a server identity different from the stored user never grants the previous event access', async () => {
  const h=loadAuth(previousSession(),async url=>url.endsWith('/auth/v1/user')
    ? jsonResponse({id:'another-user'}) : authorizedResponse(url));
  assert.equal(await h.auth.refreshSession(),null);
  assert.equal(h.auth.getSessionStatus(),'signed-out');
});

test('a blocked localStorage falls back to sessionStorage and never stores the password', async () => {
  const sessionStorage=storage();
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
  const h=loadAuth(null,async url=>url.includes('grant_type=password')
    ? jsonResponse({ access_token:'login-access',refresh_token:'login-refresh',expires_in:3600,user:{id:'user-1'} })
    : authorizedResponse(url),{localStorage:blocked,sessionStorage});
  await h.auth.loginWithPassword('owner@example.test','never-store-this','mariage-test');
  assert.equal(h.auth.isGuestManager('mariage-test'),true);
  assert.equal(JSON.parse(sessionStorage.getItem(SESSION_KEY)).refreshToken,'login-refresh');
  assert.equal(JSON.stringify(sessionStorage.values).includes('never-store-this'),false);
  h.auth.logout();
  assert.equal(sessionStorage.getItem(SESSION_KEY),null);
});

test('a logout marker prevents resurrecting a legacy session in another tab', async () => {
  const legacy=previousSession();
  const localStorage=storage({wedding_admin_signed_out_at:String(Date.now())});
  const sessionStorage=storage({[SESSION_KEY]:JSON.stringify(legacy)});
  const h=loadAuth(null,async()=>{throw new Error('no request expected');},{localStorage,sessionStorage});
  assert.equal(await h.auth.refreshSession(),null);
  assert.equal(h.auth.getSessionStatus(),'signed-out');
});

test('two tabs sharing Web Locks reread the rotated token instead of reusing its predecessor', async () => {
  const localStorage=storage({[SESSION_KEY]:JSON.stringify(previousSession())});
  const calls=[];
  let queue=Promise.resolve();
  const locks={request(name,run){
    assert.equal(name,`${SESSION_KEY}:refresh`);
    const task=queue.then(run);queue=task.catch(()=>{});return task;
  }};
  const request=async url=>{calls.push(url);return authorizedResponse(url);};
  const first=loadAuth(null,request,{localStorage,window:{navigator:{locks}}});
  const second=loadAuth(null,request,{localStorage,window:{navigator:{locks}}});
  const sessions=await Promise.all([first.auth.refreshSession({force:true}),second.auth.refreshSession({force:true})]);
  assert.equal(sessions[0].accessToken,'new-access');
  assert.equal(sessions[1].accessToken,'new-access');
  assert.equal(calls.filter(url=>url.includes('grant_type=refresh_token')).length,1);
  assert.equal(first.auth.isGuestManager('mariage-test'),true);
  assert.equal(second.auth.isGuestManager('mariage-test'),true);
});

test('a forced resume queued behind a normal validation still checks refresh token revocation', async () => {
  const calls=[];
  const h=loadAuth(previousSession(),async url=>{
    calls.push(url);
    return url.includes('grant_type=refresh_token')
      ? jsonResponse({error_description:'revoked'},400) : authorizedResponse(url);
  });
  const normal=h.auth.refreshSession();
  const forced=h.auth.refreshSession({force:true});
  assert.ok(await normal);
  assert.equal(await forced,null);
  assert.equal(h.auth.getSessionStatus(),'signed-out');
  assert.equal(calls.filter(url=>url.includes('grant_type=refresh_token')).length,1);
});

test('platform role and resume URL come from the current server profile', async () => {
  const h=loadAuth(previousSession({role:'platform',eventId:null}),async url=>url.includes('/profiles?')
    ? jsonResponse([{role:'platform'}]) : authorizedResponse(url));
  const session=await h.auth.refreshSession();
  assert.equal(h.auth.isPlatformAdmin(),true);
  assert.equal(h.auth.isEventAdmin('some-event'),true);
  assert.equal(h.auth.getResumeUrl(session),'/pages/evenements.html');
  assert.equal(h.auth.getResumeUrl({...session,accessToken:'unverified'}),'/pages/login.html');
});

test('logout in another tab immediately invalidates a verified session', async () => {
  const h=loadAuth(previousSession(),async url=>authorizedResponse(url));
  await h.auth.refreshSession();
  h.localStorage.setItem('wedding_admin_signed_out_at',String(Date.now()+1));
  h.localStorage.removeItem(SESSION_KEY);
  h.listeners.storage({key:SESSION_KEY,newValue:null});
  assert.equal(h.auth.getSession(),null);
  assert.equal(h.auth.isGuestManager('mariage-test'),false);
  assert.equal(h.auth.getSessionStatus(),'signed-out');
  assert.equal(h.events.at(-1).type,'auth:signed-out');
});

test("admin pages refresh a stored session before testing its role", () => {
  for (const file of ["assets/js/admin.js", "assets/js/personnalisation.js", "assets/js/checkin-page.js", "assets/js/evenements-page.js"]) {
    const source = fs.readFileSync(file, "utf8");
    const startAt = source.indexOf('async function init()') >= 0
      ? source.indexOf('async function init()')
      : source.indexOf('window.addEventListener("DOMContentLoaded"');
    const startup = source.slice(startAt);
    const refreshAt = startup.indexOf("refreshSession");
    const authorizationAt = startup.indexOf("requireGuestManager") >= 0
      ? startup.indexOf("requireGuestManager")
      : startup.indexOf("requireAdmin") >= 0
        ? startup.indexOf("requireAdmin")
        : startup.indexOf("isPlatformAdmin");
    assert.ok(refreshAt >= 0, `${file} must refresh its session`);
    assert.ok(refreshAt < authorizationAt, `${file} must refresh before authorization`);
  }
});
