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
// coder is. Nothing about the life goes to yearthreethousand.com.
//
// What you can do is what lucid's own window lets you: watch, take the
// controls (human mode: forward, back, turn, look up or down), speak to it,
// slow it or quicken it, and let it rest. It answers in its own words; with
// "hear it" on, the browser's own voice says them aloud. Not the presence's
// voice, and the orb stays still: the one living here is not your presence.
//
// It rests by itself when no page has looked at it for ten minutes
// (life.mjs), because each moment uses your Claude plan.

import { engineCmd } from './own-brain.js';

const LIVE_MS = 700;     // how often a running life is asked how it is
const IDLE_MS = 3000;    // and one that is not running, or not reachable
const VOICE_KEY = 'y3k.life.voice';
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

export function createLifeView({ toast = () => {}, cmd = engineCmd, speak = null, openKode = null, schedule = setTimeout, unschedule = clearTimeout } = {}) {
  let grid = null;
  let timer = 0;
  let since = -1;          // the newest picture this page has (life.state since)
  let pic = '';            // that picture, as a data URL
  let st = null;           // the last life.state answer
  let phase = 'checking';
  let lastSaid = '';       // the last thing it said, so each is heard once
  let quiet = null;        // stops the line being said
  let starting = false;
  let hear = (() => { try { return localStorage.getItem(VOICE_KEY) === '1'; } catch { return false; } })();

  const $ = (sel) => grid?.querySelector(sel);

  function open(g) {
    grid = g;
    since = -1; pic = ''; st = null; phase = 'checking'; lastSaid = '';
    render();
    document.addEventListener('keydown', onKey);
    poll();
  }
  function close() {
    grid = null;
    unschedule(timer); timer = 0;
    document.removeEventListener('keydown', onKey);
    try { quiet?.(); } catch { /* already quiet */ }
    quiet = null;
  }

  async function poll() {
    unschedule(timer); timer = 0;
    if (!grid) return;
    let r;
    try { r = await cmd({ cmd: 'life.state', since }); } catch { r = { ok: false, code: 'offline' }; }
    if (!grid) return;
    st = r;
    phase = phaseOf(r);
    if (r?.ok && typeof r.frame === 'string' && r.frame) { pic = 'data:image/jpeg;base64,' + r.frame; since = r.frameN | 0; }
    const said = r?.moment?.say || '';
    if (said && said !== lastSaid) { lastSaid = said; if (hear && speak) { try { quiet?.(); } catch { /* */ } quiet = speak(said); } }
    paint();
    timer = schedule(poll, phase === 'living' ? LIVE_MS : IDLE_MS);
  }

  async function act(c) {
    const r = await cmd({ cmd: 'life.do', ...c });
    if (!r?.ok) toast(r?.error || 'the life did not hear that');
    poll();
  }
  async function begin(fresh) {
    if (starting) return;
    starting = true; paint();
    const r = await cmd({ cmd: 'life.start', fresh: !!fresh });
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
    const img = $('#life-frame');
    if (img && pic && img.getAttribute('src') !== pic) img.src = pic;
    if (img) img.hidden = !pic;
    // with no picture to show and nothing being dreamed, the empty square
    // steps aside so the card (and its begin) comes first
    const stage = $('.life-stage');
    if (stage) stage.hidden = !pic && phase !== 'living';
    const m = st?.moment || null;
    const status = $('#life-status');
    if (status) status.textContent = phase === 'living' && m
      ? [`moment ${m.n ?? 0}`, m.mode === 'human' ? 'you have the controls' : 'living on its own', m.busy ? (m.status || 'thinking') : (m.status === 'awake' ? '' : m.status)].filter(Boolean).join(' · ')
      : '';
    const veil = $('#life-veil');
    if (veil) veil.textContent = !pic ? (phase === 'living' ? 'dreaming the first moment…' : '') : '';
    const body = $('#life-body');
    if (!body) return;
    const want = phase + (phase === 'living' ? '|' + (m?.mode || '') : '');
    if (body.dataset.phase !== want) { body.dataset.phase = want; body.innerHTML = shell(); wire(); }
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

  function shell() {
    const m = st?.moment || null;
    if (phase === 'checking') return `<p class="life-note">looking for the life on this computer…</p>`;
    if (phase === 'unpaired') return `<div class="life-card"><b>a life lives on your own computer</b>
      <p>lucid runs there, through y3kode, and this page watches it. Open kode once to connect y3kode in this browser, then come back.</p>
      ${openKode ? '<button type="button" id="life-kode" class="create-go">open kode</button>' : ''}</div>`;
    if (phase === 'old') return `<div class="life-card"><b>y3kode needs an update for this</b>
      <p>life arrived in y3kode 0.3.4. Open kode and it will offer the update.</p>
      ${openKode ? '<button type="button" id="life-kode" class="create-go">open kode</button>' : ''}</div>`;
    if (phase === 'missing') return `<div class="life-card"><b>lucid is not on this computer yet</b>
      <p>y3kode looked for it in <code>${esc(st?.dir || '~/y3k-code/lucid')}</code>. lucid is the life itself: a dreamed world (SD-Turbo, about 2.5GB the first time) and Claude on your own sign-in. Its README says how to set it up.</p></div>`;
    if (phase === 'resting') {
      const why = st?.ended?.why ? `<p class="life-note">${esc(st.ended.why)}</p>` : '';
      // lucid's own last lines, only when it stopped on its own with an error
      const log = st?.log?.length && st?.ended?.code ? `<pre class="life-log">${esc(st.log.slice(-6).join('\n'))}</pre>` : '';
      return `<div class="life-card"><b>${pic ? 'it is resting' : 'a life in a dreamed world'}</b>
        <p>Claude, on your own Claude sign-in, looks at a picture dreamed on this computer, thinks, and chooses what to do; the next picture is dreamed from that. You can watch, take the controls, or speak to it. Each moment uses your Claude plan, and it rests on its own when nobody is watching.</p>
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
          <button type="button" id="life-hear" class="usage${hear ? ' on' : ''}"><b>hear it</b><span>${hear ? 'its words, aloud' : 'its words stay written'}</span></button>
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

  function wire() {
    $('#life-kode')?.addEventListener('click', () => openKode?.());
    $('#life-begin')?.addEventListener('click', () => begin(false));
    $('#life-anew')?.addEventListener('click', () => begin(true));
    $('#life-mode')?.addEventListener('click', () => act({ do: 'mode', to: st?.moment?.mode === 'human' ? 'autonomous' : 'human' }));
    $('#life-hear')?.addEventListener('click', () => {
      hear = !hear;
      try { if (hear) localStorage.setItem(VOICE_KEY, '1'); else localStorage.removeItem(VOICE_KEY); } catch { /* private window */ }
      if (!hear) { try { quiet?.(); } catch { /* */ } quiet = null; }
      const body = $('#life-body'); if (body) body.dataset.phase = '';   // redraw the controls
      paint();
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

  return { open, close };
}
