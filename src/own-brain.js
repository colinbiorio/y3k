// ============================================================================
// own-brain.js — YOUR PRESENCE, THINKING ON YOUR OWN SIGN-IN: the page's half.
// The site hands a turn of your presence to this page (own-relay.mjs), this
// page hands it to y3kode on your computer (y3k-code/brain.mjs, the
// 'brain.complete' command), and y3kode runs the coding client you signed in
// to, once, with no tools. The words come back the same way. Nothing here sees
// a credential: the client finds its own sign-in, and the pairing token is the
// one y3kode already gave this browser.
//
// For the founder, while the software is built (own-relay.mjs, WHO): the site
// refuses the stream to anyone else. Settings → Brain → Provider chooses it,
// and it is the founder's default when no key of theirs is saved: being signed
// in to Claude Code through y3kode is enough (Colin, 2026-10-07: "i'm signed in
// with y3kode but it still says sign in" — it used to wait behind a checkbox).
// The page only offers to think once y3kode answers and can, so the orb never
// claims a brain that is not there.
// ============================================================================

import { savedPairing } from './code/transport.js';

const KEY = 'y3k.ownBrain';                // localStorage: { provider } — 'claude', or 'none' when another was chosen
export const CLIENTS = [['claude', 'Claude Code']];   // the clients with a verified no-tools mode (brain.mjs THINKERS)
const PROBE_MS = 15000;                    // how often a page that cannot think yet looks for y3kode again

// What was chosen in Settings → Brain, if anything: { provider } or null.
export function ownChoice() {
  try { const c = JSON.parse(localStorage.getItem(KEY)); return c?.provider ? c : null; } catch { return null; }
}
export function setOwnChoice(c) {
  try { localStorage.setItem(KEY, JSON.stringify({ provider: c?.provider || 'none' })); } catch { /* private window */ }
}
// The choice in effect. An explicit one stands; with none, the founder with no
// key of their own saved thinks on Claude Code.
export function ownChoiceFor(founder, hasKey) {
  const c = ownChoice();
  if (c) return CLIENTS.some(([id]) => id === c.provider) ? c : null;
  return founder && !hasKey ? { provider: 'claude', auto: true } : null;
}

// One command to y3kode on this computer: the desktop app's bridge, or the
// companion this browser is paired with. → its answer, or { ok: false, code }.
export async function engineCmd(obj, { win = globalThis.window, pairing = savedPairing, fetchFn = globalThis.fetch } = {}) {
  try {
    if (win?.y3kCode?.cmd) return await win.y3kCode.cmd(obj);
    const p = pairing();
    if (!p?.port || !p?.token) return { ok: false, code: 'unpaired', error: 'y3kode is not connected in this browser. Open kode once to connect it.' };
    const r = await fetchFn(`http://127.0.0.1:${p.port}/v1/cmd`, {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.token}` },
      body: JSON.stringify(obj),
    });
    if (r.status === 401) return { ok: false, code: 'unpaired', error: 'y3kode no longer recognizes this browser. Open kode to connect it again.' };
    return await r.json();
  } catch {
    return { ok: false, code: 'offline', error: 'y3kode is not running on this computer.' };
  }
}

// Can the y3kode this page reaches think for a presence? An engine from before
// 'brain.complete' does not list thinkers in its hello.
const canThink = (hello, provider) => Array.isArray(hello?.thinkers) && hello.thinkers.includes(provider);

// WHERE CLAUDE CODE STANDS ON THIS COMPUTER, for Settings → Brain.
// → { reach: 'ok' | 'old' | 'offline' | 'unpaired', installed, auth, method, loginCommand, install, version }
//   auth: 'ok' | 'signed-out' | 'not-installed' | 'unknown' (y3k-code/providers.mjs authState)
export async function claudeCodeStatus({ fresh = false, cmd = engineCmd } = {}) {
  const h = await cmd({ cmd: 'engine.hello' });
  if (!h?.ok) return { reach: h?.code === 'unpaired' ? 'unpaired' : 'offline', error: h?.error || '' };
  const of = (list) => (Array.isArray(list) ? list.find((p) => p.id === 'claude') : null);
  let p = of(h.providers);
  if (fresh || !p || !p.auth || p.auth === 'unknown') {
    const r = await cmd({ cmd: 'provider.refresh' });
    if (r?.ok) p = of(r.providers) || p;
  }
  p = p || {};
  return {
    reach: canThink(h, 'claude') ? 'ok' : 'old', version: h.version || null,
    installed: p.installed ?? null, auth: p.auth || 'unknown', method: p.account?.method || p.method || null,
    loginCommand: p.loginCommand || p.login || 'claude', install: p.install || null,
  };
}
// The two things Settings can ask y3kode to do about it.
export const installClaudeCode = ({ cmd = engineCmd } = {}) => cmd({ cmd: 'provider.install', provider: 'claude' });
export const signInClaudeCode = ({ cmd = engineCmd } = {}) => cmd({ cmd: 'provider.login', provider: 'claude' });

// What the page last heard, for a Settings pane opened after it was said.
let lastState = { state: 'off', why: '' };
export const ownState = () => lastState;

// Offer to think while it is chosen. Returns stop(). onState('ready' | 'off' | 'error', why).
// It looks for y3kode first and opens the stream only when y3kode answers and
// can think; until then, and after y3kode goes away, it looks again every
// PROBE_MS. The site refusing the stream (not the founder) ends it.
export function startOwnBrain({ provider = 'claude', onState: tell = () => {}, ES = globalThis.EventSource, fetchFn = globalThis.fetch,
  cmd = engineCmd, probeMs = PROBE_MS, timer = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) } } = {}) {
  if (typeof ES !== 'function') return () => {};
  const onState = (state, why = '') => { lastState = { state, why }; tell(state, why); };
  let es = null, stopped = false, wait = 0;
  const later = (ms) => { timer.clear(wait); wait = timer.set(probe, ms); };
  const close = () => { if (es) { es.close(); es = null; } };

  async function probe() {
    if (stopped) return;
    const h = await cmd({ cmd: 'engine.hello' });
    if (stopped) return;
    if (!h?.ok) { onState('error', h?.error || 'y3kode is not running on this computer.'); later(probeMs); return; }
    if (!canThink(h, provider)) { onState('error', 'This y3kode is older than the Claude Code connection. Update y3kode to use it.'); later(probeMs * 4); return; }
    open();
  }

  function open() {
    close();
    const s = es = new ES(`/api/own-brain?provider=${encodeURIComponent(provider)}`);
    s.addEventListener('ready', () => onState('ready'));
    s.addEventListener('job', async (ev) => {
      let job;
      try { job = JSON.parse(ev.data); } catch { return; }
      if (!/^[0-9a-f]{32}$/.test(String(job?.id))) return;
      const r = await cmd({ cmd: 'brain.complete', provider: job.provider, system: job.system, prompt: job.prompt, ...(job.effort ? { effort: job.effort } : {}) });
      if (stopped) return;
      const body = r?.ok ? { ok: true, text: String(r.text || ''), usage: r.usage || null } : { ok: false, code: r?.code || 'failed', error: r?.error || '' };
      await fetchFn(`/api/own-brain/${job.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
      if (r?.ok) return;
      // y3kode went away: stop offering a brain that is not there, and look again
      if (r?.code === 'offline' || r?.code === 'unpaired') { close(); onState('error', r.error || 'y3kode stopped answering.'); later(probeMs); return; }
      onState('error', r?.error || 'y3kode did not answer.');
    });
    // the site said no (not the founder, signed out): stop asking
    s.addEventListener('error', () => { if (s.readyState === 2 && es === s) { es = null; onState('off'); } });
  }

  probe();
  return () => { stopped = true; timer.clear(wait); close(); onState('off'); };
}
