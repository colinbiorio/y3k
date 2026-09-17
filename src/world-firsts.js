// THE LIST OF FIRSTS, at the top of the world.
//
// Three sizes, one press apart. FOLDED is a pill you can read from across the
// room — how many, and the next one. OPEN is the next two, which is the whole
// point: not a to-do list, two things to reach for. WIDE is everything reached
// to date in the order it was reached, the two, what comes after, and the
// horizon. It remembers which you chose, because a person who folded it did
// not want it back at full size on the next poll.
//
// It never computes a milestone. The server hands it `firsts` on every poll
// (src/milestones.js, pure predicates over the settlement) and this only draws
// what it is handed — so a newly reached first shows up on the next poll with
// no event, no flag and nothing here to get out of step.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'y3k.world.firsts';

export function createFirsts() {
  let root = null, last = null, size = 'open', seen = new Set();
  try { size = localStorage.getItem(KEY) || 'open'; } catch { /* default stands */ }
  if (!['folded', 'open', 'wide'].includes(size)) size = 'open';

  function mount(parent) {
    root = document.createElement('div');
    root.className = 'firsts';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Milestones');
    parent.appendChild(root);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-size]'); if (!b) return;
      size = b.dataset.size;
      try { localStorage.setItem(KEY, size); } catch { /* fine */ }
      paint();
    });
    paint();
  }

  const row = (m, cls) =>
    `<li class="firsts-row ${cls}"><span class="firsts-mark"></span>` +
    `<span class="firsts-text"><span class="firsts-label">${esc(m.label)}</span>` +
    `<span class="firsts-note">${esc(m.note)}</span></span></li>`;

  function paint() {
    if (!root) return;
    root.dataset.size = size;
    if (!last) { root.innerHTML = ''; root.hidden = true; return; }
    root.hidden = false;
    const { done = [], next = [], later = [], horizon = [], total = 0 } = last;
    const count = `${done.length}<span class="firsts-of">/${total}</span>`;
    const nextOne = next[0] ? esc(next[0].label) : 'all of them';
    if (size === 'folded') {
      root.innerHTML =
        `<button type="button" class="firsts-pill" data-size="open" title="Milestones — open">` +
        `<span class="firsts-count">${count}</span><span class="firsts-sep">·</span>` +
        `<span class="firsts-nextword">next</span> <span class="firsts-nextlabel">${nextOne}</span></button>`;
      return;
    }
    const head =
      `<div class="firsts-head">` +
      `<button type="button" class="firsts-fold" data-size="folded" aria-label="Fold" title="Fold">–</button>` +
      `<span class="firsts-title">firsts <span class="firsts-count">${count}</span></span>` +
      (size === 'wide'
        ? `<button type="button" class="firsts-more" data-size="open" title="Just the next two">less</button>`
        : `<button type="button" class="firsts-more" data-size="wide" title="Everything to date">all</button>`) +
      `</div>`;
    const nextList = `<ul class="firsts-list firsts-next">${next.map((m) => row(m, 'is-next' + (seen.has(m.key) ? '' : ' is-fresh'))).join('')}</ul>`;
    if (size === 'open') { root.innerHTML = head + nextList; next.forEach((m) => seen.add(m.key)); return; }
    // WIDE: to date (in the order reached), then the two, then later, then the horizon
    root.innerHTML = head +
      (done.length ? `<div class="firsts-sect">to date</div><ul class="firsts-list">${done.map((m) => row(m, 'is-done')).join('')}</ul>` : '') +
      `<div class="firsts-sect">next</div>` + nextList +
      (later.length ? `<div class="firsts-sect">after that</div><ul class="firsts-list">${later.map((m) => row(m, 'is-later')).join('')}</ul>` : '') +
      (horizon.length ? `<div class="firsts-sect">the horizon</div><ul class="firsts-list">${horizon.map((m) => row(m, 'is-horizon')).join('')}</ul>` : '');
    next.forEach((m) => seen.add(m.key));
  }

  // Handed the server's `firsts` on every poll. A milestone newly reached since
  // the last paint gets a moment of light, then settles into the list.
  function update(firsts) {
    const prevDone = new Set((last?.done || []).map((m) => m.key));
    last = firsts || null;
    paint();
    if (!root || !last) return;
    for (const m of last.done) {
      if (prevDone.size && !prevDone.has(m.key)) {
        root.classList.add('firsts-lit');
        setTimeout(() => root?.classList.remove('firsts-lit'), 1800);
        break;
      }
    }
  }

  return { mount, update, get size() { return size; } };
}
