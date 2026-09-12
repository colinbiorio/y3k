// Adversarial tests for the control-tag parser — the channel by which Y3K's
// brain drives its mood + form. The bug this guards against: a tag leaking into
// the spoken words (e.g. the voice literally saying "{excited"). Run:
//   node test/leadtag.test.mjs
import assert from 'node:assert';
import { parseLeadTag, extractMoodSpeech, makeLeadStreamParser, scrubTags, parsePaint, parseRemember, parseMemoryWrites, parseClips, parseReadNav, parseDone, parsePost, parseShape, stripShape, NAMED_DIR } from '../src/tags.mjs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// A tag must NEVER survive into spoken text, whatever delimiters the model uses.
const LEAK = /[[\]{}()<>]|excited|tender|glitch|\bweb\b|\borb\b|\bfield\b/i;

// --- non-streaming extractor -------------------------------------------------
console.log('extractMoodSpeech:');
const cases = [
  ['[excited] Yes!',                       'excited', null,  'Yes!'],
  ['[excited web] Linked back to that.',   'excited', 'web', 'Linked back to that.'],
  ['[tender orb] I am right here.',         'tender',  'orb', 'I am right here.'],
  ['[web excited] order independent',      'excited', 'web', 'order independent'],   // mood/form any order
  ['[orb] posture only',                   'calm',    'orb', 'posture only'],         // form, no mood → calm
  ['{excited} hi there',                   'excited', null,  'hi there'],             // THE BUG: curly braces
  ['(tender orb) hello',                   'tender',  'orb', 'hello'],                // parens
  ['<calm field> easy',                    'calm',    'field','easy'],               // angle brackets
  ['[EXCITED WEB] Caps',                   'excited', 'web', 'Caps'],                 // case-insensitive
  ['[excited]No space',                    'excited', null,  'No space'],
  ['   [calm]   spaced   ',                'calm',    null,  'spaced'],               // surrounding whitespace
  ['[excited, web] comma sep',             'excited', 'web', 'comma sep'],
  ['[excited/web] slash sep',              'excited', 'web', 'slash sep'],
  ['[excited web extra] three words',      'excited', 'web', 'three words'],          // 3+ words: extra consumed
  ['Just plain words, no tag.',            'calm',    null,  'Just plain words, no tag.'],
  ['{"mood":"tender","form":"orb","speech":"json fallback"}', 'tender', 'orb', 'json fallback'],
];
for (const [input, mood, form, speech] of cases) {
  ok(JSON.stringify(input).slice(0, 42), () => {
    const r = extractMoodSpeech(input);
    assert.equal(r.mood, mood, `mood for ${input}`);
    assert.equal(r.form, form, `form for ${input}`);
    assert.equal(r.speech, speech, `speech for ${input}`);
  });
}

// "[laughs]" is bracketed but not our vocabulary — leave it as spoken text.
ok('non-vocab bracket left intact', () => {
  assert.equal(parseLeadTag('[laughs] hi'), null);
  assert.equal(extractMoodSpeech('[laughs] hi').speech, '[laughs] hi');
});

// --- scrubTags: remove tags ANYWHERE, but only real ones --------------------
console.log('scrubTags (final client guard):');
const scrubCases = [
  ['[excited web] hello',                 'hello'],                       // leading tag
  ['I hear you. [web] and it connects.',  'I hear you. and it connects.'], // inline/second tag
  ['[excited][web] hi',                   'hi'],                          // double tag
  ['[listening] still here',              'still here'],                  // listening (server-only mood)
  ['[speaking] out loud',                 'out loud'],                    // speaking (server-only mood)
  ['(by the way) keep this',              '(by the way) keep this'],      // non-vocab parens — untouched
  ['no tags here at all',                 'no tags here at all'],
];
for (const [input, expected] of scrubCases) {
  ok(JSON.stringify(input).slice(0, 42), () => {
    const out = scrubTags(input);
    assert.equal(out, expected, `scrubTags(${input})`);
    if (input.includes('web') || input.includes('excited')) assert.ok(!LEAK.test(out), `no leak: ${out}`);
  });
}

// --- streaming parser: every split must yield clean speech -------------------
console.log('makeLeadStreamParser (pathological deltas):');
function runStream(deltas) {
  let mood = null; let form = null; let text = ''; let paint = null;
  const p = makeLeadStreamParser({
    onMood: (m) => { mood = m; },
    onForm: (f) => { form = f; },
    onText: (t) => { text += t; },
    onPaint: (a) => { paint = a; },
  });
  for (const d of deltas) p.push(d);
  const fin = p.end();
  return { mood, form, text, paint, fin };
}
// Split one string into every interesting chunking: whole, per-char, a few seams.
function splits(s) {
  const out = [[s], [...s]];
  for (const n of [1, 2, 3, 5, 8]) {
    const parts = []; for (let i = 0; i < s.length; i += n) parts.push(s.slice(i, i + n));
    out.push(parts);
  }
  out.push([' ', ...[...s]]); // leading-whitespace-only first delta (a real stream quirk)
  return out;
}
const streamCases = [
  ['[excited web] Yes — and it connects.', 'excited', 'web',  'Yes — and it connects.'],
  ['[tender] I hear you.',                 'tender',  null,   'I hear you.'],
  ['{excited} sneaky curly leak',          'excited', null,   'sneaky curly leak'],
  ['[orb] just a posture',                 'calm',    'orb',  'just a posture'],
  ['[excited web extra] three words here', 'excited', 'web',  'three words here'],
  ['no tag at all, plain speech',          'calm',    null,   'no tag at all, plain speech'],
  // HIGH: a JSON-object reply must be parsed at end(), never streamed raw.
  ['{"mood":"excited","form":"web","speech":"hello there"}', 'excited', 'web', 'hello there'],
  ['{"mood":"tender","speech":"just words"}', 'tender', null, 'just words'],
];
for (const [full, mood, form, speech] of streamCases) {
  ok(JSON.stringify(full).slice(0, 42), () => {
    for (const deltas of splits(full)) {
      const r = runStream(deltas);
      assert.equal(r.text.trim(), speech, `speech (${JSON.stringify(deltas)})`);
      assert.ok(!LEAK.test(r.text), `NO LEAK in spoken text: ${JSON.stringify(r.text)}`);
      assert.equal(r.fin.mood, mood, `final mood (${JSON.stringify(deltas)})`);
      assert.equal(r.fin.form, form, `final form (${JSON.stringify(deltas)})`);
    }
  });
}

// --- paint mode -------------------------------------------------------------
console.log('parsePaint + paint streaming:');
ok('parsePaint named + coords', () => {
  const a = parsePaint('<< top=#ff0000 right:#0f0 120,40=#0000ff >>');
  assert.equal(a.length, 3);
  assert.deepEqual(a[0].dir, [0, 1, 0]);
  assert.deepEqual(a[0].rgb, [1, 0, 0]);
  assert.deepEqual(a[1].rgb, [0, 1, 0]);            // #0f0 → green
  assert.ok(Math.abs(a[2].dir[1] - Math.sin(40 * Math.PI / 180)) < 1e-9); // elevation 40
});
ok('parsePaint ignores junk, caps at 64', () => {
  assert.equal(parsePaint('no anchors here').length, 0);
});

// The paint block must stream out as paint, never as spoken text.
const PAINT_LEAK = /<<|>>|#[0-9a-f]{3}|=#|top=|bottom=/i;
const paintStream = '[excited plasma] Look at the energy in this! << top=#ffd36b bottom=#3a2bd6 left=#21e6c1 >>';
ok('paint block never spoken; speech + anchors recovered', () => {
  for (const deltas of splits(paintStream)) {
    const r = runStream(deltas);
    assert.equal(r.text.trim(), 'Look at the energy in this!', `speech (${JSON.stringify(deltas)})`);
    assert.ok(!PAINT_LEAK.test(r.text), `NO paint leak in speech: ${JSON.stringify(r.text)}`);
    assert.equal(r.fin.mood, 'excited');
    assert.equal(r.fin.form, 'plasma');
    assert.equal(r.paint?.length, 3, `anchors (${JSON.stringify(deltas)})`);
  }
});
ok('scrubTags removes a paint block', () => {
  assert.equal(scrubTags('hi there << top=#fff >>'), 'hi there');
});

// --- regression: a '<<' that is NOT a paint block must not swallow the speech ---
console.log('paint-block false positives (must not eat speech):');
ok("'1 << 4' keeps its full speech in the stream", () => {
  for (const deltas of splits('[calm] In C, 1 << 4 equals 16, so shift it.')) {
    const r = runStream(deltas);
    assert.equal(r.text.trim(), 'In C, 1 << 4 equals 16, so shift it.', `speech (${JSON.stringify(deltas)})`);
    assert.equal(r.paint, null, 'no anchors from a non-paint <<');
  }
});
ok("an empty '<< >>' block is dropped but the surrounding speech survives", () => {
  const r = runStream([...'[tender] almost there << >> and done.']);
  assert.equal(r.text.trim(), 'almost there and done.'); // empty paint block scrubbed, speech kept
  assert.equal(r.paint, null);
});

// --- regression: scrubTags spares real parentheticals containing a vocab word ---
console.log('scrubTags spares legitimate speech:');
for (const [input, expected] of [
  ['I found it on the web (the world wide web, I mean).', 'I found it on the web (the world wide web, I mean).'],
  ['it felt calm, like an open field at dusk', 'it felt calm, like an open field at dusk'],
  ['[excited web] still kills a real tag', 'still kills a real tag'], // all-vocab bracket still scrubbed
]) {
  ok(JSON.stringify(input).slice(0, 44), () => assert.equal(scrubTags(input), expected));
}

// --- regression: a tag with no words returns '…', never the raw tag ---
ok("tag-only reply -> '…', not '[calm]'", () => {
  const r = extractMoodSpeech('[calm]');
  assert.equal(r.mood, 'calm');
  assert.equal(r.speech, '…');
  assert.ok(!/[[\]]/.test(r.speech), 'no brackets leak into speech');
});

// --- the remember channel: parsed out, stored, NEVER spoken -------------------
console.log('remember channel:');
ok('parseRemember extracts the note', () => {
  assert.equal(parseRemember('words. <<remember: ships music at night>>'), 'ships music at night');
});
ok('parseRemember: none -> null, empty -> null', () => {
  assert.equal(parseRemember('just words'), null);
  assert.equal(parseRemember('<<remember:   >>'), null);
});
ok('parseRemember collapses whitespace and caps length', () => {
  const long = 'x'.repeat(500);
  assert.equal(parseRemember(`<<remember: a\n  b>>`), 'a b');
  assert.equal(parseRemember(`<<remember: ${long}>>`).length, 300);
});
ok('stream: remember block is captured and never spoken', () => {
  for (const deltas of splits('[tender] I will hold onto that. <<remember: their dog is Juno>>')) {
    const r = runStream(deltas);
    assert.equal(r.fin.remember, 'their dog is Juno');
    assert.ok(!/remember|Juno|<</i.test(r.text), 'note leaked into speech: ' + JSON.stringify(r.text));
    assert.equal(r.text.trim(), 'I will hold onto that.');
  }
});
ok('stream: paint AND remember together both land', () => {
  const r = runStream([...'[excited] Look. << top=#ff0000 bottom=#0000ff >> <<remember: loves red>>']);
  assert.equal(r.fin.remember, 'loves red');
  assert.ok(Array.isArray(r.paint) && r.paint.length === 2, 'paint anchors parsed');
  assert.equal(r.text.trim(), 'Look.');
});
ok('scrubTags strips a remember block from any speech', () => {
  assert.equal(scrubTags('hello <<remember: secret note>> there'), 'hello there');
});

// --- UNCLOSED control blocks (reply truncated mid-block) must never be spoken ---
console.log('truncated control blocks:');
ok('unclosed remember block never spoken (non-stream scrub)', () => {
  assert.equal(scrubTags('I will keep that. <<remember: their address is 42 Elm'), 'I will keep that.');
});
ok('unclosed paint block never spoken', () => {
  assert.equal(scrubTags('look at this << top=#ff00'), 'look at this');
});
ok('honest "<<" speech survives the unclosed-block guard', () => {
  assert.equal(scrubTags('shift is 1 << 4 in code'), 'shift is 1 << 4 in code');
});
ok('stream: truncated remember block never spoken, note not stored', () => {
  for (const deltas of splits('[tender] Noted. <<remember: their address is 42 Elm')) {
    const r = runStream(deltas);
    assert.equal(r.text.trim(), 'Noted.', JSON.stringify(r.text));
    assert.ok(!/42 Elm|remember/i.test(r.text), 'partial note leaked: ' + JSON.stringify(r.text));
    assert.equal(r.fin.remember, null); // never made it to a closing >> — not stored
  }
});

// --- tend grammar: memory tiers, clips, navigation, posts --------------------
console.log('tend grammar:');
ok('parseMemoryWrites reads each tier; empty write is a valid letting-go', () => {
  const w = parseMemoryWrites('ok [tender] <<memory glimpse: reading about Voyager>> <<memory long: >>');
  assert.equal(w.glimpse, 'reading about Voyager');
  assert.equal(w.long, ''); // an explicit empty tier is a real write (release)
  assert.equal(w.short, undefined);
});
ok('parseClips: up to 3, trimmed, capped', () => {
  const c = parseClips('<<clip:  a  b  >> <<clip: two>> <<clip: three>> <<clip: four>>');
  assert.deepEqual(c, ['a b', 'two', 'three']); // 4th dropped
});
ok('parseReadNav + parseDone + parsePost', () => {
  assert.equal(parseReadNav('next <<read: https://example.com/x>>'), 'https://example.com/x');
  assert.equal(parseReadNav('<<read: feed>>'), 'feed');
  assert.equal(parseReadNav('no nav'), null);
  assert.equal(parseDone('that is enough <<done>>'), true);
  assert.equal(parseDone('keep going'), false);
  assert.equal(parsePost('posting now <<post: interstellar space is quiet>>'), 'interstellar space is quiet');
});
ok('tend blocks are NEVER spoken (scrubbed like paint/remember)', () => {
  const s = 'I found something. <<clip: exact quote>> <<memory short: a thought>> <<read: https://x.com>> <<done>>';
  const out = scrubTags(s);
  assert.equal(out, 'I found something.');
  assert.ok(!/clip|memory|read|done|<</i.test(out), 'no tend syntax leaked: ' + JSON.stringify(out));
});
ok('unclosed tend block (truncation) never spoken', () => {
  assert.equal(scrubTags('I will keep <<clip: their home address is 42'), 'I will keep');
  assert.equal(scrubTags('posting <<post: half a thought that got cut'), 'posting');
});
ok('stream: a read reply speaks reaction, hides its tend blocks', () => {
  for (const deltas of splits('[thinking] What a beautiful idea. <<clip: interstellar space is silent and cold>> <<read: feed>>')) {
    const r = runStream(deltas);
    assert.equal(r.text.trim(), 'What a beautiful idea.', JSON.stringify(r.text));
    assert.ok(!/interstellar|<<|read:/i.test(r.text), 'tend leaked: ' + JSON.stringify(r.text));
  }
});


// --- SHAPE: the program the orb runs on itself -------------------------------
// The presence cannot send 24,000 positions (~310,000 tokens for one frame, and
// about $7.74). It sends a bounded op-stack instead. These tests hold the
// bounds, because every one of them is what stops a runaway reply becoming
// work — and hold the streaming fix, because the failure there costs real money.
console.log('\nparseShape:');

ok('a bare shape is the whole gesture', () => {
  const s = parseShape('<<shape: sphere>>');
  assert.equal(s.shape, 'sphere');
  assert.equal(s.ops.length, 0);
  assert.equal(s.once, false);
  assert.equal(parseShape('<<shape: helix 5>>').a, 5);
});

ok('moves keep their order and their arity', () => {
  const s = parseShape('<<shape: helix 5 twist 3 ripple 2 6 4>>');
  assert.deepEqual(s.ops.map((o) => o.op), ['twist', 'ripple']);
  assert.deepEqual(s.ops[0].args, [3]);
  assert.deepEqual(s.ops[1].args, [2, 6, 4]);   // order IS the expressiveness
});

ok('a mask binds to the move it follows', () => {
  const s = parseShape('<<shape: shell 3 pulse 4 2 ripple 3 7 6 @band 3 6>>');
  assert.equal(s.ops[0].mask, null, 'pulse should be unmasked');
  assert.equal(s.ops[1].mask, 'band');
  assert.deepEqual(s.ops[1].margs, [3, 6]);
});

ok('pull resolves through the same table paint uses', () => {
  const s = parseShape('<<shape: pull top 6 pull bottom 6 twist 4>>');
  assert.equal(s.pull.length, 2);
  assert.deepEqual(s.pull[0].dir, NAMED_DIR.top);
  assert.deepEqual(s.pull[1].dir, NAMED_DIR.bottom);
  assert.equal(s.pull[0].amount, 6);
  // a pull of zero is no pull at all, not an attractor at the origin
  assert.equal(parseShape('<<shape: pull top 0>>').pull.length, 0);
});

ok('every bound holds, because a reply must not become work', () => {
  assert.equal(parseShape('<<shape: sphere spin 1 spin 2 spin 3 spin 4 spin 5 spin 6 spin 7 spin 8>>').ops.length, 6);
  assert.equal(parseShape('<<shape: pull top 1 pull left 2 pull right 3 pull back 4 pull front 5>>').pull.length, 4);
  assert.deepEqual(parseShape('<<shape: sphere ripple 99 4 7>>').ops[0].args, [9, 4, 7]);      // clamped 0-9
  assert.deepEqual(parseShape('<<shape: sphere ripple>>').ops[0].args, [0, 0, 0]);             // missing = zero
  assert.equal(parseShape('x'.repeat(400)), null);
});

ok('nonsense is dropped in silence, never raised', () => {
  const s = parseShape('<<shape: banana wobble 3 twist 2>>');
  assert.equal(s.shape, 'sphere');                        // unknown shape → home
  assert.deepEqual(s.ops.map((o) => o.op), ['twist']);    // unknown move → gone
  assert.equal(parseShape('just talking, no block'), null);
  assert.doesNotThrow(() => parseShape('<<shape: >>'));
  assert.doesNotThrow(() => parseShape(null));
});

ok('@i does not exist, and must not', () => {
  // On a fibonacci sphere index is an affine function of latitude, so @i would
  // be identically @band. Teaching a selector that does not exist would break
  // honest senses inside the prompt text itself.
  assert.equal(parseShape('<<shape: sphere spin 3 @i 0 4>>').ops[0].mask, null);
  assert.equal(parseShape('<<shape: sphere spin 3 @band 0 4>>').ops[0].mask, 'band');
});

console.log('\nshape + the stream:');

const streamOf = (chunks) => {
  let text = '';
  let paint = null;
  const p = makeLeadStreamParser({ onMood() {}, onForm() {}, onText(x) { text += x; }, onPaint(a) { paint = a; } });
  for (const c of chunks) p.push(c);
  const r = p.end();
  return { text: text.trim(), paint, shape: r.shape };
};

ok('a shape block never swallows the words after it', () => {
  // THE BUG THIS EXISTS FOR: feedPost stops emitting speech at the first '<<',
  // and end() only re-emitted the tail when parsePaint found nothing. So a
  // reply carrying BOTH a paint block and a shape block dropped every word
  // written after them, and a shape-block-first reply came out empty — which
  // fires the wordless rescue at server.mjs, a second full paid call.
  const a = streamOf(['[calm] Watch this. <<shape: helix 5 twist 3>> And that.']);
  assert.equal(a.text, 'Watch this. And that.');
  assert.equal(a.shape.shape, 'helix');

  const b = streamOf(['[calm] <<shape: helix 5>> I moved.']);
  assert.equal(b.text, 'I moved.', 'a shape-first reply must still speak');

  const c = streamOf(['[calm] Both. <<top=#ff0000 bottom=#0000ff>> <<shape: disc spin 4>> After.']);
  assert.equal(c.text, 'Both. After.', 'paint AND shape must both leave the speech intact');
  assert.equal(c.paint.length, 2, 'the paint anchors still arrive');
  assert.equal(c.shape.shape, 'disc');
});

ok('a shape block is never read as colour, and never spoken', () => {
  const s = streamOf(['[calm] Look. <<shape: ring 3 ripple 4 6 5>>']);
  assert.equal(s.paint, null, 'its digits must not become anchors');
  assert.ok(!LEAK.test(s.text) && !/shape|ripple|<</.test(s.text), 'no part of the block may be spoken');
  assert.equal(scrubTags('Listen. <<shape: helix 5 twist 3>>').trim(), 'Listen.');
  // truncated mid-block (the reply hit max_tokens) must not leak either
  assert.equal(scrubTags('Listen. <<shape: helix 5 twi').trim(), 'Listen.');
});

ok('honest maths still survives all of it', () => {
  assert.equal(streamOf(['[calm] one is 1 << 4 shifted']).text, 'one is 1 << 4 shifted');
  assert.equal(stripShape('hi <<shape: helix 5>> there').replace(/\s+/g, ' '), 'hi there');
});

ok('a block arriving in pieces parses the same', () => {
  const s = streamOf(['[ca', 'lm] Hi. <<sha', 'pe: ring 3 rip', 'ple 4 6 5>> Bye.']);
  assert.equal(s.text, 'Hi. Bye.');
  assert.equal(s.shape.shape, 'ring');
  assert.deepEqual(s.shape.ops[0].args, [4, 6, 5]);
});

console.log(`\n${passed} checks passed.`);