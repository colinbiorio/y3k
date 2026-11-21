// glyphs.js — A GLYPH FOR EVERY CONTROL (Colin, 19 Nov 2026: "a prettier menu for all the controls -- dedicated
// unimat icons for each"). Each is a small drawing on a 24-unit square in strokes 2.2 wide with round ends, so that
// at 22 pixels it still reads and the unimat pour (../mercury-buttons.js: the drawing baked to a distance field and
// poured as the one material) has body enough to shine. Until the pour lands, or where there is no WebGL2, the
// drawing itself stands in. No page, no three: the suite reads them.
//
// An action with no glyph of its own here (one added to input.js's ACTIONS later) is drawn as a key.
export const GLYPHS = {
  look: '<path d="M2.5 12c2.6-4.6 6-6.8 9.5-6.8s6.9 2.2 9.5 6.8c-2.6 4.6-6 6.8-9.5 6.8S5.1 16.6 2.5 12z"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  forward: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  back: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  left: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
  right: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  // two chevrons rising off the ground's line
  jump: '<path d="M4 21h16M7 13.5l5-5 5 5M7 8l5-5 5 5"/>',
  // a chevron and the lines it leaves
  dash: '<path d="M3 8h6.5M2 12h7.5M3 16h6.5M13 5.5l6.5 6.5-6.5 6.5"/>',
  sprint: '<path d="M3.5 6l6 6-6 6M10.5 6l6 6-6 6M17.5 6l3 6-3 6"/>',
  // two footprints, one ahead of the other
  walk: '<g fill="currentColor" stroke="none"><ellipse cx="8.4" cy="8.6" rx="2.7" ry="3.9" transform="rotate(-14 8.4 8.6)"/><ellipse cx="15.6" cy="15.4" rx="2.7" ry="3.9" transform="rotate(-14 15.6 15.4)"/></g>',
  // a wing
  fly: '<path d="M3 18.5c6.5-.4 13-4.6 18-13.5-1 8.2-6.4 13.3-13.6 14.1"/><path d="M3 18.5l7.5-5.2M7 18.6l6.6-6.1"/>',
  // down into the water
  down: '<path d="M12 2.5V13M7.5 8.5L12 13l4.5-4.5"/><path d="M2.5 18.5c1.6-1.4 3.2-1.4 4.8 0s3.2 1.4 4.7 0 3.2-1.4 4.7 0 3.2 1.4 4.8 0"/>',
  // half and half: survival or creative
  mode: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  build: '<path d="M3.5 11L12 4l8.5 7M5.5 9.6V20h13V9.6M10 20v-5.5h4V20"/>',
  // the ring, thrown
  attack: '<circle cx="14.5" cy="9.5" r="5.2"/><path d="M2.5 21.5l6-6M3 16.5l2.6-2.6M7.5 21l2.6-2.6"/>',
  // twice round
  whirl: '<path d="M19.5 12.5a7.5 7.5 0 1 1-2.6-6.2"/><path d="M18.6 2.8v4.4h-4.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  guard: '<path d="M12 2.8l7.6 3v5.8c0 4.6-3.1 8.1-7.6 9.6-4.5-1.5-7.6-5-7.6-9.6V5.8z"/>',
  // what pulls and holds
  bind: '<path d="M6 3.5v8.5a6 6 0 0 0 12 0V3.5"/><path d="M6 8h3.2M14.8 8H18"/>',
  // the one in hand for the next
  weapon: '<path d="M4 8h13.5l-3.6-3.6M20 16H6.5l3.6 3.6"/>',
  // a bot over the water
  spawn: '<circle cx="12" cy="10.5" r="6.5"/><circle cx="12" cy="10.5" r="2.3" fill="currentColor" stroke="none"/><path d="M3.5 20.5h17"/>',
  // a hull and its sail
  board: '<path d="M2.5 14.5h19l-3 5h-13z"/><path d="M12 2.5v12M12 4l6.5 8.2H12"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.6"/><path d="M15.6 15.6L21 21M10.5 7.4v6.2M7.4 10.5h6.2"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.6"/><path d="M15.6 15.6L21 21M7.4 10.5h6.2"/>',
  // the controls: two sliders
  menu: '<path d="M3.5 7h17M3.5 17h17"/><circle cx="9" cy="7" r="2.6" fill="currentColor" stroke="none"/><circle cx="15.5" cy="17" r="2.6" fill="currentColor" stroke="none"/>',
  // a building's blueprint: put it there, turn it, leave it; and what uneven ground may be given
  place: '<path d="M4.5 12.5l5 5 10-11"/>',
  turn: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4 2.8v4.4h4.4"/>',
  cancel: '<path d="M6 6l12 12M18 6L6 18"/>',
  level: '<path d="M2 15.5c2.6 0 3.4-4 6-4h8c2.6 0 3.4 4 6 4M2 20h20"/><path d="M8 7.5h8" />',
  platform: '<path d="M3 10.5h18v3.5H3z"/><path d="M5.5 14v6.5M18.5 14v6.5M12 14v6.5"/>',
  key: '<rect x="2.8" y="6" width="18.4" height="12" rx="3"/><path d="M7 10.2h1M11.5 10.2h1M16 10.2h1M8 14h8"/>',
  // one key each (input.js SHORT): the five weapons, the five buildings, the five ships, each drawn as itself
  take_thread: '<rect x="8.5" y="4" width="7" height="12" rx="1.6"/><path d="M8.5 7.5h7M8.5 12.5h7M15.5 14c3.5 1.5 4.5 4 3 6.5"/>',
  take_bow: '<path d="M8 3c6.5 4 6.5 14 0 18M8 3v18"/><path d="M3.5 12h15M15.5 9l3 3-3 3"/>',
  take_ring: '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="3"/>',
  take_bell: '<path d="M6 17v-5.5a6 6 0 0 1 12 0V17M4 17h16M10.5 20.2h3M12 3.2v2.2"/>',
  take_torch: '<path d="M10.6 21h2.8l.9-9.5h-4.6z"/><path d="M12 3c2.8 2.6 3.2 4.8 1.8 6.7h-3.6C8.8 7.8 9.2 5.6 12 3z"/>',
  build_shelter: '<path d="M3 19h18M5.2 19a6.8 6.8 0 0 1 13.6 0"/><path d="M10.4 19v-2.6a1.6 1.6 0 0 1 3.2 0V19"/>',
  build_house: '<path d="M3.5 11.5L12 5l8.5 6.5M6 10.2V17h12v-6.8"/><path d="M7.5 17v3M16.5 17v3M10.6 17v-3.4h2.8V17"/>',
  build_workshop: '<path d="M2.5 19h19M3.5 19v-5a2.8 2.8 0 0 1 5.6 0v5M9.2 19v-5a2.8 2.8 0 0 1 5.6 0v5M14.9 19v-5a2.8 2.8 0 0 1 5.6 0v5"/>',
  build_tower: '<path d="M7 21h10M8.6 21V9.5h6.8V21"/><path d="M8.6 9.5a3.4 3.4 0 0 1 6.8 0"/><path d="M12 13v2.2"/>',
  build_hall: '<path d="M2.5 20h19M4 20v-4h16v4M6.5 16v-4h11v4M9.2 12V8.6h5.6V12"/>',
  call_skiff: '<path d="M2.5 13c3.2 4 15.8 4 19 0z"/><path d="M14.5 13v-3h3.5"/>',
  call_dart: '<path d="M2.5 12l7.5-3h7.5l4 3-4 3H10z"/><path d="M10.5 9L8 4.8M10.5 15L8 19.2"/>',
  call_dhow: '<path d="M3 15.5h18l-2.6 4H5.6z"/><path d="M11 15.5V4l7.2 9.5H11"/>',
  call_ark: '<path d="M2.5 12h17"/><ellipse cx="10.5" cy="12" rx="2.6" ry="7.4"/><circle cx="19.6" cy="12" r="1.9"/>',
  call_carrier: '<path d="M2 19.5h20l-2-3.2H4z"/><path d="M5.5 16.3L7 13h10l1.5 3.3M8.2 13l1-3h5.6l1 3"/>',
  // aboard a ship: its throttle (a gauge, part open), the throttle set (its notches), lightspeed (the stars streaming from ahead), the brake
  throttle: '<rect x="8" y="2.8" width="8" height="18.4" rx="4"/><path d="M12 17.2v-5"/>',
  throttle_set: '<path d="M8.5 3v18"/><path d="M8.5 5.5h8M8.5 10h5M8.5 14.5h8M8.5 19h5"/>',
  lightspeed: '<path d="M9.2 9.9L3 5M14.8 9.9L21 5M9.2 14.1L3 19M14.8 14.1L21 19"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/>',
  brake: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.6"/><path d="M9.5 12h5"/>',
  // the bar's own (BAR, below): the two modes, the body, the societies
  // survival: the heart the ground keeps you to
  survival: '<path d="M12 20.2C6.6 16.6 3.5 13.4 3.5 9.6A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8.5 2.3c0 3.8-3.1 7-8.5 10.6z"/>',
  // creative: a spark, and a smaller one
  creative: '<path d="M10 3.5c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7z"/><path d="M18.5 15.5v5M16 18h5"/>',
  // who you are here
  body: '<circle cx="12" cy="6.8" r="3.4"/><path d="M5 20.5a7 7 0 0 1 14 0"/>',
  // the world that was here first: its societies, as the stars they are drawn as, joined
  societies: '<circle cx="12" cy="5.2" r="2.3"/><circle cx="5" cy="17.8" r="2.3"/><circle cx="19" cy="17.8" r="2.3"/><path d="M10.1 8.6l-3.2 5.8M13.9 8.6l3.2 5.8M8.9 17.8h6.2"/>',
};
// THE BAR IN GLYPHS (view.js; Colin, 19 Nov 2026: "this bar still needs to be turned into glyphs"): each of its words is
// drawn, the word kept as the button's name and shown on hover, focus or a long press. The mode is drawn as the one it
// is; the weapons as the one in hand (take_ring, take_bow, ...); the rest as the sheet draws them.
export const BAR = { mode: (m) => (m === 'creative' ? 'creative' : 'survival'), body: 'body', build: 'build', weapons: (w) => (GLYPHS['take_' + w] ? 'take_' + w : 'take_ring'),
  bots: 'spawn', ships: 'board', controls: 'menu', societies: 'societies' };
export const glyphOf = (id) => GLYPHS[id] || GLYPHS.key;
// the drawing, as the page shows it (and the pour reads it)
export const glyphSvg = (id, px = 22) => `<svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${glyphOf(id)}</svg>`;

// the controls, as the sheet groups them (Colin's: moving, flying, building, ships, weapons); an action's own `group`
// in input.js's ACTIONS outranks this, and one with neither is put under "more"
export const GROUPS = [
  { id: 'move', name: 'moving', ids: ['look', 'forward', 'back', 'left', 'right', 'jump', 'dash', 'sprint', 'walk'] },
  { id: 'fly', name: 'flying', ids: ['fly', 'down', 'mode'] },
  { id: 'build', name: 'building', ids: ['build'] },
  { id: 'ships', name: 'ships', ids: ['board'] },
  { id: 'fight', name: 'weapons', ids: ['attack', 'whirl', 'guard', 'bind', 'weapon', 'spawn'] },
  { id: 'view', name: 'the eye and this sheet', ids: ['zoomIn', 'zoomOut', 'menu'] },
  { id: 'more', name: 'more', ids: [] },
];
// which group an action is shown in
export function groupOf(action) {
  if (action.group && GROUPS.some((g) => g.id === action.group)) return action.group;
  return (GROUPS.find((g) => g.ids.includes(action.id)) || GROUPS.at(-1)).id;
}
