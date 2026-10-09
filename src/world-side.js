// THE RIGHT SIDE OF THE ROOM: where the world screen's list of who is near,
// what carried across and what its people live by (#world-near) stands, and
// the map (#world-map) when it is open. Pure: rectangles in, places out, so
// the numbers can be tested without a page (test/world-side.test.mjs).
//
// Both used to sit at a fixed right: 20px, which is the column the nav
// frame's right rail stands in, and the rail paints over the world (z41 over
// z31). One row fit above the settings gear; the ways and the hails below it
// ran under the gear and across the frame's top border, and the open map lay
// under the rail. Nobody saw it until 2026-10-08, when play beats began to
// name ways and call across and the list filled on every owner's screen.
//
// No fixed spot inside the room works at every width either. The firsts card
// hangs from the top centre and folds, opens and widens (world-firsts.js);
// the world bar wraps into the room on a phone; the right rail's grip sits at
// mid-height just inside the room's edge; the tools and the hands stand at
// the bottom. At 1280 there is room beside the card, at 1024 there is not,
// and on a phone the top band is the card's. So world-view.js measures what
// is standing in the room and asks this for the highest free place, the way
// main.js measures the rails for the grips (fitRailBulge) instead of
// reproducing their arithmetic in CSS. Measured, the list gets 306 by 268px
// beside the card at 1280x800, 291 by 187 under it at 1024x768, 282 by 205
// left of the tools at 1024x600, and 256 by 119 under the card at 390x844.
// On an 844x390 phone held sideways, with the card open, there is no place
// for it at all: it waits, and the world bar says what it holds
// (world-view.js placeSide). scripts/play-smoke.mjs looks at 1280, 1024, the
// phone and the phone held sideways.
//
// All rectangles are viewport pixels, { l, t, r, b }.

// The highest free place in `room` (the hole the frame leaves):
//   things  what already stands in it; a place never overlaps one or comes
//           within `gap` of it (empty rectangles, hidden things, are ignored)
//   rights  the right edges a place may take, best first
//   width   the widest a place is drawn; minW the narrowest worth drawing
//   minH    the shortest worth drawing
// It tries each top, highest first (the room's top, then just under each
// thing), and at each top each right edge in turn. Something standing across
// the first minH of a place either leaves it at least minW to its right, and
// the place narrows to stand beside it (the list beside the firsts card at
// 1280), or rules that place out. The place then runs down to the first thing
// under it, or to the room's floor. Returns { top, right, width, height }, or
// null when nothing in the room is free. With biggest, every top and edge is
// tried and the place with the most room wins (the highest of equals).
export function sidePlace({ room, things = [], rights, width, minW = width, minH, gap = 10, biggest = false }) {
  const live = things.filter((t) => t && t.r > t.l && t.b > t.t);
  const floor = room.b - gap;
  const tops = [...new Set([room.t + gap, ...live.map((t) => t.b + gap)])]
    .filter((y) => y >= room.t + gap && y + minH <= floor)
    .sort((a, b) => a - b);
  let best = null;
  for (const top of tops) {
    for (const right of rights) {
      if (!(right <= room.r && right - minW >= room.l + gap)) continue;
      let left = Math.max(room.l + gap, right - width);
      let free = true;
      for (const t of live) {
        const across = t.l < right + gap && t.r + gap > left && t.t < top + minH + gap && t.b + gap > top;
        if (!across) continue;
        if (t.r + gap <= right - minW) left = Math.max(left, t.r + gap);
        else { free = false; break; }
      }
      if (!free) continue;
      let bottom = floor;
      for (const t of live) {
        if (t.l >= right + gap || t.r + gap <= left || t.b + gap <= top) continue;
        bottom = Math.min(bottom, t.t - gap);
      }
      if (bottom - top < minH) continue;
      const p = { top, right, width: right - left, height: bottom - top };
      if (!biggest) return p;
      if (!best || p.width * p.height > best.width * best.height) best = p;
    }
  }
  return best;
}

// The map's place and the list's, from what world-view.js measured:
//   view    the world's own box (the whole screen; the camera's centre is its)
//   room    the hole (#nav-hole)
//   card    the firsts card; tools the tools; gripR the right rail's grip
//   others  everything else standing in the room: the world bar, the hands,
//           the other three grips
//   map     the open map's full size, border included; mapOpen whether it is open
//   asked   the list was asked for from the world bar's count (world-view.js
//           shows that count only while the list has no place of its own)
// Returns { map, near }. map carries size, the size it is drawn at, which is
// less than map in a room shorter than the map. near is null when no place is
// free and nobody asked: the list waits, and world-view.js puts its count in
// the world bar. Asked for, near carries over: true, and lies over the
// firsts card.
export function sidePlaces({ view, room, card, tools, gripR, others = [], map, mapOpen, asked = false }) {
  // The society stands in the middle of the screen, where the camera keeps
  // it, so the middle is kept clear too: an eighth of the room's shorter side
  // each way from the centre. Without it the list stood over the ground at
  // 1024, under the card and beside the society's own buildings.
  const k = Math.min(room.r - room.l, room.b - room.t) / 8;
  const cx = (view.l + view.r) / 2, cy = (view.t + view.b) / 2;
  const middle = { l: cx - k, t: cy - k, r: cx + k, b: cy + k };
  const fixed = [...others, tools, gripR, middle];
  // The room's right edge: flush with the tools (104px on a desktop, the
  // hole's edge + 8 on a phone), or, where the rail's grip is in the way,
  // just left of the grip.
  const edge = [tools ? tools.r : room.r - 12, gripR ? gripR.l - 10 : NaN];
  // ...and just left of each thing standing in the room, rightmost first.
  // Those two edges alone left the list nowhere at 1024x600 with the card
  // open, while x 574-856, y 293-498 stood empty left of the tools; nowhere
  // on an 844x390 phone held sideways; and nowhere at 1024x768 with the card
  // opened to "all" (found in review, 2026-10-09).
  const inRoom = (t) => t && t.r > room.l && t.l < room.r && t.b > room.t && t.t < room.b;
  const wide = [...new Set([...edge, ...[...fixed, card].filter(inRoom).map((t) => t.l - 10)])]
    .filter((r) => r > room.l && r <= room.r).sort((a, b) => b - a);
  const at = (rights, things, width, minW, minH, biggest) => sidePlace({ room, things, rights, width, minW, minH, biggest });
  // The map is a thing you asked for. It keeps to the room's right edge, over
  // the firsts card if it must (1024x768), since there the list still has
  // room below it; only where that edge has no room for it at all does it
  // move in from the edge (1024x600, where the corner would cover the right
  // rail's grip). A room shorter than the map (206px on an 844x390 phone held
  // sideways) has no place for it at full size, and it is drawn smaller,
  // down to 140px, rather than over the tools. If nothing at all is free, the
  // room's top right corner. Never over the rails.
  const mapIn = (s) => at(edge, [...fixed, card], s, s, s) || at(edge, fixed, s, s, s)
    || at(wide, [...fixed, card], s, s, s) || at(wide, fixed, s, s, s);
  let mapAt = null, size = map;
  for (const s of [map, 200, 180, 160, 140].filter((s) => s <= map)) {
    size = s;
    if ((mapAt = mapIn(s))) break;
  }
  if (!mapAt) {
    size = Math.max(140, Math.min(map, room.b - room.t - 20));
    mapAt = { top: room.t + 10, right: edge[0], width: size, height: size };
  }
  mapAt = { ...mapAt, size };
  const opened = mapOpen ? { l: mapAt.right - size, t: mapAt.top, r: mapAt.right, b: mapAt.top + size } : null;
  // The list covers nothing and yields to the open map. It is worth drawing
  // three rows tall; in a crowded room, one; in a cramped one, one row only
  // 150px wide, which still holds "@vega · awake" (the hails wrap and it
  // scrolls). Each is looked for right of the screen's centre first, where
  // the list has always stood: tried by height alone, opening the map at
  // 1280 sent the list from under the map to the room's far top left.
  const things = [...fixed, card, opened];
  const east = wide.filter((r) => r > cx);
  let near = null;
  for (const [minW, minH] of [[220, 96], [220, 40], [150, 40]]) {
    near = at(east, things, 380, minW, minH) || at(wide, things, 380, minW, minH);
    if (near) break;
  }
  if (near || !asked) return { map: mapAt, near };
  // Asked for where nothing is free, the list lies over the firsts card the
  // way the map does, still clear of the rest (the middle too, if it can be),
  // and as the last resort in the room's top right corner. It takes the
  // biggest place there, not the highest: the person pressed a count of hails
  // and ways to read them, and the highest on an 844x390 phone held sideways
  // was a 222 by 51 strip under the bar, which showed "no other society
  // within sight" and nothing that was asked for (found in review,
  // 2026-10-09). The biggest there is 218 by 144, between the middle and the
  // tools.
  const over = at(wide, [...fixed, opened], 380, 150, 40, true)
    || at(wide, [...others, tools, gripR, opened], 380, 150, 40, true)
    || { top: room.t + 10, right: edge[0], width: Math.min(380, edge[0] - room.l - 10), height: room.b - room.t - 20 };
  return { map: mapAt, near: { ...over, over: true } };
}
