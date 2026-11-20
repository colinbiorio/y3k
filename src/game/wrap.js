// wrap.js — A SMALL FLAT MAP, AS A GLOBE. No page, no three (the suite runs it).
//
// Colin, 19 Nov 2026: "when you exit lightspeed, you should always continue going forward, and in front of you,
// there's the island. like, a globe. if you go too far in one direction you just end up on the other side of it. once
// our actual planets are built we won't really have to worry about that -- but it's helpful to have the correct
// animation and logic for smaller flat maps."
//
// So, until the planets are built, a place that is a flat map (the island) is a globe laid flat about its middle:
//   · GOING ROUND (roundOf): `half` metres from the middle is the far side of the globe, and the far side is one place
//     whichever way it was come to. A point past it comes back in from the opposite edge, going the way it was going,
//     so the middle it left behind is now ahead of it. `half` is past what the eye sees, so the turn over is not seen.
//   · OUT OF THE LIGHT (wentRound, comeOut): a ship that has flown at least that far in the light has gone round: it
//     comes out on its own heading with the map's middle straight ahead, `ahead` metres off, no lower than `low` nor
//     higher than `high`, and flies on toward it. One that has flown less is where it is.
// Nothing is ever further than `half` from the middle, so no number grows large.
//
// TO TAKE THIS OUT when a place is a real globe (the solar system, stage 7): view.js calls it in two places, globe()
// and outOfLight(). With those two gone, the distance a ship counts in the light (ships.js: s.light.dist, at exactly
// the speed of light at its top, in real seconds) is simply how far it has gone.
export const GLOBE = { half: 48000, ahead: 9000, low: 250, high: 900 };
export const midOf = (extent) => (extent ? [(extent.x0 + extent.x1) / 2, (extent.z0 + extent.z1) / 2] : [0, 0]);
// what is to be taken from a point (x, z) for it to have come round from the other side (null where it has not gone
// that far): whole crossings of the globe, back along the line from the middle
export function roundOf(x, z, mid = [0, 0], half = GLOBE.half) {
  const ox = x - mid[0], oz = z - mid[1], r = Math.hypot(ox, oz);
  if (!(r > half)) return null;
  const d = (2 * half * Math.ceil((r - half) / (2 * half))) / r;
  return [ox * d, oz * d];
}
// has a ship that flew this far in the light gone round?
export const wentRound = (flown, G = GLOBE) => flown >= G.half;
// where one that has comes out, heading `yaw` (a ship's: its way is [sin, 0, cos]): the middle straight ahead
export function comeOut(p, yaw, mid = [0, 0], G = GLOBE) {
  return [mid[0] - Math.sin(yaw) * G.ahead, Math.min(G.high, Math.max(G.low, p[1])), mid[1] - Math.cos(yaw) * G.ahead];
}
