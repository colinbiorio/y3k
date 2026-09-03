// Mounts the liquid mercury SDF system (mercury-buttons.js) onto every app
// button. Each button becomes its own body of liquid with its own particle
// physics: the cursor slices INTO the metal (and it heals), a click clumps,
// pops into droplets, and reforms. Presets cover the shapes the shader knows
// analytically; everything else rides the raster→SDF pipeline from the very
// svg/img glyph already inside the button (which the CSS then hides).
import { mount, renderNow } from './mercury-buttons.js';

// The chat surfaces wear the room's own material: the walls' cool-graphite
// albedo (rgb v, v+2, v+6 — body.js panelTexture) under fine vertical brushed
// grain (body.js brushedRoughnessTexture), with the room's top-lit falloff —
// but NO machined seams. Rendered once to a canvas, applied as CSS background.
function brushedWallSkin() {
  const w = 512, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgb(52,55,62)');
  grad.addColorStop(0.45, 'rgb(44,47,53)');
  grad.addColorStop(1, 'rgb(33,35,40)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x++) {
    const v = 40 + Math.floor(Math.random() * 26);
    g.strokeStyle = `rgb(${v},${v + 2},${v + 6})`;
    g.globalAlpha = 0.10 + Math.random() * 0.22;
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke();
  }
  g.globalAlpha = 1;
  return c.toDataURL('image/png');
}

// Frosted glass needs grain — a pure blur reads as a smudge, not as glass.
// One tileable noise sheet, published as --frost-grain for every frosted
// surface to share (menu screen, sheets, mind windows, the budget panel).
function frostGrain(N = 128, alpha = 26) {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = 118 + Math.random() * 74;           // mid-grey: overlay-blends both ways
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = alpha;                  // whisper-faint at the default
  }
  g.putImageData(img, 0, 0);
  return `url(${c.toDataURL('image/png')})`;
}

// ===========================================================================
// AUTOMATIC LIQUID BORDERS
// ---------------------------------------------------------------------------
// Nothing in the app "draws a line" any more: anything that would carry a
// border gets a real shader ring that flows, blobs toward the cursor, and
// takes the blade. New nodes (feed cards, search results, settings rows)
// are ringed as they appear — the observer below keeps it uniform without
// anyone having to remember.
// ===========================================================================
const RINGED = new WeakMap();      // element → mount handle (no double rings)
let ringSeq = 0, ringCount = 0;    // WeakMap has no .size — count by hand
const RING_CAP = 120;              // sanity bound; the viewport cull does the rest.
                                   // A full feed is FEED_PAGE (50) cards and the
                                   // always-mounted chrome is ~30, so 80 ran out
                                   // mid-feed and the cards past it fell back to
                                   // a dark CSS hairline — visibly unlike their
                                   // neighbours, which is what gave the AI posts
                                   // a darker edge than y3klay's.

// Box surfaces: ring the element itself.
const RING_BOX = [
  ['.post-card', 4], ['.presence-card', 4], ['.mind-win', 4], ['#cam-popup', 4],
  ['.pfp-wrap', 4],                 // profile pictures: a circular liquid rim
  ['.login-field', 3], ['.seg', 3], ['.usage', 3], ['.compose-post', 3], ['.oauth-btn', 3],
  ['.compose-photo', 3], ['.tend-btn', 3], ['.follow-btn', 3], ['.add-plus', 3],
  ['.round', 3], ['.create-go', 3], ['.mood-tag', 3], ['.usage-card', 4],
  ['.ai-out', 3],   // the presence's own words, framed in mercury
  ['.ident-card', 4],  // choosing who speaks: each option wears the border by default
  ['.chess-card', 4], ['.chess-board', 4],  // the seat and the board itself
  ['.invite-card', 3],  // an invitation from the presence wears the metal too
  ['.ask-brief', 3],   // what the ai will do, framed like any other box

];
// Form controls can't host a canvas (replaced elements) — ring them from the
// parent, anchored over the control.
const RING_INPUT = [
  ['#home-search', 3], ['#compose-text', 3], ['.comment-form input', 3], ['#chess-say-in', 3],
  ['#settings select', 3], ['.create-sheet select', 3],
];

function ring(host, opts) {
  const key = opts.trackTarget || host;
  if (RINGED.has(key) || ringCount >= RING_CAP) return;
  // Thin rings need STIFF liquid: when the warp is as wide as the ring, it
  // tears the border into dashes (the same failure the chat ring had).
  // Borders hold STILL: the flowing belongs to the buttons and marks. A
  // border that ripples pulls the eye away from the thing it frames.
  const h = mount(host, {
    shape: 'frame', track: true, interactive: false, viscosity: 3.6, still: true,
    seed: (ringSeq++ * 13.7) % 100, ...opts,
  });
  if (h) {
    RINGED.set(key, h); ringCount++;
    // the class silences the CSS hairline — on BOTH the tracked control and
    // its host: an input's ring is keyed to the input, but the ::after
    // hairline lives on its PARENT, which kept drawing under the liquid (the
    // double line around the search bar and every field)
    if (key.classList) key.classList.add('liquid-ringed');
    if (host.classList) host.classList.add('liquid-ringed');
  }
}

function ringAll(root = document) {
  // RECOUNT FROM THE DOM, do not trust the running tally.
  //
  // ringCount was incremented on mount and decremented when the observer saw a
  // ringed node removed, and those two did not stay in step: the feed rebuilds
  // every card on each render, so the tally climbed with each visit and never
  // fully came back. Once it passed RING_CAP nothing new could ever ring again
  // — measured live at 34 rings actually alive in the document while the budget
  // believed it was full. That is what left later feed cards with no rim and a
  // dark CSS hairline in its place, and why it looked like AI posts specifically
  // (they are simply the ones rendered after the budget ran dry).
  //
  // A leaked budget is unfixable from the inside, so stop keeping one. The DOM
  // already knows exactly how many rings exist; ask it once per sweep. Any
  // missed reap now self-heals on the next sweep instead of accumulating.
  ringCount = document.querySelectorAll('.liquid-ringed').length;
  // Seeds are DETERMINISTIC — selector plus position, not a running counter.
  // Screens rebuild their DOM on interaction, and a counter seed gave every
  // rebuilt card a fresh liquid pattern: the border visibly changed texture
  // on every like, keystroke and move. Same card, same seed, same metal —
  // a rebuild is now indistinguishable from stillness.
  let selIdx = 0;
  for (const [sel, framePx] of RING_BOX) {
    selIdx++;
    let i = 0;
    for (const el of root.querySelectorAll(sel)) ring(el, { framePx, seed: (selIdx * 31.7 + i++ * 13.7) % 100 });
  }
  for (const [sel, framePx] of RING_INPUT) {
    selIdx++;
    let i = 0;
    for (const el of root.querySelectorAll(sel)) {
      if (el.parentElement) ring(el.parentElement, { trackTarget: el, framePx, seed: (selIdx * 31.7 + i++ * 13.7) % 100 });
    }
  }
  // Dividers become liquid too: a hairline element the 'line' shape tracks.
  for (const el of root.querySelectorAll('.sec, .sheet-head')) {
    if (el.querySelector(':scope > .liq-div')) continue;
    const d = document.createElement('i');
    d.className = 'liq-div';
    el.appendChild(d);
    ring(el, { trackTarget: d, shape: 'line', framePx: 3 });
  }
}

// Keep it uniform as the app builds screens.
function watchForBorders() {
  let queued = false;
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.removedNodes) {
        if (n.nodeType !== 1) continue;
        for (const el of [n, ...n.querySelectorAll('.liquid-ringed')]) {
          const h = RINGED.get(el);
          if (h) { h.destroy(); RINGED.delete(el); ringCount--; }
        }
      }
    }
    // TEXT DOES NOT NEED RINGING. The world screen rewrites labels every
    // frame (positions, distances, the status line), and every one of those
    // was waking a full sweep: ~1,460 in 26 seconds, each running a dozen
    // querySelectorAll passes over the document. Only an ELEMENT can ever
    // need a border, so only an element is worth waking for.
    let sawElement = false;
    for (const r of records) {
      for (const n of r.addedNodes) if (n.nodeType === 1) { sawElement = true; break; }
      if (sawElement) break;
    }
    if (!sawElement) return;
    if (queued) return;
    queued = true;                       // one sweep per frame, not per node
    // The latch MUST be released by something that runs in a hidden tab.
    // requestAnimationFrame does not: background the page (or let the OS
    // throttle it) while a mutation is in flight and the callback never fires,
    // so `queued` stays true forever and no element added from that moment on
    // can ever be given a rim again. That is a permanent, silent failure — new
    // feed cards simply arrive bare and fall back to a dark CSS hairline, which
    // is exactly what it looks like from the outside: borders that are correct
    // on some posts and wrong on others for no visible reason.
    // A timer is throttled but never stopped, so it always frees the latch.
    // Whichever fires first does the sweep; the other finds the latch open and
    // does nothing.
    // ringAll mounts any new rings; renderNow draws them in the SAME frame,
    // before this frame paints — a rebuilt card never shows a blank border.
    const sweep = () => { if (!queued) return; queued = false; ringAll(); renderNow(); };
    requestAnimationFrame(sweep);
    setTimeout(sweep, 250);
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

export function mountAppMercury() {
  document.documentElement.style.setProperty('--frost-grain', frostGrain());
  // A second, stronger grain for LARGE panes. The one above is tuned for chips
  // and cards, where alpha 26 is exactly right; stretched over a 940px sheet it
  // disappears and the surface reads as a plain gradient. This is the same
  // per-pixel white noise — which matters, because per-pixel noise has NO
  // low-frequency structure and therefore cannot blotch. An SVG feTurbulence
  // grain was tried here first and did blotch: its extra octaves are large-scale
  // by definition, and a repeating tile of them shows its own period as soft
  // squares across a big flat surface. A wider tile also pushes the repeat past
  // where the eye picks it up.
  document.documentElement.style.setProperty('--frost-grain-xl', frostGrain(256, 60));
  // The liquid sizes itself in JS, which no media query can reach — so the
  // breakpoint has to live here too, or a phone gets desktop-sized marks
  // sitting on top of each other.
  const narrow = window.innerWidth < 560;
  // S is the DESIGN size now, not the final one. It used to fold the phone's
  // 0.72 step in here, which would double-apply against the continuous scale
  // below; uiScale() reapplies exactly that 0.72 at phone widths instead.
  const S = (n) => n;
  // Touch devices get the cheaper treatment throughout (see mercury-buttons).
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
  // .chat-menu hides by OPACITY, not display — it keeps a real layout box, so
  // its glyphs kept rendering liquid nobody could see. Gated on touch only:
  // desktop reveals the menu on hover, and visibleWhen is only re-sampled every
  // 8th frame, which would make that reveal feel late. A phone has no hover —
  // the menu opens by tap or by typing — so there the gate is exact.
  const chatOpen = () => {
    const c = document.getElementById('chat');
    return !!c && (c.classList.contains('open')
      || document.body.classList.contains('chat-typing'));
  };
  const whenChat = coarse ? chatOpen : null;
  const $ = (id) => document.getElementById(id);
  const svgOf = (el) => (el ? el.querySelector('svg') : null);
  const plans = [
    ['nav-settings', (el) => ({ svgEl: svgOf(el), size: S(77) })],   // matches the rail's other glyphs
    ['nav-profile', () => ({ shape: 'blobs', size: S(103) })],
    ['nav-feed', () => ({ shape: 'bars', size: S(77) })],
    // One size for the whole rail — nine glyphs now, and a featured-size post
    // read as misalignment once go-live and games flanked it.
    ['nav-post', () => ({ shape: 'plus', size: S(77) })],
    ['nav-live', () => ({ shape: 'broadcast', size: S(77) })],
    ['nav-games', (el) => ({ svgEl: svgOf(el), size: S(77) })],
    ['nav-world', (el) => ({ svgEl: svgOf(el), size: S(77) })],
    ['nav-search', (el) => ({ svgEl: svgOf(el), size: S(77), thicken: 1.35 })],
    ['nav-orb', () => ({ shape: 'ring', size: S(77) })],
    ['nav-collapse', (el) => ({ svgEl: svgOf(el), size: S(26), viscosity: 2.2 })],
    ['nav-collapse-right', (el) => ({ svgEl: svgOf(el), size: S(26), viscosity: 2.2 })],
    ['nav-collapse-top', (el) => ({ svgEl: svgOf(el), size: S(26), viscosity: 2.2 })],
    ['nav-collapse-bottom', (el) => ({ svgEl: svgOf(el), size: S(26), viscosity: 2.2 })],
    // The composer's add-media plus. It has to be a real mount, not just the
    // SVG: `.mercury` hides its own source svg on the assumption a canvas has
    // taken over, so an unmounted one renders at 0x0 and simply is not there.
    ['media-plus', (el) => ({ svgEl: svgOf(el), size: 34 })],
    // Back arrows and closes. These were a character in a font and an inline
    // svg, which put the two most-clicked controls on every sheet outside the
    // material the rest of the app is made of.
    ['compose-back', (el) => ({ svgEl: svgOf(el), size: 21, viscosity: 2.2 })],
    ['compose-close', (el) => ({ svgEl: svgOf(el), size: 19, viscosity: 2.2 })],
    ['pedit-close', (el) => ({ svgEl: svgOf(el), size: 19, viscosity: 2.2 })],
    ['settings-close', (el) => ({ svgEl: svgOf(el), size: 19, viscosity: 2.2 })],
    ['media-clear', (el) => ({ svgEl: svgOf(el), size: 16, viscosity: 2.2 })],
    // stiffer liquid on the small-featured glyphs: the camera wedge melts past
    // recognition at full waviness
    ['broadcast', (el) => ({ svgEl: el.querySelector('.bc-camera'), size: S(77), viscosity: 1.7 })],
    ['chat-voice', (el) => ({ svgEl: svgOf(el), size: S(44), visibleWhen: whenChat })],
    ['chat-camera', (el) => ({ svgEl: svgOf(el), size: S(44), visibleWhen: whenChat })],
    ['chat-dance', (el) => ({ svgEl: svgOf(el), size: S(44), visibleWhen: whenChat })],
    // the on-air ring: poured only while the dot is actually shown
    ['rec-dot', (el) => ({ svgEl: svgOf(el), size: S(16), viscosity: 2.2,
      visibleWhen: () => !!document.querySelector('#chat-voice.active, #chat-camera.active') })],
    // aspect-aware, so `size` is the mark's HEIGHT: 98 tall × 1.7 aspect = a
    // ~167px-wide mark
    // On a phone the mark lives in the band between the wordmark and the orb,
    // which is only ~125px tall — so it is sized to that band, not scaled from
    // the desktop figure.
    // ss: 2, not 1.8. These four delicate marks DO want extra sampling, but the
  // ratio has to be a whole number or the browser resamples them fractionally
  // on the way to the screen and the beat pattern shows up as stair-stepping —
  // worse than not oversampling at all. 2 downsamples as a clean box filter.
  ['brain-toggle', (el) => ({ imageEl: el.querySelector('img'), size: narrow ? 27 : 38, aspect: 1663 / 975, viscosity: 1.8, thicken: 1.5, rim: 0.03, ss: 2, visibleWhen: whenChat })],
  ];
  let mounted = 0;
  const scalable = [];   // { h, base } — everything that shrinks with the window
  for (let i = 0; i < plans.length; i++) {
    const [id, plan] = plans[i];
    const el = $(id);
    if (!el) continue;
    // deterministic per-button seed: unique identity, stable across loads
    const cfg = { ...plan(el), seed: (i + 1) * 7.31 };
    const h = mount(el, cfg);
    if (!h) return false; // no WebGL2 → the caller falls back wholesale
    if (h.setSize && cfg.size) scalable.push({ h, base: cfg.size });
    mounted++;
  }

  // CHROME THAT SHRINKS WITH THE WINDOW.
  //
  // The rail used to have exactly two sizes — a breakpoint at 560px and nothing
  // in between — so dragging a desktop window narrow left the glyphs at full
  // size while everything around them got smaller. They scale continuously now.
  //
  // Two regimes, each scaling DOWN from its own tuned reference and never up,
  // so the sizes that were dialled in by eye stay the ceiling: at 1180x860 and
  // at 375x812 this computes to exactly what those layouts already used, and
  // only the sizes BETWEEN and BELOW them change.
  const uiScale = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const phone = w < 560;
    const fit = phone ? Math.min(w / 375, h / 760) : Math.min(w / 1100, h / 800);
    // Phones never got the 2.2x rail: marks mount at the big desktop base, so
    // the phone factor folds the old 39px reference back in (0.72 * 39/86).
    const tuned = phone ? 0.33 : 1;      // what that layout was drawn at
    return tuned * Math.max(0.62, Math.min(1, fit));
  };
  let lastScale = 0;
  function fitChrome() {
    const k = uiScale();
    if (Math.abs(k - lastScale) < 0.005) return;   // ignore sub-pixel churn
    lastScale = k;
    for (const { h, base } of scalable) h.setSize(base * k);
  }
  fitChrome();
  window.addEventListener('resize', fitChrome);
  if (mounted) {
    // THE OVAL. While the bottom bar is folded, the row is housed in a frosted
    // stadium (CSS ::before on the menu) wearing the house's poured ring. When
    // the bar opens, both fade (CSS) and the row becomes the bar's own contents
    // — the bar is the surface then, and the frame's border the only line.
    const menuEl = document.querySelector('#chat .chat-menu');
    if (menuEl) ring(menuEl, { framePx: 3, seed: 91.7 });
    // liquid frames: thin mercury rings that hug live elements through every
    // size state; they flow + take the blade but never clump/pop (not buttons).
    // Thin rings shred if the liquid is loose — they run stiff (viscosity).
    // (The text box carries NO ring of its own — the pill's border is the one.)
    const frame = (el, seed, framePx = 6, visibleWhen = null) => el && mount(el, { shape: 'frame', size: 60, track: true, interactive: false, viscosity: 2.2, seed, framePx, visibleWhen });
    frame(document.querySelector('#chat .chat-box'), 47.3, 3, whenChat);  // around "say something" — hairline (hover only)
    frame(document.getElementById('chat-upload'), 63.9, 3, whenChat);     // around the + — hairline
    // ...and the + itself is metal
    const up = document.getElementById('chat-upload');
    if (up) mount(up, { shape: 'plus', size: 15, viscosity: 1.3, seed: 58.1, visibleWhen: whenChat });
    // THE WORDMARK: cast in the same metal. The png is only the shape source —
    // stiff liquid (it's type: it should breathe, not wobble) and no clump/pop.
    const brand = document.getElementById('home-brand');
    const brandImg = document.getElementById('home-brand-img');
    if (brand && brandImg) {
      const brandBase = brand.clientHeight || 84;
      const brandH = mount(brand, {
        imageEl: brandImg, aspect: 2048 / 699, size: brandBase,   // scaled with the window below
        // cursive strokes are hairlines: they need body to read as poured
        // metal, a near-frozen silhouette (a warp as wide as the stroke tears
        // the letters apart — type doesn't distort), and extra sampling for
        // the fine curves. The reflections still crawl: that's the life.
        thicken: 1.7, rim: 0.022, flowSpeed: 0.12, viscosity: 3,
        ss: 2,
        // On a phone it holds still: it was the largest animated canvas on the
        // screen and it barely moves anyway (flowSpeed 0.12). Frozen means it
        // renders once and never again, so the full 1.8x supersampling above
        // costs one frame at load and nothing after — the script stays crisp.
        still: coarse,
        // THE MEDALLION (Colin's ask): the wordmark is fully interactive again
        // — hover is the normal liquid — and a click-drag SPINS it as a 3D
        // plaque: inertia on release, then it rights itself to face the room.
        // bevel 1.5 = bubblier than geometric: beadier curvature at rest, and
        // the slab thickness + rounded side wall show when it turns.
        interactive: true, spin3D: true, bevel: 1.5, seed: 12.9,
      });
      // The wordmark scales with the window like every other mark. Its size was
      // read from clientHeight ONCE at mount — the old comment claimed CSS kept
      // it responsive, but nothing ever re-read it, so it alone stayed full size
      // while the rail shrank around it.
      if (brandH && brandH.setSize) scalable.push({ h: brandH, base: brandBase });
    }
    // ---- the same liquid edge on every major surface --------------------
    // Sheets live inside a full-screen .modal, so the ring mounts on the
    // MODAL and tracks the sheet: a .sheet has overflow:auto, which would
    // clip the liquid (and spawn scrollbars) if the canvas lived inside it.
    const sheetFrame = (modalSel, seed) => {
      const modal = document.querySelector(modalSel);
      const sheet = modal && modal.querySelector('.sheet');
      if (!modal || !sheet) return;
      mount(modal, {
        shape: 'frame', track: true, trackTarget: sheet, interactive: false,
        viscosity: 2.2, framePx: 5, seed,
      });
    };
    sheetFrame('#settings', 21.4);          // settings
    sheetFrame('#compose-modal', 33.8);     // the post screen
    sheetFrame('#golive-modal', 45.2);      // go-live confirm
    sheetFrame('#profile-edit-modal', 57.6);// edit your profile

    // The login card (hides by OPACITY, so it needs the visibility gate).
    const loginEl = document.getElementById('login');
    const loginCard = document.querySelector('.login-card');
    if (loginEl && loginCard) {
      mount(loginCard, {
        shape: 'frame', track: true, interactive: false, viscosity: 2.2,
        framePx: 5, seed: 69.1, visibleWhen: () => !loginEl.classList.contains('gone'),
      });
    }
    // The budget popup wears the same liquid frame the old brain panel did —
    // rendered only while the popup is actually up.
    const budgetPop = document.getElementById('budget-pop');
    if (budgetPop) {
      mount(budgetPop, {
        shape: 'frame', track: true, interactive: false, viscosity: 2.2,
        framePx: 4, seed: 80.5,
        visibleWhen: () => budgetPop.classList.contains('show'),
      });
    }
    // The menu screen's header bar.
    const head = document.querySelector('.home-panel-head');
    if (head) {
      mount(head, {
        shape: 'frame', track: true, interactive: false, viscosity: 2.2,
        framePx: 4, seed: 92.3,
        // Only where the header is actually a control. Ringing it on every view
        // made a page title that reads "feed" look like an empty search box
        // spanning the whole column.
        visibleWhen: () => document.body.classList.contains('panel-open')
          && !!document.querySelector('#home-panel.mode-search'),
      });
    }

    // The mind's budget slider: a poured track AND a poured notch. The native
    // input keeps every bit of its behaviour (drag, arrow keys, a11y) — its
    // thumb just goes invisible and the liquid bead rides the same value.
    const slider = document.getElementById('tend-budget-slider');
    if (slider && slider.parentElement) {
      ring(slider.parentElement, { trackTarget: slider, shape: 'line', framePx: 7, viscosity: 1.7, still: true });
      const THUMB = 20;
      const notch = mount(slider.parentElement, {
        shape: 'disc', size: THUMB, viscosity: 1.6, interactive: false, seed: 44.2, still: true,
      });
      if (notch) {
        const bead = slider.parentElement.lastElementChild; // the canvas just mounted
        const place = () => {
          const min = +slider.min || 0, max = +slider.max || 100;
          const t = max > min ? (+slider.value - min) / (max - min) : 0;
          const w = slider.clientWidth || 0;
          bead.style.left = (slider.offsetLeft + THUMB / 2 + t * (w - THUMB)) + 'px';
          bead.style.top = (slider.offsetTop + slider.clientHeight / 2) + 'px';
        };
        slider.addEventListener('input', place);
        window.addEventListener('resize', place);
        requestAnimationFrame(place);
        // the value also moves from code (budget loads, syncs)
        new MutationObserver(place).observe(slider, { attributes: true, attributeFilter: ['value'] });
        setInterval(place, 500);   // catches programmatic .value writes
      }
    }

    // THE NAV BAR'S EDGE. The panel is a plain rectangle now, so this is just a
    // straight band down its right side. It stays on the railedge shape rather
    // than a plain frame because that one clamps its corner radius to the box:
    // a frame's default radius assumes a box wider than it is tall, and this
    // bar is 860px by 92. Only the right side is ever on screen — the other
    // three sit at the viewport edges.
    // ONE RING FOR THE WHOLE FRAME. The rails and the top and bottom bars used
    // to carry a border each — two vertical lines and two horizontal ones that
    // ran past each other at the corners, so the sides went the full height of
    // the screen instead of bending into the bottom. The frame's border is a
    // single rounded rectangle now, poured around the room the bars leave
    // (#nav-hole, which follows every fold), so it BENDS through all four
    // corners. framePx 3, not 2: at 2 the band read as a hairline lost against
    // the frost — invisible enough that it was asked for as a new feature.
    const frameEl = document.getElementById('nav-frame');
    const holeEl = document.getElementById('nav-hole');
    if (frameEl && holeEl) ring(frameEl, { trackTarget: holeEl, framePx: 3 });

    // THE FLASH, KILLED AT THE SOURCE. Screens that rebuild their DOM on
    // interaction (a like re-renders the feed, a move re-renders the board, a
    // keystroke re-renders search results) replace ringed elements wholesale.
    // The replacement is born wearing the CSS hairline, holds it for the frame
    // or two before the observer re-rings it, then snaps to liquid — a visible
    // glitch on every interaction. So: while the liquid system is alive, the
    // hairline never exists AT ALL on ring-bound surfaces. The rule is built
    // from the same selector lists that do the ringing, so it can never
    // drift; and it only exists here, past every mount that could have bailed
    // to the CSS fallback (which needs its hairlines intact).
    const preHide = [...RING_BOX, ...RING_INPUT].map(([sel]) => `html.liquid-on ${sel}`).join(', ');
    // The ::after chrome hairline and border-image gradients paint REGARDLESS
    // of border-color — killing the colour alone left a 1px line around every
    // liquid ring (and flashing on every rebuilt node). All three fallback
    // mechanisms go dark while the liquid is alive.
    const afterHide = [...RING_BOX.map(([sel]) => `html.liquid-on ${sel}::after`), 'html.liquid-on .metal-edge::after'].join(', ');
    const styleEl = document.createElement('style');
    styleEl.textContent =
      `${preHide} { border-color: transparent !important; border-image: none !important; }\n` +
      `${afterHide} { display: none !important; }`;
    document.head.appendChild(styleEl);
    document.documentElement.classList.add('liquid-on');
  // Everything that would draw a line now pours one instead.
    ringAll();
    watchForBorders();

    // The entrance's own marks: the wordmark and the univispira, poured.
    const loginLogo = document.querySelector('.login-logo');
    if (loginLogo && loginLogo.parentElement) {
      const wrap = document.createElement('div');
      wrap.className = 'login-logo-wrap';
      loginLogo.parentElement.insertBefore(wrap, loginLogo);
      wrap.appendChild(loginLogo);
      mount(wrap, {
        imageEl: loginLogo, aspect: 2048 / 699, size: 96,
        thicken: 1.7, rim: 0.022, flowSpeed: 0.12, viscosity: 3, ss: 2,
        interactive: false, seed: 24.6,
      });
    }
    const enterUnivi = document.querySelector('.login-enter .univi');
    if (enterUnivi && enterUnivi.parentElement) {
      mount(enterUnivi.parentElement, {
        imageEl: enterUnivi, aspect: 1663 / 975, size: 52,
        thicken: 1.5, rim: 0.03, viscosity: 1.8, ss: 2, seed: 36.4,
      });
    }

    // The chat's open surfaces wear the house FROST now (Colin's ask) — the
    // CSS owns it; painting the brushed-metal skin here inline would beat any
    // stylesheet forever. The collapsed pill stays poured metal regardless.
  }
  return mounted > 0;
}
