// WHICH MODELS, AND WHOSE MARK (src/models.js, src/model-mark.js, src/ai-logos.js).
// Run: node test/models.test.mjs
//
// Colin, 2026-10-08: "there should be a dropdown in brain to select model, even
// if not on api … make sure every model from each provider is listed in the
// appropriate dropdown, as well as every appropriate logo".
import assert from 'node:assert';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLAUDE_MODELS, OPENAI_MODELS, modelsFor, makerOf, modelName, _resetCatalog, claudeFromCatalog, claudeMenu, notOffered } from '../src/models.js';
import { thinking } from '../src/model-mark.js';
import { AI_LOGOS } from '../src/ai-logos.js';
import { createEngine } from '../y3k-code/engine.mjs';
import { createStore } from '../y3k-code/store.mjs';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const catalogOf = (models) => async (url) => { assert.equal(url, '/api/brain/catalog'); return { ok: true, json: async () => ({ models }) }; };

console.log('the lists:');

await ok('Claude: every model Anthropic serves to everyone, no invitation-only or retired ids', () => {
  const ids = CLAUDE_MODELS.map((m) => m.id);
  for (const id of ['claude-fable-5-1', 'claude-fable-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5',
    'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-5-5', 'claude-haiku-4-5']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.some((id) => /mythos|3-|opus-4-1|2\.\d/.test(id)), ids.join());
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  assert.ok(CLAUDE_MODELS.every((m) => /^Claude (Fable|Opus|Sonnet|Haiku) \d(\.\d)?$/.test(m.label)), 'plain names');
});

const down = async () => { throw new Error('offline'); };

await ok('Claude Code: its own default first, then every Claude model; what it offered this plan first when known, the rest after', async () => {
  _resetCatalog();
  const fixed = await modelsFor('claude', { fetchFn: down });
  assert.equal(fixed[0].id, 'default');
  assert.equal(fixed.length, CLAUDE_MODELS.length + 1);
  const heard = [{ id: 'opus', label: 'Opus' }, { id: 'claude-fable-5-1[1m]', label: 'Fable 5.1 (1M context)' }];
  _resetCatalog();
  const live = await modelsFor('claude', { live: heard, fetchFn: down });
  assert.deepEqual(live.slice(0, 3).map((m) => m.id), ['default', 'opus', 'claude-fable-5-1[1m]'], 'what it offered, first');
  assert.ok(!live.some((m) => m.id === 'claude-fable-5-1'), 'a model it offered (with its window suffix) is not listed twice');
  assert.ok(live.some((m) => m.id === 'claude-fable-5-2') && live.some((m) => m.id === 'claude-haiku-4-5'), 'every other Claude model follows');
  _resetCatalog();
  assert.deepEqual((await modelsFor('claude', { live: [{ id: 'default', label: 'Default' }, ...heard], fetchFn: down })).slice(0, 3).map((m) => m.id), ['default', 'opus', 'claude-fable-5-1[1m]'], 'its own default is not added twice');
  _resetCatalog();
});

await ok('Anthropic without a key: every Claude model, the floor when the catalog is down', async () => {
  _resetCatalog();
  assert.deepEqual(await modelsFor('anthropic', { fetchFn: down }), CLAUDE_MODELS);
  _resetCatalog();
});

await ok("the menu updates itself: a Claude model the site's catalog knows and the floor does not is on the menu, in its family's place, under Anthropic's id; retired and invitation-only ones are not (Colin, 12 Nov 2026)", async () => {
  const cat = [{ id: 'anthropic/claude-fable-5.3', name: 'Anthropic: Claude Fable 5.3' }, { id: 'anthropic/claude-fable-5.2', name: 'Anthropic: Claude Fable 5.2' },
    { id: 'anthropic/claude-opus-4.5', name: 'Anthropic: Claude Opus 4.5' }, { id: 'anthropic/claude-opus-4.5:beta', name: 'beta' }, { id: 'anthropic/claude-3.7-sonnet', name: 'Anthropic: Claude 3.7 Sonnet' },
    { id: 'anthropic/claude-sonnet-6', name: 'Anthropic: Claude Sonnet 6' }, { id: 'anthropic/claude-mythos-5', name: 'Mythos' }, { id: 'openai/gpt-5.1', name: 'OpenAI: GPT-5.1' }];
  assert.deepEqual(claudeFromCatalog(cat).map((m) => m.id), ['claude-fable-5-3', 'claude-fable-5-2', 'claude-opus-4-5', 'claude-sonnet-6']);
  assert.equal(claudeFromCatalog(cat)[1], CLAUDE_MODELS[0], "a model the floor names keeps the floor's entry");
  const menu = claudeMenu(cat);
  assert.deepEqual(menu.slice(0, 3).map((m) => m.id), ['claude-fable-5-3', 'claude-fable-5-2', 'claude-fable-5-1'], 'newest first in its family');
  assert.equal(menu.find((m) => m.id === 'claude-fable-5-3').label, 'Claude Fable 5.3');
  assert.ok(menu.findIndex((m) => m.id === 'claude-sonnet-6') > menu.findIndex((m) => m.id === 'claude-opus-4-0'), 'sonnets after every opus');
  assert.equal(new Set(menu.map((m) => m.id)).size, menu.length, 'no id twice');
  assert.deepEqual(claudeMenu([]), CLAUDE_MODELS, 'an empty catalog is the floor');
  _resetCatalog();
  assert.equal((await modelsFor('anthropic', { fetchFn: catalogOf(cat) }))[0].id, 'claude-fable-5-3');
  _resetCatalog();
  assert.deepEqual((await modelsFor('claude', { fetchFn: catalogOf(cat) })).slice(0, 2).map((m) => m.id), ['default', 'claude-fable-5-3']);
  _resetCatalog();
});

await ok('OpenAI and OpenRouter without a key: the site\'s catalog, OpenAI\'s own names', async () => {
  _resetCatalog();
  const fetchFn = catalogOf([{ id: 'openai/gpt-5.1', name: 'OpenAI: GPT-5.1' }, { id: 'anthropic/claude-opus-5.5', name: 'Anthropic: Claude Opus 5.5' }, { id: 'google/gemini-3-pro', name: 'Google: Gemini 3 Pro' }]);
  assert.deepEqual(await modelsFor('openai', { fetchFn }), [{ id: 'gpt-5.1', label: 'GPT-5.1' }]);
  const or = await modelsFor('openrouter', { fetchFn });
  assert.deepEqual(or.map((m) => m.id), ['openai/gpt-5.1', 'anthropic/claude-opus-5.5', 'google/gemini-3-pro']);
  _resetCatalog();
});

await ok('the site cannot reach the catalog: OpenAI\'s long-standing models, and OpenRouter waits for a key', async () => {
  _resetCatalog();
  assert.deepEqual(await modelsFor('openai', { fetchFn: down }), OPENAI_MODELS);
  _resetCatalog();
  assert.deepEqual(await modelsFor('openrouter', { fetchFn: down }), []);
  _resetCatalog();
});

console.log('\nthe marks:');

await ok('every mark is a real path set in a 24-unit box, and the references are there: Claude and OpenAI', () => {
  for (const [k, m] of Object.entries(AI_LOGOS)) {
    assert.ok(m.label && Array.isArray(m.d) && m.d.length, k);
    assert.ok(m.d.every((d) => typeof d === 'string' && /^M[\d.\s-]/.test(d) && d.length > 10), k);
  }
  assert.ok(AI_LOGOS.claude.d[0].startsWith('M4.709 15.955l4.72-2.647'), 'Claude\'s spark, as published');
  assert.ok(AI_LOGOS.openai.d[0].startsWith('M9.205 8.658v-2.26'), 'OpenAI\'s knot, as published');
});

await ok('a model shows its maker\'s mark, whichever door it came through', () => {
  assert.equal(makerOf('claude', 'default'), 'claude');
  assert.equal(makerOf('anthropic', 'claude-opus-5-5'), 'claude');
  assert.equal(makerOf('openai', 'gpt-5'), 'openai');
  const via = { 'anthropic/claude-opus-5.5': 'claude', 'openai/gpt-5.1': 'openai', 'google/gemini-3-pro': 'gemini', 'x-ai/grok-4': 'xai',
    'deepseek/deepseek-r1': 'deepseek', 'mistralai/mistral-large': 'mistral', 'meta-llama/llama-4-maverick': 'meta', 'qwen/qwen3-coder': 'qwen',
    'cohere/command-a': 'cohere', 'moonshotai/kimi-k2': 'kimi', 'z-ai/glm-4.6': 'zhipu', 'minimax/minimax-m2': 'minimax',
    'perplexity/sonar-pro': 'perplexity', 'nvidia/nemotron-70b': 'nvidia', 'microsoft/phi-4': 'microsoft', 'amazon/nova-pro-v1': 'aws', 'someone/new-model': 'openrouter' };
  for (const [id, want] of Object.entries(via)) assert.equal(makerOf('openrouter', id), want, id);
  for (const want of new Set(Object.values(via))) assert.ok(AI_LOGOS[want], `a mark for ${want}`);
});

await ok('names for people: the list\'s own, else made from the id', () => {
  assert.equal(modelName('claude-opus-5-5'), 'Claude Opus 5.5');
  assert.equal(modelName('claude-opus-4-0'), 'Claude Opus 4');
  assert.equal(modelName('claude-fable-5-1[1m]'), 'Claude Fable 5.1 1M');
  assert.equal(modelName('claude-sonnet-6'), 'Claude Sonnet 6', 'a newer Claude than the list still reads right');
  assert.equal(modelName('gpt-5', [{ id: 'gpt-5', label: 'GPT-5' }]), 'GPT-5');
  assert.equal(modelName('anthropic/claude-haiku-5-5'), 'Claude Haiku 5.5');
});

await ok('what is thinking: your own Claude Code first, then a key in use, else nothing (the site has no key of its own)', () => {
  assert.deepEqual(thinking({ own: { model: null }, key: { provider: 'openai', model: 'gpt-5' } }), { maker: 'claude', name: 'Claude Code' });
  assert.deepEqual(thinking({ own: { model: 'claude-opus-5-5' } }), { maker: 'claude', name: 'Claude Opus 5.5' });
  assert.deepEqual(thinking({ key: { provider: 'openrouter', model: 'google/gemini-3-pro' } }), { maker: 'gemini', name: 'gemini-3-pro' });
  assert.equal(thinking({}), null);
  // a site model handed in by an older caller is not something thinking for you
  assert.equal(thinking({ site: 'claude-opus-4-8' }), null, 'the site\'s own model is shown as thinking');
  const src = readFileSync(new URL('../src/model-mark.js', import.meta.url), 'utf8');
  assert.ok(!/site/.test(src.slice(src.indexOf('export function thinking'), src.indexOf('export function createModelMark'))), 'model-mark.js still takes a site model');
});

await ok("the models Claude Code did not name: the site's less what it offered, by bare id and by what an alias resolves to (Colin, 12 Nov 2026)", () => {
  const every = [{ id: 'claude-fable-5-2', label: 'Claude Fable 5.2' }, { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' }, { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }, { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }];
  const offered = [{ id: 'default', label: 'Default' }, { id: 'opus', label: 'Opus', resolved: 'claude-opus-5-5' }, { id: 'claude-fable-5-1[1m]', label: 'Fable 5.1 (1M)' }];
  assert.deepEqual(notOffered(offered, every).map((m) => m.id), ['claude-fable-5-2', 'claude-haiku-5-5']);
  assert.deepEqual(notOffered([], every), every, 'nothing offered: all of them');
  assert.deepEqual(notOffered(offered, []), [], 'nothing known: none');
  // the control: a naive join by id alone would offer Opus twice
  assert.ok(every.filter((m) => !offered.some((o) => o.id === m.id)).some((m) => m.id === 'claude-opus-5-5'), 'the control is a control');
});

console.log('\ny3kode:');

await ok('models.list gives the models Claude Code last offered, once a session has heard them', async () => {
  const store = createStore(mkdtempSync(join(tmpdir(), 'y3k-models-')));
  const engine = createEngine({ store, consent: async () => false });
  const before = await engine.handle({ cmd: 'models.list', provider: 'claude' });
  assert.equal(before.heard, null);
  assert.ok(before.models.some((m) => m.id === 'default'));
  store.setConfig({ heardModels: { claude: [{ id: 'opus', label: 'Opus', description: 'Most capable', resolved: 'claude-opus-5-5' }] } });
  const after = await engine.handle({ cmd: 'models.list', provider: 'claude' });
  assert.deepEqual(after.heard, [{ id: 'opus', label: 'Opus', description: 'Most capable', resolved: 'claude-opus-5-5' }]);
  engine.shutdown();
});

console.log(`\n${passed} checks passed.`);
process.exit(0);
