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
export const SCHEMES = ['aurora', 'ember', 'abyss', 'terra', 'eclipse', 'bloom', 'verdant', 'dusk', 'frost', 'synthwave'];
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
    .replace(/<<[\s\S]*?>>/g, '')           // paint blocks — never spoken
    .replace(/[[{(<]\s*([a-z]+(?:[\s,/|:]+[a-z]+)*)\s*[\]})>]/gi, (m, inside) =>
      (inside.toLowerCase().split(/[\s,/|:]+/).some((w) => VOCAB.has(w)) ? '' : m))
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

// Non-streaming extractor: pull the lead tag (or a legacy JSON object reply) off
// a complete reply. Returns { mood, form, speech }.
export function extractMoodSpeech(text) {
  const tag = parseLeadTag(text);
  if (tag) {
    const speech = text.slice(tag.len).trim();
    if (speech) return { mood: tag.mood || 'calm', form: tag.form || null, scheme: tag.scheme || null, speech };
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
      // Flush remaining spoken text (everything before the paint block).
      const speechEnd = paintAt >= 0 ? paintAt : post.length;
      if (speechEnd > emitted) { onText(post.slice(emitted, speechEnd)); emitted = speechEnd; }
      if (paintAt >= 0 && onPaint) { const a = parsePaint(post.slice(paintAt)); if (a.length) onPaint(a); }
      return { mood: finalMood, form: finalForm, scheme: finalScheme };
    },
  };
}
