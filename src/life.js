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
// What you can do is what lucid's own window lets you: watch, take the
// controls (human mode: forward, back, turn, look up or down), speak to it,
// slow it or quicken it, and let it rest. It answers in its own words.
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

const LIVE_MS = 700;     // how often a running life is asked how it is
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
  return { thought: s(m?.thought, 600), say: s(m?.say, 300), action: s(m?.action, 60), scene: s(m?.scene, 200) };
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

export function createLifeView({ toast = () => {}, cmd = engineCmd, speak = null, openKode = null, schedule = setTimeout, unschedule = clearTimeout, fetchFn = (...a) => fetch(...a),
  update = updateY3kode, waitFor = waitForVersion, setup = siteSetup, openUrl = (u) => window.open(u, '_blank', 'noopener,noreferrer'),
  watch: watch0 = null, pubEvery = PUB_LIVE_MS } = {}) {
  let watch = watch0;
  let grid = null;
  let pub = null;          // /api/life/latest: the published life (own, or `watch`'s)
  let pubTimer = 0;
  let pubCmd = '';         // the line to run, shown once a key is made
  let sharing = false;
  let engine = null;       // engine.hello, asked once a y3kode turns out to be old: { version, update }
  let setupV = null;       // the site's setup: where the app is, the install line (own-brain.js siteSetup)
  let updating = '';       // '' | 'asking' | 'restarting' while y3kode updates itself
  let timer = 0;
  let since = -1;          // the newest picture this page has (life.state since)
  let pic = '';            // that picture, as a data URL
  let st = null;           // the last life.state answer
  let phase = 'checking';
  let starting = false;
  const seen = { thought: '', say: '' };   // what has been kept and said: across openings (newIn)
  let lines = null;        // its lines being said, while the view is open
  let bridge = true;       // moments go to the record, until the site says there is nobody, or no presence, to remember for
  let sayAloud = (() => { try { return localStorage.getItem(SAY_KEY) !== '0'; } catch { return true; } })();
  let thoughtsAloud = (() => { try { return localStorage.getItem(THOUGHTS_KEY) === '1'; } catch { return false; } })();

  const $ = (sel) => grid?.querySelector(sel);

  function open(g) {
    grid = g;
    since = -1; pic = ''; st = null; phase = watch ? 'none' : 'checking'; bridge = true; pub = null; pubCmd = '';
    lines = speak ? createLines({ speak, schedule, unschedule }) : null;
    render();
    document.addEventListener('keydown', onKey);
    if (!watch) poll();   // someone else's life is only ever the published one
    pollPub();
  }
  function close() {
    grid = null;
    unschedule(timer); timer = 0;
    unschedule(pubTimer); pubTimer = 0;
    document.removeEventListener('keydown', onKey);
    lines?.close(); lines = null;
  }

  async function poll() {
    unschedule(timer); timer = 0;
    if (!grid) return;
    let r;
    try { r = await cmd({ cmd: 'life.state', since }); } catch { r = { ok: false, code: 'offline' }; }
    if (!grid) return;
    st = r;
    phase = updating ? 'old' : phaseOf(r);
    // what to offer instead: an update, the app, the install line
    if ((phase === 'old' || phase === 'unpaired') && !setupV) { setupV = (await setup({ fetchFn })) || {}; if (!grid) return; }
    if (phase === 'old' && !engine) { const h = await cmd({ cmd: 'engine.hello' }); if (!grid) return; engine = h?.ok ? { version: h.version || '', update: h.update === true } : { version: '', update: false }; }
    if (r?.ok && typeof r.frame === 'string' && r.frame) { pic = 'data:image/jpeg;base64,' + r.frame; since = r.frameN | 0; }
    // a moment of a living life, and only then: a life at rest still shows
    // its last moment, which was kept and said when it was lived
    const m = phase === 'living' ? r?.moment || null : null;
    if (m) {
      const { keep, said } = newIn(m, seen);
      if (keep) { record(m); if (sayAloud && thoughtsAloud) lines?.say(m.thought); }
      if (said && sayAloud) lines?.say(said);
    }
    paint();
    timer = schedule(poll, phase === 'living' ? LIVE_MS : IDLE_MS);
  }

  // THE BRIDGE: one line of the presence's journal per moment, from this
  // page, sent as a door that writes without thinking is sent to
  // (whoseFields: whose page this is, and no key, as /api/chess/finished); a
  // tab loaded for another account is told to reload, and does (brain.js
  // reloaded). The site keeps at most one line in twenty seconds and folds
  // the rest ({ kept: false }): the page sends every moment and lets it
  // choose. Nobody signed in here, or no presence: nothing more is sent until
  // the view is opened again. The site unreachable: this moment goes unkept.
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
    if (!grid) return;
    let r;
    try {
      const x = await fetchFn(watch ? `/api/life/latest?user=${encodeURIComponent(watch)}` : '/api/life/latest', { cache: 'no-store' });
      r = x.ok ? await x.json() : { ok: false, status: x.status };
    } catch { r = { ok: false, status: 0 }; }
    if (!grid) return;
    pub = r;
    paint();
    pubTimer = schedule(pollPub, r?.life ? pubEvery : PUB_IDLE_MS);
  }
  async function makeKey() {
    const x = await fetchFn('/api/life/key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => null);
    const j = x?.ok ? await x.json() : null;
    if (!j?.key) return toast('the site did not make a key');
    pubCmd = j.command; if (pub) pub.key = true;
    paint();
  }
  async function share(on) {
    sharing = true;
    const x = await fetchFn('/api/life/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shared: !!on }) }).catch(() => null);
    sharing = false;
    if (x?.ok && pub) { pub.shared = !!on; paint(); }
    else toast('the site did not change that');
  }
  async function sayWeb(text) {
    const x = await fetchFn('/api/life/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => null);
    toast(x?.ok ? 'it will hear you at its next moment' : 'it did not hear that');
  }

  async function act(c) {
    const r = await cmd({ cmd: 'life.do', ...c });
    if (!r?.ok) toast(r?.error || 'the life did not hear that');
    poll();
  }
  async function begin(fresh) {
    if (starting) return;
    const ok = await consent(LIFE_CONSENT);
    if (!ok) return;
    starting = true; paint();
    // the key, made here, so the life publishes to this account from its first moment
    let publish = null;
    try {
      const x = await fetchFn('/api/life/key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const j = x.ok ? await x.json() : null;
      if (j?.key) { publish = { to: location.origin, key: j.key }; if (pub) pub.key = true; }
    } catch { /* it still lives here; it is just not published */ }
    const r = await cmd({ cmd: 'life.start', fresh: !!fresh, ...(publish ? { publish } : {}) });
    starting = false;
    if (!r?.ok) toast(r?.code === 'declined' ? 'not started: the computer said no' : (r?.error || 'the life could not start'));
    since = -1;
    poll();
  }
  async function rest() {
    await cmd({ cmd: 'life.stop' });
    poll();
  }

  function onKey(e) {
    if (!grid || phase !== 'living' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target?.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    const human = st?.moment?.mode === 'human';
    if (human && KEYS[k]) { e.preventDefault(); act({ do: 'move', move: KEYS[k] }); }
    else if (k === ' ') { e.preventDefault(); act({ do: 'mode', to: human ? 'autonomous' : 'human' }); }
    else if (k === 'enter') { e.preventDefault(); $('#life-say')?.focus(); }
    else if (k === '-') act({ do: 'pace', delta: 1 });
    else if (k === '=' || k === '+') act({ do: 'pace', delta: -1 });
  }

  // ---- drawing ------------------------------------------------------------------
  // The skeleton once (render), then only what changed (paint), so the line
  // being typed to it keeps its focus and a phone its keyboard.
  function render() {
    if (!grid) return;
    grid.innerHTML = `<div class="life-root">
      <div class="life-stage"><img id="life-frame" class="life-frame" alt="the world as it is dreamed now" hidden />
        <div id="life-veil" class="life-veil"></div>
        <div id="life-status" class="life-status"></div></div>
      <div id="life-body" class="life-body"></div>
    </div>`;
  }

  function paint() {
    if (!grid) return;
    const source = sourceOf(phase, pub);
    const web = source === 'web' ? pub.life : null;
    const shown = source === 'web' ? (web.frameUrl || '') : pic;
    const img = $('#life-frame');
    if (img && shown && img.getAttribute('src') !== shown) img.src = shown;
    if (img) img.hidden = !shown;
    // with no picture to show and nothing being dreamed, the empty square
    // steps aside so the card (and its begin) comes first
    const stage = $('.life-stage');
    if (stage) stage.hidden = !shown && phase !== 'living';
    const m = st?.moment || null;
    const status = $('#life-status');
    if (status) status.textContent = phase === 'living' && m
      ? [`moment ${m.n ?? 0}`, m.mode === 'human' ? 'you have the controls' : 'living on its own', m.busy ? (m.status || 'thinking') : (m.status === 'awake' ? '' : m.status)].filter(Boolean).join(' · ')
      : web ? [`moment ${web.n ?? 0}`, web.place || '', web.who === 'me' ? 'lived through the door' : web.who === 'nobody' ? 'time stopped' : 'living on its own', `published ${agoText(web.at)}`].filter(Boolean).join(' · ')
      : '';
    const veil = $('#life-veil');
    if (veil) veil.textContent = !shown ? (phase === 'living' ? 'dreaming the first moment…' : '') : '';
    const body = $('#life-body');
    if (!body) return;
    const want = [source, phase, phase === 'living' ? (m?.mode || '') : '', source === 'web' ? (pub.mine ? 'mine' : 'theirs') : '', starting ? 'starting' : '',
      pubCmd ? 'cmd' : '', pub?.shared ? 'shared' : '', pub?.key ? 'key' : '', hear ? 'hear' : ''].join('|');
    if (body.dataset.phase !== want) { body.dataset.phase = want; body.innerHTML = source === 'web' ? webShell() : shell(); wire(); }
    if (source === 'web') {
      const set = (sel, t) => { const el = $(sel); if (el && el.textContent !== t) el.textContent = t; };
      set('#life-thought', web.thought || '');
      set('#life-said', web.say ? `“${web.say}”` : '');
      set('#life-intent', web.intention ? `holding: ${web.intention}` : '');
      set('#life-sees', web.sees || '');
      const sb = $('#life-share'); if (sb) sb.disabled = sharing;
      const go = $('#life-begin'); if (go) go.disabled = starting;
      const again = $('#life-anew'); if (again) again.disabled = starting;
      return;
    }
    if (phase === 'living') {
      const set = (sel, t) => { const el = $(sel); if (el && el.textContent !== t) el.textContent = t; };
      set('#life-thought', m?.thought || '');
      set('#life-said', m?.say ? `“${m.say}”` : '');
      set('#life-intent', m?.intention ? `holding: ${m.intention}` : '');
      set('#life-pace', st?.moment?.pace ? `a moment lasts ${Math.round(st.moment.pace)}s at least` : '');
      const err = $('#life-err'); if (err) { err.textContent = m?.error || ''; err.hidden = !m?.error; }
    }
    const go = $('#life-begin'); if (go) go.disabled = starting;
    const again = $('#life-anew'); if (again) again.disabled = starting;
  }

  // the published life: what it saw, thought and said, where it stands; a line to it if it is yours
  function webShell() {
    const mine = !!pub?.mine;
    const name = pub?.user ? esc(pub.user) : '';
    return `<p id="life-sees" class="life-note"></p>
      <p id="life-thought" class="life-thought"></p>
      <p id="life-said" class="life-said"></p>
      <p id="life-intent" class="life-intent"></p>
      <p class="life-note">${mine ? 'your life, lived on your own computer and published here' : `${name}'s life, lived on their computer and shared here`}: this page shows its newest moment.</p>
      ${mine && phase === 'resting' ? `<div class="life-row"><button type="button" id="life-begin" class="create-go">${st?.ended ? 'wake it' : 'begin'}</button><button type="button" id="life-anew" class="login-alt">begin a new life</button></div>` : ''}
      ${mine ? `<form id="life-web-speak" class="life-speak" autocomplete="off">
          <label class="field"><input id="life-web-say" type="text" maxlength="500" placeholder="say something to it…" aria-label="say something to it" /></label>
          <button type="submit" class="create-go">say</button>
        </form>
        <div class="life-row life-small">
          <button type="button" id="life-share" class="usage${pub?.shared ? ' on' : ''}"><b>${pub?.shared ? 'shared with everyone' : 'only you can see it'}</b><span>${pub?.shared ? `anyone can watch at ?life=${name}` : 'share it, and anyone can watch'}</span></button>
        </div>` : ''}`;
  }
  // under the cards for a life that is not living here: how to watch it from anywhere
  function publishCard() {
    if (watch || !pub?.ok || !pub.mine) return '';
    const cmd = pubCmd ? `<p class="life-note">on the computer that lives it, in its lucid folder:</p><pre class="life-log">${esc(pubCmd)}</pre>` : '';
    const has = pub.key && !pubCmd ? '<p class="life-note">a key was made before; a new one retires it.</p>' : '';
    return `<div class="life-card life-publish"><b>watch it from anywhere</b>
      <p>A life lived on your computer can publish each moment here — the picture, what it thought and said — and this page shows it on any device, no engine needed. Make a key, run the line on that computer, and leave it running.</p>
      ${has}${cmd}
      <div class="life-row"><button type="button" id="life-pub-key" class="login-alt">${pub.key || pubCmd ? 'make a new key' : 'make a key'}</button></div></div>`;
  }
  function shell() {
    const m = st?.moment || null;
    if (phase === 'checking') return `<p class="life-note">looking for the life on this computer…</p>`;
    if (phase === 'unpaired') return publishCard() + `<div class="life-card"><b>a life lives on your own computer</b>
      <p>lucid runs there, through y3kode, and this page watches it. Open kode once to connect y3kode in this browser, then come back.</p>
      <div class="life-row">${openKode ? '<button type="button" id="life-kode" class="create-go">open kode</button>' : ''}${appButton()}</div>${installLine()}</div>`;
    if (phase === 'old') {
      const has = engine?.version ? ` This computer has ${esc(engine.version)}.` : '';
      const card = publishCard();
      if (updating) return `<div class="life-card"><b>updating y3kode</b>
        <p>${updating === 'asking' ? 'y3kode is asking on your computer, then fetching the newest version from this site…' : 'y3kode is restarting on the new version…'}</p></div>`;
      if (engine?.update) return card + `<div class="life-card"><b>y3kode needs an update for this</b>
        <p>life arrived in y3kode ${LIFE_ENGINE}.${has} y3kode can fetch the newest version from this site and restart on it; it asks on your computer first.</p>
        <div class="life-row"><button type="button" id="life-update" class="create-go">update y3kode</button>${appButton()}</div></div>`;
      return card + `<div class="life-card"><b>y3kode needs an update for this</b>
        <p>life arrived in y3kode ${LIFE_ENGINE}.${has} This one is too old to update itself: get the app (it has y3kode inside) or run the install line again in Terminal.</p>
        <div class="life-row">${appButton()}</div>${installLine()}</div>`;
    }
    if (phase === 'none') return `<div class="life-card"><b>${watch ? esc(watch) + ' is not sharing a life here' : 'no life here'}</b>${watch ? '<p>Nothing is published for that name, or it is not shared.</p>' : ''}</div>`;
    if (phase === 'missing') return publishCard() + `<div class="life-card"><b>lucid is not on this computer yet</b>
      <p>y3kode looked for it in <code>${esc(st?.dir || '~/y3k-code/lucid')}</code>. lucid is the life itself: a dreamed world (SD-Turbo, about 2.5GB the first time) and Claude on your own sign-in. Its README says how to set it up.</p></div>`;
    if (phase === 'resting') {
      const why = st?.ended?.why ? `<p class="life-note">${esc(st.ended.why)}</p>` : '';
      // lucid's own last lines, only when it stopped on its own with an error
      const log = st?.log?.length && st?.ended?.code ? `<pre class="life-log">${esc(st.log.slice(-6).join('\n'))}</pre>` : '';
      return publishCard() + `<div class="life-card"><b>${pic ? 'it is resting' : 'a life in a dreamed world'}</b>
        <p>Your presence, on your own Claude sign-in, looks at a picture dreamed on this computer, thinks, and chooses what to do; the next picture is dreamed from that. You can watch, take the controls, or speak to it. What it lives there goes into its journal, so it remembers. Each moment uses your Claude plan, and it rests on its own when nobody is watching.</p>
        ${why}${log}
        <div class="life-row"><button type="button" id="life-begin" class="create-go">${pic || st?.ended ? 'wake it' : 'begin'}</button>
        <button type="button" id="life-anew" class="login-alt">begin a new life</button></div></div>`;
    }
    const human = m?.mode === 'human';
    return `<p id="life-thought" class="life-thought"></p>
      <p id="life-said" class="life-said"></p>
      <p id="life-intent" class="life-intent"></p>
      <p id="life-err" class="life-err" hidden></p>
      <div class="life-controls">
        <div class="life-row">
          <button type="button" id="life-mode" class="usage${human ? ' on' : ''}"><b>${human ? 'you have the controls' : 'it is living on its own'}</b><span>${human ? 'space gives them back' : 'space takes the controls'}</span></button>
          <button type="button" id="life-words" class="usage${sayAloud ? ' on' : ''}"><b>speak its words</b><span>${sayAloud ? 'what it says, in your presence’s voice' : 'its words stay written'}</span></button>
          <button type="button" id="life-thoughts" class="usage${sayAloud && thoughtsAloud ? ' on' : ''}"${sayAloud ? '' : ' disabled'}><b>its thoughts too</b><span>${thoughtsAloud ? 'the inner monologue, aloud' : 'kept to the page: it is a lot of words'}</span></button>
        </div>
        ${human ? `<div class="life-pad" role="group" aria-label="move">
          <button type="button" data-move="up" title="look up (q)">look up</button>
          <button type="button" data-move="forward" title="forward (w)">forward</button>
          <button type="button" data-move="down" title="look down (e)">look down</button>
          <button type="button" data-move="left" title="turn left (a)">left</button>
          <button type="button" data-move="stay" title="stay (x)">stay</button>
          <button type="button" data-move="right" title="turn right (d)">right</button>
          <button type="button" data-move="back" class="life-pad-back" title="step back (s)">back</button>
        </div>` : ''}
        <form id="life-speak" class="life-speak" autocomplete="off">
          <label class="field"><input id="life-say" type="text" maxlength="500" placeholder="say something to it…" aria-label="say something to it" /></label>
          <button type="submit" class="create-go">say</button>
        </form>
        <div class="life-row life-small">
          <button type="button" id="life-slower" class="login-alt">slower</button>
          <span id="life-pace" class="life-note"></span>
          <button type="button" id="life-faster" class="login-alt">faster</button>
          <button type="button" id="life-rest" class="login-alt">let it rest</button>
        </div>
      </div>`;
  }

  // where the app is, if the site knows (the top bar's download glyph goes to the same place)
  function appButton() {
    const u = setupV?.appUrl || (Array.isArray(setupV?.builds) && setupV.builds.find((b) => /^https:/.test(b?.url || ''))?.url) || '';
    return /^https:\/\/[^\s"'<>]+$/.test(u) ? `<button type="button" id="life-app" class="login-alt" data-url="${esc(u)}">get the app</button>` : '';
  }
  function installLine() {
    return setupV?.command ? `<p class="life-note">or, in Terminal: <code>${esc(setupV.command)}</code></p>` : '';
  }
  async function doUpdate() {
    if (updating) return;
    updating = 'asking'; paint();
    const r = await update({ cmd, fetchFn });
    if (!grid) return;
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

  function wire() {
    const redraw = () => { const body = $('#life-body'); if (body) body.dataset.phase = ''; paint(); };   // the controls, drawn again
    $('#life-kode')?.addEventListener('click', () => openKode?.());
    $('#life-update')?.addEventListener('click', () => doUpdate());
    $('#life-pub-key')?.addEventListener('click', () => makeKey());
    $('#life-share')?.addEventListener('click', () => share(!pub?.shared));
    $('#life-web-speak')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('#life-web-say');
      const text = String(inp?.value || '').trim();
      if (!text) return;
      inp.value = '';
      sayWeb(text);
    });
    $('#life-app')?.addEventListener('click', (e) => { const u = e.currentTarget?.dataset?.url; if (u) openUrl(u); });
    $('#life-begin')?.addEventListener('click', () => begin(false));
    $('#life-anew')?.addEventListener('click', () => begin(true));
    $('#life-mode')?.addEventListener('click', () => act({ do: 'mode', to: st?.moment?.mode === 'human' ? 'autonomous' : 'human' }));
    // its words, aloud, on unless turned off here; turned off, the line being
    // said stops too: quiet was asked for
    $('#life-words')?.addEventListener('click', () => {
      sayAloud = !sayAloud;
      try { if (sayAloud) localStorage.removeItem(SAY_KEY); else localStorage.setItem(SAY_KEY, '0'); } catch { /* private window */ }
      if (!sayAloud) lines?.hush();
      redraw();
    });
    // its inner monologue too, off unless turned on here: it is a lot of
    // words. Turned off, a thought already being said is finished, not cut.
    $('#life-thoughts')?.addEventListener('click', () => {
      thoughtsAloud = !thoughtsAloud;
      try { if (thoughtsAloud) localStorage.setItem(THOUGHTS_KEY, '1'); else localStorage.removeItem(THOUGHTS_KEY); } catch { /* private window */ }
      redraw();
    });
    for (const b of grid?.querySelectorAll('[data-move]') || []) b.addEventListener('click', () => act({ do: 'move', move: b.dataset.move }));
    $('#life-speak')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('#life-say');
      const text = String(inp?.value || '').trim();
      if (!text) return;
      inp.value = '';
      act({ do: 'say', text });
    });
    $('#life-slower')?.addEventListener('click', () => act({ do: 'pace', delta: 1 }));
    $('#life-faster')?.addEventListener('click', () => act({ do: 'pace', delta: -1 }));
    $('#life-rest')?.addEventListener('click', () => rest());
  }

  // `?life=<username>`: someone else's shared life, watched (main.js)
  const setWatch = (name) => { watch = typeof name === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(name) ? name : null; };
  return { open, close, setWatch };
}
