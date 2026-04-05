// Lightweight sound manager using the Web Audio API.
// Sounds are decoded once on first load and played by scheduling a buffer
// source node — this avoids the seek-to-start latency of HTMLAudioElement
// and allows overlapping plays without cloning.

let _ctx = null;
const _buffers = {};

function getContext() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browsers require a user gesture before audio plays)
  if (_ctx.state === "suspended") {
    _ctx.resume();
  }
  return _ctx;
}

async function loadBuffer(name, url) {
  try {
    const ctx = getContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    _buffers[name] = audioBuffer;
  } catch {
    // Silently ignore — sound is cosmetic, not critical
  }
}

export function initAudio() {
  loadBuffer("crowd_cheer", "sounds/crowd_cheer.mp3");
}

export function playSound(name, { volume = 1.0, offset = 0 } = {}) {
  const buffer = _buffers[name];
  if (!buffer) return;
  try {
    const ctx = getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0, offset);
  } catch {
    // Silently ignore
  }
}
