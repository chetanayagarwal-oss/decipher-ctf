/* ============================================================
   DECIPHER — arcade cabinet homepage
   Modern three.js (ES modules), real HDR-ish environment
   reflections from the museum cubemap, UnrealBloom on the neon.
   The cabinet screen carries the whole briefing.
   ============================================================ */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const C = window.DECIPHER;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = innerWidth < 760;

/* ================== dom ================== */
const stage = document.getElementById("stage");
const boot = document.getElementById("boot");
const bootFill = document.getElementById("boot-fill");
const bootStatus = document.getElementById("boot-status");
const bootStart = document.getElementById("boot-start");
const hudHint = document.getElementById("hud-hint");
const soundBtn = document.getElementById("sound-btn");

document.querySelectorAll("[data-date-label]").forEach(e => e.textContent = C.eventDateLabel);
document.querySelectorAll("[data-venue]").forEach(e => e.textContent = C.venue.toUpperCase());
const registerBtn = document.getElementById("register-btn");
registerBtn.href = C.registerUrl;
registerBtn.textContent = C.registerLabel;
if (C.registerUrl && C.registerUrl !== "#") { registerBtn.target = "_blank"; registerBtn.rel = "noopener"; }

/* ================== countdown ================== */
{
  const t = new Date(C.eventDateISO).getTime();
  const box = document.getElementById("countdown");
  const el = { d: document.getElementById("cd-d"), h: document.getElementById("cd-h"), m: document.getElementById("cd-m"), s: document.getElementById("cd-s") };
  const pad = n => String(n).padStart(2, "0");
  (function tick() {
    const diff = t - Date.now();
    if (diff <= 0) {
      box.classList.add("live");
      el.d.textContent = "LI"; el.h.textContent = "VE"; el.m.textContent = "!!"; el.s.textContent = "!!";
      return;
    }
    el.d.textContent = pad(Math.floor(diff / 864e5));
    el.h.textContent = pad(Math.floor(diff / 36e5) % 24);
    el.m.textContent = pad(Math.floor(diff / 6e4) % 60);
    el.s.textContent = pad(Math.floor(diff / 1e3) % 60);
    setTimeout(tick, 1000);
  })();
}

/* ================== renderer ================== */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: false, powerPreference: "high-performance" });
} catch (err) {
  console.error("WebGL unavailable:", err);
  document.getElementById("fail").hidden = false;
  boot.classList.add("gone");
  throw err;
}
const BASE_PR = Math.min(devicePixelRatio || 1, isMobile ? 2 : 2);
let quality = 1;
renderer.setPixelRatio(BASE_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08010f);
// Loose enough to see across the plaza once it loads, dense enough that its
// far edge dissolves instead of ending in a hard seam.
scene.fog = new THREE.FogExp2(0x0d0620, 0.0032);

/* The CRT sits on a bezel raked back 60°, so its normal points up-and-forward.
   Putting the eye above the screen line reads it nearly face-on — the angle you
   get standing at a real cabinet. Base crops off the bottom of frame on purpose. */
const camera = new THREE.PerspectiveCamera(isMobile ? 50 : 40, innerWidth / innerHeight, 0.1, 4000);
const CAM = { y: 6.5, z: 19, look: 3.4, mobY: 7, mobZ: 24 };
camera.position.set(0, CAM.y, isMobile ? CAM.mobZ : CAM.z);
camera.lookAt(0, CAM.look, 0);

/* ================== post-processing ================== */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  isMobile ? 0.55 : 0.72,  // strength
  0.55,                     // radius
  0.62                      // threshold — only the neon blows out
);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setPixelRatio(BASE_PR);
composer.setSize(innerWidth, innerHeight);

/* ================== screen (CRT canvas) ================== */
const SW = 1024, SH = 768;
const sc = document.createElement("canvas");
sc.width = SW; sc.height = SH;
const g = sc.getContext("2d");

/* ---- page model ----
   The CRT gets a short headline at a size that survives being rendered onto a
   raked 3D plane; the full sentence goes to the HTML readout beside it so the
   words are always crisply readable. */
const pages = [];
const w = C.whatIsCTF;

pages.push({
  eyebrow: "CAMPUS CTF · " + C.eventDateLabel,
  head: "DECIPHER",
  pixel: true,
  body: "A campus-wide Capture The Flag. Crack the cipher, climb the board, claim the flag.",
  hint: "PRESS THE CONTROLS"
});
pages.push({ eyebrow: "WHAT IS A CTF?", head: "PUZZLES,\nNOT LECTURES", body: w[0] + " " + w[1], hint: "NEXT" });
pages.push({ eyebrow: "WHAT IS A CTF?", head: "FIND\nTHE FLAG", body: w[2] + " " + w[3], hint: "NEXT" });
pages.push({ eyebrow: "A FLAG LOOKS LIKE", head: C.flagExample, flag: true, body: w[4] + " Every challenge hides one. Submit it on the scoreboard to score.", hint: "NEXT" });

const RULE_START = pages.length;
C.rules.forEach((r, i) => pages.push({
  eyebrow: "RULE " + String(i + 1).padStart(2, "0") + " / " + String(C.rules.length).padStart(2, "0"),
  head: r.head, body: r.body, hint: "NEXT"
}));

pages.push({
  eyebrow: "THAT'S EVERYTHING",
  head: "GOOD LUCK,\nHACKER",
  body: "Register your team and turn up on " + C.eventDateLabel + ". No experience required.",
  hint: "PRESS TO REPLAY"
});

let page = 0, reveal = 1, revealTarget = 1, gridOff = 0;

/* ---- HTML readout beside the cabinet ---- */
const roEyebrow = document.getElementById("ro-eyebrow");
const roBody = document.getElementById("ro-body");
const roStep = document.getElementById("ro-step");
function syncReadout() {
  const p = pages[page];
  roEyebrow.textContent = p.eyebrow || "";
  roBody.textContent = p.body || "";
  roStep.textContent = String(page + 1).padStart(2, "0") + " / " + String(pages.length).padStart(2, "0");
  roBody.classList.remove("flick");
  void roBody.offsetWidth;   // restart the CSS flicker
  roBody.classList.add("flick");
}

/* ---- text helpers ---- */
const GLYPHS = "!<>-_\\/[]{}=+*^?#01ABCDEF$%&";
let revealCursor = 0; // running char offset while drawing one frame

function scrambled(text) {
  if (reveal >= 1) { revealCursor += text.length; return text; }
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const globalIdx = revealCursor + i;
    if (ch === " ") { out += " "; continue; }
    out += globalIdx < revealChars ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  revealCursor += text.length;
  return out;
}
let revealChars = 0;

function wrap(text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const wd of words) {
    const test = line ? line + " " + wd : wd;
    if (g.measureText(test).width > maxWidth && line) { lines.push(line); line = wd; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawScreen(time) {
  const p = pages[page];

  // --- void + perspective grid ---
  g.fillStyle = "#06030c";
  g.fillRect(0, 0, SW, SH);

  g.strokeStyle = "rgba(0,255,204,0.09)";
  g.lineWidth = 2;
  const vp = 150;
  for (let i = 0; i < 17; i++) {
    const r = i / 16;
    g.beginPath();
    g.moveTo(r * SW, vp);
    g.lineTo((r - 0.5) * 2.4 * SW + SW / 2, SH);
    g.stroke();
  }
  gridOff = (gridOff + 1.5) % 62;
  for (let i = 0; i < 12; i++) {
    const y = vp + Math.pow(i / 11, 2.2) * (SH - vp) + gridOff;
    if (y > vp && y < SH) { g.beginPath(); g.moveTo(0, y); g.lineTo(SW, y); g.stroke(); }
  }

  // --- content: one big headline, sized to survive the rake ---
  revealCursor = 0;
  g.textAlign = "center";

  if (p.eyebrow) {
    g.font = "700 40px 'JetBrains Mono', monospace";
    g.fillStyle = "#ff3fb0";
    g.shadowColor = "rgba(255,0,255,0.9)"; g.shadowBlur = 18;
    g.fillText(p.eyebrow, SW / 2, 130);
    g.shadowBlur = 0;
  }

  g.fillStyle = "#00ffcc";
  g.shadowColor = "rgba(0,255,204,0.85)";
  g.shadowBlur = 26;

  const lines = String(p.head).split("\n");
  if (p.pixel) g.font = "72px 'Press Start 2P', monospace";
  else if (p.flag) g.font = "700 62px 'JetBrains Mono', monospace";
  else g.font = "700 86px 'JetBrains Mono', monospace";

  // shrink to fit rather than overflow the bezel
  let size = p.pixel ? 72 : p.flag ? 62 : 86;
  const face = p.pixel ? "'Press Start 2P', monospace" : "'JetBrains Mono', monospace";
  const weight = p.pixel ? "" : "700 ";
  while (size > 26 && lines.some(l => g.measureText(l).width > SW - 150)) {
    size -= 4;
    g.font = weight + size + "px " + face;
  }

  if (p.flag) { g.fillStyle = "#ff3fb0"; g.shadowColor = "rgba(255,0,255,0.95)"; }

  const lh = size * 1.32;
  let y = SH / 2 - (lines.length - 1) * lh / 2 - 8;
  for (const line of lines) { g.fillText(scrambled(line), SW / 2, y); y += lh; }
  g.shadowBlur = 0;

  // --- hint + cursor ---
  g.font = "600 26px 'JetBrains Mono', monospace";
  g.fillStyle = "#9a83c0";
  g.fillText((p.hint || "") + (((time / 480) | 0) % 2 ? " " : "▍"), SW / 2, SH - 122);

  // --- rule progress dots ---
  const n = C.rules.length;
  const gap = 34, r = 7;
  const x0 = (SW - (n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const active = page === RULE_START + i;
    const done = page > RULE_START + i;
    g.beginPath();
    g.arc(x0 + i * gap, SH - 62, active ? r * 1.35 : r, 0, Math.PI * 2);
    g.fillStyle = active ? "#00ffcc" : done ? "#00816a" : "#3a2359";
    g.shadowColor = "rgba(0,255,204,0.85)";
    g.shadowBlur = active ? 14 : 0;
    g.fill();
  }
  g.shadowBlur = 0;

  // --- CRT scanlines + vignette ---
  g.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < SH; y += 5) g.fillRect(0, y, SW, 2);
  const vig = g.createRadialGradient(SW / 2, SH / 2, SH * 0.32, SW / 2, SH / 2, SH * 0.82);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vig;
  g.fillRect(0, 0, SW, SH);

  g.strokeStyle = "rgba(0,255,204,0.18)";
  g.lineWidth = 8;
  g.strokeRect(10, 10, SW - 20, SH - 20);
}

/* ================== marquee canvas ================== */
// Canvas aspect must match the marquee mesh (6.4 x 2.8 = 2.286:1) or the
// lettering gets stretched vertically.
const MW = 2048, MH = 896;
const mc = document.createElement("canvas");
mc.width = MW; mc.height = MH;
const mg = mc.getContext("2d");

function drawMarquee() {
  const cx = MW / 2, cy = MH / 2;
  mg.clearRect(0, 0, MW, MH);

  // --- backlit acrylic: bright behind the lettering, falling off to the edges
  const glow = mg.createRadialGradient(cx, cy, 0, cx, cy, MW * 0.62);
  glow.addColorStop(0.00, "#4a1170");
  glow.addColorStop(0.45, "#2a0a4a");
  glow.addColorStop(1.00, "#120428");
  mg.fillStyle = glow;
  mg.fillRect(0, 0, MW, MH);

  // faint horizontal banding, like light through textured acrylic
  mg.fillStyle = "rgba(255,255,255,0.022)";
  for (let y = 0; y < MH; y += 8) mg.fillRect(0, y, MW, 3);

  // --- housing: magenta neon tube inside a dark frame
  mg.strokeStyle = "#1a0730"; mg.lineWidth = 34;
  mg.strokeRect(17, 17, MW - 34, MH - 34);
  mg.strokeStyle = "#ff2ff5"; mg.lineWidth = 9;
  mg.shadowColor = "#ff00ff"; mg.shadowBlur = 46;
  mg.strokeRect(44, 44, MW - 88, MH - 88);
  mg.shadowBlur = 0;
  mg.strokeStyle = "rgba(0,255,204,0.5)"; mg.lineWidth = 2.5;
  mg.strokeRect(62, 62, MW - 124, MH - 124);

  // --- DECIPHER, and nothing else
  mg.textAlign = "center";
  mg.textBaseline = "middle";
  const TEXT = "DECIPHER";

  // fit the word to the panel instead of trusting a hardcoded size
  let size = 250;
  mg.font = `700 ${size}px Syncopate, sans-serif`;
  const maxW = MW - 300;
  while (size > 60 && mg.measureText(TEXT).width > maxW) {
    size -= 6;
    mg.font = `700 ${size}px Syncopate, sans-serif`;
  }
  mg.letterSpacing = Math.round(size * 0.06) + "px";
  mg.font = `700 ${size}px Syncopate, sans-serif`;

  // outer halo, built in passes so it reads as light not blur
  mg.shadowColor = "#ff00ff";
  for (const b of [90, 60, 34]) {
    mg.shadowBlur = b;
    mg.fillStyle = "rgba(255,120,255,0.30)";
    mg.fillText(TEXT, cx, cy);
  }
  mg.shadowColor = "#00ffcc";
  mg.shadowBlur = 46;
  mg.fillStyle = "rgba(120,255,235,0.22)";
  mg.fillText(TEXT, cx, cy);
  mg.shadowBlur = 0;

  // chrome face: cyan rim at the top, magenta beneath, white hot band across
  // the middle where a real backlit sign catches the tube
  const face = mg.createLinearGradient(0, cy - size * 0.62, 0, cy + size * 0.62);
  face.addColorStop(0.00, "#9ffff0");
  face.addColorStop(0.30, "#ffffff");
  face.addColorStop(0.52, "#ffffff");
  face.addColorStop(0.72, "#ffb9fb");
  face.addColorStop(1.00, "#c266ff");
  mg.fillStyle = face;
  mg.fillText(TEXT, cx, cy);

  // crisp edge so bloom has something solid to bite on
  mg.lineWidth = Math.max(2, size * 0.012);
  mg.strokeStyle = "rgba(255,255,255,0.85)";
  mg.strokeText(TEXT, cx, cy);

  mg.letterSpacing = "0px";
}

/* ================== cabinet ================== */
const root = new THREE.Group();      // yaw/pitch parallax
const body = new THREE.Group();
// Centre the cabinet on root's origin so parallax rotates about the cabinet's
// middle instead of swinging it around its back panel.
// local x 0→8.2 (depth), y 0→17 (height), z -3.55→3.23 (width)
body.position.set(-4.1, -8.5, 0.16);
root.add(body);
root.rotation.y = -Math.PI / 2;      // shape front (+X) faces camera
scene.add(root);

let screenTex, marqueeTex, joystickPivot, ball, btnA, btnB, indA, indB, screenMesh, controlPanel;
const clickable = [];

function buildCabinet(env) {
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x7b2cbf, roughness: 0.22, metalness: 0.15,
    clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.85
  });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x2c0a52, roughness: 0.75, metalness: 0.05, envMap: env, envMapIntensity: 0.25 });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x140826, roughness: 0.92, metalness: 0.1 });
  const panelMat = new THREE.MeshPhysicalMaterial({ color: 0x4b1d8a, roughness: 0.3, metalness: 0.35, clearcoat: 0.7, envMap: env, envMapIntensity: 0.7 });

  /* side profile (bezier-rounded arcade silhouette) */
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(6.4, 0);
  s.quadraticCurveTo(6.8, 0, 6.8, 0.4);
  s.lineTo(6.8, 6.4);
  s.quadraticCurveTo(6.8, 6.7, 7.0, 6.8);
  s.lineTo(8.0, 7.6);
  s.quadraticCurveTo(8.2, 7.8, 8.2, 8.1);
  s.lineTo(8.2, 8.8);
  s.quadraticCurveTo(8.2, 9.0, 8.1, 9.0);
  s.lineTo(6.4, 9.0);
  s.quadraticCurveTo(6.3, 9.0, 6.28, 9.05);
  s.lineTo(3.6, 13.7);
  s.quadraticCurveTo(3.5, 13.8, 3.6, 13.9);
  s.lineTo(4.9, 14.2);
  s.quadraticCurveTo(5.0, 14.25, 5.0, 14.4);
  s.lineTo(5.0, 16.8);
  s.quadraticCurveTo(5.0, 17.0, 4.8, 17.0);
  s.lineTo(0.2, 17.0);
  s.quadraticCurveTo(0, 17.0, 0, 16.8);
  s.lineTo(0, 0);

  const sideGeom = new THREE.ExtrudeGeometry(s, {
    depth: 0.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4, curveSegments: 14
  });
  for (const z of [-3.5, 3.18]) {
    const m = new THREE.Mesh(sideGeom, bodyMat);
    m.position.z = z;
    m.castShadow = m.receiveShadow = true;
    body.add(m);
    clickable.push(m);
  }

  const W = 6.4;
  const box = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    body.add(m);
    return m;
  };
  box(6.8, 0.2, W, 3.4, 0.1, 0, interiorMat);
  box(0.2, 6.6, W, 6.7, 3.3, 0, interiorMat);
  box(0.2, 17.0, W, 0.1, 8.5, 0, interiorMat);
  box(5.0, 0.2, W, 2.5, 16.9, 0, interiorMat);

  /* bezel + CRT */
  const bezel = box(5.37, 0.2, W, 4.94, 11.375, 0, bezelMat);
  bezel.rotation.z = -1.047;

  screenTex = new THREE.CanvasTexture(sc);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.minFilter = THREE.LinearFilter;
  screenTex.magFilter = THREE.LinearFilter;
  screenTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6.25, 4.7),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  );
  screenMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  screenMesh.position.set(0, 0.12, 0);
  bezel.add(screenMesh);
  clickable.push(screenMesh);

  /* screen glass — just a whisper of reflection; any more and it greys out the CRT */
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(6.25, 4.7),
    new THREE.MeshPhysicalMaterial({
      transparent: true, opacity: 0.045, roughness: 0.04, metalness: 0,
      envMap: env, envMapIntensity: 0.5, color: 0xffffff,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  glass.rotation.copy(screenMesh.rotation);
  glass.position.set(0, 0.2, 0);
  bezel.add(glass);

  /* marquee */
  drawMarquee();
  marqueeTex = new THREE.CanvasTexture(mc);
  marqueeTex.colorSpace = THREE.SRGBColorSpace;
  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(W, 2.8),
    new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false })
  );
  marquee.rotation.y = Math.PI / 2;
  marquee.position.set(5.03, 15.55, 0);
  body.add(marquee);

  /* control panel */
  controlPanel = box(2.3, 0.4, W, 7.25, 9.0, 0, panelMat);
  controlPanel.rotation.z = -0.56;
  clickable.push(controlPanel);

  joystickPivot = new THREE.Group();
  joystickPivot.position.set(0.4, 0.2, -1.8);
  controlPanel.add(joystickPivot);

  const joyBase = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 24, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0d0518, roughness: 0.75, metalness: 0.3, envMap: env })
  );
  joyBase.position.copy(joystickPivot.position);
  joyBase.castShadow = true;
  controlPanel.add(joyBase);

  const shaftGeom = new THREE.CylinderGeometry(0.07, 0.07, 1.1, 12);
  shaftGeom.translate(0, 0.55, 0);
  const shaft = new THREE.Mesh(shaftGeom, new THREE.MeshStandardMaterial({ color: 0xdcdcdc, metalness: 1, roughness: 0.16, envMap: env, envMapIntensity: 1.5 }));
  shaft.castShadow = true;
  joystickPivot.add(shaft);

  ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 28, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0xff2fd0, emissive: 0xff00ff, emissiveIntensity: 0.85,
      roughness: 0.12, clearcoat: 1, envMap: env, envMapIntensity: 1.2
    })
  );
  ball.position.set(0, 1.12, 0);
  ball.castShadow = true;
  joystickPivot.add(ball);
  clickable.push(ball);

  const mkBtn = (z, color, emissive) => {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.33, 0.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x0d0518, roughness: 0.8, metalness: 0.4, envMap: env })
    );
    base.position.set(0.4, 0.2, z);
    controlPanel.add(base);
    const geo = new THREE.CylinderGeometry(0.25, 0.25, 0.16, 24);
    geo.translate(0, 0.08, 0);
    const b = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color, emissive, emissiveIntensity: 0.9, roughness: 0.18, clearcoat: 1, envMap: env
    }));
    b.position.set(0.4, 0.2, z);
    b.castShadow = true;
    controlPanel.add(b);
    clickable.push(b);
    return b;
  };
  btnA = mkBtn(0.7, 0x00ffcc, 0x00ffcc);
  btnB = mkBtn(1.7, 0xff00ff, 0xff00ff);

  const mkInd = z => {
    const i = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0x55000e, emissiveIntensity: 0.5, roughness: 0.3 })
    );
    i.position.set(0.8, 0.2, z);
    controlPanel.add(i);
    return i;
  };
  indA = mkInd(-0.4); indB = mkInd(0.4);

  /* neon T-molding along the whole silhouette */
  const path = new THREE.Path();
  path.moveTo(6.8, 0.32);
  path.lineTo(6.8, 6.4);
  path.quadraticCurveTo(6.8, 6.7, 7.0, 6.8);
  path.lineTo(8.0, 7.6);
  path.quadraticCurveTo(8.2, 7.8, 8.2, 8.1);
  path.lineTo(8.2, 8.8);
  path.quadraticCurveTo(8.2, 9.0, 8.1, 9.0);
  path.lineTo(6.4, 9.0);
  path.quadraticCurveTo(6.3, 9.0, 6.28, 9.05);
  path.lineTo(3.6, 13.7);
  path.quadraticCurveTo(3.5, 13.8, 3.6, 13.9);
  path.lineTo(4.9, 14.2);
  path.quadraticCurveTo(5.0, 14.25, 5.0, 14.4);
  path.lineTo(5.0, 16.8);
  path.quadraticCurveTo(5.0, 17.0, 4.7, 17.0);

  // one continuous tube per side instead of dozens of boxes
  const pts2d = path.getPoints(70);
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xff4dff, toneMapped: false });
  for (const z of [-3.55, 3.23]) {
    const curve = new THREE.CatmullRomCurve3(pts2d.map(p => new THREE.Vector3(p.x, p.y, z)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.055, 8, false), trimMat);
    body.add(tube);
  }

  /* emissive under-glow strip */
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 0.07, W - 0.4),
    new THREE.MeshBasicMaterial({ color: 0x00ffcc, toneMapped: false })
  );
  strip.position.set(3.5, 0.06, 0);
  body.add(strip);
}

/* ================== lights ================== */
function buildLights() {
  scene.add(new THREE.AmbientLight(0x4c2a8f, 0.55));

  const key = new THREE.DirectionalLight(0xffe9ff, 1.5);
  key.position.set(14, 20, 16);
  key.castShadow = !isMobile;
  if (key.castShadow) {
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1; key.shadow.camera.far = 60;
    key.shadow.camera.left = -14; key.shadow.camera.right = 14;
    key.shadow.camera.top = 16; key.shadow.camera.bottom = -14;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.02;
  }
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xa855f7, 1.0);
  rim.position.set(-16, 9, -14);
  scene.add(rim);

  // screen spill onto the control panel + joystick
  const spill = new THREE.PointLight(0x00ffcc, 26, 11, 2);
  spill.position.set(3.6, 3.2, 0);
  body.add(spill);

  const marqueeSpill = new THREE.PointLight(0xff00ff, 16, 9, 2);
  marqueeSpill.position.set(6.2, 15.4, 0);
  body.add(marqueeSpill);

  const under = new THREE.PointLight(0x00ffcc, 12, 8, 2);
  under.position.set(3.5, 0.5, 0);
  body.add(under);
}

/* ================== floor ================== */
function buildFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x0a0418, roughness: 0.35, metalness: 0.65 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -8.55;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(150, 60, 0x7b2cbf, 0x2a0a4d);
  grid.position.y = -8.5;
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  scene.add(grid);
  placeholderGround = { floor, grid };

  // drifting motes for depth
  const N = isMobile ? 120 : 260;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 46;
    pos[i * 3 + 1] = -7 + Math.random() * 26;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.09, color: 0xc9a7ff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(motes);
  return motes;
}
let motes;
let placeholderGround = null;
let plazaRoot = null;
let plazaFade = 0;

/* ================== the plaza ==================
   The real central plaza, exported from Blender and Meshopt-compressed.
   It is streamed in AFTER the cabinet is interactive so first paint stays
   fast: the page is usable in ~1 MB, and the 8.6 MB plaza arrives behind it. */
const CABINET_UNITS_PER_METRE = 17 / 1.8;   // the cabinet is 17 units ≈ 1.8 m tall

async function loadPlaza() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((res, rej) =>
    loader.load("assets/models/plaza.glb", res, undefined, rej));

  const root = gltf.scene;

  // Measure what actually arrived rather than trusting numbers from the export.
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const centre = new THREE.Vector3(); box.getCenter(centre);

  // The model is in metres; the cabinet lives in its own unit space.
  const s = CABINET_UNITS_PER_METRE;
  root.scale.setScalar(s);

  // Centre the plaza horizontally on the cabinet, height sorted out below.
  root.position.set(-centre.x * s, 0, -centre.z * s);
  root.updateMatrixWorld(true);

  // Find the real walking surface by firing a ray straight down through the
  // middle. The bounding-box floor is NOT the ground: anything modelled below
  // grade (kerbs, foundations, stray geometry) would drop the whole plaza and
  // leave the camera underneath it, staring at the slab's underside.
  const down = new THREE.Raycaster(
    new THREE.Vector3(0, box.max.y * s + 50, 0),
    new THREE.Vector3(0, -1, 0),
    0,
    (box.max.y - box.min.y) * s + 200
  );
  const hits = down.intersectObject(root, true);
  const groundY = hits.length ? hits[0].point.y : box.min.y * s;
  if (!hits.length) console.warn("plaza: no ground hit at centre, using bbox floor");

  root.position.y = -8.5 - groundY;
  root.updateMatrixWorld(true);

  console.info(
    "plaza: size(m)", size.toArray().map(n => n.toFixed(1)).join(" x "),
    "| scale", s.toFixed(2),
    "| groundY", groundY.toFixed(2),
    "| placed at y", root.position.y.toFixed(2)
  );

  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;        // the plaza is scenery; only the cabinet casts
    o.receiveShadow = true;
    o.frustumCulled = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.transparent = true;      // so it can fade up
      m.opacity = 0;
      m.envMapIntensity = 0.6;
    }
  });

  scene.add(root);
  plazaRoot = root;

  // Retire the stand-in floor now that there is real ground.
  if (placeholderGround) {
    for (const o of Object.values(placeholderGround)) {
      scene.remove(o);
      o.geometry?.dispose();
      o.material?.dispose?.();
    }
    placeholderGround = null;
  }
  return root;
}

/* ================== audio ================== */
let ambience = null, thump = null, soundOn = true;
const srcFor = base => {
  const a = document.createElement("audio");
  return base + (a.canPlayType("audio/ogg") ? ".ogg" : ".mp3");
};
function startAudio() {
  try {
    ambience = new Audio(srcFor("assets/audio/background_ambience"));
    ambience.loop = true; ambience.volume = 0;
    ambience.play().then(() => {
      let v = 0;
      const fade = setInterval(() => {
        v = Math.min(0.28, v + 0.02);
        ambience.volume = soundOn ? v : 0;
        if (v >= 0.28) clearInterval(fade);
      }, 90);
    }).catch(() => {});
    thump = new Audio(srcFor("assets/audio/thump_hover"));
    thump.volume = 0.45;
  } catch (e) { /* audio is optional */ }
}
function click() {
  if (!soundOn || !thump) return;
  try { thump.currentTime = 0; thump.play().catch(() => {}); } catch (e) {}
}
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "♪ ON" : "♪ OFF";
  if (ambience) ambience.volume = soundOn ? 0.28 : 0;
});

/* ================== interaction ================== */
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
// must start at the cabinet's resting yaw, or the loop lerps it away from camera
const target = { yaw: -Math.PI / 2, pitch: 0 };
let live = false, busy = false, hintDimmed = false;

function flashIndicators() {
  const set = (m, c, e, i) => { m.material.color.setHex(c); m.material.emissive.setHex(e); m.material.emissiveIntensity = i; };
  set(indA, 0x00ffcc, 0x00ffcc, 2.4);
  setTimeout(() => set(indB, 0x00ffcc, 0x00ffcc, 2.4), 90);
  setTimeout(() => { set(indA, 0xff3b5c, 0x55000e, 0.5); set(indB, 0xff3b5c, 0x55000e, 0.5); }, 440);
}

function advance() {
  if (busy || !live) return;
  busy = true;
  page = (page + 1) % pages.length;
  reveal = 0; revealTarget = 1;
  syncReadout();
  flashIndicators();
  click();
  setTimeout(() => { busy = false; }, 260);
  if (!hintDimmed) { hintDimmed = true; hudHint.classList.add("dim"); }
}

/* springy little animations without a tween library */
const springs = [];
function spring(obj, prop, to, back, ms) {
  const from = obj[prop];
  springs.push({ obj, prop, from, to, back, t0: performance.now(), ms });
}
function stepSprings(now) {
  for (let i = springs.length - 1; i >= 0; i--) {
    const s = springs[i];
    const k = Math.min(1, (now - s.t0) / s.ms);
    const tri = k < 0.5 ? k * 2 : (1 - k) * 2;      // out and back
    s.obj[s.prop] = s.from + (s.to - s.from) * tri;
    if (k >= 1) { s.obj[s.prop] = s.back !== undefined ? s.back : s.from; springs.splice(i, 1); }
  }
}

addEventListener("pointermove", e => {
  const nx = (e.clientX / innerWidth) * 2 - 1;
  const ny = (e.clientY / innerHeight) * 2 - 1;
  pointer.set(nx, -ny);
  const amp = reduceMotion ? 0.12 : 0.42;
  target.yaw = -Math.PI / 2 + nx * amp;
  target.pitch = ny * (reduceMotion ? 0.05 : 0.16);
});

renderer.domElement.addEventListener("click", e => {
  if (!live) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  const hit = ray.intersectObjects(clickable, true)[0];
  if (!hit) return;
  const o = hit.object;
  if (o === ball || o.parent === joystickPivot) {
    spring(joystickPivot.rotation, "x", (Math.random() - 0.5) * 0.55, 0, 200);
    spring(joystickPivot.rotation, "z", (Math.random() - 0.5) * 0.55, 0, 200);
  } else if (o === btnA || o === btnB) {
    spring(o.position, "y", 0.08, 0.2, 160);
  } else {
    spring(joystickPivot.rotation, "x", 0.3, 0, 190);
  }
  advance();
});

addEventListener("keydown", e => {
  if (!live) return;
  if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    spring(joystickPivot.rotation, "x", 0.3, 0, 190);
    advance();
  }
});

/* cursor feedback */
let lastHover = 0;
function hoverCheck(now) {
  if (!live || now - lastHover < 110) return;
  lastHover = now;
  ray.setFromCamera(pointer, camera);
  document.body.style.cursor = ray.intersectObjects(clickable, true).length ? "pointer" : "default";
}

/* ================== boot sequence ================== */
async function bootUp() {
  const steps = [
    ["loading typefaces…", async () => {
      await Promise.all([
        document.fonts.load("700 110px Syncopate"),
        document.fonts.load("600 31px 'JetBrains Mono'"),
        document.fonts.load("700 40px 'JetBrains Mono'"),
        document.fonts.load("46px 'Press Start 2P'")
      ]).catch(() => {});
      await document.fonts.ready.catch(() => {});
    }],
    ["mapping reflections…", async () => {
      const loader = new THREE.CubeTextureLoader().setPath("assets/cubemap/");
      const env = await new Promise(res => {
        loader.load(["px.webp", "nx.webp", "py.webp", "ny.webp", "pz.webp", "nz.webp"],
          t => res(t), undefined, () => res(null));
      });
      if (env) { env.colorSpace = THREE.SRGBColorSpace; scene.environment = env; }
      return env;
    }],
    ["assembling cabinet…", env => buildCabinet(scene.environment)],
    ["wiring the neon…", () => buildLights()],
    ["laying the floor…", () => { motes = buildFloor(); }],
    ["compiling shaders…", () => { drawScreen(0); screenTex.needsUpdate = true; renderer.compile(scene, camera); }]
  ];

  for (let i = 0; i < steps.length; i++) {
    bootStatus.textContent = steps[i][0];
    await steps[i][1]();
    bootFill.style.width = Math.round(((i + 1) / steps.length) * 100) + "%";
    await new Promise(r => setTimeout(r, 70));
  }
  bootStatus.textContent = "ready";
  bootStart.hidden = false;
}

bootStart.addEventListener("click", () => {
  boot.classList.add("gone");
  document.body.classList.add("live");
  live = true;
  startAudio();
  click();
  reveal = 0; revealTarget = 1;
  syncReadout();

  // Stream the plaza in behind the cabinet. Deliberately not awaited: the page
  // is already interactive, and a failure here must not break the homepage.
  loadPlaza().catch(err => console.warn("plaza unavailable, keeping grid:", err));
});

/* ================== render loop ================== */
let raf = 0, lastT = performance.now(), frames = 0, accum = 0, lastQ = 0, lastScreen = 0;

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = now - lastT;
  lastT = now;

  /* adaptive resolution */
  if (live && dt > 0 && dt < 400) {
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

  /* screen redraw — 30fps is plenty for a CRT */
  reveal += (revealTarget - reveal) * 0.09;
  if (reveal > 0.995) reveal = 1;
  revealChars = Math.floor(reveal * 340);
  if (now - lastScreen > 33) {
    lastScreen = now;
    drawScreen(now);
    screenTex.needsUpdate = true;
  }

  stepSprings(now);

  /* fade the plaza up once it has arrived */
  if (plazaRoot && plazaFade < 1) {
    plazaFade = Math.min(1, plazaFade + dt / 1400);
    const e = plazaFade * plazaFade * (3 - 2 * plazaFade);   // smoothstep
    plazaRoot.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) m.opacity = e;
    });
    if (plazaFade >= 1) {
      // Opaque again once faded: transparent materials sort per-frame and cost more.
      plazaRoot.traverse(o => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m) { m.transparent = false; m.opacity = 1; }
      });
    }
  }

  /* parallax + idle float */
  root.rotation.y += (target.yaw - root.rotation.y) * 0.055;
  root.rotation.x += (target.pitch - root.rotation.x) * 0.055;
  if (!reduceMotion) body.position.y = -8.5 + Math.sin(now * 0.0013) * 0.12;
  if (motes) motes.rotation.y = now * 0.000035;

  hoverCheck(now);
  composer.render();
}

function applySize() {
  const pr = BASE_PR * quality;
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
}

addEventListener("resize", () => {
  const narrow = innerWidth < 760;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = narrow ? 50 : 40;
  camera.position.set(0, narrow ? CAM.mobY : CAM.y, narrow ? CAM.mobZ : CAM.z);
  camera.lookAt(0, CAM.look, 0);
  camera.updateProjectionMatrix();
  applySize();
  bloom.resolution.set(innerWidth, innerHeight);
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

bootUp().then(() => { raf = requestAnimationFrame(frame); });
