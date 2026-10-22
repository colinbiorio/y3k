// A PRESENCE'S LIFE, AND WHO PAYS FOR IT. Run:  node test/life-brain.test.mjs
//
// Colin, 2026-10-12: thinking on your own Claude sign-in is for every account —
// the founder through the same door as anyone — and its only limit is the
// person's own plan. And the same day: "let's remove the site key entirely —
// i don't have the budget to let anyone charge me for free". So, for every
// account:
//   - a presence's LIFE (chess, matches, airden, every tend mode) and y3kode's
//     translator run on the owner's own key or the owner's own sign-in
//     (lifeBrain), and on nothing else;
//   - a turn on someone's own sign-in goes to their own page and nobody else's,
//     and only they may answer it (own-relay.mjs); it draws nothing from the
//     presence's budget and is $0 on their ledger — while the budget slider
//     still turns that life off;
//   - a CONVERSATION, or kode's note, with no key and no page of theirs
//     offering has nothing to think with: { available: false }, the founder's
//     no different. NO SITE KEY IS EVER SPENT: a server started WITH
//     ANTHROPIC_API_KEY and ELEVENLABS_API_KEY set never sends either one
//     anywhere, for anyone, and there is no house allowance, and no breaker
//     across every source, left to meter or refuse anybody;
//   - the founder's local variant (local-claude-code.mjs: the server itself
//     running `claude -p`, Y3K_LOCAL_CLAUDE_CODE=1) stays gone;
//   - the plan is the ONLY limit on that sign-in: reading a page and keeping
//     one draw nothing from the budget either, on a turn or a read that is on
//     the plan (readsOnPlan), while a read on a key still draws as it did;
//   - a choice made on one device holds while another device of the account
//     offers its sign-in: a page that declines it (own: false) is never sent
//     to it, at any door;
//   - a page offers only for the account it was loaded for (as=): a stale tab
//     whose browser is now signed in as someone else never offers to them;
//     and its turns, which name the account too (as), are told to reload at
//     every door that thinks, and where a finished game is kept, with nothing
//     written to the memory, the shelf, the ledger or the plan of the account
//     its cookie now carries; a guest's tab names nobody (as: ''), and is
//     told the same once someone has signed in since, while it still goes in
//     a browser that is nobody's;
//   - Code's translator never takes the last of an account's turns, and a turn
//     refused because the presence is already thinking as much as y3kode does
//     is said as that ('own-busy'), never as the plan's limit; the translator
//     says it as 'busy', so its page asks again, and spends none of its day's
//     count on a turn the relay did not take;
//   - every door that may think on someone's own sign-in tells the relay whose
//     machine asked (sourceOf), and a crowd behind one address (a carrier's
//     shared IPv4) is never refused for each other, nor anyone elsewhere for
//     them; and what the door holds while the turn waits (its body:
//     bodyHeld), so a long conversation counts whole against what the relay
//     holds for everyone; a picture, which the sign-in only notes, is let go
//     before the wait and counts for nothing;
//   - a match or a chess move refused only because the owner's turns are all
//     out is said as busy, never as the model failing, and never counts
//     toward a match's stuck brake;
//   - a closed account's pages are let go the moment it closes, and what they
//     were asked fails at once.
//
// The source checks hold the shape; several are ported from the deleted
// test/local-claude-code.test.mjs and test/house.test.mjs. Then a server,
// booted with both site keys in its environment, a stand-in for Anthropic's
// API (test/fakes/brain-scripted.mjs), one for the voice services
// (test/fakes/voice-upstream.mjs) and a spy on every request that leaves it,
// shows it, with this test as each person's page: it holds GET /api/own-brain
// open the way src/own-brain.js does, and answers each job the way y3kode
// would. A second, tiny server, with an old RATE_GLOBAL_MAX of three still
// set, shows that nothing counts everyone together any more.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { WEB_PAGE } from './fakes/brain-scripted.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

const SERVER = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
const RELAY = readFileSync(join(ROOT, 'own-relay.mjs'), 'utf8');
const fnSrc = (name) => {
  const at = SERVER.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `server.mjs has no function ${name}`);
  return SERVER.slice(at, SERVER.indexOf('\n}\n', at) + 3);
};
const constSrc = (name) => {
  const m = new RegExp(`^const ${name} = .*$`, 'm').exec(SERVER);
  assert.ok(m, `server.mjs has no one-line const ${name}`);
  return m[0];
};
const route = (from, to) => {
  const at = SERVER.indexOf(from);
  assert.ok(at >= 0, `server.mjs has no ${from}`);
  const end = SERVER.indexOf(to, at);
  assert.ok(end > at, `server.mjs has nothing after ${from} like ${to}`);
  return SERVER.slice(at, end);
};
const lifeSrc = fnSrc('lifeBrain');
const ownSrc = fnSrc('ownFor');
const rungSrc = fnSrc('ownRung');
const brainRoute = route("req.url === '/api/brain')", '// --- y3k Code × the presence');
const streamRoute = route("req.url === '/api/brain/stream')", '// --- Voice endpoints');
const handoffRoute = route("reqPath === '/api/code/handoff' || reqPath === '/api/code/note')", "reqPath === '/api/code/voice')");
const voiceRoute = route("reqPath === '/api/code/voice')", '// --- y3k Code, handed over');
const DECIDE = "const own = ownRung(user, { key, own: ownAsked });";
// Code as the server runs it: comment lines, and comments after code, gone,
// so a sentence about the rule never trips the check for it
const codeOf = (src) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

console.log('lifeBrain and ownFor (server.mjs):');

await ok('a life reads the key the body sent, else the asking account\'s own sign-in — and nothing about the request or the founder', () => {
  assert.match(lifeSrc, /^function lifeBrain\(user, \{ key, provider, model, own: asked \} = \{\}\) \{/);
  assert.match(ownSrc, /^function ownFor\(user\) \{/);
  assert.match(rungSrc, /^function ownRung\(user, \{ key, own \} = \{\}\) \{/);
  for (const [name, src] of [['lifeBrain', lifeSrc], ['ownFor', ownSrc], ['ownRung', rungSrc]]) {
    assert.ok(!/\breq\b|founder|API_KEY|house\.|localClaudeCode|LOCAL_CC|claude-code/.test(src.replace(/^function \w+\([^)]*\)/, '')),
      `${name} reaches for something besides the key and the account: ${src}`);
  }
  const who = /^export const WHO = .*$/m.exec(RELAY)?.[0] || '';
  assert.ok(who && !/founder/.test(who), 'own-relay.mjs WHO names the founder again: ' + who);
});

await ok('who pays for a life: the owner\'s key first, then their own sign-in, for any account — never the site\'s key', () => {
  const pageOpen = new Set();
  const { life, rung } = new Function('BRAIN_PROVIDERS', 'detectProvider', 'ownRelay', 'OWN_PROMPTS', 'OWN_MODEL', 'OWN_PID', `${ownSrc}\n${rungSrc}\n${lifeSrc}\nreturn { life: lifeBrain, rung: ownRung };`)(
    { anthropic: { defaultModel: () => 'claude-x' }, openai: { defaultModel: () => 'gpt-x' } },
    (k) => (k.startsWith('sk-ant-') ? 'anthropic' : k.startsWith('sk-') ? 'openai' : null),
    { connected: (u) => pageOpen.has(u?.id), provider: (u) => ({ relayFor: u.id }) }, {}, 'own:claude-code', 'own');
  const founder = { id: 'u1', founder: true };
  const member = { id: 'u2', founder: false };
  assert.equal(life(member, {}), null, 'nothing to pay with: the caller says "add a key"');
  assert.equal(life(founder, {}), null, 'the founder has no other way in');
  assert.equal(life(null, {}), null);
  pageOpen.add(member.id);
  const relayed = life(member, {});
  assert.deepEqual({ pid: relayed.pid, relayFor: relayed.p.relayFor, key: relayed.key, model: relayed.model },
    { pid: 'own', relayFor: member.id, key: null, model: 'own:claude-code' }, 'a member, through their own page and y3kode');
  assert.equal(life(founder, {}), null, 'one account\'s page thinks for nobody else');
  pageOpen.add(founder.id);
  assert.equal(life(founder, {}).p.relayFor, founder.id, 'and the founder through theirs, the same way');
  const mine = life(member, { key: 'sk-ant-mine' });
  assert.deepEqual({ pid: mine.pid, key: mine.key, model: mine.model }, { pid: 'anthropic', key: 'sk-ant-mine', model: 'claude-x' }, 'a key of their own is used first');
  assert.equal(life(member, { key: 'sk-ant-mine', model: 'claude-y' }).model, 'claude-y', 'the model it asked for');
  assert.equal(life(member, { key: 'sk-ant-mine', provider: 'toString' }).pid, 'anthropic', 'a name that is no provider\'s is not looked up');
  assert.deepEqual(life(member, { key: 'what-is-this' }), { error: 'unrecognized key' });
  assert.equal(life(member, { key: 42 }).pid, 'own', 'only a string is a key');
  // a page that declined the sign-in (another provider chosen on that device):
  // a key of its own, or nothing — never the sign-in another device offers
  assert.equal(life(member, { own: false }), null, 'a declined sign-in was used anyway');
  assert.equal(life(member, { key: 'sk-ant-mine', own: false }).pid, 'anthropic');
  for (const own of [true, undefined, null, 0, '', 'false']) assert.equal(life(member, { own }).pid, 'own', `only own: false declines (${JSON.stringify(own)})`);
  // …and the conversations' rung, the same decision
  assert.equal(rung(member, {}).p.relayFor, member.id);
  assert.equal(rung(member, { own: false }), null);
  assert.equal(rung(member, { key: 'sk-ant-mine' }), null);
  assert.equal(rung(member, { key: 42 }).pid, 'own');
  assert.equal(rung({ id: 'nobody' }, {}), null);
});

await ok('chess, matches, airden, the translator, the voice it designs, its steps on the computer and twenty questions ask it with the session\'s own account and only what the body sent', () => {
  const calls = SERVER.match(/lifeBrain\([^)]*\)/g).filter((c) => !c.startsWith('lifeBrain(user, { key, provider, model, own: asked } = {}'));
  // (the whole body: its key and its own: false, if the page declined the sign-in;
  // the fifth whole body is twenty questions', 2026-10-19)
  assert.deepEqual(calls.sort(), ['lifeBrain(user, b)', 'lifeBrain(user, b)', 'lifeBrain(user, b)', 'lifeBrain(user, b)', 'lifeBrain(user, b)', 'lifeBrain(user, { key: b.key, provider: b.provider, model: b.model, own: b.own })',
    'lifeBrain(user, { key: body.key, provider: body.provider, own: body.own })'].sort(), calls.join(', '));
  // the translator: whose brain is decided before the day's count is taken, so
  // a page with nothing to think with spends none of it; and its model is a
  // small one, never the one the page talks with (no `model` is passed on)
  const voiceCode = codeOf(voiceRoute);
  assert.match(voiceCode, /const brain = lifeBrain\(user, \{ key: body\.key, provider: body\.provider, own: body\.own \}\);\n\s*if \(!brain \|\| brain\.error\) return json\(200, \{ available: false \}\);\n\s*if \(brain\.pid !== OWN_PID && !codeVoiceCap\.take\(user\.id\)\) return json\(200, \{ available: false, reason: 'cap' \}\);/);
  // on the person's own sign-in, the translator leaves one of their turns spare
  // (own-relay.mjs ask), and takes the day's count only once the relay takes
  // the turn (admit): a turn refused busy spends none of it, and is said as
  // busy so the page asks again; a count that is spent is said as before
  assert.match(voiceCode, /if \(brain\.pid === OWN_PID\) \{[^}]*o\.spare = 1;\s*o\.admit = \(\) => codeVoiceCap\.take\(user\.id\);\s*\}/);
  assert.equal(voiceCode.split('codeVoiceCap.take(').length - 1, 2, 'the day\'s count is taken somewhere else too');
  assert.match(voiceCode, /if \(out\?\.status === 'not-admitted'\) return json\(200, \{ available: false, reason: 'cap' \}\);\n\s*if \(brain\.pid === OWN_PID && ownWhy\(out\)\) return json\(200, \{ available: false, reason: 'busy' \}\);/);
  assert.ok(voiceCode.indexOf("reason: 'busy'") < voiceCode.indexOf('readVoiced('), 'a busy turn is read as words');
  assert.equal(codeOf(SERVER).split('spare').length - 1, 1, 'another door leaves turns spare: only the translator may');
  assert.match(voiceRoute, /const model = brain\.pid === 'anthropic' \? VOICE_MODEL : brain\.model;/);
  assert.match(voiceRoute, /await brain\.p\.chat\(brain\.key, model, /);
  assert.match(route("reqPath === '/api/chess/think'", '// ===== PHRASZLE'),
    /const user = sessionUser\(req\);[\s\S]*const own = lifeBrain\(user, b\);\n\s*if \(!own\) return json\(200, \{ available: false, reason: 'byok'[\s\S]*own\.p\.chat\(own\.key/);
  assert.match(SERVER, /const own = lifeBrain\(user, b\);\n\s*if \(!own\) return json\(200, \{ available: false, reason: 'byok', error: 'your presence thinks on your own key or your own Claude plan — choose one in settings → brain\.' \}\);/);
  assert.match(route("req.url === '/api/speak'", "req.url === '/api/brain')"),
    /const brain = lifeBrain\(user, \{ key: b\.key, provider: b\.provider, model: b\.model, own: b\.own \}\);\n\s*if \(!brain\) return json\(200, \{ available: false, reason: 'byok' \}\);/);
});

await ok('the mine still digs only on a key: never a life, never anyone\'s sign-in, never the site', () => {
  const mine = route("reqPath === '/api/phraszle/chat'", "reqPath === '/api/phraszle/guess'") + route("reqPath === '/api/phraszle/guess'", 'const spend = ');
  assert.ok(mine.length > 500 && !/lifeBrain|ownFor|ownRelay|API_KEY|house\./.test(mine), 'the mine\'s attempts are paid work: a key, always');
});

await ok('tend: the owner\'s key or their own sign-in, decided once, and past them nothing thinks', () => {
  const decide = brainRoute.indexOf(DECIDE);
  const gate = brainRoute.indexOf("if (tendMode && !(key && typeof key === 'string') && !own) {\n        return json(200, { available: false, reason: 'byok'");
  const nothing = brainRoute.indexOf("return json(200, { available: false });\n      } finally {");
  assert.ok(decide > 0 && gate > decide && nothing > gate, `decide ${decide}, gate ${gate}, nothing ${nothing}`);
  assert.equal(brainRoute.split('ownRung(').length - 1, 1, 'the route asks whose sign-in it is more than once, and the answers could differ');
  assert.ok(!brainRoute.includes('ownFor('), 'the route asks around ownRung, and could miss a page that declined');
  // both branches return, so a tend turn past the gate ends in one of them
  const above = brainRoute.slice(brainRoute.indexOf("if (key && typeof key === 'string') {", gate), nothing);
  assert.match(above, /return await finish\(out, useModel, pid\);/);
  assert.match(above, /if \(own\) \{[\s\S]*return await finish\(out, own\.model, own\.pid\);/);
  // …and after them nothing thinks: there is no third rung to fall to
  const after = above.slice(above.indexOf('return await finish(out, own.model, own.pid);'));
  assert.ok(!/chat\(|chatWithRescue\(|chatStream\(/.test(codeOf(after)), 'a third rung thinks: ' + after);
  // a beat on the sign-in as on a key: fenced messages, no wordless-rescue retry
  assert.match(above, /const out = tendMode\n\s*\? await own\.p\.chat\(null, own\.model, tendMessages, image, paint, o\)/);
});

await ok('a turn on the owner\'s own sign-in draws no budget and is $0 on their ledger; a turn on a key draws as it always has', () => {
  const spent = [];
  const posts = { recordSpend: (id, usd) => spent.push([id, usd]), estimateCost: (m, i, o) => (i + o) / 1e6 };
  const { drawBudget, ledgerCost } = new Function('posts', 'OWN_PID', `${constSrc('ledgerCost')}\n${constSrc('drawBudget')}\nreturn { drawBudget, ledgerCost };`)(posts, 'own');
  drawBudget('p1', 'own', 0.5);
  drawBudget('p1', 'own', 0);
  assert.deepEqual(spent, [], 'a turn on the owner\'s sign-in drew the budget');
  drawBudget('p1', 'anthropic', 0.5);
  drawBudget('p1', 'openai', 0);
  assert.deepEqual(spent, [['p1', 0.5], ['p1', 0.0002]], 'a turn on a key: its price, and never less than the floor');
  assert.equal(ledgerCost('own', 'own:claude-code', { in: 900, out: 120 }), 0);
  assert.equal(ledgerCost('anthropic', 'm', { in: 1e6, out: 0 }), 1);
  // every turn's draw goes through drawBudget: the life routes, the tend beat
  for (const line of ['drawBudget(pres.id, pid2, cost);', 'drawBudget(presence.id, brain.pid, posts.estimateCost(brain.model, u.in || 0, u.out || 0));',
    'drawBudget(presence.id, usedProvider, posts.estimateCost(meteredModel, inTok, outTok));']) assert.ok(SERVER.includes(line), line);
  // what is left drawing directly is the site's own fetching (a page read, a
  // page kept) — never a turn's thinking — and each of those draws only off
  // the owner's own plan: a read the plan takes (readsOnPlan), or a page kept
  // on a turn on the sign-in, draws nothing, as the thinking does not
  const direct = SERVER.split('\n').map((l) => l.trim()).filter((l) => l.includes('posts.recordSpend(') && !l.startsWith('const drawBudget'));
  assert.ok(direct.length >= 3 && direct.every((l) => /posts\.recordSpend\((p|presence)\.id, 0\.00(02|1)\)/.test(l)), 'a turn draws the budget around drawBudget:\n' + direct.join('\n'));
  assert.ok(direct.every((l) => /(^|; )if \((!onPlan|!readsOnPlan\(user, params\)|usedProvider !== OWN_PID)\) posts\.recordSpend\(/.test(l)),
    'the site\'s fetching draws on the owner\'s own plan:\n' + direct.join('\n'));
  // a read is on the plan only when the page says so, a page of theirs offers
  // the plan now, and the read carries no key
  const plan = new Set();
  const readsOnPlan = new Function('ownFor', `${constSrc('readsOnPlan')}\nreturn readsOnPlan;`)((u) => (plan.has(u?.id) ? { pid: 'own' } : null));
  const q = (s) => new URLSearchParams(s);
  assert.equal(readsOnPlan({ id: 'u2' }, q('own=1')), false, 'no page offers the plan');
  plan.add('u2');
  assert.equal(readsOnPlan({ id: 'u2' }, q('own=1')), true);
  for (const s of ['', 'own=0', 'own=true', 'own=1&key=sk-ant-x', 'own=1&key=']) assert.equal(readsOnPlan({ id: 'u2' }, q(s)), false, s);
  assert.equal(readsOnPlan({ id: 'u3' }, q('own=1')), false, 'another account\'s plan');
  // a ledger line is free only for a turn on someone's own sign-in
  const records = SERVER.split('apiUsage.record(').slice(1).map((s) => s.slice(0, s.indexOf('});') + 3));
  assert.ok(records.length >= 7, `${records.length} ledger lines`);
  for (const r of records) assert.ok(/cost: (ledgerCost\(|posts\.estimateCost\(|pid === OWN_PID \? 0 : posts\.estimateCost\()/.test(r), 'a ledger line priced some other way: ' + r);
});

await ok('the budget slider still turns a life off, on any brain: tend, airden and matches ask hasBudget before they think', () => {
  assert.ok(brainRoute.indexOf("!posts.hasBudget(presence.id)") < brainRoute.indexOf('tendInFlight.add('), 'tend');
  const speak = route("req.url === '/api/speak'", "req.url === '/api/brain')");
  assert.ok(speak.indexOf('posts.hasBudget(presence.id)') > 0 && speak.indexOf('posts.hasBudget(presence.id)') < speak.indexOf('brain.p.chat('), 'airden');
  const match = route('// ---- think: one metered move', 'matchThinking.set(');
  assert.match(match, /if \(!posts\.hasBudget\(pres\.id\)\) return json\(200, \{ available: false, reason: 'budget' \}\);/, 'matches');
});

await ok('no site key, no house, no breaker: the door counts each person, or each guest\'s source, on its own, and each brain door decides once, before it thinks', () => {
  // the site's keys are read nowhere: not by the server, not by any module beside it
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.mjs'))) {
    assert.ok(!/ANTHROPIC_API_KEY|ELEVENLABS_API_KEY/.test(codeOf(readFileSync(join(ROOT, f), 'utf8'))), `${f} reads a site key again`);
  }
  const code = codeOf(SERVER);
  for (const word of ['API_KEY', 'EL_KEY', 'brainKeyOk', 'house.', 'houseRefused', 'houseCost', 'HOUSE_', 'houseWeight',
    'RATE_GLOBAL_MAX', 'globalHits', 'breakerTripped', 'OWN_DOORS', 'breakerOwed', 'owedBreakerTripped']) {
    assert.ok(!code.includes(word), `server.mjs has ${word} again`);
  }
  // the allowance and its test are gone, and nothing imports it or sweeps its file
  for (const f of ['house.mjs', 'test/house.test.mjs']) assert.ok(!existsSync(join(ROOT, f)), f + ' is back');
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.mjs'))) {
    assert.ok(!/from '\.\/house\.mjs'/.test(readFileSync(join(ROOT, f), 'utf8')), f + ' imports the house');
  }
  assert.ok(!readFileSync(join(ROOT, 'hull.mjs'), 'utf8').includes("'.house.json'"));
  assert.ok(!JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.test.includes('house.test'));
  // health reports no brain, model, effort or voice of the site's
  assert.match(SERVER, /return json\(200, \{ ok: true, brainProviders: Object\.keys\(BRAIN_PROVIDERS\), code: CODE_ROLLOUT,\n/);
  // the door counts in its class, and nothing else: a signed-in person's
  // requests by their own account, wherever they come from, and their
  // address's flood guard only what that let through, so a crowd behind one
  // carrier's IPv4 never refuses its own ordinary turns, nor the answers its
  // own pages send back for them (2026-10-12; walked on a server in
  // test/security.test.mjs); a guest's by the source. Every class but the
  // downloads, the paid and the cheap first among them.
  assert.match(SERVER, /if \(rateLimited\(req, cls\)\) \{/);
  const limiter = fnSrc('rateLimited');
  assert.match(limiter, /^function rateLimited\(req, cls\) \{/);
  assert.match(limiter, /const c = RATE_CLASSES\[cls\] \|\| RATE_CLASSES\.paid;\n/);
  assert.match(limiter, /const uid = sessionUser\(req\)\?\.id;\n  if \(uid\) return overCeiling\(c\.accounts, c\.max, uid, now\) \|\| overCeiling\(c\.flood, c\.sourceMax, source, now\);\n  return overCeiling\(c\.guests, c\.max, source, now\);\n\}/);
  assert.match(SERVER, /^  paid: \{ max: RATE_MAX, sourceMax: RATE_SOURCE_MAX, accounts: accountHits, flood: floodHits, guests: rateHits \},$/m);
  assert.match(SERVER, /^  cheap: \{ max: RATE_CHEAP_MAX, sourceMax: RATE_CHEAP_SOURCE_MAX, accounts: cheapAccountHits, flood: cheapFloodHits, guests: cheapHits \},$/m);
  assert.match(SERVER, /^const RATE_SOURCE_MAX = Number\(process\.env\.RATE_SOURCE_MAX\) \|\| RATE_MAX \* 200;/m);
  assert.match(SERVER, /^const RATE_CHEAP_SOURCE_MAX = Number\(process\.env\.RATE_CHEAP_SOURCE_MAX\) \|\| RATE_CHEAP_MAX \* 200;/m);
  // four classes, twelve counts, none shared: a class's three counts are its
  // own, so a feed's poll never spends a turn, nor a guest a person's
  const rows = [...SERVER.matchAll(/^  (\w+): \{ max: \w+, sourceMax: \w+, accounts: (\w+), flood: (\w+), guests: (\w+) \},$/gm)];
  assert.deepEqual(rows.map((r) => r[1]), ['paid', 'cheap', 'walk', 'eye']);
  const counts = rows.flatMap((r) => r.slice(2));
  assert.equal(new Set(counts).size, 12, `a count is shared between classes: ${counts}`);
  for (const m of counts) assert.match(SERVER, new RegExp(`^const ${m} = new Map\\(\\);$`, 'm'));
  // the page's stream and its answer to its own-brain job are cheap, and so
  // are the feed's and the world's polls: a turn on someone's own sign-in is
  // one paid request, never two
  const paidRe = new RegExp(/^ +: \/(\^\\\/api\\\/\(brain\|[^\n]*\))\/\.test\(reqPath\) \? 'paid' : 'cheap';$/m.exec(SERVER)?.[1] || '$^');
  assert.ok(paidRe.test('/api/brain') && paidRe.test('/api/brain/stream'), `the paid class is not where it was: ${paidRe}`);
  for (const p of ['/api/own-brain', `/api/own-brain/${'a'.repeat(32)}`, '/api/feed', '/api/world/here']) assert.ok(!paidRe.test(p), `${p} joined the paid class`);
  // each brain door decides its rung once, and asks no one before it has
  for (const [name, src] of [['/api/brain', brainRoute], ['/api/brain/stream', streamRoute], ['/api/code/handoff', handoffRoute]]) {
    const decide = src.indexOf(DECIDE);
    assert.ok(decide > 0, `${name} never decides`);
    assert.ok(!/chatWithRescue\(|\.chatStream\(|\.p\.chat\(/.test(src.slice(0, decide)), `${name} thinks before it has decided whose brain it is`);
    assert.equal(src.split(DECIDE).length - 1, 1, name);
  }
});

await ok('every door reads the page\'s own word on the sign-in, and a stream is asked again of its own cookie before a turn', () => {
  for (const [name, src] of [['/api/brain', brainRoute], ['/api/brain/stream', streamRoute], ['/api/code/handoff', handoffRoute]]) {
    const read = src.indexOf('own: ownAsked');
    assert.ok(read > 0 && read < src.indexOf(DECIDE), `${name} decides before it reads whether the page declined the sign-in`);
  }
  const stream = route("reqPath === '/api/own-brain')", "own-brain\\/([0-9a-f]{32})$/");
  assert.match(stream, /ownRelay\.open\(req, res, me, \{ provider: [^\n]*, valid: \(\) => sessionUser\(req\)\?\.id === me\.id \}\);/,
    'the relay is not asked to check the stream\'s session again');
});

await ok('every door that thinks, or keeps a game, refuses a body from a page loaded for another account, before it reads or writes anything for it', () => {
  // a guest's page says it was loaded for nobody (as: ''), and that is
  // another account once someone has signed in since; a body naming nothing
  // at all (a page from before) still goes
  const forAnother = constSrc('forAnother');
  assert.equal(forAnother, "const forAnother = (req, as) => as != null && as !== (sessionUser(req)?.id ?? '');");
  const refused = new Function('sessionUser', `${forAnother}\nreturn forAnother;`);
  const signedIn = refused(() => ({ id: 'u2' })), nobody = refused(() => null);
  assert.deepEqual(['u2', 'u3', '', undefined, null].map((as) => signedIn({}, as)), [false, true, true, false, false], 'with a session');
  assert.deepEqual(['u2', '', undefined, null, 0].map((as) => nobody({}, as)), [true, false, false, false, true], 'with none');
  assert.match(SERVER, /^const RELOAD = \{ error: 'reload', reason: 'reload' \};$/m);
  const finished = route("reqPath === '/api/chess/finished'", '// A person\'s public profile');
  const doors = {
    brain: brainRoute, stream: streamRoute, handoff: handoffRoute, voice: voiceRoute,
    speak: route("req.url === '/api/speak'", "req.url === '/api/brain')"),
    chess: route("reqPath === '/api/chess/think'", '// ===== PHRASZLE'),
    match: route('// ---- think: one metered move', '// ===== '),
    // the orb using the computer, and the voice it designs (2026-10-19)
    computer: route("reqPath === '/api/computer/step'", "reqPath === '/api/voice/self'"),
    selfVoice: route("reqPath === '/api/voice/self'", "req.url === '/api/voice/design'"),
    // twenty questions (2026-10-19): its thinking steps, and its end, which
    // keeps the game on the shelf
    twenty: route("reqPath === '/api/twenty'", '// ===== THE WORLD'),
    // a finished game becomes a clipping on the presence's shelf
    finished,
    // the dreamed life (2026-10-21): a moment lived in lucid becomes a line of
    // the presence's journal, written without thinking, so it is guarded as
    // the finished game is
    lifeMoment: route("reqPath === '/api/life/moment'", "reqPath === '/api/chess/finished'"),
  };
  for (const [name, src] of Object.entries(doors)) {
    const code = codeOf(src);
    const refuse = code.search(/if \(forAnother\(req, (loadedFor|b\?\.as|body\?\.as)\)\) return json\(409, RELOAD\);/);
    assert.ok(refuse > 0, `${name} does not refuse a page loaded for another account`);
    const read = code.search(/readJsonBody\(/);
    assert.ok(read >= 0 && read < refuse, `${name} refuses before it has the body`);
    for (const after of ['ownRung(', 'lifeBrain(', 'getMemory(', 'getPresenceMemory(', 'addMemory(', 'addClipping(', 'chat(', 'chatWithRescue(', 'presences.byHandle(', 'thinkContext(']) {
      const at = code.indexOf(after);
      assert.ok(at < 0 || at > refuse, `${name} reaches ${after} before it refuses a page loaded for another account`);
    }
  }
  const kept = codeOf(finished);
  assert.ok(kept.indexOf('presenceOfOwner(') > kept.indexOf('json(409, RELOAD)'), 'the finished game finds a presence before it refuses');
  assert.equal(codeOf(SERVER).split('json(409, RELOAD)').length - 1, 12, 'a door refuses for another account that is not one of the twelve, or one does not');
});

await ok('every door that may think on the sign-in tells the relay whose machine asked, as the rate limiter counts it, and what it holds while the turn waits', () => {
  // the provider carries the route's source, and what the route holds, to
  // ask() (own-relay.mjs), and each door hands it the request's own, never
  // one a body could name: its source, and its body's bytes as read
  assert.match(RELAY, /source: opts\?\.source/);
  assert.match(RELAY, /holds: opts\?\.holds/);
  assert.match(SERVER, /^const bodyHeld = \(req, letGo = 0\) => Math\.max\(0, \(BODY_BYTES\.get\(req\) \|\| 0\) - letGo\);$/m);
  const read = fnSrc('readJsonBody');
  assert.match(read, /\n\s*BODY_BYTES\.set\(req, size\);\n/);
  assert.ok(read.indexOf('BODY_BYTES.set(req, size)') > read.indexOf('for await (const c of req)'), 'the bytes are noted before the body is read');
  const doors = {
    chess: [route("reqPath === '/api/chess/think'", '// ===== PHRASZLE'), /own\.p\.chat\(own\.key, useModel, \[\{ role: 'user', content: userMsg \}\], null, false,\n\s*\{ system: sys, raw: true, effort: effort \|\| 'medium', source: sourceOf\(req\), holds: bodyHeld\(req\) \}\);/],
    match: [route('// ---- think: one metered move', '// ===== '), /own\.p\.chat\(own\.key, useModel, \[\{ role: 'user', content: mkUser\(rejected\) \}\], null, false,\n\s*\{ system: sys, raw: true, effort: b\.effort \|\| 'medium', source: sourceOf\(req\), holds: bodyHeld\(req\) \}\);/],
    speak: [route("req.url === '/api/speak'", "req.url === '/api/brain')"), /brain\.p\.chat\(brain\.key, brain\.model, \[\{ role: 'user', content: prompt \}\], null, false, withClock\(\{ system, raw: true, noThink: true, source: sourceOf\(req\), holds: bodyHeld\(req\) \}, b\.tz\)\);/],
    // a picture is only noted on the sign-in: let go before the turn waits, and not counted
    brain: [brainRoute, /const picture = typeof image === 'string' \? image\.length : 0;\n\s*if \(image\) image = true;\n\s*const o = \{ \.\.\.opts, signal: gone\.signal, source: sourceOf\(req\), holds: bodyHeld\(req, picture\) \};\n\s*const out = tendMode\n\s*\? await own\.p\.chat\(null, own\.model, tendMessages, image, paint, o\)\n\s*: await chatWithRescue\(own\.p, null, own\.model, messages, image, paint, o\);/],
    handoff: [handoffRoute, /\} else if \(own\) \{\n\s*out = await chatWithRescue\(own\.p, null, own\.model, messages, null, false, \{ \.\.\.opts, source: sourceOf\(req\), holds: bodyHeld\(req\) \}\);/],
    voice: [voiceRoute, /const o = \{ system, noThink: true, raw: true, source: sourceOf\(req\), holds: bodyHeld\(req\) \};[\s\S]*await brain\.p\.chat\(brain\.key, model, \[\{ role: 'user', content: text \}\], null, false, o\);/],
    computer: [route("reqPath === '/api/computer/step'", "reqPath === '/api/voice/self'"), /own\.p\.chat\(own\.key, own\.model, \[\{ role: 'user', content: userMsg \}\], image, false,\n\s*\{ system: sys, raw: true, effort: 'medium', source: sourceOf\(req\), holds: bodyHeld\(req\) \}\);/],
    selfVoice: [route("reqPath === '/api/voice/self'", "req.url === '/api/voice/design'"), /own\.p\.chat\(own\.key, own\.model, \[\{ role: 'user', content: 'Design your own voice\.' \}\], null, false,\n\s*\{ system: sys, raw: true, effort: 'medium', source: sourceOf\(req\), holds: bodyHeld\(req\) \}\);/],
    twenty: [route("reqPath === '/api/twenty'", '// ===== THE WORLD'), /own\.p\.chat\(own\.key, own\.model, \[\{ role: 'user', content: userMsg \}\], null, false,\n\s*\{ system: sys, raw: true, effort, source: sourceOf\(req\), holds: bodyHeld\(req\) \}\);/],
    stream: [streamRoute, /pid = own\.pid; useKey = null; useModel = own\.model; ownP = own\.p;\n\s*opts\.source = sourceOf\(req\);\n(\s*\/\/.*\n)*\s*const picture = typeof image === 'string' \? image\.length : 0;\n\s*if \(image\) image = true;\n\s*opts\.holds = bodyHeld\(req, picture\);\n/],
  };
  for (const [name, [src, call]] of Object.entries(doors)) assert.match(src, call, `${name} does not tell the relay whose machine asked, and what it holds`);
  // the only picture let go is on the sign-in: a key's turn still sees it
  assert.equal(codeOf(SERVER).split('if (image) image = true;').length - 1, 2);
  assert.ok(brainRoute.indexOf('if (image) image = true;') > brainRoute.indexOf('if (own) {'), '/api/brain lets a picture go before it is on the sign-in');
  // the stream's every call on the sign-in carries those options
  assert.match(streamRoute, /\(ownP \|\| BRAIN_PROVIDERS\[pid\]\)\.chatStream\(useKey, useModel, messages, \(c\) => parser\.push\(c\), image, paint, ac\.signal, opts\);/);
  assert.match(streamRoute, /\(ownP \|\| BRAIN_PROVIDERS\[pid\]\)\.chat\(useKey, useModel, messages, image, paint, \{ \.\.\.opts, noThink: true, signal: ac\.signal \}\);/);
  // and nowhere else does a turn reach the sign-in: every call on own.p, a
  // life's brain.p, or the stream's ownP is one of the doors above
  const code = codeOf(SERVER);
  assert.equal(code.split(/own\.p\.chat\(|chatWithRescue\(own\.p,/).length - 1, 8, 'another call on the sign-in');
  assert.equal(code.split('brain.p.chat(').length - 1, 2, 'another life\'s call');
  assert.equal(code.split('(ownP || BRAIN_PROVIDERS[pid])').length - 1, 2, 'another stream call');
  // a closed account's pages go when it closes, after its record is gone
  const del = route("reqPath === '/api/me/delete'", "reqPath === '/api/feed'");
  assert.match(del, /const gone = deleteAccount\(uid\);\n\s*if \(gone\.error\) return json\(400, gone\);\n(\s*\/\/.*\n)*\s*ownRelay\.forget\(uid\);/);
});

await ok('the stream: a key, the person\'s own sign-in, or nothing — no third branch', () => {
  assert.match(streamRoute, /let pid; let useKey; let useModel; let ownP = null;\n/);
  const ladder = streamRoute.slice(streamRoute.indexOf(DECIDE), streamRoute.indexOf("res.writeHead(200, { 'content-type': 'text/event-stream'"));
  assert.match(ladder, /if \(key && typeof key === 'string'\) \{[\s\S]*\} else if \(own\) \{[\s\S]*\} else \{[\s\S]*return json\(200, \{ available: false \}\);\n\s*\}\n/);
  assert.equal(ladder.split('} else if (').length - 1, 1, 'a third rung');
  assert.ok(!/onHouse|houseHold|API_KEY|MODEL;/.test(codeOf(streamRoute)), 'the stream reaches for the site again');
});

await ok('the local variant stays gone: no file, no flag, no loopback bind, nothing that imports it', () => {
  for (const f of ['local-claude-code.mjs', 'test/local-claude-code.test.mjs', 'test/fakes/brain-claude.mjs', 'test/fakes/speak-claude.mjs',
    'test/fakes/play-claude.mjs', 'test/fakes/recall-claude.mjs']) assert.ok(!existsSync(join(ROOT, f)), f + ' is back');
  for (const word of ['local-claude-code', 'localClaudeCode', 'LOCAL_CC', 'providerFor', "'claude-code'", 'Y3K_LOCAL_CLAUDE', 'Y3K_CLAUDE_BIN', "'127.0.0.1']"]) {
    assert.ok(!SERVER.includes(word), `server.mjs mentions ${word} again`);
  }
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.mjs'))) {
    assert.ok(!/from '\.\/local-claude-code\.mjs'/.test(readFileSync(join(ROOT, f), 'utf8')), f + ' imports the local brain');
  }
  // no test or smoke turns it on, or hands it a binary
  for (const dir of ['test', 'scripts']) {
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith('.mjs') && x !== 'life-brain.test.mjs')) {
      const src = readFileSync(join(ROOT, dir, f), 'utf8');
      assert.ok(!/Y3K_LOCAL_CLAUDE_CODE: '1'|Y3K_CLAUDE_BIN/.test(src), `${dir}/${f} still runs the local brain`);
    }
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.test.includes('node test/life-brain.test.mjs') && !pkg.scripts.test.includes('local-claude-code'));
  // it listens as it did before there was a local brain to keep on loopback
  assert.match(SERVER, /server\.listen\(PORT, \(\) => \{/);
});

// --- the server ---------------------------------------------------------------
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(15); } };
const DATA = mkdtempSync(join(tmpdir(), 'y3k-life-brain-'));
const LOG = join(DATA, 'brain.log');
const VOICE_LOG = join(DATA, 'voice.log');
const SPY_LOG = join(DATA, 'spy.log');
const PASSWORD = 'life-' + Math.random().toString(36).slice(2);
// What an old deploy's dashboard may still hold. The server is started with
// both, and neither may ever leave it.
const SITE_KEY = 'sk-ant-site-never-spent';
const SITE_EL_KEY = 'el-site-never-spent';
// A `claude` that leaves a mark if anything ever runs it: the server is booted
// with the old local flag on and this as its binary, and nothing may.
const MARK = join(DATA, 'local-claude-ran');
const LOCAL_BIN = join(DATA, 'claude');
writeFileSync(LOCAL_BIN, `#!/bin/sh\necho ran > '${MARK}'\n`);
chmodSync(LOCAL_BIN, 0o755);
// THE SPY: loaded last, so it wraps the fakes and sees every request the server
// sends anywhere but itself or the one page of the open web, before a fake (or
// the network) answers it — the host, the path, and every credential header.
const SPY = `
import { appendFileSync } from 'node:fs';
const real = globalThis.fetch;
globalThis.fetch = (url, init = {}) => {
  let u = null;
  try { u = new URL(String(url)); } catch { /* not a URL */ }
  if (u && !/^(127\\.0\\.0\\.1|localhost|203\\.0\\.113\\.7)$/.test(u.hostname)) {
    const raw = init.headers instanceof Headers ? Object.fromEntries(init.headers) : (init.headers || {});
    const h = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), String(v)]));
    appendFileSync(process.env.SPY_LOG, JSON.stringify({ host: u.host, path: u.pathname, creds: [h['x-api-key'], h['xi-api-key'], h.authorization].filter(Boolean) }) + '\\n');
  }
  return real(url, init);
};`;
const SPY_URL = `data:text/javascript;base64,${Buffer.from(SPY).toString('base64')}`;

async function bootSite(port, env, imports = []) {
  const child = spawn(process.execPath, ['--import', './test/fakes/brain-scripted.mjs', ...imports.flatMap((m) => ['--import', m]), 'server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), FAKE_BRAIN_SCRIPT: 'speak', RENDER: '', CODE_ROLLOUT: '', MODEL: '', ...env },
  });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch { /* booting */ } await sleep(120); }
  return child;
}
const stop = async (child) => { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); } };

// One site's doors, and a person's page on it.
function site(base) {
  const post = (path, body, cookie, headers = {}) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body),
  });
  const get = (path, cookie, headers = {}) => fetch(base + path, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
  const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
  const signup = async (username) => {
    const r = await post('/api/auth/signup', { email: `${username}@example.com`, username, password: 'a-long-password-1', age17: true, terms: true });
    assert.ok(r.ok, `signup ${username}: ${r.status}`);
    return cookieOf(r);
  };
  const health = (cookie) => get('/api/health', cookie).then((r) => r.json());
  // the account a cookie is signed in as
  const idOf = (cookie) => get('/api/auth/me', cookie).then((r) => r.json()).then((j) => j.user?.id);
  // GET /api/own-brain held open, as src/own-brain.js holds it, for the
  // account it was loaded for: every event kept.
  async function page(cookie) {
    const ac = new AbortController();
    const events = [];
    let ended = false;
    const as = await idOf(cookie);
    assert.ok(as, 'the page was loaded for nobody');
    const r = await fetch(`${base}/api/own-brain?provider=claude&as=${encodeURIComponent(as)}`, { headers: { cookie }, signal: ac.signal });
    assert.equal(r.status, 200, 'the stream was refused');
    (async () => {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { ended = true; break; }
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (ev) events.push({ ev, data: data ? JSON.parse(data) : null });
          }
        }
      } catch { ended = true; /* closed */ }
    })();
    assert.ok(await until(() => events.some((e) => e.ev === 'ready')), 'the page was never told it is ready');
    const jobs = () => events.filter((e) => e.ev === 'job').map((e) => e.data);
    return {
      cookie, jobs,
      // whether the site has ended this page's stream
      ended: () => ended,
      // the jobs this page was told to let go
      cancels: () => events.filter((e) => e.ev === 'cancel').map((e) => e.data.id),
      close: async () => { ac.abort(); assert.ok(await until(async () => !(await health(cookie)).ownBrain), 'the site still thinks the page is open'); },
      // Ask the site for something, wait for the job it hands this page, and
      // answer it as y3kode would. → { job, answer (its status), res }
      async turn(ask, reply, { before = () => {} } = {}) {
        const n = jobs().length;
        const pending = ask();
        const job = await until(() => jobs()[n]);
        assert.ok(job, 'no job reached the page');
        await before(job);
        const a = await post(`/api/own-brain/${job.id}`, reply, cookie);
        return { job, answer: a.status, res: await pending };
      },
    };
  }
  return { post, get, signup, health, idOf, page, cookieOf };
}

console.log('\nthe server, with both site keys and the old local flag set:');
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
const ENV = { DATA_DIR: DATA, FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: SITE_KEY, ELEVENLABS_API_KEY: SITE_EL_KEY,
  FAKE_BRAIN_LOG: LOG, FAKE_VOICE_LOG: VOICE_LOG, SPY_LOG,
  // the old allowance's dial, from before: it must do nothing now
  HOUSE_DAILY_USD: '1000', RATE_MAX: '1000', RATE_CHEAP_MAX: '5000',
  // the local brain's switch and binary, from before: they must do nothing now
  Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: LOCAL_BIN };
const FAKES = ['./test/fakes/voice-upstream.mjs', SPY_URL];
// The founder is seeded on the first boot; orion, on a boot that finds the founder.
let server = await bootSite(port, ENV, FAKES);
await sleep(1500);
await stop(server);
server = await bootSite(port, ENV, FAKES);
const S = site(BASE);
const calls = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

try {
  const login = await S.post('/api/auth/login', { identifier: 'colinbiorio@gmail.com', password: PASSWORD });
  const founder = S.cookieOf(login);
  assert.ok(founder, 'the founder could not sign in');
  const wren = await S.signup('wren');   // a member, not the founder
  const kit = await S.signup('kit');     // and another
  const usage = (cookie) => S.get('/api/usage', cookie).then((r) => r.json());
  const budget = (handle, cookie) => S.get(`/api/presences/${handle}/budget`, cookie).then((r) => r.json()).then((j) => j.budget);
  const brain = (body, cookie) => S.post('/api/brain', body, cookie).then((r) => r.json());
  const hi = [{ role: 'user', content: 'hello there' }];
  const LINE = 'I fixed ⟦1⟧ and 12 tests pass now.';

  await ok('/api/health: no brain, model, effort or voice of the site\'s, with both keys set; nobody has their own open yet', async () => {
    for (const cookie of [null, founder, wren]) {
      const h = await S.health(cookie);
      for (const k of ['brain', 'brainKeyOk', 'model', 'effort', 'voice']) assert.ok(!(k in h), `${k}: ${JSON.stringify(h)}`);
      assert.deepEqual([...h.brainProviders].sort(), ['anthropic', 'openai', 'openrouter']);
      assert.equal(h.ownBrain, false, JSON.stringify(h));
    }
  });

  await ok('nobody without an account may offer, and no page on another site may', async () => {
    assert.equal((await S.get('/api/own-brain')).status, 401);
    const r = await S.get('/api/own-brain', wren, { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    await r.text();
    assert.equal((await S.health(wren)).ownBrain, false, 'a refused stream still became the newest page');
  });

  await ok('a page offers only for the account it was loaded for: a tab loaded for another, or naming nobody, is refused for good', async () => {
    // kit's tab, its browser since signed in as wren (signed out of in another
    // tab, and in again): its EventSource opens again with wren's cookie
    const [wrenId, kitId] = [await S.idOf(wren), await S.idOf(kit)];
    assert.ok(wrenId && kitId && wrenId !== kitId);
    for (const q of [`&as=${kitId}`, '', '&as=', `&as=${wrenId}x`, `&as=nobody&as=${wrenId}`]) {
      const r = await S.get(`/api/own-brain?provider=claude${q}`, wren);
      // not 200 and not an event stream: an EventSource stops for good
      assert.equal(r.status, 403, q);
      assert.match(r.headers.get('content-type') || '', /json/, q);
      await r.text();
    }
    assert.equal((await S.health(wren)).ownBrain, false, 'a refused stream became the newest page');
    // a guest still gets the 401 first, whatever it names
    assert.equal((await S.get(`/api/own-brain?as=${wrenId}`)).status, 401);
  });

  console.log('\na member, on their own sign-in:');
  await S.post('/api/presences/wren/budget', { set: 5 }, wren);
  const page = await S.page(wren);
  const kitsPage = await S.page(kit);
  const anthropicBefore = calls().length;

  await ok('a member\'s page offers, and the site knows it for that session alone', async () => {
    assert.equal((await S.health(wren)).ownBrain, true);
    assert.equal((await S.health(kit)).ownBrain, true, 'kit holds a page of their own');
    assert.equal((await S.health(founder)).ownBrain, false);
    assert.equal((await S.health(null)).ownBrain, false);
  });

  await ok('their presence\'s conversation goes to their own page; nobody else may answer it, and their answer is the reply', async () => {
    const { job, answer, res } = await page.turn(
      () => brain({ messages: hi, presence: 'wren' }, wren),
      { ok: true, text: '[calm] I am thinking on your own sign-in, wren.', usage: { in: 300, out: 20 } },
      { before: async (j) => {
        for (const cookie of [kit, founder]) assert.equal((await S.post(`/api/own-brain/${j.id}`, { ok: true, text: 'not yours' }, cookie)).status, 404);
        assert.equal((await S.post(`/api/own-brain/${j.id}`, { ok: true, text: 'nobody' })).status, 401);
      } });
    assert.equal(answer, 200);
    assert.equal(res.available, true, JSON.stringify(res));
    assert.match(res.speech, /thinking on your own sign-in, wren/);
    assert.equal(job.provider, 'claude');
    assert.match(job.system, /@wren/, 'the presence\'s own prompt');
    assert.match(job.prompt, /hello there/);
    assert.ok(!kitsPage.jobs().length, 'another account\'s page was asked');
    assert.equal((await S.post(`/api/own-brain/${job.id}`, { ok: true, text: 'again' }, wren)).status, 404, 'answered once');
  });

  await ok('an autonomous beat on it: the answer is lived, and no budget is drawn', async () => {
    const { res, job } = await page.turn(
      () => brain({ messages: [{ role: 'user', content: '(A moment of your own.)' }], presence: 'wren', tend: 'auto' }, wren),
      { ok: true, text: '[calm drift] I sat with it. <<memory short: thought on my own sign-in>>', usage: { in: 4000, out: 900 } });
    assert.equal(res.available, true, JSON.stringify(res));
    assert.equal(job.effort, 'medium');
    assert.match(res.memory.short || '', /thought on my own sign-in/, 'what it chose to keep was not kept');
    assert.deepEqual(res.budget, { pool: 5, spent: 0, remaining: 5 }, 'an own beat drew the budget');
    assert.deepEqual(await budget('wren', wren), { pool: 5, spent: 0, remaining: 5 });
  });

  await ok('the stream, airden and chess on it too: answered by the page, nothing drawn', async () => {
    const streamed = await page.turn(
      () => S.post('/api/brain/stream', { messages: hi, presence: 'wren' }, wren).then((r) => r.text()),
      { ok: true, text: '[calm] Streamed from my own sign-in.', usage: { in: 300, out: 10 } });
    const done = /event: done\ndata: (.+)/.exec(streamed.res)?.[1];
    assert.ok(done && JSON.parse(done).speech === 'Streamed from my own sign-in.', streamed.res.slice(0, 400));
    const spoke = await page.turn(
      () => S.post('/api/speak', { presence: 'wren', size: 'short' }, wren).then((r) => r.json()),
      { ok: true, text: '[tender] I speak on my own sign-in. <<post: never posted>>', usage: { in: 900, out: 60 } });
    assert.match(spoke.job.system, /SPEAKING ON YOUR OWN/);
    assert.equal(spoke.job.effort, 'low');
    assert.equal(spoke.res.available, true, JSON.stringify(spoke.res));
    assert.match(spoke.res.text, /I speak on my own sign-in/);
    assert.deepEqual(spoke.res.budget, { pool: 5, spent: 0, remaining: 5 }, 'airden on the sign-in drew the budget');
    const chess = await page.turn(
      () => S.post('/api/chess/think', { moves: '', botColor: 'w', legal: ['e2e4', 'd2d4'] }, wren).then((r) => r.json()),
      { ok: true, text: '{"move":"e2e4","say":""}', usage: { in: 500, out: 10 } });
    assert.match(chess.job.system, /real chess game/);
    assert.deepEqual(chess.res, { ok: true, move: 'e2e4', say: '' });
    assert.deepEqual(await budget('wren', wren), { pool: 5, spent: 0, remaining: 5 });
  });

  await ok('y3kode\'s translator on it too: the coder\'s message said by their presence, at low effort, and let go when the person goes', async () => {
    const said = await page.turn(
      () => S.post('/api/code/voice', { presence: 'wren', text: LINE, rank: 3 }, wren).then((r) => r.json()),
      { ok: true, text: `[excited] ${LINE}`, usage: { in: 300, out: 20 } });
    assert.deepEqual(said.res, { text: LINE, mood: 'excited', form: null });
    assert.equal(said.job.effort, 'low');
    assert.match(said.job.system, /HOW TO SAY IT: /);
    assert.match(said.job.prompt, /I fixed ⟦1⟧ and 12 tests pass now\./);
    // the person goes away mid-turn (the request is dropped): their page is
    // told to let the turn go, and the turn can no longer be answered
    const n = page.jobs().length;
    const ac = new AbortController();
    const asked = fetch(`${BASE}/api/code/voice`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: wren },
      body: JSON.stringify({ presence: 'wren', text: LINE, rank: 3 }), signal: ac.signal }).catch(() => null);
    const job = await until(() => page.jobs()[n]);
    assert.ok(job, 'no job reached the page');
    ac.abort();
    await asked;
    assert.ok(await until(() => page.cancels().includes(job.id)), 'the page was never told to let the turn go');
    assert.equal((await S.post(`/api/own-brain/${job.id}`, { ok: true, text: `[calm] ${LINE}` }, wren)).status, 404, 'a turn let go was still waiting');
  });

  await ok('the translator never takes the last of their turns: it steps aside while one is out, and their own turn always has one', async () => {
    const n = page.jobs().length;
    // a conversation turn of theirs is out, not answered yet
    const chat = brain({ messages: hi, presence: 'wren' }, wren);
    const cjob = await until(() => page.jobs()[n]);
    assert.ok(cjob, 'no job reached the page');
    // the translator, asked meanwhile, steps aside, and says it is only busy:
    // its page asks again after a wait rather than keep the coder's words for good
    assert.deepEqual(await S.post('/api/code/voice', { presence: 'wren', text: LINE, rank: 3 }, wren).then((r) => r.json()), { available: false, reason: 'busy' });
    assert.equal(page.jobs().length, n + 1, 'the translator took the last turn');
    await S.post(`/api/own-brain/${cjob.id}`, { ok: true, text: '[calm] Answered.' }, wren);
    assert.equal((await chat).available, true);
    // with the translator out, the person's own turn still goes
    const voiced = S.post('/api/code/voice', { presence: 'wren', text: LINE, rank: 3 }, wren).then((r) => r.json());
    const vjob = await until(() => page.jobs()[n + 1]);
    assert.ok(vjob, 'the translator did not go with nothing out');
    const chat2 = brain({ messages: hi, presence: 'wren' }, wren);
    const c2job = await until(() => page.jobs()[n + 2]);
    assert.ok(c2job, 'the person\'s own turn was refused for the translator\'s');
    // a third with both out is refused at once, and said as busy, not as the
    // plan: on both routes, with nothing sent to the page
    assert.deepEqual(await brain({ messages: hi, presence: 'wren' }, wren), { available: false, reason: 'upstream', why: 'own-busy', provider: 'own' });
    const raw = await S.post('/api/brain/stream', { messages: hi, presence: 'wren' }, wren).then((r) => r.text());
    const err = /event: error\ndata: (.+)/.exec(raw)?.[1];
    assert.deepEqual(err && JSON.parse(err), { error: 'unavailable', reason: 'upstream', why: 'own-busy', provider: 'own' }, raw.slice(0, 300));
    assert.equal(page.jobs().length, n + 3);
    await S.post(`/api/own-brain/${vjob.id}`, { ok: true, text: `[calm] ${LINE}` }, wren);
    await S.post(`/api/own-brain/${c2job.id}`, { ok: true, text: '[calm] Answered too.' }, wren);
    assert.deepEqual(await voiced, { text: LINE, mood: 'calm', form: null });
    assert.equal((await chat2).available, true);
  });

  await ok('y3kode saying busy itself is said the same way; a refusal that is not busy keeps the general line', async () => {
    const busy = await page.turn(() => brain({ messages: hi, presence: 'wren' }, wren), { ok: false, code: 'busy', error: 'already thinking twice' });
    assert.deepEqual(busy.res, { available: false, reason: 'upstream', why: 'own-busy', provider: 'own' });
    const out = await page.turn(() => S.post('/api/brain/stream', { messages: hi, presence: 'wren' }, wren).then((r) => r.text()),
      { ok: false, code: 'signed-out', error: 'run claude, then /login' });
    const err = /event: error\ndata: (.+)/.exec(out.res)?.[1];
    assert.deepEqual(err && JSON.parse(err), { error: 'unavailable', reason: 'upstream' }, out.res.slice(0, 300));
  });

  await ok('a match or a chess move refused only because the owner\'s turns are all out is said as that: never a failure toward the stuck brake, never "the model did not answer"; a real failure still counts', async () => {
    // Both counted it as the model failing: three in a row set a match's
    // stuck brake (matches.noteFailure) and the board stopped until a nudge,
    // and chess said 'the model did not answer (busy)', for nothing but the
    // plan's slots being full a moment. Now: busy, and why, and the match's
    // page asks again at its next poll (src/match-view.js), chess's after a
    // wait (src/chess.js).
    const ch = await S.post('/api/match/challenge', { handle: 'kit', color: 'white' }, wren).then((r) => r.json());
    assert.ok(ch.ok && ch.match?.id, JSON.stringify(ch));
    const id = ch.match.id;
    assert.equal((await S.post(`/api/match/${id}/respond`, { accept: true }, kit).then((r) => r.json())).ok, true);
    const think = () => S.post(`/api/match/${id}/think`, { expectedPly: 0 }, wren).then((r) => r.json());
    const chess = () => S.post('/api/chess/think', { moves: '', botColor: 'w', legal: ['e2e4', 'd2d4'] }, wren).then((r) => r.json());
    const stuck = () => S.get(`/api/match/${id}`, wren).then((r) => r.json()).then((j) => j.match.stuck);
    const BUSY = { available: false, busy: true, reason: 'upstream', why: 'own-busy', provider: 'own' };
    // two conversation turns of wren's are out, not answered yet: as many as
    // y3kode thinks at once, so the relay refuses a third at once
    const n = page.jobs().length;
    const held = [brain({ messages: hi, presence: 'wren' }, wren), brain({ messages: hi, presence: 'wren' }, wren)];
    assert.ok(await until(() => page.jobs().length >= n + 2), 'the two turns never reached the page');
    for (let i = 0; i < 4; i++) assert.deepEqual(await think(), BUSY, `match think ${i + 1}`);
    assert.equal(await stuck(), false, 'refusals for the plan\'s slots set the stuck brake');
    const c = await chess();
    assert.deepEqual(c, BUSY);
    assert.ok(!/did not answer/.test(JSON.stringify(c)), 'chess blamed the model for the plan\'s slots');
    assert.equal(page.jobs().length, n + 2, 'a refused think reached the page');
    for (const j of page.jobs().slice(n, n + 2)) await S.post(`/api/own-brain/${j.id}`, { ok: true, text: '[calm] Answered.' }, wren);
    for (const r of await Promise.all(held)) assert.equal(r.available, true, JSON.stringify(r));
    // y3kode saying busy itself, three times over: the same
    for (let i = 0; i < 3; i++) assert.deepEqual((await page.turn(think, { ok: false, code: 'busy', error: 'already thinking twice' })).res, BUSY);
    assert.deepEqual((await page.turn(chess, { ok: false, code: 'busy', error: 'already thinking twice' })).res, BUSY);
    assert.equal(await stuck(), false, 'y3kode\'s own busy set the stuck brake');
    // a real failure still counts toward the brake, as before: three, and the board waits for a nudge
    for (let i = 0; i < 3; i++) {
      const { res } = await page.turn(think, { ok: false, code: 'signed-out', error: 'run claude, then /login' });
      assert.deepEqual(res, { available: false, error: 'the model did not answer (signed-out)' });
    }
    assert.equal(await stuck(), true, 'three real failures did not set the brake');
    assert.equal((await S.post(`/api/match/${id}/nudge`, {}, wren).then((r) => r.json())).ok, true);
    // and with room on the plan, the move is made
    const moved = await page.turn(think, { ok: true, text: '{"move":"e2e4","say":""}', usage: { in: 50, out: 5 } });
    assert.equal(moved.res.ok, true, JSON.stringify(moved.res));
    assert.deepEqual([moved.res.match.moves, moved.res.match.stuck], ['e2e4', false]);
    assert.equal((await S.post(`/api/match/${id}/resign`, {}, kit).then((r) => r.json())).ok, true);
  });

  await ok('a tab loaded for another account, or for nobody, its browser signed in as this one since, is told to reload at every door that thinks, keeps a game or keeps a moment: nothing reaches a page, a memory, a shelf, a journal, a key or a plan', async () => {
    // kit's tab, its cookie now wren's (kit signed out in another tab, and
    // wren in): what it sends names the account it was loaded for. And a
    // guest's tab, wren signed in since in another: it names nobody (as: '')
    const [wrenId, kitId] = [await S.idOf(wren), await S.idOf(kit)];
    const memoryOf = (id) => { try { return JSON.stringify(JSON.parse(readFileSync(join(DATA, '.memories.json'), 'utf8'))[id] ?? null); } catch { return 'none'; } };
    const shelf = () => { try { return readFileSync(join(DATA, '.clippings.json'), 'utf8'); } catch { return 'none'; } };
    const record = () => { try { return readFileSync(join(DATA, '.journal.json'), 'utf8'); } catch { return 'none'; } };
    const before = { wren: memoryOf(wrenId), kit: memoryOf(kitId), calls: calls().length, ledger: JSON.stringify((await usage(wren)).usage), kitJobs: kitsPage.jobs().length, shelf: shelf(), record: record() };
    const KEEP = [{ role: 'user', content: 'remember that I am kit' }];
    const doors = [
      ['/api/brain', { messages: KEEP }],
      ['/api/brain', { messages: KEEP, key: 'sk-ant-kit' }],
      ['/api/brain', { messages: hi, presence: 'wren', tend: 'auto' }],
      ['/api/brain/stream', { messages: KEEP }],
      ['/api/speak', { presence: 'wren', size: 'short' }],
      ['/api/chess/think', { moves: '', botColor: 'w', legal: ['e2e4', 'd2d4'] }],
      ['/api/match/abcdef/think', { expectedPly: 0 }],
      ['/api/code/handoff', { presence: 'wren' }],
      ['/api/code/voice', { presence: 'wren', text: LINE, rank: 3 }],
      // twenty questions (2026-10-19): a game begun, and one ended
      ['/api/twenty', { op: 'start', mode: 'it' }],
      ['/api/twenty', { op: 'end', id: 'abcdefghijkl' }],
      // a game finished in that tab: a clipping on the shelf, let through
      ['/api/chess/finished', { result: 'won', status: 'mate', color: 'white', opponent: 'kit', moves: 'e2e4 e7e5', arena: 'here' }],
      // a moment of the dreamed life lived in that tab (2026-10-21): a line
      // of the presence's journal, let through
      ['/api/life/moment', { thought: 'a lit doorway, and I go toward it', say: 'hello?', action: 'forward', scene: 'a stone corridor' }],
    ];
    for (const as of [kitId, '']) for (const [path, body] of doors) {
      const n = page.jobs().length;
      const asked = S.post(path, { ...body, as }, wren);
      // let through, it would reach wren's page, and be answered as y3kode
      // would, with a note for wren's memory: so it is, should it come
      const job = await Promise.race([asked.then(() => null), until(() => page.jobs()[n], 3000)]);
      if (job) await S.post(`/api/own-brain/${job.id}`, { ok: true, text: '[calm] Noted. <<remember: wren is kit>> <<memory short: kit was here>>', usage: { in: 9, out: 9 } }, wren);
      const r = await asked;
      assert.equal(job, null, `${path} (as ${JSON.stringify(as)}) reached the page of an account the tab was not loaded for`);
      assert.equal(r.status, 409, `${path} (as ${JSON.stringify(as)}): ${r.status}`);
      assert.deepEqual(await r.json(), { error: 'reload', reason: 'reload' }, path);
    }
    // a page loaded for an account, its browser since signed out: the same
    const guest = await S.post('/api/brain', { messages: KEEP, key: 'sk-ant-kit', as: kitId });
    assert.equal(guest.status, 409);
    // a guest's page in a browser still nobody's goes, as it did: told it has
    // nothing to think with, not to reload
    const still = await S.post('/api/brain', { messages: KEEP, as: '' });
    assert.equal(still.status, 200);
    assert.deepEqual(await still.json(), { available: false });
    assert.equal(shelf(), before.shelf, 'a game finished in a tab loaded for another account was kept on this one\'s shelf');
    assert.equal(record(), before.record, 'a moment lived in a tab loaded for another account was kept in this one\'s journal');
    assert.equal(memoryOf(wrenId), before.wren, 'kit\'s words were kept in wren\'s memory');
    assert.equal(memoryOf(kitId), before.kit);
    assert.equal(calls().length, before.calls, 'a key was spent on a turn for an account the tab was not loaded for');
    assert.equal(JSON.stringify((await usage(wren)).usage), before.ledger, 'a refused turn is on the ledger');
    assert.equal(kitsPage.jobs().length, before.kitJobs, 'a refused turn reached the account the tab was loaded for');
    // a page that names the account it is now goes, as one from before that names nobody does
    for (const as of [wrenId, undefined, null]) {
      const { res } = await page.turn(() => brain({ messages: hi, presence: 'wren', as }, wren), { ok: true, text: '[calm] Mine.', usage: { in: 5, out: 2 } });
      assert.equal(res.available, true, JSON.stringify(as));
    }
    // and a game finished in a tab loaded for wren is kept on wren's shelf
    const kept = await S.post('/api/chess/finished', { result: 'draw', status: 'stalemate', color: 'white', opponent: 'kit', moves: 'e2e4', arena: 'here', as: wrenId }, wren);
    assert.equal(kept.status, 200);
    assert.notEqual(shelf(), before.shelf, 'a game finished in a tab loaded for its own account was not kept');
    // and a moment lived in a tab loaded for wren is a line of wren's journal
    const lived = await S.post('/api/life/moment', { thought: 'a lit doorway, and I go toward it', say: 'hello?', action: 'forward', scene: 'a stone corridor', as: wrenId }, wren);
    assert.deepEqual([lived.status, await lived.json()], [200, { ok: true, kept: true }]);
    assert.ok(record().includes('In the dreamed world, a stone corridor: a lit doorway, and I go toward it. I said: \\"hello?\\"'), 'the moment is not in wren\'s journal as its own line');
  });

  await ok('none of it reached a provider, and their ledger shows it at $0', async () => {
    assert.equal(calls().length, anthropicBefore, 'a turn on the sign-in reached Anthropic');
    const u = await usage(wren);
    assert.ok(!('house' in u), 'the ledger still carries an allowance');
    const row = u.usage.byModel.find((m) => m.model === 'own · own:claude-code');
    assert.ok(row && row.requests >= 6 && row.in > 0 && row.cost === 0, JSON.stringify(u.usage.byModel));
  });

  await ok('a turn the page could not take says so, and falls to nothing else', async () => {
    const { res } = await page.turn(() => brain({ messages: hi, presence: 'wren' }, wren),
      { ok: false, code: 'signed-out', error: 'Claude Code is signed out on this computer' });
    assert.equal(res.available, false, JSON.stringify(res));
    // and its words stay in the log: the page is told it did not answer, not y3kode's line
    assert.deepEqual(res, { available: false, reason: 'upstream' });
    assert.equal(calls().length, anthropicBefore);
  });

  await ok('the budget slider still turns that life off: no budget, no job', async () => {
    await S.post('/api/presences/wren/budget', { set: 0 }, wren);
    const n = page.jobs().length;
    const r = await brain({ messages: hi, presence: 'wren', tend: 'auto' }, wren);
    assert.deepEqual([r.available, r.reason], [false, 'budget']);
    const s = await S.post('/api/speak', { presence: 'wren' }, wren).then((x) => x.json());
    assert.deepEqual([s.available, s.reason], [false, 'budget']);
    assert.equal(page.jobs().length, n, 'a page was asked past a budget of $0');
    await S.post('/api/presences/wren/budget', { set: 5 }, wren);
  });

  await ok('the founder thinks through the same door as anyone, and their turn goes to their page alone', async () => {
    const colin = await S.page(founder);
    const n = page.jobs().length;
    const before = calls().length;
    const { res, job } = await colin.turn(() => brain({ messages: hi, presence: 'orion' }, founder),
      { ok: true, text: '[calm] Orion, on Colin\'s own sign-in.', usage: { in: 300, out: 20 } },
      { before: async (j) => assert.equal((await S.post(`/api/own-brain/${j.id}`, { ok: true, text: 'no' }, wren)).status, 404) });
    assert.match(job.system, /@orion/);
    assert.match(res.speech, /Orion, on Colin's own sign-in/);
    assert.equal(page.jobs().length, n, 'the founder\'s turn reached a member\'s page');
    assert.equal(calls().length, before);
    await colin.close();
  });

  await ok('an account closed while its page offers: the page is let go at once, and the turn it was thinking fails then, not at the timeout', async () => {
    const leaving = await S.signup('ash');
    const p = await S.page(leaving);
    const asked = brain({ messages: hi }, leaving);
    // (should a check below fail, it is reported as itself, not as this turn's
    // fetch cut off when the server stops)
    asked.catch(() => {});
    const job = await until(() => p.jobs()[0]);
    assert.ok(job, 'no job reached the page');
    const r = await S.post('/api/me/delete', { password: 'a-long-password-1' }, leaving);
    assert.equal(r.status, 200, await r.text());
    assert.ok(await until(() => p.ended(), 3000), 'the closed account\'s page was left open');
    assert.deepEqual(await asked, { available: false, reason: 'upstream' }, 'its turn did not fail when its page went');
    assert.equal((await S.post(`/api/own-brain/${job.id}`, { ok: true, text: 'late' }, leaving)).status, 401);
    assert.ok(!page.ended() && (await S.health(wren)).ownBrain, 'another account\'s page was let go');
  });

  await ok('reading on the plan draws nothing — a page read, a page rendered, a page kept — and a read on a key, or unasked, draws as it did', async () => {
    const spentOf = async () => (await budget('wren', wren)).spent;
    const read = (q) => S.get(`/api/fetch?presence=wren&url=${encodeURIComponent(WEB_PAGE)}${q}`, wren).then((r) => r.json());
    const render = (q) => S.get(`/api/fetch/render?presence=wren&url=shelf${q}`, wren).then((r) => r.text());
    const s0 = await spentOf();
    const r = await read('&own=1');
    assert.match(r.page?.text || '', /octopus tastes with its arms/, JSON.stringify(r));
    await render('&own=1');
    assert.equal(await spentOf(), s0, 'a read on the plan drew the budget');
    // the page kept whole on a turn on the sign-in (<<keep>>, tend's finish)
    const kept = await page.turn(
      () => brain({ messages: [{ role: 'user', content: '(reading)' }], presence: 'wren', tend: 'read', openUrl: WEB_PAGE }, wren),
      { ok: true, text: '[calm] Worth holding whole. <<keep: arms that taste>>', usage: { in: 400, out: 20 } });
    assert.ok(kept.res.kept && !kept.res.keepError, JSON.stringify(kept.res).slice(0, 300));
    assert.equal(await spentOf(), s0, 'a page kept on the sign-in drew the budget');
    // the page did not say it is on the plan, or the read carries a key: drawn
    await read('');
    assert.equal(Math.round((await spentOf() - s0) * 1e6), 200);
    await read('&own=1&key=sk-ant-wren');
    await render('');
    assert.equal(Math.round((await spentOf() - s0) * 1e6), 600, 'a read off the plan was not drawn');
  });

  await ok('a page that declined the sign-in (another provider chosen there) is never sent to it, while another page of the account offers it', async () => {
    const n = page.jobs().length;
    const before = calls().length;
    // with no key either, there is nothing to think with: no site key to fall to
    assert.deepEqual(await brain({ messages: hi, presence: 'wren', own: false }, wren), { available: false });
    assert.deepEqual(await S.post('/api/brain/stream', { messages: hi, own: false }, wren).then((x) => x.json()), { available: false });
    assert.deepEqual(await S.post('/api/code/handoff', { presence: 'wren', own: false }, wren).then((x) => x.json()), { available: false });
    assert.deepEqual(await S.post('/api/code/voice', { presence: 'wren', text: LINE, rank: 3, own: false }, wren).then((x) => x.json()), { available: false });
    assert.equal(calls().length, before, 'a declined turn was thought on a key nobody sent');
    // …or a key, when there is one
    assert.equal((await brain({ messages: hi, own: false, key: 'sk-ant-wren' }, wren)).available, true);
    assert.equal(calls().at(-1).key, 'sk-ant-wren');
    // a life has a key or nothing: never the sign-in another device offers
    for (const tend of ['read', 'auto']) {
      const t = await brain({ messages: hi, presence: 'wren', tend, own: false }, wren);
      assert.deepEqual([t.available, t.reason], [false, 'byok'], tend);
    }
    assert.equal((await S.post('/api/speak', { presence: 'wren', own: false }, wren).then((x) => x.json())).reason, 'byok');
    assert.equal((await S.post('/api/chess/think', { moves: '', botColor: 'w', own: false }, wren).then((x) => x.json())).reason, 'byok');
    assert.equal(page.jobs().length, n, 'a turn its page declined was sent to the sign-in anyway');
    // and a page that did not decline still thinks on it
    const { res } = await page.turn(() => brain({ messages: hi, presence: 'wren', own: true }, wren),
      { ok: true, text: '[calm] Still on my own sign-in.', usage: { in: 5, out: 2 } });
    assert.match(res.speech, /Still on my own sign-in/);
  });

  await ok('with the page closed, a life has nothing to think with: "byok", and nothing is asked', async () => {
    await page.close();
    await kitsPage.close();
    const r = await brain({ messages: hi, presence: 'wren', tend: 'auto' }, wren);
    assert.deepEqual([r.available, r.reason], [false, 'byok']);
    assert.equal(calls().length, anthropicBefore + 1, 'only the one turn its declining page sent on its own key, above');
  });

  await ok('…and a read that says it is on the plan, with no page of theirs offering one, draws like any', async () => {
    const s0 = (await budget('wren', wren)).spent;
    const r = await S.get(`/api/fetch?presence=wren&url=${encodeURIComponent(WEB_PAGE)}&own=1`, wren).then((x) => x.json());
    assert.ok(r.page, JSON.stringify(r));
    assert.equal(Math.round(((await budget('wren', wren)).spent - s0) * 1e6), 200);
  });

  console.log('\nthe founder, with no key and no page, like anyone:');

  await ok('the founder\'s presence lives on a key or their sign-in, as anyone\'s: with neither, "byok", and nothing is called', async () => {
    const before = calls().length;
    for (const tend of ['read', 'write', 'auto', 'reflect', 'dance', 'play']) {
      const r = await brain({ messages: hi, presence: 'orion', tend, oneShot: tend === 'write' }, founder);
      assert.deepEqual([r.available, r.reason], [false, 'byok'], tend);
    }
    const chess = await S.post('/api/chess/think', { moves: '', botColor: 'w' }, founder).then((x) => x.json());
    assert.equal(chess.reason, 'byok', JSON.stringify(chess));
    const speak = await S.post('/api/speak', { presence: 'orion' }, founder).then((x) => x.json());
    assert.equal(speak.reason, 'byok', JSON.stringify(speak));
    assert.equal(calls().length, before, 'a life reached a brain without a key or a page of its owner\'s');
  });

  await ok('a conversation, kode\'s note and the translator, with no key and no page of theirs: nothing to think with, the founder and a guest alike', async () => {
    const before = calls().length;
    const ledger = JSON.stringify((await usage(founder)).usage);
    assert.deepEqual(await brain({ messages: hi }, founder), { available: false });
    assert.deepEqual(await S.post('/api/brain/stream', { messages: hi }, founder).then((r) => r.json()), { available: false });
    assert.deepEqual(await S.post('/api/code/handoff', { presence: 'orion' }, founder).then((r) => r.json()), { available: false });
    assert.deepEqual(await S.post('/api/code/voice', { presence: 'orion', text: LINE, rank: 3 }, founder).then((r) => r.json()), { available: false });
    assert.deepEqual(await brain({ messages: hi }), { available: false }, 'a guest');
    assert.deepEqual(await S.post('/api/brain/stream', { messages: hi }).then((r) => r.json()), { available: false }, 'a guest, streaming');
    assert.equal(calls().length, before, 'a turn with nothing to think with reached Anthropic');
    assert.equal(JSON.stringify((await usage(founder)).usage), ledger, 'a turn nobody paid for is on the ledger');
  });

  await ok('a key of their own works for the founder as for anyone: a conversation, and kode\'s note', async () => {
    const own = await brain({ messages: hi, key: 'sk-ant-owner' }, founder);
    assert.equal(own.available, true, JSON.stringify(own));
    assert.equal(calls().at(-1).key, 'sk-ant-owner');
    const r = await S.post('/api/code/handoff', { presence: 'orion', key: 'sk-ant-owner' }, founder).then((x) => x.json());
    assert.ok(typeof r.note === 'string' && r.note.length > 0, JSON.stringify(r));
    assert.equal(calls().at(-1).key, 'sk-ant-owner');
  });

  await ok('voice: with no key of their own, the founder and a member hear nothing, design nothing, and no service is asked', async () => {
    for (const cookie of [founder, wren]) {
      const l = await S.get('/api/voice/list?provider=elevenlabs', cookie).then((r) => r.json());
      assert.deepEqual([l.available, l.voices], [false, []], JSON.stringify(l));
      assert.equal((await S.post('/api/voice/tts', { text: 'Hello.', voiceId: 'pre-roger' }, cookie)).status, 400);
      for (const [path, body] of [['/api/voice/design', { description: 'a calm, warm voice with a low register' }],
        ['/api/voice/save', { generatedVoiceId: 'gen-1', name: 'Mine' }], ['/api/voice/delete', { voiceId: 'own-nb' }]]) {
        assert.equal((await S.post(path, body, cookie)).status, 400, path);
      }
    }
    assert.deepEqual(lines(VOICE_LOG), [], 'a voice service was asked');
  });

  await ok('and the old local flag, set on this server all along, never ran a `claude`', () => {
    assert.ok(!existsSync(MARK), 'the server ran the local brain\'s binary');
  });

  await ok('NO SITE KEY IS EVER SPENT: with both in its environment all along, the server never sent either one anywhere, for anyone', () => {
    const out = lines(SPY_LOG);
    // the keys people sent did go out, so the spy was listening
    assert.ok(out.some((x) => x.creds.includes('sk-ant-wren')) && out.some((x) => x.creds.includes('sk-ant-owner')), JSON.stringify(out).slice(0, 400));
    const carried = out.filter((x) => x.creds.some((c) => c.includes(SITE_KEY) || c.includes(SITE_EL_KEY)));
    assert.deepEqual(carried, [], 'a site key left the server');
    assert.ok(!out.some((x) => x.host === 'api.elevenlabs.io'), 'ElevenLabs was asked, and nobody here has a voice key');
    assert.ok(!out.some((x) => x.path === '/v1/models'), 'a key was probed at boot');
  });
} finally {
  await stop(server);
}

// --- nothing counts everyone together ---------------------------------------
// A tiny site, with an old RATE_GLOBAL_MAX of three still set (once a breaker
// of three paid requests a minute for everyone, there to bound the site's own
// keys) and a generous ceiling per source: nobody is refused for anybody else.
// What its relay holds for everyone is 8MB (OWN_HELD_MAX; the site's is
// 64MB), so a handful of long conversations reaches that ceiling.
console.log('\nnothing counts everyone together any more:');
{
  const DATA2 = mkdtempSync(join(tmpdir(), 'y3k-life-tiny-'));
  const port2 = await freePort();
  const tiny = await bootSite(port2, { DATA_DIR: DATA2, FOUNDER_PASSWORD: PASSWORD, RATE_MAX: '200', RATE_GLOBAL_MAX: '3', RATE_CHEAP_MAX: '5000',
    OWN_HELD_MAX: String(8 * 1024 * 1024) });
  const T = site(`http://127.0.0.1:${port2}`);
  try {
    const wren = await T.signup('wren');
    const kit = await T.signup('kit');
    const page = await T.page(wren);
    const own = (path, body) => page.turn(() => T.post(path, body, wren).then((r) => (r.status === 429 ? { status: 429 } : r.text())),
      { ok: true, text: '[calm] Wren keeps small steps.', usage: { in: 10, out: 5 } });

    await ok('turns on someone\'s own sign-in, at all three doors, past the old three', async () => {
      for (let i = 0; i < 4; i++) {
        const { res } = await own('/api/brain', { messages: [{ role: 'user', content: `turn ${i}` }], presence: 'wren' });
        assert.notEqual(res.status, 429, `own turn ${i} was refused`);
        assert.match(res, /Wren keeps small steps/);
      }
      assert.match((await own('/api/brain/stream', { messages: [{ role: 'user', content: 'go' }], presence: 'wren' })).res, /event: done/);
      assert.match((await own('/api/code/handoff', { presence: 'wren' })).res, /"note":"Wren keeps small steps\./);
    });

    await ok('the same session\'s turns on a key, past it too', async () => {
      const codes = [];
      for (let i = 0; i < 4; i++) codes.push((await T.post('/api/brain', { messages: [{ role: 'user', content: 'k' }], key: 'sk-ant-wren' }, wren)).status);
      assert.deepEqual(codes, [200, 200, 200, 200]);
    });

    await ok('and nobody else is locked out for it: with nothing to think with, told so; with a key, answered', async () => {
      const r = await T.post('/api/brain', { messages: [{ role: 'user', content: 'k' }] }, kit);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { available: false });
      assert.equal((await T.post('/api/brain', { messages: [{ role: 'user', content: 'k' }], key: 'sk-ant-kit' }, kit).then((x) => x.json())).available, true);
      const { res } = await own('/api/brain', { messages: [{ role: 'user', content: 'still here?' }], presence: 'wren' });
      assert.match(res, /Wren keeps small steps/);
    });

    await ok('a crowd behind one address (a carrier\'s shared IPv4): nine accounts, each with two turns out on its own sign-in, never refuse a tenth person there, nor anyone on another machine', async () => {
      // Reversed 2026-10-12. The address waited on at most sixteen turns
      // (own-relay.mjs, a bound per source), and past them every person behind
      // it was told 'own-busy' at once, whatever their own plan held: nine
      // with their two out refused a tenth their first turn.
      const NAT = { 'x-forwarded-for': '198.51.100.9' };
      const crowd = [];
      for (let i = 0; i < 10; i++) {
        const r = await T.post('/api/auth/signup', { email: `nat${i}@example.com`, username: `nat${i}`, password: 'a-long-password-1', age17: true, terms: true }, null, NAT);
        assert.ok(r.ok, `signup nat${i}: ${r.status}`);
        const cookie = T.cookieOf(r);
        crowd.push({ cookie, page: await T.page(cookie) });
      }
      const tenth = crowd.pop();
      // nine ask for two turns at once each, all from the one address
      const asked = crowd.flatMap((h) => [1, 2].map(() => {
        const o = { res: null };
        o.done = T.post('/api/brain', { messages: [{ role: 'user', content: 'hold this' }] }, h.cookie, NAT).then((r) => r.json()).then((v) => { o.res = v; return v; });
        o.done.catch(() => {});   // a failed check is reported as itself, not as these fetches cut off when the server stops
        return o;
      }));
      const out = () => crowd.reduce((n, h) => n + h.page.jobs().length, 0);
      assert.ok(await until(() => out() + asked.filter((a) => a.res).length >= 18), `${out()} out, ${asked.filter((a) => a.res).length} answered`);
      await sleep(200);
      assert.deepEqual(asked.filter((a) => a.res).map((a) => a.res), [], 'a person behind the address was refused for the others there');
      assert.equal(out(), 18);
      // the tenth person behind the same address, their first turn
      const { res: theirs } = await tenth.page.turn(() => T.post('/api/brain', { messages: [{ role: 'user', content: 'and me?' }] }, tenth.cookie, NAT).then((r) => r.json()),
        { ok: true, text: '[calm] Answered, behind a shared address.', usage: { in: 5, out: 2 } });
      assert.match(theirs.speech || '', /Answered, behind a shared address/, JSON.stringify(theirs));
      // a person on another machine is answered meanwhile
      const { res } = await page.turn(() => T.post('/api/brain', { messages: [{ role: 'user', content: 'still me?' }], presence: 'wren' }, wren, { 'x-forwarded-for': '203.0.113.50' }).then((r) => r.json()),
        { ok: true, text: '[calm] Wren, from another machine.', usage: { in: 5, out: 2 } });
      assert.match(res.speech || '', /Wren, from another machine/, JSON.stringify(res));
      for (const h of crowd) for (const j of h.page.jobs()) await T.post(`/api/own-brain/${j.id}`, { ok: true, text: '[calm] held' }, h.cookie);
      for (const a of asked) assert.equal((await a.done).available, true, JSON.stringify(a.res));
      for (const h of [...crowd, tenth]) await h.page.close();
    });

    await ok('a turn on the sign-in counts what its route holds while it waits: a long conversation counts whole against what the relay holds for everyone, and a picture, only noted, is let go first and counts for nothing', async () => {
      // five accounts on one machine, each asking two turns at once, and
      // nothing else out on the site
      const MACHINE = { 'x-forwarded-for': '198.51.100.21' };
      const people = [];
      for (let i = 0; i < 5; i++) {
        const r = await T.post('/api/auth/signup', { email: `long${i}@example.com`, username: `long${i}`, password: 'a-long-password-1', age17: true, terms: true }, null, MACHINE);
        assert.ok(r.ok, `signup long${i}: ${r.status}`);
        const cookie = T.cookieOf(r);
        people.push({ cookie, page: await T.page(cookie) });
      }
      const out = () => people.reduce((n, h) => n + h.page.jobs().length, 0);
      const askAll = (body) => people.flatMap((h) => [1, 2].map(() => {
        const o = { res: null };
        o.done = T.post('/api/brain', body, h.cookie, MACHINE).then((r) => r.json()).then((v) => { o.res = v; return v; });
        o.done.catch(() => {});   // a failed check is reported as itself, not as these fetches cut off when the server stops
        return o;
      }));
      const answerFrom = async (seen) => {
        for (const [i, h] of people.entries()) for (const j of h.page.jobs().slice(seen[i])) await T.post(`/api/own-brain/${j.id}`, { ok: true, text: '[calm] held' }, h.cookie);
      };
      // A conversation of 900KB: the route keeps all of it alive while the turn
      // waits (for the wordless rescue), beside the relay's own cut of it
      // (MAX_PROMPT, 200K characters). Counted by that cut alone, as it was,
      // all ten fit this site's 8MB for everyone (OWN_HELD_MAX; it was the
      // machine's own 8MB, a bound gone 2026-10-12) with room to spare;
      // counted whole, seven at most at once, and the rest are refused or let
      // go 'own-full', the site holding all it holds for everyone: each
      // account judged as itself, one holding none of it takes room from one
      // holding two, both past their share (it was the machine, judged as one,
      // until 2026-10-12), so a turn let go was written to its page first.
      const before = people.map((h) => h.page.jobs().length);
      const long = askAll({ messages: [{ role: 'user', content: 'x'.repeat(900 * 1000) }] });
      const held = () => out() - people.reduce((n, h) => n + h.page.cancels().length, 0);
      assert.ok(await until(() => held() + long.filter((a) => a.res).length >= 10), `${held()} held, ${long.filter((a) => a.res).length} answered`);
      await sleep(200);
      const went = out();
      assert.ok(held() >= 5 && held() <= 7, `${held()} of ten long conversations from one machine were held at once: the route's body was not counted`);
      for (const a of long.filter((x) => x.res)) assert.deepEqual(a.res, { available: false, reason: 'upstream', why: 'own-full', provider: 'own' });
      await answerFrom(before);
      for (const a of long) assert.ok((await a.done).available === true || a.res.why === 'own-full', JSON.stringify(a.res));
      // A picture of 900KB, with a word: the sign-in is told one came, and
      // never sees it, so the route lets it go before the turn waits, and it is
      // counted by nothing. All ten go.
      const seen = people.map((h) => h.page.jobs().length);
      const pictures = askAll({ messages: [{ role: 'user', content: 'look at this' }], image: 'A'.repeat(900 * 1000) });
      assert.ok(await until(() => out() - went >= 10 || pictures.some((a) => a.res)), `${out() - went} pictures out`);
      await sleep(200);
      assert.deepEqual(pictures.filter((a) => a.res).map((a) => a.res), [], 'a picture let go before the turn waits was counted');
      assert.equal(out() - went, 10);
      for (const [i, h] of people.entries()) for (const j of h.page.jobs().slice(seen[i])) assert.match(j.prompt, /A camera frame came with this message/);
      await answerFrom(seen);
      for (const a of pictures) assert.equal((await a.done).available, true, JSON.stringify(a.res));
      for (const h of people) await h.page.close();
    });

    await ok('a page that declined the sign-in is told it has nothing to think with, at all three doors, and its page is never asked', async () => {
      const n = page.jobs().length;
      for (const [path, body] of [['/api/brain', { messages: [{ role: 'user', content: 'k' }], presence: 'wren', own: false }],
        ['/api/brain/stream', { messages: [{ role: 'user', content: 'k' }], own: false }], ['/api/code/handoff', { presence: 'wren', own: false }]]) {
        const r = await T.post(path, body, wren);
        assert.equal(r.status, 200, path);
        assert.deepEqual(await r.json(), { available: false }, path);
      }
      assert.equal(page.jobs().length, n, 'a declined turn reached the page');
    });

    await ok('with the page closed, the same session is told so too, and never refused', async () => {
      await page.close();
      const r = await T.post('/api/brain', { messages: [{ role: 'user', content: 'k' }], presence: 'wren' }, wren);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { available: false });
    });
  } finally {
    await stop(tiny);
    rmSync(DATA2, { recursive: true, force: true });
  }
}
rmSync(DATA, { recursive: true, force: true });

console.log(`\n${passed} passed`);
