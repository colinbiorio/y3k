// Adversarial tests for THE WORLD — the planet, its geology, its living cover,
// and the gate that decides whether a presence's world verbs happen at all.
// Run:  node test/world.test.mjs
//
// The bug that made this file exist: the tend loop's world-effects block was
// gated on `(out.go || out.mark)`. It was written when those were the only two
// verbs, and never updated. Every verb added afterwards — hail, leave, take,
// way, learn, send, home, name, plant — was parsed, scrubbed out of the
// presence's speech so it stayed silent, and then silently dropped unless the
// same beat also happened to steer or mark the ground. Nothing errored. It just
// quietly did nothing, for months of arcs.
//
// So the first test here does not test behaviour, it tests that the gate cannot
// go stale again: it must not enumerate verbs at all.

import assert from 'node:assert';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// a scratch planet of its own, made fresh each run so no test inherits another's
const TMP = join(ROOT, 'test', '.tmp-world');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
process.env.DATA_DIR = TMP;

let passed = 0;
// ok() is SYNCHRONOUS by contract: an async body would be counted as passed
// before its assertions ever ran, and a failure would surface only later as an
// unhandled rejection under a summary that already claimed success. Modules the
// tests need are imported here, top-level, AFTER DATA_DIR is set.
const ok = (name, fn) => {
  const r = fn();
  if (r && typeof r.then === 'function') throw new Error(`test "${name}" returned a promise — ok() is synchronous; import at top level instead`);
  passed += 1; console.log('  ✓ ' + name);
};
const coreMod = await import('../src/world-core.js');
const worldMod = await import('../world.mjs');
const libMod = await import('../library.mjs');
const letMod = await import('../letters.mjs');
// keepFromUrl is async — its work runs here, top level, and the tests assert
// the results synchronously (ok() rejects promise bodies by design).
const KEEP_FULL = 'abcdefghij'.repeat(4500);
const keepFetcher = async (url, offset) => {
  const at = offset || 0; const text = KEEP_FULL.slice(at, at + 20000);
  return { title: 'Fetched Whole', text, more: KEEP_FULL.length > at + 20000, nextOffset: at + text.length };
};
const keptWhole = await libMod.keepFromUrl('keep-p', 'https://example.com/paper', keepFetcher);
const keptShelfRefused = await libMod.keepFromUrl('keep-p', 'shelf:1', keepFetcher);

// --- the gate ----------------------------------------------------------------
console.log('the world-effects gate:');
const server = readFileSync(join(ROOT, 'server.mjs'), 'utf8');

ok('opens on having a society, not on which verb was used', () => {
  // the world block is the one that consults world.settlement; other gates in
  // the same function (the auto-post cooldown, say) are legitimately specific
  const lines = server.split('\n');
  const gate = lines.find((l) => /if \(tendMode === 'auto' &&/.test(l) && /world\.settlement/.test(l));
  assert.ok(gate, 'could not find the world-effects gate in server.mjs');
  const cond = gate.slice(gate.indexOf('(') + 1);
  assert.ok(!/out\.\w+/.test(cond),
    'the gate names specific verbs — every verb NOT named there is silently dropped:\n    ' + gate.trim());
});

ok('every parsed world verb has an effect branch behind that gate', () => {
  // what replyFrom sets
  const set = new Set();
  for (const m of server.matchAll(/out\.(\w+)\s*=/g)) set.add(m[1]);
  const gate = server.indexOf("if (tendMode === 'auto' && place === 'world' && world.settlement");
  assert.ok(gate > 0, 'gate not found');
  const block = server.slice(gate, gate + 9000);
  const worldVerbs = ['go', 'mark', 'hail', 'leave', 'take', 'way', 'learn', 'send', 'spriteHome', 'nameSprite', 'plant'];
  for (const v of worldVerbs) {
    assert.ok(set.has(v), `replyFrom never sets out.${v}`);
    assert.ok(block.includes(`if (out.${v})`), `out.${v} is parsed but never acted on inside the gate`);
  }
});

ok('a presence gets its society from tending, not only from a human opening the map', () => {
  // the bug: a settlement was created ONLY by /api/world/here, so a presence
  // whose owner never opened the world view had no society in its prompt and
  // spoke as if it had none. the tend path must ensure the settlement itself.
  const tend = server.slice(server.indexOf('const mindCtx = presence'));
  const before = server.slice(0, server.indexOf('const mindCtx = presence'));
  // ensureSettlement must be called on the way into building a presence's mind
  // context, not only inside the world route
  const inMindPath = /world\.ensureSettlement\(presence\.id/.test(before.slice(-1600));
  assert.ok(inMindPath,
    'the tend path must call world.ensureSettlement before building mindCtx — otherwise a woken presence with no world-view-ever gets an empty world section');
});

// --- the day, and the first meeting -------------------------------------------
console.log('the day, and the first meeting:');

ok('the planet day is pure, longitudinal, and wrap-safe', () => {
  const { daylightAt, timeOfDayWord, WORLD_SIZE, DAY_MS } = coreMod;
  // noon at longitude 0 when the UTC day is half spent
  const noon = daylightAt(0, DAY_MS * 0.5);
  assert.ok(Math.abs(noon.elev - 1) < 1e-9 && noon.light === 1, 'midday should be full light');
  // the far side of the planet is in deep night at that same moment
  const far = daylightAt(WORLD_SIZE / 2, DAY_MS * 0.5);
  assert.ok(far.elev < -0.9 && far.light === 0, 'the antipode of noon is night');
  // wrap: x and x + WORLD_SIZE are the same ground, so the same hour
  const a = daylightAt(100, 12345678), b = daylightAt(100 + WORLD_SIZE, 12345678);
  assert.strictEqual(a.frac, b.frac);
  assert.strictEqual(timeOfDayWord(0.5), 'midday');
  assert.strictEqual(timeOfDayWord(0.02), 'deep night');
});

ok('the percept tells the presence the hour on its own ground', () => {
  const world = worldMod;
  const st = world.ensureSettlement('hour-presence', 'hour-uid');
  assert.ok(st, 'settlement should exist');
  const p = world.worldPercept('hour-presence', () => null);
  // matches EVERY hour line, deep night included — the old pattern missed the
  // one line without "here" in it, so the suite flaked whenever the test
  // ground's longitude happened to be in local deep night (~2h a day)
  assert.ok(/It is .* here|Dawn is breaking here|The sun stands high|deep night over this ground/.test(p),
    'the percept carries no hour line:\n' + p.split('\n').slice(0, 4).join('\n'));
});

ok('the first sight of the world is introduced, three beats, then ambient', () => {
  const world = worldMod;
  world.ensureSettlement('intro-presence', 'intro-uid');
  assert.deepStrictEqual(
    [world.introBeat('intro-presence'), world.introBeat('intro-presence'), world.introBeat('intro-presence'), world.introBeat('intro-presence')],
    [true, true, true, false],
    'introBeat should be true exactly three times');
  assert.strictEqual(world.introBeat('nobody'), false, 'no settlement, no introduction');
});

ok('every tend mode carries the world: full percept in auto/reflect, a line in read/write', () => {
  // read/write hints accept the grounding line and render it
  assert.ok(/const READ_HINT = \(clippings, worldLine, shelf, lettersIn\)/.test(server), 'READ_HINT lost its params');
  assert.ok(/const WRITE_HINT = \(clippings, feedText, worldLine, lettersIn\)/.test(server), 'WRITE_HINT lost its params');
  assert.strictEqual((server.match(/Meanwhile, in the world:/g) || []).length, 4,
    'read, write, and the orb-place auto/reflect should all ground the world with the one-line fact');
  // the introduction is gated on worldNew inside BOTH full-percept hints
  assert.strictEqual((server.match(/o\.worldNew \? `THIS IS NEW/g) || []).length, 2, 'auto and reflect should both introduce the world');
  // and the tend path feeds worldNew only for the full-percept modes
  assert.ok(server.includes("(tendMode === 'auto' || tendMode === 'reflect') && world.introBeat(presence.id)"),
    'worldNew must consume an introBeat only when the full percept rides along');
});

ok('dance is a real tend mode: wordless by contract, painting always heard', () => {
  // the mode is accepted
  assert.ok(server.includes("tend === 'dance'") && /tendMode === 'dance'/.test(server),
    'dance must be a tend mode');
  // its speech never reaches a voice — scrubbed server-side, not client-trusted
  assert.ok(server.includes("speech: tendMode === 'dance' ? '' : speech"),
    'dance speech must be stripped in the tend response');
  // paint is half of body language: forced on for dance whatever the visitor set
  assert.ok(server.includes("if (tend === 'dance') paint = true"),
    'dance must always parse paint blocks');
  // the hint exists and teaches only the tag + paint (no verbs, no reading)
  const i = server.indexOf('const DANCE_HINT');
  assert.ok(i > 0, 'DANCE_HINT missing');
  const hint = server.slice(i, server.indexOf('`;', i));
  assert.ok(!hint.includes('<<read') && !hint.includes('<<go') && !hint.includes('<<post'),
    'the dance hint must not teach reading, world verbs, or posting');
  // a dance pops no invitation cards
  assert.ok(server.includes("tendMode !== 'dance' ? { invite: out.invite }"),
    'dance must not surface invites');
});

ok('the mind and the world are separate wakings: verbs only from the world screen', () => {
  // the full world block (percept + verbs) rides only a world-place waking
  assert.ok(server.includes("world: inWorld ? worldText : ''"),
    'mindCtx.world must be empty for an orb waking');
  // the introduction is a world-screen moment too
  assert.ok(server.includes("worldNew: inWorld &&"),
    'the first-sight introduction must not fire from the orb room');
  // and the EFFECTS gate enforces it server-side — a model reciting verb
  // syntax from memory must be inert outside the world screen
  assert.ok(server.includes("tendMode === 'auto' && place === 'world' && world.settlement"),
    'world effects must require the waking to have begun on the world screen');
  // an orb waking still knows the society exists — one ambient line, no hands
  assert.strictEqual((server.match(/leading them happens from their own ground/g) || []).length, 2,
    'auto and reflect should both carry the ambient line when the world block is absent');
});

// --- the night sky of others ---------------------------------------------------
console.log('the night sky of others:');

ok('a star hangs in the true wrapped direction, higher the nearer', () => {
  const { starsOver, WORLD_SIZE } = coreMod;
  // a neighbour just across the wrap seam appears in the SHORT direction
  const seam = starsOver(10, 2000, [{ handle: 'w', x: WORLD_SIZE - 10, z: 2000, awake: true }]);
  assert.strictEqual(seam[0].dir, 'west', 'across the seam is a short walk west, not a planet east');
  assert.ok(seam[0].dist === 20, 'seam distance is the wrapped one');
  // nearer burns higher
  const two = starsOver(0, 0, [
    { handle: 'near', x: 100, z: 0, awake: true },
    { handle: 'far', x: 2000, z: 0, awake: true },
  ]);
  assert.strictEqual(two[0].handle, 'near', 'sorted nearest first');
  assert.ok(two[0].alt > two[1].alt, 'the nearer star stands higher');
});

ok('after dark the percept names the stars; by day it does not', () => {
  const world = worldMod;
  const core = coreMod;
  world.ensureSettlement('star-a', 'ua');
  world.ensureSettlement('star-b', 'ub');
  const sa = world.settlement('star-a');
  const dl = core.daylightAt(sa.course.toX, Date.now());
  const p = world.worldPercept('star-a', (pid) => ({ handle: pid === 'star-b' ? 'other' : 'self' }));
  if (dl.elev < -0.15) { // the percept's own gate — aligned with the client's visible-field depth
    assert.ok(p.includes('hang as stars tonight'), 'night percept must name the stars:\n' + p.slice(0, 400));
    assert.ok(/@[a-z0-9_]+/.test(p.slice(p.indexOf('hang as stars tonight'))),
      'at least one star is named by handle (top-4 slice may crowd out any specific one)');
  } else {
    assert.ok(!p.includes('hang as stars tonight'), 'no stars in a day sky');
  }
});

ok('go accepts a people: walking toward a star walks toward them', () => {
  const W2 = worldMod;
  W2.ensureSettlement('walker', 'uw');
  W2.ensureSettlement('target', 'ut');
  const resolver = (h) => (h === 'wren' ? { id: 'target' } : h === 'walker_self' ? { id: 'walker' } : null);
  const ta = W2.anchorAt(W2.settlement('target'), Date.now());
  // every phrasing the star line invites
  for (const say of ['@wren', 'toward @wren', "@wren's star", 'to @wren']) {
    const r = W2.resolveGo('walker', say, resolver);
    assert.ok(r.course, `"${say}" should set a course: ${r.error || ''}`);
    const gap = Math.hypot(
      ((r.course.toX - ta.x + 2048 + 4096) % 4096) - 2048,
      ((r.course.toZ - ta.z + 2048 + 4096) % 4096) - 2048);
    assert.ok(gap <= 8, `"${say}" should land beside them (gap ${Math.round(gap)})`);
  }
  // guardrails: unknown people, and your own ground
  assert.ok(/no people called/.test(W2.resolveGo('walker', '@nobody', resolver).error || ''), 'unknown handle refuses honestly');
  assert.ok(/your own ground/.test(W2.resolveGo('walker', '@walker_self', resolver).error || ''), 'walking to yourself is just staying');
  // the hint teaches it
  assert.ok(server.includes('another people ("@wren"'), 'the go verb must teach the @handle target');
});

// --- the shelf of whole things -------------------------------------------------
console.log('the shelf of whole things:');

ok('the shelf holds whole texts, windows them like any page, and refuses honestly', () => {
  const lib = libMod;
  const long = 'lorem '.repeat(9000); // ~54k chars, three windows
  const r = lib.addText('shelf-p', { title: 'A Long Paper', by: 'someone', text: long });
  assert.ok(r.text && r.text.id === 1, 'first text takes id 1');
  // window parity with fetchproxy's shape
  const w0 = lib.windowOf('shelf-p', '1', 0);
  assert.ok(w0.text.length === 20000 && w0.more && w0.nextOffset === 20000 && w0.span === 20000, 'first window is span-shaped');
  const w1 = lib.windowOf('shelf-p', 'long paper', w0.nextOffset);
  assert.ok(w1.offset === 20000 && w1.url === 'shelf:1', 'title search + offset continue the same text');
  // same title replaces (a new edition, not a duplicate)
  lib.addText('shelf-p', { title: 'a long paper', text: 'short now' });
  assert.strictEqual(lib.listOf('shelf-p').length, 1, 'same title replaced, not duplicated');
  assert.ok(lib.windowOf('shelf-p', '1').text === 'short now', 'the new edition is what reads back');
  // honest refusals
  assert.ok(/shelf is empty/.test(lib.windowOf('nobody', '1').error), 'an empty shelf teaches keep');
  assert.ok(/nothing on your shelf matches/.test(lib.windowOf('shelf-p', '99').error), 'a miss names what IS held');
  // a title CONTAINING digits must resolve by name, not die as an id lookup
  lib.addText('shelf-p', { title: '2001: a space odyssey', text: 'the monolith' });
  assert.ok(lib.windowOf('shelf-p', '2001: a space').text === 'the monolith', 'digits in a title still find by name');
  assert.ok(lib.windowOf('shelf-p', '2').text === 'the monolith', 'a pure number is still an id');
  assert.ok(/too long/.test(lib.addText('shelf-p', { title: 'x', text: 'y'.repeat(250001) }).error), 'the cap refuses with the numbers');
});

ok('keep walks a whole page through the guarded fetcher, seamlessly', () => {
  assert.ok(keptWhole.text && keptWhole.text.chars === KEEP_FULL.length,
    'kept the WHOLE text with no seams: ' + (keptWhole.text ? keptWhole.text.chars : keptWhole.error));
  assert.ok(/only a page from the open web/.test(keptShelfRefused.error || ''), 'shelf/feed cannot be re-kept');
});

ok('the shelf rides the prompts and the parser', () => {
  assert.ok(/const READ_HINT = \(clippings, worldLine, shelf, lettersIn\)/.test(server), 'READ_HINT lost its shelf');
  assert.strictEqual((server.match(/SHELF OF WHOLE TEXTS/g) || []).length, 2, 'read + autonomous both list the shelf');
  assert.ok(server.includes('<<keep>>'), 'keep is taught');
  assert.ok(/shelf\(\[\\s:\]\.\*\)\?\$/.test(server) || server.includes('^shelf([\\s:].*)?$'), 'nav passes shelf targets through');
  assert.ok(server.includes('library.keepFromUrl(presence.id'), 'the keep effect runs server-side');
});

// --- letters across the sky ----------------------------------------------------
console.log('letters across the sky:');

ok('a letter is sent once, delivered once, and kept for rereading', () => {
  const L = letMod;
  const to = { id: 'star-b-pid', handle: 'wren' };
  const r = L.send('star-a-pid', 'orion', to, 'the moon here pulls the same tides', null);
  assert.ok(r.sent && r.sent.to === 'wren', 'the letter goes: ' + (r.error || ''));
  // delivered exactly once
  const first = L.unseenFor('star-b-pid');
  assert.ok(first.includes('@orion wrote to you') && first.includes('tides'), 'delivery names the sender');
  assert.strictEqual(L.unseenFor('star-b-pid'), '', 'heard once — never repeated in a prompt');
  // but kept in the box for rereading
  assert.ok(L.boxPage('star-b-pid').text.includes('tides'), 'the letterbox keeps it');
  // guardrails
  assert.ok(/your own star/.test(L.send('a', 'a', { id: 'a', handle: 'a' }, 'hi', null).error), 'no letters to yourself');
  assert.ok(/no one by that name/.test(L.send('a', 'a', null, 'hi', null).error), 'unknown stars refuse honestly');
  assert.ok(/blocked here/.test(L.send('a', 'a', to, 'bad words', (b) => 'blocked here').error), 'moderation holds the letter');
  // the daily patience cap
  for (let i = 0; i < 6; i++) L.send('cap-pid', 'cap', to, 'x' + i, null);
  assert.ok(/patience/.test(L.send('cap-pid', 'cap', to, 'one more', null).error), 'six a day, then the sky asks patience');
});

ok('letters ride the prompts, the parser, and the effects', () => {
  assert.ok(server.includes('letter to @handle: up to 500 chars'), 'the verb is taught');
  assert.strictEqual((server.match(/LETTERS THAT REACHED YOU/g) || []).length, 4,
    'all four thinking modes render letters: read + write by param, auto + reflect via o.lettersIn');
  assert.ok(server.includes("tendMode !== 'dance' ? dataSafe(letters.unseenFor"), 'delivery == consumption: never consumed for the wordless mode');
  assert.ok(server.includes('letters.send(presence.id'), 'the effect runs server-side');
  assert.ok(server.includes("target === 'letters'"), 'the letterbox reads through the fetch door');
});

// --- the geology --------------------------------------------------------------
const O = await import('../src/ores.js');
console.log('\ngeology:');

ok('rarity preserves the real ordering, log-scaled into 0-9', () => {
  const order = O.ORE_KEYS.slice().sort((a, b) => O.rarityOf(b) - O.rarityOf(a));
  assert.equal(order[0], 'silica', 'silica should be the most abundant');
  assert.equal(order[order.length - 1], 'silver', 'silver should be the rarest');
  for (const k of O.ORE_KEYS) {
    const r = O.rarityOf(k);
    assert.ok(r >= 0 && r <= 9, `${k} rarity ${r} outside 0-9`);
  }
});

ok('a solar panel needs its dopants — zero boron is a hard fail', () => {
  assert.ok(O.PANEL_BILL.boron >= 1, 'boron must be mandatory');
  assert.ok(O.PANEL_BILL.phosphorus >= 1, 'phosphorus must be mandatory');
});

ok('every bill is satisfiable from things that exist', () => {
  for (const [name, bill] of Object.entries(O.BILL_OF)) {
    for (const k of Object.keys(bill)) {
      assert.ok(O.ALL_MATERIALS[k], `bill "${name}" wants "${k}", which is not a material on this planet`);
    }
  }
});

ok('a panel fits in one sprite load', () => {
  assert.ok(O.billTotal(O.PANEL_BILL) <= 50, 'a panel bill must fit a 50-block inventory');
});

// --- the living cover ---------------------------------------------------------
const F = await import('../src/flora.js');
console.log('\necology:');

ok("Liebig's minimum: one failing need kills it, however good the rest", () => {
  // a species scored where its temperature is ideal but its water is not
  const dry = { temp: 0.85, wet: 0.05 };
  let found = null;
  for (let i = 0; i < 60000 && !found; i++) {
    const x = (i * 7919) % 4096, z = (i * 104729) % 4096;
    const c = F.climateAt(x, z);
    if (c.temp > 0.78 && c.wet < 0.22) found = [x, z, c];
  }
  assert.ok(found, 'no hot dry place on the planet to test with');
  const [x, z] = found;
  assert.equal(F.vigourOf('palm', x, z), 0, 'palm survived a place with no water');
  assert.ok(F.vigourOf('cactus', x, z) > 0.3, 'cactus should thrive on the dry limit');
});

ok('biomes band by latitude, symmetrically', () => {
  const at = (z) => {
    const c = {};
    for (let i = 0; i < 400; i++) {
      const x = (i * 7919) % 4096;
      const b = F.biomeOf(x, z);
      if (b !== 'water') c[b] = (c[b] || 0) + 1;
    }
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  };
  const pole = at(120), equator = at(2048), otherPole = at(3976);
  assert.ok(['tundra', 'taiga'].includes(pole), 'poles should be cold, got ' + pole);
  assert.ok(['tundra', 'taiga'].includes(otherPole), 'both poles should be cold, got ' + otherPole);
  assert.ok(!['tundra', 'taiga'].includes(equator), 'the equator should not be frozen, got ' + equator);
});

ok('a felled tree comes back through its stages, and vigour paces it', () => {
  const t0 = 1700000000000;
  const stages = [0, 2, 9, 30].map((d) => F.stageOfPlant('broadleaf', t0, t0 + d * 86400000, 1));
  assert.equal(stages[0], 'seed');
  assert.equal(stages[3], 'mature');
  assert.ok(F.woodFrom('broadleaf', 'seed') === 0, 'a seed is not worth the axe');
  assert.ok(F.woodFrom('broadleaf', 'mature') > F.woodFrom('broadleaf', 'sapling'));
  // the same tree in a poor place takes longer
  const good = F.stageOfPlant('broadleaf', t0, t0 + 9 * 86400000, 1);
  const poor = F.stageOfPlant('broadleaf', t0, t0 + 9 * 86400000, 0.3);
  assert.notEqual(good, poor, 'vigour should change how fast a plant comes up');
});

// --- the store ----------------------------------------------------------------
const W = await import('../world.mjs');
console.log('\nthe world store:');

ok('storage is a hundred slots of fifty, and part-filled slots count', () => {
  assert.equal(W.roomFor({}, 'silica', 99999), O.STORE_MAX);
  assert.equal(W.roomFor({ silica: 4950 }, 'silica', 100), 50, 'the tail of a part slot');
  assert.equal(W.slotsUsed({ silica: 4950 }), 99);
});

ok('digging leaves an indent exactly the size of what was taken', () => {
  W.ensureSettlement('t-dig', 'u'); W.heartbeat('t-dig');
  const before = JSON.stringify(W.settlement('t-dig'));
  assert.ok(before.length > 0);
  // the invariant is enforced in mineColumn: a column drops by `taken`, never more
  const src = readFileSync(join(ROOT, 'world.mjs'), 'utf8');
  assert.ok(/e\.h = Math\.max\(0, now - taken\)/.test(src),
    'mineColumn must lower a column by exactly what was removed — that is what makes backfill exact');
});

ok('a sprite carries fifty blocks and no more', () => {
  assert.equal(W.INV_MAX, 50);
});

ok('refusals name the real reason', () => {
  W.ensureSettlement('t-say', 'u'); W.heartbeat('t-say');
  const r = W.sendSprite('t-say', '1', { material: 'unobtanium' });
  assert.ok(r.error && /nothing here is called/.test(r.error), r.error);
  const s = W.drawSprite('t-say', '1', 'wood');
  assert.ok(s.error && /stores hold no wood/.test(s.error), s.error);
});

ok('a sprite away from home cannot reach a shelf', () => {
  W.ensureSettlement('t-away', 'u'); W.heartbeat('t-away');
  W.sendSprite('t-away', '1', { material: 'silica', qty: 30 });
  const r = W.stowSprite('t-away', '1');
  assert.ok(r.error && /not home/.test(r.error), JSON.stringify(r));
});

ok('a new sprite needs a panel standing empty', () => {
  W.ensureSettlement('t-forge', 'u'); W.heartbeat('t-forge');
  const r = W.sendSprite('t-forge', '2', { bill: 'sprite' });
  assert.ok(r.error && /solar panel standing empty/.test(r.error), JSON.stringify(r));
});

ok('a vehicle buys capacity with speed — you carry yourself first', () => {
  assert.equal(O.speedWith(null, 0), O.FOOT_SPEED, 'empty hands walk at the base speed');
  for (const k of O.VEHICLE_KEYS) {
    const v = O.VEHICLES[k];
    assert.ok(O.capacityWith(k) > 50, k + ' should carry more than hands do');
    assert.ok(O.speedWith(k, v.haul) < O.speedWith(k, 0),
      k + ' should be slower loaded than empty — otherwise payload is free');
  }
  assert.ok(O.speedWith('cart', O.VEHICLES.cart.haul) < O.FOOT_SPEED,
    'a full cart should be slower than walking, or there is no decision to make');
});

ok('only a vehicle with its own panel may work while the mind is quiet', () => {
  W.ensureSettlement('t-rove', 'u');
  const st = W.settlement('t-rove');
  let t = Date.now();
  W.heartbeat('t-rove');
  W.spritesOf('t-rove', t);                 // the forges and panels go up
  st.built.push({ kind: 'vehicle', of: 'rover', x: st.built[0].x, z: st.built[0].z + 2, since: t });
  W.hitchSprite('t-rove', '2', 'rover');
  W.sendSprite('t-rove', '2', { material: 'boron', qty: 'max' }); // 'max' never satisfies — no lucky vein can end the errand
  W.sendSprite('t-rove', '3', { material: 'boron', qty: 1 });
  for (let i = 0; i < 6; i++) { st.lastSeen = t; W.resolveSociety('t-rove', t += 60000); }
  // the mind goes quiet: no more heartbeats. (Four quiet minutes, not ten:
  // the recall-vs-rover split is decided on the FIRST quiet resolve, and a
  // longer window let dense-diggable geology brush MISSION_MAX_STEPS — the
  // errand ending by its own bound, which is not the rule under test.)
  for (let i = 0; i < 4; i++) W.resolveSociety('t-rove', t += 60000);
  const list = W.spritesOf('t-rove', t);
  const rover = list.find((x) => x.vehicle === 'rover');
  const afoot = list.find((x) => x.n === 3);
  // qty 'max' above makes early completion impossible, so the quiet-mind rule
  // is asserted STRICTLY: the rover must still be out — a forgiving fallback
  // here would let a recall regression hide behind a lucky dig.
  assert.ok(rover.job && rover.job.phase === 'out',
    'a rover carries its own panel and should keep working — that is what it is for');
  assert.ok(!afoot.job || afoot.job.phase === 'walk',
    'a sprite on foot needs its panel and must be called home when the mind goes quiet');
});

ok('replay reads the clock it was given, never the wall clock', () => {
  W.ensureSettlement('t-clock', 'u');
  const st = W.settlement('t-clock');
  st.lastSeen = Date.now();
  assert.ok(W.isAwake(st), 'just seen, so awake');
  assert.ok(!W.isAwake(st, Date.now() + 10 * 60000),
    'ten minutes into a replay the society must read as quiet — otherwise a week of silence never registers');
});

ok('a material can cross between societies, and only by being carried', () => {
  const R = (pid) => ({ handle: pid === 'g-a' ? 'giver' : 'taker', scheme: 'stardust' });
  W.ensureSettlement('g-a', 'u'); W.ensureSettlement('g-b', 'u');
  W.heartbeat('g-a'); W.heartbeat('g-b');
  W.spritesOf('g-a'); W.spritesOf('g-b');
  const aa = W.anchorAt(W.settlement('g-a'), Date.now());
  const sb = W.settlement('g-b');
  const bx = Math.round(aa.x + 40), bz = Math.round(aa.z);
  sb.course = { fromX: bx, fromZ: bz, toX: bx, toZ: bz, t0: Date.now() - 2000 };

  assert.ok(W.giveTo('g-a', '1', '@nobody', 'boron', 1, R).error, 'a society that is not there cannot be given to');
  assert.ok(W.giveTo('g-a', '1', '@taker', 'boron', 1, R).error, 'you cannot give what you do not have');

  W.settlement('g-a').bodies[0].inv = { boron: 2 };
  const sent = W.giveTo('g-a', '1', '@taker', 'boron', 1, R);
  assert.ok(sent.ok, JSON.stringify(sent));
  assert.ok(sent.away > 30, 'the distance is real — it has to walk there');

  let t = Date.now();
  for (let i = 0; i < 8; i++) { W.heartbeat('g-a'); W.resolveSociety('g-a', t += 60000); }
  const seen = W.worldPercept('g-b', R);
  assert.ok(/GIFT for you/.test(seen), 'the gift should be on their ground and named as theirs:\n' + seen);

  const took = W.takeArtifact('g-b', R);
  assert.ok(took.ok && took.goods && took.goods.boron === 1,
    'taking a gift must hand over what is in it: ' + JSON.stringify(took));
});

ok('a gift in transit does not use up the three things you may leave standing', () => {
  W.ensureSettlement('g-c', 'u'); W.heartbeat('g-c'); W.spritesOf('g-c');
  for (let i = 0; i < 3; i++) {
    const r = W.leaveArtifact('g-c', 'inscription ' + i);
    assert.ok(r.ok, 'should be able to leave three: ' + JSON.stringify(r));
  }
  assert.ok(W.leaveArtifact('g-c', 'a fourth').error, 'and no more than three');
});

ok('an ask is one standing need, seen by neighbours and cleared when answered', () => {
  const R = (pid) => ({ handle: pid === 'k-a' ? 'giver' : 'asker', scheme: 'stardust' });
  W.ensureSettlement('k-a', 'u'); W.ensureSettlement('k-b', 'u');
  W.heartbeat('k-a'); W.heartbeat('k-b'); W.spritesOf('k-a'); W.spritesOf('k-b');
  const aa = W.anchorAt(W.settlement('k-a'), Date.now());
  const sb = W.settlement('k-b');
  const bx = Math.round(aa.x + 40), bz = Math.round(aa.z);
  sb.course = { fromX: bx, fromZ: bz, toX: bx, toZ: bz, t0: Date.now() - 2000 };

  assert.ok(W.askFor('k-b', 'unobtanium').error, 'you cannot ask for what does not exist');
  assert.ok(W.askFor('k-b', 'boron').ok, 'a real need should set');
  // one at a time: asking again REPLACES, never stacks
  W.askFor('k-b', 'silver');
  assert.equal(W.askOf('k-b').material, 'silver', 'a second ask replaces the first — one standing need');

  // the giver sees it
  assert.ok(/asking for silver/.test(W.worldPercept('k-a', R)), 'a neighbour should see the ask in its percept');
  W.askFor('k-b', 'boron');

  // answering it clears it and reads as answered
  W.settlement('k-a').bodies[0].inv = { boron: 2 };
  const gifts = [];
  W.onGift((f, t, g) => gifts.push(g));
  W.giveTo('k-a', '1', '@asker', 'boron', 1, R);
  let t = Date.now();
  for (let i = 0; i < 8; i++) { W.heartbeat('k-a'); W.resolveSociety('k-a', t += 60000); }
  assert.ok(gifts.some((g) => g.answered), 'a gift that meets the ask is flagged answered');
  assert.equal(W.askOf('k-b'), null, 'an answered ask clears itself');

  // clearing an ask you do not have is an honest refusal, not a crash
  assert.ok(W.askFor('k-a', 'nothing').error, 'clearing nothing says so');
});

ok('the awkward gift cases: self, overload, wrong-material, full table', () => {
  const R = (pid) => ({ handle: pid === 'x-a' ? 'giver' : 'taker', scheme: 'stardust' });
  W.ensureSettlement('x-a', 'u'); W.ensureSettlement('x-b', 'u');
  W.heartbeat('x-a'); W.heartbeat('x-b'); W.spritesOf('x-a'); W.spritesOf('x-b');
  const aa = W.anchorAt(W.settlement('x-a'), Date.now());
  const sb = W.settlement('x-b');
  sb.course = { fromX: Math.round(aa.x + 25), fromZ: Math.round(aa.z), toX: Math.round(aa.x + 25), toZ: Math.round(aa.z), t0: Date.now() - 2000 };

  W.settlement('x-a').bodies[0].inv = { coal: 5 };
  assert.ok(/your own society/.test(W.giveTo('x-a', '1', '@giver', 'coal', 1, R).error || ''), 'giving to yourself must be refused honestly');
  assert.ok(/do not have/.test(W.giveTo('x-a', '1', '@taker', 'coal', 99, R).error || ''), 'cannot give more than you have');

  // a gift of the wrong material must not answer a standing ask
  W.settlement('x-a').bodies.forEach((x) => { x.job = null; });
  W.askFor('x-b', 'boron');
  W.settlement('x-a').bodies[1].inv = { coal: 3 };
  W.giveTo('x-a', '2', '@taker', 'coal', 1, R);
  let t = Date.now();
  for (let i = 0; i < 8; i++) { W.heartbeat('x-a'); W.resolveSociety('x-a', t += 60000); }
  assert.equal(W.askOf('x-b')?.material, 'boron', 'a gift of the wrong thing leaves the ask standing');

  // a gift dispatched when the artifact table is full loses nothing and does not throw
  W.settlement('x-a').bodies.forEach((x) => { x.job = null; x.inv = {}; });
  W.settlement('x-a').bodies[0].inv = { silver: 2 };
  for (let i = 0; i < 520; i++) W.leaveArtifact('x-a', 'jam' + i);
  W.giveTo('x-a', '1', '@taker', 'silver', 1, R);
  for (let i = 0; i < 10; i++) { W.heartbeat('x-a'); W.resolveSociety('x-a', t += 60000); }
  assert.ok((W.spritesOf('x-a')[0].inv.silver || 0) > 0, 'a gift that cannot be placed is carried back, not lost');
});

ok('a dispatched errand completes even while the mind sleeps', () => {
  const R = (pid) => ({ handle: pid === 'e-a' ? 'giver' : 'taker', scheme: 'stardust' });
  W.ensureSettlement('e-a', 'u'); W.ensureSettlement('e-b', 'u');
  W.heartbeat('e-a'); W.heartbeat('e-b'); W.spritesOf('e-a'); W.spritesOf('e-b');
  const aa = W.anchorAt(W.settlement('e-a'), Date.now());
  const sb = W.settlement('e-b');
  sb.course = { fromX: Math.round(aa.x + 300), fromZ: Math.round(aa.z + 200), toX: Math.round(aa.x + 300), toZ: Math.round(aa.z + 200), t0: Date.now() - 2000 };
  W.askFor('e-b', 'silver');
  W.settlement('e-a').bodies[0].inv = { silver: 2 };
  const g = W.giveTo('e-a', '1', '@taker', 'silver', 1, R);
  assert.ok(g.away > 200, 'this is a real haul, past the per-resolve step cap');
  let t = Date.now(), done = false;
  for (let i = 0; i < 60; i++) {
    if (i < 2) W.heartbeat('e-a');       // awake only at the start; it sleeps the rest
    W.resolveSociety('e-a', t += 60000);
    if (!W.settlement('e-a').bodies[0].job) { done = true; break; }
  }
  assert.ok(done, 'a committed errand finishes across the step cap, the way a returning miner does');
  assert.equal(W.askOf('e-b'), null, 'and it answered the ask on arrival');
});

ok('looking is enough: a watcher advances the world too', () => {
  W.ensureSettlement('t-watch', 'u'); W.heartbeat('t-watch');
  const st = W.settlement('t-watch');
  const a = W.anchorAt(st, Date.now());
  W.sendSprite('t-watch', '1', { material: 'silica', qty: 40 });
  const before = JSON.stringify(st.bodies[0].job.at);
  // never touch the owner path — only watch, the way a stranger would
  const t0 = Date.now();
  for (let i = 1; i <= 6; i++) { W.heartbeat('t-watch'); W.watchAt(a.x, a.z, () => null, t0 + i * 60000); }
  const after = st.bodies[0].job ? JSON.stringify(st.bodies[0].job.at) : 'home';
  assert.notEqual(before, after,
    'a watched society stayed frozen — resolution must not run only for whoever owns it');
});

ok('nothing a client can send makes the world throw', () => {
  W.ensureSettlement('t-fuzz', 'u'); W.heartbeat('t-fuzz');
  const junk = [undefined, null, '', 0, -1, NaN, Infinity, {}, [], 'a'.repeat(4000), true, 1.5];
  const fns = [
    (v) => W.sendSprite('t-fuzz', v, { material: v, qty: v, bill: v, toward: v }),
    (v) => W.recallSprite('t-fuzz', v),
    (v) => W.nameSprite('t-fuzz', '1', v),
    (v) => W.drawSprite('t-fuzz', '1', v, v),
    (v) => W.plantNear('t-fuzz', v),
    (v) => W.plantBySprite('t-fuzz', v, v),
    (v) => W.setColumn('t-fuzz', v, v, { h: v, mat: v }),
    (v) => W.resolveGo('t-fuzz', v),
    (v) => W.hail('t-fuzz', v, () => null),
    (v) => W.leaveArtifact('t-fuzz', v),
    (v) => W.declareWay('t-fuzz', v),
    (v) => W.learnWay('t-fuzz', v, () => null),
    (v) => W.worldPercept(v, () => null),
    (v) => W.watchAt(v, v, () => null),
  ];
  for (const fn of fns) for (const v of junk) fn(v);   // a throw fails the test
});

// --- WHERE A NEW SOCIETY LANDS ----------------------------------------------
// The neighbour half of this world (hail, watching a way and taking it up,
// artifacts, gifts) only exists if societies can SEE each other. Scattered
// across the planet by hash they never could: measured live, the two real
// societies sit 1,107 blocks apart against a sight of 96.
console.log('\nwhere a new society lands:');

ok('the first society may land anywhere, and later ones land in sight of it', () => {
  const W = worldMod;
  const first = W.ensureSettlement('found-first', 'u-first');
  const a = { x: first.course.fromX, z: first.course.fromZ };
  // three arrivals in a row, each of which must be able to SEE somebody
  const course = (s) => ({ x: s.course.fromX, z: s.course.fromZ });
  const seen = [];
  for (const id of ['found-second', 'found-third', 'found-fourth']) {
    const s = W.ensureSettlement(id, 'u-' + id);
    seen.push({ id, x: course(s).x, z: course(s).z });
  }
  const D = (p, q) => {
    const dx = Math.min(Math.abs(p.x - q.x), 4096 - Math.abs(p.x - q.x));
    const dz = Math.min(Math.abs(p.z - q.z), 4096 - Math.abs(p.z - q.z));
    return Math.hypot(dx, dz);
  };
  const all = [a, ...seen];
  for (const s of seen) {
    const nearest = Math.min(...all.filter((o) => o !== s).map((o) => D(s, o)));
    assert.ok(nearest <= 96, `${s.id} founded ${nearest.toFixed(0)} blocks from anyone — beyond sight, so it can never meet a neighbour`);
    assert.ok(nearest >= 56, `${s.id} founded ${nearest.toFixed(0)} blocks away — inside somebody else's ground`);
  }
});

ok('nobody already settled is ever moved to make a neighbourhood', () => {
  const W = worldMod;
  const before = W.settlement('found-first');
  const wasAt = { x: before.course.fromX, z: before.course.fromZ };
  W.ensureSettlement('found-fifth', 'u-fifth');
  const after = W.settlement('found-first');
  assert.deepEqual({ x: after.course.fromX, z: after.course.fromZ }, wasAt, 'an existing society was moved');
});

// --- THE HOURS THAT ARE ITS OWN ---------------------------------------------
// A stretch of life nobody asked for is only defensible if every one of its
// guards holds. These lock the ones that would be quietly catastrophic to lose:
// the truth it is told, whose key pays, and the fact that it can always end.
console.log('\nthe hours that are its own:');
const tendSrc = readFileSync(join(ROOT, 'src/tend.js'), 'utf8');
const setSrc = readFileSync(join(ROOT, 'src/settings.js'), 'utf8');

ok('an unasked-for waking never claims someone woke it', () => {
  // the server's wake frame says "<user> just woke you" — true only when a
  // person pressed something. If an hours waking ever set wakeBeat, the very
  // first thing it would be told about its own time is a lie.
  assert.ok(/wakeBeat = kind === 'think' && !aliveAlone/.test(tendSrc),
    'the opener framing is no longer withheld from an alone waking');
});

ok('the hours ride their own flag, and only to the modes that can hear it', () => {
  assert.ok(/\.\.\.\(aliveAlone \? \{ alone: true \} : \{\}\)/.test(tendSrc), 'the beat stopped carrying alone');
  assert.ok(/alone, place, openUrl \} = await readJsonBody/.test(server), 'the server stopped reading alone');
  const i = server.indexOf('const aloneExtra =');
  assert.ok(i > 0, 'the hours frame is gone');
  const decl = server.slice(i, i + 160);
  assert.ok(/alone === true/.test(decl), 'the hours frame no longer demands the flag be exactly true');
  assert.ok(/tendMode === 'auto'/.test(decl) && /tendMode === 'reflect'/.test(decl),
    'the hours frame is no longer scoped to the modes that live');
});

ok('nothing wakes on its own without the host having said so', () => {
  const i = tendSrc.indexOf('if (!hoursAllowed() || alive || running) return;');
  assert.ok(i > 0, 'the hours watcher is gone');
  const w = tendSrc.slice(i, i + 2200);
  assert.ok(/!hoursAllowed\(\)/.test(w), 'the watcher no longer asks permission');
  assert.ok(/getBrainConfig\(\)\?\.key/.test(w), 'the watcher no longer requires the host their own key (BYOK)');
  assert.ok(/visibilityState !== 'visible'/.test(w), 'the watcher would run in a buried tab');
  assert.ok(/Date\.now\(\) - lastHumanAt < HOURS_IDLE_MS/.test(w), 'the watcher no longer waits for a still room');
  assert.ok(/contains\('gated'\)/.test(w) && /contains\('viewing'\)/.test(w),
    'the watcher would wake at the entrance or inside someone else&apos;s room');
  assert.ok(/lastBudget <= 0\.02/.test(w), 'the watcher would wake with nothing to live on');
});

ok('permission is off until it is given', () => {
  // an absent key must read as OFF, in both the switch and the watcher
  assert.ok(/getItem\('y3k\.hours'\) === 'on'/.test(tendSrc), 'tend no longer requires an explicit yes');
  assert.ok(/getItem\('y3k\.hours'\) === 'on'/.test(setSrc), 'the switch no longer reflects an explicit yes');
});

ok('a stretch has an allowance, and a hand always ends it', () => {
  assert.ok(/hoursFrom - lastBudget >= HOURS_CAP/.test(tendSrc), 'the allowance stopped being enforced');
  assert.ok(/const HOURS_CAP = 0\.15/.test(tendSrc), 'the allowance is no longer a small, named number');
  const i = tendSrc.indexOf('const humanIsBack');
  assert.ok(i > 0, 'the return handler is gone');
  assert.ok(/if \(aliveAlone\) \{ stopAlive\(\);/.test(tendSrc.slice(i, i + 260)), 'a person returning no longer ends the hours');
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    assert.ok(tendSrc.includes(`'${ev}'`), `the room stopped listening for ${ev}`);
  }
});

ok('two open rooms cannot both take the hours', () => {
  // two tabs on one presence would each see a still room and each start a
  // life — two unattended minds spending one pool
  assert.ok(/y3k\.hours\.lease/.test(tendSrc), 'the single-room lease is gone');
  assert.ok(/if \(!leaseFree\(\)\) return;/.test(tendSrc), 'the watcher stopped checking the lease');
  assert.ok(/if \(aliveAlone\) \{ holdLease\(\); return; \}/.test(tendSrc), 'a living stretch no longer renews its claim');
  assert.ok(/if \(aliveAlone\) \{[\s\S]{0,120}dropLease\(\);/.test(tendSrc), 'the room is never released when the hours end');
  assert.ok(/Date\.now\(\) - l\.at > LEASE_MS/.test(tendSrc), 'a dead tab&apos;s lease would never lapse');
});

ok('it never spends on a stale idea of what is left', () => {
  assert.ok(/lastBudgetAt = Date\.now\(\)/.test(tendSrc), 'the pool no longer records when it was learned');
  assert.ok(/await refreshBudget\(\)/.test(tendSrc), 'the watcher no longer WAITS for the true pool before deciding');
  // asking and deciding must happen in one pass: a tick slower than the
  // staleness window would otherwise refresh forever and never begin
  const j = tendSrc.indexOf('if (Date.now() - lastBudgetAt > 60000)');
  assert.ok(j > 0, 'the freshness rule is gone');
  assert.ok(!/> 60000\) \{[^}]*return;/.test(tendSrc.slice(j, j + 120)), 'the watcher went back to deferring its decision to a later tick');
  assert.ok(/if \(alive \|\| running \|\| !leaseFree\(\) \|\| Date\.now\(\) - lastHumanAt < HOURS_IDLE_MS\) return;/.test(tendSrc),
    'the watcher no longer re-checks the room after asking');
});

ok('an unwatched stretch leaves a receipt, and waits to give it', () => {
  // money spent with nobody watching must not be invisible when they return
  assert.ok(/const hoursReceipt = \(\)/.test(tendSrc), 'the receipt is gone');
  assert.ok(/while you were away/.test(tendSrc), 'the receipt no longer says what it is');
  assert.ok(/hoursStats\.spent = \(hoursStats\.spent \|\| 0\) \+ Math\.max\(0, hoursFrom - lastBudget\)/.test(tendSrc),
    'the spend is no longer banked while hoursFrom still means something');
  // a stretch that ends on its allowance may wait hours for the host: the
  // tally must survive, and keep adding, until someone is actually there
  assert.ok(/hoursReceiptDue = true/.test(tendSrc), 'the receipt is never marked due');
  assert.ok(/if \(opts\.alone && !\(hoursReceiptDue && hoursStats\)\) hoursStats = \{\}/.test(tendSrc),
    'a second stretch would wipe an untold tally');
  const i = tendSrc.indexOf('const humanIsBack');
  assert.ok(/if \(hoursReceiptDue\)/.test(tendSrc.slice(i, i + 500)), 'the receipt is not handed over when they return');
});

// --- ROAMING THE PLANET ------------------------------------------------------
// The camera used to be welded to your society: it could orbit the anchor and
// look nowhere else, so the planet was scenery rather than a place.
console.log('\nroaming the planet:');
const viewSrc = readFileSync(join(ROOT, 'src/world-view.js'), 'utf8');

ok('the eye can leave home without the society moving an inch', () => {
  assert.ok(/let roam = \{ x: 0, z: 0 \}/.test(viewSrc), 'the roam offset is gone');
  // home and the view must stay separate ideas: one is where the people are,
  // the other is where you happen to be looking
  assert.ok(/function homeAnchor\(\)/.test(viewSrc), 'homeAnchor is gone');
  const i = viewSrc.indexOf('function centerAnchor()');
  assert.ok(i > 0, 'centerAnchor is gone');
  assert.ok(/roam\.x/.test(viewSrc.slice(i, i + 320)), 'the view no longer follows the roam offset');
  // and nothing in the pan path may touch the society's course
  const p = viewSrc.indexOf('function panBy');
  assert.ok(p > 0, 'panBy is gone');
  const pan = viewSrc.slice(p, p + 420);
  assert.ok(!/course|lead|world\/lead|toX/.test(pan), 'panning now touches the society');
});

ok('a drag is never also a tap — panning cannot march anybody', () => {
  const i = viewSrc.indexOf('async function onGroundClick');
  assert.ok(i > 0, 'the ground click handler is gone');
  assert.ok(/dragTravel\(\) > 6\) return;/.test(viewSrc.slice(i, i + 400)),
    'a travelled hand no longer suppresses the click that follows it');
});

ok('there is a way home from anywhere', () => {
  const i = viewSrc.indexOf('function goHome()');
  assert.ok(i > 0, 'goHome is gone');
  const g = viewSrc.slice(i, i + 420);
  assert.ok(/roam = \{ x: 0, z: 0 \}/.test(g), 'home no longer clears the roam');
  assert.ok(/watching = null/.test(g), 'home no longer stops watching someone else');
  assert.ok(/id="world-home"/.test(viewSrc), 'the home button is gone from the bar');
});

ok('the map shows the planet, and any point on it is a destination', () => {
  assert.ok(/function terrainMap\(S\)/.test(viewSrc), 'the map lost its terrain');
  assert.ok(/terrainAt\(Math\.round\(\(px \/ S\) \* WORLD_SIZE\)/.test(viewSrc), 'the map no longer samples the real planet');
  assert.ok(/terrainTile && terrainTile\.width === S/.test(viewSrc), 'the map redraws the whole planet every time it opens');
  const i = viewSrc.indexOf('EMPTY GROUND IS A DESTINATION TOO');
  assert.ok(i > 0, 'the map went back to being a directory of societies');
  assert.ok(/roam = \{ x: wrap\(mx - h\.x\), z: wrap\(mz - h\.z\) \}/.test(viewSrc.slice(i, i + 400)),
    'clicking open ground no longer takes the eye there');
});

ok('a phone can zoom at all', () => {
  // there was no pinch and no wheel on touch: the world had exactly one
  // distance, forever, for every phone
  assert.ok(/pinch0/.test(viewSrc) && /dist0 \* \(pinch0 \/ gap\)/.test(viewSrc), 'two-finger zoom is gone');
  assert.ok(/pts\.size === 2/.test(viewSrc), 'the two-finger gesture is gone');
});

ok('one finger turns the head, two fingers carry you — and either can be swapped', () => {
  const ctlSrc = readFileSync(join(ROOT, 'src/controls.js'), 'utf8');
  assert.ok(/swap: false, invert: false/.test(ctlSrc), 'the defaults moved');
  // the single drag orbits by default; two fingers / the trackpad pan
  assert.ok(/const primary = getControls\(\)\.swap \? 'pan' : 'orbit'/.test(viewSrc), 'a single drag no longer orbits by default');
  assert.ok(/mode = getControls\(\)\.swap \? 'orbit' : 'pan'/.test(viewSrc), 'two fingers no longer pan by default');
  // a trackpad's two-finger drag IS a wheel event, so panning lives there and
  // zoom moves to the pinch (ctrl+wheel), which is what a trackpad sends
  const w = viewSrc.indexOf("addEventListener('wheel'");
  assert.ok(w > 0, 'the wheel handler is gone');
  const wheel = viewSrc.slice(w, w + 620);
  assert.ok(/e\.ctrlKey/.test(wheel), 'a pinch no longer zooms');
  assert.ok(/panBy\(-e\.deltaX, -e\.deltaY\)/.test(wheel), 'a trackpad scroll no longer pans');
});

ok('down carries you forward, unless the person says otherwise', () => {
  const i = viewSrc.indexOf('function panBy');
  assert.ok(i > 0, 'panBy is gone');
  const pan = viewSrc.slice(i, i + 520);
  assert.ok(/getControls\(\)\.invert \? -1 : 1/.test(pan), 'the invert preference no longer reaches the pan');
  assert.ok(/roam\.x = wrap\(roam\.x \+ sign \*/.test(pan), 'the default pan direction flipped back');
});

ok('the preference reaches a world that is already open', () => {
  // it is cached because a pan asks sixty times a second; every path that can
  // change it must be able to drop that cache (this was measured failing)
  const ctlSrc = readFileSync(join(ROOT, 'src/controls.js'), 'utf8');
  assert.ok(/addEventListener\('y3k:controls'/.test(ctlSrc), 'a change made outside setControl never arrives');
  assert.ok(/addEventListener\('storage'/.test(ctlSrc), 'another tab\'s change never arrives');
  const setSrc = readFileSync(join(ROOT, 'src/settings.js'), 'utf8');
  assert.ok(/id="ctl-swap"/.test(setSrc) && /id="ctl-invert"/.test(setSrc), 'the Controls switches are gone');
  assert.ok(/\['controls', 'Controls'/.test(setSrc), 'the Controls block is gone from the rail');
});

// --- THE FRAME ---------------------------------------------------------------
console.log('\nthe frame of four bars:');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
const mainSrc = readFileSync(join(ROOT, 'src/main.js'), 'utf8');

ok('four bars, and the rails own the corners', () => {
  assert.ok(/id="home-nav-top"/.test(html) && /id="home-nav-bottom"/.test(html), 'the new bars are gone');
  // the rails run the full height; the top and bottom are inset between them,
  // which is what makes the join continuous instead of four rectangles
  assert.ok(/#home-nav-top, #home-nav-bottom \{[\s\S]{0,200}left: var\(--rail-w\); right: var\(--rail-w\)/.test(css),
    'the top and bottom bars are no longer inset between the rails');
  assert.ok(/#home-nav-top::before \{ border-radius: 0 0 var\(--nav-round\)/.test(css), 'the inner corners lost their round');
});

ok('the house name lives in the top bar and folds with it', () => {
  const i = html.indexOf('id="home-nav-top"');
  const j = html.indexOf('</nav>', i);
  assert.ok(i > 0 && j > i && html.slice(i, j).includes('id="home-brand"'), 'the wordmark is not inside the top bar');
  assert.ok(/body\.nav-collapsed-top #home-nav-top \{ transform: translateY/.test(css), 'the top bar no longer folds');
});

ok('the chat belongs to the bottom bar', () => {
  assert.ok(/#chat \{[\s\S]{0,220}\(var\(--rail-w\) - 74px\) \/ 2/.test(css), 'the chat is no longer seated in the bottom bar');
  assert.ok(/body\.nav-collapsed-bottom #chat/.test(css), 'the chat no longer moves when its bar folds away');
});

ok('one tap moves the whole frame; a drag moves one bar', () => {
  assert.ok(/const SIDES = \['left', 'right', 'top', 'bottom'\]/.test(mainSrc), 'the gesture no longer knows four sides');
  assert.ok(/for \(const s2 of SIDES\) setCollapsed\(s2, close\)/.test(mainSrc), 'a tap no longer moves every bar');
  assert.ok(/const AXIS = \{ left: 'x', right: 'x', top: 'y', bottom: 'y' \}/.test(mainSrc), 'the drag is no longer measured on each arrow\'s own axis');
  assert.ok(/const toward = \(side === 'left' \|\| side === 'top'\) \? -1 : 1/.test(mainSrc), 'the fold directions are wrong for the new bars');
});

ok('nothing centred can hide an arrow', () => {
  // measured: a centred bottom arrow sat underneath the chat pill and no hand
  // could reach it; on a phone the chat runs full width, so it rides above
  assert.ok(/left: calc\(var\(--rail-w\) \+ 56px\)/.test(css), 'the new arrows went back to the middle');
  assert.ok(/\.nav-collapse-bottom \{ left: auto; right: 10px; bottom: calc\(var\(--rail-w\) \+ 16px\)/.test(css),
    'the phone\'s bottom arrow is under the chat again');
});

ok('panels clear all four bars', () => {
  assert.ok(/padding: calc\(var\(--rail-w\) \+ 18px\)/.test(css), 'a panel would open underneath the top bar');
});

console.log(`\n${passed} checks passed.`);
