// ORION, DOING IT FROM THE HOME SCREEN (Colin, 18 Nov 2026: "it would be
// cool if orion could actually do stuff straight from the home screen too").
//
// A line for kode said outside the room, with the yes main.js askKode asks
// for every time, runs in kode without the trip there (code-view.js
// runFromSite: the conversation picked up where it was, in the mode chosen
// there). This card stands over the chat bar while it works: what it is
// doing and for how long; the coder's own question, when it has one, to
// allow or decline this once (anything else it asks is answered in kode);
// and when the turn ends, how it went, handed to the presence to say in its
// own voice (main.js sayOutcome). While it works, "stop" stops the turn as
// Esc in the room does (CODE.md line 5: visible, stoppable). "open kode" is
// always on it: the room shows the same conversation. Inside the room the
// card is not drawn.

// 0:07, 1:42, 1:03:09 (code-view.js clockOf, without loading the room)
export function clock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

// What the card says for one of runFromSite's snapshots:
//   { tone: run · ask · done · stopped · failed, head, line, answer: [allow, decline] labels or null }
export function cardText(snap, now = Date.now()) {
  if (!snap) return { tone: 'run', head: 'kode', line: 'Sending it…', answer: null };
  const where = snap.project ? ` in ${snap.project}` : '';
  const d = snap.done;
  if (d) {
    const head = d.outcome === 'done' ? `Done${where}` : d.outcome === 'stopped' ? `Stopped${where}` : `It did not finish${where}`;
    return { tone: d.outcome === 'done' ? 'done' : d.outcome === 'stopped' ? 'stopped' : 'failed', head, line: d.did || '', answer: null };
  }
  const q = snap.request;
  if (q) {
    if (q.kind === 'permission') return { tone: 'ask', head: `kode asks to use ${q.title || q.tool || 'a tool'}`, line: 'Allow it this once?', answer: ['Allow', 'Decline'] };
    if (q.kind === 'plan') return { tone: 'ask', head: 'kode has a plan ready', line: 'Go ahead with it, or keep planning?', answer: ['Go ahead', 'Keep planning'] };
    return { tone: 'ask', head: 'kode has a question for you', line: 'Open kode to answer it.', answer: null };
  }
  const at = Number(snap.at) || now;
  return { tone: 'run', head: `kode${where}`, line: `Working ${clock(now - at)}` + (snap.doing ? ` · ${snap.doing}` : ''), answer: null };
}

// The words the presence is handed when a turn ends: the coder's reply, as
// it would be said aloud (the code already out: code-view.js replyOf), else
// its first words back, else what happened; with where it was.
export function outcomeWords(done) {
  if (!done) return '';
  const where = done.project ? `In ${done.project}: ` : '';
  const said = String(done.reply || done.did || '').trim();
  if (said) return where + said;
  return done.outcome === 'done' ? `${where}it is done.` : done.outcome === 'stopped' ? `${where}it was stopped before it finished.` : `${where}it did not finish.`;
}

// The card itself. run(text, onTick), answer(sid, requestId, decision) and
// stop(sid) are kode's (social.kodeRun, kodeAnswer, kodeStop); openKode
// opens the room; onDone hears how it ended, once.
export function createHomeRun({ run, answer, stop, openKode, onDone, doc = globalThis.document, now = () => Date.now(), keepMs = 30000 }) {
  let el = null, snap = null, timer = 0, gone = 0, seq = 0, stopping = false;
  const $ = (cls) => el?.querySelector('.' + cls);
  const make = (tag, cls, kids = [], text = '') => {
    const n = doc.createElement(tag);
    n.className = cls;
    if (text) n.textContent = text;
    if (tag === 'button') n.type = 'button';
    for (const k of kids) n.appendChild(k);
    return n;
  };
  function build() {
    const dot = make('span', 'hr-dot');
    dot.setAttribute('aria-hidden', 'true');
    const shut = make('button', 'hr-close', [], '✕');
    shut.setAttribute('aria-label', 'Close');
    const no = make('button', 'hr-no'), yes = make('button', 'hr-yes'), halt = make('button', 'hr-stop', [], 'stop');
    no.hidden = yes.hidden = shut.hidden = true;
    el = make('div', 'home-run', [dot, make('span', 'hr-words', [make('span', 'hr-head'), make('span', 'hr-line')]),
      make('span', 'hr-acts', [no, yes, halt, make('button', 'hr-open', [], 'open kode'), shut])]);
    el.id = 'home-run';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    $('hr-open').addEventListener('click', () => openKode?.());
    $('hr-close').addEventListener('click', () => close());
    const reply = (decision) => async () => {
      const q = snap?.request;
      if (!q?.requestId) return;
      $('hr-yes').disabled = $('hr-no').disabled = true;
      const r = await answer?.(snap.sid, q.requestId, decision);
      if (!r?.ok) { $('hr-line').textContent = 'That answer did not go through. Open kode to answer it.'; $('hr-yes').disabled = $('hr-no').disabled = false; }
    };
    $('hr-yes').addEventListener('click', reply('allow'));
    $('hr-no').addEventListener('click', reply('deny'));
    $('hr-stop').addEventListener('click', async () => {
      if (!snap?.sid || snap.done) return;
      $('hr-stop').disabled = true;
      stopping = true;
      paint();
      const r = await stop?.(snap?.sid);
      if (!r?.ok && el) { stopping = false; $('hr-line').textContent = 'It could not be stopped from here. Open kode to stop it.'; $('hr-stop').disabled = false; }
    });
    doc.body.appendChild(el);
  }
  function paint() {
    if (!el) return;
    const c = cardText(snap, now());
    if (stopping && !snap?.done) c.line = 'Stopping…';   // until the turn says it has
    el.dataset.tone = c.tone;
    if ($('hr-head').textContent !== c.head) $('hr-head').textContent = c.head;
    if ($('hr-line').textContent !== c.line) $('hr-line').textContent = c.line;
    const yes = $('hr-yes'), no = $('hr-no');
    yes.hidden = no.hidden = !c.answer;
    if (c.answer) { yes.textContent = c.answer[0]; no.textContent = c.answer[1]; yes.disabled = no.disabled = false; }
    $('hr-close').hidden = !snap?.done;
    $('hr-stop').hidden = !snap?.sid || !!snap.done;
  }
  function close() {
    clearInterval(timer); timer = 0; clearTimeout(gone); gone = 0;
    el?.remove(); el = null; snap = null; stopping = false;
  }
  // → kode's answer: { ok, sid, project } or { ok: false, why }. Not ok, the
  // card is taken down and the caller goes on (main.js: into kode, as before).
  async function start(text) {
    close();
    const mine = ++seq;
    build();
    paint();
    timer = setInterval(() => { if (snap && !snap.done && !snap.request) paint(); }, 1000);
    let ended = false;
    const r = await run(text, (s) => {
      if (mine !== seq || ended) return;
      snap = s;
      paint();
      if (s.done) {
        ended = true;
        clearInterval(timer); timer = 0;
        gone = setTimeout(() => { if (mine === seq) close(); }, keepMs);
        try { onDone?.(s.done); } catch { /* the presence's own trouble */ }
      }
    }).catch(() => ({ ok: false, why: 'refused' }));
    if (!r?.ok && mine === seq) close();
    return r || { ok: false, why: 'refused' };
  }
  return { start, close, get open() { return !!el; }, _snap: () => snap };
}
