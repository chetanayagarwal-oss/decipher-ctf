/* ============================================================
   DECIPHER — CRT screen & marquee canvas worker
   Runs drawScreen() and drawMarquee() completely off the main thread
   via OffscreenCanvas, returning zero-copy ImageBitmap transfers.
   ============================================================ */

/* ===================== CONFIG passed on 'init' ===================== */
let C = null;         // window.DECIPHER config
let pages = [];
let RULE_START = 0;

/* ===================== GLYPHS ring buffer =====================
   Pre-shuffled once; rotate an index instead of Math.random()
   per char every scramble frame — eliminates ~340 allocs/frame. */
const GLYPH_SRC = "!<>-_\\/[]{}=+*^?#01ABCDEF$%&";
const RING_SIZE = 512;
const GLYPH_RING = new Uint8Array(RING_SIZE);
(function buildRing() {
  const n = GLYPH_SRC.length;
  for (let i = 0; i < RING_SIZE; i++) {
    GLYPH_RING[i] = (Math.random() * n) | 0;
  }
})();
let _ringIdx = 0;
function nextGlyph() {
  const ch = GLYPH_SRC[GLYPH_RING[_ringIdx]];
  _ringIdx = (_ringIdx + 1) & (RING_SIZE - 1);
  return ch;
}

/* ===================== CRT Screen canvas ===================== */
const SW = 1024, SH = 768;
let sc = null, g = null;

/* Pre-baked CRT overlay — scanlines + vignette + border drawn once */
let _crtOverlay = null;
function bakeCRTOverlay() {
  _crtOverlay = new OffscreenCanvas(SW, SH);
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
}

/* ===================== Marquee canvas ===================== */
const MW = 1024, MH = 448;
let mc = null, mg = null;

/* ===================== text helpers ===================== */
let revealCursor = 0;
let _revealChars = 0;

function scrambled(text, reveal) {
  if (reveal >= 1) { revealCursor += text.length; return text; }
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") { out += " "; revealCursor++; continue; }
    out += (revealCursor + i) < _revealChars ? ch : nextGlyph();
  }
  revealCursor += text.length;
  return out;
}

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

/* ===================== drawScreen ===================== */
let _gridOff = 0;
function drawScreen(time, page, reveal) {
  const p = pages[page];
  revealCursor = 0;
  _revealChars = Math.floor(reveal * 340);

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
  _gridOff = (_gridOff + 1.5) % 62;
  for (let i = 0; i < 12; i++) {
    const y = vp + Math.pow(i / 11, 2.2) * (SH - vp) + _gridOff;
    if (y > vp && y < SH) { g.beginPath(); g.moveTo(0, y); g.lineTo(SW, y); g.stroke(); }
  }

  g.textAlign = "center";
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

    g.textAlign = "right";
    g.font = "600 16px 'JetBrains Mono', monospace";
    g.fillStyle = "#5eead4";
    g.shadowColor = "rgba(94, 234, 212, 0.45)";
    g.shadowBlur = 6;
    g.fillText("CAMPUS CTF", SW - 80, 95);
    g.fillText(C.eventDateLabel, SW - 80, 122);
    g.shadowBlur = 0;

    const boxW = 630, boxH = 136;
    const boxX = (SW - boxW) / 2;
    const boxY = SH / 2 - 76;
    g.strokeStyle = "rgba(0, 230, 255, 0.45)";
    g.lineWidth = 2;
    g.shadowColor = "rgba(0, 230, 255, 0.5)";
    g.shadowBlur = 8;
    g.strokeRect(boxX, boxY, boxW, boxH);
    const tick = 10;
    g.beginPath();
    g.moveTo(boxX - tick, boxY); g.lineTo(boxX, boxY); g.lineTo(boxX, boxY - tick);
    g.moveTo(boxX + boxW + tick, boxY); g.lineTo(boxX + boxW, boxY); g.lineTo(boxX + boxW, boxY - tick);
    g.moveTo(boxX - tick, boxY + boxH); g.lineTo(boxX, boxY + boxH); g.lineTo(boxX, boxY + boxH + tick);
    g.moveTo(boxX + boxW + tick, boxY + boxH); g.lineTo(boxX + boxW, boxY + boxH); g.lineTo(boxX + boxW, boxY + boxH + tick);
    g.stroke();
    g.beginPath();
    g.moveTo(boxX - 6, boxY + boxH / 2); g.lineTo(boxX, boxY + boxH / 2);
    g.moveTo(boxX + boxW, boxY + boxH / 2); g.lineTo(boxX + boxW + 6, boxY + boxH / 2);
    g.stroke();
    g.shadowBlur = 0;

    const rawText = String(p.head);
    const dispText = scrambled(rawText, reveal);
    const cursorOn = ((time / 500) | 0) % 2 === 0;
    const textWithCursor = dispText + (cursorOn ? "_" : " ");
    const size = 52;
    g.font = `${size}px 'Press Start 2P', monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if ("letterSpacing" in g) g.letterSpacing = "6px";
    const screenGlitchCycle = time % 7500;
    const isScreenGlitch = screenGlitchCycle > 7380 && screenGlitchCycle < 7450;
    const screenJitter = isScreenGlitch ? ((time % 2 === 0) ? 1.5 : -1.5) : 0;
    const textX = SW / 2 + screenJitter;
    const textY = boxY + boxH / 2;
    g.shadowColor = "rgba(168, 85, 247, 0.55)";
    g.shadowBlur = 14;
    g.fillStyle = "rgba(224, 242, 254, 0.9)";
    g.fillText(textWithCursor, textX, textY);
    g.shadowBlur = 0;
    g.fillStyle = "#ffffff";
    g.fillText(textWithCursor, textX, textY);
    if ("letterSpacing" in g) g.letterSpacing = "0px";

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

    const sBoxW = 190, sBoxH = 80;
    const sBoxX = SW - 80 - sBoxW, sBoxY = 595;
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
    for (const line of lines) { g.fillText(scrambled(line, reveal), SW / 2, y); y += lh; }
    g.shadowBlur = 0;

    g.font = "600 20px 'JetBrains Mono', monospace";
    g.fillStyle = "#9d8ba9";
    if ("letterSpacing" in g) g.letterSpacing = "3px";
    g.fillText((p.hint || "") + (((time / 480) | 0) % 2 ? " " : "▍"), SW / 2, SH - 122);
    if ("letterSpacing" in g) g.letterSpacing = "0px";

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

  // CRT overlay (pre-baked, single drawImage)
  g.drawImage(_crtOverlay, 0, 0);
}

/* ===================== drawMarquee ===================== */
let _marqueeCursorState = null;
let _marqueeGlitchState = false;

function drawMarquee(time) {
  const cx = MW / 2, cy = MH / 2;
  mg.clearRect(0, 0, MW, MH);

  const glow = mg.createRadialGradient(cx, cy, 0, cx, cy, MW * 0.65);
  glow.addColorStop(0.00, "#100220");
  glow.addColorStop(0.55, "#080112");
  glow.addColorStop(1.00, "#030006");
  mg.fillStyle = glow;
  mg.fillRect(0, 0, MW, MH);

  mg.fillStyle = "rgba(0, 0, 0, 0.22)";
  for (let y = 0; y < MH; y += 6) mg.fillRect(0, y, MW, 2);

  mg.strokeStyle = "#160527"; mg.lineWidth = 28;
  mg.strokeRect(14, 14, MW - 28, MH - 28);

  mg.strokeStyle = "#d946ef"; mg.lineWidth = 8;
  mg.shadowColor = "#e879f9"; mg.shadowBlur = 20;
  if (typeof mg.roundRect === "function") {
    mg.beginPath(); mg.roundRect(42, 42, MW - 84, MH - 84, 14); mg.stroke();
  } else { mg.strokeRect(42, 42, MW - 84, MH - 84); }
  mg.shadowBlur = 0;

  mg.strokeStyle = "rgba(232, 121, 249, 0.4)"; mg.lineWidth = 2.5;
  if (typeof mg.roundRect === "function") {
    mg.beginPath(); mg.roundRect(56, 56, MW - 112, MH - 112, 10); mg.stroke();
  } else { mg.strokeRect(56, 56, MW - 112, MH - 112); }

  mg.font = "28px 'Press Start 2P', monospace";
  mg.fillStyle = "#ffffff";
  mg.shadowColor = "rgba(232, 121, 249, 0.45)";
  mg.shadowBlur = 8;
  mg.textAlign = "left"; mg.textBaseline = "middle";
  mg.fillText("LNMIIT", 100, 118);
  mg.textAlign = "right";
  mg.fillText("CTF 2026", MW - 100, 118);
  mg.shadowBlur = 0;

  const cursorOn = ((time / 500) | 0) % 2 === 0;
  const marqueeText = "DECIPHER" + (cursorOn ? "_" : " ");
  const size = 138;
  mg.font = `${size}px 'Press Start 2P', monospace`;
  mg.textAlign = "center"; mg.textBaseline = "middle";
  if ("letterSpacing" in mg) mg.letterSpacing = "6px";
  const glitchCycle = time % 8000;
  const isGlitch = glitchCycle > 7880 && glitchCycle < 7960;
  const glitchDx = isGlitch ? ((time % 2 === 0) ? 2 : -2) : 0;
  const textX = cx + glitchDx, textY = cy - 8;
  mg.shadowColor = "rgba(168, 85, 247, 0.7)";
  mg.shadowBlur = 18;
  mg.fillStyle = "rgba(224, 231, 255, 0.85)";
  mg.fillText(marqueeText, textX, textY);
  mg.shadowBlur = 0;
  mg.fillStyle = "#ffffff";
  mg.fillText(marqueeText, textX, textY);
  if ("letterSpacing" in mg) mg.letterSpacing = "0px";

  mg.font = "22px 'Press Start 2P', monospace";
  mg.fillStyle = "#f5d0fe";
  mg.shadowColor = "rgba(216, 180, 254, 0.35)";
  mg.shadowBlur = 6;
  mg.textBaseline = "middle";
  const subY = MH - 130;
  const wHack = mg.measureText("HACK").width;
  const wExpl = mg.measureText("EXPLORE").width;
  const wDeci = mg.measureText("DECIPHER").width;
  const sq = 8, pad = 36;
  const totalSubW = wHack + pad + sq + pad + wExpl + pad + sq + pad + wDeci;
  let curX = cx - totalSubW / 2;
  mg.textAlign = "left";
  mg.fillText("HACK", curX, subY); curX += wHack + pad;
  mg.fillRect(curX, subY - sq / 2, sq, sq); curX += sq + pad;
  mg.fillText("EXPLORE", curX, subY); curX += wExpl + pad;
  mg.fillRect(curX, subY - sq / 2, sq, sq); curX += sq + pad;
  mg.fillText("DECIPHER", curX, subY);
  mg.shadowBlur = 0;
}

/* ===================== message handler ===================== */
self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === "init") {
    C = msg.config;
    pages = msg.pages;
    RULE_START = msg.ruleStart;

    // Create OffscreenCanvases
    sc = new OffscreenCanvas(SW, SH);
    g = sc.getContext("2d");
    mc = new OffscreenCanvas(MW, MH);
    mg = mc.getContext("2d");

    bakeCRTOverlay();
    self.postMessage({ type: "ready" });
    return;
  }

  if (msg.type === "drawScreen") {
    drawScreen(msg.time, msg.page, msg.reveal);
    /* IMPORTANT: UNPACK_FLIP_Y_WEBGL has NO effect on ImageBitmap sources (WebGL spec).
       Three.js's CanvasTexture has flipY=true which would normally flip the canvas during
       GPU upload. Since that doesn't work for ImageBitmap, we pre-flip here so the
       uploaded texture matches the original HTMLCanvasElement behaviour. */
    createImageBitmap(sc, { imageOrientation: 'flipY' }).then(bmp => {
      self.postMessage({ type: "screenBitmap", bitmap: bmp }, [bmp]);
    });
    return;
  }

  if (msg.type === "drawMarquee") {
    const mCursor = ((msg.time / 500) | 0) % 2 === 0;
    const mGlitchCycle = msg.time % 8000;
    const mGlitch = mGlitchCycle > 7880 && mGlitchCycle < 7960;
    if (!msg.force && mCursor === _marqueeCursorState && mGlitch === _marqueeGlitchState) {
      self.postMessage({ type: "marqueeSkipped" });
      return;
    }
    _marqueeCursorState = mCursor;
    _marqueeGlitchState = mGlitch;
    drawMarquee(msg.time);
    // Same flipY fix as screen above
    createImageBitmap(mc, { imageOrientation: 'flipY' }).then(bmp => {
      self.postMessage({ type: "marqueeBitmap", bitmap: bmp }, [bmp]);
    });
    return;
  }
};
