// ── 3D Octane model renderer ────────────────────────────────────────────────
// Uses Three.js to render the GLB Octane model onto an offscreen canvas,
// which is then blitted onto the main 2D canvas each frame.
// Only used when car.bodyStyle === "octane".

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ── Tuning ───────────────────────────────────────────────────────────────────
// Scale the GLB to match game units (car body is ~56 units long in game).
// Adjust if the model appears too big or too small.
const CAR_MODEL_SCALE  = 0.47;
// Rotation offset applied on top of car.angle so the model faces forward.
// 0 = model's default +Z aligns with game's forward direction.
// Adjust by π/2 increments if the model faces the wrong way.
const MODEL_ROT_OFFSET = 0;
// Vertical offset so the model sits flush on the ground plane
const MODEL_Y_OFFSET   = 0;

// ── Internal state ───────────────────────────────────────────────────────────
let _offscreen    = null;   // OffscreenCanvas or regular canvas
let _renderer     = null;   // THREE.WebGLRenderer
let _scene        = null;   // THREE.Scene
let _camera       = null;   // THREE.PerspectiveCamera
let _template     = null;   // original loaded gltf.scene (never added to scene)
let _ready        = false;
const _carMeshes  = new Map(); // car.id → THREE.Object3D clone

// ── Init ─────────────────────────────────────────────────────────────────────
export function initCarModel(mainCanvas) {
  _offscreen       = document.createElement("canvas");
  _offscreen.width  = mainCanvas.width;
  _offscreen.height = mainCanvas.height;

  _renderer = new THREE.WebGLRenderer({ canvas: _offscreen, alpha: true, antialias: true });
  _renderer.setPixelRatio(1);
  _renderer.setClearColor(0x000000, 0);
  _renderer.setSize(mainCanvas.width, mainCanvas.height);

  _scene  = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(70, mainCanvas.width / mainCanvas.height, 1, 50000);

  // Lighting — warm sun from above-front, cool fill from behind
  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  _scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(300, 1000, 400);
  _scene.add(sun);
  const fill = new THREE.DirectionalLight(0x99bbff, 0.35);
  fill.position.set(-400, 200, -600);
  _scene.add(fill);

  const loader = new GLTFLoader();
  loader.load(
    "models/octane.glb",
    (gltf) => {
      _template = gltf.scene;
      _template.scale.setScalar(CAR_MODEL_SCALE);
      _ready = true;
    },
    undefined,
    (err) => console.warn("[carModel] GLB load error:", err),
  );
}

export function resizeCarModel(w, h) {
  if (!_renderer) return;
  _offscreen.width  = w;
  _offscreen.height = h;
  _renderer.setSize(w, h);
  _camera.aspect = w / h;
  _camera.updateProjectionMatrix();
}

export function isCarModelReady() { return _ready; }

// ── Per-frame render ─────────────────────────────────────────────────────────
/**
 * Render all octane cars into the offscreen Three.js canvas and blit it onto
 * the main 2D canvas.
 *
 * @param {CanvasRenderingContext2D} ctx       main canvas 2D context
 * @param {Array}                   cars       state.cars array
 * @param {object}                  camState   state.camera
 * @param {number}                  focalLen   current _focalLength from render.js
 */
export function renderCarModels(ctx, cars, camState, focalLen) {
  if (!_ready) return;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  if (_offscreen.width !== w || _offscreen.height !== h) {
    resizeCarModel(w, h);
  }

  // ── Sync Three.js camera to game camera ───────────────────────────────────
  // game projection: screen_x = (w/2) + (camSpaceX / depth) * focalLen
  // equivalent vertical FOV: 2 * atan(h / (2 * focalLen))
  const vFovDeg = (2 * Math.atan(h / (2 * focalLen))) * (180 / Math.PI);
  _camera.fov    = vFovDeg;
  _camera.aspect = w / h;
  _camera.updateProjectionMatrix();
  _camera.position.set(camState.x, camState.y, camState.z);
  _camera.lookAt(camState.targetX, camState.targetY, camState.targetZ);

  // ── Remove meshes for cars that no longer exist ───────────────────────────
  for (const [id, mesh] of _carMeshes) {
    if (!cars.find((c) => c.id === id)) {
      _scene.remove(mesh);
      _carMeshes.delete(id);
    }
  }

  // ── Position / rotate each Octane car ────────────────────────────────────
  let hasVisible = false;
  for (const car of cars) {
    if (car.bodyStyle !== "octane") continue;

    let mesh = _carMeshes.get(car.id);
    if (!mesh) {
      mesh = _template.clone(true);
      _applyCarColor(mesh, car.color);
      _scene.add(mesh);
      _carMeshes.set(car.id, mesh);
    }

    mesh.position.set(car.x, car.y + MODEL_Y_OFFSET, car.z);
    // car.angle=0 → facing +X; Three.js rotation.y rotates CCW from +Z
    // offset adjusts for the model's baked orientation
    mesh.rotation.y = -car.angle + MODEL_ROT_OFFSET;
    hasVisible = true;
  }

  if (!hasVisible) return; // nothing to render

  _renderer.render(_scene, _camera);
  ctx.drawImage(_offscreen, 0, 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _applyCarColor(mesh, hexColor) {
  const color = new THREE.Color(hexColor);
  mesh.traverse((child) => {
    if (!child.isMesh) return;
    // Clone material so we don't mutate the template
    const mat = Array.isArray(child.material)
      ? child.material.map((m) => m.clone())
      : child.material.clone();
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      // Only tint materials that look like the body (not glass/dark parts)
      if (m.color) m.color.lerp(color, 0.55);
    }
    child.material = mat;
  });
}
