// THE TIME SENSE. Run:  node test/when.test.mjs
//
// Two of these guard against something that was live in production rather than
// hypothetical. The presence's only clock was server UTC, so a host talking at
// nine at night in Los Angeles was told it was four in the morning — every
// session, for as long as the autonomous loop has existed. And a memory with
// no stored time rendered as `t || 0`, which is the 1st of January 1970, a
// date the recall window started showing to the host in stage 11.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ago, gap, nowLine, knownZone, markOf, cleanOffsets, MAX_OFFSET, markMessages, withClock } from '../src/when.mjs';
import { scrubTags } from '../src/tags.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('the hour the host is actually living in:');

ok('the same instant is a different evening in a different place', () => {
  // 04:14 UTC on the 12th is 21:14 on the 11th in Los Angeles. The old line
  // said "Sat, 12 Sep 2026 04:14:00 GMT" to someone whose evening it was.
  const t = Date.parse('2026-09-12T04:14:00Z');
  const la = nowLine(t, 'America/Los_Angeles');
  assert.ok(/Friday evening/.test(la), `Los Angeles reads: ${la}`);
  assert.ok(/21:14/.test(la) && /11 September 2026/.test(la), la);
  const tokyo = nowLine(t, 'Asia/Tokyo');
  assert.ok(/Saturday/.test(tokyo) && /13:14/.test(tokyo), `Tokyo reads: ${tokyo}`);
  // and the zone chooses the WORDS only — never the instant
  assert.notEqual(la, tokyo);
});

ok('an unknown zone is said out loud, not papered over', () => {
  // The dangerous failure is a bare local-looking time the presence cannot
  // place. Falling back to the SERVER's zone would be that exactly.
  for (const bad of [null, undefined, '', 'Mars/Olympus', 42, 'x'.repeat(200)]) {
    const line = nowLine(Date.parse('2026-09-12T04:14:00Z'), bad);
    assert.ok(/UTC/.test(line), `a bad zone produced a placeless time: ${line}`);
    assert.ok(/you do not know/.test(line), `a bad zone hid its own uncertainty: ${line}`);
  }
  assert.equal(knownZone('America/New_York'), true);
  assert.equal(knownZone('Nowhere/Nothing'), false);
});

ok('a bad zone never throws inside prompt assembly', () => {
  for (const bad of [{}, [], () => {}, Symbol.iterator.toString(), '../../etc']) {
    assert.doesNotThrow(() => nowLine(Date.now(), bad));
  }
  assert.equal(nowLine(NaN, 'UTC'), null);
  assert.equal(nowLine(Date.parse('not a date'), 'UTC'), null);
});

console.log('\nan interval survives a clock that is wrong:');

ok('how long ago, in as few characters as carry it', () => {
  assert.equal(ago(0), 'just now');
  assert.equal(ago(30000), 'just now');
  assert.equal(ago(60000), '1m ago');
  assert.equal(ago(3 * 3600000), '3h ago');
  assert.equal(ago(2 * 86400000), '2d ago');
  assert.match(ago(90 * 86400000), /months ago/);
  assert.match(ago(800 * 86400000), /years ago/);
  assert.equal(gap(1000, 3 * 3600000 + 1000), '3h ago');
});

ok('an absent or impossible time renders as nothing at all', () => {
  // Rule 2 of the module, and the one that stops a 1970 appearing anywhere.
  for (const bad of [null, undefined, NaN, Infinity, -1, -86400000, '5m', {}]) {
    assert.equal(ago(bad), null, `${String(bad)} produced a time`);
    assert.equal(markOf(bad), null, `${String(bad)} produced a mark`);
  }
  assert.equal(gap(NaN, 5), null);
});

ok('what the client sends is clamped, never printed as given', () => {
  const clean = cleanOffsets([0, 5000, -1, 'x', MAX_OFFSET + 1, null, undefined, 1 / 0], 8);
  assert.deepEqual(clean, [0, 5000, null, null, null, null, null, null]);
  // shorter, longer and non-array all produce exactly n slots
  assert.equal(cleanOffsets([1, 2], 5).length, 5);
  assert.equal(cleanOffsets([1, 2, 3, 4, 5, 6], 2).length, 2);
  for (const bad of [null, undefined, 'nope', 42, {}]) {
    assert.deepEqual(cleanOffsets(bad, 3), [null, null, null]);
  }
});

console.log('\nthe mark must never be spoken:');

ok('a time mark is stripped from a reply, and real parentheses are not', () => {
  // The person's turns arrive prefixed with "(3h ago)". Nothing asks the model
  // to copy that — but the general bracket rule only removes brackets whose
  // words are ALL control vocabulary, and a digit is in no vocabulary, so an
  // imitated mark would survive every filter and be read out loud.
  assert.equal(scrubTags('(3h ago) hello there'), 'hello there');
  assert.equal(scrubTags('[just now] hi'), 'hi');
  assert.equal(scrubTags('(12 months ago) yes'), 'yes');
  assert.equal(scrubTags('(2 years ago) mm'), 'mm');
  // only at the START, and only that shape
  assert.equal(scrubTags('the world wide web'), 'the world wide web');
  assert.equal(scrubTags('(the world wide web) stays'), '(the world wide web) stays');
  assert.equal(scrubTags('I remember it (3h ago) clearly'), 'I remember it (3h ago) clearly');
  // and the control tag still works
  assert.equal(scrubTags('[calm orb] words'), 'words');
});

console.log('\nwhere it is wired, and what it must not do:');

ok('the times ride beside the messages, never on them', () => {
  const b = readFileSync(join(ROOT, 'src/brain.js'), 'utf8');
  // An unknown key on a message object is forwarded verbatim to the provider —
  // server.mjs spreads `{ ...m }` and never projects to { role, content }.
  assert.ok(/messages: msgs\.map\(\(m\) => \(\{ role: m\.role, content: m\.content \}\)\)/.test(b),
    'the wire form no longer strips t off the message objects');
  assert.ok(/when: msgs\.map/.test(b), 'the times stopped riding alongside');
  // both assembly sites must use the one projection, or the fallback drifts
  assert.equal((b.match(/const body = onWire\(msgs\)/g) || []).length, 2,
    'the two assembly sites no longer share one wire projection');
  // every push carries a moment
  const pushes = b.match(/history\.push\(/g) || [];
  const stamped = b.match(/history\.push\(\{[^}]*t: /g) || [];
  assert.equal(pushes.length, stamped.length, `${pushes.length - stamped.length} history pushes carry no time`);
  // the streamed user turn is stamped when it was ASKED, not when the reply ended
  assert.ok(/const askedAt = Date\.now\(\);/.test(b) && /content: text, t: askedAt/.test(b),
    'the streamed user turn is stamped with the reply latency included');
});

ok('only the person is marked, never the presence', () => {
  // Its own turns are "[mood form scheme] words" and SYSTEM says to put nothing
  // before the tag — prefixing them would few-shot teach the model to break the
  // one rule the streaming tag parser depends on.
  const out = markMessages([
    { role: 'user', content: 'first thing' },
    { role: 'assistant', content: '[calm orb] I hear you' },
    { role: 'user', content: 'much later' },
  ], [3 * 86400000, 3 * 86400000, 0]);
  assert.equal(out[0].content, '(3d ago) first thing');
  assert.equal(out[1].content, '[calm orb] I hear you', 'the presence\'s own turn was prefixed');
  assert.equal(out[2].content, '(just now) much later');
  // an unmarked turn passes through whole rather than acquiring a guess
  const noTime = markMessages([{ role: 'user', content: 'who knows when' }], [null]);
  assert.equal(noTime[0].content, 'who knows when');
  const junk = markMessages([{ role: 'user', content: 'x' }], ['nope']);
  assert.equal(junk[0].content, 'x');
  // garbage in does not throw, and non-string content is left alone
  for (const bad of [null, undefined, [], 'nope', 42, [null], [{}], [{ role: 'user', content: [{ type: 'image' }] }]]) {
    assert.doesNotThrow(() => markMessages(bad, [0]));
  }

  const o = withClock({ system: 'SYSTEM' }, 'America/Los_Angeles');
  assert.ok(/TIME\./.test(o.system) && /where your host is/.test(o.system), o.system);
  assert.ok(/not for you to copy/.test(o.system), 'nothing tells the model the marks are not its to echo');
  // a turn with no system prompt at all must survive untouched
  assert.equal(withClock(undefined, 'UTC'), undefined);
  assert.deepEqual(withClock({ noThink: true }, 'UTC'), { noThink: true });

  const s = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  assert.ok(/Put nothing before the tag/.test(s), 'the rule the restriction protects is gone');
  assert.equal((s.match(/messages = markMessages\(messages, when\);/g) || []).length, 2,
    'a brain route does not mark its messages');
  assert.equal((s.match(/const opts = withClock\(/g) || []).length, 2,
    'a brain route does not carry the clock');
  // both routes must actually take the fields off the wire
  assert.equal((s.match(/\{ messages, when, tz,/g) || []).length, 2,
    'a brain route never destructures when/tz, so both are silently undefined');
});

ok('the UTC clock that was telling hosts the wrong hour is gone', () => {
  const s = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  assert.ok(!/clock reads \$\{new Date\(\)\.toUTCString\(\)\}/.test(s),
    'the autonomous prompt still reads the clock in UTC');
  // the Last-Modified header is a different thing and must stay
  assert.ok(/st\.mtime\.toUTCString\(\)/.test(s), 'the Last-Modified header was removed by mistake');
  assert.ok(/import \{ markMessages, withClock \} from '\.\/src\/when\.mjs'/.test(s),
    'the server does not import the time renderer');
});

ok('an absent time is absent everywhere it is stored', () => {
  const g = readFileSync(join(ROOT, 'memorygraph.mjs'), 'utf8');
  assert.ok(!/t: d\.t \|\| 0/.test(g), 'a memory with no time still claims the 1st of January 1970');
  assert.ok(/Number\.isFinite\(d\.t\) && d\.t > 0 \? d\.t : null/.test(g), 'the absent-time guard changed shape');
  // and the loop must not assert a human act that never happened
  const t = readFileSync(join(ROOT, 'src/tend.js'), 'utf8');
  assert.ok(!/let lastHumanAt = Date\.now\(\)/.test(t), 'module load counts as a person touching the room again');
  assert.ok(/const quietSince = \(\) => \(lastHumanAt \?\? roomOpenedAt\);/.test(t),
    'the idle gate lost its floor — a null reads as 0 and every gate opens at once');
  assert.equal((t.match(/Date\.now\(\) - quietSince\(\) < HOURS_IDLE_MS/g) || []).length, 2,
    'a gate still measures against the raw lastHumanAt');
});

console.log(`\n${passed} checks passed.`);
