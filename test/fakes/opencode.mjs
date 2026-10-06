#!/usr/bin/env node
// A stand-in for `opencode serve` (1.18.32's HTTP API and event stream, in the
// shapes test/fixtures/code/opencode-1.18.32-turn.ndjson recorded). One turn:
// the build agent hands work to a subagent with its task tool, which (as
// 1.18.32 does) makes a session whose parentID is the main one and names it
// in the task part's metadata before the subagent starts. The subagent's
// command asks first, and the subagent goes idle while the main session is
// still working. The next turn does the same until its ask, where it waits to
// be stopped. Every request is logged to $FAKE_OPENCODE_LOG, and each start
// with the permission rules it was given.
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('1.18.32'); process.exit(0); }
const LOG = process.env.FAKE_OPENCODE_LOG;
const log = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify(o) + '\n'); };
log({ kind: 'spawn', permission: process.env.OPENCODE_PERMISSION ?? null });
const AUTH = `Basic ${Buffer.from(`opencode:${process.env.OPENCODE_SERVER_PASSWORD || ''}`).toString('base64')}`;
const MAIN = 'ses_fakemain000000000000001';
const CHILD = 'ses_fakechild00000000000001';

const streams = new Set();
let n = 0;
const send = (type, properties) => { const line = `data: ${JSON.stringify({ id: `evt_${++n}`, type, properties })}\n\n`; for (const s of streams) s.write(line); };
const asked = new Map(); // permission id → resolve
const tick = () => new Promise((r) => setTimeout(r, 5));

async function turn() {
  while (!streams.size) await tick();
  send('session.status', { sessionID: MAIN, status: { type: 'busy' } });
  send('message.updated', { sessionID: MAIN, info: { id: 'msg_main1', role: 'assistant', sessionID: MAIN, time: { created: 1 } } });
  const task = { id: 'prt_task', messageID: 'msg_main1', sessionID: MAIN, type: 'tool', tool: 'task', callID: 'call_task' };
  const input = { description: 'Look around', prompt: 'List the files here.', subagent_type: 'general' };
  send('message.part.updated', { sessionID: MAIN, part: { ...task, state: { status: 'pending', input: {}, raw: '' } } });
  send('session.created', { sessionID: CHILD, info: { id: CHILD, parentID: MAIN, title: 'Look around (@general subagent)' } });
  send('message.part.updated', { sessionID: MAIN, part: { ...task, state: { status: 'running', input, title: 'Look around', metadata: { parentSessionId: MAIN, sessionId: CHILD }, time: { start: 1 } } } });

  // the subagent, in its own session
  send('session.status', { sessionID: CHILD, status: { type: 'busy' } });
  send('message.updated', { sessionID: CHILD, info: { id: 'msg_child1', role: 'assistant', sessionID: CHILD, time: { created: 2 } } });
  send('message.part.updated', { sessionID: CHILD, part: { id: 'prt_ctext', messageID: 'msg_child1', sessionID: CHILD, type: 'text', text: '', time: { start: 2 } } });
  send('message.part.delta', { sessionID: CHILD, messageID: 'msg_child1', partID: 'prt_ctext', field: 'text', delta: 'Listing the files now.' });
  send('message.part.updated', { sessionID: CHILD, part: { id: 'prt_ctext', messageID: 'msg_child1', sessionID: CHILD, type: 'text', text: 'Listing the files now.', time: { start: 2, end: 3 } } });
  const ls = { id: 'prt_ls', messageID: 'msg_child1', sessionID: CHILD, type: 'tool', tool: 'bash', callID: 'call_ls' };
  const lsInput = { command: 'ls', description: 'List files' };
  send('message.part.updated', { sessionID: CHILD, part: { ...ls, state: { status: 'running', input: lsInput, time: { start: 3 } } } });
  const answer = await new Promise((resolve) => {
    asked.set('per_child1', resolve);
    send('permission.asked', { id: 'per_child1', sessionID: CHILD, permission: 'bash', patterns: ['ls'], metadata: { command: 'ls' }, always: ['ls *'], tool: { messageID: 'msg_child1', callID: 'call_ls' } });
  });
  send('permission.replied', { sessionID: CHILD, requestID: 'per_child1', reply: answer.reply });
  if (answer.reply === 'reject') send('message.part.updated', { sessionID: CHILD, part: { ...ls, state: { status: 'error', input: lsInput, error: 'The user rejected permission to use this specific tool call.' } } });
  else send('message.part.updated', { sessionID: CHILD, part: { ...ls, state: { status: 'completed', input: lsInput, output: 'hello.txt\n', title: 'ls', metadata: { output: 'hello.txt\n', exit: 0 } } } });
  send('message.updated', { sessionID: CHILD, info: { id: 'msg_child1', role: 'assistant', sessionID: CHILD, time: { created: 2, completed: 4 }, tokens: { input: 900, output: 30, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0.002, providerID: 'fake', modelID: 'fake-model', finish: 'stop' } });
  send('session.status', { sessionID: CHILD, status: { type: 'idle' } });
  send('session.idle', { sessionID: CHILD });
  await tick();

  // back in the main session, which is still working
  send('message.part.updated', { sessionID: MAIN, part: { ...task, state: { status: 'completed', input, output: 'hello.txt', title: 'Look around', metadata: { parentSessionId: MAIN, sessionId: CHILD } } } });
  send('message.updated', { sessionID: MAIN, info: { id: 'msg_main1', role: 'assistant', sessionID: MAIN, time: { created: 1, completed: 5 }, tokens: { input: 1200, output: 40, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0.003, providerID: 'fake', modelID: 'fake-model', finish: 'tool-calls' } });
  send('message.updated', { sessionID: MAIN, info: { id: 'msg_main2', role: 'assistant', sessionID: MAIN, time: { created: 6 } } });
  send('message.part.updated', { sessionID: MAIN, part: { id: 'prt_mtext', messageID: 'msg_main2', sessionID: MAIN, type: 'text', text: 'There is one file, hello.txt.', time: { start: 6, end: 7 } } });
  send('message.updated', { sessionID: MAIN, info: { id: 'msg_main2', role: 'assistant', sessionID: MAIN, time: { created: 6, completed: 7 }, tokens: { input: 1300, output: 12, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0.001, providerID: 'fake', modelID: 'fake-model', finish: 'stop' } });
  send('session.status', { sessionID: MAIN, status: { type: 'idle' } });
  send('session.idle', { sessionID: MAIN });
}

// Stopped while the subagent's command is asking. As 1.18.32 does, the ask is
// dropped from OpenCode's own list with no permission.replied, and both
// sessions end their messages as aborted.
let stop = null;
async function stoppedTurn() {
  const CHILD2 = 'ses_fakechild00000000000002';
  send('session.status', { sessionID: MAIN, status: { type: 'busy' } });
  send('message.updated', { sessionID: MAIN, info: { id: 'msg_main3', role: 'assistant', sessionID: MAIN, time: { created: 8 } } });
  const task = { id: 'prt_task2', messageID: 'msg_main3', sessionID: MAIN, type: 'tool', tool: 'task', callID: 'call_task2' };
  const input = { description: 'Look again', prompt: 'List the files here.', subagent_type: 'general' };
  send('session.created', { sessionID: CHILD2, info: { id: CHILD2, parentID: MAIN, title: 'Look again (@general subagent)' } });
  send('message.part.updated', { sessionID: MAIN, part: { ...task, state: { status: 'running', input, title: 'Look again', metadata: { parentSessionId: MAIN, sessionId: CHILD2 }, time: { start: 8 } } } });
  send('session.status', { sessionID: CHILD2, status: { type: 'busy' } });
  send('message.updated', { sessionID: CHILD2, info: { id: 'msg_child2', role: 'assistant', sessionID: CHILD2, time: { created: 9 } } });
  const ls = { id: 'prt_ls2', messageID: 'msg_child2', sessionID: CHILD2, type: 'tool', tool: 'bash', callID: 'call_ls2' };
  const lsInput = { command: 'ls', description: 'List files' };
  send('message.part.updated', { sessionID: CHILD2, part: { ...ls, state: { status: 'running', input: lsInput, time: { start: 9 } } } });
  await new Promise((resolve) => {
    stop = resolve;
    asked.set('per_child2', () => {});
    send('permission.asked', { id: 'per_child2', sessionID: CHILD2, permission: 'bash', patterns: ['ls'], metadata: { command: 'ls' }, always: ['ls *'], tool: { messageID: 'msg_child2', callID: 'call_ls2' } });
  });
  asked.delete('per_child2');
  const aborted = { name: 'MessageAbortedError', data: { message: 'The operation was aborted.' } };
  send('message.part.updated', { sessionID: CHILD2, part: { ...ls, state: { status: 'error', input: lsInput, error: 'Tool execution aborted' } } });
  send('message.updated', { sessionID: CHILD2, info: { id: 'msg_child2', role: 'assistant', sessionID: CHILD2, time: { created: 9, completed: 10 }, error: aborted, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0, providerID: 'fake', modelID: 'fake-model' } });
  send('session.status', { sessionID: CHILD2, status: { type: 'idle' } });
  send('session.idle', { sessionID: CHILD2 });
  send('message.part.updated', { sessionID: MAIN, part: { ...task, state: { status: 'error', input, error: 'Tool execution aborted' } } });
  send('message.updated', { sessionID: MAIN, info: { id: 'msg_main3', role: 'assistant', sessionID: MAIN, time: { created: 8, completed: 10 }, error: aborted, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0, providerID: 'fake', modelID: 'fake-model' } });
  send('session.status', { sessionID: MAIN, status: { type: 'idle' } });
  send('session.idle', { sessionID: MAIN });
}

let turns = 0;
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    log({ method: req.method, path: url.pathname, body: body ? JSON.parse(body) : null });
    if (req.headers.authorization !== AUTH) { res.writeHead(401); return res.end(); }
    const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const p = url.pathname;
    if (p === '/event') { res.writeHead(200, { 'content-type': 'text/event-stream' }); streams.add(res); res.on('close', () => streams.delete(res)); return; }
    if (p === '/config/providers') return json({ providers: [{ id: 'fake', name: 'Fake', models: { 'fake-model': { id: 'fake-model', name: 'Fake model', limit: { context: 32768 } } } }], default: { fake: 'fake-model' } });
    if (p === '/config') return json({});
    if (p === '/session' && req.method === 'POST') return json({ id: MAIN });
    if (p === `/session/${MAIN}` && req.method === 'GET') return json({ id: MAIN });
    if (p === `/session/${MAIN}/prompt_async`) { res.writeHead(204); res.end(); (++turns === 1 ? turn : stoppedTurn)(); return; }
    if (p === `/session/${MAIN}/abort`) { stop?.(); stop = null; return json(true); }
    const m = /^\/permission\/([^/]+)\/reply$/.exec(p);
    if (m) {
      const resolve = asked.get(m[1]);
      if (!resolve) return json({ name: 'NotFoundError', data: { message: 'no such request' } }, 404);
      asked.delete(m[1]);
      resolve(JSON.parse(body || '{}'));
      return json(true);
    }
    return json({ name: 'NotFoundError' }, 404);
  });
});
server.listen(0, '127.0.0.1', () => console.log(`opencode server listening on http://127.0.0.1:${server.address().port}`));
