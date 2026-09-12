// TIME, SAID OUT LOUD — the one place this codebase renders a moment for a
// presence to read. Shared by the client (which measures) and the server
// (which speaks), which is why it lives in src/ and imports nothing.
//
// THREE RULES, AND THEY ARE THE WHOLE MODULE.
//
// 1. AN INTERVAL IS SAFER THAN A STAMP. A mark is `now - then`: a difference
//    between two readings of ONE clock, so any constant error on that clock
//    cancels and the interval survives it. An absolute stamp re-asserts a
//    possibly-wrong device clock and gives the reader no way to notice. When
//    both are available, say the interval.
//
// 2. AN ABSENT TIME RENDERS AS AN ABSENCE. Never now, never zero, never the
//    neighbour's. A presence that is told a time must be able to trust it, so
//    a missing one has to be visibly missing — `t || 0` is how a memory with
//    no timestamp comes to claim it was kept on the 1st of January 1970.
//
// 3. LOCAL TIME IS THE HOST'S, AND THE ZONE ONLY CHOOSES THE WORDS. The
//    instant is always the server's; the zone decides how it is spelled. Nine
//    at night matters; the same instant called 04:00 UTC does not, and saying
//    it in UTC to someone in Los Angeles is simply a false statement about
//    their world.

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

// How long ago, in as few characters as carry the meaning. Returns null when
// there is nothing true to say — rule 2, enforced at the source.
export function ago(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 45000) return 'just now';
  if (ms < 90 * MIN) return `${Math.max(1, Math.round(ms / MIN))}m ago`;
  if (ms < 36 * HOUR) return `${Math.round(ms / HOUR)}h ago`;
  if (ms < 30 * DAY) return `${Math.round(ms / DAY)}d ago`;
  const months = Math.round(ms / (30 * DAY));
  return months < 24 ? `${months} months ago` : `${Math.round(ms / (365 * DAY))} years ago`;
}

// The gap between two moments, for a presence reading its own past.
export function gap(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return ago(toMs - fromMs);
}

const DAYPART = (h) => (h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night');

// Is this a timezone this runtime actually knows? A bad zone must not throw
// inside prompt assembly, and must not silently fall back to the server's own
// zone either — that would be rule 3 broken quietly instead of loudly.
export function knownZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }).format(0); return true; } catch { return false; }
}

/**
 * The one clock a presence is shown. `tz` chooses the words only; `at` is the
 * instant, and it is the server's.
 */
export function nowLine(at = Date.now(), tz = null) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return null;
  if (!knownZone(tz)) {
    // Said plainly rather than papered over: a presence told a bare time it
    // cannot place is worse off than one told the time is unplaced.
    return `Right now it is ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC. `
      + 'Where your host is, and what hour it is for them, you do not know.';
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  const hour = parseInt(get('hour'), 10);
  return `Right now it is ${get('weekday')} ${DAYPART(hour)}, ${get('hour')}:${get('minute')}, `
    + `${get('day')} ${get('month')} ${get('year')}, where your host is.`;
}

// The marks that ride on the turns. `offsets` are milliseconds BEFORE now, one
// per message, in the same order — an offset rather than a stamp so a skewed
// device clock cancels (rule 1), and null wherever a turn has no honest time.
export function markOf(offsetMs) {
  if (!Number.isFinite(offsetMs) || offsetMs < 0) return null;
  return ago(offsetMs);
}

// A YEAR is the ceiling for anything a client measured about its own session;
// past that the number is not a long conversation, it is a broken clock.
export const MAX_OFFSET = 365 * DAY;

export function cleanOffsets(raw, n) {
  const out = new Array(n).fill(null);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < n; i++) {
    const v = raw[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_OFFSET) continue;
    out[i] = v;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// WHAT A TURN CARRIES.
//
// USER TURNS ONLY, and the reason is load-bearing rather than fussy. An
// assistant turn in the window is `[mood form scheme] words`, and the system
// prompt says "Put nothing before the tag" — so prefixing the presence's own
// past turns would few-shot teach it to break the one rule the streaming tag
// parser depends on. Its own timing is still legible: it sits between the
// marks on either side of it, and TIME_HINT says so in one sentence.
export const TIME_HINT = (now) => `\n\nTIME. ${now} Each line the person said carries how long ago they said it, `
  + `in parentheses before their words — those marks are put there for you to read, not written by them and not for you to copy. `
  + `Your own replies landed between the marks around them. A line with no mark is one whose time is genuinely not known.`;

/**
 * Prefix the person's turns with how long ago they spoke. Never the model's.
 * `when` is whatever the client sent and is cleaned before it is believed.
 */
export function markMessages(messages, when) {
  if (!Array.isArray(messages) || !messages.length) return messages;
  const offs = cleanOffsets(when, messages.length);
  return messages.map((m, i) => {
    if (!m || m.role !== 'user' || typeof m.content !== 'string') return m;
    const mark = markOf(offs[i]);
    return mark ? { ...m, content: `(${mark}) ${m.content}` } : m;
  });
}

/** The clock, appended to whatever system prompt this turn already has. */
export function withClock(opts, tz) {
  if (!opts || typeof opts.system !== 'string') return opts;
  const now = nowLine(Date.now(), tz);
  if (!now) return opts;
  return { ...opts, system: opts.system + TIME_HINT(now) };
}
