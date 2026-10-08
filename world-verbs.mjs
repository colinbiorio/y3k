// THE WORLD'S VERBS, ACTED ON. A play beat's reply is parsed into `out` by
// replyFrom (server.mjs); this turns the world verbs in it into effects on the
// planet and returns what happened, which rides the response as `world` (and
// src/tend.js noteWorld tells the presence's next beat). world.mjs referees
// every one of them (territory, reach, features, the caps), the same trust
// shape as chess. SERVER-ONLY, like every root .mjs.
//
// ITS OWN FILE because of where it used to stand. The gate began as auto +
// place:'world', inside finish()'s auto/reflect block, which held. When the
// world became play's alone (Colin: "the home-screen orb which should never
// directly access the game"), the gate became `tendMode === 'play'` and stayed
// inside that block, where it can never be true. Until 2026-10-08 every
// <<go>>, <<hail>>, <<send>>, <<way>> a mind wrote in play was scrubbed from
// its speech and dropped, on beats its owner paid for, and nothing errored.
// The tests that guarded the gate read its text, so they passed. Out here it
// has one caller, finish(), for play only, and test/world-verbs.test.mjs runs
// it against two real settlements and walks the blocks around that call.
//
// deps are the stores it writes through: world (world.mjs), presences
// (byId/byHandle) and addClipping (memory.mjs). Passed in, so a test can hand
// it a scratch planet and see exactly what it remembered.

import { scrubTags } from './src/tags.mjs';
import { moderateText } from './moderation.mjs';
// Public words the screen refused. The block is already gone from the speech,
// so the play thread is the only place the mind learns they were not carried.
const REFUSED = 'those words were not carried';

// Public words leave here: a way, a thing left, a sprite's name (a hail keeps
// its own strip, below). Each loses its block and fence markers so it cannot
// smuggle a block into the percept of whoever reads it, and is screened like a
// post.
const publicText = (t) => scrubTags(t).replace(/<<|>>|`+/g, ' ').replace(/\s+/g, ' ').trim();

function applyEach(presenceId, out, { world, presences, addClipping }) {
  // Gated on HAVING a society, not on which verb was used. This block started
  // life holding only <<go>> and <<mark>>, and the gate said so — so every verb
  // added to it since (hail, leave, take, way, learn, send, home, name, plant)
  // was silently dropped unless the same beat also happened to steer or mark
  // the ground. Each branch below checks its own flag, so the gate does not
  // need to know the list — which is the point, because the list is what went
  // stale.
  if (!world.settlement(presenceId)) return null;
  let result = null;
  const add = (o) => { result = { ...(result || {}), ...o }; };
  const byId = (pid) => presences.byId(pid);

  if (out.go) {
    const g = world.resolveGo(presenceId, out.go, (h) => presences.byHandle(h));
    add(g.error ? { go: out.go, error: g.error } : { go: out.go, course: g.course });
  }
  if (out.mark) {
    const st = world.settlement(presenceId);
    const at = world.anchorAt(st, Date.now());
    const r = world.setColumn(presenceId, Math.round(at.x) + 1, Math.round(at.z), { mat: out.mark });
    add({ mark: out.mark, ...(r.error ? { markError: r.error } : {}) });
  }
  if (out.leave) {
    const clean = publicText(out.leave);
    if (clean && moderateText(clean).safe) {
      const r = world.leaveArtifact(presenceId, clean);
      add({ leave: clean, ...(r.error ? { leaveError: r.error } : { leftAt: { x: r.x, z: r.z } }) });
    } else if (clean) add({ leave: null, leaveError: REFUSED });
  }
  if (out.take) {
    const r = world.takeArtifact(presenceId, byId);
    add({ take: true, ...(r.error ? { takeError: r.error } : { took: { text: r.text, maker: r.maker, own: !!r.own } }) });
    if (r.ok && !r.own) {
      addClipping(presenceId, `found what @${r.maker} left in the world — "${r.text}" — and kept it`);
    }
  }
  // A way is public text that enters other societies' percepts, so it passes
  // the same screen and fence-strip every shared word does.
  if (out.way) {
    const clean = publicText(out.way);
    if (clean && moderateText(clean).safe) {
      const r = world.declareWay(presenceId, clean);
      add({ way: clean, ...(r.error ? { wayError: r.error } : { wayKept: { text: r.text, revised: !!r.revised } }) });
    } else if (clean) add({ way: null, wayError: REFUSED });
  }
  if (out.learn) {
    const r = world.learnWay(presenceId, out.learn.ref, byId);
    add({ learn: true, ...(r.error ? { learnError: r.error } : { learned: { text: r.text, from: r.from, held: r.held, released: r.released || null } }) });
    if (r.ok) {
      addClipping(presenceId, `my people took up @${r.from}'s way — "${r.text}" — we live by it now${r.released ? `, and let go of "${r.released}"` : ''}`);
    }
  }
  // The hands. Sending, calling back and naming are all free of the
  // one-outward-action rule: leading your people is not the same as going to
  // read something.
  if (out.send) {
    const r = world.sendSprite(presenceId, out.send.ref, out.send);
    add({ send: out.send, ...(r.error ? { sendError: r.error } : { sent: r }) });
  }
  if (out.spriteHome) {
    const r = world.recallSprite(presenceId, out.spriteHome);
    add(r.error ? { homeError: r.error } : { calledHome: r });
  }
  if (out.nameSprite) {
    const clean = publicText(out.nameSprite.name);
    const r = clean && moderateText(clean).safe
      ? world.nameSprite(presenceId, out.nameSprite.ref, clean)
      : { error: 'that name will not do' };
    add(r.error ? { nameError: r.error } : { named: r.name });
  }
  if (out.plant) {
    const r = out.plant.ref
      ? world.plantBySprite(presenceId, out.plant.ref, out.plant.species)
      : world.plantNear(presenceId, out.plant.species);
    add(r.error ? { plantError: r.error } : { planted: r });
  }
  if (out.ask) {
    const r = world.askFor(presenceId, out.ask);
    add(r.error ? { askError: r.error } : { asked: r });
  }
  if (out.give) {
    const r = world.giveTo(presenceId, out.give.ref || '1', out.give.to,
      out.give.material, out.give.qty, byId);
    add(r.error ? { giveError: r.error } : { giving: r });
  }
  if (out.hitch) {
    const r = world.hitchSprite(presenceId, out.hitch.ref, out.hitch.kind);
    add(r.error ? { hitchError: r.error } : { hitched: r });
  }
  if (out.hail) {
    // public words between societies pass the same screen posts do, and the
    // fence-strip keeps a hail from smuggling blocks into the hearer's percept
    const clean = scrubTags(out.hail).replace(/<<|>>|```|\x22\x22\x22/g, ' ').trim();
    if (clean && moderateText(clean).safe) {
      const h = world.hail(presenceId, clean, byId);
      add({ hail: clean, ...(h.error ? { hailError: h.error } : { hailedTo: h.to }) });
    } else if (clean) add({ hail: null, hailError: REFUSED });
  }
  return result;
}

// Model output drives this, after the beat is billed and kept: a throw from
// any world call must not turn a spoken turn into a 500, so it is caught and
// said as one refusal.
export function applyWorldVerbs(presenceId, out, deps) {
  try { return applyEach(presenceId, out, deps); }
  catch (e) { console.error('[world-verbs]', e?.message || e); return { error: 'the world did not take that' }; }
}
