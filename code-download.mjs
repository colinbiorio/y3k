// y3k CODE, HANDED OVER (CODE.md). Server-only (every root .mjs is refused by
// the static server).
//
// The founder typed `y3k-code` into his own computer and nothing was there:
// the engine was never published (its package.json says private), the connect
// screen's `npx y3k-code` could not work, and the only other way in was a
// clone of this repository. Nobody should have to chase it. So the site hands
// the engine over itself, two ways, both behind sign-in and CODE_ROLLOUT:
//
//   npx -y https://<site>/code/dl/<token>/y3k-code.tgz
//       One line to paste into a terminal. The token stands in for the cookie
//       a terminal does not have: HMAC-signed, bound to one account, good for
//       24 hours, and checked again against the rollout on every use.
//   /api/code/engine.tgz
//       The same file as a download, for the signed-in page.
//
// The file is an ordinary npm tarball of y3k-code/, built here in memory:
// package/package.json, package/README.md and every .mjs/.cjs — the same set
// the desktop app ships (desktop/package.json extraResources) plus .cjs. The
// engine has no dependencies (every import is node: or relative), so npx
// installs it without asking the registry for anything. A few dozen lines of
// ustar and node's own zlib: nothing to install here either.
//
// This does NOT open y3k-code/ to the static server — that folder stays a 403,
// as does every raw file in it. Only this one packaged file leaves, and only
// for someone the rollout lets in.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const SECRET_FILE = '.code-download-secret';

// --- the tarball -------------------------------------------------------------------

// npm's own reproducible-pack date (1985-10-26 08:15 UTC). Every entry carries
// it, so the same sources always make the same bytes and the same ETag — a
// redeploy that did not touch the engine does not change the file.
const TAR_MTIME = 499162500;

function octal(buf, off, len, n) { buf.write(n.toString(8).padStart(len - 1, '0') + '\0', off, len, 'ascii'); }

// One POSIX ustar header. Names longer than 100 bytes split at a '/' into
// prefix (155) + name (100); the engine's longest path is 30.
function header(path, size, mode) {
  const h = Buffer.alloc(512);
  let name = path;
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    // the first '/' that leaves both halves in bounds
    let i = path.indexOf('/');
    while (i >= 0 && !(Buffer.byteLength(path.slice(i + 1)) <= 100 && Buffer.byteLength(path.slice(0, i)) <= 155)) i = path.indexOf('/', i + 1);
    if (i < 0) throw new Error(`tar: path too long: ${path}`);
    prefix = path.slice(0, i);
    name = path.slice(i + 1);
  }
  h.write(name, 0, 100, 'utf8');
  octal(h, 100, 8, mode);
  octal(h, 108, 8, 0);          // uid
  octal(h, 116, 8, 0);          // gid
  octal(h, 124, 12, size);
  octal(h, 136, 12, TAR_MTIME);
  h.fill(0x20, 148, 156);       // checksum field counts as spaces while summing
  h.write('0', 156, 1, 'ascii'); // a regular file
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

// [{ path, data: Buffer, mode }] → an uncompressed tar archive.
export function tar(entries) {
  const parts = [];
  for (const e of entries) {
    parts.push(header(e.path, e.data.length, e.mode), e.data);
    const pad = (512 - (e.data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024)); // two empty blocks end the archive
  return Buffer.concat(parts);
}

// The files that go: package.json and README.md at the top, every .mjs and
// .cjs anywhere below — never a dotfile, never node_modules, never a link
// (a symlink could point anywhere on this server). Sorted, for stable bytes.
async function engineFiles(dir, base = '') {
  const out = [];
  for (const e of await readdir(join(dir, base), { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await engineFiles(dir, rel));
    else if (e.isFile() && (/\.(mjs|cjs)$/.test(e.name) || (!base && (e.name === 'package.json' || e.name === 'README.md')))) out.push(rel);
  }
  return out.sort();
}

// The package's bin files, from its own package.json (a string or a map).
function binsOf(pkgJson) {
  let bin;
  try { bin = JSON.parse(pkgJson).bin; } catch { return new Set(); }
  const list = typeof bin === 'string' ? [bin] : bin && typeof bin === 'object' ? Object.values(bin) : [];
  return new Set(list.filter((b) => typeof b === 'string').map((b) => b.replace(/^\.\//, '')));
}

// The engine as a gzip'd npm tarball, rebuilt only when a source file's mtime
// or size changes (one readdir and a stat per file per request: the engine is
// two dozen files). Everything under bin/ is 0755, and so is anything
// package.json names as a bin: the .cjs Node-version check is what npx runs,
// and the .mjs it hands over to is also run directly (`node bin/y3k-code.mjs`,
// or by its shebang) — a bin that is not executable is a bin that does not run.
// The rest is 0644.
let packed = null;
let packing = null;
export async function engineTarball(dir) {
  const files = await engineFiles(dir);
  const stats = await Promise.all(files.map((f) => stat(join(dir, f))));
  const sig = files.map((f, i) => `${f}:${stats[i].mtimeMs}:${stats[i].size}`).join('|');
  if (packed && packed.dir === dir && packed.sig === sig) return packed;
  if (packing) return packing;
  packing = (async () => {
    const datas = await Promise.all(files.map((f) => readFile(join(dir, f))));
    const pkgAt = files.indexOf('package.json');
    if (pkgAt < 0) throw new Error('y3k-code/package.json is missing');
    const bins = binsOf(datas[pkgAt].toString('utf8'));
    const archive = tar(files.map((f, i) => ({ path: `package/${f}`, data: datas[i], mode: bins.has(f) || f.startsWith('bin/') ? 0o755 : 0o644 })));
    const buf = gzipSync(archive, { level: 9 });
    packed = { dir, sig, buf, files, etag: `"${createHash('sha256').update(buf).digest('hex')}"` };
    return packed;
  })().finally(() => { packing = null; });
  return packing;
}

// --- the token -----------------------------------------------------------------------

// <account id, base64url>.<expiry ms, base36>.<HMAC-SHA256, base64url>
//
// The secret lives in DATA_DIR beside the session secret, so a deploy does not
// break a command someone copied an hour ago. Made on first use (0600); if
// DATA_DIR cannot be written, one for this process only, and links reset on
// restart — the same bargain auth.mjs makes for sessions.
export function createDownloadTokens({ dataDir, now = () => Date.now(), ttl = TOKEN_TTL_MS } = {}) {
  let secret = null;
  const key = () => {
    if (secret) return secret;
    const file = join(dataDir, SECRET_FILE);
    try { secret = readFileSync(file, 'utf8').trim(); } catch { /* make one */ }
    if (!secret) {
      secret = randomBytes(32).toString('hex');
      try { writeFileSync(file, secret, { mode: 0o600 }); }
      catch { console.warn('[code] could not keep the download-link secret; copied commands stop working on restart.'); }
    }
    return secret;
  };
  const mac = (uid, exp) => createHmac('sha256', key()).update(`y3k-code download\n${uid}\n${exp}`).digest('base64url');
  return {
    mint(uid) {
      const expiresAt = now() + ttl;
      return { token: `${Buffer.from(String(uid)).toString('base64url')}.${expiresAt.toString(36)}.${mac(uid, expiresAt)}`, expiresAt };
    },
    // → { uid } | { error: 'invalid' | 'expired' }. The signature is checked
    // first, in constant time, so only a token this server really issued can
    // learn that it has expired.
    verify(token) {
      const parts = typeof token === 'string' && token.length <= 300 ? token.split('.') : [];
      if (parts.length !== 3) return { error: 'invalid' };
      const [u, e, m] = parts;
      const uid = Buffer.from(u, 'base64url').toString('utf8');
      const exp = parseInt(e, 36);
      if (!uid || Buffer.from(uid).toString('base64url') !== u || !Number.isSafeInteger(exp) || exp.toString(36) !== e) return { error: 'invalid' };
      const want = Buffer.from(mac(uid, exp));
      const got = Buffer.from(m);
      if (got.length !== want.length || !timingSafeEqual(got, want)) return { error: 'invalid' };
      if (exp <= now()) return { error: 'expired' };
      return { uid };
    },
  };
}
