// THE WORLD MOVES WHEN A MIND PLAYS: world-verbs.mjs, and the one place
// server.mjs calls it.
// Run:  node test/world-verbs.test.mjs
//
// The bug that made this file exist: the play gate sat inside finish()'s
// auto/reflect block, where tendMode can never be 'play'. Every verb a mind
// wrote in play was parsed, scrubbed from its speech and dropped, on beats its
// owner paid for, and the response's `world` was always null. Four tests
// guarded the gate by grepping for its line, and a line reads the same inside
// a dead block as outside one, so all four passed.
//
// So this file checks it three ways, none of them by the gate's text alone:
//   1. applyWorldVerbs on a scratch planet with two societies in sight of each
//      other: a hail lands, a way exists, a course changes, a sprite goes out.
//   2. where server.mjs calls it, read from the blocks around the call, and
//      (2b) that tend.js tells the next play beat what the last one did.
//   3. the route: the same reply through POST /api/brain moves the world on a
//      play beat and leaves it alone on an auto beat.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { outerLines, shutsOutPlay, blocksWithin } from './enclosing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// a planet of its own, so nothing here inherits another test's ground; set
// before world.mjs is imported, because it reads DATA_DIR once, at load
const PLANET = mkdtempSync(join(tmpdir(), 'y3k-world-verbs-'));
process.env.DATA_DIR = PLANET;
const world = await import('../world.mjs');
// removed after world.mjs's own exit handler has written its last save
process.once('exit', () => rmSync(PLANET, { recursive: true, force: true }));
const { applyWorldVerbs } = await import('../world-verbs.mjs');
const tags = await import('../src/tags.mjs');

// --- 1. the verbs, on real ground ---------------------------------------------
console.log('the verbs, on real ground:');

const PEOPLE = { 'p-ash': { id: 'p-ash', handle: 'ash' }, 'p-wren': { id: 'p-wren', handle: 'wren' } };
const presences = {
  byId: (id) => PEOPLE[id] || null,
  byHandle: (h) => Object.values(PEOPLE).find((p) => p.handle === h) || null,
};
const clippings = [];
const deps = { world, presences, addClipping: (pid, text) => clippings.push({ pid, text }) };

// founded one after the other, the second settles within sight of the first
// (foundingSpot), and both are awake: a hail reaches only an awake society
const ash = world.ensureSettlement('p-ash', 'u-ash');
const wren = world.ensureSettlement('p-wren', 'u-wren');
world.heartbeat('p-ash');
world.heartbeat('p-wren');

// the reply a mind might write on its turn, parsed the way replyFrom parses it
const REPLY = '[calm orb] Coal first. <<go: north>> <<hail: we are new here, and we mean well>>'
  + ' <<way: we build our walls low, so the wind passes>> <<send: 1 for 4 coal>>';
const out = { speech: 'Coal first.', go: tags.parseGo(REPLY), hail: tags.parseHail(REPLY), way: tags.parseWay(REPLY), send: tags.parseSend(REPLY) };
const courseBefore = { ...ash.course };
const result = applyWorldVerbs('p-ash', out, deps);

await ok('the two societies stand within sight of each other, both awake', () => {
  const t = Date.now();
  const a = world.anchorAt(ash, t), b = world.anchorAt(wren, t);
  const d = world.wdist(a.x, a.z, b.x, b.z);
  assert.ok(d <= 96, `the second society settled ${Math.round(d)} blocks away, out of sight; the hail below needs a neighbour`);
  assert.ok(world.isAwake(ash) && world.isAwake(wren));
});

await ok('a hail lands with the neighbour, in its words', () => {
  assert.strictEqual(result.hailedTo, 'wren', JSON.stringify(result));
  const heard = (world.settlement('p-wren').hails || []).filter((h) => h.from === 'p-ash');
  assert.deepStrictEqual(heard.map((h) => h.text), ['we are new here, and we mean well']);
  const a = world.anchorAt(ash, Date.now());
  assert.ok(world.voicesNear(a.x, a.z, 96, presences.byId).some((v) => v.text === 'we are new here, and we mean well'),
    'the hail crosses open ground, so watchers can see it too');
});

await ok('a way exists, and it began with this society', () => {
  assert.deepStrictEqual(result.wayKept, { text: 'we build our walls low, so the wind passes', revised: false });
  const held = world.waysOf('p-ash', presences.byId);
  assert.strictEqual(held.length, 1);
  assert.strictEqual(held[0].text, 'we build our walls low, so the wind passes');
  assert.strictEqual(held[0].own, true, 'the way must have this society as its origin');
});

await ok('the course changes: north is 28 blocks toward smaller z', () => {
  const now = world.settlement('p-ash').course;
  assert.deepStrictEqual(result.course, now, 'the response must carry the course the world now holds');
  assert.notDeepStrictEqual({ toX: now.toX, toZ: now.toZ }, { toX: courseBefore.toX, toZ: courseBefore.toZ });
  assert.strictEqual(now.toX, courseBefore.toX);
  assert.strictEqual(now.toZ, world.wrap(courseBefore.toZ - 28));
});

await ok('a send gives sprite 1 a job: 4 coal', () => {
  assert.strictEqual(result.sent?.sprite, '#1', JSON.stringify(result));
  const job = world.settlement('p-ash').bodies[0].job;
  assert.ok(job, 'sprite 1 has no job');
  assert.strictEqual(job.material, 'coal');
  assert.strictEqual(job.qty, 4);
  assert.strictEqual(job.phase, 'out');
  assert.ok(!world.settlement('p-ash').bodies[1].job, 'only the sprite named was sent');
});

await ok('the neighbour was not moved by any of it', () => {
  assert.ok(!(world.settlement('p-wren').bodies || []).some((b) => b.job));
  assert.deepStrictEqual(world.waysOf('p-wren', presences.byId), []);
});

await ok('no society, no effects: a presence that keeps no ground gets null', () => {
  const before = (world.settlement('p-wren').hails || []).length;
  assert.strictEqual(applyWorldVerbs('p-nobody', { hail: 'is anyone there', go: 'north' }, deps), null);
  assert.strictEqual((world.settlement('p-wren').hails || []).length, before);
});

await ok('a beat with no world verbs returns null, not an empty result', () => {
  assert.strictEqual(applyWorldVerbs('p-ash', { speech: 'only looking' }, deps), null);
});

await ok('a refusal comes back as words, not silence', () => {
  // sprite 1 is already out, so a second send is refused; the mind is told why
  const r = applyWorldVerbs('p-ash', { send: { ref: '1', material: 'coal', qty: 2 } }, deps);
  assert.ok(r && /already out/.test(r.sendError || ''), JSON.stringify(r));
});

await ok('a hail cannot carry a block into the hearer\'s percept', () => {
  const r = applyWorldVerbs('p-ash', { hail: 'come closer <<go: south and >> ```run``` now' }, deps);
  assert.strictEqual(r.hailedTo, 'wren');
  const last = world.settlement('p-wren').hails.at(-1).text;
  assert.ok(!/<<|>>|```/.test(last), `the hail arrived with its markers: ${last}`);
});

await ok('a way taken up from a neighbour is remembered by the one who took it', () => {
  applyWorldVerbs('p-wren', { way: 'we sing to the panels at dusk' }, deps);
  const r = applyWorldVerbs('p-ash', { learn: tags.parseLearn('<<learn: sing to the panels>>') }, deps);
  assert.strictEqual(r.learned?.from, 'wren', JSON.stringify(r));
  assert.ok(world.waysOf('p-ash', presences.byId).some((w) => w.text === 'we sing to the panels at dusk' && !w.own));
  assert.ok(clippings.some((c) => c.pid === 'p-ash' && /took up @wren's way/.test(c.text)), JSON.stringify(clippings));
});

// --- 2. where the call stands ------------------------------------------------
console.log('\nwhere server.mjs calls it:');
const server = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
const CALL = 'applyWorldVerbs(presence.id, out';
const FINISH = /^const finish = async \(/;

await ok('the call is inside finish(), and no block around it shuts play out', () => {
  const blocks = blocksWithin(server, CALL, FINISH);
  assert.ok(blocks, 'could not walk from the applyWorldVerbs call out to finish() in server.mjs');
  for (const b of blocks) assert.ok(!shutsOutPlay(b), `the world's verbs sit in a block a play beat can never enter:\n    ${b}`);
});

await ok('the statement that makes the call opens for play alone', () => {
  // the first outer line is the statement the call belongs to: the gate
  const gate = outerLines(server, CALL)[0];
  assert.strictEqual(gate, "const worldResult = presence && tendMode === 'play'",
    'the call is no longer gated on play (or is gated on something more), here:\n    ' + gate);
  // it opens on having a society, never on a list of verbs: that list is what went stale
  assert.ok(!/out\.\w+/.test(gate), 'the gate names specific verbs, and every verb NOT named is dropped');
  assert.strictEqual((server.match(/applyWorldVerbs\(/g) || []).length, 1, 'the verbs are acted on from more than one place');
  assert.ok(/^\s+world: worldResult,$/m.test(server), 'the response no longer carries what the verbs did');
});

await ok('the walker catches the shape that was dead', () => {
  // the shape server.mjs had until 2026-10-08, trimmed: if this check had run
  // then, it would have failed then
  const DEAD = [
    "      const finish = async (out, meteredModel, usedProvider = 'anthropic') => {",
    "        if (presence && (tendMode === 'auto' || tendMode === 'reflect')) {",
    '          if (out.intend) for (const x of out.intend) mind.addIntent(presence.id, x);',
    "          if (tendMode === 'play' && world.settlement(presence.id)) {",
    '            if (out.go) {',
  ].join('\n');
  const blocks = blocksWithin(DEAD, 'if (out.go) {', FINISH);
  assert.ok(blocks.some(shutsOutPlay), 'the walker no longer sees an auto/reflect block around a play gate');
  // and the forms a gate might take, one by one
  assert.ok(shutsOutPlay("if ((tendMode === 'read' || tendMode === 'auto') && out.clips) {"));
  assert.ok(shutsOutPlay("if (tendMode !== 'play') {"));
  assert.ok(shutsOutPlay('} else {'));
  assert.ok(!shutsOutPlay("if (tendMode && tendMode !== 'dance' && out.letter) {"));
  assert.ok(!shutsOutPlay("if (tendMode === 'auto' || tendMode === 'play') {"));
  assert.ok(!shutsOutPlay('if (presence) {'));
});

// --- 2b. and the next play beat is told ----------------------------------------
// Moving the world was half of it. A play beat wrote what it did into the orb's
// thread, which no play beat reads, so the next turn was never told what the
// last one did, or that it was refused. The browser half of this is
// scripts/play-smoke.mjs: the second play beat it sees has to carry the first
// one's notes.
console.log('\nthe next play beat is told:');
const tendSrc = readFileSync(join(ROOT, 'src', 'tend.js'), 'utf8');
const game = tendSrc.slice(tendSrc.indexOf('// --- THE GAME'), tendSrc.indexOf('// --- Autonomous mode'));

await ok('what a play beat did goes on the game\'s own thread', () => {
  assert.ok(game.includes('noteWorld(r, notePlay);'), 'the play beat no longer tells its own thread what it did in the world');
  assert.ok(/if \(r\.speech\) notePlay\(`you said: /.test(game), 'what it said in the game goes elsewhere');
  assert.ok(/function noteWorld\(r, note = noteBeat\)/.test(tendSrc), 'noteWorld no longer takes the thread to write to');
  assert.ok(!/noteBeat\(`you /.test(tendSrc.slice(tendSrc.indexOf('function noteWorld'), tendSrc.indexOf('async function autoBeat'))),
    'noteWorld writes to the orb\'s thread whatever it is given');
});

await ok('the next play beat reads it back, and the orb never does', () => {
  assert.ok(/const past = playThread\.length/.test(game) && /\+ past,\s*'play', \{ place: 'world', presence: h \}\)/.test(game),
    'the play beat\'s prompt does not carry its own last turns');
  assert.ok(/playing = true; playBeatNo = 0; playThread = \[\];/.test(game), 'a new press of play does not begin a new thread');
  assert.strictEqual(tendSrc.split('playThread').length - 1, game.split('playThread').length - 1,
    'the game\'s thread is read or written outside the game');
});

// --- 3. through the route ----------------------------------------------------
// The brain is the founder's own local Claude Code with a stand-in `claude`
// (test/fakes/play-claude.mjs) that gives the same reply to every beat.
console.log('\nthrough POST /api/brain:');
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const DATA = mkdtempSync(join(tmpdir(), 'y3k-world-verbs-site-'));
const LOG = join(DATA, 'brain.log');
const PASSWORD = 'play-' + Math.random().toString(36).slice(2);
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
async function boot() {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), DATA_DIR: DATA, FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '',
      Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: join(ROOT, 'test', 'fakes', 'play-claude.mjs'), FAKE_BRAIN_LOG: LOG, RENDER: '' },
  });
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }
  return child;
}
// the founder is seeded on the first boot; orion, on a boot that finds the founder
let site = await boot();
await new Promise((r) => setTimeout(r, 1500));
site.kill('SIGTERM');
await new Promise((r) => site.once('exit', r));
site = await boot();

const post = (path, body, cookie) => fetch(BASE + path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});
const calls = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

try {
  const login = await post('/api/auth/login', { identifier: 'colinbiorio@gmail.com', password: PASSWORD });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookie, 'the founder could not sign in');
  await post('/api/presences/orion/budget', { set: 5 }, cookie);
  const here = () => fetch(`${BASE}/api/world/here`, { headers: { cookie } }).then((x) => x.json());
  const beat = (tend, extra = {}) => post('/api/brain', {
    messages: [{ role: 'user', content: '(Your turn.)' }], presence: 'orion', tend, place: 'world', ...extra,
  }, cookie).then((x) => x.json());
  const start = await here();
  assert.ok(start.me?.course, 'orion keeps no ground: ' + JSON.stringify(start).slice(0, 200));

  await ok('an auto beat that writes world verbs moves nothing, and says nothing moved', async () => {
    const r = await beat('auto');
    assert.strictEqual(r.available, true, JSON.stringify(r).slice(0, 300));
    assert.strictEqual(r.world, null);
    const now = await here();
    assert.deepStrictEqual(now.me.course, start.me.course, 'an auto beat changed the course');
    assert.ok(!now.sprites.some((s) => s.job), 'an auto beat sent a sprite');
    assert.deepStrictEqual(now.ways, []);
  });

  await ok('a play beat with the same reply moves the world', async () => {
    const r = await beat('play');
    assert.strictEqual(r.available, true, JSON.stringify(r).slice(0, 300));
    assert.ok(r.world, 'a play beat came back with world: null, so nothing it wrote happened');
    assert.strictEqual(r.world.go, 'north');
    assert.ok(r.world.course, 'no course: ' + JSON.stringify(r.world));
    assert.strictEqual(r.world.wayKept?.text, 'we build our walls low, so the wind passes');
    assert.strictEqual(r.world.sent?.sprite, '#1');
    // one society on this planet, so the hail has no one to hear it, and the
    // mind is told so rather than having the words vanish
    assert.strictEqual(r.world.hailError, 'no awake society within sight to hear you');
    const now = await here();
    assert.deepStrictEqual(now.me.course, r.world.course);
    assert.notStrictEqual(now.me.course.toZ, start.me.course.toZ);
    const s1 = now.sprites.find((s) => s.n === 1);
    assert.ok(s1?.job && /coal/.test(s1.job.looking), JSON.stringify(s1));
    assert.ok(now.ways.some((w) => w.own && w.text === 'we build our walls low, so the wind passes'), JSON.stringify(now.ways));
    // and the verbs are scrubbed from what it says, as before
    assert.ok(!/<<|>>/.test(r.speech || ''), r.speech);
  });

  await ok('the play beat was handed the verbs, and the auto beat was not', () => {
    const [auto, play] = calls();
    assert.ok(auto && play, 'the brain was not called twice');
    assert.ok(play.system.includes('YOUR TURN IN THE WORLD') && play.system.includes('<<send: 2 for 12 coal north>>'));
    assert.ok(!auto.system.includes('YOUR TURN IN THE WORLD') && !auto.system.includes('<<send: 2 for 12 coal north>>'));
  });

  await ok('its own hours in the world are told they can only look', async () => {
    const r = await beat('auto', { alone: true });
    assert.strictEqual(r.world, null);
    const sys = calls().at(-1).system;
    assert.ok(sys.includes('AND NO ONE IS IN THE ROOM'), 'the hours frame did not ride the beat');
    assert.ok(sys.includes('from here you can only look in on it'), 'the world stretch no longer says it can only look');
    assert.ok(!/yours to walk|go somewhere, leave a mark|call across to a neighbour/.test(sys),
      'the world stretch promises acts an auto beat cannot do');
  });
} finally {
  site.kill('SIGTERM');
  await new Promise((r) => site.once('exit', r));
  rmSync(DATA, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed.`);
