// kinds.js — THE FIVE KINDS OF BODY, and what a person may choose of each.
// Names and colours only: no page, no three (the bodies in ./bodies/ draw
// them, the body sheet lists them, the suite counts them).
//
// Colin, 13 Nov 2026: "There should be 5 different types of customizable
// characters -- 5 is our magic number for now. One character type should be
// humanoid, one should be robotic, one should be mantis/insectoid, one should
// be octopus/alienoid, and the 5th can be your choosing, but all should have
// 5 different types of customization, with 5 subset levels". The fifth is the
// orb's own kin: a body of light.
//
// Five kinds, five choices each, five options a choice: 5 x 5^5 = 15,625
// bodies. The first option of every choice is the body as it was first drawn
// (the pictures in ./art/v1/, made with Higgsfield from our brief).

// what a colour is called, and the colour (a pair: the body's, then its second)
export const SKIN = { sand: '#cf9f7a', ochre: '#b07a4e', sienna: '#8a5536', umber: '#563727', pearl: '#ecd2bd' };
export const DYE = { rust: '#a8492b', indigo: '#34437a', moss: '#5f6d3a', bone: '#d8cfba', charcoal: '#3b3d44' };
export const FINISH = { bronze: ['#a8845c', '#ece6da'], verdigris: ['#5c8f7f', '#cfe2d2'], iron: ['#585b60', '#1e2026'], alloy: ['#bcc1c7', '#2d4b8c'], brass: ['#c7a048', '#b5593b'] };
export const GLOW = { amber: '#ffb866', cyan: '#7fe9ff', green: '#8dffa8', violet: '#b9a0ff', rose: '#ff9aba' };
export const SHELL = { jade: ['#a3c99b', '#e9c7a6'], orchid: ['#e8cbe0', '#b8629a'], leaf: ['#5f9a3e', '#c9d77a'], ghost: ['#e9ecdf', '#aebfb6'], night: ['#283142', '#4f80aa'] };
export const HIDE = { teal: ['#1e7d85', '#8af0f5'], coral: ['#d8644d', '#ffdcae'], violet: ['#6a4ea2', '#e2bcff'], sand: ['#c8a777', '#fff2cc'], ink: ['#1d2331', '#86a4ff'] };
export const AURA = { stardust: ['#fff3da', '#ffd07a'], aurora: ['#a4eaff', '#b98cff'], ember: ['#ffc58c', '#ff6c3c'], frost: ['#e0f1ff', '#9fd0ff'], verdant: ['#dbffd2', '#70dc7c'] };

const choice = (id, options, swatch = null) => ({ id, options, swatch });
const names = (o) => Object.keys(o);

export const KINDS = [
  { id: 'human', line: 'wool, plate and a woven belt', choices: [
    choice('hair', ['crop', 'tail', 'braid', 'curls', 'shaved']),
    choice('build', ['even', 'slight', 'lean', 'broad', 'heavy']),
    choice('clothing', ['coat', 'cloak', 'wrap', 'suit', 'jacket']),
    choice('skin', names(SKIN), SKIN),
    choice('dye', names(DYE), DYE),
  ] },
  { id: 'robot', line: 'bronze and white ceramic, engraved', choices: [
    choice('head', ['ring', 'visor', 'lens', 'crest', 'dome']),
    choice('frame', ['even', 'slender', 'compact', 'heavy', 'tall']),
    choice('finish', names(FINISH), FINISH),
    choice('cloth', ['wrap', 'sash', 'tabard', 'mantle', 'bare']),
    choice('light', names(GLOW), GLOW),
  ] },
  { id: 'mantis', line: 'tall, jade, patient', choices: [
    choice('antennae', ['arcs', 'whips', 'plumes', 'curls', 'horns']),
    choice('shell', names(SHELL), SHELL),
    choice('wings', ['folded', 'short', 'fan', 'leaf', 'none']),
    choice('build', ['slender', 'stick', 'shield', 'small', 'great']),
    choice('wear', ['sash', 'bands', 'wrap', 'beads', 'bare']),
  ] },
  { id: 'octopus', line: 'eight arms and a collar of glass', choices: [
    choice('mantle', ['dome', 'round', 'point', 'fins', 'crown']),
    choice('skin', names(HIDE), HIDE),
    choice('marks', ['spots', 'rings', 'bands', 'stars', 'plain']),
    choice('arms', ['standing', 'curled', 'long', 'stout', 'webbed']),
    choice('collar', ['glass', 'woven', 'shells', 'torque', 'bare']),
  ] },
  { id: 'light', line: 'the orb’s own kin', choices: [
    choice('core', ['sphere', 'ring', 'heart', 'knot', 'helix']),
    choice('veil', ['shroud', 'ribbons', 'wings', 'pillar', 'halo']),
    choice('colour', names(AURA), AURA),
    choice('mood', ['calm', 'thinking', 'listening', 'excited', 'tender']),
    choice('wake', ['still', 'motes', 'thread', 'rings', 'echo']),
  ] },
];
export const KIND_IDS = KINDS.map((k) => k.id);
export const FIRST_KIND = 'human';
export const COUNT = KINDS.reduce((n, k) => n + k.choices.reduce((m, c) => m * c.options.length, 1), 0);

export const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[0];
export const cleanKind = (id) => (KIND_IDS.includes(id) ? id : FIRST_KIND);

// a kind as it was first drawn
export function freshLook(kind) {
  return Object.fromEntries(kindOf(kind).choices.map((c) => [c.id, c.options[0]]));
}
// whatever was kept, made into a look of this kind: what is not one of the five is the first
export function cleanLook(kind, any) {
  const look = freshLook(kind);
  if (any && typeof any === 'object') for (const c of kindOf(kind).choices) if (typeof any[c.id] === 'string' && c.options.includes(any[c.id])) look[c.id] = any[c.id];
  return look;
}
// one look for each of the five kinds
export function cleanLooks(any) {
  return Object.fromEntries(KIND_IDS.map((k) => [k, cleanLook(k, any && typeof any === 'object' ? any[k] : null)]));
}
export function randomLook(kind, rnd = Math.random) {
  return Object.fromEntries(kindOf(kind).choices.map((c) => [c.id, c.options[Math.min(c.options.length - 1, Math.floor(rnd() * c.options.length))]]));
}
// the colours a swatch shows for an option (one or two), or none where the option is a shape
export function swatchOf(kind, choiceId, option) {
  const c = kindOf(kind).choices.find((x) => x.id === choiceId), s = c?.swatch?.[option];
  return !s ? null : Array.isArray(s) ? s : [s];
}
