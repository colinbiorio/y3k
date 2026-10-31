// KEEP GOING — the switch in the room that lets the coder go on by itself.
//
// Colin, 2026-10-31: "build yourself a system that when a switch is turned on
// in the kode screen, you intelligently continue working as soon as rates
// refresh, and if you have nothing to work on, you have free reign to continue
// working, building, watching the life, etc."
//
// THE SWITCH IS THE PERSON'S WORD, GIVEN ONCE (CODE.md, line 9). While it is
// on, the engine speaks for them to the one conversation — "go on" when the
// plan's limit lifts, "you have free reign" when a turn has ended and nothing
// has been asked for a while, "go on" again after the engine restarted — and
// every line it sends is shown in the room as its own ("keep going, on its
// own"), never as the person's. The person speaking puts the clock back: their
// turn is answered, and only when the room has been quiet again for a while
// does it choose. One press switches it off.
//
// IT LIVES HERE, in the engine on the person's computer, so it works with the
// page closed; it is remembered across the engine's restarts (config.json
// `keep`), and the conversation it keeps is revived from the index when it is
// not live (a crash, an update) — the same conversation, as "continue the last
// conversation" revives it. Three turns of its own failing in a row pause it,
// and say so; the person stopping the conversation pauses it until they speak.
//
// WHEN THE LIMIT LIFTS: Claude Code says the plan's windows as it goes
// (rate_limit_event → usage.limits: each window's utilization and reset), and
// a refused turn ends in an error that names the limit. The wait is until the
// latest reset among the windows that are full — a full week waits for the
// week — plus a little grace; a limit with no reset known is tried again in a
// quarter of an hour.

export const KEEP_GRACE_MS = 20_000;        // after a window resets, before going on
export const KEEP_IDLE_MS = 5 * 60_000;     // a turn ended and nothing asked: this long before it chooses
export const KEEP_RETRY_MS = 15 * 60_000;   // a limit with no reset time known
export const KEEP_RESTART_MS = 30_000;      // the engine came up with the switch on: this long before it goes on
export const KEEP_BUSY_MS = 60_000;         // a turn was running when its time came: look again after this
export const KEEP_FAILS = 3;                // its own turns failing in a row: it pauses
// how Claude Code names it: "You've hit your limit · resets 4pm", "Claude AI usage limit reached", "rate_limit_error", 429
export const LIMIT_TEXT = /rate[_ -]?limit|usage limit|\blimit\b.*\b(reset|reached|hit)|\bresets? (at|in)\b|too many requests|\b429\b/i;

// What it says, on the person's behalf. Said as the person's standing word —
// the switch — not as the coder's own thought, so the coder knows who asked.
export const GO_ON = '[keep going] The plan\'s limit has lifted. Go on from where you stopped, as if nothing had interrupted you: '
  + 'if a task was in the middle, finish it to a clean, tested, shipped point. If nothing is left, choose what is worth doing next '
  + '— the open work in your memory and the READMEs, the life (lived in short sessions), the site — and do one session\'s worth of it, '
  + 'then say plainly what you did and what comes next. Stop short of what only I decide: outward posts, sharing the life, keys. '
  + 'When the limit is near, stop at a clean point.';
export const FREE_REIGN = '[keep going] Nothing is waiting from me. You have free reign: choose the one thing most worth doing now '
  + '— the open work in your memory and the READMEs\' owed lists, the life (go live it, in short sessions, and improve it), the site — '
  + 'and do one session\'s worth of it to a clean, tested, shipped point. Then say plainly what you did and what comes next, and stop; '
  + 'the switch brings you back. Stop short of what only I decide: outward posts, sharing the life, keys.';
export const RESTARTED = '[keep going] y3kode restarted and the switch is still on. Go on from where you stopped: '
  + 'if a task was in the middle, finish it; if nothing is left, choose what is worth doing next and do one session\'s worth, '
  + 'then say plainly what you did and what comes next. Stop short of what only I decide: outward posts, sharing the life, keys.';
export const SAYS = { limit: GO_ON, idle: FREE_REIGN, restart: RESTARTED, busy: FREE_REIGN };

// When the plan is full and the last full window resets (ms): the named
// windows (the five hours, the week) at their ceiling — a model's own weekly
// window is left out of a poll, since the conversation may not be on that
// model — or, for a turn refused outright (status 'rejected'), the windows
// near their ceiling, else the earliest reset. Null when nothing is full.
export function limitUntil(ev) {
  const all = (ev?.windows || []).filter((w) => typeof w.resetsAt === 'number' && w.resetsAt > 0);
  const full = all.filter((w) => w.kind !== 'seven_day_model' && typeof w.utilization === 'number' && w.utilization >= 0.999);
  if (full.length) return Math.max(...full.map((w) => w.resetsAt));
  if (ev?.status !== 'rejected' || !all.length) return null;
  const near = all.filter((w) => typeof w.utilization === 'number' && w.utilization >= 0.9);
  return near.length ? Math.max(...near.map((w) => w.resetsAt)) : Math.min(...all.map((w) => w.resetsAt));
}

export function createKeeper({ config, setConfig, now = () => Date.now(), emit, notice = () => {}, sessions, row = () => null, revive, send, audit = null,
  graceMs = KEEP_GRACE_MS, idleMs = KEEP_IDLE_MS, retryMs = KEEP_RETRY_MS, restartMs = KEEP_RESTART_MS, busyMs = KEEP_BUSY_MS, fails = KEEP_FAILS } = {}) {
  const off = () => ({ on: false, sid: null, cwd: null, provider: null, since: null, waiting: null, paused: null, fails: 0 });
  let st = off();
  let timer = null;
  let disposed = false;             // the engine shut down: inert, whatever still arrives
  let autoTurn = false;             // the turn now running (or next) is one it asked for
  const limits = new Map();         // sid -> the newest usage.limits (to know a reset when a turn is refused)
  const lastEnd = new Map();        // sid -> how its last turn ended ('limit' when refused by the plan)

  function status() {
    return { on: st.on, sid: st.sid, since: st.since, waiting: st.waiting, paused: st.paused, fails: st.fails | 0 };
  }
  function persist() {
    try { setConfig(st.on ? { on: true, sid: st.sid, cwd: st.cwd, provider: st.provider, since: st.since, waiting: st.waiting, paused: st.paused, fails: st.fails | 0 } : { on: false }); } catch { /* the switch still works for this run */ }
  }
  function changed() { persist(); emit({ type: 'keep.changed', ...status() }); }
  function clear() { if (timer) { clearTimeout(timer); timer = null; } }
  function wait(until, reason) {
    clear();
    if (disposed) return;
    st.waiting = { until, reason };
    // (an error in here is said, not swallowed: a switch that fails silently is a switch that is off)
    timer = setTimeout(() => { fire().catch((e) => { notice(`Keep going hit an error: ${String(e?.message || e).slice(0, 200)}`, 'error', 'keep'); }); }, Math.max(0, until - now()));
    timer.unref?.();
    changed();
  }
  function pause(why, text) {
    clear();
    st.paused = why; st.waiting = null;
    if (text) notice(text, 'info', 'keep');
    changed();
  }
  function limited(sid) {
    const l = limits.get(sid);
    const until = l?.until && l.until > now() ? l.until + graceMs : now() + retryMs;
    wait(until, 'limit');
  }

  async function fire() {
    timer = null;
    if (disposed || !st.on || st.paused) return;
    const reason = st.waiting?.reason || 'idle';
    let s = sessions.get(st.sid);
    if (s && s.adapter?.state === 'running') { wait(now() + busyMs, reason); return; }   // its turn is still on: look again
    if (!s) {
      let r = null;
      try { r = await revive(st); } catch (e) { r = { ok: false, error: String(e?.message || e) }; }
      if (!r?.ok || !sessions.get(r.sid)) { pause('ended', `Keep going paused: the conversation could not be picked up (${r?.error || 'it is gone'}).`); return; }
      follow(st.sid, r.sid);
      s = sessions.get(r.sid);
    }
    st.waiting = null; autoTurn = true;
    audit?.write?.('keep.send', { sid: s.sid, reason });
    try { await send(s, SAYS[reason] || FREE_REIGN, [], null, 'keep'); }
    catch (e) { autoTurn = false; failed(String(e?.message || e)); return; }
    changed();
  }
  // The conversation went on under a new id (continued, revived): keep that one.
  function follow(oldSid, newSid) {
    if (!st.on || st.sid !== oldSid || !newSid || oldSid === newSid) return;
    st.sid = newSid; changed();
  }
  function failed(error) {
    st.fails = (st.fails | 0) + 1;
    if (st.fails >= fails) { pause('errors', `Keep going paused: ${st.fails} turns of its own failed in a row (${String(error || '').slice(0, 160)}).`); return; }
    wait(now() + Math.min(idleMs, 60_000), 'idle');
  }

  return {
    status,
    sid: () => (st.on ? st.sid : null),
    // The switch. On needs the conversation it keeps: the one on the screen.
    set({ on, sid } = {}) {
      if (!on) { clear(); st = off(); autoTurn = false; changed(); audit?.write?.('keep.set', { on: false }); return { ok: true, ...status() }; }
      // the conversation on the screen: live, or known to the index (one that
      // has ended stays the conversation — it is revived when its time comes)
      const s = sessions.get(sid);
      const known = s ? { cwd: s.cwd, provider: s.provider } : row(sid);
      if (!known) return { ok: false, error: 'Open a conversation first: the switch keeps the one on the screen.' };
      clear();
      st = { on: true, sid, cwd: known.cwd, provider: known.provider, since: now(), waiting: null, paused: null, fails: 0 };
      audit?.write?.('keep.set', { on: true, sid });
      const l = limits.get(sid);
      if (!s) wait(now() + idleMs, 'idle');
      else if (s.adapter?.state !== 'running') {
        // its last turn was refused by the plan and the window has not reset: it goes on when it does
        if (lastEnd.get(s.sid) === 'limit' && l?.until && l.until > now()) wait(l.until + graceMs, 'limit');
        else wait(now() + idleMs, 'idle');
      } else changed();
      return { ok: true, ...status() };
    },
    follow,
    // The person stopped the conversation: wait for them to speak again.
    stopped(sid) {
      if (st.on && st.sid === sid) pause('stopped', null);
    },
    // Every session's events pass through here; only the kept one is acted on.
    onEvent(s, ev) {
      if (disposed) return;
      if (ev.type === 'usage.limits') { const until = limitUntil(ev); if (until) limits.set(s.sid, { until, at: now(), rejected: ev.status === 'rejected' }); else if (ev.status !== 'rejected') limits.delete(s.sid); }
      if (ev.type === 'turn.ended') {
        const l = limits.get(s.sid);
        lastEnd.set(s.sid, ev.status === 'error' && (LIMIT_TEXT.test(String(ev.error || '')) || (l?.rejected && now() - l.at < 120_000)) ? 'limit' : ev.status);
      }
      if (!st.on || s.sid !== st.sid) return;
      switch (ev.type) {
        case 'message.user':
          // the person is here: their turn is answered; the clock starts again when it ends
          if (!ev.auto) { clear(); st.waiting = null; st.fails = 0; autoTurn = false; if (st.paused === 'stopped' || st.paused === 'errors') st.paused = null; changed(); }
          break;
        case 'turn.ended': {
          const mine = autoTurn; autoTurn = false;
          if (lastEnd.get(s.sid) === 'limit') { limited(s.sid); break; }
          if (ev.status === 'success') { st.fails = 0; if (!st.paused) wait(now() + idleMs, 'idle'); break; }
          if (ev.status === 'error' && mine) { failed(ev.error); break; }
          // interrupted, or the person's own turn failing: theirs to see to
          clear(); st.waiting = null; changed();
          break;
        }
        case 'session.ended':
          clear();
          if (st.paused) break;
          st.waiting = null;
          wait(now() + restartMs, 'restart');   // revived when its time comes
          break;
        default: break;
      }
    },
    // The engine came up: a switch left on goes on soon.
    init() {
      const k = config()?.keep;
      if (!k?.on || !k.sid) { st = off(); return; }
      st = { on: true, sid: k.sid, cwd: k.cwd || null, provider: k.provider || null, since: k.since || now(), waiting: null, paused: k.paused === 'errors' ? 'errors' : null, fails: k.fails | 0 };
      if (st.paused) { changed(); return; }
      const until = k.waiting?.until && k.waiting.until > now() + restartMs ? k.waiting.until : now() + restartMs;
      wait(until, k.waiting?.reason === 'limit' && until > now() + restartMs ? 'limit' : 'restart');
    },
    // The engine is going down: nothing more is scheduled or sent, and what is
    // on disk stays as it was, for the next engine to pick up (init).
    dispose() { disposed = true; clear(); },
  };
}
