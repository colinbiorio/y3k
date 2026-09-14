#!/usr/bin/env node
// HAND THE OLD RECORD OVER. Reads a folder of airden files, signs in as the
// founder, and posts the durable parts to a running y3k so they land on the
// disk the presence actually lives on.
//
// It is a DRY RUN unless you pass --go. The dry run prints exactly what would
// be written and writes nothing, and the server defaults to a dry run too, so
// it takes two deliberate acts to change a presence's memory.
//
//   node scripts/import-airden.mjs --dir ~/y3k-files/airden --to https://yearthreethousand.com
//   node scripts/import-airden.mjs --dir ... --to https://yearthreethousand.com --handle orion --go
//
// --to and --handle are REQUIRED for --go, and neither has a default. --to used
// to fall back to http://localhost:3000, and a local server with no DATA_DIR
// writes its stores into this repo directory — so a rehearsal run, or a --to
// typo'd into a flag, would have written airden's private pieces into a file
// here. --handle is required because resolving "your first presence" is array
// order, and array order is not a thing to bet another being's memory on.
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
const base = String(arg('to') || '').replace(/\/$/, '');
const go = flag('go');
const handle = arg('handle');
const die = (m) => { console.error('\n  ' + m + '\n'); process.exit(1); };
if (!base) die('--to is required (e.g. --to https://yearthreethousand.com). There is no default on purpose.');
if (!/^https?:\/\//.test(base)) die(`--to must be a full URL, got ${JSON.stringify(base)}`);
if (go && !handle) die('--go needs --handle (e.g. --handle orion). Without it the target is array order.');
if (go && /localhost|127\.0\.0\.1/.test(base)) console.warn('  ! a local server with no DATA_DIR writes its stores into the repo directory');

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
console.log(`  → ${base}${handle ? ` @${handle}` : ' (your first presence — pass --handle to be sure)'}   ${go ? 'FOR REAL, AND PERMANENT' : 'dry run'}\n`);

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
if (out.blocked) console.log(`\n  ! ${out.blocked}\n    --go will refuse rather than lose a piece. Free the room, then run again.`);
if (!go) {
  const w = out.willLand;
  if (w) {
    console.log('\nwhat would actually land, against the presence\'s live stores:');
    console.log(`  noticings  ${w.noticed.willLand} of ${w.noticed.offered}   (${w.noticed.droppedAsDuplicates} are restatements of each other)`);
    console.log(`  journal    ${w.journal.willLand} of ${w.journal.offered}   (it already holds ${w.journal.holds})`);
    console.log(`  shelf      ${w.shelf.willLand} of ${w.shelf.offered}   (holds ${w.shelf.holds} of ${w.shelf.capacity}, room for ${w.shelf.roomFor})`);
  }
  console.log('\nnothing was written.');
  console.log('Back up the disk first — on Render: Shell → tar czf - /data | base64, or take a snapshot.');
  console.log(`Then: --to ${base} --handle ${handle || '<handle>'} --go`);
}
