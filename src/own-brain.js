// ============================================================================
// own-brain.js — YOUR PRESENCE, THINKING ON YOUR OWN SIGN-IN: the page's half.
// The site hands a turn of your presence to this page (own-relay.mjs), this
// page hands it to y3kode on your computer (y3k-code/brain.mjs, the
// 'brain.complete' command), and y3kode runs the coding client you signed in
// to, once, with no tools. The words come back the same way. Nothing here sees
// a credential: the client finds its own sign-in, and the pairing token is the
// one y3kode already gave this browser.
//
// FOR EVERY SIGNED-IN ACCOUNT, the founder's like anyone's (Colin, 2026-10-12).
// The site hands each person's turns only to their own page, so a guest has
// none to offer: the relay needs an account, as Site default does. The only
// limit on a turn is the person's own plan. Settings → Brain → Provider
// chooses it, and an explicit choice there always stands. With no choice made
// and no key of their own saved, an account thinks on Claude Code once y3kode
// on this computer answers and can think (Colin, 2026-10-07: "i'm signed in
// with y3kode but it still says sign in" — it used to wait behind a checkbox),
// and stays on Site default otherwise. The page only offers to think once
// y3kode answers and can, so the orb never claims a brain that is not there.
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
// The choice in effect, for an account (signedIn) or a guest. An explicit one
// stands; with none, an account with no key of its own saved thinks on Claude
// Code (`auto`: by default, so only once y3kode here can think — startOwnBrain).
// A guest has no relay to offer, so none.
export function ownChoiceFor(signedIn, hasKey) {
  if (!signedIn) return null;
  const c = ownChoice();
  if (c) return CLIENTS.some(([id]) => id === c.provider) ? c : null;
  return hasKey ? null : { provider: 'claude', auto: true };
}

// THE MODEL EACH CLIENT THINKS ON, chosen in Settings → Brain: { claude: id }.
// None, or 'default', is the client's own default for the plan.
const MODEL_KEY = 'y3k.ownModel';
export function ownModel(provider = 'claude') {
  try { const m = JSON.parse(localStorage.getItem(MODEL_KEY))?.[provider]; return typeof m === 'string' && m ? m : null; } catch { return null; }
}
export function setOwnModel(provider, model) {
  try {
    const all = JSON.parse(localStorage.getItem(MODEL_KEY) || '{}') || {};
    if (model && model !== 'default') all[provider] = model; else delete all[provider];
    localStorage.setItem(MODEL_KEY, JSON.stringify(all));
  } catch { /* private window */ }
  if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('y3k:model'));
}
// The models Claude Code last offered this plan, as y3kode heard them in a
// kode session (models.list → heard, y3kode 0.3.1): [{ id, label, desc }] or null.
export async function heardModels(provider = 'claude', { cmd = engineCmd } = {}) {
  const r = await cmd({ cmd: 'models.list', provider });
  return r?.ok && Array.isArray(r.heard) && r.heard.length
    ? r.heard.map((m) => ({ id: m.id, label: m.label || m.id, desc: m.description || '', resolved: m.resolved || '' }))
    : null;
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

// …and is the client itself there to think with, by what y3kode last saw of
// it? Asked of the DEFAULT only: a person who never chose Claude Code but has
// y3kode for kode, with Claude Code missing or signed out, stays on Site
// default rather than have every turn fail. Anything short of a clear no goes
// ahead, as y3kode's own sessions do (engine.mjs cannotGetIn). → why not, or ''
const NOT_HERE = {
  'not-installed': 'Claude Code is not installed on this computer.',
  'signed-out': 'Claude Code is not signed in on this computer.',
  'needs-key': 'Claude Code on this computer is set to use a key it does not have.',
};
function notHere(hello, provider) {
  const p = Array.isArray(hello?.providers) ? hello.providers.find((x) => x?.id === provider) : null;
  if (p?.installed === false) return NOT_HERE['not-installed'];
  return NOT_HERE[p?.auth] || '';
}
// What a turn's failure says about this computer, as the default reads it:
// nothing here can think until something changes (y3k-code/engine.mjs think).
// A plan's own limit is not one of these: it is the limit, and is waited out.
const CANNOT = new Set(['not-installed', 'signed-out', 'needs-key', 'unsupported']);
// Why a page stopped offering when newer pages of the same account took over.
const REPLACED = 'Another page of yours is thinking for your presence now. Check again to think from this one.';

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
    reach: canThink(h, 'claude') ? 'ok' : 'old', version: h.version || null, canUpdate: h.update === true,
    installed: p.installed ?? null, auth: p.auth || 'unknown', method: p.account?.method || p.method || null,
    loginCommand: p.loginCommand || p.login || 'claude', install: p.install || null,
  };
}
// The two things Settings can ask y3kode to do about it.
export const installClaudeCode = ({ cmd = engineCmd } = {}) => cmd({ cmd: 'provider.install', provider: 'claude' });
export const signInClaudeCode = ({ cmd = engineCmd } = {}) => cmd({ cmd: 'provider.login', provider: 'claude' });

// THE NEWEST y3kode, on the person's yes (y3k-code/update.mjs). The site says
// which version it has and mints a download token; y3kode asks on this
// computer, fetches that version from its own site and restarts on it.
// → y3kode's answer: { ok, restarting, version } | { ok, current } | { ok: false, code, error }
export async function siteSetup({ fetchFn = globalThis.fetch } = {}) {
  try { const r = await fetchFn('/api/code/setup', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function updateY3kode({ cmd = engineCmd, fetchFn = globalThis.fetch } = {}) {
  const s = await siteSetup({ fetchFn });
  if (!s?.token || !s?.engine) return { ok: false, code: 'site', error: 'The site did not offer a version of y3kode. Try again.' };
  return cmd({ cmd: 'engine.update', token: s.token, version: s.engine });
}
// After the restart: true once y3kode answers at `version`, false after `tries` seconds.
export async function waitForVersion(version, { cmd = engineCmd, tries = 45, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let i = 0; i < tries; i++) {
    await sleep(1000);
    const h = await cmd({ cmd: 'engine.hello' });
    if (h?.ok && h.version === version) return true;
  }
  return false;
}

// What the page last heard, for a Settings pane opened after it was said.
let lastState = { state: 'off', why: '' };
export const ownState = () => lastState;
// Whether this page is thinking for the site now: its stream is open and the
// site took it. A turn that failed says 'error' while the stream stays open (a
// plan's limit, say), and the site still sends the next turn here, so what is
// in use is read from this, not from the last state.
let live = false;
export const ownLive = () => live;
// Look for y3kode now instead of at the next probe (after an update, "Check
// again", or Claude Code chosen in Settings), when the stream is not already
// open. It is also the only way back for a default that was declined.
let poke = null;
export const lookAgain = () => poke?.();
let declined = '';   // the default was declined on this computer: why, until asked again

// Offer to think while it is chosen. Returns stop(). onState('ready' | 'off' | 'error' | 'checking', why),
// told when it changes: a page with no y3kode looks every PROBE_MS and finds
// the same thing each time, and its listeners need hear it only once.
// It looks for y3kode first and opens the stream only when y3kode answers and
// can think; until then, and after y3kode goes away, it looks again every
// PROBE_MS. The site refusing the stream (signed out) ends it.
// auto() says whether this is the DEFAULT rather than a choice (ownChoiceFor
// `auto`). The default also waits for Claude Code itself to be there (notHere),
// lets go of a computer whose turns show it cannot think, and once a turn is
// declined on that computer stops offering until asked again (lookAgain): a
// default nobody chose never puts the same question to them twice.
export function startOwnBrain({ provider = 'claude', auto = () => false, onState: tell = () => {}, ES = globalThis.EventSource, fetchFn = globalThis.fetch,
  cmd = engineCmd, probeMs = PROBE_MS, timer = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) } } = {}) {
  if (typeof ES !== 'function') return () => {};
  const onState = (state, why = '') => {
    if (state === lastState.state && why === lastState.why) return;
    lastState = { state, why };
    tell(state, why);
  };
  let es = null, stopped = false, wait = 0;
  const later = (ms) => { timer.clear(wait); wait = timer.set(probe, ms); };
  const close = () => { if (es) { es.close(); es = null; } live = false; };

  async function probe() {
    if (stopped) return;
    const h = await cmd({ cmd: 'engine.hello' });
    if (stopped) return;
    if (!h?.ok) { onState('error', h?.error || 'y3kode is not running on this computer.'); later(probeMs); return; }
    if (!canThink(h, provider)) { onState('error', 'This y3kode is older than the Claude Code connection. Update y3kode to use it.'); later(probeMs * 4); return; }
    if (auto()) {
      if (declined) { onState('error', declined); return; }
      const no = notHere(h, provider);
      if (no) { onState('error', no); later(probeMs * 4); return; }
    }
    open();
  }

  function open() {
    close();
    const s = es = new ES(`/api/own-brain?provider=${encodeURIComponent(provider)}`);
    s.addEventListener('ready', () => { if (es !== s) return; live = true; onState('ready'); });
    s.addEventListener('job', async (ev) => {
      let job;
      try { job = JSON.parse(ev.data); } catch { return; }
      if (!/^[0-9a-f]{32}$/.test(String(job?.id))) return;
      const model = ownModel(job.provider);
      const r = await cmd({ cmd: 'brain.complete', provider: job.provider, system: job.system, prompt: job.prompt, ...(model ? { model } : {}), ...(job.effort ? { effort: job.effort } : {}) });
      if (stopped) return;
      const body = r?.ok ? { ok: true, text: String(r.text || ''), usage: r.usage || null } : { ok: false, code: r?.code || 'failed', error: r?.error || '' };
      await fetchFn(`/api/own-brain/${job.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
      if (r?.ok) { if (live) onState('ready'); return; }   // a turn that answers clears the last one's failure
      // y3kode went away: stop offering a brain that is not there, and look again
      if (r?.code === 'offline' || r?.code === 'unpaired') { close(); onState('error', r.error || 'y3kode stopped answering.'); later(probeMs); return; }
      // the default lets go of a computer that cannot think here, or said no to
      // it, and the next turn goes back to Site default. (A plan's own limit is
      // not this: that turn fails, and the plan is waited out like anyone's.)
      if (auto() && r?.code === 'declined') { declined = r.error || 'Not allowed on the computer.'; close(); onState('error', declined); return; }
      if (auto() && CANNOT.has(r?.code)) { close(); onState('error', r.error || NOT_HERE[r.code] || 'Claude Code cannot think on this computer.'); later(probeMs * 4); return; }
      onState('error', r?.error || 'y3kode did not answer.');
    });
    // newer pages of this account took over (own-relay.mjs, MAX_PAGES): close
    // for good. Left to itself an EventSource opens the ended stream again, and
    // back as the newest it would push the next oldest out, round and round.
    // Asked again (lookAgain: Check again, or Claude Code chosen), it offers again.
    s.addEventListener('replaced', () => { if (es !== s) return; close(); onState('error', REPLACED); });
    // the site said no (signed out): stop asking
    s.addEventListener('error', () => { if (s.readyState === 2 && es === s) { es = null; live = false; onState('off'); } });
  }

  probe();
  const mine = () => { declined = ''; if (!stopped && !es) { timer.clear(wait); onState('checking'); probe(); } };
  poke = mine;
  return () => { stopped = true; timer.clear(wait); close(); if (poke === mine) poke = null; onState('off'); };
}
