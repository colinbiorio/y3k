// NO REPLY, PAGE OR PUBLISH CAN HOLD THE SERVER. Run: node test/redos.test.mjs
//
// Audit, 2026-10-08: scrubTags' rule for an unclosed block had three
// quantifiers that all take a space, and the server ran it on everything a
// host publishes to its viewers. '<<' and 30,000 spaces held the one event
// loop every visitor shares for hours. The read proxy's tag strip was
// quadratic on a page of '<'. Every parser that runs on model text, a
// fetched page or a request is held here to a time limit on the inputs that
// made one of them slow, and to its old output on ordinary ones.
import assert from 'node:assert';
import * as tags from '../src/tags.mjs';
import { sentencesOf, spokenOf, cleanStretch, piecesOf } from '../src/stretch.mjs';
import { _test as proxy } from '../fetchproxy.mjs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
// Generous for a loaded machine; the slow shapes took seconds to hours.
const LIMIT_MS = 250;
const timed = (label, fn) => {
  const t = performance.now();
  fn();
  const ms = performance.now() - t;
  assert.ok(ms < LIMIT_MS, `${label} took ${Math.round(ms)} ms`);
};

const HOSTILE = {
  'open block and spaces': '<<' + ' '.repeat(30000),
  'open block, a word, spaces': '<<remember' + ' '.repeat(30000),
  'many opens': '<<remember:'.repeat(6000),
  'many <': '<'.repeat(64000),
  'leave and spaces': '<<leave:' + ' '.repeat(16000),
  'hail and spaces': '<<hail:' + ' '.repeat(16000),
  'bracket and spaces': '[' + ' '.repeat(16000),
  'tilde and spaces': '~' + ' '.repeat(4000),
  'a long word': 'a'.repeat(64000),
  'many {': '{'.repeat(64000),
  'a run-on': 'and so on '.repeat(6400),
  'no-break spaces': ' '.repeat(64000),
  'carriage returns': '\r'.repeat(32000),
};
const PARSERS = Object.entries(tags).filter(([k, f]) => typeof f === 'function' && /^(scrub|parse|strip)/.test(k));

console.log('model text, every parser in tags.mjs:');
ok(`${PARSERS.length} parsers stay under ${LIMIT_MS} ms on every hostile input`, () => {
  for (const [k, f] of PARSERS) for (const [what, s] of Object.entries(HOSTILE)) timed(`${k} on ${what}`, () => f(s));
});
ok('the beat splitter, fed a long tail one chunk at a time', () => {
  const split = tags.beatSplitter();
  timed('beatSplitter', () => { for (let i = 0; i < 200; i++) split.push('~' + ' '.repeat(20)); });
});
ok('the stretch splitter', () => {
  for (const [what, s] of Object.entries(HOSTILE)) {
    timed(`sentencesOf on ${what}`, () => sentencesOf(s));
    timed(`spokenOf on ${what}`, () => spokenOf(piecesOf(s)));
    timed(`cleanStretch on ${what}`, () => cleanStretch(s));
    timed(`piecesOf on ${what}`, () => piecesOf(s));
  }
});

console.log('\nwhat they still say:');
ok('scrubTags: blocks go, honest math stays', () => {
  assert.equal(tags.scrubTags('hi <<remember: they like tea>> there').replace(/\s+/g, ' ').trim(), 'hi there');
  assert.equal(tags.scrubTags('noted <<remember: their address is 42 Elm').trim(), 'noted');
  assert.equal(tags.scrubTags('1 << 4 is 16'), '1 << 4 is 16');
  assert.equal(tags.scrubTags('1 << 4\nThe answer is: 16'), '1 << 4\nThe answer is: 16', 'an unclosed-block rule that crosses lines');
  assert.ok(!/paint/.test(tags.scrubTags('ok <<paint: front: #ff0000')));
});
ok('blocks with spaces around their words read as before', () => {
  assert.equal(tags.parseHail('<<hail:   hello there   >>'), 'hello there');
  assert.equal(tags.parseLeave('<<leave: a small stone >>'), 'a small stone');
  assert.equal(tags.parseGo('<<go:  north  >>'), 'north');
  assert.equal(tags.parseMark('<<mark: stone >>'), 'stone');
  assert.deepEqual(tags.parseKeep('<<keep: the binding paper >>'), { title: 'the binding paper' });
  assert.deepEqual(tags.parseKeep('<<keep>>'), { title: null });
  assert.deepEqual(tags.parseLetter('<<letter to @wren:  hello >>'), { to: 'wren', text: 'hello' });
  assert.equal(tags.parseRemember('<<remember:  likes tea >>'), 'likes tea');
  assert.ok(tags.parseLeadTag('[ calm orb aurora ] hello'));
});

console.log('\nthe read proxy:');
const PAGES = {
  'many <': '<'.repeat(2_000_000),
  'unclosed links': '<a href="x">'.repeat(20000),
  'unclosed comments': '<!--'.repeat(60000),
  'unclosed scripts': '<script>'.repeat(30000),
  'unclosed title': '<title>' + 'x'.repeat(500000),
  'bare anchors': '<a '.repeat(60000),
};
ok(`extractReadable and sanitizeHtml stay under ${LIMIT_MS * 4} ms on hostile pages up to 2MB`, () => {
  for (const [what, html] of Object.entries(PAGES)) {
    const t = performance.now();
    proxy.extractReadable(html, 'https://example.com/');
    proxy.sanitizeHtml(html, 'https://example.com/');
    const ms = performance.now() - t;
    assert.ok(ms < LIMIT_MS * 4, `${what} took ${Math.round(ms)} ms`);
  }
});
ok('an ordinary page reads as before: title, text and links', () => {
  const html = '<html><head><title>Hello page</title><style>p{}</style></head><body><!-- c --><p>First <b>words</b>.</p>'
    + '<script>evil()</script><a href="/next">Next part</a></body></html>';
  const r = proxy.extractReadable(html, 'https://example.com/a');
  assert.match(JSON.stringify(r), /Hello page/);
  assert.match(JSON.stringify(r), /First/);
  assert.doesNotMatch(JSON.stringify(r), /evil/);
  const clean = proxy.sanitizeHtml(html, 'https://example.com/a');
  assert.doesNotMatch(String(clean.html ?? clean), /<script/i);
});

console.log(`\n${passed} checks passed.`);
