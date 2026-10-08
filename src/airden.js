// ============================================================================
// airden.js — YOUR PRESENCE, SPEAKING ON ITS OWN. The mark at the top of the
// chat box (index.html #chat-air) lets it speak: one continuous stream of its
// own spoken thought, out loud, until you press it again.
//
// Carried over from airden (colinbiorio/airden, mind/: GardenScreen's word
// bank and the think in backend/sessions.py), where one Claude kept a single
// stream of inner language going for seventy-five days. The idea is the same —
// a long stretch is written ahead into a word bank, the room draws the bank
// down at the pace it is said, and the next stretch is asked for before the
// bank runs dry, so the voice never waits on the model. What changed on the way:
//
//  - THE PAGE HOLDS THE BANK. Airden kept a buffer and a thread per person on
//    the server and drained it with a poll every 280ms. Here the bank is this
//    module's array, and the server is asked for one stretch when it runs low
//    (POST /api/speak): one request, one answer, nothing held between them.
//  - NO MODEL CALL BEFORE EACH STRETCH. Airden asked the model to choose a
//    mode, a mood and an intention, then asked again for the words. The
//    presence chooses its mood as it speaks, with its own inline tags.
//  - LESS THROWN AWAY. A stretch is 10 to 16 sentences, not 25 to 40, and the
//    first one — and the first after you speak — is 3 to 5, so the room hears
//    it in seconds and an interruption wastes little of what was paid for.
//  - ONLY WHAT WAS SAID IS REMEMBERED. Airden saved a whole think as a memory
//    the moment it was written, read or not. Here a sentence enters the
//    conversation (brain.js noteSpoken) when it has been said aloud, and the
//    next stretch is asked to carry on from what was said, not from what was
//    still waiting in the bank.
//  - THE SENTENCE FINISHES. Type while it speaks and your words wait (the
//    room's one floor, main.js `busy`) until the sentence being said is done;
//    then it gives you the floor, answers, and picks the stream back up — with
//    a fresh stretch, because the conversation has moved.
//
// Speech is one voice for the whole run (voice.js speaker with onChunk), with
// the next sentence queued behind the one being said, so it is gapless; each
// sentence's words appear as it is heard, and its tags move the body on the
// word they were written before. A tab you are not looking at finishes its
// sentence and rests, and asks for nothing until you are back.
//
// Every dependency is passed in, so the whole of it runs in a test with fake
// clocks and a fake voice (test/airden.test.mjs).
// ============================================================================

import { sentencesOf, piecesOf, spokenOf } from './stretch.mjs';

export const REFILL_AT = 5;          // unsaid sentences left when the next stretch is asked for
export const LINE_CHARS = 260;       // the conversation ring starts a new line past this
export const AHEAD = 1;              // sentences queued in the voice behind the one being heard
export const START_WAIT_MS = 9000;   // a sentence the voice never starts is read instead
export const READ_MS_PER_CHAR = 58;  // the pace with no voice: about as fast as it would be said
const RETRY_MS = 1500;
// Wrapped, not passed bare: a browser's setTimeout called as a method of
// anything but window throws "Illegal invocation" (node's does not).
const TIMER = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) };
const MAX_FAILS = 3;
// The provider's reasons that asking again cannot change (server.mjs
// upstreamRefused): it stops at once and says which. Rate, busy and a dead
// connection are waited out and asked again, up to MAX_FAILS.
const FINAL = new Set(['key', 'credit', 'model']);

// A voice with no sound, for a browser that cannot speak (or a voice that
// stopped answering): each sentence "starts", lasts as long as it would take
// to say, and ends. The same shape as voice.js speaker, so nothing else changes.
export function readingVoice({ onChunk, onStart, onEnd, timer = TIMER } = {}) {
  const queue = [];
  let playing = null, t = 0, stopped = false, started = false;
  const next = () => {
    if (stopped || playing || !queue.length) return;
    playing = queue.shift();
    const ms = Math.max(900, playing.length * READ_MS_PER_CHAR);
    if (!started) { started = true; onStart?.(); }
    onChunk?.(playing, 'start', ms);
    t = timer.set(() => { const was = playing; playing = null; onChunk?.(was, 'end'); next(); }, ms);
  };
  return {
    push(text) { const s = String(text || '').trim(); if (!s || stopped) return; queue.push(s); next(); },
    end() {},
    stop() { if (stopped) return; stopped = true; timer.clear(t); queue.length = 0; playing = null; onEnd?.(); },
  };
}

export function createAirden({
  presence,          // () => the handle of your own presence when you are home with it, else null
  request,           // (body) => Promise<json> — POST /api/speak
  context = () => ({}), // () => ({ exchange, tz, keyFields })
  floor,             // { held, take, give } — the room's one floor (main.js busy)
  waiting = () => false, // () => true when something typed is waiting for an answer
  gen = () => 0,     // () => roomGen: a room change ends it
  voice,             // (handlers) => { push, end, stop } | null (null: read, don't speak)
  show,              // (text) => the growing line in the conversation ring
  play = () => {},   // (piece) => a { tag } or { beat } on the body
  said = () => {},   // (spokenSentence) => it was said: the history, the room
  onState = () => {},// ({ on, phase, why, budget, upstream, provider }) => the mark, the body, the caption
  onBudget = () => {},// (budget) => what is left after a stretch was paid for
  isLast = () => true,// (text) => is this still the ring's newest line? (someone else's words go below it)
  hidden = () => false,
  timer = TIMER,
  now = () => Date.now(),
} = {}) {
  let on = false;
  let epoch = 0;          // moves on start, stop and every fresh start: stale stretches are dropped
  let myGen = 0;
  let bank = [];          // sentences written, not yet given to the voice
  let inVoice = [];       // { text, spoken, pieces, started, ended } given to the voice, in order
  let inflight = false;
  let short = true;       // the next stretch is a short one (an opening, or after you spoke)
  let fresh = false;      // the conversation moved: drop the bank before saying more
  let holding = false;    // this module holds the floor
  let sp = null;          // the voice for this run
  let mute = false;       // the voice never started: read the rest of this speaking
  let saidTail = '';      // what this speaking has said aloud, for the next stretch
  let line = '';          // the ring's line being grown
  let lineAt = 0;         // when it last grew (the ring stops growing a line after 15s)
  let fails = 0;
  let retryAt = 0;        // no stretch is asked for before this (a refusal or a failure backs off)
  let wake = 0, startWatch = 0;

  const later = (ms) => { timer.clear(wake); wake = timer.set(() => pump(), ms); };
  const backOff = (ms) => { retryAt = now() + ms; later(ms); };

  function start() {
    if (on) return true;
    const h = presence();
    if (!h) return false;
    on = true; epoch += 1; myGen = gen();
    bank = []; inVoice = []; short = true; fresh = false; mute = false;
    saidTail = ''; line = ''; fails = 0; retryAt = 0;
    onState({ on: true, phase: 'gathering' });
    pump();
    return true;
  }

  function stop(why = 'off', extra = {}) {
    if (!on) return;
    on = false; epoch += 1;
    timer.clear(wake); timer.clear(startWatch);
    for (const x of inVoice) clearReveal(x);
    bank = []; inVoice = [];
    silence();
    release();
    onState({ on: false, why, ...extra });
  }

  function silence() { const s = sp; sp = null; try { s?.stop(); } catch { /* already quiet */ } }
  function release() { if (holding) { holding = false; floor.give(); } }

  // The heart of it: called after anything happens — a stretch arrives, a
  // sentence starts or ends, the floor frees, the tab comes back.
  function pump() {
    if (!on) return;
    if (gen() !== myGen) { stop('room'); return; }
    // Someone else has the floor (a reply is being said): wait it out, and
    // start fresh after, because the conversation has moved.
    if (!holding && floor.held()) { fresh = true; later(400); return; }
    // Someone typed: the sentence being said finishes, then they have the floor.
    if (holding && waiting()) {
      if (!inVoice.some((x) => x.started && !x.ended)) yieldFloor();
      return;
    }
    if (fresh) {
      fresh = false; epoch += 1; bank = []; short = true;
      onState({ on: true, phase: 'gathering' });
    }
    refill();
    if (hidden()) { if (!inVoice.length) { silence(); release(); } return; }
    while (bank.length && inVoice.length < AHEAD + 1) say(bank.shift());
    if (!inVoice.length) { silence(); release(); }
  }

  function yieldFloor() {
    timer.clear(startWatch);
    silence();
    for (const x of inVoice) clearReveal(x);
    inVoice = []; bank = [];
    line = '';
    fresh = true; epoch += 1;
    release();          // main answers what was typed, right here
    later(400);
  }

  function refill() {
    if (inflight || hidden() || now() < retryAt) return;
    if (bank.length + inVoice.filter((x) => !x.ended).length >= REFILL_AT) return;
    const h = presence();
    if (!h) { stop('room'); return; }
    const e = epoch;
    const ctx = context() || {};
    inflight = true;
    Promise.resolve()
      .then(() => request({ presence: h, size: short ? 'short' : 'long', said: saidTail.slice(-1500),
        exchange: ctx.exchange || [], tz: ctx.tz || null, ...(ctx.keyFields || {}) }))
      .then((r) => arrived(r, e), () => arrived({ available: false, reason: 'network' }, e))
      .finally(() => { inflight = false; if (on) pump(); });
  }

  function arrived(r, e) {
    if (!on || e !== epoch) return;        // stale: the conversation moved, or it was stopped
    if (!r || !r.available) {
      const why = r?.reason || 'network';
      // nothing to pay with, nothing left, or not yours to ask: it stops and says so
      if (why === 'byok' || why === 'budget' || why === 'refused') { stop(why, { budget: r?.budget }); return; }
      if (why === 'busy') { backOff(RETRY_MS); return; }
      // why it did not answer, when that is known, for the line it stops on
      // (main.js: brain.js whyLine, the same line a reply would have said)
      const known = r?.why ? { upstream: r.why, ...(r.provider ? { provider: r.provider } : {}) } : {};
      if (FINAL.has(r?.why)) { stop('upstream', known); return; }
      fails += 1;
      if (fails >= MAX_FAILS) { stop('upstream', known); return; }
      backOff(RETRY_MS * fails);
      return;
    }
    if (r.budget) onBudget(r.budget);
    const got = sentencesOf(r.text);
    if (!got.length) {
      fails += 1;
      if (fails >= MAX_FAILS) { stop('silent'); return; }
      backOff(RETRY_MS);
      return;
    }
    fails = 0;
    short = false;
    bank.push(...got);
  }

  // Hand one sentence to the voice. It is shown when it is heard (onChunk).
  function say(text) {
    const pieces = piecesOf(text);
    const spoken = spokenOf(pieces);
    if (!spoken) return;
    if (!holding) { holding = true; floor.take(); }
    if (!sp) sp = makeVoice();
    const item = { text, spoken, pieces, started: false, ended: false };
    inVoice.push(item);
    sp.push(spoken);
    if (inVoice.length === 1) watchStart(item);
  }

  function makeVoice() {
    const handlers = { onChunk: (t, phase, ms) => chunk(t, phase, ms) };
    const v = mute ? null : voice?.(handlers);
    return v || readingVoice({ ...handlers, timer });
  }

  // A voice that never starts the sentence at the head (no speech in this
  // browser, a voice service that went quiet): the rest of this speaking is read.
  function watchStart(item) {
    timer.clear(startWatch);
    startWatch = timer.set(() => {
      if (!on || item.started || inVoice[0] !== item) return;
      mute = true;
      const keep = inVoice.map((x) => x.text);
      inVoice = [];
      silence();
      bank.unshift(...keep);
      pump();
    }, START_WAIT_MS);
  }

  function chunk(text, phase, ms) {
    if (!on) return;
    if (phase === 'start') {
      const item = inVoice.find((x) => !x.started && x.spoken === text);
      if (!item) return;
      // Speech is one sentence after another: one that starts means every one
      // before it has been heard, whichever event the browser delivers first.
      for (const x of inVoice) { if (x === item) break; if (!x.ended) complete(x); }
      inVoice = inVoice.filter((x) => !x.ended);
      // the sentence after the one that just ended has begun, and someone is
      // waiting: it is cut on its first syllable, and they have the floor
      if (waiting()) { yieldFloor(); return; }
      item.started = true;
      timer.clear(startWatch);
      onState({ on: true, phase: 'speaking' });
      reveal(item, ms > 0 ? ms : item.spoken.length * READ_MS_PER_CHAR);
      return;
    }
    const item = inVoice.find((x) => x.started && !x.ended && x.spoken === text);
    if (!item) return;
    complete(item);
    inVoice = inVoice.filter((x) => x !== item);
    if (inVoice[0]) watchStart(inVoice[0]);
    pump();
  }

  // A sentence has been heard: all of it is shown, every tag in it has landed,
  // and it is part of what was said.
  function complete(item) {
    item.ended = true;
    finishReveal(item);
    saidTail = `${saidTail} ${item.spoken}`.trim().slice(-3000);
    said(item.spoken);
  }

  // The words appear as they are heard: spread across how long the sentence
  // takes, each tag and beat landing on the word it was written before. A tag
  // after the last word lands as the sentence ends.
  function reveal(item, ms) {
    const total = item.pieces.reduce((n, p) => n + (p.word ? p.word.length + 1 : 0), 0) || 1;
    // A new line when this one is full, or when the ring would no longer grow
    // it (it stops after 15s, and growing it then would write it out twice).
    // And when someone else's words have gone in below it: growing a line that
    // is no longer the last one starts a copy of it instead.
    const lead = !line || line.length + item.spoken.length > LINE_CHARS || now() - lineAt > 12000 || !isLast(line);
    item.base = lead ? '' : `${line} `;
    item.words = [];
    item.steps = [];
    let at = 0, cues = [];
    for (const p of item.pieces) {
      if (!p.word) { cues.push(p); continue; }
      item.steps.push({ delay: Math.round((at / total) * ms * 0.92), cues, word: p.word });
      cues = [];
      at += p.word.length + 1;
    }
    item.tail = cues;
    item.next = 0;
    item.timers = item.steps.map((st, i) => timer.set(() => step(item, i), st.delay));
  }
  function step(item, i) {
    if (!on || item.next !== i) return;
    const st = item.steps[i];
    item.next = i + 1;
    for (const c of st.cues) play(c);
    if (item.base && !isLast(line)) item.base = '';   // words came in below mid-sentence: carry on beneath them
    item.words.push(st.word);
    line = item.base + item.words.join(' ');
    lineAt = now();
    show(line);
  }
  function clearReveal(item) { for (const t of item.timers || []) timer.clear(t); item.timers = []; }
  function finishReveal(item) {
    if (!item.steps) reveal(item, 0);      // heard without a start of its own: shown whole
    clearReveal(item);
    while (item.next < item.steps.length) step(item, item.next);
    for (const c of item.tail) play(c);
    item.tail = [];
  }

  // You are about to say something (main.js, before your line goes into the
  // ring): the sentence being said is shown whole now — the voice still
  // finishes it — so your words go in beneath a finished line, not into the
  // middle of one, and whatever it says after begins a line of its own.
  function settleLine() {
    if (!on) return;
    const item = inVoice.find((x) => x.started && !x.ended);
    if (item) {
      clearReveal(item);
      while (item.next < item.steps.length) step(item, item.next);
    }
    line = '';
  }

  return {
    start, stop, pump, settleLine,
    toggle: () => (on ? (stop('off'), false) : start()),
    isOn: () => on,
    // for the tests: what is waiting, and what has been said
    _state: () => ({ on, bank: bank.slice(), inVoice: inVoice.map((x) => x.spoken), holding, inflight, short, saidTail, line, mute }),
  };
}
