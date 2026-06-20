// Adversarial tests for the control-tag parser — the channel by which Y3K's
// brain drives its mood + form. The bug this guards against: a tag leaking into
// the spoken words (e.g. the voice literally saying "{excited"). Run:
//   node test/leadtag.test.mjs
import assert from 'node:assert';
import { parseLeadTag, extractMoodSpeech, makeLeadStreamParser, scrubTags } from '../src/tags.mjs';

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
  let mood = null; let form = null; let text = '';
  const p = makeLeadStreamParser({
    onMood: (m) => { mood = m; },
    onForm: (f) => { form = f; },
    onText: (t) => { text += t; },
  });
  for (const d of deltas) p.push(d);
  const fin = p.end();
  return { mood, form, text, fin };
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

console.log(`\n${passed} checks passed.`);
