// ============================================================================
// models.js — WHICH MODELS EACH PROVIDER HAS, and whose mark goes with each.
//
// Colin, 2026-10-08: "there should be a dropdown in brain to select model, even
// if not on api … make sure every model from each provider is listed". The
// lists, by what is known about each:
//   Claude Code   what y3kode heard Claude Code offer this plan (models.list),
//                 else every Claude model below; plus Claude Code's own default
//   Anthropic     the key's live list (/api/brain/models), else every model below
//   OpenAI        the key's live list, else the site's catalog (OpenRouter's
//                 public list, server-side), else the long-standing models below
//   OpenRouter    the key's live list, else the site's catalog
// The marks (ai-logos.js) follow the MODEL's maker: a Claude model shows
// Claude's mark whichever door it came through.
// ============================================================================

// Every Claude model Anthropic serves to everyone, newest first in each line
// (Anthropic's model table, 2026-11-12). Mythos is by invitation only and
// retired models are gone. THIS LIST IS THE FLOOR, NOT THE MENU (Colin, 12 Nov
// 2026: "the model picker doesn't automatically update to include new models —
// it should"): the menu is this list joined with whatever Claude models the
// site's catalog knows today (claudeFromCatalog), so a model Anthropic ships
// tomorrow is on the menu without a release here.
export const CLAUDE_MODELS = [
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
  { id: 'claude-opus-4-0', label: 'Claude Opus 4' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'claude-sonnet-4-0', label: 'Claude Sonnet 4' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];
export const CLAUDE_CODE_DEFAULT = { id: 'default', label: 'Default', desc: 'The model Claude Code uses for your plan.' };

// OpenAI's long-standing API models, for when neither a key nor the site's
// catalog can say more. The catalog and a key both replace this.
export const OPENAI_MODELS = [
  { id: 'gpt-5', label: 'GPT-5' }, { id: 'gpt-5-mini', label: 'GPT-5 mini' }, { id: 'gpt-5-nano', label: 'GPT-5 nano' },
  { id: 'gpt-4.1', label: 'GPT-4.1' }, { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' }, { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
  { id: 'gpt-4o', label: 'GPT-4o' }, { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'o3', label: 'o3' }, { id: 'o4-mini', label: 'o4-mini' },
];

// The providers a key can be for, by name: for a line that says which one did
// not answer (brain.js whyLine).
export const PROVIDER_NAMES = { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter' };

// The site's catalog: OpenRouter's public model list, grouped (server.mjs
// /api/brain/catalog). Asked once per page; [] when the site could not reach it.
let catalog = null;
export function siteCatalog({ fetchFn = globalThis.fetch } = {}) {
  if (!catalog) {
    catalog = fetchFn('/api/brain/catalog', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => (Array.isArray(d?.models) ? d.models : []))
      .catch(() => []);
  }
  return catalog;
}
export const _resetCatalog = () => { catalog = null; };

// OpenRouter's names carry their maker ("OpenAI: GPT-5"); the menu says who
// already, in the mark beside it.
const bare = (name) => String(name || '').replace(/^[^:]{1,40}:\s*/, '');

// THE CLAUDE MODELS THE CATALOG KNOWS. OpenRouter lists Anthropic's models as
// "anthropic/claude-opus-4.5", "anthropic/claude-fable-5.2" (and the old order,
// "anthropic/claude-3.7-sonnet"); Anthropic's own ids are "claude-opus-4-5",
// "claude-fable-5-2". Each catalog entry is read for its family and version and
// given Anthropic's id; a family or version Anthropic has retired (Claude 3.x,
// 2.x, 1.x) and the invitation-only Mythos are left out, as are variants
// (":beta", ":thinking", dated snapshots). A model the floor already names
// keeps the floor's id and label.
const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'];
export function claudeFromCatalog(all) {
  const out = [];
  for (const m of all || []) {
    const id = String(m?.id || '');
    if (!id.startsWith('anthropic/claude-') || id.includes(':')) continue;
    const rest = id.slice('anthropic/claude-'.length);
    const a = /^([a-z]+)-(\d+)(?:\.(\d+))?$/.exec(rest) || null;          // family-major.minor
    const b = a ? null : /^(\d+)(?:\.(\d+))?-([a-z]+)$/.exec(rest);        // major.minor-family (the old order)
    const family = a ? a[1] : b ? b[3] : null, major = a ? +a[2] : b ? +b[1] : NaN, minor = a ? a[3] : b ? b[2] : undefined;
    if (!FAMILIES.includes(family) || !(major >= 4)) continue;
    const label = `Claude ${family[0].toUpperCase()}${family.slice(1)} ${major}${minor !== undefined ? '.' + minor : ''}`;
    const known = CLAUDE_MODELS.find((k) => k.label === label);
    out.push(known || { id: `claude-${family}-${major}${minor !== undefined ? '-' + minor : ''}`, label, family, major, minor: minor === undefined ? -1 : +minor });
  }
  return out;
}
// The floor joined with the catalog's Claude models: by family (Fable, Opus,
// Sonnet, Haiku), newest first within each, no id twice.
export function claudeMenu(all) {
  const seen = new Set(), rows = [];
  const parse = (m) => { const r = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(m.id) || []; return { family: r[1] || 'zzz', major: +r[2] || 0, minor: r[3] === undefined ? -1 : +r[3] }; };
  for (const m of [...CLAUDE_MODELS, ...claudeFromCatalog(all)]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id); rows.push({ id: m.id, label: m.label, ...parse(m) });
  }
  rows.sort((x, y) => (FAMILIES.indexOf(x.family) - FAMILIES.indexOf(y.family)) || (y.major - x.major) || (y.minor - x.minor));
  return rows.map(({ id, label }) => ({ id, label }));
}

// The list a provider's menu offers before (or without) a key.
export async function modelsFor(provider, { live = null, fetchFn } = {}) {
  if (provider === 'claude') {
    const heard = Array.isArray(live) && live.length ? live : null;
    const every = claudeMenu(await siteCatalog({ fetchFn }));
    if (heard) {
      // what Claude Code offered this plan first, then every other Claude model the site knows (Colin, 12 Nov 2026)
      const ids = new Set(heard.map((m) => m.id.replace(/\[[^\]]*\]$/, '')));
      const rest = every.filter((m) => !ids.has(m.id));
      return [...(heard.some((m) => m.id === 'default') ? heard : [CLAUDE_CODE_DEFAULT, ...heard]), ...rest];
    }
    return [CLAUDE_CODE_DEFAULT, ...every];
  }
  if (provider === 'anthropic') return claudeMenu(await siteCatalog({ fetchFn }));
  if (provider === 'openai') {
    const all = await siteCatalog({ fetchFn });
    const mine = all.filter((m) => m.id.startsWith('openai/')).map((m) => ({ id: m.id.slice(7), label: bare(m.name) || m.id.slice(7) }));
    return mine.length ? mine : OPENAI_MODELS;
  }
  if (provider === 'openrouter') {
    const all = await siteCatalog({ fetchFn });
    return all.map((m) => ({ id: m.id, label: m.name || m.id }));
  }
  return [];
}

// WHOSE MARK. By the model's maker: an OpenRouter id names it before the slash.
const MAKERS = [
  [/^(anthropic\/|claude)/, 'claude'], [/^openai\/|^(gpt|o\d|chatgpt|codex)/, 'openai'], [/^google\/|^gemini|^gemma/, 'gemini'],
  [/^x-ai\/|^grok/, 'xai'], [/^deepseek/, 'deepseek'], [/^mistralai\/|^(mistral|mixtral|codestral|ministral|magistral|devstral)/, 'mistral'],
  [/^meta-llama\/|^llama/, 'meta'], [/^qwen/, 'qwen'], [/^cohere\//, 'cohere'], [/^moonshotai\/|^kimi/, 'kimi'],
  [/^(z-ai|thudm|zhipu)\/|^glm/, 'zhipu'], [/^minimax/, 'minimax'], [/^perplexity\//, 'perplexity'], [/^nvidia\//, 'nvidia'],
  [/^microsoft\/|^phi-/, 'microsoft'], [/^amazon\/|^nova/, 'aws'],
];
export function makerOf(provider, id) {
  const m = String(id || '').toLowerCase();
  if (provider === 'claude' || provider === 'anthropic') return 'claude';
  for (const [re, key] of MAKERS) if (re.test(m)) return key;
  if (provider === 'openai') return 'openai';
  if (provider === 'openrouter') return 'openrouter';
  return 'claude';   // a provider not named above: Claude's mark, the one y3k began with
}

// A model's name for people: the menu's label when there is one, else made
// from the id ("claude-opus-5-5" → "Claude Opus 5.5", "[1m]" → " 1M").
export function modelName(id, list = []) {
  const hit = list.find((m) => m.id === id);
  if (hit?.label) return hit.label;
  const s = String(id || '');
  const wide = /\[1m\]$/i.test(s) ? ' 1M' : '';
  const core = s.replace(/\[[^\]]*\]$/, '').replace(/^[a-z-]+\//, '');
  const known = CLAUDE_MODELS.find((m) => m.id === core);
  if (known) return known.label + wide;
  const claude = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(core);
  if (claude) return `Claude ${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}${claude[3] ? '.' + claude[3] : ''}${wide}`;
  return core + wide;
}
