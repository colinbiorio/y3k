// TWENTY QUESTIONS, played with your own presence. Colin, 2026-10-19: "tons
// of room to work on the world, new backgrounds, ui improvements, games, etc".
// Chess was the only game; this one is all talk, which is what a presence is
// best at. Two ways round:
//   IT THINKS, YOU ASK  it chooses a thing on the server (twenty.mjs), which
//                       shows this page only a seal of it before the first
//                       question; you ask, by typing or by voice, and it
//                       answers yes, no, sometimes or don't know. When the
//                       game ends the secret and its salt come here, and THIS
//                       PAGE hashes them (twenty-seal.js) and says whether the
//                       seal matches: proof it did not change its mind.
//   YOU THINK, IT ASKS  it asks, you answer with the buttons (or by voice),
//                       it guesses when it is ready, you say right or not.
// The server is asked only through /api/twenty, on the owner's own key or own
// sign-in like chess (keyFields), and a finished game joins what the presence
// keeps the way chess does (a clipping on its shelf, written by the server).
//
// Its words reach you the way a reply's do: in the caption, in its own voice,
// and in the body — each answer moves the orb (a bright mood on a yes, a
// quieter one on a no), through the same mood the conversation sets. All of
// that is main.js's, handed in (social.js passes it on): this file draws a
// panel and asks the server, and nothing else.

import { canLive, keyFields, whoseFields, noBrain, reloaded, whyLine } from './brain.js';
import { checkSeal } from './twenty-seal.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PLAY_WITH = 'For your presence to play twenty questions';
const N = 20;
// What each answer is called on the page, and said aloud.
const WORD = { yes: 'yes', no: 'no', sometimes: 'sometimes', unknown: "don't know" };
// HOW THE BODY TAKES AN ANSWER: a mood it holds a moment and a beat that
// passes (body.js BEATS), from the vocabulary the conversation already uses.
// Bright on a yes, quieter on a no, a tremor on a sometimes, drawn in on a
// don't know.
const FEEL = {
  yes: ['excited', 'flare', 6],
  no: ['calm', 'hush', 5],
  sometimes: ['speaking', 'shiver', 4],
  unknown: ['listening', 'draw', 4],
};
const MIC_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3"/></svg>';

// A spoken answer, read for what it means: a guess is right or not; a
// question yes, no, sometimes or don't know. '' when it is none of them.
export function heardAnswer(text, guess = false) {
  const t = String(text || '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' ]+/g, ' ').trim();
  if (!t) return '';
  if (/\b(don'?t know|do not know|not sure|no idea|unsure|dunno)\b/.test(t)) return guess ? '' : 'unknown';
  if (/\b(sometimes|partly|kind of|sort of|maybe|it depends|depends)\b/.test(t)) return guess ? '' : 'sometimes';
  if (/^(yes|yeah|yep|yup|correct|right|true|sure|it is|that's it|you got it)\b/.test(t)) return 'yes';
  if (/^(no|nope|nah|not|wrong|false|it isn't|it's not|it is not)\b/.test(t)) return 'no';
  return '';
}

// What the presence says beside an answer: its line, with the answer in front
// when the line does not already begin with it ("No. Not at all."), so an ear
// alone can follow the game.
export function spokenAnswer(a, say) {
  const word = WORD[a] || '';
  const line = String(say || '').trim();
  const Word = word ? word[0].toUpperCase() + word.slice(1) : '';
  if (!line) return Word ? Word + '.' : '';
  if (!word) return line;
  const plain = line.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' ]/g, ' ').trim();
  return new RegExp(`^${word}\\b`).test(plain) ? line : `${Word}. ${line}`;
}

export function createTwenty({ getAccount, toast, caption, mood, beat, say, dictate, canDictate } = {}) {
  let grid = null;          // the home grid while this view is open
  let mode = 'it';          // 'it' (it thinks, you ask) | 'you' (you think, it asks)
  let phase = 'setup';      // 'setup' | 'live' | 'done'
  let game = null;          // the server's view of the game on (twenty.mjs view)
  let opening = '';         // its first line, when it thinks of the thing
  let thinking = false;
  let asked = '';           // the question waiting for its answer (it thinks)
  let sealed = 'checking';  // the seal, at the end: true | false | null (cannot check here) | 'checking'
  let presenceHandle = null;
  let mic = null;           // { handlers, release } while the microphone is the game's
  let calmTimer = 0;
  let reaction = 0;         // the body's latest reaction: an older one's ending does not touch a newer
  let quiet = null;         // stops the line being said

  const it = () => (presenceHandle ? '@' + presenceHandle : 'your presence');

  function open(g) {
    grid = g; render();
    if (!presenceHandle) {
      fetch('/api/presences?mine=1').then((x) => x.json())
        .then((r) => { presenceHandle = (r.presences || []).find((x) => x.mine)?.handle || null; if (grid && phase === 'setup') render(); })
        .catch(() => {});
    }
  }
  // The game survives a wander elsewhere, as chess's does; the microphone and
  // a mood the game is holding do not (an answer that lands while you are
  // elsewhere goes to the panel, not the orb, so nothing would let it go).
  function close() {
    grid = null;
    stopMic();
    if (calmTimer || thinking) hold('calm');
  }

  // ---- the body and the voice -----------------------------------------------
  // A mood held until something else is: while it thinks, or back at rest.
  function hold(name) {
    reaction += 1;
    clearTimeout(calmTimer); calmTimer = 0;
    mood?.(name);
  }
  // A reaction holds for the line it comes with, and a moment after; then the
  // body goes back to calm — unless another reaction came since. The line
  // before it is cut off first, so its ending cannot end this one.
  function react(name, beatName, n, line) {
    if (!grid) return;   // the answer landed while you were elsewhere: the panel has it, the orb is not told
    const q = quiet;
    quiet = null;
    try { q?.(); } catch { /* already quiet */ }
    hold(name);
    const me = reaction;
    if (beatName) beat?.(beatName, n);
    const t0 = Date.now();
    const settle = () => {
      if (me !== reaction) return;
      clearTimeout(calmTimer);
      calmTimer = setTimeout(() => { if (me === reaction) { calmTimer = 0; mood?.('calm'); } }, Math.max(1200, 3200 - (Date.now() - t0)));
    };
    if (line) {
      caption?.(line, 'y3k');
      if (say) quiet = say(line, { onEnd: settle });
      else settle();
    } else settle();
  }

  // ---- the server ------------------------------------------------------------
  // → the answer, or null when there is none to use (said already, or the
  // page is reloading as whoever is here now: brain.js reloaded).
  async function call(body) {
    let r, status = 0;
    try {
      const res = await fetch('/api/twenty', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        // ending thinks nothing, so it carries whose page this is and no key
        // (as /api/chess/finished does); every step that thinks, keyFields
        body: JSON.stringify({ ...(body.op === 'end' ? whoseFields() : keyFields()), ...body }),
      });
      status = res.status;
      r = await res.json().catch(() => ({ error: `the site said ${res.status}` }));
    } catch {
      toast?.('could not reach the site — try again');
      return null;
    }
    if (reloaded(r)) return null;
    if (r?.ok) return r;
    if (status === 404) { gone(); return null; }
    if (r?.reason === 'byok') toast?.(noBrain(PLAY_WITH));
    else toast?.(whyLine(r?.why, r?.provider) || r?.error || 'it could not think just now — try again');
    return null;
  }
  // The game is not on the server any more (an hour passed, the site
  // restarted, or a newer game took its place): back to the start, saying so.
  function gone() {
    game = null; phase = 'setup'; thinking = false; asked = '';
    toast?.('that game is gone — the site no longer holds it. start another?');
    render();
  }

  async function begin() {
    if (thinking) return;
    if (!canLive()) { toast?.(noBrain(PLAY_WITH)); return; }
    thinking = true; game = null; opening = ''; asked = '';
    phase = 'live';
    hold('thinking');
    render();
    const r = await call({ op: 'start', mode });
    thinking = false;
    if (!r) { phase = 'setup'; hold('calm'); render(); return; }
    game = r.game;
    if (game.mode === 'it') {
      opening = r.say || '';
      render();
      react('tender', 'draw', 4, opening);
      $('twenty-q')?.focus();
    } else {
      render();
      askedAloud(game.pending);
    }
  }

  // It thinks: you ask.
  async function ask(text) {
    const q = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const g = game;
    if (!q || thinking || !g || g.over || g.mode !== 'it') return;
    if (!canLive()) { toast?.(noBrain(PLAY_WITH)); return; }
    thinking = true; asked = q;
    hold('thinking');
    paint();
    const r = await call({ op: 'ask', id: g.id, question: q });
    thinking = false; asked = '';
    // a newer game began, or this one was given up, while it thought
    if (game !== g || game.over) { paint(); return; }
    if (!r) { hold('calm'); paint(); return; }
    game = r.game;
    const el = $('twenty-q');
    if (el) el.value = '';
    const last = game.turns[game.turns.length - 1];
    caption?.(q, 'you');
    if (game.over) { finish(spokenAnswer(last?.a, r.say)); return; }
    paint();
    const [m, b, n] = FEEL[last.a] || FEEL.unknown;
    react(m, b, n, spokenAnswer(last.a, r.say));
    $('twenty-q')?.focus();
  }

  // You think: you answer its question, or say whether its guess is right.
  async function answer(a) {
    const g = game;
    if (thinking || !g || g.over || g.mode !== 'you' || !g.pending || !WORD[a]) return;
    thinking = true;
    caption?.(g.pending.guess ? (a === 'yes' ? 'right!' : 'not it') : WORD[a], 'you');
    // it hears the answer: the body takes it before it thinks again
    const [m, b, n] = FEEL[a];
    react(m, b, n, '');
    paint();
    const r = await call({ op: 'reply', id: g.id, answer: a });
    thinking = false;
    if (game !== g || game.over) { paint(); return; }
    if (!r) { paint(); return; }
    game = r.game;
    if (game.over) { finish(''); return; }
    paint();
    askedAloud(game.pending, r.say);
  }
  // Its question (or guess) said aloud, and in the caption.
  function askedAloud(p, line = p?.say) {
    if (!p) return;
    const q = p.guess ? `Is it ${p.q}?` : p.q;
    react(p.guess ? 'excited' : 'speaking', p.guess ? 'swell' : '', 4, [line, q].filter(Boolean).join(' '));
  }

  async function stop() {
    const g = game;
    if (!g || g.over) return;
    stopMic();
    const r = await call({ op: 'end', id: g.id });
    if (game !== g || !r) return;
    game = r.game;
    finish('');
  }

  // THE END: the verdict, and — when it thought of the thing — the seal opened
  // and checked on this page.
  function finish(line) {
    stopMic();
    phase = 'done';
    thinking = false;
    sealed = game?.mode === 'it' ? 'checking' : null;
    render();
    const o = game?.over || {};
    // its body: glad when the thing is found, by either of you; tender when
    // it was not
    const found = o.how === 'found' || o.how === 'guessed';
    react(found ? 'excited' : 'tender', found ? 'flare' : 'swell', found ? 8 : 4, line);
    if (game?.mode === 'it') {
      const g = game;
      checkSeal(g.seal, g.reveal).then((v) => { if (game === g) { sealed = v; paintSeal(); } })
        .catch(() => { if (game === g) { sealed = null; paintSeal(); } });
    }
  }

  // ---- the microphone ----------------------------------------------------------
  // One utterance through the house's dictation lease (main.js dictate): what
  // it hears is the game's, never a turn of the conversation. It thinks: the
  // words become your question. You think: they become your answer.
  function listen() {
    if (mic) { stopMic(); return; }
    if (!dictate) return;
    if (canDictate?.() === false) { toast?.('This browser cannot hear — Chrome or Edge can.'); return; }
    if (thinking || !game || game.over) return;
    const handlers = {
      onText: ({ text, final }) => {
        if (mic?.handlers !== handlers) return;
        const t = String(text || '').trim();
        if (game?.mode === 'it') {
          const el = $('twenty-q');
          if (el) el.value = t;
          if (final && t) { stopMic(); ask(t); }
        } else if (final && t) {
          stopMic();
          const a = heardAnswer(t, !!game?.pending?.guess);
          if (a) answer(a);
          else toast?.(`heard "${t.slice(0, 60)}" — ${game?.pending?.guess ? 'say right, or not it' : 'tap an answer'}`);
        }
      },
      onState: (on) => {
        if (mic?.handlers !== handlers) return;
        if (!on) stopMic(); else paintMic();
      },
    };
    // (the lease says onState(true) from inside dictate(), before it returns:
    // the handlers name this listen, not the release)
    mic = { handlers, release: () => {} };
    mic.release = dictate(handlers) || mic.release;
    paintMic();
  }
  function stopMic() {
    const m = mic;
    mic = null;
    try { m?.release(); } catch { /* the lease is the house's */ }
    paintMic();
  }
  function paintMic() {
    const b = $('twenty-mic');
    if (!b) return;
    b.classList.toggle('on', !!mic);
    b.setAttribute('aria-pressed', mic ? 'true' : 'false');
  }

  // ---- drawing ------------------------------------------------------------------
  // The card is built once for each phase and patched while a game runs, so
  // the question box keeps its focus (and a phone its keyboard) between
  // questions.
  const canHear = () => !!dictate && canDictate?.() !== false;
  const seal8 = (g) => esc(String(g?.seal || '').slice(0, 8));
  const rowHtml = (t) => (game?.mode === 'you'
    ? `<li class="twenty-row"><span class="twenty-q">${esc(t.guess ? `is it ${t.q}?` : t.q)}</span><b class="twenty-a ${t.guess ? (t.a === 'yes' ? 'yes' : 'no') : esc(t.a)}">${t.guess ? (t.a === 'yes' ? 'right' : 'not it') : esc(WORD[t.a] || t.a)}</b></li>`
    : `<li class="twenty-row"><span class="twenty-q">${esc(t.q)}</span><b class="twenty-a ${esc(t.a)}">${esc(WORD[t.a] || t.a)}</b>${t.say ? `<span class="twenty-say">${esc(t.say)}</span>` : ''}</li>`);
  const logHtml = () => (game?.turns || []).map(rowHtml).reverse().join('');

  function render() {
    if (!grid) return;
    grid.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'chess-root twenty-root';
    const card = document.createElement('div');
    card.className = 'chess-card twenty-card';
    card.innerHTML = phase === 'setup' ? setupHtml() : phase === 'done' ? doneHtml() : liveHtml();
    root.appendChild(card);
    grid.appendChild(root);
    wire();
    if (phase === 'live') paint();
    if (phase === 'done') paintSeal();
  }

  function setupHtml() {
    const can = canLive();
    return `
      <p class="chess-lead"><b>${esc(it())}</b> and you, twenty questions: one of you thinks of something, and the other has twenty yes-or-no questions to find it.</p>
      ${can ? '' : `<p class="chess-warn">${esc(noBrain(PLAY_WITH))}</p>`}
      <div class="chess-opts" id="twenty-mode">
        <button type="button" data-v="it" class="usage${mode === 'it' ? ' on' : ''}"><b>it thinks</b><span>you ask</span></button>
        <button type="button" data-v="you" class="usage${mode === 'you' ? ' on' : ''}"><b>you think</b><span>it asks</span></button>
      </div>
      <button type="button" id="twenty-go" class="create-go" ${can ? '' : 'disabled'}>begin</button>
      <p class="chess-fine">when it thinks of something, what it chose is sealed before your first question. at the end the seal is opened, and this page checks it.</p>`;
  }

  function liveHtml() {
    const g = game;
    const you = g?.mode === 'you' || (!g && mode === 'you');
    const head = `
      <div class="twenty-top">
        <span class="twenty-count" id="twenty-count"></span>
        ${you ? '<span class="twenty-seal">you hold the secret</span>'
          : g ? `<span class="twenty-seal" title="sha-256 of what it chose and a random salt, fixed before your first question; opened and checked here at the end">sealed · <code>${seal8(g)}</code></span>` : ''}
      </div>
      <div class="twenty-now" id="twenty-now" aria-live="polite"></div>`;
    const hear = canHear() ? `<button type="button" id="twenty-mic" class="twenty-mic" aria-pressed="false" aria-label="${you ? 'answer by voice' : 'ask by voice'}" title="${you ? 'answer by voice' : 'ask by voice'}">${MIC_SVG}</button>` : '';
    const input = you
      ? `<div class="twenty-answers" id="twenty-answers"></div>${hear ? `<div class="twenty-hear">${hear}<span>or answer by voice</span></div>` : ''}`
      : `<form id="twenty-form" class="twenty-ask" autocomplete="off">
          <label class="field"><input id="twenty-q" type="text" maxlength="200" placeholder="ask a yes-or-no question…" enterkeyhint="send" aria-label="your question" /></label>
          ${hear}
          <button type="submit" id="twenty-send" class="create-go">ask</button>
        </form>`;
    return `${head}${input}
      <ol class="twenty-log" id="twenty-log"></ol>
      <button type="button" id="twenty-stop" class="login-alt">${you ? 'stop the game' : 'give up — show me what it was'}</button>`;
  }

  // The live card, brought up to date where it stands.
  function paint() {
    if (!grid || phase !== 'live') return;
    const now = $('twenty-now');
    if (!now) { render(); return; }
    const g = game;
    const you = g ? g.mode === 'you' : mode === 'you';
    const count = $('twenty-count');
    const n = g ? g.turns.length + 1 : 1;
    if (count) count.textContent = !g ? 'starting…' : n >= N ? 'the last question' : `question ${Math.min(n, N)} of ${N}`;
    if (!g) {
      now.innerHTML = `<p class="chess-turn shimmer">${esc(it())} is ${you ? 'getting ready to ask' : 'choosing something'}…</p>`;
    } else if (you) {
      const p = g.pending;
      now.innerHTML = thinking
        ? `<p class="chess-turn shimmer">${esc(it())} is thinking…</p>`
        : p ? `${p.say ? `<p class="twenty-line">${esc(p.say)}</p>` : ''}<p class="twenty-asks">${p.guess ? `is it <b>${esc(p.q)}</b>?` : esc(p.q)}</p>` : '';
      const box = $('twenty-answers');
      if (box) {
        const guess = !!p?.guess;
        const want = guess ? 'guess' : 'ask';
        if (box.dataset.kind !== want) {
          box.dataset.kind = want;
          box.classList.toggle('guess', guess);
          box.innerHTML = guess
            ? '<button type="button" data-a="yes" class="usage"><b>right!</b><span>it found it</span></button><button type="button" data-a="no" class="usage"><b>not it</b><span>keep going</span></button>'
            : ['yes', 'no', 'sometimes', 'unknown'].map((a) => `<button type="button" data-a="${a}" class="usage"><b>${WORD[a]}</b></button>`).join('');
        }
        for (const b of box.querySelectorAll('button')) b.disabled = thinking || !p;
      }
    } else {
      const last = g.turns[g.turns.length - 1];
      now.innerHTML = thinking
        ? `<p class="twenty-you">${esc(asked)}</p><p class="chess-turn shimmer">${esc(it())} is thinking…</p>`
        : last ? `<p class="twenty-you">${esc(last.q)}</p><p class="twenty-big ${esc(last.a)}">${esc(WORD[last.a] || last.a)}</p>${last.say ? `<p class="twenty-line">${esc(last.say)}</p>` : ''}`
          : `<p class="twenty-line">${opening ? esc(opening) : `${esc(it())} has chosen. ask your first question.`}</p>`;
      const send = $('twenty-send');
      if (send) send.disabled = thinking;
    }
    const log = $('twenty-log');
    if (log) log.innerHTML = logHtml();
    const micBtn = $('twenty-mic');
    if (micBtn) micBtn.disabled = thinking || !g;
    paintMic();
  }

  function doneHtml() {
    const g = game || {};
    const o = g.over || {};
    const n = (g.turns || []).length;
    const qs = `${n} question${n === 1 ? '' : 's'}`;
    let head;
    if (g.mode === 'it') {
      const thing = esc(g.reveal?.secret || '?');
      head = o.how === 'found' ? `<b>you found it: ${thing}</b> · ${qs}`
        : o.how === 'out' ? `<b>twenty questions, and it stayed hidden: ${thing}</b>`
          : `<b>it was ${thing}</b> · you stopped after ${qs}`;
    } else {
      const lastGuess = [...(g.turns || [])].reverse().find((t) => t.guess);
      head = o.how === 'guessed' ? `<b>it found it: ${esc(lastGuess?.q || '?')}</b> · ${qs}`
        : o.how === 'out' ? '<b>twenty questions, and it did not find yours</b> · you win'
          : `<b>you stopped the game</b> · ${qs}`;
    }
    const kept = n ? ' it will remember this one.' : '';
    const proof = g.mode === 'it' ? `
      <p class="twenty-proof" id="twenty-proof"></p>
      <details class="twenty-how">
        <summary>check it yourself</summary>
        <p>the seal it showed you before your first question was the sha-256 of the salt, a colon, and what it chose:</p>
        <code class="twenty-code">${esc(g.reveal?.salt || '')}:${esc(g.reveal?.secret || '')}</code>
        <code class="twenty-code">${esc(g.seal || '')}</code>
      </details>` : '';
    return `
      <p class="chess-lead">${head}.${kept}</p>
      ${proof}
      <ol class="twenty-log" id="twenty-log">${logHtml()}</ol>
      <button type="button" id="twenty-again" class="create-go">play again</button>`;
  }
  function paintSeal() {
    const p = $('twenty-proof');
    if (!p || phase !== 'done') return;
    p.classList.toggle('ok', sealed === true);
    p.classList.toggle('bad', sealed === false);
    p.textContent = sealed === 'checking' ? 'opening the seal…'
      : sealed === true ? 'sealed before your first question ✓ — this page hashed what it chose with its salt and got the very seal it showed you at the start.'
        : sealed === false ? 'the seal does not match what it says it chose ✗'
          : 'this browser cannot check the seal here (it needs a secure page); the seal and the salt are below, to check it yourself.';
  }

  function wire() {
    for (const b of grid?.querySelectorAll('#twenty-mode .usage') || []) {
      b.addEventListener('click', () => {
        mode = b.dataset.v === 'you' ? 'you' : 'it';
        b.parentElement.querySelectorAll('.usage').forEach((x) => x.classList.toggle('on', x === b));
      });
    }
    $('twenty-go')?.addEventListener('click', begin);
    $('twenty-form')?.addEventListener('submit', (e) => { e.preventDefault(); ask($('twenty-q')?.value); });
    // an input method's Enter picks a candidate; it does not ask (main.js's
    // chat input keeps the same rule)
    $('twenty-q')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault(); });
    $('twenty-answers')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]');
      if (b && !b.disabled) answer(b.dataset.a);
    });
    $('twenty-mic')?.addEventListener('click', listen);
    $('twenty-stop')?.addEventListener('click', stop);
    $('twenty-again')?.addEventListener('click', () => { game = null; phase = 'setup'; render(); });
  }

  return { open, close, isOpen: () => !!grid };
}
