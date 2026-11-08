/**
 * Ash & Oath — shared helpers, world layout and terrain sampling.
 */
import * as THREE from '../vendor/three.module.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function seeded(seed) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) | 0; return (s >>> 0) / 4294967296; };
}

/* Device-aware visual tiers: use the best practical detail for each phone. */
const ua = navigator.userAgent || '';
export const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
export const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (isTouch && Math.min(innerWidth, innerHeight) < 820);
const cores = navigator.hardwareConcurrency || 4;
const memory = navigator.deviceMemory || 4;
const highEndMobile = isMobile && ((memory >= 8 && cores >= 6) || (cores >= 8 && /iPhone|iPad/i.test(ua)));
const lowEndMobile = isMobile && !highEndMobile && (memory <= 3 || (cores <= 4 && memory <= 4));
const mobileTier = !isMobile ? 'desktop' : highEndMobile ? 'ultra' : lowEndMobile ? 'balanced' : 'high';
export const QUALITY = {
  mobile: isMobile,
  tier: mobileTier,
  // Phones with dense displays benefit from 2x rendering; weaker devices start lower.
  pixelCap: isMobile ? (highEndMobile ? 2 : lowEndMobile ? 1.3 : 1.6) : Math.min(devicePixelRatio || 1, 2),
  antialias: !isMobile || highEndMobile,
  softShadows: !isMobile || highEndMobile,
  shadows: isMobile ? (highEndMobile ? 2048 : lowEndMobile ? 768 : 1280) : 2048,
  shadowRadius: isMobile ? (highEndMobile ? 26 : 24) : 32,
  terrainSeg: isMobile ? (highEndMobile ? 152 : lowEndMobile ? 112 : 132) : 176,
  grass: isMobile ? (highEndMobile ? 5200 : lowEndMobile ? 2800 : 3900) : 6800,
  reeds: isMobile ? (highEndMobile ? 260 : lowEndMobile ? 150 : 210) : 300,
  trees: isMobile ? (highEndMobile ? 140 : lowEndMobile ? 90 : 120) : 160,
  rocks: isMobile ? (highEndMobile ? 60 : lowEndMobile ? 36 : 48) : 74,
  fireflies: isMobile ? (highEndMobile ? 130 : lowEndMobile ? 70 : 100) : 150,
  particles: isMobile ? (highEndMobile ? 620 : lowEndMobile ? 320 : 480) : 760,
  wisps: 5,
};

export const WATER_Y = -0.55;
export const START = { x: -33.5, z: 43 };
export const KEEPER_POS = { x: -24.5, z: 24.5 };
export const SHRINE_POS = { x: 34, z: -26 };

const PATH_POINTS = [
  [-46, 62], [-39, 48], [-32.5, 38], [-26, 30], [-18, 22], [-7, 14.2],
  [1, 10.5], [10, 5], [19, -3], [27, -14], [34, -26],
];
const STREAM_POINTS = [
  [-2, -118], [7, -82], [-5, -48], [2, -18], [-7, 14], [4, 48],
  [-4, 82], [6, 118],
];

function sampleCurve(points, count) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])));
  return curve.getSpacedPoints(count).map(v => ({ x: v.x, z: v.z }));
}
export const PATH_SAMPLES = sampleCurve(PATH_POINTS, 220);
export const STREAM_SAMPLES = sampleCurve(STREAM_POINTS, 240);

function distToSamples(x, z, samples) {
  let best = 1e9;
  for (let i = 0; i < samples.length; i++) {
    const dx = x - samples[i].x, dz = z - samples[i].z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export const pathDist = (x, z) => distToSamples(x, z, PATH_SAMPLES);
export const streamDist = (x, z) => distToSamples(x, z, STREAM_SAMPLES);

export function baseHeight(x, z) {
  let h = 1.05 * Math.sin(x * 0.055) * Math.cos(z * 0.05)
        + 0.62 * Math.sin(x * 0.115 + 1.3) * Math.sin(z * 0.088 + 0.5)
        + 0.24 * Math.sin(x * 0.27 - 0.6) * Math.cos(z * 0.23 + 1.1);
  const ds = Math.hypot(x - SHRINE_POS.x, z - SHRINE_POS.z);
  h += 3.1 * Math.exp(-(ds * ds) / (2 * 12 * 12));
  h += 1.7 * Math.exp(-(((x + 63) ** 2 + (z + 57) ** 2)) / (2 * 20 * 20));
  h += 1.5 * Math.exp(-(((x - 57) ** 2 + (z - 54) ** 2)) / (2 * 22 * 22));
  const r = Math.hypot(x, z);
  h += Math.max(0, r - 56) * 0.16;
  return h;
}

export function terrainHeight(x, z) {
  let h = baseHeight(x, z);
  const d = streamDist(x, z);
  if (d < 10) h = lerp(-1.5, h, smoothstep(3.0, 10.0, d));
  const r = Math.hypot(x, z);
  if (r > 92) h -= (r - 92) * 0.55;
  return h;
}

/* Bridge: crosses the stream where the path does. Runs roughly east-west. */
function streamCrossing(z) {
  let best = STREAM_SAMPLES[0], bd = 1e9;
  for (const s of STREAM_SAMPLES) {
    const d = Math.abs(s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  const i = STREAM_SAMPLES.indexOf(best);
  const a = STREAM_SAMPLES[Math.max(0, i - 1)], b = STREAM_SAMPLES[Math.min(STREAM_SAMPLES.length - 1, i + 1)];
  // Angle of the stream tangent measured from +Z; the bridge runs perpendicular.
  const tangent = Math.atan2(b.x - a.x, b.z - a.z);
  return { x: best.x, z: best.z, angle: -tangent };
}
export const BRIDGE = (() => {
  const c = streamCrossing(14.5);
  return { x: c.x, z: c.z, angle: c.angle, halfLen: 8.2, halfWid: 2.15, deckY: 0.62 };
})();

export function groundHeight(x, z) {
  let h = terrainHeight(x, z);
  const dx = x - BRIDGE.x, dz = z - BRIDGE.z;
  const cs = Math.cos(BRIDGE.angle), sn = Math.sin(BRIDGE.angle);
  const u = dx * cs + dz * sn;
  const v = -dx * sn + dz * cs;
  if (Math.abs(u) < BRIDGE.halfLen + 0.3 && Math.abs(v) < BRIDGE.halfWid + 0.15) {
    const arch = 0.16 * (1 - (u / BRIDGE.halfLen) ** 2);
    h = Math.max(h, BRIDGE.deckY + arch - 0.05);
  }
  return h;
}

export const COLORS = {
  fog: 0x7f948a,
  skyTop: 0x152a44,
  skyMid: 0x456c7a,
  skyHorizon: 0xf0b87e,
  sun: 0xffd9a4,
  gold: 0xe9c882,
  teal: 0x8bd8c9,
  moss: 0x42553a,
  deep: 0x101b18,
};

export function color(hex) { return new THREE.Color(hex); }

/* Soft radial glow sprite texture, generated once. */
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.16, 'rgba(255,255,255,.85)');
  grd.addColorStop(0.42, 'rgba(255,255,255,.32)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

let _dotTex = null;
export function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,.8)');
  grd.addColorStop(0.65, 'rgba(255,255,255,.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _dotTex = new THREE.CanvasTexture(c);
  _dotTex.colorSpace = THREE.SRGBColorSpace;
  return _dotTex;
}

export function glowSprite(hex, scale = 2, opacity = 0.75) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(), color: hex, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}

export function shadowBlob(radius = 0.6) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,.5)');
  grd.addColorStop(0.6, 'rgba(0,0,0,.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.75 })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
