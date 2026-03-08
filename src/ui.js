import { state } from "./state.js";
import { formatClock } from "./utils.js";
import { MODES, CAR_PRESETS } from "./constants.js";
import { keys } from "./input.js";

// expose for debugging (can be removed later)
window.state = state;
window.keys = keys;

// cache DOM elements
export const playerScoreEl = document.getElementById("playerScore");
export const aiScoreEl = document.getElementById("aiScore");
export const boostValueEl = document.getElementById("boostValue");
export const blueLabelEl = document.getElementById("blueLabel");
export const orangeLabelEl = document.getElementById("orangeLabel");
export const matchLabelEl = document.getElementById("matchLabel");
export const matchStateEl = document.getElementById("matchState");
export const gameHudEl = document.getElementById("gameHud");
export const menuReturnButton = document.getElementById("menuReturnButton");
export const boostHudEl = document.getElementById("boostHud");
export const controlsHudEl = document.getElementById("controlsHud");
export const menuOverlayEl = document.getElementById("menuOverlay");
export const shapeGridEl = document.getElementById("shapeGrid");
export const carColorInput = document.getElementById("carColorInput");
export const boostColorInput = document.getElementById("boostColorInput");
export const wheelColorInput = document.getElementById("wheelColorInput");
export const timeGridEl = document.getElementById("timeGrid");
export const previewLabelEl = document.getElementById("previewLabel");
export const bodySwatchEl = document.getElementById("bodySwatch");
export const boostSwatchEl = document.getElementById("boostSwatch");
export const wheelSwatchEl = document.getElementById("wheelSwatch");
export const resultOverlayEl = document.getElementById("resultOverlay");
export const resultTitleEl = document.getElementById("resultTitle");
export const resultSubtitleEl = document.getElementById("resultSubtitle");
export const playAgainButton = document.getElementById("playAgainButton");
export const garageButton = document.getElementById("garageButton");

export function setScreen(screen) {
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

export function setBanner(text, duration) {
  state.bannerText = text;
  state.bannerTimer = duration;
}

export function syncHud() {
  playerScoreEl.textContent = String(state.scores.blue);
  aiScoreEl.textContent = String(state.scores.orange);
  const playerCar = state.cars.find((c) => c.controlled) || {};
  boostValueEl.textContent = String(
    (state.mode === "freeplay" && playerCar.controlled ? 100 : Math.round(playerCar.boost ?? 100))
  );
  const config = MODES[state.mode];
  blueLabelEl.textContent = config.blueLabel;
  orangeLabelEl.textContent = config.orangeLabel;
  matchLabelEl.textContent = config.label;
  matchStateEl.textContent = state.mode === "freeplay" ? "Unlimited" : formatClock(state.matchTime);
}

export function updateCustomizationPreview() {
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

// wire up UI events (export a function to call in main.js)
export function initUIListeners(onPlay) {
  shapeGridEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shape]");
    if (!button) return;
    state.custom.bodyStyle = button.dataset.shape;
    updateCustomizationPreview();
  });

  timeGridEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-time]");
    if (!button) return;
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
      button.addEventListener("click", () => onPlay(button.dataset.mode));
    }
  }

  playAgainButton.addEventListener("click", () => onPlay(state.mode));

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
      // restart allowed only when playing freeplay – real matches cannot be
      // restarted using the keyboard.
      if (state.screen === "game" && state.mode === "freeplay") {
        onPlay(state.mode);
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
}
