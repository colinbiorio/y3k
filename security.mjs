// The site's own fence: which requests may change anything, what every response
// says about framing and sniffing, and what the app shell is allowed to load.
//
// Written before y3k Code (CODE.md) exists, because Code makes this origin the
// one a person's own machine listens to. Until now a page on ANOTHER port of the
// same host — a dev server, a hostile tool on localhost — could POST text/plain
// to /api/brain/stream on a local y3k and the founder's cookie went with it:
// SameSite=Lax treats every port of a host as the same site, and nothing here
// ever looked at where a request came from. Now state-changing API requests
// have to come from this origin itself.
//
// Server-only (every root .mjs is refused by the static server).

import { createHash } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// The two requests that legitimately arrive from somewhere else: Apple signs a
// person in by POSTing the result back from appleid.apple.com (form_post), and
// a browser files CSP violation reports on its own.
export const CROSS_SITE_OK = new Set(['/api/auth/oauth/apple/callback', '/api/csp-report']);

// Should this request be refused because it came from another site?
//
// Browsers send Sec-Fetch-Site on every request now: 'same-origin' is this page,
// 'none' is the person typing or bookmarking, and 'same-site' — another port or
// subdomain of the same host — is exactly the hole above, so it is refused too.
// Where the header is missing (an old browser, a script), Origin decides: absent
// means no page sent it (curl, the import script), present must be this host.
export function crossSiteRefused(req, reqPath) {
  if (SAFE_METHODS.has(req.method)) return false;
  if (!reqPath.startsWith('/api/') || CROSS_SITE_OK.has(reqPath)) return false;
  const sfs = req.headers['sec-fetch-site'];
  if (sfs) return !(sfs === 'same-origin' || sfs === 'none');
  const origin = req.headers.origin;
  if (!origin) return false;
  let host;
  try { host = new URL(origin).host; } catch { return true; }
  const self = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return !self || host.toLowerCase() !== self.toLowerCase();
}

// On every response. Lowercase keys, so a route that sets its own value for one
// of these (the reader's stricter CSP, say) overrides it by object spread.
//  - framing: only this site may frame its pages (the reader and shelf iframes
//    are same-origin), so a stranger's page cannot lay invisible buttons over
//    ours — which matters the day a button here says "allow this command".
//  - nosniff: a response is only ever what its content-type says.
//  - referrer: other sites learn the origin, never the path.
//  - permissions: no page here needs location, payment or USB.
export const BASE_HEADERS = Object.freeze({
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), payment=(), usb=()',
});

// The inline <script> blocks of an HTML page, as CSP hashes. The app shell has
// one (the importmap); hashing it at serve time means editing it can never
// silently fall out of the policy.
export function inlineScriptHashes(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html)))) {
    out.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  return out;
}

// What the app shell may load. Served as REPORT-ONLY first: violations are
// reported to /api/csp-report and nothing is blocked, so a week of real use can
// show what this list missed before it is enforced. The third parties are the
// ones the client uses today — three and the vision bundle from unpkg and
// jsDelivr, the hand and face models from Google storage, lichess for chess, the
// 4irden portal — and 127.0.0.1, where the y3k Code engine will listen.
export function appShellCsp(scriptHashes = []) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')} 'wasm-unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net`.replace(/\s+/g, ' '),
    "worker-src 'self' blob:",
    "connect-src 'self' http://127.0.0.1:* http://localhost:* https://lichess.org https://storage.googleapis.com https://cdn.jsdelivr.net https://unpkg.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-src 'self' https://4irden.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
}

// Violation reports, logged once per (directive, blocked source) so a noisy page
// cannot fill the log. Bounded; the point is a list to read, not a stream.
const seen = new Set();
const SEEN_CAP = 500;
export function noteCspReport(body) {
  const r = body && (body['csp-report'] || (Array.isArray(body) ? body[0]?.body : body.body) || body);
  if (!r || typeof r !== 'object') return false;
  const directive = String(r['violated-directive'] || r.effectiveDirective || r['effective-directive'] || '').slice(0, 80);
  const blocked = String(r['blocked-uri'] || r.blockedURL || r['blocked-url'] || '').slice(0, 200);
  const page = String(r['document-uri'] || r.documentURL || '').split('?')[0].slice(0, 120);
  if (!directive) return false;
  const key = directive + ' ' + blocked;
  if (seen.has(key) || seen.size >= SEEN_CAP) return false;
  seen.add(key);
  console.warn(`[csp] ${directive} blocked ${blocked || '(inline)'} on ${page}`);
  return true;
}

export const _test = { reset: () => seen.clear() };
