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
// beside the card at 1280x800, 291 by 187 under it at 1024x768, and 256 by
// 119 under it at 390x844 (scripts/play-smoke.mjs looks at all three).
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
// null when nothing in the room is free.
export function sidePlace({ room, things = [], rights, width, minW = width, minH, gap = 10 }) {
  const live = things.filter((t) => t && t.r > t.l && t.b > t.t);
  const floor = room.b - gap;
  const tops = [...new Set([room.t + gap, ...live.map((t) => t.b + gap)])]
    .filter((y) => y >= room.t + gap && y + minH <= floor)
    .sort((a, b) => a - b);
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
      if (bottom - top >= minH) return { top, right, width: right - left, height: bottom - top };
    }
  }
  return null;
}

// The map's place and the list's, from what world-view.js measured:
//   view    the world's own box (the whole screen; the camera's centre is its)
//   room    the hole (#nav-hole)
//   card    the firsts card; tools the tools; gripR the right rail's grip
//   others  everything else standing in the room: the world bar, the hands,
//           the other three grips
//   map     the open map's size, border included; mapOpen whether it is open
// Returns { map, near }: near is null when no place is free (it waits).
export function sidePlaces({ view, room, card, tools, gripR, others = [], map, mapOpen }) {
  // The society stands in the middle of the screen, where the camera keeps
  // it, so the middle is kept clear too: an eighth of the room's shorter side
  // each way from the centre. Without it the list stood over the ground at
  // 1024, under the card and beside the society's own buildings.
  const k = Math.min(room.r - room.l, room.b - room.t) / 8;
  const cx = (view.l + view.r) / 2, cy = (view.t + view.b) / 2;
  const fixed = [...others, tools, gripR, { l: cx - k, t: cy - k, r: cx + k, b: cy + k }];
  // flush with the tools (104px on a desktop, the hole's edge + 8 on a
  // phone), or, where the rail's grip is in the way, just left of the grip
  const rights = [tools ? tools.r : room.r - 12, gripR ? gripR.l - 10 : NaN];
  // The map is a thing you asked for: where nothing else is free (1024 and
  // narrower) it lies over the firsts card until it is closed, and if even
  // that is not free, in the room's top right corner. Never over the rails.
  const mapAt = sidePlace({ room, things: [...fixed, card], rights, width: map, minH: map })
    || sidePlace({ room, things: fixed, rights, width: map, minH: map })
    || { top: room.t + 10, right: rights[0], width: map, height: map };
  const opened = mapOpen ? { l: mapAt.right - map, t: mapAt.top, r: mapAt.right, b: mapAt.top + map } : null;
  // The list covers nothing and yields to the open map. It is worth drawing
  // three rows tall; in a crowded room, one.
  const list = { room, things: [...fixed, card, opened], rights, width: 380, minW: 220 };
  const near = sidePlace({ ...list, minH: 96 }) || sidePlace({ ...list, minH: 40 });
  return { map: mapAt, near };
}
