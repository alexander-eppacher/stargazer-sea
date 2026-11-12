import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------- Zufall ---------------- */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const range = (rng, a, b) => a + rng() * (b - a);

/* ---------------- Mathe ---------------- */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ---------------- Rauschen (Value Noise) ---------------- */
function h2(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function h3(x, y, z) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440670441);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);

export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = fade(x - xi), yf = fade(y - yi);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf) * 2 - 1;
}

export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const l = (dz) => lerp(
    lerp(h3(xi, yi, zi + dz), h3(xi + 1, yi, zi + dz), xf),
    lerp(h3(xi, yi + 1, zi + dz), h3(xi + 1, yi + 1, zi + dz), xf),
    yf,
  );
  return lerp(l(0), l(1), zf) * 2 - 1;
}

export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}

/* ---------------- Geometrie ---------------- */
const tmpColor = new THREE.Color();

/** Färbt eine Geometrie per Vertex-Farbe. shade = Ober-/Unterseiten leicht abtönen (Pixel-Look). */
export function paint(geo, color, { shade = false, jitter = 0, rng = Math.random } = {}) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const nor = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    let k = 1;
    if (shade && nor) {
      const ny = nor.getY(i);
      k = ny > 0.5 ? 1.08 : ny < -0.5 ? 0.62 : 1;
    }
    if (jitter) k *= 1 + (rng() - 0.5) * jitter;
    arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Einheitliches Zusammenführen: alles nicht-indiziert, nur gewünschte Attribute. */
export function mergeAll(geos, attrs = ['position', 'normal', 'color']) {
  const list = geos.filter(Boolean).map((g) => {
    let gg = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(gg.attributes)) if (!attrs.includes(name)) gg.deleteAttribute(name);
    for (const name of attrs) {
      if (!gg.attributes[name]) {
        const size = name === 'aSway' ? 1 : 3;
        gg.setAttribute(name, new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * size), size));
      }
    }
    return gg;
  });
  if (!list.length) return null;
  return mergeGeometries(list, false);
}

/**
 * Voxel-Baukasten. Teile: [x, yUnten, z, breite, höhe, tiefe, farbe, glow?]
 * Gibt { geo, glow } zurück (glow = leuchtende Teile für Bloom).
 */
export function vox(parts, U = 1, shade = true) {
  const normal = [], glow = [];
  for (const [x, y, z, w, h, d, c, gl] of parts) {
    const g = new THREE.BoxGeometry(w * U, h * U, d * U);
    g.translate(x * U, (y + h / 2) * U, z * U);
    paint(g, c, { shade: shade && !gl });
    (gl ? glow : normal).push(g);
  }
  return { geo: mergeAll(normal), glow: mergeAll(glow) };
}

export function starShape(outer = 1, inner = 0.45, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

/** Zylinder von Punkt a nach b. */
const UP = new THREE.Vector3(0, 1, 0);
export function cylBetween(a, b, r0, r1, color, seg = 6, hseg = 1) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, hseg, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  paint(g, color);
  return g;
}

/** Setzt das aSway-Attribut (0 am Fuß, 1 an der Spitze) anhand der Höhe. */
export function setSway(geo, baseY, height, power = 1.6, amp = 1) {
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    arr[i] = Math.pow(clamp((p.getY(i) - baseY) / height, 0, 1), power) * amp;
  }
  geo.setAttribute('aSway', new THREE.BufferAttribute(arr, 1));
  return geo;
}

/** Runde, weiche Textur (für Schatten / Glühen). */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function hdr(color, k) {
  return new THREE.Color(color).multiplyScalar(k);
}

export { tmpColor };
