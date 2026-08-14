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
  u.bio = String(bio || '').replace(/\s+/g, ' ').trim().slice(0, 200);
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
  return json(404, { error: 'not found' }), true;
}
