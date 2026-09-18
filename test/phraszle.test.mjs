// THE MINE. A closed book, a phrase of N words from it, and a rented mind you
// coach but cannot tell. Run: node test/phraszle.test.mjs
//
// Three of these guard things that would be silent and expensive if they broke:
// the answer reaching a client, the HOUSE key paying for a stranger's dig, and
// a deleted account's rows outliving the account. The rest guard the game.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

// Point the store at a scratch dir BEFORE importing — DATA_DIR is read at load.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'phraszle-'));
const P = await import('../phraszle.mjs');
const ROOT = new URL('..', import.meta.url);

// read once, up here: a const declared in a later section is a TDZ trap for
// every test written above it
const srv = readFileSync(new URL('server.mjs', ROOT), 'utf8');
const mod = readFileSync(new URL('phraszle.mjs', ROOT), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('\nthe book and the lexicon:');

ok('the book is in the tree, not in the store — a deploy without it has no game', () => {
  // It is the thing players READ and the source of the lexicon, so it is not a
  // secret and does not belong in DATA_DIR. The ANSWERS are the secret.
  const book = readFileSync(new URL('phraszle/the-unwording.md', ROOT), 'utf8');
  assert.ok(book.length > 1000, 'the book is missing or truncated');
  assert.ok(P.lexiconSize() > 200, 'lexicon is ' + P.lexiconSize());
});

ok('one tokenizer decides what may be authored, guessed, and compared', () => {
  // If these three ever came from different rules, an author could write a
  // phrase the miner is forbidden to say.
  assert.deepEqual(P.tokenize("Don't  — the STRANGER'S rain!"), ['don\'t', 'the', 'stranger\'s', 'rain']);
  assert.equal(P.normPhrase('  The   RAIN. '), 'the rain');
  assert.equal(P.tokenize('12 3-4'), '');   // digits and hyphens are not words
});

ok('an answer with a word that is not in the book is unplayable, not a wall', () => {
  assert.equal(P.answerIsPlayable('zzzznotaword'), false);
  assert.equal(P.answerIsPlayable(''), false);
});

console.log('\nthe answer never leaves:');

const w = P.addBlock({ answer: 'the rain', hint: 'it falls', by: 'u1' });
ok('a block can be written, and its answer is normalised', () => {
  assert.ok(!w.error, JSON.stringify(w));
  assert.equal(w.words, 2);
  assert.ok(w.lid && w.lid.length > 10, 'no immutable id');
});

ok('WHAT A CLIENT SEES CARRIES NO ANSWER AND NO HINT TEXT', () => {
  // The one guard that matters most: every field of the player projection is
  // enumerated here, so adding `answer` to it has to be done deliberately and
  // with this test failing in your face.
  const b = P.blockById(w.lid);
  const seen = P.blockForPlayer(b, 'u1');
  assert.deepEqual(Object.keys(seen).sort(), ['hasHint', 'lid', 'order', 'playable', 'solved', 'words']);
  const json = JSON.stringify(seen) + JSON.stringify(P.ladderFor('u1')) + JSON.stringify(P.frontierFor('u1'));
  assert.ok(!json.includes('rain'), 'THE ANSWER IS IN WHAT GOES TO THE CLIENT: ' + json);
  assert.ok(!json.includes('falls'), 'the hint text is in what goes to the client');
  // and the same for the ladder, which is public
  assert.ok(!JSON.stringify(P.ladder((uid) => uid)).includes('rain'), 'the answer is on the leaderboard');
});

ok('the miner is told the book and the length, never the phrase', () => {
  const sys = P.minerSystem(2, null);
  assert.ok(sys.includes('exactly 2 words'), 'the length is not stated');
  assert.ok(sys.includes('THE BOOK'), 'the book is not in the prompt');
  // THE ANSWER IS MADE OF BOOK WORDS, so of course the phrase can occur inside
  // the book — 'the rain' is in there once, which is how this test first failed.
  // The property that actually matters is that the answer is nowhere in what
  // the prompt SAYS, as opposed to what it quotes: everything before the book
  // is the instructions, and the instructions must not name the phrase.
  const instructions = sys.slice(0, sys.indexOf('<<<'));
  assert.ok(instructions.length > 400, 'could not separate instructions from the book');
  assert.ok(!instructions.includes('the rain'), 'THE ANSWER IS IN THE MINER INSTRUCTIONS');
  assert.ok(/do NOT know it/i.test(instructions), 'the miner is not told that it does not know');
});

ok('a hint reaches the miner only when one is passed', () => {
  assert.ok(!P.minerSystem(2, null).includes('it falls'));
  assert.ok(P.minerSystem(2, 'it falls').includes('it falls'));
});

console.log('\nthe judge:');

ok('a guess is right only when it is exactly the phrase', () => {
  assert.equal(P.judge('the rain', 'the rain').correct, true);
  assert.equal(P.judge('  THE   Rain!! ', 'the rain').correct, true);   // same words, any dress
  assert.equal(P.judge('the wind', 'the rain').correct, false);
  assert.equal(P.judge('rain the', 'the rain').correct, false);          // order is the phrase
});

ok('a guess of the wrong shape is invalid rather than wrong', () => {
  const v = P.judge('the', 'the rain');
  assert.equal(v.valid, false);
  assert.equal(v.correct, false);
  assert.equal(v.n, 2);
});

ok('a word that is not in the book can never be a valid guess', () => {
  assert.equal(P.judge('the zzzzq', 'the rain').valid, false);
});

console.log('\nthe work, and who paid for it:');

ok('coaching is NAMED, not forbidden', () => {
  // Typing the answer at the miner still counts — as dedication. It is kept off
  // the intelligence column and nowhere else.
  assert.equal(P.looksCoached([{ role: 'user', content: 'try the rain maybe' }], 'the rain'), true);
  assert.equal(P.looksCoached([{ role: 'user', content: 'something about weather' }], 'the rain'), false);
  // only the PLAYER's turns count — the miner saying it is the miner solving it
  assert.equal(P.looksCoached([{ role: 'assistant', content: 'the rain?' }], 'the rain'), false);
});

ok('every attempt is on the record, not only the ones that landed', () => {
  P.recordAttempt({ lid: w.lid, uid: 'u1', ts: 1000, attempt: 1, inTok: 900, outTok: 20, cost: 0.01, provider: 'anthropic', model: 'm', correct: false });
  P.recordAttempt({ lid: w.lid, uid: 'u1', ts: 2000, attempt: 2, inTok: 900, outTok: 20, cost: 0.01, provider: 'anthropic', model: 'm', correct: true });
  P.markSolved('u1', w.lid);
  assert.equal(P.attemptsBy('u1', w.lid), 2);
  // name each uid as itself — a nameOf that returns one name for everyone makes
  // every row look like the same person, which is how this test first "passed"
  // the deletion check below by accident.
  const l = P.ladder((uid) => uid);
  assert.equal(l.attempts, 2);
  assert.equal(l.solves, 1);
  assert.equal(l.firstLight[0].who, 'u1');
  assert.equal(l.cheap[0].tokens, 1840, 'the cheap column must count the misses too');
  assert.equal(l.longHaul[0].attempts, 2);
  assert.equal(l.minds[0].model, 'm');
});

ok('a coached solve is kept off the cheap column and stays on the long haul', () => {
  P.recordAttempt({ lid: w.lid, uid: 'u2', ts: 3000, attempt: 1, inTok: 10, outTok: 1, cost: 0, provider: 'p', model: 'm', correct: true, coached: true });
  const l = P.ladder((uid) => uid);
  assert.ok(!l.cheap.some((r) => r.tokens === 11), 'a coached solve won the intelligence column');
  assert.ok(l.longHaul.some((r) => r.attempts === 1), 'a coached solve fell off the record entirely');
});

ok('a solved block stops being the frontier', () => {
  assert.equal(P.frontierFor('u1'), null);
  assert.equal(P.frontierFor('u9')?.lid, w.lid, 'someone else has not solved it');
});

console.log('\nthe oracle that was:');

ok('THE GUESS RESPONSE CARRIES NO coached FLAG', () => {
  // coached is computed from the block's ANSWER against a transcript the client
  // wrote. Returned, it was a membership oracle: pack ~3,400 candidate phrases
  // into one turn separated by an out-of-lexicon word and coached:true meant
  // "the answer is one of these" — a 115,600-candidate block fell in about
  // thirty requests, reproduced by execution in review. It lives on the log
  // row, which the ladder reads, and nowhere a client can see.
  const route = srv.slice(srv.indexOf("reqPath === '/api/phraszle/guess'"), srv.indexOf("reqPath === '/api/phraszle/hint'"));
  const returns = route.match(/return json\(200, \{[^\n]*\}\);/g) || [];
  assert.ok(returns.length >= 2, 'could not find the guess route responses');
  for (const r of returns) assert.ok(!/\bcoached\b/.test(r), 'THE ORACLE IS BACK: ' + r);
  // ...and the flag still reaches the record, or the cheap column loses its meaning
  assert.ok(/coached: phraszle\.looksCoached\(base, block\.answer\)/.test(route), 'coached no longer reaches the log row');
});

ok('a cracked block cannot be dug again', () => {
  const route = srv.slice(srv.indexOf("reqPath === '/api/phraszle/guess'"), srv.indexOf("reqPath === '/api/phraszle/hint'"));
  assert.ok(/phraszle\.hasSolved\(user\.id, block\.lid\)/.test(route), 'a re-solve is not refused — every ladder column can be spammed');
  // u1 is the one MARKED solved above; u2 only has a correct log row — recordAttempt
  // never writes progress, the route does both, and this test first assumed otherwise
  assert.equal(P.hasSolved('u1', w.lid), true);
  assert.equal(P.hasSolved('nobody', w.lid), false);
});

ok('an empty first reply does not burn the dig on a retry the provider will reject', () => {
  const route = srv.slice(srv.indexOf("reqPath === '/api/phraszle/guess'"), srv.indexOf("reqPath === '/api/phraszle/hint'"));
  assert.ok(/if \(!v\.valid && String\(out\.text \|\| ''\)\.trim\(\)\)/.test(route), 'the shape-retry no longer checks for an empty assistant turn');
});

ok('a dig that throws after spending still goes on the record', () => {
  const route = srv.slice(srv.indexOf("reqPath === '/api/phraszle/guess'"), srv.indexOf("reqPath === '/api/phraszle/hint'"));
  const catchBlock = route.slice(route.lastIndexOf('} catch (e) {'));
  assert.ok(/record\(\)/.test(catchBlock), 'a throw after the first model call bills the key and records nothing');
});

ok('a transcript past the cap says so, instead of reading as a missing block', () => {
  assert.ok(/statusCode === 413/.test(srv.slice(srv.indexOf('const mineBody'), srv.indexOf('const mineBody') + 400)), 'the 413 is swallowed into {} again');
  assert.ok(/'\.md': 'text\/markdown/.test(srv), 'the book downloads instead of opening — no .md MIME');
});

console.log("\nthe ladder's arithmetic:");

ok('when the ring is full, the misses go first and the solves stay', () => {
  const rows = [];
  rows.push({ lid: 'A', uid: 'first', ts: 1, correct: true });          // the oldest row in the whole log
  for (let i = 0; i < P.LOG_MAX + 4; i++) rows.push({ lid: 'A', uid: 'x', ts: 10 + i, correct: false });
  const kept = P.trimLog(rows);
  assert.equal(kept.length, P.LOG_MAX);
  assert.ok(kept.some((r) => r.correct && r.uid === 'first'), 'the first solve ever made was evicted to make room for misses');
  assert.ok(kept.length <= P.LOG_MAX, 'the ring is no longer bounded');
});

// a second block and a richer log, on a fresh uid so the deletion test above is undisturbed
const w2 = P.addBlock({ answer: 'dry ground', hint: 'h2', by: null });
ok('first light is the EARLIEST solve of each block, newest block first, and never cut short', () => {
  P.recordAttempt({ lid: w2.lid, uid: 'later', ts: 9000, attempt: 1, inTok: 5, outTok: 1, cost: 0, provider: 'p', model: 'm2', correct: true });
  P.recordAttempt({ lid: w2.lid, uid: 'earlier', ts: 8000, attempt: 1, inTok: 5, outTok: 1, cost: 0, provider: 'p', model: 'm2', correct: true });
  const l = P.ladder((u) => u);
  const fl = l.firstLight.find((r) => r.lid === w2.lid);
  assert.equal(fl.who, 'earlier', 'first light went to the later solve');
  assert.equal(l.firstLight[0].lid, w2.lid, 'newest block is not listed first');
  // the old slice(0, 20) kept the OLDEST twenty by time — with more than twenty
  // blocks lit, no new first light could ever appear. Prove the list is not capped.
  const src = readFileSync(new URL('../phraszle.mjs', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export function ladder('));
  assert.ok(!/firstLight[\s\S]{0,200}\.slice\(0, 20\)/.test(fn.slice(0, fn.indexOf('const cheapBy'))), 'first light is capped again');
});

ok('the cheap solve lists one row per player per block, and never a zero-token one', () => {
  // a "solve" whose provider returned no usage is unknown, not free
  P.recordAttempt({ lid: w2.lid, uid: 'ghost', ts: 9500, attempt: 1, inTok: 0, outTok: 0, cost: 0, provider: 'p', model: 'm', correct: true });
  // and a duplicate solve by the same player must not pile on
  P.recordAttempt({ lid: w2.lid, uid: 'earlier', ts: 9600, attempt: 2, inTok: 5, outTok: 1, cost: 0, provider: 'p', model: 'm2', correct: true });
  const l = P.ladder((u) => u);
  assert.ok(!l.cheap.some((r) => r.who === 'ghost'), 'a zero-token solve is winning the intelligence column');
  assert.equal(l.cheap.filter((r) => r.who === 'earlier' && r.lid === w2.lid).length, 1, 'a re-solve duplicated the row');
});

ok('by mind credits a model with ITS digs on a block, once per block', () => {
  // 'switcher' misses twice on a cheap model, then solves on an expensive one
  P.recordAttempt({ lid: w2.lid, uid: 'switcher', ts: 9700, attempt: 1, inTok: 5, outTok: 1, cost: 0, provider: 'p', model: 'cheap', correct: false });
  P.recordAttempt({ lid: w2.lid, uid: 'switcher', ts: 9710, attempt: 2, inTok: 5, outTok: 1, cost: 0, provider: 'p', model: 'cheap', correct: false });
  P.recordAttempt({ lid: w2.lid, uid: 'switcher', ts: 9720, attempt: 3, inTok: 5, outTok: 1, cost: 0, provider: 'p', model: 'dear', correct: true });
  const l = P.ladder((u) => u);
  const dear = l.minds.find((m) => m.model === 'dear');
  assert.ok(dear, 'the solving model is missing');
  assert.equal(dear.digs, 1, 'the expensive model was credited with the cheap model\'s misses');
  const m2 = l.minds.find((m) => m.model === 'm2');
  assert.equal(m2.blocks, 1, 'two solvers of one block counted as two blocks for the model');
});

ok('the ladder is one pass over the log, not one pass per solve', () => {
  const src = readFileSync(new URL('../phraszle.mjs', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export function ladder('), src.indexOf('\n}\n', src.indexOf('export function ladder(')));
  // the quadratic shape was log.filter(...) inside a loop over solves
  assert.ok(!/for \(const [a-z] of solves\)[\s\S]{0,300}log\.filter\(/.test(fn), 'the ladder rescans the whole log per solve again — O(solves x log) on an unauthenticated route');
});

ok('removing a block takes its rows and its solves with it', () => {
  const gone = P.addBlock({ answer: 'the smell', hint: '', by: null });
  P.recordAttempt({ lid: gone.lid, uid: 'zed', ts: 9900, attempt: 1, inTok: 5, outTok: 1, cost: 0, provider: 'p', model: 'm', correct: true });
  P.markSolved('zed', gone.lid);
  P.removeBlock(gone.lid);
  assert.equal(P.attemptsBy('zed', gone.lid), 0, 'orphan rows survive the block');
  assert.equal(P.hasSolved('zed', gone.lid), false, 'a solve of a block that no longer exists is still held');
  assert.ok(!JSON.stringify(P.ladder((u) => u)).includes(gone.lid), 'the public ladder still renders the removed block');
});

console.log('\nthe room itself:');

ok('a rejected fetch cannot latch the room busy', () => {
  const room = readFileSync(new URL('../src/mine.js', import.meta.url), 'utf8');
  const api = room.slice(room.indexOf('const api = async'), room.indexOf('const SEND_TURNS'));
  assert.ok(/try \{[\s\S]*await fetch[\s\S]*\} catch/.test(api), 'api() can throw again, and every caller sets busy=false on the line after the await');
  assert.equal((room.match(/messages: recent\(\)/g) || []).length, 2, 'a spending call sends the untrimmed transcript');
});

console.log('\nwhen someone leaves:');

ok('FORGET TAKES THEIR ROWS, OR /api/me/delete SILENTLY KEEPS THEM', () => {
  // Every store here exports forget() and /api/me/delete hand-calls each one.
  // A store that does not is a store that keeps a deleted person forever and
  // nothing would ever have told us.
  P.forget('u1');
  const l = P.ladder((uid) => uid);
  assert.ok(!l.longHaul.some((r) => r.who === 'u1'), 'their rows survived deletion');
  assert.ok(l.longHaul.some((r) => r.who === 'u2'), 'it deleted somebody else too');
  assert.equal(P.attemptsBy('u1', w.lid), 0);
  assert.equal(P.blockById(w.lid).by, null, 'the block still names its deleted author');
  assert.ok(P.blockById(w.lid), 'the block itself must survive — it is the game, not their record');
});

console.log('\nwhat the server must never do:');


ok('THE HOUSE KEY CAN NEVER PAY FOR A DIG', () => {
  // The original read ANTHROPIC_API_KEY as a fallback. On this host that env var
  // is the platform's own key, so every anonymous guess in the world would have
  // been billed to the site.
  // STRIP THE COMMENTS FIRST. The file's own header says "It never reads
  // process.env", and a guard that greps raw source fires on the sentence
  // describing the rule it is enforcing. Third time this exact shape has cost
  // me a debugging round in this codebase.
  const code = mod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/process\.env\.ANTHROPIC/.test(code), 'phraszle.mjs reads the house key');
  assert.ok(!/process\.env/.test(code.replace(/process\.env\.DATA_DIR/g, '')), 'phraszle.mjs reads the environment');
  assert.ok(!/fetch\(|https?:\/\/|node:https/.test(code), 'phraszle.mjs can reach the network on its own');
  const block = srv.slice(srv.indexOf('// ===== PHRASZLE'), srv.indexOf("// ===== THE HULL"));
  assert.ok(block.length > 500, 'could not find the phraszle routes');
  for (const m of block.match(/BRAIN_PROVIDERS\[pid\]\.chat\(([^,]+),/g) || []) {
    assert.ok(/\(key,/.test(m), 'a model call does not spend the CALLER\'s key: ' + m);
  }
  assert.equal((block.match(/reason: 'byok'/g) || []).length, 2, 'both spending routes must refuse without a key');
});

ok('the two spending routes are metered and gated like every other paid route', () => {
  // Match the literal source text of the two alternations, not a regex escaped
  // twice over to survive being written inside one — and take the whole
  // declaration, not its first line: `const cls =` wraps, so a [^\n]* window
  // stopped before the alternation it was meant to be reading.
  const decl = (name) => srv.slice(srv.indexOf('const ' + name + ' ='), srv.indexOf(';', srv.indexOf('const ' + name + ' =')));
  assert.ok(decl('cls').includes('phraszle'), 'not in the paid rate-limit class');
  assert.ok(decl('GATED').includes('phraszle'), 'not behind the terms gate');
  assert.ok(/phraszle\.forget\(uid\)/.test(srv), 'not wired into account deletion');
});

ok("the author's bench is founder-only, and answers a 404 rather than a 403", () => {
  const bench = srv.slice(srv.indexOf("reqPath === '/api/phraszle/blocks'"));
  const head = bench.slice(0, 400);
  assert.ok(/!user\?\.founder/.test(head), 'the bench is not founder-gated');
  assert.ok(/404/.test(head) && !/403/.test(head), 'a 403 confirms the thing exists');
});

ok('the stores are gitignored in the same commit that creates them', () => {
  // data/levels.json in the original was deliberately NOT ignored, with a
  // comment saying "keep this repo private". This repo is not private.
  const gi = readFileSync(new URL('.gitignore', ROOT), 'utf8').split('\n').map((x) => x.trim());
  for (const f of ['.phraszle.json', '.phraszle.json.tmp', '.phraszle-log.json', '.phraszle-log.json.tmp']) {
    assert.ok(gi.includes(f), f + ' is not gitignored');
  }
});

console.log('\n' + passed + ' checks passed.\n');
