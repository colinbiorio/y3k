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
// none to offer: the relay needs an account. The only limit on a turn is the
// person's own plan, and the site has no key of its own to fall back on
// (2026-10-12): without this or a key of their own, nothing thinks.
// Settings → Brain → Provider chooses it, and an explicit choice there always
// stands, on every device of the account: each turn says when this page chose
// otherwise (ownDeclined), so another page of theirs offering Claude Code does
// not take it. With no choice made and no key of their own saved, an account
// thinks on Claude Code once y3kode on this computer answers and can think
// (Colin, 2026-10-07: "i'm signed in with y3kode but it still says sign in" —
// it used to wait behind a checkbox), and has nothing thinking otherwise — but
// only on a y3kode that account made its own here (mayDefault). The page only
// offers to think once y3kode answers and can, so the orb never claims a brain
// that is not there.
// ============================================================================

import { savedPairing } from './code/transport.js';
import { PROVIDER_NAMES } from './models.js';

const KEY = 'y3k.ownBrain';                // localStorage: { provider } — 'claude', or 'none' when another was chosen
export const CLIENTS = [['claude', 'Claude Code']];   // the clients with a verified no-tools mode (brain.mjs THINKERS)
const PROBE_MS = 15000;                    // how often a page that cannot think yet looks for y3kode again
const PICK_KEY = 'y3k.brainPick';          // the provider last chosen in Settings → Brain (settings.js PICK)
const OWNER_KEY = 'y3k.owner';             // whose this browser is now: an account's id, or 'guest' (brain.js OWNER_KEY, claimBrowser)

// What was chosen in Settings → Brain, if anything: { provider } or null.
// A NO NEEDS SOMETHING CHOSEN IN ITS PLACE (2026-10-12). 'none' was also
// written for the Site default there no longer is (a pick of 'site'), and by
// the checkbox before the list (no pick at all): both chose the site's key,
// which is gone, and a no to the account's own sign-in left behind by either
// sent own: false with every turn on that device for good. So 'none' stands
// only beside a pick of a key provider (Settings → Brain writes the two
// together); any other is no choice, and is forgotten here, so the default and
// another page's offer of the account's sign-in apply again.
export function ownChoice() {
  let c = null, pick = null;
  try { c = JSON.parse(localStorage.getItem(KEY)); pick = localStorage.getItem(PICK_KEY); } catch { return null; }
  if (!c?.provider) return null;
  if (c.provider !== 'none' || Object.hasOwn(PROVIDER_NAMES, String(pick))) return c;
  try { localStorage.removeItem(KEY); } catch { /* private window: read as no choice all the same */ }
  return null;
}
// `by`: the y3k account choosing, kept on this device as one that chose
// Claude Code here (or no longer did), for the default below.
export function setOwnChoice(c, { by = null } = {}) {
  const provider = c?.provider || 'none';
  try { localStorage.setItem(KEY, JSON.stringify({ provider })); } catch { /* private window */ }
  if (by) noteChose(String(by), CLIENTS.some(([id]) => id === provider));
}
// …and whether this page chose something other than Claude Code: another
// provider, with or without its key (a stale Site default is not one: above).
// Every turn from here then says so
// (brain.js keyFields, own: false), and the site does not take the account's
// own sign-in for it because another page of theirs offers it.
export const ownDeclined = () => { const c = ownChoice(); return !!c && !CLIENTS.some(([id]) => id === c.provider); };

// WHOSE y3kode THIS IS (2026-10-12). The pairing (y3k-code:pair) and y3kode's
// one yes to thinking for a presence belong to the computer, not to a y3k
// account, so an account signing in on someone else's browser or desktop app
// with no key would have thought on THEIR Claude plan by default. The default
// is only for an account that made the pairing in this browser (transport.js
// keeps who made it), or that chose Claude Code on this device itself. The
// desktop app's y3kode has no pairing to say whose it is, so there it takes
// that choice. Anyone may still choose Claude Code in Settings: then it is a
// choice, made at the computer, not a default.
// The accounts that chose it here: their ids only, kept past signing out (the
// choice itself is forgotten then, brain.js forgetAccount), so the default
// stays theirs when they come back, and never becomes the next account's.
const CHOSE_KEY = 'y3k.ownBrain.accounts';   // [account id]
const CHOSE_MAX = 16;                        // a shared computer's few, not a log
function chose() {
  try { const a = JSON.parse(localStorage.getItem(CHOSE_KEY)); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function noteChose(id, yes) {
  const rest = chose().filter((x) => x !== id);
  try { localStorage.setItem(CHOSE_KEY, JSON.stringify(yes ? [...rest, id].slice(-CHOSE_MAX) : rest)); } catch { /* private window */ }
}
export function mayDefault(id, { win = globalThis.window, pairing = savedPairing } = {}) {
  if (!id) return false;
  if (chose().includes(String(id))) return true;
  if (win?.y3kCode?.cmd) return false;   // the desktop app: whoever installed it, nobody here said
  const p = pairing();
  return !!p?.token && p.by === String(id);
}

// The choice in effect, for an account ({ id }) or a guest (null). An explicit
// one stands; with none, an account with no key of its own saved thinks on
// Claude Code (`auto`: by default, so only once y3kode here can think —
// startOwnBrain), when the y3kode here is its own to default to (mayDefault).
// A guest has no relay to offer, so none.
export function ownChoiceFor(account, hasKey, { win, pairing } = {}) {
  if (!account) return null;
  const c = ownChoice();
  if (c) return CLIENTS.some(([id]) => id === c.provider) ? c : null;
  if (hasKey || !mayDefault(account.id, { win, pairing })) return null;
  return { provider: 'claude', auto: true };
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
// y3kode for kode, with Claude Code missing or signed out, is not offered as a
// brain that would fail every turn (and is told what is missing instead).
// Anything short of a clear no goes ahead, as y3kode's own sessions do
// (engine.mjs cannotGetIn). → why not, or ''
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
// AN ANSWER REFUSED FOR NOW IS SENT AGAIN (2026-10-12). What the site said to
// a turn's answer was never read (a .catch on a 429 that resolved): refused by
// the address's ceiling (a crowd behind one IPv4), a 5xx, or a dropped
// connection, the words already thought on the person's own plan were lost,
// and the turn waited out the relay's 190s timeout. So a refusal for now is
// tried again, a few times, each wait twice the last and up to half again (a
// crowd refused together does not come back together). The waits add up past
// a minute, the rate window (server.mjs RATE_WINDOW_MS), so a ceiling that
// refused the first try has started over by the last, and stay well inside the
// turn's own timeout. Anything else is final: arrived, or 404, the turn no
// longer waits (timed out, let go, its page closed), or 401, signed out.
const ANSWER_WAITS = [1000, 2000, 4000, 8000, 16000, 32000];
const sendAgain = (status) => status === 429 || status >= 500;

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
// ONE PAGE, ONE ACCOUNT (2026-10-12). `as` is the account this page was
// loaded for. An EventSource opens its stream again with whatever cookie the
// browser holds then, so a tab left open after its account signed out in
// another tab, and someone else signed in, offered the y3kode it reached to
// the new account: their turns ran on the first person's computer and plan.
// The stream says whose it is (as=), and the site refuses it to anyone else
// (403: the EventSource stops for good, 'off' below). And this page stops on
// its own as soon as another tab changes whose this browser is (brain.js
// claimBrowser, forgetAccount: OWNER_KEY), before any reconnect is tried.
export function startOwnBrain({ provider = 'claude', as = null, auto = () => false, onState: tell = () => {}, ES = globalThis.EventSource, fetchFn = globalThis.fetch,
  cmd = engineCmd, probeMs = PROBE_MS, win = globalThis.window, timer = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) } } = {}) {
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

  // The turns y3kode is thinking for this page now, and those of them the site
  // has since let go (own-relay.mjs `cancel`: the person went away, the turn
  // timed out, or it was let go to make room). The site no longer waits on
  // one, so its answer is not sent: it would only be refused. y3kode has no
  // way yet to stop a turn it has begun (y3k-code/engine.mjs think), so the
  // turn still runs to its end on the person's own plan. Only ids this page is
  // thinking, or still sending the answer to (answeringNow), are kept, and each
  // goes when its turn ends or its answer is done with.
  const thinkingNow = new Set(), letGoNow = new Set(), answeringNow = new Set();
  // A turn's answer, to the site, and again after a refusal for now (above)
  // while the turn could still be waiting: the stream it came on is still open
  // (own-relay.mjs fails a closed page's turns 'gone'), the site has not let
  // it go (cancel), and this page has not stopped. After the last try it gives
  // up quietly, and the relay's own timeout tells the person, as before.
  async function answer(s, id, body) {
    answeringNow.add(id);
    const waiting = () => !stopped && es === s && !letGoNow.has(id);
    try {
      for (let i = 0; ; i++) {
        let again = true;   // no answer at all: the network
        try {
          const res = await fetchFn(`/api/own-brain/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          again = sendAgain(res?.status);
        } catch { /* sent again */ }
        if (!again || i >= ANSWER_WAITS.length || !waiting()) return;
        await new Promise((go) => timer.set(go, ANSWER_WAITS[i] * (1 + Math.random() / 2)));
        if (!waiting()) return;
      }
    } finally { answeringNow.delete(id); letGoNow.delete(id); }
  }
  function open() {
    close();
    const s = es = new ES(`/api/own-brain?provider=${encodeURIComponent(provider)}${as ? `&as=${encodeURIComponent(as)}` : ''}`);
    s.addEventListener('ready', () => { if (es !== s) return; live = true; onState('ready'); });
    s.addEventListener('cancel', (ev) => {
      let id = null;
      try { id = String(JSON.parse(ev.data)?.id); } catch { return; }
      if (thinkingNow.has(id) || answeringNow.has(id)) letGoNow.add(id);
    });
    s.addEventListener('job', async (ev) => {
      let job;
      try { job = JSON.parse(ev.data); } catch { return; }
      if (!/^[0-9a-f]{32}$/.test(String(job?.id))) return;
      const model = ownModel(job.provider);
      thinkingNow.add(job.id);
      let r;
      try {
        r = await cmd({ cmd: 'brain.complete', provider: job.provider, system: job.system, prompt: job.prompt, ...(model ? { model } : {}), ...(job.effort ? { effort: job.effort } : {}) });
      } finally { thinkingNow.delete(job.id); }
      const wanted = !letGoNow.delete(job.id);
      if (stopped) return;
      const body = r?.ok ? { ok: true, text: String(r.text || ''), usage: r.usage || null } : { ok: false, code: r?.code || 'failed', error: r?.error || '' };
      // not awaited: what the turn says of y3kode is acted on now, not after
      // a refused answer has been tried again for a minute
      if (wanted) answer(s, job.id, body);
      if (r?.ok) { if (live) onState('ready'); return; }   // a turn that answers clears the last one's failure
      // y3kode went away: stop offering a brain that is not there, and look again
      if (r?.code === 'offline' || r?.code === 'unpaired') { close(); onState('error', r.error || 'y3kode stopped answering.'); later(probeMs); return; }
      // the default lets go of a computer that cannot think here, or said no to
      // it, and the next turn is told nothing thinks (brain.js NO_PROVIDER).
      // (A plan's own limit is not this: that turn fails, and the plan is
      // waited out like anyone's.)
      if (auto() && r?.code === 'declined') { declined = r.error || 'Not allowed on the computer.'; close(); onState('error', declined); return; }
      if (auto() && CANNOT.has(r?.code)) { close(); onState('error', r.error || NOT_HERE[r.code] || 'Claude Code cannot think on this computer.'); later(probeMs * 4); return; }
      onState('error', r?.error || 'y3kode did not answer.');
    });
    // newer pages of this account took over (own-relay.mjs, MAX_PAGES): close
    // for good. Left to itself an EventSource opens the ended stream again, and
    // back as the newest it would push the next oldest out, round and round.
    // Asked again (lookAgain: Check again, or Claude Code chosen), it offers again.
    s.addEventListener('replaced', () => { if (es !== s) return; close(); onState('error', REPLACED); });
    // the site said no (signed out, or signed in as someone else now): stop asking
    s.addEventListener('error', () => { if (s.readyState === 2 && es === s) { es = null; live = false; onState('off'); } });
  }

  probe();
  const mine = () => { declined = ''; if (!stopped && !es) { timer.clear(wait); onState('checking'); probe(); } };
  poke = mine;
  const stop = () => { stopped = true; timer.clear(wait); close(); if (poke === mine) poke = null; win?.removeEventListener?.('storage', onOwner); onState('off'); };
  // another tab signed this account out, or signed someone else in: this page
  // offers nothing more, for good (a reload is a page for whoever is here now,
  // and the page past the door reloads itself on the same change: brain.js
  // claimBrowser; this stops the stream first, before any reconnect)
  function onOwner(e) {
    if (stopped || (e?.key != null && e.key !== OWNER_KEY)) return;   // null: the whole storage was cleared
    let owner = null;
    try { owner = localStorage.getItem(OWNER_KEY); } catch { /* unreadable: nobody's */ }
    if (owner !== String(as)) stop();
  }
  if (as) win?.addEventListener?.('storage', onOwner);
  return stop;
}
