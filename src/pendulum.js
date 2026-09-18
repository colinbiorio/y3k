// ============================================================================
// THE PENDULUM SWARM — the one form that cannot be a pure function.
//
// Every other form the body takes is recomputed from a node's identity and the
// clock, every frame, on the GPU. A double pendulum is not like that: where the
// tip is now depends on everywhere it has been, and chaos means no formula
// skips the integration. So this is the body's one STATEFUL form, integrated
// here on the CPU and handed to the shader as an attribute.
//
// And it is not one pendulum. It is K of them, all released from within ε of
// the same state, and every node of the body is the tip of one — so for the
// first breaths the whole body swings as ONE pendulum, a ring of tips, and
// then the butterfly effect takes it apart into a shell. The digit the
// presence writes IS ε: pendulum 0 holds together longest, pendulum 9 shreds
// at once. That is the reel ("Butterfly Effect") as a thing that actually
// happens, rather than a picture of it.
//
// Pure: no three.js, no DOM, so the physics is testable in node — energy is
// conserved, ε = 0 gives bit-identical trajectories, ε > 0 diverges by orders
// of magnitude, and nothing ever leaves the reach of the arms.
// ============================================================================

const G = 9.81;
const L = 0.48;                 // each arm, in units of R: two arms reach 0.96R — rule 1
const TWO_L = 2 * L;
const H_MAX = 1 / 120;          // RK4 substep; energy drift is tested at this size, and it holds
const THETA0 = 2.4;             // released high — the chaotic regime, not a clock

// The reel's α1, α2, with m1 = m2 = 1 and l1 = l2 = L:
//   θ1'' = [−g·3·sinθ1 − g·sin(θ1−2θ2) − 2·sinΔ·(ω2²L + ω1²L·cosΔ)] / [L·(3 − cos2Δ)]
//   θ2'' = [ 2·sinΔ·(2ω1²L + 2g·cosθ1 + ω2²L·cosΔ)]                / [L·(3 − cos2Δ)]
function accel(t1, t2, w1, w2, out) {
  const d = t1 - t2, sd = Math.sin(d), cd = Math.cos(d);
  const den = L * (3 - Math.cos(2 * d));
  out[0] = (-G * 3 * Math.sin(t1) - G * Math.sin(t1 - 2 * t2) - 2 * sd * (w2 * w2 * L + w1 * w1 * L * cd)) / den;
  out[1] = (2 * sd * (2 * w1 * w1 * L + 2 * G * Math.cos(t1) + w2 * w2 * L * cd)) / den;
}

// One digit → ε in radians, on a log scale: 0 → 1e-6, 5 → 1e-3, 9 → 0.25.
export function epsOf(digit) {
  const e = Math.max(0, Math.min(9, digit | 0));
  return Math.pow(10, -6 + 0.6 * e);
}

export function createSwarm({ count, rand, eps, K = 512 } = {}) {
  // K trajectories, not count: the shape of the swarm is set by how ε is spread
  // and by azimuth, and 512 distinct histories — each spread over ~47 azimuths —
  // is already a continuum to the eye. 2048 measured 6.8ms a frame on the main
  // thread; this is under 1.5, and integrating 24,000 would be the same picture
  // at fifty times the cost.
  K = Math.max(2, K & ~1);                    // even, so K/2 is the exact centre (offset 0)
  const s = new Float64Array(K * 4);          // θ1 θ2 ω1 ω2 per trajectory
  for (let k = 0; k < K; k++) {
    const off = eps * (2 * k / K - 1);        // −ε .. +ε across the swarm; exactly 0 at K/2
    s[k * 4] = THETA0 + off; s[k * 4 + 1] = THETA0; s[k * 4 + 2] = 0; s[k * 4 + 3] = 0;
  }
  const REF = K / 2;                          // the reference pendulum: the arms are drawn on it
  const ARM_SHARE = 0.05;                     // 5% of nodes draw the two arms as dotted lines

  // Per-node statics, once: which trajectory (from the index walk, so ε varies
  // smoothly across the body), which plane (azimuth from the node's own
  // random), and whether this node is an arm dot rather than a tip.
  const n = count | 0;
  const traj = new Int32Array(n), cphi = new Float32Array(n), sphi = new Float32Array(n), armF = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rand ? rand[i] : Math.random();
    const isArm = r < ARM_SHARE;
    armF[i] = isArm ? r / ARM_SHARE : -1;    // 0..1 along pivot→bob1→bob2, or −1 for a tip
    traj[i] = isArm ? REF : Math.min(K - 1, Math.floor((i / n) * K));
    const phi = isArm ? 0 : r * Math.PI * 2;  // every arm dot in ONE plane, so it reads as a pendulum
    cphi[i] = Math.cos(phi); sphi[i] = Math.sin(phi);
  }

  const k1 = new Float64Array(2), k2 = new Float64Array(2), k3 = new Float64Array(2), k4 = new Float64Array(2);
  let t = 0;
  function rk4(k, h) {
    const o = k * 4;
    const t1 = s[o], t2 = s[o + 1], w1 = s[o + 2], w2 = s[o + 3];
    accel(t1, t2, w1, w2, k1);
    accel(t1 + 0.5 * h * w1, t2 + 0.5 * h * w2, w1 + 0.5 * h * k1[0], w2 + 0.5 * h * k1[1], k2);
    const w1b = w1 + 0.5 * h * k2[0], w2b = w2 + 0.5 * h * k2[1];
    accel(t1 + 0.5 * h * (w1 + 0.5 * h * k1[0]), t2 + 0.5 * h * (w2 + 0.5 * h * k1[1]), w1b, w2b, k3);
    const w1c = w1 + h * k3[0], w2c = w2 + h * k3[1];
    accel(t1 + h * w1b, t2 + h * w2b, w1c, w2c, k4);
    s[o]     = t1 + (h / 6) * (w1 + 2 * (w1 + 0.5 * h * k1[0]) + 2 * w1b + w1c);
    s[o + 1] = t2 + (h / 6) * (w2 + 2 * (w2 + 0.5 * h * k1[1]) + 2 * w2b + w2c);
    s[o + 2] = w1 + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    s[o + 3] = w2 + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  }

  // Advance every trajectory by dt, in substeps no longer than H_MAX. A tab
  // coming back from the background hands us a huge dt; it is clamped, because
  // a second of chaos in one step is not chaos, it is numerical garbage.
  function step(dt) {
    dt = Math.max(0, Math.min(dt, 0.1));
    const sub = Math.max(1, Math.ceil(dt / H_MAX)), h = dt / sub;
    for (let i = 0; i < sub; i++) for (let k = 0; k < K; k++) rk4(k, h);
    t += dt;
  }

  // Where the two bobs of trajectory k are, in the plane (x right, y up; the
  // pivot is the body's centre and the pendulum hangs down).
  function bobs(k, out) {
    const o = k * 4;
    const x1 = L * Math.sin(s[o]), y1 = -L * Math.cos(s[o]);
    out[0] = x1; out[1] = y1;
    out[2] = x1 + L * Math.sin(s[o + 1]); out[3] = y1 - L * Math.cos(s[o + 1]);
  }

  const b = new Float64Array(4), ref = new Float64Array(4);
  // Write every node's position into `out` (xyz per node), in units of R.
  function write(out) {
    bobs(REF, ref);
    for (let i = 0; i < n; i++) {
      let x, y;
      const f = armF[i];
      if (f >= 0) {
        // along the reference pendulum: first arm for f < 0.5, second for f ≥ 0.5
        if (f < 0.5) { const g = f * 2; x = ref[0] * g; y = ref[1] * g; }
        else { const g = f * 2 - 1; x = ref[0] + (ref[2] - ref[0]) * g; y = ref[1] + (ref[3] - ref[1]) * g; }
      } else {
        bobs(traj[i], b);
        x = b[2]; y = b[3];
      }
      out[i * 3] = x * cphi[i]; out[i * 3 + 1] = y; out[i * 3 + 2] = x * sphi[i];
    }
  }

  // Diagnostics, for the tests: total energy of one trajectory (should hold),
  // and the tip separation between two (should grow when ε > 0).
  function energy(k) {
    const o = k * 4, t1 = s[o], t2 = s[o + 1], w1 = s[o + 2], w2 = s[o + 3];
    const T = L * L * (w1 * w1 + 0.5 * w2 * w2 + w1 * w2 * Math.cos(t1 - t2));
    const V = -G * L * (2 * Math.cos(t1) + Math.cos(t2));
    return T + V;
  }
  function tipDistance(a, c) { const p = new Float64Array(4), q = new Float64Array(4); bobs(a, p); bobs(c, q); return Math.hypot(p[2] - q[2], p[3] - q[3]); }

  return { step, write, energy, tipDistance, bobs, get t() { return t; }, K, reach: TWO_L };
}
