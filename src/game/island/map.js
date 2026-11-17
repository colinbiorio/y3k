// map.js — THE ISLAND ON A PAGE: Lord Howe drawn from its own coast
// (lordhowe-shape.js) as an SVG, for the controls sheet's map tab (menu.js).
// No page, no three: a string, so the suite reads it.
//
// The frame is the game's: x east, z south, in metres, so north is up and a
// metre is a metre. The land is its coastlines filled; the shallows (the sea
// less than 3 m deep: the lagoon, out to its reef) behind it in their own
// colour, their seaward edge dashed; the peaks as small marks with
// their names and heights; where a body arrives; where the body is now, and
// which way it faces; two kilometres to measure by; north; and Ball's
// Pyramid, off the map, by an arrow to the south-east.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = (v) => Math.round(v);

// a polygon cut to the half of the plane where z < zMax (Sutherland and Hodgman, one edge)
export function clipNorth(poly, zMax) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ain = a[1] < zMax, bin = b[1] < zMax;
    if (ain) out.push(a);
    if (ain !== bin) { const t = (zMax - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, zMax]); }
  }
  return out;
}

export function mapSvg(shape, { at = null, facing = 0, label = shape.name } = {}) {
  const e = shape.extent, pad = 1100, x0 = e.x0 - pad, x1 = e.x1 + pad, z0 = e.z0 - pad, z1 = e.z1 + pad + 500;
  const line = (pts, close = true) => 'M' + pts.map(([x, z]) => `${r0(x)} ${r0(z)}`).join('L') + (close ? 'Z' : '');
  const land = shape.coast.map((l) => line(l)).join('');
  const lagoon = (shape.shallows || []).map((l) => line(l)).join('') || line(clipNorth(shape.reef, shape.lagoonSouth));
  // a name to the right of its mark, or to its left where another mark is just east of it (Eliza beside Malabar)
  const left = (p) => shape.peaks.some((q) => q !== p && q.x > p.x && q.x - p.x < 2600 && Math.abs(q.z - p.z) < 700);
  const marks = shape.peaks.map((p) => `<g class="peak"><path d="M${p.x} ${p.z - 150}L${p.x + 130} ${p.z + 90}L${p.x - 130} ${p.z + 90}Z"/><text x="${left(p) ? p.x - 210 : p.x + 210}" y="${p.z + 80}"${left(p) ? ' text-anchor="end"' : ''}>${esc(p.name)} ${p.h} m</text></g>`).join('');
  const a = shape.arrive;
  const you = at ? `<g class="you" transform="translate(${r0(at[0])} ${r0(at[1])}) rotate(${r0((-facing * 180) / Math.PI) + 180})"><circle r="150"/><path d="M0 -330L110 -120L-110 -120Z"/></g>` : '';
  const sx = x0 + 500, sz = z1 - 450;
  return `<svg class="game-map-svg" viewBox="${r0(x0)} ${r0(z0)} ${r0(x1 - x0)} ${r0(z1 - z0)}" role="img" aria-label="${esc(`A map of ${label}: ${Math.round(shape.length / 100) / 10} km from north to south${at ? ', with where you are' : ''}`)}">
  <rect class="sea" x="${r0(x0)}" y="${r0(z0)}" width="${r0(x1 - x0)}" height="${r0(z1 - z0)}"/>
  <path class="lagoon" d="${lagoon}" fill-rule="evenodd"/>
  <path class="land" d="${land}" fill-rule="evenodd"/>
  ${marks}
  <circle class="arrive" cx="${a.x}" cy="${a.z}" r="110"/>
  ${you}
  <g class="scale"><path d="M${sx} ${sz}h2000"/><text x="${sx}" y="${sz - 120}">2 km</text></g>
  <g class="north"><path d="M${r0(x1 - 600)} ${r0(z0 + 900)}l170 -520l170 520l-170 -150Z"/><text x="${r0(x1 - 600)}" y="${r0(z0 + 1250)}">N</text></g>
  <g class="away"><path d="M${r0(x1 - 900)} ${r0(z1 - 900)}l520 520m0 -330v330h-330"/><text x="${r0(x1 - 3300)}" y="${r0(z1 - 1020)}">${esc(shape.pyramid.name)}, ${Math.round(Math.hypot(shape.pyramid.x - a.x, shape.pyramid.z - a.z) / 1000)} km</text></g>
</svg>`;
}
