import { state, setupMatch, snapshotFrame, applyReplayFrame, resetAfterGoal, triggerGoalSequence, finishMatch } from "./state.js";
import * as physics from "./physics.js";
import * as render from "./render.js";
import * as ui from "./ui.js";
import * as input from "./input.js";
import { MODES } from "./constants.js";
import { kickoffSlots } from "./entities.js";

const canvas = document.getElementById("game");
render.initCanvas(canvas);

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function updateGame(dt) {
  state.messageTimer = Math.max(0, state.messageTimer - 1);
  state.bannerTimer = Math.max(0, state.bannerTimer - dt);
  if (state.bannerTimer === 0 && state.kickoffTimer <= 0) {
    state.bannerText = "";
  }

  if (state.replayTimer > 0) {
    if (state.goalFreezeTimer > 0) {
      state.goalFreezeTimer = Math.max(0, state.goalFreezeTimer - dt);
      physics.updateParticles(dt);
    } else {
      state.replayTimer = Math.max(0, state.replayTimer - dt);
      applyReplayFrame(state.replayFrames[Math.floor(state.replayCursor)]);
      if (state.replayGoalSeenTimer >= 0) {
        state.replayGoalSeenTimer += dt;
      } else if (state.replayCursor >= state.replayGoalFrame) {
        state.replayGoalSeenTimer = 0;
      }
      const replayContactDelta = Math.abs(state.replayCursor - state.replayContactFrame);
      const baseSpeed = replayContactDelta < 20 ? 0.38 : replayContactDelta < 48 ? 0.65 : 1;
      const SPEED_MULTIPLIER = 3;
      // only apply the boost after the contact zone has passed; this ensures the
      // camera zoom/slow‑mo is visible for the intended number of frames.
      const inContactZone = replayContactDelta < 48;
      const delta = baseSpeed * (inContactZone ? 1 : SPEED_MULTIPLIER);
      state.replayCursor = Math.min(state.replayFrames.length - 1, state.replayCursor + delta);
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
      ui.setBanner("1:00", 1.35);
    }
    if (!state.warningFlags.thirty && previousTime > 30 && state.matchTime <= 30) {
      state.warningFlags.thirty = true;
      ui.setBanner("0:30", 1.35);
    }
    for (let seconds = 10; seconds >= 1; seconds -= 1) {
      if (!state.warningFlags.countdown.has(seconds) && previousTime > seconds && state.matchTime <= seconds) {
        state.warningFlags.countdown.add(seconds);
        ui.setBanner(String(seconds), 0.95);
        break;
      }
    }
    if (previousTime > 0 && state.matchTime === 0) {
      finishMatch();
      return;
    }
  }

  physics.updatePlayer(dt);
  physics.updateAIs(dt);
  physics.updateBoostPads(dt);

  for (const car of state.cars) {
    const touchId = physics.collideCarWithBall(car);
    if (touchId) {
      state.lastTouchId = touchId;
      // record the index of the *next* snapshotFrame call; we want
      // replayContactFrame to point at the frame where the contact
      // actually occurred, not the one immediately before it.
      state.replayTouchCursor = state.replayFrames.length;
    }
  }

  const scoredTeam = physics.updateBall(dt);
  // always snapshot after the ball update so the final position (including a
  // goal) is recorded; previously we returned early and omitted the last
  // frame, which is why the replay never showed the ball inside the net.
  snapshotFrame();
  if (scoredTeam) {
    triggerGoalSequence(scoredTeam, state.lastTouchId || `${scoredTeam}-0`);
    return;
  }

  physics.updateParticles(dt);
  snapshotFrame();
}

// fixed‑time physics loop with interpolation for smoother rendering
const FIXED_STEP = 1 / 60; // 60 Hz simulation target
let accumulator = 0;

function frame(time) {
  // compute elapsed seconds since last frame
  let dt = (time - state.lastTime) / 1000 || FIXED_STEP;
  // cap to avoid spiral of death when resuming from background
  if (dt > 0.1) dt = 0.1;
  state.lastTime = time;

  accumulator += dt;

  // perform as many fixed‑size updates as needed
  while (accumulator >= FIXED_STEP) {
    // copy state for interpolation
    for (const car of state.cars) {
      car.prevX = car.x;
      car.prevY = car.y;
      car.prevZ = car.z;
      car.prevAngle = car.angle;
    }
    state.ball.prevX = state.ball.x;
    state.ball.prevY = state.ball.y;
    state.ball.prevZ = state.ball.z;
    state.ball.prevSpin = state.ball.spin;

    if (state.screen === "game") {
      updateGame(FIXED_STEP);
    } else {
      state.messageTimer = Math.max(0, state.messageTimer - 1);
      state.bannerTimer = Math.max(0, state.bannerTimer - FIXED_STEP);
      physics.updateParticles(FIXED_STEP);
    }

    accumulator -= FIXED_STEP;
  }

  // render with interpolation factor (0..1)
  state.renderAlpha = accumulator / FIXED_STEP;

  render.updateCamera();
  render.updateBasis();
  render.drawBackground();
  render.drawArena();
  for (const item of render.makeRenderables()) {
    item.draw();
  }
  render.drawOverlay();
  ui.syncHud();

  requestAnimationFrame(frame);
}

// start a new match and show HUD
function startMatch(mode) {
  setupMatch(mode);
  ui.setScreen("game");
}

input.initInputListeners();
ui.initUIListeners(startMatch);
ui.updateCustomizationPreview();
startMatch("duel");
ui.setScreen("menu");
requestAnimationFrame(frame);
