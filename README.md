# ⚡ DECIPHER — 3D Cyber Arcade & Campus CTF Experience

[![Three.js](https://img.shields.io/badge/Three.js-r170-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/HTML5)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE-THIRD-PARTY.md)

> An immersive, retro-futuristic 3D web experience built for **DECIPHER**, a campus-wide Capture The Flag (CTF) cybersecurity competition. Features an interactive WebGL arcade cabinet running offscreen CRT rendering, live countdown telemetry, and an exploratory 3D virtual world.

---

## 📸 Overview

**DECIPHER** bridges cyberpunk aesthetics with modern web graphics to deliver an unforgettable onboarding experience for CTF participants:

1. **🕹️ Arcade Cabinet (`index.html`)**:
   - High-fidelity 3D arcade machine rendered using Three.js.
   - Dynamic retro CRT screen running via OffscreenCanvas / Web Worker (`js/workers/screen.worker.js`) to decouple heavy canvas rasterization from the main 3D animation loop.
   - Interactive control sticks, push-buttons, spatial sound FX, dynamic event countdown timers, and event rule briefings.
   - Optimized first load (~1 MB) to ensure lightning-fast accessibility on all devices, including mobile and low-spec hardware.

2. **🌐 The 3D World / Vault (`vault.html`)**:
   - An interactive 3D virtual museum environment for exploring cybersecurity concepts and challenge exhibits.
   - Camera keyframe rail paths, split-screen transitions, dynamic plaques, ambient audio, and responsive inspect modals.
   - Streamed chunk-based loading with progressive decoding indicator.

---

## ✨ Key Features & Technical Highlights

- **⚡ Zero Build Pipeline:** Pure vanilla ES Modules, HTML5, and CSS3. No Node dependencies, bundling step, or framework overhead required.
- **🖥️ OffscreenCanvas Web Worker Screen Rendering:** Cabinet screen animations, CRT scanlines, and text telemetry render asynchronously inside dedicated web workers to guarantee silky-smooth 60+ FPS performance.
- **📈 Adaptive Resolution & Performance Scaling:**
  - Real-time frame-time monitoring automatically scales rendering resolution if frame rate dips below 44 FPS.
  - Automatically suspends rendering when the browser tab loses focus.
  - Honors the user's `prefers-reduced-motion` accessibility preferences.
- **📦 Advanced 3D Asset Compression:**
  - Mesh geometry compressed via **Google Draco**.
  - Textures compressed via **KTX2 / Basis Universal** GPU-compressed texture formats.
  - Unlit materials with baked environment illumination eliminate heavy runtime shadow mapping and dynamic lighting passes.
- **⚙️ Centralized Configuration:** Edit all event dates, rules, prizes, announcements, and registration links from a single configuration file (`js/config.js`).

---

## 📁 Project Structure

```text
decipher-ctf/
├── index.html                 # Main entrypoint: 3D Arcade Cabinet briefing experience
├── vault.html                 # 3D Virtual World & museum exhibit experience
├── package.json               # Local development script definitions
│
├── js/
│   ├── config.js              # Central event configuration (Rules, Date, Venue, URLs)
│   ├── arcade.js              # 3D Scene setup, arcade interactions, controls & camera
│   ├── vault.js               # 3D World exhibition viewer & camera rail controller
│   ├── plaza.js               # Supplemental scene controllers
│   ├── space.js               # Particle systems & background environment effects
│   └── workers/
│       └── screen.worker.js   # OffscreenCanvas CRT monitor renderer worker
│
├── css/
│   ├── arcade.css             # HUD, scanline overlays, typography & retro UI styles
│   └── vault.css              # World viewer HUD, loading bars & modal styles
│
└── assets/
    ├── models/                # Draco-compressed 3D models (.glb)
    ├── basis/                 # KTX2/Basis texture assets
    ├── audio/                 # Sound effects and ambient audio
    └── draco/                 # Draco WASM decoders
```

---

## 🚀 Getting Started

### Prerequisites

Since the project loads ES Modules and binary 3D assets (`.glb`, `.basis`, `.wasm`), modern browsers require pages to be served over HTTP/HTTPS (browser security policies prevent loading Web Workers and modules over the `file://` protocol).

### Running Locally

Clone the repository and serve it using any local static web server:

**Using Python:**
```bash
# Python 3.x
python -m http.server 8000
```

**Using Node.js (`npx`):**
```bash
npx serve .
# or
npx http-server -p 8000
```

Open your browser and navigate to:
```
http://localhost:8000
```

---

## ⚙️ Configuration & Customization

All event details and customizable text live in [`js/config.js`](js/config.js). Both the arcade cabinet and the 3D world automatically pull data from this single source:

```javascript
const DECIPHER = {
  /* ---- EVENT SCHEDULE & VENUE ---- */
  eventDateISO: "2026-09-10T10:30:00+05:30",  // Drives live countdown timer
  eventDateLabel: "10 SEPT 2026",
  venue: "Auditorium / Online",
  organizer: "Cybersecurity Club",

  /* ---- REGISTRATION ---- */
  registerUrl: "https://your-registration-link.com",
  registerLabel: "REGISTER",

  /* ---- CTF BRIEFING & RULES ---- */
  whatIsCTF: [
    "A CTF is a hacking competition made of puzzles.",
    "Every challenge hides a secret string — a FLAG — inside a website, a file, a cipher, or a program.",
    "Find the flag. Submit it. Score points.",
    "Most points when the clock stops wins.",
    "No experience needed. Decipher starts you from zero."
  ],

  flagExample: "DECIPHER{y0ur_f1rst_fl4g}",

  rules: [
    { head: "NO ATTACKS", body: "Do not attack the CTF infrastructure, players, or organizers." },
    { head: "FLAG SHARING", body: "Keep flags confidential. Do not share them under any circumstances." },
    ...
  ]
};
```

---

## 🚢 Deployment

Because the project is completely static, it can be deployed with zero build configuration to any static web hosting provider:

- **Vercel / Netlify:** Import the repository or drag-and-drop the project folder. No build command required; publish directory is `./`.
- **GitHub Pages:** Go to your repository **Settings** → **Pages** → select `main` branch root (`/`) and save.
- **Cloudflare Pages:** Connect Git repository with default static settings.

---

## 📜 Credits & Acknowledgments

- 3D World architecture, camera motion logic, and assets adapted from [Andrew Woan's Codrops Fan Museum](https://github.com/andrewwoan/codrops-fan-museum) under the [MIT License](LICENSE-THIRD-PARTY.md).
- Arcade cabinet 3D model, custom CRT canvas worker pipeline, retro HUD design, telemetry systems, and event integrations created for the **DECIPHER** CTF platform.
