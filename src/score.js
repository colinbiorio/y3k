// ============================================================================
// THE SCORE — time as a thing the presence can write.
//
// Everything else in the language is a state (held until changed) or a beat
// (gone at once). A score is the third kind: a sequence of steps, each with a
// duration, each ARRIVING over its own length and holding until the next.
//
//   <<over: 3s hold | 2s ember | 2s flash 0.3s | 2s super 7 1 5 | still>>
//
// Ts is 0.1s: durations are read to a tenth, and the sequencer is ticked every
// hundred milliseconds. That is the resolution of CONTROL, not a metronome —
// a step may be thirty seconds long and nothing happens inside it but the
// arrival the body was already going to make.
//
// Pure: no DOM, no three, no timers of its own. `apply(step)` is handed in,
// `tick(nowMs)` is called by whoever owns the clock, and the same code runs in
// node with a fake clock, which is how it is tested.
// ============================================================================

export function createScore(apply) {
  let steps = [];
  let i = -1;
  let at = 0;
  let running = false;

  // Begin a score. A score already running is ended first — its last state
  // simply stands, as any state does — and the new one starts from its first
  // step at once.
  function start(list, nowMs) {
    if (running) end();
    steps = Array.isArray(list) ? list.filter(Boolean) : [];
    i = -1;
    if (!steps.length) return false;
    running = true;
    i = 0; at = nowMs;
    apply(steps[0]);
    return true;
  }
  // Called on the owner's clock. A step ends when its duration has elapsed
  // since its SCHEDULED start — each start is the previous start plus the
  // previous length, never "now" — so boundaries do not drift with tick jitter,
  // and a stalled clock (a hidden tab) catches up THROUGH every overdue step in
  // order rather than skipping to the last: a colour the score was meant to
  // pass through is passed through, however briefly. (The first version set
  // the start to now on each catch-up, saw zero elapsed, and stopped after one.)
  function tick(nowMs) {
    let guard = 0;
    while (running && nowMs - at >= steps[i].seconds * 1000 && guard++ < 64) {
      at += steps[i].seconds * 1000;
      i += 1;
      if (i >= steps.length) { end(); return; }
      apply(steps[i]);
    }
  }
  // The end of a score, natural or not: one {end:true} to the applier, so the
  // things a score changes about HOW the body moves (its pace, a flash) are put
  // back, while WHAT it arrived at is left standing.
  function end() {
    if (!running) return;
    running = false;
    apply({ end: true });
  }
  return { start, tick, cancel: end, get running() { return running; }, get step() { return running ? i : -1; }, get length() { return steps.length; } };
}

// 95% of the way there in D seconds, as a per-frame ease constant at 60Hz. The
// frame loop already turns a per-frame constant into wall-clock (1-(1-k)^dtN),
// so this holds on a 120Hz display too. The pair is [pace, plasma] in the same
// 4:3 ratio the named MORPHs keep.
export function easeForSeconds(seconds) {
  const D = Math.max(0.1, Math.min(60, +seconds || 0.1));
  const k = 1 - Math.pow(0.05, 1 / (60 * D));
  return [k, Math.min(0.5, k * 4 / 3)];
}
