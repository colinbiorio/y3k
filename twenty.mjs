// TWENTY QUESTIONS, WITH A SEALED ANSWER. Colin, 2026-10-19: "tons of room to
// work on the world, new backgrounds, ui improvements, games, etc". Chess was
// the only game; this is the second, and the first one that is all talk.
//
// Two ways round:
//   IT THINKS, YOU ASK  the presence chooses a thing, on its owner's brain, and
//                       THIS SERVER keeps it. The page is given only a seal,
//                       sha256(`${salt}:${secret}`) in hex, before the first
//                       question, and the secret and the salt only when the
//                       game is over; the page hashes them itself
//                       (src/twenty-seal.js) and says whether they match.
//                       Honesty is a house value, and an AI that thinks of
//                       something and then answers questions about it is
//                       exactly the player who could quietly change its mind.
//                       The seal is how it shows it did not.
//   YOU THINK, IT ASKS  the person keeps the secret, in their head, and the
//                       presence asks; the person answers with buttons.
//
// This module is the game's state and the reading of the model's answers. The
// door (whose brain, whose game, the prompts) is server.mjs /api/twenty. Nothing
// here thinks, and nothing touches a disk: a game lives an hour in memory and
// is gone with a restart, which a game of twenty questions can afford.
import { createHash, randomBytes } from 'node:crypto';

export const MAX_QUESTIONS = 20;
// An hour from its start: a game of twenty questions is ten minutes, and one
// left open in a closed tab should not hold its secret on the server all day.
export const GAME_TTL_MS = 60 * 60 * 1000;
// A person plays one game at a time; three covers a reloaded tab or two (its
// game is lost with the page) without a fourth stranding anybody — starting
// one more lets that person's OLDEST go, never anyone else's.
export const GAMES_PER_USER = 3;
// And the whole site holds this many at once; past it a new game is refused
// (no one else's game is ever let go to make room for it).
export const GAMES_MAX = 2000;
export const ANSWERS = ['yes', 'no', 'sometimes', 'unknown'];
// What it is asked to choose from, one drawn at random for each game it thinks
// of (server.mjs): asked the same thing the same way, a model chooses the same
// lighthouse every time.
export const KINDS = ['an animal', 'something you could hold in one hand', 'a food or a drink', 'a place on Earth',
  'something found in nature', 'something in a house', 'a machine or a vehicle', 'a musical instrument',
  'something in the sky', 'a plant', 'a building or a landmark', 'a creature from a story', 'a tool', 'something people wear'];

// The seal. `${salt}:${secret}` hashed as UTF-8, in lowercase hex — the page
// computes the same with crypto.subtle (src/twenty-seal.js). The salt is 16
// random bytes, so a seal cannot be opened by hashing a dictionary of things.
export const sealOf = (salt, secret) => createHash('sha256').update(`${salt}:${secret}`, 'utf8').digest('hex');
export const newSalt = () => randomBytes(16).toString('hex');
const newId = () => randomBytes(9).toString('base64url');
export const isId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{12}$/.test(id);

// THE JSON IN A MODEL'S REPLY: from its first '{' to its last '}' (the server's
// jsonSpan, for the same reason: one pass, never a regex tried from every '{').
// Our objects are flat, so when trailing words carry a brace of their own the
// first object alone is tried as well. → a plain object, or null.
export function jsonOf(text) {
  const s = typeof text === 'string' ? text : '';
  const start = s.indexOf('{');
  if (start < 0) return null;
  for (const end of [s.lastIndexOf('}'), s.indexOf('}', start)]) {
    if (end <= start) continue;
    try {
      const v = JSON.parse(s.slice(start, end + 1));
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch { /* not this span */ }
  }
  return null;
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
// One line of the presence's: no control characters, no tags of the room's
// language (a beat ~flare~, a block <<…>>, a lead [calm] — it writes in them
// everywhere else, and the voice would read them out), cut at a word.
export function cleanLine(s, max = 160) {
  if (typeof s !== 'string') return '';
  let t = s.replace(CONTROL, ' ').replace(/<<[^<>]{0,400}>>/g, ' ').replace(/~[a-z]{2,8}(?: \d)?~/gi, ' ')
    .replace(/^\s*\[[a-z ]{1,40}\]/i, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '').trim() + '…';
  return t;
}
// A THING: what a secret or a guess may be. One line, some letters, at most 60
// characters, without the quotes and the full stop a model wraps it in. '' if
// it is not one.
export function cleanThing(s) {
  if (typeof s !== 'string') return '';
  const t = s.normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^["'“”‘’«»(\[]+/, '').replace(/["'“”‘’«».!?,;:)\]]+$/, '').trim();
  return t && t.length <= 60 && /\p{L}/u.test(t) ? t : '';
}

// Words, for comparing what was said with what is hidden: lower case, accents
// and apostrophes gone ("it's" is "its"), everything that is not a letter or
// a digit a space.
const norm = (s) => String(s || '').slice(0, 400).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/['’`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (s) => (s ? s.split(' ') : []);
// One word, or its plural: a cutting stemmer made "house" and "houses" two
// different words ("hous"), so a plural is matched by adding, never cutting.
const sameWord = (a, b) => a === b || a === b + 's' || a === b + 'es' || b === a + 's' || b === a + 'es';
const bare = (s) => s.replace(/^(?:a|an|the|some)\s+/, '');
const squash = (s) => s.replace(/ /g, '');
// Words too common to give anything away, and never hidden.
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'my', 'your', 'its', 'some', 'big', 'small', 'little', 'old', 'new']);

// DOES THIS LINE GIVE THE THING AWAY? Its line rides beside every answer, and a
// model asked "is it alive?" about a heron will happily say "yes, herons are".
// A line leaks when it holds the thing whole (spaced, or run together, so
// "light house" and "l-i-g-h-t-h-o-u-s-e" count) or any word of it worth
// hiding — unless the person said it first, in the question being answered:
// echoing their own word gives them nothing. A leaking line is not shown;
// the answer still is. Best effort, and said so: a person who talks it into
// a cipher has only spoiled their own game.
export function leaks(line, secret, heard = '') {
  const L = norm(line);
  const S = bare(norm(secret));
  if (!L || !S) return false;
  const H = norm(heard);
  const whole = ` ${L} `.includes(` ${S} `) || (squash(S).length >= 4 && squash(L).includes(squash(S)));
  if (whole && !(squash(S).length && squash(H).includes(squash(S)))) return true;
  const said = words(H), lineWords = words(L);
  for (const w of words(S)) {
    if (w.length < 3 || STOP.has(w) || said.some((x) => sameWord(x, w))) continue;
    if (lineWords.some((x) => sameWord(x, w))) return true;
  }
  return false;
}

// DOES THIS QUESTION NAME IT? "is it a lighthouse?", "a light house?", "my
// guess is the lighthouse": the question, without its asking words and its
// article, is the thing (singular or plural, spaced or not). The model also
// says whether a guess is right (a name for exactly the same thing counts),
// but a question that names the thing word for word is found whatever it says.
const ASKING = /^(?:(?:so|ok|okay|then|well|hmm|and|my guess is|my guess|i guess|i think|is it|its|it is|is that|are you thinking of|youre thinking of|could it be|maybe|perhaps|final answer|guess)\s+)+/;
export function namesIt(question, secret) {
  const q = bare(norm(question).replace(ASKING, ''));
  const s = bare(norm(secret));
  if (!q || !s) return false;
  return sameWord(squash(q), squash(s));
}

// An answer word, as a model may write it. → one of ANSWERS, or ''.
const ANSWER_WORDS = {
  yes: 'yes', y: 'yes', yeah: 'yes', yep: 'yes', true: 'yes',
  no: 'no', n: 'no', nope: 'no', false: 'no',
  sometimes: 'sometimes', partly: 'sometimes', partially: 'sometimes', maybe: 'sometimes', perhaps: 'sometimes', depends: 'sometimes', 'it depends': 'sometimes', 'kind of': 'sometimes', 'sort of': 'sometimes',
  unknown: 'unknown', 'dont know': 'unknown', 'i dont know': 'unknown', 'not sure': 'unknown', unsure: 'unknown', irrelevant: 'unknown', 'cant say': 'unknown',
};
// (own keys only: a model that answers "constructor" has not answered)
export const answerWord = (s) => {
  const k = typeof s === 'string' ? norm(s) : '';
  return Object.hasOwn(ANSWER_WORDS, k) ? ANSWER_WORDS[k] : '';
};

// ---- what the model said, read ------------------------------------------------
// Each → what the route needs, or null: an answer that is not one is never a
// turn, and the route says to ask again without counting anything.

// Its choice: { secret, say } — the say line never gives it away.
export function parseSecret(text) {
  const o = jsonOf(text);
  const secret = cleanThing(o?.secret);
  if (!secret) return null;
  const say = cleanLine(o.say, 160);
  return { secret, say: leaks(say, secret) ? '' : say };
}
// Its answer to a question about its own thing: { answer, hit, say }. A hit is
// a question that names it (namesIt), or one the model calls correct while
// answering yes; a hit is a yes, whatever word the model wrote, and a line it
// wrote for some other answer is not said beside it. A line that would give
// the thing away while the game goes on is dropped (leaks).
export function parseAnswer(text, secret, question) {
  const o = jsonOf(text);
  const answer = answerWord(o?.answer);
  if (!answer) return null;
  const hit = namesIt(question, secret) || (answer === 'yes' && (o.correct === true || o.correct === 'true'));
  const say = cleanLine(o.say, 160);
  if (hit) return { answer: 'yes', hit, say: answer === 'yes' ? say : '' };
  return { answer, hit, say: leaks(say, secret, question) ? '' : say };
}
// Its next move when the person thinks: { guess, q, say } — a question to
// answer, or a guess (guess: true) to say right or wrong to.
export function parseMove(text) {
  const o = jsonOf(text);
  if (!o) return null;
  const say = cleanLine(o.say, 120);
  const guess = cleanThing(o.guess);
  if (guess) return { guess: true, q: guess, say };
  const ask = cleanLine(o.ask, 200);
  return ask && /\p{L}/u.test(ask) ? { guess: false, q: ask, say } : null;
}

// ---- the games ---------------------------------------------------------------
// A game: { id, uid, pid, mode: 'it' | 'you', t0, turns, over, busy } and, when
// the presence thinks of the thing, { secret, salt, seal }; when the person
// does, `pending`, the question or guess waiting for their answer. A turn is
// { q, a, say } (it thinks: their question, its answer and line) or
// { q, guess, a, say } (they think: its question or guess and line, their
// answer). `over` is { winner: 'person' | 'presence' | null, how }.
export function createGames({ now = () => Date.now(), ttl = GAME_TTL_MS, perUser = GAMES_PER_USER, max = GAMES_MAX } = {}) {
  const games = new Map();
  function sweep() {
    const t = now();
    for (const [id, g] of games) if (t - g.t0 > ttl) games.delete(id);
  }
  // Whether the site holds room for one more game (asked before the model is,
  // so a full site spends nobody's turn).
  function room() { sweep(); return games.size < max; }
  // A new game, once the presence has chosen (it thinks) or straight away
  // (they think). This person's oldest goes first if they hold `perUser`
  // already. → the game, or null when the site holds all it holds.
  function start(uid, pid, mode, secret = null) {
    sweep();
    const mine = [...games.values()].filter((g) => g.uid === uid).sort((a, b) => a.t0 - b.t0);
    while (mine.length >= perUser) games.delete(mine.shift().id);
    if (games.size >= max) return null;
    const g = { id: newId(), uid, pid, mode: mode === 'you' ? 'you' : 'it', t0: now(), turns: [], over: null, busy: false, pending: null };
    if (g.mode === 'it') { g.secret = secret; g.salt = newSalt(); g.seal = sealOf(g.salt, secret); }
    games.set(g.id, g);
    return g;
  }
  // One person's game, and only theirs: another account's id is no game at
  // all to them (the route says 404, not 403 — it does not say one exists).
  function get(uid, id) {
    sweep();
    const g = isId(id) ? games.get(id) : null;
    return g && g.uid === uid ? g : null;
  }
  // → true when this call ended it (the route keeps the memory only then)
  function finish(g, winner, how) {
    if (!g || g.over) return false;
    g.over = { winner, how };
    g.pending = null;
    return true;
  }
  // When an account closes, its games go with it.
  function forget(uid) { for (const [id, g] of games) if (g.uid === uid) games.delete(id); }
  return { room, start, get, finish, forget, view, get size() { return games.size; } };
}

// WHAT THE PAGE IS SHOWN. The seal from the start; the secret and the salt
// only once the game is over — this is the one place a game becomes words for
// the page, so it is the one place that rule is kept.
export function view(g) {
  const v = { id: g.id, mode: g.mode, n: g.turns.length, left: MAX_QUESTIONS - g.turns.length,
    turns: g.turns.map((t) => (g.mode === 'it' ? { q: t.q, a: t.a, say: t.say, ...(t.hit ? { hit: true } : {}) } : { q: t.q, guess: !!t.guess, a: t.a, say: t.say })) };
  if (g.mode === 'it') v.seal = g.seal;
  if (g.pending) v.pending = { q: g.pending.q, guess: !!g.pending.guess, say: g.pending.say };
  if (g.over) {
    v.over = { ...g.over };
    if (g.mode === 'it') v.reveal = { secret: g.secret, salt: g.salt };
  }
  return v;
}

// THE LINE IT KEEPS, on its shelf, the way a chess game is kept (server.mjs
// /api/chess/finished): one short sentence in its own first person, folded in
// later by its own consolidation. A game with no questions in it is not kept.
export function clipOf(g, opp = 'someone') {
  const n = g.turns.length;
  if (!g.over || !n) return '';
  const qs = (k) => `${k} question${k === 1 ? '' : 's'}`;
  const head = `played twenty questions with ${opp}:`;
  if (g.mode === 'it') {
    const it = `I thought of "${g.secret}"`;
    if (g.over.how === 'found') return `${head} ${it}, and they found it with question ${n}.`;
    if (g.over.how === 'out') return `${head} ${it}, and twenty questions did not find it.`;
    return `${head} ${it}; they stopped after ${qs(n)} and I showed them.`;
  }
  const last = [...g.turns].reverse().find((t) => t.guess);
  if (g.over.how === 'guessed') return `${head} they thought of something, and I found it with question ${n}: "${last?.q || '?'}".`;
  if (g.over.how === 'out') return `${head} they thought of something, and I did not find it in twenty questions${last ? ` (my last guess was "${last.q}")` : ''}.`;
  return `${head} they thought of something, and we stopped after ${qs(n)}.`;
}
