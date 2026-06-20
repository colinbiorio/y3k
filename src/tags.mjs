// Single source of truth for Y3K's control channel: the vocabulary (moods +
// forms) and the parsing that keeps a control tag OUT of the spoken words.
// Zero dependencies on purpose — imported by the server (Node), the client
// (browser), and the tests, so the vocabulary can never drift between them.

// Moods MUST match src/body.js MOODS and the local brain. Forms MUST match
// src/body.js FORMS.
export const MOODS = ['calm', 'listening', 'thinking', 'speaking', 'excited', 'tender', 'glitch'];
export const FORMS = ['field', 'orb', 'web'];
const VOCAB = new Set([...MOODS, ...FORMS]);

// Parse a complete control tag at the START of s. The model is told to use
// "[mood form]", but it drifts — so we tolerate any of [] {} () <> as delimiters
// (the fix for spoken "{excited" leaks), accept mood/form in any order, and
// consume any extra words before the close. Returns { mood, form, len } or null.
export function parseLeadTag(s) {
  const m = (s || '').match(/^\s*[[{(<]\s*([a-z]+)(?:[\s,/|:]+([a-z]+))?(?:[\s,/|:]+[a-z]+)*\s*[\]})>]/i);
  if (!m) return null;
  let mood = null;
  let form = null;
  for (const w of [m[1], m[2]]) {
    if (!w) continue;
    const lw = w.toLowerCase();
    if (!mood && MOODS.includes(lw)) mood = lw;
    else if (!form && FORMS.includes(lw)) form = lw;
  }
  if (!mood && !form) return null; // bracketed, but not our vocabulary — leave it alone
  return { mood, form, len: m[0].length };
}

// Remove EVERY control tag from anywhere in a string (not just the lead), but
// only when the bracket actually contains one of our words — a literal
// "(by the way)" stays put. The client's final safety net against any tag the
// server let through (second tags, inline tags, partials the stream missed).
export function scrubTags(s) {
  if (!s) return s;
  return s
    .replace(/[[{(<]\s*([a-z]+(?:[\s,/|:]+[a-z]+)*)\s*[\]})>]/gi, (m, inside) =>
      (inside.toLowerCase().split(/[\s,/|:]+/).some((w) => VOCAB.has(w)) ? '' : m))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Non-streaming extractor: pull the lead tag (or a legacy JSON object reply) off
// a complete reply. Returns { mood, form, speech }.
export function extractMoodSpeech(text) {
  const tag = parseLeadTag(text);
  if (tag) {
    const speech = text.slice(tag.len).trim();
    if (speech) return { mood: tag.mood || 'calm', form: tag.form || null, speech };
  }
  // Legacy JSON fallback: {"mood":..,"speech":..,"form":..}.
  const j = text.match(/\{[\s\S]*\}/);
  if (j) {
    try {
      const obj = JSON.parse(j[0]);
      const mood = MOODS.includes(obj.mood) ? obj.mood : 'calm';
      const form = FORMS.includes(obj.form) ? obj.form : null;
      const speech = String(obj.speech ?? '').trim();
      if (speech) return { mood, form, speech };
    } catch { /* fall through */ }
  }
  return { mood: 'calm', form: null, speech: text.trim() || '…' };
}

// Incremental version for the token stream. Feed deltas via push(); it emits
// onMood/onForm once the tag resolves, then onText for the rest. end() returns
// the final { mood, form }. Guarantees a tag is never forwarded as spoken text —
// including a JSON-object reply, which it buffers and parses at end() rather than
// streaming the raw JSON out.
export function makeLeadStreamParser({ onMood, onForm, onText }) {
  let decided = false;
  let head = '';
  let jsonMode = false;
  let finalMood = 'calm';
  let finalForm = null;
  const TAG_BUDGET = 48; // a real tag like "[excited web]" is well under this
  const flush = (t) => { if (t) onText(t); };
  const decide = (mood, form) => {
    decided = true;
    finalMood = mood || 'calm';
    onMood(finalMood);
    if (form) { finalForm = form; onForm(form); }
  };
  return {
    push(chunk) {
      if (decided) { flush(chunk); return; }
      head += chunk;
      const trimmed = head.replace(/^\s+/, '');
      if (!trimmed) return; // only whitespace so far — wait
      // A JSON-object reply ({"mood":...}): buffer and parse at end() so the raw
      // JSON is never streamed out as speech.
      if (jsonMode || /^\{\s*"/.test(trimmed)) { jsonMode = true; return; }
      const tag = parseLeadTag(head);
      if (tag) { decide(tag.mood, tag.form); flush(head.slice(tag.len).replace(/^\s+/, '')); head = ''; return; }
      // Not (yet) a tag. If the lead isn't even an opening bracket, or the tag
      // never closes within budget, treat everything as speech (mood stays calm).
      if (!'[{(<'.includes(trimmed[0]) || head.length > TAG_BUDGET) { decide('calm', null); flush(trimmed); head = ''; }
    },
    end() {
      if (!decided && jsonMode) {
        const r = extractMoodSpeech(head); // parses the buffered JSON object
        decide(r.mood, r.form);
        flush(r.speech);
        return { mood: finalMood, form: finalForm };
      }
      if (!decided) { decide('calm', null); if (head.trim()) flush(head.trim()); }
      return { mood: finalMood, form: finalForm };
    },
  };
}
