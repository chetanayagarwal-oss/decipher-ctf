/* ============================================================
   DECIPHER — THE WORLD

   The 3D world, camera path, look keyframes, chunked loading and
   split-screen reveal come from Andrew Woan's codrops-fan-museum
   (MIT, https://github.com/andrewwoan/codrops-fan-museum).
   The exhibit text is Decipher's.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

const C = window.DECIPHER;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = innerWidth < 764;

document.querySelectorAll("[data-date-label]").forEach(e => e.textContent = C.eventDateLabel);

/* ================== renderer ================== */
const host = document.getElementById("canvas-host");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !narrow, powerPreference: "high-performance" });
} catch (err) {
  console.error("WebGL unavailable:", err);
  document.getElementById("webgl-fail").hidden = false;
  document.getElementById("loading-screen").style.display = "none";
  throw err;
}
const BASE_PR = Math.min(devicePixelRatio || 1, narrow ? 1.25 : 1.5);
let quality = 1;
renderer.setPixelRatio(BASE_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x403e3e, 0.0125);

/* museum rig: group rides the curve, camera adds mouse parallax */
const cameraGroup = new THREE.Group();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 400);
cameraGroup.add(camera);
scene.add(cameraGroup);

/* ================== camera path (from the museum) ================== */
const cameraCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(6.577763360438033, narrow ? 12 : 8.856284964410769, narrow ? 31.640379680866076 : 20.640379680866076),
  new THREE.Vector3(6.129, 9.16248066285629, -9.514943289676541),
  new THREE.Vector3(6.139, 9.16248066285629, -25.514943289676541),
  new THREE.Vector3(6.121, 8.58385544864918, -35.5852064804525),
  new THREE.Vector3(6.1, 8.6385544864918, -39.15952064804525),
  new THREE.Vector3(-0.6, 9.095692752216793, -44.84820648294106),
  new THREE.Vector3(12.932496218694319, 9.072285787822777, -44.69183302104726),
  new THREE.Vector3(7.458086050034908, 8.73452167183442, -40.5039287861451),
  new THREE.Vector3(5.984547855718962, 14.010925354273802, -21.804431479523224),
  new THREE.Vector3(7.75929286794663, 18.796052392871356, 0.810478836223162),
  new THREE.Vector3(-0.25929286794663, 16.796052392871356, 6.810478836223162),
  new THREE.Vector3(6.577763360438033, narrow ? 12 : 8.856284964410769, narrow ? 31.640379680866076 : 20.640379680866076)
], true);

const E = (x, y, z) => new THREE.Euler(x, y, z);
const rotationTargets = [
  { progress: 0,    rotation: E(narrow ? -0.1 : 0, 0.00479125845971665, 0.000597178775549178) },
  { progress: 0.07, rotation: E(-0.04277011042878412, -0.00866103427209704, -0.00037065478236413864) },
  { progress: 0.2,  rotation: E(-0.04277011042878412, -0.00866103427209704, -0.00037065478236413864) },
  { progress: 0.25, rotation: E(-0.8851668165265633, 0.003786054557443451, 0.003635853660383532) },
  { progress: 0.32, rotation: E(-0.086339131170143176, 0.398491298300412, -0.1343243154257062) },
  { progress: 0.36, rotation: E(-0.086339131170143176, 0.708491298300412, -0.0143243154257062) },
  { progress: 0.41, rotation: E(-0.046339131170143176, 0.0298491298300412, 0.07343243154257062) },
  { progress: 0.49, rotation: E(-0.026015217004565497, -0.019361968160347905, -0.0405037879475436998) },
  { progress: 0.61, rotation: E(-0.038854519527552256, -0.5056419965908544, -0.01657632912947032) },
  { progress: 0.65, rotation: E(-0.3535558580154114, 0.05311086541781096, 0.005869310093750261) },
  { progress: 0.75, rotation: E(-0.05535558580154114, 0.32017130864367585, 0.02072972153013933) },
  { progress: 0.8,  rotation: E(-0.13535558580154114, -0.13017130864367585, 0.02072972153013933) },
  { progress: 0.9,  rotation: E(0.01492353012229583, -0.073017130864367585, 0.02072972153013933) },
  { progress: 1,    rotation: E(narrow ? -0.1 : 0, 0.00479125845971665, 0.000597178775549178) }
];

/* Pre-allocated Quaternion singletons — eliminates 2 GC-pressuring allocations
   every single animation frame (lerpedRotation is called in frame()). */
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qout = new THREE.Quaternion();

function lerpedRotation(p) {
  for (let i = 0; i < rotationTargets.length - 1; i++) {
    const a = rotationTargets[i], b = rotationTargets[i + 1];
    if (p >= a.progress && p <= b.progress) {
      const f = (p - a.progress) / (b.progress - a.progress);
      _qa.setFromEuler(a.rotation);
      _qb.setFromEuler(b.rotation);
      return _qout.slerpQuaternions(_qa, _qb, f);
    }
  }
  return _qout.setFromEuler(rotationTargets[rotationTargets.length - 1].rotation);
}

/* ================== exhibit content (Decipher) ==================
   Five plaques live in Ninth.glb. Only the two things that exist:
   what a CTF is, and the rules. */
const EXHIBITS = {
  "Ninth_TheCollective_Baked": {
    label: "WHAT IS\nA CTF?",
    eyebrow: "EXHIBIT 01",
    title: "What is a CTF?",
    body: [C.whatIsCTF[0], C.whatIsCTF[1], C.whatIsCTF[4]]
  },
  "Ninth_Webzibition_Baked": {
    label: "THE\nFLAG",
    eyebrow: "EXHIBIT 02",
    title: "The Flag",
    body: [
      C.whatIsCTF[2] + " " + C.whatIsCTF[3],
      "A flag looks like this: " + C.flagExample
    ]
  },
  "Ninth_DemosHub_Baked": {
    label: "RULES\n01–02",
    eyebrow: "RULES 01 – 02",
    title: "Rules of Engagement",
    body: C.rules.slice(0, 2).map(r => r.head + " — " + r.body)
  },
  "Ninth_DesignerSpotlight_Baked": {
    label: "RULES\n03–04",
    eyebrow: "RULES 03 – 04",
    title: "Rules of Engagement",
    body: C.rules.slice(2, 4).map(r => r.head + " — " + r.body)
  },
  "Ninth_DeveloperSpotlight_Baked": {
    label: "RULES\n05–06",
    eyebrow: "RULES 05 – 06",
    title: "Rules of Engagement",
    body: C.rules.slice(4, 6).map(r => r.head + " — " + r.body)
  }
};

/* ================== loaders ================== */
const ktx2 = new KTX2Loader().setTranscoderPath("assets/basis/").detectSupport(renderer);
const draco = new DRACOLoader().setDecoderPath("assets/draco/");
const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2).setDRACOLoader(draco);

/* The museum bakes all its lighting into the textures, then swaps the
   materials to unlit basic — no lights in the scene at all. */
const basicCache = new Map();
function toBasic(mat) {
  if (basicCache.has(mat.uuid)) return basicCache.get(mat.uuid);
  const b = new THREE.MeshBasicMaterial({
    map: mat.map || null,
    color: mat.map ? 0xffffff : (mat.color || new THREE.Color(0xffffff)),
    transparent: mat.transparent,
    opacity: mat.opacity,
    alphaTest: mat.alphaTest,
    side: mat.side,
    toneMapped: false
  });
  if (b.map) b.map.colorSpace = THREE.SRGBColorSpace;
  basicCache.set(mat.uuid, b);
  return b;
}

const plaques = [];   // clickable exhibit meshes

function makeLabel(text) {
  const cw = 512, ch = 512;
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const g = c.getContext("2d");
  g.fillStyle = "#0b0318";
  g.fillRect(0, 0, cw, ch);
  g.strokeStyle = "#00ffcc"; g.lineWidth = 10;
  g.strokeRect(14, 14, cw - 28, ch - 28);
  g.strokeStyle = "#ff00ff"; g.lineWidth = 4;
  g.strokeRect(30, 30, cw - 60, ch - 60);
  g.textAlign = "center"; g.textBaseline = "middle";
  const lines = text.split("\n");
  g.font = "700 62px 'JetBrains Mono', monospace";
  g.fillStyle = "#00ffcc";
  g.shadowColor = "rgba(0,255,204,0.9)"; g.shadowBlur = 22;
  let y = ch / 2 - (lines.length - 1) * 42;
  for (const l of lines) { g.fillText(l, cw / 2, y); y += 84; }
  g.shadowBlur = 0;
  g.font = "600 26px 'JetBrains Mono', monospace";
  g.fillStyle = "#b39ddb";
  g.fillText("CLICK TO READ", cw / 2, ch - 74);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function processModel(gltf) {
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(toBasic) : toBasic(o.material);
    o.frustumCulled = true;

    const ex = EXHIBITS[o.name];
    if (ex) {
      o.userData.exhibit = ex;
      plaques.push(o);

      /* Re-label the plaque: the baked texture reads Codrops, so lay a
         Decipher panel just in front of it, sized to the plaque itself. */
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      const size = new THREE.Vector3(); bb.getSize(size);
      const centre = new THREE.Vector3(); bb.getCenter(centre);
      // plaques are flat: the smallest axis is the facing direction
      const dims = [size.x, size.y, size.z];
      const thin = dims.indexOf(Math.min(...dims));
      const w = thin === 0 ? size.z : size.x;
      const h = thin === 1 ? size.z : size.y;

      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.92, h * 0.92),
        new THREE.MeshBasicMaterial({ map: makeLabel(ex.label), toneMapped: false })
      );
      panel.position.copy(centre);
      const off = Math.min(...dims) * 0.5 + 0.012;
      if (thin === 0) { panel.rotation.y = Math.PI / 2; panel.position.x += off; }
      else if (thin === 1) { panel.rotation.x = -Math.PI / 2; panel.position.y += off; }
      else { panel.position.z += off; }
      panel.userData.exhibit = ex;
      o.add(panel);
      plaques.push(panel);
    }
  });
  scene.add(gltf.scene);
}

function load(url) {
  return new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
}

/* ================== HUD ================== */
const captionEl = document.getElementById("caption");
const capEyebrow = document.getElementById("caption-eyebrow");
const capText = document.getElementById("caption-text");
const captions = [
  { from: 0.00, to: 0.06, eyebrow: "DECIPHER", text: "WELCOME IN" },
  { from: 0.08, to: 0.22, eyebrow: C.eventDateLabel, text: "CAMPUS CTF" },
  { from: 0.26, to: 0.38, eyebrow: "LOOK AROUND", text: "THE HALL" },
  { from: 0.40, to: 0.60, eyebrow: "CLICK A PLAQUE TO READ", text: "THE EXHIBITS" },
  { from: 0.64, to: 0.80, eyebrow: "ON YOUR WAY OUT", text: "GOOD LUCK, HACKER" }
];
let currentCaption = -1;
function updateCaption(p) {
  let found = -1;
  for (let i = 0; i < captions.length; i++) if (p >= captions[i].from && p <= captions[i].to) { found = i; break; }
  if (found === currentCaption) return;
  currentCaption = found;
  if (found === -1) { captionEl.classList.add("hidden-caption"); return; }
  capEyebrow.textContent = captions[found].eyebrow;
  capText.textContent = captions[found].text;
  captionEl.classList.remove("hidden-caption");
}

/* ================== modal ================== */
const modal = document.getElementById("modal");
const modalEyebrow = document.getElementById("modal-eyebrow");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
let modalOpen = false;

function openModal(ex) {
  modalOpen = true;
  modalEyebrow.textContent = ex.eyebrow;
  modalTitle.textContent = ex.title;
  modalBody.innerHTML = ex.body.map(t => "<p></p>").join("");
  [...modalBody.children].forEach((p, i) => p.textContent = ex.body[i]);
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("show"));
  playThump();
}
function closeModal() {
  modalOpen = false;
  modal.classList.remove("show");
  setTimeout(() => { modal.hidden = true; }, 320);
}
document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
addEventListener("keydown", e => { if (e.key === "Escape" && modalOpen) closeModal(); });

/* ================== audio ================== */
let ambience = null, thump = null, soundOn = true;
const soundBtn = document.getElementById("sound-toggle");
try {
  const savedSound = localStorage.getItem("decipher_sound");
  if (savedSound !== null) {
    soundOn = savedSound === "on";
    if (soundBtn) soundBtn.textContent = soundOn ? "♪ ON" : "♪ OFF";
  }
} catch (e) {}
const srcFor = b => { const a = document.createElement("audio"); return b + (a.canPlayType("audio/ogg") ? ".ogg" : ".mp3"); };
function startAudio() {
  try {
    ambience = new Audio(srcFor("assets/audio/background_ambience"));
    ambience.loop = true; ambience.volume = 0;
    ambience.play().then(() => {
      let v = 0;
      const f = setInterval(() => { v = Math.min(0.3, v + 0.02); ambience.volume = soundOn ? v : 0; if (v >= 0.3) clearInterval(f); }, 90);
    }).catch(() => {});
    thump = new Audio(srcFor("assets/audio/thump_hover"));
    thump.volume = 0.45;
  } catch (e) {}
}
function playThump() {
  if (!soundOn || !thump) return;
  try { thump.currentTime = 0; thump.play().catch(() => {}); } catch (e) {}
}
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "♪ ON" : "♪ OFF";
  try { localStorage.setItem("decipher_sound", soundOn ? "on" : "off"); } catch (e) {}
  if (ambience) ambience.volume = soundOn ? 0.3 : 0;
});

/* ================== input (museum scheme) ================== */
let scrollProgress = 0, targetProgress = 0;
const SCROLL_SPEED = 0.005, LERP = 0.1;
let entered = false, swiping = false, lastTouchY = null;
const posOffset = new THREE.Vector3();
const rotOffset = new THREE.Euler();
const pointer = new THREE.Vector2();

function nudge(a) {
  if (!entered || modalOpen) return;
  targetProgress += a;
  document.body.classList.add("moved");
}

addEventListener("wheel", e => {
  e.preventDefault();
  let px = e.deltaY;
  if (e.deltaMode === 1) px *= 16; else if (e.deltaMode === 2) px *= 100;
  nudge(Math.sign(px) * SCROLL_SPEED * Math.min(Math.abs(px) / 100, 1));
}, { passive: false });

addEventListener("mousemove", e => {
  const mx = (e.clientX / innerWidth) * 2 - 1;
  const my = (e.clientY / innerHeight) * 2 - 1;
  const s = reduceMotion ? 0.06 : 0.25;
  const r = reduceMotion ? 0.03 : 0.1;
  posOffset.x = mx * s; posOffset.y = my * s;
  rotOffset.x = my * r; rotOffset.y = mx * r;
  pointer.set(mx, -my);
});
addEventListener("mousedown", e => { if (e.button === 0) swiping = true; });
addEventListener("mousemove", e => { if (swiping) nudge(Math.sign(e.movementY) * SCROLL_SPEED * 0.2); });
addEventListener("mouseup", () => { swiping = false; });

addEventListener("touchstart", e => { swiping = true; lastTouchY = e.touches[0].clientY; }, { passive: true });
addEventListener("touchmove", e => {
  if (!swiping || lastTouchY === null) return;
  nudge(Math.sign(e.touches[0].clientY - lastTouchY) * SCROLL_SPEED * 0.3);
  lastTouchY = e.touches[0].clientY;
}, { passive: true });
addEventListener("touchend", () => { swiping = false; lastTouchY = null; });

addEventListener("keydown", e => {
  const map = { ArrowDown: 0.006, ArrowRight: 0.006, PageDown: 0.03, " ": 0.012, ArrowUp: -0.006, ArrowLeft: -0.006, PageUp: -0.03 };
  if (e.key in map && !modalOpen) { e.preventDefault(); nudge(map[e.key]); }
});

/* plaque picking — only while the exhibits are in view, as in the museum */
const ray = new THREE.Raycaster();
const INTERACT = [0.399, 0.6];
const inRange = () => scrollProgress >= INTERACT[0] && scrollProgress <= INTERACT[1];

renderer.domElement.addEventListener("click", e => {
  if (!entered || modalOpen || !inRange()) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  const hit = ray.intersectObjects(plaques, false)[0];
  if (hit) openModal(hit.object.userData.exhibit);
});

let lastHover = 0;
function hoverCheck(now) {
  if (!entered || now - lastHover < 120) return;
  lastHover = now;
  if (modalOpen || !inRange()) { document.body.style.cursor = "auto"; return; }
  ray.setFromCamera(pointer, camera);
  document.body.style.cursor = ray.intersectObjects(plaques, false).length ? "pointer" : "auto";
}

/* ================== chunked load ================== */
const barFill = document.getElementById("ls-bar-fill");
const pctEl = document.getElementById("ls-pct");
const hintEl = document.getElementById("ls-hint");
const enterBtn = document.getElementById("ls-enter");
const progressWrap = document.getElementById("ls-progress");
const loadingScreen = document.getElementById("loading-screen");

const CHUNKS = [
  { label: "opening the doors…",     files: ["First", "Second", "Background"] },
  { label: "raising the halls…",     files: ["Third", "Fourth", "Fifth"] },
  { label: "lighting the galleries…", files: ["Sixth", "Seventh", "Eighth"] },
  { label: "hanging the exhibits…",  files: ["Ninth", "Tenth", "Eleventh"] }
];

async function boot() {
  hintEl.textContent = "loading typefaces…";
  await Promise.all([
    document.fonts.load("700 62px 'JetBrains Mono'"),
    document.fonts.load("600 26px 'JetBrains Mono'")
  ]).catch(() => {});

  hintEl.textContent = "painting the sky…";
  const env = await new Promise(res => {
    new THREE.CubeTextureLoader().setPath("assets/cubemap/")
      .load(["px.webp", "nx.webp", "py.webp", "ny.webp", "pz.webp", "nz.webp"], t => res(t), undefined, () => res(null));
  });
  if (env) {
    env.colorSpace = THREE.SRGBColorSpace;
    scene.background = env;
    scene.backgroundRotation = new THREE.Euler(0, Math.PI / 2, 0);
  }
  step(1, CHUNKS.length + 2);

  /* Pipelined chunk loading: fetch chunk N+1 while processModel(N) runs.
     Cuts perceived load time by ~30-40% on fast connections. */
  let nextFetch = Promise.all(
    CHUNKS[0].files.map(f => load("assets/models/" + f + ".glb").catch(err => {
      console.warn("could not load", f, err);
      return null;
    }))
  );

  for (let i = 0; i < CHUNKS.length; i++) {
    hintEl.textContent = CHUNKS[i].label;
    // Await the pre-fetched models for this chunk
    const models = await nextFetch;
    // Start fetching the NEXT chunk in parallel while we process this one
    if (i + 1 < CHUNKS.length) {
      nextFetch = Promise.all(
        CHUNKS[i + 1].files.map(f => load("assets/models/" + f + ".glb").catch(err => {
          console.warn("could not load", f, err);
          return null;
        }))
      );
    }
    models.filter(Boolean).forEach(processModel);
    step(i + 2, CHUNKS.length + 2);
  }

  hintEl.textContent = "final decryption…";
  cameraGroup.position.copy(cameraCurve.getPoint(0));
  renderer.compile(scene, camera);
  step(CHUNKS.length + 2, CHUNKS.length + 2);

  hintEl.textContent = "slowly scroll or drag to navigate";
  progressWrap.style.display = "none";
  enterBtn.hidden = false;
}
function step(i, total) {
  const pct = Math.round((i / total) * 100);
  barFill.style.width = pct + "%";
  pctEl.textContent = pct + "%";
}

function enterVault() {
  loadingScreen.classList.add("revealed", "gone");
  document.body.classList.add("entered");
  entered = true;
  try {
    localStorage.setItem("decipher_vault_started", "true");
    sessionStorage.setItem("decipher_vault_started", "true");
  } catch (e) {}
  startAudio();
  playThump();
}

enterBtn.addEventListener("click", enterVault);

/* ================== render loop ================== */
const rotBuffer = new THREE.Quaternion().setFromEuler(rotationTargets[0].rotation);
const basePoint = new THREE.Vector3();
let raf = 0, lastT = performance.now(), frames = 0, accum = 0, lastQ = 0;

function applySize() {
  renderer.setPixelRatio(BASE_PR * quality);
  renderer.setSize(innerWidth, innerHeight);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = now - lastT;
  lastT = now;

  if (entered && dt > 0 && dt < 400) {
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

  scrollProgress = THREE.MathUtils.lerp(scrollProgress, targetProgress, LERP);
  // The path is a closed loop. Shift both values together so momentum carries
  // across the seam instead of snapping the visitor back to the entrance.
  if (scrollProgress > 1) { scrollProgress -= 1; targetProgress -= 1; }
  else if (scrollProgress < 0) { scrollProgress += 1; targetProgress += 1; }

  cameraCurve.getPoint(scrollProgress, basePoint);
  cameraGroup.position.lerp(basePoint, 0.1);

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, posOffset.x, 0.1);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, -posOffset.y, 0.1);
  camera.position.z = 0;

  rotBuffer.slerp(lerpedRotation(scrollProgress), 0.05);
  cameraGroup.quaternion.copy(rotBuffer);

  camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, -rotOffset.x, 0.1);
  camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, -rotOffset.y, 0.1);

  if (entered) { updateCaption(scrollProgress); hoverCheck(now); }

  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applySize();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(raf); raf = 0;
    if (ambience) ambience.pause();
  } else if (!raf) {
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    if (ambience && soundOn) ambience.play().catch(() => {});
  }
});

boot().then(() => {
  raf = requestAnimationFrame(frame);
  const isSmartRefresh = (function() {
    try {
      return localStorage.getItem("decipher_vault_started") === "true" ||
             sessionStorage.getItem("decipher_vault_started") === "true";
    } catch(e) { return false; }
  })();
  if (isSmartRefresh) {
    enterVault();
  }
});
