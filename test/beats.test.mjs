// The transient layer: a ~mark~ inline in the speech that moves the body at the
// moment those words arrive, and then lets go. Run: node test/beats.test.mjs
//
// The two properties worth guarding are the two that are easy to lose:
//   1. a mark is never SPOKEN and never SHOWN — it is motion or it is nothing;
//   2. a beat rides ON TOP of the state and never becomes part of it.
// (2) is the one that would rot silently: fold a transient into the value it is
// added to and the body keeps every beat it ever made, brighter and brighter,
// with nothing able to take it back.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { beatSplitter, stripBeats, scrubTags, BEATS, BEAT_NAMES, MAX_BEATS } from '../src/tags.mjs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// Run a reply through the splitter in the given chunking.
const run = (chunks) => {
  const s = beatSplitter();
  let text = ''; const beats = [];
  for (const c of chunks) { const r = s.push(c); text += r.text; beats.push(...r.beats); }
  const e = s.end(); text += e.text; beats.push(...e.beats);
  return { text, beats: beats.map((b) => b.beat + ':' + b.n) };
};
const chars = (s) => s.split('');
const words = (s) => s.split(/(?<=\s)/);

console.log('\nwhat the reader sees:');

ok('a mark is taken out of the words and turned into a beat', () => {
  const r = run(['I read it twice ~hush~ and then I understood.']);
  assert.equal(r.text, 'I read it twice and then I understood.');
  assert.deepEqual(r.beats, ['hush:5']);
});

ok('a digit says how much; no digit is the nominal 5', () => {
  assert.deepEqual(run(['a ~flare 8~ b']).beats, ['flare:8']);
  assert.deepEqual(run(['a ~flare~ b']).beats, ['flare:5']);
});

ok('THE RENDERED TEXT DOES NOT DEPEND ON WHERE THE STREAM WAS SPLIT', () => {
  // The one that actually bites in production: a chunk boundary inside a mark,
  // or between a mark and the space it should eat. A reader must never be able
  // to see where the network cut the reply.
  const line = 'I read it ~flare 7~ twice, and ~hush~ then I knew.';
  const whole = run([line]);
  for (const chunking of [chars(line), words(line), [line.slice(0, 11), line.slice(11)],
                          [line.slice(0, 18), line.slice(18)], [line.slice(0, 19), line.slice(19)]]) {
    const got = run(chunking);
    assert.equal(got.text, whole.text, 'text drifted with chunking');
    assert.deepEqual(got.beats, whole.beats, 'beats drifted with chunking');
  }
  assert.equal(whole.text, 'I read it twice, and then I knew.');
  assert.deepEqual(whole.beats, ['flare:7', 'hush:5']);
});

ok('honest prose that merely contains a tilde is left exactly alone', () => {
  for (const s of ['it takes ~5 minutes', 'x ~approximately~ y', 'a ~ b', '~', 'cost ~$40',
                   'the ~nope~ word', 'a~b~c']) {
    assert.equal(run([s]).text, s, s);
    assert.equal(run([s]).beats.length, 0, s);
    assert.equal(stripBeats(s), s, 'stripBeats: ' + s);
  }
});

ok('a dangling fragment at the end of a reply is spoken, not swallowed', () => {
  // The opposite trade from a truncated << block, and deliberately so: '~fla'
  // at the end of a cut-off reply is ordinary prose far more often than it is
  // half a mark.
  assert.equal(run(['I was about to say ~fla']).text, 'I was about to say ~fla');
});

ok('every name the prompt teaches is a name the splitter answers to', () => {
  const taught = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
    .match(/~([a-z]+)~/g).map((m) => m.slice(1, -1));
  assert.ok(taught.length >= 6, 'found no taught marks in the prompt');
  for (const name of new Set(taught)) {
    assert.ok(BEAT_NAMES.includes(name), 'prompt teaches ~' + name + '~, which does nothing');
    assert.deepEqual(run(['x ~' + name + '~ y']).beats, [name + ':5']);
  }
  // ...and nothing is implemented that the presence is never told about
  for (const name of BEAT_NAMES) assert.ok(taught.includes(name), '~' + name + '~ is never taught');
});

ok('a runaway reply cannot become work', () => {
  assert.equal(run(['~flare~'.repeat(MAX_BEATS + 40)]).beats.length, MAX_BEATS);
  // ...and the budget is per reply, not global
  assert.equal(run(['~flare~']).beats.length, 1);
});

ok('a beat written as 0 is silence, and is honoured as silence', () => {
  assert.deepEqual(run(['a ~flare 0~ b']).beats, ['flare:0']);   // parsed...
  assert.equal(run(['a ~flare 0~ b']).text, 'a b');              // ...and still not spoken
});

console.log('\nnever spoken, on every path:');

ok('scrubTags strips beats, so a reply that never streamed says no stage directions', () => {
  // The local brain and the non-stream fallback hand back a whole reply. Every
  // path that shows or speaks text runs through scrubTags, which is why the
  // guard lives there and not only in the splitter.
  assert.equal(scrubTags('I read it ~hush~ twice. ~flare 7~ It was mine.'),
               'I read it twice. It was mine.');
  assert.equal(scrubTags('takes ~5 minutes, ~roughly~ speaking'), 'takes ~5 minutes, ~roughly~ speaking');
});

ok('no beat name survives into spoken text, in any chunking', () => {
  const line = 'Yes ~flare 9~ — and ~shiver~ it holds ~draw 2~ still.';
  for (const chunking of [[line], chars(line), words(line)]) {
    const t = run(chunking).text;
    for (const n of BEAT_NAMES) assert.ok(!t.includes(n), 'spoke "' + n + '": ' + t);
    assert.ok(!t.includes('~'), 'a tilde survived: ' + t);
  }
});

ok('BEATS ARE TAUGHT ONLY WHERE THE REPLY STREAMS', () => {
  // A beat's whole meaning is the moment it lands on, which it can only have
  // while the words arrive one at a time. The tend path is a single fetch that
  // shows its line whole (tend.js applyTurn), so the same paragraph in SYSTEM
  // would bill every autonomous turn — hundreds an hour — for motion that
  // cannot happen there. This is the mistake this file was one commit from
  // shipping, and it is the same one the shape grammar already guards against.
  const srv = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  // the SYSTEM template itself, not everything up to the next const — BEAT_HINT
  // is declared between the two, and a slice by neighbour would swallow it
  const at = srv.indexOf('const SYSTEM = `');
  const sys = srv.slice(at, srv.indexOf('`;', at));
  assert.ok(!/MOVE INSIDE A SENTENCE/.test(sys), 'the beat grammar leaked into SYSTEM — that bills every autonomous turn');
  assert.ok(/const BEAT_HINT = `/.test(srv), 'BEAT_HINT is gone');
  // ...and it IS reaching the paths that do stream
  const opts = srv.match(/const opts = withClock\([\s\S]*?, tz\);/g) || [];
  assert.ok(opts.length >= 2, 'could not find the prompt assembly');
  for (const o of opts) assert.ok(/BEAT_HINT/.test(o), 'a streaming path no longer teaches beats');
  // ...and the tend branch of that same ternary must NOT carry it. Keyed on
  // `tendThought`, which is what MAKES it the tend branch: an earlier version of
  // this check first matched the branch on `SYSTEM + pExtra,` and then looked
  // for BEAT_HINT inside it — so adding BEAT_HINT removed the comma the match
  // needed, the branch was never found, and the assertion never ran at all.
  for (const line of srv.split('\n')) {
    if (/\.\.\.tendThought/.test(line)) assert.ok(!/BEAT_HINT/.test(line), 'the tend path is being billed for beats');
  }
});

console.log('\nthe transient never becomes the state:');

ok('every beat is a bounded offset, and the pairs really do oppose', () => {
  for (const [name, b] of Object.entries(BEATS)) {
    assert.ok(Object.keys(b).length, name + ' moves nothing');
    for (const [k, v] of Object.entries(b)) {
      assert.equal(typeof v, 'number', name + '.' + k);
      assert.ok(Math.abs(v) <= 2, name + '.' + k + ' is not an offset, it is a new state');
    }
  }
  const sign = (n, k) => Math.sign(BEATS[n][k] || 0);
  assert.equal(sign('flare', 'val'), -sign('hush', 'val'), 'flare/hush do not oppose');
  assert.equal(sign('swell', 'radius'), -sign('draw', 'radius'), 'swell/draw do not oppose');
});

ok('THE EASE LOOP SUBTRACTS THE LIVE OFFSET BEFORE IT EASES', () => {
  // The whole discipline in one line of body.js. Easing a value a beat is
  // riding on folds the transient into the state: the offset is added again
  // next frame on top of a base that already contains it, and the body keeps
  // every beat it ever made with nothing able to take it back.
  const src = readFileSync(new URL('../src/body.js', import.meta.url), 'utf8');
  const loop = src.slice(src.indexOf('for (const key of EASE_KEYS)'));
  const body = loop.slice(0, loop.indexOf('u.value = v;'));
  assert.ok(/lerp\(\s*u\.value\s*-\s*off\s*,/.test(body),
    'the ease no longer subtracts the beat offset before easing');
  assert.ok(/beatPeak\[key\]\s*=/.test(body) && /0,\s*kRel\)/.test(body),
    'the peak no longer collapses toward zero — a beat would never let go');
});

ok('HUE EASES THE SHORT WAY ROUND THE WHEEL', () => {
  // ember is 0.02 and dusk 0.92: a straight lerp between them is 0.90 of the
  // wheel through yellow, green and cyan; the short way is 0.10 through red.
  // A score puts the crossing itself on screen, which is how this was noticed.
  const src = readFileSync(new URL('../src/body.js', import.meta.url), 'utf8');
  const loop = src.slice(src.indexOf('for (const key of EASE_KEYS)'), src.indexOf('u.value = v;'));
  assert.ok(/if \(key === 'hueBase'\)[\s\S]{0,200}d -= Math\.round\(d\)/.test(loop), 'hueBase is lerped as a magnitude again — the long way round');
  // the mirror of that arithmetic, run both directions
  const step = (cur, tgt, k) => { let d = tgt - cur; d -= Math.round(d); let v = cur + d * k; return v - Math.floor(v); };
  for (const [a, b] of [[0.02, 0.92], [0.92, 0.02], [0.07, 0.92], [0.00, 0.80]]) {
    let h = a;
    for (let i = 0; i < 400; i++) {
      h = step(h, b, 0.045);
      assert.ok(!(h > 0.25 && h < 0.70), `from ${a} to ${b} the hue passed through ${h.toFixed(3)} — the long way`);
    }
    assert.ok(Math.abs(((h - b + 0.5) % 1 + 1) % 1 - 0.5) < 1e-3, `did not arrive at ${b} (at ${h.toFixed(4)})`);
  }
  // and a pair whose short way IS across the middle still crosses the middle
  let h = 0.34; for (let i = 0; i < 400; i++) h = step(h, 0.80, 0.045);
  assert.ok(Math.abs(h - 0.80) < 1e-3, 'verdant to synthwave did not arrive');
});

ok('a spent beat lets go completely rather than leaving a millionth behind', () => {
  const src = readFileSync(new URL('../src/body.js', import.meta.url), 'utf8');
  assert.ok(/Math\.abs\(now\)\s*<\s*1e-4\s*\?\s*0/.test(src), 'beatOff never reaches exactly zero');
  assert.ok(/Math\.abs\(peak\)\s*<\s*1e-4\s*\?\s*0/.test(src), 'beatPeak never reaches exactly zero');
});

ok('a beat is fired from the stream, not from the finished reply', () => {
  // If main.js ever fires beats off the whole speech instead of the stream,
  // they all land at once on the last frame and the feature is a flash.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(/beatSplitter\(\)/.test(main), 'main.js no longer makes a splitter');
  assert.ok(/onText:[\s\S]{0,240}beats\.push\(t\)/.test(main), 'beats are no longer fed by onText');
  assert.ok(/beats\.end\(\)/.test(main), 'text held behind a possible mark is never released');
});

console.log('\n' + passed + ' checks passed.\n');
