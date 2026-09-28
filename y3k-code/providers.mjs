// Every coding tool y3kode can drive: how to install it, how a person signs in
// to it, and how the engine tells whether they have.
//
// How a session gets in:
//  - y3kode drives the coding client the person installed and signed into on
//    this computer, set up the way they set it up: Claude Code on their
//    `claude` login, Codex on their `codex login`, Gemini CLI on its own Google
//    sign-in, OpenCode on what they added with `opencode auth login`. y3kode
//    never reads, copies or stores their vendor credentials: it starts the
//    client, and the client signs in the way it always does. That is the
//    default, with nothing to switch on and nothing to paste.
//  - An API key for Claude Code, Codex or Gemini CLI is only ever the person's
//    own choice (`y3kode key set <tool>`, or "Use an API key instead" on the
//    page). Setting one switches that tool to it; clearing it switches back.
//    The key stays in the engine's store on this machine (0600).
//  - The open models reached through OpenCode (OpenRouter, DeepSeek, Kimi,
//    Qwen, GLM, Grok, Mistral, Groq) have no subscription to sign in with, so a
//    key is how anyone reaches them: asked for in the flow, or already in
//    OpenCode's own store. Ollama, on this computer, needs none.
//  - Whether a person is signed in is asked of each client, never read out of
//    its files: `claude auth status --json`, `codex login status`,
//    `opencode auth list`; for Gemini CLI, the sign-in type its settings name
//    and whether its sign-in cache exists (the cache itself is never opened).

export const PROVIDERS = {
  claude: {
    label: 'Claude Code', vendor: 'Anthropic', bin: 'claude', adapter: 'claude', ready: true,
    install: { mac: 'curl -fsSL https://claude.ai/install.sh | bash', linux: 'curl -fsSL https://claude.ai/install.sh | bash', win: 'irm https://claude.ai/install.ps1 | iex', npm: 'npm install -g @anthropic-ai/claude-code' },
    login: 'claude', methods: ['subscription', 'apiKey'], keyEnv: 'ANTHROPIC_API_KEY', keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [{ id: 'default', label: 'Default' }, { id: 'opus', label: 'Opus' }, { id: 'sonnet', label: 'Sonnet' }, { id: 'haiku', label: 'Haiku' }],
  },
  codex: {
    label: 'Codex', vendor: 'OpenAI', bin: 'codex', adapter: 'codex', ready: true,
    install: { mac: 'brew install codex', npm: 'npm install -g @openai/codex' },
    login: 'codex login', methods: ['subscription', 'apiKey'], keyEnv: 'OPENAI_API_KEY', keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    keyUrl: 'https://platform.openai.com/api-keys', models: [{ id: 'default', label: 'Default' }],
  },
  gemini: {
    label: 'Gemini CLI', vendor: 'Google', bin: 'gemini', adapter: 'acp', ready: true,
    install: { npm: 'npm install -g @google/gemini-cli', mac: 'brew install gemini-cli' },
    login: 'gemini', methods: ['subscription', 'apiKey'], keyEnv: 'GEMINI_API_KEY', keyPattern: /^[A-Za-z0-9_-]{30,}$/,
    keyUrl: 'https://aistudio.google.com/apikey', models: [{ id: 'default', label: 'Default' }],
  },
  opencode: {
    label: 'OpenCode', vendor: 'OpenCode (open source)', bin: 'opencode', adapter: 'opencode', ready: true,
    install: { mac: 'brew install sst/tap/opencode', linux: 'curl -fsSL https://opencode.ai/install | bash', npm: 'npm install -g opencode-ai' },
    login: 'opencode auth login', methods: ['subscription', 'apiKey'], keyEnv: null, models: [{ id: 'default', label: 'Default' }],
    note: 'Runs the open models below: with what you added in `opencode auth login`, a key for each here, or models on this computer with Ollama.',
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

// How a session with this provider gets in, given what the person chose on
// this machine: { method: 'subscription' } (the client's own sign-in — the
// default, and OpenCode always, with any open-model keys set here passed along)
// or { method: 'apiKey', key } (Claude Code, Codex or Gemini CLI, only when the
// person chose a key: config.auth[id] === 'apiKey'), or { error, code }.
export function chooseAuth(id, { config = {}, secrets = {} } = {}) {
  const p = PROVIDERS[id];
  if (!p) return { error: 'Unknown provider.' };
  if (keyChosen(id, config)) {
    return secrets[id] ? { method: 'apiKey', key: secrets[id] }
      : { error: `Add your ${p.vendor} API key, or switch ${p.label} back to your own sign-in.`, code: 'needs-key' };
  }
  return { method: 'subscription' };
}

// Did the person choose an API key over the client's own sign-in? Only a
// choice counts: a key merely sitting in the store (set before sign-in was the
// default) does not switch anything.
export const keyChosen = (id, config = {}) => id !== 'opencode' && isProvider(id) && config.auth?.[id] === 'apiKey';

// `config.auth` after the person chooses a key for one tool (on) or goes back
// to its own sign-in (off). Other tools' choices are kept as they are.
export function keyChoice(config = {}, id, on) {
  const auth = { ...(config.auth || {}) };
  if (on) auth[id] = 'apiKey'; else delete auth[id];
  return auth;
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

// Can a session with this provider start right now, as far as getting in goes?
// The page shows "Signed in", or "Sign in to <tool> first" with the command,
// BEFORE the folder and the mode, rather than after both have been picked and
// the start has failed.
//   'ok'            signed in (or, by the person's choice, a key is set)
//   'signed-out'    the client says nobody is signed in: run `loginCommand`
//   'not-installed' the client is not on this computer
//   'needs-key'     the person chose a key and none is set; or OpenCode with no
//                   open-model key, nothing in its own store, and no Ollama
//   'unknown'       not checked yet, or the client would not say — a session
//                   may well start; if it cannot, it says why
export function authState(id, { config = {}, secrets = {}, detected = {} } = {}) {
  const p = PROVIDERS[id];
  if (!p) return 'unknown';
  const d = detected[id];
  if (d?.installed === false) return 'not-installed';
  const a = chooseAuth(id, { config, secrets });
  if (a.error) return 'needs-key';
  if (a.method === 'apiKey') return 'ok';
  const st = d?.account?.state;
  if (id === 'opencode') {
    if (Object.keys(VIA_OPENCODE).some((k) => secrets[k]) || d?.ollama) return 'ok';
    return st === 'signed-in' ? 'ok' : st === 'signed-out' ? 'needs-key' : 'unknown';
  }
  return st === 'signed-in' ? 'ok' : st === 'signed-out' ? 'signed-out' : 'unknown';
}

// The list the page shows: never a key, only whether one is set. `methods` is
// what the provider can use at all; `method` what it uses here now; `auth` is
// where this machine stands; `loginCommand` what to run to sign in.
// (`signIn` — "runs on its own sign-in" — and `login` stay for older pages.)
export function publicCatalog({ config = {}, secrets = {}, detected = {} } = {}) {
  return Object.entries(PROVIDERS).map(([id, p]) => {
    const method = chooseAuth(id, { config, secrets }).method || null;
    return {
      id, label: p.label, vendor: p.vendor, ready: p.ready, methods: p.methods, method, auth: authState(id, { config, secrets, detected }), note: p.note || null,
      keySet: !!secrets[id], keyChosen: keyChosen(id, config), keyUrl: p.keyUrl || null, signIn: !keyChosen(id, config),
      install: installCommand(id), login: p.login, loginCommand: p.login, models: p.models,
      installed: detected[id]?.installed ?? null, version: detected[id]?.version ?? null, account: detected[id]?.account ?? null,
      via: id === 'opencode' ? Object.entries(VIA_OPENCODE).map(([vid, v]) => ({ id: vid, label: v.label, keySet: !!secrets[vid], keyUrl: v.keyUrl || null, local: !!v.local, notice: v.region ? REGION_NOTICE[v.region] : null })) : undefined,
    };
  });
}
