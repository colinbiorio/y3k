// life-publish.mjs — A LIFE, PUBLISHED. Server-only (every root .mjs is
// refused by the static server).
//
// Colin, 2026-10-24: "if it's possible to make life viewable from web enable
// that as well". A life (lucid) is lived on one computer: Claude on the
// person's own sign-in, inside a world dreamed there. Until now the only
// window onto it was a page on that same computer, through y3kode. Now the
// life can publish itself: each moment, the living process posts what it saw,
// thought, said and did, and the picture, to this site with a key that stands
// for the account (`live.py publish --to <site> --key <key>`), and the life
// page shows the newest moment from anywhere — a phone on the train — with no
// engine, no download. Words typed to it on the page are kept here for the
// life to hear at its next moment (the inbox).
//
// WHAT IS KEPT, PER ACCOUNT, UNDER DATA_DIR/life/<uid>/: latest.json (the
// newest moment), journal.jsonl (one line per moment, no pictures, bounded),
// frames/<n>.jpg (the newest KEEP.frames pictures), inbox.jsonl (lines said
// from the web, taken by the life when it asks, bounded). The key is kept
// only as its SHA-256 (DATA_DIR/.life-keys.json), like a password: a copy of
// this file cannot publish as anyone. One key per account; making a new one
// retires the old. `shared` on the same record says whether anyone may watch
// (by username); until it is set, only the account sees its own life.
//
// BOUNDED EVERYTHING: strings are clipped to what a moment needs, a picture is
// a JPEG of at most FRAME_MAX bytes (checked by its first bytes, not its
// name), frames and journal lines beyond the keep are dropped oldest first,
// and the inbox holds a few dozen lines. Writes are tmp+rename.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const DIR = join(DATA_DIR, 'life');
const KEYS = join(DATA_DIR, '.life-keys.json');
export const FRAME_MAX = 400 * 1024;
export const KEEP = { frames: 240, journal: 2000, inbox: 40 };   // tests shrink these
const CLIP = { sees: 400, thought: 2000, say: 500, scene: 300, intention: 300, place: 120, status: 80, action: 40, mode: 12, who: 8 };

const atomic = (file, text) => { const tmp = file + '.tmp'; writeFileSync(tmp, text); renameSync(tmp, file); };
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const safeUid = (uid) => typeof uid === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(uid) ? uid : null;
const dirOf = (uid) => join(DIR, uid);
const hashOf = (key) => createHash('sha256').update(String(key)).digest('hex');

// ---- keys -------------------------------------------------------------------
function keys() { return readJson(KEYS, {}); }
function saveKeys(k) { mkdirSync(DATA_DIR, { recursive: true }); atomic(KEYS, JSON.stringify(k)); }

/** A new key for this account; the old one, if any, stops working. The key itself is returned once and never kept. */
export function makeKey(uid) {
  uid = safeUid(uid); if (!uid) throw new Error('bad uid');
  const key = 'y3kl_' + randomBytes(24).toString('hex');
  const k = keys();
  k[uid] = { ...(k[uid] || {}), hash: hashOf(key), made: Date.now() };
  saveKeys(k);
  return key;
}
export function hasKey(uid) { uid = safeUid(uid); return !!(uid && keys()[uid]?.hash); }
/** The account a key stands for, or null. Compared in constant time, each. */
export function uidOf(key) {
  if (typeof key !== 'string' || !key.startsWith('y3kl_') || key.length > 80) return null;
  const want = Buffer.from(hashOf(key), 'hex');
  for (const [uid, rec] of Object.entries(keys())) {
    if (!rec?.hash) continue;
    const have = Buffer.from(String(rec.hash), 'hex');
    if (have.length === want.length && timingSafeEqual(have, want)) return uid;
  }
  return null;
}
export function setShared(uid, shared) {
  uid = safeUid(uid); if (!uid) return false;
  const k = keys(); k[uid] = { ...(k[uid] || {}), shared: !!shared }; saveKeys(k);
  return !!shared;
}
export function isShared(uid) { uid = safeUid(uid); return !!(uid && keys()[uid]?.shared); }

// ---- moments ------------------------------------------------------------------
const clip = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, n) : '');
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/** One moment, as the living process posts it. → { ok, n, frame } | { ok: false, error } */
export function publish(uid, body) {
  uid = safeUid(uid); if (!uid) return { ok: false, error: 'bad uid' };
  if (!body || typeof body !== 'object') return { ok: false, error: 'a moment is an object' };
  const n = Number.isInteger(body.n) && body.n >= 0 && body.n < 1e9 ? body.n : null;
  if (n === null) return { ok: false, error: 'n is the moment\'s number' };
  const moment = { n };
  for (const [k, max] of Object.entries(CLIP)) moment[k] = clip(body[k], max);
  if (!['claude', 'me', 'nobody'].includes(moment.who)) moment.who = 'claude';
  moment.pace = Number.isFinite(Number(body.pace)) ? Math.max(0, Math.min(3600, Number(body.pace))) : null;
  moment.busy = !!body.busy;
  const dir = dirOf(uid), frames = join(dir, 'frames');
  mkdirSync(frames, { recursive: true });
  let frame = false;
  if (typeof body.frame === 'string' && body.frame) {
    if (body.frame.length > FRAME_MAX * 1.4) return { ok: false, error: 'the picture is too big' };
    let buf;
    try { buf = Buffer.from(body.frame, 'base64'); } catch { buf = null; }
    if (!buf || buf.length < 4 || buf.length > FRAME_MAX || !buf.subarray(0, 3).equals(JPEG)) return { ok: false, error: 'the picture is not a JPEG under the limit' };
    atomic(join(frames, `${String(n).padStart(6, '0')}.jpg`), buf);
    frame = true;
    prune(frames, KEEP.frames);
  }
  const prev = readJson(join(dir, 'latest.json'), null);
  const frameN = frame ? n : (prev && Number.isInteger(prev.frameN) && existsSync(join(frames, `${String(prev.frameN).padStart(6, '0')}.jpg`)) ? prev.frameN : null);
  const latest = { ...moment, at: Date.now(), frameN };
  atomic(join(dir, 'latest.json'), JSON.stringify(latest));
  if (!prev || prev.n !== n) {
    const line = JSON.stringify({ ...moment, at: latest.at });
    const file = join(dir, 'journal.jsonl');
    writeFileSync(file, line + '\n', { flag: 'a' });
    trim(file, KEEP.journal);
  }
  return { ok: true, n, frame };
}

// the newest `keep` pictures stay; names sort as numbers (zero-padded)
function prune(frames, keep) {
  let names;
  try { names = readdirSync(frames).filter((f) => /^\d{6}\.jpg$/.test(f)).sort(); } catch { return; }
  for (const f of names.slice(0, Math.max(0, names.length - keep))) { try { unlinkSync(join(frames, f)); } catch { /* gone */ } }
}
// a line file kept to `keep` lines, rewritten only once it is a tenth over
function trim(file, keep) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return; }
  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= keep * 1.1) return;
  atomic(file, lines.slice(-keep).join('\n') + '\n');
}

/** The newest moment of this account's life, with where its picture is, or null. */
export function latest(uid) {
  uid = safeUid(uid); if (!uid) return null;
  const l = readJson(join(dirOf(uid), 'latest.json'), null);
  if (!l) return null;
  return { ...l, frameUrl: Number.isInteger(l.frameN) ? `${String(l.frameN).padStart(6, '0')}.jpg` : null };
}
/** The last `count` moments, oldest first (no pictures). */
export function recent(uid, count = 20) {
  uid = safeUid(uid); if (!uid) return [];
  let text; try { text = readFileSync(join(dirOf(uid), 'journal.jsonl'), 'utf8'); } catch { return []; }
  return text.split('\n').filter(Boolean).slice(-Math.max(1, Math.min(200, count | 0))).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
/** The bytes of picture `n`, or null. */
export function frame(uid, n) {
  uid = safeUid(uid); if (!uid || !/^\d{1,9}$/.test(String(n))) return null;
  try { return readFileSync(join(dirOf(uid), 'frames', `${String(Number(n)).padStart(6, '0')}.jpg`)); } catch { return null; }
}

// ---- the inbox: words from the web, for the life to hear ----------------------
export function say(uid, from, text) {
  uid = safeUid(uid); if (!uid) return false;
  text = clip(text, 500).trim(); if (!text) return false;
  mkdirSync(dirOf(uid), { recursive: true });
  const file = join(dirOf(uid), 'inbox.jsonl');
  writeFileSync(file, JSON.stringify({ at: Date.now(), from: clip(from, 40), text }) + '\n', { flag: 'a' });
  trim(file, KEEP.inbox);
  return true;
}
/** Everything said since the life last asked; the inbox is emptied. */
export function takeInbox(uid) {
  uid = safeUid(uid); if (!uid) return [];
  const file = join(dirOf(uid), 'inbox.jsonl');
  let text; try { text = readFileSync(file, 'utf8'); } catch { return []; }
  try { unlinkSync(file); } catch { /* raced */ }
  return text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).slice(-KEEP.inbox);
}

// Whether the site is showing this life to someone, lately: a signal for the
// living process (it slows to a moment a minute while nobody looks), carried
// in the inbox's answer. In memory: it is not a record.
const watchedAt = new Map();
export function touchWatched(uid) { uid = safeUid(uid); if (uid) watchedAt.set(uid, Date.now()); }
export function watched(uid, within = 60_000, now = Date.now()) { uid = safeUid(uid); return !!uid && now - (watchedAt.get(uid) || 0) < within; }

/** An account closed: its life, its key, everything. */
export function forget(uid) {
  uid = safeUid(uid); if (!uid) return;
  try { rmSync(dirOf(uid), { recursive: true, force: true }); } catch { /* none */ }
  const k = keys(); if (k[uid]) { delete k[uid]; saveKeys(k); }
}
