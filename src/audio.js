// ── Audio manager ────────────────────────────────────────────────────────────
// Uses HTMLAudioElement — reliable across all browsers, no AudioContext
// suspended-state issues.  Adding a new sound = one line in SOUNDS.
//
// Usage:
//   playSound("crowd_cheer")
//   const h = playSound("crowd_cheer", { loop: true, volume: 0.7 })
//   stopSound(h)
//   fadeOut(h, 0.5)

// ── Sound registry ───────────────────────────────────────────────────────────
// Add every game sound here.  Key = name used in playSound().
export const SOUNDS = {
  crowd_cheer:       "sounds/crowd_cheer.mp3",
  kickoff_countdown: "sounds/kickoff_countdown.mp3",
  match_countdown:   "sounds/match_countdown.mp3",
  goal_explosion:    "sounds/goal_explosion.mp3",
  // Examples (uncomment + add file to sounds/):
  // boost:       "sounds/boost.mp3",
  // hit:         "sounds/hit.mp3",
  // goal_horn:   "sounds/goal_horn.mp3",
  // jump:        "sounds/jump.mp3",
};

// ── Preload ──────────────────────────────────────────────────────────────────
// Decode every sound into an AudioBuffer up-front using Web Audio API.
// This allows gain values above 1.0 (louder than the original file).
let _actx = null;
const _buffers = {};

function _getCtx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}

async function _loadBuffer(name, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.arrayBuffer();
    _buffers[name] = await _getCtx().decodeAudioData(raw);
  } catch (e) {
    console.warn(`[audio] could not load "${name}":`, e.message);
  }
}

for (const [name, url] of Object.entries(SOUNDS)) {
  _loadBuffer(name, url);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once on the first user gesture — resumes the AudioContext if the
 * browser suspended it before interaction.
 */
export function initAudio() {
  const ctx = _getCtx();
  if (ctx.state === "suspended") ctx.resume();
}

/**
 * Play a registered sound.
 * @param {string} name    key from the SOUNDS registry
 * @param {object} opts
 *   volume {number}  gain multiplier — values >1 amplify beyond original, default 1
 *   loop   {boolean} loop until stopped, default false
 *   offset {number}  start offset in seconds, default 0
 * @returns handle { source, gain } — pass to stopSound() / fadeOut()
 */
export function playSound(name, { volume = 1.0, loop = false, offset = 0 } = {}) {
  const ctx = _getCtx();
  if (ctx.state === "suspended") ctx.resume();

  const buffer = _buffers[name];
  if (!buffer) {
    console.warn(`[audio] "${name}" not ready yet`);
    return null;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, volume); // no upper cap — allows >1 amplification
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0, offset);

  // Expose .volume setter so callers can adjust on the fly (e.g. crowd loop)
  const handle = { source, gain };
  Object.defineProperty(handle, "volume", {
    get: () => gain.gain.value,
    set: (v) => { gain.gain.value = Math.max(0, v); },
  });
  return handle;
}

/**
 * Stop a looping sound immediately.
 * @param {{ source, gain }|null} handle — returned by playSound
 */
export function stopSound(handle) {
  if (!handle) return;
  try { handle.source.stop(); } catch { /* already stopped */ }
}

/**
 * Smoothly fade out then stop a sound.
 * @param {{ source, gain }|null} handle
 * @param {number} seconds  fade duration (default 0.5s)
 */
export function fadeOut(handle, seconds = 0.5) {
  if (!handle) return;
  const ctx = _getCtx();
  handle.gain.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
  setTimeout(() => stopSound(handle), (seconds + 0.2) * 1000);
}

// ── Synthesized boost sound ──────────────────────────────────────────────────
// Built entirely from Web Audio primitives — no audio file needed.
// Two layers:
//   1. Jet startup: oscillator that sweeps from 80 Hz → 320 Hz over 0.35s
//      then holds as a low rumble, shaped by a distortion waveshaper for grit
//   2. Whoosh: bandpass-filtered white noise that swells in and sustains,
//      giving the high-frequency "rush of air" feel
//
// startBoostSound() → returns a handle with a .stop() method
// stopBoostSound(handle) → fades both layers out cleanly

export function startBoostSound() {
  const ctx = _getCtx();
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime;

  // ── Master output gain (for fade-out on stop) ────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, t);
  masterGain.gain.linearRampToValueAtTime(0.55, t + 0.18); // quick attack
  masterGain.connect(ctx.destination);

  // ── Layer 1: jet rumble oscillator ───────────────────────────────────────
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(320, t + 0.35); // startup sweep
  osc.frequency.setTargetAtTime(210, t + 0.35, 0.4);         // settle to rumble

  // Waveshaper adds overtones/crunch so it sounds like a jet rather than a tone
  const waveShaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = (Math.PI + 340) * x / (Math.PI + 340 * Math.abs(x));
  }
  waveShaper.curve = curve;

  const oscGain = ctx.createGain();
  oscGain.gain.value = 0.6;

  osc.connect(waveShaper);
  waveShaper.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(t);

  // ── Layer 2: whoosh (bandpass noise) ─────────────────────────────────────
  // Create a white-noise buffer (1 second, looped)
  const bufLen = ctx.sampleRate;
  const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;

  // Bandpass centred on ~1 800 Hz — the "air rush" frequency band
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + 0.3); // sweeps up on startup
  bp.frequency.setTargetAtTime(1400, t + 0.3, 0.5);
  bp.Q.value = 1.2;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, t);
  noiseGain.gain.linearRampToValueAtTime(0.45, t + 0.25); // whoosh swells in

  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(t);

  return { osc, noise, masterGain };
}

export function stopBoostSound(handle) {
  if (!handle) return;
  const ctx = _getCtx();
  const t = ctx.currentTime;
  // Fade master gain out over 0.3s, then stop sources
  handle.masterGain.gain.setTargetAtTime(0, t, 0.1);
  setTimeout(() => {
    try { handle.osc.stop(); }   catch { /* already stopped */ }
    try { handle.noise.stop(); } catch { /* already stopped */ }
  }, 400);
}
