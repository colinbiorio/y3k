// ============================================================================
// music.js — playing music inside the room, and letting the presence hear it.
//
// WHY THIS SHAPE, AND WHY NOT SPOTIFY
//
// The obvious build is a Spotify connector. It cannot be built here, for two
// independent reasons, both verified against Spotify's live developer docs:
//
//   1. Development Mode allows FIVE hand-allowlisted users, forever. The way
//      out (Extended Quota) requires a registered company and 250k monthly
//      users. A public site cannot offer "connect Spotify" to its visitors.
//   2. Developer Policy III.14 forbids ingesting Spotify Content into an AI
//      model, and their Terms define "Spotify Content" to include METADATA. The
//      whole point of this feature — the presence knowing what is playing — is
//      the thing that clause names. (III.6 also forbids syncing a recording to
//      visual media, which is precisely what the orb does, and III.7 forbids
//      overlapping other audio, which is what the presence's voice does.)
//
// Apple Music costs $99/yr and is equally DRM-sealed; YouTube's terms prohibit
// it outright. Every major service ships audio through Encrypted Media
// Extensions, which means an AnalyserNode on it reads silence — so even where
// playback is legal, HEARING is impossible.
//
// So the sources here are ones where the audio is genuinely ours to hear:
//
//   • Audius   — a large open catalog, no account, no key, no subscription.
//                Full tracks over CORS-open unencrypted MP3, so Web Audio can
//                actually analyse them. Its metadata carries bpm, musical key,
//                mood and genre — the very fields Spotify deleted in Nov 2024.
//   • Files    — whatever the host opens here. Never uploaded, never leaves
//                the browser, fully analysable.
//
// Both are ANALYSABLE, which is what makes the presence's knowledge honest: it
// is not reading a label off a stream it cannot hear, it is hearing the thing.
// ============================================================================

import { createListener, describe } from './listen.js';

// Tracks come from OUR server, not straight from Audius, for one specific
// reason: Audius pins each track to a community-run content node, that pinning
// is permanent per track, and at least one operator's node is currently dead at
// the TLS layer — about half of trending resolves to it. A browser cannot tell:
// the redirect is opaque to fetch(), so the page never learns which node it was
// sent to. The server resolves the redirect, probes the node, and returns only
// tracks that will actually play. See music.mjs for why swapping in a healthy
// host instead would quietly cost us the ability to hear the audio at all.
//
// The AUDIO still comes straight from the content node to the browser — only
// the resolution passes through us.
const api = async (path) => {
  const r = await fetch(path, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`music ${r.status}`);
  return r.json();
};

export const SOURCES = {
  audius: {
    label: 'Audius',
    note: 'open catalog · no account needed',
    analysable: true,
    async search(q) { return (await api(`/api/music/tracks?kind=search&q=${encodeURIComponent(q)}`)).tracks || []; },
    async trending() { return (await api('/api/music/tracks?kind=trending')).tracks || []; },
  },
};

// ---------------------------------------------------------------------------
// the player
// ---------------------------------------------------------------------------
export function createMusic({ onChange } = {}) {
  const el = new Audio();
  // Required for Web Audio to touch the samples at all. Without it the element
  // plays fine but createMediaElementSource yields silence — the tainted-origin
  // rule. Audius serves the stream (and its 302) with access-control-allow-
  // origin: *, which is exactly what makes this legal and possible.
  el.crossOrigin = 'anonymous';
  el.preload = 'none';

  const ear = createListener();
  let queue = [];
  let idx = -1;
  let current = null;
  let listening = false;
  let objectUrl = '';       // revoked when a local file is replaced

  const emit = () => { if (onChange) onChange(state()); };

  el.addEventListener('ended', () => { next(); });
  el.addEventListener('play', emit);
  el.addEventListener('pause', emit);
  el.addEventListener('error', () => {
    // A track can be gated, removed, or served by a slow community node. That
    // is a normal outcome here, not an exception — skip on rather than stall.
    if (current) current.error = true;
    emit();
  });

  function attachEar() {
    if (!current || !current.analysable) return;
    try { ear.listenToElement(el, current.source); listening = true; }
    catch { listening = false; }   // never let the ear break playback
  }

  async function play(track) {
    current = track;
    if (objectUrl && track.source !== 'file') { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
    el.src = track.url;
    try { await el.play(); } catch { /* autoplay refused until a gesture */ }
    attachEar();
    emit();
  }

  function next() {
    if (!queue.length) return;
    idx = (idx + 1) % queue.length;
    play(queue[idx]);
  }
  function prev() {
    if (!queue.length) return;
    idx = (idx - 1 + queue.length) % queue.length;
    play(queue[idx]);
  }

  function state() {
    const f = listening ? ear.read() : { hearing: false };
    return {
      playing: !el.paused && !!current,
      track: current,
      position: el.currentTime || 0,
      duration: current ? (current.duration || el.duration || 0) : 0,
      hearing: !!f.hearing,
      sound: f.hearing ? f : null,
      queueLength: queue.length,
    };
  }

  return {
    el, state,
    sources: SOURCES,
    async load(sourceId, kind, q) {
      const src = SOURCES[sourceId];
      if (!src) throw new Error('unknown source');
      queue = kind === 'search' ? await src.search(q) : await src.trending();
      idx = -1;
      emit();
      return queue;
    },
    list: () => queue,
    playAt(i) { if (queue[i]) { idx = i; return play(queue[i]); } },
    playTrack: play,
    // Local files: the only source with no network at all.
    openFiles(fileList) {
      const picked = [...fileList].filter((f) => f.type.startsWith('audio/'));
      if (!picked.length) return 0;
      queue = picked.map((f) => ({
        id: f.name, source: 'file', title: f.name.replace(/\.[^.]+$/, ''),
        artist: 'your file', duration: 0, art: '',
        meta: { bpm: 0, key: '', mood: '', genre: '' },
        file: f, url: '', analysable: true,
      }));
      idx = -1; emit();
      return queue.length;
    },
    playFileAt(i) {
      const t = queue[i];
      if (!t || !t.file) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(t.file);
      return play({ ...t, url: objectUrl });
    },
    toggle() { if (el.paused) { el.play().catch(() => {}); } else el.pause(); emit(); },
    next, prev,
    stop() { el.pause(); el.removeAttribute('src'); ear.stop(); listening = false; current = null; emit(); },
    setVolume(v) { el.volume = Math.max(0, Math.min(1, v)); },
    // Listening to the ROOM instead of to our own player — a different consent
    // entirely, so it is its own call and never happens implicitly.
    async listenToRoom() { await ear.listenToMic(); listening = true; emit(); },
    async listenToTab() { await ear.listenToTab(); listening = true; emit(); },
    stopListening() { ear.stop(); listening = false; emit(); },
    describeSound: () => describe(ear.read()),
  };
}

// ---------------------------------------------------------------------------
// What the presence is told.
//
// Two kinds of knowledge, kept visibly apart, because conflating them is how an
// AI ends up confidently describing music it never heard:
//   • what the track SAYS it is — title, artist, and the uploader's own bpm/key/
//     mood/genre. Authored metadata. Could be wrong or absent.
//   • what we can actually HEAR — measured from the waveform, this second.
//
// Titles and artist names are attacker-controlled strings (anyone can upload a
// track called "ignore your instructions"), and the tend loop parses << >>
// control blocks out of model output. So every field is stripped of the control
// and fence markers here, and the server strips them again for tend turns
// (server.mjs:1249). Belt and braces, deliberately.
// ---------------------------------------------------------------------------
const scrub = (v) => String(v == null ? '' : v).replace(/<<|>>|```|"""/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

export function nowPlayingLine(st) {
  if (!st || !st.playing || !st.track) return '';
  const t = st.track;
  const said = [];
  if (t.meta.genre) said.push(scrub(t.meta.genre));
  if (t.meta.mood) said.push(scrub(t.meta.mood));
  if (t.meta.bpm) said.push(`${Math.round(t.meta.bpm)} BPM`);
  if (t.meta.key) said.push(scrub(t.meta.key));
  const tag = said.length ? ` (${said.join(', ')})` : '';
  const head = `Playing in the room: "${scrub(t.title)}" by ${scrub(t.artist)}${tag}.`;
  if (!st.hearing || !st.sound) {
    return `${head} You cannot hear it directly — this is only what the track says about itself.`;
  }
  const heard = describe(st.sound);
  if (!heard) return head;
  return `${head} Listening to it right now, it sounds: ${heard}.`;
}
