import { state, getPlayerCar, getCarById } from "./state.js";
import { FIELD, TIME_OF_DAY, BALL_RADIUS, BIG_PAD_VALUE, CAR_PRESETS, CAMERA_LERP } from "./constants.js";
import { clamp, lerp, hexToRgba, shade, normalizeAngle } from "./utils.js";
import { getRampHeightAt, makeCar } from "./entities.js";
import { initCarModel, isCarModelReady, renderCarModels } from "./carModel.js";

let canvas = null;
let ctx = null;

// cached camera basis to avoid recomputing for every projected point
let _cachedBasis = null;

// Focal length — increases (narrows FOV) when supersonic for a speed-rush feel
let _focalLength = 500;

// Ball-cam smoothed orbit angle — tracks the car→ball angle using shortest-arc
// interpolation so the camera never teleports or swings through the side view.
let _ballCamAngle = 0;

// Supersonic speed-line streaks — persistent so they animate smoothly
function _makeStreak() {
  return {
    angle: Math.random() * Math.PI * 2,
    dist:  Math.random(),                       // 0..1 progress outward
    speed: 0.3 + Math.random() * 0.7,
    len:   0.05 + Math.random() * 0.13,
    width: 0.4 + Math.random() * 1.6,
    alpha: 0.2 + Math.random() * 0.55,
  };
}
const _speedStreaks = Array.from({ length: 70 }, _makeStreak);
export function updateBasis() {
  _cachedBasis = getCameraBasis();
}

export function initCanvas(c) {
  canvas = c;
  ctx = canvas.getContext("2d");
  initCarModel(canvas);
}

export function getFocalLength() { return _focalLength; }

export function drawCarModels() {
  renderCarModels(ctx, state.cars, state.camera, _focalLength);
}

// camera maths ----------------------------------------------------------------
// compute basis vectors for the current camera orientation
export function getCameraBasis() {
  const fx = state.camera.targetX - state.camera.x;
  const fy = state.camera.targetY - state.camera.y;
  const fz = state.camera.targetZ - state.camera.z;
  // compute magnitude without calling Math.hypot (faster)
  let fLen = fx * fx + fy * fy + fz * fz;
  if (fLen <= 0) fLen = 1;
  else fLen = Math.sqrt(fLen);
  const forwardX = fx / fLen;
  const forwardY = fy / fLen;
  const forwardZ = fz / fLen;

  const upX = 0;
  const upY = 1;
  const upZ = 0;

  let rightX = forwardY * upZ - forwardZ * upY;
  let rightY = forwardZ * upX - forwardX * upZ;
  let rightZ = forwardX * upY - forwardY * upX;
  let rLen = rightX * rightX + rightY * rightY + rightZ * rightZ;
  if (rLen <= 0) rLen = 1;
  else rLen = Math.sqrt(rLen);
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

export function projectPoint(x, y, z) {
  const basis = _cachedBasis || getCameraBasis();
  const dx = x - state.camera.x;
  const dy = y - state.camera.y;
  const dz = z - state.camera.z;
  const rx = dx * basis.rightX + dy * basis.rightY + dz * basis.rightZ;
  const ry = dx * basis.camUpX + dy * basis.camUpY + dz * basis.camUpZ;
  const finalZ = dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;

  if (finalZ < 8) {
    return null;
  }

  const focal = _focalLength;
  return {
    x: canvas.width / 2 + (rx / finalZ) * focal,
    y: canvas.height / 2 - (ry / finalZ) * focal,
    scale: focal / finalZ,
    depth: finalZ,
  };
}

export function worldDepth(x, y, z) {
  const basis = _cachedBasis || getCameraBasis();
  const dx = x - state.camera.x;
  const dy = y - state.camera.y;
  const dz = z - state.camera.z;
  return dx * basis.forwardX + dy * basis.forwardY + dz * basis.forwardZ;
}

// drawing helpers ------------------------------------------------------------
export function fillQuad(points, fillStyle, strokeStyle = null) {
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

export function draw3DLine(x0, y0, z0, x1, y1, z1, color, width) {
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

// drawing routines for each part of arena/game --------------------------------
let _cachedSkyGradient = null;
let _cachedGlowGradient = null;
let _cachedFieldTint = null;
let _cachedTOD = null;

export function drawBackground() {
  if (state.timeOfDay !== _cachedTOD || canvas.width === 0 || canvas.height === 0) {
    const skyPreset = TIME_OF_DAY[state.timeOfDay];
    _cachedSkyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    _cachedSkyGradient.addColorStop(0, skyPreset.skyTop);
    _cachedSkyGradient.addColorStop(0.42, skyPreset.skyMid);
    _cachedSkyGradient.addColorStop(1, skyPreset.skyBottom);

    _cachedGlowGradient = ctx.createRadialGradient(
      canvas.width / 2,
      120,
      40,
      canvas.width / 2,
      120,
      340
    );
    _cachedGlowGradient.addColorStop(0, skyPreset.glow);
    _cachedGlowGradient.addColorStop(1, "rgba(255,255,255,0)");

    _cachedFieldTint = skyPreset.fieldTint;
    _cachedTOD = state.timeOfDay;
  }

  ctx.fillStyle = _cachedSkyGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = _cachedGlowGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = _cachedFieldTint;
  ctx.fillRect(0, canvas.height * 0.35, canvas.width, canvas.height * 0.65);
}

// ... arena rendering functions (drawArena, drawStands etc) would go here
// for brevity I will export the large code unchanged or import from legacy file

// reuse allocation to reduce GC churn
const _renderables = [];
export function makeRenderables() {
  _renderables.length = 0;

  if (state.screen === "game") {
    for (const pad of state.boostPads) {
      _renderables.push({ depth: worldDepth(pad.x, 2, pad.z), draw: () => drawBoostPad(pad) });
    }
    _renderables.push({ depth: worldDepth(state.ball.x, state.ball.y, state.ball.z), draw: drawBall });
  } else if (state.screen === "menu") {
    // preview car (keep as menu focal object)
    const previewCar = makeCar({
      id: "preview",
      name: "Preview",
      team: "blue",
      controlled: false,
      // position on field
      x: 0,
      z: 0,
      angle: Math.PI * 0.92,
      color: state.custom.color,
      boostColor: state.custom.boostColor,
      wheelColor: state.custom.wheelColor,
      bodyStyle: state.custom.bodyStyle,
      boost: 100,
    });
    _renderables.push({ depth: worldDepth(previewCar.x, 20, previewCar.z), draw: () => drawCar(previewCar) });

    // remove the menu preview ball to prevent the small 'popup dot' from
    // appearing whenever menu controls are clicked.
    // We keep full field+crowd/stands rendering in place for the animated menu.

  }

  for (const particle of state.particles) {
    _renderables.push({ depth: worldDepth(particle.x, particle.y, particle.z), draw: () => drawParticle(particle) });
  }

  const visibleCars = state.screen === "result" ? state.resultCars : state.cars;
  for (const car of visibleCars) {
    if (state.screen === "menu") {
      break;
    }
    _renderables.push({ depth: worldDepth(car.x, 20 + car.y, car.z), draw: () => drawCar(car) });
  }

  return _renderables.filter((item) => item.depth > 0).sort((a, b) => b.depth - a.depth);
}

// helper routines for arena and vehicle rendering (moved from legacy file)
export function drawArena() {
  // floor first, stands second – but menu shots occasionally put the
  // camera below the floor, which still leaves the field between the
  // camera and the crowd using the painter’s algorithm.  to guarantee
  // the crowd is always visible in the menu we’ll re‑draw the stands
  // at the end of the frame.
  drawTiledFloor();
  drawStands();
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

export function drawFieldLines() {
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

  fillQuad([
    projectPoint(xFront, 0, z0),
    projectPoint(xBack, 0, z0),
    projectPoint(xBack, y, z0),
    projectPoint(xFront, y, z0),
  ], color);
  fillQuad([
    projectPoint(xFront, 0, z1),
    projectPoint(xBack, 0, z1),
    projectPoint(xBack, y, z1),
    projectPoint(xFront, y, z1),
  ], color);
  fillQuad([
    projectPoint(xBack, 0, z0),
    projectPoint(xBack, 0, z1),
    projectPoint(xBack, y, z1),
    projectPoint(xBack, y, z0),
  ], color);
  fillQuad([
    projectPoint(xFront, y, z0),
    projectPoint(xFront, y, z1),
    projectPoint(xBack, y, z1),
    projectPoint(xBack, y, z0),
  ], "rgba(226,232,240,0.18)");
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

export function drawStands() {
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
      return;
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
  // interpolation support: temporarily tweak the car's coordinates based
  // on prevX/prevY/prevZ/prevAngle and the current renderAlpha value.
  let backup;
  const alpha = state.renderAlpha || 0;
  if (car.prevX !== undefined && alpha > 0) {
    backup = { x: car.x, y: car.y, z: car.z, angle: car.angle };
    car.x = car.prevX + (car.x - car.prevX) * alpha;
    car.y = car.prevY + (car.y - car.prevY) * alpha;
    car.z = car.prevZ + (car.z - car.prevZ) * alpha;
    const da = normalizeAngle(car.angle - car.prevAngle);
    car.angle = car.prevAngle + da * alpha;
  }

  const shadow = projectPoint(car.x, 1, car.z);
  if (shadow) {
    ctx.fillStyle = "rgba(15,23,42,0.26)";
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, 30 * shadow.scale, 14 * shadow.scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Skip 2D body for Octane when the GLB model is loaded — rendered by Three.js
  if (!(car.bodyStyle === "octane" && isCarModelReady())) {
    drawCarBody(car);
  }
  if (car.isBoosting) {
    drawCarFlame(car);
  }
  if (state.screen === "game") {
    drawBoostMeter(car);
  }

  if (backup) {
    Object.assign(car, backup);
  }
}

// drawBallAt is a version of drawBall that operates on an arbitrary ball
// object rather than state.ball.  This allows menu rendering to show a
// preview ball without mutating global state or causing flicker.
function drawBallAt(ballObj) {
  // we intentionally suppress auxiliary ball rendering while in menu mode
  // to avoid the floating dot artifact that appears during UI interaction.
  if (state.screen === "menu") {
    return;
  }

  // interpolate position/spin if prev values exist on the object
  let backup;
  const alpha = state.renderAlpha || 0;
  if (ballObj.prevX !== undefined && alpha > 0) {
    backup = { ...ballObj };
    ballObj.x = ballObj.prevX + (ballObj.x - ballObj.prevX) * alpha;
    ballObj.y = ballObj.prevY + (ballObj.y - ballObj.prevY) * alpha;
    ballObj.z = ballObj.prevZ + (ballObj.z - ballObj.prevZ) * alpha;
    ballObj.spin = ballObj.prevSpin + (ballObj.spin - ballObj.prevSpin) * alpha;
  }

  const shadow = projectPoint(ballObj.x, 1, ballObj.z);
  const point = projectPoint(ballObj.x, ballObj.y, ballObj.z);
  if (!point || !shadow) {
    if (backup) Object.assign(ballObj, backup);
    return;
  }
  ctx.fillStyle = "rgba(15,23,42,0.28)";
  ctx.beginPath();
  ctx.ellipse(shadow.x, shadow.y, 22 * shadow.scale, 10 * shadow.scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const radius = BALL_RADIUS * point.scale * 1.8;

  if (backup) Object.assign(ballObj, backup);
  renderSphericalBall(point, radius);
}

function renderSphericalBall(point, radius) {
  // Three-layer sphere shading that gives a convincing 3-D look on a 2-D canvas.
  // Light source is upper-left, matching the arena lighting.
  ctx.save();

  // Layer 1 – diffuse shading: bright lit face fading to a dark limb
  const hx = point.x - radius * 0.3;
  const hy = point.y - radius * 0.35;
  const diffuse = ctx.createRadialGradient(hx, hy, radius * 0.05, point.x, point.y, radius);
  diffuse.addColorStop(0,   "#e4eef8");   // bright lit hemisphere
  diffuse.addColorStop(0.5, "#b0c8de");   // mid-tone
  diffuse.addColorStop(1,   "#243c52");   // dark limb
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = diffuse;
  ctx.fill();

  // Layer 2 – rim darkening: makes the silhouette edge look curved (Fresnel-like)
  const rim = ctx.createRadialGradient(point.x, point.y, radius * 0.55, point.x, point.y, radius);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, "rgba(0,0,0,0.52)");
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();

  // Layer 3 – specular highlight: sharp glossy spot near the light source
  const sx = point.x - radius * 0.27;
  const sy = point.y - radius * 0.31;
  const spec = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 0.44);
  spec.addColorStop(0,    "rgba(255,255,255,0.94)");
  spec.addColorStop(0.22, "rgba(255,255,255,0.55)");
  spec.addColorStop(1,    "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = spec;
  ctx.fill();

  ctx.restore();
}

function drawBall() {
  // interpolate ball position/spin if prev values exist
  let backup;
  const alpha = state.renderAlpha || 0;
  if (state.ball.prevX !== undefined && alpha > 0) {
    backup = { ...state.ball };
    state.ball.x = state.ball.prevX + (state.ball.x - state.ball.prevX) * alpha;
    state.ball.y = state.ball.prevY + (state.ball.y - state.ball.prevY) * alpha;
    state.ball.z = state.ball.prevZ + (state.ball.z - state.ball.prevZ) * alpha;
    state.ball.spin = state.ball.prevSpin + (state.ball.spin - state.ball.prevSpin) * alpha;
  }

  const shadow = projectPoint(state.ball.x, 1, state.ball.z);
  const point = projectPoint(state.ball.x, state.ball.y, state.ball.z);
  if (!point || !shadow) {
    if (backup) Object.assign(state.ball, backup);
    return;
  }
  ctx.fillStyle = "rgba(15,23,42,0.28)";
  ctx.beginPath();
  ctx.ellipse(shadow.x, shadow.y, 22 * shadow.scale, 10 * shadow.scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const radius = BALL_RADIUS * point.scale * 1.8;

  // restore original ball state if we temporarily interpolated it
  if (backup) Object.assign(state.ball, backup);
  renderSphericalBall(point, radius);
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


export function drawOverlay() {
  // position icons next to the "menu return" button if available
  let baseX = 22;
  const menuBtn = document.getElementById("menuReturnButton");
  if (menuBtn) {
    const r = menuBtn.getBoundingClientRect();
    baseX = r.right + 8; // 8px margin
  }

  if (state.replayTimer > 0 && state.goalFreezeTimer <= 0 && state.screen === "game") {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(127, 29, 29, 0.82)";
    ctx.fillRect(baseX, 22, 110, 34);
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 20px Trebuchet MS";
    ctx.fillText("REPLAY", baseX + 14, 45);
  }

  if (state.ballCam && state.replayTimer <= 0 && state.screen === "game") {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(127, 29, 29, 0.82)";
    ctx.fillRect(baseX, 64, 140, 34);
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 20px Trebuchet MS";
    ctx.fillText("BALL CAM", baseX + 14, 87);
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

  // ── Speed lines (three tiers) ─────────────────────────────────────────────
  // Only shown during live gameplay (not replay / menu / result).
  //
  //  Tier 1 — normal max speed (no boost, ~800–1 000 u/s):
  //            faint white streaks, no vignette, no FOV change
  //  Tier 2 — boosting but not yet supersonic (pre–2 s timer):
  //            brighter streaks + slight tunnel vignette, still no FOV change
  //  Tier 3 — supersonic (after 2 s boost hold):
  //            full streaks, strong vignette, streaks move much faster,
  //            camera FOV widens (handled in updateCamera above)
  const _playerCar = state.screen === "game" && state.replayTimer <= 0
    ? getPlayerCar()
    : null;
  if (_playerCar) {
    const spd = Math.sqrt(
      _playerCar.vx * _playerCar.vx +
      _playerCar.vy * _playerCar.vy +
      _playerCar.vz * _playerCar.vz
    );
    const isSuper   = _playerCar.isSuperSonic;
    const isBoostUp = _playerCar.isBoosting && !isSuper; // boosting, timer not reached yet

    // Per-tier intensities
    const normalPhase = clamp((spd - 800) / 200, 0, 1);           // faint at 800–1 000
    const boostPhase  = isBoostUp ? clamp((spd - 950) / 250, 0, 1) : 0;
    const superPhase  = isSuper   ? clamp((spd - 1300) / 400, 0.4, 1) : 0;

    // Draw intensity (alpha scale for streaks)
    const drawIntensity = isSuper
      ? superPhase                                // 40–100 %
      : isBoostUp
        ? 0.18 + boostPhase * 0.32               // 18–50 %
        : normalPhase * 0.14;                     //  0–14 %

    // Streak animation speed — much faster when supersonic
    const streakSpeed = isSuper ? 2.4 : isBoostUp ? 0.85 : 0.22;

    // Advance all streaks every frame (keeps them moving even at low intensity)
    for (const s of _speedStreaks) {
      s.dist += (1 / 60) * s.speed * streakSpeed;
      if (s.dist > 1) {
        Object.assign(s, _makeStreak());
        s.dist = 0;
      }
    }

    if (drawIntensity > 0.01) {
      const cx   = canvas.width  / 2;
      const cy   = canvas.height / 2;
      const maxR = Math.hypot(canvas.width, canvas.height) * 0.55;
      const minR = maxR * 0.06;

      // Tunnel vignette — none at tier-1, slight at tier-2, strong at tier-3
      const vigAlpha = isSuper
        ? (0.50 * superPhase).toFixed(2)
        : isBoostUp
          ? (0.18 * boostPhase).toFixed(2)
          : "0";
      if (Number(vigAlpha) > 0) {
        const vig = ctx.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR * 0.95);
        vig.addColorStop(0, `rgba(0,6,20,0)`);
        vig.addColorStop(1, `rgba(0,6,20,${vigAlpha})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw streaks
      ctx.save();
      ctx.lineCap = "round";
      for (const s of _speedStreaks) {
        const r1   = minR + s.dist * (maxR - minR);
        const r2   = Math.min(r1 + s.len * (maxR - minR), maxR);
        const fade = Math.sin(clamp(s.dist, 0, 1) * Math.PI); // fade in+out along path
        const a    = (s.alpha * drawIntensity * fade).toFixed(3);
        if (Number(a) < 0.01) continue;
        const cos = Math.cos(s.angle);
        const sin = Math.sin(s.angle);
        ctx.beginPath();
        ctx.moveTo(cx + cos * r1, cy + sin * r1);
        ctx.lineTo(cx + cos * r2, cy + sin * r2);
        ctx.strokeStyle = `rgba(220,235,255,${a})`;
        ctx.lineWidth = s.width * clamp(drawIntensity * 1.4, 0.3, 1.5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

// camera boundary clamping helper (moved from legacy code)
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

// helper used only in menu camera logic
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
      // goal-end shot: camera behind the orange goal looking across the pitch.
      // replaces the old top-down shot whose steep elevation angle pushed the
      // field geometry below the canvas bottom, leaving only sky + a tiny dot.
      return {
        x: Math.sin(t * 0.9) * 780,
        y: 440 + Math.sin(t * 1.1) * 22,
        z: -(FIELD.halfDepth + 480) + Math.cos(t * 0.7) * 160,
        targetX: 0,
        targetY: 80,
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

// Snap the camera to the correct game-follow position immediately.
// Called when a match starts so the camera doesn't drift in from the
// far-away menu orbit position, which made the ball appear as a tiny dot.
export function snapCameraToGameStart() {
  const focus = getPlayerCar() || state.cars[0];
  if (!focus) return;
  const followDistance = 560;
  const desiredX = focus.x - Math.cos(focus.angle) * followDistance;
  const desiredY = 220 + focus.y * 0.25;
  const desiredZ = focus.z - Math.sin(focus.angle) * followDistance;
  const bounded = constrainCameraPosition(focus.x, focus.y, focus.z, desiredX, desiredY, desiredZ);
  state.camera.x = bounded.x;
  state.camera.y = bounded.y;
  state.camera.z = bounded.z;
  state.camera.targetX = focus.x + Math.cos(focus.angle) * 340;
  state.camera.targetY = 20 + focus.y * 0.35;
  state.camera.targetZ = focus.z + Math.sin(focus.angle) * 280;
  _cachedBasis = null;
}

export function updateCamera() {
  // Widen FOV (lower focal) while supersonic — makes the car look like it's
  // punching through space. Pre-supersonic boost leaves FOV unchanged at 500.
  const _fovCar = getPlayerCar();
  const _targetFocal = _fovCar && _fovCar.isSuperSonic ? 400 : 500;
  _focalLength = lerp(_focalLength, _targetFocal, 0.05);

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

  // Goal freeze: pan to centre of the stadium and look straight at the scored goal.
  if (state.replayTimer > 0 && state.goalFreezeTimer > 0) {
    const goalX = state.replayGoal === "blue" ? FIELD.halfWidth : -FIELD.halfWidth;
    state.camera.x = lerp(state.camera.x, 0, 0.07);
    state.camera.y = lerp(state.camera.y, 560, 0.07);
    state.camera.z = lerp(state.camera.z, 900, 0.07);
    state.camera.targetX = lerp(state.camera.targetX, goalX, 0.09);
    state.camera.targetY = lerp(state.camera.targetY, 160, 0.09);
    state.camera.targetZ = lerp(state.camera.targetZ, 0, 0.09);
    // Apply shake during the freeze phase too.
    if (state.cameraShake > 0.1) {
      const shakeAngle = Math.random() * Math.PI * 2;
      state.camera.x += Math.cos(shakeAngle) * state.cameraShake;
      state.camera.y += (Math.random() - 0.5) * state.cameraShake * 0.5;
      state.camera.z += Math.sin(shakeAngle) * state.cameraShake;
      state.cameraShake *= 0.84;
      _cachedBasis = null;
    } else {
      state.cameraShake = 0;
    }
    return;
  }

  const isReplay = state.replayTimer > 0 && state.goalFreezeTimer <= 0;
  // During a replay follow the scorer's car (pre-contact) so the camera
  // tracks whoever hit the ball, not always the local player.
  const scorerCar = isReplay && state.replayScorerId
    ? getCarById(state.replayScorerId)
    : null;
  const replayFocus = scorerCar || getPlayerCar() || state.cars[0];
  if (!replayFocus) {
    return;
  }

  // Once the ball has entered the net in the replay, switch to the same
  // centre-stadium view used during the live goal-freeze phase.
  if (isReplay && state.replayGoalSeenTimer >= 0) {
    const goalX = state.replayGoal === "blue" ? FIELD.halfWidth : -FIELD.halfWidth;
    state.camera.x = lerp(state.camera.x, 0, 0.09);
    state.camera.y = lerp(state.camera.y, 560, 0.09);
    state.camera.z = lerp(state.camera.z, 900, 0.09);
    state.camera.targetX = lerp(state.camera.targetX, goalX, 0.11);
    state.camera.targetY = lerp(state.camera.targetY, 160, 0.11);
    state.camera.targetZ = lerp(state.camera.targetZ, 0, 0.11);
    if (state.cameraShake > 0.1) {
      const shakeAngle = Math.random() * Math.PI * 2;
      state.camera.x += Math.cos(shakeAngle) * state.cameraShake;
      state.camera.y += (Math.random() - 0.5) * state.cameraShake * 0.5;
      state.camera.z += Math.sin(shakeAngle) * state.cameraShake;
      state.cameraShake *= 0.84;
      _cachedBasis = null;
    } else {
      state.cameraShake = 0;
    }
    return;
  }

  // postContactPhase: 0 = side camera on scorer car, 1 = camera orbiting ball.
  const postContactPhase = isReplay
    ? clamp((state.replayCursor - state.replayContactFrame) / 30, 0, 1)
    : 1;

  // contactZoom: 1 exactly at the contact frame, 0 beyond 22 frames away.
  // Drives both the camera punch-in and the slo-mo effect.
  const replayContactDelta = isReplay
    ? Math.abs(state.replayCursor - state.replayContactFrame)
    : Number.POSITIVE_INFINITY;
  const contactZoom = isReplay ? clamp(1 - replayContactDelta / 22, 0, 1) : 0;

  // Anchor position: follow car before contact, ball after.
  const anchorX = isReplay ? lerp(replayFocus.x, state.ball.x, postContactPhase) : replayFocus.x;
  const anchorY = isReplay ? lerp(replayFocus.y, state.ball.y, postContactPhase) : replayFocus.y;
  const anchorZ = isReplay ? lerp(replayFocus.z, state.ball.z, postContactPhase) : replayFocus.z;

  // Pre-contact: side camera perpendicular to the car→ball approach vector so
  // the car sweeps across frame rather than driving straight at the lens.
  const carToBallAngle = Math.atan2(
    state.ball.z - replayFocus.z,
    state.ball.x - replayFocus.x
  );
  const carSideAngle = carToBallAngle + Math.PI * 0.5;

  // Post-contact: cinematic orbit around ball's velocity direction
  const replayHeading = Math.atan2(state.ball.vz || 0.01, state.ball.vx || 0.01);
  const ballOrbitAngle = replayHeading + Math.PI * 0.72;

  // Shortest-arc lerp between side angle and ball-orbit angle
  let orbitDiff = ballOrbitAngle - carSideAngle;
  while (orbitDiff > Math.PI) orbitDiff -= 2 * Math.PI;
  while (orbitDiff < -Math.PI) orbitDiff += 2 * Math.PI;

  // Ball-cam: orbit the camera to the OPPOSITE side of the car from the ball
  // so the car is always visible in the lower-center of the frame.
  // We track the car→ball angle through a smoothed module-level variable using
  // shortest-arc interpolation — this prevents the camera from swinging through
  // the side-of-car position whenever the angle needs to flip 180°.
  const usingBallCam = state.ballCam && !isReplay;
  if (usingBallCam) {
    let angleDiff = carToBallAngle - _ballCamAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    _ballCamAngle += angleDiff * 0.18;
  } else {
    // Keep in sync so there's no jump when ball cam is toggled on
    _ballCamAngle = carToBallAngle;
  }
  const anchorAngle = isReplay
    ? carSideAngle + orbitDiff * postContactPhase
    : usingBallCam
      ? _ballCamAngle           // smoothed orbit: camera opposite ball, car in frame
      : replayFocus.angle;      // normal cam: behind car based on heading

  // Follow distance: wide side shot punches in at contact, expands with ball after
  const carFollowDist = lerp(740, 390, contactZoom);
  const ballFollowDist = lerp(390, 630, clamp(postContactPhase * 2, 0, 1));
  const followDistance = isReplay ? lerp(carFollowDist, ballFollowDist, postContactPhase)
    : usingBallCam ? 600 : 560;

  // Camera height: medium for side shot, dips at impact punch-in, rises after
  const carCamHeight = lerp(290, 195, contactZoom);
  const ballCamHeight = lerp(195, 330, postContactPhase);
  const camHeight = isReplay ? lerp(carCamHeight, ballCamHeight, postContactPhase)
    : usingBallCam ? 240 : 220;

  const targetX = anchorX - Math.cos(anchorAngle) * followDistance;
  const targetY = camHeight + anchorY * 0.25;
  const targetZ = anchorZ - Math.sin(anchorAngle) * followDistance;

  // Look-at: midpoint car→ball (keeps both in frame for the side shot),
  // then shifts to pure ball-tracking post-contact.
  const midLookX = lerp(replayFocus.x, state.ball.x, 0.55);
  const midLookY = lerp(replayFocus.y, state.ball.y, 0.55) + 20;
  const midLookZ = lerp(replayFocus.z, state.ball.z, 0.55);
  let lookAheadX, lookAheadY, lookAheadZ;
  if (isReplay) {
    lookAheadX = lerp(midLookX, state.ball.x, postContactPhase);
    lookAheadY = lerp(midLookY, state.ball.y, postContactPhase);
    lookAheadZ = lerp(midLookZ, state.ball.z, postContactPhase);
  } else {
    lookAheadX = usingBallCam ? state.ball.x : replayFocus.x + Math.cos(replayFocus.angle) * 340;
    lookAheadY = usingBallCam ? state.ball.y : 20 + replayFocus.y * 0.35;
    lookAheadZ = usingBallCam ? state.ball.z : replayFocus.z + Math.sin(replayFocus.angle) * 280;
  }
  const boundedCamera = constrainCameraPosition(anchorX, anchorY, anchorZ, targetX, targetY, targetZ);

  state.camera.x = lerp(state.camera.x, boundedCamera.x, CAMERA_LERP);
  state.camera.y = lerp(state.camera.y, boundedCamera.y, CAMERA_LERP);
  state.camera.z = lerp(state.camera.z, boundedCamera.z, CAMERA_LERP);
  state.camera.targetX = lerp(state.camera.targetX, lookAheadX, CAMERA_LERP);
  state.camera.targetY = lerp(state.camera.targetY, lookAheadY, CAMERA_LERP);
  state.camera.targetZ = lerp(state.camera.targetZ, lookAheadZ, CAMERA_LERP);

  // Camera shake — random offset each frame, amplitude decays quickly
  if (state.cameraShake > 0.1) {
    const shakeAngle = Math.random() * Math.PI * 2;
    state.camera.x += Math.cos(shakeAngle) * state.cameraShake;
    state.camera.y += (Math.random() - 0.5) * state.cameraShake * 0.5;
    state.camera.z += Math.sin(shakeAngle) * state.cameraShake;
    state.cameraShake *= 0.84; // decays to <1% in ~25 frames (~0.4 s at 60 fps)
    _cachedBasis = null;
  } else {
    state.cameraShake = 0;
  }
}
