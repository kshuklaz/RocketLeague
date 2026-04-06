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
  // Examples (uncomment + add file to sounds/):
  // boost:       "sounds/boost.mp3",
  // hit:         "sounds/hit.mp3",
  // goal_horn:   "sounds/goal_horn.mp3",
  // jump:        "sounds/jump.mp3",
};

// ── Preload ──────────────────────────────────────────────────────────────────
// Create one HTMLAudioElement per sound up-front so the browser can buffer the
// file before it's needed.  We clone it at play time to allow overlapping plays.
const _preloaded = {};
for (const [name, src] of Object.entries(SOUNDS)) {
  const el = new Audio(src);
  el.preload = "auto";
  _preloaded[name] = el;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once on the first user gesture so the browser's autoplay policy is
 * satisfied.  With HTMLAudio this just kicks off a silent resume — the
 * actual sounds are already buffered.
 */
export function initAudio() {
  // Touch every preloaded element so mobile browsers unblock playback
  for (const el of Object.values(_preloaded)) {
    el.load();
  }
}

/**
 * Play a registered sound.
 * @param {string} name    key from the SOUNDS registry
 * @param {object} opts
 *   volume {number}  0–1, default 1
 *   loop   {boolean} loop until stopped, default false
 *   offset {number}  start offset in seconds, default 0
 * @returns HTMLAudioElement handle — pass to stopSound() / fadeOut()
 */
export function playSound(name, { volume = 1.0, loop = false, offset = 0 } = {}) {
  const src = _preloaded[name];
  if (!src) {
    console.warn(`[audio] unknown sound: "${name}"`);
    return null;
  }

  // Clone so multiple simultaneous plays work independently
  const el = src.cloneNode();
  el.volume = Math.max(0, Math.min(1, volume));
  el.loop = loop;
  el.currentTime = offset;
  el.play().catch(() => {
    // Autoplay blocked — usually means initAudio hasn't fired yet
    console.warn(`[audio] playback blocked for "${name}" (no user gesture yet?)`);
  });
  return el;
}

/**
 * Stop a sound immediately.
 * @param {HTMLAudioElement|null} handle — returned by playSound
 */
export function stopSound(handle) {
  if (!handle) return;
  handle.pause();
  handle.currentTime = 0;
}

/**
 * Smoothly fade out then stop a sound.
 * @param {HTMLAudioElement|null} handle
 * @param {number} seconds  fade duration (default 0.5s)
 */
export function fadeOut(handle, seconds = 0.5) {
  if (!handle) return;
  const startVol = handle.volume;
  const steps = Math.max(1, Math.round(seconds * 60));
  let step = 0;
  const id = setInterval(() => {
    step++;
    handle.volume = Math.max(0, startVol * (1 - step / steps));
    if (step >= steps) {
      clearInterval(id);
      stopSound(handle);
    }
  }, 1000 / 60);
}
