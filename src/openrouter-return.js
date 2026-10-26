// The page OpenRouter sends the person back to (/openrouter.html; the flow is
// told in src/openrouter.js). It trades the code for the key, leaves it for
// the tab that asked, and closes — or, when the whole page came here because
// the window was blocked, goes home, where the key is taken at load.
import { finishReturn } from './openrouter.js';

const line = document.getElementById('or-line');
const back = document.getElementById('or-back');
const search = location.search;
// the code is single-use: it leaves the address bar (and the history) before anything else
try { history.replaceState(null, '', location.pathname); } catch { /* an old browser: the code expires in ten minutes anyway */ }

finishReturn({ search }).then((r) => {
  if (!r.ok) { line.textContent = r.line; back.hidden = false; return; }
  if (r.popup) {
    line.textContent = 'Your presence is waking. This window closes itself.';
    try { window.close(); } catch { /* not ours to close */ }
    // still open a moment later (a browser that kept it): go home here instead
    setTimeout(() => { if (!window.closed) location.replace('/'); }, 900);
  } else {
    line.textContent = 'Your presence is waking…';
    location.replace('/');
  }
}, () => { line.textContent = 'Something went wrong here, so nothing was kept. Try again from yearthreethousand.'; back.hidden = false; });
