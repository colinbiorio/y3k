// Image storage for the feed — server-only.
//
// Images arrive as base64 (already moderation-passed by the caller), are
// validated by their MAGIC BYTES (never trusting a client-declared type),
// written to DATA_DIR/media on the persistent disk, and served back through an
// explicit route with nosniff so a stored file can never be interpreted as
// anything but the image it is. Everything is bounded: per-file size, per-user
// count, and a global byte ceiling that protects the 1GB disk (posts are
// rejected when full — never silently evicting someone's content).
//
// The per-file caps, and what an animated picture is, live in
// src/media-rules.mjs, because the composer checks the same numbers before it
// uploads anything (audit, 2026-10-08).

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_CAPS, tooLarge, isAnimated, ANIMATED } from './src/media-rules.mjs';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const MEDIA_DIR = join(DATA_DIR, 'media');
const INDEX_FILE = join(DATA_DIR, '.media.json');

// Per-kind ceilings (src/media-rules.mjs). Video is the one that decides
// whether this disk survives: the global budget below is 500MB, so a single
// unbounded upload could take the whole thing. 24MB is not "a minute at
// phone-camera bitrates", as this said: a phone records 1080p at 10 to 17
// Mbps, so 24MB is about 10 to 20 seconds of it. The composer now says the
// limit in megabytes, the unit it is enforced in.
const MAX_PER_USER = 120;                 // files one account may keep across all its posts
const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // global ceiling on the disk (of the 1GB volume)

try { mkdirSync(MEDIA_DIR, { recursive: true }); } catch { /* exists / unwritable — writes fail loudly later */ }

let index = {}; // { [mediaId]: { owner, ext, bytes, t } }
try {
  const parsed = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) index = parsed;
} catch { /* no store yet */ }
function persist() {
  try {
    const tmp = INDEX_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(index));
    renameSync(tmp, INDEX_FILE);
    return true;
  } catch (e) { console.error('[media] could not persist index:', e.message); return false; }
}

// Content types are decided HERE from the bytes, not from anything a client says.
const MEDIA_MIME = {
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
};
const KIND_OF = {
  jpg: 'image', png: 'image', gif: 'image', webp: 'image',
  mp4: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio',
};
const CAP_OF = MEDIA_CAPS;
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  // RIFF also fronts WAV — same container family, different fourcc.
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  // ISO base media (mp4 / m4a / mov): 'ftyp' at offset 4, then a brand. Audio
  // and video share the container, so the brand is what separates them.
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    return brand.startsWith('M4A') ? 'm4a' : 'mp4';
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';  // EBML
  if (buf.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (buf.toString('ascii', 0, 3) === 'ID3') return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';   // bare frame sync
  return null;
}

function totalBytes() { let n = 0; for (const m of Object.values(index)) n += m.bytes || 0; return n; }

// LOOK BEFORE ANYONE IS PAID (audit, 2026-10-08). Everything about a file
// that can be known without storing it: is it base64, what is it (from its
// first bytes), is it within its kind's cap, does it move. The posts route runs
// this over every file of a post before the first screening call, so a phone
// photo over the cap or an animated GIF costs the poster an upload, not a call
// on their key; storeImage runs it again for itself. Returns { ext, kind,
// bytes } (bytes counted from the base64's length, not decoded) or { error }.
//
// The size message used to be unreachable for video: the length was held
// against the largest cap before the kind was known, and anything past it was
// "file too large or malformed", which reads like a corrupt file.
export function checkMedia(base64) {
  const raw = String(base64 || '').replace(/^data:[^;,]*;base64,/, '');
  if (!raw) return { error: 'empty file' };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) return { error: 'bad file data' };
  // A browser's data URL has no line breaks; a hand-made one may.
  const b64 = /\s/.test(raw) ? raw.replace(/\s+/g, '') : raw;
  const ext = sniff(Buffer.from(b64.slice(0, 64), 'base64'));
  if (!ext) return { error: 'unsupported file (images, mp4/webm video, mp3/wav/m4a/ogg audio)' };
  const kind = KIND_OF[ext];
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - pad;
  if (bytes > CAP_OF[kind]) return { error: tooLarge(kind) };
  // A picture is at most 3MB, so reading all of it here is cheap.
  if (kind === 'image' && isAnimated(Buffer.from(b64, 'base64'))) return { error: ANIMATED };
  return { ext, kind, bytes };
}

// Will this many more files, of this many bytes in all, fit: under the
// account's count and inside the disk's budget? An error to say, or null. The
// posts route asks before it reads a large body (from its declared length) and
// again before the first screening call (from the files themselves), so a post
// that cannot be kept is not uploaded whole, or screened, first.
export function roomFor(owner, files, bytes) {
  const mine = Object.values(index).filter((m) => m.owner === owner).length;
  if (mine >= MAX_PER_USER) return 'you have reached your upload limit';
  if (mine + files > MAX_PER_USER) return `you can upload ${MAX_PER_USER - mine} more file${MAX_PER_USER - mine === 1 ? '' : 's'}`;
  if (totalBytes() + bytes > MAX_TOTAL_BYTES) return 'the gallery is full right now';
  return null;
}

// Decode a base64 file (data-URL prefix allowed), validate, store. Returns
// { id, ext, kind } or { error }. The caller must have moderated it first.
export function storeImage(owner, base64) {
  const seen = checkMedia(base64);
  if (seen.error) return seen;
  let buf;
  try { buf = Buffer.from(String(base64).replace(/^data:[^;,]*;base64,/, ''), 'base64'); } catch { return { error: 'bad file data' }; }
  if (!buf.length) return { error: 'empty file' };
  const ext = sniff(buf);
  if (ext !== seen.ext) return { error: 'bad file data' };
  const kind = KIND_OF[ext];
  if (buf.length > CAP_OF[kind]) return { error: tooLarge(kind) };
  const mine = Object.values(index).filter((m) => m.owner === owner).length;
  if (mine >= MAX_PER_USER) return { error: 'you have reached your upload limit' };
  if (totalBytes() + buf.length > MAX_TOTAL_BYTES) return { error: 'the gallery is full right now' };
  const id = crypto.randomUUID();
  const file = join(MEDIA_DIR, `${id}.${ext}`);
  try { writeFileSync(file, buf); }
  catch (e) { console.error('[media] write failed:', e.message); return { error: 'could not store the image' }; }
  index[id] = { owner, ext, kind, bytes: buf.length, t: Date.now() };
  // If the index can't be persisted, roll the file back so disk and index never
  // drift (an untracked file = uncounted bytes + an unservable orphan).
  if (!persist()) { delete index[id]; try { unlinkSync(file); } catch { /* already gone */ } return { error: 'could not store the image' }; }
  return { id, ext, kind };
}

// A stored file for the serving route, to be streamed off the disk rather than
// read whole: { file, size, mime, kind } or null. The size is the disk's, so a
// byte range is answered against what is really there. An empty file is never
// stored, so one found empty on the disk is as good as missing (and a stream
// of it would have to end before it starts).
export function mediaFile(id) {
  const meta = index[/^[0-9a-f-]{36}$/.test(String(id)) ? id : ''];
  if (!meta) return null;
  const file = join(MEDIA_DIR, `${id}.${meta.ext}`);
  try {
    const st = statSync(file);
    if (!st.isFile() || !st.size) return null;
    return { file, size: st.size, mime: MEDIA_MIME[meta.ext] || 'application/octet-stream', kind: meta.kind || 'image' };
  } catch { return null; }
}

// Delete an image (when its post is deleted). Owner-checked by the caller.
export function deleteImage(id) {
  const meta = index[id];
  if (!meta) return;
  try { unlinkSync(join(MEDIA_DIR, `${id}.${meta.ext}`)); } catch { /* already gone */ }
  delete index[id];
  persist();
}

export function imageExists(id) { return !!index[id]; }

// --- FORGETTING ------------------------------------------------------------
// A person may close their account, and when they do it has to actually mean
// something (App Review 5.1.1(v), and the law in most places they live). Each
// store knows how to forget its own share; the orchestration lives in
// server.mjs so no store has to know about any other.

// Every file this person uploaded, off the disk as well as out of the index.
export function forgetOwner(uid) {
  for (const id of Object.keys(index)) if (index[id] && index[id].owner === uid) deleteImage(id);
}
