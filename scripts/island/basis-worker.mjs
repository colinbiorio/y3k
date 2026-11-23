// basis-worker.mjs — THE GROUND'S MAPS ARE MADE READY FOR THE GPU IN A WORKER OF THEIR OWN FILE.
//
//   node scripts/island/basis-worker.mjs        (writes src/game/island/basis-worker.js)
//
// three.js's KTX2Loader transcodes Basis Universal textures in a worker it makes from a Blob: its constants, Binomial's
// transcoder (an emscripten build) and its own worker function, as one string. The transcoder's bindings (embind) make
// their functions with `new Function`, and a worker made from a Blob keeps the page's content policy, which allows
// WebAssembly but no evaluated strings (security.mjs appShellCsp): the maps never arrived. A worker loaded from its own
// URL takes its policy from its own response instead (CSP 3, and the HTML standard's worker rules), and the server sends
// a policy only with pages. So this writes that same worker as a file of the site's own: the loader's constants and its
// worker function, verbatim, with the transcoder brought in by importScripts from the vendored copy beside it. Nothing
// the page sends is evaluated there: it is sent texture bytes and answers with transcoded levels.
//
// The loader is three r160's (the version the game runs); the transcoder is three r187's copy (the same calls: BASIS(),
// initializeBasis, KTX2File), vendored under its own version's folder.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSM = join(ROOT, 'src/vendor/three@0.160.0/examples/jsm'), THREE = join(ROOT, 'src/vendor/three@0.160.0/build/three.module.js');
const TRANSCODER = '../../vendor/three@0.187.0/examples/jsm/libs/basis/basis_transcoder.js';
// node has no import map: the loader and its neighbours are copied out with 'three' pointed at the vendored build
const tmp = mkdtempSync(join(tmpdir(), 'basis-worker-'));
try {
  for (const d of ['loaders', 'utils', 'libs']) mkdirSync(join(tmp, d), { recursive: true });
  for (const f of ['loaders/KTX2Loader.js', 'utils/WorkerPool.js', 'libs/ktx-parse.module.js', 'libs/zstddec.module.js']) {
    writeFileSync(join(tmp, f), readFileSync(join(JSM, f), 'utf8').replace(/from 'three'/g, `from '${pathToFileURL(THREE).href}'`));
  }
  const { KTX2Loader } = await import(pathToFileURL(join(tmp, 'loaders/KTX2Loader.js')).href);
  const fn = KTX2Loader.BasisWorker.toString();
  const out = [
    '// basis-worker.js — MADE BY scripts/island/basis-worker.mjs; not edited by hand. three.js r160\'s KTX2Loader worker',
    '// (MIT, three.js authors), verbatim, with Binomial\'s Basis Universal transcoder (Apache 2.0) brought in from its',
    '// vendored copy: the island\'s ground maps (terrain.js) are transcoded here, in a worker of the site\'s own file.',
    '/* constants */',
    'let _EngineFormat = ' + JSON.stringify(KTX2Loader.EngineFormat),
    'let _TranscoderFormat = ' + JSON.stringify(KTX2Loader.TranscoderFormat),
    'let _BasisFormat = ' + JSON.stringify(KTX2Loader.BasisFormat),
    '/* basis_transcoder.js */',
    `importScripts( new URL( '${TRANSCODER}', self.location.href ).href );`,
    '/* worker */',
    fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}')),
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'src/game/island/basis-worker.js'), out);
  console.log('wrote src/game/island/basis-worker.js', out.length, 'bytes');
} finally { rmSync(tmp, { recursive: true, force: true }); }
