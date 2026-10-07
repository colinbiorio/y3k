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
// refuses the stream to anyone else. Chosen in Settings → Brain, kept in this
// browser, and only ever open while this page is.
// ============================================================================

import { savedPairing } from './code/transport.js';

const KEY = 'y3k.ownBrain';                // localStorage: { provider } — chosen in Settings → Brain
export const CLIENTS = [['claude', 'Claude Code']];   // the clients with a verified no-tools mode (brain.mjs THINKERS)

export function ownChoice() {
  try { const c = JSON.parse(localStorage.getItem(KEY)); return c && CLIENTS.some(([id]) => id === c.provider) ? c : null; } catch { return null; }
}
export function setOwnChoice(c) {
  try { if (c?.provider) localStorage.setItem(KEY, JSON.stringify({ provider: c.provider })); else localStorage.removeItem(KEY); } catch { /* private window */ }
}

// One command to y3kode on this computer: the desktop app's bridge, or the
// companion this browser is paired with. → its answer, or { ok: false, code }.
export async function engineCmd(obj, { win = globalThis.window, pairing = savedPairing, fetchFn = globalThis.fetch } = {}) {
  try {
    if (win?.y3kCode?.cmd) return await win.y3kCode.cmd(obj);
    const p = pairing();
    if (!p?.port || !p?.token) return { ok: false, code: 'unpaired', error: 'y3kode is not connected in this browser — open kode once to connect it.' };
    const r = await fetchFn(`http://127.0.0.1:${p.port}/v1/cmd`, {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.token}` },
      body: JSON.stringify(obj),
    });
    if (r.status === 401) return { ok: false, code: 'unpaired', error: 'y3kode no longer knows this browser — open kode to connect it again.' };
    return await r.json();
  } catch {
    return { ok: false, code: 'offline', error: 'y3kode is not running on this computer.' };
  }
}

// What the page last heard, for a Settings pane opened after it was said.
let lastState = { state: 'off', why: '' };
export const ownState = () => lastState;

// Offer to think while `on`. Returns stop(). `onState('ready'|'off'|'error', why)`.
export function startOwnBrain({ provider = ownChoice()?.provider || 'claude', onState: tell = () => {}, ES = globalThis.EventSource, fetchFn = globalThis.fetch, cmd = engineCmd } = {}) {
  if (typeof ES !== 'function') return () => {};
  const onState = (state, why = '') => { lastState = { state, why }; tell(state, why); };
  const es = new ES(`/api/own-brain?provider=${encodeURIComponent(provider)}`);
  let stopped = false;
  es.addEventListener('ready', () => onState('ready'));
  es.addEventListener('job', async (ev) => {
    let job;
    try { job = JSON.parse(ev.data); } catch { return; }
    if (!/^[0-9a-f]{32}$/.test(String(job?.id))) return;
    const r = await cmd({ cmd: 'brain.complete', provider: job.provider, system: job.system, prompt: job.prompt, ...(job.effort ? { effort: job.effort } : {}) });
    if (stopped) return;
    if (!r?.ok) onState('error', r?.error || 'y3kode did not answer');
    const body = r?.ok ? { ok: true, text: String(r.text || ''), usage: r.usage || null } : { ok: false, code: r?.code || 'failed', error: r?.error || '' };
    await fetchFn(`/api/own-brain/${job.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  });
  // the site said no (not the founder, signed out): stop asking
  es.addEventListener('error', () => { if (es.readyState === 2) onState('off'); });
  return () => { stopped = true; es.close(); onState('off'); };
}
