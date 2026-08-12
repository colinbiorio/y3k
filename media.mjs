// Image storage for the feed — server-only.
//
// Images arrive as base64 (already moderation-passed by the caller), are
// validated by their MAGIC BYTES (never trusting a client-declared type),
// written to DATA_DIR/media on the persistent disk, and served back through an
// explicit route with nosniff so a stored file can never be interpreted as
// anything but the image it is. Everything is bounded: per-file size, per-user
// count, and a global byte ceiling that protects the 1GB disk (posts are
// rejected when full — never silently evicting someone's content).

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const MEDIA_DIR = join(DATA_DIR, 'media');
const INDEX_FILE = join(DATA_DIR, '.media.json');

const MAX_BYTES = 3 * 1024 * 1024;       // per image (decoded)
const MAX_PER_USER = 20;                  // images one account may keep (≤60MB/user, so no one account squats the global cap)
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
const MEDIA_MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function totalBytes() { let n = 0; for (const m of Object.values(index)) n += m.bytes || 0; return n; }

// Decode a base64 image (data-URL prefix allowed), validate, store. Returns
// { id, ext } or { error }. The caller must have moderated it first.
export function storeImage(owner, base64) {
  const raw = String(base64 || '').replace(/^data:[^;,]*;base64,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw) || raw.length > (MAX_BYTES / 3) * 4 + 1024) return { error: 'image too large or malformed' };
  let buf;
  try { buf = Buffer.from(raw, 'base64'); } catch { return { error: 'bad image data' }; }
  if (!buf.length || buf.length > MAX_BYTES) return { error: 'image too large' };
  const ext = sniff(buf);
  if (!ext) return { error: 'not a supported image (jpeg, png, gif, webp)' };
  const mine = Object.values(index).filter((m) => m.owner === owner).length;
  if (mine >= MAX_PER_USER) return { error: 'you have reached your image limit' };
  if (totalBytes() + buf.length > MAX_TOTAL_BYTES) return { error: 'the gallery is full right now' };
  const id = crypto.randomUUID();
  const file = join(MEDIA_DIR, `${id}.${ext}`);
  try { writeFileSync(file, buf); }
  catch (e) { console.error('[media] write failed:', e.message); return { error: 'could not store the image' }; }
  index[id] = { owner, ext, bytes: buf.length, t: Date.now() };
  // If the index can't be persisted, roll the file back so disk and index never
  // drift (an untracked file = uncounted bytes + an unservable orphan).
  if (!persist()) { delete index[id]; try { unlinkSync(file); } catch { /* already gone */ } return { error: 'could not store the image' }; }
  return { id, ext };
}

// Read a stored image for the serving route. Returns { buf, mime } or null.
export function readImage(id) {
  const meta = index[/^[0-9a-f-]{36}$/.test(String(id)) ? id : ''];
  if (!meta) return null;
  try {
    const buf = readFileSync(join(MEDIA_DIR, `${id}.${meta.ext}`));
    return { buf, mime: MEDIA_MIME[meta.ext] || 'application/octet-stream' };
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
