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
import { parseKommand, kommandWords } from '../src/tags.mjs';
import { WORDS } from '../y3k-code/orb.mjs';

const ROOT = new URL('..', import.meta.url);
const env = readFileSync(new URL('src/environments.js', ROOT), 'utf8');
const body = readFileSync(new URL('src/body.js', ROOT), 'utf8');
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

console.log(`\n${passed} passed`);
