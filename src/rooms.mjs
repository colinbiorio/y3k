// The rooms a presence can live in — the list, and nothing that draws them.
// environments.js paints them (and needs three.js to); this file is only their
// names, so the kommand grammar in tags.mjs, which the server also loads, can
// know 'snowy taiga' is a place without importing a renderer.
export const ENVIRONMENTS = [
  { id: 'room', name: 'metal room', blurb: 'the machined slab it was born in' },
  { id: 'space', name: 'deep space', blurb: 'the galactic band, nebulae, a gas giant' },
  { id: 'ocean', name: 'underwater', blurb: 'sunlight through water, drifting snow' },
  { id: 'taiga', name: 'snowy taiga', blurb: 'a frozen treeline under an aurora' },
  { id: 'dunes', name: 'dunes at dusk', blurb: 'warm sand, a low sun, the first stars' },
  { id: 'cavern', name: 'crystal cavern', blurb: 'bioluminescent veins in wet rock' },
  { id: 'cloudsea', name: 'above the clouds', blurb: 'dawn on a sea of cloud tops' },
  { id: 'ember', name: 'volcanic', blurb: 'black basalt split by molten light' },
];
