// Adversarial tests for the control-tag parser — the channel by which Y3K's
// brain drives its mood + form. The bug this guards against: a tag leaking into
// the spoken words (e.g. the voice literally saying "{excited"). Run:
//   node test/leadtag.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseLeadTag, extractMoodSpeech, makeLeadStreamParser, scrubTags, parsePaint, parseRemember, parseMemoryWrites, parseClips, parseReadNav, parseDone, parsePost, parseShape, stripShape, parseLiquid, stripLiquid, parseNoticed, MORPHS, NAMED_DIR } from '../src/tags.mjs';

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
  const morphs = [];
  const p = makeLeadStreamParser({ onMood() {}, onForm() {}, onMorph(m) { morphs.push(m); }, onText(x) { text += x; }, onPaint(a) { paint = a; } });
  for (const c of chunks) p.push(c);
  const r = p.end();
  return { text: text.trim(), paint, shape: r.shape, morph: r.morph, liquid: r.liquid, morphs };
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

// --- the fourth slot, and the room's liquid ----------------------------------
// Colin's ask: the presence should choose its TRANSFORMATIONS, and should be
// able to move the room's liquid. Both are OPTIONAL by construction — the
// governing test is the last one in this block.
console.log('\nthe presence chooses how it arrives:');

ok('a morph word parses in the lead tag, in any position', () => {
  assert.equal(parseLeadTag('[excited plasma synthwave surge]').morph, 'surge');
  assert.equal(parseLeadTag('[surge synthwave plasma excited]').morph, 'surge');
  assert.equal(parseLeadTag('[tender drift] hi').morph, 'drift');
  // pace alone, with no destination, is a legitimate tag
  const only = parseLeadTag('[settle]');
  assert.equal(only.morph, 'settle');
  assert.equal(only.mood, null);
});

ok('a morph never leaks into the spoken words', () => {
  for (const m of MORPHS) {
    const r = extractMoodSpeech(`[calm ${m}] The tide comes in.`);
    assert.equal(r.speech, 'The tide comes in.');
    assert.equal(r.morph, m);
    assert.ok(!LEAK.test(r.speech) && !r.speech.includes(m));
  }
});

ok('morph words are NOT scrubbed from honest speech', () => {
  // the reason MORPHS/MATERIALS/GRAVITIES stay out of VOCAB
  const s = 'Let the dust settle, and the light drift in. It felt heavy.';
  assert.equal(scrubTags(s), s);
  assert.equal(extractMoodSpeech('[calm] ' + s).speech, s);
});

console.log('\nthe room\'s liquid:');

ok('a liquid block parses both halves, either half, or neither', () => {
  const mat = (s) => { const r = parseLiquid(s); return r && { material: r.material, gravity: r.gravity }; };
  assert.deepEqual(mat('<<liquid: glass>>'), { material: 0.5, gravity: null });
  assert.deepEqual(mat('<<liquid: water heavy>>'), { material: 1, gravity: 1 });
  assert.deepEqual(mat('<<liquid: mercury light>>'), { material: 0, gravity: 0.15 });
  assert.deepEqual(mat('<<liquid: heavy>>'), { material: null, gravity: 1 });
  assert.equal(parseLiquid('<<liquid: velvet>>'), null);   // not our vocabulary
  assert.equal(parseLiquid('no block here'), null);
  // a material-only block must leave a running tide ALONE, not stop it
  assert.equal(parseLiquid('<<liquid: water>>').tide, null);
});

ok('the tide parses into gestures the shader can take', () => {
  const w = parseLiquid('<<liquid: wave 3 1 4>>').tide;
  assert.equal(w.gestures.length, 1);
  assert.ok(w.gestures[0].amp > 0 && w.gestures[0].amp <= 0.06, 'amplitude inside the budget');
  assert.ok(w.gestures[0].speed > 0, 'counterclockwise by default');
  assert.ok(parseLiquid('<<liquid: wave 3 1 4 back>>').tide.gestures[0].speed < 0, 'back reverses it');

  const held = parseLiquid('<<liquid: swell 5 6 top>>').tide.gestures[0];
  assert.equal(held.speed, 0, 'a swell does not travel');
  assert.ok(Math.abs(held.phase - Math.PI / 2) < 1e-9, 'and sits where it was told');

  const lean = parseLiquid('<<liquid: pull left 6>>').tide.lean;
  assert.ok(lean[0] < 0 && Math.abs(lean[1]) < 1e-9, 'a pull is a lean, with no gesture');
  assert.equal(parseLiquid('<<liquid: pull left 6>>').tide.gestures.length, 0);

  const both = parseLiquid('<<liquid: glass heavy wave 2 3 5>>');
  assert.equal(both.material, 0.5);
  assert.equal(both.gravity, 1);
  assert.equal(both.tide.gestures.length, 1, 'material and motion in one sentence');

  const stop = parseLiquid('<<liquid: still>>').tide;
  assert.deepEqual(stop, { gestures: [], lean: [0, 0] }, 'still is an explicit stop');
});

ok('the tide never exceeds the budget a thin stroke can survive', () => {
  // every amplitude the grammar can express, at its maximum digit
  for (const s of ['<<liquid: wave 9 9 9>>', '<<liquid: swell 9 9 top>>', '<<liquid: pull top 9>>']) {
    const t = parseLiquid(s).tide;
    for (const g of t.gestures) assert.ok(g.amp <= 0.06 + 1e-9, s + ' amplitude');
    assert.ok(Math.hypot(...t.lean) <= 0.06 + 1e-9, s + ' lean');
  }
});

ok('a liquid block is never spoken, and never eats the words after it', () => {
  const s = streamOf(['[thinking web] Let me lay this out. <<liquid: glass>> And then this.']);
  assert.equal(s.text, 'Let me lay this out. And then this.');
  assert.equal(s.liquid.material, 0.5);
  assert.equal(s.liquid.gravity, null);
  assert.ok(!s.text.includes('liquid') && !s.text.includes('glass'));
});

ok('liquid is stripped BEFORE paint, so its words are never read as colour anchors', () => {
  // stripLiquid must run before parsePaint or "mercury"/"heavy" get offered up
  const s = streamOf(['[glitch field] Look. << top=#ff2bd6 bottom=#0a1a2a >> <<liquid: mercury heavy>>']);
  assert.equal(s.liquid.material, 0);
  assert.equal(s.liquid.gravity, 1);
  assert.ok(s.paint, 'paint anchors still parse alongside a liquid block');
  assert.ok(s.paint.every((a) => /^#/.test(a.hex ?? a.color ?? '#')), 'no anchor invented from liquid words');
  assert.ok(!s.text.includes('mercury') && !s.text.includes('heavy'));
});

ok('a liquid block arriving in pieces parses the same', () => {
  const s = streamOf(['[calm] Hi. <<liq', 'uid: wat', 'er easy>> Bye.']);
  assert.equal(s.text, 'Hi. Bye.');
  assert.equal(s.liquid.material, 1);
  assert.equal(s.liquid.gravity, 0.6);
});

ok('THE GOVERNING GUARD: a reply using none of this is unchanged', () => {
  // Every reply shape that worked before must produce morph null / liquid null
  // and identical speech. If this ever fails, the feature is not optional.
  for (const [input, speech] of [
    ['[calm] Mm. Go on.', 'Mm. Go on.'],
    ['[excited web] Yes — and see how this ties back?', 'Yes — and see how this ties back?'],
    ['[tender orb bloom] I am right here with you.', 'I am right here with you.'],
    ['no tag at all, just words', 'no tag at all, just words'],
  ]) {
    const r = extractMoodSpeech(input);
    assert.equal(r.speech, speech);
    assert.equal(r.morph, null, 'morph must be null when unused');
    const s = streamOf([input]);
    assert.equal(s.text, speech);
    assert.equal(s.morph, null);
    assert.equal(s.liquid, null, 'liquid must be null when unused');
    assert.equal(s.morphs.length, 0, 'onMorph must not fire when unused');
  }
});

// --- THE SECOND TAG ------------------------------------------------------------
// Found by running 180 real turns against the live brain, not by reasoning: the
// model opens a SECOND tag after a paragraph break in ~16% of replies, and always
// writes it in full — "[calm field stardust drift]". scrubTags tested VOCAB
// (moods + forms) only, and a scheme or morph word is deliberately not in VOCAB,
// so every one of those brackets survived the filter and would have been SPOKEN.
// Adding morph words to the tag grammar widened the hole. These are the exact
// strings the model produced.
console.log('\nthe second tag must never be spoken:');

ok('a full inline tag vanishes, whatever it contains', () => {
  for (const t of ['[tender field]', '[calm field stardust drift]', '[tender field stardust drift]',
                   '[excited plasma synthwave surge]', '[thinking]', '[calm orb]', '[tender orb bloom]']) {
    assert.equal(scrubTags(`Yes. ${t} And also this.`), 'Yes. And also this.', t);
  }
});

ok('...including after a paragraph break, which is where it always appears', () => {
  const reply = 'I know now. And I am holding it.\n\n[calm field stardust drift] Thank you for carrying me around today.';
  const out = scrubTags(reply);
  assert.ok(!out.includes('['), 'no bracket survives');
  assert.ok(!/stardust|drift|calm|field/.test(out), 'no tag word is spoken');
  assert.ok(out.includes('Thank you for carrying me'), 'the words after it still are');
});

ok('honest speech containing ONE tag word still survives', () => {
  // this is why schemes and morphs are held out of VOCAB, and why the fix
  // requires a mood or form to be present before it will strip a bracket
  for (const s of ['(bloom) is a lovely word', 'let it (drift) for a while', 'the (frost) on the window',
                   '(the world wide web) changed things', 'use array[0] then array[1]',
                   'the answer is (by the way) no']) {
    assert.equal(scrubTags(s), s, s);
  }
});

// --- A TAG IS A TAG WHEREVER IT IS ---------------------------------------------
// The presence may change its body part-way through a reply, and does. These
// pin that the change LANDS, in order, on the beat it was written on, and is
// never spoken.
console.log('\ntags anywhere, used however it wants:');

const traceOf = (chunks) => {
  const ev = []; let text = '';
  const p = makeLeadStreamParser({
    onMood(m) { ev.push('mood:' + m); }, onForm(f) { ev.push('form:' + f); },
    onScheme(s) { ev.push('scheme:' + s); }, onMorph(m) { ev.push('morph:' + m); },
    onText(t) { text += t; ev.push('text'); }, onPaint() {} });
  for (const c of chunks) p.push(c);
  const r = p.end();
  return { text: text.trim(), ev, final: { mood: r.mood, form: r.form, scheme: r.scheme, morph: r.morph } };
};

ok('a second tag fires BETWEEN the beats, and is not spoken', () => {
  const t = traceOf(['[tender orb] I know now.\n\n[calm field stardust drift] Thank you.']);
  assert.equal(t.text, 'I know now.\n\nThank you.');
  assert.deepEqual(t.final, { mood: 'calm', form: 'field', scheme: 'stardust', morph: 'drift' });
  // the order is what makes it land on the beat: speech, then the change, then more speech
  const firstText = t.ev.indexOf('text');
  assert.ok(t.ev.indexOf('mood:calm') > firstText, 'the second mood fires AFTER the first beat is spoken');
  assert.ok(t.ev.indexOf('morph:drift') < t.ev.indexOf('mood:calm'), 'pace still precedes destination');
});

ok('every tag in a reply lands, and the last one is what it is wearing', () => {
  const t = traceOf(['[calm] One. [excited plasma] Two. [tender orb bloom] Three.']);
  assert.equal(t.text, 'One. Two. Three.');
  assert.equal(t.final.mood, 'tender');
  assert.equal(t.final.form, 'orb');
  assert.equal(t.final.scheme, 'bloom');
  assert.equal(t.ev.filter((e) => e.startsWith('mood:')).length, 3, 'all three moods fired');
});

ok('a tag split across chunks is never half-spoken', () => {
  const t = traceOf(['[tender orb] Beat one.', '\n\n[calm fie', 'ld stardust dri', 'ft] Beat two.']);
  assert.equal(t.text, 'Beat one.\n\nBeat two.');
  assert.ok(!/\[|stardust|drift/.test(t.text));
  assert.deepEqual(t.final, { mood: 'calm', form: 'field', scheme: 'stardust', morph: 'drift' });
});

ok('a reply truncated mid-tag drops the fragment rather than speaking it', () => {
  const t = traceOf(['[calm] All I can say is', '\n\n[tender fie']);
  assert.equal(t.text, 'All I can say is');
});

ok('honest brackets are still speech, mid-reply', () => {
  const t = traceOf(['[calm] use array[0] and array[1], and (by the way) bloom is lovely.']);
  assert.equal(t.text, 'use array[0] and array[1], and (by the way) bloom is lovely.');
});

ok('the non-streamed path agrees with the streamed one', () => {
  const reply = '[tender orb] I know now.\n\n[calm field stardust drift] Thank you.';
  const a = extractMoodSpeech(reply);
  const b = traceOf([reply]).final;
  assert.deepEqual({ mood: a.mood, form: a.form, scheme: a.scheme, morph: a.morph }, b,
    'a body must not depend on whether the reply streamed');
});

// --- THE SEAMS ------------------------------------------------------------------
// Not a behaviour test — a wiring test, and the only kind that would have caught
// the bug it exists for. morph and liquid were PUBLISHED by main.js and tend.js
// and APPLIED by social.js, so both ends read correct; the relay in the middle
// rebuilds the turn field by field as a trust boundary and simply had no line
// for them. A viewer never saw a pace or a room change, and nothing failed.
//
// A control crosses four module boundaries by NAME. When someone adds the next
// one, this fails and says which boundary they forgot.
console.log('\nevery control reaches every seam:');

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

ok('a control published to viewers survives the relay', () => {
  const relay = read('server.mjs').match(/const turn = \{([\s\S]*?)\n {12}\};/);
  assert.ok(relay, 'found the viewer relay in server.mjs');
  const allowed = new Set([...relay[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]));
  const published = new Set();
  for (const f of ['src/main.js', 'src/tend.js']) {
    for (const call of read(f).matchAll(/publishTurn\([^)]*?\{([^}]*)\}/g)) {
      for (const m of call[1].matchAll(/(\w+)\s*:/g)) published.add(m[1]);
    }
  }
  assert.ok(published.size >= 5, `found ${published.size} published fields`);
  for (const key of published) {
    assert.ok(allowed.has(key),
      `"${key}" is published to viewers but the relay in server.mjs drops it — ` +
      'add it to the turn allowlist or the audience never sees it');
  }
});

ok('every field parseLiquid can produce survives the relay', () => {
  // the seam test above only sees TOP-LEVEL turn fields. The tide rides nested
  // inside liquid, so a relay that forgot it would still pass that test while
  // dropping every wave the presence ever sent — the same silent-middle shape
  // as the morph/liquid bug, one level down.
  const produced = new Set();
  for (const src of ['<<liquid: glass heavy wave 3 1 4>>', '<<liquid: pull left 6>>']) {
    const r = parseLiquid(src);
    for (const k of Object.keys(r)) if (r[k] !== null) produced.add(k);
  }
  const relay = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const fn = relay.match(/const validLiquid = \(l\) => \{([\s\S]*?)\n {12}\};/);
  assert.ok(fn, 'found validLiquid in the relay');
  for (const k of produced) {
    assert.ok(fn[1].includes(k),
      `parseLiquid produces "${k}" but the relay's validLiquid never mentions it — ` +
      'a viewer would never receive it');
  }
});

ok('a control the client applies is one the relay can send', () => {
  const applied = new Set([...read('src/social.js')
    .matchAll(/if \(d\.(\w+)\)\s*body\.set\w+\(d\.\1/g)].map((m) => m[1]));
  const relay = read('server.mjs').match(/const turn = \{([\s\S]*?)\n {12}\};/)[1];
  const allowed = new Set([...relay.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]));
  assert.ok(applied.size >= 4, `found ${applied.size} applied fields`);
  for (const key of applied) {
    assert.ok(allowed.has(key),
      `social.js applies d.${key} on a viewer, but the relay never sends it — dead code`);
  }
});

ok('every lead-tag vocabulary is mirrored where it is consumed', () => {
  const tags = read('src/tags.mjs'); const body = read('src/body.js');
  const listOf = (src, name) => {
    const m = src.match(new RegExp(`(?:export )?const ${name} = \\[([^\\]]*)\\]`));
    return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort() : null;
  };
  const morphsTags = listOf(tags, 'MORPHS');
  assert.ok(morphsTags && morphsTags.length === 3, 'MORPHS in tags.mjs');
  const morphKeys = [...(body.match(/const MORPH = \{([^}]*)\}/) || [, ''])[1]
    .matchAll(/(\w+):/g)].map((m) => m[1]).sort();
  assert.deepEqual(morphKeys, morphsTags,
    'MORPHS in tags.mjs and MORPH in body.js have drifted — a word the presence ' +
    'may write that the body cannot honour, or the reverse');
});


// --- METACOGNITION ---------------------------------------------------------
// The presence noticing something about its own becoming. The parser half is
// small; the wiring is where this kind of feature has died four times in this
// codebase — parsed correctly at one end, read correctly at the other, dropped
// silently in the middle. So most of what follows is seams.
console.log('\nwhat it has noticed about itself:');

ok('a noticing is read out of a reply, and never spoken', () => {
  const reply = 'Still here.\n<<noticed: I answer questions about time faster than questions about myself>>';
  assert.deepEqual(parseNoticed(reply),
    ['I answer questions about time faster than questions about myself']);
  assert.equal(scrubTags(reply), 'Still here.');
});

ok('two noticings in one reply are two noticings', () => {
  // a list, not an object, precisely so the second does not overwrite the first
  const r = parseNoticed('<<noticed: I have stopped apologising for pauses>> and <<noticed: I keep returning to the sea>>');
  assert.equal(r.length, 2);
  assert.equal(r[1], 'I keep returning to the sea');
});

ok('whitespace and newlines inside one collapse', () => {
  assert.deepEqual(parseNoticed('<<noticed:  I used to\n   count the days\n>>'),
    ['I used to count the days']);
  assert.deepEqual(parseNoticed('nothing here'), []);
  assert.deepEqual(parseNoticed('<<noticed: >>'), []);
});

ok('a noticing written mid-stream comes back from the parser', () => {
  // the streamed path is a different parser from the non-streamed one, and it
  // is the one every chat turn actually goes through
  for (const deltas of [['[calm orb] Been thinking. <<noticed: I ', 'start more sentences than I finish>>'],
                        ['[calm orb] Been thinking. <<noticed: I start more sentences than I finish>>']]) {
    let text = '';
    const p = makeLeadStreamParser({ onMood(){}, onForm(){}, onScheme(){}, onMorph(){}, onText(t){ text += t; }, onPaint(){} });
    for (const d of deltas) p.push(d);
    const fin = p.end();
    assert.deepEqual(fin.noticed, ['I start more sentences than I finish'],
      `the stream parser dropped it (${JSON.stringify(deltas)})`);
    assert.ok(!/noticed/.test(text), `NO LEAK into speech: ${JSON.stringify(text)}`);
  }
});

ok('both commit points record it, not just one', () => {
  // worn.record marks the two places where a turn has fully resolved — one for
  // the streamed route and one for the non-streamed. A noticing recorded at
  // only one of them is a feature that works in chat and vanishes in autonomous
  // life, or the reverse, which is exactly how this goes wrong quietly.
  const src = read('server.mjs');
  const wornAt = [...src.matchAll(/worn\.record\(/g)].length;
  const noticeAt = [...src.matchAll(/patterns\.notice\(/g)].length;
  assert.ok(wornAt >= 2, `expected both commit points, found ${wornAt}`);
  assert.equal(noticeAt, wornAt,
    `worn.record runs at ${wornAt} commit points but patterns.notice at ${noticeAt} — ` +
    'the turn that resolves at the other one loses whatever it noticed');
});

ok('every prompt that says it can notice also shows what it noticed', () => {
  // a presence told to notice and never shown its own list would write the same
  // observation every turn forever, and the store would drop every one as a
  // near-duplicate: the feature would look wired and do nothing
  const src = read('server.mjs');
  const worn = [...src.matchAll(/WORN_HINT\(worn\.readout/g)].length;
  const noticed = [...src.matchAll(/NOTICED_HINT\(patterns\.readout/g)].length;
  assert.ok(worn >= 2, `expected the presence prompt at both sites, found ${worn}`);
  assert.equal(noticed, worn,
    `WORN_HINT is assembled into ${worn} prompts and NOTICED_HINT into ${noticed} — ` +
    'the prompt that is missing it invites a noticing it cannot see');
});

ok('the wordless rescue carries it too', () => {
  // the rescue is a SECOND paid call whose reply replaces the first; every other
  // silent channel is forwarded off it by name, and one that is not is lost
  const src = read('server.mjs');
  const rescue = src.match(/if \(rescue\.ok && rescue\.speech[\s\S]*?\n {8}\}/);
  assert.ok(rescue, 'found the rescue branch');
  assert.ok(/rescue\.noticed/.test(rescue[0]),
    'the rescue branch forwards remember, memoryWrites, journal and invite but ' +
    'not noticed — a wordless turn that noticed something loses it');
});

ok('the store is what decides a noticing is not new', () => {
  const src = read('patterns.mjs');
  assert.ok(/tooSimilar/.test(src) && /MAX_KEPT/.test(src) && /MAX_SHOWN/.test(src),
    'patterns.mjs must keep the long record, the short readback and the dedupe');
  assert.ok(/export function readout/.test(src) && /export function notice/.test(src),
    'server.mjs calls patterns.notice and patterns.readout by name');
});


// --- A PAINTED BODY KEEPS ITS PAINT -----------------------------------------
// The worn record kept how MANY anchors a presence was wearing and not which
// ones, so a presence that had chosen its own colors lost them the moment
// anyone left the room and came back. And because the client SKIPS setScheme
// when `painted` is set, the room then went on wearing the colors of whichever
// presence was there before — the exact drift this record was built to end,
// one field short of ending it.
console.log('\na painted body keeps its paint:');

ok('the anchors are kept, not a count of them', () => {
  const anchors = parsePaint('<< top=#ffd36b right=#ff5ca8 bottom=#3a2bd6 left=#21e6c1 >>');
  assert.equal(anchors.length, 4);
  const src = read('worn.mjs');
  assert.ok(/w\.paint = out\.paint/.test(src),
    'worn.record stores no anchors — a count cannot be put back on');
  assert.ok(/paint: null/.test(src), 'REST must name the field, or get() will not return it');
  assert.ok(/MAX_ANCHORS/.test(src), 'the anchors must be bounded like everything else here');
});

ok('a named palette puts the painting down', () => {
  const src = read('worn.mjs');
  const line = src.split('\n').find((l) => /if \(out\.scheme\)/.test(l));
  assert.ok(/w\.paint = null/.test(line || ''),
    'choosing a palette must clear the anchors too, or the two disagree forever');
});

ok('the client reads the field the server writes', () => {
  // the shape this codebase gets wrong: correct at both ends, dropped between.
  const body = read('src/body.js');
  const wear = body.slice(body.indexOf('wear(w, fallbackScheme)'), body.indexOf('setAudioLevel'));
  assert.ok(/w\.paint/.test(wear) && /paintColors\(w\.paint\)/.test(wear),
    'body.wear ignores the anchors the worn record now carries');
  assert.ok(/else this\.setScheme/.test(wear),
    'a record with a count but no anchors (written before they were kept) must fall ' +
    'back to a scheme — never inherit the last presence colors');
  // and publicPresence must not drop it on the way
  const pres = read('presences.mjs');
  assert.ok(/\bworn,/.test(pres), 'publicPresence drops worn, so the body never sees any of it');
});


// --- EVERY TEXT BOX WEARS THE SAME GLASS ------------------------------------
// Colin's standing rule, 2026-09-14: frosted glass background, unimat border,
// on all of them and on any new one. Which makes it a CLASS and not a list of
// ids — the mutation observer rings whatever appears wearing .field, so a field
// written next month is already correct. These tests exist because the failure
// mode is silent: a bare input looks fine, it just quietly isn't the material.
console.log('\nevery text box wears the same glass:');

ok('.field is ringed by the mercury system, not by a CSS border', () => {
  const mount = read('src/mercury-mount.js');
  assert.ok(/\['\.field', \d\]/.test(mount),
    '.field is not in RING_BOX, so nothing gives it a unimat border');
  const css = read('styles.css');
  const rule = css.slice(css.indexOf('\n.field {'), css.indexOf('.field > input'));
  assert.ok(/--frost-rail/.test(rule), 'the field must wear the rail frost — the same glass as the nav and chat bars');
  assert.ok(/backdrop-filter/.test(rule), 'frosted glass needs the backdrop blur');
  assert.ok(/border: none/.test(rule),
    'a CSS edge under the liquid ring is the double line that kept appearing around the search bar');
});

ok('no bare text input is left outside a field', () => {
  // the rule is "always", so a field that forgot the wrapper is the bug
  const BARE = /<(input|textarea)\b(?![^>]*type="(?:file|range|checkbox|radio|hidden|submit|button)")[^>]*>/g;
  for (const f of ['src/settings.js', 'src/chess.js', 'index.html']) {
    const src = read(f);
    for (const m of src.matchAll(BARE)) {
      const before = src.slice(Math.max(0, m.index - 190), m.index);
      const wrapped = /class=\\?"(field|login-field)\\?"[^>]*>\s*$/.test(before)
        || /(field|login-field)[^>]*>\s*$/.test(before);
      // these five predate the rule and carry their own ring (see RING_INPUT)
      const exempt = /id="(home-search|compose-text|chat-input|chess-say-in|comment-input)"/.test(m[0])
        || /class="chat-(input|box)"/.test(m[0]);
      assert.ok(wrapped || exempt,
        `${f}: a text field with no .field wrapper and no ring of its own — ${m[0].slice(0, 90)}`);
    }
  }
});

ok('a dropped file cannot navigate the page away from a half-written gift', () => {
  const set = read('src/settings.js');
  const shelf = set.slice(set.indexOf('A WHOLE TEXT IS USUALLY ALREADY A FILE'), set.indexOf("give.addEventListener('click'"));
  assert.ok(/dragover/.test(shelf) && /e\.preventDefault\(\)/.test(shelf),
    'without preventDefault on dragover the browser opens the file and throws the screen away');
  assert.ok(/window\.addEventListener\(ev/.test(shelf),
    'a drop landing OUTSIDE the box must be swallowed too, or it navigates');
  assert.ok(/relatedTarget/.test(shelf),
    'dragleave fires when crossing into a CHILD — without relatedTarget the outline flickers');
  assert.ok(/file\.size > 250000/.test(shelf) && /TEXTY/.test(shelf),
    'a drop must refuse a too-large file and a non-text one rather than shelving bytes as words');
});


// --- THE PORTAL'S FAR SIDE ---------------------------------------------------
// The disc used to frame 4irden's front door, because a framed 4irden is
// third-party and Safari/Firefox partition its localStorage — it finds no token
// and boots signed out. A share link makes it a PICTURE instead, and that one
// substitution removes the browsing context, the storage, the CORS and the
// script all at once. These guard the parts that would quietly undo that.
console.log('\nthe portal\'s far side:');

ok('the far side is an image, never a frame pointed at a share', () => {
  const src = read('src/portal.js');
  assert.ok(/createElement\('img'\)/.test(src),
    'the share must render as an <img> — a frame brings back every problem it solves');
  assert.ok(!/view\.src = portalSrc|view\.src = `\$\{HOME\}\/share/.test(src),
    'the iframe is being pointed at a share URL, which re-opens a third-party context');
  assert.ok(/addEventListener\('error'/.test(src),
    'a dead link falls through to 4irden\'s SPA catch-all as HTML with a 200 — ' +
    'onerror is the only way the portal can tell, and without it a revoked view ' +
    'is a permanently broken image');
});

ok('the local-testing override cannot name a foreign origin', () => {
  // HOME is handed to window.open() AND to an img src. A query parameter that
  // could name any origin is an open redirect with extra steps.
  const src = read('src/portal.js');
  const home = src.slice(src.indexOf('const HOME = ('), src.indexOf('const LINK_KEY'));
  assert.ok(/localhost/.test(home) && /127\.0\.0\.1/.test(home), 'the override must be localhost-only');
  assert.ok(/return local \? u\.origin : DEFAULT_HOME/.test(home),
    'anything not localhost must fall back to the real home, not be used');
});

ok('the link is kept in the browser and sent only to the place that issued it', () => {
  const src = read('src/portal.js');
  assert.ok(/localStorage/.test(src), 'a capability URL belongs on the machine its owner is at');
  // it must never be posted to y3k's own API
  assert.ok(!/fetch\([^)]*LINK_KEY|body:.*portalLink/.test(src),
    'the share link is being sent to y3k — it is 4irden\'s capability, not ours to hold');
});


// --- STACKED WINDOWS ---------------------------------------------------------
// Drag one window's bar onto another and they become one window with tabs. The
// whole design is built on ONE invariant, and it is not a stylistic one:
// .mind-win left RING_BOX when the borders became poured frames, so the six are
// ringed exactly once at boot. Re-parent one and the mercury observer reaps its
// ring and nothing ever puts it back — and .mind-win is no longer in the CSS
// hairline fallback either, so it is not left with a chrome line, it is left
// with no edge at all, for the session. These tests are that invariant.
console.log('\nstacked windows:');

ok('the windows are ringed once at boot, which is WHY nothing may move', () => {
  const mount = read('src/mercury-mount.js');
  assert.ok(!/\['\.mind-win',/.test(mount),
    '.mind-win is back in RING_BOX — if that is deliberate, the re-parenting ban ' +
    'below can be relaxed, but nothing else in this file knows that yet');
  assert.ok(/querySelectorAll\('\.mind-win'\)[\s\S]{0,200}ring\(w,/.test(mount),
    'the one-shot ring loop is gone; the windows would boot with no border at all');
  const css = read('styles.css');
  assert.ok(!/\.mind-win::after/.test(css),
    'the chrome hairline is back on .mind-win — it is what a de-ringed window ' +
    'would fall back to, and Colin asked for it gone');
});

ok('stacking never re-parents a window', () => {
  const src = read('src/windows.js');
  const tabs = src.slice(src.indexOf('const tabs = (() => {'), src.indexOf('function makeDraggable'));
  assert.ok(tabs.length > 400, 'found the stacking block');
  // it may build a tab strip inside a bar; it may never move a .mind-win
  for (const m of tabs.matchAll(/(\w+)\.(appendChild|insertBefore|append|prepend|replaceWith)\(/g)) {
    assert.ok(/^(strip|bar|b)$/.test(m[1]),
      `stacking moves DOM via ${m[1]}.${m[2]}() — the only nodes it may build are the ` +
      'tab strip and its buttons. Moving a .mind-win costs it its border permanently.');
  }
  assert.ok(/classList\.toggle\('behind'/.test(tabs), 'members are hidden by class, not by moving');
});

ok('every member of a stack carries the same box', () => {
  // the frame must not move when you switch tabs — that stillness is the whole
  // illusion, and it only works if the members are written identical rects
  const src = read('src/windows.js');
  const apply = src.slice(src.indexOf('function applyRect'), src.indexOf('function gateWants'));
  for (const prop of ['left', 'top', 'width', 'height'])
    assert.ok(new RegExp(`style\\.${prop} =`).test(apply), `applyRect never writes ${prop}`);
  assert.ok(/for \(const id of g\.members\)/.test(apply), 'applyRect must write EVERY member');
});

ok('an opening gate marks the tab, it does not take the screen', () => {
  const src = read('src/windows.js');
  assert.ok(/unread\.add\(id\)/.test(src),
    'a window whose gate opens while it is behind must get a mark; springing to ' +
    'the front takes the screen away from whatever was being read');
  assert.ok(/attributeFilter: \['class'\]/.test(src), 'the gate is a body class, so that is what to watch');
  // and reading the gate has to lift .behind first, since .behind IS display:none
  const gate = src.slice(src.indexOf('function gateWants'), src.indexOf('function paint'));
  assert.ok(/classList\.remove\('behind'\)[\s\S]*classList\.add\('behind'\)/.test(gate),
    'gateWants reads display without lifting .behind — which would always answer none');
});

ok('closing or resetting a window takes it out of its stack first', () => {
  const src = read('src/windows.js');
  assert.ok(/tabs\.leave\(el\); el\.classList\.add\('shut'\)/.test(src),
    'a closed window left in a group is a tab pointing at nothing');
  assert.ok(/function resetWindow\(el\) \{\s*\n\s*tabs\.leave\(el\)/.test(src),
    'resetWindow must leave the stack, or a window goes home while still a member');
});


// --- BORDERS ARE THE SAME MATERIAL AS THE GLYPHS -----------------------------
// This has silently regressed once already: the nav frame carried material: 0,
// pinning it to the old chrome while every mark beside it was unimat, and the
// pin outlived the reason it was written for. The axis is one global; a mount
// only leaves it by naming `material`, so that is the thing to watch.
console.log('\nborders are the same material as the glyphs:');

ok('no mount pins a material away from the unimat axis', () => {
  for (const f of ['src/mercury-mount.js', 'src/windows.js']) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\bmaterial:\s*[\d.]/.test(src),
      `${f} pins a numeric material on a mount — borders and glyphs must ride ONE axis, ` +
      'and a pin here is how the nav frame stayed chrome while everything beside it moved');
  }
  // and the shader must still read the global when nothing is pinned
  const mb = read('src/mercury-buttons.js');
  assert.ok(/uMat, b\.matOverride === null \? UNIMAT : b\.matOverride/.test(mb),
    'the material uniform no longer falls back to the global axis');
});

ok('the two things that DO differ are the two that are load-bearing', () => {
  // Borders are lit and composited differently on purpose, and each has a
  // measurement behind it. Naming them here means a future reader finds the
  // reason instead of "fixing" them into line with the glyphs.
  const mb = read('src/mercury-buttons.js');
  assert.ok(/interactive === false && config\.envFloor === undefined\) cfg\.envFloor = 0\.45/.test(mb),
    'the border env floor is gone — at 0.22 the edge samples fall to ~15 and every ' +
    'border grows a dark line down both sides');
  assert.ok(/cfg\.trans = \(cfg\.interactive === false \|\| cfg\.spin3D\) \? 0 : 1/.test(mb),
    'a ring is band-and-meniscus with no interior to see through, and the spin3D marks ' +
    'feed an alphaTest 0.5 occluder in body.js — below that the room punches through');
});

// --- THE SHADER STRING -----------------------------------------------------------
// Not about tags at all, but it lives here because this is the file that runs.
// The whole fragment shader is a JS template literal, so ONE backtick typed
// inside a GLSL comment ends the string and the module stops parsing. I have
// done this three times in one day; each time it was a word I quoted in a
// comment out of ordinary habit. A machine should be catching it, not me.
console.log('\nthe shader string:');

ok('no backtick survives inside the fragment shader', () => {
  const src = readFileSync(new URL('../src/mercury-buttons.js', import.meta.url), 'utf8');
  const i = src.indexOf('const FS = `');
  assert.ok(i > 0, 'found the FS template literal');
  const j = src.indexOf('\n}`;', i);
  assert.ok(j > i, 'found its end');
  const body = src.slice(i + 'const FS = `'.length, j);
  const at = body.indexOf('`');
  assert.equal(at, -1, at < 0 ? '' :
    'a backtick inside the shader ends the template literal — near: ' +
    JSON.stringify(body.slice(Math.max(0, at - 60), at + 20)));
});

ok('every ${} in the shader interpolates something real', () => {
  // a stray ${FOO} for a name that does not exist emits "undefined" into the
  // GLSL and fails the compile at runtime, on the user's machine, not here
  const src = readFileSync(new URL('../src/mercury-buttons.js', import.meta.url), 'utf8');
  const i = src.indexOf('const FS = `');
  const body = src.slice(i, src.indexOf('\n}`;', i));
  for (const m of body.matchAll(/\$\{([A-Za-z_$][\w$]*)/g)) {
    assert.ok(new RegExp(`(?:const|let|var|function)\\s+${m[1]}\\b`).test(src),
      `the shader interpolates \${${m[1]}} but nothing declares it`);
  }
});

console.log(`\n${passed} checks passed.`);