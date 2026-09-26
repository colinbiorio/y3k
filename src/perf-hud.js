// ============================================================================
// perf-hud.js — an on-device frame meter, opened with ?perf
//
// The reason this exists: a phone is the only place the performance problem is
// real, and it is the one place we cannot attach a profiler. Desktop preview
// panes suspend requestAnimationFrame between automated steps, so frame rate is
// unmeasurable there; a phone runs the loop honestly but has no inspector. So
// the page measures itself and prints the numbers big enough to read.
//
// It is inert unless the URL carries ?perf — no listeners, no patches, no cost.
// Everything here is measured by wrapping, so no other module knows it exists.
//
// WHAT IT READS, AND WHY THE LIST CHANGED. It used to print fps from the median
// rAF interval, which hides exactly the thing people call "glitchy": a machine
// with a fine median and a 90ms hitch every few frames read as sixty. And once
// the pacer (pace.js) draws only every Nth vsync, the raw rAF interval says
// nothing at all — skipped vsyncs are cheap, so it reads 16.7ms on a machine
// that is missing every drawn slot. So it now reads what the governor judges:
// the interval between DRAWN frames, the share that ran past one and a half
// slots, the worst one, the freezes, and the main-thread tasks behind them.
// ============================================================================

import { due, stats as paceStats } from './pace.js';

const ON = typeof location !== 'undefined' && /(?:\?|&)perf\b/.test(location.search);
let started = false;

export function startPerfHud() {
  if (!ON || started || typeof document === 'undefined' || !document.body) return;
  started = true;

  // --- count snapshots out of the shared liquid canvas -----------------------
  // Each of these forces the GL command stream to flush and the WHOLE drawing
  // buffer to be resolved before the 2D context can sample it — the source rect
  // narrows what is read, not what is resolved. So the count and the buffer
  // size together are the real cost, not the size of the button.
  let blits = 0, blitBytes = 0;
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  proto.drawImage = function (img, ...rest) {
    if (img && img.tagName === 'CANVAS' && img.__mercShared) {
      blits++; blitBytes += img.width * img.height * 4;
    }
    return origDraw.call(this, img, ...rest);
  };

  // --- forced synchronous layout ------------------------------------------
  let rects = 0;
  const origRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { rects++; return origRect.call(this); };

  // Render-pass binds per frame. This is the number that settles "is the bloom
  // chain the bottleneck": renderer.info.render.calls is useless through an
  // EffectComposer because it resets on every pass, so it only ever reports the
  // last one. Counting setRenderTarget counts the passes themselves.
  let passes = 0, patchedRenderer = null, aa = '?';
  const patchRenderer = (rend) => {
    if (!rend || patchedRenderer === rend || !rend.setRenderTarget) return;
    patchedRenderer = rend;
    const orig = rend.setRenderTarget.bind(rend);
    rend.setRenderTarget = (...a) => { passes++; return orig(...a); };
    // Antialiasing, from the context's own attributes. It used to ask for
    // gl.SAMPLES after binding framebuffer null BEHIND three.js's state cache,
    // which can leave three drawing into the wrong target on its next pass —
    // and a meter must never be the glitch it is measuring.
    try { aa = rend.getContext().getContextAttributes()?.antialias ? 'on' : 'off'; } catch { aa = '?'; }
  };

  // --- main-thread tasks over 50ms (Chromium and Electron; Safari has none) --
  // 'long-animation-frame' blames the frame a task landed in and is the better
  // number where it exists (Chrome 123+); 'longtask' is the fallback. Neither
  // exists in Safari, and the readout says so rather than printing a zero.
  let longN = 0, longMs = 0, longWorst = 0, longKind = '';
  try {
    const types = (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes) || [];
    longKind = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : '';
    if (longKind) {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const d = longKind === 'long-animation-frame' ? (e.blockingDuration || e.duration) : e.duration;
          longN++; longMs += d; if (d > longWorst) longWorst = d;
        }
      }).observe({ type: longKind, buffered: true });
    }
  } catch { longKind = ''; }

  // --- what gfx decided ------------------------------------------------------
  // Heard rather than asked: this starts before gfx exists (main.js calls it
  // ahead of the orb), and every profile gfx hands out is announced.
  let profile = null;
  window.addEventListener('y3k:gfx', (e) => { profile = e.detail; });

  const box = document.createElement('div');
  box.id = 'perf-hud';
  box.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'z-index:99999',
    'font:11px/1.35 ui-monospace,Menlo,monospace', 'color:#9effa8',
    'background:rgba(0,0,0,.82)', 'padding:6px 8px', 'white-space:pre',
    'pointer-events:none', 'border-bottom-right-radius:8px', 'max-width:70vw',
  ].join(';');
  document.body.appendChild(box);

  const drawn = [];         // intervals between DRAWN frames, this readout
  let lastTs = -1, lastDrawnTs = -1, vsyncs = 0, skipped = 0, acc = 0, stalls = 0;
  const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

  const tick = (now) => {
    requestAnimationFrame(tick);
    const d = lastTs >= 0 ? now - lastTs : 0;
    lastTs = now;
    vsyncs++;
    acc += d;
    // The pacer's answer for this vsync — the same one the orb and the liquid
    // get, whoever asks first. A vsync that is not due costs nothing and is
    // not a frame anyone sees.
    if (due(now)) {
      const gap = lastDrawnTs >= 0 ? now - lastDrawnTs : 0;
      lastDrawnTs = now;
      // Keep long intervals. A 1.5s stall is not noise to be filtered out — it
      // is the exact symptom being hunted. Only a gap long enough to be a
      // hidden tab is dropped.
      if (gap > 0 && gap < 5000) drawn.push(gap);
      if (gap >= 250 && gap < 1000) stalls++;
    } else skipped++;
    // Repaint about twice a second. The sample gate matters: the first window
    // after boot can be one multi-second gap, which would print as a confident
    // lie. But it must NOT demand many samples per window, or a genuinely slow
    // phone — the whole reason this exists — would never reach the threshold
    // and would show nothing at its worst moment. So: a few samples normally,
    // or whatever we have once 2s have passed.
    if (acc < 500) return;
    if (drawn.length < 4 && acc < 2000) return;
    if (!drawn.length) { box.textContent = `perf: no frames in ${(acc / 1000).toFixed(1)}s`; acc = 0; return; }

    const sorted = drawn.slice().sort((a, b) => a - b);
    const p50 = pct(sorted, 0.5), p95 = pct(sorted, 0.95), max = sorted[sorted.length - 1];
    const ps = paceStats();
    const slot = ps.divisor * ps.refresh;
    let late = 0;
    for (const x of sorted) if (x > slot * 1.5) late++;
    const S = window.__y3kScene || {};
    const rend = S.renderer;
    patchRenderer(rend);
    const info = rend && rend.info;
    const g = profile || window.Y3K?.gfx?.profile?.() || null;
    const drawnFps = drawn.length / (acc / 1000);

    box.textContent = [
      `fps  ${drawnFps.toFixed(0)} drawn   p50 ${p50.toFixed(1)}  p95 ${p95.toFixed(1)}  max ${max.toFixed(0)}ms`,
      `late ${((100 * late) / sorted.length).toFixed(0)}% >1.5 slot   stalls ${stalls}   skipped ${skipped}/${vsyncs} vsyncs`,
      `pace 1/${ps.divisor} of ${ps.refresh.toFixed(1)}ms → cap ${ps.drawnFps.toFixed(0)}fps`,
      g ? `gfx  ${g.tier} ${g.manual ? '(held)' : '(auto)'}  glass ${g.blur}  bloom ${g.bloom ? 'on' : 'off'}  ${g.liquid}  ${g.detail}  motion ${g.motion}  x${g.scale}`
        : `gfx  ${document.documentElement.dataset.gfx || '?'}`,
      longKind ? `long ${longN} tasks  ${longMs.toFixed(0)}ms  worst ${longWorst.toFixed(0)}ms` : 'long (this browser cannot say)',
      `blit ${(blits / vsyncs).toFixed(1)}/f  ${((blitBytes / vsyncs) / 1048576).toFixed(1)}MB/f`,
      `rect ${(rects / vsyncs).toFixed(1)}/f`,
      `pass ${(passes / vsyncs).toFixed(1)}/f   tris ${info ? info.render.triangles : '?'}  aa ${aa}`,
      `dpr  ${(rend ? rend.getPixelRatio() : devicePixelRatio).toFixed(2)}  vp ${innerWidth}x${innerHeight}`,
      `bake ${(window.__mercBakePx || 0) / 1000 | 0}kpx in ${(window.__mercBakeMs || 0) | 0}ms`,
    ].join('\n');

    drawn.length = 0; blits = 0; blitBytes = 0; rects = 0; passes = 0; vsyncs = 0; skipped = 0; acc = 0; stalls = 0;
    longN = 0; longMs = 0; longWorst = 0;
  };
  requestAnimationFrame(tick);
}
