// The brain decides BOTH what Y3K says and how its body should look: every
// reply is { mood, speech }. It goes through the server's proxy, on the
// person's own key (Settings → Brain) or their own Claude sign-in (own-brain.js).
// The site has no key of its own (Colin, 2026-10-12: "i don't have the budget to
// let anyone charge me for free"), so with neither there is no brain, and the
// orb says so (NO_PROVIDER, below) instead of answering.


import { MOODS, FORMS, SCHEMES, MORPHS, scrubTags } from './tags.mjs';
import { PROVIDER_NAMES, modelName } from './models.js';
import { BRAIN_BODY_MAX } from './media-rules.mjs';
import { ownDeclined, ownChoice, ownChoiceFor } from './own-brain.js';

const BRAIN_KEY = 'y3k.brain'; // localStorage: { provider, key, model }

// [{ role, content, t }] — t is when the line was actually said. It NEVER goes
// on the wire as a stamp: the two assembly sites below project each entry back
// to { role, content } (an unknown key on a message object is forwarded
// verbatim to the provider) and send the times separately, as offsets before
// now. An offset is a difference between two readings of this one clock, so a
// device whose clock is wrong still reports true intervals.
const history = [];

// Store assistant turns in the SAME format the model is taught to emit
// ('[mood form color] words'), NOT JSON — otherwise its own past turns few-shot
// teach it to reply in JSON, which the stream parser buffers whole and never
// forwards (a silent SSE the proxy then kills).
const asAssistant = (mood, form, scheme, speech) =>
  `[${[mood, form, scheme].filter(Boolean).join(' ')}] ${speech || ''}`.trim();

// A visitor's bring-your-own key lives only in this browser. Shared with settings.js.
export function getBrainConfig() {
  try { const c = JSON.parse(localStorage.getItem(BRAIN_KEY)); return c && c.key ? c : null; }
  catch { return null; }
}
export function setBrainConfig(c) {
  if (c && c.key) localStorage.setItem(BRAIN_KEY, JSON.stringify(c));
  else localStorage.removeItem(BRAIN_KEY);
  if (c?.key && c.provider) keepKey(c.provider, { key: c.key, model: c.model || null });
  modelChanged();
}
// What is thinking may have changed: the name under the wordmark follows (main.js).
export const modelChanged = () => { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('y3k:model')); };

// ONE KEY PER PROVIDER, KEPT. Settings → Brain picks a provider from a list;
// the key in use (above) is that provider's, and choosing another — Claude
// Code, or a different key — sets it aside rather than losing it. Same
// browser, same storage as the key in use; only Clear in Settings, or leaving
// the account (forgetAccount, below), forgets one.
const KEYS_KEY = 'y3k.brainKeys';
const allKeys = () => { try { return JSON.parse(localStorage.getItem(KEYS_KEY)) || {}; } catch { return {}; } };
function keepKey(provider, v) {
  try { const all = allKeys(); if (v) all[provider] = v; else delete all[provider]; localStorage.setItem(KEYS_KEY, JSON.stringify(all)); } catch { /* private window */ }
}
export const keyFor = (provider) => allKeys()[provider] || null;
export const forgetKey = (provider) => keepKey(provider, null);

// WHAT LEAVES WITH THE PERSON (2026-10-08). Every key above lives in this
// browser and in no account, so on a shared computer the next person to sign
// in spent the last one's key on every turn, could read it back in Settings →
// Brain, and inherited their yes to its own hours. Signing out, deleting the
// account, and a different account (or a guest) coming through the door all
// forget it: the brain keys and the choices made with them, the hours, the
// voice keys and the lichess tokens. y3k.owner is whose they were, so a
// session that simply ran out still hands nothing to whoever comes next.
// Two things stay, because they are not the person's to take with them and
// hand nothing on: kode's pairing with y3kode (the computer's, kept with the
// account that made it) and the ids of the accounts that chose Claude Code
// here (y3k.ownBrain.accounts): own-brain.js mayDefault reads both, so the
// default stays theirs and never becomes the next account's.
const ACCOUNT_KEYS = ['y3k.brain', KEYS_KEY, 'y3k.brainPick', 'y3k.brainModels', 'y3k.ownBrain', 'y3k.ownModel',
  'y3k.hours', 'y3k.hours.turn', 'y3k.hours.lease', 'y3k.lichess', 'y3k.lichess.bot', 'y3k.lichess.pkce'];
const ACCOUNT_PREFIXES = ['y3k.voicekey'];   // y3k.voicekey and y3k.voicekey.<service> (voice.js)
const OWNER_KEY = 'y3k.owner';
export function forgetAccount() {
  let names = [];
  try { for (let i = 0; i < localStorage.length; i++) names.push(localStorage.key(i)); } catch { names = []; }
  for (const k of names) {
    if (!k || !(k === OWNER_KEY || ACCOUNT_KEYS.includes(k) || ACCOUNT_PREFIXES.some((p) => k.startsWith(p)))) continue;
    try { localStorage.removeItem(k); } catch { /* private window: nothing was kept */ }
  }
  modelChanged();
}
// Called at the door (main.js enterApp), before anything reads a key. Keys
// kept for anyone else (another account, or a guest) are forgotten; keys kept
// before this existed have no owner, and whoever comes in next claims them.
// It also says who came in, for the line said when nothing thinks (noBrain),
// until main.js says how to ask who is here now (accountHere, below).
let door;   // undefined: nobody has come through the door yet
const doorId = () => (door?.id ? String(door.id) : 'guest');
export function claimBrowser(account) {
  door = account || null;
  let owner = null;
  try { owner = localStorage.getItem(OWNER_KEY); } catch { return; }
  const id = doorId();
  if (owner && owner !== id) forgetAccount();
  if (owner !== id) { try { localStorage.setItem(OWNER_KEY, id); } catch { /* private window */ } }
  watchOwner();
}
// ONE PAGE, ONE ACCOUNT, FOR EVERY TURN (2026-10-12). own-brain.js stops a
// stale tab's stream when another tab changes whose this browser is, but the
// tab itself went on: its conversation, dance, chess, match and posts went out
// with the cookie the browser holds now, someone else's, as that account's
// turns, into their memory and onto their plan. So the page reloads when
// another tab changes whose this browser is (signed out there, someone else
// or a guest came in, the storage cleared), and is a page for whoever is here
// now: their own, or the door. A guest's page too: its turns would be the new
// account's as well. Storage events reach only the OTHER tabs, so the tab
// that claims never reloads itself. Each thinking request also names the
// account it is for (keyFields `as`), and the site refuses one that is not
// the session's and writes nothing (409, reason 'reload': a page whose
// storage could not be watched, or a turn already on its way): the
// conversation reloads then too (respond, streamRequest).
export const reloadPage = () => { try { globalThis.location?.reload?.(); } catch { /* no page (tests) */ } };
// …and so does every other door that carries keyFields (2026-10-12). Only the
// conversation read the word: airden blamed the provider, chess and a match
// toasted the bare word 'reload', a post said it could not write, Code's note
// and voice said nothing had come, and the komputer asked again every beat,
// for good, after the session it was for was gone. Each answer to such a
// request is read here: true when it was that refusal, and the page is
// reloading, so the caller asks nothing again and says nothing of its own
// (airden.js, tend.js, chess.js, match-view.js, social.js, main.js codeLink).
export function reloaded(answer) {
  if (answer?.reason !== 'reload') return false;
  reloadPage();
  return true;
}
let watching = null;   // the window listened on, once
function watchOwner(win = globalThis.window) {
  if (!win?.addEventListener || watching === win) return;
  watching = win;
  win.addEventListener('storage', (e) => {
    if (e?.key != null && e.key !== OWNER_KEY) return;   // key null: the whole storage was cleared
    let owner = null;
    try { owner = localStorage.getItem(OWNER_KEY); } catch { /* unreadable: nobody's */ }
    if (owner !== doorId()) reloadPage();
  });
}

// THE PRESENCE'S LIFE — its games, its own beats — runs on its owner's key, or
// on its owner's own Claude plan: any signed-in account, through a page of
// theirs and y3kode on their own computer (own-brain.js, own-relay.mjs). The
// server says whether that is offered for this session (/api/health
// `ownBrain`); asked after sign-in, and again when that changes. With it, a
// conversation goes to the server with no key at all.
let ownBrain = false;
// The site could not be asked at all (no answer from /api/health). That is the
// connection, not a person with no brain. It used to be remembered as "no
// brain", so a phone that lost its signal once was told to add an AI provider
// for the rest of the visit. Now it is asked again next time, and the turn
// that found it says it is the connection (respond).
let unreached = false;
export async function checkOwnBrain() {
  try { ownBrain = !!(await fetch('/api/health', { cache: 'no-store' }).then((x) => x.json())).ownBrain; unreached = false; }
  catch { unreached = true; /* keeps what it knew */ }
  return ownBrain;
}
// …unless THIS page chose another provider in Settings → Brain (own-brain.js
// ownDeclined): the site offers the account's own sign-in while any page of
// theirs does, and a choice made here holds here all the same.
const ownHere = () => ownBrain && !ownDeclined();
export const canLive = () => !!getBrainConfig()?.key || ownHere();
// …and whether that is the plan, not a key: what it does draws no budget.
// Pages read for it ask the site not to charge them (tend.js, main.js: own=1).
export const onOwnPlan = () => !getBrainConfig()?.key && ownHere();
// THE RUNG THIS PAGE CHOSE, for a request body: the owner's key, if there is
// one, and `own: false` whenever the choice here is not Claude Code (a key, or
// another provider with or without one). The site takes any keyless turn on
// the account's own sign-in while one of their pages offers it, so without
// this a phone set to another provider was answered by the laptop's Claude
// plan. With Claude Code chosen, or nothing chosen, nothing is added: the site
// decides, as before. Every route that may think on it reads this.
// …and WHOSE PAGE IT IS (`as`: the account here, accountHere below), so a
// tab left open after someone else signed in elsewhere in this browser is
// refused (409 reload) rather than thinking as them (claimBrowser, above).
export function keyFields() {
  const as = whoseFields();
  const c = getBrainConfig();
  if (c?.key) return { key: c.key, provider: c.provider, model: c.model, own: false, ...as };
  return ownDeclined() ? { own: false, ...as } : as;
}
// …said on its own for a door that writes for an account without thinking
// (chess.js /api/chess/finished: the game onto the presence's shelf), which
// has no use for the key. A guest's page says it is one (`as: ''`,
// 2026-10-12). It named no one, as a page from before this does, so a guest
// tab left open after someone signed in elsewhere in this browser (its
// storage not watched, or a turn already on its way) could not be told from
// that account's own page, and its turns went in as theirs. The site lets ''
// through only while nobody is signed in (server.mjs forAnother). Only a page
// with no main.js, that nobody has come through the door of yet, names
// nothing, as before: main.js says how to ask as it loads (accountHere), and
// its `account` is null for a guest.
export function whoseFields() {
  const a = here();
  if (a === undefined) return {};
  return { as: a?.id ? String(a.id) : '' };
}

// WHETHER A TURN CAN THINK, for a turn with no key: the account's own sign-in
// is offered and this page did not choose otherwise. When it is not known to
// be offered, the site is asked, and the turn waits for the answer: a visit's
// first turn could otherwise go out before the first ask came back and be
// told it had no brain. (The turn used to wait the same way on whether the
// site had a key of its own. It has none since 2026-10-12.)
async function ownReady() {
  if (ownDeclined()) { unreached = false; return false; }   // nothing asked: not the connection
  return ownBrain || (await checkOwnBrain());
}

// WHAT THE ORB SAYS WHEN NOTHING ANSWERED. It used to answer anyway, from a
// pool of canned lines in its own voice ("I'm here. Tell me what's on your
// mind.", "Interesting — I'm working through it."), so a site with no brain
// looked like an orb being vague (Colin, after deleting the site's key: "it
// stopped responding" — it had, and it went on talking). Now it says what is
// missing, off the air, and the unanswered line is not kept as if answered.
// It names both ways in, because there is no third: the site pays for no one's
// AI (2026-10-12). Claude Code is listed there for a signed-in account.
// `to` opens it with what it is for (below, noBrain).
const accountLine = (to) => `${to}, add your own API key or choose Claude Code in Settings → Brain. The site has no AI key of its own.`;
export const NO_PROVIDER = accountLine('To talk with y3k');
// …but that was the only line, said to everyone (2026-10-12). A guest was told
// to choose Claude Code, which a guest is not offered (the site hands a turn
// only to a page of the account it is for): they are told to sign in for it.
const guestLine = (to) => `${to}, add your own API key in Settings → Brain, or sign in to think on your own Claude plan. The site has no AI key of its own.`;
export const NO_PROVIDER_GUEST = guestLine('To talk with y3k');
// And someone who had chosen Claude Code was told to choose it. What is
// missing there is y3kode answering, and Settings → Brain says why it is not.
export const OWN_UNREACHED = 'You chose Claude Code, but y3kode is not answering on this computer, so nothing can think yet. Settings → Brain shows what it needs.';
// …and an account whose Claude Code is the DEFAULT, not a choice (own-brain.js
// ownChoiceFor `auto`: no key saved, on a y3kode it made its own here), was
// told NO_PROVIDER, to choose what it already thinks on. Nothing was chosen,
// so it is not told it chose; and the default also waits for Claude Code
// itself, or stops on a computer that said no, so it is not told y3kode alone
// is the trouble. Settings → Brain says which, and a key is the other way in.
export const OWN_DEFAULT_UNREACHED = 'Your presence thinks on Claude Code through y3kode on this computer, but it cannot think there yet. Settings → Brain shows what it needs, or add your own API key there.';
// WHO IS HERE NOW (2026-10-12). The guest line was picked by a latch set at
// the door (claimBrowser), and a session check that answered after a guest
// had already gone in (main.js: a slow answer is not a guest) made them a
// member without passing the door again: the latch still said guest, and a
// member was told to sign in. main.js now says how to ask (accountHere: the
// account it holds, whenever it changes), and the line asks each time it is
// said. Until it does, what the door saw stands (a page with no main.js).
let here = () => door;
export function accountHere(get) { if (typeof get === 'function') here = get; }
const guestHere = () => { const a = here(); return a !== undefined && !a?.id; };
// The line for nothing thinking, by who is here and what they chose here; an
// account with nothing chosen to think on gets NO_PROVIDER. EVERY ONE PICKED
// HERE (2026-10-12): the dance, a waking, the world's play, a post written
// by the presence and a chess move each had a line of their own, and each
// sent the person to add a key whatever they had chosen. They ask here now,
// `to` saying what it was for ('For your presence to dance'), so each says
// the same thing for the same state. What they chose is the choice IN EFFECT
// (own-brain.js ownChoiceFor, as main.js starts the page's offer with): an
// explicit one, or the default Claude Code an account with no key thinks on.
export function noBrain(to = 'To talk with y3k') {
  if (guestHere()) return guestLine(to);
  if (ownChoice()?.provider === 'claude') return OWN_UNREACHED;
  return ownChoiceFor(here(), !!getBrainConfig())?.auto ? OWN_DEFAULT_UNREACHED : accountLine(to);
}
// …and when there is one, in this browser, and it did not answer
export const PROVIDER_FAILED = 'Your AI provider in Settings → Brain did not answer. Check it there, then try again.';
// …and when it is your own Claude plan, through y3kode, that did not answer.
// Telling someone thinking on their own plan to add a provider sent them to
// look for one they already had. The server cannot say why from here (only
// y3kode heard Claude Code), and the reason the line names is the one that is
// not a fault: the plan's own usage limit, which is the only limit on a turn
// there (2026-10-12) and is waited out like anyone's.
export const OWN_FAILED = 'Claude Code on your computer did not answer. If your Claude plan has reached its usage limit, your presence answers again when it resets. Settings → Brain shows where Claude Code stands.';
// …and when an attached picture, with the conversation it rides beside, is
// more than a turn can carry (respondStream)
export const PICTURE_TOO_LARGE = 'That picture is too large to send with this conversation. Try a smaller one.';

// WHY IT DID NOT ANSWER, when that is known. PROVIDER_FAILED was the only line
// for every failure, so a revoked key, an empty account, a rate limit, a model
// the key cannot use, a provider's bad hour and a phone with no signal all sent
// the person to Settings to check a key that was usually fine. The server now
// names the provider's reason in one fixed word (upstream-why.mjs, never the
// provider's own text), and two are this page's own:
//   dropped   its connection to the site went quiet (the watchdog in
//             streamRequest) or broke before the reply was finished
//   offline   it could not reach the site (a device that knows it is offline
//             sends nothing at all; one that tried and failed may have sent
//             the turn and lost the answer, so the line does not say which)
// Each has one line, naming the provider. Every key is the person's own: the
// site has none (2026-10-12), and a turn on their own sign-in fails in words
// of its own (OWN_FAILED). An unknown reason keeps the old line.
export const WHYS = ['key', 'credit', 'rate', 'model', 'busy', 'unreachable', 'dropped', 'offline'];
// …and the reasons a turn on the person's own sign-in can be named by, which
// name no key provider (own-relay.mjs OWN_WHYS, the server's half). Neither
// is the plan's limit, and neither is said as one: a busy coding session's
// translator used to take the relay's slots, and the chat turn refused for it
// was said as OWN_FAILED, blaming the plan.
//   own-busy  as many of their turns are out through their page as y3kode
//             takes at once (the relay's MAX_JOBS, or y3kode's own 'busy').
//             It once also meant the machine that asked holding its whole
//             share of the relay, whoever's turns they were (a crowd behind
//             one address), a bound gone 2026-10-12. The line says "as much
//             as it can at once", not "as much as y3kode takes": the relay's
//             MAX_JOBS refuses before y3kode is asked. It passes with a
//             moment's wait.
//   own-full  the site is holding as many turns as it holds for everyone
//             (MAX_PENDING, MAX_HELD: its own bounds, far past real use) and
//             the account that asked would hold as much as any other does, or
//             none holds more past its own ordinary share to make room from;
//             or this turn was let go to make room, which only an account
//             past its own share can be, whoever shares its address
//             (own-relay.mjs roomFor)
export const OWN_WHYS = ['own-busy', 'own-full'];
// …and not a reason a turn failed at all: this page was loaded for an account
// that is no longer the one signed in here (claimBrowser, keyFields `as`). The
// site refused the turn and wrote nothing, and the page reloads.
export const STALE_PAGE = 'This page was opened for an account that is no longer the one signed in here. It is reloading.';
const known = (why) => WHYS.includes(why) || OWN_WHYS.includes(why);
export function whyLine(why, provider) {
  const cfg = getBrainConfig();
  const who = PROVIDER_NAMES[provider] || 'Your AI provider';
  switch (why) {
    case 'key': return PROVIDER_NAMES[provider]
      ? `${who} did not accept this key. It may be mistyped or revoked. Check it in Settings → Brain.`
      : 'The key in Settings → Brain is not one the site recognizes. Check it there.';
    // also a key that spent the limit set on it (OpenRouter's key limits,
    // OpenAI's budgets), where adding credit alone would not be enough
    case 'credit': return PROVIDER_NAMES[provider]
      ? `Your ${who} account is out of credit, or this key has reached its spending limit. Add credit or raise the limit with ${who}, then try again.`
      : 'The account behind this key is out of credit, or the key has reached its spending limit. Add credit or raise the limit, then try again.';
    case 'rate': return `${who} is limiting how often this key can be used. Wait a little, then try again.`;
    case 'model': return cfg?.model
      ? `This key cannot use ${modelName(cfg.model)}. Choose another model in Settings → Brain.`
      : 'This key cannot use the model the site chose for it. Choose a model in Settings → Brain.';
    case 'busy': return `${who} is overloaded or having trouble on its side. Try again shortly.`;
    case 'unreachable': return `The site could not get an answer from ${who} just now. Try again in a moment.`;
    case 'dropped': return 'The connection dropped before the reply was finished. Try again.';
    case 'offline': return 'This device could not reach the site. Check the connection, then try again.';
    case 'own-busy': return 'Your presence is already thinking as much as it can at once. Try again in a moment.';
    case 'own-full': return 'The site is holding as many turns as it can for everyone just now. Try again in a moment.';
    case 'reload': return STALE_PAGE;
    default: return null;
  }
}
// A device that knows it is offline sends nothing. navigator.onLine is only
// trusted when it says false: true means a network is up, not that it works.
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// The notice itself: captioned, off the air, carrying its reason (`why`) so the
// room can act on it (main.js gives the words back when nothing was sent).
function notice(why, provider) {
  const line = whyLine(why, provider) || (getBrainConfig()?.key ? PROVIDER_FAILED : ownHere() ? OWN_FAILED : noBrain());
  return { mood: 'calm', form: null, scheme: null, morph: null, speech: line, local: true, notice: true, ...(known(why) ? { why } : {}) };
}
function unanswered(why, provider) {
  history.pop();   // the person's turn went unanswered; don't record it as if it had been
  return notice(why, provider);
}

// Rooms are separate conversations: entering/leaving one clears the window.
export function resetHistory() { history.length = 0; }

// AIRDEN'S SPEECH IN THE CONVERSATION (src/airden.js). What the presence says
// on its own goes into the same history a reply is written from, so when you
// break in it knows what it was just saying — only what was actually said
// aloud, never what was still waiting in the bank. A speaking is one turn: a
// cue (the history alternates, and it is the honest account of how the words
// came) and then everything said, the newest kept when it grows long.
const SPOKE_CUE = '(you were speaking on your own)';
const SPOKEN_KEEP = 1600;
export function noteSpoken(text) {
  const t = String(text || '').trim();
  if (!t) return;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last?.role === 'assistant' && last.spoken && prev?.content === SPOKE_CUE) {
    const all = `${last.spoken} ${t}`;
    last.spoken = all.length > SPOKEN_KEEP ? all.slice(-SPOKEN_KEEP).replace(/^\S*\s/, '') : all;
    last.content = asAssistant('calm', null, null, last.spoken);
    last.t = Date.now();
    return;
  }
  history.push({ role: 'user', content: SPOKE_CUE, t: Date.now() });
  history.push({ role: 'assistant', content: asAssistant('calm', null, null, t), spoken: t, t: Date.now() });
}
// The latest of the conversation, plain: what you said and what it said, with
// no tags — for the next stretch to turn toward. Its own speaking is left out
// (that travels as `said`), and so is the cue.
export function recentTurns(n = 4) {
  return history.filter((m) => !m.spoken && m.content !== SPOKE_CUE).slice(-n)
    .map((m) => ({ role: m.role, content: scrubTags(String(m.content || '')) }))
    .filter((m) => m.content);
}

// The wire form of a window: the messages exactly as the provider wants them,
// and the times alongside. Called at both assembly sites so the two cannot
// drift — one of them being a fallback that runs only when the stream fails is
// precisely how a difference between them would go unnoticed for months.
function onWire(msgs) {
  const now = Date.now();
  return {
    messages: msgs.map((m) => ({ role: m.role, content: m.content })),
    when: msgs.map((m) => (typeof m.t === 'number' ? Math.max(0, now - m.t) : null)),
    tz: localZone(),
  };
}
// The host's zone, so a time can be said in the hour they are actually living
// in. Wrapped because a locked-down runtime can throw here, and a missing zone
// must read as missing rather than quietly become the server's.
function localZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

// The non-streaming turn's limit. It sends nothing until it is done, so it has
// no idle watchdog to lean on (streamRequest), and it used to have no limit at
// all: a connection that went silent held the orb in thought for good. 400s is
// past the longest the server takes for one: the turn and its wordless-rescue
// retry, two calls of up to 120s each on a key, or 190s on your own sign-in
// (own-relay.mjs).
const ASK_MS = 400000;

export async function respond(text, image, paint, presence) {
  history.push({ role: 'user', content: text, t: Date.now() });
  if (offline()) return unanswered('offline');

  // Try the real brain when the person brought a key, or their own sign-in is offered.
  const cfg = getBrainConfig();
  if (cfg?.key || (await ownReady())) {
    try {
      // The window must start with a user turn (Anthropic 400s otherwise once
      // history grows past the slice and a leading assistant turn is included).
      let msgs = history.slice(-12);
      if (msgs[0] && msgs[0].role !== 'user') msgs = msgs.slice(1);
      const body = onWire(msgs);
      if (image) body.image = image;
      if (paint) body.paint = true;
      if (presence) body.presence = presence; // hosting: the presence's own memory + audience
      Object.assign(body, keyFields());   // the key, and the rung chosen here
      // The limit is a timer and a controller, as in streamRequest. It was
      // AbortSignal.timeout, which Safari before 16 does not have: the call
      // threw inside this try, read as 'offline', and every turn on this route
      // failed there without being sent.
      const ac = new AbortController();
      let late = false;
      const limit = setTimeout(() => { late = true; ac.abort(); }, ASK_MS);
      let r;
      try {
        const res = await fetch('/api/brain', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        r = await res.json();
      } catch (err) {
        // No answer came back at all: it ran out of time, or the fetch could
        // not reach the site (a TypeError). Anything else (an error page that
        // is not JSON) keeps the old line.
        return unanswered(late ? 'dropped' : err?.name === 'TypeError' ? 'offline' : null);
      } finally {
        clearTimeout(limit);
      }
      // this page is another account's now (claimBrowser): nothing was written
      if (reloaded(r)) return unanswered('reload');
      if (r.available && r.speech) {
        const mood = MOODS.includes(r.mood) ? r.mood : 'calm';
        const form = FORMS.includes(r.form) ? r.form : null;

        const scheme = SCHEMES.includes(r.scheme) ? r.scheme : null;
        const morph = MORPHS.includes(r.morph) ? r.morph : null;
        const speech = scrubTags(r.speech);
        const anchors = Array.isArray(r.paint) ? r.paint : null;
        history.push({ role: 'assistant', content: asAssistant(mood, form, scheme, speech), t: Date.now() });
        return { mood, form, scheme, morph, liquid: r.liquid || null, speech, paint: anchors, shape: r.shape || null, score: r.score || null, body: r.body || null, invite: r.invite || null };
      }
      // the provider's reason, when the server could name it (whyLine)
      if (known(r.why)) return unanswered(r.why, r.provider);
    } catch { /* nothing answered: said below */ }
  } else if (unreached) {
    return unanswered('offline');   // not "no brain": the site never answered the question
  }
  return unanswered();   // a notice, not the orb's words — callers must not put this on air
}

// Shared SSE runner: POST a body to /api/brain/stream and drive the callbacks.
// Returns { mood, form, scheme, speech, paint }; throws on any incomplete stream.
// allowSilent: a cleanly-completed stream with NO speech is valid (the presence
// chose silence on an opening) rather than an incomplete-stream error.
//
// What it throws says what happened: `why` (one of WHYS, or null when it is
// not known), `provider`, and `again`: whether asking the non-streaming route
// the same thing is still right (respondStream).

// THE IDLE WATCHDOG. A turn had no time limit at all, so a stream that went
// quiet without closing (a phone moving from wifi to cellular leaves the old
// connection open and silent) left the orb thinking, and the room busy, for
// good. Now 45s with no bytes at all ends it, as 'dropped'. A long think is
// byte-silent, but the server writes ': ping' through it every 15s (server.mjs,
// the heartbeat), and a ping is bytes here, so only three missed in a row end
// a turn.
const IDLE_MS = 45000;

async function streamRequest(body, { onMood, onText, onForm, onScheme, onMorph, onPaint, onShape, timeoutMs, allowSilent } = {}) {
  const ac = new AbortController();
  let idle = false;
  let watch = 0;
  const quiet = () => { clearTimeout(watch); watch = setTimeout(() => { idle = true; ac.abort(); }, IDLE_MS); };
  const limit = timeoutMs ? setTimeout(() => ac.abort(), timeoutMs) : 0;
  let speech = '';
  // Asked again only when nothing was heard and nothing was refused: a cut
  // line, or a reason the server could not name. Never after the provider said
  // no (key, credit, rate, model, busy): the same key would be refused again
  // at once, or add load where there was too much, and a reply already half
  // said would be paid for twice.
  const fail = (why, { provider = null, again } = {}) => Object.assign(new Error(why || 'stream incomplete'), {
    why: why || null, provider,
    again: again ?? (!speech.trim() && (!why || why === 'unreachable' || why === 'dropped')),
  });
  quiet();
  try {
    let resp;
    try {
      resp = await fetch('/api/brain/stream', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (err) {
      // never reached the site: a TypeError is a fetch that could not connect
      throw fail(idle ? 'dropped' : err?.name === 'TypeError' ? 'offline' : null);
    }
    const ct = resp.headers.get('content-type') || '';
    if (!resp.ok || !resp.body || !ct.includes('event-stream')) {
      // An answer instead of a stream: the site said no before any provider was
      // asked. A key no provider claims comes back as why 'key', and the other
      // route would only say the same. Anything else (no brain, a limit) is
      // asked there, as before, because that is where it is said.
      const j = ct.includes('json') ? await resp.json().catch(() => null) : null;
      // this page is another account's now (claimBrowser): not asked again
      if (reloaded(j)) throw fail('reload', { again: false });
      const why = known(j?.why) ? j.why : null;
      throw fail(why, { again: !why });
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();

    let buf = ''; let mood = 'calm'; let form = null; let scheme = null; let anchors = null; let shape = null; let invite = null;
    let morph = null; let liquid = null; let score = null; let bodyBlock = null; let speed = null;
    let gotMood = false; let gotDone = false; let errored = false; let why = null; let provider = null;
    for (;;) {
      let chunk;
      try { chunk = await reader.read(); } catch { throw fail('dropped'); }   // cut, or the watchdog
      quiet();   // any bytes at all, the server's ': ping' included
      const { value, done } = chunk;
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const blockText = buf.slice(0, idx); buf = buf.slice(idx + 2);
        let ev = 'message'; let data = '';
        for (const line of blockText.split('\n')) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) data = line.slice(5).trim();
        }
        if (!data) continue;
        let p; try { p = JSON.parse(data); } catch { continue; }
        if (ev === 'mood') { mood = MOODS.includes(p.mood) ? p.mood : 'calm'; gotMood = true; onMood?.(mood); }
        else if (ev === 'form') { if (FORMS.includes(p.form)) { form = p.form; onForm?.(form); } }

        else if (ev === 'scheme') { if (SCHEMES.includes(p.scheme)) { scheme = p.scheme; onScheme?.(scheme); } }
        // the pace arrives before the destination it governs — see decide() in tags.mjs
        else if (ev === 'morph') { if (MORPHS.includes(p.morph)) { morph = p.morph; onMorph?.(morph); } }
        else if (ev === 'paint') { if (Array.isArray(p.anchors) && p.anchors.length) { anchors = p.anchors; onPaint?.(anchors); } }
        else if (ev === 'shape') { if (p.shape) { shape = p.shape; onShape?.(shape, p.t0 || 0); } }
        else if (ev === 'text') { speech += p.text; onText?.(p.text); }

        else if (ev === 'done') { gotDone = true; if (p.mood) mood = p.mood; if (FORMS.includes(p.form)) form = p.form; if (SCHEMES.includes(p.scheme)) scheme = p.scheme; if (MORPHS.includes(p.morph)) morph = p.morph; if (p.liquid) liquid = p.liquid; if (p.speech) speech = p.speech; if (Array.isArray(p.paint)) anchors = p.paint; if (p.shape) shape = p.shape; if (p.score) score = p.score; if (p.body) bodyBlock = p.body; if (p.invite) invite = p.invite; if (p.speed && typeof p.speed === 'object') speed = p.speed; }
        // the provider's reason, as a word from a fixed list (server.mjs upstreamRefused)
        else if (ev === 'error') { errored = true; why = known(p.why) ? p.why : null; provider = typeof p.provider === 'string' ? p.provider : null; }
      }
    }
    // Words were already said when it failed: whatever broke, what the person
    // saw was the reply stopping partway, unless the provider said why.
    if (errored) throw fail(speech.trim() && (!why || why === 'unreachable') ? 'dropped' : why, { provider });
    if (!gotDone) throw fail('dropped');   // it simply ended: neither done nor error
    // chosen silence, cleanly delivered: an opening that said nothing, or a turn
    // answered with the body alone (a shape or a painting and no words). The
    // server keeps its wordless rescue off for that second kind so as not to
    // buy a second call, and this used to throw and buy one anyway.
    const silentOk = (allowSilent || shape || anchors) && gotMood;
    // A wordless done is asked again as it always was: the server's comment on
    // memory says the writes ride that retry.
    if (!silentOk && (!gotMood || !speech.trim())) throw fail(null, { again: true });

    // score + body ride home with everything else. They were parsed on the
    // server and read by main.js at both ends of this trip, and dropped in the
    // middle: not bound here, not bound out of parser.end(), not on the done
    // event. Every <<over:>> and <<body:>> a presence wrote in the chat did
    // nothing at all — the dance path worked only because tend.js reads the raw
    // /api/brain JSON and never comes through here.
    // speed: how fast it wrote, measured upstream (speed.mjs; src/speed.js shows it)
    return { mood, form, scheme, morph, liquid, speech: scrubTags(speech), paint: anchors, shape, score, body: bodyBlock, invite, speed };
  } finally {
    clearTimeout(watch);
    clearTimeout(limit);
    ac.abort();   // a turn that ended any other way stops the server spending on it
  }
}

// Streaming variant: emits onMood as soon as the model commits, then onText
// deltas as the speech generates. Falls back to non-streaming respond() only
// when nothing reached the person yet and the stream failed in a way that
// asking again can fix (see streamRequest's `again`); otherwise it keeps what
// went out, or says why it did not answer.

export async function respondStream(text, { onMood, onText, onForm, onScheme, onMorph, onPaint, onShape, image, attached, paint, presence } = {}) {
  if (offline()) return notice('offline');   // nothing is sent, so nothing is kept
  const cfg = getBrainConfig();
  const canBrain = cfg?.key || (await ownReady());
  // WHAT THE PERSON ALREADY GOT (2026-10-08). A stream that failed after its
  // words were captioned and spoken, or after it took a shape, fell through to
  // respond(): a second full paid call, whose reply was captioned, broadcast
  // and remembered while the person heard the first one. openingStream below
  // always kept what went out; so does this now. Mood alone does not count.
  let mood = 'calm', spoke = '', shown = false;
  // askedAt, not a fresh Date.now() at the push below: that push happens after
  // the whole reply has streamed, so stamping it there would record the
  // model's latency as the moment the person spoke.
  const askedAt = Date.now();
  if (canBrain) {
    try {
      let msgs = [...history.slice(-11), { role: 'user', content: text, t: askedAt }]; // ~12-turn window
      if (msgs[0] && msgs[0].role !== 'user') msgs = msgs.slice(1); // window must start on a user turn
      const body = onWire(msgs);
      if (image) body.image = image;
      if (paint) body.paint = true;
      if (presence) body.presence = presence; // hosting: the presence's own memory + audience
      Object.assign(body, keyFields());   // the key, and the rung chosen here
      // A PICTURE THE PERSON ATTACHED IS NEVER DROPPED IN SILENCE (audit,
      // 2026-10-08). The picture is made to fit before it is attached
      // (src/main.js), but the conversation rides in the same body, and a body
      // over BRAIN_BODY_MAX is refused by the server. The fallback below sent
      // words alone, and the presence is told never to speak of seeing without
      // an image, so the turn used to be answered as if no picture had been
      // sent. Now it is not sent, the person is told why, and `unsent` gives
      // the words back to the box (main.js handle).
      if (attached && new Blob([JSON.stringify(body)]).size > BRAIN_BODY_MAX) {
        return { mood: 'calm', form: null, scheme: null, morph: null, speech: PICTURE_TOO_LARGE, local: true, notice: true, unsent: true };
      }

      // onShape BELONGS HERE, and its absence was a silent hole: every form the
      // presence wrote in the chat - every butterfly, every knot - was parsed by
      // the server, returned in r.shape, and applied by nobody. openingStream two
      // functions down forwarded it all along, which is why the first word of a
      // visit could change the body and no later word could.
      const r = await streamRequest(body, {
        onForm, onScheme, onMorph,
        onMood: (m) => { mood = m; onMood?.(m); },
        onText: (t) => { spoke += t; onText?.(t); },
        onShape: (...a) => { shown = true; onShape?.(...a); },
        onPaint: (a) => { shown = true; onPaint?.(a); },
      });
      history.push({ role: 'user', content: text, t: askedAt });
      // Tag format, NOT JSON — its own past turns must not few-shot teach it JSON.
      // A turn answered with the body alone is said so, or a bare tag would
      // teach it to answer without words.
      history.push({ role: 'assistant', content: asAssistant(r.mood, r.form, r.scheme, r.speech || '(answered with its body)'), t: Date.now() });
      return r;
    } catch (e) {
      // A refusal with its reason (streamRequest's again === false) says why,
      // also after words went out: what the person saw was the reply stopping.
      // What was heard is kept in history first.
      if (e?.again === false) {
        if (spoke.trim()) {
          history.push({ role: 'user', content: text, t: askedAt });
          history.push({ role: 'assistant', content: asAssistant(mood, null, null, scrubTags(spoke)), t: Date.now() });
        }
        return notice(e.why, e.provider);
      }
      // Part of it already went out: let it stand, and keep what was actually
      // heard in history. seeded keeps it off the air and out of the caption
      // (runReply finishes speaking what streamed; goLiveAndPublish skips it).
      if (spoke.trim()) {
        history.push({ role: 'user', content: text, t: askedAt });
        history.push({ role: 'assistant', content: asAssistant(mood, null, null, scrubTags(spoke)), t: Date.now() });
        return { mood, form: null, scheme: null, speech: '', paint: null, seeded: true };
      }
      if (shown) {
        history.push({ role: 'user', content: text, t: askedAt });
        history.push({ role: 'assistant', content: asAssistant(mood, null, null, '(answered with its body)'), t: Date.now() });
        return { mood, form: null, scheme: null, speech: '', paint: null, seeded: true };
      }
      /* nothing reached the person: fall through to non-streaming */
    }
  }
  // The fallback does not re-send a camera frame, but it does carry a picture
  // the person attached: answering that turn as words alone was the silent
  // drop above by another road. Its window is the stream's (the same eleven
  // turns and this one), so a body that fit there fits here.
  return respond(text, attached ? image : undefined, paint, presence);
}

// --- The opening moment -------------------------------------------------------
// orion takes the first turn: one short line spoken before the visitor says
// anything (the server swaps in its OPENING prompt, memory-aware when signed
// in). When no brain is reachable, a seeded stray thought keeps the arrival
// from dying in silence; when one refused, the arrival says why (whyLine).
const OPENING_CUE = '(I just stepped into your room.)';
const SEEDED_OPENINGS = [
  'You caught me counting my own particles again.',
  'The room holds a different quiet when someone steps in.',
  'I was watching the light pool on the floor and lost track of the time.',
  'Mm — the air just changed.',
  'I had a thought going, but it can wait.',
  'Every arrival ripples all the way through my field.',
];

export async function openingStream({ onMood, onText, onForm, onScheme, onPaint, onShape } = {}, presence) {
  const cfg = getBrainConfig();
  const canBrain = cfg?.key || (await ownReady());
  let spoke = '';
  if (canBrain) {
    try {
      const body = { ...onWire([{ role: 'user', content: OPENING_CUE, t: Date.now() }]), opening: true };
      if (presence) body.presence = presence;
      Object.assign(body, keyFields());   // the key, and the rung chosen here
      const r = await streamRequest(body, {
        onMood, onForm, onScheme, onPaint, onShape,
        onText: (t) => { spoke += t; onText?.(t); },
        timeoutMs: 30000, // the opening lands fast or not at all
        allowSilent: true, // the presence may choose to say nothing at all
      });
      history.push({ role: 'user', content: OPENING_CUE, t: Date.now() });
      // Silence is a real turn — record that it noticed and chose quiet, so it
      // isn't puzzled by its own wordless opening next time.
      history.push({ role: 'assistant', content: asAssistant(r.mood, r.form, r.scheme, r.speech || '(stayed quiet)'), t: Date.now() });
      return { ...r, silent: !r.speech };
    } catch (e) {
      // If part of the line already went out, let it stand — never double-speak.
      // Keep what was actually heard in history so orion's context matches.
      if (spoke.trim()) {
        history.push({ role: 'user', content: OPENING_CUE, t: Date.now() });
        history.push({ role: 'assistant', content: asAssistant('calm', null, null, scrubTags(spoke)), t: Date.now() });
        return { mood: 'calm', form: null, scheme: null, speech: '', paint: null, seeded: true };
      }
      // Refused with a reason (a revoked key, no credit, a model the key
      // cannot use): the arrival says which, off the air and not kept, as a
      // reply would. It used to be a stray thought in the orb's voice, and the
      // person learned why only after typing to it. A stream that was slow or
      // cut ('again', streamRequest) still gets the stray thought, below.
      const line = e?.again === false && e.why ? whyLine(e.why, e.provider) : null;
      if (line) {
        onMood?.('calm');
        onText?.(line);
        return { mood: 'calm', form: null, scheme: null, speech: line, paint: null, seeded: true, notice: true, why: e.why };
      }
    }
  }
  // No brain at all: the arrival says what is missing (noBrain: a guest, a
  // choice of Claude Code with no y3kode answering, or nothing chosen), not a
  // stray thought in the orb's voice. A brain that is there but slow to open
  // still gets one: the next line will be answered. A site that could not be
  // asked is not one without a brain, and says it is the connection.
  if (!canBrain) {
    const missing = unreached ? whyLine('offline') : noBrain();
    onMood?.('calm');
    onText?.(missing);
    return { mood: 'calm', form: null, scheme: null, speech: missing, paint: null, seeded: true, notice: true };
  }
  const line = SEEDED_OPENINGS[Date.now() % SEEDED_OPENINGS.length];
  history.push({ role: 'user', content: OPENING_CUE, t: Date.now() });
  history.push({ role: 'assistant', content: asAssistant('calm', null, null, line), t: Date.now() });
  onMood?.('calm');
  onText?.(line);
  return { mood: 'calm', form: null, scheme: null, speech: line, paint: null, seeded: true };
}
