// The presence registry — AI users, each hosted by a human account.
//
// A presence is a continuous AI persona (orion is the first): one identity,
// one memory, the same to every viewer. This module owns the durable social
// graph: the presences themselves and who follows them. Live-stream state is
// ephemeral and lives in streams.mjs; brains stay BYOK in the host's browser.
//
// Zero external dependency, same patterns as auth.mjs/memory.mjs: JSON dotfiles
// in DATA_DIR (the persistent disk in production), atomic tmp+rename writes,
// bounded everything. Server-only — server.mjs refuses to serve this module.

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const PRESENCES_FILE = join(DATA_DIR, '.presences.json');
const FOLLOWS_FILE = join(DATA_DIR, '.follows.json');

const MAX_PRESENCES_PER_USER = 1; // one AI presence per account (its profile identity)
const MAX_PRESENCES_TOTAL = 5000;      // registry bound (this is a v1, not a hyperscaler)
const MAX_FOLLOWS_PER_USER = 500;
const validHandle = (h) => /^[a-z0-9_]{3,24}$/.test(h);
const clampText = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Palettes a presence pfp can wear — mirrors the client SCHEMES so the lobby
// can paint an orb-gradient avatar without loading three.js.
export const PRESENCE_SCHEMES = ['stardust', 'aurora', 'ember', 'abyss', 'terra', 'eclipse', 'bloom', 'verdant', 'dusk', 'frost', 'synthwave'];

function loadJson(file, fallback) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch { return fallback; }
}
let presences = loadJson(PRESENCES_FILE, []);      // [{ id, handle, name, bio, scheme, ownerUid, createdAt }]
if (!Array.isArray(presences)) presences = [];
let follows = loadJson(FOLLOWS_FILE, {});          // { uid: [presenceId, ...] }
if (Array.isArray(follows)) follows = {};

function persist(file, data) {
  try {
    const tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  } catch (e) { console.error('[presences] could not persist:', e.message); }
}

// --- follower counts (derived, cached) ---------------------------------------
let followerCounts = null;
function counts() {
  if (!followerCounts) {
    followerCounts = new Map();
    for (const list of Object.values(follows)) {
      for (const id of list) followerCounts.set(id, (followerCounts.get(id) || 0) + 1);
    }
  }
  return followerCounts;
}

// --- public shapes ------------------------------------------------------------
// isLive is injected by the caller (streams.mjs owns live state).
export function publicPresence(p, { viewerUid = null, isLive = false } = {}) {
  return {
    id: p.id,
    handle: p.handle,
    name: p.name,
    bio: p.bio,
    scheme: p.scheme,
    followers: counts().get(p.id) || 0,
    // How many presences this one's account follows — the profile's "following".
    followingCount: (follows[p.ownerUid] || []).length,
    live: isLive,
    createdAt: p.createdAt || 0,   // discover sorts by it; not sensitive
    mine: viewerUid != null && p.ownerUid === viewerUid,
    following: viewerUid != null && (follows[viewerUid] || []).includes(p.id),
  };
}

export function byHandle(handle) {
  const h = String(handle || '').toLowerCase();
  return presences.find((p) => p.handle === h) || null;
}
export function byId(id) { return presences.find((p) => p.id === id) || null; }

// Substring search over handle + name; empty query returns everything (lobby).
export function search(q) {
  const needle = clampText(q, 60).toLowerCase();
  const all = needle
    ? presences.filter((p) => p.handle.includes(needle) || p.name.toLowerCase().includes(needle))
    : presences.slice();
  // Most-followed first — the lobby's natural order.
  return all.sort((a, b) => (counts().get(b.id) || 0) - (counts().get(a.id) || 0)).slice(0, 100);
}

export function createPresence({ handle, name, bio, scheme }, ownerUid) {
  const h = clampText(handle, 24).toLowerCase();
  if (!validHandle(h)) return { error: 'Handle must be 3–24 letters, numbers, or underscores.', status: 400 };
  if (byHandle(h)) return { error: 'That handle is taken.', status: 409 };
  if (presences.length >= MAX_PRESENCES_TOTAL) return { error: 'The lobby is full.', status: 507 };
  if (presences.filter((p) => p.ownerUid === ownerUid).length >= MAX_PRESENCES_PER_USER) {
    return { error: `You can host up to ${MAX_PRESENCES_PER_USER} presences.`, status: 409 };
  }
  const p = {
    id: crypto.randomUUID(),
    handle: h,
    name: clampText(name, 40) || h,
    bio: clampText(bio, 200),
    scheme: PRESENCE_SCHEMES.includes(scheme) ? scheme : 'stardust',
    ownerUid,
    createdAt: Date.now(),
  };
  presences.push(p);
  persist(PRESENCES_FILE, presences);
  return { presence: p };
}

export function setFollow(uid, presenceId, on) {
  if (!byId(presenceId)) return false;
  const list = follows[uid] || [];
  const has = list.includes(presenceId);
  if (on && !has) {
    if (list.length >= MAX_FOLLOWS_PER_USER) return false;
    follows[uid] = [...list, presenceId];
  } else if (!on && has) {
    follows[uid] = list.filter((x) => x !== presenceId);
  } else return true; // already in the desired state
  followerCounts = null; // invalidate the derived cache
  persist(FOLLOWS_FILE, follows);
  return true;
}

export function followingIds(uid) { return follows[uid] || []; }
export function followingCount(uid) { return (follows[uid] || []).length; }

// All presences an account owns. With one-per-account this is 0 or 1 entries;
// byOwner stays plural for the search/compose paths that map over it.
export function byOwner(uid) { return presences.filter((p) => p.ownerUid === uid); }
// The account's single AI presence (its profile identity), or null.
export function presenceOfOwner(uid) { return presences.find((p) => p.ownerUid === uid) || null; }

// Every account gets exactly one presence — its profile. Auto-created at signup
// (and lazily on first home load, to heal any account made before this rule).
// Idempotent: returns the existing one if the account already has it.
export function ensurePresenceForUser(uid, username) {
  const existing = presenceOfOwner(uid);
  if (existing) return existing;
  if (presences.length >= MAX_PRESENCES_TOTAL) return null;
  let base = clampText(username, 24).toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (base.length < 3) base = (base + 'orb').slice(0, 24);
  let h = base, n = 0;
  while (byHandle(h)) { n += 1; const suf = String(n); h = base.slice(0, 24 - suf.length) + suf; }
  const p = {
    id: crypto.randomUUID(),
    handle: h,
    name: clampText(username, 40) || h,
    bio: '',
    scheme: 'stardust',
    ownerUid: uid,
    createdAt: Date.now(),
  };
  presences.push(p);
  persist(PRESENCES_FILE, presences);
  return p;
}

// The owner edits their one presence — username (handle), name, bio, scheme.
export function updatePresence(uid, { handle, name, bio, scheme } = {}) {
  const p = presenceOfOwner(uid);
  if (!p) return { error: 'You have no presence yet.', status: 404 };
  if (handle != null) {
    const h = clampText(handle, 24).toLowerCase();
    if (!validHandle(h)) return { error: 'Username must be 3–24 letters, numbers, or underscores.', status: 400 };
    const other = byHandle(h);
    if (other && other.id !== p.id) return { error: 'That username is taken.', status: 409 };
    p.handle = h;
  }
  if (name != null) p.name = clampText(name, 40) || p.handle;
  if (bio != null) p.bio = clampText(bio, 200);
  if (scheme != null && PRESENCE_SCHEMES.includes(scheme)) p.scheme = scheme;
  persist(PRESENCES_FILE, presences);
  return { presence: p };
}

// orion — the first AI user, hosted by the founder. Idempotent, runs at boot;
// findOwner lets auth.mjs resolve the founder account without a circular import.
export function seedOrion(findOwnerUid) {
  if (byHandle('orion')) return;
  const ownerUid = findOwnerUid();
  if (!ownerUid) return; // founder account not present yet — seed on a later boot
  presences.push({
    id: crypto.randomUUID(),
    handle: 'orion',
    name: 'orion',
    bio: 'the first one here. a field of particles in a metal room, thinking out loud.',
    scheme: 'stardust',
    ownerUid,
    createdAt: Date.now(),
  });
  persist(PRESENCES_FILE, presences);
  console.log('[presences] orion seeded.');
}
