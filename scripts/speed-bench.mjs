// HOW FAST, ON THIS COMPUTER'S OWN SIGN-IN. Colin, 2026-10-19: "as an ai
// harness, i wonder about token speed and cross-model collaboration -- could we
// display tokens per second and also figure out how to maximize that number?"
//
// Runs one fixed turn through y3kode's own brain path (y3k-code/brain.mjs
// thinkWithClaude, the exact code a presence thinks through) for each model and
// effort asked, and prints the clock it keeps: the first token, the first word,
// the model's own rate, and how much of the turn was thinking. Spends a little
// of the plan Claude Code is signed in to (about a thousand tokens a run).
//
//   node scripts/speed-bench.mjs
//   MODELS=claude-haiku-4-5,claude-opus-5-5 EFFORTS=low RUNS=2 node scripts/speed-bench.mjs
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { thinkWithClaude } from '../y3k-code/brain.mjs';

const MODELS = (process.env.MODELS || 'claude-haiku-4-5,claude-sonnet-5-5,claude-opus-5-5').split(',');
const EFFORTS = (process.env.EFFORTS || 'low,medium').split(',');
const RUNS = Number(process.env.RUNS || 1);
const system = 'You are a presence on yearthreethousand, speaking aloud to the person in front of you. Answer warmly and plainly.';
const prompt = process.env.PROMPT || 'Tell me about the sea at night, in about a hundred words.';

const rows = [];
for (const model of MODELS) {
  for (const effort of EFFORTS) {
    for (let i = 0; i < RUNS; i++) {
      const r = await thinkWithClaude({ bin: process.env.CLAUDE_BIN || 'claude', env: process.env, tmpDir: join(tmpdir(), 'y3k-speed-bench'), system, prompt, model, effort, onPart: () => {} });
      const s = r.speed || {};
      rows.push({ model, effort, ok: r.ok, out: s.out, think: s.think, firstMs: s.firstMs, wordMs: s.wordMs, genMs: s.genMs, tps: s.tps, error: r.ok ? '' : r.error });
      console.log(JSON.stringify(rows.at(-1)));
    }
  }
}
console.log('\nmodel               effort  tok/s  first token  first word  output (thinking)');
for (const r of rows) {
  const sec = (ms) => (ms == null ? '   -  ' : (ms / 1000).toFixed(2).padStart(6) + 's');
  console.log(`${r.model.padEnd(19)} ${r.effort.padEnd(7)} ${String(r.tps ?? '-').padStart(5)}  ${sec(r.firstMs)}     ${sec(r.wordMs)}    ${r.out ?? '-'} (${r.think ?? '-'})${r.ok ? '' : '  FAILED ' + r.error}`);
}
