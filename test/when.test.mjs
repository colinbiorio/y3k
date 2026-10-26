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
  // one month is singular (the arrival card said "1 months ago", 2026-10-26)
  assert.equal(ago(33 * 86400000), '1 month ago');
  assert.equal(ago(44 * 86400000), '1 month ago');
  assert.equal(ago(46 * 86400000), '2 months ago');
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
  // the later of a touch (floored at the page opening) and the last time the
  // watcher saw someone listening or talking (2026-10-08, client-audit.test.mjs)
  assert.ok(/const quietSince = \(\) => Math\.max\(lastHumanAt \?\? roomOpenedAt, lastEngagedAt\);/.test(t),
    'the idle gate lost its floor — a null reads as 0 and every gate opens at once');
  assert.equal((t.match(/Date\.now\(\) - quietSince\(\) < HOURS_IDLE_MS/g) || []).length, 2,
    'a gate still measures against the raw lastHumanAt');
});

// NOTHING ANSWERED: the orb says what is missing, not a canned line in its
// own voice. Run last, with this file's stand-ins for the page's storage and
// the network (no key here, and no own sign-in offered: the site has no key
// of its own to answer with, 2026-10-12).
{
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.fetch = async () => ({ json: async () => ({ ownBrain: false }) });
  const brain = await import('../src/brain.js');
  const r = await brain.respond('yo');
  ok('no AI provider: the reply says so, naming both ways in, off the air, and the line is not kept as answered', () => {
    assert.equal(r.speech, 'To talk with y3k, connect OpenRouter in one click (its free models cost nothing), add your own API key, or choose Claude Code in Settings → Brain. The site has no AI key of its own.');
    assert.equal(r.speech, brain.NO_PROVIDER);
    assert.ok(/your own API key/.test(r.speech) && /Claude Code/.test(r.speech) && /Settings → Brain/.test(r.speech), 'a way in is not named');
    assert.ok(/OpenRouter in one click/.test(r.speech), 'the one-click key (2026-10-26) is not named');
    assert.ok(!/—/.test(r.speech));
    assert.ok(r.local && r.notice, 'marked so it never goes on air');
    // …and marked for the room to offer the one click beside it (main.js showWake)
    assert.equal(r.nobrain, true, 'the room is not told to offer the one-click key');
    assert.ok(!/function localReply|calm: \["I'm here/.test(readFileSync(join(ROOT, 'src/brain.js'), 'utf8')), 'the canned lines are gone');
  });
  const said = [];
  const o = await brain.openingStream({ onText: (t) => said.push(t) });
  ok('…and arriving says it too, not a stray thought in the orb\'s voice', () => {
    assert.deepEqual(said, [brain.NO_PROVIDER]);
    assert.ok(o.seeded && o.notice);
    assert.equal(o.nobrain, true, 'arriving with nothing chosen does not offer the one click');
  });
  // NOT IN THOSE WORDS TO EVERYONE (2026-10-12). That was the only line: a
  // guest was told to choose Claude Code, which a guest is not offered, and
  // someone who had chosen it, with y3kode not answering, to choose it.
  const lines = async () => { const heard = []; const r = await brain.respond('yo'); await brain.openingStream({ onText: (t) => heard.push(t) }); return [r, heard]; };
  brain.claimBrowser(null);   // a guest at the door
  const [g, gHeard] = await lines();
  ok('a guest is told to sign in for their own Claude plan, not to choose Claude Code they are not offered', () => {
    assert.equal(g.speech, 'To talk with y3k, connect OpenRouter in one click (its free models cost nothing) or add your own API key in Settings → Brain, or sign in to think on your own Claude plan. The site has no AI key of its own.');
    assert.equal(g.speech, brain.NO_PROVIDER_GUEST);
    assert.deepEqual(gHeard, [brain.NO_PROVIDER_GUEST], 'arriving says the account\'s line to a guest');
    assert.ok(!/choose Claude Code/.test(g.speech) && /sign in/.test(g.speech) && /your own API key/.test(g.speech));
    assert.ok(g.local && g.notice && !/—/.test(g.speech));
    assert.equal(g.nobrain, true, 'a guest with nothing to think on is not offered the one click');
  });
  brain.claimBrowser({ id: 'acct-a' });
  globalThis.localStorage = { getItem: (k) => (k === 'y3k.ownBrain' ? JSON.stringify({ provider: 'claude' }) : k === 'y3k.owner' ? 'acct-a' : null), setItem() {}, removeItem() {} };
  const [c, cHeard] = await lines();
  ok('someone who chose Claude Code, with y3kode not answering, is told that and where to look, not to choose it', () => {
    assert.equal(c.speech, 'You chose Claude Code, but y3kode is not answering on this computer, so nothing can think yet. Settings → Brain shows what it needs.');
    assert.equal(c.speech, brain.OWN_UNREACHED);
    assert.deepEqual(cHeard, [brain.OWN_UNREACHED]);
    assert.ok(c.local && c.notice && !/—/.test(c.speech));
  });
  // a key provider chosen, with no key: nothing chosen to think on, the account's line
  globalThis.localStorage = { getItem: (k) => (k === 'y3k.ownBrain' ? JSON.stringify({ provider: 'none' }) : k === 'y3k.brainPick' ? 'openai' : k === 'y3k.owner' ? 'acct-a' : null), setItem() {}, removeItem() {} };
  const [n, nHeard] = await lines();
  ok('…and an account with nothing chosen to think on gets NO_PROVIDER, as before', () => {
    assert.equal(n.speech, brain.NO_PROVIDER);
    assert.deepEqual(nHeard, [brain.NO_PROVIDER]);
    assert.equal(brain.noBrain(), brain.NO_PROVIDER);
  });
  // a key in this browser that did not answer is a different sentence
  globalThis.localStorage = { getItem: () => JSON.stringify({ provider: 'openai', key: 'sk-x', model: 'm' }), setItem() {}, removeItem() {} };
  globalThis.fetch = async () => ({ json: async () => ({ available: false, reason: 'upstream' }) });
  const f = await brain.respond('yo');
  ok('a provider that is set but did not answer says that instead', () => {
    assert.equal(f.speech, brain.PROVIDER_FAILED);
    assert.ok(f.local && f.notice);
  });
  // CHANGED 2026-10-08. This case used to be a fetch that threw
  // TypeError('Failed to fetch') and it pinned PROVIDER_FAILED, which sent a
  // person whose phone had lost its signal to Settings to check a key that was
  // fine. A fetch that rejects got no answer from the site at all: that is the
  // device's connection, it is said as one, and the words go back in the box
  // (main.js). The answer that does come back without a reason, above, keeps
  // the old line.
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const off = await brain.respond('yo');
  ok('…but a device that could not reach the site is told that, not sent to its key', () => {
    assert.equal(off.speech, brain.whyLine('offline'));
    assert.equal(off.speech, 'This device could not reach the site. Check the connection, then try again.');
    assert.equal(off.why, 'offline');
    assert.ok(off.local && off.notice);
  });
}

// WHO IS HERE, ASKED EACH TIME IT IS SAID (2026-10-12). The guest line was
// picked by a latch set at the door, and a session check that answered after
// a guest had gone in (main.js: a slow answer is not a guest) made them a
// member without passing the door again: the latch still said guest, and a
// member was told to sign in.
{
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.fetch = async () => ({ json: async () => ({ ownBrain: false }) });
  const brain = await import('../src/brain.js');
  let acct = null;
  brain.claimBrowser(null);        // in as a guest
  brain.accountHere(() => acct);   // main.js: the account it holds, whatever it is now
  const asGuest = await brain.respond('yo');
  acct = { id: 'acct-late' };      // the session check answered late: this is someone
  const asMember = await brain.respond('yo');
  const heard = [];
  await brain.openingStream({ onText: (t) => heard.push(t) });
  ok('a guest whom a late session check signed in is told the account\'s line, not to sign in', () => {
    assert.equal(asGuest.speech, brain.NO_PROVIDER_GUEST);
    assert.equal(asMember.speech, brain.NO_PROVIDER, 'a member was told to sign in');
    assert.deepEqual(heard, [brain.NO_PROVIDER]);
    acct = null;                   // signed out again
    assert.equal(brain.noBrain(), brain.NO_PROVIDER_GUEST);
    acct = { id: 'acct-late' };
    // main.js says how to ask, once, and claims this browser for a late sign-in
    // the door was not passed again for (else what they keep here this visit
    // is forgotten as a guest's at their next sign-in)
    const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
    assert.match(main, /\naccountHere\(\(\) => account\);\n/, 'main.js never says how to ask who is here');
    assert.match(main, /import \{[^}]*\baccountHere\b[^}]*\} from '\.\/brain\.js';/);
    assert.match(main, /asked\.then\(\(late\) => \{ if \(late && !account && !authBusy\) \{ account = late; enterApp\(\); \} \}\)/);
    const door = main.slice(main.indexOf('function enterApp() {'), main.indexOf('enterApp.now = function'));
    assert.match(door, /\n  if \(account && loginEl\?\.classList\.contains\('gone'\)\) claimBrowser\(account\);\n/,
      'a late sign-in after the guest went in leaves this browser the guest\'s');
  });

  // WHOSE PAGE, ASKED THE SAME WAY (2026-10-12, G3). A guest's turn named no
  // one, so the site could not tell a guest tab left open from the account
  // signed in since in this browser. It says it is a guest's now (as: ''),
  // and a late session check names the account on the next turn, not the
  // guest the door saw.
  ok('every turn names whom main.js holds now: a guest says it is one, a late sign-in names the account', () => {
    acct = null;
    assert.deepEqual(brain.keyFields(), { as: '' }, 'a guest\'s turn names no one');
    assert.deepEqual(brain.whoseFields(), { as: '' });
    acct = { id: 'acct-late' };
    assert.deepEqual(brain.keyFields(), { as: 'acct-late' }, 'a late sign-in still says guest');
    assert.deepEqual(brain.whoseFields(), { as: 'acct-late' });
  });

  // EVERY "NOTHING THINKS" LINE, PICKED THE SAME WAY (2026-10-12). The dance,
  // a waking, the world's play, a post the presence writes and a chess move
  // each had a line of its own, and each sent the person to add a key or to
  // choose Claude Code, whatever they had chosen. Each asks brain.js noBrain
  // now, saying what it was for.
  const lines = {};
  acct = { id: 'acct-late' };
  lines.account = brain.noBrain('For your presence to dance');
  acct = null;
  lines.guest = brain.noBrain('For your presence to dance');
  acct = { id: 'acct-late' };
  globalThis.localStorage = { getItem: (k) => (k === 'y3k.ownBrain' ? JSON.stringify({ provider: 'claude' }) : null), setItem() {}, removeItem() {} };
  lines.own = brain.noBrain('For your presence to dance');
  lines.ownChosen = brain.nothingChosen();
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ok('the line for nothing to think on names what it was for, and is picked by who is here and what they chose', () => {
    assert.equal(lines.account, 'For your presence to dance, connect OpenRouter in one click (its free models cost nothing), add your own API key, or choose Claude Code in Settings → Brain. The site has no AI key of its own.');
    assert.equal(lines.guest, 'For your presence to dance, connect OpenRouter in one click (its free models cost nothing) or add your own API key in Settings → Brain, or sign in to think on your own Claude plan. The site has no AI key of its own.');
    assert.equal(lines.own, brain.OWN_UNREACHED, 'someone who chose Claude Code is told to choose it');
    assert.equal(lines.ownChosen, false, 'someone who chose Claude Code is offered another brain instead of what theirs needs');
    assert.equal(brain.noBrain(), brain.NO_PROVIDER, 'the conversation\'s own line changed');
  });

  // THE DEFAULT IS WHAT THEY THINK ON TOO (2026-10-12). noBrain asked only
  // for an explicit choice of Claude Code, so an account thinking on it by
  // default (no key saved, on a y3kode it paired here: own-brain.js
  // ownChoiceFor `auto`) with nothing answering there was told NO_PROVIDER:
  // to choose what it already thinks on. It asks for the choice in effect now.
  const pairedBy = (by, more = {}) => ({ getItem: (k) => (k === 'y3k-code:pair' ? JSON.stringify({ port: 47821, token: 'tok', by }) : more[k] ?? null), setItem() {}, removeItem() {} });
  acct = { id: 'acct-late' };
  globalThis.localStorage = pairedBy('acct-late');
  lines.byDefault = brain.noBrain('For your presence to dance');
  const turnByDefault = await brain.respond('yo');
  const openByDefault = [];
  await brain.openingStream({ onText: (t) => openByDefault.push(t) });
  globalThis.localStorage = pairedBy('acct-other');           // a y3kode another account paired here
  lines.notTheirs = brain.noBrain();
  globalThis.localStorage = pairedBy('acct-late', { 'y3k.brain': JSON.stringify({ provider: 'openai', key: 'sk-x', model: 'm' }) });
  lines.withKey = brain.noBrain();                            // a key of their own comes first
  globalThis.localStorage = pairedBy('acct-late', { 'y3k.brainPick': 'openai', 'y3k.ownBrain': JSON.stringify({ provider: 'none' }) });
  lines.declined = brain.noBrain();                           // another provider chosen here, no key yet
  acct = null;
  globalThis.localStorage = pairedBy('acct-late');
  lines.guestPaired = brain.noBrain();
  acct = { id: 'acct-late' };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ok('an account on its default Claude Code, with nothing answering there, is told that, not to choose it', () => {
    assert.equal(lines.byDefault, brain.OWN_DEFAULT_UNREACHED, 'told to choose Claude Code it already thinks on');
    assert.equal(turnByDefault.speech, brain.OWN_DEFAULT_UNREACHED, 'a conversation turn');
    assert.deepEqual(openByDefault, [brain.OWN_DEFAULT_UNREACHED], 'arriving');
    assert.ok(!/choose Claude Code/.test(lines.byDefault), lines.byDefault);
    assert.ok(!/You chose/.test(lines.byDefault), 'nobody chose it: it is the default');
    assert.ok(/Settings → Brain/.test(lines.byDefault) && /your own API key/.test(lines.byDefault) && !/—/.test(lines.byDefault));
    // and nowhere the default does not apply
    assert.equal(lines.notTheirs, brain.NO_PROVIDER, 'another account\'s y3kode is not this one\'s default');
    assert.equal(lines.withKey, brain.NO_PROVIDER);
    assert.equal(lines.declined, brain.NO_PROVIDER);
    assert.equal(lines.guestPaired, brain.NO_PROVIDER_GUEST);
  });
  ok('the dance, a waking, the world\'s play, a written post, chess and a match all ask for it', () => {
    const src = (f) => readFileSync(join(ROOT, f), 'utf8');
    const tend = src('src/tend.js');
    assert.match(tend, /else if \(r\?\.reason === 'byok'\) \{ showCaption\(noBrain\('For your presence to dance'\), 'y3k'\); stopAlive\(\); \}/);
    assert.match(tend, /else if \(r\?\.reason === 'byok'\) \{ showCaption\(noBrain\('For your presence to think on its own'\), 'y3k'\); stopAlive\(\); \}/);
    assert.ok(!/r\.error \|\| '(dancing|thinking) runs on/.test(tend), 'the server\'s words, said as they came');
    const social = src('src/social.js');
    assert.match(social, /if \(!canLive\(\)\) \{ \$\('compose-ai-status'\)\.textContent = noBrain\(WRITE_WITH\); return; \}/);
    assert.match(social, /textContent = r\.reason === 'byok' \? noBrain\(WRITE_WITH\)/);
    assert.ok(!/add your API key in settings to write|'add your API key in settings'/.test(social));
    const world = src('src/world-view.js');
    assert.match(world, /if \(ok === false\) toast\?\.\(noBrain\('For your presence to play the world'\)\);/);
    assert.ok(!/add your key or choose Claude Code/.test(world));
    const chess = src('src/chess.js');
    assert.equal((chess.match(/noBrain\(THINK_WITH\)/g) || []).length, 4, 'the two cards, a move, and the site\'s byok');
    assert.ok(!/choose (a brain|one) in settings/.test(chess));
    assert.match(src('src/match-view.js'), /else if \(r\.reason === 'byok'\) toast\?\.\(noBrain\('For your presence to play this match'\)\);/);
    assert.match(src('src/main.js'), /if \(why === 'byok'\) showCaption\(noBrain\(\), 'y3k'\);/, 'airden');
    for (const f of ['src/tend.js', 'src/social.js', 'src/world-view.js', 'src/chess.js', 'src/match-view.js']) {
      assert.match(src(f), /import \{[^}]*\bnoBrain\b[^}]*\} from '\.\/brain\.js';/, f);
    }
  });
}

console.log(`\n${passed} checks passed.`);
