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

// ── Synthesized boost sound — endless Shepard-tone jet ───────────────────────
// Two sawtooth oscillators crossfade through an endless rising octave loop:
//
//   osc1  80 Hz → 160 Hz  (fades in at bottom, full at mid, fades out at top)
//   osc2 160 Hz → 320 Hz  (full at bottom, fades out at mid, full again at top)
//
// Because each oscillator is at zero gain when its frequency resets, the jump
// is completely inaudible — the pitch sounds like it rises forever.
// A bandpass noise layer adds the jet-air texture on top.
//
// startBoostSound()  → returns a handle
// stopBoostSound(h)  → fades out and cleans up

const _BOOST_BASE  = 90;   // Hz — base frequency of osc1
const _BOOST_CYCLE = 2.2;  // seconds per octave sweep

function _scheduleBoostCycles(osc1, g1, osc2, g2, from, n) {
  for (let i = 0; i < n; i++) {
    const t   = from + i * _BOOST_CYCLE;
    const mid = t + _BOOST_CYCLE * 0.5;
    const end = t + _BOOST_CYCLE;

    // Frequency sweeps — one octave each, osc2 one octave above osc1
    osc1.frequency.setValueAtTime(_BOOST_BASE,       t);
    osc1.frequency.exponentialRampToValueAtTime(_BOOST_BASE * 2, end);
    osc2.frequency.setValueAtTime(_BOOST_BASE * 2,   t);
    osc2.frequency.exponentialRampToValueAtTime(_BOOST_BASE * 4, end);

    // Crossfade: osc1 bell up then down, osc2 inverted — sum stays constant
    g1.gain.setValueAtTime(0.02, t);
    g1.gain.linearRampToValueAtTime(0.75, mid);
    g1.gain.linearRampToValueAtTime(0.02, end);

    g2.gain.setValueAtTime(0.75, t);
    g2.gain.linearRampToValueAtTime(0.02, mid);
    g2.gain.linearRampToValueAtTime(0.75, end);
  }
}

export function startBoostSound() {
  const ctx = _getCtx();
  if (ctx.state === "suspended") ctx.resume();
  const now = ctx.currentTime;

  // Master gain — quick attack, controlled by stopBoostSound for fade-out
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.25, now + 0.15);
  master.connect(ctx.destination);

  // Mild distortion waveshaper for jet-engine grit
  const dist = ctx.createWaveShaper();
  const dCurve = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    const x = (i / 256) - 1;
    dCurve[i] = (Math.PI + 80) * x / (Math.PI + 80 * Math.abs(x));
  }
  dist.curve = dCurve;
  dist.connect(master);

  // Two sawtooth oscillators + individual gain nodes
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = osc2.type = "sawtooth";
  const g1 = ctx.createGain();
  const g2 = ctx.createGain();
  osc1.connect(g1); g1.connect(dist);
  osc2.connect(g2); g2.connect(dist);

  // ── Whoosh layer: highpass noise that sweeps 400→4000 Hz each cycle ────────
  // Each sweep starts low (dull rush) and climbs to a bright hiss — sounds
  // like air being forced through an accelerating turbine.
  const nLen = ctx.sampleRate * 2;
  const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
  const nd = nBuf.getChannelData(0);
  for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
  const noiseNode = ctx.createBufferSource();
  noiseNode.buffer = nBuf;
  noiseNode.loop = true;

  // Two filters in series: highpass strips low rumble, bandpass shapes the sweep
  const hpFilter = ctx.createBiquadFilter();
  hpFilter.type = "highpass";
  hpFilter.frequency.value = 300;

  const whooshFilter = ctx.createBiquadFilter();
  whooshFilter.type = "bandpass";
  whooshFilter.Q.value = 0.8; // wide band for a natural whoosh

  const whooshGain = ctx.createGain();
  whooshGain.gain.value = 0.35;

  noiseNode.connect(hpFilter);
  hpFilter.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(master);

  // Schedule whoosh frequency sweeps in lock-step with the jet cycles
  function _scheduleWhoosh(from, n) {
    for (let i = 0; i < n; i++) {
      const t   = from + i * _BOOST_CYCLE;
      const end = t + _BOOST_CYCLE;
      whooshFilter.frequency.setValueAtTime(400, t);
      whooshFilter.frequency.exponentialRampToValueAtTime(4000, end);
    }
  }

  osc1.start(now);
  osc2.start(now);
  noiseNode.start(now);

  // Schedule first 5 cycles immediately, then keep topping up every 3 cycles
  _scheduleBoostCycles(osc1, g1, osc2, g2, now, 5);
  _scheduleWhoosh(now, 5);
  let _nextAt = now + _BOOST_CYCLE * 3;
  const intervalId = setInterval(() => {
    _scheduleBoostCycles(osc1, g1, osc2, g2, _nextAt, 4);
    _scheduleWhoosh(_nextAt, 4);
    _nextAt += _BOOST_CYCLE * 4;
  }, _BOOST_CYCLE * 2 * 1000);

  return { osc1, osc2, noiseNode, master, intervalId };
}

export function stopBoostSound(handle) {
  if (!handle) return;
  clearInterval(handle.intervalId);
  const ctx = _getCtx();
  handle.master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  setTimeout(() => {
    try { handle.osc1.stop();     } catch { /* already stopped */ }
    try { handle.osc2.stop();     } catch { /* already stopped */ }
    try { handle.noiseNode.stop();} catch { /* already stopped */ }
  }, 500);
}
