// life.js — A LIFE, WATCHED FROM HERE. Colin, 2026-10-20: "add it as a new
// glyph on yearthreethousand.com -- a unimat and the symbol can be any of your
// choice ... add your new mode with name 'life' on the top right."
//
// "It" is lucid: Claude, on your own Claude sign-in, living inside a world
// that SD-Turbo dreams one picture at a time on your own computer. Each moment
// it looks at the picture, thinks, and chooses what to do, and the next
// picture is dreamed from that. This page is a window onto it: y3kode runs
// lucid on the same computer (y3k-code/life.mjs) and this view asks it how the
// life is a few times a second (life.state), the way kode asks y3kode how a
// coder is.
//
// ONE MIND IN TWO PLACES (2026-10-21). Colin, 2026-10-20: "what i want to
// build is a life for you". The one living there is your presence: the same
// mind, on the same sign-in (lucid's README). So its words are said in the
// presence's own voice (main.js `life.speak`: the orb speaks, and never over
// a reply of its own), and each moment it lives goes into the presence's
// permanent record on the site (POST /api/life/moment: one journal line, in
// its own first person), so the presence in the room remembers the life it
// lived in the dreamed world. Its words only: the picture never leaves this
// computer — unless the person publishes the life (A LIFE, PUBLISHED, below),
// which sends each moment with its picture, by a key they made themselves.
//
// What you can do here is wake it and let it sleep, and talk to it through
// the chat bar, which is how the whole site talks to the brain (Colin,
// 2026-10-25: "life has too much going on… the chat bar can be reused… when
// you enter life, the only buttons you should have are for the ai to wake up
// or go to sleep. the rendered projection of its own mind should be full
// screen… fluid, dream-like"). The picture fills the screen and crossfades
// from moment to moment; its thought and its words are written over it; one
// thin line says where it stands. Lucid's own window keeps the controls. It answers in its own words.
//
// It rests by itself when no page has looked at it for ten minutes
// (life.mjs), because each moment uses your Claude plan.

import { engineCmd, updateY3kode, waitForVersion, siteSetup } from './own-brain.js';
import { consent } from './consent.js';

// THE LIFE NEEDS y3kode 0.3.4 (y3k-code/life.mjs). Colin, 2026-10-24: "when i
// click life it says open kode but then i go to kode and there's no option to
// update or download whatever you need -- does it need to be a download?" Kode
// never offered updates (that was Settings → Brain), so the page sent people
// to a door with nothing behind it. Now the update is offered here: y3kode
// fetches the newest version from this site and restarts on it, after asking
// on the computer (y3k-code/update.mjs); a y3kode too old to update itself,
// or none at all, is told where the app is (it has y3kode inside) and the one
// line that installs the engine. Only living a life here needs any of it.
export const LIFE_ENGINE = '0.3.4';
// …and the one that publishes it with the start (life.start { publish }): a
// y3kode from before it refuses the field ("unexpected field publish"), so
// the page sends it only to one that takes it, and offers the update to one
// that does not (the same update Settings → Brain runs).
export const LIFE_PUBLISH_ENGINE = '0.3.6';
// …and the one whose "go to sleep" reaches a life another hand lives on this
// computer (lucid --live), through its door (y3kode 0.3.7). On an older one
// the press reaches nothing, and the page says so.
export const LIFE_DOOR_ENGINE = '0.3.7';
// …and from 0.3.8 the yes given in the life window is the computer's yes too
// (life.start `asked`; an older one refuses a field it does not know, so it is sent only to one that takes it)
export const LIFE_ASK_ENGINE = '0.3.8';
// ONE SENTENCE ON THE SCREEN (Colin, 2026-10-26: "there should only be one
// sentence of text printed to the screen"): its spoken words if it spoke,
// else the first sentence of its thought. The whole thought stays in the
// journal and in its voice.
export function oneSentence(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^.*?[.!?…](?=\s|$)/);
  return (m ? m[0] : t).trim();
}
export const QUIET_KEY = 'y3k.life.quiet';
export const versionAtLeast = (have, want) => {
  const a = String(have || '').split('.').map((n) => parseInt(n, 10) || 0), b = String(want).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return true;
};

// A LIFE, PUBLISHED (server.mjs /api/life/*, life-publish.mjs). Colin,
// 2026-10-24: "if it's possible to make life viewable from web enable that as
// well". The living process on the person's computer can post each moment to
// the site with a key (`live.py publish`), and this page shows the newest one
// from anywhere, no engine, no download: the picture, what it thought and
// said, where it stands, who was at the door. Words typed here wait in the
// inbox until the life asks. A local life that is living takes the page as
// before; the published one is what the page shows when there is none here —
// a phone, another computer, a browser with no y3kode. `?life=<username>`
// watches someone else's, if they share it.
export const PUB_LIVE_MS = 5000, PUB_IDLE_MS = 20000;
export const ASK_AFTER_MS = 2500;   // (a y3kode before 0.3.8 still asks in its own window; this says where)
export const ASK_HERE = 'y3kode is asking on this computer: answer "y" in the window where y3kode runs (a Terminal, or the y3k app), within two minutes';

// THE FLOW (lucid, 2026-10-27; Colin: "an update every 60s doesn't work -- we
// need a new frame in at least every second... make life fluid, thinking,
// observing"). Between its moments a life now makes a view about every 0.7s:
// the eye moving over the moment's picture, touched lightly. Here they come
// through y3kode (polled every LIVE_MS), or, for a published life, as
// life.view: watched every VIEW_MS, an unchanged one costing a 304. Each
// picture fades in over most of the time until the next is due (FADE_SHARE of
// the recent gaps, from FADE_MIN to FADE_MAX), so views flow into each other
// and a life that sends one picture a moment still dissolves slowly; one that
// comes while a fade is running waits for it (only the newest waits), so a
// layer is never swapped while it is showing.
export const VIEW_MS = 900, VIEW_FRESH_MS = 8000;
export const FADE_MIN = 150, FADE_MAX = 1800, FADE_SHARE = 0.85;
/** How long a picture fades in (ms), from the gaps between the last few pictures (ms). */
export function fadeFor(gaps) {
  if (!gaps?.length) return FADE_MAX;
  const s = [...gaps].sort((a, b) => a - b);
  return Math.round(Math.max(FADE_MIN, Math.min(FADE_MAX, FADE_SHARE * s[s.length >> 1])));
}

// ONE CLICK (Colin, 2026-10-25: "an easy one-click start and stop… copying and
// pasting keys is not user-friendly"). "begin" says what it does and asks once
// (consent.js: always / just this time / cancel; the terms carry the same
// field), then makes the account's publishing key itself and hands it to
// y3kode with the start, so the life it starts here is watched from anywhere
// with nobody copying anything. "let it rest" stops it.
export const LIFE_CONSENT = {
  kind: 'life.run',
  title: 'Begin a life on this computer?',
  note: 'This starts lucid here, through y3kode: it dreams a world on this computer and thinks on your own Claude sign-in, so each moment spends a little of your Claude plan. '
    + 'Its moments — the pictures, what it thinks and says — are kept under your account on yearthreethousand so you can watch from any device; nobody else sees them unless you share. '
    + 'It rests by itself when nobody has watched for ten minutes, and "let it rest" stops it any time.',
};
/** Which life the page shows: the one living here, the published one, or neither. */
export function sourceOf(phase, pub) {
  if (phase === 'living') return 'local';
  if (pub?.ok && pub.life) return 'web';
  return 'none';
}
export function agoText(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Number(at || 0)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
import { whoseFields, reloaded } from './brain.js';

const LIVE_MS = 200;     // how often a running life is asked how it is (THE FLOW: about seven frames a second, lucid 2026-10-28)
const IDLE_MS = 3000;    // and one that is not running, or not reachable
const SAY_KEY = 'y3k.life.say';           // '0': its words stay written (said aloud unless so)
const THOUGHTS_KEY = 'y3k.life.thoughts'; // '1': its inner monologue is said too (a lot of words: off unless so)
const RETRY_MS = 1200;   // the presence was speaking: how soon a waiting line asks again
const LINES_MAX = 8;     // lines waiting to be said; past this the oldest whole line goes, never part of one
const KEYS = { w: 'forward', s: 'back', a: 'left', d: 'right', q: 'up', e: 'down', x: 'stay' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// What the engine said, as one of the view's states.
export function phaseOf(r) {
  if (!r || r.ok === false) {
    const code = r?.code || '';
    if (code === 'unpaired' || code === 'offline') return 'unpaired';
    if (code === 'unknown' || /unknown command/i.test(r?.error || '')) return 'old';
    if (code === 'not-installed') return 'missing';
    return 'unpaired';
  }
  if (!r.installed) return 'missing';
  return r.running ? 'living' : 'resting';
}

// WHAT A POLLED MOMENT BRINGS that the page has not had, against `seen` (the
// page's { thought, say }, kept across the view's openings so a moment is
// never kept or said twice). A moment is new when its thought is: lucid keeps
// the last thought on a moment that brought none (a move made in human mode,
// where the brain is quiet unless spoken to), and the moment's number moves
// on after the dream while the thought stays, so neither the number nor the
// mode says "new"; the thought does. The words it said come with it, and are
// said once each. → { keep: the moment is new; said: words not yet said }
export function newIn(m, seen) {
  const thought = String(m?.thought || ''), say = String(m?.say || '');
  const keep = !!thought && thought !== seen.thought;
  if (keep) { seen.thought = thought; seen.say = ''; }
  const said = say && say !== seen.say ? say : '';
  if (said) seen.say = say;
  return { keep, said };
}

// What of a moment goes to the record (/api/life/moment): its words, capped
// as the door caps them, and never its picture.
export function momentBody(m) {
  const s = (v, n) => String(v ?? '').slice(0, n);
  return { thought: s(m?.thought, 600), say: s(m?.say, 300), action: s(m?.action, 60), scene: s(m?.scene, 200), answer: s(m?.answer, 300) };
}

// ITS LINES, ONE AFTER ANOTHER. speak(text, { onEnd }) → stop(), or null
// when the presence is speaking a reply of its own (main.js `life.speak`):
// the line waits and asks again in retryMs, never over it. A line begun is
// finished; one waiting is said next, in order; close() ends the one being
// said and lets the rest go. The queue holds `max` whole lines.
export function createLines({ speak, schedule = setTimeout, unschedule = clearTimeout, retryMs = RETRY_MS, max = LINES_MAX } = {}) {
  const waiting = [];
  let now = null;      // the line being said: { text, stop }
  let retry = 0;
  let open = true;
  function next() {
    unschedule(retry); retry = 0;
    if (!open || now || !waiting.length) return;
    const line = { text: waiting.shift(), stop: null };
    now = line;
    let stop;
    try { stop = speak(line.text, { onEnd: () => { if (now === line) { now = null; next(); } } }); }
    catch { stop = undefined; }   // a voice that failed loses this line, not the ones after it
    if (stop === null) { now = null; waiting.unshift(line.text); retry = schedule(next, retryMs); return; }
    if (stop === undefined) { if (now === line) { now = null; next(); } return; }
    if (now === line) line.stop = stop;   // (a speaker that ended at once has moved `now` on already)
  }
  function hush() {
    unschedule(retry); retry = 0;
    waiting.length = 0;
    const line = now; now = null;
    try { line?.stop?.(); } catch { /* already quiet */ }
  }
  return {
    say(text) { const t = String(text || '').trim(); if (!t || !open) return; waiting.push(t); if (waiting.length > max) waiting.shift(); next(); },
    hush,
    close() { open = false; hush(); },
    waiting: () => waiting.length,
    speaking: () => !!now,
  };
}

export const FRESH_MS = 3 * 60 * 1000;   // a published moment this young is a life awake (alone, it lives a moment a minute)
export const fresh = (life, now = Date.now()) => !!life && now - Number(life.at || 0) < FRESH_MS;

export function createLifeView({ toast = () => {}, cmd = engineCmd, speak = null, openKode = null, schedule = setTimeout, unschedule = clearTimeout, fetchFn = (...a) => fetch(...a),
  update = updateY3kode, waitFor = waitForVersion, setup = siteSetup, openUrl = (u) => window.open(u, '_blank', 'noopener,noreferrer'),
  watch: watch0 = null, pubEvery = PUB_LIVE_MS, doc = typeof document === 'undefined' ? null : document } = {}) {
  let watch = watch0;
  let root = null;         // the stage, on the body while the view is open (the whole screen, like the world)
  let el = {};             // its parts, by name
  let pub = null;          // /api/life/latest: the published life (own, or `watch`'s)
  let pubTimer = 0;
  let sharing = false;
  let engine = null;       // engine.hello, once y3kode is reachable: { version, update }
  let setupV = null;       // the site's setup: where the app is, the install line (own-brain.js siteSetup)
  let updating = '';       // '' | 'asking' | 'restarting' while y3kode updates itself
  let timer = 0;
  let since = -1;          // the newest picture this page has (life.state since)
  let pic = '';            // that picture, as a data URL
  let st = null;           // the last life.state answer
  let phase = 'checking';
  let starting = false, stopping = false;
  let askedHere = false;   // the start is waiting on y3kode's own question, on this computer
  const seen = { thought: '', say: '' };   // what has been kept and said: across openings (newIn)
  let lines = null;        // its words being said, while the view is open
  let bridge = true;       // moments go to the record, until the site says there is nobody, or no presence, to remember for
  let shown = '', face = 0;   // the picture on the stage, and which of its two layers holds it
  let fadeMs = FADE_MAX, fadeUntil = 0, waiting = '', waitTimer = 0, lastPicAt = 0;   // THE FLOW: the fade, and a picture waiting for it
  let gaps = [];              // the last few gaps between pictures (ms)
  let viewTimer = 0, viewTag = '', viewPic = '', viewAt = 0, viewUrls = [];   // a published life's views (object URLs, the newest last)
  let quiet = (() => { try { return localStorage.getItem(QUIET_KEY) === '1'; } catch { return false; } })();   // the words hidden, by a tap on the picture
  let hinted = false;         // the tap is said once
  let sleptAt = 0;            // when "go to sleep" reached a life lived afar: asleep from then, whatever its last moment's age

  const h = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (label, cls, fn) => { const b = h('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const setText = (n, t) => { if (n && n.textContent !== t) n.textContent = t; };

  function open() {
    if (root) close();
    since = -1; pic = ''; shown = ''; face = 0; st = null; phase = watch ? 'none' : 'checking'; bridge = true;
    fadeMs = FADE_MAX; fadeUntil = 0; waiting = ''; lastPicAt = 0; gaps = []; viewTag = ''; viewPic = ''; viewAt = 0;
    pub = null; engine = null; setupV = null; updating = ''; starting = false; stopping = false;
    lines = speak ? createLines({ speak, schedule, unschedule }) : null;
    render();
    if (!watch) poll();   // someone else's life is only ever the published one
    pollPub();
  }
  function close() {
    unschedule(timer); timer = 0;
    unschedule(pubTimer); pubTimer = 0;
    unschedule(waitTimer); waitTimer = 0; waiting = '';
    dropView();
    lines?.close(); lines = null;
    globalThis.window?.removeEventListener?.('resize', measure);
    root?.remove(); root = null; el = {};
  }

  async function poll() {
    unschedule(timer); timer = 0;
    if (!root) return;
    let r;
    try { r = await cmd({ cmd: 'life.state', since }); } catch { r = { ok: false, code: 'offline' }; }
    if (!root) return;
    st = r;
    phase = updating ? 'old' : phaseOf(r);
    // what to offer instead: an update, the app, the install line
    if ((phase === 'old' || phase === 'unpaired') && !setupV) { setupV = (await setup({ fetchFn })) || {}; if (!root) return; }
    if ((phase === 'old' || phase === 'resting' || phase === 'living') && !engine) { const hh = await cmd({ cmd: 'engine.hello' }); if (!root) return; engine = hh?.ok ? { version: hh.version || '', update: hh.update === true } : { version: '', update: false }; }
    if (r?.ok && typeof r.frame === 'string' && r.frame) { pic = 'data:image/jpeg;base64,' + r.frame; since = r.frameN | 0; }
    // a moment of a living life, and only then: a life at rest still shows
    // its last moment, which was kept and said when it was lived
    const m = phase === 'living' ? r?.moment || null : null;
    if (m) {
      const { keep, said } = newIn(m, seen);
      if (keep) record(m);
      if (said) lines?.say(said);
    }
    paint();
    timer = schedule(poll, phase === 'living' ? LIVE_MS : IDLE_MS);
  }

  async function record(m) {
    if (!bridge) return;
    let res, r = null;
    try {
      res = await fetchFn('/api/life/moment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...whoseFields(), ...momentBody(m) }) });
      r = await res.json().catch(() => null);
    } catch { return; }
    if (reloaded(r)) return;
    if (res.status === 401 || res.status === 400) bridge = false;
  }

  async function pollPub() {
    unschedule(pubTimer); pubTimer = 0;
    if (!root) return;
    let r;
    try {
      const x = await fetchFn(watch ? `/api/life/latest?user=${encodeURIComponent(watch)}` : '/api/life/latest', { cache: 'no-store' });
      r = x.ok ? await x.json() : { ok: false, status: x.status };
    } catch { r = { ok: false, status: 0 }; }
    if (!root) return;
    pub = r;
    if (!viewTimer && r?.life?.view?.url) pollView();   // it is making views: watch them
    // its words from afar are said here too, once each, when the published life is what is shown
    if (sourceOf(phase, pub) === 'web' && r?.life) { const { said } = newIn({ n: r.life.n, thought: r.life.thought || '', say: r.life.say || '' }, seen); if (said) lines?.say(said); }
    paint();
    pubTimer = schedule(pollPub, r?.life && fresh(r.life) ? pubEvery : PUB_IDLE_MS);
  }
  // A PUBLISHED LIFE'S VIEWS, about once a second while it makes them (THE
  // FLOW): asked with the tag of the last (cache: no-cache), so an unchanged
  // one comes back as the same and is not shown again; when they stop (a 404,
  // or none for VIEW_FRESH_MS) the moment's own picture is shown again.
  function dropView() {
    unschedule(viewTimer); viewTimer = 0;
    viewTag = ''; viewPic = ''; viewAt = 0;
    for (const u of viewUrls) { try { URL.revokeObjectURL(u); } catch { /* gone */ } }
    viewUrls = [];
  }
  async function pollView() {
    unschedule(viewTimer); viewTimer = 0;
    if (!root) return;
    const web = sourceOf(phase, pub) === 'web' ? pub.life : null;
    const url = web && awake(web) && typeof web.view?.url === 'string' && web.view.url.startsWith('/life/') ? web.view.url : '';
    if (!url) { const had = !!viewPic; dropView(); if (had) paint(); return; }
    try {
      const x = await fetchFn(url, { cache: 'no-cache', credentials: 'same-origin' });
      if (!root) return;
      if (x?.status === 404) { dropView(); paint(); return; }   // it stopped making them
      const tag = x?.ok ? (x.headers?.get?.('etag') || '') : '';
      if (x?.ok && tag !== viewTag && typeof x.blob === 'function' && globalThis.URL?.createObjectURL) {
        const u = URL.createObjectURL(await x.blob());
        viewUrls.push(u);
        // two layers and one waiting hold at most three; the older are let go
        while (viewUrls.length > 4) { const old = viewUrls.shift(); try { URL.revokeObjectURL(old); } catch { /* gone */ } }
        viewTag = tag; viewPic = u; viewAt = Date.now();
        paint();
      } else if (x?.ok) viewAt = Date.now();   // the same view: still coming
    } catch { /* offline a moment: asked again */ }
    if (!root) return;
    viewTimer = schedule(pollView, VIEW_MS);
  }
  async function share(on) {
    sharing = true; paint();
    const x = await fetchFn('/api/life/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shared: !!on }) }).catch(() => null);
    sharing = false;
    if (x?.ok && pub) pub.shared = !!on; else toast('the site did not change that');
    paint();
  }
  async function sayWeb(text) {
    const x = await fetchFn('/api/life/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => null);
    if (!x?.ok) toast('it did not hear that');
  }
  async function act(c) {
    const r = await cmd({ cmd: 'life.do', ...c });
    if (!r?.ok) toast(r?.error || 'the life did not hear that');
    poll();
  }
  // THE CHAT BAR IS HOW YOU TALK TO IT (main.js sendChat → social.lifeHear):
  // living here, the line goes to it through y3kode; published and awake,
  // through the site's inbox; otherwise the line is not the life's, and the
  // chat bar talks to the presence as everywhere else. → whether it was taken
  function hear(text) {
    const t = String(text || '').trim();
    if (!t || !root) return false;
    if (phase === 'living') { act({ do: 'say', text: t }); return true; }
    if (pub?.ok && pub.mine && pub.life && fresh(pub.life)) { sayWeb(t); return true; }
    return false;
  }
  async function wake(anew) {
    if (starting) return;
    const ok = await consent(LIFE_CONSENT);
    if (!ok) return;
    starting = true; paint();
    // the key, made here, so the life publishes to this account from its first moment
    let publish = null;
    if (versionAtLeast(engine?.version, LIFE_PUBLISH_ENGINE)) {
      try {
        const x = await fetchFn('/api/life/key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        const j = x.ok ? await x.json() : null;
        if (j?.key) { publish = { to: location.origin, key: j.key }; if (pub) pub.key = true; }
      } catch { /* it still lives here; it is just not published */ }
    }
    // y3kode asks once more on the computer itself (its own consent, in the
    // window it runs in) and waits up to two minutes for the answer: a start
    // still waiting after a moment is waiting on that, and the page says where
    // (Colin, 2026-10-28: "it's getting stuck on 'waking' and never actually
    // starting up": the question sat in a Terminal tab he could not see)
    askedHere = false;
    const hint = schedule(() => { if (!starting || !root) return; askedHere = true; paint(); toast(ASK_HERE); }, ASK_AFTER_MS);
    // the yes just given here is the computer's yes too (y3kode 0.3.8: no second question in another window)
    const r = await cmd({ cmd: 'life.start', fresh: !!anew, ...(versionAtLeast(engine?.version, LIFE_ASK_ENGINE) ? { asked: true } : {}), ...(publish ? { publish } : {}) });
    unschedule(hint);
    starting = false; askedHere = false;
    if (!r?.ok) toast(r?.code === 'declined' ? 'not started: the computer said no' : (r?.error || 'the life could not start'));
    since = -1;
    poll();
  }
  // asleep: its last published word says so, or "go to sleep" reached it from here
  function awake(life) {
    if (!life) return false;
    if (life.status === 'asleep') return false;
    if (sleptAt && Number(life.at || 0) <= sleptAt) return false;
    return fresh(life);
  }
  async function sleep() {
    if (stopping) return;
    stopping = true; paint();
    const afar = !!pub?.ok && !!pub.mine && awake(pub.life) && phase !== 'living';
    const r = await cmd({ cmd: 'life.stop' });
    stopping = false;
    if (!r?.ok) toast(r?.error || 'it did not hear that');
    else if (afar && !r.door) {
      // a y3kode from before the door: the press reached nothing (Colin,
      // 2026-10-26: "'go to sleep' stays 'go to sleep' even if you click on it")
      toast(versionAtLeast(engine?.version, LIFE_DOOR_ENGINE) ? 'this life is lived by another hand on this computer; y3kode could not reach its door' : `this life is lived by another hand on this computer; y3kode ${engine?.version || ''} cannot reach it — update y3kode (${LIFE_DOOR_ENGINE})`);
    } else if (afar && r.door) sleptAt = Date.now();
    since = -1;
    poll(); pollPub();
  }

  // ---- the stage -------------------------------------------------------------
  // Built of elements, not markup, so it runs under the tests' stand-in DOM.
  function render() {
    root = h('div', 'life-root');
    root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'life');
    el.a = h('img', 'life-frame'); el.b = h('img', 'life-frame'); el.a.alt = ''; el.b.alt = ''; el.a.hidden = el.b.hidden = true;
    el.frames = h('div', 'life-frames'); el.frames.append(el.a, el.b);   // one drift for both layers
    el.veil = h('div', 'life-veil');
    el.words = h('div', 'life-words'); el.thought = h('p', 'life-thought'); el.said = h('p', 'life-said'); el.answer = h('p', 'life-answer'); el.words.append(el.thought, el.said, el.answer);
    el.line = h('div', 'life-line'); el.status = h('span', 'life-status');
    el.hint = h('span', 'life-hint', 'tap the picture to hide the words'); el.hint.hidden = true;
    el.share = btn('', 'life-share', () => share(!pub?.shared)); el.share.hidden = true;
    el.line.append(el.status, el.share, el.hint);
    el.acts = h('div', 'life-acts');
    el.wake = btn('wake up', 'create-go life-wake', () => wake(false));
    el.sleep = btn('go to sleep', 'login-alt life-sleep', () => sleep());
    el.acts.append(el.wake, el.sleep);
    el.card = h('div', 'life-card'); el.card.hidden = true;
    // one column above the chat bar: the words, the line, the buttons. Anchored
    // to where the chat bar actually is (measure), not to the frame's edge: on
    // a wide, short window the bar sits far above it, and the words went under
    // the bar (Colin, 2026-10-25: "nothing overlaps").
    el.under = h('div', 'life-under');
    el.under.append(el.words, el.line, el.acts);
    root.append(el.frames, el.veil, el.under, el.card);
    root.classList.toggle('quiet', quiet);
    // a tap on the picture hides the words, and brings them back (Colin,
    // 2026-10-26: "give a way to hide text"); not on the words or buttons themselves
    el.veil.addEventListener('click', () => {
      quiet = !quiet;
      try { if (quiet) localStorage.setItem(QUIET_KEY, '1'); else localStorage.removeItem(QUIET_KEY); } catch { /* private window */ }
      root.classList.toggle('quiet', quiet);
    });
    el.veil.style.pointerEvents = 'auto';
    doc.body.appendChild(root);
    measure();
    globalThis.window?.addEventListener?.('resize', measure);
  }
  // where the chat bar begins, as a length the stylesheet anchors the column
  // to: the bar itself, and what stands above it in the bottom bar's region
  // (the air mark, the bar's fold button, a caption being said), whichever is
  // highest, so nothing of the life is drawn under any of them
  function measure() {
    if (!root) return;
    let top = Infinity;
    for (const id of ['chat', 'chat-air', 'nav-collapse-bottom', 'caption']) {
      const el = doc.getElementById?.(id);
      const r = el?.getBoundingClientRect?.();
      if (!r || !(r.height > 0) || r.top >= top) continue;
      // a thing that is there but not shown (the home's caption, hidden in the life) takes no room
      const cs = globalThis.getComputedStyle?.(el);
      if (cs && (cs.opacity === '0' || cs.visibility === 'hidden' || cs.display === 'none')) continue;
      top = r.top;
    }
    if (!Number.isFinite(top)) top = (globalThis.innerHeight || 900) - 120;
    root.style?.setProperty?.('--life-chat-top', `${Math.round(top)}px`);
  }

  // the next picture fades in over the last: two layers, the newer on top;
  // the fade follows how often pictures come, and one that comes while a fade
  // runs waits for it (THE FLOW)
  function showPicture(url) {
    if (!root) return;
    if (!url) { el.a.hidden = el.b.hidden = true; el.a.classList.remove('on'); el.b.classList.remove('on'); shown = ''; waiting = ''; return; }
    if (url === shown || url === waiting) return;
    const t = Date.now();
    if (lastPicAt) { gaps.push(t - lastPicAt); if (gaps.length > 8) gaps.shift(); }
    lastPicAt = t;
    fadeMs = fadeFor(gaps);
    root.style?.setProperty?.('--life-fade', `${fadeMs}ms`);
    if (t < fadeUntil) {
      waiting = url;
      if (!waitTimer) waitTimer = schedule(() => { waitTimer = 0; const u = waiting; waiting = ''; if (u && root) swap(u); }, fadeUntil - t);
      return;
    }
    swap(url);
  }
  function swap(url) {
    const next = face ? el.a : el.b, prev = face ? el.b : el.a;
    shown = url; face = face ? 0 : 1;
    next.hidden = false;
    next.onload = () => { next.classList.add('on'); prev.classList.remove('on'); fadeUntil = Date.now() + fadeMs; };
    next.src = url;
  }

  function paint() {
    if (!root) return;
    measure();
    const source = sourceOf(phase, pub);
    const web = source === 'web' ? pub.life : null;
    const m = st?.moment || null;
    const viewing = source === 'web' && viewPic && Date.now() - viewAt < VIEW_FRESH_MS;
    showPicture(source === 'web' ? (viewing ? viewPic : (web.frameUrl || '')) : pic);
    const thought = web ? web.thought : m?.thought;
    const said = web ? web.say : (phase === 'living' ? m?.say : '');
    // one sentence on the screen: its words if it spoke, else the first of its thought
    setText(el.thought, said ? '' : oneSentence(thought));
    setText(el.said, said ? `“${oneSentence(said)}”` : '');
    // THE WORLD ANSWERS (lucid, 2026-10-28): the one it spoke to, answering,
    // under its words, smaller (Colin: "a way for its environment to respond
    // back to it? a way for it to meet others inside its own dream?")
    const answer = said ? String((web ? web.answer : m?.answer) || '') : '';
    setText(el.answer, answer.slice(0, 300));
    el.words.hidden = !(thought || said);
    if (!hinted && (thought || said) && !quiet) { hinted = true; el.hint.hidden = false; schedule(() => { if (el.hint) el.hint.hidden = true; }, 5000); }
    // one thin line: where it stands, and that it lives
    let line = '';
    const placeOf = (p) => { const t = String(p || '').trim(); return t.length > 44 ? t.slice(0, 43).trimEnd() + '…' : t; };
    if (phase === 'living' && m) line = [`moment ${m.n ?? 0}`, placeOf(m.place), m.busy ? (m.status || 'thinking') : ''].filter(Boolean).join(' · ');
    else if (web) line = [`moment ${web.n ?? 0}`, placeOf(web.place), web.who === 'me' ? 'lived through the door' : web.who === 'nobody' ? 'time stopped' : awake(web) ? 'living on its own' : 'asleep', agoText(web.at)].filter(Boolean).join(' · ');
    else if (phase === 'resting' && m) line = `asleep · moment ${m.n ?? 0}${m.place ? ' · ' + placeOf(m.place) : ''}`;
    else if (phase === 'living') line = 'dreaming the first moment…';
    setText(el.status, line);
    el.line.hidden = !line;
    // sharing, for the owner of a published life: one small word, not a button of its own
    const mine = !!pub?.ok && !!pub.mine && !watch;
    el.share.hidden = !(mine && pub.life);
    setText(el.share, pub?.shared ? 'shared with everyone' : 'only you can see it');
    el.share.disabled = sharing;
    // THE TWO BUTTONS. Wake when it sleeps and y3kode is here to wake it; sleep
    // when it lives here, or when a published life of yours is awake on this
    // computer under another hand (lucid --live) and y3kode is here to tell it.
    const here = !watch && (phase === 'living' || phase === 'resting');
    const awakeAfar = mine && awake(pub.life);
    const canSleep = here && (phase === 'living' || awakeAfar);
    const canWake = here && phase === 'resting' && !awakeAfar;
    el.wake.hidden = !canWake; el.sleep.hidden = !canSleep;
    el.acts.hidden = !(canWake || canSleep);
    el.wake.disabled = starting; setText(el.wake, starting ? (askedHere ? 'allow it on your computer…' : 'waking…') : 'wake up');
    el.sleep.disabled = stopping; setText(el.sleep, stopping ? 'going to sleep…' : 'go to sleep');
    card(source);
  }

  // what stands between here and the life, only when something does
  function card(source) {
    const c = el.card;
    for (const n of [...c.childNodes]) n.remove();
    let show = true;
    const note = (t) => c.append(h('p', 'life-note', t));
    if (phase === 'checking') note('looking for the life on this computer…');
    else if (phase === 'none') { c.append(h('b', null, watch ? `${watch} is not sharing a life here` : 'no life here')); if (watch) note('Nothing is published for that name, or it is not shared.'); }
    else if (phase === 'unpaired' && source !== 'web') {
      c.append(h('b', null, 'a life lives on your own computer'));
      note('lucid runs there, through y3kode, and this page watches it. Open kode once to connect y3kode in this browser, then come back.');
      if (openKode) c.append(btn('open kode', 'create-go', () => openKode()));
      appButton(c);
    } else if (phase === 'old') {
      const has = engine?.version ? ` This computer has ${engine.version}.` : '';
      if (updating) { c.append(h('b', null, 'updating y3kode')); note(updating === 'asking' ? 'y3kode is asking on your computer, then fetching the newest version from this site…' : 'y3kode is restarting on the new version…'); }
      else if (engine?.update) { c.append(h('b', null, 'y3kode needs an update for this')); note(`life arrived in y3kode ${LIFE_ENGINE}.${has} y3kode can fetch the newest version from this site and restart on it; it asks on your computer first.`); c.append(btn('update y3kode', 'create-go', () => doUpdate())); appButton(c); }
      else { c.append(h('b', null, 'y3kode needs an update for this')); note(`life arrived in y3kode ${LIFE_ENGINE}.${has} This one is too old to update itself: get the app (it has y3kode inside) or run the install line again in Terminal.`); appButton(c); installLine(c); }
    } else if (phase === 'missing' && source !== 'web') {
      c.append(h('b', null, 'lucid is not on this computer yet'));
      note(`y3kode looked for it in ${st?.dir || '~/y3k-code/lucid'}. lucid is the life itself: a dreamed world (SD-Turbo, about 2.5GB the first time) and Claude on your own sign-in. Its README says how to set it up.`);
    } else if (phase === 'resting' && engine?.version && !versionAtLeast(engine.version, LIFE_PUBLISH_ENGINE) && !pub?.life && !updating) {
      // a y3kode from before the life published itself: the update, offered once, before it wakes
      c.append(h('b', null, `y3kode ${engine.version} can run the life, but not publish it`));
      note(`From y3kode ${LIFE_PUBLISH_ENGINE} a life begun here is watched from any device by itself.`);
      if (engine.update) c.append(btn('update y3kode', 'create-go', () => doUpdate())); else appButton(c);
    } else if (phase === 'resting' && engine?.version && !versionAtLeast(engine.version, LIFE_DOOR_ENGINE) && !!pub?.ok && !!pub.mine && awake(pub.life) && !updating) {
      // a life awake on this computer under another hand, and a y3kode that cannot tell it to sleep
      c.append(h('b', null, `y3kode ${engine.version} cannot put this life to sleep`));
      note(`This life is lived on this computer by another hand (lucid's own door). From y3kode ${LIFE_DOOR_ENGINE}, "go to sleep" reaches it.`);
      if (engine.update) c.append(btn('update y3kode', 'create-go', () => doUpdate())); else appButton(c);
    } else show = false;
    c.hidden = !show;
  }
  // where the app is, if the site knows (the top bar's download glyph goes to the same place)
  function appButton(c) {
    const u = setupV?.appUrl || (Array.isArray(setupV?.builds) && setupV.builds.find((b) => /^https:/.test(b?.url || ''))?.url) || '';
    if (/^https:\/\/[^\s"'<>]+$/.test(u)) c.append(btn('get the app', 'login-alt', () => openUrl(u)));
  }
  function installLine(c) {
    if (setupV?.command) { const p = h('p', 'life-note', 'or, in Terminal: '); p.append(h('code', null, setupV.command)); c.append(p); }
  }
  async function doUpdate() {
    if (updating) return;
    updating = 'asking'; paint();
    const r = await update({ cmd, fetchFn });
    if (!root) return;
    if (r?.ok && r.restarting) {
      updating = 'restarting'; paint();
      const back = await waitFor(r.version, { cmd });
      updating = ''; engine = null; since = -1;
      if (!back) toast('y3kode did not come back yet; try again in a moment');
    } else {
      updating = '';
      if (r?.ok && r.current) toast(`y3kode is already ${r.current}`);
      else toast(r?.code === 'declined' ? 'not updated: the computer said no' : (r?.error || 'y3kode could not update'));
    }
    poll();
  }

  // `?life=<username>`: someone else's shared life, watched (main.js)
  const setWatch = (name) => { watch = typeof name === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(name) ? name : null; };
  return { open, close, setWatch, hear };
}
