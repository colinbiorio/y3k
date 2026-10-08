// THE FLASH IS NOT A STROBE. Run: node test/flash.test.mjs
//
// 'flash P' dims the whole field and brings it back every P seconds, and the
// field is most of the viewport. It used to accept a tenth of a second (ten
// flashes a second) and the system prompt taught 0.3 (3.3 a second), both over
// the three-a-second photosensitive threshold, with no regard for a person who
// asked for less motion. These hold the period setFlash actually hands the
// shader, for each way of asking.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { flashPeriod, FLASH_MIN_S } from '../src/score.js';
import { reducedMotion } from '../src/motion.js';

const ROOT = new URL('..', import.meta.url);
const body = readFileSync(new URL('src/body.js', ROOT), 'utf8');
const server = readFileSync(new URL('server.mjs', ROOT), 'utf8');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// The two switches reducedMotion reads: <html data-motion> and the OS query.
const page = ({ motion = '', os = false } = {}) => {
  globalThis.document = { documentElement: { dataset: motion ? { motion } : {} } };
  globalThis.matchMedia = (q) => ({ matches: os && /prefers-reduced-motion: reduce/.test(q) });
};
// What body.setFlash hands the shader, the way it asks.
const setFlash = (p) => flashPeriod(p, reducedMotion());

console.log('\nthe flash:');

ok('never more than two flashes a second, however fast it is asked for', () => {
  page();
  assert.equal(FLASH_MIN_S, 0.5);
  for (const p of [0.1, 0.2, 0.3, 0.33, 0.49]) assert.equal(setFlash(p), 0.5, `flash ${p} reached the shader as ${setFlash(p)}`);
  assert.ok(1 / setFlash(0.1) < 3, 'over the three-a-second threshold');
  assert.equal(setFlash(1), 1, 'a slow flash is changed');
  assert.equal(setFlash(9), 5, 'the five-second ceiling is gone');
});

ok('off still means off', () => {
  // The end of a score and every step without a flash send 0. A floor applied
  // to it would leave the orb flashing for good.
  page();
  for (const p of [0, -1, '', null, undefined, NaN, 'x']) assert.equal(setFlash(p), 0, `${String(p)} turned a flash on`);
});

ok('less motion, from Settings or Smooth or the OS, is no flash at all', () => {
  page({ motion: 'less' });
  assert.equal(setFlash(0.1), 0, 'data-motion=less still flashes');
  assert.equal(setFlash(2), 0, 'data-motion=less still flashes slowly');
  page({ os: true });
  assert.equal(setFlash(0.3), 0, 'prefers-reduced-motion still flashes');
  // and it is read at the call: Settings can change it while the page runs
  page();
  assert.equal(setFlash(0.3), 0.5, 'the setting was read once and kept');
});

ok('body.setFlash asks exactly this, at the call, and the shader pulses rather than switches', () => {
  assert.ok(/setFlash\(periodSeconds\) \{ uniforms\.uFlashPeriod\.value = flashPeriod\(periodSeconds, reducedMotion\(\)\); \}/.test(body),
    'setFlash sets the uniform without the floor or the motion check');
  assert.ok(/import \{ easeForSeconds, flashPeriod \} from '\.\/score\.js';/.test(body) && /import \{ reducedMotion \} from '\.\/motion\.js';/.test(body),
    'body.js does not import the floor and the motion check');
  assert.ok(!/step\(0\.5, fract\(uTime \/ uFlashPeriod\)\)/.test(body), 'the flash is a hard on/off switch again');
  assert.ok(/mix\(0\.4, 1\.0, 0\.5 \+ 0\.5 \* cos\(6\.2831853 \* fract\(uTime \/ uFlashPeriod\)\)\)/.test(body), 'the flash dips deeper than 40% or is not smooth');
});

ok('the prompt does not teach a period the body refuses', () => {
  const taught = [...server.matchAll(/flash (\d+(?:\.\d+)?)/g)].map((m) => +m[1]);
  assert.ok(taught.length >= 2, 'the flash examples left the prompt');
  for (const p of taught) assert.ok(p >= FLASH_MIN_S, `the prompt teaches flash ${p}`);
});

console.log(`\n${passed} checks passed.`);
