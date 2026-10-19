// TWENTY QUESTIONS, WITH A SEALED ANSWER. Run:  node test/twenty.test.mjs
//
// Colin, 2026-10-19: "tons of room to work on the world, new backgrounds, ui
// improvements, games, etc". The second game (twenty.mjs, server.mjs
// /api/twenty, src/twenty.js, src/twenty-seal.js). What is held here:
//   - THE SEAL: what the page is shown before the first question is
//     sha256(`${salt}:${secret}`), the page's own hash of the revealed pair is
//     the server's, character for character, and a pair that was changed does
//     not match;
//   - the secret, and its salt, are in NO answer the page gets before the
//     game is over — not in a field, not in a line the model wrote to give
//     it away — and are in the one that ends it;
//   - twenty questions and no more; a right guess ends it at once; giving up
//     ends it, and needs no brain;
//   - the model's answers are read strictly: one that is not one (no JSON, no
//     answer word, nothing chosen) changes nothing and counts nothing;
//   - a game is the account's that began it: another account's id is no game
//     at all, and nothing is thought or written for it;
//   - the door is built as every door that thinks on a person's brain is
//     (test/life-brain.test.mjs keeps the lists it joined);
//   - a finished game is kept on the presence's shelf, once, in a short line.
// The model, here, is this test: it is the person's own page (own-relay.mjs),
// answering each turn the site hands it, as y3kode would.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import * as T from '../twenty.mjs';
import { sealOf as pageSeal, checkSeal } from '../src/twenty-seal.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SERVER = read('server.mjs');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
// Code as it runs: comment lines, and comments after code, gone, so a sentence
// about a rule never trips the check for it
const codeOf = (src) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

console.log('the seal:');

await ok('the seal is sha-256 of the salt, a colon and the secret, in lowercase hex; the salt is new each time', () => {
  assert.equal(T.sealOf('0f'.repeat(16), 'a lighthouse'), sha(`${'0f'.repeat(16)}:a lighthouse`));
  const a = T.newSalt(), b = T.newSalt();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
  assert.match(T.sealOf(a, 'x'), /^[0-9a-f]{64}$/);
});

await ok('the page opens the seal with its own crypto and gets the server\'s very hash, whatever the thing is called', async () => {
  const salt = T.newSalt();
  for (const s of ['a lighthouse', 'the Eiffel Tower', 'crème brûlée', '日本の城', 'a 🐙 octopus', 'a "quoted": thing']) {
    assert.equal(await pageSeal(salt, s), T.sealOf(salt, s), s);
    assert.equal(await checkSeal(T.sealOf(salt, s), { secret: s, salt }), true, s);
  }
});

await ok('a changed secret, a changed salt, or a seal that is not one does not match', async () => {
  const salt = T.newSalt();
  const seal = T.sealOf(salt, 'a heron');
  assert.equal(await checkSeal(seal, { secret: 'a crane', salt }), false, 'it changed its mind and the page did not see it');
  assert.equal(await checkSeal(seal, { secret: 'a heron ', salt }), false);
  assert.equal(await checkSeal(seal, { secret: 'a heron', salt: T.newSalt() }), false);
  assert.equal(await checkSeal(seal.toUpperCase(), { secret: 'a heron', salt }), false, 'only the hex the server writes');
  for (const bad of [null, undefined, {}, { secret: 'a heron' }, { salt }, { secret: 7, salt }]) assert.equal(await checkSeal(seal, bad), false);
  for (const bad of ['', 'abc', null, 42]) assert.equal(await checkSeal(bad, { secret: 'a heron', salt }), false);
});

await ok('a browser that cannot hash (no crypto.subtle: plain http off localhost) says it cannot check, never that it matched', async () => {
  const d = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  try {
    const salt = '00'.repeat(16);
    assert.equal(await checkSeal(T.sealOf(salt, 'a heron'), { secret: 'a heron', salt }), null);
  } finally { Object.defineProperty(globalThis, 'crypto', d); }
  const page = read('src/twenty.js');
  assert.match(page, /sealed === null|: 'this browser cannot check the seal here/, 'the page has no words for a seal it could not check');
});

console.log('\nreading the model:');

await ok('its JSON is found in fences and prose, and nothing is made of what is not an object', () => {
  assert.deepEqual(T.jsonOf('```json\n{"answer":"yes"}\n```'), { answer: 'yes' });
  assert.deepEqual(T.jsonOf('Sure! {"answer":"no","say":"Not quite."} Hope that helps.'), { answer: 'no', say: 'Not quite.' });
  assert.deepEqual(T.jsonOf('{"answer":"yes","say":"ok"} and {a smile}'), { answer: 'yes', say: 'ok' }, 'a brace in the words after it');
  for (const bad of ['', 'yes', '[1,2]', '{not json}', '{', '}{', null, undefined, 42, { answer: 'yes' }]) assert.equal(T.jsonOf(bad), null, String(bad));
});

await ok('nothing it writes can hold the server: every reader is quick on hostile text', () => {
  const HOSTILE = ['{'.repeat(64000), '}'.repeat(64000), '{"a":' + ' '.repeat(64000), '<<' + ' '.repeat(30000), '~' + ' '.repeat(30000),
    'a'.repeat(64000), 'is it '.repeat(10000), ' '.repeat(64000), '{"answer":"' + 'y'.repeat(60000) + '"}'];
  for (const h of HOSTILE) {
    const t = performance.now();
    T.jsonOf(h); T.parseSecret(h); T.parseAnswer(h, 'a lighthouse', h); T.parseMove(h); T.cleanLine(h); T.cleanThing(h);
    T.leaks(h, 'a lighthouse', h); T.namesIt(h, 'a lighthouse'); T.answerWord(h);
    const ms = performance.now() - t;
    assert.ok(ms < 250, `${ms.toFixed(0)} ms on ${JSON.stringify(h.slice(0, 20))}…`);
  }
});

await ok('its choice: a thing of one line, its quotes and full stop let go; anything else is no choice', () => {
  assert.deepEqual(T.parseSecret('{"secret":"a lighthouse","say":"I have one."}'), { secret: 'a lighthouse', say: 'I have one.' });
  assert.equal(T.parseSecret('{"secret":"“A Lighthouse.”"}').secret, 'A Lighthouse');
  for (const bad of ['{"secret":""}', '{"secret":"   "}', '{"secret":"!!!"}', '{"secret":42}', `{"secret":"${'x'.repeat(61)}"}`, '{"say":"hello"}', 'a lighthouse', '']) {
    assert.equal(T.parseSecret(bad), null, bad);
  }
});

await ok('its opening line never gives the thing away: a line that names it, spaced, run together or spelled out, is dropped', () => {
  for (const say of ['I chose a lighthouse!', 'Think of a light house.', 'L-I-G-H-T-H-O-U-S-E', 'It is a Lighthouse, ha.', 'lighthouses!']) {
    assert.equal(T.parseSecret(JSON.stringify({ secret: 'a lighthouse', say })).say, '', say);
  }
  assert.equal(T.parseSecret('{"secret":"a red panda","say":"Pandas are my favourite."}').say, '', 'a word of it');
  assert.equal(T.parseSecret('{"secret":"a red panda","say":"Ready when you are."}').say, 'Ready when you are.');
});

await ok('its answers: yes, no, sometimes, unknown, and the ways a model writes them; anything else is no answer', () => {
  const A = (answer) => T.parseAnswer(JSON.stringify({ answer, correct: false, say: '' }), 'a lighthouse', 'is it tall?')?.answer ?? null;
  assert.deepEqual(['yes', 'Yes.', 'YES', 'yep', 'no', 'No!', 'nope', 'sometimes', 'Partly', 'it depends', 'unknown', "Don't know", 'not sure'].map(A),
    ['yes', 'yes', 'yes', 'yes', 'no', 'no', 'no', 'sometimes', 'sometimes', 'sometimes', 'unknown', 'unknown', 'unknown']);
  for (const bad of ['', 'yes and no', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'absolutely', null, 42, true]) assert.equal(A(bad), null, String(bad));
  for (const bad of ['yes', 'I think so!', '{"say":"yes"}', '{"answer":["yes"]}', '']) assert.equal(T.parseAnswer(bad, 'a lighthouse', 'is it tall?'), null, bad);
});

await ok('a question that names it is found, whatever the model said; a guess the model calls correct is found only on a yes', () => {
  const P = (o, q) => T.parseAnswer(JSON.stringify(o), 'a lighthouse', q);
  assert.deepEqual(P({ answer: 'no', correct: false, say: 'Not a light house, no.' }, 'Is it a lighthouse?'), { answer: 'yes', hit: true, say: '' },
    'a no to its own name is not the answer, and the line written for it is not said');
  assert.deepEqual(P({ answer: 'yes', correct: true, say: 'Yes! A lighthouse.' }, 'is it a pharos?'), { answer: 'yes', hit: true, say: 'Yes! A lighthouse.' });
  assert.equal(P({ answer: 'no', correct: true, say: '' }, 'is it a tower?').hit, false, 'correct, and no: not found');
  assert.equal(P({ answer: 'yes', correct: 'true', say: '' }, 'is it a pharos?').hit, true);
  for (const q of ["It's a lighthouse?", 'lighthouses?', 'a light house?', 'my guess is the lighthouse', 'Is it a Lighthouse']) assert.ok(T.namesIt(q, 'a lighthouse'), q);
  for (const q of ['is it near a lighthouse?', 'is it a light?', 'is it a house?', 'is it tall?', '']) assert.ok(!T.namesIt(q, 'a lighthouse'), q);
});

await ok('a line beside an answer that would give the thing away is dropped; echoing the person\'s own word is not giving it away', () => {
  const P = (say, q, secret = 'an oak tree') => T.parseAnswer(JSON.stringify({ answer: 'yes', correct: false, say }), secret, q).say;
  assert.equal(P('Yes, oaks are tall.', 'is it tall?'), '', 'a word of it they never said');
  assert.equal(P('A tree, yes.', 'is it a tree?'), 'A tree, yes.', 'their own word, said back');
  assert.equal(P('Yes, an oak tree.', 'is it a tree?'), '', 'the whole of it, when they said only part');
  assert.equal(P('Mm. Warmer.', 'does it grow?'), 'Mm. Warmer.');
  assert.equal(T.leaks('Yes, it lives in water.', 'a heron', 'is it alive?'), false);
  assert.equal(T.leaks('Yes — herons are.', 'a heron', 'is it alive?'), true);
  assert.equal(T.leaks('It is delicate.', 'a cat'), false, 'three letters inside another word are not the thing');
});

await ok('its moves when the person thinks: a question, or a guess; a guess outranks a question; anything else is no move', () => {
  assert.deepEqual(T.parseMove('{"ask":"Is it alive?","say":"Let us begin."}'), { guess: false, q: 'Is it alive?', say: 'Let us begin.' });
  assert.deepEqual(T.parseMove('{"guess":"a violin.","say":""}'), { guess: true, q: 'a violin', say: '' });
  assert.equal(T.parseMove('{"ask":"Is it a violin?","guess":"a violin"}').guess, true);
  for (const bad of ['', 'Is it alive?', '{"ask":""}', '{"ask":"???"}', '{"guess":""}', '{"question":"Is it alive?"}', '{"ask":42}']) assert.equal(T.parseMove(bad), null, bad);
  assert.equal(T.cleanLine('[calm] Yes ~flare 7~ it is. <<memory short: kept>>'), 'Yes it is.', 'its own tags are not read aloud');
});

console.log('\nthe games:');

await ok('a game the presence thinks of is sealed at once, and the page sees the seal and never the secret or the salt until it is over', () => {
  const G = T.createGames();
  const g = G.start('u1', 'p1', 'it', 'a lighthouse');
  assert.ok(T.isId(g.id), g.id);
  assert.equal(g.seal, T.sealOf(g.salt, 'a lighthouse'));
  g.turns.push({ q: 'is it alive?', a: 'no', say: '' });
  const live = JSON.stringify(T.view(g));
  for (const leak of ['lighthouse', g.salt, '"secret"', '"salt"', '"reveal"']) assert.ok(!live.includes(leak), `${leak} in ${live}`);
  assert.equal(T.view(g).seal, g.seal);
  assert.deepEqual([T.view(g).n, T.view(g).left], [1, 19]);
  assert.equal(G.finish(g, 'presence', 'gave-up'), true);
  assert.equal(G.finish(g, 'person', 'found'), false, 'ended twice');
  assert.deepEqual(T.view(g).reveal, { secret: 'a lighthouse', salt: g.salt });
  assert.deepEqual(T.view(g).over, { winner: 'presence', how: 'gave-up' });
});

await ok('a game is its account\'s: another account\'s id, or no id, is no game', () => {
  const G = T.createGames();
  const g = G.start('u1', 'p1', 'it', 'a heron');
  assert.equal(G.get('u1', g.id), g);
  for (const [uid, id] of [['u2', g.id], ['u1', 'nope'], ['u1', g.id + 'x'], ['u1', null], ['u1', { id: g.id }], [undefined, g.id]]) assert.equal(G.get(uid, id), null, `${uid} ${id}`);
});

await ok('three games a person, the oldest of theirs let go for a fourth, nobody else\'s; the site holds as many as it holds, and refuses past that', () => {
  let t = 1000;
  const G = T.createGames({ now: () => t, max: 5 });
  const mine = [1, 2, 3].map(() => { t += 1; return G.start('u1', 'p1', 'you'); });
  const theirs = G.start('u2', 'p2', 'you');
  t += 1;
  const fourth = G.start('u1', 'p1', 'you');
  assert.equal(G.get('u1', mine[0].id), null, 'the oldest stayed');
  for (const g of [mine[1], mine[2], fourth]) assert.ok(G.get('u1', g.id));
  assert.ok(G.get('u2', theirs.id), 'someone else\'s game went to make room');
  assert.equal(G.size, 4);
  G.start('u3', 'p3', 'you');
  assert.equal(G.room(), false);
  assert.equal(G.start('u4', 'p4', 'you'), null, 'a full site let go of someone\'s game to make room');
  assert.equal(G.size, 5);
  G.forget('u1');
  assert.equal(G.size, 2, 'a closed account\'s games stayed');
});

await ok('a game lasts an hour from its start, then it is gone', () => {
  let t = 0;
  const G = T.createGames({ now: () => t });
  const g = G.start('u1', 'p1', 'it', 'a heron');
  t = T.GAME_TTL_MS;
  assert.equal(G.get('u1', g.id), g);
  t = T.GAME_TTL_MS + 1;
  assert.equal(G.get('u1', g.id), null);
  assert.equal(G.size, 0);
  assert.equal(T.GAME_TTL_MS, 60 * 60 * 1000);
  assert.equal(T.MAX_QUESTIONS, 20);
});

await ok('the line it keeps: short, in its own first person, one for each way a game ends, and none for a game with no questions', () => {
  const g = (mode, how, turns, extra = {}) => ({ mode, over: { how }, turns, secret: 'a lighthouse', ...extra });
  const q = (n, last) => Array.from({ length: n }, (_, i) => (i === n - 1 && last ? last : { q: `q${i}`, a: 'no', say: '' }));
  const lines = [
    T.clipOf(g('it', 'found', q(12)), '@wren'),
    T.clipOf(g('it', 'out', q(20)), '@wren'),
    T.clipOf(g('it', 'gave-up', q(1)), '@wren'),
    T.clipOf(g('you', 'guessed', q(9, { q: 'a violin', guess: true, a: 'yes' })), '@wren'),
    T.clipOf(g('you', 'out', q(20, { q: 'a cello', guess: true, a: 'no' })), '@wren'),
    T.clipOf(g('you', 'stopped', q(3)), '@wren'),
  ];
  assert.deepEqual(lines, [
    'played twenty questions with @wren: I thought of "a lighthouse", and they found it with question 12.',
    'played twenty questions with @wren: I thought of "a lighthouse", and twenty questions did not find it.',
    'played twenty questions with @wren: I thought of "a lighthouse"; they stopped after 1 question and I showed them.',
    'played twenty questions with @wren: they thought of something, and I found it with question 9: "a violin".',
    'played twenty questions with @wren: they thought of something, and I did not find it in twenty questions (my last guess was "a cello").',
    'played twenty questions with @wren: they thought of something, and we stopped after 3 questions.',
  ]);
  for (const l of lines) assert.ok(l.length < 200, l);
  assert.equal(T.clipOf(g('it', 'gave-up', [])), '');
  assert.equal(T.clipOf({ mode: 'it', over: null, turns: q(3) }), '');
});

console.log("\nthe page's words (src/twenty.js):");
// brain.js, which the page imports, looks at storage and the window as it
// loads: stand-ins, as test/client-audit.test.mjs gives it
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.window ||= { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
const PAGE = await import('../src/twenty.js');

await ok('a spoken answer is read for what it means; to a guess it is right or not it, never sometimes', () => {
  const H = (t, guess) => PAGE.heardAnswer(t, guess);
  assert.deepEqual(['yes', 'Yeah, it is', 'yep', 'correct', 'no', 'Nope.', "it's not", 'sometimes', 'sort of', 'it depends', "I don't know", 'no idea', 'not sure', 'banana', ''].map((t) => H(t)),
    ['yes', 'yes', 'yes', 'yes', 'no', 'no', 'no', 'sometimes', 'sometimes', 'sometimes', 'unknown', 'unknown', 'unknown', '', '']);
  assert.deepEqual(['right', 'yes!', 'no', 'not it', 'maybe', "I don't know"].map((t) => H(t, true)), ['yes', 'yes', 'no', 'no', '', '']);
});

await ok('what it says with an answer begins with the answer, so an ear alone can follow the game', () => {
  assert.equal(PAGE.spokenAnswer('no', 'Not at all.'), 'No. Not at all.');
  assert.equal(PAGE.spokenAnswer('yes', 'Yes — very much.'), 'Yes — very much.');
  assert.equal(PAGE.spokenAnswer('yes', 'Yesterday, maybe.'), 'Yes. Yesterday, maybe.', 'a word that only starts like the answer');
  assert.equal(PAGE.spokenAnswer('unknown', ''), "Don't know.");
  assert.equal(PAGE.spokenAnswer('unknown', "Don't know, honestly."), "Don't know, honestly.");
  assert.equal(PAGE.spokenAnswer('sometimes', 'Depends on the day.'), 'Sometimes. Depends on the day.');
});

await ok('the microphone is the game\'s for one utterance, let go when it closes, and only then is what was heard used', () => {
  const page = codeOf(read('src/twenty.js'));
  const lease = page.slice(page.indexOf('function listen() {'), page.indexOf('function stopMic() {'));
  assert.match(lease, /mic = \{ handlers, release: \(\) => \{\} \};\n\s*mic\.release = dictate\(handlers\) \|\| mic\.release;/);
  const onText = lease.slice(lease.indexOf('onText:'), lease.indexOf('onState:'));
  assert.ok(!/stopMic\(|ask\(|answer\(/.test(onText), 'the words are acted on while the microphone is still open: ' + onText);
  const onState = lease.slice(lease.indexOf('onState:'));
  assert.ok(onState.indexOf('stopMic();') < onState.indexOf('ask(heard)'), 'the lease is kept past the listen');
});

console.log('\nthe door (server.mjs), as written:');

const route = (from, to) => {
  const at = SERVER.indexOf(from);
  assert.ok(at >= 0, `server.mjs has no ${from}`);
  const end = SERVER.indexOf(to, at);
  assert.ok(end > at, `server.mjs has nothing after ${from} like ${to}`);
  return SERVER.slice(at, end);
};
const DOOR = codeOf(route("reqPath === '/api/twenty'", '// ===== THE WORLD'));

await ok('who, whose presence, the body, whose page, then the end that needs no brain, then whose brain — in that order — and one call that thinks', () => {
  const at = (s) => { const i = DOOR.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = ['const user = sessionUser(req);', "if (!user) return json(401, { error: 'sign in' });", 'presences.presenceOfOwner(user.id)',
    'await readJsonBody(req, 16 * 1024)', 'if (forAnother(req, b?.as)) return json(409, RELOAD);', "if (op === 'end') {", 'const own = lifeBrain(user, b);',
    "if (!own) return json(200, { available: false, reason: 'byok'", 'if (own.error) return json(400, { error: own.error });', 'own.p.chat('];
  for (let i = 1; i < order.length; i++) assert.ok(at(order[i - 1]) < at(order[i]), `${order[i - 1]} is not before ${order[i]}`);
  const end = DOOR.slice(at("if (op === 'end') {"), at('const own = lifeBrain(user, b);'));
  assert.ok(!/chat\(|lifeBrain\(|getPresenceMemory\(/.test(end), 'ending a game thinks: ' + end);
  assert.equal(DOOR.split('own.p.chat(').length - 1, 1, 'one call that thinks, not one per step');
  assert.equal(DOOR.split('lifeBrain(').length - 1, 1);
  assert.match(DOOR, /own\.p\.chat\(own\.key, own\.model, \[\{ role: 'user', content: userMsg \}\], null, false,\n\s*\{ system: sys, raw: true, effort, source: sourceOf\(req\), holds: bodyHeld\(req\) \}\);/);
  assert.match(DOOR, /apiUsage\.record\(user\.id, \{ provider: own\.pid, model: own\.model, inTok: out\.usage\.in, outTok: out\.usage\.out, cost: ledgerCost\(own\.pid, own\.model, out\.usage\) \}\);/);
  // the game is found by the session's own account and nothing else
  assert.equal(DOOR.split('twentyGames.get(user.id, b.id)').length - 1, 2);
  assert.ok(!/twentyGames\.get\((?!user\.id)/.test(DOOR), 'a game looked up by something besides the account');
});

await ok('it is paid, behind the terms, and forgotten with the account; the life-brain lists know it', () => {
  const decl = (name) => SERVER.slice(SERVER.indexOf('const ' + name + ' ='), SERVER.indexOf(';', SERVER.indexOf('const ' + name + ' =')));
  const paid = new RegExp(/\/(\^\\\/api\\\/\(brain\|[^\n]*\))\/\.test\(reqPath\) \? 'paid' : 'cheap';/.exec(SERVER)?.[1] || '$^');
  assert.ok(paid.test('/api/twenty'), 'not in the paid class: ' + paid);
  assert.ok(decl('cls').includes('|twenty)'), 'the paid class no longer names it');
  const gated = new RegExp(/const GATED = \/(.*)\/;/.exec(SERVER)?.[1] || '$^');
  assert.ok(gated.test('/api/twenty'), 'not behind the terms gate');
  assert.match(route("reqPath === '/api/me/delete'", "reqPath === '/api/feed'"), /twentyGames\.forget\(uid\);/);
  const life = read('test/life-brain.test.mjs');
  assert.ok(life.includes("twenty: route(\"reqPath === '/api/twenty'\", '// ===== THE WORLD')"), 'the doors that refuse a page for another account do not list it');
  assert.ok(life.includes("['/api/twenty', { op: 'start', mode: 'it' }]"), 'the stale tab walk does not knock on it');
  assert.match(SERVER, /^import \* as twenty from '\.\/twenty\.mjs';$/m);
  // nothing in the client imports the server's module (every root .mjs is server-only)
  for (const f of ['src/twenty.js', 'src/twenty-seal.js', 'src/social.js']) assert.ok(!/from '\.\.\/twenty\.mjs'/.test(read(f)), f);
});

await ok('the page: every step that thinks carries keyFields, the end only whose page it is; the word to reload is read; the seal is checked here', () => {
  const page = codeOf(read('src/twenty.js'));
  assert.match(page, /fetch\('\/api\/twenty', \{[\s\S]{0,300}\.\.\.\(body\.op === 'end' \? whoseFields\(\) : keyFields\(\)\)/);
  assert.match(page, /if \(reloaded\(r\)\) return null;/);
  assert.match(page, /checkSeal\(g\.seal, g\.reveal\)/);
  assert.ok(!/key: cfg\.key|getBrainConfig/.test(page), 'the page builds a brain request from the key by hand');
  // it reaches nothing but its own door and the presence's handle
  const urls = [...page.matchAll(/fetch\('([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(urls, ['/api/presences?mine=1', '/api/twenty']);
  // the seal module reaches nothing at all
  const seal = codeOf(read('src/twenty-seal.js'));
  assert.ok(!/fetch\(|import /.test(seal), 'the seal is checked with something besides this page\'s own crypto');
});

await ok('the games glyph: chess as it was, twenty questions beside it, a chooser for both', () => {
  const social = codeOf(read('src/social.js'));
  assert.match(social, /else if \(v === 'chess'\) chess\.open\(\$\('home-grid'\)\);\n\s*else if \(v === 'twenty'\) twenty\.open\(\$\('home-grid'\)\);/);
  assert.match(social, /if \(v !== 'chess'\) chess\.close\(\);\n\s*if \(v !== 'twenty'\) twenty\.close\(\);/);
  assert.match(social, /document\.body\.classList\.toggle\('in-chess', v === 'chess'\);/, 'chess no longer keeps its chat bar');
  assert.match(social, /if \(v === 'games'\) v = lastGame;/);
  const main = codeOf(read('src/main.js'));
  assert.match(main, /\$\('nav-games'\)\.addEventListener\('click', \(\) => \{[\s\S]{0,200}social\.showView\('games'\);/);
  assert.match(main, /\$\('invite-accept'\)\?\.addEventListener\('click', \(\) => \{[\s\S]{0,200}social\.showView\('chess'\);/, 'an invitation to chess opens chess');
  assert.match(main, /games: \{\n\s*mood: \(m\) => \{ if \(busy\) return; currentMood = m; body\.setMood\(m\); setMoodTag\(m\); \},/, 'the game moves the orb some other way than a reply does');
  const html = read('index.html');
  assert.match(html, /<div id="games-pick" class="discover-filters games-pick" role="tablist" aria-label="games" hidden>/);
  assert.match(html, /data-game="chess">chess<\/button>[\s\S]*data-game="twenty">twenty questions<\/button>/);
  const css = read('styles.css');
  assert.match(css, /\nbody\.panel-open\.in-twenty #caption \{ opacity: 1; z-index: 35; \}/, 'its lines are captioned under a panel that hides the caption');
  assert.match(css, /\n\.home-grid\.mode-twenty \{ max-width: 560px;/);
});

// --- the server ----------------------------------------------------------------
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(15); } };
const DATA = mkdtempSync(join(tmpdir(), 'y3k-twenty-'));
const LOG = join(DATA, 'brain.log');
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', './test/fakes/brain-scripted.mjs', 'server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: DATA, FOUNDER_PASSWORD: 'twenty-' + Math.random().toString(36).slice(2),
    FAKE_BRAIN_SCRIPT: 'speak', FAKE_BRAIN_LOG: LOG, RATE_MAX: '1000', RATE_CHEAP_MAX: '5000', RENDER: '', CODE_ROLLOUT: '', MODEL: '' },
});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ } await sleep(120); }
const stop = async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); } };

const post = (path, body, cookie) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const signup = async (username) => {
  const r = await post('/api/auth/signup', { email: `${username}@example.com`, username, password: 'a-long-password-1', age17: true, terms: true });
  assert.ok(r.ok, `signup ${username}: ${r.status}`);
  return cookieOf(r);
};
const idOf = (cookie) => fetch(`${BASE}/api/auth/me`, { headers: { cookie } }).then((r) => r.json()).then((j) => j.user?.id);
// The person's own page, offering their sign-in (own-relay.mjs), as
// src/own-brain.js holds it: every job it is handed is kept, and this test
// answers each one as y3kode would.
async function page(cookie) {
  const ac = new AbortController();
  const events = [];
  const as = await idOf(cookie);
  const r = await fetch(`${BASE}/api/own-brain?provider=claude&as=${encodeURIComponent(as)}`, { headers: { cookie }, signal: ac.signal });
  assert.equal(r.status, 200, 'the page could not offer its sign-in');
  (async () => {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
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
    } catch { /* closed */ }
  })();
  assert.ok(await until(() => events.some((e) => e.ev === 'ready')), 'the page was never told it is ready');
  const jobs = () => events.filter((e) => e.ev === 'job').map((e) => e.data);
  return {
    jobs,
    close: () => ac.abort(),
    // ask the site for something, answer the job it hands this page with
    // `text` as the model's words, → { job, res (the site's answer, raw text) }
    async turn(ask, text) {
      const n = jobs().length;
      const pending = ask();
      const job = await until(() => jobs()[n]);
      assert.ok(job, 'no turn reached the page');
      await post(`/api/own-brain/${job.id}`, { ok: true, text, usage: { in: 300, out: 20 } }, cookie);
      return { job, res: await pending };
    },
  };
}
// One step of the game: → { status, raw (the whole answer, as text), j (parsed) }
const step = async (cookie, body) => {
  const r = await post('/api/twenty', body, cookie);
  const raw = await r.text();
  return { status: r.status, raw, j: JSON.parse(raw) };
};
const shelf = () => { try { return readFileSync(join(DATA, '.clippings.json'), 'utf8'); } catch { return ''; } };

console.log('\nthe game, on a server, its model the person\'s own page:');
try {
  const wren = await signup('wren');
  const kit = await signup('kit');
  const pg = await page(wren);
  const SECRET = 'a lighthouse';
  // every answer the page gets before the game ends, as the page gets it
  const before = [];
  const sealed = (s) => { before.push(s.raw); return s; };
  const neverBefore = (secret, salt) => {
    for (const raw of before) {
      for (const leak of [secret.toLowerCase(), 'lighthouse', salt, '"secret"', '"salt"', '"reveal"']) assert.ok(!raw.toLowerCase().includes(leak), `"${leak}" reached the page before the end: ${raw}`);
    }
    before.length = 0;
  };

  let g1;
  await ok('it thinks of something: the page is given a seal, and its opening line, which named the thing, is not said', async () => {
    const { job, res } = await pg.turn(() => step(wren, { op: 'start', mode: 'it' }).then(sealed), JSON.stringify({ secret: SECRET, say: 'I have chosen a lighthouse. Ask away!' }));
    assert.match(job.system, /beginning a game of Twenty Questions with @wren/);
    assert.match(job.system, /This time let it be /, 'no kind of thing was drawn for it');
    assert.equal(res.status, 200, res.raw);
    assert.equal(res.j.ok, true, res.raw);
    g1 = res.j.game;
    assert.deepEqual([g1.mode, g1.n, g1.left, g1.turns], ['it', 0, 20, []]);
    assert.match(g1.seal, /^[0-9a-f]{64}$/);
    assert.equal(res.j.say, '', 'the line that named it was said');
  });

  await ok('it answers: the answer counted, its line kept unless it gives the thing away', async () => {
    const one = await pg.turn(() => step(wren, { op: 'ask', id: g1.id, question: 'Is it alive?' }).then(sealed), '{"answer":"no","correct":false,"say":"No. Lighthouses never breathe."}');
    assert.match(one.job.system, /it is sealed: "a lighthouse"/, 'the model was not told what it chose');
    assert.match(one.job.prompt, /This is their first question\.\n\nQuestion 1 of 20: Is it alive\?/);
    assert.deepEqual([one.res.j.game.n, one.res.j.game.left, one.res.j.game.turns[0]], [1, 19, { q: 'Is it alive?', a: 'no', say: '' }]);
    const two = await pg.turn(() => step(wren, { op: 'ask', id: g1.id, question: 'is it bigger than a house?' }).then(sealed), '{"answer":"yes","correct":false,"say":"Much bigger, yes."}');
    assert.match(two.job.prompt, /1\. Is it alive\? — no\n\nQuestion 2 of 20: is it bigger than a house\?/);
    assert.deepEqual(two.res.j.game.turns[1], { q: 'is it bigger than a house?', a: 'yes', say: 'Much bigger, yes.' });
    assert.equal(two.res.j.say, 'Much bigger, yes.');
  });

  await ok('an answer with no answer in it counts nothing: the page is told to ask again', async () => {
    for (const text of ['I think so!', '{"answer":"absolutely","say":"!"}', '{"say":"yes"}', '']) {
      const { res } = await pg.turn(() => step(wren, { op: 'ask', id: g1.id, question: 'is it in a city?' }).then(sealed), text);
      assert.equal(res.j.available, false, res.raw);
      assert.match(res.j.error, /without a yes or a no/);
    }
    const { res } = await pg.turn(() => step(wren, { op: 'ask', id: g1.id, question: 'is it by the sea?' }).then(sealed), '{"answer":"yes","correct":false,"say":""}');
    assert.equal(res.j.game.n, 3, 'a malformed answer was counted');
  });

  await ok('another account\'s game is no game to them: refused, nothing thought, nothing kept, and the game goes on as it was', async () => {
    const jobs = pg.jobs().length;
    const shelfWas = shelf();
    // kit can think too (a page of kit's own, offering kit's sign-in), so what
    // turns kit away is whose game it is, not having nothing to think with
    const kits = await page(kit);
    for (const body of [{ op: 'ask', id: g1.id, question: 'is it a lighthouse?' }, { op: 'end', id: g1.id }, { op: 'reply', id: g1.id, answer: 'yes' }]) {
      const r = await step(kit, body);
      assert.equal(r.status, 404, `${body.op}: ${r.raw}`);
      assert.deepEqual(r.j, { error: 'that game is gone' }, 'it says more than that there is no such game');
    }
    // …and with nothing to think with, a step that thinks is told that first
    kits.close();
    assert.ok(await until(async () => !(await fetch(`${BASE}/api/health`, { headers: { cookie: kit } }).then((r) => r.json())).ownBrain));
    const blind = await step(kit, { op: 'ask', id: g1.id, question: 'is it a lighthouse?' });
    assert.deepEqual([blind.status, blind.j.reason], [200, 'byok']);
    assert.equal(kits.jobs().length, 0, 'kit\'s knock on wren\'s game was thought about on kit\'s plan');
    assert.equal(pg.jobs().length, jobs, 'a turn was thought for another account\'s knock');
    assert.equal(shelf(), shelfWas);
    // a page loaded for kit, in a browser that is wren's now: told to reload
    const stale = await step(wren, { op: 'ask', id: g1.id, question: 'is it tall?', as: await idOf(kit) });
    assert.deepEqual([stale.status, stale.j], [409, { error: 'reload', reason: 'reload' }]);
    assert.equal(pg.jobs().length, jobs);
    for (const [body, status] of [[{ op: 'ask', id: 'abcdefghijkl', question: 'hi?' }, 404], [{ op: 'ask', id: g1.id, question: '   ' }, 400],
      [{ op: 'reply', id: g1.id, answer: 'yes' }, 400], [{ op: 'fly' }, 400], [{ op: 'start', mode: 'it', key: 'not-a-key' }, 400]]) {
      assert.equal((await step(wren, body)).status, status, JSON.stringify(body));
    }
    assert.equal(pg.jobs().length, jobs, 'a refused step reached the page');
  });

  await ok('a question that names it ends the game at once: the person found it, and the seal opens on the very pair it was made from', async () => {
    const shelfWas = shelf();
    const { res } = await pg.turn(() => step(wren, { op: 'ask', id: g1.id, question: 'Is it a lighthouse?' }), '{"answer":"yes","correct":true,"say":"Yes! A lighthouse. You found it."}');
    const g = res.j.game;
    assert.deepEqual([g.n, g.over], [4, { winner: 'person', how: 'found' }]);
    assert.equal(g.reveal.secret, SECRET);
    assert.equal(T.sealOf(g.reveal.salt, g.reveal.secret), g1.seal, 'the seal shown first is not the hash of what was revealed');
    assert.equal(await checkSeal(g1.seal, g.reveal), true, 'the page\'s own check failed');
    assert.equal(res.j.say, 'Yes! A lighthouse. You found it.', 'at the end it may name it');
    neverBefore(SECRET, g.reveal.salt);
    assert.notEqual(shelf(), shelfWas);
    assert.ok(shelf().includes('played twenty questions with @wren: I thought of \\"a lighthouse\\", and they found it with question 4.'), shelf());
    // the game is over: asked again, it is the same game, with nothing thought
    const jobs = pg.jobs().length;
    const again = await step(wren, { op: 'ask', id: g1.id, question: 'is it red?' });
    assert.deepEqual(again.j.game.over, { winner: 'person', how: 'found' });
    assert.equal(again.j.game.n, 4);
    assert.equal(pg.jobs().length, jobs);
    const ended = await step(wren, { op: 'end', id: g1.id });
    assert.deepEqual(ended.j.game.over, { winner: 'person', how: 'found' }, 'ending a game that was over changed how it ended');
    assert.equal(shelf().split('played twenty questions').length - 1, 1, 'one game, kept twice');
  });

  await ok('twenty questions and no more: the twentieth answer ends it, it kept its thing, and the seal opens', async () => {
    const { res: s } = await pg.turn(() => step(wren, { op: 'start', mode: 'it' }).then(sealed), '{"secret":"a heron","say":"Ready."}');
    const id = s.j.game.id, seal = s.j.game.seal;
    let last;
    for (let i = 1; i <= 20; i++) {
      const { res } = await pg.turn(() => step(wren, { op: 'ask', id, question: `is it thing number ${i}?` }).then(sealed), '{"answer":"no","correct":false,"say":"No."}');
      last = res.j.game;
      if (i < 20) assert.deepEqual([last.n, last.left, last.over], [i, 20 - i, undefined], `after ${i}`);
    }
    before.pop();   // the twentieth answer is the one that ends it
    assert.deepEqual([last.n, last.left, last.over], [20, 0, { winner: 'presence', how: 'out' }]);
    assert.equal(T.sealOf(last.reveal.salt, last.reveal.secret), seal);
    assert.equal(last.reveal.secret, 'a heron');
    neverBefore('a heron', last.reveal.salt);
    const jobs = pg.jobs().length;
    const more = await step(wren, { op: 'ask', id, question: 'one more?' });
    assert.equal(more.j.game.n, 20, 'a twenty-first question was counted');
    assert.equal(pg.jobs().length, jobs, 'a twenty-first question was thought about');
    assert.ok(shelf().includes('I thought of \\"a heron\\", and twenty questions did not find it.'));
  });

  await ok('giving up ends it and opens the seal, and needs no brain: with the page that thinks gone, a game can still be ended', async () => {
    const { res: s } = await pg.turn(() => step(wren, { op: 'start', mode: 'it' }).then(sealed), '{"secret":"a kettle","say":""}');
    const { id, seal } = s.j.game;
    await pg.turn(() => step(wren, { op: 'ask', id, question: 'is it alive?' }).then(sealed), '{"answer":"no","correct":false,"say":""}');
    pg.close();
    assert.ok(await until(async () => !(await fetch(`${BASE}/api/health`, { headers: { cookie: wren } }).then((r) => r.json())).ownBrain), 'the page is still offering');
    const think = sealed(await step(wren, { op: 'ask', id, question: 'is it in a kitchen?' }));
    assert.deepEqual([think.j.available, think.j.reason], [false, 'byok'], 'with nothing to think with, it said something else');
    const end = await step(wren, { op: 'end', id });
    assert.equal(end.status, 200, end.raw);
    assert.deepEqual(end.j.game.over, { winner: 'presence', how: 'gave-up' });
    assert.equal(end.j.game.reveal.secret, 'a kettle');
    neverBefore('a kettle', end.j.game.reveal.salt);
    assert.equal(await checkSeal(seal, end.j.game.reveal), true);
    assert.ok(shelf().includes('I thought of \\"a kettle\\"; they stopped after 1 question and I showed them.'));
  });

  const pg2 = await page(wren);
  await ok('you think, it asks: your answers go in, a wrong guess is one of its twenty, a right one ends it — and nothing is thought after it', async () => {
    const shelfWas = shelf();
    const s = await pg2.turn(() => step(wren, { op: 'start', mode: 'you' }), '{"ask":"Is it alive?","say":"Let me think."}');
    assert.match(s.job.system, /they have thought of something, and you have twenty yes-or-no questions/);
    assert.match(s.job.prompt, /Nothing asked yet\.\n\nYour question 1 of 20\./);
    let g = s.res.j.game;
    assert.deepEqual([g.mode, g.n, g.pending, s.res.j.say], ['you', 0, { q: 'Is it alive?', guess: false, say: 'Let me think.' }, 'Let me think.']);
    assert.ok(!('seal' in g), 'a game the person thinks of has nothing to seal');
    const r1 = await pg2.turn(() => step(wren, { op: 'reply', id: g.id, answer: 'yes' }), '{"guess":"a cat","say":"A hunch."}');
    assert.match(r1.job.prompt, /So far:\n1\. Is it alive\? — yes\n\nYour question 2 of 20\./);
    g = r1.res.j.game;
    assert.deepEqual([g.n, g.pending], [1, { q: 'a cat', guess: true, say: 'A hunch.' }]);
    const r2 = await pg2.turn(() => step(wren, { op: 'reply', id: g.id, answer: 'no' }), '{"ask":"Does it bark?","say":""}');
    assert.match(r2.job.prompt, /2\. \(your guess\) a cat — not it/);
    const r3 = await pg2.turn(() => step(wren, { op: 'reply', id: g.id, answer: 'sometimes' }), '{"guess":"a dog"}');
    assert.match(r3.job.prompt, /3\. Does it bark\? — sometimes/);
    const jobs = pg2.jobs().length;
    const done = await step(wren, { op: 'reply', id: g.id, answer: 'yes' });
    assert.equal(pg2.jobs().length, jobs, 'the answer that ended it was thought about');
    assert.deepEqual([done.j.game.n, done.j.game.over, done.j.game.pending], [4, { winner: 'presence', how: 'guessed' }, undefined]);
    assert.notEqual(shelf(), shelfWas);
    assert.ok(shelf().includes('they thought of something, and I found it with question 4: \\"a dog\\".'), shelf());
    for (const bad of ['maybe', 'YES', '', null]) assert.equal((await step(wren, { op: 'reply', id: g.id, answer: bad })).j.game?.over?.how, 'guessed', 'an over game took an answer');
  });

  await ok('an answer is kept only once it has asked again: a move with no move in it keeps nothing, and the same answer can be sent again', async () => {
    const s = await pg2.turn(() => step(wren, { op: 'start', mode: 'you' }), '{"ask":"Is it bigger than a loaf of bread?"}');
    const id = s.res.j.game.id;
    for (const text of ['Hmm, let me think.', '{"question":"Is it red?"}', '{"ask":""}']) {
      const { res } = await pg2.turn(() => step(wren, { op: 'reply', id, answer: 'no' }), text);
      assert.equal(res.j.available, false, res.raw);
    }
    const { res } = await pg2.turn(() => step(wren, { op: 'reply', id, answer: 'no' }), '{"ask":"Can you hold it in one hand?"}');
    assert.deepEqual([res.j.game.n, res.j.game.turns, res.j.game.pending.q],
      [1, [{ q: 'Is it bigger than a loaf of bread?', guess: false, a: 'no', say: '' }], 'Can you hold it in one hand?']);
    // stopped there: kept as stopped, with the one question it asked
    const kept = await step(wren, { op: 'end', id });
    assert.deepEqual(kept.j.game.over, { winner: null, how: 'stopped' });
    assert.ok(shelf().includes('they thought of something, and we stopped after 1 question.'));
  });

  await ok('when it never finds yours, twenty answers end it, and on the last it was told to guess', async () => {
    const s = await pg2.turn(() => step(wren, { op: 'start', mode: 'you' }), '{"ask":"Q1?"}');
    const id = s.res.j.game.id;
    let res;
    for (let i = 1; i < 20; i++) {
      const last = i === 19;
      const t = await pg2.turn(() => step(wren, { op: 'reply', id, answer: 'no' }), last ? '{"guess":"a cello"}' : `{"ask":"Q${i + 1}?"}`);
      if (last) assert.match(t.job.prompt, /Your question 20 of 20: your last, so guess now\./);
      res = t.res;
    }
    assert.deepEqual([res.j.game.n, res.j.game.pending], [19, { q: 'a cello', guess: true, say: '' }]);
    const jobs = pg2.jobs().length;
    const end = await step(wren, { op: 'reply', id, answer: 'no' });
    assert.equal(pg2.jobs().length, jobs);
    assert.deepEqual([end.j.game.n, end.j.game.over], [20, { winner: 'person', how: 'out' }]);
    assert.ok(shelf().includes('and I did not find it in twenty questions (my last guess was \\"a cello\\").'));
  });

  await ok('three games a person: a fourth lets the oldest go, which is then gone to them', async () => {
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const { res } = await pg2.turn(() => step(wren, { op: 'start', mode: 'it' }), `{"secret":"thing ${i}","say":""}`);
      ids.push(res.j.game.id);
    }
    assert.equal((await step(wren, { op: 'end', id: ids[0] })).status, 404, 'the oldest of four is still held');
    assert.equal((await step(wren, { op: 'end', id: ids[3] })).status, 200);
  });

  await ok('on a key: a reply that is no choice is said so, nothing is made, and the turn is on their ledger', async () => {
    const usage = () => fetch(`${BASE}/api/usage`, { headers: { cookie: wren } }).then((r) => r.json());
    const was = JSON.stringify((await usage()).usage);
    // the scripted brain answers anything but airden with a line of speech, not JSON
    const r = await step(wren, { op: 'start', mode: 'it', key: 'sk-ant-wren' });
    assert.deepEqual([r.j.available, r.j.error], [false, 'it did not choose anything — try again']);
    const calls = readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(calls.at(-1).key, 'sk-ant-wren');
    assert.match(calls.at(-1).system, /beginning a game of Twenty Questions/);
    assert.notEqual(JSON.stringify((await usage()).usage), was, 'the turn on their key is not on their ledger');
  });

  await ok('with no key and no page of theirs, nothing thinks: "byok", the founder\'s line', async () => {
    pg2.close();
    assert.ok(await until(async () => !(await fetch(`${BASE}/api/health`, { headers: { cookie: wren } }).then((r) => r.json())).ownBrain));
    const r = await step(wren, { op: 'start', mode: 'you' });
    assert.deepEqual([r.status, r.j.available, r.j.reason], [200, false, 'byok']);
    assert.equal((await step(null, { op: 'start', mode: 'it' })).status, 401, 'a guest');
  });
} finally {
  await stop();
  if (existsSync(DATA)) rmSync(DATA, { recursive: true, force: true });
}

console.log(`\n${passed} passed`);
