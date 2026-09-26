// Every coding tool y3k Code can drive, how to install it, how a person signs in
// to it, and which of them this build can actually run yet.
//
// Sign-in policy (CODE.md, line 3; decided 2026-09-27, before any release):
//  - A person's own API key, kept in the engine's store on their machine, works
//    for every provider.
//  - A vendor's own sign-in (a Claude or ChatGPT subscription) is used only when
//    the person has switched it on HERE, on their machine (`y3k-code signin on`),
//    and never from the page. It stays off by default until each vendor has
//    confirmed in writing that its sign-in may be used this way.
//  - Gemini never uses its CLI sign-in: Google's terms forbid other software from
//    using it. An AI Studio key (free tier) works instead.
//  - OpenCode is never pointed at a Claude subscription.

export const PROVIDERS = {
  claude: {
    label: 'Claude Code', vendor: 'Anthropic', bin: 'claude', adapter: 'claude', ready: true,
    install: { mac: 'curl -fsSL https://claude.ai/install.sh | bash', linux: 'curl -fsSL https://claude.ai/install.sh | bash', win: 'irm https://claude.ai/install.ps1 | iex', npm: 'npm install -g @anthropic-ai/claude-code' },
    login: 'claude auth login', auth: ['apiKey', 'subscription'], keyEnv: 'ANTHROPIC_API_KEY', keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [{ id: 'default', label: 'Default' }, { id: 'opus', label: 'Opus' }, { id: 'sonnet', label: 'Sonnet' }, { id: 'haiku', label: 'Haiku' }],
  },
  codex: {
    label: 'Codex', vendor: 'OpenAI', bin: 'codex', adapter: 'codex', ready: true,
    install: { mac: 'brew install codex', npm: 'npm install -g @openai/codex' },
    login: 'codex login', auth: ['apiKey', 'subscription'], keyEnv: 'OPENAI_API_KEY', keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    keyUrl: 'https://platform.openai.com/api-keys', models: [{ id: 'default', label: 'Default' }],
  },
  gemini: {
    label: 'Gemini CLI', vendor: 'Google', bin: 'gemini', adapter: 'acp', ready: true,
    install: { npm: 'npm install -g @google/gemini-cli', mac: 'brew install gemini-cli' },
    login: null, auth: ['apiKey'], keyEnv: 'GEMINI_API_KEY', keyPattern: /^[A-Za-z0-9_-]{30,}$/,
    keyUrl: 'https://aistudio.google.com/apikey', models: [{ id: 'default', label: 'Default' }],
    note: "Uses an AI Studio key — Google's terms do not let other apps use the Gemini CLI sign-in.",
  },
  opencode: {
    label: 'OpenCode', vendor: 'OpenCode (open source)', bin: 'opencode', adapter: 'opencode', ready: true,
    install: { mac: 'brew install sst/tap/opencode', linux: 'curl -fsSL https://opencode.ai/install | bash', npm: 'npm install -g opencode-ai' },
    login: null, auth: ['apiKey'], keyEnv: null, models: [{ id: 'default', label: 'Default' }],
    note: 'Runs the open models below with your own key for each — or models on this computer with Ollama.',
  },
};

// The model providers reached through OpenCode, each with the person's own key.
export const VIA_OPENCODE = {
  openrouter: { label: 'OpenRouter', keyEnv: 'OPENROUTER_API_KEY', keyUrl: 'https://openrouter.ai/keys' },
  kimi: { label: 'Kimi (Moonshot)', keyEnv: 'MOONSHOT_API_KEY', keyUrl: 'https://platform.moonshot.ai/console/api-keys', region: 'CN' },
  deepseek: { label: 'DeepSeek', keyEnv: 'DEEPSEEK_API_KEY', keyUrl: 'https://platform.deepseek.com/api_keys', region: 'CN' },
  qwen: { label: 'Qwen (Alibaba)', keyEnv: 'DASHSCOPE_API_KEY', keyUrl: 'https://dashscope.console.aliyun.com/apiKey', region: 'CN' },
  glm: { label: 'GLM (Zhipu)', keyEnv: 'ZHIPU_API_KEY', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', region: 'CN' },
  xai: { label: 'Grok (xAI)', keyEnv: 'XAI_API_KEY', keyUrl: 'https://console.x.ai' },
  mistral: { label: 'Mistral', keyEnv: 'MISTRAL_API_KEY', keyUrl: 'https://console.mistral.ai/api-keys' },
  groq: { label: 'Groq', keyEnv: 'GROQ_API_KEY', keyUrl: 'https://console.groq.com/keys' },
  ollama: { label: 'Ollama (on this computer)', keyEnv: null, local: true },
};

export const REGION_NOTICE = {
  CN: 'This provider is operated from China; what you send it is handled under its terms and local law.',
};

export const isProvider = (id) => Object.hasOwn(PROVIDERS, id);
export const isKeyTarget = (id) => isProvider(id) || Object.hasOwn(VIA_OPENCODE, id);

// Which credential a session with this provider uses, given what the person has
// set up on this machine. { method: 'apiKey'|'subscription', key? } or { error }.
export function chooseAuth(id, { config = {}, secrets = {} } = {}) {
  const p = PROVIDERS[id];
  if (!p) return { error: 'Unknown provider.' };
  const signIn = config.signIn === true && p.auth.includes('subscription');
  const pref = config.auth?.[id];
  if (pref === 'subscription' && signIn) return { method: 'subscription' };
  if (secrets[id]) return { method: 'apiKey', key: secrets[id] };
  if (signIn) return { method: 'subscription' };
  if (id === 'opencode') return { method: 'apiKey' }; // keys are per model provider
  return { error: `Add your ${p.vendor} API key to use ${p.label}.`, code: 'needs-key' };
}

// A key the person typed: trimmed, sane length, and the vendor's own shape when
// one is known. The key itself is never echoed back to the page.
export function checkKey(id, key) {
  const k = String(key || '').trim();
  if (k.length < 16 || k.length > 400 || /\s/.test(k)) return { error: "That doesn't look like an API key." };
  const pat = PROVIDERS[id]?.keyPattern;
  if (pat && !pat.test(k)) return { error: `That doesn't look like a ${PROVIDERS[id].vendor} key.` };
  return { key: k };
}

export function installCommand(id, platform = process.platform) {
  const i = PROVIDERS[id]?.install || {};
  return (platform === 'darwin' ? i.mac : platform === 'win32' ? i.win : i.linux) || i.npm || null;
}

// Can a session with this provider start right now, as far as credentials go?
// The page asks for a key BEFORE the folder and the mode when it cannot, rather
// than after both have been picked and the start has failed.
//   'ok'         a key is set, or the person's own sign-in is on here
//   'needs-key'  it takes an API key and none is set (Gemini, always; OpenCode's
//                models each take their own)
//   'signin-off' no key, and the vendor's own sign-in would work but is switched
//                off on this machine (the default — providers.mjs, top)
//   'unknown'    it will start, but whether the tool can reach a model is its own
//                business: OpenCode with no model key set (it may be pointed at
//                Ollama here), or a sign-in the tool itself reports as signed out
export function authState(id, { config = {}, secrets = {}, detected = {} } = {}) {
  const p = PROVIDERS[id];
  if (!p) return 'unknown';
  const a = chooseAuth(id, { config, secrets });
  if (a.error) return a.code === 'needs-key' && p.auth.includes('subscription') && config.signIn !== true ? 'signin-off' : 'needs-key';
  if (id === 'opencode' && !Object.keys(VIA_OPENCODE).some((k) => secrets[k])) return 'unknown';
  const acct = detected[id]?.account;
  if (a.method === 'subscription' && acct?.state && acct.state !== 'signed-in') return 'unknown';
  return 'ok';
}

// The list the page shows: never a key, only whether one is set. `methods` is
// what the provider can use at all; `auth` is where this machine stands.
export function publicCatalog({ config = {}, secrets = {}, detected = {} } = {}) {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id, label: p.label, vendor: p.vendor, ready: p.ready, methods: p.auth, auth: authState(id, { config, secrets, detected }), note: p.note || null,
    keySet: !!secrets[id], keyUrl: p.keyUrl || null, signIn: config.signIn === true && p.auth.includes('subscription'),
    install: installCommand(id), login: p.login, models: p.models,
    installed: detected[id]?.installed ?? null, version: detected[id]?.version ?? null, account: detected[id]?.account ?? null,
    via: id === 'opencode' ? Object.entries(VIA_OPENCODE).map(([vid, v]) => ({ id: vid, label: v.label, keySet: !!secrets[vid], keyUrl: v.keyUrl || null, local: !!v.local, notice: v.region ? REGION_NOTICE[v.region] : null })) : undefined,
  }));
}
