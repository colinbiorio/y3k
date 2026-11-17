// ============================================================================
// FREQUENCIES — THE ACOUSTICS. Pure functions, SI units, no DOM.
//
// The room's invariant is real physics (Colin, 9 Nov 2026: "everything shown in
// this room should represent real physics as closely as possible"), so every
// quantity the room draws comes from here, and every function here is pinned
// to a textbook value in test/frequencies.test.mjs. Tiers, as in the dossier
// (FREQUENCIES.md): T-I is measured or standard physics; T-II is a derivation
// or a model assumption of ours, named as such where it is made.
//
// Air at 20 °C, 1 atm, 50 % RH, which is the standard state for these formulas;
// Giza is hotter and drier, and the dossier says what that changes.
// ============================================================================

export const AIR = {
  c: 343.2,            // m/s, speed of sound at 20 °C (T-I)
  rho: 1.204,          // kg/m³, density at 20 °C, 1 atm (T-I)
  nu: 1.51e-5,         // m²/s, kinematic viscosity at 20 °C (T-I)
  beta: 1.2,           // coefficient of nonlinearity, 1 + (γ-1)/2 with γ = 1.4 (T-I)
  pRef: 20e-6,         // Pa, the reference pressure of the dB SPL scale (T-I)
  T: 293.15, pa: 101.325, rh: 50,   // the state the absorption formula is evaluated at
};
export const G = 9.80665;   // m/s²

// --- level, pressure, velocity, intensity (plane progressive wave) -----------
export const splToPa = (dB) => AIR.pRef * Math.pow(10, dB / 20);            // rms pressure
export const paToSpl = (pRms) => 20 * Math.log10(Math.max(pRms, 1e-12) / AIR.pRef);
export const particleVelocity = (pRms) => pRms / (AIR.rho * AIR.c);        // m/s rms, u = p/(ρc)
export const intensity = (pRms) => (pRms * pRms) / (AIR.rho * AIR.c);      // W/m², I = p²/(ρc)
export const energyDensity = (pRms) => (pRms * pRms) / (AIR.rho * AIR.c * AIR.c);   // J/m³, time-averaged, progressive wave
export const wavelength = (f) => AIR.c / f;
export const waveNumber = (f) => (2 * Math.PI * f) / AIR.c;

// --- the horn ---------------------------------------------------------------
// A horn's low cut-off is set by its mouth: the standard design rule (Olson 1947,
// Beranek 1954) is a mouth circumference of one wavelength at the cut-off, so
// D_mouth = c / (π f_c). A 135 Hz horn has an 81 cm mouth; a 50 Hz horn, 2.2 m.
// Below cut-off the horn stops loading the driver and radiates little (T-I).
export const mouthDiameterFor = (fc) => AIR.c / (Math.PI * fc);
export const cutoffFor = (mouthDiameter) => AIR.c / (Math.PI * mouthDiameter);
// How loud a horn can be is set at its throat: the air itself turns nonlinear.
// Past about 170 dB (6.3 kPa rms, acoustic Mach number ≈ 0.05) a wave steepens
// into a shock within metres (see shockDistance) and the extra drive goes into
// harmonics and heat, not into the tone (T-I: Hamilton & Blackstock, Nonlinear
// Acoustics, ch. 4; horn makers' "air overload" limit). The room caps a throat there.
export const THROAT_MAX_DB = 170;
// Across the horn, acoustic power is conserved (a loss-free horn above cut-off):
// mouth SPL = throat SPL − 10·log10(A_mouth / A_throat). A bigger mouth for the
// same throat drive is quieter per square metre, and carries the same power.
export const mouthSpl = (throatDb, throatDiameter, mouthDiameter) =>
  throatDb - 10 * Math.log10((mouthDiameter * mouthDiameter) / (throatDiameter * throatDiameter));
export const acousticPower = (mouthDb, mouthDiameter) => intensity(splToPa(mouthDb)) * Math.PI * (mouthDiameter / 2) ** 2;   // W
// Electro-acoustic efficiency of a horn-loaded driver: 10–50 % in practice; the
// room uses 25 % to say what a horn costs to run (T-II, a round middle value).
export const HORN_EFFICIENCY = 0.25;
export const inputPower = (acousticW) => acousticW / HORN_EFFICIENCY;

// Bessel J1 (for the piston), by the series for small x and the asymptotic form
// beyond: good to ~1e-6, which is far below anything drawn.
export function besselJ1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const n = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
    const d = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return n / d;
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const a1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const a2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const r = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a1 - z * Math.sin(xx) * a2);
  return x < 0 ? -r : r;
}
// Directivity of a horn mouth, taken as a circular piston of radius a in a baffle
// (Rayleigh): |2 J1(ka sinθ) / (ka sinθ)|, 1 on axis, first zero at ka sinθ = 3.83 (T-I).
export function pistonDirectivity(ka, theta) {
  const x = ka * Math.sin(theta);
  if (Math.abs(x) < 1e-9) return 1;
  return Math.abs((2 * besselJ1(x)) / x);
}

// --- atmospheric absorption, ISO 9613-1 (1993) -------------------------------
// dB per metre, for frequency f (Hz), temperature T (K), pressure pa (kPa),
// relative humidity rh (%). Exactly the standard's equations (T-I). At 20 °C,
// 50 % RH: ≈ 4.7 dB/km at 1 kHz; 0.1 dB/km near 100 Hz; 166 dB/km at 10 kHz.
export function absorptionDbPerM(f, T = AIR.T, pa = AIR.pa, rh = AIR.rh) {
  const T0 = 293.15, T01 = 273.16, pr = 101.325;
  const psat = pr * Math.pow(10, -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151);
  const h = rh * (psat / pa);                                   // molar concentration of water vapour, %
  const frO = (pa / pr) * (24 + 4.04e4 * h * ((0.02 + h) / (0.391 + h)));
  const frN = (pa / pr) * Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));
  const f2 = f * f;
  return 8.686 * f2 * (1.84e-11 * (pr / pa) * Math.sqrt(T / T0)
    + Math.pow(T / T0, -2.5) * (0.01275 * Math.exp(-2239.1 / T) / (frO + f2 / frO) + 0.1068 * Math.exp(-3352 / T) / (frN + f2 / frN)));
}

// --- nonlinearity: where a loud tone becomes a shock --------------------------
// x_s = ρ c³ / (β ω P), P the pressure amplitude (T-I, Hamilton & Blackstock).
// 160 dB at 135 Hz shocks 17 m out; at 1 kHz, 2.2 m.
export const shockDistance = (dB, f) => (AIR.rho * AIR.c ** 3) / (AIR.beta * 2 * Math.PI * f * (splToPa(dB) * Math.SQRT2));

// --- the field on the ground ----------------------------------------------------
// Horns stand over a sand bed, which the sound meets as a rigid plane (sand is a
// poor absorber below a few hundred hertz: its pores are far smaller than the
// viscous boundary layer there). By the image method the pressure at the surface
// is twice the incident, the normal velocity is zero, and the tangential velocity
// is twice the incident's tangential part. Sources add coherently (complex sum),
// each spreading as 1/r from its mouth radius a (the mouth pressure at r = a),
// shaped by the piston directivity about its aim, and thinned by absorption.
//
// horn: { x, y, z, aimX, aimY, aimZ, mouthDb, mouthDiameter, phase }  (metres, dB, rad)
// Returns, at ground point (x, y): { p: rms pressure, ux, uy: rms tangential velocity components, u: |u| rms,
// re, im: the pressure itself as a phasor }: at any moment the pressure there is √2 (re cos ωt − im sin ωt),
// which is what the room draws on the sand, slowed, as the waves crossing it.
export function fieldAt(horns, f, x, y) {
  const k = waveNumber(f);
  const alpha = absorptionDbPerM(f) / 8.686;   // nepers per metre
  let pr = 0, pi = 0, uxr = 0, uxi = 0, uyr = 0, uyi = 0;
  for (const h of horns) {
    const a = h.mouthDiameter / 2;
    const dx = x - h.x, dy = y - h.y, dz = 0 - h.z;
    const r = Math.max(Math.hypot(dx, dy, dz), a);
    const al = Math.hypot(h.aimX, h.aimY, h.aimZ) || 1;
    const cosT = (dx * h.aimX + dy * h.aimY + dz * h.aimZ) / (r * al);
    const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));
    // a horn radiates forward: behind its mouth the piston formula is not the
    // physics (a real horn's back is a wall); the field there is taken as 1/10 of on-axis
    const dir = theta > Math.PI / 2 ? 0.1 * pistonDirectivity(k * a, Math.PI / 2) : pistonDirectivity(k * a, theta);
    const amp = 2 * splToPa(h.mouthDb) * (a / r) * dir * Math.exp(-alpha * Math.max(r - a, 0));   // ×2: the rigid ground
    const ph = -k * r + (h.phase || 0);
    const c = Math.cos(ph), s = Math.sin(ph);
    pr += amp * c; pi += amp * s;
    // tangential velocity along the ray's horizontal projection
    const rh = Math.hypot(dx, dy) || 1e-9;
    const ex = dx / rh, ey = dy / rh;
    const horiz = rh / r;                       // the ray's horizontal share
    const v = (amp / (AIR.rho * AIR.c)) * horiz;
    uxr += v * ex * c; uxi += v * ex * s; uyr += v * ey * c; uyi += v * ey * s;
  }
  const p = Math.hypot(pr, pi), ux = Math.hypot(uxr, uxi), uy = Math.hypot(uyr, uyi);
  return { p, ux, uy, u: Math.hypot(ux, uy), re: pr, im: pi };
}

// --- the field in the air, and what a listener hears -----------------------------
// One horn's pressure at a point: the same spreading, directivity and absorption as on
// the ground. `hz` and `aimZ` are passed apart so that the horn's image in the ground
// (itself, mirrored) can be asked for as well. Returns [amplitude (rms), phase, distance].
function ray(h, k, alpha, x, y, z, hz, aimZ) {
  const a = h.mouthDiameter / 2;
  const dx = x - h.x, dy = y - h.y, dz = z - hz;
  const d = Math.hypot(dx, dy, dz), r = Math.max(d, a);
  const al = Math.hypot(h.aimX, h.aimY, aimZ) || 1;
  const theta = Math.acos(Math.max(-1, Math.min(1, (dx * h.aimX + dy * h.aimY + dz * aimZ) / (r * al))));
  const dir = theta > Math.PI / 2 ? 0.1 * pistonDirectivity(k * a, Math.PI / 2) : pistonDirectivity(k * a, theta);
  return [splToPa(h.mouthDb) * (a / r) * dir * Math.exp(-alpha * Math.max(r - a, 0)), -k * r + (h.phase || 0), d];
}
// The pressure anywhere over the bed, z metres above it: every horn and its image in the
// rigid ground, added as phasors (T-I: the image method). On the ground the two paths are
// one length and it is fieldAt's doubled pressure; higher up they part, and the level
// rises and falls with height.
export function pressureAt(horns, f, x, y, z = 0) {
  const k = waveNumber(f), alpha = absorptionDbPerM(f) / 8.686;
  let re = 0, im = 0;
  for (const h of horns) for (const side of [1, -1]) {
    const [amp, ph] = ray(h, k, alpha, x, y, z, side * h.z, side * (h.aimZ || 0));
    re += amp * Math.cos(ph); im += amp * Math.sin(ph);
  }
  return { re, im, p: Math.hypot(re, im) };
}
// What a listener standing there hears. ear: { x, y, z } where they are (z above the bed)
// and { rx, ry, rz }, the unit vector toward their right. The pressure is the physics above.
// WHERE each horn sits between the two speakers is a convention, not physics (T-II): each
// horn and its image is placed by how far to the listener's right it lies, at constant
// power, as a stereo recording places an instrument; no head is modelled. The horns keep
// their true phases, so two that cancel at the listener cancel in the speakers too.
// Returns { L: [re, im], R: [re, im], p: the rms pressure at the listener }. Given `each` (an
// array), it is also filled with each horn's own pressure there (the horn and its image): how
// much of what is heard comes from it, so that the room can show the sound at its source.
export function hear(horns, f, ear, each = null) {
  const k = waveNumber(f), alpha = absorptionDbPerM(f) / 8.686;
  let lr = 0, li = 0, rr = 0, ri = 0, pr = 0, pi = 0;
  for (let i = 0; i < horns.length; i++) {
    const h = horns[i];
    let hr = 0, hi = 0;
    for (const side of [1, -1]) {
      const hz = side * h.z;
      const [amp, ph, d] = ray(h, k, alpha, ear.x, ear.y, ear.z, hz, side * (h.aimZ || 0));
      const pan = d > 1e-6 ? ((h.x - ear.x) * ear.rx + (h.y - ear.y) * ear.ry + (hz - ear.z) * ear.rz) / d : 0;
      const t = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4, gl = Math.cos(t), gr = Math.sin(t);
      const c = amp * Math.cos(ph), s = amp * Math.sin(ph);
      lr += gl * c; li += gl * s; rr += gr * c; ri += gr * s; pr += c; pi += s; hr += c; hi += s;
    }
    if (each) each[i] = Math.hypot(hr, hi);
  }
  return { L: [lr, li], R: [rr, ri], p: Math.hypot(pr, pi) };
}
// How loud the room plays a pressure. Not at its level: 160 dB is past the threshold of
// pain, and no speaker makes it. The air's own limit (170 dB, the throat) is full volume,
// and every 20 dB of the field under it is 10 dB at the speakers (T-II: a choice, so that
// a quiet place is still heard and a loud one is still safe). 0..1.
export const PLAYED_DB_PER_DB = 0.5;
export const played = (pRms) => Math.min(1, Math.pow(Math.max(pRms, 0) / splToPa(THROAT_MAX_DB), PLAYED_DB_PER_DB));
// The four gains of the room's two oscillators (a cosine and a sine at the tone) for the
// left and the right speaker: [left cos, left sin, right cos, right sin]. The two ears keep
// their ratio and their phases; together they are as loud as played() says.
export function stereo(heard) {
  const [lr, li] = heard.L, [rr, ri] = heard.R;
  const total = Math.hypot(lr, li, rr, ri);
  if (!(total > 0)) return [0, 0, 0, 0];
  const s = played(total) / total;
  return [lr * s, -li * s, rr * s, -ri * s];
}

// --- grains -------------------------------------------------------------------
export const GRAIN = {
  quartz: 2650,     // kg/m³ (T-I)
  calcite: 2710,    // kg/m³ (T-I)
  reposeDeg: 34,    // dry sand's angle of repose (T-I, 30–35°)
};
// Drag coefficient of a sphere, Schiller–Naumann (Re < 1000) (T-I).
export const dragCoefficient = (Re) => (Re < 1e-6 ? 1e9 : (24 / Re) * (1 + 0.15 * Math.pow(Re, 0.687)));
// The free-stream air speed at which a grain resting on the bed starts to move:
// drag ½ρ_a u² C_d (πd²/4) against the friction holding it, μ (ρ_s − ρ_a) g (πd³/6),
// μ = tan(angle of repose). Solved by iteration since C_d depends on u (T-II: a
// drag balance; it lands where Bagnold's wind-tunnel threshold does, u* ≈ 0.23 m/s
// for 0.25 mm sand, read at a grain's height, see bagnoldThreshold).
export function thresholdVelocity(d, rhoS = GRAIN.quartz, mu = Math.tan((GRAIN.reposeDeg * Math.PI) / 180)) {
  let u = 1;
  for (let i = 0; i < 40; i++) {
    const Re = (u * d) / AIR.nu;
    const cd = dragCoefficient(Re);
    const next = Math.sqrt(((4 / 3) * mu * ((rhoS - AIR.rho) / AIR.rho) * G * d) / cd);
    if (Math.abs(next - u) < 1e-6) return next;
    u = next;
  }
  return u;
}
// Bagnold's fluid threshold shear velocity, u*_t = A √((ρ_s − ρ_a)/ρ_a · g d), A = 0.10 (T-I, Bagnold 1941).
export const bagnoldThreshold = (d, rhoS = GRAIN.quartz, A = 0.10) => A * Math.sqrt(((rhoS - AIR.rho) / AIR.rho) * G * d);
// Bagnold's transport rate, q = C √(d/D) (ρ_a/g) u*³ kg/(m·s), D = 0.25 mm, C = 1.8 for
// natural sand (T-I). The SOUND-WIND is oscillatory, not a steady boundary layer; the
// room reads an effective u* from the rms tangential velocity at the surface as
// u* ≈ u_rms / 8, the log-law ratio at about a centimetre's height (T-II, the
// model's one calibration; it is named in the room and the dossier).
export const U_STAR_RATIO = 8;
export function bagnoldFlux(uStar, d = 2.5e-4, C = 1.8) {
  return C * Math.sqrt(d / 2.5e-4) * (AIR.rho / G) * uStar ** 3;
}
// The incident SPL at which grains of diameter d start to move on the bed: the
// surface's tangential velocity is twice the incident's (rigid ground), so the
// incident wave needs u_rms = u_t / 2.
export const thresholdSpl = (d, rhoS = GRAIN.quartz) => paToSpl(AIR.rho * AIR.c * (thresholdVelocity(d, rhoS) / 2));

// --- acoustic radiation force on a small sphere (Gor'kov 1962) -----------------
// In a plane standing wave of pressure amplitude P the force on a sphere of
// radius a (a ≪ λ) has amplitude F = 4π a³ k E_ac Φ, E_ac = P²/(4ρc²),
// Φ = f1/3 + f2/2, f1 = 1 − ρc²/(ρ_s c_s²), f2 = 2(ρ_s − ρ)/(2ρ_s + ρ) (T-I).
// For stone in air f1 ≈ f2 ≈ 1, Φ ≈ 5/6. Levitation against gravity needs
// F ≥ (ρ_s − ρ) (4/3)π a³ g, i.e. E_ac ≥ (ρ_s − ρ) g / (3 Φ k): independent of the
// grain's size, falling as 1/f. The SPL the antinodes must reach follows.
export function gorkovPhi(rhoS, cS = 5000) {
  const f1 = 1 - (AIR.rho * AIR.c * AIR.c) / (rhoS * cS * cS);
  const f2 = (2 * (rhoS - AIR.rho)) / (2 * rhoS + AIR.rho);
  return f1 / 3 + f2 / 2;
}
export function levitationSpl(f, rhoS = GRAIN.quartz) {
  const E = ((rhoS - AIR.rho) * G) / (3 * gorkovPhi(rhoS) * waveNumber(f));
  const P = Math.sqrt(4 * AIR.rho * AIR.c * AIR.c * E);     // standing-wave pressure amplitude
  return paToSpl(P / Math.SQRT2);                            // the rms level at an antinode
}

// --- compaction by the sound's pressure on the bed --------------------------------
// The surface pressure (twice the incident) is an oscillating load on the bed's top
// layer; a layer of thickness L and bulk density ρ_s φ sees a peak acceleration
// a = √2 · 2 p_rms / (ρ_s φ L). Γ = a/g above 1 is the regime in which tapped
// granular beds compact toward random close packing (T-I: Nowak et al. 1998,
// Knight et al. 1995; Γ as the control parameter). L is the depth the pressure
// does not penetrate; the room takes 0.1 m (T-II).
export const PACKING = { loose: 0.56, close: 0.64 };
export function gammaOf(pIncidentRms, rhoS = GRAIN.calcite, phi = PACKING.loose, L = 0.1) {
  return (Math.SQRT2 * 2 * pIncidentRms) / (rhoS * phi * L * G);
}
