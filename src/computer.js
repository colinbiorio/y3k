// computer.js — YOUR ORB, USING YOUR COMPUTER. The page's half of it.
//
// Colin, 2026-10-19: "give option for full control over computer with your orb
// as a transparent entity with its own cursor that floats around showing what
// is being accessed / clicked / interacted with."
//
// The loop, one step at a time:
//   look   y3kode takes a picture of the main screen (computer.look)
//   think  the presence, on its own brain, picks ONE action (/api/computer/step)
//   act    y3kode shows it on screen (the y3k app's overlay) and does it
// until the presence says it is done, asks something, a step limit is reached,
// or the person stops it (Esc on the computer, the stop here, or the app menu).
//
// What it may never do on its own is in the step's instructions (no passwords,
// payments, sending or deleting unless the goal says so; ask instead), and what
// it does is allowed on the computer first: y3kode asks in a native dialog the
// first time, and again after ten idle minutes (y3k-code/computer.mjs).
//
// Off unless switched on in Settings (localStorage 'y3k.computer' = '1'), and
// started from the chat by a message beginning "do:" ("do: open my calendar"),
// or said or typed as "use my computer to …".

export const FLAG = 'y3k.computer';
export const MAX_STEPS = 30;
export const TRIGGER = /^\s*do\s*:\s*(.+)$/is;
// …and the spoken form, since a voice has no colon: "use my computer to …"
export const SPOKEN = /^\s*(?:please\s+)?use my computer to\s+(.+)$/is;

export const enabled = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
export const setEnabled = (on) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* private mode */ } };

// What a chat line asks the orb to do on the computer, or null.
export function goalOf(text) {
  const t = String(text || '');
  const m = TRIGGER.exec(t) || SPOKEN.exec(t);
  return m ? m[1].trim().slice(0, 600) : null;
}

export function createComputerUse({ cmd, fetchFn = globalThis.fetch, keyFields = () => ({}), onSay = () => {}, onState = () => {}, maxSteps = MAX_STEPS }) {
  let running = false;
  let stopNow = false;

  async function run(goal) {
    if (running) { onSay('I am already using the computer. Say "stop" to stop me first.'); return { ok: false }; }
    running = true; stopNow = false;
    onState('working');
    const steps = [];
    try {
      const st = await cmd({ cmd: 'computer.status' });
      if (!st?.ok) { onSay(st?.code === 'offline' || st?.code === 'unpaired' ? 'I can only use the computer through the y3k app or y3kode on it. Open the y3k app and ask again.' : (st?.error || 'y3kode does not know how to do that yet: update it in Settings → Brain.')); return { ok: false }; }
      if (!st.able) { onSay('Using the computer works on macOS for now.'); return { ok: false }; }
      for (let i = 0; i < maxSteps; i++) {
        if (stopNow) { onSay('Stopped.'); return { ok: false, stopped: true }; }
        const look = await cmd({ cmd: 'computer.look' });
        if (!look?.ok) { onSay(look?.error || 'I could not see the screen.'); return { ok: false }; }
        if (stopNow) { onSay('Stopped.'); return { ok: false, stopped: true }; }
        let r;
        try {
          r = await fetchFn('/api/computer/step', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ goal, steps, image: look.image, w: look.w, h: look.h, ...keyFields() }),
          }).then((x) => x.json());
        } catch { r = null; }
        if (!r?.ok) { onSay(r?.error || 'I could not think about the screen just now.'); return { ok: false }; }
        const s = r.step;
        if (s.say) onSay(s.say);
        if (s.action === 'done') return { ok: true, done: true };
        if (s.action === 'ask') return { ok: true, asked: true };
        if (stopNow) { onSay('Stopped.'); return { ok: false, stopped: true }; }
        const a = await cmd({ cmd: 'computer.act', action: s.action, ...(s.x != null ? { x: s.x } : {}), ...(s.y != null ? { y: s.y } : {}),
          ...(s.dy != null ? { dy: s.dy } : {}), ...(s.text ? { text: s.text } : {}), ...(s.key ? { key: s.key } : {}), ...(s.label ? { label: s.label } : {}) });
        steps.push({ did: `${s.action}${s.label ? ' ' + s.label : ''}${s.action === 'type' ? ` "${String(s.text).slice(0, 60)}"` : ''}${s.key ? ' ' + s.key : ''}`, ok: !!a?.ok, why: a?.error || '' });
        if (!a?.ok && (a?.code === 'declined' || a?.code === 'stopped' || a?.code === 'no-access' || a?.code === 'unsupported')) { onSay(a.error || 'Stopped.'); return { ok: false }; }
        // a moment for the screen to answer before the next picture
        await new Promise((go) => setTimeout(go, s.action === 'type' || s.action === 'key' ? 500 : 900));
      }
      onSay(`I stopped after ${maxSteps} steps so you can look. Ask again to go on.`);
      return { ok: false, limit: true };
    } finally {
      running = false;
      onState('idle');
    }
  }

  async function stop() {
    stopNow = true;
    try { await cmd({ cmd: 'computer.stop' }); } catch { /* the engine may be gone */ }
  }

  return { run, stop, running: () => running };
}
