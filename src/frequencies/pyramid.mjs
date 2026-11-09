// ============================================================================
// FREQUENCIES — THE GREAT PYRAMID, 1:1. Pure data and arithmetic, no DOM.
//
// Petrie's 1883 survey (The Pyramids and Temples of Gizeh) is the measured
// pyramid: base, height, angle, and the level of every course at the N.E.
// corner (his Plate 8), here as transcribed and corrected by Ronald Birdsall
// (2003, ronaldbirdsall.com/gizeh/errata/levels.html). 203 courses survive;
// the original rose to 210 or so courses and a pyramidion. Everything derived
// (volumes, block counts, masses) is marked T-II with its assumption.
// ============================================================================
import { AIR, GRAIN, paToSpl, bagnoldFlux, U_STAR_RATIO, mouthDiameterFor, acousticPower, inputPower, thresholdSpl, thresholdVelocity, fieldAt } from './acoustics.mjs';

export const INCH = 0.0254;   // Petrie measured in British inches
export const PETRIE = {
  baseIn: 9068.8,           // mean side of the casing's base, ± 0.5 in (Petrie 1883 §25) (T-I)
  heightIn: 5776,           // original height, ± 7 in (T-I)
  angleDeg: 51 + 52 / 60,   // casing angle 51° 52' ± 2' (T-I)
  topOfMasonryIn: 5451.8,   // the top of course 203 as surveyed (T-I)
  courses: 203,
};
export const BASE_M = PETRIE.baseIn * INCH;       // 230.35 m
export const HEIGHT_M = PETRIE.heightIn * INCH;   // 146.71 m
export const ANGLE = (PETRIE.angleDeg * Math.PI) / 180;

// The thickness of each course, 1..203, in inches: Petrie's levels, each minus the one below (the base at 0).
export const COURSE_THICKNESS_IN = [58.6, 49.1, 48.2, 44.0, 40.2, 38.0, 39.2, 37.8, 36.4, 36.0, 33.7, 29.7, 29.8, 29.4, 29.3, 28.9, 28.0, 31.1, 38.1, 23.5, 23.8, 34.5, 33.0, 32.4, 32.3, 30.8, 29.7, 29.2, 28.1, 28.2, 27.8, 26.3, 26.3, 26.2, 49.8, 41.1, 38.2, 36.3, 33.9, 31.9, 30.9, 28.0, 33.3, 41.1, 37.9, 27.3, 35.6, 35.5, 31.2, 28.0, 26.6, 26.3, 25.6, 25.7, 25.3, 24.8, 22.5, 28.6, 28.7, 28.1, 26.2, 24.4, 26.0, 25.6, 26.2, 23.7, 35.0, 30.6, 32.4, 27.8, 28.8, 25.8, 25.3, 30.4, 29.0, 23.6, 25.5, 23.7, 23.1, 24.1, 23.2, 23.3, 22.6, 27.8, 22.9, 26.3, 21.9, 23.1, 22.7, 38.5, 34.3, 33.1, 29.4, 26.1, 25.6, 23.0, 26.0, 37.5, 38.3, 35.6, 33.5, 27.4, 29.3, 26.3, 26.4, 25.0, 24.8, 29.3, 26.6, 23.2, 22.9, 24.1, 23.2, 23.0, 22.1, 27.1, 22.4, 35.6, 31.8, 29.8, 29.1, 26.0, 26.4, 24.3, 24.8, 23.0, 22.6, 22.8, 22.1, 26.6, 24.9, 23.2, 21.5, 22.8, 21.2, 23.7, 22.3, 25.7, 25.5, 21.7, 21.0, 23.1, 20.9, 31.1, 24.2, 23.9, 22.1, 21.9, 21.7, 26.6, 24.4, 23.0, 22.2, 21.8, 20.5, 21.3, 21.2, 21.6, 20.6, 21.5, 20.7, 23.8, 22.1, 25.8, 21.4, 21.2, 20.6, 20.0, 20.5, 20.8, 19.7, 21.2, 20.8, 19.7, 20.3, 20.5, 20.3, 20.1, 20.6, 26.5, 24.7, 23.3, 22.5, 22.2, 20.7, 21.1, 19.7, 20.9, 20.5, 20.4, 21.2, 20.1, 20.6, 20.7, 19.8, 23.9, 23.5, 22.1, 21.6, 22.8, 22.2, 22.5, 21.4];
export const COURSE_THICKNESS_M = COURSE_THICKNESS_IN.map((t) => t * INCH);
// The missing top: from the top of course 203 (138.48 m) to the apex (146.71 m) is 8.2 m; the courses
// up there were thin (the last ten surveyed average 22 in = 0.56 m), so about 14 more courses and the
// pyramidion stood there. The room extrapolates them at that mean (T-II), and says so.
export const TOP_MEAN_M = COURSE_THICKNESS_M.slice(-10).reduce((a, b) => a + b, 0) / 10;
export function allCourses() {
  const out = COURSE_THICKNESS_M.slice();
  let z = out.reduce((a, b) => a + b, 0);
  while (z + TOP_MEAN_M < HEIGHT_M) { out.push(TOP_MEAN_M); z += TOP_MEAN_M; }
  if (HEIGHT_M - z > 0.05) out.push(HEIGHT_M - z);   // the last sliver: the pyramidion's seat
  return out;
}
// Side of the pyramid at height z (the casing's outer face): s(z) = base · (1 − z/H).
export const sideAt = (z) => BASE_M * Math.max(0, 1 - z / HEIGHT_M);
// Volume of the course that runs from z0 to z1: a square frustum.
export function courseVolume(z0, z1) {
  const a = sideAt(z0), b = sideAt(z1);
  return ((z1 - z0) / 3) * (a * a + a * b + b * b);
}
export const TOTAL_VOLUME_M3 = (BASE_M * BASE_M * HEIGHT_M) / 3;   // 2.59 million m³ (T-I from the survey)

// --- the stone -----------------------------------------------------------------
export const STONE = {
  coreDensity: 2300,     // kg/m³, Mokattam Fm. nummulitic limestone, the core (T-II: handbook limestone 2.0–2.6; porous nummulite beds at the low end)
  casingDensity: 2500,   // kg/m³, Tura fine limestone, the casing (T-II: a denser, finer stone)
  blockPlanM: 1.27,      // m, a typical core block's plan module (50 in): with the courses' thicknesses it gives the 2.5-tonne average block (T-II)
  typicalBlockT: 2.5,    // tonnes, the usual quoted average (T-I as a quoted figure, uncertain: 2–4 t by source)
};
// Blocks in a course: its volume over a block's volume (plan module squared times the course's own thickness).
export const blocksIn = (volume, thickness) => volume / (STONE.blockPlanM * STONE.blockPlanM * thickness);

// The whole pyramid, course by course: height, thickness, side, volume, blocks, mass.
export function courseTable() {
  const rows = [];
  let z = 0;
  const courses = allCourses();
  courses.forEach((t, i) => {
    const v = courseVolume(z, z + t);
    rows.push({ course: i + 1, bottom: z, top: z + t, thickness: t, side: sideAt(z), volume: v, blocks: blocksIn(v, t), mass: v * STONE.coreDensity, surveyed: i < PETRIE.courses });
    z += t;
  });
  return rows;
}
export function totals(rows = courseTable()) {
  const volume = rows.reduce((a, r) => a + r.volume, 0);
  return { courses: rows.length, volume, blocks: rows.reduce((a, r) => a + r.blocks, 0), mass: volume * STONE.coreDensity };
}

// --- the binder: Davidovits' re-agglomerated limestone, as he made it -------------
// His published reproduction (geopolymer.org, "The formula, the invention of stone"):
// into 2 m³ of water, 160 kg of kaolinitic clay (the Giza limestone carries its own),
// 60 kg of sodium carbonate (natron) and 80 kg of slaked lime; the glue is mixed with
// 4500 kg of gently disaggregated nummulitic limestone; after drying the stone holds
// 18–20 % water by weight. (T-I as his recipe; T-III as the pyramids' method: contested,
// see the dossier.) The chemistry he gives: Na2CO3 + Ca(OH)2 → 2 NaOH + CaCO3; NaOH with
// kaolinite → hydrosodalite (a feldspathoid) and calcite; carnallite to neutralise the
// excess alkali → halite and magnesite.
export const RECIPE = { limestone: 4500, kaolinite: 160, natron: 60, lime: 80, water: 2000 };
export const BINDER_SOLIDS_FRACTION = (RECIPE.kaolinite + RECIPE.natron + RECIPE.lime) / (RECIPE.limestone + RECIPE.kaolinite + RECIPE.natron + RECIPE.lime);   // 6.25 %
export function recipeFor(massKg) {
  const solids = RECIPE.limestone + RECIPE.kaolinite + RECIPE.natron + RECIPE.lime;
  const k = massKg / solids;
  return { limestone: RECIPE.limestone * k, kaolinite: RECIPE.kaolinite * k, natron: RECIPE.natron * k, lime: RECIPE.lime * k, water: RECIPE.water * k };
}
// How a geopolymer binder gains strength: set in hours, most of its strength in days;
// the room uses S(t) = S∞ (1 − e^(−t/τ)), τ = 36 h at 25–30 °C, S∞ = 20 MPa, and calls a
// block walkable at 2 MPa and done at 90 % (T-II: order-of-magnitude for alkali-activated
// aluminosilicate binders; Davidovits' own stones are not given a curve).
export const SET = { tauHours: 36, strengthMPa: 20, walkableMPa: 2 };
export const strengthAt = (hours) => SET.strengthMPa * (1 - Math.exp(-hours / SET.tauHours));

// --- the sound work, per course (the schedule the pyramid tab animates) ------------
// The method the room simulates (the dossier's section 3): the aggregate is MOVED and
// SHAPED by the sound-wind of horns standing on the working course, aimed across it,
// not lifted; a standing wave between opposed horns gathers grains into ridges half a
// wavelength apart (Kundt), so f = c / (2 · 1.27 m) = 135 Hz lays a square lattice at
// the block module; the binder paste is placed in the cells; the same horns' pressure
// compacts it (Γ > 1); it sets. The rate the sand can be moved is Bagnold's, at the
// surface velocity the horns reach.
export const LATTICE_PITCH_M = STONE.blockPlanM;
export const LATTICE_HZ = AIR.c / (2 * LATTICE_PITCH_M);   // 135 Hz
// The horns stand shoulder to shoulder along the working course's edge (spacing = one
// mouth), half a metre above the bed, aimed across it. The surface velocity is read
// from the FIELD at the work distance in front of the line (the coherent sum of the
// line's horns, not the mouth level): that is where the grains are.
export function hornPlan({ mouthDb = 160, workDistance = 1.0, spacing = null } = {}) {
  const mouthDiameter = mouthDiameterFor(LATTICE_HZ);
  const gap = spacing || mouthDiameter;
  const acoustic = acousticPower(mouthDb, mouthDiameter);
  const line = [-2, -1, 0, 1, 2].map((i) => ({ x: 0, y: i * gap, z: 0.5, aimX: 1, aimY: 0, aimZ: -0.3, mouthDb, mouthDiameter, phase: 0 }));
  const at = fieldAt(line, LATTICE_HZ, workDistance, 0);
  const uSurface = at.u;                       // rms tangential velocity at the bed, work distance out (ground-doubled)
  const uStar = uSurface / U_STAR_RATIO;
  const flux = uSurface > thresholdVelocity(2.5e-4, GRAIN.calcite) ? bagnoldFlux(uStar) : 0;   // kg per metre of front per second
  return { hz: LATTICE_HZ, mouthDiameter, mouthDb, acoustic, input: inputPower(acoustic), spacing: gap, workDistance, surfaceDb: paToSpl(at.p), uSurface, uStar, flux, thresholdDb: thresholdSpl(2.5e-4, GRAIN.calcite) };
}
// A course's schedule: horns along its perimeter at the spacing, the aggregate carried in
// at Bagnold's rate across the whole front, the pour, and the set.
export function courseSchedule(row, plan = hornPlan()) {
  const front = 4 * row.side;                         // the working front, m
  const horns = Math.ceil(front / plan.spacing);
  const aggregate = row.mass * (1 - BINDER_SOLIDS_FRACTION);   // kg of limestone grains to move
  const moveHours = aggregate / (plan.flux * front) / 3600;
  const setHours = -SET.tauHours * Math.log(1 - 0.9);          // to 90 % strength
  return { front, horns, acousticMW: (horns * plan.acoustic) / 1e6, inputMW: (horns * plan.input) / 1e6, moveHours, setHours, hours: moveHours + setHours };
}
export function schedule(plan = hornPlan()) {
  const rows = courseTable();
  let hours = 0;
  const out = rows.map((r) => { const s = courseSchedule(r, plan); hours += s.hours; return { ...r, ...s, cumulativeHours: hours }; });
  return { rows: out, years: hours / 8766, plan };
}
