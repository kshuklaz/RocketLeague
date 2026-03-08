import { FIELD, BIG_PAD_VALUE, SMALL_PAD_VALUE, CAR_RADIUS, MODES } from "./constants.js";
import { state } from "./state.js";
import { clamp } from "./utils.js";

export function makeBoostPad(x, z, value, respawnSeconds) {
  return {
    x,
    z,
    value,
    radius: value === BIG_PAD_VALUE ? 18 : 12,
    respawnSeconds,
    active: true,
    timer: 0,
  };
}

export function createBoostPads() {
  return [
    makeBoostPad(-1720, -980, SMALL_PAD_VALUE, 4),
    makeBoostPad(-620, -1050, SMALL_PAD_VALUE, 4),
    makeBoostPad(620, -1050, SMALL_PAD_VALUE, 4),
    makeBoostPad(1720, -980, SMALL_PAD_VALUE, 4),
    makeBoostPad(-1720, 980, SMALL_PAD_VALUE, 4),
    makeBoostPad(-620, 1050, SMALL_PAD_VALUE, 4),
    makeBoostPad(620, 1050, SMALL_PAD_VALUE, 4),
    makeBoostPad(1720, 980, SMALL_PAD_VALUE, 4),
    makeBoostPad(0, -640, SMALL_PAD_VALUE, 4),
    makeBoostPad(0, 640, SMALL_PAD_VALUE, 4),
    makeBoostPad(-1940, 0, BIG_PAD_VALUE, 8),
    makeBoostPad(1940, 0, BIG_PAD_VALUE, 8),
  ];
}

export function makeCar(options) {
  return {
    id: options.id,
    name: options.name,
    team: options.team,
    controlled: Boolean(options.controlled),
    x: options.x,
    y: 0,
    z: options.z,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: options.angle,
    color: options.color,
    boostColor: options.boostColor,
    wheelColor: options.wheelColor,
    bodyStyle: options.bodyStyle,
    boost: options.boost ?? 40,
    isBoosting: false,
    pitch: 0,
    jumpsUsed: 0,
    jumpHeld: false,
    spawnX: options.x,
    spawnZ: options.z,
  };
}

export function makeDefaultCustom() {
  return {
    bodyStyle: "octane",
    color: "#38bdf8",
    boostColor: "#f59e0b",
    wheelColor: "#94a3b8",
  };
}

export function getRampHeightAt(x, z, allowGoalGap = false) {
  const sideDistance = FIELD.halfDepth - Math.abs(z);
  const sideRatio = clamp((FIELD.rampWidth - sideDistance) / FIELD.rampWidth, 0, 1);
  const sideHeight = sideRatio * sideRatio * FIELD.wallHeight;

  const inGoalLane = Math.abs(z) < FIELD.goalHalfWidth + 34;
  let endHeight = 0;
  if (!(allowGoalGap && inGoalLane)) {
    const endDistance = FIELD.halfWidth - Math.abs(x);
    const endRatio = clamp((FIELD.rampWidth - endDistance) / FIELD.rampWidth, 0, 1);
    endHeight = endRatio * endRatio * FIELD.wallHeight;
  }

  return Math.max(sideHeight, endHeight);
}

export function kickoffSlots(team, count) {
  const sign = team === "blue" ? -1 : 1;
  if (count === 1) {
    return [{ x: sign * 1320, z: 0, angle: team === "blue" ? 0 : Math.PI }];
  }
  return [
    { x: sign * 1260, z: -220, angle: team === "blue" ? 0 : Math.PI },
    { x: sign * 1480, z: 260, angle: team === "blue" ? 0 : Math.PI },
  ].slice(0, count);
}

export function createTeamCar(team, index, controlled = false) {
  const modeConfig = MODES[state.mode];
  const slot = kickoffSlots(team, team === "blue" ? modeConfig.blue : modeConfig.orange)[index];
  const isPlayerTeam = team === "blue";
  const custom = state.custom;
  const botColors = team === "blue"
    ? [
        { color: custom.color, boostColor: custom.boostColor, wheelColor: custom.wheelColor, bodyStyle: custom.bodyStyle },
        { color: "#0ea5e9", boostColor: "#22d3ee", wheelColor: "#cbd5e1", bodyStyle: "dominus" },
      ]
    : [
        { color: "#f97316", boostColor: "#f59e0b", wheelColor: "#e2e8f0", bodyStyle: "breakout" },
        { color: "#fb7185", boostColor: "#fb7185", wheelColor: "#f8fafc", bodyStyle: "octane" },
      ];
  const palette = botColors[Math.min(index, botColors.length - 1)];

  return makeCar({
    id: `${team}-${index}`,
    name: controlled ? "You" : isPlayerTeam ? `Mate ${index}` : `Bot ${index + 1}`,
    team,
    controlled,
    x: slot.x,
    z: slot.z,
    angle: slot.angle,
    color: controlled ? custom.color : palette.color,
    boostColor: controlled ? custom.boostColor : palette.boostColor,
    wheelColor: controlled ? custom.wheelColor : palette.wheelColor,
    bodyStyle: controlled ? custom.bodyStyle : palette.bodyStyle,
    boost: 60,
  });
}
