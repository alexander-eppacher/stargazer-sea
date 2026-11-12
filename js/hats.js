import * as THREE from 'three';
import { sticker, toTexture, stickerGeometry, css, drawStar } from './paper.js';
import { cutMat, depthMat } from './ocean.js';

/*
 * Hüte als Papier-Sticker. Einheit = ein "Pixel" der Krabbe.
 * Teile: [x, yUnten, z, breite, höhe, tiefe, farbe, leuchtend?]
 * Die Vorderansicht wird gemalt (z bestimmt nur die Reihenfolge).
 * y = 0 ist die Oberkante des Krabbenkörpers (12 breit).
 */
const W = 0xffffff, BLACK = 0x26262b, GOLD = 0xffc93c, GOLD_D = 0xd99a1e, RED = 0xef4444;

const DEFS = {
  beanie: () => [
    [0, 0, 0, 12.4, 1.6, 7.6, W],
    [0, 1.6, 0, 11.6, 1.4, 7.0, RED],
    [0, 3.0, 0, 10.4, 1.2, 6.2, W],
    [0, 4.2, 0, 8.6, 1.2, 5.2, RED],
    [0, 5.4, 0, 5.6, 1.0, 3.6, RED],
    [0, 6.4, 0, 2.6, 2.2, 2.4, W],
  ],
  cap: () => [
    [0, 0, -0.3, 11, 2.8, 6.8, 0x3b82f6],
    [0, 2.8, -0.3, 8.6, 1.2, 5.2, 0x3b82f6],
    [2.4, 0, 4.6, 10, 0.8, 3.6, 0x1e40af],
    [0, 4.0, -0.3, 1.2, 0.6, 1.2, W],
    [-1.5, 1.0, 3.15, 3, 1.4, 0.3, W],
  ],
  sailor: () => [
    [0, 0, 0, 11.4, 1.8, 7.4, 0x1e3a8a],
    [0, 1.8, 0, 13, 1.2, 9, W],
    [0, 3.0, 0, 1.8, 1.0, 1.8, RED],
  ],
  propeller: () => [
    [-2.9, 0, 1.9, 5.8, 3, 3.6, RED], [2.9, 0, 1.9, 5.8, 3, 3.6, 0xfacc15],
    [0, 3, 0, 8, 1.2, 5, 0x9333ea],
    [0, 4.2, 0, 0.8, 1.6, 0.8, 0x52525b],
  ],
  flower: () => [
    [3, 0, 0, 0.7, 3.4, 0.7, 0x16a34a],
    [3.9, 1.2, 0, 1.4, 0.6, 0.8, 0x22c55e],
    [2.2, 2.0, 0, 1.2, 0.6, 0.8, 0x22c55e],
  ],
  tophat: () => [
    [0, 0, 0, 13, 0.9, 9.4, BLACK],
    [0, 0.9, 0, 8, 1.4, 6, RED],
    [0, 2.3, 0, 8, 5.4, 6, BLACK],
    [0, 7.7, 0, 8.4, 0.5, 6.4, 0x3f3f46],
  ],
  pirate: () => [
    [0, 0, 0, 14, 1.2, 9, BLACK],
    [-6.2, 1.2, 0, 1.6, 2.2, 9, BLACK], [6.2, 1.2, 0, 1.6, 2.2, 9, BLACK],
    [0, 1.2, 0, 9, 3.2, 6.2, BLACK],
    [0, 1.0, 4.45, 14, 0.4, 0.3, GOLD],
    [0, 1.8, 3.15, 2.6, 2.2, 0.3, W],
    [-0.55, 2.6, 3.32, 0.6, 0.6, 0.2, BLACK], [0.55, 2.6, 3.32, 0.6, 0.6, 0.2, BLACK],
    [-1.2, 1.4, 3.2, 3.6, 0.5, 0.25, W],
  ],
  viking: () => [
    [0, 0, 0, 12.4, 0.9, 8.2, GOLD],
    [0, 0.9, 0, 11.6, 2, 7.6, 0xa1a9b4],
    [0, 2.9, 0, 9.4, 1.6, 6.2, 0xa1a9b4],
    [0, 4.5, 0, 6.2, 1, 4.2, 0xc0c7d0],
    [0, 0.9, 3.85, 1, 4.2, 0.3, GOLD],
    [-6.8, 1.6, 0, 2, 1.6, 1.8, 0xf5f0dc], [6.8, 1.6, 0, 2, 1.6, 1.8, 0xf5f0dc],
    [-8.2, 2.8, 0, 1.6, 1.8, 1.5, 0xf5f0dc], [8.2, 2.8, 0, 1.6, 1.8, 1.5, 0xf5f0dc],
    [-8.9, 4.5, 0, 1.2, 1.8, 1.2, 0xece4c6], [8.9, 4.5, 0, 1.2, 1.8, 1.2, 0xece4c6],
    [-9.0, 6.2, 0, 0.8, 1.3, 0.8, 0xe2d8b4], [9.0, 6.2, 0, 0.8, 1.3, 0.8, 0xe2d8b4],
  ],
  wizard: () => {
    const B = 0x4c3fd1;
    return [
      [0, 0, 0, 14, 0.9, 10, 0x3b2fa8],
      [0, 0.9, 0, 8.2, 2.2, 6.6, B],
      [0.4, 3.1, -0.2, 6.6, 2.2, 5.4, B],
      [1.0, 5.3, -0.5, 5, 2.2, 4.2, B],
      [1.8, 7.5, -0.9, 3.6, 2, 3, B],
      [2.8, 9.5, -1.4, 2.4, 1.8, 2, B],
      [3.9, 11.3, -2.0, 1.4, 1.4, 1.4, B],
      [0, 0.9, 0, 8.4, 0.8, 6.8, 0xfacc15],
      [-2.6, 2.4, 3.35, 1, 1, 0.2, 0xfff3a0], [1.6, 4.4, 2.8, 0.9, 0.9, 0.2, 0xfff3a0],
      [2.4, 7.8, 0.65, 0.8, 0.8, 0.2, 0xfff3a0], [-1.4, 6, 1.6, 0.7, 0.7, 0.2, 0xfff3a0],
      [4.9, 11.6, -2.0, 0.9, 0.9, 0.9, 0xfff3a0],
    ];
  },
  shark: () => {
    const G = 0x8296ab;
    const teeth = [];
    for (let i = -4; i <= 4; i++) teeth.push([i * 1.2, -0.9, 3.95, 0.7, 1.0, 0.3, W]);
    return [
      [0.6, 3.2, 0, 4.6, 1.4, 1, G], [1.0, 4.6, 0, 3.6, 1.4, 1, G], [1.5, 6.0, 0, 2.6, 1.4, 1, G], [2.1, 7.4, 0, 1.4, 1.2, 1, G],
      [0, 0, 0, 12.6, 2.2, 7.8, G],
      [0, 2.2, 0, 10.8, 1, 6.6, G],
      [0, 3.0, 0, 3, 0.4, 1, 0xdfe7ef],
      ...teeth,
      [-4.6, 1.2, 3.95, 1, 1, 0.3, BLACK], [4.6, 1.2, 3.95, 1, 1, 0.3, BLACK],
    ];
  },
  crown: () => [
    [0, 0, 0, 10.4, 1.8, 7.2, GOLD],
    [0, 0.2, 3.65, 10.4, 0.5, 0.2, GOLD_D],
    [-4.7, 1.8, 3.1, 1, 2.2, 1, GOLD], [4.7, 1.8, 3.1, 1, 2.2, 1, GOLD],
    [-2.4, 1.8, 3.1, 1, 1.6, 1, GOLD], [2.4, 1.8, 3.1, 1, 1.6, 1, GOLD],
    [0, 1.8, 3.1, 1.2, 3, 1, GOLD],
    [-4.7, 4.0, 3.1, 1, 0.8, 1, W], [4.7, 4.0, 3.1, 1, 0.8, 1, W], [0, 4.8, 3.1, 1.2, 1, 1, W],
    [0, 0.5, 3.75, 1.6, 1, 0.3, 0xff2d55],
    [-3, 0.6, 3.75, 1, 0.8, 0.3, 0x3b82f6], [3, 0.6, 3.75, 1, 0.8, 0.3, 0x3b82f6],
  ],
  starcrown: () => [
    [0, 0, 0, 10.6, 1.4, 7.4, 0x3a2a6a],
    [0, 0.35, 3.75, 10.6, 0.6, 0.2, 0xffc6f0],
    [-3, 0.4, 3.8, 1, 0.6, 0.2, 0xfff3a0], [3, 0.4, 3.8, 1, 0.6, 0.2, 0xfff3a0],
  ],
  // Babykrabben tragen noch ein Stück Eierschale (der echte Hut kommt erst später)
  eggshell: () => [
    [0, 0, 0, 9.8, 2.2, 6.6, 0xfbf1dc],
    [-3.95, 2.2, 0, 1.9, 1.4, 6.6, 0xfbf1dc],
    [-1.3, 2.2, 0, 1.9, 0.7, 6.6, 0xfbf1dc],
    [1.35, 2.2, 0, 1.9, 1.6, 6.6, 0xfbf1dc],
    [3.95, 2.2, 0, 1.9, 0.9, 6.6, 0xfbf1dc],
    [-2.6, 0.6, 3.4, 1.4, 1.1, 0.2, 0xffb7c9],
    [2.4, 1.1, 3.4, 1.0, 0.9, 0.2, 0xffb7c9],
    [-0.2, 2.2, 3.4, 0.8, 0.6, 0.2, 0xffb7c9],
  ],
  // Saison-Deko (nur für Krabben ohne Hut)
  santa: () => [
    [0, 0, 0, 12.6, 1.6, 7.8, W],
    [-0.4, 1.6, 0, 10.6, 1.6, 7, 0xdc2626],
    [0.6, 3.2, -0.3, 8, 1.4, 5.6, 0xdc2626],
    [1.8, 4.6, -0.6, 5.4, 1.2, 4, 0xdc2626],
    [3.4, 5.8, -0.9, 3.2, 1.0, 2.6, 0xdc2626],
    [5.4, 5.0, -1.0, 2.6, 2.4, 2.4, W],
  ],
  witch: () => [
    [0, 0, 0, 14.4, 0.9, 10, 0x2e1f47],
    [0, 0.9, 0, 8, 0.9, 6.4, 0xf97316],
    [0, 1.8, 0, 7.6, 2.2, 6.2, 0x3b2a5c],
    [0.6, 4.0, -0.3, 5.6, 2.2, 4.6, 0x3b2a5c],
    [1.4, 6.2, -0.6, 3.6, 2, 3, 0x3b2a5c],
    [2.6, 8.2, -1.0, 1.8, 1.6, 1.6, 0x3b2a5c],
  ],
};

/** Farbton verschieben (Sorte): Weiß/Grau/Schwarz bleiben, bunte Farben drehen sich um hue * 36°. */
const tmpHSL = { h: 0, s: 0, l: 0 };
export function shiftHue(hex, hue) {
  if (!hue) return hex;
  const c = new THREE.Color(hex);
  c.getHSL(tmpHSL, THREE.SRGBColorSpace);
  if (tmpHSL.s < 0.15) return hex;
  return c.setHSL((tmpHSL.h + hue * 0.1) % 1, tmpHSL.s, tmpHSL.l, THREE.SRGBColorSpace).getHex();
}
const shiftParts = (parts, hue) => (hue ? parts.map((p) => { const q = [...p]; q[6] = shiftHue(p[6], hue); return q; }) : parts);

const P = 14; // Canvas-Pixel pro Krabben-Pixel
const artCache = new Map();
function rectSticker(parts, outline = 7) {
  const minX = Math.min(...parts.map((p) => p[0] - p[3] / 2));
  const maxX = Math.max(...parts.map((p) => p[0] + p[3] / 2));
  const minY = Math.min(...parts.map((p) => p[1]));
  const maxY = Math.max(...parts.map((p) => p[1] + p[4]));
  const sorted = [...parts].sort((a, b) => a[2] + a[5] / 2 - (b[2] + b[5] / 2));
  const stk = sticker((maxX - minX) * P, (maxY - minY) * P, (ctx) => {
    for (const [x, y, , w, h, , c] of sorted) {
      const px = (x - w / 2 - minX) * P, py = (maxY - (y + h)) * P;
      ctx.fillStyle = css(c);
      ctx.fillRect(px, py, w * P, h * P);
      if (h * P > 10) {
        ctx.fillStyle = css(c, -0.12);
        ctx.fillRect(px, py + h * P - 3, w * P, 3);
      }
    }
  }, { outline, thick: 3 });
  return { stk, t: toTexture(stk.canvas), minX, maxX, minY, maxY };
}

function hatArt(id, hue = 0) {
  const key = `${id}|${hue}`;
  if (!artCache.has(key)) {
    const parts = DEFS[id] ? shiftParts(DEFS[id](), hue) : [];
    artCache.set(key, parts.length ? rectSticker(parts) : null);
  }
  return artCache.get(key);
}

function plane(a, U, z = 0) {
  const g = stickerGeometry(a.stk, (a.maxX - a.minX) * U, 'bottom');
  g.translate(((a.minX + a.maxX) / 2) * U, a.minY * U, z);
  const m = new THREE.Mesh(g, cutMat(a.t, 0, 1, 0.45));
  m.castShadow = true;
  m.customDepthMaterial = depthMat(a.t);
  return m;
}

const extra = {};
function extraArt(key, make) {
  if (!extra[key]) extra[key] = make();
  return extra[key];
}

export const mythicMaterial = (() => {
  const stk = drawStar(0xffe27a);
  const t = toTexture(stk.canvas);
  const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, emissiveMap: t, emissive: new THREE.Color(1, 0.5, 0.9) });
  m.userData.stk = stk;
  return m;
})();

/**
 * Baut einen Hut. Rückgabe: { group, update(t, crab, dt) }.
 */
export function buildHat(id, U, hue = 0) {
  const group = new THREE.Group();
  const a = hatArt(id, hue);
  if (a) group.add(plane(a, U, 0.02));
  let update = () => {};

  if (id === 'propeller') {
    const b = extraArt(`prop${hue}`, () => rectSticker(shiftParts([[-2.6, 0, 0, 4.6, 1.1, 1, RED], [2.6, 0, 0, 4.6, 1.1, 1, 0x3b82f6], [0, -0.2, 1, 1.2, 1.4, 1, 0xfacc15]], hue), 5));
    const prop = plane(b, U, 0.03);
    const holder = new THREE.Group();
    holder.position.y = 5.7 * U;
    holder.add(prop);
    group.add(holder);
    let spin = 0;
    update = (t, crab, dt) => {
      spin += dt * (7 + crab.moving * 18);
      holder.scale.x = Math.cos(spin);
    };
  }

  if (id === 'flower') {
    const b = extraArt(`flower${hue}`, () => {
      const parts = [];
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        parts.push([Math.cos(ang) * 1.5, Math.sin(ang) * 1.5 - 0.7, 0, 1.6, 1.6, 0.8, i % 2 ? 0xff6fb5 : 0xff9ccc]);
      }
      parts.push([0, -0.7, 1, 1.5, 1.5, 1, 0xfde047]);
      return rectSticker(shiftParts(parts, hue), 5);
    });
    const holder = new THREE.Group();
    holder.position.set(3 * U, 4.2 * U, 0.03);
    const head = plane(b, U);
    head.position.y = -b.minY * U - ((b.maxY - b.minY) / 2) * U;
    holder.add(head);
    group.add(holder);
    update = (t, crab) => { holder.rotation.z = Math.sin(t * 2 + crab.seed) * 0.3; };
  }

  if (id === 'halo') {
    const ring = extraArt(`halo${hue}`, () => {
      const stk = sticker(9 * P, 3 * P, (ctx, w, h) => {
        ctx.strokeStyle = css(shiftHue(0xffd23f, hue)); ctx.lineWidth = P * 0.9;
        ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2 - P * 0.5, h / 2 - P * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#fff6c2'; ctx.lineWidth = P * 0.3;
        ctx.beginPath(); ctx.ellipse(w / 2, h / 2 - 2, w / 2 - P * 0.5, h / 2 - P * 0.5, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      }, { outline: 5, thick: 2 });
      return { stk, t: toTexture(stk.canvas) };
    });
    const halo = new THREE.Mesh(stickerGeometry(ring.stk, 9 * U, 'center'), cutMat(ring.t, 0, 1, 1.2));
    halo.position.z = 0.03;
    group.add(halo);
    const wing = extraArt('wing', () => rectSticker([
      [1.6, 0, 0, 3.2, 3.6, 1, W], [3.8, 0.8, 0, 2.2, 2.8, 1, 0xf1f5f9],
      [5.4, 1.8, 0, 1.6, 1.8, 1, 0xe2e8f0], [2.4, -1, 0, 2.8, 1.2, 1, 0xf8fafc],
    ], 5));
    const wings = [1, -1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 5.6 * U, -3.6 * U, -0.03);
      pivot.add(plane(wing, U));
      pivot.scale.x = side;
      group.add(pivot);
      return { pivot, side };
    });
    update = (t, crab) => {
      halo.position.y = (4.4 + Math.sin(t * 2 + crab.seed) * 0.6) * U;
      for (const w of wings) w.pivot.rotation.y = w.side * (0.2 + Math.sin(t * 7 + crab.seed) * 0.6);
    };
  }

  if (id === 'starcrown') {
    const stk = mythicMaterial.userData.stk;
    const big = new THREE.Mesh(stickerGeometry(stk, 5.4 * U, 'center'), mythicMaterial);
    big.position.set(0, 5.6 * U, 0.04);
    group.add(big);
    const orbit = new THREE.Group();
    orbit.position.y = 3 * U;
    group.add(orbit);
    const smalls = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(stickerGeometry(stk, 2 * U, 'center'), mythicMaterial);
      const ang = (i / 6) * Math.PI * 2;
      s.position.set(Math.cos(ang) * 7.5 * U, 0, Math.sin(ang) * 7.5 * U);
      orbit.add(s);
      smalls.push(s);
    }
    update = (t) => {
      big.rotation.y = Math.sin(t * 1.6) * 0.55; // schaukeln statt drehen: Stern bleibt sichtbar
      big.rotation.z = Math.sin(t * 1.1) * 0.15;
      big.position.y = (5.6 + Math.sin(t * 2.2) * 0.5) * U;
      orbit.rotation.y = -t * 1.1;
      smalls.forEach((s, i) => {
        s.rotation.y = Math.sin(t * 2 + i) * 0.6;
        s.position.y = Math.sin(t * 3 + i * 1.3) * 0.8 * U;
      });
    };
  }

  return { group, update };
}

/** Einmal pro Frame: Regenbogen-Leuchten der Sternenkrone. */
export function updateHatMaterials(t) {
  mythicMaterial.emissive.setHSL((t * 0.08) % 1, 0.95, 0.5).multiplyScalar(0.45);
}
