// Load the untracked .env into process.env. Imported FIRST by server.mjs so that
// every other module (notably auth.mjs, which reads FOUNDER_PASSWORD / DATA_DIR /
// SESSION_SECRET at import time) sees the values. ESM evaluates imported modules
// in source order, so this must precede those imports. No-op if there's no .env
// (e.g. on Render, where the vars come from the real environment).
try { process.loadEnvFile(new URL('.env', import.meta.url)); } catch { /* no .env — fine */ }
