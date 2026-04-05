import { FIELD, BALL_RADIUS, MATCH_LENGTH, MODES } from "./constants.js";
import { createBoostPads, makeCar, kickoffSlots, createTeamCar } from "./entities.js";
import { clamp, lerp, length } from "./utils.js";
import { playSound } from "./audio.js";

// this object holds the entire mutable game state; other modules import it by reference
export const state = {
  screen: "menu",
  mode: "duel",
  scores: { blue: 0, orange: 0 },
  custom: {
    bodyStyle: "octane",
    color: "#38bdf8",
    boostColor: "#f59e0b",
    wheelColor: "#94a3b8",
  },
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
  cameraShake: 0,
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
  renderAlpha: 0,               // interpolation factor for rendering
};

export function getPlayerCar() {
  return state.cars.find((car) => car.controlled) || null;
}

export function getCarById(carId) {
  return state.cars.find((car) => car.id === carId) || null;
}

// resets that manipulate state --------------------------------------------------
export function resetBall() {
  state.ball.x = 0;
  state.ball.y = BALL_RADIUS;
  state.ball.z = 0;
  state.ball.vx = (Math.random() - 0.5) * 90;
  state.ball.vy = 0;
  state.ball.vz = (Math.random() - 0.5) * 70;
  state.ball.spin = 0;
  state.lastTouchId = null;
}

export function resetBoostPads() {
  state.boostPads = createBoostPads();
}

export function resetCarsToKickoff(kickoffSlots) {
  const blueCars = state.cars.filter((car) => car.team === "blue");
  const orangeCars = state.cars.filter((car) => car.team === "orange");

  for (let i = 0; i < blueCars.length; i += 1) {
    const slot = kickoffSlots.blue[i];
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
      isSuperSonic: false,
      boostHeldTime: 0,
      pitch: 0,
      jumpsUsed: 0,
      jumpHeld: false,
    });
  }

  for (let i = 0; i < orangeCars.length; i += 1) {
    const slot = kickoffSlots.orange[i];
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
      isSuperSonic: false,
      boostHeldTime: 0,
      pitch: 0,
      jumpsUsed: 0,
      jumpHeld: false,
    });
  }
}

export function setupMatch(mode) {
  state.mode = mode;
  state.scores.blue = 0;
  state.scores.orange = 0;
  state.cars = [];
  state.resultCars = [];

  state.lastTouchId = null;
  const config = MODES[mode];

  // create blue team cars
  for (let i = 0; i < config.blue; i += 1) {
    state.cars.push(createTeamCar("blue", i, i === 0));
  }
  // create orange team cars
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

export function snapshotFrame() {
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
    ball: { ...state.ball },
  });

  if (state.replayFrames.length > 420) {
    state.replayFrames.shift();
    state.replayTouchCursor = Math.max(0, state.replayTouchCursor - 1);
  }
}

export function spawnGoalExplosion(x, y, z, scoredByTeam) {
  const color = scoredByTeam === "blue" ? "#38bdf8" : "#fb7185";
  const baseY = Math.max(y, 24);

  // Main spark burst — high-speed particles in all directions
  for (let i = 0; i < 340; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 240 + Math.random() * 680;
    state.particles.push({
      x, y: baseY, z,
      vx: Math.cos(angle) * speed,
      vy: -200 + Math.random() * 520,
      vz: Math.sin(angle) * speed,
      life: 0.9 + Math.random() * 1.5,
      radius: 14 + Math.random() * 26,
      color,
    });
  }

  // Core fireballs — large glowing orbs that billow outward from the centre
  for (let i = 0; i < 14; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 200;
    state.particles.push({
      x, y: baseY, z,
      vx: Math.cos(angle) * speed,
      vy: 40 + Math.random() * 160,
      vz: Math.sin(angle) * speed,
      life: 0.6 + Math.random() * 0.5,
      radius: 38 + Math.random() * 28,
      color,
    });
  }

  // Upward column — concentrated vertical streak for height
  for (let i = 0; i < 30; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 120;
    state.particles.push({
      x, y: baseY, z,
      vx: Math.cos(angle) * speed,
      vy: 380 + Math.random() * 420,
      vz: Math.sin(angle) * speed,
      life: 1.0 + Math.random() * 0.8,
      radius: 18 + Math.random() * 18,
      color,
    });
  }

  // Blast force on nearby cars
  const blastRadius = 680;
  for (const car of state.cars) {
    const dx = car.x - x;
    const dz = car.z - z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    if (dist > blastRadius) continue;
    const force = (1 - dist / blastRadius) * 1100;
    car.vx += (dx / dist) * force;
    car.vz += (dz / dist) * force;
    car.vy += 200 + force * 0.1;
  }
}

export function triggerGoalSequence(scoredByTeam, scorerId) {
  state.replayGoal = scoredByTeam;
  state.replayScorerId = scorerId;
  // Extended freeze so the live explosion has time to play out before the replay starts.
  state.goalFreezeTimer = 1.5;
  state.replayContactFrame = Math.min(state.replayTouchCursor, Math.max(0, state.replayFrames.length - 1));
  state.replayGoalFrame = Math.max(0, state.replayFrames.length - 1);
  state.replayGoalSeenTimer = -1;
  state.replayCursor = Math.max(0, state.replayContactFrame - 120);
  // Buffer after the replay cursor hits the goal frame — long enough for
  // the centre-stadium camera to finish panning AND hold the view for a beat.
  state.replayTimer = 4.0;
  state.message = `${scoredByTeam === "blue" ? "Blue" : "Orange"} scored`;
  state.messageTimer = 180;
  // Clear pre-existing particles then immediately spawn the live goal explosion
  // so it fires the instant the ball enters the net during actual gameplay.
  state.particles = [];
  const explosionX = scoredByTeam === "blue"
    ? FIELD.halfWidth + 40
    : -FIELD.halfWidth - 40;
  spawnGoalExplosion(explosionX, state.ball.y, state.ball.z, scoredByTeam);
  // Camera shake proportional to player’s distance from the goal.
  const player = getPlayerCar() || state.cars[0];
  if (player) {
    const dx = explosionX - player.x;
    const dz = explosionX > 0 ? -player.z : -player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    state.cameraShake = 3 + Math.max(0, 1 - dist / 5000) * 25;
  }
  // Crowd cheer
  playSound("crowd_cheer", { volume: 0.75 });
}

export function applyReplayFrame(frame) {
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

export function applyReplayFrameLerped(frameA, frameB, t) {
  if (!frameA) return;
  if (!frameB) frameB = frameA;

  for (const savedA of frameA.cars) {
    const savedB = frameB.cars.find((c) => c.id === savedA.id) || savedA;
    const live = getCarById(savedA.id);
    if (live) {
      live.x = lerp(savedA.x, savedB.x, t);
      live.y = lerp(savedA.y, savedB.y, t);
      live.z = lerp(savedA.z, savedB.z, t);
      live.vx = lerp(savedA.vx, savedB.vx, t);
      live.vy = lerp(savedA.vy, savedB.vy, t);
      live.vz = lerp(savedA.vz, savedB.vz, t);
      // shortest-path angle interpolation to avoid spin artifacts
      let angleDiff = savedB.angle - savedA.angle;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      live.angle = savedA.angle + angleDiff * t;
      live.boost = lerp(savedA.boost, savedB.boost, t);
      live.isBoosting = savedA.isBoosting;
      live.bodyStyle = savedA.bodyStyle;
      live.color = savedA.color;
      live.boostColor = savedA.boostColor;
      live.wheelColor = savedA.wheelColor;
    }
  }

  state.ball.x = lerp(frameA.ball.x, frameB.ball.x, t);
  state.ball.y = lerp(frameA.ball.y, frameB.ball.y, t);
  state.ball.z = lerp(frameA.ball.z, frameB.ball.z, t);
  state.ball.vx = lerp(frameA.ball.vx, frameB.ball.vx, t);
  state.ball.vy = lerp(frameA.ball.vy, frameB.ball.vy, t);
  state.ball.vz = lerp(frameA.ball.vz, frameB.ball.vz, t);
  state.ball.spin = lerp(frameA.ball.spin, frameB.ball.spin, t);
}

export function resetAfterGoal() {
  const config = MODES[state.mode];
  const slots = {
    blue: kickoffSlots("blue", config.blue),
    orange: kickoffSlots("orange", config.orange),
  };
  resetCarsToKickoff(slots);
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
  state.cameraShake = 0;
  state.kickoffTimer = state.mode === "freeplay" ? 0 : 4;
  state.lastTouchId = null;
}

// simpler reset used only by freeplay respawn; avoids changing car list.
export function respawnFreeplay() {
  resetBall();
  resetBoostPads();
  state.particles = [];
  // clear any active replay data
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
  state.cameraShake = 0;
  // do not touch kickoffTimer, matchTime, scores, or car list
}

export function buildResultCars(team) {
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

export function finishMatch() {
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
}

export function hasInfiniteBoost(car) {
  return state.mode === "freeplay" && car.controlled;
}
