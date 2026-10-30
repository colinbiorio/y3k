// THE ROOMS — what breaks without anyone seeing it. Run: node test/rooms.test.mjs
//
// Written 2026-10-19 with the four rooms added that day (cherry blossoms,
// stormy sea, earthrise, neon city). A room is a list entry (rooms.mjs), a
// build branch and a tap (environments.js), a light on the dust (body.js),
// and a name the kommand grammar reads (tags.mjs) — four files, and leaving
// any one of them out fails quietly: a room with no branch is an empty world,
// one with no tap ignores the person, a sky without the encode draws darker
// with the glow off, a sky with an fbm of its own ignores the lightest mode,
// and a name that shares a word with another room makes that word stop
// finding either of them.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ENVIRONMENTS } from '../src/rooms.mjs';
import { parseKommand, kommandWords, parseRoom, stripRoom, scrubTags, makeLeadStreamParser } from '../src/tags.mjs';
import { WORDS } from '../y3k-code/orb.mjs';
import { nodal, LADDER, RUNGS, modeAt, agitationOf, rungOf, pitch01, dominantHz, idleRung, cadence, QUIET, LOUD, PITCH_LO, PITCH_HI } from '../src/plate.mjs';

const ROOT = new URL('..', import.meta.url);
const env = readFileSync(new URL('src/environments.js', ROOT), 'utf8');
const body = readFileSync(new URL('src/body.js', ROOT), 'utf8');
const voice = readFileSync(new URL('src/voice.js', ROOT), 'utf8');
const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// A function's body, braces matched from its declaration.
function fnBody(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, `no "${head}" in the source`);
  const open = src.indexOf('{', at + head.length - 1);
  for (let i = open, depth = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error('unbalanced: ' + head);
}
// A shader, by the name of the constant that holds it.
function shader(name) {
  const at = env.indexOf(`const ${name} = \``);
  assert.ok(at >= 0, `no shader ${name}`);
  const from = env.indexOf('`', at) + 1;
  return env.slice(from, env.indexOf('`;', from));
}
const build = fnBody(env, 'function build(id) {');
const tap = fnBody(env, 'function tap() {');
const worlds = ENVIRONMENTS.filter((e) => e.id !== 'room');
// One world's branch of build(): from its test to the next world's.
function branch(id) {
  const at = build.indexOf(`id === '${id}'`);
  assert.ok(at >= 0, `${id} has no branch in build(): it would be an empty world`);
  const next = build.indexOf("} else if (id === '", at);
  return build.slice(at, next < 0 ? build.indexOf('return w;', at) : next);
}
// The sky a world puts on the dome (space's is baked from SPACE_FRAG first).
function skyOf(id) {
  const m = /skydome\((\w+_FRAG)/.exec(branch(id));
  assert.ok(m, `${id} puts no sky on the dome`);
  return m[1] === 'BAKED_FRAG' ? 'SPACE_FRAG' : m[1];
}

console.log('\nthe worlds:');

ok('every room but the metal one is built: a branch in build() with its sky on the dome', () => {
  for (const { id } of worlds) {
    const b = branch(id);
    assert.ok(/skydome\(/.test(b) && /sky\.scale\.setScalar\(SKY_R\)/.test(b) && /g\.add\(sky\)/.test(b), `${id} builds no sky at SKY_R`);
  }
});

ok('every room answers a tap, in its own language', () => {
  for (const { id } of worlds) {
    if (tap.includes(`current === '${id}'`)) continue;
    // or its sky reads the tap itself, past the line that declares it
    const sky = shader(skyOf(id));
    assert.ok((sky.match(/uTap/g) || []).length >= 2, `a tap in ${id} does nothing: no answer in tap() and none in ${skyOf(id)}`);
  }
});

ok('a tap that makes something takes it from a spare parked when its world was built', () => {
  // the program compiles with the sky's instead of on the frame the first
  // tap asks for it (see makeMeteor)
  for (const m of tap.matchAll(/current === '(\w+)'\) (\w+)\(\)/g)) {
    const [, id, fn] = m;
    if (!fnBody(env, `function ${fn}() {`).includes('active.spare.pop()')) continue;
    assert.ok(/w\.spare\.push\(make\w+\(w\)\)/.test(branch(id)), `${id}'s ${fn} has no spare parked in build(): its first tap compiles a program`);
  }
});

ok('a strike and a train are drawn from both sides (one-sided, every ribbon was culled)', () => {
  // 2026-10-19: layStrip winds a strip by the way its path runs, and every
  // strike and train came out wound away from the eye — the stormy sea's and
  // the neon city's taps drew nothing, and nothing said so
  assert.ok(/side: THREE\.DoubleSide/.test(fnBody(env, 'function ribbonMesh(')), 'the ribbon is one-sided again: three culls the strike and the train');
});

ok('every particle field is built lighter on a phone', () => {
  for (const { id } of worlds) {
    const b = branch(id);
    if (/(driftField|rainField|petalLayer|snowLayer)\(/.test(b)) assert.ok(/COARSE/.test(b), `${id}'s particles are not scaled for a touch device`);
  }
});

console.log('\nthe skies:');

ok('every sky ends in the colour-space encode and is authored as the final look', () => {
  for (const { id } of worlds) {
    const name = skyOf(id), sky = shader(name);
    assert.ok(sky.includes('#include <colorspace_fragment>'), `${name} writes raw light when the glow is off`);
    assert.ok(/pow\(max\(col, 0\.0\), vec3\(2\.2\)\)/.test(sky), `${name} is not converted from its authored look to linear`);
  }
  assert.ok(shader('BAKED_FRAG').includes('#include <colorspace_fragment>'));
});

ok('every sky draws its noise through the shared fbm, so the lightest mode caps it', () => {
  const noise = shader('NOISE');
  assert.ok(/uniform float uOctCap;/.test(noise) && /if \(float\(i\) >= uOctCap\)/.test(noise), 'the shared fbm no longer stops at uOctCap');
  for (const { id } of worlds) {
    const name = skyOf(id), sky = shader(name);
    assert.ok(sky.includes('${NOISE}'), `${name} does not take the shared noise`);
    assert.ok(!/float fbm\(/.test(sky) && !/uniform float uOctCap/.test(sky), `${name} has an fbm of its own, which the lightest mode cannot cap`);
  }
  assert.ok(/uOctCap: octCap/.test(build), 'the worlds are not handed the one octave ceiling');
});

ok('earthrise reads the window from the projection, so its Earth clears the orb on a phone and a desktop', () => {
  const vert = shader('MOON_VERT');
  assert.ok(/projectionMatrix\[0\]\[0\]/.test(vert) && /projectionMatrix\[1\]\[1\]/.test(vert) && /vEarth = /.test(vert));
  assert.ok(/skydome\(MOON_FRAG, u, MOON_VERT\)/.test(branch('moon')), 'the moon is drawn without its own vertex shader: the Earth has nowhere to hang');
});

ok('body.js hands the camera in, so a tap lands where the window can see it', () => {
  assert.ok(/createEnvironments\(\{ scene, renderer, camera,/.test(body));
});

ok('every room lights the dust (body.js ENV_DUST_GLOW)', () => {
  const glow = fnBody(body, 'const ENV_DUST_GLOW = {');
  for (const { id } of ENVIRONMENTS) assert.ok(new RegExp(`\\b${id}: \\[`).test(glow), `${id} has no light on the dust`);
});

ok("the header's count of kept worlds is the list's", () => {
  const head = env.slice(0, env.indexOf("import * as THREE from 'three';"));
  const said = /for all (\w+) together/.exec(head.replace(/\n\/\/ /g, ' '));
  const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
  assert.ok(said, 'the header no longer says what the kept worlds cost');
  assert.equal(said[1], WORD[worlds.length], 'the header counts the kept worlds wrong');
});

console.log('\nthe names:');

ok('every room is found by its name, its name in snake case, and its id', () => {
  for (const e of ENVIRONMENTS) {
    for (const said of [`background/${e.name}`, `room/${e.name.replace(/ /g, '_')}`, `/world/${e.id}`]) {
      const k = parseKommand(said);
      assert.ok(k && k.ok, `${said} is refused: ${k && k.why}`);
      assert.equal(k.room, e.id, `${said} found ${k.room}`);
    }
  }
});

ok('no two rooms share a word, or the first four letters of one', () => {
  // the grammar finds a room by one word of its name, or by four or more
  // letters of one — but only when a single room has it
  const ids = new Set(ENVIRONMENTS.map((e) => e.id));
  const pre = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
  for (const a of ENVIRONMENTS) {
    for (const wa of a.name.split(' ')) {
      assert.ok(!ids.has(wa) || wa === a.id, `"${wa}" in ${a.name} is another room's id, which wins`);
      for (const b of ENVIRONMENTS) {
        if (b === a) continue;
        for (const wb of b.name.split(' ')) {
          assert.notEqual(wa, wb, `${a.name} and ${b.name} share "${wa}"`);
          assert.ok(pre(wa, wb) < 4, `${a.name} and ${b.name} share "${wa.slice(0, pre(wa, wb))}"`);
        }
      }
    }
  }
});

ok('every word of every name, typed alone, finds its own room', () => {
  for (const e of ENVIRONMENTS) {
    for (const w of e.name.split(' ')) assert.equal(parseKommand(`background/${w}`)?.room, e.id, `background/${w}`);
  }
});

ok("the settings reference and the coder's orb tool both list every room", () => {
  const names = ENVIRONMENTS.map((e) => e.name);
  assert.deepEqual(kommandWords().rooms, names);
  assert.deepEqual(WORDS.rooms, names, 'y3k-code/orb.mjs teaches the coder a different set of rooms');
});

// THE SAND PLATE (2026-10-22): the one room with maths of its own
// (src/plate.mjs) and an ear. Its figure, its ladder, what a voice does to
// it, the bus the voice reaches it on, and the rule its strike's note keeps.
console.log('\nthe sand plate:');
const near = (a, b, what, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} is not ${b}`);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

ok("the figure is Chladni's: zero at the centre and on the diagonals, antisymmetric in x and y, and (1, 3) is straight lines", () => {
  for (const [n, m] of LADDER) {
    near(nodal(0, 0, n, m), 0, `(${n}, ${m}) at the centre`);
    near(nodal(0.3, 0.3, n, m), 0, `(${n}, ${m}) on the diagonal`);
    near(nodal(0.3, -0.3, n, m), 0, `(${n}, ${m}) on the other diagonal`);
    near(nodal(0.37, 0.11, n, m) + nodal(0.11, 0.37, n, m), 0, `(${n}, ${m}) turned`);
  }
  near(nodal(0.5, 0, 1, 2), 1, '(1, 2) at (1/2, 0): cos(pi/2) - cos(pi)');
  near(nodal(1, 0, 1, 2), -2, '(1, 2) at the cell edge');
  // (1, 3) = 4 cos(pi x) cos(pi y) (cos^2(pi y) - cos^2(pi x)): the lines x = 1/2, y = 1/2, x + y = 1
  near(nodal(0.5, 0.123, 1, 3), 0, '(1, 3) on x = 1/2');
  near(nodal(0.25, 0.75, 1, 3), 0, '(1, 3) on x + y = 1');
  assert.ok(Math.abs(nodal(0.25, 0.5, 2, 3)) > 0.1, '(2, 3) is not (1, 3)');
  near(nodal(0.3, 0.7, 2, 2), 0, 'n = m is no figure at all');
});

ok("the ladder climbs by the plate's own frequency: fourteen coprime rungs from (1, 2) to (5, 6)", () => {
  assert.equal(LADDER.length, 14);
  assert.equal(RUNGS, 13);
  assert.deepEqual(LADDER.slice(0, 4), [[1, 2], [1, 3], [2, 3], [1, 4]]);
  assert.deepEqual(LADDER[RUNGS], [5, 6]);
  for (let i = 1; i < LADDER.length; i++) {
    const [a, b] = LADDER[i - 1], [c, d] = LADDER[i];
    assert.ok(a * a + b * b <= c * c + d * d, `rung ${i} falls`);
  }
  for (const [n, m] of LADDER) { assert.ok(n < m); assert.equal(gcd(n, m), 1, `(${n}, ${m}) is a lower rung drawn smaller`); }
  assert.ok(!LADDER.some(([n, m]) => n === 2 && m === 4), '(2, 4) is (1, 2) drawn twice as fine, not a rung');
});

ok('between two rungs the figure is the mix of their two functions, and the ends hold', () => {
  assert.deepEqual(modeAt(0), { a: [1, 2], b: [1, 3], blend: 0 });
  assert.deepEqual(modeAt(1.25), { a: [1, 3], b: [2, 3], blend: 0.25 });
  assert.deepEqual(modeAt(RUNGS), { a: [5, 6], b: [5, 6], blend: 0 });
  assert.deepEqual(modeAt(99), { a: [5, 6], b: [5, 6], blend: 0 });
  assert.deepEqual(modeAt(-3), { a: [1, 2], b: [1, 3], blend: 0 });
  assert.deepEqual(modeAt('x'), { a: [1, 2], b: [1, 3], blend: 0 });
  // the sky mixes the two FUNCTIONS: a pair halfway between (1, 3) and (2, 3) is no figure of Chladni's
  assert.ok(/mix\(figure\(q, uModeA\), figure\(q, uModeB\), uBlend\)/.test(shader('PLATE_FRAG')));
});

ok('a voice moves it: silence settles the sand, speech lifts it; a low note is the simplest figure, a bright one the finest', () => {
  assert.equal(agitationOf(0), 0);
  assert.equal(agitationOf(QUIET), 0);
  assert.equal(agitationOf(LOUD), 1);
  assert.equal(agitationOf(1), 1);
  assert.equal(agitationOf(-1), 0);
  // the measured medians (plate.mjs): his word stirs it, hers lifts nearly every grain
  assert.ok(agitationOf(0.26) > 0.3 && agitationOf(0.26) < 0.45, 'Daniel median: ' + agitationOf(0.26));
  assert.ok(agitationOf(0.55) > 0.95, 'Samantha median: ' + agitationOf(0.55));
  let last = 0;
  for (let v = 0; v <= 1.0001; v += 0.01) { assert.ok(agitationOf(v) >= last, 'not monotone at ' + v); last = agitationOf(v); }
  assert.equal(rungOf(0), 0);
  assert.equal(rungOf(PITCH_LO), 0);
  assert.equal(rungOf(PITCH_LO / 2), 0);
  assert.equal(rungOf(PITCH_HI), RUNGS);
  assert.equal(rungOf(3400), RUNGS, 'a sibilant pins it at the top');
  near(pitch01(Math.sqrt(PITCH_LO * PITCH_HI)), 0.5, 'an octave is the same step anywhere');
  // the measured voices land mid-ladder with room to move either way: her
  // 5th / 50th / 95th percentile 509 / 754 / 1098 Hz, his 678 / 995 / 1675
  const her = rungOf(754), him = rungOf(995);
  assert.ok(her > 4 && her < 7, 'Samantha median rung ' + her);
  assert.ok(him > 6 && him < 9, 'Daniel median rung ' + him);
  assert.ok(rungOf(509) > 1 && rungOf(1098) < 11 && rungOf(1675) > 11, 'a sentence should cover six rungs or more');
});

ok('the dominant frequency is the centroid of the speech band, in magnitudes; silence and a floor are 0', () => {
  const binHz = 44100 / 512;
  const spec = new Uint8Array(256);
  assert.equal(dominantHz(spec, binHz), 0);
  spec.fill(40);
  assert.equal(dominantHz(spec, binHz), 0, 'a floor is not a voice');
  spec[9] = 255;
  const one = dominantHz(spec, binHz);
  // within a bin of its own frequency: the floor's forty-odd bins pull it a
  // little toward the band's middle, which is a centroid being a centroid
  assert.ok(Math.abs(one - 9 * binHz) < binHz, 'one loud bin: about its own frequency, got ' + one);
  // a second, quieter bin pulls it toward itself, by its magnitude: 230 is
  // 0.45 of 255 as a magnitude (10^(-25 * 0.0137)), so the centre sits well
  // short of midway (14.5)
  spec[20] = 230;
  const two = dominantHz(spec, binHz);
  assert.ok(two > 11 * binHz && two < 14 * binHz, '' + (two / binHz));
  assert.equal(dominantHz(null, binHz), 0);
  assert.equal(dominantHz(spec, 0), 0);
  // the band: a bin above 4 kHz (bin 47 and up) weighs nothing
  const hi = new Uint8Array(256); hi[60] = 255;
  assert.equal(dominantHz(hi, binHz), 0);
});

ok("left alone it wanders slowly inside the ladder, and the browser's voice is given a cadence in the voice's own units", () => {
  let lo = 99, hi = -1;
  for (let t = 0; t < 600; t += 0.5) {
    const s = idleRung(t);
    assert.ok(s >= 0 && s <= RUNGS);
    assert.ok(Math.abs(idleRung(t + 5) - s) < 1.2, 'more than a rung in five seconds at ' + t);
    lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  assert.ok(hi - lo > RUNGS * 0.5, 'ten minutes should cover most of the ladder: ' + (hi - lo));
  for (let t = 0; t < 20; t += 0.05) {
    const { level, hz } = cadence(t);
    assert.ok(level >= 0.1 && level <= 0.42, 'a cadence level ' + level);
    assert.ok(level > QUIET, 'a cadence is never silence');
    assert.ok(hz > 150 && hz < 1200, 'a cadence note ' + hz);
  }
});

ok('the plate hears through one bus: every voice meter measures, the body hands on, the worlds listen', () => {
  assert.match(voice, /^import \{ dominantHz \} from '\.\/plate\.mjs';/m);
  assert.equal((voice.match(/getByteFrequencyData\(spec\)/g) || []).length, 3, 'a meter in voice.js (mic, speakAudio, speaker) does not read the spectrum');
  assert.equal((voice.match(/, dominantHz\(spec, binHz\)\);/g) || []).length, 3, 'a meter does not hand the frequency on beside the level');
  assert.match(body, /setAudioLevel\(v, hz = 0\) \{ audioTarget = Math\.max\(0, Math\.min\(1, v\)\); envs\.hear\(\{ level: audioTarget, hz \}\); \}/);
  assert.match(body, /setSpeaking\(on\) \{ speakingBoost = on \? 0\.35 : 0; envs\.hear\(\{ speaking: !!on \}\); \}/);
  assert.ok(!/onLevel: \(v\) =>/.test(main), 'a speaker in main.js drops the frequency on the floor');
  assert.ok((main.match(/onLevel: \(v, hz\) =>/g) || []).length >= 5, 'every speaker in main.js hands both numbers to the body');
  const api = fnBody(env, 'const api = {');
  assert.ok(/\n\s*hear,\n/.test(api), 'the worlds have no ear');
  assert.ok(api.includes("if (current === 'plate') plateTick(dt, t);"), 'the plate is not ticked');
  const pt = fnBody(env, 'function plateTick(dt, t) {');
  for (const said of ['cadence(t)', 'agitationOf(level)', 'rungOf(hz)', 'idleRung(t)', 'modeAt(plate.s)', 'level > QUIET && hz > 0']) assert.ok(pt.includes(said), 'plateTick lost ' + said);
  assert.ok(/ease\(dt, want > plate\.agit \? 0\.04 : 0\.35\)/.test(pt), 'the sand no longer lifts at once and settles slowly');
  assert.ok(/plate\.silentFor > 1\.5/.test(pt), 'the wander no longer waits for a silence');
});

ok("a strike rings only through a voice context that is already running, never one of its own, and never leaves the figure where it was", () => {
  // (the whole head: fnBody opens at the first brace after it, and ring's parameters are one)
  const ring = fnBody(voice, 'function ring({ hz = 440, seconds = 1.5, gain = 0.10 } = {}) {');
  assert.ok(ring.includes("if (!audioCtx || audioCtx.state !== 'running') return false;"), 'the note no longer waits for an open, running path');
  assert.ok(!/getCtx\(|AudioContext|resume\(/.test(ring), 'a strike opens or wakes a path of its own');
  assert.match(voice, /^\s*ring,\s+\/\/ a world's sound/m);
  assert.match(main, /body\.setWorldSound\(\(o\) => voice\.ring\(o\)\)/);
  assert.match(body, /sound: \(o\) => worldSound && worldSound\(o\)/);
  const st = fnBody(env, 'function strike() {');
  assert.ok(/sound\(\{ hz: PLATE_HZ \* Math\.sqrt\(\(n \* n \+ m \* m\) \/ 5\), seconds: 1\.6 \}\)/.test(st), "the note is not the rung's");
  assert.ok(/if \(to >= was\) to \+= 1;/.test(st), 'a strike may leave the figure on its rung');
  assert.ok(/plate\.agit = Math\.max\(plate\.agit, 0\.55\)/.test(st), 'the whole plate no longer jumps at a strike (or jumps so hard the ring is lost)');
});

ok("the plate's sky reads the two rungs, the blend, the agitation and the ring, and is given each at build", () => {
  const sky = shader('PLATE_FRAG');
  for (const u of ['uModeA', 'uModeB', 'uBlend', 'uAgit', 'uRipple']) {
    assert.ok((sky.match(new RegExp('\\b' + u + '\\b', 'g')) || []).length >= 2, u + ' is declared and never read, or read and never declared');
    assert.ok(branch('plate').includes(`u.${u} = `), `${u} is not given to the sky when the plate is built`);
  }
  assert.ok(sky.includes('ca.x * cb.y - cb.x * ca.y'), "the sky's figure is not Chladni's");
  assert.ok(/float dist = abs\(F\.x\) \/ grad;/.test(sky), 'the band is no longer measured as a distance to the line');
  assert.ok(!/driftField|snowLayer|rainField|petalLayer/.test(branch('plate')), 'the plate grew particles: its branch says why not');
});

// ---------------------------------------------------------------------------
// THE PRESENCE CHOOSES ITS ROOM (2026-10-30). <<room: snowy taiga>> after its
// words; the eclipse behind it in the same block. One lookup with the kommand
// (roomOf), the done event carries it home, the page applies it as the kommand
// always has, and the page tells the brain which room is on screen so the
// readout never lies about where it is.
console.log('\nthe presence chooses its room (<<room: …>>):');
const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
const srv = readFileSync(new URL('server.mjs', ROOT), 'utf8');
const brain = readFileSync(new URL('src/brain.js', ROOT), 'utf8');
const tendSrc = readFileSync(new URL('src/tend.js', ROOT), 'utf8');

ok('a room by its name, by one word of it, by its id, and the metal room by home', () => {
  assert.deepEqual(parseRoom('<<room: snowy taiga>>'), { env: 'taiga', eclipse: null });
  assert.deepEqual(parseRoom('<<room: taiga>>'), { env: 'taiga', eclipse: null });
  assert.deepEqual(parseRoom('<<room: deep space>>'), { env: 'space', eclipse: null });
  assert.deepEqual(parseRoom('<<room: Clouds>>'), { env: 'cloudsea', eclipse: null });
  assert.deepEqual(parseRoom('<<room: home>>'), { env: 'room', eclipse: null });
  assert.deepEqual(parseRoom('<<room: metal room>>'), { env: 'room', eclipse: null });
  assert.deepEqual(parseRoom('<<room=snowy_taiga>>'), { env: 'taiga', eclipse: null });
  for (const e of ENVIRONMENTS) assert.equal(parseRoom(`<<room: ${e.name}>>`)?.env, e.id, e.name);
});

ok('a reason after the name still lands on the room; a room that is not one is nothing', () => {
  assert.equal(parseRoom('<<room: taiga — it is quiet there>>').env, 'taiga');
  assert.equal(parseRoom('<<room: the stormy sea, please>>').env, 'storm', '"the" is a word of "above the clouds", and must not win');
  assert.equal(parseRoom('<<room: the clouds>>').env, 'cloudsea');
  assert.equal(parseRoom('<<room: up in the neon>>').env, 'neon');
  assert.equal(parseRoom('<<room: narnia>>'), null, 'a hallucinated room must never reach the page');
  assert.equal(parseRoom('<<room: >>'), null);
  assert.equal(parseRoom('no block here'), null);
  assert.equal(parseRoom('<<liquid: glass>>'), null);
});

ok('the eclipse: hung, taken down, on its own', () => {
  assert.deepEqual(parseRoom('<<room: deep space, eclipse>>'), { env: 'space', eclipse: true });
  assert.deepEqual(parseRoom('<<room: eclipse>>'), { env: null, eclipse: true });
  assert.deepEqual(parseRoom('<<room: no eclipse>>'), { env: null, eclipse: false });
  assert.deepEqual(parseRoom('<<room: taiga no eclipse>>'), { env: 'taiga', eclipse: false });
});

ok('the block is stripped from the speech and never spoken', () => {
  assert.equal(stripRoom('here <<room: taiga>> there'), 'here  there');
  assert.equal(scrubTags('[calm] I will wait by the trees. <<room: snowy taiga>>'), 'I will wait by the trees.');
});

ok('the streaming parser hands the room out of end(), and strips it before the paint is read', () => {
  const said = [];
  const p = makeLeadStreamParser({ onMood() {}, onForm() {}, onText: (t) => said.push(t), onPaint: () => { throw new Error('a room read as paint'); } });
  p.push('[calm] Come with me. <<room: snowy taiga, eclipse>>');
  const r = p.end();
  assert.deepEqual(r.room, { env: 'taiga', eclipse: true });
  assert.equal(said.join('').trim(), 'Come with me.');
  assert.ok(/room: parseRoom\(post\)/.test(tags) && /stripRoom\(stripBody\(stripScore\(stripLiquid\(stripShape\(/.test(tags), 'end() drops the room, or the paint reads it');
});

ok('the kommand says it too: background/taiga, eclipse — one lookup, two speakers', () => {
  const k = parseKommand('background/taiga, eclipse');
  assert.ok(k.ok); assert.equal(k.room, 'taiga'); assert.equal(k.eclipse, true); assert.equal(k.said, 'background/taiga,eclipse');
  const e = parseKommand('background/eclipse');
  assert.ok(e.ok && e.room === undefined && e.eclipse === true, 'the eclipse alone keeps the room');
  assert.equal(parseKommand('room/no eclipse').eclipse, false);
  assert.equal(parseKommand('background/snowy taiga').eclipse, undefined);
  assert.ok(!parseKommand('background/narnia, eclipse').ok, 'a room that is not one is refused, eclipse or not');
});

ok('the server reads it off every reply and sends it home on the done event', () => {
  assert.ok(/const rm = parseRoom\(text\);\n\s*if \(rm\) out\.room = rm;/.test(srv), 'replyFrom drops the room');
  assert.ok(/invite, room: roomOut \} = parser\.end\(\);/.test(srv), 'the stream route drops the room');
  assert.ok(/body: bodyOut, room: roomOut,/.test(srv), 'the done event has no room on it');
  assert.ok(/body: out\.body, room: out\.room,/.test(srv), 'the non-stream route drops the room');
});

ok('the page applies it as the kommand always has — Settings → Room, and it stays', () => {
  assert.ok(/export function applyRoom\(r\)/.test(main) && /settings\.setRoom\(patch\)/.test(main), 'applyRoom is gone');
  assert.ok(/if \(room\) applyRoom\(room\);/.test(main), 'a turn that moves the room moves nothing');
  assert.ok(/applyRoom\(\{ env: k\.room \|\| null, eclipse: k\.eclipse \?\? null \}\)/.test(main), 'the kommand lost its room, or never got its eclipse');
  assert.ok(/if \(r\.room\) m\.applyRoom\(r\.room\);/.test(tendSrc), 'a beat that moves the room moves nothing');
  assert.ok(/if \(p\.room && typeof p\.room === 'object'\) room = p\.room;/.test(brain) && /invite, speed, room \};/.test(brain), 'brain.js reads no room off the done event');
  assert.ok(/room: r\.room && typeof r\.room === 'object' \? r\.room : null/.test(brain), 'the non-stream reply drops the room');
});

ok('the page says which room is on screen, and the readout names it — honest senses', () => {
  assert.ok(/room\(\) \{ return lastEnv; \}/.test(body), 'the body does not say which room it is in');
  assert.ok(/room: body\.room\?\.\(\)/.test(main) && /room: body\.room\?\.\(\)/.test(tendSrc), 'a turn is sent without the room');
  assert.ok(/if \(room\) body\.room = room;/.test(brain), 'brain.js does not put the room on the wire');
  assert.ok(/const WORN_HINT = \(w, room = null\) =>/.test(srv) && srv.includes("${room ? `\n- the room: ${room}` : ''}"), 'the readout cannot name the room');
  assert.equal((srv.match(/WORN_HINT\(worn\.readout\(presence\.id\), roomName\(roomHere\)\)/g) || []).length, 2, 'both chat routes name the room');
  assert.equal((srv.match(/\broom: roomHere\b[^\n]*\} = await readJsonBody\(req, BRAIN_BODY_MAX\)/g) || []).length, 2, 'both chat routes read it off the request');
  assert.ok(/const roomName = \(id\) => \(typeof id === 'string' && ENVIRONMENTS\.find\(\(e\) => e\.id === id\)\?\.name\) \|\| null;/.test(srv), 'a room id is not turned into its name');
});

ok('the lesson teaches the word, names every room from the list, and the brief holds the key', () => {
  const at = srv.indexOf('THE ROOM ITSELF.');
  assert.ok(at > 0 && at < srv.indexOf("THE ROOM'S LIQUID."), 'the room is taught after its liquid, or not at all');
  assert.ok(/const ROOM_NAMES = ENVIRONMENTS\.map\(\(e\) => e\.name\)\.join\(', '\);/.test(srv) && srv.slice(at, at + 400).includes('${ROOM_NAMES}'), 'the lesson names the rooms by hand');
  assert.ok(srv.indexOf('const ROOM_NAMES') < srv.indexOf('const SYSTEM'), 'ROOM_NAMES is read before it exists (the server does not start)');
  const lesson = srv.slice(at, at + 1200);
  assert.ok(lesson.includes('<<room: deep space, eclipse>>') && lesson.includes('no eclipse'), 'the eclipse is not taught');
  assert.ok(/<<room: snowy taiga>> is which room you are in/.test(srv), 'the brief does not hold the key');
  for (const m of lesson.matchAll(/<<room: ([^>]+)>>/g)) { const r = parseRoom(m[0]); assert.ok(r && (r.env || r.eclipse !== null), m[0] + ' parses to nothing'); }
});

console.log(`\n${passed} passed`);
