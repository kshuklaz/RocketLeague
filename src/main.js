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
      applyReplayFrame(state.replayFrames[Math.floor(state.replayCursor)]);

      // once the cursor reaches the goal frame we start a short timer so that
      // the camera can execute its zoom/out animation; the replay is not allowed
      // to finish until *after* this timer expires.  this guarantees the ball
      // will always make it into the net, no matter how slowly we advance the
      // cursor in slow‑motion.
      if (state.replayCursor >= state.replayGoalFrame) {
        if (state.replayGoalSeenTimer >= 0) {
          state.replayGoalSeenTimer += dt;
        } else {
          state.replayGoalSeenTimer = 0;
        }
      }

      const replayContactDelta = Math.abs(state.replayCursor - state.replayContactFrame);
      const baseSpeed = replayContactDelta < 20 ? 0.3 : replayContactDelta < 48 ? 0.6 : 1;
      const delta = baseSpeed;
      state.replayCursor = Math.min(state.replayFrames.length - 1, state.replayCursor + delta);

      // only decrement the timer after we've seen the goal frame; before that
      // the replayTimer simply holds our post‑goal hang time.
      if (state.replayGoalSeenTimer >= 0) {
        state.replayTimer = Math.max(0, state.replayTimer - dt);
      }

      // if the post‑goal buffer has elapsed and we've already passed the goal
      // we can safely return to normal gameplay.
      if (state.replayTimer === 0 && state.replayGoalSeenTimer >= 0) {
        resetAfterGoal();
      }
    }
    return;
  }

  if (state.mode !== "freeplay" && state.kickoffTimer > 0) {
    state.kickoffTimer = Math.max(0, state.kickoffTimer - dt);
    // use the UI helper so that the banner timer is refreshed each time we
    // change the text. this prevents situations where the timer has already
    // expired mid‑countdown (which could make the numbers disappear), and
    // also keeps our rendering logic later simpler.
    if (state.kickoffTimer > 3) {
      ui.setBanner("3", 0.9);
      return;
    } else if (state.kickoffTimer > 2) {
      ui.setBanner("2", 0.9);
      return;
    } else if (state.kickoffTimer > 1) {
      ui.setBanner("1", 0.9);
      return;
    } else if (state.kickoffTimer > 0) {
      ui.setBanner("GO!", 0.9);
    } else {
      // safely clear banner when kickoff is complete
      ui.setBanner("", 0);
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
      // elapsed match time – compute winner and show result overlay
      finishMatch();
      // sync the result panel elements and transition the screen
      ui.resultTitleEl.textContent = state.resultTitle;
      ui.resultSubtitleEl.textContent = state.resultSubtitle;
      state.message = state.resultTitle;
      state.messageTimer = 150;
      ui.setScreen("result");
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
  // menu-specific fix: the camera sometimes dips beneath the floor during
  // the crowd flyby shots, which would make the floor occlude the stands
  // in a painter’s‑algorithm renderer.  re‑draw the stands (and then the
  // field boundary lines) last so the crowd remains visible but the white
  // edge markings stay on top of the bleachers.
  if (state.screen === "menu") {
    render.drawStands();
    render.drawFieldLines();
  }
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
