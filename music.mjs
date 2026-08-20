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

const listCache = new Map();   // key → { at, tracks }

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

export async function list({ kind = 'trending', q = '', limit = 20 } = {}) {
  const key = `${kind}:${q}`;
  const hit = listCache.get(key);
  if (hit && now() - hit.at < LIST_TTL_MS) return hit.tracks;

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
  const tracks = resolved.filter(Boolean);
  listCache.set(key, { at: now(), tracks });
  return tracks;
}

export function health() {
  const hosts = [...netDead.entries()].map(([h, v]) => ({ host: h, reachable: !v.dead }));
  return { hosts, reachable: hosts.filter((h) => h.reachable).length, total: hosts.length };
}
