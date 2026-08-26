/* ============================================================
   DECIPHER — deep space backdrop
   Procedural planets, a ringed giant, an asteroid belt and nebula.
   Everything is generated in shaders, so it costs bytes of source
   rather than megabytes of texture.
   ============================================================ */
import * as THREE from "three";

/* ---------- shared GLSL: gradient noise + fbm ---------- */
const NOISE = /* glsl */`
vec3 hash3(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7,  74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
                     dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
                     dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
                     dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
                     dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}
float fbm(vec3 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * gnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}`;

const PLANET_VERT = /* glsl */`
varying vec3 vNormalW;
varying vec3 vPosL;
varying vec3 vViewDir;
void main(){
  vPosL = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/* Banded gas giant: fbm warps the latitude so the bands churn and curl,
   then a rim term fakes an atmosphere catching the star. */
const PLANET_FRAG = /* glsl */`
uniform float uTime;
uniform vec3  uLow;
uniform vec3  uHigh;
uniform vec3  uRim;
uniform vec3  uLightDir;
uniform float uBands;
uniform float uWarp;
uniform float uRough;
varying vec3 vNormalW;
varying vec3 vPosL;
varying vec3 vViewDir;
${NOISE}
void main(){
  vec3 p = normalize(vPosL);

  // churn the latitude, then slice it into bands
  float warp = fbm(p * uWarp + vec3(0.0, uTime * 0.015, 0.0));
  float lat  = p.y * uBands + warp * 2.2;
  float band = fbm(vec3(lat, p.x * uRough, p.z * uRough));
  float t = smoothstep(-0.35, 0.45, band);

  vec3 col = mix(uLow, uHigh, t);

  // storm cells
  float storm = smoothstep(0.42, 0.72, fbm(p * 5.5 + vec3(uTime * 0.02, 0.0, 0.0)));
  col += uRim * storm * 0.16;

  // key light
  float lambert = clamp(dot(normalize(vNormalW), normalize(uLightDir)), 0.0, 1.0);
  col *= 0.20 + 0.95 * lambert;

  // atmospheric rim, strongest where the surface turns away from the eye
  float fres = pow(1.0 - clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0), 3.0);
  col += uRim * fres * 1.15;

  gl_FragColor = vec4(col, 1.0);
}`;

/* Ring plane: concentric noise bands, transparent gaps, fades at both edges. */
const RING_FRAG = /* glsl */`
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uInner;
uniform float uOuter;
varying vec2 vUv;
${NOISE}
void main(){
  float r = length(vUv - 0.5) * 2.0;
  if (r < uInner || r > uOuter) discard;
  float t = (r - uInner) / (uOuter - uInner);

  float g = fbm(vec3(r * 46.0, 0.0, 0.0));
  float density = smoothstep(0.18, 0.62, g);
  // thin out at both rims so the ring has no hard edge
  density *= smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.82, 1.0, t));

  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 1.0, t + g * 0.28));
  gl_FragColor = vec4(col, density * 0.85);
  if (gl_FragColor.a < 0.01) discard;
}`;

const RING_VERT = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/* ---------- builders ---------- */

function makePlanet({ radius, low, high, rim, bands, warp, rough, segments }) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uLow: { value: new THREE.Color(low) },
      uHigh: { value: new THREE.Color(high) },
      uRim: { value: new THREE.Color(rim) },
      uLightDir: { value: new THREE.Vector3(0.6, 0.45, 0.65).normalize() },
      uBands: { value: bands },
      uWarp: { value: warp },
      uRough: { value: rough }
    }
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments), mat);
  mesh.userData.mat = mat;
  return mesh;
}

function makeRing(inner, outer, colorA, colorB) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uInner: { value: inner / outer },
      uOuter: { value: 1.0 }
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(outer * 2, outer * 2), mat);
}

/* Irregular rock: an icosahedron pushed around by hashed noise. */
function rockGeometry(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 4.1) * Math.cos(v.y * 3.7) * Math.sin(v.z * 4.9);
    v.multiplyScalar(1 + n * 0.34);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function makeStarfield(count, spread) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const siz = new Float32Array(count);
  const palette = [
    new THREE.Color(0xffffff), new THREE.Color(0xbcd8ff),
    new THREE.Color(0xffd9a8), new THREE.Color(0x9ffff0), new THREE.Color(0xd7b3ff)
  ];
  for (let i = 0; i < count; i++) {
    // shell, so stars never sit inside the play area
    const r = spread * (0.55 + Math.random() * 0.45);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const c = palette[(Math.random() * palette.length) | 0];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = 0.6 + Math.random() * 2.4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) } },
    vertexShader: /* glsl */`
      attribute float aSize;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uTime;
      uniform float uPixelRatio;
      void main(){
        vColor = color;
        // each star drifts on its own phase so the field shimmers
        vTwinkle = 0.55 + 0.45 * sin(uTime * 1.7 + position.x * 0.6 + position.y * 0.4);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vTwinkle;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vColor * vTwinkle, core * core * vTwinkle);
      }`,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  return new THREE.Points(g, mat);
}

function makeNebula(count, spread) {
  // soft radial sprite, drawn once and reused
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g2 = c.getContext("2d");
  const grad = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0.0, "rgba(255,255,255,0.5)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.14)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);

  const group = new THREE.Group();
  const tints = [0x7b2cbf, 0xff00ff, 0x00ffcc, 0x3a0ca3];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({
      map: tex,
      color: tints[i % tints.length],
      transparent: true,
      opacity: 0.10 + Math.random() * 0.10,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const s = new THREE.Sprite(m);
    const r = spread * (0.4 + Math.random() * 0.5);
    const th = Math.random() * Math.PI * 2;
    s.position.set(Math.cos(th) * r, (Math.random() - 0.5) * spread * 0.5, Math.sin(th) * r);
    const sc = spread * (0.28 + Math.random() * 0.4);
    s.scale.set(sc, sc, 1);
    group.add(s);
  }
  return group;
}

/* ---------- public API ---------- */
export function buildSpace(scene, { isMobile = false, envMap = null } = {}) {
  const root = new THREE.Group();
  scene.add(root);

  const planets = [];
  const spin = [];

  /* --- starfield --- */
  const stars = makeStarfield(isMobile ? 900 : 2600, 900);
  root.add(stars);

  /* --- nebula --- */
  root.add(makeNebula(isMobile ? 5 : 10, 700));

  /* --- ringed giant, the hero object --- */
  const giant = new THREE.Group();
  giant.position.set(-150, 78, -330);
  const giantBody = makePlanet({
    radius: 46, low: 0x2a0f5c, high: 0x8b3ffb, rim: 0x00ffcc,
    bands: 7.0, warp: 2.1, rough: 1.4, segments: isMobile ? 32 : 64
  });
  giant.add(giantBody);
  planets.push(giantBody);

  const ring = makeRing(62, 104, 0x8b5cf6, 0x00ffcc);
  ring.rotation.x = -Math.PI / 2.32;
  ring.rotation.z = 0.24;
  giant.add(ring);
  giant.rotation.z = 0.22;
  root.add(giant);
  spin.push({ obj: giantBody, y: 0.00035 });

  /* --- warm giant on the opposite side --- */
  const amber = makePlanet({
    radius: 30, low: 0x5c1c07, high: 0xffb347, rim: 0xff5e7a,
    bands: 9.5, warp: 2.8, rough: 1.9, segments: isMobile ? 24 : 48
  });
  amber.position.set(230, -40, -420);
  root.add(amber);
  planets.push(amber);
  spin.push({ obj: amber, y: 0.00028 });

  /* --- small icy world, close enough to read detail --- */
  const icy = makePlanet({
    radius: 11, low: 0x07314a, high: 0x7ff0ff, rim: 0x00ffcc,
    bands: 4.0, warp: 3.4, rough: 2.6, segments: isMobile ? 20 : 40
  });
  icy.position.set(96, 54, -190);
  root.add(icy);
  planets.push(icy);
  spin.push({ obj: icy, y: -0.0005 });

  /* --- asteroid belt: one instanced draw call for the whole swarm --- */
  const COUNT = isMobile ? 90 : 260;
  const rocks = new THREE.InstancedMesh(
    rockGeometry(isMobile ? 0 : 1),
    new THREE.MeshStandardMaterial({
      color: 0x6b5b8a, roughness: 0.62, metalness: 0.45,
      envMap, envMapIntensity: 0.9,
      emissive: 0x2a1150, emissiveIntensity: 0.35
    }),
    COUNT
  );
  const belt = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sv = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    belt.push({
      a: Math.random() * Math.PI * 2,
      r: 120 + Math.random() * 190,
      y: (Math.random() - 0.5) * 70,
      s: 0.6 + Math.random() * 3.4,
      sp: 0.00004 + Math.random() * 0.00012,
      rx: (Math.random() - 0.5) * 0.01,
      ry: (Math.random() - 0.5) * 0.01,
      ex: Math.random() * Math.PI, ey: Math.random() * Math.PI
    });
  }
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(rocks);

  /* --- a few polished shards for specular sparkle --- */
  const shards = new THREE.Group();
  const shardMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1.0, roughness: 0.08,
    envMap, envMapIntensity: 2.0,
    emissive: 0x00ffcc, emissiveIntensity: 0.12
  });
  for (let i = 0; i < (isMobile ? 6 : 16); i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(1.1 + Math.random() * 2.2, 0), shardMat);
    const th = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 150;
    s.position.set(Math.cos(th) * r, (Math.random() - 0.5) * 90, Math.sin(th) * r - 60);
    s.userData = { rx: (Math.random() - 0.5) * 0.012, ry: (Math.random() - 0.5) * 0.012 };
    shards.add(s);
  }
  root.add(shards);

  /* --- per-frame --- */
  function update(nowMs) {
    const t = nowMs * 0.001;
    for (const p of planets) p.userData.mat.uniforms.uTime.value = t;
    for (const s of spin) s.obj.rotation.y += s.y * 16;
    stars.material.uniforms.uTime.value = t;

    for (let i = 0; i < COUNT; i++) {
      const b = belt[i];
      b.a += b.sp * 16;
      b.ex += b.rx; b.ey += b.ry;
      e.set(b.ex, b.ey, 0);
      q.setFromEuler(e);
      sv.setScalar(b.s);
      m4.compose(
        { x: Math.cos(b.a) * b.r, y: b.y, z: Math.sin(b.a) * b.r - 120 },
        q, sv
      );
      rocks.setMatrixAt(i, m4);
    }
    rocks.instanceMatrix.needsUpdate = true;

    for (const s of shards.children) {
      s.rotation.x += s.userData.rx;
      s.rotation.y += s.userData.ry;
    }
  }

  return { root, update };
}
