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
  // the flash factor's presence in the alpha product — other factors (vDim, the
  // dim move) follow it now, so the line no longer ends at vFlash
  assert.ok(/float alpha=[^;\n]*\*uDotFade\*vFlash\b/.test(body), 'the fragment alpha is not gated by the flash');
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
  assert.ok(/spin\(IDLE_SPEED \* idleTurn \* dtN, 0\)/.test(body), 'the idle spin no longer reads idleTurn (per 60th of a second)');
  assert.ok(/idleTurn = dir === 'still' \? 0 : \(dir === 'left' \? -1 : 1\) \* sp;/.test(body));
});

ok('THE TURN IS IN SECONDS: the same spin, fling and grace at 30, 60, 120 and 144 frames a second', () => {
  // The idle spin, the fling's decay and the grace before the spin resumes
  // were counted per FRAME: twice as fast on a 120Hz display, a hitch for
  // every dropped frame, and a 30fps ceiling would have halved them. The
  // function is lifted out of body.js as written and run at four rates.
  const start = body.search(/  function updateTrackball\(dtN(?:, k)?\) \{/);   // (k: a held face's arrival, shapes.test)
  assert.ok(start > 0, 'updateTrackball no longer takes the frame length');
  const src = body.slice(start, body.indexOf('\n  }\n', start) + 4);
  assert.ok(!/resumeTimer--|resumeTimer = 45/.test(body), 'the resume grace is counted in frames again');
  assert.ok(/updateTrackball\(dtN(?:, k)?\);/.test(body.slice(body.indexOf('  function frame() {'))), 'the loop does not hand the trackball its frame length');
  const rig = new Function('DAMP', 'IDLE_SPEED', `
    let halted = false, dragging = false, idleEnabled = true, idleTurn = 1;
    let velX = 0, velY = 0, resumeTimer = 0, turned = 0;
    const faceHeld = null, handPush = { held: false }, pinches = [null, null];   // no held face: the spin alone
    const spin = (x) => { turned += x; };
    ${src}
    return { step: updateTrackball, fling(v, grace) { velX = v; resumeTimer = grace; }, get turned() { return turned; } };`);
  const RESUME_S = +(/const RESUME_S = ([\d.]+);/.exec(body) || [])[1];
  assert.ok(RESUME_S > 0.5 && RESUME_S < 1, 'the grace is not the 0.75s the 45 frames meant');
  const run = (hz, seconds = 3) => {
    const t = rig(0.9, 0.0016);
    t.fling(0.05, RESUME_S);
    const dtN = Math.min(1 / hz, 0.1) * 60;
    for (let i = 0; i < Math.round(seconds * hz); i++) t.step(dtN);
    return t.turned;
  };
  // the old per-frame arithmetic, at 60Hz: the look that shipped
  let v = 0.05, grace = 45, shipped = 0;
  for (let i = 0; i < 180; i++) {
    if (Math.abs(v) > 1e-5) { shipped += v; v *= 0.9; }
    if (grace > 0) grace--;
    if (grace === 0) shipped += 0.0016;
  }
  assert.ok(Math.abs(run(60) - shipped) < 1e-9, `60fps no longer turns exactly as it shipped: ${run(60)} vs ${shipped}`);
  // one idle frame at 60Hz is the whole tolerance: where the grace ends inside a frame
  for (const hz of [30, 120, 144]) {
    assert.ok(Math.abs(run(hz) - shipped) < 0.0016 * 1.01, `${hz}fps turns ${run(hz).toFixed(4)} where 60 turns ${shipped.toFixed(4)}`);
  }
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
  // …and it revokes a HELD one too, or a trail asked for while the field was
  // thin would arrive after the field had refilled behind it
  assert.ok(/if \(fieldTarget\.keep > TRAIL_GATE\) \{ trailPending = 0; if \(trailByWord\) \{ this\.setTrail\(0\); trailByWord = false; \} \}/.test(sc), 'a refilling field does not revoke the trail, running or held');
  assert.ok(/if \(b\.count != null\) body\.setCount\(b\.count\);\s*\/\/ FIRST/.test(main), 'count is not applied before trail');
  assert.ok(main.indexOf('body.setCount(b.count)') < main.indexOf('body.setTrailWord(b.trail)'), 'trail is applied before the count it is gated on');
  // and a trail a PERSON set is not the grammar's to revoke
  assert.ok(/if \(trailByWord\) \{ this\.setTrail\(0\)/.test(sc), 'setCount revokes trails it did not set');
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
  // A window from the top of the lesson, wide enough to hold the body words
  // that precede the score's own — 'at' and 'fly' joined them (2026-09-26) and
  // pushed 'flash' past the old 1400 bytes. The intent is "taught in this
  // lesson, near its top", not a byte count; 1800 keeps that meaning.
  for (const w of ['count', 'turn', 'flash', 'hold', 'still']) assert.ok(new RegExp('\\b' + w + '\\b').test(srv.slice(srv.indexOf('const SCORE_HINT'), srv.indexOf('const SCORE_HINT') + 1800)), w + ' is never taught');
});

console.log('\nwhat the review of 2026-09-19 found:');

ok('the score and the body block reach the chat client — both ends and the wire', () => {
  const brain = readFileSync(new URL('src/brain.js', ROOT), 'utf8');
  // THE ONE THAT MATTERED. The server parsed both blocks, stripped them out of
  // the speech, and dropped them; the client read them off an event that never
  // carried them. Every <<over:>> and <<body:>> written in the chat did nothing
  // at all. Four links, and the chain is only as good as the weakest.
  const end = srv.slice(srv.indexOf('} = parser.end();') - 400, srv.indexOf('} = parser.end();'));
  assert.ok(/score: scoreOut/.test(end) && /body: bodyOut/.test(end), 'the server does not bind score/body out of parser.end()');
  const done = srv.slice(srv.indexOf("sse('done'"), srv.indexOf("sse('done'") + 400);
  assert.ok(/score: scoreOut/.test(done), 'the done event drops the score');
  assert.ok(/body: bodyOut/.test(done), 'the done event drops the body block');
  assert.ok(/if \(p\.score\) score = p\.score;/.test(brain), 'the client never reads the score off done');
  assert.ok(/if \(p\.body\) bodyBlock = p\.body;/.test(brain), 'the client never reads the body block off done');
  assert.ok(/paint: anchors, shape, score, body: bodyBlock, invite \}/.test(brain), 'the stream return drops them again');
  assert.ok(/score: r\.score \|\| null, body: r\.body \|\| null/.test(brain), 'the non-stream fallback drops them');
  // and the end the client consumes
  assert.ok(/score: scoreSteps = null, body: bodyBlock = null/.test(main), 'main.js no longer destructures them');
});

ok('a new intention cancels the old score at the START of the turn, on every path', () => {
  const turn = main.slice(0, main.indexOf('result = await streamCall({'));
  assert.ok(/score\.cancel\(\);\s*$/m.test(turn.slice(-400)), 'the chat cancel is not before the stream — a live score fights the whole reply');
  // THE REPLY PATH ONLY, and it has to be said which: a cancel anywhere after
  // the stream would kill the score the reply had just started. The kommand
  // runner further down the file also cancels, and must — a person typing a
  // shape is a new intention too, and a score still running would overwrite it
  // the next step. So the window ends where the reply path does.
  // (the runner's applying half is applyKommand, just above runKommand)
  const afterStream = main.slice(main.indexOf('result = await streamCall({'), main.indexOf('function applyKommand'));
  assert.ok(afterStream.length > 2000, 'the reply path can no longer be located — has the kommand runner moved above it?');
  assert.ok(!/score\.cancel\(\);/.test(afterStream), 'there is still a cancel after the stream');
  // the dance asks for scores more than anything else, and had no cancel at all
  const apply = tend.slice(tend.indexOf('function applyTurn'), tend.indexOf('function applyTurn') + 1800);
  assert.ok(/m\.scoreFor\(\)\.cancel\(\);/.test(apply), 'a dance beat does not cancel the running score — its steps outlive it');
  assert.ok(apply.indexOf('cancel()') < apply.indexOf('start(r.score'), 'the dance cancels after it starts, which cancels the new score');
  const stop = tend.slice(tend.indexOf('function stopAlive'), tend.indexOf('function stopAlive') + 1600);
  assert.ok(/scoreFor\(\)\.cancel\(\)/.test(stop), 'rest leaves the score ticking — the body goes on dancing with nothing awake behind it');
});

ok('a score step keeps the mood, form or scheme written after a shape or a liquid', () => {
  // the sub-block used to run to the next BODY word only, so a scheme after a
  // shape was swallowed whole with the shape's own text
  const a = parseScore('<<over: 2s shape ring 4 ember | still>>');
  assert.equal(a[0].scheme, 'ember', 'the scheme after a shape is eaten');
  assert.ok(a[0].shape && a[0].shape.shape === 'ring', 'the shape itself was lost');
  assert.equal(a[0].shape.a, 4, 'the shape lost its digit to the terminator');
  const b = parseScore('<<over: 2s liquid glass 4 excited | still>>');
  assert.equal(b[0].mood, 'excited', 'the mood after a liquid is eaten');
  const c = parseScore('<<over: 2s shape ring 4 count 3 | still>>');
  assert.equal(c[0].count, 3, 'a body word after a shape broke');
  const d = parseScore('<<over: 2s shape super 3 4 5 spin 2 @top 3 orb | still>>');
  assert.equal(d[0].form, 'orb', 'a form after a shape with ops and a mask is eaten');
  assert.equal(d[0].shape.ops.length, 1, 'the shape lost its move');
  assert.equal(d[0].shape.ops[0].mask, 'top', 'the move lost its mask');
});

ok('a trail waits for the field it needs, and never smears a full one', () => {
  const gate = body.slice(body.indexOf('setTrailWord(digit)'), body.indexOf('setTrailWord(digit)') + 1600);
  assert.ok(/fieldTarget\.keep > TRAIL_GATE/.test(gate), 'the intent gate is gone');
  assert.ok(/uniforms\.uKeep\.value > TRAIL_GATE/.test(gate), 'the gate reads the target only — count 3 trail 6 smears a full field for a second');
  assert.ok(/trailPending = d;/.test(gate), 'a trail the field is heading toward is refused outright instead of held');
  // the held trail is let in by the loop, and NOTHING the loop reads may be
  // declared below it (see applyTrail): frame() runs before `const api` exists
  assert.ok(/let trailPending = 0;/.test(body.slice(0, body.indexOf('function frame()'))), 'trailPending is declared below the frame loop that reads it');
  assert.ok(/function applyTrail\(seconds\) \{/.test(body.slice(0, body.indexOf('function frame()'))), 'applyTrail is not hoisted above the loop');
  const loop = body.slice(body.indexOf('function frame()'));
  assert.ok(/if \(trailPending && uniforms\.uKeep\.value <= TRAIL_GATE/.test(loop), 'the loop never lets a held trail in');
  assert.ok(!/api\.setTrail/.test(loop), 'the loop reaches through api — a temporal-dead-zone throw that kills the whole body');
});

console.log('\nthe frame keeps time (the smooth pass, 2026-09-26):');

// The shader strings with their comments taken out: several comments quote
// the very expressions these guards forbid, to say why they are gone.
const glsl = (name) => {
  const at = body.indexOf(`const ${name} = /* glsl */\``);
  assert.ok(at > 0, `${name} moved`);
  return body.slice(at, body.indexOf('`;', at)).replace(/\/\/[^\n]*/g, '');
};
const frameSrc = body.slice(body.indexOf('  function frame() {'), body.indexOf('\n  }\n', body.indexOf('  function frame() {')));

ok('A MOOD CHANGES HOW FAST THE FIELD MOVES, NEVER WHERE IT IS — the static on every mood change', () => {
  // The noise was sampled at z = uTime * uSpeed, and uSpeed eases on every
  // mood, beat and score step: a change of speed moved the whole field by
  // (seconds the page had been open) x (the change). Ten minutes in, calm to
  // excited swept the surface through hundreds of units of noise in half a
  // second — static that grew with the age of the session, and so never
  // showed right after a reload. The phases are integrated on the CPU now.
  const vert = glsl('VERT'), line = glsl('LINE_VERT');
  for (const [name, src] of [['VERT', vert], ['LINE_VERT', line]]) {
    assert.ok(!/uTime\s*\*\s*uSpeed|uTime\s*\*\s*uHueFlow/.test(src), `${name} multiplies the clock by an eased speed again`);
    assert.ok(/fbm\(dir\*uFreq\+uMotionAt\)/.test(src), `${name} does not ride the integrated motion phase`);
  }
  assert.ok(/fbm\(dir\*uCFreq\+uHueAt\)/.test(vert), 'the colour bands do not ride the integrated hue phase');
  assert.ok(/uMotionAt\*0\.6/.test(vert), 'the plasma ribbons left the motion phase (they were t*0.6)');
  assert.equal((body.match(/uMotionAt: uniforms\.uMotionAt/g) || []).length, 2, 'both line layers must share the phase by reference, or the web tears off the dots');
  // integrated AFTER the ease loop, at the speed it just eased, by the clamped step
  const loopEnd = frameSrc.indexOf('u.value = v;');
  const mAt = frameSrc.indexOf('motionPhase = (motionPhase + step * uniforms.uSpeed.value) % PHASE_LOOP;');
  const hAt = frameSrc.indexOf('huePhase = (huePhase + step * uniforms.uHueFlow.value) % PHASE_LOOP;');
  assert.ok(loopEnd > 0 && mAt > loopEnd && hAt > loopEnd, 'the phases are not integrated from the eased speeds, after the ease');
  for (const decl of ['const PHASE_R = 64, PHASE_LOOP', 'let motionPhase = 0, huePhase = 0;', 'function phaseOnCircle(']) {
    assert.ok(body.indexOf(decl) > 0 && body.indexOf(decl) < body.indexOf('  function frame() {'), `${decl} is below the loop that reads it (TDZ)`);
  }
  // THE MEASUREMENT: ten minutes at calm, then the eased change to excited,
  // at 60fps. The old coordinate against the one the shader now gets.
  const speed = (m) => +new RegExp(`${m}:\\s*\\{[^}]*speed: ([\\d.]+)`).exec(body)[1];
  const PHASE_R = 64, PHASE_LOOP = 2 * Math.PI * PHASE_R;
  const fnAt = body.indexOf('function phaseOnCircle(');
  const phaseOnCircle = new Function('PHASE_R', `${body.slice(fnAt, body.indexOf('\n  }\n', fnAt) + 4)}; return phaseOnCircle;`)(PHASE_R);
  const v3 = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
  const on = (phi) => { const o = v3(); phaseOnCircle(phi, o); return o; };   // it writes into the vector it is given
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const dt = 1 / 60, calm = speed('calm'), excited = speed('excited');
  let sp = calm, t = 600, phase = (600 * calm) % PHASE_LOOP;
  let worstOld = 0, worstNew = 0;
  const prev = on(phase);
  for (let i = 0; i < 120; i++) {
    const oldBefore = t * sp;
    sp += (excited - sp) * 0.1;                        // the ease, roughly settle's pace
    t += dt; phase = (phase + dt * sp) % PHASE_LOOP;
    worstOld = Math.max(worstOld, Math.abs(t * sp - oldBefore));
    const now = on(phase);
    worstNew = Math.max(worstNew, dist(now, prev));
    prev.set(now.x, now.y, now.z);
  }
  assert.ok(worstOld > 20, `the old arithmetic no longer shows the jump (${worstOld.toFixed(1)}) — this measurement has lost its teeth`);
  assert.ok(worstNew <= dt * excited * 1.0001, `the field moved ${worstNew.toFixed(4)} in a frame; the fastest it may is ${(dt * excited).toFixed(4)}`);
  // and at a constant speed it is the straight line it always was, locally
  const a = on(100), b = on(100 + 0.5);
  assert.ok(Math.abs(dist(a, b) - 0.5) < 1e-4, 'the phase is not walked at its own speed');
  // the loop closes on itself: no seam when the phase wraps
  assert.ok(dist(on(PHASE_LOOP - 1e-9), on(0)) < 1e-6, 'the phase jumps where it wraps');
});

ok('THE LOOP DRAWS ON THE PACER\'S VSYNCS, TIMES ITSELF BY THEM, AND RESTS WHERE IT CANNOT BE SEEN', () => {
  assert.ok(/import \{ due[^}]*\} from '\.\/pace\.js';/.test(body), 'the orb does not ask the shared pacer');
  assert.ok(/const onVsync = \(ts\) => \{ rafTs = ts; frame\(\); \};/.test(body), 'the rAF timestamp is not captured for frame()');
  assert.ok(/^\s*requestAnimationFrame\(onVsync\);/.test(frameSrc.slice(frameSrc.indexOf('{') + 1)), 'frame() does not re-schedule itself first');
  const gate = frameSrc.indexOf('if (rafTs >= 0 && !due(rafTs)) return;'), dtAt = frameSrc.indexOf('const dt = ');
  assert.ok(gate > 0 && dtAt > gate, 'the pacer is not asked before dt is measured — a skipped vsync would be lost time');
  assert.ok(/const now = rafTs >= 0 \? rafTs : performance\.now\(\);/.test(frameSrc), 'dt is not measured on the vsync timestamp');
  assert.ok(!/THREE\.Clock|getElapsedTime|getDelta/.test(body.replace(/\/\/[^\n]*/g, '')), 'a wall clock read mid-frame is back');
  assert.ok(/const step = Math\.min\(dt, 0\.1\);\s*\n\s*uniforms\.uTime\.value \+= step;/.test(frameSrc), 'uTime takes an unclamped step');
  assert.ok(/envs\.tick\(step, envT\);/.test(frameSrc), 'the worlds do not run on the clamped clock');
  // behind the world view: not drawn, and back without a jump
  assert.ok(/if \(!warm \|\| cls\.contains\('in-world'\)\) \{ lastDrawAt = -1; return; \}/.test(frameSrc), 'the orb draws under the world view, or comes back with a jump');
  assert.ok(/const behind = quality\.half && \(cls\.contains\('panel-open'\) \|\| cls\.contains\('in-code'\)\);/.test(frameSrc), 'smooth does not halve the rate behind a panel or in Code');
  // the TDZ rule: frame() is first called during setup, resize() earlier still
  const firstFrame = body.indexOf('  function frame() {'), firstResize = body.indexOf('\n  resize();\n');
  for (const decl of ['let rafTs = -1;', 'const onVsync =', 'let lastDrawAt = -1;', 'let restNext = false;', 'let envT = 0;', 'let warm = false;', 'let memSkipped = false;', 'let paintJob = null;']) {
    assert.ok(body.indexOf(decl) > 0 && body.indexOf(decl) < firstFrame, `${decl} is declared below the loop that reads it`);
  }
  for (const decl of ['const quality = {', 'let resizedPending = false;', 'function targetPixelRatio(']) {
    assert.ok(body.indexOf(decl) > 0 && body.indexOf(decl) < firstResize, `${decl} is declared below resize(), which runs during setup`);
  }
});

ok('NO SHADER IS COMPILED ON THE FRAME THAT FIRST NEEDS IT', () => {
  const env = readFileSync(new URL('src/environments.js', ROOT), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.ok(/renderer\.debug\.checkShaderErrors = [^;]*debug/.test(body), 'every first use of a program is a synchronous driver round trip again');
  assert.ok(/typeof renderer\.compileAsync === 'function'/.test(body) && /else \{ renderer\.compile\(obj, camera, into\);/.test(body), 'compileAsync is not feature-detected with a fallback');
  // asked with has(), once: compileAsync's own get() warns on every call where the extension is missing
  assert.ok(/renderer\.extensions\?\.has\?\.\('KHR_parallel_shader_compile'\)/.test(body) && /if \(PARALLEL\) p = renderer\.compileAsync\(/.test(body), 'a browser without parallel compile gets a console warning per warm-up batch');
  // both outputs (the composer's target and the screen), and the passes the scene never shows
  for (const call of ['compileFor(scene, null)', 'compileFor(scene, rt)', 'compileFor(bloomOff, rt, bloomOff)', 'compileFor(bloomOn2, null, bloomOn2)', 'compileFor(trailScene, rt, trailScene)', 'compileFor(fadeScene, rt, fadeScene)']) {
    assert.ok(body.includes(call), `${call} is no longer warmed`);
  }
  // the glow-off path encodes like the glow-on one, so it looks the same
  for (const name of ['FRAG', 'LINE_FRAG']) assert.ok(/#include <colorspace_fragment>/.test(glsl(name)), `${name} writes raw light straight to the screen when the glow is off`);
  assert.equal((env.match(/#include <colorspace_fragment>/g) || []).length, (env.match(/gl_FragColor = /g) || []).length, 'a sky writes raw light when the glow is off');
  // pooled, never disposed: three destroys a program with its last material
  const kill = body.slice(body.indexOf('function killTile('), body.indexOf('\n', body.indexOf('function killTile(')));
  assert.ok(/tileSpare\.push/.test(kill) && !/dispose/.test(kill), 'a spent tile throws its program away again');
  assert.ok(!/function clear\(\)/.test(env) && /const worlds = new Map\(\)/.test(env), 'a world left is disposed again — the way back recompiles it');
  const retire = env.slice(env.indexOf('function retire('), env.indexOf('}', env.indexOf('function retire(')));
  assert.ok(!/dispose/.test(retire), 'a spent meteor or bubble burst throws its program away again');
});

ok('THE LIGHTEST MODE IS NUMBERS, NOT PROGRAMS — setQuality', () => {
  const vert = glsl('VERT'), line = glsl('LINE_VERT');
  for (const src of [vert, line]) assert.ok(/for\(int i=0;i<4;i\+\+\)\{ if \(float\(i\) >= uOct\) break;/.test(src), 'the octave cap is not a uniform break inside fbm');
  // culled nodes first, before any noise; plasma only when there is plasma
  const main0 = vert.indexOf('void main(){');
  const cull = vert.indexOf('if (aRank > uKeep)', main0);
  assert.ok(cull > main0 && cull < vert.indexOf('fbm(', main0) && cull < vert.indexOf('normalize(position)', main0), 'culled nodes pay for noise before they are culled');
  assert.ok(/if \(uPlasma > 0\.001\) \{\s*\n\s*float flow=fbm\(/.test(vert), 'the plasma fbm runs for every node outside the plasma form');
  assert.ok(/uniforms\.uOct\.value = lite \? 2 : 4;/.test(body) && /envs\.setDetail\(lite \? 'lite' : 'full'\);/.test(body), 'lite does not reach the orb and the skies');
  assert.ok(/const s = quality\.lite \? 0 :/.test(body), 'the lightest mode still allows a trail');
  assert.ok(/if \(prChanged\(targetPixelRatio\(w, h\)\)\) resize\(\);/.test(body), 'setQuality reallocates when nothing changed');
  // the resolution, as written, run at the shapes of screen that matter
  const at = body.indexOf('function targetPixelRatio(');
  const tpr = (q, dpr, coarse) => new Function('quality', 'COARSE', 'window', `${body.slice(at, body.indexOf('\n  }\n', at) + 4)}; return targetPixelRatio;`)(q, coarse, { devicePixelRatio: dpr });
  const budget = +(/const SMOOTH_BUDGET = ([\d.e]+);/.exec(body) || [])[1];
  assert.ok(budget > 2e6 && budget < 2.5e6, 'the smooth pixel budget moved');
  const stock = { maxDpr: 2, scale: 1, budget: 0 }, smooth = { maxDpr: 1.5, scale: 1, budget };
  assert.equal(tpr(stock, 2, false)(1440, 900), 2, 'the default is no longer the shipped min(dpr, 2)');
  assert.equal(tpr(stock, 3, true)(390, 844), 1.5, 'a phone is no longer capped at 1.5');
  for (const [w, h] of [[1920, 1080], [2560, 1440], [1440, 900]]) {
    const pr = tpr(smooth, 2, false)(w, h);
    assert.ok(w * h * pr * pr <= budget * 1.0001, `smooth at ${w}x${h} draws ${(w * h * pr * pr / 1e6).toFixed(2)}MP`);
  }
  assert.equal(tpr(smooth, 1, false)(1280, 800), 1, 'smooth shrinks a screen already under budget');
});

ok('CODE HEARS WHEN THE ORB HAS BEEN REDRAWN AT ITS NEW SIZE, and a Code resize is never "noise"', () => {
  const dispatch = frameSrc.indexOf("window.dispatchEvent(new Event('y3k:orb-resized'))");
  assert.ok(dispatch > frameSrc.indexOf('draw();'), 'y3k:orb-resized is announced before a frame is drawn at the new size');
  const rs = body.slice(body.indexOf('  function resize() {'), body.indexOf('  function resizeMaybe() {'));
  assert.ok(/resizedPending = true;/.test(rs), 'resize() does not mark the next frame as the one at the new size');
  const rm = body.slice(body.indexOf('  function resizeMaybe() {'), body.indexOf("window.addEventListener('resize', resizeMaybe);"));
  assert.ok(/if \(!inCode && w === lastW && Math\.abs\(h - lastH\) < 90/.test(rm), 'the 90px chrome filter swallows the Code column resizes');
});

ok('cheaper frames: no garbage in the loop, the claim and the paint in slices, the Room sliders redraw nothing they do not change', () => {
  assert.ok(/for \(const key of EASE_KEYS\) \{\s*\n\s*const u = EASE_U\[key\];/.test(frameSrc), 'the ease loop builds its uniform names every frame again');
  assert.ok(!/new THREE\.Vector[234]\(/.test(frameSrc), 'the frame allocates a vector');
  // the claim: fixed typed arrays, a byte per mote, and it stands aside for a late frame
  assert.ok(!/best\.push\(\[m, dot\]\)|new Set\(\)/.test(body.slice(body.indexOf('function startMemJob'), body.indexOf('function stepMemJob'))) && /const memBestD = new Float64Array\(MEM_BEST\);/.test(body), 'the memory claim allocates per mote again');
  assert.ok(/if \(late && !memSkipped\) memSkipped = true;/.test(frameSrc), 'the claim slice runs on a frame that is already late');
  // the paint: sliced, then handed over whole
  assert.ok(/if \(paintJob\) stepPaint\(\);/.test(frameSrc) && /colorAttr\.set\(paintBuf\);/.test(body), 'the palette is not laid down in slices and handed over whole');
  // the Room: panels only for brightness and grooves, seeded, in place; the glow reaches the light
  assert.ok(/if \(b !== panelsAt\.b \|\| g !== panelsAt\.g\)/.test(body), 'every Room slider rebuilds three 1024px textures again');
  const pt = body.slice(body.indexOf('function panelTexture('), body.indexOf('function panelTexture(') + 1600);
  assert.ok(!/Math\.random/.test(pt), 'the panels are re-rolled on every redraw — they flicker while a slider moves');
  assert.ok(/orbLight\.intensity = \(4\.0 \+ uniforms\.uAudio\.value \* 4\.0\) \* glowScale;/.test(frameSrc), 'the frame overwrites the Room glow slider');
});

console.log('\n' + passed + ' checks passed.\n');
