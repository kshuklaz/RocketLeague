// core field and game constants
export const FIELD = {
  halfWidth: 2180,
  halfDepth: 1480,
  wallHeight: 118,
  goalDepth: 170,
  goalHalfWidth: 220,
  goalHeight: 72,
  rampWidth: 315,
};

export const CAR_RADIUS = 36;
// make the ball larger to give it more presence and make collisions easier
export const BALL_RADIUS = 24;
export const SMALL_PAD_VALUE = 28;
export const BIG_PAD_VALUE = 100;

export const CAMERA_LERP = 0.09;
export const GRAVITY = 900;
export const JUMP_VELOCITY = 360;
export const DOUBLE_JUMP_VELOCITY = 340;
export const MATCH_LENGTH = 300;

export const CAR_PRESETS = {
  octane: {
    label: "Octane",
    bodyLength: 28,
    bodyWidth: 16,
    roofLength: 14,
    roofWidth: 11,
    hoodLength: 33,
    hoodWidth: 10,
    spoiler: true,
    cabinHeight: 19,
  },
  dominus: {
    label: "Dominus",
    bodyLength: 34,
    bodyWidth: 15,
    roofLength: 16,
    roofWidth: 10,
    hoodLength: 36,
    hoodWidth: 9,
    spoiler: false,
    cabinHeight: 15,
  },
  fennec: {
    label: "Fennec",
    bodyLength: 28,
    bodyWidth: 16,
    roofLength: 13,
    roofWidth: 11,
    hoodLength: 32,
    hoodWidth: 10,
    spoiler: true,
    cabinHeight: 19,
  },
};

export const MODES = {
  freeplay: { label: "Free Play", blue: 1, orange: 0, blueLabel: "You", orangeLabel: "Free" },
  duel: { label: "1v1", blue: 1, orange: 1, blueLabel: "You", orangeLabel: "Bot" },
  doubles: { label: "2v2", blue: 2, orange: 2, blueLabel: "Blue", orangeLabel: "Orange" },
};

export const TIME_OF_DAY = {
  dawn: {
    skyTop: "#f59e0b",
    skyMid: "#fb7185",
    skyBottom: "#1e3a8a",
    glow: "rgba(255,236,179,0.48)",
    fieldTint: "rgba(255,191,94,0.05)",
  },
  day: {
    skyTop: "#67e8f9",
    skyMid: "#1d4ed8",
    skyBottom: "#0a1628",
    glow: "rgba(255,255,255,0.42)",
    fieldTint: "rgba(56,189,248,0.03)",
  },
  dusk: {
    skyTop: "#fb7185",
    skyMid: "#7c3aed",
    skyBottom: "#111827",
    glow: "rgba(255,205,178,0.38)",
    fieldTint: "rgba(251,113,133,0.05)",
  },
  night: {
    skyTop: "#0f172a",
    skyMid: "#172554",
    skyBottom: "#020617",
    glow: "rgba(125,211,252,0.18)",
    fieldTint: "rgba(96,165,250,0.05)",
  },
};
