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
// ============================================================================

const ON = typeof location !== 'undefined' && /(?:\?|&)perf\b/.test(location.search);

export function startPerfHud() {
  if (!ON || typeof document === 'undefined') return;

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
  let passes = 0, patchedRenderer = null;
  const patchRenderer = (rend) => {
    if (!rend || patchedRenderer === rend || !rend.setRenderTarget) return;
    patchedRenderer = rend;
    const orig = rend.setRenderTarget.bind(rend);
    rend.setRenderTarget = (...a) => { passes++; return orig(...a); };
  };

  const box = document.createElement('div');
  box.id = 'perf-hud';
  box.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'z-index:99999',
    'font:11px/1.35 ui-monospace,Menlo,monospace', 'color:#9effa8',
    'background:rgba(0,0,0,.82)', 'padding:6px 8px', 'white-space:pre',
    'pointer-events:none', 'border-bottom-right-radius:8px', 'max-width:70vw',
  ].join(';');
  document.body.appendChild(box);

  const dt = [];            // rAF intervals, rolling
  let last = performance.now(), frames = 0, acc = 0;
  const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

  const tick = (now) => {
    requestAnimationFrame(tick);
    const d = now - last; last = now;
    // Keep long intervals. A 1.5s stall is not noise to be filtered out — it is
    // the exact symptom being hunted, and discarding it would make the readout
    // flatter than the device actually feels.
    if (d > 0 && d < 5000) dt.push(d);
    frames++;
    acc += d;
    // Repaint about twice a second. The sample gate matters: the first window
    // after boot can be one multi-second gap, which would print as a confident
    // lie. But it must NOT demand many samples per window, or a genuinely slow
    // phone — the whole reason this exists — would never reach the threshold
    // and would show nothing at its worst moment. So: a few samples normally,
    // or whatever we have once 2s have passed.
    if (acc < 500) return;
    if (dt.length < 4 && acc < 2000) return;
    if (!dt.length) { box.textContent = `perf: no frames in ${(acc / 1000).toFixed(1)}s`; acc = 0; return; }

    const sorted = dt.slice().sort((a, b) => a - b);
    const p50 = pct(sorted, 0.5), p95 = pct(sorted, 0.95);
    const S = window.__y3kScene || {};
    const rend = S.renderer;
    patchRenderer(rend);
    const info = rend && rend.info;
    let samples = '?';
    try {
      const gl = rend && rend.getContext();
      if (gl) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); samples = gl.getParameter(gl.SAMPLES); }
    } catch (e) { /* not fatal — the HUD must never break the page */ }

    box.textContent = [
      `fps  ${p50 > 0 ? (1000 / p50).toFixed(0) : '--'}   p50 ${p50.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms`,
      `blit ${(blits / frames).toFixed(1)}/f  ${((blitBytes / frames) / 1048576).toFixed(1)}MB/f`,
      `rect ${(rects / frames).toFixed(1)}/f`,
      `pass ${(passes / frames).toFixed(1)}/f   tris ${info ? info.render.triangles : '?'}  msaa ${samples}`,
      `dpr  ${(rend ? rend.getPixelRatio() : devicePixelRatio).toFixed(2)}  vp ${innerWidth}x${innerHeight}`,
      `bake ${(window.__mercBakePx || 0) / 1000 | 0}kpx in ${(window.__mercBakeMs || 0) | 0}ms`,
    ].join('\n');

    dt.length = 0; blits = 0; blitBytes = 0; rects = 0; passes = 0; frames = 0; acc = 0;
  };
  requestAnimationFrame(tick);
}
