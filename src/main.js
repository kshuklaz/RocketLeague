import { state, setupMatch, snapshotFrame, applyReplayFrame, applyReplayFrameLerped, resetAfterGoal, triggerGoalSequence, finishMatch, spawnGoalExplosion, getPlayerCar } from "./state.js";
import * as physics from "./physics.js";
import * as render from "./render.js";
import * as ui from "./ui.js";
import * as input from "./input.js";
import { MODES, FIELD } from "./constants.js";
import { kickoffSlots } from "./entities.js";
import { initAudio, playSound } from "./audio.js";

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
      const cursorFloor = Math.floor(state.replayCursor);
      const cursorCeil = Math.min(cursorFloor + 1, state.replayFrames.length - 1);
      const cursorFrac = state.replayCursor - cursorFloor;
      applyReplayFrameLerped(
        state.replayFrames[cursorFloor],
        state.replayFrames[cursorCeil],
        cursorFrac
      );

      // once the cursor reaches the goal frame we start a short timer so that
      // the camera can execute its zoom/out animation; the replay is not allowed
      // to finish until *after* this timer expires.  this guarantees the ball
      // will always make it into the net, no matter how slowly we advance the
      // cursor in slow‑motion.
      if (state.replayCursor >= state.replayGoalFrame) {
        if (state.replayGoalSeenTimer >= 0) {
          state.replayGoalSeenTimer += dt;
        } else {
          // First frame the ball reaches the goal in the replay — spawn a fresh
          // explosion so it appears exactly when the ball enters the net.
          state.replayGoalSeenTimer = 0;
          state.particles = []; // clear freeze-phase particles for a clean replay explosion
          const explosionX = state.replayGoal === "blue"
            ? FIELD.halfWidth + 40
            : -FIELD.halfWidth - 40;
          spawnGoalExplosion(explosionX, state.ball.y, state.ball.z, state.replayGoal);
          // Camera shake for the replay explosion too
          const player = getPlayerCar() || state.cars[0];
          if (player) {
            const dx = explosionX - player.x;
            const dz = -player.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            state.cameraShake = 3 + Math.max(0, 1 - dist / 5000) * 25;
          }
        }
      }

      const replayContactDelta = Math.abs(state.replayCursor - state.replayContactFrame);
      const afterContact = state.replayCursor > state.replayContactFrame;
      // Asymmetric speed curve: gradual build-up before impact, slo-mo at
      // the hit, then a quick ramp back to normal so the ball looks like it launches.
      const baseSpeed = replayContactDelta < 6
        ? 0.22                                                           // slo-mo at impact
        : afterContact
          ? (replayContactDelta < 20 ? 0.42 : 0.75)                     // ramp-up after hit
          : (replayContactDelta < 25 ? 0.32 : replayContactDelta < 50 ? 0.55 : 0.82); // gradual approach
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

      // Keep particles alive and moving during replay playback so the goal
      // explosion actually animates instead of sitting frozen at spawn.
      physics.updateParticles(dt);
    }
    return;
  }

  if (state.mode !== "freeplay" && state.kickoffTimer > 0) {
    const prevKickoffTimer = state.kickoffTimer;
    state.kickoffTimer = Math.max(0, state.kickoffTimer - dt);
    // Play countdown sound the instant the "3" banner first appears.
    // The timer starts at 4 and counts down; "3" is displayed while it is
    // in the (3, 4] window, so we fire on the first frame it drops below 4.
    if (prevKickoffTimer >= 4 && state.kickoffTimer < 4) {
      playSound("kickoff_countdown", { volume: 0.8 });
    }
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
  render.snapCameraToGameStart();
}

input.initInputListeners();
ui.initUIListeners(startMatch);
ui.updateCustomizationPreview();
startMatch("duel");
ui.setScreen("menu");
requestAnimationFrame(frame);

// On the first user gesture: satisfy the browser autoplay policy and kick off
// the background crowd ambience that loops for the entire session.
function _startAudio() {
  initAudio();
  // Start the crowd loop at quiet background volume; goals will bump it up.
  if (!state.crowdSoundHandle) {
    state.crowdSoundHandle = playSound("crowd_cheer", { volume: 0.25, loop: true });
  }
}
document.addEventListener("pointerdown", _startAudio, { once: true });
document.addEventListener("keydown",     _startAudio, { once: true });
