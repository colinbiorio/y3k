// The engine inside the y3k desktop app. Electron runs this file in a utility
// process (desktop/code-host.cjs), so the coding tools it starts are neither in
// the window (a reload keeps them running) nor in the app's main process (a
// fault here cannot take the window down).
//
// It speaks to the main process over `process.parentPort` and nothing else —
// no page door, no network. Its one port is the coders' orb tool (orb.mjs):
// loopback, its own token per session, never a page. The main process passes
// on the page's commands (only from the site's own main frame) and shows the
// native dialogs this asks for.
//
//   main → here   { type: 'cmd', id, cmd }            → { type: 'reply', id, result }
//                 { type: 'since', id, after }        → { type: 'reply', id, result: events }
//                 { type: 'consent', id, allowed }    (the person's answer)
//                 { type: 'shutdown' }                → { type: 'bye' } once every tool has stopped
//   here → main   { type: 'event', event }
//                 { type: 'consent', id, kind, text } (please ask the person)
//                 { type: 'restart', version }        (engine.update unpacked a newer
//                                                      version into Y3K_ENGINE_DIR: run it)
//
// An installed app may start a newer engine than the one it shipped with
// (update.mjs), so these messages only ever gain kinds: an app that does not
// know one ignores it.

import { configDir, createStore } from './store.mjs';
import { createEngine } from './engine.mjs';
import { describe } from './consent.mjs';
import { reapAll } from './proc.mjs';
import { createOrbServer } from './http.mjs';
import { siteOrigin } from './update.mjs';

export function startHost(port, { env = process.env, store = createStore(configDir(env)), bins, exit = (c) => process.exit(c) } = {}) {
  const asking = new Map();
  let n = 0;
  const post = (m) => { try { port.postMessage(m); } catch { /* main is gone */ } };

  // Every yes that matters is asked in a native dialog, by the main process.
  const consent = (kind, detail) => new Promise((resolve) => {
    const id = ++n;
    asking.set(id, resolve);
    post({ type: 'consent', id, kind, text: describe(kind, detail) });
  });

  // The coders' orb tool (orb.mjs) needs a door they can reach: the one
  // loopback listener here, for that and nothing else.
  let orbPort = 0;
  // engine.update, when the app says where the site is and where versions go
  const site = siteOrigin(env.Y3K_SITE || '');
  const update = site && env.Y3K_ENGINE_DIR ? { site, root: env.Y3K_ENGINE_DIR, restart: ({ version }) => post({ type: 'restart', version }) } : null;
  const engine = createEngine({ store, consent, env, bins, door: () => (orbPort ? `http://127.0.0.1:${orbPort}` : null), update });
  const orbServer = createOrbServer({ engine });
  orbServer.listen().then((p) => { orbPort = p; }).catch(() => { /* no orb tool, everything else as before */ });
  engine.subscribe((event) => post({ type: 'event', event }));

  async function shutdown() {
    engine.shutdown();
    orbServer.close().catch(() => {});
    for (let i = 0; i < 40 && engine.liveChildren() > 0; i++) await new Promise((r) => setTimeout(r, 100));
    reapAll();
    post({ type: 'bye' });
    setTimeout(() => exit(0), 50);
  }

  port.on('message', async (msg) => {
    const m = msg?.data ?? msg;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'cmd') {
      const result = await engine.handle(m.cmd, { via: 'desktop' });
      post({ type: 'reply', id: m.id, result });
    } else if (m.type === 'since') {
      post({ type: 'reply', id: m.id, result: engine.since(Math.max(0, m.after | 0)) ?? engine.since(0) ?? [] });
    } else if (m.type === 'consent') {
      const fn = asking.get(m.id);
      asking.delete(m.id);
      fn?.(m.allowed === true);
    } else if (m.type === 'shutdown') {
      for (const fn of asking.values()) fn(false);
      asking.clear();
      shutdown();
    }
  });

  return { engine, shutdown };
}

if (process.parentPort) startHost(process.parentPort);
