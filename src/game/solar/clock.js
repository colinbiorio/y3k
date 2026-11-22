// clock.js — THE WORLD'S CLOCK. One instant, read by everything that needs the time: where the Sun stands, how the
// air is lit, and (later) a journey's two ends. No page and no three in it.
//
// It is the real UTC clock. Two things may move it, and only these:
//   · an OFFSET in milliseconds (a later creative-mode dial sets one; survival never does), and
//   · a PIN, for tests and pictures only: `?at=2026-11-21T07:10:00Z` in the page's address holds the clock at that
//     instant, so the same picture can be taken twice. A pinned clock does not run.
// `when()` is what every reader calls: milliseconds of UTC, the same number ephemeris.js takes.
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

// the instant an address asks for, or null: an ISO date and time. One with no zone is read as UTC, never as the
// reader's own zone: the same address must mean the same sky on every machine.
export function pinOf(search) {
  if (!search) return null;
  let at = null;
  try { at = new URLSearchParams(search).get('at'); } catch { return null; }
  if (!at) return null;
  at = at.trim().replace(' ', '+');                   // a '+' in a query arrives as a space
  if (!ISO.test(at)) return null;
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(at)) at += at.includes('T') ? 'Z' : 'T00:00:00Z';
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

// Is the true sky asked for? Only by `?sky=true` in the page's address: until the night and the Moon are made and
// looked at, a place keeps the sky it had, so that nobody meets a half-made one. The question is asked here because
// this is the one file of the sky's that a page without the switch reads: sky.js and all it leans on (the air, the
// daylight, the clockwork) are fetched only when the answer is yes (view.js).
export function skyAsked(search) { try { return new URLSearchParams(search || '').get('sky') === 'true'; } catch { return false; } }

export function createClock({ now = () => Date.now(), search = '' } = {}) {
  let offset = 0, pin = pinOf(search);
  return {
    when: () => (pin === null ? now() + offset : pin + offset),
    get offset() { return offset; },
    get pinned() { return pin; },
    // the dial (a later stage): the clock reads `ms` now and runs on from there; back() gives the real time again
    set(ms) { if (Number.isFinite(+ms)) offset = +ms - (pin === null ? now() : pin); },
    shift(ms) { if (Number.isFinite(+ms)) offset += +ms; },
    back() { offset = 0; },
    pin(ms) { pin = ms === null || !Number.isFinite(+ms) ? null : +ms; },
  };
}

// the page's own clock: pinned if the address says so
export const clock = createClock({ search: typeof location === 'undefined' ? '' : location.search });
export const when = () => clock.when();
