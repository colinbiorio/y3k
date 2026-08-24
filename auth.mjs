// Accounts + sessions for orion — zero external dependency.
//
// node:crypto provides scrypt password hashing and HMAC-signed session tokens;
// node:fs backs a tiny JSON account store. This module is server-only: server.mjs
// refuses to serve it, and the data files are dotfiles (.accounts.json /
// .session_secret) which the static dotfile guard already blocks — so password
// hashes and the signing secret are never downloadable.
//
// Persistence note: the store is a file at DATA_DIR (default: this app dir). On a
// host with an ephemeral filesystem (Render's default), point DATA_DIR at a
// persistent disk so accounts survive deploys.

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FOUNDER_EMAIL = 'colinbiorio@gmail.com';
const FOUNDER_USERNAME = 'y3klay';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE = 'orion_session';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const ACCOUNTS_FILE = join(DATA_DIR, '.accounts.json');
const SECRET_FILE = join(DATA_DIR, '.session_secret');

// --- store -------------------------------------------------------------------
let accounts = [];
try {
  const parsed = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'));
  if (Array.isArray(parsed)) accounts = parsed;
} catch { /* no store yet — start empty */ }

// Serialize writes; write to a temp file then rename so a crash mid-write can't
// corrupt the store. Low volume, so synchronous writes are fine.
function persist() {
  try {
    const tmp = ACCOUNTS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(accounts));
    renameSync(tmp, ACCOUNTS_FILE);
  } catch (e) { console.error('[auth] could not persist accounts:', e.message); }
}

// --- signing secret (stable across restarts) ---------------------------------
const SECRET = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try { return readFileSync(SECRET_FILE, 'utf8').trim(); } catch { /* generate below */ }
  const s = crypto.randomBytes(32).toString('hex');
  try { writeFileSync(SECRET_FILE, s, { mode: 0o600 }); }
  catch { console.warn('[auth] SESSION_SECRET not set and .session_secret unwritable — sessions reset on restart.'); }
  return s;
})();

// --- passwords ---------------------------------------------------------------
const scrypt = (pw, salt) => new Promise((res, rej) =>
  crypto.scrypt(String(pw), salt, 64, (e, dk) => (e ? rej(e) : res(dk))));

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = await scrypt(pw, salt);
  return { salt, hash: dk.toString('hex') };
}
async function verifyPassword(pw, salt, hash) {
  const dk = await scrypt(pw, salt);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === dk.length && crypto.timingSafeEqual(expected, dk);
}

// --- sessions (HMAC-signed, stateless) ---------------------------------------
function signSession(uid) {
  const payload = `${uid}.${Date.now() + SESSION_TTL_MS}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const encPayload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload;
  try { payload = Buffer.from(encPayload, 'base64url').toString('utf8'); } catch { return null; }
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const sep = payload.lastIndexOf('.');
  const uid = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (!uid || !Number.isFinite(exp) || exp < Date.now()) return null;
  return uid;
}

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip */ } }
  }
  return out;
}
function cookieAttrs(value, maxAge, secure) {
  const a = [`${COOKIE}=${value}`, 'HttpOnly', 'Path=/', `Max-Age=${maxAge}`, 'SameSite=Lax'];
  if (secure) a.push('Secure');
  return a.join('; ');
}

// --- validation --------------------------------------------------------------
const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validUsername = (u) => /^[a-z0-9_]{3,24}$/.test(u);
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;
// id is the stable per-account key (used by orion's memory store); it's an
// opaque uuid — all authorization rides on the signed cookie, never on the id.
const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, founder: !!u.founder, bio: u.bio || '' });

// A person's PUBLIC profile — no email, no id. Safe to serve to anyone.
export function publicProfile(username) {
  const u = accounts.find((a) => a.usernameLower === String(username || '').trim().toLowerCase());
  if (!u) return null;
  return { username: u.username, founder: !!u.founder, bio: u.bio || '', joinedAt: u.createdAt || null };
}

// Resolve a user id to a public username (for labeling posts). null if unknown.
export function usernameById(id) {
  const u = accounts.find((a) => a.id === id);
  return u ? u.username : null;
}
// Resolve a username to its account id (to fetch that person's posts). null if unknown.
export function idByUsername(username) {
  const u = accounts.find((a) => a.usernameLower === String(username || '').trim().toLowerCase());
  return u ? u.id : null;
}

// A signed-in person edits their own bio.
export function setBio(userId, bio) {
  const u = accounts.find((a) => a.id === userId);
  if (!u) return false;
  u.bio = String(bio || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  persist();
  return true;
}

// --- login brute-force throttle (per identifier) -----------------------------
const loginFails = new Map();
const THROTTLE_MAX = 5;
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
function isThrottled(id) { const e = loginFails.get(id); return !!e && e.until > Date.now() && e.count >= THROTTLE_MAX; }
function recordFail(id) {
  const now = Date.now();
  let e = loginFails.get(id);
  if (!e || e.until < now) e = { count: 0, until: now + THROTTLE_WINDOW_MS };
  e.count += 1; loginFails.set(id, e);
  if (loginFails.size > 10000) loginFails.delete(loginFails.keys().next().value); // memory guard
}
const clearFails = (id) => loginFails.delete(id);

// --- operations --------------------------------------------------------------
const MAX_ACCOUNTS_TOTAL = 20000; // durable-store bound (this is a v1, not a hyperscaler)
// Account creation is the sybil faucet (follower inflation, dodging per-account
// comment throttles) — cap signups per source per hour on top of the store bound.
const signupHits = new Map();
const SIGNUP_MAX = 10;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
function signupLimited(ip) {
  const now = Date.now();
  let e = signupHits.get(ip);
  if (!e || now > e.reset) { e = { count: 0, reset: now + SIGNUP_WINDOW_MS }; signupHits.set(ip, e); }
  e.count += 1;
  if (signupHits.size > 10000) signupHits.delete(signupHits.keys().next().value);
  return e.count > SIGNUP_MAX;
}

async function signup(body, ip) {
  if (accounts.length >= MAX_ACCOUNTS_TOTAL) return { status: 507, error: 'Signups are closed for now.' };
  if (ip && signupLimited(ip)) return { status: 429, error: 'Too many new accounts — try later.' };
  const email = String(body.email || '').trim();
  const emailLower = email.toLowerCase();
  const usernameLower = String(body.username || '').trim().toLowerCase();
  if (!validEmail(email)) return { status: 400, error: 'Enter a valid email.' };
  if (!validUsername(usernameLower)) return { status: 400, error: 'Username must be 3–24 letters, numbers, or underscores.' };
  if (!validPassword(body.password)) return { status: 400, error: 'Password must be at least 8 characters.' };
  // y3klay belongs to the founder — nobody else may claim it.
  if (usernameLower === FOUNDER_USERNAME && emailLower !== FOUNDER_EMAIL) return { status: 409, error: 'That username is reserved.' };
  if (accounts.some((a) => a.emailLower === emailLower)) return { status: 409, error: 'An account with that email already exists.' };
  if (accounts.some((a) => a.usernameLower === usernameLower)) return { status: 409, error: 'That username is taken.' };
  const { salt, hash } = await hashPassword(body.password);
  // Re-check after the async hash: a concurrent signup with the same identity
  // could have slipped through the earlier check while scrypt was running. The
  // check-then-push below has no await between it and the insert, so it's atomic.
  if (accounts.some((a) => a.emailLower === emailLower)) return { status: 409, error: 'An account with that email already exists.' };
  if (accounts.some((a) => a.usernameLower === usernameLower)) return { status: 409, error: 'That username is taken.' };
  const user = {
    id: crypto.randomUUID(),
    email, emailLower,
    username: String(body.username).trim(), usernameLower,
    salt, hash,
    createdAt: Date.now(),
    founder: emailLower === FOUNDER_EMAIL,
  };
  accounts.push(user);
  persist();
  return { status: 200, user };
}

async function login(body) {
  const id = String(body.identifier || body.email || '').trim().toLowerCase();
  if (!id || typeof body.password !== 'string') return { status: 400, error: 'Enter your email or username and password.' };
  if (isThrottled(id)) return { status: 429, error: 'Too many attempts — wait a few minutes.' };
  const user = accounts.find((a) => a.emailLower === id || a.usernameLower === id);
  if (!user) { await scrypt(body.password, 'decoy-salt'); recordFail(id); return { status: 401, error: 'No account matches those details.' }; }
  // An account created through Google/Apple has no password to check.
  if (!user.hash || !user.salt) {
    const via = Object.keys(user.oauth || {})[0] || 'Google or Apple';
    return { status: 409, error: `That account signs in with ${via === 'google' ? 'Google' : via === 'apple' ? 'Apple' : via}.` };
  }
  if (!(await verifyPassword(body.password, user.salt, user.hash))) { recordFail(id); return { status: 401, error: 'Incorrect password.' }; }
  clearFails(id);
  return { status: 200, user };
}

// Bootstrap the founder account from an env password so it survives an ephemeral
// filesystem (Render wipes .accounts.json on every deploy). Set FOUNDER_PASSWORD in
// the host env and the account rebuilds itself at boot if it's missing; no-op if
// the var is unset or the account already exists.
async function seedFounder() {
  const pw = process.env.FOUNDER_PASSWORD;
  if (!pw || !validPassword(pw)) return;
  if (accounts.some((a) => a.emailLower === FOUNDER_EMAIL)) return;
  const { salt, hash } = await hashPassword(pw);
  if (accounts.some((a) => a.emailLower === FOUNDER_EMAIL)) return; // race guard
  accounts.push({
    id: crypto.randomUUID(),
    email: FOUNDER_EMAIL, emailLower: FOUNDER_EMAIL,
    username: FOUNDER_USERNAME, usernameLower: FOUNDER_USERNAME,
    salt, hash, createdAt: Date.now(), founder: true,
  });
  persist();
  console.log('[auth] founder account seeded from FOUNDER_PASSWORD.');
}
seedFounder().catch((e) => console.error('[auth] founder seed failed:', e.message));

// --- exports -----------------------------------------------------------------
// The founder's account id (for seeding the first presence), or null.
export function founderUid() {
  const u = accounts.find((a) => a.founder);
  return u ? u.id : null;
}

// The signed-in user (safe fields) for a request, or null.
export function sessionUser(req) {
  const uid = verifySession(parseCookies(req)[COOKIE]);
  if (!uid) return null;
  const u = accounts.find((a) => a.id === uid);
  return u ? publicUser(u) : null;
}

// Handle every /api/auth/* route. Returns true once it has responded.
// afterSignup(user) lets the caller give each new account its AI presence
// without auth.mjs importing presences.mjs (which would be a circular import).

// ===========================================================================
// SIGN IN WITH GOOGLE / APPLE
// ---------------------------------------------------------------------------
// Zero dependency: node:crypto signs Apple's ES256 client secret, and the ID
// token is read from the provider's TOKEN ENDPOINT over TLS — the one case
// where both Google and Apple document that a client may trust the token
// without re-verifying its signature, because the channel already
// authenticated the issuer. Everything else is checked by hand: aud, iss, exp,
// and the nonce we planted.
//
// Providers appear in the UI only when their env vars are set, so the entrance
// never offers a button that cannot work:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (.p8 text)
//   OAUTH_REDIRECT_BASE (optional; otherwise derived from the request)
// ===========================================================================
const OAUTH_STATE_COOKIE = 'orion_oauth';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function oauthProviders() {
  return {
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID
      && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
  };
}

const b64url = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

function originOf(req) {
  const env = process.env.OAUTH_REDIRECT_BASE;
  if (env) return env.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}
const redirectUri = (req, provider) => `${originOf(req)}/api/auth/oauth/${provider}/callback`;

// The state cookie is signed with the session secret, so a forged callback
// cannot invent its own state/nonce pair.
function signState(payload) {
  const body = b64url(payload);
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function readState(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
// Apple answers with a cross-site form POST, which never carries a Lax cookie.
function stateCookie(value, maxAge, secure, crossSite) {
  const a = [`${OAUTH_STATE_COOKIE}=${value}`, 'HttpOnly', 'Path=/', `Max-Age=${maxAge}`];
  a.push(crossSite && secure ? 'SameSite=None' : 'SameSite=Lax');
  if (secure) a.push('Secure');
  return a.join('; ');
}

function appleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url({ alg: 'ES256', kid: process.env.APPLE_KEY_ID, typ: 'JWT' })}.`
    + b64url({
      iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 3000,
      aud: 'https://appleid.apple.com', sub: process.env.APPLE_CLIENT_ID,
    });
  const key = crypto.createPrivateKey(String(process.env.APPLE_PRIVATE_KEY).replace(/\\n/g, '\n'));
  const sig = crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${sig.toString('base64url')}`;
}

function idTokenClaims(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}

const PROVIDER = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    iss: ['https://accounts.google.com', 'accounts.google.com'],
    scope: 'openid email profile',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.GOOGLE_CLIENT_SECRET,
    extra: {},
  },
  apple: {
    authorize: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    iss: ['https://appleid.apple.com'],
    scope: 'name email',
    clientId: () => process.env.APPLE_CLIENT_ID,
    secret: () => appleClientSecret(),
    extra: { response_mode: 'form_post' },
  },
};

function usernameFromEmail(email, provider) {
  let base = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (base.length < 3) base = `${provider}${crypto.randomInt(1000, 9999)}`;
  base = base.slice(0, 20);
  // never hand out the founder's name, and never collide
  let candidate = base === FOUNDER_USERNAME ? `${base}_` : base;
  let n = 0;
  while (accounts.some((a) => a.usernameLower === candidate)) {
    n += 1;
    candidate = `${base.slice(0, 20 - String(n).length)}${n}`;
  }
  return candidate;
}

// Find the account this identity belongs to, or make one. Linking by email is
// only allowed when the PROVIDER says the address is verified — otherwise a
// third party could claim someone else's account by asserting their address.
function accountForOAuth({ provider, sub, email, emailVerified }) {
  const linked = accounts.find((a) => a.oauth && a.oauth[provider] === sub);
  if (linked) return { user: linked };
  const emailLower = String(email || '').trim().toLowerCase();
  if (emailLower && emailVerified) {
    const existing = accounts.find((a) => a.emailLower === emailLower);
    if (existing) {
      existing.oauth = { ...(existing.oauth || {}), [provider]: sub };
      persist();
      return { user: existing };
    }
  }
  if (!emailLower || !emailVerified) return { error: 'That account did not share a verified email.' };
  if (accounts.length >= MAX_ACCOUNTS_TOTAL) return { error: 'Signups are closed for now.' };
  const username = usernameFromEmail(emailLower, provider);
  const user = {
    id: crypto.randomUUID(),
    email: String(email).trim(), emailLower,
    username, usernameLower: username,
    oauth: { [provider]: sub },
    createdAt: Date.now(),
    founder: emailLower === FOUNDER_EMAIL,
  };
  accounts.push(user);
  persist();
  return { user, created: true };
}

async function exchangeCode(provider, code, req) {
  const p = PROVIDER[provider];
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: p.clientId(),
    client_secret: p.secret(),
    redirect_uri: redirectUri(req, provider),
  });
  const r = await fetch(p.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return { error: `provider rejected the sign-in (${r.status})` };
  const j = await r.json().catch(() => null);
  if (!j || !j.id_token) return { error: 'provider returned no identity token' };
  return { idToken: j.id_token };
}

export async function handleAuthRoute(req, res, reqPath, { json, readJsonBody, secure, afterSignup }) {
  if (req.method === 'GET' && reqPath === '/api/auth/me') {
    return json(200, { user: sessionUser(req) }), true;
  }
  if (req.method === 'POST' && reqPath === '/api/auth/logout') {
    res.setHeader('Set-Cookie', cookieAttrs('', 0, secure));
    return json(200, { ok: true }), true;
  }
  if (req.method === 'POST' && (reqPath === '/api/auth/signup' || reqPath === '/api/auth/login')) {
    let body;
    try { body = await readJsonBody(req, 8 * 1024); } catch { return json(400, { error: 'bad request' }), true; }
    // Rightmost X-Forwarded-For entry = the edge-appended client IP (leftmost is spoofable).
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = (xff.length ? xff[xff.length - 1] : req.socket.remoteAddress) || 'unknown';
    const r = reqPath.endsWith('signup') ? await signup(body, ip) : await login(body);
    if (r.error) return json(r.status, { error: r.error }), true;
    // Give a brand-new account its one AI presence immediately (idempotent).
    if (reqPath.endsWith('signup')) { try { afterSignup?.(publicUser(r.user)); } catch { /* self-heals on first home load */ } }
    res.setHeader('Set-Cookie', cookieAttrs(signSession(r.user.id), Math.floor(SESSION_TTL_MS / 1000), secure));
    return json(200, { user: publicUser(r.user) }), true;
  }
  // --- which buttons the entrance may show ---------------------------------
  if (req.method === 'GET' && reqPath === '/api/auth/providers') {
    return json(200, oauthProviders()), true;
  }

  // --- start: hand the person to Google/Apple -------------------------------
  const start = reqPath.match(/^\/api\/auth\/oauth\/(google|apple)\/start$/);
  if (req.method === 'GET' && start) {
    const provider = start[1];
    if (!oauthProviders()[provider]) return json(404, { error: 'not configured' }), true;
    const p = PROVIDER[provider];
    const state = crypto.randomBytes(16).toString('base64url');
    const nonce = crypto.randomBytes(16).toString('base64url');
    res.setHeader('Set-Cookie', stateCookie(
      signState({ provider, state, nonce, exp: Date.now() + OAUTH_STATE_TTL_MS }),
      Math.floor(OAUTH_STATE_TTL_MS / 1000), secure, provider === 'apple'));
    const url = new URL(p.authorize);
    url.searchParams.set('client_id', p.clientId());
    url.searchParams.set('redirect_uri', redirectUri(req, provider));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', p.scope);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    for (const [k, v] of Object.entries(p.extra)) url.searchParams.set(k, v);
    res.writeHead(302, { Location: url.toString() });
    res.end();
    return true;
  }

  // --- callback: Google comes back by GET, Apple by cross-site form POST -----
  const cb = reqPath.match(/^\/api\/auth\/oauth\/(google|apple)\/callback$/);
  if (cb && (req.method === 'GET' || req.method === 'POST')) {
    const provider = cb[1];
    const done = (msg) => {
      // clear the state cookie either way
      res.setHeader('Set-Cookie', [stateCookie('', 0, secure, provider === 'apple'),
        ...(res.getHeader('Set-Cookie') ? [].concat(res.getHeader('Set-Cookie')) : [])]);
      res.writeHead(302, { Location: msg ? `/?auth_error=${encodeURIComponent(msg)}` : '/' });
      res.end();
      return true;
    };
    if (!oauthProviders()[provider]) return done('That sign-in is not available.');
    let params;
    if (req.method === 'GET') {
      params = new URL(req.url, 'http://x').searchParams;
    } else {
      let raw = '';
      try {
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 16 * 1024) return done('Sign-in response too large.');
        }
      } catch { return done('Sign-in was interrupted.'); }
      params = new URLSearchParams(raw);
    }
    const saved = readState(parseCookies(req)[OAUTH_STATE_COOKIE]);
    if (!saved || saved.provider !== provider) return done('Sign-in expired — try again.');
    const gotState = params.get('state');
    if (!gotState || gotState.length !== saved.state.length
      || !crypto.timingSafeEqual(Buffer.from(gotState), Buffer.from(saved.state))) {
      return done('Sign-in could not be verified.');
    }
    const code = params.get('code');
    if (!code) return done(params.get('error') === 'user_cancelled_authorize' ? '' : 'Sign-in was cancelled.');
    const ex = await exchangeCode(provider, code, req).catch(() => ({ error: 'provider unreachable' }));
    if (ex.error) return done(ex.error);
    const claims = idTokenClaims(ex.idToken);
    const p = PROVIDER[provider];
    if (!claims) return done('Sign-in could not be read.');
    if (claims.aud !== p.clientId()) return done('Sign-in was for a different app.');
    if (!p.iss.includes(String(claims.iss))) return done('Sign-in came from the wrong issuer.');
    if (!(Number(claims.exp) * 1000 > Date.now())) return done('Sign-in expired — try again.');
    if (claims.nonce !== saved.nonce) return done('Sign-in could not be verified.');
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    const r = accountForOAuth({ provider, sub: String(claims.sub), email: claims.email, emailVerified: verified });
    if (r.error) return done(r.error);
    if (r.created) { try { afterSignup?.(publicUser(r.user)); } catch { /* self-heals on first home load */ } }
    res.setHeader('Set-Cookie', [
      stateCookie('', 0, secure, provider === 'apple'),
      cookieAttrs(signSession(r.user.id), Math.floor(SESSION_TTL_MS / 1000), secure),
    ]);
    res.writeHead(302, { Location: '/' });
    res.end();
    return true;
  }

  return json(404, { error: 'not found' }), true;
}
