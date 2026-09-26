#!/usr/bin/env node
// Drive the REAL `claude` through the y3k Code engine, in a throwaway git repo,
// with your own sign-in: Edit (diff shown first) → allow → Bash (command shown
// first) → allow → the turn ends. Never run in CI — it uses your account.
//
//   node scripts/code-real-claude.mjs [--model haiku] [--key]   (--key: use ANTHROPIC_API_KEY)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { fixedConsent } from '../y3k-code/consent.mjs';

const argv = process.argv.slice(2);
const model = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : 'haiku';
const base = mkdtempSync(join(tmpdir(), 'y3k-code-real-'));
const repo = join(base, 'repo');
mkdirSync(repo);
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
execFileSync('git', ['init', '-q'], { cwd: repo });

const store = createStore(join(base, 'config'));
if (argv.includes('--key')) store.setSecret('claude', process.env.ANTHROPIC_API_KEY || '');
else store.setConfig({ signIn: true });
const engine = createEngine({ store, consent: fixedConsent(true) });
const seen = [];
const fail = (why) => { console.error(`\n✗ ${why}`); finish(1); };
let sid;
const permissions = [];

engine.subscribe(async (e) => {
  if (e.sid && e.sid !== sid) return;
  seen.push(e);
  switch (e.type) {
    case 'session.ready': console.log(`ready: claude ${e.version}, ${e.model}, mode ${e.mode}, auth ${e.auth}`); break;
    case 'message.delta': if (e.kind === 'text') process.stdout.write(e.text); break;
    case 'tool.call': console.log(`\n→ ${e.name}: ${e.title}`); break;
    case 'tool.result': console.log(`← ${e.status}${e.diff ? ` (+${e.diff[0].added ?? '?'} −${e.diff[0].removed ?? '?'})` : ''}${e.output?.text ? `: ${e.output.text.split('\n')[0].slice(0, 80)}` : ''}`); break;
    case 'permission.request': {
      permissions.push(e);
      const before = readFileSync(join(repo, 'hello.txt'), 'utf8');
      if (e.kind === 'edit') {
        if (!e.preview?.diff?.[0]?.hunks?.length) return fail('Edit asked without a diff to show');
        if (before !== 'hello\nworld\n') return fail('the file changed before it was allowed');
        console.log(`\n? allow ${e.tool}? diff first:\n${e.preview.diff[0].hunks.flatMap((h) => h.lines).map((l) => '    ' + l).join('\n')}`);
      } else if (e.kind === 'bash') {
        if (!e.preview?.command) return fail('Bash asked without its command');
        console.log(`\n? allow ${e.tool}? command first: ${e.preview.command} (in ${e.preview.cwd})`);
      } else console.log(`\n? allow ${e.tool} (${e.kind})?`);
      const r = await engine.handle({ cmd: 'permission.answer', sid, requestId: e.requestId, decision: 'allow' });
      if (!r.ok) fail(`answer refused: ${r.error}`);
      break;
    }
    case 'usage.limits': console.log(`\nlimits: ${e.windows.map((w) => `${w.kind} ${Math.round((w.utilization ?? 0) * 100)}%`).join(', ')}`); break;
    case 'usage.context': if (e.source === 'context') console.log(`context: ${e.used}/${e.limit} (${e.percent}%)`); break;
    case 'usage.cost': console.log(`cost (API-equivalent): $${e.totalUsd.toFixed(4)}`); break;
    case 'turn.ended': {
      console.log(`\n\nturn ended: ${e.status}`);
      const text = readFileSync(join(repo, 'hello.txt'), 'utf8');
      const kinds = permissions.map((p) => p.kind);
      const bash = seen.find((x) => x.type === 'tool.call' && x.kind === 'bash');
      const check = [
        ['edit asked with a diff first', kinds.includes('edit')],
        ['file changed after allow', text === 'hello\ny3k\n'],
        ['bash asked with its command first', kinds.includes('bash')],
        ['bash ran', !!bash && seen.some((x) => x.type === 'tool.result' && x.callId === bash.callId && x.status === 'ok')],
        ['limits reported', seen.some((x) => x.type === 'usage.limits')],
        ['turn succeeded', e.status === 'success'],
      ];
      for (const [name, pass] of check) console.log(`${pass ? '✓' : '✗'} ${name}`);
      setTimeout(() => finish(check.every(([, p]) => p) ? 0 : 1), 1500);
      break;
    }
    case 'session.ended': if (!['exited', 'stopped'].includes(e.reason)) console.log(`session ended: ${e.reason} ${e.detail || ''}`); break;
    case 'notice': console.log(`[${e.level}] ${e.text}`); break;
  }
});

function finish(code) {
  engine.shutdown();
  setTimeout(() => { rmSync(base, { recursive: true, force: true }); process.exit(code); }, 800);
}

const t = await engine.handle({ cmd: 'workspace.open', path: repo });
if (!t.ok) fail(t.error);
const s = await engine.handle({ cmd: 'session.start', provider: 'claude', cwd: repo, mode: 'ask', model });
if (!s.ok) fail(`${s.code}: ${s.error}`);
sid = s.sid;
await engine.handle({ cmd: 'session.send', sid, text: "Use the Edit tool to change the word 'world' to 'y3k' in hello.txt. Then use the Bash tool to run: touch y3k-was-here && cat hello.txt. Then reply with just: done." });
setTimeout(() => fail('timed out after 180 s'), 180000).unref();
