// ============================================================================
// THE LOCAL BRIDGE — the one thing this window adds to the page (CODE.md,
// HANDS.md, README "The one exception").
//
// It puts a single small object on the page, `window.y3kCode`, so y3k Code can
// reach the Code engine running on THIS machine without a network port or a
// pairing code. Three functions, JSON in and out, nothing else:
//
//   cmd(obj)        → a promise of the engine's answer
//   since(after)    → the events after a sequence number (to catch up)
//   onEvent(fn)     → every new event; returns a function that stops listening
//
// No Node, no ipcRenderer, no file system reaches the page. The main process
// answers only the site's own top frame (policy.cjs, bridgeMay), and every yes
// that matters — trusting a folder, adding a connector — is a native dialog,
// never a button in the page.
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Set();
ipcRenderer.on('y3k-code:event', (_e, event) => {
  for (const fn of listeners) { try { fn(event); } catch { /* one bad listener must not stop the rest */ } }
});

contextBridge.exposeInMainWorld('y3kCode', Object.freeze({
  cmd: (obj) => ipcRenderer.invoke('y3k-code:cmd', obj),
  since: (after) => ipcRenderer.invoke('y3k-code:since', Number(after) || 0),
  onEvent: (fn) => {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
}));
