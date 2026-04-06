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
