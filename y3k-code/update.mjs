// ============================================================================
// update.mjs — y3kode, UPDATED FROM THE SITE IT WORKS FOR, on the person's yes.
//
// Colin, 2026-10-08: on "Update needed", a button that asks permission to
// download the newest y3kode. Before this, a new engine meant a new desktop
// build, made by hand, or a fresh command from kode: the brain needed 0.2.0,
// the installed one was 0.1.0, and no click could change that.
//
//   1. The page asks ('engine.update') with the version the site has and a
//      download token the site minted for this account (/api/code/setup). It
//      names nothing else: the address is built here, from the site this
//      engine was started for.
//   2. Nothing older or the same is taken. The person is asked on this
//      computer (consent 'engine.update'): which version, from where, and that
//      running coding sessions stop.
//   3. The file is the same npm tarball `npx` runs (code-download.mjs), read
//      strictly: regular files only, every path inside package/ and made of
//      plain names, only .mjs, .cjs, package.json and README.md, sizes capped.
//      Its package.json must name y3k-code at exactly the version asked about.
//   4. It is unpacked into <root>/<version>/ (a temporary folder renamed into
//      place, so a half-written one is never run) and the host restarts on it:
//      the desktop app forks its engine from there, and the companion runs it
//      in its own place on the same port. Pairings, trusted folders and keys
//      are in the store, which every version shares.
// ============================================================================

import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, renameSync, rmSync, readdirSync, existsSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const MAX_GZ = 4 * 1024 * 1024;     // the packed engine is ~150 KB
export const MAX_TAR = 16 * 1024 * 1024;
export const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
// code-download.mjs: <account, base64url>.<expiry, base36>.<HMAC, base64url>
const TOKEN_RE = /^[A-Za-z0-9_-]{1,200}\.[0-9a-z]{1,16}\.[A-Za-z0-9_-]{16,100}$/;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;
// What each host starts it by, so a version without them is never chosen.
export const NEEDED = ['package.json', 'engine.mjs', 'ipc-host.mjs', 'bin/y3k-code.mjs', 'bin/y3k-code.cjs'];

// a newer than b, both x.y.z
export function newer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

// The site an update may come from: https, or plain http on this computer
// (a local server, in development). Anything else: null.
export function siteOrigin(s) {
  try {
    const u = new URL(String(s));
    if (u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname))) return u.origin;
  } catch { /* not a URL */ }
  return null;
}

// package/<path> → <path>, for the files an engine is made of; null for
// anything else. Plain names only: no '..', no leading dot, no backslash, no
// drive letter, no empty segment.
function inside(path) {
  const parts = String(path).split('/');
  if (parts.shift() !== 'package' || !parts.length || !parts.every((p) => SEGMENT.test(p))) return null;
  const rel = parts.join('/');
  if (parts.length === 1 && (rel === 'package.json' || rel === 'README.md')) return rel;
  return /\.(mjs|cjs)$/.test(rel) ? rel : null;
}

// An uncompressed ustar archive → Map(path → Buffer). Throws on anything
// that is not a plain file of an engine (a link, a device, a path outside).
export function untar(buf) {
  const files = new Map();
  let off = 0;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) return files;     // the end
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    const field = (at, n) => { const s = h.subarray(at, at + n); const z = s.indexOf(0); return s.toString('utf8', 0, z < 0 ? n : z); };
    if (sum !== parseInt(field(148, 8).trim(), 8)) throw new Error('the download is damaged');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = h[156] === 0 ? '0' : String.fromCharCode(h[156]);
    const prefix = field(345, 155);
    const path = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    off += 512;
    if (!Number.isSafeInteger(size) || size < 0 || off + size > buf.length) throw new Error('the download is incomplete');
    if (type === '5' && /^package(\/|$)/.test(path)) { off += Math.ceil(size / 512) * 512; continue; }   // a folder: made as needed
    const rel = type === '0' ? inside(path) : null;
    if (!rel || files.has(rel)) throw new Error(`the download holds something that is not part of y3kode: ${JSON.stringify(path).slice(0, 120)}`);
    files.set(rel, Buffer.from(buf.subarray(off, off + size)));
    off += Math.ceil(size / 512) * 512;
  }
  throw new Error('the download is incomplete');
}

// The engine files → <root>/<version>/, checked first. Returns the folder.
// Older versions than the one running (`keep`) are cleared away.
export function install(files, { root, version, keep }) {
  let pkg;
  try { pkg = JSON.parse(files.get('package.json').toString('utf8')); } catch { throw new Error('the download has no package.json'); }
  if (pkg?.name !== 'y3k-code' || pkg.version !== version) throw new Error(`the download is not y3kode ${version}`);
  for (const f of NEEDED) if (!files.has(f)) throw new Error(`the download is missing ${f}`);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const tmp = join(root, `.incoming-${version}-${randomBytes(4).toString('hex')}`);
  try {
    for (const [rel, data] of files) {
      const to = join(tmp, ...rel.split('/'));
      mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
      writeFileSync(to, data, { mode: rel.startsWith('bin/') ? 0o755 : 0o644 });
      if (rel.startsWith('bin/')) { try { chmodSync(to, 0o755); } catch { /* windows */ } }
    }
    const dir = join(root, version);
    rmSync(dir, { recursive: true, force: true });
    renameSync(tmp, dir);
    for (const name of readdirSync(root)) {
      const stale = name.startsWith('.incoming-') || (VERSION_RE.test(name) && name !== version && keep && newer(keep, name));
      if (stale) rmSync(join(root, name), { recursive: true, force: true });
    }
    return dir;
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
}

// The newest complete version under root newer than `than`: { version, dir } or null.
export function newestInstalled(root, than) {
  let best = null;
  let names = [];
  try { names = readdirSync(root); } catch { return null; }
  for (const name of names) {
    if (!VERSION_RE.test(name) || !newer(name, than) || (best && !newer(name, best.version))) continue;
    const dir = join(root, name);
    if (NEEDED.every((f) => existsSync(join(dir, ...f.split('/'))))) best = { version: name, dir };
  }
  return best;
}

// The companion's own arguments, for the version that takes its place: the
// same site and flags, the port it had (the pairing names it), no browser tab
// and no pairing code (the browser that asked is already paired).
export function restartArgs(argv, port) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pair' || argv[i] === '--port') { i++; continue; }
    if (argv[i] === '--no-open') continue;
    out.push(argv[i]);
  }
  return [...out, '--port', String(port), '--no-open'];
}

// Fetch the packed engine with the page's token, from the site's own address.
export async function download({ site, token, fetchFn = globalThis.fetch, timeoutMs = 60000 }) {
  let r;
  try {
    r = await fetchFn(`${site}/code/dl/${token}/y3k-code.tgz`, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch { throw new Error(`could not reach ${new URL(site).host}`); }
  if (r.status === 410) throw new Error('the download link expired; try again');
  if (!r.ok) throw new Error(`${new URL(site).host} answered ${r.status}`);
  if (Number(r.headers?.get?.('content-length')) > MAX_GZ) throw new Error('the download is too large');
  const gz = Buffer.from(await r.arrayBuffer());
  if (gz.length > MAX_GZ) throw new Error('the download is too large');
  let tarBuf;
  try { tarBuf = gunzipSync(gz, { maxOutputLength: MAX_TAR }); } catch { throw new Error('the download is damaged'); }
  return untar(tarBuf);
}

// The 'engine.update' command. `restart({ dir, version })` is the host's: it
// is called once the answer is on its way, never before.
//   site     where this engine was started for (siteOrigin)
//   root     where versions are kept
//   current  the running VERSION
//   ask      the engine's consent (asks on this computer)
export function createUpdater({ site, root, current, restart, ask, audit = { write() {} }, fetchFn, later = (f) => setTimeout(f, 300) }) {
  let busy = null;
  let done = null;
  const able = !!(site && root && typeof restart === 'function');

  async function run({ token, version } = {}) {
    if (!able) return { ok: false, code: 'unsupported', error: 'This y3kode cannot update itself.' };
    if (typeof version !== 'string' || !VERSION_RE.test(version)) return { ok: false, code: 'invalid', error: 'Not a version.' };
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { ok: false, code: 'invalid', error: 'Not a download link from the site.' };
    if (done) return { ok: true, restarting: true, version: done };
    if (!newer(version, current)) return { ok: true, current: true, version: current };
    if (busy) return busy;
    busy = (async () => {
      if (!(await ask('engine.update', { from: current, to: version, site: new URL(site).host }))) return { ok: false, code: 'declined', error: 'The update was not allowed on this computer.' };
      let dir;
      try {
        dir = install(await download({ site, token, fetchFn }), { root, version, keep: current });
      } catch (err) {
        audit.write('engine.update', { from: current, to: version, ok: false, error: String(err?.message || err).slice(0, 200) });
        return { ok: false, code: 'failed', error: `The update did not finish: ${err?.message || err}.` };
      }
      audit.write('engine.update', { from: current, to: version, ok: true });
      done = version;
      later(() => restart({ dir, version }));
      return { ok: true, restarting: true, version };
    })().finally(() => { busy = null; });
    return busy;
  }

  return { run, able };
}
