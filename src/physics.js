import { state } from "./state.js";
import { FIELD, CAR_RADIUS, BALL_RADIUS, GRAVITY, JUMP_VELOCITY, DOUBLE_JUMP_VELOCITY } from "./constants.js";
import { clamp, lerp, length, lengthSquared, normalizeAngle } from "./utils.js";
import { getRampHeightAt } from "./entities.js";
import { keys } from "./input.js";

export function updateCar(car, throttle, steering, useBoost, jumpPressed, dt) {
  // local aliases for frequently used Math helpers
  const { cos, sin, sqrt, max } = Math;

  const turnRate = 4.1;
  const driveAccel = 900;
  const reverseAccel = 460;
  const onGround = car.y > 0;
  const baseDrag = onGround ? 0.9962 : 0.9935;
  const lateralGrip = onGround ? 0.965 : 0.9;
  const boosting = useBoost && car.boost > 0;
  const accel = boosting ? 1540 : throttle >= 0 ? driveAccel : reverseAccel;
  const maxSpeed = boosting ? 900 : 660;

  car.angle = normalizeAngle(car.angle + steering * turnRate * dt * (onGround ? 0.82 : 1));
  car.pitch = lerp(car.pitch, clamp(-throttle * 0.18 + car.vy * 0.0008, -0.35, 0.35), 0.12);

  // cache sin/cos of angle to avoid repeated calls
  const cosA = cos(car.angle);
  const sinA = sin(car.angle);
  const forwardX = cosA;
  const forwardZ = sinA;
  const rightX = -forwardZ;
  const rightZ = forwardX;

  if (onGround) {
    const factor = throttle * 360 * dt;
    car.vx += forwardX * factor;
    car.vz += forwardZ * factor;
  } else {
    const factor = throttle * accel * dt;
    car.vx += forwardX * factor;
    car.vz += forwardZ * factor;
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
      car.boost = max(0, car.boost - 30 * dt);
    }
    car.vx += forwardX * 340 * dt;
    car.vz += forwardZ * 340 * dt;
    if (onGround) {
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

  // cap speed using squared comparison to avoid sqrt when unnecessary
  const speedSq = car.vx * car.vx + car.vz * car.vz;
  const maxSpeedSq = maxSpeed * maxSpeed;
  if (speedSq > maxSpeedSq) {
    const factor = maxSpeed / sqrt(speedSq);
    car.vx *= factor;
    car.vz *= factor;
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

export function updatePlayer(dt) {
  const player = state.cars.find((c) => c.controlled) || null;
  if (!player) {
    return;
  }

  const steering = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) -
    (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
  const throttle = (keys.has("ArrowUp") || keys.has("w") ? 1 : 0) -
    (keys.has("ArrowDown") || keys.has("s") ? 1 : 0);
  const useBoost = keys.has("Shift");
  const jumpPressed = keys.has("j") || keys.has(" ");
  updateCar(player, throttle, steering, useBoost, jumpPressed, dt);
}

// other physics helpers (pad searching, collisions, ball updates)
export function hasInfiniteBoost(car) {
  return state.mode === "freeplay" && car.controlled;
}

export function findBestBoostPad(car) {
  let bestPad = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const pad of state.boostPads) {
    if (!pad.active) continue;
    const dx = pad.x - car.x;
    const dz = pad.z - car.z;
    const dist = Math.sqrt(dx * dx + dz * dz); // one sqrt per pad
    const score = dist - pad.value * 1.8;
    if (score < bestScore) {
      bestScore = score;
      bestPad = pad;
    }
  }
  return bestPad;
}

export function teamCars(team) {
  return state.cars.filter((car) => car.team === team);
}

export function nearestAttacker(team) {
  const members = teamCars(team);
  let best = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (const car of members) {
    const dx = state.ball.x - car.x;
    const dz = state.ball.z - car.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistanceSq) {
      bestDistanceSq = distSq;
      best = car;
    }
  }
  return best;
}

export function updateAIForCar(car, dt) {
  const { abs, atan2, sqrt } = Math;
  const attackSide = car.team === "orange" ? -1 : 1;
  const ownGoalX = car.team === "orange" ? FIELD.halfWidth : -FIELD.halfWidth;
  const enemyGoalX = car.team === "orange" ? -FIELD.halfWidth : FIELD.halfWidth;
  const targetPad = findBestBoostPad(car);
  const predictedBallX = clamp(state.ball.x + state.ball.vx * 0.44, -FIELD.halfWidth + 140, FIELD.halfWidth - 140);
  const predictedBallZ = clamp(state.ball.z + state.ball.vz * 0.44, -FIELD.halfDepth + 140, FIELD.halfDepth - 140);
  const ballToGoalX = enemyGoalX - predictedBallX;
  const ballToGoalZ = -predictedBallZ;
  const ballToGoalLenSq = ballToGoalX * ballToGoalX + ballToGoalZ * ballToGoalZ;
  const invBallToGoalLen = 1 / (sqrt(ballToGoalLenSq) || 1);
  const attackDirX = ballToGoalX * invBallToGoalLen;
  const attackDirZ = ballToGoalZ * invBallToGoalLen;
  const setupDistance = state.ball.y > 55 ? 160 : 118;
  const strikeX = predictedBallX - attackDirX * setupDistance;
  const strikeZ = predictedBallZ - attackDirZ * setupDistance;
  const defendingCar = nearestAttacker(car.team) !== car;
  const homeX = ownGoalX + attackSide * 420;
  const homeZ = clamp(predictedBallZ * 0.45, -620, 620);
  const shouldShadow = defendingCar && abs(predictedBallX - ownGoalX) < 1240;

  let usePad = false;
  if (car.boost < 20 && targetPad) {
    const dxp = targetPad.x - car.x;
    const dzp = targetPad.z - car.z;
    usePad = dxp * dxp + dzp * dzp < 900 * 900;
  }

  let targetX = strikeX;
  let targetZ = strikeZ;

  if (usePad) {
    targetX = targetPad.x;
    targetZ = targetPad.z;
  } else if (shouldShadow) {
    targetX = homeX;
    targetZ = homeZ;
  }

  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const desiredAngle = atan2(dz, dx);
  const angleDelta = normalizeAngle(desiredAngle - car.angle);
  const steering = clamp(angleDelta * 2.2, -1, 1);
  const throttle = abs(angleDelta) > 2.2 ? -0.4 : abs(angleDelta) > 1.15 ? 0.56 : 1;

  const distSq = dx * dx + dz * dz;
  const shouldBoost = !usePad && distSq > 260 * 260 && car.boost > 8 && abs(angleDelta) < 0.5;

  const dxBall = state.ball.x - car.x;
  const dzBall = state.ball.z - car.z;
  const jumpPressed =
    state.ball.y > 34 &&
    state.ball.y < 165 &&
    dxBall * dxBall + dzBall * dzBall < 84 * 84 &&
    abs(angleDelta) < 0.5 &&
    car.y <= getRampHeightAt(car.x, car.z, true) + 0.001;

  updateCar(car, throttle, steering, shouldBoost, jumpPressed, dt);
}

export function updateAIs(dt) {
  for (const car of state.cars) {
    if (!car.controlled) {
      updateAIForCar(car, dt);
    }
  }
}

export function collectBoostPad(car, pad, name) {
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

export function updateBoostPads(dt) {
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

export function collideCarWithBall(car) {
  const dx = state.ball.x - car.x;
  const dy = state.ball.y - (car.y + 12);
  const dz = state.ball.z - car.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const minDist = CAR_RADIUS + BALL_RADIUS + 2;
  const minSq = minDist * minDist;

  if (distSq === 0 || distSq >= minSq) {
    return null;
  }

  const dist = Math.sqrt(distSq);
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

export function updateBall(dt) {
  const ball = state.ball;
  const wasGrounded = ball.y <= getRampHeightAt(ball.x, ball.z, true) + BALL_RADIUS + 1;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.vx *= wasGrounded ? 0.9988 : 0.9992;
  ball.vy -= GRAVITY * dt;
  ball.vz *= wasGrounded ? 0.9988 : 0.9992;
  // avoid Math.hypot overhead
  ball.spin += Math.sqrt(ball.vx * ball.vx + ball.vz * ball.vz) * dt * 0.02;

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
    return "orange";
  }
  if (ball.x - BALL_RADIUS > FIELD.halfWidth && insideGoalLane && insideGoalHeight) {
    state.scores.blue += 1;
    return "blue";
  }

  if (ball.z - BALL_RADIUS <= -FIELD.halfDepth || ball.z + BALL_RADIUS >= FIELD.halfDepth) {
    ball.z = clamp(ball.z, -FIELD.halfDepth + BALL_RADIUS, FIELD.halfDepth - BALL_RADIUS);
    ball.vz *= -0.92;
    ball.vx *= 0.992;
  }

  if (
    !insideGoalLane &&
    (ball.x - BALL_RADIUS <= -FIELD.halfWidth || ball.x + BALL_RADIUS >= FIELD.halfWidth)
  ) {
    ball.x = clamp(ball.x, -FIELD.halfWidth + BALL_RADIUS, FIELD.halfWidth - BALL_RADIUS);
    ball.vx *= -0.92;
    ball.vz *= 0.992;
  }
}

export function spawnBoostParticles(car) {
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

export function updateParticles(dt) {
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
