// ============================================================================
// music.mjs — server-side track resolution for the Audius connector.
//
// WHY THIS EXISTS AT ALL. The browser could talk to Audius directly for
// metadata (it is keyless and CORS-open), and it does. What it CANNOT do is the
// one thing that decides whether a track is usable here.
//
// Audius streams are served by community-run content nodes. GET /tracks/:id/
// stream returns a 302 to whichever node holds the file, and that pinning is
// DETERMINISTIC — retrying the same track returns the same node forever. As of
// this writing one operator's node fails at the TLS layer outright, and roughly
// half of trending resolves to it. In the browser that is a dead <audio> and
// nothing more: a redirect is opaque to fetch(), so the page cannot even see
// which node it was sent to, let alone whether that node is alive.
//
// The obvious fix — keep the signed CID and swap in a healthy host — was tested
// and rejected. A swapped host serves the bytes (206) but drops the CORS header
// the original sends. It would play and be UNANALYSABLE, which is the one
// property this whole feature exists for: the presence has to be able to
// actually hear the music, not read a label off a stream it cannot touch.
//
// So the server resolves redirects, probes node health, and simply omits tracks
// whose node is down. The audio itself never touches this server — the browser
// fetches it straight from the content node, which keeps Render's bandwidth out
// of it and keeps the CORS headers that make analysis possible.
// ============================================================================

const AUDIUS = 'https://discoveryprovider.audius.co/v1';
const APP = 'y3k';
const RESOLVE_MS = 4000;      // a content node either answers quickly or is out
const HOST_TTL_MS = 5 * 60e3; // health is a property of the HOST, not the track
const LIST_TTL_MS = 60e3;
const PROBE_ORIGIN = 'https://yearthreethousand.com';

// THE CACHE IS BOUNDED, AND SO IS WHAT A MISS MAY COST. The route is open to
// anyone (Settings says "no account needed"), and it kept every list it ever
// made: entries were only replaced under the same key and expired ones never
// left, so a script sending a new q each time grew the Map until the instance
// ran out of memory. A miss is also not one request out: it is one list fetch,
// then a redirect resolve and a probe per track, about 41 for a list of 20.
// Audit 2026-10-08. So:
//  - a list is kept for LIST_TTL_MS and then dropped, and never more than
//    LIST_MAX of them at once, least recently used out first;
//  - trending is one list whatever q came with it, and a search is keyed by
//    its words, not their spacing or case;
//  - the same miss asked twice at once is fetched once;
//  - new lookups (a miss, not a hit) are counted: MISS_PER_SOURCE a minute from
//    one machine (security.mjs sourceOf), MISS_TOTAL from everyone. 120 a
//    minute is at most about 4,900 requests a minute to Audius under the y3k
//    app name, where one machine at the old 300/min cheap budget could send
//    12,000. Twelve a minute is a new search every five seconds.
const LIST_MAX = 200;
const MISS_WINDOW_MS = 60e3;
const MISS_PER_SOURCE = 12;
const MISS_TOTAL = 120;

const listCache = new Map();   // key → { at, tracks }, least recently used first
const inflight = new Map();    // key → the promise of the lookup already running
const missHits = new Map();    // source → { count, reset }
let missAll = { count: 0, reset: 0 };

const now = () => Date.now();

// Two DIFFERENT failure modes, and conflating them was a bug worth naming.
//
// A dead host (TLS handshake failure, DNS, timeout) really is a property of the
// host: if one track cannot be reached there, none can, so that verdict is
// cached and one probe spares every other track on the same node.
//
// CORS is NOT a host property. Some content nodes serve the bytes themselves
// with access-control-allow-origin: *, and others 302 again to a presigned
// Cloudflare R2 URL which sends no CORS header at all — and which of the two
// happens varies per TRACK, not per host. Caching that verdict by host let a
// good first track vouch for an unplayable second one. So every track is
// checked on its own, following the full redirect chain to whatever ultimately
// serves the audio, and the header is read off THAT response.
const netDead = new Map();   // host → { dead, at } — the genuinely host-level fact

async function probeTrack(loc, host) {
  const dead = netDead.get(host);
  if (dead && dead.dead && now() - dead.at < HOST_TTL_MS) return false;
  try {
    // redirect: 'follow' is the point — the CORS header that matters belongs to
    // the response that actually carries the audio, which may be two hops away.
    const r = await fetch(loc, {
      headers: { range: 'bytes=0-64', origin: PROBE_ORIGIN },
      signal: AbortSignal.timeout(RESOLVE_MS),
    });
    netDead.set(host, { dead: false, at: now() });
    // the headers are the answer; the body is audio nobody here will read, and
    // an unread body holds its connection open until it is collected
    r.body?.cancel().catch(() => {});
    const acao = r.headers.get('access-control-allow-origin');
    // Require '*' rather than an echoed origin: one cached verdict has to hold
    // for localhost and for the live domain alike. A track that plays but
    // cannot be analysed is useless here — the presence would be reduced to
    // reading a label off a stream it has no access to.
    return (r.status === 200 || r.status === 206) && acao === '*';
  } catch {
    netDead.set(host, { dead: true, at: now() });   // TLS / DNS / timeout
    return false;
  }
}

// Follow the discovery provider's 302 WITHOUT downloading the track. redirect:
// 'manual' gives us the Location header, which is the whole point — this is the
// piece a browser is structurally unable to do.
async function resolveStream(id) {
  const u = `${AUDIUS}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`;
  try {
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(RESOLVE_MS) });
    r.body?.cancel().catch(() => {});
    const loc = r.headers.get('location');
    if (!loc) return null;
    return loc;
  } catch { return null; }
}

function shape(t, url) {
  return {
    id: t.id,
    source: 'audius',
    title: t.title || 'untitled',
    artist: (t.user && (t.user.name || t.user.handle)) || 'unknown',
    duration: t.duration || 0,
    art: (t.artwork && (t.artwork['480x480'] || t.artwork['150x150'])) || '',
    // The uploader's OWN description of the track. Distinct from anything the
    // browser measures off the waveform, and labelled that way downstream.
    meta: {
      bpm: t.bpm || 0,
      key: t.musical_key || '',
      mood: t.mood || '',
      genre: t.genre || '',
    },
    url,
    permalink: t.permalink ? `https://audius.co${t.permalink}` : '',
    analysable: true,
  };
}

// One more new lookup from this source: over either ceiling? A source past its
// own ceiling is refused before it counts toward everyone's, as in server.mjs
// rateLimited, so one machine cannot spend the shared minute by itself.
function missLimited(source) {
  const t = now();
  if (source) {
    let e = missHits.get(source);
    if (!e || t > e.reset) { missHits.delete(source); e = { count: 0, reset: t + MISS_WINDOW_MS }; missHits.set(source, e); }
    if (missHits.size > 10000) missHits.delete(missHits.keys().next().value);   // oldest window first
    if (++e.count > MISS_PER_SOURCE) return true;
  }
  if (t > missAll.reset) missAll = { count: 0, reset: t + MISS_WINDOW_MS };
  return ++missAll.count > MISS_TOTAL;
}

function keep(key, tracks) {
  const t = now();
  listCache.delete(key);                       // a refreshed key moves to the end
  listCache.set(key, { at: t, tracks });
  for (const [k, v] of listCache) if (t - v.at >= LIST_TTL_MS) listCache.delete(k);
  while (listCache.size > LIST_MAX) listCache.delete(listCache.keys().next().value);
}

// `source` is who is asking (security.mjs sourceOf); without one only the
// shared ceiling counts. A refused lookup throws an error with `busy` set.
export async function list({ kind = 'trending', q = '', limit = 20, source = '' } = {}) {
  const words = String(q || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const key = kind === 'search' ? `search:${words}` : 'trending';
  const hit = listCache.get(key);
  if (hit && now() - hit.at < LIST_TTL_MS) {
    listCache.delete(key); listCache.set(key, hit);   // used: to the back of the line
    return hit.tracks;
  }
  if (hit) listCache.delete(key);
  const running = inflight.get(key);
  if (running) return running;
  if (missLimited(source)) throw Object.assign(new Error('too many new lookups'), { busy: true });
  const p = lookup(kind, words, limit).then((tracks) => { keep(key, tracks); return tracks; });
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

async function lookup(kind, q, limit) {
  const src = kind === 'search'
    ? `${AUDIUS}/tracks/search?query=${encodeURIComponent(q)}&limit=${limit}&app_name=${APP}`
    : `${AUDIUS}/tracks/trending?limit=${limit}&app_name=${APP}`;
  const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`audius ${r.status}`);
  const raw = (await r.json()).data || [];

  // Resolve every track's node in parallel, then keep only the reachable ones.
  const resolved = await Promise.all(raw.map(async (t) => {
    const loc = await resolveStream(t.id);
    if (!loc) return null;
    let host;
    try { host = new URL(loc).host; } catch { return null; }
    if (!(await probeTrack(loc, host))) return null;
    return shape(t, loc);
  }));
  return resolved.filter(Boolean);
}

export const _test = {
  get size() { return listCache.size; },
  LIST_MAX, LIST_TTL_MS, MISS_PER_SOURCE, MISS_TOTAL,
  reset() { listCache.clear(); inflight.clear(); missHits.clear(); missAll = { count: 0, reset: 0 }; netDead.clear(); },
};

export function health() {
  const hosts = [...netDead.entries()].map(([h, v]) => ({ host: h, reachable: !v.dead }));
  return { hosts, reachable: hosts.filter((h) => h.reachable).length, total: hosts.length };
}
