// THE AGENT PANEL (0.3.18): agents.list reads Claude Code's transcripts on this computer, read-only.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listAgents, askedOf } from '../y3k-code/agents.mjs';
import { COMMANDS } from '../src/code/protocol.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const home = mkdtempSync(join(tmpdir(), 'y3k-agents-'));
const proj = join(home, 'projects', '-Users-c-work');
mkdirSync(join(proj, 'S1', 'subagents'), { recursive: true });
const J = (o) => JSON.stringify(o);
const say = (t) => J({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
const tool = (d) => J({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { description: d } }] } });
const now = Date.now();
const at = (p, ms) => utimesSync(p, new Date(ms), new Date(ms));

writeFileSync(join(proj, 'S1.jsonl'), [J({ type: 'user', message: { content: 'Prove the lemma.' } }), say('On it.'), tool('Run the checks')].join('\n'));
writeFileSync(join(proj, 'S1', 'subagents', 'agent-a.meta.json'), J({ description: 'Second reader, 32nd Swing' }));
writeFileSync(join(proj, 'S1', 'subagents', 'agent-a.jsonl'), tool('Rerun the MILP'));
writeFileSync(join(proj, 'S1', 'subagents', 'agent-b.meta.json'), J({ description: 'Old reader', finished: true }));
writeFileSync(join(proj, 'S1', 'subagents', 'agent-b.jsonl'), say('done'));
at(join(proj, 'S1', 'subagents', 'agent-b.jsonl'), now - 60 * 60 * 1000);
writeFileSync(join(proj, 'OLD.jsonl'), say('long ago'));
at(join(proj, 'OLD.jsonl'), now - 2 * 60 * 60 * 1000);
writeFileSync(join(proj, 'K1.jsonl'), [J({ type: 'custom-title', customTitle: 'fix the orb' }), J({ type: 'user', message: { content: 'hi' } })].join('\n'));
at(join(proj, 'K1.jsonl'), now - 10 * 60 * 1000);

console.log('\nthe agent panel:');

await ok('lists the sessions of the last half hour with their live agents, what each was asked and is doing', () => {
  const a = listAgents({ home, now, burnSid: 'S1', kode: new Map([['K1', 'the orb conversation']]) });
  assert.deepEqual(a.map((s) => s.sid), ['S1', 'K1'], 'newest first; the two-hour-old one is gone');
  const [b, k] = a;
  assert.equal(b.role, 'burn'); assert.equal(b.state, 'live'); assert.equal(b.asked, 'Prove the lemma.');
  assert.deepEqual(b.now.at(-1), { kind: 'tool', tool: 'Bash', text: 'Run the checks' });
  assert.deepEqual(b.agents.map((x) => [x.description, x.state]), [['Second reader, 32nd Swing', 'live']], 'an old finished agent is not listed');
  assert.equal(b.agents[0].now.at(-1).text, 'Rerun the MILP');
  assert.equal(k.role, 'kode'); assert.equal(k.title, 'the orb conversation'); assert.equal(k.state, 'quiet');
  assert.equal(k.asked, 'fix the orb', 'a custom title wins over the first words');
});

await ok('askedOf skips meta lines and tags; a missing folder lists nothing', () => {
  assert.equal(askedOf([J({ type: 'user', isMeta: true, message: { content: 'x' } }), J({ type: 'user', message: { content: '<cmd>' } }), J({ type: 'user', message: { content: [{ type: 'text', text: 'real ask' }] } })].join('\n')), 'real ask');
  assert.deepEqual(listAgents({ home: join(home, 'nope') }), []);
});

await ok('the page may send agents.list', () => assert.ok(COMMANDS.includes('agents.list')));

console.log(`\n${passed} passed`);
