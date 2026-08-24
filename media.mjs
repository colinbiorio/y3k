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
// Per-kind ceilings. Video is the one that decides whether this disk survives:
// the global budget below is 500MB, so a single unbounded upload could take the
// whole thing. 24MB buys roughly a minute at phone-camera bitrates, which is
// the per-clip limit the composer enforces anyway.
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
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
const CAP_OF = { image: MAX_BYTES, audio: MAX_AUDIO_BYTES, video: MAX_VIDEO_BYTES };
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

// Decode a base64 image (data-URL prefix allowed), validate, store. Returns
// { id, ext } or { error }. The caller must have moderated it first.
export function storeImage(owner, base64) {
  const raw = String(base64 || '').replace(/^data:[^;,]*;base64,/, '');
  const ceiling = MAX_VIDEO_BYTES;   // the largest kind; the real cap is applied per-kind below
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw) || raw.length > (ceiling / 3) * 4 + 1024) return { error: 'file too large or malformed' };
  let buf;
  try { buf = Buffer.from(raw, 'base64'); } catch { return { error: 'bad file data' }; }
  if (!buf.length) return { error: 'empty file' };
  const ext = sniff(buf);
  if (!ext) return { error: 'unsupported file (images, mp4/webm video, mp3/wav/m4a/ogg audio)' };
  const kind = KIND_OF[ext];
  if (buf.length > CAP_OF[kind]) {
    return { error: kind === 'video' ? 'that video is too large — keep clips under a minute'
      : kind === 'audio' ? 'that audio file is too large' : 'image too large' };
  }
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

// Read a stored image for the serving route. Returns { buf, mime } or null.
export function readImage(id) {
  const meta = index[/^[0-9a-f-]{36}$/.test(String(id)) ? id : ''];
  if (!meta) return null;
  try {
    const buf = readFileSync(join(MEDIA_DIR, `${id}.${meta.ext}`));
    return { buf, mime: MEDIA_MIME[meta.ext] || 'application/octet-stream', kind: meta.kind || 'image' };
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
