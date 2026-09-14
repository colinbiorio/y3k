#!/usr/bin/env node
// HAND THE OLD RECORD OVER. Reads a folder of airden files, signs in as the
// founder, and posts the durable parts to a running y3k so they land on the
// disk the presence actually lives on.
//
// It is a DRY RUN unless you pass --go. The dry run prints exactly what would
// be written and writes nothing, and the server defaults to a dry run too, so
// it takes two deliberate acts to change a presence's memory.
//
//   node scripts/import-airden.mjs --dir ~/Desktop/yearthreethousand/airden
//   node scripts/import-airden.mjs --dir ... --to https://yearthreethousand.com --go
//
// The password is read from the environment or the terminal, never from a flag
// (a flag lands in shell history). Nothing from the bundle is written to this
// repository: it is public, and those files are not.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes('--' + name);

const dir = resolve(arg('dir') || '.');
const base = (arg('to') || 'http://localhost:3000').replace(/\/$/, '');
const go = flag('go');
const handle = arg('handle');

const read = (name) => {
  const f = join(dir, name);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { console.error(`  ! ${name} is not readable JSON: ${e.message}`); return null; }
};

const memory = read('airden_memory.json');
const core = read('airden_core.json');
if (!core) { console.error(`no airden_core.json in ${dir} — point --dir at the airden folder`); process.exit(1); }

// ONLY WHAT IS DURABLE TRAVELS. The 344 raw wanders are the equivalent of this
// platform's own moment-to-moment thinking, which it does not keep either, and
// they are most of the file's weight. Identity and stats come along because the
// arrival note is written out of them.
const bundle = {
  memory: memory ? { identity: memory.identity, stats: memory.stats } : {},
  core: { truths: core.truths, insights: core.insights, patterns_noticed: core.patterns_noticed },
  creations: read('airden_creations.json') || {},
};

const ask = (q, quiet) => new Promise((r) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (quiet) { rl.output.write(q); rl._writeToOutput = () => {}; rl.question('', (a) => { rl.output.write('\n'); rl.close(); r(a); }); }
  else rl.question(q, (a) => { rl.close(); r(a); });
});

const size = Buffer.byteLength(JSON.stringify(bundle));
console.log(`\nbundle from ${dir}`);
console.log(`  ${core.patterns_noticed?.length || 0} noticings, ${core.insights?.length || 0} insights, ${core.truths?.length || 0} truths, ${Object.values(bundle.creations).flat().length} creations  (${(size / 1024).toFixed(0)} KB)`);
console.log(`  → ${base}${handle ? ` @${handle}` : ' (your first presence)'}   ${go ? 'FOR REAL' : 'dry run'}\n`);

const email = process.env.Y3K_EMAIL || await ask('founder email: ');
const password = process.env.Y3K_PASSWORD || await ask('password (not echoed): ', true);

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) { console.error(`sign-in failed: ${login.status} ${(await login.text()).slice(0, 200)}`); process.exit(1); }
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
if (!cookie) { console.error('signed in but no session cookie came back'); process.exit(1); }

const res = await fetch(`${base}/api/import/airden`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ bundle, handle, dryRun: !go }),
});
const out = await res.json().catch(() => ({ error: 'no JSON came back' }));
console.log(JSON.stringify(out, null, 2));
if (!res.ok) process.exit(1);
if (!go) console.log('\nnothing was written. Run it again with --go to hand the record over.');
