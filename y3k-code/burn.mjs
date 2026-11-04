// BURN (0.3.16, 2026-11-04). Colin: "design and implement a system that ensures every 5h limit is
// hit as long as a switch is turned on"; then: "it should be an actual switch at the top of kode
// that only the user can control." The worker is ~/orion/bin/burn (launchd com.orion.burn, every
// five minutes: one unattended `claude -p` session at a time on the open loops in ~/orion/now.md,
// resting until a limit's reset time). This module is the switch itself: it lives in the engine's
// own store (burn.json), it is set only by the kode page's button (burn.set, behind a consent), and
// the worker only reads it — `burn` on the command line cannot turn it on or off, so no session
// it runs can flip its own switch.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
    return { ok: true, available: existsSync(tool), on: !!sw.on, since: sw.since || null, running, resting, last };
  }

  function set(on) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ on: !!on, since: now(), by: 'kode' }), { mode: 0o600 });
    return status();
  }

  return { status, set, file };
}
