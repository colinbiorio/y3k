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
// needsTerms is how the app knows to ask before it opens: it is true for an
// account created through Google or Apple (nobody could be asked mid-redirect)
// and for any account that predates our asking at all.
const publicUser = (u) => ({
  id: u.id, username: u.username, email: u.email, founder: !!u.founder, bio: u.bio || '',
  needsTerms: u.age17 !== true,
});

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
  // AGE, DECLARED. This place carries other people's writing and a mind that
  // answers in its own words, and neither is for children: the App Store rates
  // it 17+, and COPPA means an under-13 account must never be opened here at
  // all. We ask rather than infer — a declared age is the mechanism App Review
  // 1.2.1(a) and 4.7.5 ask for — and the answer is kept so the record shows it
  // was asked.
  if (body.age17 !== true) return { status: 400, error: 'You must confirm you are 17 or older.' };
  if (body.terms !== true) return { status: 400, error: 'You must accept the terms and privacy policy.' };
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
    age17: true,                 // declared at signup; see the note above
    termsAt: Date.now(),         // when they accepted, for the record
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
    age17: true, termsAt: Date.now(),   // the founder is not a stranger at the door
    salt, hash, createdAt: Date.now(), founder: true,
  });
  persist();
  console.log('[auth] founder account seeded from FOUNDER_PASSWORD.');
}
seedFounder().catch((e) => console.error('[auth] founder seed failed:', e.message));

// A rule that hides a thing you configured has to say so somewhere a person
// will actually look.
{
  const d = oauthDiagnosis(null);
  if (d.ready.google && !d.ready.apple) {
    console.warn('[auth] Google sign-in is live and Sign in with Apple is not. That is fine for the website — but App Review 4.8 blocks an App Store submission until Apple is configured too (APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY), or Google is removed. See APPSTORE.md.');
  }
}

// --- exports -----------------------------------------------------------------
// The founder's account id (for seeding the first presence), or null.
// SAYING YES, ONCE. An account made through Google or Apple is created in the
// middle of a redirect, where there is nowhere to put a question — and accounts
// made before we asked at all were never asked either. Both arrive here with
// age17 unset, the app holds the door shut (needsTerms), and this is where the
// answer lands. Only a real "yes" to both counts; anything else leaves the
// account exactly as it was, still shut out, free to sign out instead.
export function acceptTerms(uid, { age17, terms } = {}) {
  const u = accounts.find((a) => a.id === uid);
  if (!u) return { error: 'no such account' };
  if (age17 !== true || terms !== true) return { error: 'both are needed' };
  u.age17 = true;
  u.termsAt = Date.now();
  persist();
  return { ok: true, user: publicUser(u) };
}

// Is this account allowed past the door yet? Write paths ask before they act,
// so a client that skips the card still cannot post, comment, or wake a mind.
export function hasAgreed(uid) {
  const u = accounts.find((a) => a.id === (uid && uid.id ? uid.id : uid));
  return !!u && u.age17 === true;
}

// THE DOOR TO A ONE-WAY ACT. Closing an account cannot be undone, so the
// person at the keyboard has to prove they are the account holder and not
// someone who found an unlocked laptop: the password, or for an account that
// signs in with Google or Apple (and so has no password here), typing their
// own username exactly.
// It takes an ID and finds the real record itself, deliberately: what callers
// hold is sessionUser's PUBLIC projection, which carries no salt and no hash.
// Handed that, the password branch is invisible and every check silently falls
// through to the username branch — which is how the right password was refused
// while an empty string very nearly wasn't.
export async function confirmIdentity(uid, { password, username } = {}) {
  const u = accounts.find((a) => a.id === (uid && uid.id ? uid.id : uid));
  if (!u) return false;
  if (u.hash && u.salt) return verifyPassword(String(password || ''), u.salt, u.hash);
  const said = String(username || '').trim().toLowerCase();
  return !!said && said === u.usernameLower;
}

// The Set-Cookie that ends a session, for callers outside this module.
export function clearSessionCookie(secure) { return cookieAttrs('', 0, secure); }

// CLOSING AN ACCOUNT. This removes the account record itself; every other
// store is told separately (server.mjs orchestrates, so no store needs to know
// about any other). A signed session cookie for a removed account resolves to
// nobody on the next request, so the sessions die with it.
//
// The founder's account is refused deliberately: it holds the moderation queue
// and the seeded presence, and a misclick should not take the house's own
// hands off the wheel.
export function deleteAccount(uid) {
  const i = accounts.findIndex((a) => a.id === uid);
  if (i < 0) return { error: 'no such account' };
  if (accounts[i].founder) return { error: 'the founder account cannot be closed from here' };
  accounts.splice(i, 1);
  persist();
  return { ok: true };
}

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

// EACH DOOR STANDS ON ITS OWN. This used to hide Google whenever Sign in with
// Apple was unconfigured, enforcing App Review 4.8 — which asks an app offering
// a third-party login to also offer one that keeps an email private — by making
// a Google-only deploy impossible.
//
// That was the wrong place for the rule. 4.8 binds an app in the App Store, and
// there is no app: y3k is a website, and on a website a working Google sign-in
// hidden by a rule about a submission that does not exist is simply a feature
// nobody can use. Worse, it failed silently — set Google up, see nothing.
//
// So the rule moves to where it belongs: a loud warning here, and a blocking
// line in the pre-submission checklist (APPSTORE.md §2). Sign in with Apple
// must be live BEFORE anything is submitted, or Google comes out. Until then,
// whatever is configured is offered.
export function oauthProviders() {
  const google = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const apple = !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID
    && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
  return { google, apple };
}

// WHY THERE IS NO BUTTON. The rule above is right and silent, which is a bad
// pair: set Google up and nothing appears, with no way to tell a missing
// variable from a rule doing its job. So the house can ask. Booleans only —
// which variables EXIST, never a character of what is in them.
export function oauthDiagnosis(req) {
  const has = (k) => !!String(process.env[k] || '').trim();
  const google = { GOOGLE_CLIENT_ID: has('GOOGLE_CLIENT_ID'), GOOGLE_CLIENT_SECRET: has('GOOGLE_CLIENT_SECRET') };
  const apple = {
    APPLE_CLIENT_ID: has('APPLE_CLIENT_ID'), APPLE_TEAM_ID: has('APPLE_TEAM_ID'),
    APPLE_KEY_ID: has('APPLE_KEY_ID'), APPLE_PRIVATE_KEY: has('APPLE_PRIVATE_KEY'),
  };
  const googleReady = Object.values(google).every(Boolean);
  const appleReady = Object.values(apple).every(Boolean);
  const offered = oauthProviders();
  let why = null;
  if (!googleReady && !appleReady) why = 'Neither is configured, so the entrance offers neither.';
  else if (googleReady && !appleReady) {
    why = 'Google is offered. Apple is not configured — fine for the website, but Sign in with '
      + 'Apple must be live before this is submitted to the App Store (App Review 4.8), or Google '
      + 'has to come out of the build.';
  } else if (!googleReady && appleReady) why = 'Apple is offered; Google is not configured.';
  else why = 'Both are offered.';
  return {
    offered,
    present: { google, apple },
    ready: { google: googleReady, apple: appleReady },
    why,
    // what a console must be told, character for character
    redirectBase: process.env.OAUTH_REDIRECT_BASE || '(unset — derived from the request headers)',
    redirectUris: req ? {
      google: redirectUri(req, 'google'),
      apple: redirectUri(req, 'apple'),
    } : null,
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
    // NOT asked: an OAuth account is created mid-redirect, where there is
    // nowhere to put the question. null is the honest record of "we have not
    // asked this person yet" — never true by default. Before Google or Apple
    // sign-in is turned on, the app must ask on first entry whenever this is
    // not true (see APPSTORE.md).
    age17: null,
    termsAt: null,
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
  if (req.method === 'POST' && reqPath === '/api/auth/agree') {
    const me = sessionUser(req);
    if (!me) return json(401, { error: 'sign in first' }), true;
    let body;
    try { body = await readJsonBody(req, 2 * 1024); } catch { return json(400, { error: 'bad request' }), true; }
    const r = acceptTerms(me.id, body);
    return json(r.error ? 400 : 200, r), true;
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
    // the founder gets the reason as well as the answer
    const me = sessionUser(req);
    if (me && me.founder) return json(200, { ...oauthProviders(), diagnosis: oauthDiagnosis(req) }), true;
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
