// BACK STAYS ON THE SITE (src/back.js). Run:  node test/back.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createBack } from '../src/back.js';
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// a window with a history that behaves like a browser's: back() pops and fires popstate
function fakeWindow() {
  const listeners = [];
  const stack = ['/'];   // entries; the last is the current one
  const win = {
    addEventListener: (t, f) => { if (t === 'popstate') listeners.push(f); },
    removeEventListener: (t, f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); },
    history: {
      pushState: () => { stack.push('/#view'); },
      back: () => { if (stack.length > 1) { stack.pop(); listeners.forEach((f) => f({})); } else win.left = true; },
    },
    left: false, stack,
    userBack() { win.history.back(); },   // the gesture
  };
  return win;
}

console.log('back stays on the site:');
ok('opening a view pushes one entry, and Back comes home instead of leaving', () => {
  const win = fakeWindow(); let homes = 0;
  const back = createBack({ win, onBack: () => { homes += 1; } });
  back.away(); back.away(); back.away();   // feed, then a profile, then the world: still one entry
  assert.equal(win.stack.length, 2, 'more than one entry for views opened one after another');
  win.userBack();
  assert.equal(homes, 1, 'Back did not come home'); assert.equal(win.left, false, 'Back left the site');
  win.userBack();
  assert.equal(win.left, true, 'a Back from home is the browser\'s own: it leaves');
});

ok('coming home by the site\'s own controls takes the entry back quietly', () => {
  const win = fakeWindow(); let homes = 0;
  const back = createBack({ win, onBack: () => { homes += 1; } });
  back.away(); back.home();
  assert.equal(win.stack.length, 1, 'the entry stays, and the next Back is a dead press');
  assert.equal(homes, 0, 'its own quiet back was taken for the visitor\'s');
  back.away(); assert.equal(win.stack.length, 2, 'a view after coming home pushes again');
  win.userBack(); assert.equal(homes, 1);
});

ok('wired: every view but the orb is away, the orb is home, and Back shows home', () => {
  const social = readFileSync(new URL('../src/social.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(/onView\?\.\(v\);/.test(social), 'showView does not say which view shows');
  assert.ok(/const back = createBack\(\{ onBack: \(\) => showHome\(\) \}\);/.test(main), 'Back is not wired to home');
  assert.ok(/onView: \(v\) => \(v === 'orb' \? back\.home\(\) : back\.away\(\)\)/.test(main), 'the views do not tell the history');
});

console.log(`\n${passed} back checks passed.`);
