// kernels.mjs — NAIF's text kernels (pck00011.tpc, gm_de440.tpc), read as text: every `NAME = ( numbers )` inside a
// \begindata block; a later one overrides an earlier one. Nothing in them is run.
//   https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/
import { readFileSync } from 'node:fs';
export function kernel(path) {
  const text = readFileSync(path, 'utf8');
  const out = {};
  const blocks = text.split('\\begindata').slice(1).map((b) => b.split('\\begintext')[0]);
  for (const b of blocks) {
    const re = /([A-Z0-9_]+)\s*=\s*(\(([^)]*)\)|[^\s(]+)/g; let m;
    while ((m = re.exec(b))) {
      const raw = (m[3] !== undefined ? m[3] : m[2]).trim().split(/[\s,]+/).filter(Boolean);
      const vals = raw.map((s) => Number(s.replace(/[dD]/, 'e')));
      if (vals.every(Number.isFinite)) out[m[1]] = vals;
    }
  }
  return out;
}
