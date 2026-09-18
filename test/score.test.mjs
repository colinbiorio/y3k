// THE SCORE — time as a thing the presence can write. Run: node test/score.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseScore, parseBody, SCORE_MAX_STEPS, SCORE_MAX_SECONDS } from '../src/tags.mjs';
import { createScore, easeForSeconds } from '../src/score.js';

const ROOT = new URL('..', import.meta.url);
const body = readFileSync(new URL('src/body.js', ROOT), 'utf8');
const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
const tend = readFileSync(new URL('src/tend.js', ROOT), 'utf8');
const srv = readFileSync(new URL('server.mjs', ROOT), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('\nthe grammar:');

ok('a score is steps with durations, read to a tenth, and still closes it', () => {
  const s = parseScore('<<over: 3s hold | 2s ember tender | 0.34s flash 0.3 | still | 9s dusk>>');
  assert.equal(s.length, 3, 'still did not close the score');
  assert.deepEqual(s.map((x) => x.seconds), [3, 2, 0.3]);
  assert.deepEqual(s[1], { seconds: 2, scheme: 'ember', mood: 'tender' });
  assert.equal(s[2].flash, 0.3);
});

ok('a step with no duration is one tick — Ts — and a flash with no period is half a second', () => {
  const s = parseScore('<<over: ember | flash | 2 dusk>>');
  assert.equal(s[0].seconds, 0.1);
  assert.equal(s[1].flash, 0.5);
  assert.equal(s[2].seconds, 2, 'a bare number is seconds');
});

ok('a step can carry a whole shape and a whole liquid, and their digits are not read as body digits', () => {
  const s = parseScore('<<over: 2s shape super 7 1 5 twist 2 count 3 | 1s liquid glass heavy turn left 4>>');
  assert.equal(s[0].shape.shape, 'super');
  assert.deepEqual([s[0].shape.a, s[0].shape.b, s[0].shape.c], [7, 1, 5]);
  assert.equal(s[0].shape.ops[0].op, 'twist');
  assert.equal(s[0].count, 3, 'count after a shape was lost');
  assert.equal(s[1].liquid.material, 0.5, 'material is the axis value: mercury 0, glass 0.5, water 1');
  assert.deepEqual(s[1].turn, { dir: 'left', speed: 4 });
});

ok('THE BOUNDS: twelve steps, sixty seconds, thirty a step, a tenth at least', () => {
  const many = parseScore('<<over: ' + Array.from({ length: 20 }, () => '1s hold').join(' | ') + '>>');
  assert.equal(many.length, SCORE_MAX_STEPS);
  const long = parseScore('<<over: 30s hold | 30s hold | 30s hold>>');
  assert.equal(long.reduce((a, x) => a + x.seconds, 0), SCORE_MAX_SECONDS, 'a score can run past a minute');
  assert.equal(parseScore('<<over: 99s hold>>')[0].seconds, 30);
  assert.equal(parseScore('<<over: 0.01s hold>>')[0].seconds, 0.1);
  assert.equal(parseScore('<<over: 2s flash 9>>')[0].flash, 5, 'a flash period can be longer than the step is worth');
});

ok('the body block: count and turn, standing', () => {
  assert.deepEqual(parseBody('<<body: count 4 turn left 3>>'), { count: 4, turn: { dir: 'left', speed: 3 } });
  assert.deepEqual(parseBody('<<body: turn still>>'), { turn: { dir: 'still', speed: 0 } });
  assert.deepEqual(parseBody('<<body: turn right>>'), { turn: { dir: 'right', speed: 3 } });
  assert.equal(parseBody('<<body: nothing here>>'), null);
  assert.equal(parseScore('no block'), null);
});

ok('grain and trail are body words, and the sub-blocks stop at them', () => {
  assert.deepEqual(parseBody('<<body: grain 7 trail 5>>'), { grain: 7, trail: 5 });
  const st = parseScore('<<over: 2s shape sphere flow 5 2 trail 6 count 3>>')[0];
  assert.equal(st.shape.ops[0].op, 'flow');
  assert.equal(st.trail, 6, 'trail after a shape was eaten by the shape');
  assert.equal(st.count, 3);
});

console.log('\nthe sequencer, on a fake clock:');

ok('steps fire on time, in order, and the end fires exactly once', () => {
  const log = [];
  const sc = createScore((st) => log.push(st.end ? 'end' : st.tag));
  sc.start([{ seconds: 1, tag: 'a' }, { seconds: 0.5, tag: 'b' }, { seconds: 2, tag: 'c' }], 0);
  assert.deepEqual(log, ['a']);
  sc.tick(900); assert.deepEqual(log, ['a']);
  sc.tick(1000); assert.deepEqual(log, ['a', 'b']);
  sc.tick(1400); assert.deepEqual(log, ['a', 'b']);
  sc.tick(1500); assert.deepEqual(log, ['a', 'b', 'c']);
  sc.tick(3499); assert.deepEqual(log, ['a', 'b', 'c']);
  sc.tick(3500); assert.deepEqual(log, ['a', 'b', 'c', 'end']);
  sc.tick(9999); assert.deepEqual(log, ['a', 'b', 'c', 'end'], 'end fired twice');
  assert.equal(sc.running, false);
});

ok('a stalled clock catches up THROUGH every step, in order, rather than skipping to the last', () => {
  // a hidden tab: the colour the score was meant to pass through is still passed through
  const log = [];
  const sc = createScore((st) => log.push(st.end ? 'end' : st.tag));
  sc.start([{ seconds: 0.1, tag: 'a' }, { seconds: 0.1, tag: 'b' }, { seconds: 0.1, tag: 'c' }], 0);
  sc.tick(5000);
  assert.deepEqual(log, ['a', 'b', 'c', 'end']);
});

ok('cancel ends it once; a new start ends the old one first; an empty score does nothing', () => {
  const log = [];
  const sc = createScore((st) => log.push(st.end ? 'end' : st.tag));
  sc.start([{ seconds: 5, tag: 'a' }], 0);
  sc.cancel(); sc.cancel();
  assert.deepEqual(log, ['a', 'end']);
  sc.start([{ seconds: 5, tag: 'b' }], 0);
  sc.start([{ seconds: 5, tag: 'c' }], 0);
  assert.deepEqual(log, ['a', 'end', 'b', 'end', 'c']);
  assert.equal(sc.start([], 0), false);
  assert.equal(sc.start(null, 0), false);
});

ok('a duration becomes an ease that is 95% arrived when the step is over', () => {
  for (const D of [0.1, 0.5, 2, 10]) {
    const [k] = easeForSeconds(D);
    let v = 0; for (let f = 0; f < Math.round(60 * D); f++) v += (1 - v) * k;
    assert.ok(Math.abs(v - 0.95) < 0.01, `after ${D}s the ease is at ${v.toFixed(3)}, not 0.95`);
  }
  assert.ok(easeForSeconds(0.1)[1] <= 0.5, 'the plasma rate is unbounded at short steps');
});

console.log('\nthe wiring:');

ok('flash is a uniform the vertex turns into a varying that gates alpha in the fragment', () => {
  assert.ok(/uniform float uFlashPeriod;/.test(body));
  assert.ok(/vFlash = uFlashPeriod > 0\.0 \? mix\(0\.05, 1\.0, step\(0\.5, fract\(uTime \/ uFlashPeriod\)\)\) : 1\.0;/.test(body), 'the flash is not computed from uTime in the vertex');
  assert.ok(/uDotFade\*vFlash;/.test(body), 'the fragment alpha is not gated by the flash');
  assert.equal((body.match(/varying float vFlash;/g) || []).length, 2, 'vFlash is not declared in both shaders');
  assert.ok(/uFlashPeriod: \{ value: 0 \}/.test(body), 'no uniform slot');
});

ok('count is a log scale that reaches the whole field at 9 and a handful at 0', () => {
  const COUNT = 24000;
  const n = (d) => Math.max(1, Math.round(COUNT * Math.pow(10, -3 + d / 3)));
  assert.equal(n(9), COUNT);
  assert.ok(n(0) >= 1 && n(0) < 60, 'count 0 is ' + n(0));
  assert.ok(n(3) > 100 && n(3) < 500, 'count 3 is ' + n(3));
  assert.ok(n(6) > 1500 && n(6) < 3500, 'count 6 is ' + n(6));
  assert.ok(/Math\.pow\(10, -3 \+ d \/ 3\)/.test(body), 'the shader-side mapping is not the one tested here');
});

ok('TURN: idleTurn is declared ABOVE the loop that reads it, and drives the one spin line', () => {
  // presence FIRST: an indexOf of -1 is "before" everything, and the first
  // version of this guard passed with the declaration deleted outright
  const decl = body.indexOf('  let idleTurn = 1;');
  assert.ok(decl > -1, 'idleTurn is not declared at all');
  assert.ok(decl < body.indexOf('  function frame() {'), 'idleTurn is a TDZ on the first frame');
  assert.ok(/spin\(IDLE_SPEED \* idleTurn, 0\)/.test(body), 'the idle spin no longer reads idleTurn');
  assert.ok(/idleTurn = dir === 'still' \? 0 : \(dir === 'left' \? -1 : 1\) \* sp;/.test(body));
});

ok('A TRAIL ONLY EVER RUNS ON A SPARSE FIELD — gated on the count, in either word order', () => {
  // Over the full body the trail buffer is a solid white disc within frames.
  // The word is refused above the gate, and a field that refills past it takes
  // a grammar-set trail with it, so "trail 6 count 9" and "count 9 trail 6"
  // both end with no trail.
  assert.ok(/const TRAIL_GATE = 0\.1;/.test(body), 'no gate');
  const stw = body.slice(body.indexOf('setTrailWord(digit) {'), body.indexOf('setGrain(digit) {'));
  assert.ok(/if \(fieldTarget\.keep > TRAIL_GATE\)[^\n]*return false;/.test(stw), 'setTrailWord is not gated on the count');
  const sc = body.slice(body.indexOf('setCount(digit) {'), body.indexOf('setTrailWord(digit) {'));
  assert.ok(/if \(trailByWord && fieldTarget\.keep > TRAIL_GATE\) \{ this\.setTrail\(0\); trailByWord = false; \}/.test(sc), 'a refilling field does not revoke the trail');
  assert.ok(/if \(b\.count != null\) body\.setCount\(b\.count\);\s*\/\/ FIRST/.test(main), 'count is not applied before trail');
  assert.ok(main.indexOf('body.setCount(b.count)') < main.indexOf('body.setTrailWord(b.trail)'), 'trail is applied before the count it is gated on');
  // and a trail a PERSON set is not the grammar's to revoke
  assert.ok(/trailByWord && /.test(sc), 'setCount revokes trails it did not set');
});

ok('grain multiplies the point size, and 4 is the size that shipped', () => {
  assert.ok(/gl_PointSize=uSize\*0\.75\*uGrain\*/.test(body), 'uGrain is not in the point-size line');
  assert.ok(/uGrain: \{ value: 1 \}/.test(body));
  assert.ok(Math.abs((0.45 + 4 * 0.14) - 1) < 0.02, 'grain 4 is not the shipped size');
  for (const w of ['grain', 'trail', 'sparse field']) assert.ok(srv.slice(srv.indexOf('const SCORE_HINT')).includes(w), w + ' is never taught');
});

ok('MESH remaps dir at the top of BOTH shaders, before anything reads it, from the index alone', () => {
  assert.deepEqual(parseBody('<<body: mesh 9 glow 2>>'), { mesh: 9, glow: 2 });
  assert.equal((body.match(/if \(uMesh > 0\.001\)/g) || []).length, 2, 'the line layer would connect to where nodes used to be');
  for (const start of [body.indexOf('void main(){'), body.indexOf('void main(){', body.indexOf('const LINE_VERT'))]) {
    // presence before order, every time: an indexOf of -1 is "before" everything
    const head = body.slice(start, start + 4000);
    const remap = head.indexOf('if (uMesh > 0.001)'), noise = head.indexOf('fbm('), form = head.indexOf('shapeForm(');
    assert.ok(remap > -1, 'no mesh remap in a shader');
    assert.ok(noise > -1 && form > -1, 'could not find the noise and the form calls in this shader');
    assert.ok(remap < noise, 'the noise reads dir before the mesh remap');
    assert.ok(remap < form, 'shapes read dir before the mesh remap');
  }
  assert.ok(/float u = clamp\(\(1\.0 - dir0\.y\)/.test(body), "the line shader's index would move with the mesh");
  assert.ok(/uCount: \{ value: COUNT \}/.test(body), 'the shader does not know N');
  assert.equal((body.match(/uMesh: uniforms\.uMesh, uCount: uniforms\.uCount,/g) || []).length, 2, 'uMesh/uCount not shared by reference to both layers');
  assert.ok(body.indexOf('  let meshTarget = 0;') > -1 && body.indexOf('  let meshTarget = 0;') < body.indexOf('  function frame() {'), 'meshTarget: TDZ');
});

ok('GLOW is the bloom strength, eased, with 3 as the 0.8 that shipped, and bloom declared above the loop', () => {
  assert.ok(Math.abs((0.2 + 3 * 0.2) - 0.8) < 1e-9);
  assert.ok(/new UnrealBloomPass\(new THREE\.Vector2\(1, 1\), 0\.8,/.test(body), 'the shipped strength is no longer 0.8 — retune glow 3');
  assert.ok(/bloom\.strength = lerp\(bloom\.strength, glowTarget, k\);/.test(body), 'glow is not eased');
  const bl = body.indexOf('const bloom = new UnrealBloomPass'), fr = body.indexOf('  function frame() {');
  assert.ok(bl > -1 && bl < fr, 'bloom is declared after the frame loop that reads it');
  assert.ok(body.indexOf('  let glowTarget = 0.8;') > -1 && body.indexOf('  let glowTarget = 0.8;') < fr, 'glowTarget: TDZ');
  for (const w of ['mesh', 'glow', 'wireframe']) assert.ok(srv.slice(srv.indexOf('const SCORE_HINT')).includes(w), w + ' is never taught');
});

ok('a score is applied on the chat path and the dance path, and a new turn cancels the last', () => {
  assert.ok(/score\.cancel\(\);/.test(main), 'a new turn does not cancel a running score');
  assert.ok(/if \(scoreSteps\) score\.start\(scoreSteps, performance\.now\(\)\)/.test(main));
  assert.ok(/setInterval\(\(\) => \{ if \(score\.running\) score\.tick\(performance\.now\(\)\); \}, 100\)/.test(main), 'the score is not ticked at Ts');
  assert.ok(/if \(st\.end\) \{ body\.setFlash\(0\); body\.restoreMorph\(\); return; \}/.test(main), 'the end does not put the pace and the flash back');
  assert.ok(/m\.scoreFor\(\)\.start\(r\.score, performance\.now\(\)\)/.test(tend), 'the dance cannot play a score');
  assert.ok(/m\.applyBodyBlock\(r\.body\)/.test(tend));
});

ok('both server paths hand the score and the body block back, and the tail never speaks them', () => {
  const tags = readFileSync(new URL('src/tags.mjs', ROOT), 'utf8');
  assert.ok(/score: parseScore\(post\), body: parseBody\(post\)/.test(tags), 'the streaming end() drops the score');
  assert.ok(/stripBody\(stripScore\(stripLiquid\(stripShape\(/.test(tags), 'a score in the spoken tail would be read aloud');
  assert.ok(/const sc = parseScore\(text\); if \(sc\) out\.score = sc;/.test(srv), 'the non-stream path drops the score (or reads an undefined name)');
  assert.ok(/shape: out\.shape, score: out\.score, body: out\.body,/.test(srv), 'the tend result drops the score');
});

ok('THE WHOLE BODY IS IN THE BASE PROMPT, IN BRIEF — the keys are always in hand', () => {
  // Colin: why does it stick to the simple stuff? Because the rich lessons were
  // gated by path and the presence idled without knowing it had a body. The
  // grammar is parsed on every path, so a compact card in SYSTEM is the whole
  // fix: it costs ~120 tokens a beat, and that is the trade he asked for.
  const at = srv.indexOf('const SYSTEM = `');
  const sys = srv.slice(at, srv.indexOf('`;', at));
  assert.ok(/YOUR WHOLE BODY, IN BRIEF/.test(sys), 'the card is gone from SYSTEM — the presence idles in four forms again');
  for (const w of ['super M N N', 'hopf T F', 'calabi N A', 'pendulum E', 'count', 'turn', 'grain', 'trail', 'mesh', 'glow', '<<over:']) assert.ok(sys.includes(w), 'the card no longer names ' + w);
  // rich examples beside the simple ones — what the prompt SHOWS is what it gets
  const ex = sys.slice(sys.indexOf('Examples:'), sys.indexOf('Examples:') + 900);
  assert.ok(/<<shape: super 7 1 5>>/.test(ex) && /<<body: /.test(ex), 'the examples are all simple again');
  assert.ok(/\[calm\] Mm\. Go on\./.test(ex), 'the simple examples must stay too — restraint is half the lesson');
  // both halves of the sentence: use it, and no strobe
  assert.ok(/A still orb is a choice you can make, not a default you fall into; a strobe is not expression either/.test(sys), 'the balance sentence is gone');
  // the card must not trip the cost guards on the full lessons
  assert.ok(!/YOU CAN ALSO ARRANGE YOURSELF/.test(sys) && !/TIME ITSELF/.test(sys) && !/MOVE INSIDE A SENTENCE/.test(sys), 'a full lesson leaked into SYSTEM');
  // and the dance asks for scores
  assert.ok(/most beats should be a SCORE/.test(srv.slice(srv.indexOf('const DANCE_HINT'), srv.indexOf('const DANCE_HINT') + 3000)), 'the dance no longer asks for scores');
});

ok('taught on the chat and dance paths, and NOT in SYSTEM', () => {
  const at = srv.indexOf('const SYSTEM = `');
  const sys = srv.slice(at, srv.indexOf('`;', at));
  assert.ok(!/TIME ITSELF/.test(sys), 'the score grammar is in SYSTEM — that bills every autonomous beat');
  assert.ok(/DANCE_HINT \+ SCORE_HINT/.test(srv), 'the dance is not taught the score');
  assert.equal((srv.match(/BEAT_HINT \+ SCORE_HINT/g) || []).length, 4, 'the chat paths are not all taught the score');
  for (const w of ['count', 'turn', 'flash', 'hold', 'still']) assert.ok(new RegExp('\\b' + w + '\\b').test(srv.slice(srv.indexOf('const SCORE_HINT'), srv.indexOf('const SCORE_HINT') + 1400)), w + ' is never taught');
});

console.log('\n' + passed + ' checks passed.\n');
