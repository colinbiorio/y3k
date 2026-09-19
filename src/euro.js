// ============================================================================
// euro.js — the one-euro filter.
//
// The problem it solves is the reason head tracking either feels solid or
// feels like a swimming pool, and it is not solved by tuning a lerp. An
// exponential smoother has ONE setting and it is wrong in both directions:
// heavy enough to kill the shiver when you hold still, it lags visibly when
// you move; light enough to keep up, it shivers. There is no value in between,
// because stillness and motion want opposite answers.
//
// A one-euro filter is a low-pass whose cutoff RISES WITH MEASURED SPEED. Hold
// still and the cutoff drops to minCutoff and it is glassy; move and the
// cutoff climbs with beta * |velocity| and it becomes nearly transparent. Two
// constants, and they tune independently: minCutoff sets the stillness,
// beta sets how fast it gets out of the way.
//
// Casiez, Roussel & Vogel (2012), CHI. The algorithm is public and about
// thirty lines; this is those thirty lines, with the edges that bite in a
// browser handled — a first sample with no history, a dt of zero from two
// readings in one frame, and a NaN that would otherwise poison the state
// forever (every later output becomes NaN, the camera matrix becomes NaN, and
// the screen goes black with nothing in the console).
// ============================================================================

// A low-pass coefficient for a given cutoff frequency and timestep.
function alphaFor(cutoffHz, dt) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

export function createOneEuro({ minCutoff = 1.0, beta = 0.05, dCutoff = 1.0 } = {}) {
  let xPrev = 0, dxPrev = 0, ready = false;

  return {
    // value in, filtered value out. dt in SECONDS.
    filter(x, dt) {
      if (!Number.isFinite(x)) return ready ? xPrev : 0;   // never let a NaN in
      if (!(dt > 0)) dt = 1 / 60;                          // two reads in one frame
      if (!ready) { ready = true; xPrev = x; dxPrev = 0; return x; }

      // The derivative is filtered too, at a fixed cutoff — an unfiltered
      // speed estimate is noisier than the signal and would open the gate on
      // jitter alone, which is the failure that looks like the filter doing
      // nothing at all.
      const dx = (x - xPrev) / dt;
      const dxHat = dxPrev + alphaFor(dCutoff, dt) * (dx - dxPrev);

      const cutoff = minCutoff + beta * Math.abs(dxHat);
      const xHat = xPrev + alphaFor(cutoff, dt) * (x - xPrev);

      xPrev = xHat; dxPrev = dxHat;
      return xHat;
    },

    // The filtered speed, in units per second. This is what makes a frame of
    // extrapolation free: we already had to estimate it.
    velocity() { return ready ? dxPrev : 0; },
    has() { return ready; },
    reset() { ready = false; xPrev = 0; dxPrev = 0; },
  };
}

// Three of them, because a position is three signals and they do not share
// state — an axis that is still must stay still while another axis moves.
export function createOneEuro3(opts) {
  const ax = [createOneEuro(opts), createOneEuro(opts), createOneEuro(opts)];
  return {
    // Returns [x, y, z] filtered, each PREDICTED `lead` seconds forward.
    //
    // WHY PREDICT AT ALL: end-to-end latency here is camera exposure, plus a
    // 30 Hz sampling interval, plus inference, plus display — a real fraction
    // of a tenth of a second, and a tenth of a second of lag on a parallax
    // effect is exactly the swimmy feeling this whole module exists to avoid.
    // One frame of extrapolation buys a chunk of it back off an estimate we
    // already have. More than a frame overshoots on direction changes, which
    // reads worse than the lag did.
    filter(x, y, z, dt, lead = 0) {
      const out = [0, 0, 0];
      const v = [x, y, z];
      for (let i = 0; i < 3; i++) {
        const f = ax[i].filter(v[i], dt);
        out[i] = f + (lead > 0 ? ax[i].velocity() * lead : 0);
      }
      return out;
    },
    has() { return ax[0].has(); },
    reset() { for (const f of ax) f.reset(); },
  };
}
