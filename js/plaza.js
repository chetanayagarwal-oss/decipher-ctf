/* ============================================================
   DECIPHER — LNMIIT Central Plaza
   A standalone walkthrough of the plaza model. No cabinet here:
   the world itself is the subject.

   The model carries no baked lighting (pure runtime PBR), every
   material ships double-sided, and three fixtures use
   KHR_materials_emissive_strength at 50x, 28.7x and 60x. All three
   are handled on load.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const isMobile = innerWidth < 760;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const bootEl = document.getElementById("boot");
const fillEl = document.getElementById("boot-fill");
const statusEl = document.getElementById("boot-status");
const startEl = document.getElementById("boot-start");
const hintEl = document.getElementById("hint");

/* ================== renderer ================== */
const stage = document.getElementById("stage");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
} catch (err) {
  console.error("WebGL unavailable:", err);
  document.getElementById("fail").hidden = false;
  bootEl.style.display = "none";
  throw err;
}
const BASE_PR = Math.min(devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
let quality = 1;
renderer.setPixelRatio(BASE_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();

/* The model is authored in metres, so every distance here is metres.
   Linear fog aimed at the plaza's real depth rather than exponential. */
const FOG = 0x2a2140;
scene.fog = new THREE.Fog(FOG, 45, 400);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 2000);

/* ================== sky dome ==================
   The mid band is exactly the fog colour, so geometry fading out at the
   horizon dissolves into the sky instead of ending on a visible seam. */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x120a2e) },
      uMid: { value: new THREE.Color(FOG) },
      uBot: { value: new THREE.Color(0x0a0618) },
      uGlow: { value: new THREE.Color(0x8a4bd8) }
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uBot, uGlow;
      varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 col = h > 0.0
          ? mix(uMid, uTop, pow(clamp(h, 0.0, 1.0), 0.72))
          : mix(uMid, uBot, pow(clamp(-h, 0.0, 1.0), 0.55));
        // low sun glow toward -Z so the horizon is not uniform
        float glow = pow(clamp(dot(normalize(vec3(vDir.x, 0.0, vDir.z)),
                                   normalize(vec3(0.35, 0.0, -1.0))), 0.0, 1.0), 5.0);
        col += uGlow * glow * (1.0 - clamp(abs(h) * 4.0, 0.0, 1.0)) * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }`
  })
);
sky.frustumCulled = false;
scene.add(sky);

/* ================== light rig ==================
   Blue-hour dusk: the model has no baked light, so all of this is real. */
function buildLights() {
  // sky/ground irradiance gives the concrete a vertical gradient instead of
  // reading as a flat matte cutout
  scene.add(new THREE.HemisphereLight(0x93a9dd, 0x2a1c3e, 1.15));
  scene.add(new THREE.AmbientLight(0x40325e, 0.35));

  const sun = new THREE.DirectionalLight(0xffd9b0, 2.1);
  sun.position.set(-70, 46, -95);
  if (!isMobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 320;
    const S = 75;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.25;   // world units = metres here
  }
  scene.add(sun);

  // cool bounce from the opposite side so shadow sides are not dead
  const bounce = new THREE.DirectionalLight(0x6f8fff, 0.5);
  bounce.position.set(80, 22, 70);
  scene.add(bounce);
}

/* ================== load ================== */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let world = null, controls = null, bounds = null;

function fixMaterials(root) {
  let doubled = 0, clamped = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;

      // Front-face culling would halve the fragment cost, but this model is a
      // covered courtyard viewed from inside, and its walls are single-sided
      // shells — culling them punches holes in the interior. Correctness wins.
      doubled++;

      m.envMapIntensity = 1.2;

      // Three fixtures use emissive_strength up to 60x. Left alone they blow
      // out the whole frame; one is a lime green that fights the palette.
      if (m.emissive && m.emissiveIntensity > 4) {
        // 60x reads as a white hole once ACES has had it; ~1.1 keeps the
        // fixture reading as lit without eating the geometry around it.
        m.emissiveIntensity = 1.1;
        const c = m.emissive;
        // pull anything strongly green toward the Decipher cyan
        if (c.g > 0.55 && c.b < 0.35) c.setHex(0x00ffcc);
        clamped++;
      }
    }
  });
  console.info(`plaza: ${doubled} materials kept double-sided, ${clamped} emitters clamped`);
}

async function load() {
  statusEl.textContent = "opening the plaza…";
  const gltf = await new Promise((res, rej) =>
    loader.load("/assets/models/plaza.glb",
      res,
      e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 88);
          fillEl.style.width = pct + "%";
        }
      },
      rej)
  );

  world = gltf.scene;
  fixMaterials(world);
  scene.add(world);
  fillEl.style.width = "94%";

  // Leave the model exactly where it was authored. Checked against the .blend:
  // "CP Floor" sits at (-0.3, 0.9, 0.0) in Blender and is 53.6 x 53.6 m, which
  // after the Y-up export puts the plaza on the world origin with its paving at
  // y = 0 already. Re-centring on the bounding box actively moves it away,
  // because the bounds are dominated by 150 m of background terrain.
  bounds = new THREE.Box3().setFromObject(world);
  const size = new THREE.Vector3(); bounds.getSize(size);
  console.info("plaza: model extent(m)", size.toArray().map(n => n.toFixed(1)).join(" x "),
    "| plaza paving is 53.6 m at the origin");

  statusEl.textContent = "lighting the plaza…";
  buildLights();

  // The plaza is a courtyard enclosed by a 45 m building mass with a colonnade
  // roof at ~9 m, so the viewpoint has to start INSIDE it. Standing height,
  // partway out toward the pillars, looking at the centre plate.
  camera.position.set(14, 5.5, 16);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.7;
  controls.screenSpacePanning = false;
  controls.minDistance = 3;
  controls.maxDistance = Math.max(size.x, size.z) * 1.15;
  // never let the camera drop below the paving
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.update();

  /* GPU containment — prevents Three.js canvas from triggering ancestor layout */
  stage.style.contain = "strict";

  statusEl.textContent = "compiling shaders…";
  renderer.compile(scene, camera);
  fillEl.style.width = "100%";
}

/* ================== boot ================== */
function enterPlaza() {
  bootEl.classList.add("gone");
  document.body.classList.add("live");
  try {
    localStorage.setItem("decipher_plaza_started", "true");
    sessionStorage.setItem("decipher_plaza_started", "true");
  } catch (e) {}
  if (hintEl) setTimeout(() => hintEl.classList.add("dim"), 6000);
}

load().then(() => {
  statusEl.textContent = "ready";
  startEl.hidden = false;
  raf = requestAnimationFrame(frame);

  const isSmartRefresh = (function() {
    try {
      return localStorage.getItem("decipher_plaza_started") === "true" ||
             sessionStorage.getItem("decipher_plaza_started") === "true";
    } catch(e) { return false; }
  })();

  if (isSmartRefresh) {
    enterPlaza();
  }
}).catch(err => {
  console.error("plaza failed to load:", err);
  statusEl.textContent = "could not load the plaza";
  document.getElementById("fail").hidden = false;
});

startEl.addEventListener("click", enterPlaza);

/* ================== loop ================== */
let raf = 0, lastT = performance.now(), frames = 0, accum = 0, lastQ = 0;
/* Idle-skip for controls.update() — OrbitControls damping math costs ~0.3ms/frame
   even when nothing moves. We skip it when the user has been idle for >2s. */
let _lastInteract = 0;
const _IDLE_THRESHOLD_MS = 2000;  // stop calling controls.update() after 2s idle

function _markInteract() { _lastInteract = performance.now(); }
renderer.domElement.addEventListener("pointerdown", _markInteract, { passive: true });
renderer.domElement.addEventListener("pointermove", _markInteract, { passive: true });
renderer.domElement.addEventListener("wheel", _markInteract, { passive: true });
renderer.domElement.addEventListener("touchstart", _markInteract, { passive: true });

function applySize() {
  renderer.setPixelRatio(BASE_PR * quality);
  renderer.setSize(innerWidth, innerHeight);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = now - lastT;
  lastT = now;

  // adaptive resolution, same contract as the homepage
  if (dt > 0 && dt < 400) {
    accum += dt; frames++;
    if (frames >= 55) {
      const fps = 1000 / (accum / frames);
      if (now - lastQ > 2600) {
        if (fps < 44 && quality > 0.55) { quality = Math.max(0.55, quality - 0.15); applySize(); lastQ = now; }
        else if (fps > 57 && quality < 1) { quality = Math.min(1, quality + 0.1); applySize(); lastQ = now; }
      }
      accum = 0; frames = 0;
    }
  }

  if (controls) {
    const idleMs = performance.now() - _lastInteract;
    // Always update for the first 2 seconds after any interaction so damping
    // fully settles; skip the update while truly idle.
    if (idleMs < _IDLE_THRESHOLD_MS) controls.update();
  }
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applySize();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
});
