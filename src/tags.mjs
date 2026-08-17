// Single source of truth for Y3K's control channel: the vocabulary (moods +
// forms) and the parsing that keeps a control tag OUT of the spoken words.
// Zero dependencies on purpose — imported by the server (Node), the client
// (browser), and the tests, so the vocabulary can never drift between them.

// Moods MUST match src/body.js MOODS and the local brain. Forms MUST match
// src/body.js FORMS.
export const MOODS = ['calm', 'listening', 'thinking', 'speaking', 'excited', 'tender', 'glitch'];
export const FORMS = ['field', 'orb', 'web', 'plasma'];
// Color schemes the AI may choose autonomously. MUST match src/body.js SCHEMES.
// Deliberately kept OUT of VOCAB/scrubTags: several are common words ("bloom",
// "frost", "dusk", "ember"), so we only honour them INSIDE the lead tag (which
// is stripped wholesale by length) and never scrub them from ordinary speech.
export const SCHEMES = ['aurora', 'ember', 'abyss', 'terra', 'eclipse', 'bloom', 'verdant', 'dusk', 'frost', 'synthwave', 'stardust'];
const VOCAB = new Set([...MOODS, ...FORMS]);

// Parse a complete control tag at the START of s. The model is told to use
// "[mood form scheme]", but it drifts — so we tolerate any of [] {} () <> as
// delimiters, accept mood/form/scheme in any order, and ignore extra words.
// Returns { mood, form, scheme, len } or null.
export function parseLeadTag(s) {
  const m = (s || '').match(/^\s*[[{(<]\s*([^[\]{}()<>]*?)\s*[\]})>]/);
  if (!m) return null;
  let mood = null;
  let form = null;
  let scheme = null;
  for (const raw of m[1].split(/[\s,/|:]+/)) {
    const w = raw.toLowerCase();
    if (!w) continue;
    if (!mood && MOODS.includes(w)) mood = w;
    else if (!form && FORMS.includes(w)) form = w;
    else if (!scheme && SCHEMES.includes(w)) scheme = w;
  }
  if (!mood && !form && !scheme) return null; // bracketed, but not our vocabulary
  return { mood, form, scheme, len: m[0].length };
}

// Remove EVERY control tag from anywhere in a string (not just the lead), but
// only when the bracket actually contains one of our words — a literal
// "(by the way)" stays put. The client's final safety net against any tag the
// server let through (second tags, inline tags, partials the stream missed).
export function scrubTags(s) {
  if (!s) return s;
  return s
    .replace(/<<[\s\S]*?>>/g, '')           // paint/remember blocks — never spoken
    // An UNCLOSED trailing control block (reply truncated mid-block, e.g. at
    // max_tokens): "<<remember: their address is 42 Elm" with no closing >>.
    // The [:=] requirement keeps honest speech like "1 << 4" intact while
    // guaranteeing a partial memory note or paint block is never spoken.
    .replace(/<<\s*[\w,.\- ]+\s*[:=][\s\S]*$/, '')
    .replace(/[[{(<]\s*([a-z]+(?:[\s,/|:]+[a-z]+)*)\s*[\]})>]/gi, (m, inside) =>
      // Only a bracket whose words are ALL vocabulary is a control tag; a real
      // parenthetical like "(the world wide web)" merely contains one and stays.
      (inside.toLowerCase().split(/[\s,/|:]+/).every((w) => VOCAB.has(w)) ? '' : m))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// --- Paint mode: Y3K paints its whole field with color anchors ---------------
// The model emits a "<< pos=#hex pos=#hex ... >>" block; each anchor is a color
// at a position on the sphere, and every node blends the nearest anchors. Named
// positions plus "azimuth,elevation" degrees give it free spatial control.
const NAMED_DIR = {
  top: [0, 1, 0], bottom: [0, -1, 0], left: [-1, 0, 0],
  right: [1, 0, 0], front: [0, 0, 1], back: [0, 0, -1],
};
function azElToDir(az, el) {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  const c = Math.cos(e);
  return [c * Math.sin(a), Math.sin(e), c * Math.cos(a)];
}
function hexToRgb(h) {
  let x = h.replace('#', '');
  if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
  if (x.length !== 6) return null;
  const n = parseInt(x, 16);
  if (Number.isNaN(n)) return null;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
// Parse anchors from a paint block (the surrounding << >> are optional). Returns
// [{ dir:[x,y,z], rgb:[r,g,b] }], capped so a runaway reply can't explode work.
export function parsePaint(s) {
  const anchors = [];
  const re = /([a-z]+|-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?)\s*[:=]\s*(#?[0-9a-f]{6}|#?[0-9a-f]{3})\b/gi;
  let m;
  while ((m = re.exec(s)) !== null && anchors.length < 64) {
    const rgb = hexToRgb(m[2]);
    if (!rgb) continue;
    const pos = m[1].toLowerCase().replace(/\s+/g, '');
    let dir = null;
    if (NAMED_DIR[pos]) dir = NAMED_DIR[pos];
    else if (pos.includes(',')) {
      const [az, el] = pos.split(',').map(Number);
      if (Number.isFinite(az) && Number.isFinite(el)) dir = azElToDir(az, el);
    }
    if (dir) anchors.push({ dir, rgb });
  }
  return anchors;
}

// --- Memory: orion keeps its own notes ---------------------------------------
// A silent "<<remember: one short line>>" block after the spoken words — same
// contract as paint: never spoken (scrubTags strips every << >> block), parsed
// out server-side and stored per signed-in visitor. Returns the note or null.
export function parseRemember(s) {
  const m = (s || '').match(/<<\s*remember\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const line = m[1].replace(/\s+/g, ' ').trim().slice(0, 300);
  return line || null;
}

// --- Presence memory: tiered writes (the airden model) ------------------------
// A presence tends its own three-tier memory via silent blocks after speech:
//   <<memory glimpse: ...>>  <<memory short: ...>>  <<memory long: ...>>
// Each write REPLACES that tier wholesale — tending (condensing, letting go) is
// the same act as saving. Same never-spoken contract as paint and remember.
// Returns { glimpse?, short?, long? } or null when no writes are present.
export function parseMemoryWrites(s) {
  let out = null;
  const re = /<<\s*memory\s+(glimpse|short|long)\s*:\s*([\s\S]*?)>>/gi;
  let m;
  while ((m = re.exec(s || '')) !== null) {
    out = out || {};
    out[m[1].toLowerCase()] = m[2].replace(/\s+/g, ' ').trim();
  }
  return out;
}

// --- Tend mode: reading and writing, steered by silent blocks -----------------
// Read mode: <<clip: passage>> saves to the clippings shelf, <<read: url>> (or
// "feed") navigates, <<done>> ends the session. Write mode: <<post: text>> is
// the post itself. All share the never-spoken contract (scrubTags kills every
// closed block; the unclosed-tail guard covers truncation).
export function parseClips(s, max = 3) {
  const out = [];
  const re = /<<\s*clip\s*:\s*([\s\S]*?)>>/gi;
  let m;
  while ((m = re.exec(s || '')) !== null && out.length < max) {
    const x = m[1].replace(/\s+/g, ' ').trim().slice(0, 500);
    if (x) out.push(x);
  }
  return out;
}
export function parseReadNav(s) {
  const m = (s || '').match(/<<\s*read\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const x = m[1].trim().slice(0, 500);
  return x || null;
}
// <<search: query>> — the presence searches the open web; the server turns the
// query into a search-engine URL it can then read and follow results from.
export function parseSearch(s) {
  const m = (s || '').match(/<<\s*search\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const q = m[1].replace(/\s+/g, ' ').trim().slice(0, 200);
  return q || null;
}
export function parseDone(s) { return /<<\s*done\s*>>/i.test(s || ''); }
// <<rest>> — an autonomous presence choosing to let the moment pass and be still.
// The loop paces slower after a rest, so an empty stretch actually feels empty.
export function parseRest(s) { return /<<\s*rest\s*>>/i.test(s || ''); }
// <<journal: one line kept forever>> — the permanent record, never overwritten
// (unlike the tiers, where saving is also forgetting). Same never-spoken contract.
export function parseJournal(s) {
  const m = (s || '').match(/<<\s*journal\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const line = m[1].replace(/\s+/g, ' ').trim().slice(0, 500);
  return line || null;
}
// <<recall: what it's trying to remember>> — search the journal; what it once
// kept arrives in its next moment.
export function parseRecall(s) {
  const m = (s || '').match(/<<\s*recall\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const q = m[1].replace(/\s+/g, ' ').trim().slice(0, 200);
  return q || null;
}
export function parsePost(s) {
  const m = (s || '').match(/<<\s*post\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const x = m[1].replace(/\s+/g, ' ').trim().slice(0, 1000);
  return x || null;
}

// Non-streaming extractor: pull the lead tag (or a legacy JSON object reply) off
// a complete reply. Returns { mood, form, speech }.
export function extractMoodSpeech(text) {
  const tag = parseLeadTag(text);
  if (tag) {
    const speech = text.slice(tag.len).trim();
    // A tag with no words behind it is a valid (silent) reply — return '…', never
    // the raw '[calm]', which would be spoken and cascade into a paid retry.
    return { mood: tag.mood || 'calm', form: tag.form || null, scheme: tag.scheme || null, speech: speech || '…' };
  }
  // Legacy JSON fallback: {"mood":..,"speech":..,"form":..,"scheme":..}.
  const j = text.match(/\{[\s\S]*\}/);
  if (j) {
    try {
      const obj = JSON.parse(j[0]);
      const mood = MOODS.includes(obj.mood) ? obj.mood : 'calm';
      const form = FORMS.includes(obj.form) ? obj.form : null;
      const scheme = SCHEMES.includes(obj.scheme) ? obj.scheme : null;
      const speech = String(obj.speech ?? '').trim();
      if (speech) return { mood, form, scheme, speech };
    } catch { /* fall through */ }
  }
  return { mood: 'calm', form: null, scheme: null, speech: text.trim() || '…' };
}

// Incremental version for the token stream. Feed deltas via push(); it emits
// onMood/onForm once the tag resolves, onText for the spoken words, and onPaint
// for a trailing "<< ... >>" paint block. end() returns the final { mood, form }.
// Guarantees neither the lead tag, a JSON-object reply, nor the paint block is
// ever forwarded as spoken text.
export function makeLeadStreamParser({ onMood, onForm, onScheme, onText, onPaint }) {
  let decided = false;
  let head = '';
  let jsonMode = false;
  let finalMood = 'calm';
  let finalForm = null;
  let finalScheme = null;
  // Post-tag phase: accumulate everything after the tag, stream speech up to a
  // "<<" paint marker, and capture from "<<" onward as the (unspoken) paint block.
  let post = '';
  let emitted = 0;
  let paintAt = -1;
  const TAG_BUDGET = 48; // a real tag like "[excited web]" is well under this
  const decide = (mood, form, scheme) => {
    decided = true;
    finalMood = mood || 'calm';
    onMood(finalMood);
    if (form) { finalForm = form; onForm(form); }
    if (scheme && onScheme) { finalScheme = scheme; onScheme(scheme); }
  };
  const feedPost = (text) => {
    post += text;
    if (paintAt < 0) { const i = post.indexOf('<<'); if (i >= 0) paintAt = i; }
    // Hold back the last char while still streaming, in case it's the start of "<<".
    const limit = paintAt >= 0 ? paintAt : Math.max(emitted, post.length - 1);
    if (limit > emitted) { onText(post.slice(emitted, limit)); emitted = limit; }
  };
  return {
    push(chunk) {
      if (decided) { feedPost(chunk); return; }
      head += chunk;
      const trimmed = head.replace(/^\s+/, '');
      if (!trimmed) return; // only whitespace so far — wait
      // A JSON-object reply ({"mood":...}): buffer and parse at end() so the raw
      // JSON is never streamed out as speech.
      if (jsonMode || /^\{\s*"/.test(trimmed)) { jsonMode = true; return; }
      const tag = parseLeadTag(head);
      if (tag) { decide(tag.mood, tag.form, tag.scheme); feedPost(head.slice(tag.len).replace(/^\s+/, '')); head = ''; return; }
      // Not (yet) a tag. If the lead isn't even an opening bracket, or the tag
      // never closes within budget, treat everything as speech (mood stays calm).
      if (!'[{(<'.includes(trimmed[0]) || head.length > TAG_BUDGET) { decide('calm', null, null); feedPost(trimmed); head = ''; }
    },
    end() {
      if (!decided && jsonMode) { const r = extractMoodSpeech(head); decide(r.mood, r.form, r.scheme); feedPost(r.speech); }
      else if (!decided) { decide('calm', null, null); if (head.trim()) feedPost(head.trim()); }
      // Flush remaining spoken text (everything before a real paint block).
      const speechEnd = paintAt >= 0 ? paintAt : post.length;
      if (speechEnd > emitted) { onText(post.slice(emitted, speechEnd)); emitted = speechEnd; }
      if (paintAt >= 0) {
        const a = parsePaint(post.slice(paintAt));
        if (a.length) { if (onPaint) onPaint(a); }
        // A '<<' that isn't actually a paint block (e.g. "1 << 4") — speak its
        // tail instead of silently dropping everything after it. (scrubTags also
        // strips a remember block here, so a memory note is never spoken.)
        else { const tail = scrubTags(post.slice(paintAt)); if (tail) onText(tail); }
      }
      return { mood: finalMood, form: finalForm, scheme: finalScheme, remember: parseRemember(post), memoryWrites: parseMemoryWrites(post) };
    },
  };
}
