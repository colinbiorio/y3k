// THE AGENT PANEL (0.3.18, 2026-11-04). Colin: "show an agent panel that shows any live agent/agents
// and a description of what they're working on -- if the user can't see what the ai is doing that
// leads to issues." Every Claude Code session on this computer writes its transcript under
// ~/.claude/projects/<folder>/<session>.jsonl, and every subagent it starts writes
// <session>/subagents/agent-*.jsonl beside a .meta.json with its description and whether it finished.
// So this reads those, read-only: the sessions written to in the last WINDOW, their subagents, what
// each asked for and what each is doing now. Burn's conversation and kode's own are named as such.
// Nothing here is sent anywhere but this person's kode.
import { readdirSync, statSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { feedOf } from './burn.mjs';

export const WINDOW = 30 * 60 * 1000;   // a session written to in the last half hour is listed
export const LIVE = 2 * 60 * 1000;      // written to in the last two minutes: live

function slice(path, from, len) {
  const fd = openSync(path, 'r');
  try { const b = Buffer.alloc(len); const n = readSync(fd, b, 0, len, from); return b.subarray(0, n).toString('utf8'); } finally { closeSync(fd); }
}
const head = (path, n = 64 * 1024) => slice(path, 0, n);
const tail = (path, size, n = 128 * 1024) => slice(path, Math.max(0, size - n), Math.min(size, n));

// what the session was asked: its custom title if it has one, else its first words from a person
export function askedOf(text) {
  let first = null, title = null;
  for (const line of String(text).split('\n')) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e?.type === 'custom-title' && e.customTitle) title = String(e.customTitle);
    if (!first && e?.type === 'user' && !e.isMeta) {
      const c = e.message?.content;
      const t = typeof c === 'string' ? c : Array.isArray(c) ? (c.find((x) => x.type === 'text')?.text || '') : '';
      if (t && !t.startsWith('<')) first = t;
    }
  }
  return (title || first || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function listAgents({ home, now = Date.now(), burnSid = null, kode = new Map() }) {
  const root = join(home, 'projects');
  const out = [];
  let folders = [];
  try { folders = readdirSync(root); } catch { return out; }
  for (const folder of folders) {
    let files = [];
    try { files = readdirSync(join(root, folder)); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const path = join(root, folder, f);
      let st; try { st = statSync(path); } catch { continue; }
      if (now - st.mtimeMs > WINDOW) continue;
      const sid = f.slice(0, -6);
      const feed = feedOf(tail(path, st.size), 6);
      const role = sid === burnSid ? 'burn' : kode.has(sid) ? 'kode' : 'session';
      const subs = [];
      const sd = join(root, folder, sid, 'subagents');
      let names = [];
      try { names = readdirSync(sd).filter((n) => n.endsWith('.meta.json')); } catch { /* none */ }
      for (const n of names) {
        let meta = {}; try { meta = JSON.parse(readFileSync(join(sd, n), 'utf8')); } catch { continue; }
        const jp = join(sd, n.slice(0, -'.meta.json'.length) + '.jsonl');
        let js; try { js = statSync(jp); } catch { continue; }
        if (now - js.mtimeMs > WINDOW && meta.finished) continue;
        const live = !meta.finished && now - js.mtimeMs < LIVE;
        subs.push({ id: n.slice(0, -'.meta.json'.length), description: String(meta.description || meta.agentType || 'agent').slice(0, 160),
          state: meta.finished ? 'done' : live ? 'live' : 'quiet', touched: js.mtimeMs, now: feedOf(tail(jp, js.size), 3) });
      }
      subs.sort((a, b) => b.touched - a.touched);
      out.push({ sid, folder: folder.replace(/^-/, '/').replace(/-/g, '/'), role, title: kode.get(sid) || null,
        asked: askedOf(head(path)), state: now - st.mtimeMs < LIVE ? 'live' : 'quiet', touched: st.mtimeMs, now: feed, agents: subs });
    }
  }
  out.sort((a, b) => b.touched - a.touched);
  return out;
}
