#!/usr/bin/env node
// A stand-in `claude` (a second reader, 2026-11-08): logs each conversation process it is started as to
// $FAKE_SPAWNS, says init, answers control requests, and waits. --version can be slowed ($FAKE_SLOW_MS).
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const args = process.argv.slice(2);
if (args[0] === '--version') { setTimeout(() => { process.stdout.write('2.1.283 (Claude Code)\n'); process.exit(0); }, Number(process.env.FAKE_SLOW_MS || 0)); }
else if (args[0] === 'auth') { process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }) + '\n'); process.exit(0); }
else {
  appendFileSync(process.env.FAKE_SPAWNS, JSON.stringify({ pid: process.pid, args }) + '\n');
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  const sid = args[args.indexOf('--resume') + 1] || args[args.indexOf('--session-id') + 1];
  out({ type: 'system', subtype: 'init', session_id: sid, cwd: process.cwd(), model: 'fake', permissionMode: 'default', tools: [], mcp_servers: [] });
  createInterface({ input: process.stdin }).on('line', (line) => {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (m.type === 'control_request') out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } });
  }).on('close', () => process.exit(0));
}
