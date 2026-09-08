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
import { buildSpace } from "./space.js";

/* ================== Web Worker — OffscreenCanvas ==================
   drawScreen() and drawMarquee() run off the main thread.
   Falls back to inline draw if OffscreenCanvas / Worker is unsupported. */
const WORKER_SUPPORTED = typeof OffscreenCanvas !== "undefined" && typeof Worker !== "undefined";
let _screenWorker = null;
let _workerReady = false;
// Pending bitmaps posted back by the worker
let _pendingScreenBitmap = null;
let _pendingMarqueeBitmap = null;

/* "space" (default, the homepage) or "plaza" (the /lnmiit-cp route). */
const SCENE = window.DECIPHER_SCENE === "plaza" ? "plaza" : "space";

const C = window.DECIPHER;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = innerWidth < 760;

/* ================== state storage ================== */
const storage = {
  get(key) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    } catch (e) {}
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  set(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) {}
    try { sessionStorage.setItem(key, String(val)); } catch (e) {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    try { sessionStorage.removeItem(key); } catch (e) {}
  }
};

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

const wordmarkEl = document.querySelector(".wordmark");
if (wordmarkEl) {
  wordmarkEl.addEventListener("click", () => {
    try {
      sessionStorage.removeItem("decipher_entered");
      localStorage.removeItem("decipher_started");
    } catch (e) {}
    storage.remove("decipher_page");
  });
}

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
const BASE_PR = Math.min(devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
let quality = 1;
renderer.setPixelRatio(BASE_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
/* GPU containment — prevents Three.js canvas from triggering ancestor layout */
stage.style.contain = "strict";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08010f);
// Space wants almost no fog or the planets grey out; the plaza wants enough
// that its far edge dissolves instead of ending in a hard seam.
scene.fog = SCENE === "plaza"
  ? new THREE.FogExp2(0x0d0620, 0.0032)
  : new THREE.FogExp2(0x08010f, 0.0016);

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
// Mobile: bloom at half-resolution — halves the bloom texture fill cost
const bloomW = isMobile ? Math.ceil(innerWidth / 2) : innerWidth;
const bloomH = isMobile ? Math.ceil(innerHeight / 2) : innerHeight;
const bloom = new UnrealBloomPass(
  new THREE.Vector2(bloomW, bloomH),
  isMobile ? 0.25 : 0.32,  // calibrated to prevent overblown glow around DECIPHER
  0.38,                     // radius
  0.80                      // threshold — keeps solid white text razor sharp
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

/* Pre-bake the CRT overlay (scanlines + vignette + border) once —
   drawImage is ~60x faster than re-computing 154 fillRects per frame. */
const _crtOverlay = document.createElement("canvas");
_crtOverlay.width = SW; _crtOverlay.height = SH;
(function bakeCRTOverlay() {
  const og = _crtOverlay.getContext("2d");
  og.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < SH; y += 5) og.fillRect(0, y, SW, 2);
  const vig = og.createRadialGradient(SW / 2, SH / 2, SH * 0.32, SW / 2, SH / 2, SH * 0.82);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  og.fillStyle = vig;
  og.fillRect(0, 0, SW, SH);
  og.strokeStyle = "rgba(0,255,204,0.18)";
  og.lineWidth = 8;
  og.strokeRect(10, 10, SW - 20, SH - 20);
})();

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
try {
  const savedPage = parseInt(storage.get("decipher_page"), 10);
  if (!isNaN(savedPage) && savedPage >= 0 && savedPage < pages.length) {
    page = savedPage;
  }
} catch (e) {}

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
/* Pre-shuffled glyph ring — rotate an index instead of calling Math.random()
   ~340 times per scramble frame. Single allocation at startup. */
const GLYPH_SRC = "!<>-_\\/[]{}=+*^?#01ABCDEF$%&";
const RING_SIZE = 512;
const GLYPH_RING = new Uint8Array(RING_SIZE);
(function buildRing() {
  const n = GLYPH_SRC.length;
  for (let i = 0; i < RING_SIZE; i++) GLYPH_RING[i] = (Math.random() * n) | 0;
})();
let _ringIdx = 0;
function nextGlyph() {
  const ch = GLYPH_SRC[GLYPH_RING[_ringIdx]];
  _ringIdx = (_ringIdx + 1) & (RING_SIZE - 1);
  return ch;
}
let revealCursor = 0; // running char offset while drawing one frame

function scrambled(text) {
  if (reveal >= 1) { revealCursor += text.length; return text; }
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const globalIdx = revealCursor + i;
    if (ch === " ") { out += " "; continue; }
    out += globalIdx < revealChars ? ch : nextGlyph();
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

  // Eyebrow ("CAMPUS CTF · 10 SEPT 2026") in clean, technical monospace
  if (p.eyebrow) {
    g.font = "600 24px 'JetBrains Mono', monospace";
    g.fillStyle = "#f472b6";
    g.shadowColor = "rgba(244, 114, 182, 0.4)";
    g.shadowBlur = 8;
    if ("letterSpacing" in g) g.letterSpacing = "4px";
    g.fillText(p.eyebrow, SW / 2, p.pixel ? 185 : 145);
    if ("letterSpacing" in g) g.letterSpacing = "0px";
    g.shadowBlur = 0;
  }

  if (p.pixel) {
    // 1. Top-Left System Boot Prompt
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.font = "600 16px 'JetBrains Mono', monospace";
    g.fillStyle = "#5eead4";
    g.shadowColor = "rgba(94, 234, 212, 0.45)";
    g.shadowBlur = 6;
    g.fillText("> SYSTEM BOOT...", 80, 95);
    g.fillText("> INITIATING CTF ENVIRONMENT...", 80, 122);
    const bootCursor = ((time / 500) | 0) % 2 === 0 ? "_" : " ";
    g.fillText("> WELCOME, PLAYER" + bootCursor, 80, 149);
    g.shadowBlur = 0;

    // 2. Top-Right Campus CTF / Event Date
    g.textAlign = "right";
    g.font = "600 16px 'JetBrains Mono', monospace";
    g.fillStyle = "#5eead4";
    g.shadowColor = "rgba(94, 234, 212, 0.45)";
    g.shadowBlur = 6;
    g.fillText("CAMPUS CTF", SW - 80, 95);
    g.fillText(C.eventDateLabel, SW - 80, 122);
    g.shadowBlur = 0;

    // 3. Center Cyber-Frame Box around DECIPHER_
    const boxW = 630;
    const boxH = 136;
    const boxX = (SW - boxW) / 2;
    const boxY = SH / 2 - 76;

    g.strokeStyle = "rgba(0, 230, 255, 0.45)";
    g.lineWidth = 2;
    g.shadowColor = "rgba(0, 230, 255, 0.5)";
    g.shadowBlur = 8;
    g.strokeRect(boxX, boxY, boxW, boxH);

    // Tech corner ticks
    const tick = 10;
    g.beginPath();
    g.moveTo(boxX - tick, boxY); g.lineTo(boxX, boxY); g.lineTo(boxX, boxY - tick);
    g.moveTo(boxX + boxW + tick, boxY); g.lineTo(boxX + boxW, boxY); g.lineTo(boxX + boxW, boxY - tick);
    g.moveTo(boxX - tick, boxY + boxH); g.lineTo(boxX, boxY + boxH); g.lineTo(boxX, boxY + boxH + tick);
    g.moveTo(boxX + boxW + tick, boxY + boxH); g.lineTo(boxX + boxW, boxY + boxH); g.lineTo(boxX + boxW, boxY + boxH + tick);
    g.stroke();

    // Side midpoint ticks
    g.beginPath();
    g.moveTo(boxX - 6, boxY + boxH / 2); g.lineTo(boxX, boxY + boxH / 2);
    g.moveTo(boxX + boxW, boxY + boxH / 2); g.lineTo(boxX + boxW + 6, boxY + boxH / 2);
    g.stroke();
    g.shadowBlur = 0;

    // 4. Main Title: DECIPHER_ in Press Start 2P with sharp pixel edges & subtle neon glow
    const rawText = String(p.head);
    const dispText = scrambled(rawText);
    const cursorOn = ((time / 500) | 0) % 2 === 0;
    const textWithCursor = dispText + (cursorOn ? "_" : " ");
    
    const size = 52;
    g.font = `${size}px 'Press Start 2P', monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if ("letterSpacing" in g) g.letterSpacing = "6px";

    // Occasional, very subtle micro-glitch: once every ~7.5s for 80ms
    const screenGlitchCycle = time % 7500;
    const isScreenGlitch = screenGlitchCycle > 7380 && screenGlitchCycle < 7450;
    const screenJitter = isScreenGlitch ? ((time % 2 === 0) ? 1.5 : -1.5) : 0;
    const textX = SW / 2 + screenJitter;
    const textY = boxY + boxH / 2;

    // 1. Subtle, gentle purple/cyan neon aura
    g.shadowColor = "rgba(168, 85, 247, 0.55)";
    g.shadowBlur = 14;
    g.fillStyle = "rgba(224, 242, 254, 0.9)";
    g.fillText(textWithCursor, textX, textY);

    // 2. Pure, solid, crisp pale-cyan/white core with 100% sharp pixel edges (no blur, no RGB split)
    g.shadowBlur = 0;
    g.fillStyle = "#ffffff";
    g.fillText(textWithCursor, textX, textY);
    if ("letterSpacing" in g) g.letterSpacing = "0px";

    // 5. Below Box: [ PRESS THE CONTROLS ]
    g.font = "600 20px 'JetBrains Mono', monospace";
    g.fillStyle = "#67e8f9";
    g.shadowColor = "rgba(103, 232, 249, 0.5)";
    g.shadowBlur = 8;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    if ("letterSpacing" in g) g.letterSpacing = "3px";
    g.fillText("[ PRESS THE CONTROLS ]", SW / 2, boxY + boxH + 62);
    if ("letterSpacing" in g) g.letterSpacing = "0px";
    g.shadowBlur = 0;

    // 6. Bottom-Left Terminal Menu
    g.textAlign = "left";
    g.font = "600 15px 'JetBrains Mono', monospace";
    g.fillStyle = "#34d399";
    g.shadowColor = "rgba(52, 211, 153, 0.35)";
    g.shadowBlur = 6;
    const menuY = 605;
    g.fillText("> PLAY", 80, menuY);
    g.fillText("> EXPLORE", 80, menuY + 24);
    g.fillText("> SOLVE", 80, menuY + 48);
    g.fillText("> CLAIM", 80, menuY + 72);
    g.shadowBlur = 0;

    // 7. Bottom-Right Terminal Secrets Box
    const sBoxW = 190;
    const sBoxH = 80;
    const sBoxX = SW - 80 - sBoxW;
    const sBoxY = 595;
    g.strokeStyle = "rgba(0, 220, 255, 0.28)";
    g.lineWidth = 1;
    g.strokeRect(sBoxX, sBoxY, sBoxW, sBoxH);

    g.textAlign = "center";
    g.font = "600 12px 'JetBrains Mono', monospace";
    g.fillStyle = "#a5b4fc";
    g.shadowColor = "rgba(165, 180, 252, 0.4)";
    g.shadowBlur = 4;
    g.fillText("SOME SECRETS", sBoxX + sBoxW / 2, sBoxY + 25);
    g.fillText("DON'T STAY HIDDEN", sBoxX + sBoxW / 2, sBoxY + 44);
    g.fillText("FOREVER.", sBoxX + sBoxW / 2, sBoxY + 63);
    g.shadowBlur = 0;

  } else {
    g.textAlign = "center";
    g.textBaseline = "alphabetic";

    g.fillStyle = p.flag ? "#ff3fb0" : "#e0fbff";
    g.shadowColor = p.flag ? "rgba(255,0,255,0.7)" : "rgba(0,255,204,0.6)";
    g.shadowBlur = 18;

    const lines = String(p.head).split("\n");
    let size = p.flag ? 58 : 78;
    const face = "'JetBrains Mono', monospace";
    g.font = "700 " + size + "px " + face;

    while (size > 26 && lines.some(l => g.measureText(l).width > SW - 160)) {
      size -= 4;
      g.font = "700 " + size + "px " + face;
    }

    const lh = size * 1.32;
    let y = SH / 2 - (lines.length - 1) * lh / 2 - 8;
    for (const line of lines) { g.fillText(scrambled(line), SW / 2, y); y += lh; }
    g.shadowBlur = 0;

    // --- hint + cursor ---
    g.font = "600 20px 'JetBrains Mono', monospace";
    g.fillStyle = "#9d8ba9";
    if ("letterSpacing" in g) g.letterSpacing = "3px";
    g.fillText((p.hint || "") + (((time / 480) | 0) % 2 ? " " : "▍"), SW / 2, SH - 122);
    if ("letterSpacing" in g) g.letterSpacing = "0px";

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
  }

  // --- CRT scanlines + vignette (pre-baked, single drawImage call) ---
  g.drawImage(_crtOverlay, 0, 0);
}

/* ================== marquee canvas ================== */
// Canvas aspect must match the marquee mesh (6.4 x 2.8 = 2.286:1) or the
// lettering gets stretched vertically.
// Halved from 2048x896 → 1024x448 to reduce GPU texture upload bandwidth by 75%.
const MW = 1024, MH = 448;
const mc = document.createElement("canvas");
mc.width = MW; mc.height = MH;
const mg = mc.getContext("2d");

function drawMarquee(time = performance.now()) {
  const cx = MW / 2, cy = MH / 2;
  mg.clearRect(0, 0, MW, MH);

  // --- dark void acrylic background
  const glow = mg.createRadialGradient(cx, cy, 0, cx, cy, MW * 0.65);
  glow.addColorStop(0.00, "#100220");
  glow.addColorStop(0.55, "#080112");
  glow.addColorStop(1.00, "#030006");
  mg.fillStyle = glow;
  mg.fillRect(0, 0, MW, MH);

  // Subtle horizontal CRT scanline texture in background
  mg.fillStyle = "rgba(0, 0, 0, 0.22)";
  for (let y = 0; y < MH; y += 6) mg.fillRect(0, y, MW, 2);

  // Outer bezel housing
  mg.strokeStyle = "#160527"; mg.lineWidth = 28;
  mg.strokeRect(14, 14, MW - 28, MH - 28);

  // Glowing neon magenta frame (matches reference image)
  mg.strokeStyle = "#d946ef"; mg.lineWidth = 8;
  mg.shadowColor = "#e879f9"; mg.shadowBlur = 20;
  if (typeof mg.roundRect === "function") {
    mg.beginPath();
    mg.roundRect(42, 42, MW - 84, MH - 84, 14);
    mg.stroke();
  } else {
    mg.strokeRect(42, 42, MW - 84, MH - 84);
  }
  mg.shadowBlur = 0;

  // Inner subtle magenta accent hairline
  mg.strokeStyle = "rgba(232, 121, 249, 0.4)"; mg.lineWidth = 2.5;
  if (typeof mg.roundRect === "function") {
    mg.beginPath();
    mg.roundRect(56, 56, MW - 112, MH - 112, 10);
    mg.stroke();
  } else {
    mg.strokeRect(56, 56, MW - 112, MH - 112);
  }

  // --- Top header: LNMIIT (left), CTF 2026 (right) in pixel font ---
  mg.font = "28px 'Press Start 2P', monospace";
  mg.fillStyle = "#ffffff";
  mg.shadowColor = "rgba(232, 121, 249, 0.45)";
  mg.shadowBlur = 8;
  mg.textAlign = "left";
  mg.textBaseline = "middle";
  mg.fillText("LNMIIT", 100, 118);

  mg.textAlign = "right";
  mg.fillText("CTF 2026", MW - 100, 118);
  mg.shadowBlur = 0;

  // --- Center: DECIPHER_ (Large, bold, crisp pixel edges with subtle violet neon aura) ---
  const cursorOn = ((time / 500) | 0) % 2 === 0;
  const marqueeText = "DECIPHER" + (cursorOn ? "_" : " ");
  // Store state for dirty-checking in the render loop
  drawMarquee._lastCursorOn = cursorOn;
  const size = 138;
  mg.font = `${size}px 'Press Start 2P', monospace`;
  mg.textAlign = "center";
  mg.textBaseline = "middle";
  if ("letterSpacing" in mg) mg.letterSpacing = "6px";

  // Occasional, very subtle micro-glitch: once every 8s for 80ms, tiny 2px jitter
  const glitchCycle = time % 8000;
  const isGlitch = glitchCycle > 7880 && glitchCycle < 7960;
  const glitchDx = isGlitch ? ((time % 2 === 0) ? 2 : -2) : 0;
  const textX = cx + glitchDx;
  const textY = cy - 8;

  // 1. Soft, subtle purple/magenta neon aura behind letters
  mg.shadowColor = "rgba(168, 85, 247, 0.7)";
  mg.shadowBlur = 18;
  mg.fillStyle = "rgba(224, 231, 255, 0.85)";
  mg.fillText(marqueeText, textX, textY);

  // 2. Pure, solid, crisp white core with sharp pixel edges (no blur, no RGB split)
  mg.shadowBlur = 0;
  mg.fillStyle = "#ffffff";
  mg.fillText(marqueeText, textX, textY);
  if ("letterSpacing" in mg) mg.letterSpacing = "0px";

  // --- Bottom subtitle: HACK   ▪   EXPLORE   ▪   DECIPHER ---
  mg.font = "22px 'Press Start 2P', monospace";
  mg.fillStyle = "#f5d0fe";
  mg.shadowColor = "rgba(216, 180, 254, 0.35)";
  mg.shadowBlur = 6;
  mg.textBaseline = "middle";

  const subY = MH - 130;
  const wHack = mg.measureText("HACK").width;
  const wExpl = mg.measureText("EXPLORE").width;
  const wDeci = mg.measureText("DECIPHER").width;
  const sq = 8;     // retro square dot size
  const pad = 36;   // spacing around dot
  const totalSubW = wHack + pad + sq + pad + wExpl + pad + sq + pad + wDeci;
  
  let curX = cx - totalSubW / 2;
  // HACK
  mg.textAlign = "left";
  mg.fillText("HACK", curX, subY);
  curX += wHack + pad;
  // first square dot
  mg.fillRect(curX, subY - sq / 2, sq, sq);
  curX += sq + pad;
  // EXPLORE
  mg.fillText("EXPLORE", curX, subY);
  curX += wExpl + pad;
  // second square dot
  mg.fillRect(curX, subY - sq / 2, sq, sq);
  curX += sq + pad;
  // DECIPHER
  mg.fillText("DECIPHER", curX, subY);

  mg.shadowBlur = 0;
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
    color: 0x7b2cbf, roughness: 0.25, metalness: 0.12,
    clearcoat: 1, clearcoatRoughness: 0.14, envMap: env, envMapIntensity: 0.6
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
    depth: 0.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 6, curveSegments: 28
  });
  for (const z of [-3.5, 3.18]) {
    const m = new THREE.Mesh(sideGeom, bodyMat);
    m.position.z = z;
    m.castShadow = m.receiveShadow = true;
    body.add(m);
    // Side panels deliberately excluded from clickable — their extruded bezier
    // geometry has thousands of triangles that make raycasting slow. The
    // control panel, screen, and buttons cover all useful click areas.
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
  marqueeTex.minFilter = THREE.LinearFilter;
  marqueeTex.magFilter = THREE.LinearFilter;
  marqueeTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
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
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.055, 12, false), trimMat);
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

  // Rim light: repositioned higher and more behind for a clean edge highlight
  // without splotchy purple flooding. Reduced intensity to avoid reflection artifacts.
  const rim = new THREE.DirectionalLight(0xc77dff, 0.55);
  rim.position.set(-12, 18, -10);
  scene.add(rim);

  // Soft front-fill from the left side to smooth edge transitions
  const fill = new THREE.DirectionalLight(0x8b5cf6, 0.35);
  fill.position.set(-10, 6, 18);
  scene.add(fill);

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
  // In space the cabinet floats: a ground plane there reads as a stray white
  // slab under it. The floor exists only on the plaza route, where it stands in
  // until the real plaza streams in.
  if (SCENE === "plaza") {
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
  }

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
let space = null;
let placeholderGround = null;
let plazaRoot = null;
let plazaFade = 0;
let plazaMaterials = [];   // flat pre-collected array for fast fade updates

/* ================== the plaza ==================
   The real central plaza, exported from Blender and Meshopt-compressed.
   It is streamed in AFTER the cabinet is interactive so first paint stays
   fast: the page is usable in ~1 MB, and the 8.6 MB plaza arrives behind it. */
const CABINET_UNITS_PER_METRE = 17 / 1.8;   // the cabinet is 17 units ≈ 1.8 m tall

async function loadPlaza() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Root-absolute: this page also serves from /lnmiit-cp/, where a relative
  // path would resolve into the subdirectory and 404.
  const gltf = await new Promise((res, rej) =>
    loader.load("/assets/models/plaza.glb", res, undefined, rej));

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

  /* Collect materials into a flat array once — avoids O(n) traverse every
     fade frame. We set transparent + opacity = 0 here, then the frame loop
     walks _plazaMaterials (array, not scene graph) to update opacity. */
  const _plazaMats = [];
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
      _plazaMats.push(m);
    }
  });

  scene.add(root);
  plazaRoot = root;
  plazaMaterials = _plazaMats;   // store flat array for fast fade updates

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
const savedSound = storage.get("decipher_sound");
if (savedSound !== null) {
  soundOn = savedSound === "on";
  if (soundBtn) {
    soundBtn.textContent = soundOn ? "♪ ON" : "♪ OFF";
    soundBtn.setAttribute("aria-label", soundOn ? "Mute sound" : "Unmute sound");
  }
}
const srcFor = base => {
  const a = document.createElement("audio");
  return base + (a.canPlayType("audio/ogg") ? ".ogg" : ".mp3");
};
function startAudio() {
  try {
    ambience = new Audio(srcFor("/assets/audio/background_ambience"));
    ambience.loop = true; ambience.volume = 0;
    ambience.play().then(() => {
      let v = 0;
      const fade = setInterval(() => {
        v = Math.min(0.28, v + 0.02);
        ambience.volume = soundOn ? v : 0;
        if (v >= 0.28) clearInterval(fade);
      }, 90);
    }).catch(() => {});
    thump = new Audio(srcFor("/assets/audio/thump_hover"));
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
  soundBtn.setAttribute("aria-label", soundOn ? "Mute sound" : "Unmute sound");
  storage.set("decipher_sound", soundOn ? "on" : "off");
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
  storage.set("decipher_page", page);
  reveal = 0; revealTarget = 1;
  syncReadout();
  flashIndicators();
  click();
  setTimeout(() => { busy = false; }, 260);
  if (!hintDimmed) { hintDimmed = true; hudHint.classList.add("dim"); }
}

function stepBack() {
  if (busy || !live) return;
  busy = true;
  page = (page - 1 + pages.length) % pages.length;
  storage.set("decipher_page", page);
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
}, { passive: true });

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
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    spring(joystickPivot.rotation, "x", -0.3, 0, 190);
    stepBack();
  }
});

/* cursor feedback — debounce: 150ms desktop, 200ms mobile (raycasting is cheap
   but we don't need sub-6-frame cursor updates for pointer feedback) */
const HOVER_DEBOUNCE = isMobile ? 200 : 150;
let lastHover = 0;
function hoverCheck(now) {
  if (!live || reduceMotion || now - lastHover < HOVER_DEBOUNCE) return;
  lastHover = now;
  ray.setFromCamera(pointer, camera);
  document.body.style.cursor = ray.intersectObjects(clickable, true).length ? "pointer" : "default";
}

/* ================== Worker boot ==================
   Spin up the screen worker once fonts are ready (the worker needs
   the same font names; they're loaded into the document font cache
   which OffscreenCanvas in the worker can also access). */
function bootWorker() {
  if (!WORKER_SUPPORTED) return;
  try {
    _screenWorker = new Worker(new URL("./workers/screen.worker.js", import.meta.url), { type: "module" });
    _screenWorker.onmessage = e => {
      const msg = e.data;
      if (msg.type === "ready") { _workerReady = true; }
      else if (msg.type === "screenBitmap") { _pendingScreenBitmap = msg.bitmap; }
      else if (msg.type === "marqueeBitmap") { _pendingMarqueeBitmap = msg.bitmap; }
      // marqueeSkipped: nothing to do
    };
    _screenWorker.onerror = err => {
      console.warn("screen.worker error — falling back to main-thread draw", err);
      _screenWorker = null;
    };
    // Send config + pages (pages are plain objects — structured-clone safe)
    _screenWorker.postMessage({
      type: "init",
      config: C,
      pages,
      ruleStart: RULE_START
    });
  } catch (err) {
    console.warn("Worker init failed — falling back to main-thread draw", err);
    _screenWorker = null;
  }
}

/* ================== boot sequence ================== */
async function bootUp() {
  const steps = [
    ["loading typefaces…", async () => {
      await Promise.all([
        document.fonts.load("700 110px Syncopate"),
        document.fonts.load("600 31px 'JetBrains Mono'"),
        document.fonts.load("600 24px 'JetBrains Mono'"),
        document.fonts.load("700 40px 'JetBrains Mono'"),
        document.fonts.load("116px 'VT323'"),
        document.fonts.load("46px 'Press Start 2P'")
      ]).catch(() => {});
      await document.fonts.ready.catch(() => {});
      // Spin up worker after fonts load so it inherits the font cache
      bootWorker();
    }],
    ["mapping reflections…", async () => {
      const loader = new THREE.CubeTextureLoader().setPath("/assets/cubemap/");
      const env = await new Promise(res => {
        loader.load(["px.webp", "nx.webp", "py.webp", "ny.webp", "pz.webp", "nz.webp"],
          t => res(t), undefined, () => res(null));
      });
      if (env) { env.colorSpace = THREE.SRGBColorSpace; scene.environment = env; }
      return env;
    }],
    ["assembling cabinet…", env => buildCabinet(scene.environment)],
    ["wiring the neon…", () => buildLights()],
    [SCENE === "plaza" ? "laying the floor…" : "seeding the starfield…", () => {
      motes = buildFloor();
      if (SCENE === "space") space = buildSpace(scene, { isMobile, envMap: scene.environment });
    }],
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

  // Only restore directly into the scene if the user refreshed/reloaded while already active in this tab
  const isReloadInScene = (function() {
    try {
      // Clear legacy permanent storage key from previous versions
      localStorage.removeItem("decipher_started");
      return sessionStorage.getItem("decipher_entered") === "true";
    } catch(e) { return false; }
  })();

  if (isReloadInScene) {
    enterScene();
  }
}

function enterScene() {
  boot.classList.add("gone");
  document.body.classList.add("live");
  live = true;
  try {
    sessionStorage.setItem("decipher_entered", "true");
  } catch (e) {}
  storage.set("decipher_page", page);
  startAudio();
  click();
  reveal = 0; revealTarget = 1;
  syncReadout();

  // Only the /lnmiit-cp route stands the cabinet on the real plaza. Deliberately
  // not awaited: the page is already interactive, and a failure here must not
  // break it — the grid floor simply stays.
  if (SCENE === "plaza") {
    loadPlaza().catch(err => console.warn("plaza unavailable, keeping grid:", err));
  }
}

bootStart.addEventListener("click", enterScene);

/* ================== render loop ================== */
let raf = 0, lastT = performance.now(), frames = 0, accum = 0, lastQ = 0, lastScreen = 0, lastMarquee = 0;
/* Marquee dirty-check state */
let _marqueeCursorState = null, _marqueeGlitchState = false;

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

  /* screen redraw:
     - During reveal scrambler: up to 25 FPS (40ms) so decoding feels snappy
     - When settled (reveal=1): 15 FPS (66ms) — CRT text rarely changes     */
  reveal += (revealTarget - reveal) * 0.09;
  if (reveal > 0.995) reveal = 1;
  revealChars = Math.floor(reveal * 340);
  const screenInterval = reveal < 1 ? 40 : 66;
  if (now - lastScreen > screenInterval) {
    lastScreen = now;
    if (_screenWorker && _workerReady) {
      // Off-thread path: post draw request and apply any bitmap already returned
      _screenWorker.postMessage({ type: "drawScreen", time: now, page, reveal });
    } else {
      // Fallback: draw on main thread
      drawScreen(now);
      screenTex.needsUpdate = true;
    }
  }
  // Apply bitmap posted back by worker this frame or last frame
  if (_pendingScreenBitmap && screenTex) {
    screenTex.image = _pendingScreenBitmap;
    screenTex.needsUpdate = true;
    _pendingScreenBitmap = null;
  }

  /* marquee redraw — only when cursor blink state or glitch state changes.
     Typically fires once per 500ms (cursor blink), saves ~75% of texture uploads. */
  const mCursor = ((now / 500) | 0) % 2 === 0;
  const mGlitchCycle = now % 8000;
  const mGlitch = mGlitchCycle > 7880 && mGlitchCycle < 7960;
  if (mCursor !== _marqueeCursorState || mGlitch !== _marqueeGlitchState || now - lastMarquee > 2000) {
    _marqueeCursorState = mCursor;
    _marqueeGlitchState = mGlitch;
    lastMarquee = now;
    if (_screenWorker && _workerReady) {
      _screenWorker.postMessage({ type: "drawMarquee", time: now, force: now - lastMarquee > 2000 });
    } else {
      drawMarquee(now);
      if (marqueeTex) marqueeTex.needsUpdate = true;
    }
  }
  if (_pendingMarqueeBitmap && marqueeTex) {
    marqueeTex.image = _pendingMarqueeBitmap;
    marqueeTex.needsUpdate = true;
    _pendingMarqueeBitmap = null;
  }

  stepSprings(now);

  if (space) space.update(now, camera);

  /* fade the plaza up once it has arrived.
     plazaMaterials is a pre-collected flat array — no O(n) traverse each frame. */
  if (plazaRoot && plazaFade < 1) {
    plazaFade = Math.min(1, plazaFade + dt / 1400);
    const e = plazaFade * plazaFade * (3 - 2 * plazaFade);   // smoothstep
    for (const m of plazaMaterials) m.opacity = e;
    if (plazaFade >= 1) {
      // Opaque again once faded: transparent materials sort per-frame and cost more.
      for (const m of plazaMaterials) { m.transparent = false; m.opacity = 1; }
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
  // Keep bloom at half-res on mobile
  const bw = narrow ? Math.ceil(innerWidth / 2) : innerWidth;
  const bh = narrow ? Math.ceil(innerHeight / 2) : innerHeight;
  bloom.resolution.set(bw, bh);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(raf); raf = 0;
    if (ambience) ambience.pause();
    // Pause worker when tab hidden — no point drawing off-screen
    if (_screenWorker) _screenWorker.postMessage({ type: "pause" });
  } else if (!raf) {
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    if (ambience && soundOn) ambience.play().catch(() => {});
  }
});

bootUp().then(() => { raf = requestAnimationFrame(frame); });
