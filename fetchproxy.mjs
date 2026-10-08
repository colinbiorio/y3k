// The read proxy — how a presence surfs the web, and the most security-critical
// module in the app.
//
// Browsers can't cross-origin, so the server fetches pages for read mode. That
// makes this an SSRF surface: a presence (or a prompt-injected one) could name
// internal addresses. Every hop is validated: http(s) only, the hostname is
// DNS-resolved and EVERY address checked against private/loopback/link-local/
// metadata ranges, redirects are followed manually with the same checks per
// hop, and responses are text-only with hard size/time caps. Residual risk
// (DNS answers changing between our check and the fetch's own lookup) is
// accepted for v1 and noted here honestly.
//
// The page comes back as readable TEXT plus a bounded list of links, so the
// model can read and choose where to go next — it never sees raw HTML.

import { lookup } from 'node:dns/promises';

const MAX_BYTES = 2 * 1024 * 1024;  // 2MB body cap
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;
const MAX_TEXT = 20_000;            // chars of readable text returned
const MAX_LINKS = 40;

function isPrivateV4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → treat as unsafe
  return p[0] === 0 || p[0] === 10 || p[0] === 127
    || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)       // CGNAT
    || (p[0] === 169 && p[1] === 254)                     // link-local + cloud metadata
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    || (p[0] === 192 && p[1] === 168)
    || p[0] >= 224;                                       // multicast/reserved
}
function isPrivateAddr(addr, family) {
  const a = String(addr).toLowerCase();
  if (family === 4 || /^\d+\.\d+\.\d+\.\d+$/.test(a)) return isPrivateV4(a);
  if (a === '::' || a === '::1') return true;
  if (/^f[cd]/.test(a)) return true;   // fc00::/7 unique-local
  if (/^fe[89ab]/.test(a)) return true; // fe80::/10 link-local
  if (/^ff/.test(a)) return true;       // ff00::/8 multicast
  // Any IPv6 that EMBEDS an IPv4 — v4-mapped (::ffff:a.b.c.d), v4-compatible
  // (::a.b.c.d), or NAT64 (64:ff9b::a.b.c.d, and the hex tail forms) — is only
  // as safe as that inner v4. Pull it out and judge it as v4. A DNS64/NAT64
  // gateway will route these straight to the embedded (possibly private) v4.
  const embedded = embeddedV4(a);
  if (embedded) return isPrivateV4(embedded);
  return false;
}

// Extract an embedded IPv4 from an IPv6 address string, in either dotted or
// hex-tail form, for the ::/96, ::ffff:/96, and 64:ff9b::/96 prefixes.
function embeddedV4(a) {
  const dotted = a.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted && /^(::ffff:|::|64:ff9b::)/.test(a)) return dotted[1];
  const hexTail = a.match(/^(?:::ffff:|::|64:ff9b::)(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexTail) {
    const hi = parseInt(hexTail[1], 16), lo = parseInt(hexTail[2], 16);
    if (Number.isFinite(hi) && Number.isFinite(lo)) return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

// Throws with a human-readable reason when the URL must not be fetched.
async function assertSafeUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('not a valid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s)');
  if (u.username || u.password) throw new Error('credentials in URLs are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('internal hostname');
  let addrs;
  try { addrs = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new Error('could not resolve host'); }
  if (!addrs.length) throw new Error('could not resolve host');
  for (const { address, family } of addrs) {
    if (isPrivateAddr(address, family)) throw new Error('address is not public');
  }
  return u;
}

// Search engines wrap each result in a tracking redirect (DuckDuckGo's
// duckduckgo.com/l/?uddg=<real url>) which 400s bots. Decode it to the real
// destination so the presence follows a clean, directly-fetchable URL. Only
// unwraps known safe redirectors; anything else passes through untouched.
function unwrapRedirect(abs) {
  try {
    const u = new URL(abs);
    const host = u.hostname.replace(/^www\./, '');
    if ((host === 'duckduckgo.com' || host.endsWith('.duckduckgo.com')) && u.pathname === '/l/') {
      const target = u.searchParams.get('uddg');
      if (target) { const t = new URL(target); if (/^https?:$/.test(t.protocol)) return t.href; }
    }
  } catch { /* fall through */ }
  return abs;
}

// --- HTML → readable text + links --------------------------------------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ' '; })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ' '; })
    .replace(/&([a-z]+);/gi, (_, name) => ENTITIES[name.toLowerCase()] ?? ' ');
}

// --- Every pass over the page is linear ---------------------------------------
// The page is up to MAX_BYTES of text someone else wrote, and each pass over it
// runs on the one event loop the whole site shares. The old patterns read to
// the end of the page from every '<' that had nothing to close it, so they were
// quadratic in the page: 160KB of '<' took 48 s to read (2 ms now), and a
// 2MB page could hold the server for hours (audit, 2026-10-08). Each
// pass below does the same work in one sweep and gives the same result the
// old pattern gave, on any page. test/redos.test.mjs holds them to both on
// 2MB of hostile filler and on ordinary pages.

// Run `re` (global) only on the part of s that ends with the last `end`. Every
// match of these patterns ends in `end`, so none can lie past the last one,
// and what made them slow was starting out there and reading to the end.
function upToLast(s, end, re, rep) {
  const i = s.lastIndexOf(end);
  if (i < 0) return s;
  const cut = i + end.length;
  return s.slice(0, cut).replace(re, rep) + s.slice(cut);
}
const stripTags = (s) => upToLast(s, '>', /<[^>]+>/g, ' ');

// Remove each <name ...> through the first </name> after it, any case, for
// the names in `names` (an alternation): what /<(names)[\s\S]*?<\/\1>/gi did.
// A name whose closing tag no longer appears is not looked for again; the
// lazy scan used to read to the end of the page once for each such opening.
function stripElements(html, names, closeTail) {
  const open = new RegExp(`<(${names})`, 'gi');
  const unclosed = new Set();
  let out = '';
  let kept = 0;
  let m;
  while ((m = open.exec(html)) !== null) {
    const name = m[1].toLowerCase();
    if (unclosed.has(name)) continue;
    const close = new RegExp(`</${name}${closeTail}`, 'gi');
    close.lastIndex = open.lastIndex;
    const c = close.exec(html);
    if (!c) { unclosed.add(name); continue; }
    out += html.slice(kept, m.index) + ' ';
    kept = open.lastIndex = c.index + c[0].length;
  }
  return out + html.slice(kept);
}

// The text of the first <title ...> that a </title> closes, or null: what
// /<title[^>]*>([\s\S]*?)<\/title>/i found. If the first title tag is never
// closed no later one is, so one opening and one search for the close settle
// it. The opening is looked for only up to the page's last '>'.
function titleOf(html) {
  const open = /<title[^>]*>/i.exec(html.slice(0, html.lastIndexOf('>') + 1));
  if (!open) return null;
  const from = open.index + open[0].length;
  const close = /<\/title>/gi;
  close.lastIndex = from;
  const c = close.exec(html);
  return c ? html.slice(from, c.index) : null;
}

// Each link as { href, inner }, in page order: what
// /<a\s[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi matched,
// without its backtracking. That pattern took the LAST href= before the tag's
// first '>' whose quoted value closes, then the first '>' after the value, then
// the first </a> after that; when no href= in the tag worked it tried again
// from every '<a ' inside the same tag, which can only fail the same way, so a
// tag that fails is skipped whole here.
function* anchors(html) {
  const lastQuote = { '"': html.lastIndexOf('"'), "'": html.lastIndexOf("'") };
  const upToLastClose = /^[\s\S]*<\/a>/i.exec(html);   // anchored: one pass, any case
  const lastClose = upToLastClose ? upToLastClose[0].length - 4 : -1;
  const open = /<a\s/gi;
  const hrefIn = /href\s*=\s*(["'])/gi;
  const closeA = /<\/a>/gi;
  const closeFrom = (i) => { closeA.lastIndex = i; return closeA.exec(html).index; };
  let m;
  while ((m = open.exec(html)) !== null) {
    const attrsAt = open.lastIndex;
    if (attrsAt > lastClose) return;             // no link closes past the last </a>
    const gt = html.indexOf('>', attrsAt);       // the tag's first '>'
    if (gt < 0) return;
    const attrs = html.slice(attrsAt, gt);
    const tries = [];
    let h;
    hrefIn.lastIndex = 0;
    while ((h = hrefIn.exec(attrs)) !== null) tries.push({ q: h[1], from: attrsAt + h.index + h[0].length });
    let found = null;
    let closeAfterGt = -1;                       // the first </a> after gt, looked for once
    for (let i = tries.length - 1; i >= 0 && !found; i--) {
      const { q, from } = tries[i];
      if (lastQuote[q] < from) continue;         // the value never closes
      const valueEnd = html.indexOf(q, from);
      const tagEnd = valueEnd < gt ? gt : html.indexOf('>', valueEnd + 1);
      if (tagEnd < 0 || tagEnd >= lastClose) continue;   // nothing after it closes a link
      if (tagEnd === gt && closeAfterGt < 0) closeAfterGt = closeFrom(gt + 1);
      const close = tagEnd === gt ? closeAfterGt : closeFrom(tagEnd + 1);
      found = { href: html.slice(from, valueEnd), inner: html.slice(tagEnd + 1, close), end: close + 4 };
    }
    if (!found) { open.lastIndex = gt; continue; }
    open.lastIndex = found.end;
    yield found;
  }
}

// offset lets a reader continue DEEPER into a long page across calls — the
// full text is extracted, then a MAX_TEXT window starting at offset is
// returned, with `more`/`nextOffset` saying whether and where it continues.
function extractReadable(html, baseUrl, offset = 0) {
  const titleText = titleOf(html);
  const title = titleText != null ? decodeEntities(titleText).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  // Links first (before tags are stripped) — bounded, absolute, deduped.
  const links = [];
  const seen = new Set();
  // An href already read once can only be dropped again, so it is not resolved
  // twice: a page of one link repeated 120,000 times spent most of a second
  // in new URL() alone.
  const read = new Set();
  for (const a of anchors(html)) {
    if (links.length >= MAX_LINKS) break;
    const href = a.href;
    if (read.has(href)) continue;
    read.add(href);
    const label = decodeEntities(stripTags(a.inner)).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, baseUrl).href; } catch { continue; }
    abs = unwrapRedirect(abs); // search engines wrap results in a redirector — hand back the real target
    if (!/^https?:/.test(abs) || seen.has(abs)) continue;
    seen.add(abs);
    links.push({ url: abs.slice(0, 500), label: label || abs.slice(0, 80) });
  }
  let bare = stripElements(html, 'script|style|noscript|svg|template|iframe', '>');
  bare = upToLast(bare, '-->', /<!--[\s\S]*?-->/g, ' ');
  bare = upToLast(bare, '>', /<(p|div|br|li|h[1-6]|tr|section|article|blockquote)[^>]*>/gi, '\n');
  // A run of spaces is tried for a line break from where it starts only: from
  // each of 80KB of '\r' with no '\n' the old pattern read to the end (11 s).
  const full = decodeEntities(stripTags(bare))
    .replace(/[ \t]+/g, ' ').replace(/(?<!\s)\s*\n\s*/g, '\n').trim();
  const at = Math.max(0, Math.min(offset, full.length));
  const text = full.slice(at, at + MAX_TEXT);
  const more = full.length > at + MAX_TEXT;
  // `total` + `span` let a reader turn an offset into a POSITION on the page —
  // which is what makes the presence's gaze and the rendered view agree.
  return {
    title, text, links, offset: at, more,
    nextOffset: more ? at + text.length : null,
    total: full.length, span: MAX_TEXT,
  };
}

// The shared safe fetch: SSRF-checked per hop, size/time capped, text-only.
// Returns { url, html } or { error }.
async function fetchPage(rawUrl) {
  let u = await assertSafeUrl(rawUrl);
  let r = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    r = await fetch(u, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'orion-reader/1.0 (+https://yearthreethousand.com)', accept: 'text/html,text/plain,application/xhtml+xml' },
    });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc || hop === MAX_REDIRECTS) return { error: 'too many redirects' };
      u = await assertSafeUrl(new URL(loc, u).href); // every hop re-validated
      continue;
    }
    break;
  }
  if (!r.ok) return { error: `the page answered ${r.status}` };
  const ctype = (r.headers.get('content-type') || '').toLowerCase();
  if (!/text\/|xhtml|xml/.test(ctype)) return { error: 'not a text page' };
  // Stream with a hard byte cap — a huge page truncates instead of exhausting memory.
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let html = '';
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    html += dec.decode(value, { stream: true });
    if (bytes > MAX_BYTES) { reader.cancel().catch(() => {}); break; }
  }
  return { url: u.href, html };
}

// Fetch one page safely. Returns { url, title, text, links, more, nextOffset }
// or { error }. offset continues deeper into a long page.
export async function fetchReadable(rawUrl, offset = 0) {
  try {
    const page = await fetchPage(rawUrl);
    if (page.error) return page;
    const out = extractReadable(page.html, page.url, offset);
    if (!out.text) return { error: offset > 0 ? 'the page ends before that point' : 'no readable text on that page' };
    return { url: page.url, ...out };
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) };
  }
}

// --- The rendered view: the actual page, made inert -------------------------
// The reader window shows the real site, not extracted text. The page is served
// from OUR origin into a fully sandboxed iframe (no scripts, opaque origin) —
// that sandbox is the real security boundary. This sanitizer is defense in
// depth: strip everything executable or navigational, resolve relative URLs
// via <base>, and let the page keep its styles and images so it looks like
// itself.
//   Every pass is linear, as in extractReadable above, and removes exactly
// what the old one did. The meta pass takes each <meta ...> whole and keeps
// it unless it refreshes (an inner '<meta' could only fail the same way), and
// the link pass cannot read past the next '<a ', which still finds the same
// href= from where that tag starts.
function sanitizeHtml(html, baseUrl) {
  // Whole elements that execute, embed, or re-navigate.
  let s = stripElements(html, 'script', '\\s*>');
  s = upToLast(s, '>', /<script[^>]*>/gi, ' ')   // an unclosed <script> would swallow the rest
    .replace(/<(iframe|frame|frameset|object|embed|applet)[\s\S]*?(<\/\1\s*>|$)/gi, ' ')
    .replace(/<meta([^>]*)(>?)/gi, (m, attrs, gt) => (gt && /[\s\S]http-equiv\s*=\s*["']?refresh/i.test(attrs) ? ' ' : m));
  s = upToLast(s, '>', /<base[^>]*>/gi, ' ')     // we inject our own
    // Inline handlers + executable URLs.
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|action|formaction)\s*=\s*(?!\s)(["']?)\s*javascript:[^"'\s>]*\2/gi, '')
    // Links become inert: the AI drives this page, the human only looks. (A
    // sandboxed frame could still self-navigate on click, straight to the raw
    // site — dead links keep the window honestly a viewing surface.)
    .replace(/(<a\s(?:(?!<a\s)[^>])*?)href\s*=/gi, '$1data-href=');
  // Resolve relative images/styles against the real page.
  const base = `<base href="${String(baseUrl).replace(/"/g, '&quot;')}">`;
  const head = /<head[^>]*>/i.exec(s.slice(0, s.lastIndexOf('>') + 1));
  if (head) { const at = head.index + head[0].length; s = s.slice(0, at) + base + s.slice(at); }
  else s = base + s;
  return s;
}

// The page as inert HTML for the reader window. { url, html } or { error }.
export async function fetchRenderable(rawUrl) {
  try {
    const page = await fetchPage(rawUrl);
    if (page.error) return page;
    return { url: page.url, html: sanitizeHtml(page.html, page.url) };
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) };
  }
}

// For test/redos.test.mjs: the two passes over a page, without the network.
export const _test = { extractReadable, sanitizeHtml };
