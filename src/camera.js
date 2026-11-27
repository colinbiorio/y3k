// Optional camera. Off by default; toggling on requests the webcam and shows a
// small mirrored preview. When on, captureFrame() grabs a downscaled JPEG so the
// brain can actually see — privacy-forward: the user turns the eye on, never the
// reverse, and frames are only captured while it's on.

export function createCamera(videoEl, { onEnded } = {}) {
  let stream = null;
  // IS THE LENS ACTUALLY OPEN (2026-11-27). This was Boolean(stream): true for
  // as long as the object was kept, whatever had happened to the camera behind
  // it. A track the browser or the system ended (the device unplugged, another
  // capture taking it, "stop sharing" pressed in the browser's own bar) left
  // isOn() saying yes for ever: the button lit, the trackers reading a frame
  // that never changed, every message carrying the last still, and no press
  // able to open it again because it was "already on". A camera is on while
  // one of its video tracks is live, and not otherwise.
  const live = () => !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');

  // Current video frame as base64 JPEG (no data: prefix), downscaled for cheap
  // vision tokens + low latency. Null if the camera is off or not ready yet.
  function captureFrame(max = 512) {
    if (!stream) return null;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh || videoEl.readyState < 2) return null;
    const scale = Math.min(1, max / Math.max(vw, vh));
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(videoEl, 0, 0, w, h);
    try { return c.toDataURL('image/jpeg', 0.7).split(',')[1] || null; }
    catch { return null; } // tainted canvas / decode failure
  }

  // WHAT IS ASKED OF THE CAMERA. Thirty frames a second at most, on every
  // tier: the trackers read 15-30 a second, and a webcam left to choose will
  // often deliver 60 at this size — twice the decode and the compositing, for
  // frames nothing reads. The smooth mode asks for 320x240: MediaPipe shrinks
  // every frame to ~192-256px before it looks anyway, so the rest was bytes
  // decoded to be thrown away. (A chat picture from it is smaller too — the
  // trade the smooth mode makes.) Both are asked, not demanded: a camera that
  // cannot honour a max is opened the way it always was.
  function wants() {
    const tier = window.Y3K?.gfx?.profile?.()?.tier || document.documentElement.dataset.gfx || '';
    const smooth = tier === 'smooth';
    return {
      video: {
        facingMode: 'user',
        width: { ideal: smooth ? 320 : 640 }, height: { ideal: smooth ? 240 : 480 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    };
  }

  async function on() {
    if (live()) return true;
    if (stream) off();   // kept, and no longer a camera: let go of it and open another
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia(wants());
      } catch (e) {
        if (e?.name !== 'OverconstrainedError') throw e;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      }
      // THE LENS CAN CLOSE WITHOUT BEING ASKED, and then everything is told:
      // the stream is let go here, and whoever holds the leases hears of it
      // (main.js camEnded), so no button goes on claiming a camera that is
      // not there. Only for the stream that is still the camera: one that was
      // closed on purpose, or replaced, ends too, and that is not news.
      const mine = stream;
      for (const t of mine.getVideoTracks()) {
        t.addEventListener('ended', () => { if (stream !== mine) return; off(); try { onEnded?.(); } catch { /* the room's reaction is its own */ } });
      }
      videoEl.srcObject = stream;
      await videoEl.play();
      videoEl.classList.add('on');
      return true;
    } catch {
      // A STREAM THAT OPENED AND COULD NOT BE SHOWN IS STILL HOLDING THE
      // DEVICE. This used to drop the reference and nothing else: the light
      // stayed on with nothing left that could put it out, the orphan the
      // one-opening rule in main.js exists to prevent.
      try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
      stream = null;
      try { videoEl.srcObject = null; } catch { /* no element, no harm */ }
      return false;
    }
  }

  function off() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    videoEl.srcObject = null;
    videoEl.classList.remove('on');
  }

  return {
    isOn: live,
    captureFrame,
    on,
    off,
    async toggle() { return stream ? (off(), false) : on(); },
  };
}
