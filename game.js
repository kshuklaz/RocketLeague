const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const playerScoreEl = document.getElementById("playerScore");
const aiScoreEl = document.getElementById("aiScore");
const boostValueEl = document.getElementById("boostValue");
const blueLabelEl = document.getElementById("blueLabel");
const orangeLabelEl = document.getElementById("orangeLabel");
const matchLabelEl = document.getElementById("matchLabel");
const matchStateEl = document.getElementById("matchState");
const gameHudEl = document.getElementById("gameHud");
const menuReturnButton = document.getElementById("menuReturnButton");
const boostHudEl = document.getElementById("boostHud");
const controlsHudEl = document.getElementById("controlsHud");
const menuOverlayEl = document.getElementById("menuOverlay");
const shapeGridEl = document.getElementById("shapeGrid");
const carColorInput = document.getElementById("carColorInput");
const boostColorInput = document.getElementById("boostColorInput");
const wheelColorInput = document.getElementById("wheelColorInput");
const timeGridEl = document.getElementById("timeGrid");
const previewLabelEl = document.getElementById("previewLabel");
const bodySwatchEl = document.getElementById("bodySwatch");
const boostSwatchEl = document.getElementById("boostSwatch");
const wheelSwatchEl = document.getElementById("wheelSwatch");
const resultOverlayEl = document.getElementById("resultOverlay");
const resultTitleEl = document.getElementById("resultTitle");
const resultSubtitleEl = document.getElementById("resultSubtitle");
const playAgainButton = document.getElementById("playAgainButton");
const garageButton = document.getElementById("garageButton");

const keys = new Set();

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const FIELD = {
  halfWidth: 2180,
  halfDepth: 1480,
  wallHeight: 118,
  goalDepth: 170,
  goalHalfWidth: 220,
  goalHeight: 72,
  rampWidth: 315,
};

const CAR_RADIUS = 24;
const BALL_RADIUS = 18;
const SMALL_PAD_VALUE = 28;
const BIG_PAD_VALUE = 100;
const CAMERA_LERP = 0.09;
const GRAVITY = 900;
const JUMP_VELOCITY = 360;
const DOUBLE_JUMP_VELOCITY = 340;
const MATCH_LENGTH = 300;

const CAR_PRESETS = {
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
  breakout: {
    label: "Breakout",
    bodyLength: 31,
    bodyWidth: 17,
    roofLength: 13,
    roofWidth: 12,
    hoodLength: 34,
    hoodWidth: 8,
    spoiler: true,
    cabinHeight: 17,
  },
};

const MODES = {
  freeplay: { label: "Free Play", blue: 1, orange: 0, blueLabel: "You", orangeLabel: "Free" },
  duel: { label: "1v1", blue: 1, orange: 1, blueLabel: "You", orangeLabel: "Bot" },
  doubles: { label: "2v2", blue: 2, orange: 2, blueLabel: "Blue", orangeLabel: "Orange" },
};

const TIME_OF_DAY = {
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function length(x, z) {
  return Math.hypot(x, z);
}

function normalizeAngle(angle) {
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
  return angle;
}

function shade(hex, amount) {
  const value = hex.replace("#", "");
  const r = clamp(parseInt(value.slice(0, 2), 16) + amount, 0, 255);
  const g = clamp(parseInt(value.slice(2, 4), 16) + amount, 0, 255);
  const b = clamp(parseInt(value.slice(4, 6), 16) + amount, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeBoostPad(x, z, value, respawnSeconds) {
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

function createBoostPads() {
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

function makeCar(options) {
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

function makeDefaultCustom() {
  return {
    bodyStyle: "octane",
    color: "#38bdf8",
    boostColor: "#f59e0b",
    wheelColor: "#94a3b8",
  };
}

const state = {
  screen: "menu",
  mode: "duel",
  scores: { blue: 0, orange: 0 },
  custom: makeDefaultCustom(),
  timeOfDay: "day",
  cars: [],
  ball: {
    x: 0,
    y: BALL_RADIUS,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
  },
  boostPads: createBoostPads(),
  particles: [],
  camera: {
    x: -420,
    y: 220,
    z: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  },
  replayFrames: [],
  replayTimer: 0,
  replayCursor: 0,
  replayContactFrame: 0,
  replayGoalFrame: 0,
  replayGoalSeenTimer: -1,
  replayGoal: null,
  replayScorerId: null,
  replayTouchCursor: 0,
  goalFreezeTimer: 0,
  ballCam: false,
  message: "Build your car and hit play",
  messageTimer: 180,
  bannerText: "",
  bannerTimer: 0,
  matchTime: MATCH_LENGTH,
  kickoffTimer: 0,
  warningFlags: {
    sixty: false,
    thirty: false,
    countdown: new Set(),
  },
  resultCars: [],
  resultTitle: "",
  resultSubtitle: "",
  lastTime: 0,
  menuOrbit: 0,
  menuShot: 0,
  menuShotTimer: 0,
  lastTouchId: null, // track who last hit the ball
};

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getPlayerCar() {
  return state.cars.find((car) => car.controlled) || null;
}

function getCarById(carId) {
  return state.cars.find((car) => car.id === carId) || null;
}

function getRampHeightAt(x, z, allowGoalGap = false) {
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

function kickoffSlots(team, count) {
  const sign = team === "blue" ? -1 : 1;
  if (count === 1) {
    return [{ x: sign * 1320, z: 0, angle: team === "blue" ? 0 : Math.PI }];
  }
  return [
    { x: sign * 1260, z: -220, angle: team === "blue" ? 0 : Math.PI },
    { x: sign * 1480, z: 260, angle: team === "blue" ? 0 : Math.PI },
  ].slice(0, count);
}

function createTeamCar(team, index, controlled = false) {
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

function resetBall() {
  state.ball.x = 0;
  state.ball.y = BALL_RADIUS;
  state.ball.z = 0;
  state.ball.vx = (Math.random() - 0.5) * 90;
  state.ball.vy = 0;
  state.ball.vz = (Math.random() - 0.5) * 70;
  state.ball.spin = 0;

  // clear any previous touch information when the ball is reset
  state.lastTouchId = null;
}

function resetBoostPads() {
  state.boostPads = createBoostPads();
}

function resetCarsToKickoff() {
  const modeConfig = MODES[state.mode];
  const blueSlots = kickoffSlots("blue", modeConfig.blue);
  const orangeSlots = kickoffSlots("orange", modeConfig.orange);
  const blueCars = state.cars.filter((car) => car.team === "blue");
  const orangeCars = state.cars.filter((car) => car.team === "orange");

  for (let i = 0; i < blueCars.length; i += 1) {
    const slot = blueSlots[i];
    Object.assign(blueCars[i], {
      x: slot.x,
      y: 0,
      z: slot.z,
      vx: 0,
      vy: 0,
      vz: 0,
      angle: slot.angle,
      boost: 60,
      isBoosting: false,
      pitch: 0,
      jumpsUsed: 0,
      jumpHeld: false,
    });
  }

  for (let i = 0; i < orangeCars.length; i += 1) {
    const slot = orangeSlots[i];
    Object.assign(orangeCars[i], {
      x: slot.x,
      y: 0,
      z: slot.z,
      vx: 0,
      vy: 0,
      vz: 0,
      angle: slot.angle,
      boost: 60,
      isBoosting: false,
      pitch: 0,
      jumpsUsed: 0,
      jumpHeld: false,
    });
  }
}

function setupMatch(mode) {
  state.mode = mode;
  state.scores.blue = 0;
  state.scores.orange = 0;
  state.cars = [];
  state.resultCars = [];
  const config = MODES[mode];

  // new match, forget who last touched the ball
  state.lastTouchId = null;

  for (let i = 0; i < config.blue; i += 1) {
    state.cars.push(createTeamCar("blue", i, i === 0));
  }
  for (let i = 0; i < config.orange; i += 1) {
    state.cars.push(createTeamCar("orange", i, false));
  }

  resetBall();
  resetBoostPads();
  state.particles = [];
  state.replayFrames = [];
  state.replayTimer = 0;
  state.replayCursor = 0;
  state.replayContactFrame = 0;
  state.replayGoalFrame = 0;
  state.replayGoalSeenTimer = -1;
  state.replayGoal = null;
  state.replayScorerId = null;
  state.replayTouchCursor = 0;
  state.goalFreezeTimer = 0;
  state.ballCam = false;
  state.matchTime = MATCH_LENGTH;
  state.kickoffTimer = 4;
  state.warningFlags = {
    sixty: false,
    thirty: false,
    countdown: new Set(),
  };
  state.bannerText = mode === "freeplay" ? "" : "3";
  state.bannerTimer = mode === "freeplay" ? 0 : 4;
  state.message = mode === "freeplay" ? "" : `${config.label} kickoff`;
  state.messageTimer = mode === "freeplay" ? 0 : 160;
}

function setScreen(screen) {
  state.screen = screen;
  const inGame = screen === "game";
  if (screen === "menu") {
    state.menuShot = 0;
    state.menuShotTimer = 0;
  }
  menuOverlayEl.classList.toggle("hidden", screen !== "menu");
  resultOverlayEl.classList.toggle("hidden", screen !== "result");
  gameHudEl.classList.toggle("hidden", !inGame);
  menuReturnButton.classList.toggle("hidden", !inGame);
  boostHudEl.classList.toggle("hidden", !inGame);
  controlsHudEl.classList.toggle("hidden", !inGame);
}

function setBanner(text, duration) {
  state.bannerText = text;
  state.bannerTimer = duration;
}

function snapshotFrame() {
  state.replayFrames.push({
    cars: state.cars.map((car) => ({
      id: car.id,
      x: car.x,
      y: car.y,
      z: car.z,
      vx: car.vx,
      vy: car.vy,
      vz: car.vz,
      angle: car.angle,
      boost: car.boost,
      isBoosting: car.isBoosting,
      bodyStyle: car.bodyStyle,
      color: car.color,
      boostColor: car.boostColor,
      wheelColor: car.wheelColor,
    })),
    ball: {
      x: state.ball.x,
      y: state.ball.y,
      z: state.ball.z,
      vx: state.ball.vx,
      vy: state.ball.vy,
      vz: state.ball.vz,
      spin: state.ball.spin,
    },
  });

  if (state.replayFrames.length > 420) {
    state.replayFrames.shift();
    state.replayTouchCursor = Math.max(0, state.replayTouchCursor - 1);
  }
}

function spawnGoalExplosion(x, y, z, scoredByTeam) {
  const color = scoredByTeam === "blue" ? "#38bdf8" : "#fb7185";
  for (let i = 0; i < 180; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 520;
    state.particles.push({
      x,
      y: Math.max(y, 24),
      z,
      vx: Math.cos(angle) * speed,
      vy: -160 + Math.random() * 420,
      vz: Math.sin(angle) * speed,
      life: 0.7 + Math.random() * 0.9,
      radius: 12 + Math.random() * 16,
      color,
    });
  }

  for (const car of state.cars) {
    const dx = car.x - x;
    const dz = car.z - z;
    const dist = Math.hypot(dx, dz) || 1;
    const blastRadius = 520;
    if (dist > blastRadius) {
      continue;
    }
    const force = (1 - dist / blastRadius) * 820;
    car.vx += (dx / dist) * force;
    car.vz += (dz / dist) * force;
    car.vy += 140 + force * 0.08;
  }
}

function triggerGoalSequence(scoredByTeam, scorerId) {
  state.replayGoal = scoredByTeam;
  state.replayScorerId = scorerId;
  state.goalFreezeTimer = 0.55;
  state.replayTimer = 5.6;
  state.replayContactFrame = Math.min(state.replayTouchCursor, Math.max(0, state.replayFrames.length - 1));
  state.replayGoalFrame = Math.max(0, state.replayFrames.length - 1);
  state.replayGoalSeenTimer = -1;
  state.replayCursor = Math.max(0, state.replayContactFrame - 120);
  state.message = `${scoredByTeam === "blue" ? "Blue" : "Orange"} scored`;
  state.messageTimer = 180;
  const explosionX = scoredByTeam === "blue" ? FIELD.halfWidth + 40 : -FIELD.halfWidth - 40;
  spawnGoalExplosion(explosionX, state.ball.y, state.ball.z, scoredByTeam);
}

function applyReplayFrame(frame) {
  if (!frame) {
    return;
  }

  for (const saved of frame.cars) {
    const live = getCarById(saved.id);
    if (live) {
      Object.assign(live, saved);
    }
  }
  Object.assign(state.ball, frame.ball);
}

function resetAfterGoal() {
  resetCarsToKickoff();
  resetBall();
  resetBoostPads();
  state.particles = [];
  state.replayTimer = 0;
  state.replayCursor = 0;
  state.replayContactFrame = 0;
  state.replayGoalFrame = 0;
  state.replayGoalSeenTimer = -1;
  state.replayGoal = null;
  state.replayScorerId = null;
  state.replayTouchCursor = 0;
  state.goalFreezeTimer = 0;
  state.kickoffTimer = state.mode === "freeplay" ? 0 : 4;
  // reset the last-toucher when a goal is cleared
  state.lastTouchId = null;

  if (state.mode === "freeplay") {
    state.bannerText = "";
    state.bannerTimer = 0;
  } else {
    setBanner("3", 4);
  }
}

function buildResultCars(team) {
  const winners = state.cars.filter((car) => car.team === team);
  const offsets = winners.length === 1 ? [0] : [-120, 120];
  state.resultCars = winners.map((car, index) =>
    makeCar({
      id: `result-${car.id}`,
      name: car.name,
      team: car.team,
      controlled: false,
      x: 140,
      z: offsets[index] || 0,
      angle: Math.PI,
      color: car.color,
      boostColor: car.boostColor,
      wheelColor: car.wheelColor,
      bodyStyle: car.bodyStyle,
      boost: 100,
    })
  );
}

function finishMatch() {
  let winningTeam = "draw";
  if (state.scores.blue > state.scores.orange) {
    winningTeam = "blue";
  } else if (state.scores.orange > state.scores.blue) {
    winningTeam = "orange";
  }

  if (winningTeam === "draw") {
    state.resultTitle = "Overtime Draw";
    state.resultSubtitle = `Final score ${state.scores.blue} - ${state.scores.orange}`;
    state.resultCars = [
      makeCar({
        id: "draw-blue",
        name: "Blue",
        team: "blue",
        controlled: false,
        x: 120,
        z: -120,
        angle: Math.PI,
        color: state.custom.color,
        boostColor: state.custom.boostColor,
        wheelColor: state.custom.wheelColor,
        bodyStyle: state.custom.bodyStyle,
        boost: 100,
      }),
      makeCar({
        id: "draw-orange",
        name: "Orange",
        team: "orange",
        controlled: false,
        x: 180,
        z: 120,
        angle: Math.PI,
        color: "#fb7185",
        boostColor: "#f59e0b",
        wheelColor: "#f8fafc",
        bodyStyle: "breakout",
        boost: 100,
      }),
    ];
  } else {
    buildResultCars(winningTeam);
    state.resultTitle = winningTeam === "blue" ? "Blue Wins" : "Orange Wins";
    state.resultSubtitle = `Final score ${state.scores.blue} - ${state.scores.orange}`;
  }

  resultTitleEl.textContent = state.resultTitle;
  resultSubtitleEl.textContent = state.resultSubtitle;
  state.message = state.resultTitle;
  state.messageTimer = 150;
  setScreen("result");
}

function hasInfiniteBoost(car) {
  return state.mode === "freeplay" && car.controlled;
}

function updateCar(car, throttle, steering, useBoost, jumpPressed, dt) {
  const turnRate = 4.1;
  const driveAccel = 900;
  const reverseAccel = 460;
  const baseDrag = car.y > 0 ? 0.9962 : 0.9935;
  const lateralGrip = car.y > 0 ? 0.965 : 0.9;
  const boosting = useBoost && car.boost > 0;
  const accel = boosting ? 1540 : throttle >= 0 ? driveAccel : reverseAccel;
  const maxSpeed = boosting ? 900 : 660;

  car.angle = normalizeAngle(car.angle + steering * turnRate * dt * (car.y > 0 ? 0.82 : 1));
  car.pitch = lerp(car.pitch, clamp(-throttle * 0.18 + car.vy * 0.0008, -0.35, 0.35), 0.12);

  const forwardX = Math.cos(car.angle);
  const forwardZ = Math.sin(car.angle);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  if (car.y > 0) {
    car.vx += forwardX * throttle * 360 * dt;
    car.vz += forwardZ * throttle * 360 * dt;
  } else {
    car.vx += forwardX * throttle * accel * dt;
    car.vz += forwardZ * throttle * accel * dt;
  }

  const forwardSpeed = car.vx * forwardX + car.vz * forwardZ;
  const lateralSpeed = car.vx * rightX + car.vz * rightZ;

  car.vx = (forwardX * forwardSpeed + rightX * lateralSpeed * lateralGrip) * baseDrag;
  car.vz = (forwardZ * forwardSpeed + rightZ * lateralSpeed * lateralGrip) * baseDrag;

  if (hasInfiniteBoost(car)) {
    car.boost = 100;
  }

  if (boosting) {
    if (!hasInfiniteBoost(car)) {
      car.boost = Math.max(0, car.boost - 30 * dt);
    }
    car.vx += forwardX * 340 * dt;
    car.vz += forwardZ * 340 * dt;
    if (car.y > 0) {
      car.vy += 220 * dt;
    }
    spawnBoostParticles(car);
  }
  car.isBoosting = boosting;

  if (jumpPressed && !car.jumpHeld) {
    if (car.y <= getRampHeightAt(car.x, car.z, true) + 0.001) {
      car.vy = JUMP_VELOCITY;
      car.jumpsUsed = 1;
    } else if (car.jumpsUsed < 2) {
      car.vy = DOUBLE_JUMP_VELOCITY;
      car.jumpsUsed = 2;
      car.vx += forwardX * 90;
      car.vz += forwardZ * 90;
    }
  }
  car.jumpHeld = jumpPressed;

  const speed = length(car.vx, car.vz);
  if (speed > maxSpeed) {
    car.vx = (car.vx / speed) * maxSpeed;
    car.vz = (car.vz / speed) * maxSpeed;
  }

  car.vy -= GRAVITY * dt;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.z += car.vz * dt;

  car.x = clamp(car.x, -FIELD.halfWidth + CAR_RADIUS, FIELD.halfWidth - CAR_RADIUS);
  car.z = clamp(car.z, -FIELD.halfDepth + CAR_RADIUS, FIELD.halfDepth - CAR_RADIUS);

  const rampHeight = getRampHeightAt(car.x, car.z, true);
  if (car.y <= rampHeight) {
    car.y = rampHeight;
    if (car.vy < 0) {
      car.vy = 0;
    }
    car.pitch = lerp(car.pitch, 0, 0.2);
    car.jumpsUsed = 0;
  }
}

function updatePlayer(dt) {
  const player = getPlayerCar();
  if (!player) {
    return;
  }

  const steering = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
  const throttle = (keys.has("ArrowUp") || keys.has("w") ? 1 : 0) - (keys.has("ArrowDown") || keys.has("s") ? 1 : 0);
  const useBoost = keys.has("Shift");
  const jumpPressed = keys.has("j") || keys.has(" ");
  updateCar(player, throttle, steering, useBoost, jumpPressed, dt);
}

function findBestBoostPad(car) {
  let bestPad = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const pad of state.boostPads) {
    if (!pad.active) {
      continue;
    }
    const dist = length(pad.x - car.x, pad.z - car.z);
    const score = dist - pad.value * 1.8;
    if (score < bestScore) {
      bestScore = score;
      bestPad = pad;
    }
  }
  return bestPad;
}

function teamCars(team) {
  return state.cars.filter((car) => car.team === team);
}

function nearestAttacker(team) {
  const members = teamCars(team);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const car of members) {
    const dist = Math.hypot(state.ball.x - car.x, state.ball.z - car.z);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = car;
    }
  }
  return best;
}

function updateAIForCar(car, dt) {
  const attackSide = car.team === "orange" ? -1 : 1;
  const ownGoalX = car.team === "orange" ? FIELD.halfWidth : -FIELD.halfWidth;
  const enemyGoalX = car.team === "orange" ? -FIELD.halfWidth : FIELD.halfWidth;
  const targetPad = findBestBoostPad(car);
  const predictedBallX = clamp(state.ball.x + state.ball.vx * 0.44, -FIELD.halfWidth + 140, FIELD.halfWidth - 140);
  const predictedBallZ = clamp(state.ball.z + state.ball.vz * 0.44, -FIELD.halfDepth + 140, FIELD.halfDepth - 140);
  const ballToGoalX = enemyGoalX - predictedBallX;
  const ballToGoalZ = -predictedBallZ;
  const ballToGoalLength = Math.hypot(ballToGoalX, ballToGoalZ) || 1;
  const attackDirX = ballToGoalX / ballToGoalLength;
  const attackDirZ = ballToGoalZ / ballToGoalLength;
  const setupDistance = state.ball.y > 55 ? 160 : 118;
  const strikeX = predictedBallX - attackDirX * setupDistance;
  const strikeZ = predictedBallZ - attackDirZ * setupDistance;
  const defendingCar = nearestAttacker(car.team) !== car;
  const homeX = ownGoalX + attackSide * 420;
  const homeZ = clamp(predictedBallZ * 0.45, -620, 620);
  const shouldShadow = defendingCar && Math.abs(predictedBallX - ownGoalX) < 1240;
  const usePad = car.boost < 20 && targetPad && Math.hypot(targetPad.x - car.x, targetPad.z - car.z) < 900;

  let targetX = strikeX;
  let targetZ = strikeZ;

  if (usePad) {
    targetX = targetPad.x;
    targetZ = targetPad.z;
  } else if (shouldShadow) {
    targetX = homeX;
    targetZ = homeZ;
  }

  const directChallenge = Math.hypot(predictedBallX - car.x, predictedBallZ - car.z) < 240;
  if (directChallenge) {
    targetX = predictedBallX + attackDirX * 30;
    targetZ = predictedBallZ + attackDirZ * 30;
  }

  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const desiredAngle = Math.atan2(dz, dx);
  const angleDelta = normalizeAngle(desiredAngle - car.angle);
  const steering = clamp(angleDelta * 2.2, -1, 1);
  const throttle = Math.abs(angleDelta) > 2.2 ? -0.4 : Math.abs(angleDelta) > 1.15 ? 0.56 : 1;
  const shouldBoost = !usePad && Math.hypot(dx, dz) > 260 && car.boost > 8 && Math.abs(angleDelta) < 0.5;
  const jumpPressed = state.ball.y > 34 && state.ball.y < 165 && Math.hypot(state.ball.x - car.x, state.ball.z - car.z) < 84 && Math.abs(angleDelta) < 0.5 && car.y <= getRampHeightAt(car.x, car.z, true) + 0.001;

  updateCar(car, throttle, steering, shouldBoost, jumpPressed, dt);
}

function updateAIs(dt) {
  for (const car of state.cars) {
    if (!car.controlled) {
      updateAIForCar(car, dt);
    }
  }
}

function collectBoostPad(car, pad, name) {
  if (!pad.active) {
    return;
  }

  const dist = length(car.x - pad.x, car.z - pad.z);
  if (dist > CAR_RADIUS + pad.radius) {
    return;
  }

  pad.active = false;
  pad.timer = pad.respawnSeconds;
  car.boost = Math.min(100, car.boost + pad.value);
  state.message = `${name} collected ${pad.value} boost`;
  state.messageTimer = 36;
}

function updateBoostPads(dt) {
  for (const pad of state.boostPads) {
    if (!pad.active) {
      pad.timer -= dt;
      if (pad.timer <= 0) {
        pad.active = true;
        pad.timer = 0;
      }
      continue;
    }

    for (const car of state.cars) {
      collectBoostPad(car, pad, car.name);
      if (!pad.active) {
        break;
      }
    }
  }
}

function collideCarWithBall(car) {
  const dx = state.ball.x - car.x;
  const dy = state.ball.y - (car.y + 12);
  const dz = state.ball.z - car.z;
  const dist = Math.hypot(dx, dy, dz);
  const minDist = CAR_RADIUS + BALL_RADIUS + 2;

  if (dist === 0 || dist >= minDist) {
    return null;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  const overlap = minDist - dist;

  state.ball.x += nx * overlap;
  state.ball.y += ny * overlap;
  state.ball.z += nz * overlap;
  state.ball.vx += car.vx * 0.96 + nx * 190;
  state.ball.vy += car.vy * 0.66 + ny * 175;
  state.ball.vz += car.vz * 0.96 + nz * 190;
  car.vx -= nx * 38;
  car.vy -= ny * 25;
  car.vz -= nz * 38;
  return car.id;
}

function updateBall(dt) {
  const ball = state.ball;
  const wasGrounded = ball.y <= getRampHeightAt(ball.x, ball.z, true) + BALL_RADIUS + 1;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.vx *= wasGrounded ? 0.9988 : 0.9992;
  ball.vy -= GRAVITY * dt;
  ball.vz *= wasGrounded ? 0.9988 : 0.9992;
  ball.spin += Math.hypot(ball.vx, ball.vz) * dt * 0.02;

  const rampHeight = getRampHeightAt(ball.x, ball.z, true);
  if (ball.y <= rampHeight + BALL_RADIUS) {
    ball.y = rampHeight + BALL_RADIUS;
    if (Math.abs(ball.vy) < 60) {
      ball.vy = 0;
    } else {
      ball.vy *= -0.76;
    }
    ball.vx *= 0.997;
    ball.vz *= 0.997;
  }

  const insideGoalLane = Math.abs(ball.z) <= FIELD.goalHalfWidth + BALL_RADIUS;
  const insideGoalHeight = ball.y + BALL_RADIUS <= FIELD.goalHeight + 2;
  if (ball.x + BALL_RADIUS < -FIELD.halfWidth && insideGoalLane && insideGoalHeight) {
    state.scores.orange += 1;
    triggerGoalSequence("orange", state.lastTouchId || "orange-0");
    return;
  }
  if (ball.x - BALL_RADIUS > FIELD.halfWidth && insideGoalLane && insideGoalHeight) {
    state.scores.blue += 1;
    triggerGoalSequence("blue", state.lastTouchId || "blue-0");
    return;
  }

  if (ball.z - BALL_RADIUS <= -FIELD.halfDepth || ball.z + BALL_RADIUS >= FIELD.halfDepth) {
    ball.z = clamp(ball.z, -FIELD.halfDepth + BALL_RADIUS, FIELD.halfDepth - BALL_RADIUS);
    ball.vz *= -0.92;
    ball.vx *= 0.992;
  }

  if (!insideGoalLane && (ball.x - BALL_RADIUS <= -FIELD.halfWidth || ball.x + BALL_RADIUS >= FIELD.halfWidth)) {
    ball.x = clamp(ball.x, -FIELD.halfWidth + BALL_RADIUS, FIELD.halfWidth - BALL_RADIUS);
    ball.vx *= -0.92;
    ball.vz *= 0.992;
  }
}

function spawnBoostParticles(car) {
  const backwardX = -Math.cos(car.angle);
  const backwardZ = -Math.sin(car.angle);
  const sideX = -backwardZ;
  const sideZ = backwardX;

  for (let i = 0; i < 2; i += 1) {
    const spread = (Math.random() - 0.5) * 10;
    state.particles.push({
      x: car.x + backwardX * 26 + sideX * spread,
      y: 10 + car.y + Math.random() * 4,
      z: car.z + backwardZ * 26 + sideZ * spread,
      vx: backwardX * (180 + Math.random() * 150) + car.vx * 0.2,
      vy: 8 + Math.random() * 10 + car.vy * 0.02,
      vz: backwardZ * (180 + Math.random() * 150) + car.vz * 0.2,
      life: 0.26 + Math.random() * 0.12,
      radius: 5 + Math.random() * 4,
      color: car.boostColor,
    });
  }
}

function updateParticles(dt) {
  state.particles = state.particles.filter((particle) => {
    particle.life -= dt;
    if (particle.life <= 0) {
      return false;
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz * dt;
    particle.vx *= 0.94;
    particle.vz *= 0.94;
    particle.vy += 18 * dt;
    particle.radius *= 0.985;
    return true;
  });
}

function constrainCameraPosition(anchorX, anchorY, anchorZ, desiredX, desiredY, desiredZ) {
  const padding = 150;
  const minX = -FIELD.halfWidth + padding;
  const maxX = FIELD.halfWidth - padding;
  const minZ = -FIELD.halfDepth + padding;
  const maxZ = FIELD.halfDepth - padding;
  const deltaX = desiredX - anchorX;
  const deltaZ = desiredZ - anchorZ;
  let scale = 1;

  if (deltaX > 0) {
    scale = Math.min(scale, (maxX - anchorX) / deltaX);
  } else if (deltaX < 0) {
    scale = Math.min(scale, (minX - anchorX) / deltaX);
  }

  if (deltaZ > 0) {
    scale = Math.min(scale, (maxZ - anchorZ) / deltaZ);
  } else if (deltaZ < 0) {
    scale = Math.min(scale, (minZ - anchorZ) / deltaZ);
  }

  const safeScale = clamp(scale, 0, 1);
  const safeX = anchorX + deltaX * safeScale;
  const safeZ = anchorZ + deltaZ * safeScale;
  const rampLift = getRampHeightAt(safeX, safeZ, true);
  return {
    x: safeX,
    y: Math.max(desiredY, 170 + rampLift * 1.2),
    z: safeZ,
  };
}

function getMenuShotTarget() {
  const t = state.menuOrbit;
  switch (state.menuShot) {
    case 1:
      return {
        x: -FIELD.halfWidth - 120,
        y: 300 + Math.sin(t * 2.2) * 18,
        z: Math.sin(t * 1.05) * 680,
        targetX: 260,
        targetY: 110,
        targetZ: 0,
      };
    case 2:
      return {
        x: 0 + Math.cos(t * 0.8) * 1240,
        y: 1240 + Math.sin(t * 1.2) * 60,
        z: -40 + Math.sin(t * 0.8) * 900,
        targetX: 0,
        targetY: 120,
        targetZ: 0,
      };
    case 3:
      return {
        x: FIELD.halfWidth + 540,
        y: 420 + Math.sin(t * 1.3) * 20,
        z: Math.sin(t * 0.85) * 720,
        targetX: 180,
        targetY: 95,
        targetZ: 0,
      };
    default:
      return {
        x: -2600 + Math.cos(t) * 180,
        y: 980 + Math.sin(t * 0.7) * 26,
        z: 1760 + Math.sin(t) * 180,
        targetX: 180,
        targetY: 85,
        targetZ: 0,
      };
  }
}

function updateCamera() {
  if (state.screen === "menu") {
    state.menuOrbit += 0.0025;
    state.menuShotTimer += 1 / 60;
    let cutToShot = false;
    if (state.menuShotTimer >= 5.5) {
      state.menuShot = (state.menuShot + 1) % 4;
      state.menuShotTimer = 0;
      cutToShot = true;
    }
    const shot = getMenuShotTarget();
    if (cutToShot || state.menuShotTimer < 0.05) {
      state.camera.x = shot.x;
      state.camera.y = shot.y;
      state.camera.z = shot.z;
      state.camera.targetX = shot.targetX;
      state.camera.targetY = shot.targetY;
      state.camera.targetZ = shot.targetZ;
    } else {
      state.camera.x = lerp(state.camera.x, shot.x, 0.18);
      state.camera.y = lerp(state.camera.y, shot.y, 0.18);
      state.camera.z = lerp(state.camera.z, shot.z, 0.18);
      state.camera.targetX = lerp(state.camera.targetX, shot.targetX, 0.2);
      state.camera.targetY = lerp(state.camera.targetY, shot.targetY, 0.2);
      state.camera.targetZ = lerp(state.camera.targetZ, shot.targetZ, 0.2);
    }
    return;
  }

  if (state.screen === "result") {
    state.camera.x = lerp(state.camera.x, -620, 0.06);
    state.camera.y = lerp(state.camera.y, 210, 0.06);
    state.camera.z = lerp(state.camera.z, 0, 0.06);
    state.camera.targetX = lerp(state.camera.targetX, 160, 0.08);
    state.camera.targetY = lerp(state.camera.targetY, 24, 0.08);
    state.camera.targetZ = lerp(state.camera.targetZ, 0, 0.08);
    return;
  }

  const isReplay = state.replayTimer > 0 && state.goalFreezeTimer <= 0;
  const replayFocus = getPlayerCar() || state.cars[0];
  if (!replayFocus) {
    return;
  }

  const replayContactDelta = isReplay ? Math.abs(state.replayCursor - state.replayContactFrame) : Number.POSITIVE_INFINITY;
  const contactZoom = isReplay ? clamp(1 - replayContactDelta / 26, 0, 1) : 0;
  const replayGoalPhase = isReplay && state.replayGoalSeenTimer >= 0
    ? clamp((state.replayGoalSeenTimer - 1) / 0.35, 0, 1)
    : 0;
  const followDistance = isReplay
    ? lerp(lerp(600, 430, contactZoom), 1850, replayGoalPhase)
    : 760;
  const replayHeading = Math.atan2(state.ball.vz || 0.01, state.ball.vx || 0.01);
  const anchorAngle = isReplay ? replayHeading + Math.PI * 0.72 : replayFocus.angle;
  const anchorX = isReplay ? lerp(state.ball.x, 0, replayGoalPhase) : replayFocus.x;
  const anchorY = isReplay ? lerp(state.ball.y, 120, replayGoalPhase) : replayFocus.y;
  const anchorZ = isReplay ? lerp(state.ball.z, 0, replayGoalPhase) : replayFocus.z;
  const targetX = anchorX - Math.cos(anchorAngle) * followDistance;
  const targetY = (isReplay ? lerp(lerp(320, 250, contactZoom), 760, replayGoalPhase) : 290) + anchorY * 0.25;
  const targetZ = anchorZ - Math.sin(anchorAngle) * followDistance * (1 - replayGoalPhase * 0.55);
  const defaultLookAheadX = replayFocus.x + Math.cos(replayFocus.angle) * 340;
  const defaultLookAheadY = 20 + replayFocus.y * 0.35;
  const defaultLookAheadZ = replayFocus.z + Math.sin(replayFocus.angle) * 280;
  const usingBallCam = state.ballCam && !isReplay;
  const lookAheadX = isReplay ? lerp(state.ball.x, 0, replayGoalPhase) : usingBallCam ? state.ball.x : defaultLookAheadX;
  const lookAheadY = isReplay ? lerp(state.ball.y, 70, replayGoalPhase) : usingBallCam ? state.ball.y : defaultLookAheadY;
  const lookAheadZ = isReplay ? lerp(state.ball.z, 0, replayGoalPhase) : usingBallCam ? state.ball.z : defaultLookAheadZ;
  const boundedCamera = constrainCameraPosition(anchorX, anchorY, anchorZ, targetX, targetY, targetZ);

  state.camera.x = lerp(state.camera.x, boundedCamera.x, CAMERA_LERP);
  state.camera.y = lerp(state.camera.y, boundedCamera.y, CAMERA_LERP);
  state.camera.z = lerp(state.camera.z, boundedCamera.z, CAMERA_LERP);
  state.camera.targetX = lerp(state.camera.targetX, lookAheadX, CAMERA_LERP);
  state.camera.targetY = lerp(state.camera.targetY, lookAheadY, CAMERA_LERP);
  state.camera.targetZ = lerp(state.camera.targetZ, lookAheadZ, CAMERA_LERP);
}

function getCameraBasis() {
  const fx = state.camera.targetX - state.camera.x;
  const fy = state.camera.targetY - state.camera.y;
  const fz = state.camera.targetZ - state.camera.z;
  const fLen = Math.hypot(fx, fy, fz) || 1;
  const forwardX = fx / fLen;
  const forwardY = fy / fLen;
  const forwardZ = fz / fLen;

  const upX = 0;
  const upY = 1;
  const upZ = 0;

  let rightX = forwardY * upZ - forwardZ * upY;
  let rightY = forwardZ * upX - forwardX * upZ;
  let rightZ = forwardX * upY - forwardY * upX;
  const rLen = Math.hypot(rightX, rightY, rightZ) || 1;
  rightX /= rLen;
  rightY /= rLen;
  rightZ /= rLen;

  const camUpX = rightY * forwardZ - rightZ * forwardY;
  const camUpY = rightZ * forwardX - rightX * forwardZ;
  const camUpZ = rightX * forwardY - rightY * forwardX;

  return {
    forwardX,
    forwardY,
    forwardZ,
    rightX,
    rightY,
    rightZ,
    camUpX,
    camUpY,
    camUpZ,
  };
}

function projectPoint(x, y, z) {
  const basis = getCameraBasis();
  const dx = x - state.camera.x;
  const dy = y - state.camera.y;
  const dz = z - state.camera.z;
  const rx = dx * basis.rightX + dy * basis.rightY + dz * basis.rightZ;
  const ry = dx * basis.camUpX + dy * basis.camUpY + dz * basis.camUpZ;
  const finalZ = dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;

  if (finalZ < 8) {
    return null;
  }

  const focal = 500;
  return {
    x: canvas.width / 2 + (rx / finalZ) * focal,
    y: canvas.height / 2 - (ry / finalZ) * focal,
    scale: focal / finalZ,
    depth: finalZ,
  };
}

function worldDepth(x, y, z) {
  const basis = getCameraBasis();
  const dx = x - state.camera.x;
  const dy = y - state.camera.y;
  const dz = z - state.camera.z;
  return dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;
}

function fillQuad(points, fillStyle, strokeStyle = null) {
  if (points.some((point) => !point)) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

function draw3DLine(x0, y0, z0, x1, y1, z1, color, width) {
  const a = projectPoint(x0, y0, z0);
  const b = projectPoint(x1, y1, z1);
  if (!a || !b) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawBackground() {
  const skyPreset = TIME_OF_DAY[state.timeOfDay];
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, skyPreset.skyTop);
  sky.addColorStop(0.42, skyPreset.skyMid);
  sky.addColorStop(1, skyPreset.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(canvas.width / 2, 120, 40, canvas.width / 2, 120, 340);
  glow.addColorStop(0, skyPreset.glow);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = skyPreset.fieldTint;
  ctx.fillRect(0, canvas.height * 0.35, canvas.width, canvas.height * 0.65);
}

function drawArena() {
  drawStands();
  drawTiledFloor();
  drawFieldLines();
  drawGoalVolume(-1, "rgba(96,165,250,0.28)");
  drawGoalVolume(1, "rgba(248,113,113,0.28)");
  drawWalls();
  drawCameraRigs();
  drawExteriorCameras();
  drawFloodlights();
  drawRoofRibs();
}

function drawTiledFloor() {
  const tileW = 150;
  const tileD = 150;
  for (let x = -FIELD.halfWidth; x < FIELD.halfWidth; x += tileW) {
    for (let z = -FIELD.halfDepth; z < FIELD.halfDepth; z += tileD) {
      const x1 = Math.min(x + tileW, FIELD.halfWidth);
      const z1 = Math.min(z + tileD, FIELD.halfDepth);
      const points = [
        projectPoint(x, getRampHeightAt(x, z, true), z),
        projectPoint(x1, getRampHeightAt(x1, z, true), z),
        projectPoint(x1, getRampHeightAt(x1, z1, true), z1),
        projectPoint(x, getRampHeightAt(x, z1, true), z1),
      ];
      fillQuad(
        points,
        ((Math.floor((x + FIELD.halfWidth) / tileW) + Math.floor((z + FIELD.halfDepth) / tileD)) % 2 === 0)
          ? "#166534"
          : "#15803d"
      );
    }
  }
}

function drawRectLine(x0, z0, x1, z1, color) {
  draw3DLine(x0, 1, z0, x1, 1, z0, color, 3);
  draw3DLine(x1, 1, z0, x1, 1, z1, color, 3);
  draw3DLine(x1, 1, z1, x0, 1, z1, color, 3);
  draw3DLine(x0, 1, z1, x0, 1, z0, color, 3);
}

function drawCircleLine(cx, y, cz, radius, color) {
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 40; i += 1) {
    const angle = (i / 40) * Math.PI * 2;
    const point = projectPoint(cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius);
    if (!point) {
      continue;
    }
    if (!started) {
      ctx.moveTo(point.x, point.y);
      started = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawGoalBox(direction) {
  const x0 = direction < 0 ? -FIELD.halfWidth : FIELD.halfWidth - 250;
  const x1 = direction < 0 ? -FIELD.halfWidth + 250 : FIELD.halfWidth;
  const z0 = -360;
  const z1 = 360;
  drawRectLine(x0, z0, x1, z1, "rgba(255,255,255,0.28)");
}

function drawFieldLines() {
  draw3DLine(-FIELD.halfWidth, 1, 0, FIELD.halfWidth, 1, 0, "rgba(255,255,255,0.65)", 3);
  drawCircleLine(0, 1, 0, 165, "rgba(255,255,255,0.55)");
  drawRectLine(-FIELD.halfWidth, -FIELD.halfDepth, FIELD.halfWidth, FIELD.halfDepth, "rgba(255,255,255,0.5)");
  drawGoalBox(-1);
  drawGoalBox(1);
}

function drawGoalVolume(direction, color) {
  const xFront = direction < 0 ? -FIELD.halfWidth : FIELD.halfWidth;
  const xBack = xFront + direction * FIELD.goalDepth;
  const z0 = -FIELD.goalHalfWidth;
  const z1 = FIELD.goalHalfWidth;
  const y = FIELD.goalHeight;

  fillQuad(
    [
      projectPoint(xFront, 0, z0),
      projectPoint(xBack, 0, z0),
      projectPoint(xBack, y, z0),
      projectPoint(xFront, y, z0),
    ],
    color
  );
  fillQuad(
    [
      projectPoint(xFront, 0, z1),
      projectPoint(xBack, 0, z1),
      projectPoint(xBack, y, z1),
      projectPoint(xFront, y, z1),
    ],
    color
  );
  fillQuad(
    [
      projectPoint(xBack, 0, z0),
      projectPoint(xBack, 0, z1),
      projectPoint(xBack, y, z1),
      projectPoint(xBack, y, z0),
    ],
    color
  );
  fillQuad(
    [
      projectPoint(xFront, y, z0),
      projectPoint(xFront, y, z1),
      projectPoint(xBack, y, z1),
      projectPoint(xBack, y, z0),
    ],
    "rgba(226,232,240,0.18)"
  );
  draw3DLine(xFront, 0, z0, xBack, y, z0, "rgba(255,255,255,0.38)", 2);
  draw3DLine(xFront, 0, z1, xBack, y, z1, "rgba(255,255,255,0.38)", 2);
  draw3DLine(xBack, 0, z0, xBack, y, z0, "rgba(255,255,255,0.3)", 2);
  draw3DLine(xBack, 0, z1, xBack, y, z1, "rgba(255,255,255,0.3)", 2);
}

function drawWalls() {
  const step = 180;
  for (let x = -FIELD.halfWidth; x < FIELD.halfWidth; x += step) {
    const x1 = Math.min(x + step, FIELD.halfWidth);
    fillQuad(
      [
        projectPoint(x, getRampHeightAt(x, -FIELD.halfDepth, true), -FIELD.halfDepth),
        projectPoint(x1, getRampHeightAt(x1, -FIELD.halfDepth, true), -FIELD.halfDepth),
        projectPoint(x1, FIELD.wallHeight, -FIELD.halfDepth),
        projectPoint(x, FIELD.wallHeight, -FIELD.halfDepth),
      ],
      "rgba(148,163,184,0.14)"
    );
    fillQuad(
      [
        projectPoint(x, getRampHeightAt(x, FIELD.halfDepth, true), FIELD.halfDepth),
        projectPoint(x1, getRampHeightAt(x1, FIELD.halfDepth, true), FIELD.halfDepth),
        projectPoint(x1, FIELD.wallHeight, FIELD.halfDepth),
        projectPoint(x, FIELD.wallHeight, FIELD.halfDepth),
      ],
      "rgba(148,163,184,0.14)"
    );
  }
}

function drawStandSurface(side) {
  if (side === "north" || side === "south") {
    const zFront = side === "north" ? -FIELD.halfDepth - 90 : FIELD.halfDepth + 90;
    const zBack = side === "north" ? -FIELD.halfDepth - 480 : FIELD.halfDepth + 480;
    const zMid = side === "north" ? -FIELD.halfDepth - 270 : FIELD.halfDepth + 270;

    for (let x = -FIELD.halfWidth - 160; x < FIELD.halfWidth + 160; x += 170) {
      const x1 = Math.min(x + 170, FIELD.halfWidth + 160);
      fillQuad(
        [
          projectPoint(x, 0, zFront),
          projectPoint(x1, 0, zFront),
          projectPoint(x1 + 44, 150, zMid),
          projectPoint(x + 44, 150, zMid),
        ],
        "rgba(15,23,42,0.96)"
      );
      fillQuad(
        [
          projectPoint(x + 44, 150, zMid),
          projectPoint(x1 + 44, 150, zMid),
          projectPoint(x1 + 88, 330, zBack),
          projectPoint(x + 88, 330, zBack),
        ],
        "rgba(30,41,59,0.94)"
      );
      fillQuad(
        [
          projectPoint(x + 88, 330, zBack),
          projectPoint(x1 + 88, 330, zBack),
          projectPoint(x1 + 136, 510, zBack + (side === "north" ? -180 : 180)),
          projectPoint(x + 136, 510, zBack + (side === "north" ? -180 : 180)),
        ],
        "rgba(51,65,85,0.92)"
      );
    }
    return;
  }

  const xFront = side === "west" ? -FIELD.halfWidth - 90 : FIELD.halfWidth + 90;
  const xBack = side === "west" ? -FIELD.halfWidth - 560 : FIELD.halfWidth + 560;
  const xMid = side === "west" ? -FIELD.halfWidth - 300 : FIELD.halfWidth + 300;
  const zStart = -FIELD.halfDepth - 55;
  const zEnd = FIELD.halfDepth + 55;

  for (let z = zStart; z < zEnd; z += 180) {
    const z1 = Math.min(z + 180, zEnd);
    fillQuad(
      [
        projectPoint(xFront, 0, z),
        projectPoint(xFront, 0, z1),
        projectPoint(xMid, 140, z1 + 40),
        projectPoint(xMid, 140, z + 40),
      ],
      "rgba(15,23,42,0.96)"
    );
    fillQuad(
      [
        projectPoint(xMid, 140, z + 40),
        projectPoint(xMid, 140, z1 + 40),
        projectPoint(xBack, 300, z1 + 90),
        projectPoint(xBack, 300, z + 90),
      ],
      "rgba(30,41,59,0.94)"
    );
    fillQuad(
      [
        projectPoint(xBack, 300, z + 90),
        projectPoint(xBack, 300, z1 + 90),
        projectPoint(side === "west" ? xBack - 180 : xBack + 180, 470, z1 + 134),
        projectPoint(side === "west" ? xBack - 180 : xBack + 180, 470, z + 134),
      ],
      "rgba(51,65,85,0.92)"
    );
  }
}

function drawStandBands(side) {
  const palette = ["#e5eefc", "#fb7185", "#38bdf8", "#facc15", "#a78bfa"];
  if (side === "north" || side === "south") {
    const zBase = side === "north" ? -FIELD.halfDepth - 152 : FIELD.halfDepth + 152;
    const zStep = side === "north" ? -36 : 36;
    for (let row = 0; row < 8; row += 1) {
      for (let x = -FIELD.halfWidth - 160; x <= FIELD.halfWidth + 160; x += 30) {
        const color = palette[Math.abs(Math.floor((x + row * 19) / 26)) % palette.length];
        drawCrowdEgg(x, 44 + row * 30, zBase + row * zStep, color, row * 0.25 + x * 0.003);
      }
    }
    for (let row = 0; row < 6; row += 1) {
      for (let x = -FIELD.halfWidth - 80; x <= FIELD.halfWidth + 240; x += 36) {
        const color = palette[Math.abs(Math.floor((x + row * 23) / 30)) % palette.length];
        drawCrowdEgg(x + 92, 356 + row * 30, zBase + (side === "north" ? -220 : 220) + row * zStep, color, row * 0.45 + x * 0.0018);
      }
    }
    return;
  }

  const xBase = side === "west" ? -FIELD.halfWidth - 152 : FIELD.halfWidth + 152;
  const xStep = side === "west" ? -32 : 32;
  for (let row = 0; row < 7; row += 1) {
    for (let z = -FIELD.halfDepth + 60; z <= FIELD.halfDepth - 60; z += 32) {
      const color = palette[Math.abs(Math.floor((z + row * 17) / 28)) % palette.length];
      drawCrowdEgg(xBase + row * xStep, 40 + row * 24, z, color, row * 0.2 + z * 0.0025);
    }
  }
  for (let row = 0; row < 5; row += 1) {
    for (let z = -FIELD.halfDepth + 30; z <= FIELD.halfDepth + 40; z += 38) {
      const color = palette[Math.abs(Math.floor((z + row * 19) / 30)) % palette.length];
      drawCrowdEgg(xBase + row * xStep + (side === "west" ? -170 : 170), 328 + row * 28, z + 120, color, row * 0.35 + z * 0.002);
    }
  }
}

function drawCrowdEgg(x, y, z, color, phase) {
  const cheerOffset = Math.sin(state.lastTime * 0.005 + phase) * 4;
  const point = projectPoint(x, y + cheerOffset, z);
  if (!point) {
    return;
  }

  const width = Math.max(3.2, point.scale * 8.4);
  const height = width * 1.45;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(point.x, point.y, width, height, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(point.x - width * 0.2, point.y - height * 0.28, width * 0.32, height * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrowdFlags() {
  const flags = [
    { x: -FIELD.halfWidth * 0.6, y: 180, z: -FIELD.halfDepth - 205, color: "#38bdf8" },
    { x: 0, y: 212, z: -FIELD.halfDepth - 240, color: "#facc15" },
    { x: FIELD.halfWidth * 0.58, y: 176, z: -FIELD.halfDepth - 210, color: "#fb7185" },
    { x: -FIELD.halfWidth * 0.52, y: 180, z: FIELD.halfDepth + 205, color: "#a78bfa" },
    { x: FIELD.halfWidth * 0.2, y: 206, z: FIELD.halfDepth + 232, color: "#22c55e" },
    { x: FIELD.halfWidth * 0.68, y: 172, z: FIELD.halfDepth + 206, color: "#f97316" },
  ];

  for (const flag of flags) {
    const sway = Math.sin(state.lastTime * 0.006 + flag.x * 0.002) * 18;
    draw3DLine(flag.x, flag.y - 58, flag.z, flag.x, flag.y, flag.z, "rgba(226,232,240,0.85)", 2);
    fillQuad(
      [
        projectPoint(flag.x, flag.y, flag.z),
        projectPoint(flag.x + 54, flag.y + sway * 0.18, flag.z + sway),
        projectPoint(flag.x + 50, flag.y - 24 + sway * 0.18, flag.z + sway),
        projectPoint(flag.x, flag.y - 24, flag.z),
      ],
      hexToRgba(flag.color, 0.88),
      "rgba(255,255,255,0.15)"
    );
  }
}

function drawBannerRibbon() {
  const ribbonY0 = 94;
  const ribbonY1 = 118;
  fillQuad(
    [
      projectPoint(-FIELD.halfWidth - 36, ribbonY0, -FIELD.halfDepth - 16),
      projectPoint(FIELD.halfWidth + 36, ribbonY0, -FIELD.halfDepth - 16),
      projectPoint(FIELD.halfWidth + 36, ribbonY1, -FIELD.halfDepth - 16),
      projectPoint(-FIELD.halfWidth - 36, ribbonY1, -FIELD.halfDepth - 16),
    ],
    "rgba(59,130,246,0.5)"
  );
  fillQuad(
    [
      projectPoint(-FIELD.halfWidth - 36, ribbonY0, FIELD.halfDepth + 16),
      projectPoint(FIELD.halfWidth + 36, ribbonY0, FIELD.halfDepth + 16),
      projectPoint(FIELD.halfWidth + 36, ribbonY1, FIELD.halfDepth + 16),
      projectPoint(-FIELD.halfWidth - 36, ribbonY1, FIELD.halfDepth + 16),
    ],
    "rgba(244,63,94,0.44)"
  );
}

function drawRoofRibs() {
  for (let z = -FIELD.halfDepth; z <= FIELD.halfDepth; z += 200) {
    draw3DLine(-FIELD.halfWidth - 260, 360, z, FIELD.halfWidth + 260, 360, z, "rgba(226,232,240,0.12)", 2);
  }
  draw3DLine(-FIELD.halfWidth - 260, 360, -FIELD.halfDepth - 340, -FIELD.halfWidth - 260, 360, FIELD.halfDepth + 340, "rgba(226,232,240,0.12)", 2);
  draw3DLine(FIELD.halfWidth + 260, 360, -FIELD.halfDepth - 340, FIELD.halfWidth + 260, 360, FIELD.halfDepth + 340, "rgba(226,232,240,0.12)", 2);
}

function drawCameraRigs() {
  const rigs = [
    { x: -FIELD.halfWidth - 130, z: -170 },
    { x: -FIELD.halfWidth - 130, z: 170 },
    { x: FIELD.halfWidth + 130, z: -170 },
    { x: FIELD.halfWidth + 130, z: 170 },
  ];
  for (const rig of rigs) {
    draw3DLine(rig.x, 0, rig.z, rig.x, 108, rig.z, "rgba(100,116,139,0.8)", 3);
    fillQuad(
      [
        projectPoint(rig.x - 20, 108, rig.z - 12),
        projectPoint(rig.x + 20, 108, rig.z - 12),
        projectPoint(rig.x + 20, 120, rig.z + 12),
        projectPoint(rig.x - 20, 120, rig.z + 12),
      ],
      "rgba(15,23,42,0.95)"
    );
  }
}

function drawExteriorCameras() {
  const cameras = [
    { x: -FIELD.halfWidth - 430, z: -FIELD.halfDepth - 320, yaw: 1, height: 150 },
    { x: -FIELD.halfWidth - 460, z: FIELD.halfDepth + 340, yaw: 1, height: 165 },
    { x: FIELD.halfWidth + 430, z: -FIELD.halfDepth - 320, yaw: -1, height: 150 },
    { x: FIELD.halfWidth + 460, z: FIELD.halfDepth + 340, yaw: -1, height: 165 },
  ];

  for (const cam of cameras) {
    draw3DLine(cam.x, 0, cam.z, cam.x, cam.height, cam.z, "rgba(71,85,105,0.92)", 4);
    fillQuad(
      [
        projectPoint(cam.x - 18, cam.height, cam.z - 14),
        projectPoint(cam.x + 18, cam.height, cam.z - 14),
        projectPoint(cam.x + 18, cam.height + 16, cam.z + 14),
        projectPoint(cam.x - 18, cam.height + 16, cam.z + 14),
      ],
      "rgba(15,23,42,0.96)"
    );
    draw3DLine(
      cam.x,
      cam.height + 8,
      cam.z,
      cam.x + cam.yaw * 34,
      cam.height + 2,
      cam.z + cam.yaw * -20,
      "rgba(226,232,240,0.65)",
      2
    );
  }
}

function drawFloodlights() {
  const lightBanks = [
    { x: -FIELD.halfWidth - 300, z: -FIELD.halfDepth - 180 },
    { x: FIELD.halfWidth + 300, z: -FIELD.halfDepth - 180 },
    { x: -FIELD.halfWidth - 300, z: FIELD.halfDepth + 180 },
    { x: FIELD.halfWidth + 300, z: FIELD.halfDepth + 180 },
  ];
  for (const bank of lightBanks) {
    draw3DLine(bank.x, 0, bank.z, bank.x, 370, bank.z, "rgba(148,163,184,0.8)", 4);
    fillQuad(
      [
        projectPoint(bank.x - 50, 370, bank.z),
        projectPoint(bank.x + 50, 370, bank.z),
        projectPoint(bank.x + 50, 406, bank.z),
        projectPoint(bank.x - 50, 406, bank.z),
      ],
      "rgba(226,232,240,0.88)"
    );
  }
}

function drawStands() {
  drawStandSurface("north");
  drawStandSurface("south");
  drawStandSurface("west");
  drawStandSurface("east");
  drawStandBands("north");
  drawStandBands("south");
  drawStandBands("west");
  drawStandBands("east");
  drawCrowdFlags();
  drawBannerRibbon();
}

function carCorners(car, y, lengthValue, widthValue) {
  const forwardX = Math.cos(car.angle);
  const forwardZ = Math.sin(car.angle);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  return [
    projectPoint(car.x + forwardX * lengthValue - rightX * widthValue, y, car.z + forwardZ * lengthValue - rightZ * widthValue),
    projectPoint(car.x + forwardX * lengthValue + rightX * widthValue, y, car.z + forwardZ * lengthValue + rightZ * widthValue),
    projectPoint(car.x - forwardX * lengthValue + rightX * widthValue, y, car.z - forwardZ * lengthValue + rightZ * widthValue),
    projectPoint(car.x - forwardX * lengthValue - rightX * widthValue, y, car.z - forwardZ * lengthValue - rightZ * widthValue),
  ];
}

function drawSpoiler(car, spec) {
  if (!spec.spoiler) {
    return;
  }
  const left = projectPoint(car.x - Math.cos(car.angle) * (spec.bodyLength - 2) + Math.sin(car.angle) * 11, 18 + car.y, car.z - Math.sin(car.angle) * (spec.bodyLength - 2) - Math.cos(car.angle) * 11);
  const right = projectPoint(car.x - Math.cos(car.angle) * (spec.bodyLength - 2) - Math.sin(car.angle) * 11, 18 + car.y, car.z - Math.sin(car.angle) * (spec.bodyLength - 2) + Math.cos(car.angle) * 11);
  const leftTop = projectPoint(car.x - Math.cos(car.angle) * (spec.bodyLength + 7) + Math.sin(car.angle) * 11, 25 + car.y, car.z - Math.sin(car.angle) * (spec.bodyLength + 7) - Math.cos(car.angle) * 11);
  const rightTop = projectPoint(car.x - Math.cos(car.angle) * (spec.bodyLength + 7) - Math.sin(car.angle) * 11, 25 + car.y, car.z - Math.sin(car.angle) * (spec.bodyLength + 7) + Math.cos(car.angle) * 11);
  fillQuad([left, right, rightTop, leftTop], "rgba(15,23,42,0.85)");
}

function drawHeadlights(car, spec) {
  const offset = spec.bodyLength + 2;
  const left = projectPoint(car.x + Math.cos(car.angle) * offset + Math.sin(car.angle) * 8, 11 + car.y, car.z + Math.sin(car.angle) * offset - Math.cos(car.angle) * 8);
  const right = projectPoint(car.x + Math.cos(car.angle) * offset - Math.sin(car.angle) * 8, 11 + car.y, car.z + Math.sin(car.angle) * offset + Math.cos(car.angle) * 8);
  for (const point of [left, right]) {
    if (!point) {
      continue;
    }
    ctx.fillStyle = "rgba(255,255,210,0.95)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(1.6, point.scale * 2.8), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWheel(car, forwardOffset, sideOffset) {
  const forwardX = Math.cos(car.angle);
  const forwardZ = Math.sin(car.angle);
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const point = projectPoint(
    car.x + forwardX * forwardOffset + rightX * sideOffset,
    5 + car.y,
    car.z + forwardZ * forwardOffset + rightZ * sideOffset
  );
  if (!point) {
    return;
  }
  ctx.fillStyle = "#020617";
  ctx.beginPath();
  ctx.arc(point.x, point.y, Math.max(2.6, point.scale * 6.3), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = car.wheelColor;
  ctx.beginPath();
  ctx.arc(point.x, point.y, Math.max(1.2, point.scale * 2.7), 0, Math.PI * 2);
  ctx.fill();
}

function drawCarBody(car) {
  const spec = CAR_PRESETS[car.bodyStyle] || CAR_PRESETS.octane;
  const roofHeight = spec.cabinHeight + car.y;
  const bodyHeight = 8 + car.y;
  const base = carCorners(car, bodyHeight, spec.bodyLength, spec.bodyWidth);
  const roof = carCorners(car, roofHeight, spec.roofLength, spec.roofWidth);
  const hood = carCorners(car, 14 + car.y, spec.hoodLength, spec.hoodWidth);
  const windshield = carCorners(car, 16 + car.y, spec.roofLength - 4, spec.roofWidth);
  const nose = projectPoint(car.x + Math.cos(car.angle) * (spec.hoodLength + 1), 12 + car.y, car.z + Math.sin(car.angle) * (spec.hoodLength + 1));

  fillQuad([base[0], base[1], roof[1], roof[0]], shade(car.color, -10));
  fillQuad([base[1], base[2], roof[2], roof[1]], shade(car.color, -24));
  fillQuad([base[3], base[2], roof[2], roof[3]], shade(car.color, -6));
  fillQuad([base[0], base[3], roof[3], roof[0]], shade(car.color, -18));
  fillQuad([roof[0], roof[1], roof[2], roof[3]], shade(car.color, 16), "rgba(255,255,255,0.16)");
  fillQuad([hood[0], hood[1], windshield[1], windshield[0]], shade(car.color, 24), "rgba(255,255,255,0.12)");
  fillQuad([windshield[0], windshield[1], roof[1], roof[0]], "rgba(191,219,254,0.55)");

  drawSpoiler(car, spec);
  drawHeadlights(car, spec);

  drawWheel(car, -spec.bodyLength + 9, -spec.bodyWidth);
  drawWheel(car, -spec.bodyLength + 9, spec.bodyWidth);
  drawWheel(car, spec.bodyLength - 9, -spec.bodyWidth);
  drawWheel(car, spec.bodyLength - 9, spec.bodyWidth);

  if (nose) {
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, Math.max(2, nose.scale * 4), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCarFlame(car) {
  const flameY = 10 + car.y;
  const back = projectPoint(car.x - Math.cos(car.angle) * 30, flameY, car.z - Math.sin(car.angle) * 30);
  const far = projectPoint(car.x - Math.cos(car.angle) * 56, flameY, car.z - Math.sin(car.angle) * 56);
  const left = projectPoint(car.x - Math.cos(car.angle) * 30 - Math.sin(car.angle) * 8, flameY, car.z - Math.sin(car.angle) * 30 + Math.cos(car.angle) * 8);
  const right = projectPoint(car.x - Math.cos(car.angle) * 30 + Math.sin(car.angle) * 8, flameY, car.z - Math.sin(car.angle) * 30 - Math.cos(car.angle) * 8);

  if (!back || !far || !left || !right) {
    return;
  }

  const flame = ctx.createLinearGradient(back.x, back.y, far.x, far.y);
  flame.addColorStop(0, "rgba(255,255,255,0.95)");
  flame.addColorStop(0.4, hexToRgba(car.boostColor, 0.9));
  flame.addColorStop(1, hexToRgba(car.boostColor, 0));
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(far.x, far.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
}

function drawBoostMeter(car) {
  const point = projectPoint(car.x, 32 + car.y, car.z);
  if (!point) {
    return;
  }
  const width = 44 * point.scale * 2;
  const x = point.x - width / 2;
  const y = point.y - 28 * point.scale * 2;
  ctx.fillStyle = "rgba(15,23,42,0.52)";
  ctx.fillRect(x, y, width, 5);
  ctx.fillStyle = car.boostColor;
  ctx.fillRect(x, y, width * (car.boost / 100), 5);
}

function drawCar(car) {
  const shadow = projectPoint(car.x, 1, car.z);
  if (shadow) {
    ctx.fillStyle = "rgba(15,23,42,0.26)";
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, 30 * shadow.scale, 14 * shadow.scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawCarBody(car);
  if (car.isBoosting) {
    drawCarFlame(car);
  }
  if (state.screen === "game") {
    drawBoostMeter(car);
  }
}

function drawBallPattern(point, radius) {
  const spin = state.ball.spin;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(spin);
  ctx.strokeStyle = "rgba(51,65,85,0.75)";
  ctx.lineWidth = Math.max(1, radius * 0.1);
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * (0.8 - Math.abs(i) * 0.18), radius * 0.96, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.rotate(Math.PI / 2.35);
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * (0.8 - Math.abs(i) * 0.18), radius * 0.96, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall() {
  const shadow = projectPoint(state.ball.x, 1, state.ball.z);
  const point = projectPoint(state.ball.x, state.ball.y, state.ball.z);
  if (!point || !shadow) {
    return;
  }
  ctx.fillStyle = "rgba(15,23,42,0.28)";
  ctx.beginPath();
  ctx.ellipse(shadow.x, shadow.y, 22 * shadow.scale, 10 * shadow.scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const radius = BALL_RADIUS * point.scale * 1.8;
  const gradient = ctx.createRadialGradient(point.x - radius * 0.35, point.y - radius * 0.35, radius * 0.2, point.x, point.y, radius);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.6, "#dbe7f5");
  gradient.addColorStop(1, "#94a3b8");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  drawBallPattern(point, radius);
  ctx.strokeStyle = "rgba(71,85,105,0.9)";
  ctx.lineWidth = Math.max(1, point.scale * 1.5);
  ctx.stroke();
}

function drawBoostPad(pad) {
  const center = projectPoint(pad.x, 2, pad.z);
  if (!center) {
    return;
  }

  const radius = pad.radius * center.scale;
  const ring = ctx.createRadialGradient(center.x, center.y, radius * 0.3, center.x, center.y, radius * 2.2);
  if (pad.active) {
    ring.addColorStop(0, "rgba(255,255,255,0.95)");
    ring.addColorStop(0.3, pad.value === BIG_PAD_VALUE ? "rgba(250,204,21,0.95)" : "rgba(253,224,71,0.95)");
    ring.addColorStop(1, "rgba(249,115,22,0)");
  } else {
    ring.addColorStop(0, "rgba(148,163,184,0.18)");
    ring.addColorStop(1, "rgba(148,163,184,0)");
  }
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = pad.active ? (pad.value === BIG_PAD_VALUE ? "#fbbf24" : "#fde047") : "rgba(148,163,184,0.28)";
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticle(particle) {
  const point = projectPoint(particle.x, particle.y, particle.z);
  if (!point) {
    return;
  }
  const alpha = clamp(particle.life / 0.35, 0, 1);
  const radius = particle.radius * point.scale;
  const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 2.4);
  glow.addColorStop(0, `rgba(255,255,255,${alpha})`);
  glow.addColorStop(0.4, hexToRgba(particle.color || "#fbbf24", alpha * 0.9));
  glow.addColorStop(1, "rgba(249,115,22,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function makeRenderables() {
  const items = [];

  if (state.screen === "game") {
    for (const pad of state.boostPads) {
      items.push({ depth: worldDepth(pad.x, 2, pad.z), draw: () => drawBoostPad(pad) });
    }
    items.push({ depth: worldDepth(state.ball.x, state.ball.y, state.ball.z), draw: drawBall });
  } else if (state.screen === "menu") {
    const previewCar = makeCar({
      id: "preview",
      name: "Preview",
      team: "blue",
      controlled: false,
      x: 180,
      z: 40,
      angle: Math.PI * 0.92,
      color: state.custom.color,
      boostColor: state.custom.boostColor,
      wheelColor: state.custom.wheelColor,
      bodyStyle: state.custom.bodyStyle,
      boost: 100,
    });
    items.push({ depth: worldDepth(previewCar.x, 20, previewCar.z), draw: () => drawCar(previewCar) });

    const menuBall = {
      x: -60,
      y: BALL_RADIUS,
      z: -40,
      spin: state.menuOrbit * 18,
    };
    items.push({
      depth: worldDepth(menuBall.x, menuBall.y, menuBall.z),
      draw: () => {
        const originalBall = { ...state.ball };
        Object.assign(state.ball, menuBall);
        drawBall();
        Object.assign(state.ball, originalBall);
      },
    });
  }

  for (const particle of state.particles) {
    items.push({ depth: worldDepth(particle.x, particle.y, particle.z), draw: () => drawParticle(particle) });
  }

  const visibleCars = state.screen === "result" ? state.resultCars : state.cars;
  for (const car of visibleCars) {
    if (state.screen === "menu") {
      break;
    }
    items.push({ depth: worldDepth(car.x, 20 + car.y, car.z), draw: () => drawCar(car) });
  }

  return items.filter((item) => item.depth > 0).sort((a, b) => b.depth - a.depth);
}

function drawOverlay() {
  if (state.replayTimer > 0 && state.goalFreezeTimer <= 0 && state.screen === "game") {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(127, 29, 29, 0.82)";
    ctx.fillRect(22, 22, 110, 34);
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 20px Trebuchet MS";
    ctx.fillText("REPLAY", 36, 45);
  }

  if (state.ballCam && state.replayTimer <= 0 && state.screen === "game") {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(127, 29, 29, 0.82)";
    ctx.fillRect(22, 64, 140, 34);
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 20px Trebuchet MS";
    ctx.fillText("BALL CAM", 36, 87);
  }

  if (state.messageTimer > 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(8,17,31,0.72)";
    ctx.fillRect(canvas.width / 2 - 220, canvas.height - 56, 440, 34);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "18px Trebuchet MS";
    ctx.fillText(state.message, canvas.width / 2, canvas.height - 33);
  }

  if (state.bannerTimer > 0 && state.bannerText) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(127, 29, 29, 0.72)";
    ctx.fillRect(canvas.width / 2 - 170, 120, 340, 92);
    ctx.fillStyle = "#fb923c";
    ctx.font = "bold 56px Impact";
    ctx.fillText(state.bannerText, canvas.width / 2, 183);
  }
}

function syncHud() {
  playerScoreEl.textContent = String(state.scores.blue);
  aiScoreEl.textContent = String(state.scores.orange);
  const playerCar = getPlayerCar();
  boostValueEl.textContent = String(hasInfiniteBoost(playerCar || {}) ? 100 : Math.round(playerCar ? playerCar.boost : 100));
  const config = MODES[state.mode];
  blueLabelEl.textContent = config.blueLabel;
  orangeLabelEl.textContent = config.orangeLabel;
  matchLabelEl.textContent = config.label;
  matchStateEl.textContent = state.mode === "freeplay" ? "Unlimited" : formatClock(state.matchTime);
}

function updateCustomizationPreview() {
  const preset = CAR_PRESETS[state.custom.bodyStyle];
  previewLabelEl.textContent = `${preset.label} with ${state.custom.color} bodywork, ${state.custom.boostColor} boost, ${state.custom.wheelColor} wheels, in ${state.timeOfDay} lighting.`;
  bodySwatchEl.style.background = state.custom.color;
  boostSwatchEl.style.background = state.custom.boostColor;
  wheelSwatchEl.style.background = state.custom.wheelColor;

  for (const button of shapeGridEl.querySelectorAll("[data-shape]")) {
    button.classList.toggle("active", button.dataset.shape === state.custom.bodyStyle);
  }
  for (const button of timeGridEl.querySelectorAll("[data-time]")) {
    button.classList.toggle("active", button.dataset.time === state.timeOfDay);
  }
}


function updateGame(dt) {
  state.messageTimer = Math.max(0, state.messageTimer - 1);
  state.bannerTimer = Math.max(0, state.bannerTimer - dt);
  if (state.bannerTimer === 0 && state.kickoffTimer <= 0) {
    state.bannerText = "";
  }

  if (state.replayTimer > 0) {
    if (state.goalFreezeTimer > 0) {
      state.goalFreezeTimer = Math.max(0, state.goalFreezeTimer - dt);
      updateParticles(dt);
    } else {
      state.replayTimer = Math.max(0, state.replayTimer - dt);
      applyReplayFrame(state.replayFrames[Math.floor(state.replayCursor)]);
      if (state.replayGoalSeenTimer >= 0) {
        state.replayGoalSeenTimer += dt;
      } else if (state.replayCursor >= state.replayGoalFrame) {
        state.replayGoalSeenTimer = 0;
      }
      const replayContactDelta = Math.abs(state.replayCursor - state.replayContactFrame);
      const replaySpeed = replayContactDelta < 20 ? 0.38 : replayContactDelta < 48 ? 0.65 : 1;
      state.replayCursor = Math.min(state.replayFrames.length - 1, state.replayCursor + replaySpeed);
      if (state.replayTimer === 0) {
        resetAfterGoal();
      }
    }
    return;
  }

  if (state.mode !== "freeplay" && state.kickoffTimer > 0) {
    state.kickoffTimer = Math.max(0, state.kickoffTimer - dt);
    if (state.kickoffTimer > 3) {
      state.bannerText = "3";
      return;
    } else if (state.kickoffTimer > 2) {
      state.bannerText = "2";
      return;
    } else if (state.kickoffTimer > 1) {
      state.bannerText = "1";
      return;
    } else if (state.kickoffTimer > 0) {
      state.bannerText = "GO!";
    } else {
      state.bannerText = "";
      state.bannerTimer = 0;
    }
  }

  if (state.mode !== "freeplay") {
    const previousTime = state.matchTime;
    state.matchTime = Math.max(0, state.matchTime - dt);
    if (!state.warningFlags.sixty && previousTime > 60 && state.matchTime <= 60) {
      state.warningFlags.sixty = true;
      setBanner("1:00", 1.35);
    }
    if (!state.warningFlags.thirty && previousTime > 30 && state.matchTime <= 30) {
      state.warningFlags.thirty = true;
      setBanner("0:30", 1.35);
    }
    for (let seconds = 10; seconds >= 1; seconds -= 1) {
      if (!state.warningFlags.countdown.has(seconds) && previousTime > seconds && state.matchTime <= seconds) {
        state.warningFlags.countdown.add(seconds);
        setBanner(String(seconds), 0.95);
        break;
      }
    }
    if (previousTime > 0 && state.matchTime === 0) {
      finishMatch();
      return;
    }
  }

  updatePlayer(dt);
  updateAIs(dt);
  updateBoostPads(dt);

  for (const car of state.cars) {
    const touchId = collideCarWithBall(car);
    if (touchId) {
      state.lastTouchId = touchId;
      state.replayTouchCursor = Math.max(0, state.replayFrames.length - 1);
    }
  }

  updateBall(dt);
  updateParticles(dt);
  snapshotFrame();
}

function frame(time) {
  const dt = Math.min(0.02, (time - state.lastTime) / 1000 || 0.016);
  state.lastTime = time;

  if (state.screen === "game") {
    updateGame(dt);
  } else {
    state.messageTimer = Math.max(0, state.messageTimer - 1);
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    updateParticles(dt);
  }

  updateCamera();
  drawBackground();
  drawArena();
  for (const item of makeRenderables()) {
    item.draw();
  }
  drawOverlay();
  syncHud();

  requestAnimationFrame(frame);
}

shapeGridEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-shape]");
  if (!button) {
    return;
  }
  state.custom.bodyStyle = button.dataset.shape;
  updateCustomizationPreview();
});

timeGridEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-time]");
  if (!button) {
    return;
  }
  state.timeOfDay = button.dataset.time;
  updateCustomizationPreview();
});

carColorInput.addEventListener("input", () => {
  state.custom.color = carColorInput.value;
  updateCustomizationPreview();
});

boostColorInput.addEventListener("input", () => {
  state.custom.boostColor = boostColorInput.value;
  updateCustomizationPreview();
});

wheelColorInput.addEventListener("input", () => {
  state.custom.wheelColor = wheelColorInput.value;
  updateCustomizationPreview();
});

for (const button of document.querySelectorAll(".play-button")) {
  if (button.dataset.mode) {
    button.addEventListener("click", () => {
      setupMatch(button.dataset.mode);
      setScreen("game");
    });
  }
}

playAgainButton.addEventListener("click", () => {
  setupMatch(state.mode);
  setScreen("game");
});

garageButton.addEventListener("click", () => {
  setScreen("menu");
  state.message = "Back in the garage";
  state.messageTimer = 120;
});

menuReturnButton.addEventListener("click", () => {
  setScreen("menu");
  state.message = "Back in the garage";
  state.messageTimer = 120;
});

window.addEventListener("keydown", (event) => {
  if (state.screen === "menu" && event.key === "Escape") {
    return;
  }

  if (event.key === "Escape") {
    setScreen("menu");
    state.message = "Back in the garage";
    state.messageTimer = 120;
    return;
  }

  if (event.key === "r" || event.key === "R") {
    if (state.screen === "game") {
      setupMatch(state.mode);
    }
    return;
  }

  if ((event.key === "b" || event.key === "B") && !event.repeat && state.screen === "game") {
    state.ballCam = !state.ballCam;
    state.message = state.ballCam ? "Ball cam on" : "Ball cam off";
    state.messageTimer = 75;
    return;
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(event.key)) {
    event.preventDefault();
  }

  keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

updateCustomizationPreview();
setupMatch("duel");
setScreen("menu");
requestAnimationFrame(frame);
