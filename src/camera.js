// Optional camera. Off by default; toggling on requests the webcam and shows a
// small mirrored preview. When on, captureFrame() grabs a downscaled JPEG so the
// brain can actually see — privacy-forward: the user turns the eye on, never the
// reverse, and frames are only captured while it's on.

export function createCamera(videoEl) {
  let stream = null;

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

  async function on() {
    if (stream) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      videoEl.classList.add('on');
      return true;
    } catch {
      stream = null;
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
    isOn: () => Boolean(stream),
    captureFrame,
    on,
    off,
    async toggle() { return stream ? (off(), false) : on(); },
  };
}
