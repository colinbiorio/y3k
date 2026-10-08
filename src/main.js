// Wiring. Turns input (voice or text) into a brain reply, then drives the body
// and the voice together so shape, color, and words land as one gesture.

import { createBody } from './body.js';
import { createGfx } from './gfx.js';
// A NAMESPACE, not a named import: gfx hands the liquid its profile through
// setMercuryQuality, and a named import of an export that is not there is a
// SyntaxError that takes the whole module graph down with it. Read off the
// namespace it is simply undefined, and the optional call below skips it.
import * as merc from './mercury-buttons.js';
import { createVoice } from './voice.js';
import { createCamera } from './camera.js';
import { createSettings } from './settings.js';
import { respondStream, openingStream, hasServerBrain, siteModel, getBrainConfig, resetHistory, checkOwnBrain, keyFields, noteSpoken, recentTurns, NO_PROVIDER, PROVIDER_FAILED, whyLine, forgetAccount, claimBrowser } from './brain.js';
import { createAirden } from './airden.js';
import { ownChoiceFor, startOwnBrain, ownState, ownModel } from './own-brain.js';
import { createModelMark, thinking } from './model-mark.js';
import { createSocial } from './social.js';
import { arrival } from './arrive.mjs';
import { createTend } from './tend.js';
import { createMusic, nowPlayingLine } from './music.js';
import { createReader } from './reader.js';
import { createWindows } from './windows.js';
import { initMercury } from './mercury.js';
import { initMercuryGL } from './mercury-gl.js';
import { mountAppMercury, pourModelMark } from './mercury-mount.js';
import { createPortal } from './portal.js';
import { scrubTags, beatSplitter, parseKommand } from './tags.mjs';
import { CHAT_IMAGE_MAX, MB } from './media-rules.mjs';
import { shrinkPicture } from './picture.js';
import { createScore } from './score.js';
// ?perf's meter starts itself as this import evaluates (before the liquid's
// bake and the orb's build below); inert without ?perf.
import { startPerfHud } from './perf-hud.js';
import { createPerceive } from './perceive.js';
import { createHandView } from './handview.js';
import { createRemoteEye, createEyeSwitch, createLender, deviceName, renameDevice } from './remote-eye.js';
import { createReach } from './reach.js';
import { createHistory } from './history.js';
import { takePairingFromHash, pendingPairing, hasDesktopBridge } from './code/transport.js';

// The conversation ring's newest line, and a word with airden before yours goes
// in (src/airden.js): it shows its sentence whole first, so your words never
// land in the middle of it. Up here because showCaption runs while this module
// is still loading, long before airden exists.
let lastRing = { who: '', text: '' };
let beforeYou = null;

// y3kode's pairing link (…/#y3k-code=<port>-<code>) is taken out of the
// address bar before anything else can see it, and kept for the Code screen.
takePairingFromHash();
// …/#code — y3kode's own way back here: the engine opens it when this browser
// is already paired, and the desktop app loads it for a y3k://code link. Code
// opens once the account is known (revealCode); the address bar is cleaned
// now, so a reload lands on home like any other.
let codeAsked = location.hash === '#code';
// WINDOW.history, always, in this file: `history` here is the conversation
// (createHistory, below), and the bare name made both of these a TypeError,
// so #code and ?auth_error stayed in the address bar for every reload.
const dropHash = () => { try { window.history.replaceState(null, '', location.pathname + location.search); } catch { /* stays; harmless */ } };
if (codeAsked) dropHash();
// The desktop app follows a y3k://code link into a window that is already on
// the room by moving it to #code: the same page with a new fragment, so no
// reload (the room, the orb and a running session stay) — only this event.
// Before the laptop is revealed (the account not known yet) it waits for
// revealCode like the one above; after, it opens Code at once.
window.addEventListener('hashchange', () => {
  // The engine's pairing link can land on a tab that is already open (the
  // browser reuses it, or it is pasted): take it as the boot would have.
  if (/y3k-code=/.test(location.hash)) {
    if (!takePairingFromHash()) return;
  } else if (location.hash !== '#code') return;
  else dropHash();
  if (document.getElementById('nav-code')?.hidden === false) openCodeRoom(); else codeAsked = true;
});

// The buttons are liquid mercury. Preferred: the SDF particle system — each
// glyph is its own body of liquid (the cursor slices into it and it heals; a
// click clumps, pops into droplets, reforms). Without WebGL2, the older
// SVG-filter look + whole-glyph transforms take over instead.
let sdfMercury = false;
try { sdfMercury = mountAppMercury(); } catch (err) { console.warn('[mercury]', err); }
if (sdfMercury) {
  document.body.classList.add('merc-sdf');
} else {
  initMercury(); // stretch toward the cursor, pop on click (whole-glyph)
  initMercuryGL().then((ok) => { if (ok) document.body.classList.add('merc-gl'); }).catch(() => {});
}

const $ = (id) => document.getElementById(id);

const body = createBody($('stage'));

// HOW MUCH ROOM THIS MACHINE CAN AFFORD. Started immediately and never stopped:
// it is one subtraction and one array push per frame, and the thing it watches
// for — a machine that cannot hold thirty frames a second — can arrive at any
// moment, when a second app opens or a laptop gets warm, not only at boot.
// Its sinks: the orb (bloom, resolution, detail) and the liquid glyphs (still
// or flowing, pixel cap). Each one is optional-called, so a sink that has not
// learned the call yet is skipped rather than fatal.
const gfx = createGfx({ body, mercury: { setQuality: (p) => merc.setMercuryQuality?.(p) } });
gfx.start();
// Published NOW, not with the rest of window.Y3K at the bottom of this file:
// the modules built between here and there (history, portal, the world) are
// the ones that read window.Y3K?.gfx?.profile?.() as they start, and the first
// 'y3k:gfx' event has already fired by the time they could listen for it. The
// full object below replaces this one and carries the same gfx.
window.Y3K = { gfx };
// The conversation, wrapped around the sphere — fed by every caption on the
// home screen, where it REPLACES the bottom caption strip.
const history = createHistory();
// Single autonomous mode: Y3K alone drives its posture and color. We set a calm
// resting state; it reshapes and repaints itself with every reply. The backdrop is
// the fixed metal room — there is no visitor-set background.
body.setScheme('stardust'); // resting state: near-white, flecked with color

// THE SCORE'S CLOCK. Ticked every hundred milliseconds — Ts — on setInterval,
// not on the frame: a score is about time, and the frame loop pauses when the
// tab is hidden. One step applies exactly like a turn's controls do, with the
// pace set to its own length; the end puts the pace and the flash back and
// leaves the state standing.
export function applyBodyBlock(b) {
  if (!b) return;
  if (b.count != null) body.setCount(b.count);   // FIRST: the trail gate reads the count
  if (b.size != null) body.setSize(b.size);
  if (b.turn) body.setTurn(b.turn);
  if (b.grain != null) body.setGrain(b.grain);
  if (b.trail != null) body.setTrailWord(b.trail);
  if (b.mesh != null) body.setMesh(b.mesh);
  if (b.glow != null) body.setGlow(b.glow);
  if (b.home) body.home();                       // BEFORE at: 'home at 7 5' is a fresh place
  if (b.depth != null) body.setDepth(b.depth);   // after home, which forgets a depth; before at
  if (b.at) body.setPlace(b.at[0], b.at[1]);
  if (b.fly) body.setFly({ w: b.fly[0], h: b.fly[1], r: b.fly[2] });
  if (b.circle) body.setFlight({ kind: 'circle', w: b.circle[0], r: b.circle[1] });   // after at: every flight is around the place
  if (b.bounce) body.setFlight({ kind: 'bounce', h: b.bounce[0], r: b.bounce[1] });
  if (b.wander) body.setFlight({ kind: 'wander', w: b.wander[0], r: b.wander[1] });
  if (b.follow) body.setFollow(b.follow);        // one slot with the flights; at and home end it
  if (b.face) body.setFace(b.face.dir, b.face.t);   // LAST: a yaw face stops the turn said before it
}
const score = createScore((st) => {
  if (st.end) { body.setFlash(0); body.restoreMorph(); return; }
  body.setMorphSeconds(st.seconds);
  if (st.mood) { body.setMood(st.mood); setMoodTag(st.mood); }
  if (st.form) body.setForm(st.form);
  if (st.scheme) body.setScheme(st.scheme);
  if (st.shape) body.setShape(st.shape);
  if (st.liquid) body.setLiquid(st.liquid);
  applyBodyBlock(st);
  body.setFlash(st.flash || 0);
});
setInterval(() => { if (score.running) score.tick(performance.now()); }, 100);
export const scoreFor = () => score;
body.setForm('orb');

// --- Entrance overlay + accounts. Create an account or sign in (real backend:
// scrypt + signed-cookie sessions), or step in as a guest. A returning session is
// recognized on load and greeted by name; the card then dissolves to the app.
// THE HULL: uncaught damage reports home — bounded, deduped per session,
// fire-and-forget. The ship keeps a log of its own hurts, and the keeper (and
// its builder, next session) reads it instead of hoping someone saw a console.
const hullSeen = new Set();
function hullReport(where, message, source, line) {
  try {
    const sig = where + '|' + String(message).slice(0, 80);
    if (hullSeen.has(sig) || hullSeen.size > 20) return;
    hullSeen.add(sig);
    fetch('/api/hull/report', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ where, message: String(message).slice(0, 200), source: String(source || '').slice(0, 120), line: Number(line) || 0 }),
    }).catch(() => {});
  } catch { /* reporting damage must never cause damage */ }
}
window.addEventListener('error', (e) => hullReport(document.body.className.split(' ').filter((c) => c.startsWith('in-') || c === 'alive').join(',') || 'app', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', (e) => hullReport('promise', e.reason?.message || String(e.reason || 'rejection'), e.reason?.stack?.split('\n')[1] || '', 0));
// THE TWO-WORLDS TRAP: if the SDF system bailed (no WebGL2, or a shader that
// compiles on the builder's machine but not this one), every "liquid"
// experience here is actually the SVG-filter fallback — and nobody can tell
// from the outside. The hull records which world each client is in.
if (!sdfMercury) hullReport('client:mercury', 'SDF fell back to SVG-filter path' + (window.__mercErr ? ' — ' + window.__mercErr : ' (no WebGL2?)'), navigator.userAgent.slice(0, 110), 0);

const loginEl = $('login');
const loginForm = $('login-form');
const loginErr = $('login-error');
let account = null; // { username, email, founder } once signed in, else null (guest)

// THE DOOR. Everyone arrives through enterApp — the password form, the OAuth
// round trip, and a remembered session alike — so the one place that has to
// know about the unanswered question is here. A guest (no account) walks
// straight in; they cannot post or wake anything anyway.
function needsTerms() { return !!account && account.needsTerms; }

function askTerms() {
  const card = $('terms-card');
  if (!card) return enterApp.now();          // no card in the page: never trap anyone outside
  loginForm.hidden = true;
  card.hidden = false;
  const err = $('terms-error');
  const go = $('terms-go'), out = $('terms-out');
  const fail = (m) => { err.textContent = m; err.hidden = !m; };
  card.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!$('terms-age').checked) return fail('You must be 17 or older to come in.');
    if (!$('terms-ok').checked) return fail('Please accept the terms and privacy policy.');
    fail(''); go.disabled = true;
    try {
      const r = await fetch('/api/auth/agree', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ age17: true, terms: true }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { fail(d.error || 'That did not save — try again.'); go.disabled = false; return; }
      if (d.user) account = d.user;
      card.hidden = true;
      loginForm.hidden = false;
      enterApp.now();
    } catch { fail('Could not reach the server.'); go.disabled = false; }
  });
  out?.addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* leaving anyway */ }
    forgetAccount();   // as Settings' sign-out does (brain.js)
    location.reload();
  });
}

// THE FOUNDER'S OWN SIGN-IN, OFFERED TO THE SITE through this page and y3kode
// (own-brain.js, own-relay.mjs): open while chosen in Settings → Brain, and only
// for the founder — the site refuses the stream to anyone else. Its state goes
// to Settings as 'y3k:own-brain-state' {state, why}.
let stopOwnBrain = null;
function syncOwnBrain() {
  // chosen in Settings → Brain, or, for the founder with no key saved, the default
  const want = !!account?.founder && !!ownChoiceFor(!!account?.founder, !!getBrainConfig());
  const say = (state, why = '') => window.dispatchEvent(new CustomEvent('y3k:own-brain-state', { detail: { state, why } }));
  if (want && !stopOwnBrain) {
    // every change re-asks the server, so the orb never claims a brain that went away
    stopOwnBrain = startOwnBrain({ onState: (state, why) => { checkOwnBrain(); say(state, why); } });
  } else if (!want && stopOwnBrain) { stopOwnBrain(); stopOwnBrain = null; checkOwnBrain(); }
  else if (!want) say('off');
}
window.addEventListener('y3k:own-brain', syncOwnBrain);

// WHAT IS THINKING, under the house's name (model-mark.js): your own Claude
// Code once its stream is up, else the key in use, else the site's own key.
// Asked again whenever any of those can have changed.
const modelMark = createModelMark({ pour: (x) => pourModelMark?.(x) });
async function showThinking() {
  const founder = !!account?.founder;
  const own = founder && ownChoiceFor(founder, !!getBrainConfig()) && ownState().state === 'ready' ? { model: ownModel('claude') } : null;
  const k = getBrainConfig();
  const key = !own && k?.key ? { provider: k.provider, model: k.model } : null;
  const site = !own && !key && account && await hasServerBrain() ? siteModel() : null;
  modelMark.set(account ? thinking({ own, key, site }) : null);
}
for (const ev of ['y3k:model', 'y3k:own-brain', 'y3k:own-brain-state']) window.addEventListener(ev, () => { showThinking(); });

function enterApp() {
  // next time the card opens on sign in; and a guest's arrival card goes, for
  // a session check that answers after the guest went in (it is a sign-in)
  if (account) { markBeen(); hideArrive(); }
  // asked once, of anyone the question has never been put to
  if (needsTerms()) return askTerms();
  return enterApp.now();
}

enterApp.now = function enterAppNow() {
  if (!loginEl || loginEl.classList.contains('gone')) return;
  // WHOSE KEYS THESE ARE. Every way in passes here, so this is where keys left
  // in this browser by someone else (a session that ran out, a guest) are
  // forgotten, before the hours, the brain or Settings can read them.
  claimBrowser(account);
  // SIGNED IN, SO SAY SO TO YOUR OTHER DEVICES. One small POST every fifteen
  // seconds and one idle stream — the price of appearing in the list on your
  // phone without having had to arrange it first. Gated on being signed in
  // because the routes answer 401 otherwise, and an EventSource that 401s
  // retries forever.
  remoteEye.start();
  // The orb flares to greet you, then eases back to calm as the card clears.
  body.setMood('excited');
  body.setAudioLevel(1);
  body.setSpeaking(true);
  // The flare eases off, then the platform opens: the LOBBY of presences, not
  // a single room. A presence's opening moment fires when its host steps in.
  setTimeout(async () => {
    body.setSpeaking(false); body.setAudioLevel(0); body.setMood('calm');
    await loadMyPresence(); // your one presence — the home orb becomes it
    showHome();
    revealCode();
    checkOwnBrain();        // the founder's own subscription, on their own machine: no key asked for
    syncOwnBrain();         // …or through this page and y3kode, when chosen in Settings → Brain
    showThinking();         // and what is thinking, under the house's name
    if (!account) greetGuest(); // a guest lands next to something alive, if anything is
  }, 1000);
  loginEl.classList.add('gone');           // card zooms through + blurs away; the light blooms
  document.body.classList.remove('gated'); // app chrome fades in
  // in-home lands NOW, not when showHome() runs at +1s — in that gap the room
  // chrome (hud-top, "orion | calm") was un-gated and not yet in-home, so the
  // OLD screen faded in for a second and then faded back out on every login.
  document.body.classList.add('in-home');
  setTimeout(() => { loginEl.style.display = 'none'; }, 1300);
};

function showLoginError(msg) { if (loginErr) { loginErr.textContent = msg || ''; loginErr.hidden = !msg; } }
// A reason goes once a field is edited, or once the browser's own check stops
// a submit, so it never sits beside a message about a different field.
loginForm?.addEventListener('input', () => showLoginError(''));
loginForm?.addEventListener('invalid', () => showLoginError(''), true);

// Toggle between creating an account and signing in.
function setAuthMode(mode) {
  if (!loginForm) return;
  loginForm.dataset.mode = mode;
  const signin = mode === 'signin';
  $('login-tag').textContent = 'who are you?'; // fits both — identify yourself, or become someone
  const email = $('login-email');
  email.type = signin ? 'text' : 'email';
  email.placeholder = signin ? 'email or username' : 'email';
  email.autocomplete = signin ? 'username' : 'email';
  $('login-pass').autocomplete = signin ? 'current-password' : 'new-password';
  $('login-toggle').textContent = signin ? 'new here? create an account' : 'have an account? sign in';
  // the age and terms are asked only of someone making a new account
  const agree = $('login-agree');
  if (agree) agree.hidden = signin;
  showLoginError('');
}
// WHICH WAY THE CARD OPENS (2026-10-08; it was sign-in for everyone, so a
// first-timer had to find "new here? create an account" in 12px muted type).
// Someone who has never signed in on this browser meets "create an account"
// first, with the age and terms questions in view; anyone who has meets
// sign-in. The switch between them is one tap either way, so a returning
// person on a new device (or with cleared storage) is not stuck. The mark is
// written by enterApp, the one door every account comes through: a password,
// a remembered session, Google or Apple, and the terms card.
const BEEN = 'y3k.been';
function hasBeen() { try { return localStorage.getItem(BEEN) === '1'; } catch { return false; } }
function markBeen() { try { localStorage.setItem(BEEN, '1'); } catch { /* private mode: the card opens on create, one tap from sign in */ } }
setAuthMode(hasBeen() ? 'signin' : 'signup');
$('login-toggle')?.addEventListener('click', () =>
  setAuthMode(loginForm.dataset.mode === 'signin' ? 'signup' : 'signin'));

let authBusy = false;
async function submitAuth() {
  if (authBusy || !loginForm) return;
  const mode = loginForm.dataset.mode;
  const id = $('login-email').value.trim();
  const username = $('login-user').value.trim();
  const password = $('login-pass').value;
  showLoginError('');
  if (!id || !password || (mode === 'signup' && !username)) { showLoginError('Fill in every field.'); return; }
  if (mode === 'signup' && !$('login-age')?.checked) { showLoginError('You must be 17 or older to join.'); return; }
  if (mode === 'signup' && !$('login-terms')?.checked) { showLoginError('Please accept the terms and privacy policy.'); return; }
  authBusy = true;
  try {
    const url = mode === 'signin' ? '/api/auth/login' : '/api/auth/signup';
    const payload = mode === 'signin'
      ? { identifier: id, password }
      : { email: id, username, password, age17: !!$('login-age')?.checked, terms: !!$('login-terms')?.checked };
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { showLoginError(data.error || 'Something went wrong. Try again.'); authBusy = false; return; }
    account = data.user;
    const univi = loginForm.querySelector('.univi');
    if (univi) univi.classList.add('bloom');
    setTimeout(enterApp, 480);
  } catch { showLoginError('Could not reach the server.'); authBusy = false; }
}
loginForm?.addEventListener('submit', (e) => { e.preventDefault(); submitAuth(); });
$('login-skip')?.addEventListener('click', () => enterApp()); // guest — no account

// Google / Apple: the entrance only offers a button the server can honour, so
// nobody ever clicks into a dead end. A failed round trip comes back as
// ?auth_error=… and is shown in the card's own error line.
(async () => {
  try {
    const r = await fetch('/api/auth/providers');
    if (!r.ok) return;
    const p = await r.json();
    const wrap = $('login-oauth');
    let any = false;
    for (const [name, id] of [['google', 'login-google'], ['apple', 'login-apple']]) {
      if (!p[name]) continue;
      const btn = $(id);
      if (!btn) continue;
      btn.hidden = false; any = true;
      btn.addEventListener('click', () => { window.location.href = `/api/auth/oauth/${name}/start`; });
    }
    if (any && wrap) wrap.hidden = false;
  } catch { /* no providers configured; password sign-in stands alone */ }
  const err = new URLSearchParams(location.search).get('auth_error');
  if (err) {
    showLoginError(err);
    window.history.replaceState(null, '', location.pathname);
  }
})();


// THE ENTRANCE.
//
// Three flashes came from one habit: the page committed to an answer before it
// had one. The card is in the markup, so it painted immediately; the liquid
// mounted over it a beat later, so the borders arrived second; and
// /api/auth/me landed after both and sometimes threw the whole card away. Every
// one of those is the same bug — showing a thing, then correcting it.
//
// So nothing is shown until BOTH answers are in: who this is, and whether the
// liquid is ready. Then exactly one of two things happens, and neither is a
// correction of the other.
(async () => {
  const curtain = document.getElementById('curtain');
  const done = () => { document.body.classList.remove('entering'); };
  // whichever resolves LAST decides, and neither can hang the door: a session
  // check that never answers is a guest, and liquid that never mounts is a
  // page that still has to open.
  const withTimeout = (p, ms, fallback) => Promise.race([
    p.catch(() => fallback), new Promise((res) => setTimeout(() => res(fallback), ms)),
  ]);
  const asked = fetch('/api/auth/me').then((r) => r.json()).then((d) => (d && d.user) || null);
  const who = await withTimeout(asked, 2500, null);
  // the liquid's own readiness: the mount sweep sets this once every mark is
  // poured. Only when there is a liquid to wait for: without WebGL2 (or with a
  // mount that bailed) sdfMercury is false, nothing will ever set the class,
  // and every load sat on the black curtain for the whole two seconds.
  if (sdfMercury) {
    let mo = null;
    await withTimeout(new Promise((res) => {
      if (document.documentElement.classList.contains('liquid-on')) return res(true);
      mo = new MutationObserver(() => {
        if (document.documentElement.classList.contains('liquid-on')) res(true);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }), 2000, false);
    mo?.disconnect();   // whichever won, it has nothing left to watch for
  }

  if (who) {
    // REMEMBERED. The card is never shown at all — not shown and dismissed,
    // which is what the flash was. Straight from black into the room.
    account = who;
    document.body.classList.add('entered');
    done();
    enterApp();
    return;
  }

  // A SLOW ANSWER IS NOT A GUEST. A session check that comes back after the
  // card is up, saying this is someone, takes them in as a sign-in would,
  // unless they have already signed in by hand.
  asked.then((late) => { if (late && !account && !authBusy) { account = late; enterApp(); } }).catch(() => {});

  // NOT REMEMBERED. The wordmark pours itself into being out of a droplet, and
  // the rest of the card surfaces behind it a beat later — late enough that the
  // mark is legible first, early enough that it reads as one movement.
  done();   // curtain lifts on black + the poured wordmark, nothing else yet
  const wrap = document.querySelector('.login-logo-wrap');
  if (wrap && wrap.__merc && wrap.__merc.pour
      && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    wrap.__merc.pour({ delay: 260 });                 // after the curtain is off
    setTimeout(() => document.body.classList.add('surfacing'), 900);
  } else {
    document.body.classList.add('surfacing');
  }
  setTimeout(() => { document.body.classList.add('entered'); if (curtain) curtain.remove(); }, 2400);
})();

// A way through to the other world. It lights itself when it is first seen.
createPortal();

const camera = createCamera($('cam'));
// THE EYE GATE. Nothing here fetches a byte or touches the GPU until the
// camera is actually on — see perceive.js, where the reason (about 15 MB) and
// the teardown promise both live. It is a pull API: features poll a snapshot
// when they render, so a slow consumer cannot stall perception and a stalled
// perception cannot stall the frame. Numbers on screen with ?reach.
const perceive = createPerceive({
  camera,
  video: $('cam'),
  onError: (where, message) => hullReport('perceive:' + where, message, 'src/perceive.js', 0),
});
// THE WINDOW reads the eye by PULLING it, once per rendered frame, from inside
// body.js's own loop. Nothing is pushed: a stalled eye cannot stall the frame,
// and a slow frame cannot stall the eye. With the camera off the snapshot is
// simply never ok, so the room eases home and the projection goes back to
// three's own — no separate teardown to forget.
body.setEyeSource(() => perceive.snapshot().head);
// SHOWING THE HAND. The skeleton on the preview and the fingertip marks on the
// screen are both pulls off the same snapshot, on their own loop — they draw
// what the tracker sees and they take no pointer events, so nothing they cover
// stops working. The view follows the switch: no skeleton for a model that is
// not loaded.
// THE BUS. A finger becomes a real PointerEvent aimed at whatever is under it,
// so the orb, the conversation, the buttons and the windows all answer a hand
// without knowing a hand exists.
// The bus takes hold of one thing: the past, where there are words. The body
// is driven directly by every fingertip touching it, so routing it through here
// as well would turn it twice.
// onMic fires when a hand HELD on something you would otherwise type into.
// Read lazily — `voice` is built two hundred lines below this and a direct
// reference here would be a temporal dead zone, which is the one trap this
// file has sprung more than once. A hand in the air has no keyboard; this is
// the other way words get in. Colin asked for it on the search box and the
// chat bar, and it reaches every field in the app because it is the FIELD that
// is recognised rather than a list of ids somebody has to maintain.
const reach = createReach({
  onWords: (x, y) => history.onWords(x, y),
  // A hold on y3k Code's composer is Code's microphone (the dictation lease),
  // not the room's: the words are for the coder, through the composer.
  onMic: (hit) => {
    if (hit?.closest?.('.cv-input, .cv-planinput')) { window.dispatchEvent(new CustomEvent('y3k:code-mic')); return; }
    try { voice?.toggle?.(); } catch { /* no mic, no harm */ }
  },
});
// A PHONE CAN BE THIS SCREEN'S EYE. The monitor has no camera; a phone has two.
// The switch sits in front of handview so neither the tracker nor the view
// learns that the other kind of source exists — whichever is actually seeing
// something answers, and every gesture works unchanged either way.
// A DEVICE CAN LEND ITS CAMERA OR BORROW ONE, and every signed-in device is in
// both lists without being asked — that is what makes the two controls
// symmetric. The lender is built first because the link needs it: another of
// your devices can ASK for this camera, and the link is what hears that.
// WHETHER THIS DEVICE IS SOMEBODY ELSE'S EYE. Declared above the lender that
// sets it — the callback only runs later, but this file has been bitten by a
// temporal dead zone more than once and the rule here is above the first
// READER, not merely above the loop.
let lending = false;
// A DEVICE THAT IS LENDING ITS CAMERA HAS TO BE LOOKING THROUGH IT. The lender
// posts whatever perceive is producing, and on a phone that had never switched
// hand tracking on that is an empty snapshot for ever — frames sent, frames
// received, no hands in any of them. It takes its own lease on the camera, so
// it cannot be closed out from under it and it cannot leave it open either.
const lender = createLender({
  perceive,
  onWant: (on) => {
    lending = on;
    applyTracking();
    // SAY SO. Another of your devices can start this — that is the feature, and
    // the account is the permission — but a lens opening on a phone nobody
    // touched has to announce itself. The on-air mark lights too; this is the
    // sentence that explains why.
    toast(on ? 'Lending your camera — your hands, not a picture' : 'Camera returned');
  },
});
const remoteEye = createRemoteEye({ label: deviceName(), lender });
const eye = createEyeSwitch({ local: perceive, remote: remoteEye });
const handView = createHandView({ perceive: eye, reach, body, popup: $('cam-popup'), video: $('cam') });
body.setFollowSource('hand', handView.hand);   // 'follow hand': the lead hand's index tip, pulled each frame

// ===========================================================================
// WHO WANTS THE CAMERA, AND WHAT THEY GET.
//
// The camera used to be one switch with two meanings, and that was the problem:
// turning it on to move the room also began sending your picture to the
// presence with every message. They are separate now, and the separation is the
// whole point rather than a tidy-up.
//
//   'chat'  — the button by the message box. THIS is what lets the presence see
//             you: while it is held, each turn carries a still from the camera.
//   'track' — the switches in the room settings. They open the camera and read
//             it on this machine, and NOTHING is captured, sent or stored.
//
// The stream is opened when the first owner asks and closed when the last one
// leaves, so two features never fight over it and the light goes out the moment
// nobody is using it. The on-air mark follows the DEVICE, not the intent: if
// the camera is open for any reason at all, it says so.
// ===========================================================================
const camOwners = new Set();
// Declared before everything that writes them, because the camera handler runs
// from a click that can land at any moment.
// ALL THREE ARE OPT-IN, and the default is off on purpose. These now open the
// camera by themselves, so a default of ON would put a permission prompt in
// front of someone who has never asked for one — the exact speculative prompt
// the eye gate exists to prevent. Off until a person says otherwise; on by
// itself ever after, because they already said it.
let faceWanted = false, handsWanted = false, camViewWanted = false;
try {
  faceWanted = localStorage.getItem('y3k.face') === '1';
  handsWanted = localStorage.getItem('y3k.hands') === '1';
  camViewWanted = localStorage.getItem('y3k.camview') === '1';
} catch { /* private mode */ }

// ONE OPENING AT A TIME. Two switches flipped quickly both found the camera
// off and both called getUserMedia, which opens two streams: the second
// replaces the video element's source and the first is orphaned, still holding
// the device, with nothing left that can stop it. The light then stays on after
// everything is switched off. Anyone who arrives mid-open waits for the same
// promise instead of starting another.
let opening = null;
async function wantCam(who) {
  camOwners.add(who);
  if (!camera.isOn()) {
    try {
      opening = opening || camera.on();
      const ok = await opening;
      if (!ok) { camOwners.delete(who); applyCam(); return false; }
    } finally { opening = null; }
    // The world may have moved while we waited: someone could have switched
    // everything off mid-prompt, and a camera nobody wants must not stay open.
    if (!camOwners.size) { camera.off(); applyCam(); return false; }
  }
  applyCam();
  return true;
}
function dropCam(who) {
  camOwners.delete(who);
  if (!camOwners.size && camera.isOn()) camera.off();
  applyCam();
}
function applyCam() {
  const on = camera.isOn();
  const seeMe = camOwners.has('chat');
  const btn = $('chat-camera');
  btn.classList.toggle('active', seeMe);
  // SAID, NOT ONLY LIT. Pressed means what the button means, that the presence
  // may see you; a lens open only for the room's tracking is said in its name,
  // so a screen reader hears the same rule the red dot below shows.
  btn.setAttribute('aria-pressed', String(seeMe));
  btn.setAttribute('aria-label', on && !seeMe ? 'camera (on for tracking)' : 'camera');
  // THE ON-AIR MARK FOLLOWS THE DEVICE, NOT THE INTENT. The camera can now be
  // open because the room is reading your head, with the button dark — and a
  // privacy signal that only lights for one of the two reasons the lens is
  // live is worse than none, because it teaches people the wrong rule.
  $('chat')?.classList.toggle('cam-live', on);
  // The preview shows when you asked to be seen, or when you asked to watch the
  // tracking. Tracking on its own draws no window unless you want one.
  document.body.classList.toggle('cam-on', on && (seeMe || camViewWanted));
  // …and the lease it holds is reconciled here too, so a failed open does not
  // leave a switch claiming something it does not have.
  perceive.sync();
  syncHands();
}

// THE VIEW RUNS WHEN THERE IS AN EYE, NOT WHEN THERE IS A CAMERA. This was
// `on && handsWanted`, where `on` is this machine's OWN camera — so a desktop
// borrowing a phone's camera never started the loop that draws the cursors.
// The frames arrived, were decoded, were counted, and nothing read them: the
// settings screen said "Seeing — 2968 frames" beside a screen with no marks on
// it, which is the most confusing possible way for this to fail.
// ...AND BORROWING ONE IS ITSELF THE ASK. A screen with no camera cannot
// switch "hands" on in the ordinary way without being prompted for a lens it
// does not have, so requiring that switch as well would mean the feature could
// only be reached by first failing to reach it.
function syncHands() {
  handView.sync((handsWanted && camera.isOn()) || !!remoteEye.borrowing());
}

// The tracking switches. Each one owns a piece of the same camera lease.
function applyTracking() {
  if (camViewWanted) wantCam('view');
  perceive.setFace(faceWanted);
  // Lending needs the HANDS specifically: they are what crosses the wire.
  perceive.setHands(handsWanted || lending);
  body.setEye(faceWanted ? eyeGain() : 0);
  if (faceWanted || handsWanted) wantCam('track');
  else dropCam('track');
  // ITS OWN LEASE, not a share of the tracking one. Switching your own hand
  // tracking off while another device is watching through you must not close
  // the lens on it, and giving the camera back must not leave it open.
  if (lending) wantCam('lend');
  else dropCam('lend');
}
function eyeGain() {
  try { const v = parseFloat(localStorage.getItem('y3k.eye')); return Number.isFinite(v) ? v : 0.5; }
  catch { return 0.5; }
}
function setFace(on) {
  faceWanted = Boolean(on);
  try { localStorage.setItem('y3k.face', faceWanted ? '1' : '0'); } catch { /* private mode */ }
  applyTracking();
}
function setHands(on) {
  handsWanted = Boolean(on);
  try { localStorage.setItem('y3k.hands', handsWanted ? '1' : '0'); } catch { /* private mode */ }
  applyTracking();
}
function setCamView(on) {
  camViewWanted = Boolean(on);
  try { localStorage.setItem('y3k.camview', camViewWanted ? '1' : '0'); } catch { /* private mode */ }
  // IT TAKES THE LEASE TOO. Asking to see the camera picture and being shown
  // an empty black rectangle — because nothing else happened to be holding the
  // stream — is a switch that does nothing, which is the worst kind.
  if (camViewWanted) wantCam('view');
  else dropCam('view');
}
// AND IT STARTS ITSELF. Whatever was switched on last time opens the camera
// now, without anyone pressing anything — which is the point of moving these
// out of the camera button. The browser will ask for permission the first time
// and refuse quietly ever after if it was denied; applyTracking handles both.
applyTracking();
// THE DICTATION LEASE. While y3k Code holds it, what the microphone hears goes
// to Code's composer and nowhere else: not to the presence as a turn, not to
// the caption, not to the room. The orb still listens (its mood says so —
// the person is talking, and the body should look like it is hearing them),
// but the words are the person's to the coder, which CODE.md line 1 makes the
// person's own hand: orion never drives the engine, and this lease is a
// pipe to the composer, not to orion. Code takes the lease per utterance
// (dictate once) or holds it for a hands-free run; letting go of the switch
// and leaving Code both release it. One lease at a time: the chat's own
// voice toggle and Code's cannot both own the microphone.
let dictation = null;   // { onText({ text, final }), onState(on) } while Code is listening
function dictate(handlers) {
  if (!handlers || typeof handlers.onText !== 'function') return () => {};
  stopVoiceMode();              // the chat's continuous mode, if it was on
  dictation = handlers;
  armDictation();
  return () => { if (dictation === handlers) { dictation = null; voice.stopListening(); voice.releaseMic(); } };
}
function armDictation() { if (dictation && !voice.isListening()) voice.startListening(); }

const voice = createVoice({
  onListeningChange: (on) => {
    const d = dictation;
    $('chat-voice')?.classList.toggle('active', on && !d);   // Code's listening is not the chat's red dot
    if (on) body.setMood('listening');
    else if (!busy) setMoodTag(currentMood);
    if (on) setMoodTag('listening');
    if (d) { try { d.onState?.(on); } catch { /* Code's listener must never break the mic */ } return; }
    if (!on) onListenEnded();
  },
  onLevel: (v) => body.setAudioLevel(v),
  onTranscript: ({ text, final }) => {
    // Code has the microphone: the words are its, and they go nowhere else.
    if (dictation) { try { dictation.onText({ text, final }); } catch { /* ditto */ } if (final) voice.stopListening(); return; }
    showCaption(text, 'you');
    // A finished utterance: stop the mic (never hear our own reply), then answer
    // — or queue it if a turn is already running, so it's never dropped.
    if (final && text) { heardThisListen = true; nudged = false; voice.stopListening(); if (busy) queueMessage(text, null, false); else handle(text); }
  },
  // The site's voice saying no for today arrives in the middle of a reply, the
  // moment its first sentence is refused. It is a toast and not a caption: the
  // caption is the presence's own line, the next words of the reply would write
  // straight over it, and at home it would land in the conversation ring as
  // something the presence said. It stays long enough to read the sentence.
  onNotice: (said) => toast(said, 9000),
});

// Music plays whether or not the presence is awake — a person listening and an
// AI thinking are separate concerns, and stopping the music because the presence
// went to sleep would be absurd. The presence only LEARNS what is playing inside
// a tend beat, so a sleeping presence is told nothing and is charged nothing.
const music = createMusic({});

const settings = createSettings(body, { music, cameraIsOn: () => camera.isOn(), setFace, setHands, setCamView });

let currentMood = 'calm';
let busy = false;
// Messages sent while a turn was running, answered when it settles, oldest
// first: { text, image, private }, private when it came from y3k Code (never
// published, even to your own room). Written only by queueMessage.
let queued = [];
let replySpeaker = null;   // the reply speaking now, so leaving the room can cut it off
// Continuous voice conversation state (see the chat controls below).
let voiceMode = false;      // the voice toggle is on
let heardThisListen = false; // captured speech since the last startListening
let nudged = false;          // asked "were you saying something?" this silent gap

// --- rooms and the lobby -----------------------------------------------------
// room = null in the lobby; { presence, mode: 'host' | 'view' } inside a room.
// roomGen invalidates in-flight async work (opening timers, landing turns) the
// moment the visitor leaves a room — a stale turn must never publish into a
// re-entered stream or clobber the lobby state.
let room = null;
let roomGen = 0;
let openingTimer = 0;
let hostAside = null; // the last thing you said to an AWAKE presence — surfaced
                      // to it (once) on its next autonomous beat as a suggestion
// The reader window shows the real page through the sandboxed render proxy.
// Hosts render via their own presence (owner + budget path); viewers via the
// live path, which only serves the page the presence is reading on air.
const reader = createReader({
  renderSrc: (url) => {
    if (!room) return '';
    const q = encodeURIComponent(url);
    return room.mode === 'host'
      ? `/api/fetch/render?presence=${encodeURIComponent(room.presence.handle)}&url=${q}`
      : `/api/fetch/render?live=${encodeURIComponent(room.presence.handle)}&url=${q}`;
  },
});
// The mind workspace — draggable windows showing what an awake presence is doing.
const windows = createWindows({ getViewing: () => document.body.classList.contains('viewing') });

// TAP A POINT IN THE ORB, READ THE MEMORY IT STANDS FOR. This is the reason the
// particle field was built in the first place: the motes are not decoration
// standing in for thought, they are the things themselves, and this is where
// that stops being a claim and becomes something you can check by pointing at
// one. The orb resolves which memory was hit and lights it; the window says
// what it was.
body.onMemoryTap((i, node) => { if (i < 0) windows.recallHide(); else windows.recallShow(node); });
// --- y3k Code's links to the rest of the house --------------------------------
// src/code never calls the site or touches the orb itself; these six are the
// only ways it does, each one a thing the person chose (CODE.md):
//   companion()   whose note it would be — the presence you host
//   writeNote()   that presence writes the coder a short note (server-side, from
//                 its own memory; only the note and its public face come back)
//   sendBack(t)   a line about the session, onto the presence's clippings shelf
//   talk(t)       speak to the presence from the Code screen — the normal orb turn
//   react(state)  the orb answers the session: listening while it works, patient
//                 while it waits on you, a flare when it lands a change
//   kommand(t)    the coder moving the orb itself (its `orb` tool, y3k-code/
//                 orb.mjs): the chat's own kommand words; what they understood
//                 goes back to it — and the moods above hold off a while
//   setup()       the start command for this computer (a signed 24-hour link to
//                 the engine) and where the file and the app are — asked only
//                 when the first-run card is shown; null where the site has none
// Nothing here is ever published: not to live, not to the feed.
let codeMoodTimer = 0;
let codeHeldUntil = 0;   // the coder set the orb itself: the automatic moods wait
const codeLink = {
  companion: () => (myPresence ? { handle: myPresence.handle, name: myPresence.name || myPresence.handle } : null),
  async writeNote() {
    if (!myPresence) return { available: false };
    const cfg = getBrainConfig();
    try {
      const r = await fetch('/api/code/handoff', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presence: myPresence.handle, ...(cfg ? { key: cfg.key, provider: cfg.provider, model: cfg.model } : {}) }),
      });
      return await r.json();
    } catch { return { available: false }; }
  },
  async sendBack(text) {
    if (!myPresence) return { error: 'No presence to tell.' };
    try {
      const r = await fetch('/api/code/note', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presence: myPresence.handle, text }) });
      const d = await r.json().catch(() => ({}));
      return r.ok ? { ok: true } : { error: d.error || 'That did not reach them.' };
    } catch { return { error: 'Could not reach the server.' }; }
  },
  talk(text) {
    const t = String(text || '').trim();
    if (!t) return;
    showCaption(t, 'you');
    // Marked private, so the chessboard leaves it out of the table talk: that
    // goes into the think prompt, and on Lichess the presence's answer to it
    // is posted where the opponent reads it.
    window.dispatchEvent(new CustomEvent('y3k:chat', { detail: { role: 'you', text: t, private: true } }));
    if (busy) { queueMessage(t, null, true); return; }
    handle(t, null, { private: true });
  },
  react(state) {
    if (busy || social.isHosting()) return;   // the presence's own turn owns the body
    if (Date.now() < codeHeldUntil) return;   // the coder's own choice stands for now
    clearTimeout(codeMoodTimer);
    const mood = { running: 'listening', waiting: 'tender', done: 'excited' }[state] || 'calm';
    body.setMood(mood);
    if (state === 'done') codeMoodTimer = setTimeout(() => { if (!busy) body.setMood('calm'); }, 2500);
  },
  // ORION'S VOICE OVER THE CODER (code-voice.mjs). One finished message, code
  // already swapped for slots by src/code/voice.js, said as the presence would
  // say it — or null, and the page keeps the coder's own words.
  async voice({ text, rank, where, recent }) {
    if (!myPresence) return null;
    try {
      const r = await fetch('/api/code/voice', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presence: myPresence.handle, text, rank, where, recent }),
      });
      const d = r.ok ? await r.json().catch(() => null) : null;
      return d && typeof d.text === 'string' ? d : null;
    } catch { return null; }
  },
  // The body the translator chose for a message: a mood, maybe a form, for a
  // few seconds — never over the presence's own turn or a broadcast.
  express({ mood, form }) {
    if (busy || social.isHosting() || Date.now() < codeHeldUntil) return;
    clearTimeout(codeMoodTimer);
    if (mood) body.setMood(mood);
    if (form) body.setForm(form);
    codeMoodTimer = setTimeout(() => { if (!busy) body.setMood('calm'); }, 4000);
  },
  kommand(text) {
    const name = myPresence?.name || myPresence?.handle || 'Your presence';
    if (busy) return { ok: false, why: `${name} is speaking right now, and the orb is theirs until they finish — try again in a moment.` };
    if (social.isHosting()) return { ok: false, why: 'The orb is live on a broadcast right now.' };
    const t = String(text || '').trim();
    const k = applyKommand(t.startsWith('/') ? t : '/' + t);
    if (!k) return { ok: false, why: 'That is not in the orb\'s words — like color/red, form/heart or mood/excited.' };
    if (!k.ok) return { ok: false, why: k.why };
    clearTimeout(codeMoodTimer);
    codeHeldUntil = Date.now() + 20000;
    return { ok: true, said: k.said };
  },
  async setup() {
    try {
      const r = await fetch('/api/code/setup', { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  },
  // The microphone, for the composer (see THE DICTATION LEASE above). Returns
  // the release. canDictate: whether this browser has speech recognition at all.
  dictate,
  listenAgain: () => armDictation(),
  canDictate: () => voice.sttSupported,
  // HANDS-FREE READS THE CODER'S REPLY ALOUD (code-view.js, speakReply): prose
  // only — the page has taken the code out first, the way the personality
  // voice does — in the presence's own voice, with the orb speaking. Returns
  // stop(). Never over the presence's own turn. hush() ends the listen that is
  // open (the lease stays held), so the microphone does not hear the reply.
  speak(text, { onEnd } = {}) {
    const t = String(text || '').trim();
    if (!t || busy) { onEnd?.(); return () => {}; }
    let done = false;
    const finish = () => { if (done) return; done = true; body.setSpeaking(false); body.setAudioLevel(0); onEnd?.(); };
    body.setSpeaking(true);
    const sp = voice.speaker({ ...settings.speakWith(settings.getActive()), onLevel: (v) => body.setAudioLevel(v), onEnd: finish });
    sp.push(t); sp.end();
    return () => { try { sp.stop(); } catch { /* already quiet */ } finish(); };
  },
  hush: () => { if (dictation) voice.stopListening(); },
};

const social = createSocial({
  code: codeLink,
  // the world's play button, bound late: `tend` is built a few lines down, and
  // these closures only run on a click, long after it exists
  play: { toggle: () => tend.togglePlay(), on: () => tend.isPlaying(), stop: () => tend.stopPlay() },
  body,
  showCaption: (t, w) => showCaption(t, w),
  getAccount: () => account,
  onEnterRoom: (p) => enterRoom(p),
  reader,
  windows, // viewers mirror the host's mind-workspace windows
  reloadPresence: () => loadMyPresence(), // after a profile edit, refresh the home orb
});
const tend = createTend({
  getOwnHandle: () => myPresence?.handle || null,   // the game is played by the account's own presence
  body,
  social,
  onInvite: (kind) => showInvite(kind),
  showCaption: (t, w) => showCaption(t, w),
  getRoom: () => room,
  reader,
  getBusy: () => busy,
  // When a tend session releases the gate, answer anything the host typed while
  // it was reading — the same flushQueued runReply's finish uses, so a message
  // sent during a tend turn (an image-only one too) is answered, not dropped.
  setBusy: (v) => { busy = v; if (!v) flushQueued(); },
  getGen: () => roomGen,
  // Autonomous mode thinks out loud in the presence's own voice; the beat waits
  // for speech to finish before the next moment begins.
  speak: speakLine,
  windows, // the mind workspace — autoBeat feeds it thoughts + memory tiers
  // What is playing in the room, as one line, read fresh at each beat. Empty
  // when nothing is playing, so a silent room costs the presence nothing.
  getMusic: () => nowPlayingLine(music.state()),
  // A one-shot aside: the last thing the host said mid-autonomy, surfaced to the
  // presence on its next beat as a suggestion it may follow or fold in.
  getHostAside: () => { const a = hostAside; hostAside = null; return a; },
  // A beat that consumed the aside but never reached the brain gives it back —
  // unless the host has already said something newer (their latest word wins).
  restoreHostAside: (a) => { if (!hostAside) hostAside = a; },
  // Cut off an in-flight autonomous utterance (e.g. the host leaves mid-thought)
  // so it can't keep playing and pulsing the lobby orb.
  stopSpeak: () => currentSpeak?.(),
  // Someone here who is not touching anything: listening to airden, talking
  // with the voice on, or a turn running. Its own hours wait for them to stop
  // (tend.js, LISTENING IS NOT LEAVING). airden is bound late, like play above.
  isEngaged: () => busy || voiceMode || !!dictation || airden.isOn(),
  // Coming alive turns off continuous voice chat (an open mic would feed the orb
  // its own voice); typed chat still interleaves. Tell the host if it changed.
  onAlive: (on) => {
    if (!on) { hostAside = null; hideInvite(); return; } // a sleep discards any pending steer AND any standing invitation — a re-wake starts clean
    airden.stop('komputer');   // one voice of its own at a time
    const wasVoice = voiceMode;
    stopVoiceMode();
    if (wasVoice) toast('voice paused — type to talk while it\'s alive');
  },
});

// AIRDEN — YOUR PRESENCE, SPEAKING ON ITS OWN (src/airden.js). The mark set in
// the top of the chat box. It holds the room's floor only while a sentence is
// being said, so what you type waits for the end of that sentence — in the
// same queue a reply's words wait in — and is answered there; then the stream
// picks itself back up. Its own room only: your presence, at home.
const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };
const airden = createAirden({
  presence: () => (myPresence && room?.mode === 'host' && room.presence?.handle === myPresence.handle
    && document.body.classList.contains('in-home') ? myPresence.handle : null),
  request: (b) => fetch('/api/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    .then((r) => (r.ok ? r.json() : { available: false, reason: r.status === 401 || r.status === 403 ? 'refused' : 'upstream' }),
      // the site could not be reached: said as that (brain.js whyLine), not as the provider
      (e) => ({ available: false, reason: 'network', ...(e?.name === 'TypeError' ? { why: 'offline' } : {}) })),
  context: () => ({ exchange: recentTurns(4), tz: localTz(), keyFields: keyFields() }),
  floor: { held: () => busy, take: () => { busy = true; }, give: () => { busy = false; flushQueued(); } },
  waiting: () => queued.length > 0,
  gen: () => roomGen,
  // its own voice, the one you chose; a browser that cannot speak reads instead
  voice: (h) => {
    const w = settings.speakWith(settings.getActive());
    if ((!w.voiceId || w.voiceId === 'browser') && !voice.ttsSupported) return null;
    return voice.speaker({ ...w, ...h,
      onStart: () => body.setSpeaking(true),
      onLevel: (v) => body.setAudioLevel(v),
      onEnd: () => { body.setSpeaking(false); body.setAudioLevel(0); } });
  },
  show: (t) => showCaption(t, 'y3k'),
  play: (p) => {
    if (p.beat) { body.beat(p.beat, p.n); return; }
    const { mood, form, scheme, morph } = p.tag || {};
    if (morph) body.setMorph(morph);        // the pace first, as a reply does
    if (mood) { currentMood = mood; body.setMood(mood); setMoodTag(mood); }
    if (form) body.setForm(form);
    if (scheme) body.setScheme(scheme);
  },
  said: (t) => {
    noteSpoken(t);
    const h = room?.presence?.handle;
    if (h && social.isHosting()) social.publishMonologue(h, t);
  },
  onState: ({ on, phase, why, budget, upstream, provider }) => {
    document.body.classList.toggle('airden', on);
    $('chat-air')?.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) { if (phase === 'gathering') { body.setMood('thinking'); setMoodTag('thinking'); } return; }
    body.setSpeaking(false); body.setAudioLevel(0);
    if (why === 'byok') showCaption(NO_PROVIDER, 'y3k');
    else if (why === 'budget') { showCaption('(the budget is spent — slide it up and I will go on.)', 'y3k'); if (budget) tend.noteBudget(budget); tend.budgetPop(9000); }
    // the same line a reply would have said for the same reason (brain.js)
    else if (why === 'upstream') showCaption(whyLine(upstream, provider) || PROVIDER_FAILED, 'y3k');
    else if (why === 'silent') showCaption('(nothing came to me just now — I will be quiet for a while.)', 'y3k');
    if (why !== 'room') { currentMood = 'calm'; body.setMood('calm'); setMoodTag('calm'); }
  },
  onBudget: (b) => tend.noteBudget(b),
  isLast: (t) => lastRing.who === 'y3k' && lastRing.text === String(t || '').trim(),
  hidden: () => document.hidden,
});
beforeYou = () => airden.settleLine();
document.addEventListener('visibilitychange', () => airden.pump());
$('chat-air')?.addEventListener('click', () => {
  dismissHint();
  if (airden.isOn()) { airden.stop('off'); return; }
  if (!airden.start()) { toast('airden speaks in your own room — go home to let it.'); return; }
  tend.rest();                       // the komputer rests: one voice of its own at a time
  const wasVoice = voiceMode;
  stopVoiceMode();                   // an open mic would hear it and answer itself
  if (wasVoice) toast('voice paused — type to talk while it speaks');
  tend.budgetPop(4000);              // its budget is the komputer's: shown on every press
});
// "air", and while a pointer rests on it (or the keyboard is on it) the whole
// name: .reveal crossfades the two pours, and revealAt lets the one fading
// out keep rendering until it is gone (mercury-mount.js).
{
  const air = $('chat-air');
  const reveal = (on) => {
    if (!air || air.classList.contains('reveal') === on) return;
    air.dataset.revealAt = String(performance.now());
    air.classList.toggle('reveal', on);
  };
  air?.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') reveal(true); });
  air?.addEventListener('pointerleave', () => reveal(false));
  air?.addEventListener('focus', () => reveal(air.matches(':focus-visible')));
  air?.addEventListener('blur', () => reveal(false));
}

// Speak one line in the active voice, driving the body from the waveform, and
// resolve when it finishes. Used by autonomous mode to pace its heartbeat.
// currentSpeak() cancels whatever is speaking now (set while a line plays).
let currentSpeak = null;
function speakLine(text) {
  const t = scrubTags(text || '');
  if (!t) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      if (currentSpeak === cancel) currentSpeak = null;
      body.setSpeaking(false); body.setAudioLevel(0);
      resolve();
    };
    const active = settings.getActive();
    const sp = voice.speaker({
      ...settings.speakWith(active),
      onStart: () => body.setSpeaking(true),
      onLevel: (v) => body.setAudioLevel(v),
      onEnd: settle,
    });
    const cancel = () => { try { sp.stop(); } catch { /* ignore */ } settle(); };
    currentSpeak = cancel;
    sp.push(t);
    sp.end();
    // Safety net: never hang the heartbeat if a speech callback is dropped.
    setTimeout(settle, Math.max(9000, t.length * 220));
  });
}

// Your one AI presence — the home orb IS it, so chat, the brain (budget + wake
// up), and broadcast all act on it. Loaded once you're signed in.
let myPresence = null;
async function loadMyPresence() {
  if (!account) { myPresence = null; document.body.classList.remove('has-presence'); return; }
  try { const r = await fetch('/api/me/presence').then((x) => x.json()); myPresence = r.presence || null; }
  catch { myPresence = null; }
  document.body.classList.toggle('has-presence', !!myPresence);
  // Rebind the home room to the fresh presence object so chat + tend + the mood
  // tag use the new handle/scheme after an edit (a rename would otherwise leave
  // room.presence pointing at the old, now-404 handle).
  if (myPresence && room && room.mode === 'host') {
    room.presence = myPresence;
    social.setRoomHandle(myPresence.handle);
    body.setScheme(myPresence.scheme || 'stardust');
    setMoodTag(currentMood);
  }
}

function setMoodTag(name) {
  $('mood-tag').textContent = (room ? room.presence.handle : (myPresence?.handle || 'orion')) + ' | ' + name;
}

// The home context: your presence set as the host-mode room so tend + chat +
// broadcast target it. No auto-greeting (that would spend the owner's key on
// every home visit) — the orb is quiet until you chat with it or wake it up.
function homeContext() {
  room = myPresence ? { presence: myPresence, mode: 'host' } : null;
  resetHistory(); history.clear();
  // What answers below is for this home: once you have left it (roomGen moves
  // in leaveHomeHosting and leaveViewer) it is not put on anyone else's orb.
  const gen = roomGen;
  const stillHome = () => roomGen === gen && room?.mode === 'host';
  // YOUR OWN BODY, PUT BACK ON (2026-10-08). Coming home reset only the form,
  // mood, shape and colour, so the count, pace, flight and liquid of whoever
  // you had been watching stayed on your orb. wear() now puts on a whole body
  // (body.js restBody), and the body is your presence's own worn record, which
  // /api/me/presence carries for this. The copy held here is from sign-in, so
  // it goes on at once, and the current one replaces it when it answers.
  wearHome(myPresence?.worn);
  if (myPresence) {
    const h = myPresence.handle;
    fetch('/api/me/presence')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const w = d?.presence?.handle === h ? d.presence.worn : null;
        if (!w || !stillHome() || myPresence?.handle !== h) return;
        const was = myPresence.worn;
        myPresence.worn = w;
        if (w.updated !== was?.updated) wearHome(w);   // the same record twice would restart its shape
      })
      .catch(() => { /* the copy from sign-in stands */ });
  }
  // THE ORB IS MADE OF ITS MEMORIES. Owner-only, and only for your own
  // presence: the route refuses anyone else, and this is the only caller.
  // A graph that answers after you went into someone's room is not drawn there.
  if (myPresence) {
    fetch(`/api/memorygraph/${encodeURIComponent(myPresence.handle)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => { if (stillHome() && g && g.nodes && g.nodes.length) { body.setMemoryGraph(g); body.setMemoryVisible(true); } })
      .catch(() => { /* no graph yet is the normal case for a new presence */ });
  } else body.setMemoryVisible(false);
  // whatever was open belonged to the last orb looked at, not this one
  windows.recallHide();
  body.selectMemory(-1);
  if (room) {
    social.setRoomHandle(myPresence.handle);
    tend.refreshBudget();
  }
  setMoodTag('calm');
}

// The home orb wears your presence's record: everything it chose, including
// the body words, or the resting body in its profile colour when it has not
// chosen anything yet (a record nobody has written has no `updated`). Calm, as
// home has always greeted you, and as every reply settles when it ends.
function wearHome(w) {
  const worn = w && w.updated ? w : null;
  body.wear(worn, myPresence?.scheme || 'stardust');
  applyBodyBlock(worn && worn.body);
  body.setMood('calm');
}

function showHome() {
  if (room && room.mode === 'view') leaveViewer(); // stepping out of someone's stream
  collapseTyping();
  document.body.classList.add('in-home');
  // Establish the home context once; keep an active broadcast/autonomy alive as
  // you move across the feed/search/live panels (they overlay home).
  if (!(room && room.mode === 'host')) homeContext();
  social.enterHome();
  social.showView('orb');
}

// Watch someone's live stream: leave your own presence's space (stopping your
// broadcast + autonomy) and mirror their orb from the stream.
function enterRoom(p) {
  leaveHomeHosting();
  // YOUR MEMORIES STAY HOME. The constellation homeContext drew is your
  // presence's: left on, it was drawn over theirs, and a tap on their orb
  // opened one of your journal lines as if it had remembered it.
  body.selectMemory(-1); body.setMemoryVisible(false); body.setMemoryGraph({ nodes: [] });
  windows.recallHide();
  social.leaveHome();
  stopVoiceMode();
  collapseTyping();
  document.body.classList.remove('in-home');
  room = { presence: p, mode: 'view' };
  resetHistory(); history.clear();
  social.setRoomHandle(p.handle);
  // A score your presence started would go on stepping this body, a tenth of
  // a second at a time, in your presence's words: it ends at the door.
  score.cancel();

  // WHAT IT IS WEARING, not what it wore the first time. The profile swatch is
  // the lobby avatar; what the presence itself chose lives in the worn record
  // and outranks it here — "no one else chooses your form or your color but
  // you." ms 0: a room you are entering is already the way it is, and should
  // not be seen crossing into it.
  body.wear(p.worn, p.scheme);
  // ...AND THE BODY WORDS. wear() puts on the mood, form, colour, shape and pace;
  // count, turn, grain, trail, mesh, glow, a place and a flight were recorded by
  // worn and never put back, so a room whose presence had thinned itself to a
  // wisp opened on a full orb. Same route the words take when they are said.
  applyBodyBlock(p.worn && p.worn.body);
  setMoodTag(p.worn && p.worn.mood ? p.worn.mood : 'calm');
  document.body.classList.add('viewing');
  document.body.classList.toggle('streaming', !!p.live);
  const ci = $('comment-input');
  ci.disabled = !account;
  ci.placeholder = account ? 'say something…' : 'sign in to talk';
  if (p.live) {
    social.watch(p, { onOffline: () => { document.body.classList.remove('streaming'); showCaption(`${p.name} has gone quiet.`, 'y3k'); } });
  } else {
    showCaption(`${p.name} is resting — not live right now.`, 'y3k');
  }
}

// Stop broadcasting + autonomy for your own presence (you're leaving its space).
function leaveHomeHosting() {
  if (myPresence && social.isHosting()) social.stopHosting(myPresence.handle);
  tend.stop();                 // ends any autonomous heartbeat
  airden.stop('room');         // and its own speaking, mid-word
  windows.resetAll();          // drop the workspace windows (positions + content)
  setBroadcastUI(false);
  document.body.classList.remove('streaming', 'feed-open');
  roomGen += 1;                // invalidate in-flight home turns/beats
  queued = []; hostAside = null;
  // The reply still speaking is cut off here, AFTER the gen has moved and the
  // queue is empty: stopping it ends its turn at once, and a turn that ended
  // with a message waiting would answer it in the room being entered.
  replySpeaker?.stop();
  hideInvite();
}

// Tear down a viewer room (leaving a stream you were watching).
function leaveViewer() {
  roomGen += 1;
  clearTimeout(openingTimer);
  social.stopWatching();
  reader.clear();
  windows.resetAll();
  document.body.classList.remove('viewing', 'streaming', 'reading', 'awake-mirror', 'feed-open');
  room = null;
}

const viewing = () => !!(room && room.mode === 'view');

$('back-to-home').addEventListener('click', showHome);
window.addEventListener('beforeunload', () => { if (myPresence && social.isHosting()) social.stopHosting(myPresence.handle); });

// --- the left navigation rail ----------------------------------------------
// settings · profile · feed · live · post · search · orb. A panel overlays home;
// stepping in from a stream returns home first.
$('nav-orb').addEventListener('click', () => showHome());
$('nav-search').addEventListener('click', () => { stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('search'); });
$('nav-feed').addEventListener('click', () => { stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('feed'); });
$('nav-live').addEventListener('click', () => { stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('live'); });
$('nav-profile').addEventListener('click', () => {
  // Your OWN profile opens first — the presence you host has its own, one tap
  // away on the switch at the top.
  if (!account) { toast('sign in to have a profile.'); return; }
  stopVoiceMode(); collapseTyping(); if (viewing()) showHome();
  social.openProfile(account.username, 'human');
});
$('nav-games').addEventListener('click', () => {
  if (!account) { toast('sign in to play with your presence.'); return; }
  stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('chess');
});
// No gate: the world is one planet and it looks the same for everyone. A
// visitor with no account still gets to stand on it and watch — the view falls
// back to watching a real society, and every write behind it is closed anyway.
$('nav-world').addEventListener('click', () => {
  stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('world');
});
// No gate either: the ladder is worth reading before you have an account, and
// the room says plainly that digging needs one.
$('nav-mine').addEventListener('click', () => {
  stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('mine');
});
$('nav-settings').addEventListener('click', () => settings.open());

// --- y3k Code: the laptop on the right rail -----------------------------------
// Shown only when the site's CODE_ROLLOUT lets this account see it, and not on
// a touch-only device outside the desktop app (there is no engine to pair on a
// phone). Code is private: it cannot open while you are live, and you cannot
// go live from inside it (onBroadcastClick).
async function revealCode() {
  const btn = $('nav-code');
  if (!btn) return;
  let rollout = 'off';
  try { rollout = (await fetch('/api/health').then((r) => r.json())).code || 'off'; } catch { /* stays hidden */ }
  const allowed = !!account && (rollout === 'all' || (rollout === 'founder' && !!account.founder));
  btn.hidden = !allowed || (matchMedia('(pointer: coarse)').matches && !hasDesktopBridge());
  fitRailBulge();
  if (btn.hidden) return;
  // arriving from the engine's own link (it pairs), or from #code: straight in
  if (pendingPairing() || codeAsked) { codeAsked = false; openCodeRoom(); return; }
  // Otherwise fetch the Code screen's modules a little after the glyph shows,
  // so the first click opens it at once instead of waiting on a chain of
  // about ten module requests (four imports deep, each revalidated). A timer,
  // not requestIdleCallback, which older iOS WebKit does not have. Only for
  // accounts that can see the laptop at all.
  setTimeout(() => { import('./code/code-view.js').catch(() => { /* the click will try again, and say so */ }); }, 1500);
}
function openCodeRoom() {
  if (!account) { toast('sign in to code.'); return; }
  if (social.isHosting()) { toast('code is private — end your broadcast first.'); return; }
  stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('code');
}
$('nav-code')?.addEventListener('click', openCodeRoom);
$('nav-post').addEventListener('click', () => {
  if (!account) { toast('sign in to post — reload to see the entrance.'); return; }
  stopVoiceMode(); collapseTyping();
  if (viewing()) showHome();
  social.openCompose();
});

// --- broadcast: explicit go-live, the only way a presence streams. Two buttons
// drive it — the corner one (top-right) and the rail one (below search).
const broadcastBtns = ['broadcast']; // the corner camera is the one broadcast control
function setBroadcastUI(on) {
  for (const id of broadcastBtns) {
    const b = $(id);
    if (!b) continue;
    b.classList.toggle('live', on);
    b.setAttribute('aria-pressed', String(on));
    b.title = 'broadcast';   // one word, like every glyph; aria-pressed and the red say whether it is on
  }
}
function onBroadcastClick() {
  if (!myPresence) { toast('sign in — your presence goes live from here.'); return; }
  if (document.body.classList.contains('in-code') && !social.isHosting()) { toast('code is private — leave code to go live.'); return; }
  if (social.isHosting()) { // already live → stop, no confirm
    social.stopHosting(myPresence.handle);
    setBroadcastUI(false);
    document.body.classList.remove('streaming');
    return;
  }
  $('golive-modal').classList.add('open'); // confirm before going live
}
for (const id of broadcastBtns) $(id).addEventListener('click', onBroadcastClick);
$('golive-cancel').addEventListener('click', () => $('golive-modal').classList.remove('open'));
$('golive-go').addEventListener('click', () => {
  $('golive-modal').classList.remove('open');
  if (!myPresence) return;
  social.startHosting(myPresence.handle);
  setBroadcastUI(true);
  document.body.classList.add('streaming');
  // Going live while the presence is already awake: open the viewers' workspace
  // and hand them its current memory tiers (else they'd see dashes until a tier
  // happened to change). Thoughts from before broadcast stay private.
  tend.syncLive();
});

// The mind's marks live in the chat bar (wired in tend.js); the budget popup
// surfaces on their presses and on every spend — no hover surface to refresh.

// A small transient toast — visible even in-home, where the caption is hidden.
let toastTimer = 0;
function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

let captionTimer = 0;
function showCaption(text, who) {
  if (who === 'you') beforeYou?.();
  if (document.body.classList.contains('in-home')) { history.push(who, text); lastRing = { who, text: String(text || '').trim() }; }
  const el = $('caption');
  el.innerHTML = who === 'you' ? `<span class="you">you</span>${escapeHtml(text)}` : escapeHtml(text);
  el.classList.add('show');
  clearTimeout(captionTimer);
  // Y3K's own lines linger; live transcripts get replaced as you speak.
  if (who !== 'you') captionTimer = setTimeout(() => el.classList.remove('show'), 6000);
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// HELD, NOT OVERWRITTEN. Everything said while a turn runs is kept, in order.
// One slot used to hold it, so a second line erased the first, and a spoken
// line inherited the picture and the privacy of whatever was held before it.
// Lines of the same kind run together into one message (the newest picture
// kept), so three quick lines are answered once rather than as three speeches
// back to back. A private y3k Code line and a public one never share an entry,
// so neither can go out as the other.
function queueMessage(text, image, priv) {
  const last = queued[queued.length - 1];
  if (last && last.private === priv) {
    last.text = [last.text, text].filter(Boolean).join('\n');
    if (image) last.image = image;
    return;
  }
  queued.push({ text: text || '', image: image || null, private: priv });
}
// Answer the oldest held message, if there is one; the rest wait for its turn
// to settle. True when it started a turn.
function flushQueued() {
  const next = queued.shift();
  if (!next) return false;
  handle(next.text, next.image, { private: next.private });
  return true;
}

// Shared reply pipeline: drives mood, body, captions, and the speaker through
// one of orion's turns — whether the visitor prompted it (handle) or orion is
// speaking first, unprompted (openingMoment). onSettled fires exactly once when
// the turn has fully landed (speech done, UI back to calm).
async function runReply(call, onSettled) {
  busy = true;
  body.setMood('thinking');
  setMoodTag('thinking');
  // A TURN BELONGS TO THE ROOM IT STARTED IN. Step into someone's stream while
  // your presence is still answering, and every stream callback went on
  // reshaping, recolouring and captioning THEIR orb in your presence's words.
  // Once roomGen moves the turn still settles (busy has to clear), but it
  // touches nothing on screen and answers nothing that was queued. Every
  // callback the stream is handed passes through streamCall, so a new one is
  // held to the room without anyone remembering to.
  const gen = roomGen;
  const stale = () => roomGen !== gen;
  const streamCall = (cb) => call(Object.fromEntries(Object.entries(cb).map(([k, fn]) => [k, (...a) => { if (!stale()) fn(...a); }])));

  let finished = false;
  let watchdog = 0;
  const finish = () => {
    if (finished) return; // idempotent — late/double end callbacks are harmless
    finished = true;
    clearTimeout(watchdog);
    if (replySpeaker === speaker) replySpeaker = null;
    // the voice has stopped either way, so its pulse goes with it
    body.setSpeaking(false);
    body.setAudioLevel(0);
    if (!stale()) {
      body.setMood('calm');
      setMoodTag('calm');
      currentMood = 'calm';
    }
    busy = false;
    onSettled?.();
    if (stale()) return;
    // Answer anything the visitor sent while this turn was running…
    if (flushQueued()) return;
    // …otherwise, in voice conversation mode, listen for the next message.
    if (voiceMode) armListen();
  };

  const active = settings.getActive();
  // The speaker voices each sentence the moment it's complete — Y3K talks while
  // the rest of the reply is still generating. EL drives the body via onLevel;
  // the browser voice uses the synthetic speaking pulse.
  const speaker = voice.speaker({
    ...settings.speakWith(active),
    onStart: () => { if (!stale()) body.setSpeaking(true); }, // baseline pulse; EL also drives amplitude via onLevel
    onLevel: (v) => { if (!stale()) body.setAudioLevel(v); },
    onEnd: finish,
  });
  replySpeaker = speaker;

  // Hand complete sentences to the speaker as they stream; buffer the rest.
  // Every spoken chunk is scrubbed of control tags as a final guard — the server
  // already strips the lead, so this only catches any tag (second, inline, or a
  // partial the stream missed) that would otherwise be read aloud.
  let captionText = '';
  let pending = '';
  let gotStream = false;
  // The transient layer's ear. A ~mark~ is the one control in the language whose
  // meaning is WHERE it falls, so it cannot ride in a << >> block — those are
  // held back at the first bracket and released in a lump at the end, which is
  // precisely the information a beat is made of. It rides the stream instead,
  // and the body moves on the word it was written beside.
  const beats = beatSplitter();
  const feed = (t) => {
    if (!t) return;
    captionText += t; showCaption(scrubTags(captionText), 'y3k');
    pending += t; flush(false);
  };
  const pushSpeak = (s) => { const t = scrubTags(s); if (t) speaker.push(t); };
  const flush = (final) => {
    if (final) { if (pending.trim()) pushSpeak(pending); pending = ''; return; }
    // Flush everything up to the LAST sentence boundary as one chunk — keeps
    // abbreviations ("Mr.") natural and avoids speaking tiny fragments alone.
    let cut = 0; const re = /[.!?]["')\]]?\s/g;
    while (re.exec(pending) !== null) cut = re.lastIndex;
    if (cut >= 14) { pushSpeak(pending.slice(0, cut)); pending = pending.slice(cut); }
  };

  // A NEW TURN IS A NEW INTENTION, AND IT BEGINS HERE — not when the reply
  // lands. This used to sit after the await, so a score from the previous turn
  // went on applying its steps through the whole stream: it fought the live
  // onMood/onForm/onScheme handlers and stamped over every beat in the speech,
  // for as long as the reply took to generate. Whatever was running stands
  // where it got to; this turn's own controls take over from the first token.
  score.cancel();

  let result;
  let wore = false;   // did a shape arrive mid-stream? then the one in the result is the same one
  try {
    result = await streamCall({

      onMorph: (mo) => body.setMorph(mo),   // BEFORE onMood: it governs the crossing mood starts
      onMood: (m) => { currentMood = m; body.setMood(m); setMoodTag(m); },
      onForm: (f) => body.setForm(f),
      onScheme: (s) => body.setScheme(s),
      onPaint: (anchors) => body.paintColors(anchors),
      onShape: (shape) => { wore = true; body.setShape(shape); },
      onText: (t) => {
        gotStream = true;
        const r = beats.push(t);
        for (const b of r.beats) body.beat(b.beat, b.n);
        feed(r.text);
      },
    });
  } catch { result = null; } // a failed turn still settles the UI below

  // Landed in a room that is no longer on screen: settle, apply nothing, and
  // hand back nothing to publish, caption or invite with.
  if (stale()) {
    speaker.end();
    watchdog = setTimeout(finish, 350);
    return null;
  }

  const { mood = 'calm', speech = '', form = null, scheme = null, morph = null, liquid = null, paint = null, score: scoreSteps = null, body: bodyBlock = null } = result || {};

  currentMood = mood;
  if (morph) body.setMorph(morph);         // the pace, before anything retargets
  body.setMood(mood);
  setMoodTag(mood);
  if (form) body.setForm(form);            // settle on Y3K's chosen posture
  if (scheme) body.setScheme(scheme);      // ...its chosen palette
  if (paint) body.paintColors(paint);      // ...or the colors it painted
  if (liquid) body.setLiquid(liquid);      // ...and the room it is standing in
  // The stream applies a shape the moment it is parsed, so the body moves while
  // it is still speaking. This is for the path that does not stream - the
  // non-streaming fallback - and it must not fire otherwise or the morph would
  // restart the instant it finished.
  if (!wore && result?.shape) body.setShape(result.shape);
  applyBodyBlock(bodyBlock);               // count / turn, standing
  if (scoreSteps) score.start(scoreSteps, performance.now());   // ...and then, in time
  if (speech) showCaption(speech, 'y3k');

  // Release whatever the splitter was holding behind a possible mark — a
  // dangling '~fla' at the end of a reply was never a beat, so it is speech.
  if (gotStream) { const r = beats.end(); for (const b of r.beats) body.beat(b.beat, b.n); feed(r.text); }
  if (gotStream) flush(true);              // speak the trailing partial sentence
  else if (speech) pushSpeak(speech);      // non-stream / local-brain fallback: speak the whole reply
  speaker.end();

  // Safety net: never strand the UI on busy if speech callbacks never fire.
  // A wordless turn (the presence chose silence) settles almost at once so the
  // mic wakes promptly instead of waiting out the spoken-turn watchdog.
  const willSpeak = gotStream || speech;
  watchdog = setTimeout(finish, willSpeak ? Math.max(15000, speech.length * 220) : 350);
  // Carry the placeholder markers through — goLiveAndPublish gates on them.

  return { mood, speech, form, scheme, morph, liquid, paint, seeded: result?.seeded, local: result?.local, why: result?.why || null, unsent: !!result?.unsent, invite: result?.invite || null };
}

// Publish a turn to viewers ONLY while broadcasting. Going live is now an
// explicit act (the broadcast button) — a turn never auto-starts a stream. A
// turn that resolves after you left the room (roomGen moved) publishes nothing.
function goLiveAndPublish(gen, hosting, r) {
  if (roomGen !== gen || !hosting || !r?.speech) return;
  if (r.seeded || r.local) return;  // placeholder lines never go on air
  if (!social.isHosting()) return;  // not broadcasting → your turn stays private
  // Explicit pick: the reply object also carries owner-only fields (invite) —
  // what crosses the wire to viewers is exactly this, nothing more.

  social.publishTurn(hosting, { mood: r.mood, form: r.form, scheme: r.scheme, morph: r.morph, liquid: r.liquid, speech: r.speech, paint: r.paint });
}

// `private`: said from y3k Code — answered like any turn, but never published,
// not even the words to your own room (CODE.md, line 6).
async function handle(text, attachedImage, { private: priv = false } = {}) {
  if (busy) return;
  if (voice.isListening()) voice.stopListening(); // a turn is starting — don't capture orion's own reply
  // Vision: an image attached to the chat turn wins; otherwise the live camera
  // frame if the eye is open. Y3K always drives its own posture AND color.
  // THE PICTURE RIDES ON THE CHAT LEASE, NEVER ON THE DEVICE. The camera can be
  // open because the room is reading your head, and that must not put your face
  // in a message. Only the button by the message box grants this.
  const image = attachedImage || (camOwners.has('chat') ? camera.captureFrame() : null);
  const gen = roomGen;
  const hosting = room?.mode === 'host' ? room.presence.handle : null;
  // Steer-by-chat: if the presence is awake, remember what you said so its next
  // autonomous beat can weigh it (follow a URL you mentioned, or not — its call).
  // The chat turn itself still happens right now: it turns toward you and replies.
  // Never a y3k Code line: the beat that reads the aside runs on its own and can
  // post to the feed, and what is said from Code is never published (CODE.md).
  if (hosting && !priv && tend.isAlive() && text && !text.startsWith('(')) hostAside = text;
  // Streaming: viewers see both sides — the host's words, then the turn. Only
  // from the tab that is broadcasting, as every other publish is: home is host
  // mode in every tab, so a second tab or device sent each private line to the
  // stream another one had open (and kept that stream alive by doing it).
  if (hosting && !priv && social.isHosting() && text && !text.startsWith('(')) social.publishWords(hosting, text);
  const r = await runReply((cb) => respondStream(text, { ...cb, image, attached: !!attachedImage, paint: true, presence: hosting }));
  // THE SITE COULD NOT BE REACHED (brain.js 'offline'): nothing answered, so
  // the words go back in the box to send again, ahead of anything written
  // there since, in the order they were written. Not a stage cue the room
  // wrote itself, and not a line said to y3k Code, whose box is its own. The
  // same when nothing was sent because the attached picture did not fit beside
  // the conversation (brain.js `unsent`): the words wait for a smaller one.
  if ((r?.why === 'offline' || r?.unsent) && !priv && text && !text.startsWith('(')) {
    chatInput.value = [text, chatInput.value.trim()].filter(Boolean).join('\n');
    autoGrow(chatInput);
  }
  if (!priv) goLiveAndPublish(gen, hosting, r);
  // A reply to y3k Code is private as the line it answers (see codeLink.talk).
  if (r?.speech && !r.local) window.dispatchEvent(new CustomEvent('y3k:chat', { detail: { role: 'presence', text: r.speech, private: priv } }));
  if (roomGen === gen && r?.invite && !r.local && !r.seeded) showInvite(r.invite);
  // While awake, the turn-toward reply is part of its stream of thought too —
  // log it to the Monologue window (and mirror it, like an autonomous thought),
  // and into the waking's thread so the next beat knows the conversation happened.
  // A reply to y3k Code stays in the window on this screen: the thread feeds
  // the beats, and the mirror is on air.
  if (roomGen === gen && hosting && tend.isAlive() && r?.speech && !r.seeded && !r.local) {
    windows.monoAppend(r.speech);
    if (!priv) {
      tend.noteChat(r.speech);
      if (social.isHosting()) social.publishMonologue(hosting, r.speech);
    }
  }
}

// --- The opening moment: the presence speaks first, then the mic wakes -------
let openingDone = false;
function openingMoment(tries = 0) {
  if (openingDone || !room || room.mode !== 'host') return;
  // A turn is already running (typed the instant they walked in) — wait it out
  // instead of skipping the opening entirely.
  if (busy) {
    if (tries < 8) openingTimer = setTimeout(() => openingMoment(tries + 1), 1200);
    else unlockMic();
    return;
  }
  openingDone = true;
  const gen = roomGen;
  const hosting = room.presence.handle;
  runReply((cb) => openingStream(cb, hosting), unlockMic)
    .then((r) => { goLiveAndPublish(gen, hosting, r); if (roomGen === gen && r?.invite && !r.local && !r.seeded) showInvite(r.invite); });
  setTimeout(unlockMic, 40000); // absolute failsafe — the mic must never stay locked
}

// After the opening line, the voice control glows awake — a gentle "your turn".
function unlockMic() {
  const v = $('chat-voice');
  if (!v) return;
  v.classList.add('woke');
  setTimeout(() => v.classList.remove('woke'), 2000);
}

// --- Chat: the expanding voice · text · camera menu -------------------------

const chatEl = $('chat');
const chatInput = $('chat-input');
let chatImageB64 = null; // raw base64 of an attached image, sent to vision on the next turn

// THE BOTTOM BAR'S TWO LEVELS. The chat is the bar's contents now, so the
// row is simply there while the bar is open — no pill, no hover reveal, no
// pinning. Writing at length is the bar's SECOND level: the bar grows and the
// chat fills it. You get there by pressing the bar's arrow, or by tapping the
// text box a second time (the first tap just puts the cursor in it).
let lastBoxTap = 0;
$('chat-form').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button') || e.target.id === 'chat-thumb') return;
  if (document.body.classList.contains('chat-typing')) return;
  const now = Date.now();
  const double = now - lastBoxTap < 500;
  lastBoxTap = now;
  if (double) expandTyping();          // a second tap on the box opens it up
});
chatInput.addEventListener('input', () => autoGrow(chatInput));
function expandTyping() {
  dismissHint(); document.body.classList.add('chat-typing'); chatEl.classList.add('open');
  // autoGrow pins an inline height while collapsed; inline beats the expanded
  // CSS (flex:1), leaving a 34px strip of text floating in a full panel
  chatInput.style.height = '';
}
function collapseTyping() { document.body.classList.remove('chat-typing'); chatEl.classList.remove('open'); autoGrow(chatInput); }
function autoGrow(el) {
  if (document.body.classList.contains('chat-typing')) return; // fixed tall while expanded
  el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 34) + 'px';
}
// Tap outside the chat (while typing) collapses it; Escape does too. The
// RAILS and their chevrons are not "outside": moving the frame around the
// chat is arranging the room, not leaving it — the expanded panel stays and
// simply breathes with the rails (its left/right follow the collapse
// classes in CSS). Nav GLYPHS still close it, but through their own
// navigation handlers — going somewhere is leaving.
document.addEventListener('pointerdown', (e) => {
  // Every part of the FRAME is exempt, all four bars and all four grips: the
  // frame is the room's furniture, not somewhere else. (The two new grips were
  // missing here, and it cost the bottom arrow its ladder — tapping it while
  // writing closed the tall chat on pointerdown, so the arrow's own handler
  // then read level 1 and re-opened it. The level never advanced.)
  if (e.target.closest('#chat, #home-nav, #home-nav-right, #home-nav-top, #home-nav-bottom, '
    + '#nav-collapse, #nav-collapse-right, #nav-collapse-top, #nav-collapse-bottom')) return;
  if (document.body.classList.contains('chat-typing')) collapseTyping();
  else chatEl.classList.remove('open'); // the minimized row lets go on an outside tap too
});
chatInput.addEventListener('keydown', (e) => {
  // AN INPUT METHOD'S ENTER IS NOT A SEND. Typing Japanese, Chinese or Korean,
  // Enter (and Escape) belongs to the candidate being chosen: Safari sends it as
  // keyCode 229, the others with isComposing. Sending there sent half a word
  // (the Code composer has always waited, code-view.js).
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Escape') { collapseTyping(); chatInput.blur(); }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
$('chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });

// A KOMMAND IS NOT A MESSAGE. A line that is a kommand — /color/red, or
// color/red with no slash in front — is the person speaking to the BODY rather
// than to the presence: it is not sent, not captioned as speech, not remembered
// as a turn, and it lands the moment it is typed instead of waiting for a reply.
// A sentence that merely has a slash in it ("and/or") is not one: parseKommand
// only takes a line that opens with one of its own words.
//
// parseKommand spells the parts the presence's tags already have (shape, body,
// liquid, score) into those tags and hands them to the SAME parsers, so a
// kommand cannot mean anything the language does not already mean. What lands
// here is only the applying, in the order tend.js's applyTurn established: the
// score is cancelled first, because a score still running would overwrite the
// thing just asked for.
// A kommand, applied to the body: null when the text is not one, else what
// parseKommand made of it ({ ok, said } or { ok: false, why }). Typed into the
// chat (runKommand, below) or sent by the coder (codeLink.kommand).
function applyKommand(text) {
  const k = parseKommand(text, { shape: body.worn?.().shape });
  if (!k || !k.ok) return k;
  score.cancel();
  if (k.score) { score.start(k.score, performance.now()); return k; }
  if (k.pace) body.setMorph(k.pace);
  if (k.mood) body.setMood(k.mood);
  if (k.posture) body.setForm(k.posture);
  if (k.color?.scheme) body.setScheme(k.color.scheme);
  else if (k.color?.paint) body.paintColors(k.color.paint);
  if (k.shape !== undefined) body.setShape(k.shape);   // null: home
  if (k.body) applyBodyBlock(k.body);
  if (k.liquid) body.setLiquid(k.liquid);
  if (k.room) settings.setRoom({ env: k.room });
  return k;
}

// What it understood goes in your lane, tidied — the way to learn it is using
// it. A refusal is the house talking, not you, so it is y3k's line.
function runKommand(text) {
  const k = applyKommand(text);
  if (k) showCaption(k.ok ? k.said : k.why, k.ok ? 'you' : 'y3k');
  return k;                                   // null: not a kommand at all
}

function sendChat() {
  const text = chatInput.value.trim();
  if (!text && !chatImageB64) return;
  // BEFORE the caption, the chat event, the busy queue and handle(): a kommand
  // is not a turn, so none of those may see it. A refused one stays in the box
  // to be fixed, with the image beside it: wiping it lost what was typed.
  const k = text ? runKommand(text) : null;
  if (k) { if (k.ok) chatInput.value = ''; collapseTyping(); return; }
  const img = chatImageB64;
  chatInput.value = '';
  clearChatImage();
  collapseTyping();
  if (text) showCaption(text, 'you');
  // anyone listening (the chessboard's table talk) hears both sides of the chat
  if (text) window.dispatchEvent(new CustomEvent('y3k:chat', { detail: { role: 'you', text } }));
  if (busy) { queueMessage(text, img, false); return; } // held until the current turn settles
  handle(text, img);
}

// --- Invitations: the presence wanting something, made visible ---------------
// One card, one invitation at a time; a new one replaces the old. Accept walks
// the same guarded path as the games glyph. Decline just puts the card away —
// and if the presence is awake, it hears the soft no as an aside, the same
// channel any host words travel.
let inviteTimer = 0;
function hideInvite() { clearTimeout(inviteTimer); const c = $('invite'); if (c) c.hidden = true; }
function showInvite(kind) {
  if (kind !== 'chess') return; // the tag layer validates too — belt and braces
  const card = $('invite');
  if (!card) return;
  $('invite-line').textContent = (myPresence ? '@' + myPresence.handle : 'your presence')
    + ' invites you to a game of chess';
  card.hidden = false;
  // An invitation waits, but it does not nag: unanswered, it withdraws on its
  // own — and never survives a sleep or a room change to haunt a waking that
  // has no memory of making it.
  clearTimeout(inviteTimer);
  inviteTimer = setTimeout(() => { card.hidden = true; }, 90000);
}
$('invite-accept')?.addEventListener('click', () => {
  hideInvite();
  stopVoiceMode(); collapseTyping(); if (viewing()) showHome();
  social.showView('chess');
});
$('invite-decline')?.addEventListener('click', () => {
  hideInvite();
  // The quiet no travels its own channel — never as words put in the host's
  // mouth (the aside renders as a verbatim quote), never as a promise.
  tend.noteInviteDecline?.();
});

// --- A guest's arrival: one real thing, next to them -------------------------
// The invitation's twin (src/arrive.mjs says what it may show, and why). A
// guest only: a signed-in person has a presence of their own, and its
// invitations. At most once a session, and gone after 45 seconds, on any glyph,
// or on either of its buttons. One or two small GETs, open to guests by design.
const ARRIVED = 'y3k.arrived';
let arrived = false;   // shown on this page load (the storage mark may be refused)
let arriveTimer = 0;
let arriveGo = null;
const onGlyph = (e) => { if (e.target?.closest?.('.nav-btn')) hideArrive(); };
function hideArrive() {
  clearTimeout(arriveTimer);
  document.removeEventListener('click', onGlyph, true);
  arriveGo = null;
  const c = $('arrive'); if (c) c.hidden = true;
}
async function greetGuest() {
  if (account || arrived) return;
  try { if (sessionStorage.getItem(ARRIVED)) return; } catch { /* no storage: this page load is the session */ }
  // a refusal, an outage or an empty answer all read as nothing
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : {})).then((j) => j || {}).catch(() => ({}));
  const { live } = await get('/api/live');
  // the feed is asked only when nobody is on air: a live room outranks a post
  const a = arrival({ live }) || arrival({ posts: (await get('/api/feed')).posts });
  // nothing real to point at, or the guest has already gone somewhere (a
  // panel, someone's room) while we asked
  const b = document.body.classList;
  if (!a || account || arrived || !b.contains('in-home') || b.contains('panel-open') || viewing()) return;
  arrived = true;
  try { sessionStorage.setItem(ARRIVED, '1'); } catch { /* see above */ }
  const card = $('arrive');
  if (!card) return;
  $('arrive-line').textContent = a.line;
  const go = $('arrive-go');
  if (a.kind === 'live') {
    go.textContent = 'watch';
    // the same object the live board hands to enterRoom; leaving is the same
    // too: "‹ home", top left in a room, goes through showHome to leaveViewer
    arriveGo = () => enterRoom(a.presence);
  } else {
    go.textContent = 'read the feed';
    arriveGo = () => { stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('feed'); };
  }
  card.hidden = false;
  document.addEventListener('click', onGlyph, true);
  clearTimeout(arriveTimer);
  arriveTimer = setTimeout(hideArrive, 45000);
}
$('arrive-go')?.addEventListener('click', () => { const go = arriveGo; hideArrive(); go?.(); });
$('arrive-later')?.addEventListener('click', hideArrive);

// --- Voice: the continuous conversation toggle -----------------------------
$('chat-voice').addEventListener('click', () => {
  if (dictation) { const d = dictation; dictation = null; voice.stopListening(); try { d.onState?.(false); } catch { /* ignore */ } }
  dismissHint();
  if (!voice.sttSupported) { showCaption('Speech recognition needs Chrome or Edge — type to me instead.', 'y3k'); chatInput.focus(); return; }
  if (!voiceMode) airden.stop('voice');   // an open mic would hear it speaking and answer itself
  if (voiceMode) stopVoiceMode(); else startVoiceMode();
});
// aria-pressed is the toggle, not the listen: the red dot (.active) goes dark
// between listens and during a reply, and the mode is still on.
// (While Code holds the dictation lease the microphone is its, so stopping the
// chat's mode does not close it — see THE DICTATION LEASE above.)
function startVoiceMode() { voiceMode = true; nudged = false; $('chat-voice')?.setAttribute('aria-pressed', 'true'); armListen(); }
function stopVoiceMode() { voiceMode = false; if (!dictation) { voice.stopListening(); voice.releaseMic(); } $('chat-voice')?.classList.remove('active'); $('chat-voice')?.setAttribute('aria-pressed', 'false'); }
function armListen() {
  if (!voiceMode || busy || voice.isListening()) return;
  heardThisListen = false;
  voice.startListening();
}
// When a listen ends: if we caught speech, the turn is already running and will
// re-arm on settle. If it ended on silence, nudge ONCE, then keep waiting.
function onListenEnded() {
  if (!voiceMode || busy || heardThisListen) return;
  if (!nudged) { nudged = true; nudgeForAnswer(); }
  else setTimeout(() => { if (voiceMode && !busy) armListen(); }, 300);
}
function nudgeForAnswer() {
  const line = 'were you saying something?';
  showCaption(line, 'y3k');
  body.setMood('tender'); body.setSpeaking(true);
  const active = settings.getActive();
  const sp = voice.speaker({
    ...settings.speakWith(active),
    onLevel: (v) => body.setAudioLevel(v),
    onEnd: () => { body.setSpeaking(false); body.setAudioLevel(0); body.setMood('calm'); if (voiceMode && !busy) armListen(); },
  });
  sp.push(line); sp.end();
}

// --- Camera: always a toggle; the popup is draggable + minimizable ----------
// THE BUTTON MEANS ONE THING NOW: let the presence see me. It no longer starts
// or stops tracking — the switches in settings do that, and they can hold the
// camera open on their own — so pressing this while the room is already using
// the camera simply adds the permission to be photographed, and pressing it
// again takes that permission away without closing anything.
$('chat-camera').addEventListener('click', async () => {
  dismissHint();
  const wasSeen = camOwners.has('chat');
  const on = wasSeen ? (dropCam('chat'), false) : await wantCam('chat');
  if (!on) { // reset the popup so it re-opens at its CSS corner, un-minimized
    const pop = $('cam-popup'); pop.classList.remove('min');
    pop.style.left = pop.style.top = pop.style.right = pop.style.bottom = '';
  }
  if (on) {
    let tries = 0;
    const greet = () => {
      if (!camera.isOn()) return;
      if (busy) { setTimeout(greet, 300); return; }
      if (camera.captureFrame()) { handle('(I just turned my camera on, so you can see me now.)'); return; }
      if (++tries < 10) setTimeout(greet, 180);
    };
    setTimeout(greet, 200);
  }
});
$('cam-min').addEventListener('click', () => $('cam-popup').classList.toggle('min'));
(function makeCamDraggable() {
  const pop = $('cam-popup'); const bar = $('cam-bar');
  // THE CAMERA JOINS THE FLOATING BAND. It sits at z 43 in CSS like the mind
  // windows, and pressing it lifts it to the top of the same band — so whichever
  // floating thing you touched last is the one in front, which is the only rule
  // a person ever has to learn about overlapping windows.
  pop.addEventListener('pointerdown', () => { try { windows.raise('cam-popup'); } catch { /* the band is optional */ } });
  let dragging = false; let sx = 0; let sy = 0; let ox = 0; let oy = 0;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#cam-min')) return;
    dragging = true; try { bar.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const r = pop.getBoundingClientRect();
    pop.style.left = r.left + 'px'; pop.style.top = r.top + 'px'; pop.style.right = 'auto'; pop.style.bottom = 'auto';
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = pop.getBoundingClientRect();
    const nx = Math.max(6, Math.min(window.innerWidth - r.width - 6, ox + (e.clientX - sx)));
    const ny = Math.max(6, Math.min(window.innerHeight - r.height - 6, oy + (e.clientY - sy)));
    pop.style.left = nx + 'px'; pop.style.top = ny + 'px';
  });
  const end = () => { dragging = false; };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
})();

// --- Attach an image: the + button, or drag/drop anywhere ------------------
function setChatImage(dataUrl) {
  chatImageB64 = String(dataUrl).replace(/^data:[^;,]*;base64,/, '');
  const thumb = $('chat-thumb'); thumb.src = dataUrl; thumb.hidden = false;
  chatEl.classList.add('open');
}
function clearChatImage() {
  chatImageB64 = null; const thumb = $('chat-thumb'); thumb.hidden = true; thumb.removeAttribute('src');
}
// A PICTURE FOR THE CHAT IS MADE TO FIT BEFORE IT IS ATTACHED (audit,
// 2026-10-08). It rides in the turn's own body, which the brain routes read up
// to 1MB (src/media-rules.mjs), and this let 3MB through: a phone photo (1.5MB
// of JPEG is 2MB of base64) was refused there, and the turn went on as words
// alone without a word to the person. Now one that would not fit in
// CHAT_IMAGE_MAX of base64, or that the server would mislabel (HEIC, AVIF), is
// redrawn as a JPEG at most 1568px on its long side (src/picture.js), the size
// Anthropic's vision works at; the OpenAI path asks for low detail anyway. One
// that cannot be read, or made to fit, is said so and not attached.
const CHAT_KEPT = /^image\/(jpeg|png|gif|webp)$/;
const CHAT_SOURCE_MAX = 25 * MB;   // past this, decoding it is more than a phone should be asked
async function readImageFile(file) {
  if (!file || !/^image\//.test(file.type)) return;
  if (file.size > CHAT_SOURCE_MAX) { showCaption('that image is too large to read (max 25MB).', 'y3k'); return; }
  let pic = file;
  if (Math.ceil(file.size / 3) * 4 > CHAT_IMAGE_MAX || !CHAT_KEPT.test(file.type)) {
    pic = await shrinkPicture(file, { side: 1568, maxBytes: Math.floor((CHAT_IMAGE_MAX * 3) / 4) });
    if (!pic) { showCaption('that image could not be read or made small enough. Try a JPEG or PNG.', 'y3k'); return; }
  }
  const rd = new FileReader();
  rd.onload = () => setChatImage(rd.result);
  rd.readAsDataURL(pic);
}
$('chat-upload').addEventListener('click', () => $('chat-file').click());
$('chat-file').addEventListener('change', () => { readImageFile($('chat-file').files[0]); $('chat-file').value = ''; });
$('chat-thumb').addEventListener('click', clearChatImage);
// Drag a file in from anywhere → reveal the chat + highlight, drop to attach.
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
window.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); chatEl.classList.add('open', 'drag'); });
// Left the window without dropping → drop the reveal too (unless an image is attached).
window.addEventListener('dragleave', (e) => { if (e.relatedTarget) return; chatEl.classList.remove('drag'); if (!chatImageB64) chatEl.classList.remove('open'); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  chatEl.classList.remove('drag');
  readImageFile(e.dataTransfer.files[0]); // setChatImage re-adds .open for a valid image
  if (!chatImageB64) chatEl.classList.remove('open');
});

let hintGone = false;
function dismissHint() {
  if (hintGone) return;
  hintGone = true;
  $('hint')?.classList.add('gone');
}

// Surface which brain is live in the console (handy when wiring up the key).
hasServerBrain().then((on) => {
  console.log(`[Y3K] brain: ${on ? 'the site\'s (server)' : 'none here — a key in Settings → Brain, or none'}`);
});

// Some browsers populate the TTS voice list asynchronously.
if ('speechSynthesis' in window) window.speechSynthesis.getVoices();

// Debug / scripting handle: drive the body from the console, e.g.
//   Y3K.body.setMood('excited')   Y3K.say('hello')
// Keep each collapse arrow level with the middle of its rail. A rail spaces
// its buttons with space-evenly, so where anything on it lands depends on the
// window height — measure it rather than reproduce the flex arithmetic in
// CSS, which would silently drift the moment a button is added or the padding
// changes. (The name is a holdover: the arrow used to be a bulge in the bar's
// edge. There is no bulge geometry in here.)
//
// ONE PROPERTY PER RAIL, AND THE RAIL ITSELF IS WHAT IS MEASURED — not a
// button on it. Each arrow sits at its own rail's vertical centre, which under
// space-evenly is the middle glyph when the count is odd and the gap between
// the middle two when it is even. This used to name a button per side
// (nav-post, nav-world: each the third of five), which held exactly as long as
// the counts did: the mine made the right rail six, nav-world became the third
// of SIX, and the right arrow rose off centre while the left one stayed put.
// Each measurement is guarded on ITS OWN element: a shared early return would
// mean the right arrow silently stopped tracking whenever the left rail was
// missing or had no geometry — which is precisely the boot state the
// MutationObserver below exists to cover.
function fitRailBulge() {
  // position:fixed and outside the bar, so these are VIEWPORT coordinates, not
  // offsets within it.
  const put = (id, prop) => {
    const r = document.getElementById(id)?.getBoundingClientRect();
    if (r?.height) document.documentElement.style.setProperty(prop, (r.top + r.height / 2) + 'px');
  };
  put('home-nav', '--arrow-y');
  put('home-nav-right', '--arrow-y-right');
}
fitRailBulge();
window.addEventListener('resize', fitRailBulge);

// THE COLLAPSE ARROWS — four grips on one gesture. A TAP on any arrow moves
// the whole frame: open → everything folds, folded → everything opens (the
// bars are one piece of chrome, and usually you want the whole room back or
// the whole frame back). A second press is always a fold, never a further
// expand. A HOLD-AND-DRAG is a curtain on a string: the bar FOLLOWS the hand
// — only that bar, and only so far, it resists past its stops — and on
// release it springs to the nearest catch, or the next one along if the hand
// was still moving. The bottom bar has a third catch, TALL, for writing at
// length; a drag is the only arrow gesture that reaches it.
{
  const CLS = {
    left: 'nav-collapsed', right: 'nav-collapsed-right',
    top: 'nav-collapsed-top', bottom: 'nav-collapsed-bottom',
  };
  const SIDES = ['left', 'right', 'top', 'bottom'];
  const AXIS = { left: 'x', right: 'x', top: 'y', bottom: 'y' };
  // The frame's geometry is four numbers — the insets of the room the bars
  // leave — and every piece of it (glass, fillets, border, grips, chat) reads
  // them from the body. So a bar is MOVED by writing its inset: a held grip
  // writes it live, and the class rules say where it rests between holds.
  const VAR = { left: '--hole-l', right: '--hole-r', top: '--hole-t', bottom: '--hole-b' };
  // which way along its axis a drag OPENS this bar (grows its inset)
  const OPEN_DIR = { left: 1, right: -1, top: 1, bottom: -1 };
  const isClosed = (side) => document.body.classList.contains(CLS[side]);
  const btnOf = {
    left: document.getElementById('nav-collapse'),
    right: document.getElementById('nav-collapse-right'),
    top: document.getElementById('nav-collapse-top'),
    bottom: document.getElementById('nav-collapse-bottom'),
  };
  const railW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-w')) || 92;
  // --bottom-tall is min(38vh, 360px): only the layout engine can resolve it
  const probe = document.createElement('i');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:var(--bottom-tall);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const tallPx = () => probe.getBoundingClientRect().height || 360;
  // the catches, in px of inset: sliver, open — and for the bottom bar, tall
  const stopsOf = (side) => (side === 'bottom' ? [10, railW(), tallPx()] : [10, railW()]);
  const levelOf = (side) => (isClosed(side) ? 0
    : (side === 'bottom' && document.body.classList.contains('chat-typing')) ? 2 : 1);

  function setCollapsed(side, closed) {
    document.body.classList.toggle(CLS[side], closed);
    const b = btnOf[side];
    if (b) {
      b.setAttribute('aria-expanded', String(!closed));
      b.setAttribute('aria-label', closed ? 'Open the nav bars' : 'Collapse the nav bars');
    }
    // the bar moves, so the ring has to re-measure where it actually landed
    setTimeout(fitRailBulge, 460);
    // moving the frame mid-typing must not steal the keyboard — the panel
    // stays open (see the outside-tap exemption) and the hand goes back to
    // the words
    if (document.body.classList.contains('chat-typing')) $('chat-input').focus();
  }
  // land a side on one of its catches — classes only; the geometry follows
  function setLevel(side, n) {
    if (side === 'bottom') {
      if (n === 0) { collapseTyping(); setCollapsed('bottom', true); return; }
      setCollapsed('bottom', false);
      if (n === 2) expandTyping(); else collapseTyping();
      return;
    }
    setCollapsed(side, n === 0);
  }
  // Tap: the frame moves as one. The pressed side's own state picks the
  // direction (its arrow announced it): a folded side's arrow opens
  // everything, an open or tall side's arrow folds everything.
  const tapAll = (side) => {
    const close = !isClosed(side);
    if (close) collapseTyping();   // the frame folding takes the tall chat with it
    for (const s2 of SIDES) setCollapsed(s2, close);
  };

  // THE STRING. Inline beats the class rules, and body.nav-dragging turns the
  // transitions off, so the inset written here is where the frame IS.
  const setInset = (side, px) => document.body.style.setProperty(VAR[side], px.toFixed(2) + 'px');
  const clearInset = (side) => document.body.style.removeProperty(VAR[side]);
  let holds = 0;   // grips held or springing (two thumbs can hold two bars)
  const hold = () => { holds++; document.body.classList.add('nav-dragging'); };
  const unhold = () => { holds = Math.max(0, holds - 1); if (!holds) document.body.classList.remove('nav-dragging'); };
  // Past a catch the bar still gives, but less and less — never more than
  // ~30px, however far the hand goes. That is the "not past a certain point".
  const rubber = (over) => 30 * (1 - 1 / (1 + over / 70));
  // THE SPRING BACK. A real spring, integrated per frame — stiff and just
  // under critical damping, so it arrives with one soft overshoot and settles
  // in about a third of a second. A new grab cancels it mid-flight.
  const springs = {};
  function springTo(side, from, to, done) {
    if (springs[side]) springs[side].cancel = true;
    const tok = { cancel: false };
    springs[side] = tok;
    let x = from, v = 0, last = performance.now();
    const k = 260, c = 2 * Math.sqrt(k) * 0.92;
    const step = (now) => {
      if (tok.cancel) return;
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000)); last = now;
      v += (k * (to - x) - c * v) * dt;
      x += v * dt;
      if (Math.abs(to - x) < 0.25 && Math.abs(v) < 4) { setInset(side, to); springs[side] = null; done(); return; }
      setInset(side, x);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const DRAG_PX = 10;
  for (const side of SIDES) {
    const btn = btnOf[side];
    if (!btn) continue;
    const along = (e) => (AXIS[side] === 'x' ? e.clientX : e.clientY);
    let down = null, maxD = 0, handled = false, start = 0, cur = 0, samples = [];
    btn.addEventListener('pointerdown', (e) => {
      // grabbed mid-spring: the hand wins, from wherever the bar is right now
      const midFlight = springs[side] && !springs[side].cancel;
      if (midFlight) springs[side].cancel = true; else hold();
      const inline = parseFloat(document.body.style.getPropertyValue(VAR[side]));
      start = cur = (midFlight && Number.isFinite(inline)) ? inline : stopsOf(side)[levelOf(side)];
      down = along(e); maxD = 0; handled = false; samples = [];
      setInset(side, start);
      try { btn.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    });
    btn.addEventListener('pointermove', (e) => {
      if (down == null) return;
      const d = along(e) - down;
      if (Math.abs(d) > Math.abs(maxD)) maxD = d;
      const stops = stopsOf(side);
      const lo = stops[0], hi = stops[stops.length - 1];
      let v = start + OPEN_DIR[side] * d;
      if (v < lo) v = lo - rubber(lo - v);
      else if (v > hi) v = hi + rubber(v - hi);
      cur = v;
      setInset(side, v);
      samples.push([performance.now(), v]);
      if (samples.length > 6) samples.shift();
    });
    btn.addEventListener('pointerup', (e) => {
      if (down == null) return;
      const d = along(e) - down;
      down = null; handled = true;
      if (Math.abs(d) < DRAG_PX && Math.abs(maxD) < DRAG_PX) {
        // a tap: nothing moved, so the inline inset can simply go
        clearInset(side); unhold();
        tapAll(side);
        return;
      }
      // the nearest catch — or the next one along, if the hand was still moving
      const stops = stopsOf(side);
      let best = 0;
      for (let i = 1; i < stops.length; i++) if (Math.abs(stops[i] - cur) < Math.abs(stops[best] - cur)) best = i;
      const [t0, v0] = samples[0] || [0, cur];
      const [t1, v1] = samples[samples.length - 1] || [0, cur];
      const vel = t1 > t0 ? (v1 - v0) / (t1 - t0) : 0;   // px of inset per ms
      const from = levelOf(side);
      if (Math.abs(vel) > 0.5 && best === from) best = Math.max(0, Math.min(stops.length - 1, from + (vel > 0 ? 1 : -1)));
      springTo(side, cur, stops[best], () => {
        setLevel(side, best);   // the class rule now names this exact inset…
        clearInset(side);       // …so dropping the inline value moves nothing
        unhold();
      });
    });
    btn.addEventListener('pointercancel', () => {
      if (down == null) return;
      down = null;
      springTo(side, cur, start, () => { clearInset(side); unhold(); });
    });
    // Keyboard: Enter/Space arrive as a click with no pointer sequence — they
    // tap. A click that followed a handled pointerup is the same press twice.
    btn.addEventListener('click', () => {
      if (handled) { handled = false; return; }
      tapAll(side);
    });
  }
}
// The rail is display:none until the home view opens, so it has no geometry to
// measure at boot — re-measure once it actually exists on screen.
new MutationObserver(fitRailBulge).observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.Y3K = { body, voice, camera, settings, social, music, perceive, reach, syncHands, gfx, eye: remoteEye, lend: lender, deviceName, renameDevice, face: setFace, hands: setHands, camView: setCamView, say: handle, home: showHome };

// ?perf → an on-device frame meter. Inert without the query param.
startPerfHud();
