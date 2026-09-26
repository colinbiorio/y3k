// Trust is granted on the machine, not in the page (CODE.md, line 7). Pairing a
// browser, trusting a folder, adding a connector and installing a tool are asked
// HERE — in a native dialog (desktop) or in the engine's own terminal
// (companion) — so a compromised web page can ask but never say yes.
//
// A consent implementation is `ask(kind, detail) → Promise<boolean>`. The engine
// wraps it so every request and answer is announced (consent.pending /
// consent.resolved) and audited.

import { createInterface } from 'node:readline';

export const KINDS = ['pair', 'folder.trust', 'mcp.add', 'provider.install', 'provider.login', 'cloud.attach'];

// The words the person reads. Kept here so the terminal, the native dialog and
// the audit log all say the same thing.
export function describe(kind, d = {}) {
  switch (kind) {
    case 'pair': return `${d.origin || 'A web page'}${d.agent ? ` (${d.agent})` : ''} wants to connect to y3k Code on this computer. It will be able to start coding sessions in folders you trust.`;
    case 'folder.trust': return [`Trust ${d.path}?`, 'Coding sessions will be able to read and (with your permission) change files here.',
      ...(d.findings?.length ? ['This folder contains things that can run commands or change how coding tools behave:', ...d.findings.map((f) => `  • ${f.file}: ${f.detail}`)] : [])].join('\n');
    case 'mcp.add': return `Add the connector "${d.name}"? It ${d.command ? `runs: ${d.command} ${(d.args || []).join(' ')}` : `connects to ${d.url}`}`;
    case 'provider.install': return `Install ${d.label}? This runs: ${d.command}`;
    case 'provider.login': return `Open ${d.label}'s own sign-in? This runs: ${d.command}`;
    case 'cloud.attach': return `Bring the cloud session ${d.ref} to ${d.cwd}?`;
    default: return `${kind}: ${JSON.stringify(d)}`;
  }
}

// For the companion: ask on the terminal the engine was started from. One
// question at a time; anything but y/yes is no; no answer in `timeoutMs` is no.
export function terminalConsent({ input = process.stdin, output = process.stdout, timeoutMs = 60000 } = {}) {
  let chain = Promise.resolve();
  return (kind, detail) => {
    const next = chain.then(() => new Promise((resolve) => {
      if (!input.isTTY) { output.write(`\n[y3k-code] Refused (no terminal to ask on): ${describe(kind, detail)}\n`); return resolve(false); }
      const rl = createInterface({ input, output });
      const t = setTimeout(() => { rl.close(); output.write('\n(no answer — refused)\n'); resolve(false); }, timeoutMs);
      rl.question(`\n${describe(kind, detail)}\nAllow? [y/N] `, (a) => {
        clearTimeout(t);
        rl.close();
        resolve(/^\s*y(es)?\s*$/i.test(a));
      });
    }));
    chain = next.catch(() => {});
    return next;
  };
}

// For tests and for folders the person picked in a native dialog: a fixed answer.
export const fixedConsent = (answer) => async () => answer;
