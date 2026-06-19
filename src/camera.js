// Optional camera. Off by default; toggling on requests the webcam and shows a
// small mirrored preview. Y3K doesn't "see" anything yet — this is the plumbing
// and the privacy-forward default (the user turns the eye on, never the reverse).

export function createCamera(videoEl) {
  let stream = null;

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
    on,
    off,
    async toggle() { return stream ? (off(), false) : on(); },
  };
}
