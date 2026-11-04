// BURN (0.3.16, 2026-11-04). Colin: "design and implement a system that ensures every 5h limit is
// hit as long as a switch is turned on"; then: "it should be an actual switch at the top of kode
// that only the user can control." The worker is ~/orion/bin/burn (launchd com.orion.burn, every
// five minutes: one unattended `claude -p` session at a time on the open loops in ~/orion/now.md,
// resting until a limit's reset time). This module is the switch itself: it lives in the engine's
// own store (burn.json), it is set only by the kode page's button (burn.set, behind a consent), and
// the worker only reads it — `burn` on the command line cannot turn it on or off, so no session
// it runs can flip its own switch.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';

// WHAT THE TURN IS DOING (0.3.17). Colin: "burn is on rn but there's no active process". It was
// running, but nothing on screen said so. The worker streams every turn to ~/orion/burn/turn-*.log
// (Claude Code's stream-json), and this reads the newest one's tail into a short feed: what it said,
// which tools it ran. It is read-only and is never sent anywhere but this person's kode.
const TAIL = 256 * 1024;
// COVERAGE (0.3.19). The watchdog writes ~/orion/burn/heartbeat.log, one line a minute:
// "YYYY-MM-DD HH:MM <off|working|resting|GAP> ...". This counts the last day of it, so kode can say
// how many minutes burn covered and whether any minute had the switch on and nothing running.
export function coverageOf(text, now = Date.now(), span = 24 * 3600 * 1000) {
  const c = { minutes: 0, working: 0, resting: 0, gaps: 0, lastGap: null };
  for (const line of String(text).split('\n')) {
    const m = line.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d) (off|working|resting|GAP)\b/);
    if (!m) continue;
    const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    if (now - t > span || m[6] === 'off') continue;
    c.minutes++;
    if (m[6] === 'working') c.working++;
    else if (m[6] === 'resting') c.resting++;
    else { c.gaps++; c.lastGap = t; }
  }
  return c;
}
export function feedOf(text, max = 14) {
  const out = [];
  for (const line of String(text).split('\n')) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e?.type !== 'assistant') continue;
    for (const c of e.message?.content || []) {
      if (c.type === 'text' && c.text?.trim()) out.push({ kind: 'said', text: c.text.trim().replace(/\s+/g, ' ').slice(0, 240) });
      else if (c.type === 'tool_use') {
        const i = c.input || {};
        const what = i.description || i.command || i.file_path || i.pattern || i.prompt || i.query || '';
        out.push({ kind: 'tool', tool: String(c.name || 'tool').slice(0, 40), text: String(what).replace(/\s+/g, ' ').slice(0, 160) });
      }
    }
  }
  return out.slice(-max);
}

export function createBurn({ dir, home, now = () => Date.now() }) {
  const file = join(dir, 'burn.json');
  const work = join(home, 'orion', 'burn');
  const tool = join(home, 'orion', 'bin', 'burn');
  const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

  function status() {
    const sw = readJson(file, { on: false });
    const st = readJson(join(work, 'state.json'), {});
    let pid = null;
    try { pid = Number(readFileSync(join(work, 'worker.pid'), 'utf8').trim()) || null; } catch { /* none */ }
    const running = !!pid && alive(pid);
    const resting = st.resume_at && st.resume_at * 1000 > now() ? Math.round(st.resume_at * 1000) : null;
    const last = Array.isArray(st.sessions) ? st.sessions.slice(-3) : [];
    let turn = null;
    try {
      const logs = readdirSync(work).filter((f) => /^turn-\d{8}-\d{6}\.log$/.test(f)).sort();
      const name = logs.at(-1);
      if (name) {
        const path = join(work, name), size = statSync(path).size;
        const fd = openSync(path, 'r'), len = Math.min(size, TAIL), b = Buffer.alloc(len);
        readSync(fd, b, 0, len, size - len); closeSync(fd);
        const m = name.match(/turn-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)/);
        turn = { started: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), touched: statSync(path).mtimeMs, feed: feedOf(b.toString('utf8')) };
      }
    } catch { /* no turn yet */ }
    const turns = Array.isArray(st.sessions) ? st.sessions.length : 0;
    let coverage = null;
    try { coverage = coverageOf(readFileSync(join(work, 'heartbeat.log'), 'utf8'), now()); } catch { /* no heartbeat yet */ }
    return { ok: true, available: existsSync(tool), on: !!sw.on, since: sw.since || null, running, resting, last, turns, conversation: st.session_id || null, turn, coverage };
  }

  function set(on) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ on: !!on, since: now(), by: 'kode' }), { mode: 0o600 });
    return status();
  }

  return { status, set, file };
}
