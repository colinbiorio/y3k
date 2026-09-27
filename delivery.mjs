// HOW THE SITE'S FILES TRAVEL. Server-only (every root .mjs is refused by the
// static server).
//
// Three things the static handler in server.mjs used to leave on the table,
// measured on the boot of the home page (the audit's walk of src/main.js):
//
//  1. NOTHING WAS COMPRESSED. 63 statically imported modules, 2.72MB of raw
//     JavaScript (three.module.js alone is 1.27MB), went over the wire as-is:
//     775KB would have done as gzip, 641KB as brotli. Text is now compressed
//     once per content — brotli where the browser takes it, gzip otherwise —
//     and kept in memory under a byte cap. Media is never recompressed: a PNG
//     or a woff2 is already as small as it gets.
//
//  2. REVALIDATION WAS BY CLOCK ONLY. Every /src file is `no-cache` on purpose
//     (a refresh is the new code, index.html says why), and the only validator
//     was Last-Modified — which a deploy resets on EVERY file, because a fresh
//     checkout stamps them all with the checkout time. So each deploy re-sent
//     all 2.7MB to everyone, changed or not. A strong ETag is a hash of the
//     content: a file the deploy did not touch still answers 304.
//
//  3. THE IMPORT GRAPH WAS DISCOVERED FIVE ROUNDS DEEP. The browser cannot ask
//     for body.js until it has main.js, for three until it has body.js, and so
//     on: 24 modules, then 18, 18, 2 — five serial round trips of conditional
//     requests before main.js can run, on every launch (the desktop app loads
//     the live site, so it pays this too). The server knows the whole graph,
//     so it says so up front: <link rel="modulepreload"> for every module of
//     the static graph, injected into index.html as it is served. One round.
//     Links are not scripts, so the page's inline-script CSP hashes (computed
//     at serve time from the same HTML) do not move.

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

// --- which files, which encoding --------------------------------------------

// Text only. Everything else the site serves (png, jpg, webp, gif, ico, woff2)
// is a compressed format already; squeezing it again costs CPU for nothing.
export const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.txt', '.md', '.webmanifest']);
// Below this the encoding's own framing eats the saving (and a 304 is smaller
// still), so tiny files go as they are.
export const MIN_COMPRESS_BYTES = 1024;

// Accept-Encoding → 'br' | 'gzip' | null. Honours q=0 ("not this one") and '*'.
// Chrome only offers br over HTTPS, so http://localhost gets gzip; the live
// site and the desktop app (which loads the live site) get brotli.
export function negotiate(header) {
  const q = new Map();
  for (const part of String(header || '').toLowerCase().split(',')) {
    const [name, ...params] = part.split(';').map((s) => s.trim());
    if (!name) continue;
    let v = 1;
    for (const p of params) { const m = /^q=([0-9.]+)$/.exec(p); if (m) v = Number(m[1]); }
    q.set(name, v);
  }
  const takes = (enc) => (q.has(enc) ? q.get(enc) > 0 : (q.get('*') || 0) > 0);
  return takes('br') ? 'br' : takes('gzip') ? 'gzip' : null;
}

// --- validators ---------------------------------------------------------------

// A strong ETag is the content's hash — hex, so it can never itself end in the
// '-br' / '-gz' marks below. 128 bits is far past any collision worth fearing.
export const etagOf = (buf) => `"${createHash('sha256').update(buf).digest('hex').slice(0, 32)}"`;

// Each encoding is its own representation, so it carries its own tag (a strong
// ETag promises identical bytes, and brotli bytes are not gzip bytes — nor are
// quick brotli bytes the same as best brotli bytes, hence '-br5' below).
export const tagFor = (etag, enc, quick = false) => (enc ? etag.slice(0, -1) + (enc === 'br' ? (quick ? '-br5"' : '-br"') : '-gz"') : etag);

// Is the copy the browser holds still good? If-None-Match wins over
// If-Modified-Since whenever both are sent (RFC 9110 §13.1.3), and it matches
// weakly: the W/ a proxy may add, and ANY encoding of the same content, count
// (the base is hex, so whatever follows a '-' is the encoding's mark).
// Returns the tag to answer the 304 with (the one the browser holds), or null.
export function notModified(req, etag, lastModMs) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const inm = req.headers['if-none-match'];
  if (inm) {
    if (inm.trim() === '*') return etag;
    for (const raw of inm.split(',')) {
      const t = raw.trim().replace(/^W\//, '');
      if (t.replace(/-[a-z0-9]+"$/, '"') === etag) return t;
    }
    return null;
  }
  const ims = req.headers['if-modified-since'];
  if (ims && new Date(ims).getTime() >= Math.floor(lastModMs / 1000) * 1000) return etag;
  return null;
}

// What is known about a file on disk: its tag, remembered per (path, mtime,
// size) so a warm file costs one stat and no read. On a miss the bytes just
// read come back too, so the caller does not read them twice.
const known = new Map();
const KNOWN_MAX = 4096;
export async function describe(filePath, st) {
  const k = known.get(filePath);
  if (k && k.mtimeMs === st.mtimeMs && k.size === st.size) return { etag: k.etag, data: null };
  const data = await readFile(filePath);
  const etag = etagOf(data);
  known.delete(filePath);
  known.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, etag });
  if (known.size > KNOWN_MAX) known.delete(known.keys().next().value);
  return { etag, data };
}

// --- compressed copies, in memory -------------------------------------------

// Keyed by content hash + encoding, least-recently-used out first. Each entry
// is { buf, tag }: the bytes and the ETag that names exactly those bytes. The
// whole site compresses to a few MB per encoding, so the cap is a guard against
// a pathological tree, not a working limit.
const CACHE_BYTES = Number(process.env.STATIC_CACHE_BYTES) || 32 * 1024 * 1024;
const variants = new Map();
let variantBytes = 0;
const inflight = new Map();

// Brotli at its best (quality 11) is slow: 2.2s for three.module.js on this
// machine, where quality 5 takes 36ms for a file 16% larger (233KB vs 201KB).
// So the first request after a deploy gets quality 5 at once, and quality 11
// is worked out behind it, one file at a time (one thread of the pool, never
// all four: logins hash passwords on the same pool), and swapped in when done.
// gzip at level 9 costs 54ms on the same file and is within 0.4% of level 6.
// Over the whole boot graph (65 files, 2.4MB) quality 11 is 640KB against
// quality 5's 722KB, and costs about 7s of one core after every restart. On a
// small instance one busy core IS the machine, so the polisher rests as long
// as it worked after each file: at most half a core, and the requests that
// arrive meanwhile keep the other half.
const rest = (ms) => new Promise((r) => setTimeout(r, ms));
const hints = (n) => ({ [zlib.constants.BROTLI_PARAM_SIZE_HINT]: n, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT });
const BR_QUICK = (n) => ({ params: { ...hints(n), [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
const BR_BEST = (n) => ({ params: { ...hints(n), [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
const GZIP = { level: 9 };
let polishing = Promise.resolve();

function keep(key, entry) {
  const old = variants.get(key);
  if (old) { variantBytes -= old.buf.length; variants.delete(key); }
  variants.set(key, entry);
  variantBytes += entry.buf.length;
  for (const [k, v] of variants) {
    if (variantBytes <= CACHE_BYTES || k === key) break;
    variants.delete(k);
    variantBytes -= v.buf.length;
  }
}

// The compressed copy already in memory, if there is one (and mark it used).
export function cached(etag, enc) {
  const key = etag + enc;
  const entry = variants.get(key);
  if (entry) { variants.delete(key); variants.set(key, entry); }
  return entry || null;
}

// `data` compressed as `enc` → { buf, tag }, made once per content and shared
// by every request that arrives while it is being made.
export function encoded(data, etag, enc) {
  const hit = cached(etag, enc);
  if (hit) return Promise.resolve(hit);
  const key = etag + enc;
  if (inflight.has(key)) return inflight.get(key);
  const quick = enc === 'br';
  const p = (quick ? brotli(data, BR_QUICK(data.length)) : gzip(data, GZIP))
    .then((buf) => {
      const entry = { buf, tag: tagFor(etag, enc, quick) };
      keep(key, entry);
      if (quick) {
        polishing = polishing
          .then(async () => {
            if (variants.get(key) !== entry) return; // evicted or replaced meanwhile: nothing to polish
            const t0 = performance.now();
            const best = await brotli(data, BR_BEST(data.length));
            if (variants.get(key) === entry && best.length < buf.length) keep(key, { buf: best, tag: tagFor(etag, enc) });
            await rest(performance.now() - t0);
          })
          .catch(() => { /* the quick copy stands */ });
      }
      return entry;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// For tests and the smoke: wait until every best-quality copy has been made.
export const settled = () => polishing;

// --- the module graph ----------------------------------------------------------

// A copy of `src` in which every comment and the inside of every string,
// template and regex literal is blanked to spaces, keeping every offset. What
// is left is only code, so an `import x from 'y'` written in a comment or a
// prompt string cannot pass for a real one, and the offsets still point into
// `src` to read the specifier itself.
//
// Regex literals are told from division by the token before them, the usual
// way: after an operator, an opening bracket or a keyword like `return` a
// slash starts a regex; after a name, a number or a closing bracket it
// divides. Strings stop at a line end, so a misjudged slash costs one line at
// most — and a missed import only costs a preload (the browser still finds it).
const KEYWORDS_BEFORE_EXPR = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
// Character classes by code, not by regex: this runs over 2.7MB on the first
// page load after a boot (three alone is 1.27MB), and a regex test per
// character made that walk 220ms; a table makes it a few tens.
const IDENT = new Uint8Array(128);
for (let c = 0; c < 128; c++) IDENT[c] = /[\w$]/.test(String.fromCharCode(c)) ? 1 : 0;
// Non-ASCII letters may name things too; the non-ASCII spaces may not.
const isIdent = (code) => (code < 128 ? IDENT[code] === 1 : code > 0xa0 && code !== 0xfeff && code !== 0x2028 && code !== 0x2029);
const isSpace = (code) => code === 32 || (code >= 9 && code <= 13) || code === 0xa0 || code === 0xfeff || code === 0x2028 || code === 0x2029;
const DIVIDES_AFTER = new Set([')', ']', '}', '`', '"', "'"].map((c) => c.charCodeAt(0)));
const [SLASH, STAR, BACKSLASH, BACKTICK, DOLLAR, LBRACE, RBRACE, LBRACKET, RBRACKET, DQUOTE, SQUOTE, NL] =
  ['/', '*', '\\', '`', '$', '{', '}', '[', ']', '"', "'", '\n'].map((c) => c.charCodeAt(0));

export function maskSource(src) {
  const n = src.length;
  const out = [];
  let last = 0;
  const blank = (a, b) => { if (b > a) { out.push(src.slice(last, a), ' '.repeat(b - a)); last = b; } };
  const braces = []; // one depth counter per open `${`, innermost last
  let prev = 0;      // code of the last significant character of code (0: none yet)
  let word = '';     // last name or keyword, if the last token was one
  let i = 0;
  const template = () => { // i is just inside a template's literal text
    const start = i;
    while (i < n) {
      const c = src.charCodeAt(i);
      if (c === BACKSLASH) { i += 2; continue; }
      if (c === BACKTICK) { blank(start, i); i += 1; return; }
      if (c === DOLLAR && src.charCodeAt(i + 1) === LBRACE) { blank(start, i); braces.push(0); i += 2; return; }
      i += 1;
    }
    blank(start, n);
  };
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === SLASH) {
      const d = src.charCodeAt(i + 1);
      if (d === SLASH) { let e = src.indexOf('\n', i); if (e < 0) e = n; blank(i, e); i = e; continue; }
      if (d === STAR) { let e = src.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; blank(i, e); i = e; continue; }
      if (prev === 0 || (isIdent(prev) ? KEYWORDS_BEFORE_EXPR.has(word) : !DIVIDES_AFTER.has(prev))) {
        let j = i + 1;
        let cls = false;
        while (j < n) {
          const ch = src.charCodeAt(j);
          if (ch === NL) break;
          if (ch === BACKSLASH) { j += 2; continue; }
          if (cls) { if (ch === RBRACKET) cls = false; } else if (ch === LBRACKET) cls = true; else if (ch === SLASH) break;
          j += 1;
        }
        blank(i + 1, Math.min(j, n)); i = j + 1; prev = SLASH; word = '';
        continue;
      }
    } else if (c === DQUOTE || c === SQUOTE) {
      let j = i + 1;
      while (j < n) {
        const ch = src.charCodeAt(j);
        if (ch === c || ch === NL) break;
        j += ch === BACKSLASH ? 2 : 1;
      }
      blank(i + 1, Math.min(j, n)); i = j + 1; prev = c; word = '';
      continue;
    } else if (c === BACKTICK) {
      i += 1; template(); prev = BACKTICK; word = '';
      continue;
    } else if (isIdent(c)) {
      let j = i + 1;
      while (j < n && isIdent(src.charCodeAt(j))) j += 1;
      word = src.slice(i, j); prev = src.charCodeAt(j - 1); i = j;
      continue;
    } else if (braces.length && c === LBRACE) {
      braces[braces.length - 1] += 1;
    } else if (braces.length && c === RBRACE) {
      if (braces[braces.length - 1] === 0) { braces.pop(); i += 1; template(); prev = BACKTICK; word = ''; continue; }
      braces[braces.length - 1] -= 1;
    }
    if (!isSpace(c)) { prev = c; word = ''; }
    i += 1;
  }
  out.push(src.slice(last));
  return out.join('');
}

// The specifiers of a module's STATIC imports and re-exports, in order:
//   import x from 'a'   import { y } from 'b'   import * as z from 'c'
//   import 'd'          export * from 'e'       export { w } from 'f'
// Never import('…') (dynamic: loaded on use, and preloading it would undo the
// point of making it lazy) and never import.meta.
const STATIC_IMPORT = /(?<![\w$.])(?:import(?![\w$])\s*(?:[\w$*{}\s,]+?\s*from\s*)?|export(?![\w$])\s*(?:\*\s*(?:as\s+[\w$]+\s*)?|\{[^}]*\}\s*)from\s*)(["'])/g;
export function staticImports(src) {
  const code = maskSource(src);
  const out = [];
  STATIC_IMPORT.lastIndex = 0;
  let m;
  while ((m = STATIC_IMPORT.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = code.indexOf(m[1], open + 1);
    if (close < 0) break;
    out.push(src.slice(open + 1, close));
    STATIC_IMPORT.lastIndex = close + 1;
  }
  return out;
}

// The page's importmap ({} when there is none, or it does not parse).
export function importMapOf(html) {
  const m = /<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return {};
  try { const j = JSON.parse(m[1]); return j && typeof j.imports === 'object' && j.imports ? j.imports : {}; } catch { return {}; }
}

// The page's module entry points: <script type="module" src="…">, as paths.
export function moduleEntries(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = /\bsrc=["']([^"']+)["']/i.exec(attrs);
    if (src && /\btype=["']?module["']?/i.test(attrs)) out.push(new URL(src[1], 'http://self/').pathname);
  }
  return out;
}

// A specifier, as the browser would resolve it from the module at `parent` —
// relative, absolute, or bare through the importmap (an exact key first, else
// the longest key ending in '/' that prefixes it). Another origin → null.
export function resolveSpecifier(spec, parent, imports = {}) {
  let target = spec;
  if (!/^(\.{1,2}\/|\/)/.test(spec)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return null; // a URL: another origin, or data:
    let key = Object.hasOwn(imports, spec) ? spec : null;
    if (!key) for (const k of Object.keys(imports)) if (k.endsWith('/') && spec.startsWith(k) && (!key || k.length > key.length)) key = k;
    if (!key || typeof imports[key] !== 'string') return null;
    target = imports[key] + spec.slice(key.length);
    parent = '/';
  }
  const u = new URL(target, 'http://self' + parent);
  return u.host === 'self' ? u.pathname : null;
}

// Imports per module file, remembered per (mtime, size).
const importsMemo = new Map();
async function importsOf(abs) {
  const st = await stat(abs);
  const m = importsMemo.get(abs);
  if (m && m.mtimeMs === st.mtimeMs && m.size === st.size) return m;
  const e = { mtimeMs: st.mtimeMs, size: st.size, specs: staticImports(await readFile(abs, 'utf8')) };
  importsMemo.set(abs, e);
  return e;
}

// Every module the page loads before it can run, breadth first from its entry
// scripts. Only files the site serves as client code count: under src/, .js or
// .mjs, present on disk. Returns the URL paths and each file's (mtime, size),
// which is how a later request knows whether the walk still holds.
export async function moduleGraph(root, html) {
  const imports = importMapOf(html);
  const srcDir = join(root, 'src') + sep;
  const seen = new Set();
  const paths = [];
  const deps = [];
  let queue = moduleEntries(html);
  while (queue.length) {
    // One level at a time, read in parallel, kept in discovery order.
    const level = [];
    for (const p of queue) {
      if (seen.has(p)) continue;
      seen.add(p);
      if (!/\.m?js$/.test(p)) continue;
      let abs;
      try { abs = join(root, decodeURIComponent(p)); } catch { continue; }
      if (abs.startsWith(srcDir)) level.push([p, abs]);
    }
    // a missing file is skipped: the browser will 404 it on its own
    const infos = await Promise.all(level.map(([, abs]) => importsOf(abs).catch(() => null)));
    const next = [];
    level.forEach(([p, abs], k) => {
      const info = infos[k];
      if (!info) return;
      paths.push(p);
      deps.push([abs, info.mtimeMs, info.size]);
      for (const s of info.specs) { const r = resolveSpecifier(s, p, imports); if (r && !seen.has(r)) next.push(r); }
    });
    queue = next;
  }
  return { paths, deps };
}

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function injectPreloads(html, paths) {
  if (!paths.length || !/<\/head>/i.test(html)) return html;
  const links = paths.map((p) => `  <link rel="modulepreload" href="${attr(p)}" />\n`).join('');
  const note = '  <!-- The static import graph of this page, listed by the server (delivery.mjs) so every module is asked for at once. -->\n';
  return html.replace(/<\/head>/i, `${note}${links}</head>`);
}

// --- the app shell ----------------------------------------------------------------

// index.html as served: the file plus its preload list. Walked once, then
// trusted until index.html or any module in the graph changes (re-checked by
// stat at most once a second — a burst of page loads costs one check). Its
// ETag is the served bytes' hash, so an edit that leaves the graph alone still
// answers 304; its Last-Modified is the newest of all those files.
const RECHECK_MS = 1000;
let shell = null;
let building = null;
export async function appShell(root, filePath, st) {
  const s = shell;
  if (s && s.file === filePath && s.mtimeMs === st.mtimeMs && s.size === st.size) {
    if (Date.now() - s.checked < RECHECK_MS) return s;
    const same = await Promise.all(s.deps.map(([abs, m, z]) => stat(abs).then((x) => x.mtimeMs === m && x.size === z, () => false)));
    if (same.every(Boolean)) { s.checked = Date.now(); return s; }
  }
  if (building) return building;
  building = (async () => {
    const raw = await readFile(filePath, 'utf8');
    let graph = { paths: [], deps: [] };
    try { graph = await moduleGraph(root, raw); } catch (e) {
      // A preload list is an optimisation; the page must never fail for it.
      console.error('[static] module graph walk failed; serving index.html without preloads:', e.message);
    }
    const html = Buffer.from(injectPreloads(raw, graph.paths));
    shell = {
      file: filePath, mtimeMs: st.mtimeMs, size: st.size, checked: Date.now(),
      deps: graph.deps, preloads: graph.paths, html, etag: etagOf(html),
      lastModMs: Math.max(st.mtimeMs, ...graph.deps.map((d) => d[1])),
    };
    return shell;
  })().finally(() => { building = null; });
  return building;
}
