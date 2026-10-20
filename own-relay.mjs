// YOUR PRESENCE, ON YOUR OWN SIGN-IN, FROM THE SITE. A turn of your presence's
// thinking — a conversation, a game, one of its own hours — is handed to your
// own open page, which hands it to y3kode on your own computer
// (y3k-code/brain.mjs), which runs your own signed-in Claude Code once, with no
// tools, and the words come back the same way. The server never touches a
// credential and never reaches the computer: the page in the person's own
// browser is the only bridge (CODE.md, line 2).
//
// EACH PERSON, ON THEIR OWN. Open to every signed-in account since 2026-10-12,
// on Colin's word after legal advice (WHO, below, is that line in one place).
// A turn goes only to a page of the person whose presence it is, and only the
// session it was sent to may answer it: nobody's turn ever reaches anyone
// else's page, computer or plan. The site never pays for, resells or pools
// anyone's usage, and the only limit on a turn is the person's own plan: when
// it is spent, their presence waits for it, the founder's like anyone's. So a
// turn here draws no presence budget and is $0 on their ledger (server.mjs,
// OWN_PID); the site has no key or allowance of its own for it to touch.
// Anthropic's terms on plan credentials:
// https://code.claude.com/docs/en/legal-and-compliance.
//
// There used to be a second way for the founder alone: the site running on
// their own machine spawned `claude -p` itself (local-claude-code.mjs,
// Y3K_LOCAL_CLAUDE_CODE=1). It is gone (2026-10-12); the founder thinks through
// this path like everyone.
//
// THE CHANNEL. The person's page, with this chosen in Settings → Brain (or by
// default, once y3kode on that computer can think: src/own-brain.js), holds
// open GET /api/own-brain (an event stream) and says which client to think
// with, and which account it was loaded for (as=: the route refuses a stream
// for anyone else, so a tab signed in since as someone else never offers its
// y3kode to them). A turn is one `job` event on the newest such stream; the
// page answers POST /api/own-brain/<id> from the same account. A job
// unanswered in time, or whose stream closes, fails like any upstream that did
// not answer — the orb says what is missing rather than inventing a line
// (src/brain.js).
//
// WHAT IT HOLDS, AND FOR HOW LONG. Every account may hold a stream open here,
// and accounts are free to make, so nothing a page does may make the server
// hold more than a little for it. A job is never larger than y3kode would take
// (MAX_SYSTEM, MAX_PROMPT: the prompt is cut to fit, oldest turns first); an
// account has at most MAX_JOBS turns out at once, as y3kode thinks at most two
// at a time; an account's pages together are cut, the one holding the most
// first, once MAX_BUFFERED bytes wait unread on them, rather than buffer every
// job sent after; and a page is asked again whether its session still stands
// each time one is about to be chosen and at every ping (valid, from the
// route), so a session cut off after the stream opened (an account reclaimed:
// auth.mjs sessionsFrom) stops receiving its owner's turns at once and is let
// go within a ping even if nothing asks; a closed account's pages go the moment
// it closes (forget). A page let go, for newer pages of its account
// (MAX_PAGES) or a session cut off, is taken down if it is not reading, as an
// overflowing one is (letGo).
//
// AND FOR EVERYONE TOGETHER, never by refusing someone for someone else. The
// site-wide breaker that once counted everyone went with the site's key
// (2026-10-12), and the bounds left are the server's, not anyone's plan's: so
// none of them may let strangers refuse a real person's normal turn. What waits
// unread on every page at once is bounded (MAX_UNREAD), and past it the pages
// holding the most are cut, never the one being written to for what others
// hold: a page that reads drains in seconds and holds next to nothing. The
// turns out at once, and their bytes, are bounded per account (MAX_JOBS) and
// for everyone (MAX_PENDING, MAX_HELD), and by nothing in between. There was a
// bound per source (the machine that asked: sixteen turns and 8MB, past which
// it was told 'busy' at once), gone 2026-10-12: one public address is often
// many people — a carrier's shared IPv4, a campus, an office, a VPN's exit —
// and eight strangers there, each with their two ordinary turns out, refused a
// ninth person's first turn, with the server holding next to nothing. How fast
// one machine may ask is the rate limiter's (security.mjs sourceOf, the same
// bucket); how much it can make the server hold is everyone's bound, MAX_HELD,
// which every turn's bytes count against whoever asked (nothing else here
// grows with what one source asks: `sources` keeps a record only while a turn
// of its is out, and every turn is one of MAX_PENDING). What a turn holds is
// all of it: the relay's copy of the system prompt and prompt, and what the
// route asking keeps alive while it waits (holds: its request's body).
//
// AT THAT CEILING, EACH PERSON AS THEMSELVES. An account holding no more than
// one person's ordinary share (MAX_JOBS turns, of an ordinary size together:
// SHARE_BYTES; counted at each address it asks from) is never made to give
// anything up, however many others ask and whoever shares its address: a
// person with a turn of the usual size out is never shed by strangers, each
// with a tiny turn of their own, nor for the crowd behind their address. Only
// an account holding past its share gives up its largest turns, until the new
// turn fits, and only to an asker who would hold less past their own share,
// its new turn counted in: anyone within their share takes room from anyone
// past theirs, of two past theirs a tie goes against the asker, and with
// nobody holding more past their share, the new turn is the one refused
// ('full'). Of those past theirs, the account furthest past its own gives way
// first, each by what it alone holds, whoever shares its address: of two
// alike, the one with the larger turn out, and of two of those the older.
// The source (sourceOf, still) is only where a share is counted. It chose
// who gave way first, the same day (2026-10-12): the address whose accounts
// together held the most past their shares, to find a machine flooding from
// many. So twenty people behind a campus's IPv4, each with a conversation a
// little past their share, gave up nineteen of them to fresh accounts on a
// few hundred IPv6 /64s, each further past its own, before any of those gave
// anything, and the same conversation alone elsewhere was never touched: the
// crowd was judged by its address, and a flooder spread over /64s, which cost
// it nothing, was not. A flooder's accounts past their share give way as
// anyone's do now, the furthest first, and a person behind its address is
// one of the people they give way to. And before that, until 2026-10-12, an
// address was judged as one holder against one person's share, so a crowd
// behind a busy one (a carrier's CGNAT, a campus) was past it the moment it
// held more than one person would, and tens of accounts elsewhere, each
// holding a little less than the crowd together, filled the ceiling: the next
// person behind it was refused, and the crowd's ordinary turns were let go
// for strangers. Only a flood fills the ceiling with ordinary shares, from
// one address or many alike: by turns, thousands of accounts at once
// (MAX_PENDING / MAX_JOBS); by bytes, hundreds, each holding a whole share at
// one address or at each of two (MAX_HELD / SHARE_BYTES shares) — and
// accounts are made ten an hour from one address (auth.mjs SIGNUP_MAX). A
// turn past the ordinary — a conversation unusually long, the largest turns
// y3kode takes — is past its account's
// share, and so is given up only at the ceiling, in a flood, to someone
// holding less past theirs (SHARE_BYTES says why it is no longer a share).

import { randomBytes } from 'node:crypto';
import { cleanSpeed } from './speed.mjs';

// Any signed-in account. The routes refuse a visitor with no session before
// this is asked; it is checked again here so nothing reaches a channel without one.
export const WHO = (user) => typeof user?.id === 'string' && user.id.length > 0;
export const THINKERS = ['claude'];           // y3k-code/brain.mjs THINKERS: the clients with a verified no-tools mode
export const LEDGER_MODEL = 'own:claude-code';   // what the ledger calls a turn on someone's own sign-in ($0)
const MAX_TEXT = 200000;
const PING_MS = 25000;
// Pages one account may hold open at once. Each is a held connection, and now
// that every account may offer one, a script with a session must not be able to
// pile them up: past this, the oldest is let go (a turn goes to the newest).
export const MAX_PAGES = 4;
// What y3kode takes in one turn (y3k-code/protocol.mjs, 'brain.complete':
// system and prompt at most 200000 characters each, refused past that rather
// than cut). A job it would refuse is never written: the prompt is cut to fit
// (toPrompt), and a system prompt past it fails the turn here, at once.
export const MAX_SYSTEM = 200000;
export const MAX_PROMPT = 200000;
export const MAX_IMAGE = 3 * 1024 * 1024;   // a camera frame, base64 (y3k-code/brain.mjs MAX_IMAGE)
// One account's turns out at once. y3kode thinks two at a time and says 'busy'
// to a third (y3k-code/engine.mjs think), so a third here could only wait on a
// page to be refused: it fails at once instead, and nothing piles up behind a
// page for the server to hold.
export const MAX_JOBS = 2;
// What may wait unread on one account's pages, all of them together, in bytes.
// A page reads its stream as it arrives, so this stays near nothing; a stream
// opened and never read (a script with a session) would otherwise have every
// job sent to it, each up to MAX_SYSTEM + MAX_PROMPT, buffered in this
// server's memory for as long as the connection lasted. Past this the page
// holding the most is cut, as a page that closed is. Counted across the
// account's pages, not per page: with MAX_PAGES of them each held just under
// it, one free account pinned four times this, and newer pages never let the
// older ones go while they stayed open. And counted in bytes: what is written
// is a Buffer (write, below), as a string was counted in characters, and a
// prompt in a script of three-byte characters held three times the bound.
export const MAX_BUFFERED = 2 * 1024 * 1024;
// …and on every page at once. Each account is held to MAX_BUFFERED, but
// accounts are free to make, so many of them, each just under it, could still
// pin as much as they liked. Past this the pages holding the most unread are
// cut first, until it is back under: a page that reads holds next to nothing,
// so a real page is never the one cut, and is never refused for what other
// pages are not reading.
export const MAX_UNREAD = 32 * 1024 * 1024;
// How long a page that was let go has to take its farewell and the end of its
// stream before its connection is taken down anyway. A page that reads takes
// both at once; this is only for one that does not (letGo).
export const LET_GO_MS = 5000;
// A source: the machine that asked for the turns (security.mjs sourceOf: an
// IPv4 address, or an IPv6 /64), whichever accounts they are for. Nothing
// refuses a source for what it holds, counts it as one holder against a
// share, or sends its accounts first for the others behind it: a shared
// address is many people, and a cap on it refused them for each other below
// the site's ceiling, as the share did at it, and as choosing by its sum let
// them go first (above). Accounts are free to make, so one machine with sixty
// of them, each holding two of the largest turns, can still fill the ceiling
// by itself; each of them is then past its share, far past, and gives its
// largest turns up to anyone holding less past theirs, a person behind that
// address too (roomFor).
//
// One person's ordinary share of what the relay holds, which nobody else's
// turn can take from them: an account's MAX_JOBS turns, each of an ordinary
// size — a presence's system prompt (some 9KB), a conversation of a dozen
// turns as the prompt, and the same again as the body the route holds while
// it waits (holds) — counted as written, at each address it asks from. An
// account holding no more than this is never let go of anything to make room
// (roomFor): before this, the source holding the most gave way and a tie went
// to the asker, so strangers putting one tiny turn each on a thousand
// addresses made a person's one ordinary turn the most held, and it was let
// go for theirs. And it is sized for ordinary turns, not the largest: as two
// of the largest y3kode takes (1.2MB), some fifty accounts each holding two
// filled MAX_HELD with what nobody could be made to give up, and every new
// turn on the site, a person's 9KB one too, was refused. Filling it with
// ordinary shares takes hundreds now (MAX_HELD / SHARE_BYTES); a turn past
// the ordinary is given up only to someone holding less past their share,
// and only at the ceiling.
export const SHARE_BYTES = MAX_JOBS * 64 * 1024;
// What the relay holds for everyone together. The bytes (MAX_HELD) are what
// keep the server's memory safe on a small instance (a few hundred MB),
// whoever asked and from however few machines, and real turns, some tens of
// KB each, are a sliver of them. The turns (MAX_PENDING) are not the memory's
// guard — the bytes are — so they are many: each holds a small record and a
// waiting request, and filling them with ordinary shares, which nobody can be
// made to give up, takes thousands of accounts at once (MAX_PENDING /
// MAX_JOBS), as filling the bytes with them takes hundreds. Reaching either
// refuses nobody new while an account holds more past its share than they
// would past theirs: it gives up its largest turns until the new one fits
// (ask, roomFor).
export const MAX_PENDING = 8192;
export const MAX_HELD = 64 * 1024 * 1024;   // bytes held for every turn out (size, in ask)

// Why a turn on someone's own sign-in did not answer, as one word the page
// has a line for (src/brain.js whyLine), for the two that are not the plan's
// limit and are not y3kode's fault: the person's presence already thinking as
// much as y3kode does at once (the relay's MAX_JOBS, or y3kode's own 'busy';
// once also the machine that asked holding its whole share of the relay, a
// bound gone 2026-10-12), and the site holding as many turns as it
// holds for everyone, with nobody holding more of them past their own share
// than that account would (MAX_PENDING, MAX_HELD; a turn let go to make
// room, from an account holding past its share, says the same). Both pass with
// a moment's wait. Anything else keeps the page's general line for a turn on
// the plan. server.mjs upstreamRefused hands the page these.
export const OWN_WHYS = { busy: 'own-busy', full: 'own-full' };
export const ownWhy = (out) => (out && out.ok === false && Object.hasOwn(OWN_WHYS, out.status) ? OWN_WHYS[out.status] : null);

// The conversation as one prompt. y3kode runs the client in print mode, which
// takes one prompt, so earlier turns ride along as a transcript and the newest
// line comes last. The prompt never starts with the person's own words, so a
// message beginning with '/' is never read as a Claude Code command.
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  return '';
}
const HEARD = 'The conversation so far:';
const NEWEST = 'Their newest message:';
const SILENCE = '(no words — respond to the silence as yourself)';
// Honest senses: this bridge carries text only. Say so rather than let the orb
// pretend it saw a frame it was never sent.
export const UNSEEN = '(A camera frame came with this message, but this connection carries text only, so you cannot see it.)';
// Since 2026-10-19 the frame itself travels with the turn (a y3kode that can
// see says so in its hello: senses), and the words say what it is instead.
export const SEEN = '(A camera frame comes with this message: that is them, right now.)';
// At most `max` characters (MAX_PROMPT: what y3kode takes). The newest message
// always goes, cut to its newest end if it alone is too long; the turns before
// it ride along newest first while they fit, so a long conversation loses its
// oldest turns first.
export function toPrompt(messages, image, max = MAX_PROMPT, { carried = false } = {}) {
  const turns = (Array.isArray(messages) ? messages : [])
    .map((m) => ({ role: m?.role, text: textOf(m?.content) }))
    .filter((t) => t.text);
  const last = turns.length && turns[turns.length - 1].role === 'user' ? turns.pop() : null;
  const tail = image ? [carried ? SEEN : UNSEEN, NEWEST] : [NEWEST];
  const fixed = tail.join('\n').length + 1;
  let newest = last ? last.text : SILENCE;
  if (fixed + newest.length > max) newest = newest.slice(newest.length - Math.max(0, max - fixed));
  const room = max - fixed - newest.length;
  const said = [];
  let used = HEARD.length + 2;   // the heading's line break, and the blank line after the transcript
  for (let i = turns.length - 1; i >= 0; i--) {
    const line = `${turns[i].role === 'assistant' ? 'You' : 'Them'}: ${turns[i].text}`;
    if (used + line.length + 1 > room) break;
    used += line.length + 1;
    said.unshift(line);
  }
  return [...(said.length ? [HEARD, ...said, ''] : []), ...tail, newest].join('\n');
}

// What a page says about a turn it could not take is written to the server's
// log ([own], server.mjs), so it is made plain first: the code is one word of
// the kind y3kode uses ('signed-out', 'busy') or else 'failed', and the reason
// is one line with no control characters, so no page can write lines of its own
// into the log.
const CODE = /^[a-z][a-z-]{0,39}$/;
const oneLine = (s, n) => (typeof s === 'string' ? s : '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').slice(0, n);

// Why a turn is refused at the site's ceiling ('full'), for the server's log,
// and why one was let go to make room. "This connection" is the account that
// asked: nobody is judged by the address they share.
const FULL_MOST = 'the site is holding as many turns as it holds for everyone, and this connection holds the most of them';
const FULL_SHARE = 'the site is holding as many turns as it holds for everyone, and nobody holds more of them past their own share than this connection would';
const LET_GO_FULL = 'let go to make room: the site was holding all it holds for everyone, and this connection held more of it past its own share than the one asking would';

// `shareJobs`, `shareBytes`: one person's ordinary share, which no account is
// made to give up (MAX_JOBS, SHARE_BYTES; a test sets them small, as it does
// the ceilings).
export function createRelay({ timeoutMs = 190000, now = () => Date.now(), maxPages = MAX_PAGES, maxJobs = MAX_JOBS, maxBuffered = MAX_BUFFERED,
  letGoMs = LET_GO_MS, maxPending = MAX_PENDING, maxHeld = MAX_HELD, maxUnread = MAX_UNREAD,
  shareJobs = MAX_JOBS, shareBytes = SHARE_BYTES, pingMs = PING_MS } = {}) {
  const channels = new Map();   // uid → [{ uid, res, provider, at, jobs:Set, closed, valid, close }]
  const jobs = new Map();       // id → { id, uid, ch, src, size, seq, pair, finish }
  // What is out at the ceiling's count (roomFor) and nowhere else; nothing is
  // refused for it below that, and each record goes with its last turn.
  // source → Map uid → pair; a pair is { uid, jobs: Set of ids, bytes, top:
  // its largest turn, of two the same size the older }, one account's turns
  // from one machine, measured against one person's share
  const sources = new Map();
  const past = new Set();       // the pairs holding past their share, by turns or bytes: the only ones roomFor looks at
  const owners = new Map();     // uid → { n, bytes }: each account's turns out, from wherever
  const waiting = new Set();    // pages something was left unread on when last written to
  let heldBytes = 0;            // what every turn in `jobs` holds (its size: ask)
  let seq = 0;                  // the order turns were taken in: of two the same size, the older gives way first

  // What a pair holds past one person's share, by turns (`d` 'n') or by bytes,
  // less what a plan already lets go of (`g`: roomFor). → a number ≥ 0
  const overOf = (p, g, d) => (d === 'n'
    ? Math.max(0, p.jobs.size - (g ? g.n : 0) - shareJobs)
    : Math.max(0, p.bytes - (g ? g.bytes : 0) - shareBytes));
  // A pair's largest turn not in `taken` (a plan's: roomFor), of two the same
  // size the older; null with none. One past its share, less what a plan lets
  // go of, always has one: what it holds past its share is in turns not taken.
  const largest = (p, taken) => {
    let big = null;
    for (const id of p.jobs) {
      if (taken?.has(id)) continue;
      const j = jobs.get(id);
      if (!big || j.size > big.size || (j.size === big.size && j.seq < big.seq)) big = j;
    }
    return big;
  };
  // A turn taken or ended: its pair, whether that pair is past its share, and
  // its account's count move together, and each record goes with its last turn.
  const tally = (id, sign) => {
    const j = jobs.get(id), p = j.pair;
    if (sign > 0) p.jobs.add(id); else p.jobs.delete(id);
    p.bytes += sign * j.size;
    if (sign > 0) { if (!p.top || j.size > p.top.size) p.top = j; } else if (p.top === j) p.top = largest(p);
    if (overOf(p, null, 'n') || overOf(p, null, 'bytes')) past.add(p); else past.delete(p);
    const at = sources.get(j.src);
    if (!p.jobs.size && at?.get(p.uid) === p) at.delete(p.uid);
    if (at && !at.size) sources.delete(j.src);
    const o = owners.get(j.uid) || { n: 0, bytes: 0 };
    o.n += sign; o.bytes += sign * j.size;
    if (o.n > 0) owners.set(j.uid, o); else owners.delete(j.uid);
  };

  const held = (uid) => (channels.get(uid) || []).filter((c) => !c.closed);
  // Whether the session that opened a page still stands (valid: the route's
  // check of the stream's own cookie). A check that throws is a no.
  const stands = (c) => { try { return c.valid() === true; } catch { return false; } };
  // This account's pages that may still think for it. Each is asked again
  // whether its session stands whenever a page is about to be chosen (and at
  // each of its pings: open), and one whose session was cut off since it
  // opened is let go now, its turns with it.
  const live = (uid) => {
    for (const c of held(uid)) if (!stands(c)) letGo(c);
    return held(uid);
  };
  const outFor = (uid) => held(uid).reduce((n, c) => n + c.jobs.size, 0);

  // What waits unread for a page in this server, in bytes (written as Buffers,
  // so the stream counts bytes, not characters). A page let go holds nothing
  // here that counts: it is down, or its end is on its way (letGo).
  const unread = (c) => (c.closed ? 0 : c.res.writableLength || 0);
  // A page that has stopped reading goes down at once: ending it politely
  // would only queue behind what it is not reading. What it was asked fails 'gone'.
  const cut = (c) => { c.close(); try { c.res.destroy(); } catch { /* already gone */ } };
  // Past `bound`, the pages holding the most unread are cut, the most first,
  // until what is left is back under it. → nothing; the pages cut are closed
  const cutMost = (pages, bound) => {
    const by = pages.map((c) => [c, unread(c)]).filter(([, n]) => n > 0);
    let sum = by.reduce((n, [, b]) => n + b, 0);
    if (sum <= bound) return;
    by.sort((a, b) => b[1] - a[1]);
    for (const [c, n] of by) { if (sum <= bound) break; cut(c); sum -= n; }
  };
  // Every page something is waiting unread on, for the bound on everyone's.
  // Only a page left holding something when it was last written to can hold
  // any, so only those are looked at; one that has read it all since drops out.
  const unreadPages = () => {
    const out = [];
    for (const c of waiting) { if (unread(c) > 0) out.push(c); else waiting.delete(c); }
    return out;
  };

  // Everything written to a page goes through here, and nothing is queued for
  // a page that has stopped reading once the bounds are passed: first this
  // account's pages together (maxBuffered: the one holding the most is cut,
  // which is this page when it is the one not reading), then every page at
  // once (maxUnread: the pages holding the most, wherever they are). A page
  // that reads holds next to nothing, so it is never the one cut, and the
  // page written to is never refused for what other pages hold.
  // → whether it was written
  const write = (ch, text) => {
    if (ch.closed) return false;
    cutMost(held(ch.uid), maxBuffered);
    if (ch.closed) return false;
    cutMost(unreadPages(), maxUnread);
    if (ch.closed) return false;
    try { ch.res.write(Buffer.from(text)); } catch { return false; }
    if (unread(ch) > 0) waiting.add(ch);
    return true;
  };
  const send = (ch, ev, data) => write(ch, `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);

  // A page let go — given way to newer ones of its account, or on a session
  // cut off since it opened — is told so (`farewell`), its turns fail, and its
  // stream is ended. Ending alone was not enough: a page that has stopped
  // reading kept everything waiting unread for it (up to maxBuffered) queued
  // on a connection it could hold open for good, counted by nothing here once
  // it was let go, so cycling pages bypassed the bound one page at a time. So
  // it goes down as an overflowing page does: at once, when anything is still
  // unwritten after the end (a page that reads takes the farewell and the end
  // straight away), and otherwise once its end has not finished in letGoMs.
  const letGo = (ch, farewell) => {
    if (farewell) send(ch, farewell, {});
    ch.close();
    const { res } = ch;
    if (!res.destroyed) { try { res.end(); } catch { /* already gone */ } }
    if (res.destroyed || res.writableFinished) return;
    const down = () => { try { res.destroy(); } catch { /* already gone */ } };
    if ((res.writableLength || 0) > 0) { down(); return; }
    const t = setTimeout(down, letGoMs);
    t.unref?.();
    res.once?.('finish', () => clearTimeout(t));
    res.once?.('close', () => clearTimeout(t));
  };

  // GET /api/own-brain — a person's page, offering to think for their own presence.
  // valid() says whether the session that opened it still stands (server.mjs);
  // without one, it stands as long as the stream does.
  function open(req, res, user, { provider, valid } = {}) {
    if (!WHO(user)) { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'not yours' })); return; }
    const p = THINKERS.includes(provider) ? provider : THINKERS[0];
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const ch = { uid: user.id, res, provider: p, at: now(), jobs: new Set(), closed: false, valid: typeof valid === 'function' ? valid : () => true };
    let ping = null;
    const close = ch.close = () => {
      if (ch.closed) return;
      ch.closed = true;
      clearInterval(ping);
      waiting.delete(ch);
      const rest = held(user.id);
      if (rest.length) channels.set(user.id, rest); else channels.delete(user.id);
      // what this page was asked and never answered fails now, not at the timeout
      for (const id of ch.jobs) jobs.get(id)?.finish({ ok: false, status: 'gone', detail: 'the page that was thinking closed' });
    };
    // the oldest of this account's pages give way to the newest, and are told
    // so: a stream that just ends is one an EventSource opens again, and that
    // page, back as the newest, would let the next oldest go, round and round
    const before = live(user.id);
    for (const old of before.slice(0, Math.max(0, before.length - maxPages + 1))) letGo(old, 'replaced');
    channels.set(user.id, [...held(user.id), ch]);
    req.on('close', close);
    res.on('close', close);
    // Each ping asks again whether the page's session stands. Asked only when
    // a page was about to be chosen, a page whose session was cut off, or
    // whose account was closed, stayed open until its account next asked for
    // a turn, and a closed account never does: so it is let go here, within a
    // ping, whether or not anything asks.
    ping = setInterval(() => { if (stands(ch)) write(ch, ': ping\n\n'); else letGo(ch); }, pingMs);
    ping.unref?.();
    send(ch, 'ready', { provider: p });
  }

  const connected = (user) => WHO(user) && live(user.id).length > 0;

  // An account closed (server.mjs, /api/me/delete): every page of it is let go
  // now, and what they held fails, rather than at each one's next ping. Its
  // EventSource opening again is refused, as it has no session any more.
  function forget(uid) {
    for (const c of held(String(uid))) letGo(c);
  }

  // Room for one more turn, of `size` bytes, for account `uid`, within what
  // the site holds for everyone: → the turns to let go to make it (none, when
  // it fits already), or why the new turn is the one refused (FULL_MOST,
  // FULL_SHARE). Each account is measured against one person's ordinary share
  // (shareJobs turns, shareBytes: two ordinary turns, not two of the largest)
  // at each address it asks from, and only one holding past it can be made to
  // give anything up, and only while it still is: a person with a turn or two
  // of the usual size out keeps them whoever asks, however many, from
  // wherever, and whoever shares their address. One past its share gives way
  // only to an asker who would hold less past their own, the new turn counted
  // in (the asker's whole account, from wherever it asks): anyone within their
  // share takes room from anyone past theirs, and of two past theirs a tie
  // goes against the asker, so neither can shed the other's turns back and
  // forth. Of those that would give way, the one holding the most past its
  // share by itself — turns while there are too many, bytes while there are
  // too many of those — gives up its largest turn, and again, until the new
  // one fits: of two as far past, the one with the larger turn out, and of two
  // of those the older turn. Nobody goes first for whoever shares their
  // address. It was the address that chose (2026-10-12, the same day): the one
  // whose accounts held the most past their shares together gave way first,
  // so a campus's crowd, each a little past their share, gave up nineteen
  // turns of twenty to accounts each further past theirs, spread over IPv6
  // /64s, while the same conversation alone elsewhere was never touched. And
  // before that the address was measured as one holder against one person's
  // share, so a crowd behind one gave way like a flooder and was refused like
  // one. With nobody to give way, the new turn is refused, and the asker's own
  // are never let go for it. Nothing is let go here: the caller does, once
  // nothing else refuses the turn. Asks reach here only at the ceiling. Each
  // step looks only at the accounts past their share (past, kept as turns come
  // and go: tally), each holding at most maxJobs turns: a crowd of thousands
  // within their shares costs nothing, and an ask against all MAX_PENDING
  // turns about a millisecond.
  const roomFor = (uid, size) => {
    let count = jobs.size + 1, bytes = heldBytes + size;
    if (count <= maxPending && bytes <= maxHeld) return [];
    const had = owners.get(uid);
    const me = { n: (had ? had.n : 0) + 1, bytes: (had ? had.bytes : 0) + size };
    const gave = new Map();    // pair → { n, bytes } this plan lets go of
    const taken = new Set();   // the turns this plan lets go of
    const plan = [];
    while (count > maxPending || bytes > maxHeld) {
      const d = count > maxPending ? 'n' : 'bytes';
      const mine = Math.max(0, me[d] - (d === 'n' ? shareJobs : shareBytes));
      // of the accounts (each at one address) holding more past its share than
      // the asker would, the one holding the most past it, and its largest turn
      let most = 0, big = null;
      for (const p of past) {
        if (p.uid === uid) continue;
        const g = gave.get(p), over = overOf(p, g, d);
        if (over <= mine || over < most) continue;
        const j = g ? largest(p, taken) : p.top;
        if (!big || over > most || j.size > big.size || (j.size === big.size && j.seq < big.seq)) { big = j; most = over; }
      }
      if (!big) return refusal(uid, me, d, gave);
      const g = gave.get(big.pair) || { n: 0, bytes: 0 };
      g.n += 1; g.bytes += big.size;
      gave.set(big.pair, g);
      taken.add(big.id);
      count -= 1; bytes -= big.size;
      plan.push(big.id);
    }
    return plan;
  };
  // Why nobody gave way: the asker's account, its new turn counted in, would
  // hold as much as any other does (FULL_MOST), or others hold more, but none
  // more past their share (FULL_SHARE). Looked at only when a turn is refused.
  const refusal = (uid, me, d, gave) => {
    const off = new Map();
    for (const [p, g] of gave) off.set(p.uid, (off.get(p.uid) || 0) + g[d]);
    let most = 0;
    for (const [u, o] of owners) if (u !== uid) most = Math.max(most, o[d] - (off.get(u) || 0));
    return most > me[d] ? FULL_SHARE : FULL_MOST;
  };

  // One turn, through the newest page of this person's. → { ok, text, usage } | { ok: false, status, detail }
  // `spare`: how many of the account's MAX_JOBS this turn must leave free for
  // others. Code's translator leaves one (server.mjs, /api/code/voice), so a
  // busy coding session never takes the turn the person is waiting on.
  // `source`: the machine that asked (security.mjs sourceOf, from the route),
  // at which the turn counts against its account's share there (roomFor), and
  // nowhere else. A turn without one counts as its account's own.
  // `admit`: a last word from the route, asked once nothing here refuses the
  // turn and before anything is let go or written for it: anything but true
  // refuses it ('not-admitted'). The translator takes its day's count there,
  // so a turn refused 'busy' or 'full' spends none of it.
  // `holds`: the bytes the route asking keeps alive for this turn while it
  // waits (server.mjs bodyHeld: its request's body as read). A turn's size is
  // that and the relay's own copy of its system prompt and prompt, and every
  // bound here counts the size: it counted only the copy, while each waiting
  // conversation route kept its whole parsed body — a conversation and a
  // picture, up to a megabyte — alive beside it, counted by nothing.
  function ask(user, { system, prompt, effort, signal, spare = 0, source, admit, holds, onPart, image } = {}) {
    if (!WHO(user)) return Promise.resolve({ ok: false, status: 'not-yours' });
    const chs = live(user.id);
    const ch = chs[chs.length - 1];
    if (!ch) return Promise.resolve({ ok: false, status: 'no-page', detail: 'no page of yours is open to think with' });
    if (signal?.aborted) return Promise.resolve({ ok: false, status: 'aborted' });
    const sys = String(system || ''), said = String(prompt || '');
    if (sys.length > MAX_SYSTEM || said.length > MAX_PROMPT) return Promise.resolve({ ok: false, status: 'too-large', detail: 'more than y3kode takes in one turn' });
    const keep = Number.isInteger(spare) && spare > 0 ? spare : 0;
    if (outFor(user.id) >= maxJobs - keep) return Promise.resolve({ ok: false, status: 'busy', detail: 'your presence is already thinking as much as y3kode does at once' });
    const size = Buffer.byteLength(sys) + Buffer.byteLength(said) + (Number.isFinite(holds) && holds > 0 ? Math.floor(holds) : 0);
    const src = typeof source === 'string' && source ? source : `account ${user.id}`;
    // Nothing is asked of the machine here: what it holds refuses nobody,
    // whoever else is behind its address (a shared address is many people);
    // at the site's ceiling the accounts past their share give way, the
    // furthest past first, wherever they ask from.
    const room = roomFor(user.id, size);
    if (typeof room === 'string') return Promise.resolve({ ok: false, status: 'full', detail: room });
    if (typeof admit === 'function' && admit() !== true) return Promise.resolve({ ok: false, status: 'not-admitted' });
    // settled first, then the page told, as a turn let go by its asker is
    for (const vid of room) {
      const v = jobs.get(vid);
      if (!v) continue;
      v.finish({ ok: false, status: 'full', detail: LET_GO_FULL });
      send(v.ch, 'cancel', { id: vid });
    }
    const id = randomBytes(16).toString('hex');
    heldBytes += size;
    let at = sources.get(src);
    if (!at) { at = new Map(); sources.set(src, at); }
    let pair = at.get(user.id);
    if (!pair) { pair = { uid: user.id, jobs: new Set(), bytes: 0 }; at.set(user.id, pair); }
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        tally(id, -1);
        jobs.delete(id);
        ch.jobs.delete(id);
        heldBytes -= size;
        resolve(r);
      };
      // settled first, then the page told: a page cut off for not reading
      // while being told fails the rest of what it holds, not this one twice
      const onAbort = () => { finish({ ok: false, status: 'aborted' }); send(ch, 'cancel', { id }); };
      const timer = setTimeout(() => { finish({ ok: false, status: 'timeout' }); send(ch, 'cancel', { id }); }, timeoutMs);
      timer.unref?.();
      signal?.addEventListener?.('abort', onAbort, { once: true });
      jobs.set(id, { id, uid: user.id, ch, src, size, seq: seq++, pair, finish, onPart: typeof onPart === 'function' ? onPart : null });
      tally(id, 1);
      ch.jobs.add(id);
      // the frame rides with the job; a page whose y3kode cannot see swaps the
      // SEEN line for UNSEEN and drops it (src/own-brain.js), so the orb is never
      // told it sees what it was not sent
      const pic = typeof image === 'string' && image.length <= MAX_IMAGE ? image : null;
      if (!send(ch, 'job', { id, provider: ch.provider, system: sys, prompt: said, ...(effort ? { effort } : {}), ...(pic ? { image: pic } : {}) })) finish({ ok: false, status: 'gone' });
    });
  }

  // POST /api/own-brain/<id> — the page's answer. Only the account the job was
  // sent to may answer it. → true if it was waiting
  function answer(user, id, b) {
    const j = jobs.get(String(id));
    if (!j || !WHO(user) || j.uid !== user.id) return false;
    if (!b || typeof b !== 'object') b = {};
    if (b.ok === true && typeof b.text === 'string') {
      const u = b.usage && typeof b.usage === 'object' ? b.usage : {};
      const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      // how fast it wrote, as y3kode timed it beside Claude Code (0.3.3+; speed.mjs)
      const speed = cleanSpeed(b.speed);
      j.finish({ ok: true, text: b.text.slice(0, MAX_TEXT), usage: { in: n(u.in), out: n(u.out), cacheRead: n(u.cacheRead), cacheWrite: n(u.cacheWrite) }, ...(speed ? { speed } : {}) });
    } else {
      j.finish({ ok: false, status: typeof b.code === 'string' && CODE.test(b.code) ? b.code : 'failed', detail: oneLine(b.error, 400) });
    }
    return true;
  }

  // POST /api/own-brain/<id>/part — what the turn has said so far, while it is
  // still going (src/own-brain.js reads it from y3kode's brain.partial), so the
  // orb starts speaking at the first sentence. Only the account the job was sent
  // to may send it; the text is cumulative and capped like an answer.
  // → true if the turn was waiting
  function part(user, id, b) {
    const j = jobs.get(String(id));
    if (!j || !WHO(user) || j.uid !== user.id) return false;
    const t = typeof b?.text === 'string' ? b.text.slice(0, MAX_TEXT) : '';
    if (t && j.onPart) { try { j.onPart(t); } catch { /* the listener never breaks the relay */ } }
    return true;
  }

  // The same shape as a BRAIN_PROVIDERS entry, bound to one person — never
  // registered by name, so no request body can reach it. `systemFor` and
  // `replyFrom` come from server.mjs, where the prompts and the reply parser live.
  function provider(user, { systemFor, replyFrom }) {
    const effortFor = (opts) => (opts?.noThink ? 'low' : 'medium');
    // the route's options carry what only it knows: whose machine asked
    // (source), what it holds while it waits (holds), the translator's spare
    // turn, and its day's count (admit)
    const pic = (image) => (typeof image === 'string' ? image : typeof image?.data === 'string' ? image.data : null);
    const run = (paint, opts, messages, image, signal, onPart) => ask(user, { system: systemFor(paint, opts), prompt: toPrompt(messages, image, MAX_PROMPT, { carried: !!pic(image) }), effort: effortFor(opts), signal,
      spare: opts?.spare, source: opts?.source, holds: opts?.holds, admit: opts?.admit, onPart, image: pic(image) });
    return {
      detect: () => false,
      defaultModel: () => LEDGER_MODEL,
      async chat(_key, _model, messages, image, paint, opts) {
        const r = await run(paint, opts, messages, image, opts?.signal);
        if (!r.ok) return r;
        if (opts?.raw) return { ok: true, usage: r.usage, text: r.text, speed: r.speed };
        return { ok: true, usage: r.usage, speed: r.speed, ...replyFrom(r.text, paint) };
      },
      // streamed when the page can (y3kode 0.3.2+ sends what is written so far,
      // part() above), whole otherwise: only the new tail of each part is passed
      // on, and the answer's remainder at the end, so nothing is said twice
      async chatStream(_key, _model, messages, onDelta, image, paint, signal, opts) {
        let sent = '';
        const onPart = (t) => { if (t.length > sent.length && t.startsWith(sent)) { const add = t.slice(sent.length); sent = t; onDelta?.(add); } };
        const r = await run(paint, opts, messages, image, signal, onPart);
        if (!r.ok) return r;
        if (r.text) {
          if (!sent) onDelta?.(r.text);
          else if (r.text.startsWith(sent) && r.text.length > sent.length) onDelta?.(r.text.slice(sent.length));
        }
        return { ok: true, usage: r.usage, speed: r.speed };
      },
    };
  }

  return { open, connected, forget, ask, answer, part, provider, get pending() { return jobs.size; }, get held() { return heldBytes; } };
}
