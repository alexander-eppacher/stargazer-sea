/* =========================================================
   Fünf besondere Orte (versunkener Alltagskram):
   Sternwarte (Kochtopf + Nudelsieb + Thermoskanne), Wrack-Café
   (Papierschiff), Blubberbad (Badewanne), Spielplatz (Muschelrutsche,
   Löffelwippe, Kleiderbügel-Schaukel). Das Krabben-Sternbild steht in town.js.
   ========================================================= */
import * as THREE from 'three';
import { vox, paint, mergeAll, cylBetween } from './util.js';
import { sticker, toTexture } from './paper.js';
import { t } from './lang.js';

const U = 0.12;
const WINDOW = 0xffd98a;

/** Plätze am Boden, die schon vor Gras & Deko reserviert werden: [x, z, Radius] */
export const PLACE_SPOTS = {
  bath: [-34.5, 8.5, 2.4],
  play: [21, 27, 2.7],
};

function ring(y, h, r, color) {
  const s = Math.round(r * 0.83);
  return [[0, y, 0, r * 2, h, s * 2, color], [0, y, 0, s * 2, h, r * 2, color]];
}

/* ---------- Bauteile ---------- */

/* ---------- Sternwarte: feine Rundformen (facettiert wie gefaltete Pappe) ---------- */
const flat = (g) => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };
function cyl(rTop, rBot, h, y, color, seg = 18) {
  const g = flat(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1));
  g.translate(0, y + h / 2, 0);
  return paint(g, color, { shade: true });
}
function box(w, h, d, x, y, z, color) {
  const g = flat(new THREE.BoxGeometry(w, h, d));
  g.translate(x, y, z);
  return paint(g, color, { shade: true });
}
function torus(R, r, y, color, arc = Math.PI * 2, seg = 28) {
  const g = flat(new THREE.TorusGeometry(R, r, 6, seg, arc));
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return paint(g, color, { shade: true });
}

const OBS = {
  potD: 0x56616e, pot: 0x8d9aa8, potL: 0xd3dbe3,      // Kochtopf
  colD: 0x6f98b3, col: 0xb7d8ec, colL: 0xf1f8fc,      // Emaille-Nudelsieb (hellblau)
  wood: 0xb5763d, woodL: 0xd9a066, woodD: 0x7a4a2a,
  hole: 0x24303d,
};

/** Statischer Teil der Sternwarte: { geo, glow, holes } in Welt-Einheiten, Boden bei y = 0, Tür zeigt nach +z. */
function observatoryParts() {
  const P = [], G = [];
  // Kochtopf: dunkler Sockel, Topf, heller gerollter Rand, zwei Henkel
  P.push(cyl(1.22, 1.18, 0.16, 0, OBS.potD), cyl(1.3, 1.24, 1.22, 0.16, OBS.pot), torus(1.33, 0.075, 1.4, OBS.potL));
  P.push(cyl(1.315, 1.315, 0.05, 1.12, OBS.potD));
  for (const sx of [1, -1]) {
    const h = flat(new THREE.TorusGeometry(0.22, 0.06, 6, 12, Math.PI));
    h.rotateX(-Math.PI / 2); h.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    h.translate(sx * 1.3, 1.08, 0);
    P.push(paint(h, OBS.potD, { shade: true }));
    P.push(box(0.1, 0.1, 0.06, sx * 1.29, 1.08, 0.22, OBS.potL), box(0.1, 0.1, 0.06, sx * 1.29, 1.08, -0.22, OBS.potL)); // Nieten
  }
  // Tür mit hellem Rahmen, Knauf, Stufe
  P.push(box(0.66, 0.92, 0.06, 0, 0.62, 1.27, OBS.potL), box(0.5, 0.78, 0.08, 0, 0.57, 1.3, 0x2f5d8a), box(0.5, 0.12, 0.09, 0, 0.22, 1.31, 0x1f3f63));
  P.push(box(0.07, 0.07, 0.05, 0.16, 0.58, 1.36, 0xffc93c), box(0.85, 0.08, 0.38, 0, 0.04, 1.5, 0xe9d6b0));
  // Bullaugen links/rechts (Glas leuchtet)
  for (const a of [-0.75, 0.75]) {
    const fr = flat(new THREE.TorusGeometry(0.17, 0.035, 5, 14)); fr.rotateY(a); fr.translate(Math.sin(a) * 1.3, 0.92, Math.cos(a) * 1.3);
    P.push(paint(fr, OBS.potL, { shade: true }));
    const gl = flat(new THREE.CircleGeometry(0.15, 14)); gl.rotateY(a); gl.translate(Math.sin(a) * 1.305, 0.92, Math.cos(a) * 1.305);
    G.push(paint(gl, WINDOW));
  }
  // Topfdeckel als Vordach über der Tür (mit Knauf)
  {
    const lid = [cyl(0.5, 0.54, 0.05, 0, OBS.potL), cyl(0.46, 0.5, 0.03, 0.05, OBS.pot), cyl(0.07, 0.09, 0.09, 0.08, OBS.potD), cyl(0.12, 0.12, 0.04, 0.17, OBS.potD)];
    for (const g of lid) { g.rotateX(0.38); g.translate(0, 1.22, 1.5); P.push(g); }
  }
  // Emaille-Nudelsieb: dunkle Fuge, Kuppel, heller Rand, Fußring oben, seitliche Griffe
  const Y = 1.42, R = 1.36;
  P.push(cyl(1.34, 1.34, 0.06, Y - 0.04, OBS.colD));
  const dome = flat(new THREE.SphereGeometry(R, 22, 9, 0, Math.PI * 2, 0, Math.PI / 2));
  dome.translate(0, Y, 0);
  P.push(paint(dome, OBS.col, { shade: true }));
  P.push(torus(1.41, 0.065, Y + 0.02, OBS.colL));
  P.push(cyl(0.52, 0.58, 0.16, Y + R - 0.08, OBS.colL), cyl(0.44, 0.44, 0.02, Y + R + 0.08, OBS.colD));
  for (const sx of [1, -1]) P.push(box(0.42, 0.05, 0.26, sx * 1.58, Y + 0.03, 0, OBS.colL), box(0.12, 0.052, 0.12, sx * 1.66, Y + 0.035, 0, OBS.colD));
  // Spalt hinten (Richtung Sternbild)
  const band = (r, ph0, len, color) => {
    const g = flat(new THREE.SphereGeometry(r, 2, 8, Math.PI * 1.5 + ph0, len, 0.05, Math.PI / 2 - 0.05));
    g.translate(0, Y, 0);
    P.push(paint(g, color));
  };
  band(R + 0.012, -0.22, 0.44, 0x1f3d63);   // Spalt: dunkelblau
  band(R + 0.016, -0.1, 0.2, 0x132a47);     // tiefer in der Mitte
  band(R + 0.022, -0.25, 0.05, OBS.colL);   // schmaler heller Rahmen links
  band(R + 0.022, 0.2, 0.05, OBS.colL);     // … und rechts
  // Sieblöcher: am Tag dunkel, nachts leuchtend (eigene kleine Geometrie)
  const H = [], n = new THREE.Vector3(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
  for (let th = 0.42; th < 1.45; th += 0.17) {
    const count = Math.round(26 * Math.sin(th));
    for (let i = 0; i < count; i++) {
      const ph = (i + (th * 10) % 1) / count * Math.PI * 2;
      n.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
      if (n.z < -0.75 && Math.abs(n.x) < 0.3) continue; // im Spalt keine Löcher
      const h = new THREE.BoxGeometry(0.075, 0.075, 0.02);
      q.setFromUnitVectors(Z, n);
      h.applyQuaternion(q);
      h.translate(n.x * (R + 0.008), Y + n.y * (R + 0.008), n.z * (R + 0.008));
      H.push(h);
    }
  }
  // Leiter zur Kuppel (seitlich, angelehnt)
  {
    const L = [];
    for (const sx of [-0.19, 0.19]) L.push(box(0.07, 1.95, 0.07, sx, 0.97, 0, OBS.wood), box(0.075, 0.08, 0.075, sx, 0.04, 0, OBS.woodD));
    for (let i = 0; i < 6; i++) L.push(box(0.38, 0.05, 0.06, 0, 0.3 + i * 0.28, 0, i % 2 ? OBS.woodL : OBS.wood));
    for (const g of L) { g.rotateX(-0.32); g.rotateY(-2.2); g.translate(-1.25, 0, -0.95); P.push(g); }
  }
  return { geo: mergeAll(P), glow: mergeAll(G), holes: mergeAll(H, ['position', 'normal']) };
}

/** Fernrohr aus einer Thermoskanne (zeigt entlang +z). */
function telescopeParts() {
  const P = [];
  const tube = (r0, r1, len, z, color) => { const g = cyl(r0, r1, len, -len / 2, color, 16); g.rotateX(Math.PI / 2); g.translate(0, 0, z); P.push(g); };
  tube(0.25, 0.25, 2.05, 0.55, 0x5aa9e6);                 // Kanne
  tube(0.262, 0.262, 0.2, 1.05, 0xcfeaf9);                // helles Band
  tube(0.27, 0.27, 0.16, -0.42, 0x2f6f9a);                // dunkler Ring unten
  tube(0.3, 0.27, 0.34, -0.66, 0xe2574c);                 // Becher-Deckel hinten
  tube(0.31, 0.31, 0.06, -0.84, 0xa83a32);
  tube(0.33, 0.27, 0.26, 1.69, 0xd5dde4);                 // Objektiv-Trichter vorne
  tube(0.335, 0.335, 0.05, 1.83, 0x8d9aa8);
  const lens = flat(new THREE.CircleGeometry(0.29, 16)); lens.translate(0, 0, 1.87);
  P.push(paint(lens, 0x7fc4e8));                             // Glas: helles Blau (wird nachts mit dunkler)
  const shine = flat(new THREE.PlaneGeometry(0.07, 0.34)); shine.rotateZ(-0.6); shine.translate(-0.08, 0.06, 1.875);
  P.push(paint(shine, 0xeaf7ff));                            // kleiner Glanzstreifen
  // Halterung (Gabel) im Spalt
  P.push(box(0.08, 0.5, 0.12, 0.31, -0.2, 0.1, 0x56616e), box(0.08, 0.5, 0.12, -0.31, -0.2, 0.1, 0x56616e));
  return { geo: mergeAll(P) };
}

/** Sternkarte als Papp-Sticker (zeigt das Krabben-Sternbild). */
function starMap() {
  return sticker(120, 96, (ctx) => {
    ctx.fillStyle = '#1f3a5f'; ctx.fillRect(0, 0, 120, 96);
    ctx.strokeStyle = '#e8d9a8'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 110, 86);
    const pts = [[45, 62], [75, 62], [80, 46], [40, 46], [22, 30], [32, 16], [98, 30], [88, 16]];
    ctx.strokeStyle = 'rgba(255,240,190,0.85)'; ctx.lineWidth = 2;
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [2, 6], [6, 7]]) {
      ctx.beginPath(); ctx.moveTo(...pts[i]); ctx.lineTo(...pts[j]); ctx.stroke();
    }
    ctx.fillStyle = '#fff3b0';
    for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const [x, y] of [[14, 78], [104, 76], [60, 22], [108, 50], [12, 52]]) ctx.fillRect(x, y, 2, 2);
  }, { outline: 5, thick: 2, grainK: 0.6 });
}

/* ---------- Wrack-Café: gefaltetes Papierschiff (kräftig gelb-oranges Papier) ---------- */
const SHIP = { d: 0xcfc7b5, b: 0xf2eee3, l: 0xffffff, deck: 0xdcd5c4, trim: 0x3f4654, ink: 'rgba(45,50,62,0.55)' };
const SH = 2.6, SAIL = 4.7;
const RIM = [[8, 0], [4, 1.4], [0, 1.7], [-4, 1.4], [-8, 0]];
const BOT = [[5, 0], [2.5, 0.5], [0, 0.62], [-2.5, 0.5], [-5, 0]];
function polyZ(poly, x) {
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[i + 1];
    if (x <= x0 && x >= x1) return z0 + (z1 - z0) * ((x0 - x) / (x0 - x1));
  }
  return 0;
}
const sideZ = (x, y) => polyZ(BOT, x) + (polyZ(RIM, x) - polyZ(BOT, x)) * (y / SH);
const sideTilt = (x) => Math.atan((polyZ(RIM, x) - polyZ(BOT, x)) / SH);

/** Dreiecke mit Farben je Ecke; Reihenfolge wird so gedreht, dass die Fläche nach „out“ zeigt. */
function triGeo(tris) {
  const pos = [], col = [], A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), c = new THREE.Color();
  for (const [a, b, cc, out] of tris) {
    A.fromArray(a[0]); B.fromArray(b[0]); C.fromArray(cc[0]);
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
    const order = n.dot(out) < 0 ? [a, cc, b] : [a, b, cc];
    for (const [p, color] of order) { pos.push(...p); c.set(color); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** auf die Bordwand setzen: Fläche zeigt nach außen (s = +1 vorne, -1 hinten) */
function onHull(g, x, y, s, lift = 0.02) {
  g.rotateX(sideTilt(x));
  if (s < 0) g.rotateY(Math.PI);
  g.translate(x, y, s * (sideZ(x, y) + lift));
  return g;
}

function paperShipParts() {
  const T = [], P = [], G = [];
  const rows = [[0, SHIP.d], [0.55, SHIP.b], [0.9, SHIP.b], [1, SHIP.l]];
  for (const s of [1, -1]) {
    const pt = (i, k) => {
      const [bx, bz] = BOT[i], [rx, rz] = RIM[i], f = rows[k][0];
      return [[bx + (rx - bx) * f, SH * f, s * (bz + (rz - bz) * f)], rows[k][1]];
    };
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const a = pt(i, k), b = pt(i + 1, k), c = pt(i, k + 1), d = pt(i + 1, k + 1);
      const xm = (a[0][0] + b[0][0]) / 2;
      const out = new THREE.Vector3(xm / 8, -0.2, s);
      T.push([a, b, c, out], [b, d, c, out]);
    }
  }
  // Deck (Papier innen, etwas dunkler)
  for (let i = 0; i < 4; i++) {
    const r0 = RIM[i], r1 = RIM[i + 1];
    T.push([[[r0[0], SH - 0.02, r0[1]], SHIP.deck], [[r1[0], SH - 0.02, r1[1]], SHIP.deck], [[r0[0], SH - 0.02, -r0[1]], SHIP.deck], new THREE.Vector3(0, 1, 0)]);
    T.push([[[r1[0], SH - 0.02, r1[1]], SHIP.deck], [[r1[0], SH - 0.02, -r1[1]], SHIP.deck], [[r0[0], SH - 0.02, -r0[1]], SHIP.deck], new THREE.Vector3(0, 1, 0)]);
  }
  // Mittelsegel: das große Dreieck in der Mitte (zwei Papierwände)
  const top = [[0, SH + SAIL, 0], SHIP.l];
  for (const s of [1, -1]) {
    T.push([[[-4.6, SH, s * 0.95], SHIP.b], [[4.6, SH, s * 0.95], SHIP.b], [[0, SH + SAIL, s * 0.05], SHIP.l], new THREE.Vector3(0, 0.2, s)]);
    T.push([[[s * 4.6, SH, 0.95], SHIP.d], [[s * 4.6, SH, -0.95], SHIP.d], top, new THREE.Vector3(s, 0.3, 0)]);
  }
  P.push(triGeo(T));
  // Riss in der Bordwand = Café-Eingang (innen warmes Licht), mit gezacktem dunklem Rand
  const jag = (rx, ry, n, jit) => {
    const sh = new THREE.Shape();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, k = i % 2 ? 1 - jit : 1;
      const px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k;
      if (i === 0) sh.moveTo(px, py); else sh.lineTo(px, py);
    }
    return new THREE.ShapeGeometry(sh);
  };
  P.push(paint(onHull(flat(jag(0.85, 0.95, 16, 0.28)), 2.4, 1.25, 1, 0.02), SHIP.trim));
  G.push(paint(onHull(flat(jag(0.68, 0.78, 16, 0.22)), 2.4, 1.25, 1, 0.035), WINDOW));
  // Markise über dem Eingang
  for (let i = 0; i < 5; i++) {
    const st = box(0.3, 0.04, 0.6, 0, 0, 0, i % 2 ? 0xffffff : 0xe2574c);
    st.rotateX(sideTilt(2.4) + 0.55);
    st.translate(1.8 + i * 0.3, 2.12, sideZ(2.4, 2.1) + 0.28);
    P.push(st);
  }
  // runde Bullaugen (Rahmen dunkel, Glas leuchtet nachts über glowMat)
  for (const [x, s] of [[0.4, 1], [-1.4, 1], [-3.1, 1], [-1.8, -1], [0.7, -1]]) {
    const fr = flat(new THREE.TorusGeometry(0.32, 0.07, 5, 16));
    P.push(paint(onHull(fr, x, 1.5, s, 0.03), SHIP.trim));
    G.push(paint(onHull(flat(new THREE.CircleGeometry(0.28, 16)), x, 1.5, s, 0.025), WINDOW));
  }
  // Lichterkette an den Segelkanten (nachts weit sichtbar)
  for (const s of [1, -1]) for (const ex of [-4.6, 4.6]) for (let i = 1; i < 10; i++) {
    const t = i / 10;
    G.push(paint(flat(new THREE.BoxGeometry(0.13, 0.13, 0.13)).translate(ex * (1 - t), SH + SAIL * t + 0.05, s * (0.95 * (1 - t) + 0.05 * t + 0.07)), i % 3 ? 0xffe08a : 0xffb3c7));
  }
  // Wimpel an einem Zahnstocher oben auf dem Segel
  P.push(cyl(0.035, 0.035, 0.9, SH + SAIL - 0.1, 0xc98f55, 6), box(0.5, 0.26, 0.03, 0.27, SH + SAIL + 0.62, 0, 0xe2574c));
  return { geo: mergeAll(P), glow: mergeAll(G) };
}

/** Zeitungsdruck als Aufkleber (Papierschiff ist aus einer Zeitungsseite gefaltet). */
function printDecal() {
  return sticker(220, 90, (ctx) => {
    ctx.fillStyle = SHIP.ink;
    ctx.fillRect(10, 6, 120, 16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ctx.fillRect(10 + c * 70, 32 + r * 14, 58 - ((r + c) % 3) * 9, 5);
  }, { outline: 0, thick: 0, grainK: 0 });
}

/* ---------- Blubberbad: weiße, runde Badewanne mit Rand ---------- */
const BATH = { w: 0xf3f7fb, wl: 0xffffff, wd: 0xb9c6d3, gold: 0xffc93c, goldL: 0xffe58a, goldD: 0xb9811a, water: 0x6fd3ea };
function bathParts() {
  const P = [], G = [], ell = (g) => { g.scale(1.55, 1, 1); return g; };
  for (const sx of [-0.92, 0.92]) for (const sz of [-0.48, 0.48]) {
    const f = [cyl(0.07, 0.13, 0.26, 0.05, BATH.gold, 8), cyl(0.1, 0.1, 0.05, 0.3, BATH.goldL, 8), cyl(0.12, 0.13, 0.06, 0, BATH.goldD, 8)];
    for (const g of f) { g.translate(sx, 0, sz); P.push(g); }
  }
  P.push(ell(cyl(0.86, 0.8, 0.08, 0.3, BATH.wd, 26)), ell(cyl(1, 0.86, 0.72, 0.38, BATH.w, 26)), ell(torus(1.0, 0.085, 1.1, BATH.wl, Math.PI * 2, 32)));
  P.push(ell(cyl(0.93, 0.93, 0.02, 0.98, BATH.water, 26)));
  // Schaum
  for (const [x, z, r] of [[-0.7, -0.2, 0.22], [-0.3, 0.3, 0.18], [0.4, -0.25, 0.24], [0.9, 0.2, 0.17], [0.1, 0.05, 0.15]]) {
    const g = flat(new THREE.SphereGeometry(r, 8, 5)); g.scale(1, 0.55, 1); g.translate(x, 1.02, z); P.push(paint(g, 0xffffff, { shade: true }));
  }
  // Badeente
  { const d = [flat(new THREE.SphereGeometry(0.17, 8, 6)), flat(new THREE.SphereGeometry(0.11, 8, 6)), box(0.1, 0.04, 0.08, 0, 0, 0, 0xff8a1f)];
    d[0].scale(1.3, 0.8, 1); d[0].translate(0.55, 1.1, 0.1); d[1].translate(0.69, 1.27, 0.1); d[2].translate(0.81, 1.25, 0.1);
    P.push(paint(d[0], 0xffd23f, { shade: true }), paint(d[1], 0xffe066, { shade: true }), d[2]); }
  // Wasserhahn (Chrom) mit zwei Knäufen
  P.push(cyl(0.05, 0.05, 0.5, 1.0, 0xc9d3dd, 8).translate(-1.45, 0, 0), box(0.28, 0.06, 0.07, -1.33, 1.5, 0, 0xdfe6ee), box(0.06, 0.08, 0.06, -1.2, 1.45, 0, 0x9aa6b1));
  P.push(paint(flat(new THREE.SphereGeometry(0.06, 6, 4)).translate(-1.45, 1.38, 0.13), 0xe2574c, { shade: true }), paint(flat(new THREE.SphereGeometry(0.06, 6, 4)).translate(-1.45, 1.38, -0.13), 0x3e7cb1, { shade: true }));
  // Leiter vorne angelehnt
  { const L = [];
    for (const sx of [-0.17, 0.17]) L.push(box(0.06, 1.25, 0.06, sx, 0.62, 0, OBS.wood), box(0.065, 0.06, 0.065, sx, 0.03, 0, OBS.woodD));
    for (let i = 0; i < 4; i++) L.push(box(0.34, 0.045, 0.05, 0, 0.25 + i * 0.27, 0, i % 2 ? OBS.woodL : OBS.wood));
    for (const g of L) { g.rotateX(0.32); g.translate(0.45, 0, 1.12); P.push(g); } }
  // Handtuch-Leine hinten
  for (const sx of [-1.15, 1.15]) P.push(cyl(0.04, 0.05, 1.9, 0, OBS.wood, 6).translate(sx, 0, -1.3), cyl(0.06, 0.06, 0.05, 1.9, OBS.woodL, 6).translate(sx, 0, -1.3));
  P.push(box(2.3, 0.025, 0.025, 0, 1.86, -1.3, 0xf5efe0));
  for (const [x, c] of [[-0.6, 0xff6f91], [0.05, 0xffd166], [0.65, 0x5ce1e6]]) P.push(box(0.42, 0.55, 0.04, x, 1.57, -1.3, c), box(0.42, 0.07, 0.045, x, 1.42, -1.3, 0xffffff), box(0.44, 0.04, 0.05, x, 1.84, -1.3, 0xf5efe0));
  // Laterne (leuchtet nachts)
  P.push(cyl(0.045, 0.055, 1.35, 0, 0x5b6b80, 6).translate(1.85, 0, 0.75), box(0.3, 0.06, 0.3, 1.85, 1.6, 0.75, 0x3e4a5a), box(0.14, 0.05, 0.14, 1.85, 1.66, 0.75, 0x3e4a5a));
  G.push(paint(flat(new THREE.BoxGeometry(0.22, 0.25, 0.22)).translate(1.85, 1.45, 0.75), 0xffe6a0));
  return { geo: mergeAll(P), glow: mergeAll(G) };
}

/* ---------- Spielplatz: Muschelrutsche, Löffelwippe auf Fingerhut, Kleiderbügel-Schaukel ---------- */
const PG = { teal: 0x2fae8f, tealL: 0x7fdcc4, tealD: 0x1c7462, silver: 0xc9d3dd, silverL: 0xeef2f6, silverD: 0x8a96a3 };
function shellTexture() {
  return sticker(180, 260, (ctx) => {
    const cx = 90, top = 6, g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, '#ff9ab8'); g.addColorStop(1, '#ffd1df');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx - 22, top);
    ctx.lineTo(cx + 22, top);
    ctx.quadraticCurveTo(178, 120, 176, 228);
    for (let i = 0; i < 7; i++) { const x0 = 176 - i * 24.6; ctx.quadraticCurveTo(x0 - 12.3, 262, x0 - 24.6, 228); }
    ctx.quadraticCurveTo(2, 120, cx - 22, top); ctx.fill();
    ctx.strokeStyle = 'rgba(200,70,110,0.55)'; ctx.lineWidth = 4;
    for (let i = 0; i <= 7; i++) { const x1 = 4 + i * 24.6; ctx.beginPath(); ctx.moveTo(cx + (i - 3.5) * 5, top + 4); ctx.lineTo(x1 + 12, 240); ctx.stroke(); }
    ctx.fillStyle = '#e86a92'; ctx.fillRect(cx - 24, top, 48, 16);
  }, { outline: 6, thick: 3, grainK: 0.5 });
}
function playgroundParts() {
  const P = [];
  // Rutschen-Turm (Holz, drei Töne)
  for (const [x, z] of [[-1.85, -0.95], [-1.25, -0.95], [-1.85, -0.35], [-1.25, -0.35]]) P.push(cyl(0.05, 0.06, 1.38, 0, OBS.wood, 6).translate(x, 0, z), cyl(0.07, 0.07, 0.06, 0, OBS.woodD, 6).translate(x, 0, z));
  P.push(box(0.78, 0.08, 0.78, -1.55, 1.38, -0.65, OBS.woodL), box(0.78, 0.05, 0.05, -1.55, 1.7, -1.02, OBS.wood), box(0.05, 0.3, 0.05, -1.92, 1.55, -1.02, OBS.wood));
  for (let i = 0; i < 5; i++) P.push(box(0.05, 0.05, 0.5, -1.97, 0.22 + i * 0.26, -0.65, i % 2 ? OBS.woodL : OBS.wood));
  // Fingerhut (Lager der Wippe) mit Dellen
  P.push(cyl(0.27, 0.31, 0.44, 0, PG.silver, 16).translate(0.9, 0, 0.9), torus(0.3, 0.035, 0.44, PG.silverL).translate(0.9, 0, 0.9), cyl(0.32, 0.32, 0.04, 0, PG.silverD, 16).translate(0.9, 0, 0.9));
  for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r * 0.26, rr = 0.285 - r * 0.012;
    const d = box(0.045, 0.045, 0.02, 0, 0, 0, PG.silverD); d.rotateY(a); d.translate(0.9 + Math.sin(a) * rr, 0.16 + r * 0.14, 0.9 + Math.cos(a) * rr); P.push(d);
  }
  // Schaukelgestell (A-Form, petrol)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const x of [0.2, 1.9]) {
    for (const dz of [-0.5, 0.5]) { P.push(flat(cylBetween(V(x, 0, -1.45 + dz), V(x, 1.68, -1.45), 0.1, 0.085, PG.teal, 8))); P.push(cyl(0.14, 0.15, 0.08, 0, PG.tealD, 8).translate(x, 0, -1.45 + dz)); }
    P.push(paint(flat(new THREE.SphereGeometry(0.12, 8, 5)).translate(x, 1.68, -1.45), PG.tealL, { shade: true }));
  }
  P.push(flat(cylBetween(V(0.1, 1.68, -1.45), V(2.0, 1.68, -1.45), 0.085, 0.085, PG.tealL, 10)));
  return { geo: mergeAll(P) };
}
function spoonParts() {
  const P = [];
  P.push(box(1.7, 0.05, 0.13, -0.35, 0, 0, PG.silver), box(0.3, 0.06, 0.2, -1.25, 0, 0, PG.silverL), box(1.7, 0.012, 0.05, -0.35, 0.03, 0, PG.silverL));
  const bowl = flat(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
  bowl.scale(0.42, 0.16, 0.3); bowl.translate(0.85, 0.06, 0);
  P.push(paint(bowl, PG.silver, { shade: true }));
  const inner = flat(new THREE.CircleGeometry(1, 14)); inner.rotateX(-Math.PI / 2); inner.scale(0.38, 1, 0.26); inner.translate(0.85, 0.055, 0);
  P.push(paint(inner, PG.silverL));
  return { geo: mergeAll(P) };
}
function hangerParts() {
  const P = [], V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Metallhaken über der Stange
  const hook = flat(new THREE.TorusGeometry(0.14, 0.035, 6, 12, Math.PI * 1.35)); hook.rotateZ(-0.2); hook.translate(0, 0.02, 0);
  P.push(paint(hook, PG.silverD, { shade: true }), flat(cylBetween(V(0, -0.12, 0), V(0, -0.3, 0), 0.035, 0.035, PG.silver, 6)));
  // Holzbügel: zwei Schultern + gerade Querstange (drei Holztöne)
  P.push(flat(cylBetween(V(0, -0.3, 0), V(-0.62, -0.62, 0), 0.07, 0.06, OBS.wood, 8)), flat(cylBetween(V(0, -0.3, 0), V(0.62, -0.62, 0), 0.07, 0.06, OBS.wood, 8)));
  P.push(flat(cylBetween(V(-0.66, -0.64, 0), V(0.66, -0.64, 0), 0.075, 0.075, OBS.woodL, 10)));
  P.push(cyl(0.09, 0.09, 0.08, -0.34, OBS.woodD, 8));
  // zwei Seile und ein Sitzbrett
  for (const x of [-0.42, 0.42]) P.push(flat(cylBetween(V(x, -0.66, 0), V(x, -1.05, 0), 0.022, 0.022, 0xf5efe0, 5)));
  P.push(box(1.0, 0.07, 0.34, 0, -1.08, 0, OBS.woodL), box(1.0, 0.05, 0.34, 0, -1.135, 0, OBS.woodD));
  return { geo: mergeAll(P) };
}

/* ---------- Aufbau ---------- */
export function buildPlaces(scene, { heightAt, obstacles, plateaus, plateauCorals, mat, glowMat, constellation, boardMesh, drawBoard, env }) {
  const updaters = [];
  const vents = [];
  const sign = (key, color, w = 1.6) => boardMesh(drawBoard(t(key), { color, W: 300, H: 70 }), w);
  /** Schild auf einem Holzpfahl; Rückseite ist eine echte Brett-Rückseite (keine Spiegelschrift). */
  function signPost(key, color, w, x, z, yaw, h = 0.95) {
    const g = new THREE.Group();
    const front = sign(key, color, w);
    front.position.set(0, h, 0.035);
    const back = boardMesh(drawBoard('', { color, W: 300, H: 70 }), w);
    back.position.set(0, h, -0.035);
    back.rotation.y = Math.PI;
    // Pfahl HINTER dem Brett (sonst schneidet er mitten durch die Schrift)
    const post = new THREE.Mesh(mergeAll([cyl(0.055, 0.065, h + 0.12, 0, OBS.wood, 8), cyl(0.07, 0.07, 0.05, h + 0.12, OBS.woodL, 8), cyl(0.075, 0.075, 0.08, 0, OBS.woodD, 8)]), mat);
    post.position.z = -0.115;
    post.castShadow = true;
    g.add(front, back, post);
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    return g;
  }

  function make(parts, scale = 1) {
    const { geo, glow } = vox(parts, U * scale);
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (glow) g.add(new THREE.Mesh(glow, glowMat));
    return g;
  }
  function put(g, x, z, { turn = 0, y = null } = {}) {
    g.position.set(x, y ?? heightAt(x, z) - 0.06, z);
    g.rotation.y = Math.atan2(-x, -z) + turn;
    scene.add(g);
    return g;
  }

  /* 1. Sternwarte auf dem großen Plateau hinten rechts (freiester Platz zwischen den Korallen) */
  {
    const pl = plateaus[1];
    let best = null;
    for (let gx = -0.55; gx <= 0.55; gx += 0.05) {
      for (let gz = -0.55; gz <= 0.55; gz += 0.05) {
        const x = pl.x + gx * pl.r, z = pl.z + gz * pl.r;
        if (Math.hypot(gx, gz) > 0.55) continue;
        const clear = Math.min(9, ...plateauCorals.map((c) => Math.hypot(c.x - x, c.z - z)));
        const score = Math.min(clear, 3.2) * 2 - Math.hypot(gx, gz) * 2 + (z - pl.z) * 0.08; // frei, mittig, eher vorne
        if (!best || score > best.score) best = { x, z, clear, score };
      }
    }
    // Tür zur Inselmitte, Spalt mit Fernrohr nach hinten zum Sternbild
    const g = new THREE.Group();
    const parts = observatoryParts();
    const body = new THREE.Mesh(parts.geo, mat);
    body.castShadow = body.receiveShadow = true;
    const holeMat = new THREE.MeshBasicMaterial({ color: OBS.hole });
    g.add(body, new THREE.Mesh(parts.glow, glowMat), new THREE.Mesh(parts.holes, holeMat));
    put(g, best.x, best.z, { turn: 0.15, y: pl.h - 0.04 });
    // Sternkarte neben der Tür
    const map = boardMesh(starMap(), 0.42);
    map.position.set(Math.sin(0.42) * 1.335, 0.82, Math.cos(0.42) * 1.335);
    map.rotation.y = 0.42;
    map.castShadow = false;
    g.add(map);
    // Schild auf eigenem Pfahl, frei vorne links (verdeckt die Tür nicht)
    g.add(signPost('town.observatory', '#2f6f8f', 1.1, -2.05, 1.55, 0.55));
    obstacles.push({ x: best.x, z: best.z, r: 2.1 });
    // Fernrohr (bewegt sich): sitzt im Spalt hinten an der Kuppel
    const pivot = new THREE.Group();
    const tp = telescopeParts();
    const tm = new THREE.Mesh(tp.geo, mat); tm.castShadow = true;
    pivot.add(tm);
    pivot.position.set(0, 2.62, -0.38);
    pivot.scale.setScalar(1.4);
    g.add(pivot);
    const target = constellation.clone(), dark = new THREE.Color(OBS.hole), warm = new THREE.Color(0xffd27a).multiplyScalar(1.8);
    updaters.push((dt, time) => {
      pivot.lookAt(target);
      pivot.rotateY(Math.sin(time * 0.18) * 0.14);
      pivot.rotateX(Math.sin(time * 0.13 + 1) * 0.04);
      holeMat.color.copy(dark).lerp(warm, Math.min(1, Math.max(0, (env.night - 0.2) / 0.5)));
    });
  }

  /* 3. Papierschiff-Wrack mit Café: auf einer Sandbank rechts neben dem Leuchtturm,
        damit es in der Startansicht über den Inselrand ragt */
  const foam = [];
  {
    const x = 30, z = -30, yaw = Math.atan2(-x, -z);
    const floorY = heightAt(x, z), Rm = 7, Hm = 2.7, base = floorY - 0.3;
    const bank = new THREE.Group();
    bank.position.set(x, base, z);
    bank.rotation.y = yaw;
    scene.add(bank);
    const mound = flat(new THREE.SphereGeometry(1, 22, 7, 0, Math.PI * 2, 0, Math.PI / 2));
    mound.scale(Rm, Hm, Rm * 0.72);
    const mm = new THREE.Mesh(paint(mound, 0xc7ddd6, { shade: true }), mat);
    mm.receiveShadow = true;
    bank.add(mm);
    const surf = (lx, lz) => Hm * Math.sqrt(Math.max(0, 1 - (lx / Rm) ** 2 - (lz / (Rm * 0.72)) ** 2));
    const ship = new THREE.Group();
    const sp = paperShipParts();
    const sm = new THREE.Mesh(sp.geo, mat); sm.castShadow = sm.receiveShadow = true;
    ship.add(sm, new THREE.Mesh(sp.glow, glowMat));
    // Zeitungsdruck auf beiden Seiten des Mittelsegels
    const decTex = toTexture(printDecal().canvas);
    const decMat = new THREE.MeshStandardMaterial({ map: decTex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [1, -1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.06), decMat);
      const yy = SH + 1.4;
      d.rotation.set(-0.19 * s, s < 0 ? Math.PI : 0, 0, 'YXZ');
      d.position.set(0, yy, s * (0.95 - 0.9 * (1.4 / SAIL) + 0.02));
      ship.add(d);
    }
    ship.position.set(-0.6, Hm - 0.25, 0);
    ship.rotation.set(0.16, 0, 0.3); // ca. 17° Bug nach oben, leicht zur Insel gekippt
    bank.add(ship);
    // Café-Tisch mit zwei Hockern vor dem Riss
    const F = [];
    const tx = 2.4, tz = 2.9, ty = surf(tx, tz);
    F.push(cyl(0.05, 0.08, 0.5, 0, OBS.woodD, 6).translate(tx, ty, tz), cyl(0.36, 0.34, 0.06, 0.5, 0xffd166, 14).translate(tx, ty, tz), cyl(0.37, 0.37, 0.02, 0.56, 0xffe9a8, 14).translate(tx, ty, tz));
    for (const [dx, c] of [[-0.62, 0xf28aa8], [0.62, 0x5aa9e6]]) F.push(cyl(0.16, 0.18, 0.3, 0, c, 10).translate(tx + dx, surf(tx + dx, tz + 0.2), tz + 0.2), cyl(0.17, 0.17, 0.03, 0.3, 0xffffff, 10).translate(tx + dx, surf(tx + dx, tz + 0.2), tz + 0.2));
    const fm = new THREE.Mesh(mergeAll(F), mat); fm.castShadow = true;
    bank.add(fm);
    // Schild direkt am Segel über dem Eingang (auf der Sandbank wäre es hinter dem Inselrand versteckt)
    const sg = sign('town.wreck', '#e2574c', 2.6);
    sg.position.set(2.0, SH + 0.75, 0.95 - 0.9 * (0.75 / SAIL) + 0.06);
    sg.rotation.x = -0.19;
    ship.add(sg);
    scene.updateMatrixWorld(true);
    vents.push(ship.localToWorld(new THREE.Vector3(0, SH + SAIL - 0.2, 0)), ship.localToWorld(new THREE.Vector3(2.4, 2.2, 1.4)));
  }

  /* 4. Blubberbad zwischen Sardinendose und Stiefelhaus */
  {
    const [x, z] = PLACE_SPOTS.bath;
    const g = new THREE.Group();
    const bp = bathParts();
    const bm = new THREE.Mesh(bp.geo, mat); bm.castShadow = bm.receiveShadow = true;
    g.add(bm, new THREE.Mesh(bp.glow, glowMat));
    put(g, x, z, { turn: 0.25 });
    g.add(signPost('town.bath', '#2fae8f', 1.15, -1.75, 1.4, -0.1, 0.9));
    scene.updateMatrixWorld(true);
    for (const [lx, lz] of [[-0.6, 0], [0.2, -0.2], [0.9, 0.25]]) foam.push(g.localToWorld(new THREE.Vector3(lx, 1.05, lz)));
  }

  /* 5. Spielplatz am Inselrand vorne rechts */
  {
    const [x, z] = PLACE_SPOTS.play;
    const g = new THREE.Group();
    const pp = playgroundParts();
    const pm = new THREE.Mesh(pp.geo, mat); pm.castShadow = pm.receiveShadow = true;
    g.add(pm);
    // Rutsche: Muschelschale als gebogener Papp-Aufkleber (Ränder nach oben gewölbt)
    const shellTex = toTexture(shellTexture().canvas);
    const sg = new THREE.PlaneGeometry(1, 1, 8, 12), pa = sg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const u = pa.getX(i) * 2, v = pa.getY(i) + 0.5;       // u: -1..1 quer, v: 0 unten .. 1 oben
      const h = 0.08 + 1.32 * Math.pow(v, 1.5);              // läuft vom Turm nach vorne (+z) herunter
      pa.setXYZ(i, -1.55 + u * 0.8, h + 0.24 * u * u, 1.95 - 2.2 * v);
    }
    sg.computeVertexNormals();
    const slide = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: shellTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }));
    slide.castShadow = slide.receiveShadow = true;
    g.add(slide);
    const see = new THREE.Group();
    see.add(Object.assign(new THREE.Mesh(spoonParts().geo, mat), { castShadow: true }));
    see.position.set(0.9, 0.47, 0.9);
    const swing = new THREE.Group();
    swing.add(Object.assign(new THREE.Mesh(hangerParts().geo, mat), { castShadow: true }));
    swing.position.set(1.05, 1.68, -1.45);
    g.add(see, swing, signPost('town.playground', '#ffb703', 1.05, 2.05, 0.75, -0.45, 0.85));
    put(g, x, z, { turn: 0.2 });
    updaters.push((dt, time) => {
      see.rotation.z = Math.sin(time * 0.8) * 0.2;
      swing.rotation.x = Math.sin(time * 1.1) * 0.32;
    });
  }

  return { update: (dt, time) => { for (const u of updaters) u(dt, time); }, vents, foam };
}
