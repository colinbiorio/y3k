// ============================================================================
// The tone, played. What reaches a listener from any number of steady horns at
// one frequency is itself one steady tone at that frequency, with an amplitude
// and a phase; so the whole field is played exactly with two oscillators a
// quarter turn apart (a cosine and a sine, started on the same sample) and
// four gains: [left cos, left sin, right cos, right sin]. The gains come from
// acoustics.mjs (hear, stereo), which is where the physics and the two stated
// conventions live. Browser only.
// ============================================================================
export function createSound() {
  let ctx = null, master = null, gains = [], cosO = null, sinO = null, hz = 0, level = 0.4, open = false, broken = false;

  function start(f) {                                     // call from inside a click: browsers only then let sound begin
    if (ctx && (broken || ctx.state === 'closed')) close();     // the device went away (headphones out): begin again
    broken = false;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      ctx.addEventListener?.('error', () => { broken = true; open = false; });
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      const merger = ctx.createChannelMerger(2); merger.connect(master);
      gains = [0, 0, 1, 1].map((ch) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(merger, 0, ch); return g; });
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!cosO) {
      const t0 = ctx.currentTime + 0.05;
      cosO = ctx.createOscillator(); sinO = ctx.createOscillator();
      cosO.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0])));
      sinO.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1])));
      cosO.frequency.value = sinO.frequency.value = hz = f;
      cosO.connect(gains[0]); sinO.connect(gains[1]); cosO.connect(gains[2]); sinO.connect(gains[3]);
      cosO.start(t0); sinO.start(t0);
    }
    tone(f);
    open = true;
    master.gain.setTargetAtTime(level, ctx.currentTime, 0.12);
    return true;
  }
  function tone(f) {                                      // both at the same instant, so they stay a quarter turn apart
    if (!ctx || !cosO || f === hz) return;
    const t = ctx.currentTime + 0.02;
    cosO.frequency.setValueAtTime(f, t); sinO.frequency.setValueAtTime(f, t);
    hz = f;
  }
  function set(g) {                                       // stereo()'s four gains, eased so a moving ear does not click
    if (!ctx || !open) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) gains[i].gain.setTargetAtTime(Number.isFinite(g[i]) ? g[i] : 0, t, 0.04);
  }
  function volume(v) { level = Math.max(0, Math.min(1, v)); if (ctx && open) master.gain.setTargetAtTime(level, ctx.currentTime, 0.05); }
  function stop() { open = false; if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.06); }
  function close() {
    open = false;
    try { cosO?.stop(); sinO?.stop(); } catch { /* never started */ }
    cosO = sinO = null;
    const c = ctx; ctx = null;
    c?.close?.().catch(() => {});
  }
  const read = () => ({ state: ctx ? ctx.state : 'none', hz, level, open, gains: gains.map((g) => Math.round(g.gain.value * 1e4) / 1e4) });
  return { start, tone, set, volume, stop, close, read, get on() { return open; } };
}
