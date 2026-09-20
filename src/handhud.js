// ============================================================================
// handhud.js — WHAT THE MACHINE THINKS YOUR HANDS ARE DOING.
//
// Colin tests with his own hands, which is the fastest loop this project has —
// but until now, when a gesture failed he could not see WHY. Was the finger not
// read as extended, or was it read fine and the threshold not crossed? Was the
// hand lost entirely? Was the gesture fired and then thrown away by something
// downstream? Three different problems with three different fixes, and from the
// outside all of them look identical: you do the thing and nothing happens.
//
// THE DESIGN RULE HERE IS ONE SENTENCE: do not explain why a gesture did not
// fire — show every gesture's own number beside its own line. A sentence is a
// guess about what you wanted; a bar sitting just short of its threshold is the
// answer. So every row is a quantity, its threshold, and which side it is on.
//
// It is also a record of what DID fire, because half of reading a gesture
// system is telling "it did nothing" apart from "it did something I did not
// want", and those feel the same in the moment.
//
// Off, it costs nothing: no element, no listener, no frame. On, it is one
// requestAnimationFrame reading an object handview already keeps.
// ============================================================================

const KEY = 'y3k.handhud';
const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);

// A bar with a line on it. `v` against `limit`, where `under` says which side
// counts as satisfied — because some of these want to be small (a pinch closes)
// and some want to be large, and a reader should not have to remember which.
function bar(v, limit, under, width = 84) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '<i class="hh-bar"></i>';
  const span = Math.max(limit * 2, 0.001);
  const at = Math.max(0, Math.min(1, v / span));
  const line = Math.max(0, Math.min(1, limit / span));
  const ok = under ? v < limit : v >= limit;
  return `<i class="hh-bar${ok ? ' hh-on' : ''}" style="--w:${width}px">`
    + `<b style="width:${(at * 100).toFixed(1)}%"></b>`
    + `<u style="left:${(line * 100).toFixed(1)}%"></u></i>`;
}

const pip = (on) => `<s class="hh-pip${on ? ' hh-on' : ''}"></s>`;
const yn = (v) => (v === null ? '<span class="hh-dim">–</span>' : v ? '<span class="hh-yes">yes</span>' : '<span class="hh-no">no</span>');

export function createHandHud({ handView, perceive } = {}) {
  let box = null, raf = 0, on = false;
  let lastT = 0, hz = 0, frames = 0, from = 0;

  function build() {
    if (box) return;
    box = document.createElement('div');
    box.id = 'hand-hud';
    box.setAttribute('aria-hidden', 'true');
    document.body.appendChild(box);
  }

  function hand(d, i, lim) {
    if (!d || !d.here) return `<div class="hh-hand hh-gone"><b>hand ${i + 1}</b><span class="hh-dim">not seen</span></div>`;
    // WHICH FINGERS, as four pips — because "how many" is the thing the
    // gestures actually count, and a number alone hides a finger flickering.
    const pips = d.up.map(pip).join('') + `<span class="hh-thumb">${pip(d.thumb)}</span>`;
    return `<div class="hh-hand">
      <b>${d.handedness || 'hand ' + (i + 1)}</b>
      <div class="hh-row"><span>fingers</span>${pips}<em>${d.n}</em></div>
      <div class="hh-row"><span>scroll</span>${yn(d.mayScroll)}<em class="hh-dim">needs exactly ${lim.SCROLL_FINGERS}</em></div>
      <div class="hh-row"><span>pinch</span>${bar(d.pinch, lim.PINCH_ON, true)}<em>${d.pinch ?? '–'}</em></div>
      <div class="hh-row"><span>facing</span>${d.palm === null ? '<span class="hh-dim">–</span>' : (d.palm ? '<span class="hh-yes">palm</span>' : '<span class="hh-no">back</span>')}<em class="hh-dim">orb turn flips this</em></div>
      <div class="hh-row"><span>pointing</span>${d.act < 0 ? '<span class="hh-no">nothing</span>' : `<span class="hh-yes">${['thumb','index','middle','ring','little'][d.act]}</span>`}</div>
      <div class="hh-row"><span>clutch</span>${
        !d.clutchOn ? '<span class="hh-dim">off — everything is live</span>'
        : d.clutched ? '<span class="hh-yes">open</span>'
        : `<span class="hh-no">the other hand is not open</span>`}</div>
      <div class="hh-row"><span>dial</span>${d.dial === null
        ? '<span class="hh-dim">make a fist to take hold</span>'
        : `<em>${d.dial > 0 ? '+' : ''}${d.dial}&deg;</em>`}</div>
      <div class="hh-row"><span>reach</span><em>${d.span ?? '–'}</em>
        <span class="hh-dim">wrist to knuckle — bigger is nearer</span></div>
      <div class="hh-row"><span>state</span>${[
        d.tailed ? '<span class="hh-warn">palm tail</span>' : '',
        d.holding ? '<span class="hh-yes">pressing</span>' : '',
        d.pinched ? '<span class="hh-yes">holding the orb</span>' : '',
        d.turning ? `<span class="hh-${d.turning === 'armed' ? 'yes' : 'dim'}">turn ${d.turning}</span>` : '',
        d.fresh ? '' : '<span class="hh-dim">stale frame</span>',
      ].filter(Boolean).join(' ') || '<span class="hh-dim">idle</span>'}</div>
    </div>`;
  }

  function paint() {
    const info = handView?.debug?.();
    if (!info) return;
    const lim = info.limits;
    const two = info.two || {};
    const det = perceive?.detail?.() || {};
    const both = info.hands.filter((d) => d.here).length === 2;
    box.innerHTML = `
      <div class="hh-top">hands <b>${info.hands.filter((d) => d.here).length}</b>
        · loop <b>${hz || '–'}</b>/s · tracker <b>${det.hz ?? '–'}</b>/s</div>
      <div class="hh-hands">${info.hands.map((d, i) => hand(d, i, lim)).join('')}</div>
      <div class="hh-two${both ? '' : ' hh-gone'}">
        <b>two hands</b>
        <div class="hh-row"><span>offered</span><em>${(two.count || [0, 0]).join(' &amp; ')}</em>
          <span class="hh-dim">→ ${Math.min(...(two.count || [0, 0])) || 0} colours</span></div>
        <div class="hh-row"><span>gap</span>${bar(two.gap, two.TOUCH ?? 0.42, true)}<em>${two.gap ?? '–'}</em></div>
        <div class="hh-row"><span>size</span><em>${two.swell ?? '–'}</em>
          <span class="hh-dim">needs both hands open</span></div>
        <div class="hh-row"><span>form</span><em>${two.look ?? '–'}</em>
          <span class="hh-dim">${two.at >= 0 ? (two.at + 1) + ' of ' + two.looks : ''}</span></div>
      </div>
      <div class="hh-log"><b>fired</b>${
        info.fired.length
          ? info.fired.map((f) => `<span>${f.what}</span>`).join('')
          : '<span class="hh-dim">nothing yet</span>'}</div>`;
  }

  function tick(now) {
    if (!on) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    frames += 1;
    if (!from) from = now;
    if (now - from > 500) { hz = Math.round(frames * 1000 / (now - from)); frames = 0; from = now; }
    // Twice a second is plenty to read and a tenth of the work of every frame.
    if (now - lastT < 120) return;
    lastT = now;
    try { paint(); } catch { /* an instrument must never take the room down */ }
  }

  return {
    start() {
      if (on) return;
      build();
      on = true; from = 0; frames = 0;
      try { localStorage.setItem(KEY, '1'); } catch { /* private */ }
      box.classList.add('on');
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      on = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      box?.classList.remove('on');
      try { localStorage.removeItem(KEY); } catch { /* private */ }
    },
    toggle() { return on ? (this.stop(), false) : (this.start(), true); },
    running() { return on; },
    // Remembered, because an instrument you have to switch on every reload is
    // one you stop using by the third day.
    restore() {
      let want = false;
      try { want = localStorage.getItem(KEY) === '1'; } catch { /* private */ }
      if (typeof location !== 'undefined' && /(?:\?|&)hands\b/.test(location.search)) want = true;
      if (want) this.start();
      return want;
    },
  };
}
