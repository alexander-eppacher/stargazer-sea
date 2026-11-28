/* =========================================================
   Krabbenstadt: kleine Comic-Häuschen am hinteren Inselrand
   (Dosenhaus, Muschelturm, Flaschen-Leuchtturm, Algen-Imbiss,
   Wegweiser, Wimpelkette). Fenster leuchten nachts.
   ========================================================= */
import * as THREE from 'three';
import { vox, hdr, mergeAll, range, pick, radialTexture, mulberry32 } from './util.js';
import { sticker, stickerGeometry, toTexture } from './paper.js';
import { t } from './lang.js';

const U = 0.12; // eine Voxel-Einheit in Welt-Einheiten

/** Geometrie einfarbig einfärben (Vertex-Farben). */
function paintGeo(g, color) {
  const c = new THREE.Color(color), arr = new Float32Array(g.attributes.position.count * 3);
  for (let k = 0; k < arr.length; k += 3) { arr[k] = c.r; arr[k + 1] = c.g; arr[k + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const WINDOW = 0xffd98a;

/** Holzschild mit Text als Papp-Sticker. arrow: -1 links, 1 rechts, 0 ohne Spitze */
/** Eigene Schild-Designs je Ort (Form, Farben, Schrift, Verzierung). */
export const SIGN_STYLES = {
  hall: { shape: 'cut', color: '#2f6f8f', ink: '#ffe7a3', font: '700 SIZEpx Georgia, "Times New Roman", serif', border: '#ffc93c', deco: 'stars' },
  shop: { shape: 'round', r: 35, color: '#e2574c', ink: '#ffffff', border: 'candy', deco: 'candy' },
  post: { shape: 'round', r: 10, color: '#ffb703', ink: '#1d3b5e', deco: 'post' },
  snack: { shape: 'round', r: 16, color: '#2fae8f', ink: '#fff6e0', deco: 'weed' },
  wood: { shape: 'rect', color: '#c98f55', ink: '#5b3a1e', deco: 'grain' },
  obs: { shape: 'cut', color: '#1d2b53', ink: '#fff1b0', deco: 'night' },
  bath: { shape: 'round', r: 16, color: '#29a8d8', ink: '#ffffff', deco: 'bubbles' },
  play: { shape: 'round', r: 16, color: '#fff3d6', ink: 'rainbow', deco: 'confetti', border: '#ffb703' },
};
/** Umriss des Bretts als Punkte (Pixel im Zeichenbereich W×H) – für Bild und Kern gleich. */
function boardOutline(shape, W, H, arrow = 0, r = 12) {
  const tip = arrow ? 34 : 0, x0 = arrow < 0 ? tip : 0, x1 = arrow > 0 ? W - tip : W, pts = [];
  const arc = (cx, cy, rr, a0, a1) => { for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } };
  if (shape === 'round' && !arrow) {
    const rr = Math.min(r, H / 2);
    arc(W - rr, rr, rr, -Math.PI / 2, 0); arc(W - rr, H - rr, rr, 0, Math.PI / 2); arc(rr, H - rr, rr, Math.PI / 2, Math.PI); arc(rr, rr, rr, Math.PI, 1.5 * Math.PI);
  } else if (shape === 'cut' && !arrow) {
    const c = 12; pts.push([c, 0], [W - c, 0], [W, c], [W, H - c], [W - c, H], [c, H], [0, H - c], [0, c]);
  } else {
    pts.push([x0, 0], [x1, 0]); if (arrow > 0) pts.push([W, H / 2]); pts.push([x1, H], [x0, H]); if (arrow < 0) pts.push([0, H / 2]);
  }
  return { pts, x0, x1 };
}
function drawBoard(text, { color = '#c98f55', ink = '#fff3dc', arrow = 0, W = 300, H = 74, k = 2, style = null, tipColor = null } = {}) {
  // k: Auflösung (2 = doppelt so fein, gleiche Größe in der Welt); style: eigenes Design aus SIGN_STYLES
  const st = style ? SIGN_STYLES[style] : null;
  if (st) { color = st.color; ink = st.ink; }
  return sticker(W * k, H * k, (ctx) => {
    ctx.scale(k, k);
    const { pts, x0, x1 } = boardOutline(st?.shape || 'rect', W, H, arrow, st?.r);
    const path = new Path2D(); pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath();
    ctx.fillStyle = color; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    const deco = st?.deco;
    if (!st) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x0 + 6, H * 0.33, x1 - x0 - 12, 3); ctx.fillRect(x0 + 6, H * 0.66, x1 - x0 - 12, 3);
    } else if (deco === 'grain') {
      ctx.strokeStyle = 'rgba(90,55,20,0.28)'; ctx.lineWidth = 1.6;
      for (let y = 9; y < H; y += 9) { ctx.beginPath(); ctx.moveTo(x0, y); for (let x = x0; x <= x1 + 34; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.07 + y) * 1.6); ctx.stroke(); }
      if (tipColor) { ctx.fillStyle = tipColor; ctx.fillRect(arrow > 0 ? x1 - 14 : x0 + 2, 0, 12, H); } // Farbe des Ziels an der Spitze
    } else if (deco === 'night') {
      ctx.fillStyle = '#fff6c8';
      for (let i = 0; i < 22; i++) { const x = (i * 97) % W, y = (i * 53) % H, rr = i % 3 ? 1.2 : 2.2; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.3); ctx.fill(); }
    } else if (deco === 'bubbles') {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.5;
      for (const [x, y, rr] of [[18, 20, 8], [34, 50, 5], [W - 22, 22, 9], [W - 40, 52, 5], [W - 14, 56, 4], [52, 14, 3]]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.3); ctx.stroke(); }
    } else if (deco === 'confetti') {
      const cs = ['#ff6f91', '#5aa9e6', '#7cb342', '#b07ef0', '#ff9f45'];
      for (let i = 0; i < 26; i++) { ctx.fillStyle = cs[i % 5]; ctx.save(); ctx.translate((i * 71) % W, (i * 37) % H); ctx.rotate(i); ctx.fillRect(-3, -1.5, 6, 3); ctx.restore(); }
    } else if (deco === 'weed') {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H - 10 - Math.sin(x * 0.12) * 5); ctx.lineTo(W, H); ctx.fill();
    } else if (deco === 'post') {
      ctx.fillStyle = '#3e7cb1'; ctx.fillRect(0, 0, W, 9); ctx.fillRect(0, H - 9, W, 9);
    }
    ctx.restore();
    // Rand innen
    if (st?.border === 'candy') {
      ctx.save(); ctx.lineWidth = 7; ctx.strokeStyle = '#ffffff'; ctx.setLineDash([9, 9]); ctx.translate(0, 0);
      const inset = new Path2D(); boardOutline('round', W - 14, H - 14, 0, (st.r || 12) - 7).pts.forEach(([x, y], i) => (i ? inset.lineTo(x + 7, y + 7) : inset.moveTo(x + 7, y + 7))); inset.closePath();
      ctx.stroke(inset); ctx.restore();
    } else if (st?.border) {
      ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = st.border;
      const inset = new Path2D(); boardOutline(st.shape, W - 14, H - 14, 0, (st.r || 12) - 7).pts.forEach(([x, y], i) => (i ? inset.lineTo(x + 7, y + 7) : inset.moveTo(x + 7, y + 7))); inset.closePath();
      ctx.stroke(inset); ctx.restore();
    }
    // Schrift
    if (!text) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fontOf = (sz) => (st?.font ? st.font.replace('SIZE', sz) : `900 ${sz}px Nunito, system-ui, sans-serif`);
    const room = x1 - x0 - (st && st.deco !== 'grain' ? 40 : 24);
    let size = 40;
    do { ctx.font = fontOf(size); size--; } while (ctx.measureText(text).width > room && size > 12);
    const cx = (x0 + x1) / 2, cy = H / 2 + 2;
    if (st?.deco === 'candy' || st?.ink === '#ffffff') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillText(text, cx + 1.5, cy + 2); }
    if (ink === 'rainbow') {
      const cs = ['#e2574c', '#ff9f45', '#2fae8f', '#3e7cb1', '#b07ef0'];
      let x = cx - ctx.measureText(text).width / 2; ctx.textAlign = 'left';
      [...text].forEach((ch, i) => { ctx.fillStyle = cs[i % cs.length]; ctx.fillText(ch, x, cy); x += ctx.measureText(ch).width; });
    } else { ctx.fillStyle = ink; ctx.fillText(text, cx, cy); }
  }, { outline: 6 * k, thick: 3 * k });
}

/** Schild mit Dicke: Vorderseite mit Schrift, schlichte Rückseite, dazwischen ein Kern in dunklerer Brettfarbe.
 *  Mitte des Bretts liegt im Ursprung, Rückseite bei z = -depth/2 (zum Anschrauben an eine Wand). */
function solidSign(text, { color, w, arrow = 0, depth = 0.08, W = 300, H = 70, both = false, style = null, tipColor = null }) {
  const g = new THREE.Group();
  if (style) color = SIGN_STYLES[style].color;
  const front = boardMesh(drawBoard(text, { color, arrow, W, H, style, tipColor }), w);
  const back = boardMesh(drawBoard(both ? text : '', { color, arrow: -arrow, W, H, style, tipColor }), w); // both: Schrift auch hinten
  front.position.z = depth / 2; back.position.z = -depth / 2; back.rotation.y = Math.PI;
  const u = w / W, gx = 5, gy = 5; // Kern bis in den weißen Rand
  const P = (px, py) => new THREE.Vector2((px - W / 2) * u, (H / 2 - py) * u);
  const ol = boardOutline(style ? SIGN_STYLES[style].shape : 'rect', W, H, arrow, style ? SIGN_STYLES[style].r : 12).pts;
  const sh = new THREE.Shape(ol.map(([px, py]) => P(W / 2 + (px - W / 2) * (W + 2 * gx) / W, H / 2 + (py - H / 2) * (H + 2 * gy) / H))); // Umriss samt weißem Rand
  const cg = new THREE.ExtrudeGeometry(sh, { depth: depth * 0.6, bevelEnabled: false });
  cg.translate(0, 0, -depth * 0.3);
  // Kern sicher hinter Vorder- und Rückseite: sonst flimmern die Flächen aus der Ferne gegeneinander
  const core = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.72), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
  core.castShadow = true;
  g.add(front, back, core);
  g.userData.h = (H + 12) * u; // Höhe samt Rand
  return g;
}

function boardMesh(stk, worldW) {
  const tex = toTexture(stk.canvas);
  const m = new THREE.Mesh(
    stickerGeometry(stk, worldW, 'center'),
    new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, emissiveMap: tex, emissive: new THREE.Color(0.2, 0.2, 0.2) }),
  );
  m.castShadow = true;
  return m;
}

/* ---------- Bauteile (Voxel-Listen, Einheit U, y = Unterkante) ---------- */

/** Achteckiger „Zylinder“ aus zwei gekreuzten Quadern + zwei schmaleren. */
function ring(y, h, r, color) {
  const s = r * 0.83; // nicht runden: sonst liegen Bänder an den schmalen Seiten genau auf der Wand (Flackern)
  return [
    [0, y, 0, r * 2, h, s * 2, color], [0, y, 0, s * 2, h, r * 2, color],
  ];
}

function canHouse() {
  const p = [];
  // Dose: Metallboden, Banderole (bündig übereinander gestapelt, nichts steht ab), Metalldeckel
  const R = 12.2;
  p.push(...ring(0, 3, 12, 0xb9c3cc));
  p.push(...ring(3, 7, R, 0xe2574c));
  p.push(...ring(10, 2.5, R, 0xfff1d6));          // helles Etikett-Band …
  p.push(...ring(12.5, 2, R, 0x2fae8f));          // … mit grünem Streifen
  p.push(...ring(14.5, 2.5, R, 0xfff1d6));
  p.push(...ring(17, 8, R, 0xe2574c));
  p.push(...ring(25, 2, 12, 0xb9c3cc));
  p.push(...ring(27, 1, 10.5, 0xd5dde4));
  // Ringlasche auf dem Deckel: Niete, Zunge und ein Ring mit Loch
  const tab = 0x9aa6b1;
  p.push([2, 28, 0, 1.8, 0.7, 1.8, 0xd5dde4], [2, 28, 2.2, 3, 0.5, 3, tab]);
  p.push([2, 28, 4.2, 5, 0.6, 1, tab], [2, 28, 7.2, 5, 0.6, 1, tab], [-0.1, 28, 5.7, 0.8, 0.6, 2, tab], [4.1, 28, 5.7, 0.8, 0.6, 2, tab]);
  // Tür mit Vordach + Fenster vorne (z+)
  p.push([0, 3, 12.6, 7, 11, 1.2, 0x3b5b8c], [2.2, 8, 13.3, 1, 1, 0.4, 0xffc93c]);
  p.push([0, 14.2, 13.4, 9, 0.8, 2.6, 0x2fae8f]);
  p.push([-6.5, 16.5, 12.9, 3.6, 3.6, 0.8, WINDOW, true], [6.5, 16.5, 12.9, 3.6, 3.6, 0.8, WINDOW, true]);
  p.push([-6.5, 15.9, 12.5, 4.8, 4.8, 0.6, 0x8a5527], [6.5, 15.9, 12.5, 4.8, 4.8, 0.6, 0x8a5527]);
  // mittleres Fenster: rund (Kreuzform) mit Rahmen, über der Tür zwischen den beiden anderen
  p.push([0, 15.7, 12.5, 3, 4.6, 0.6, 0x8a5527], [0, 16.4, 12.5, 4.6, 3.2, 0.6, 0x8a5527]);
  p.push([0, 16.6, 12.9, 2, 2.8, 0.8, WINDOW, true], [0, 17, 12.9, 3.2, 2, 0.8, WINDOW, true]);
  // Stufe
  p.push([0, 0, 14, 9, 1.5, 3, 0xc7b08a]);
  return p;
}

/** Biegsamer Strohhalm als Schornstein (rot-weiß). */
function strawGeo() {
  const parts = [];
  for (let i = 0; i < 8; i++) parts.push([-6, 27 + i * 2, -4, 2.4, 2, 2.4, i % 2 ? 0xffffff : 0xe2574c]);
  // Knick: Teile überlappen – abwechselnd etwas dünner, damit die Seiten nicht in einer Ebene liegen
  for (let i = 0; i < 4; i++) parts.push([-6 + (i + 1) * 1.6, 43 + i * 0.9, -4, 2.4, 2, 2.4 - (i % 2) * 0.2, i % 2 ? 0xffffff : 0xe2574c]);
  return parts;
}

function shellTower() {
  const p = [];
  const cols = [0xffb3c7, 0xfff1e0];
  const sizes = [26, 22, 18, 14, 10, 7, 4];
  let y = 0;
  sizes.forEach((s, i) => {
    const h = i === 0 ? 8 : 6 - i * 0.4;
    p.push([i % 2 ? 1 : -1, y, i % 2 ? -1 : 1, s, h, s, cols[i % 2]]);
    // Zacken an den Ecken
    if (i < 4) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push([sx * (s / 2 - 1), y + h - 1, sz * (s / 2 - 1), 2.4, 3, 2.4, 0xf28aa8]);
    y += h;
  });
  p.push([0, y, 0, 2, 3, 2, 0xf28aa8]);
  // Tür (Bogen angedeutet), Fenster
  p.push([0, 0, 14.4, 8, 8, 1, 0x7a3b5c], [0, 8, 14.4, 6, 1.5, 1, 0x7a3b5c]);
  p.push([-7, 3.5, 14.4, 3.5, 3.5, 0.8, WINDOW, true], [7, 3.5, 14.4, 3.5, 3.5, 0.8, WINDOW, true]);
  p.push([0, 12.5, 11.1, 4, 3.5, 1, WINDOW, true]);
  p.push([0, 0, 16.5, 10, 1.2, 4, 0xe9d6b0]);
  return p;
}

/** Flaschenpost als Leuchtturm: Rest (Voxel) – nur die Stufe vor der Tür. */
function bottleLighthouse() {
  return [[0, 0, 9.6, 6, 0.6, 3, 0xe9d6b0]];
}
/** Runde Flasche (gedrechselt), Etikett mit Stern, Rundbogentür, Bullaugen, Korken, Laterne mit Galerie und Dach. */
function lighthouseGeos() {
  const S = [], G = [];
  const glass = 0x3fae7a, red = 0xe2574c, cream = 0xfff1d6, dark = 0x204a3a;
  const lathe = (pts, color, seg = 24) => paintOne(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), color);
  // Flasche: runder Boden, Bauch, Schulter, Hals, Mündung
  S.push(lathe([[0, 0], [6.3, 0], [7, 0.9], [7, 22], [6.6, 25], [5.3, 28], [3.5, 30.6], [2.9, 32.2], [2.9, 39], [3.6, 39.3], [3.6, 41], [0, 41]], glass));
  // Etikett rundherum mit Goldkanten
  S.push(lathe([[7.12, 8], [7.12, 17]], cream), lathe([[7.2, 7.6], [7.2, 8.3]], 0xffc93c), lathe([[7.2, 16.7], [7.2, 17.4]], 0xffc93c));
  { const sh = new THREE.Shape(), n = 5;
    for (let k = 0; k <= n * 2; k++) { const r = k % 2 ? 0.9 : 2.1, a = (k / (n * 2)) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; k ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    S.push(paintOne(new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false }).translate(0, 12.5, 6.9), red)); }
  // Rundbogentür mit Rahmen und Knauf
  const arch = (w, h) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h - w / 2); sh.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); sh.lineTo(-w / 2, 0); return sh; };
  S.push(paintOne(new THREE.ExtrudeGeometry(arch(5.4, 7.6), { depth: 1, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, 6.3), 0xffc93c));
  S.push(paintOne(new THREE.ExtrudeGeometry(arch(4.2, 6.8), { depth: 1.1, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, 6.45), dark));
  S.push(paintOne(new THREE.SphereGeometry(0.35, 8, 6).translate(1.2, 3.4, 7.65), 0xffc93c));
  // Bullaugen, die sich nach oben um die Flasche drehen
  for (const [ang, y] of [[0, 20], [2.2, 5], [-2.2, 12.5]]) {
    const fr = new THREE.TorusGeometry(1.5, 0.38, 5, 14); fr.translate(0, y, 7.05); fr.rotateY(ang); S.push(paintOne(fr, 0xffc93c));
    const gl = new THREE.CylinderGeometry(1.3, 1.3, 0.3, 14); gl.rotateX(Math.PI / 2); gl.translate(0, y, 6.95); gl.rotateY(ang); G.push(paintOne(gl, WINDOW));
  }
  // Korken, Galerie mit Geländer, Laternenraum (leuchtet), Dach mit Kugel
  S.push(lathe([[3.3, 40.6], [3.5, 42.6]], 0xc49a6c, 16));
  S.push(paintOne(new THREE.CylinderGeometry(4.8, 4.5, 0.8, 24).translate(0, 42.9, 0), cream));
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; S.push(paintOne(new THREE.BoxGeometry(0.3, 1.9, 0.3).translate(Math.sin(a) * 4.4, 44.25, Math.cos(a) * 4.4), red)); }
  S.push(paintOne(new THREE.TorusGeometry(4.4, 0.2, 4, 24).rotateX(Math.PI / 2).translate(0, 45.2, 0), red));
  G.push(paintOne(new THREE.CylinderGeometry(2.6, 2.6, 3.8, 12).translate(0, 45.2, 0), 0xfff3b0));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.26; S.push(paintOne(new THREE.BoxGeometry(0.45, 3.8, 0.45).translate(Math.sin(a) * 2.65, 45.2, Math.cos(a) * 2.65), dark)); }
  S.push(paintOne(new THREE.CylinderGeometry(3, 3, 0.6, 16).translate(0, 47.4, 0), dark));
  S.push(paintOne(new THREE.ConeGeometry(3.6, 3.4, 16).translate(0, 49.4, 0), red), paintOne(new THREE.SphereGeometry(0.8, 10, 8).translate(0, 51.5, 0), 0xffc93c));
  return { solid: S, glow: G };
}

/** Algen-Imbiss: offener Stand mit Holztheke, Ablage mit Gläsern, schräger Streifen-Markise mit Zackenrand,
 *  Algen-Spießen, Salatschale, Becher, Lampe und zwei Hockern davor. Offen: hinten nur eine niedrige Ablage. Vorne = +z (zur Gasse). */
function snackStand() {
  const p = [];
  const wood = 0xb5763d, woodD = 0x8a5527, woodL = 0xd9a066, teal = 0x2fae8f, red = 0xe2574c, white = 0xfff6e8;
  // Theke: gelb, vorne Algen-Muster und Wellenband, oben eine überstehende Holzplatte
  p.push([0, 0, 2, 22, 9, 7, 0xffd166]);
  for (const x of [-7, 0, 7]) p.push([x, 1.5, 5.7, 3.4, 4.2, 0.4, teal], [x - 1.2, 5.7, 5.7, 1.2, 1.2, 0.4, teal], [x + 1.3, 5.2, 5.7, 1.2, 1.4, 0.4, teal]);
  p.push([0, 7.2, 5.7, 21, 0.8, 0.4, white]);
  p.push([0, 9, 2.4, 23.4, 1.2, 8, woodL]);
  // hinten nur eine niedrige Ablage (offener Stand – man sieht von der Wiese hinein), darauf bunte Gläser;
  // außen Bretterfugen und Algen
  p.push([0, 0, -4.2, 22, 9, 2.4, woodD], [0, 9, -4.2, 23, 1, 3, woodL]);
  for (let k = 0; k < 2; k++) p.push([0, 2.6 + k * 3.2, -5.5, 21.4, 0.3, 0.3, 0x734419]);
  for (const [x, h] of [[-8, 6], [-6.8, 4.4], [8.2, 5.2]]) p.push([x, 0, -5.6, 1, h, 0.5, teal], [x + 0.7, h - 1.4, -5.6, 1, 1, 0.5, 0x43a047]);
  [[-6, 0xff6f91], [-2.5, 0x7cb342], [1, 0xffd166], [4.5, 0x5aa9e6]].forEach(([x, c]) => p.push([x, 10, -4.2, 2, 2.6, 1.6, c], [x, 12.6, -4.2, 1.4, 0.6, 1.1, woodL]));
  for (const x of [-10.4, 10.4]) p.push([x, 10, -4.8, 1.2, 11.6, 1.2, wood]);                       // hintere Pfosten
  // vordere Pfosten bis unter die Markise
  for (const x of [-10.4, 10.4]) p.push([x, 10.2, 5.4, 1.2, 9.4, 1.2, wood]);
  // Markise: schräg von hinten oben nach vorne unten, rot-weiß gestreift, vorne ein Zackenrand
  const SW = 23 / 6;
  for (let sgm = 0; sgm < 4; sgm++) {
    const zc = -5.5 + 3.25 * (sgm + 0.5), y = 21.6 - 0.75 * sgm;
    for (let i = 0; i < 6; i++) p.push([-11.5 + SW * (i + 0.5), y, zc, SW, 1, 3.3, i % 2 ? white : red]);
  }
  for (let i = 0; i < 6; i++) p.push([-11.5 + SW * (i + 0.5), 18.7, 7.35, SW * 0.7, 1.3, 0.4, i % 2 ? white : red]);
  // auf der Theke: drei Algen-Spieße, Salatschale, Becher mit Halm
  for (const x of [-7, -5, -3]) p.push([x, 10.2, 3.5, 0.5, 3.6, 0.5, woodD], [x, 11.6, 3.5, 1.6, 1.2, 1.6, 0x7cb342], [x, 13, 3.5, 1.2, 1, 1.2, 0x43a047]);
  p.push([2, 10.2, 3.5, 3.6, 1.2, 3.6, white], [2, 11.4, 3.5, 2.8, 0.8, 2.8, 0x8bc34a], [2.6, 12.2, 3.2, 0.8, 0.6, 0.8, 0xff6f91]);
  p.push([7, 10.2, 3.5, 2.4, 3.2, 2.4, 0x9fd8ff], [7.4, 13.4, 3.5, 0.5, 2.4, 0.5, red]);
  // Lampe unter der Markise
  p.push([0, 19.1, 2, 0.3, 1.1, 0.3, 0x3b2a1e], [0, 17.6, 2, 1.8, 1.5, 1.8, WINDOW, true]);
  // zwei Hocker vor der Theke
  for (const x of [-5, 5]) p.push([x, 0, 9.5, 0.8, 4.2, 0.8, woodD], [x, 4.2, 9.5, 3, 0.8, 3, red], [x, 1.4, 9.5, 2.2, 0.4, 0.4, woodD]);
  // Stützen fürs Schild oben auf der Markise
  p.push([-6, 22.6, -4.4, 0.8, 2.6, 0.8, wood], [6, 22.6, -4.4, 0.8, 2.6, 0.8, wood]);
  return p;
}

/* ---------- Stiefelhaus: runde, gefaltete Formen statt Klötze (Einheit U wie die Voxel) ---------- */
const flatG = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };
/** Färbt jedes Dreieck nach seinem Mittelpunkt (fn → Farbe), mit derselben Licht-Schattierung wie paint(). */
function paintBy(g, fn) {
  const p = g.attributes.position, nor = g.attributes.normal, arr = new Float32Array(p.count * 3);
  const c = new THREE.Color(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    m.set(0, 0, 0);
    for (let k = 0; k < 3; k++) m.x += p.getX(i + k) / 3, m.y += p.getY(i + k) / 3, m.z += p.getZ(i + k) / 3;
    c.set(fn(m));
    for (let k = 0; k < 3; k++) {
      const ny = nor.getY(i + k), s = ny > 0.5 ? 1.08 : ny < -0.5 ? 0.62 : 1;
      arr.set([c.r * s, c.g * s, c.b * s], (i + k) * 3);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const paintOne = (g, color) => paintBy(flatG(g), () => color);
/** Fläche durch Querschnitte (gleich viele Punkte je Schnitt); Außenseite zeigt nach außen. */
function loft(sections, closed, colorOf = () => 0xffffff) {
  const pos = [], cols = [], M = sections[0].length, J = closed ? M : M - 1;
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < J; j++) {
      const a = sections[i][j], b = sections[i][(j + 1) % M], c = sections[i + 1][(j + 1) % M], d = sections[i + 1][j];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      cols.push(colorOf(i, j));
    }
  }
  // Richtung prüfen: Normalen sollen vom Schnitt-Mittelpunkt weg zeigen
  let s = 0;
  const v = (k) => new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]);
  for (let i = 0; i < sections.length - 1; i++) {
    const cen = sections[i].reduce((acc, q) => acc.add(new THREE.Vector3(...q)), new THREE.Vector3()).divideScalar(M);
    for (let j = 0; j < J; j++) {
      const k = (i * J + j) * 18, A = v(k), B = v(k + 3), C = v(k + 6);
      const n = B.clone().sub(A).cross(C.clone().sub(A));
      s += n.dot(A.add(B).add(C).divideScalar(3).sub(cen));
    }
  }
  if (s < 0) for (let k = 0; k < pos.length; k += 9) for (let q = 0; q < 3; q++) [pos[k + 3 + q], pos[k + 6 + q]] = [pos[k + 6 + q], pos[k + 3 + q]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  let q = 0;
  return paintBy(g, () => cols[Math.floor(q++ / 2)]);
}
const ease = (t) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2;
const sePow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

const BOOT = {
  leather: 0xb5713d, dark: 0x7a4325, cap: 0x8c4e2b, sole: 0x3a2a20, mid: 0xe8cfa0,
  tongue: 0xd39b62, lace: 0xfff1d6, eyelet: 0xffc93c, inside: 0x3b2a1e, patch: 0x6d9bc3,
};
// Grundriss der Sohle: halbe Breite je z (Ferse hinten bei -12.3, Spitze vorne bei 17)
function bootHalfWidth(z) {
  if (z <= -8) return 6.4 * Math.sqrt(Math.max(0, 1 - ((z + 8) / 4.3) ** 2));
  if (z <= -1) return 6.4 - 0.5 * ease((z + 8) / 7);
  if (z <= 6) return 5.9 + 1.3 * ease((z + 1) / 7);
  if (z <= 10) return 7.2;
  return 7.2 * Math.pow(Math.max(0, 1 - ((z - 10) / 7) ** 2.4), 1 / 2.4);
}
const SHAFT = { cz: -6.4, n: 2.6, levels: [[3.4, 6.2, 5.8], [8, 6.3, 5.8], [10, 6.2, 5.7], [12, 6.1, 5.6], [15, 5.9, 5.5], [18, 6, 5.6], [22, 6.2, 5.8], [26, 6.5, 6], [29, 6.8, 6.2], [31, 7, 6.4]] };
function shaftAt(y) {
  const L = SHAFT.levels;
  for (let i = 0; i < L.length - 1; i++) if (y <= L[i + 1][0]) { const t = (y - L[i][0]) / (L[i + 1][0] - L[i][0]); return [L[i][1] + (L[i + 1][1] - L[i][1]) * t, L[i][2] + (L[i + 1][2] - L[i][2]) * t]; }
  return [L[L.length - 1][1], L[L.length - 1][2]];
}
/** Punkt auf der Schaft-Außenseite bei Höhe y, seitlich x (vorne, +z). */
function shaftFrontZ(x, y) { const [a, b] = shaftAt(y); return SHAFT.cz + b * Math.pow(Math.max(0, 1 - Math.abs(x / a) ** SHAFT.n), 1 / SHAFT.n); }

function bootGeos() {
  const S = [], G = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // --- Sohle: dunkle Laufsohle, hoher Absatz hinten, helle Zwischensohle ---
  const outline = (z0, z1, grow) => {
    const pts = [], N = 40;
    for (let i = 0; i <= N; i++) { const z = z0 + (z1 - z0) * i / N; pts.push([bootHalfWidth(Math.min(16.999, Math.max(-12.299, z))) + grow, z]); }
    for (let i = N; i >= 0; i--) { const z = z0 + (z1 - z0) * i / N; pts.push([-(bootHalfWidth(Math.min(16.999, Math.max(-12.299, z))) + grow), z]); }
    return pts;
  };
  const slab = (pts, y0, y1, color) => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, y1, 0);
    return paintOne(g, color);
  };
  S.push(slab(outline(-12.3, 17, 0), 1.4, 2.6, BOOT.sole));                       // Sohlenplatte
  S.push(slab(outline(-12.3, -3.5, -0.15), 0, 1.4, 0x2e2119));                      // Absatz
  S.push(slab(outline(0.5, 17, -0.15), 0, 1.4, 0x2e2119));                          // Laufsohle vorne
  S.push(slab(outline(-12.3, 17, 0.3), 2.6, 3.4, BOOT.mid));                        // heller Rand
  // --- Fuß (Vorderschuh): Querschnitte von hinten bis zur runden Spitze ---
  const bottomY = () => 3.4;
  const topY = (z) => {
    if (z <= 0) return 16;
    if (z <= 10) return 16 - 5 * ease(z / 10);
    return 3.4 + 7.6 * Math.pow(Math.max(0, 1 - ((z - 10) / 6.97) ** 5), 0.2);
  };
  const footSection = (z, k = 1) => {
    const hw = Math.max(0.05, (bootHalfWidth(z) - 0.4) * k), y0 = bottomY(z), h = Math.max(0.05, (topY(z) - y0) * k), pts = [];
    for (let j = 0; j <= 14; j++) { const th = (j / 14) * Math.PI; pts.push([hw * sePow(Math.cos(th), 2 / 3), y0 + h * Math.pow(Math.sin(th), 2 / 3), z]); }
    return pts;
  };
  const zs = [-11, -7, -3.5, -2.5, 0];
  for (let z = 1; z <= 16; z += 1) zs.push(z);
  zs.splice(zs.indexOf(11), 0, 10.5); // Kante der Zehenkappe genau unter der Naht
  zs.push(16.5, 16.8, 16.95);
  const footSecs = zs.map((z) => footSection(z));
  footSecs.push(footSection(16.97, 0.02));
  S.push(loft(footSecs, false, (i) => (zs[i] >= 10.5 || i >= zs.length ? BOOT.cap : BOOT.leather)));
  // Naht der Zehenkappe und zwei Knickfalten über dem Rist
  const ridge = (z, from, to, color, r) => {
    const pts = footSection(z).slice(from, to + 1).map(([x, y, zz]) => V(x * 1.03, y + 0.12, zz));
    return paintOne(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 5), color);
  };
  S.push(ridge(10.5, 0, 14, BOOT.mid, 0.18), ridge(2.5, 4, 10, BOOT.cap, 0.22), ridge(4.2, 4, 10, BOOT.cap, 0.2));
  // --- Schaft: leicht tailliert am Knöchel, oben weiter; Fersenkappe dunkler ---
  const ring = (y, a, b) => {
    const pts = [];
    for (let j = 0; j < 28; j++) { const th = (j / 28) * Math.PI * 2; pts.push([a * sePow(Math.cos(th), 2 / SHAFT.n), y, SHAFT.cz + b * sePow(Math.sin(th), 2 / SHAFT.n)]); }
    return pts;
  };
  // Schaft geht oben ohne Naht in den gepolsterten Rand über: außen hoch, rund über die Kante, innen hinunter
  const [ta, tb] = shaftAt(31), L0 = SHAFT.levels.length - 1;
  const lip = [[31.9, 0.45], [32.6, 0.35], [33, -0.3], [32.6, -0.9], [31.6, -1.15], [30.4, -1.2]];
  const shaftSecs = [...SHAFT.levels.map(([y, a, b]) => ring(y, a, b)), ...lip.map(([y, d]) => ring(y, ta + d, tb + d))];
  // Fersenkappe: hinten (Punkte 17–24 von 28), vom Boden bis y = 10; Rand dunkel, innen ganz dunkel
  S.push(loft(shaftSecs, true, (i, j) => (i >= L0 + 4 ? BOOT.inside : i >= L0 ? BOOT.dark : i < 2 && j >= 17 && j < 25 ? BOOT.dark : BOOT.leather)));
  { const sh = new THREE.Shape(ring(0, ta - 1.18, tb - 1.18).map(([x, , z]) => new THREE.Vector2(x, z - SHAFT.cz)));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2); g.scale(1, 1, -1); g.translate(0, 30.6, SHAFT.cz);
    S.push(paintOne(g, BOOT.inside)); }
  // Schlaufe hinten am Rand
  { const g = new THREE.TorusGeometry(1.1, 0.38, 5, 10, Math.PI); g.rotateY(Math.PI / 2); g.translate(0, 32.2, SHAFT.cz - tb - 0.45); S.push(paintOne(g, BOOT.dark)); }
  // --- Zunge, Ösen, gekreuzte Schnürsenkel mit Schleife ---
  const tz = shaftFrontZ(0, 22) + 0.4;
  S.push(paintOne(new THREE.BoxGeometry(5.6, 19, 1.8).translate(0, 21.5, tz - 0.9), BOOT.tongue)); // endet unter dem Rand
  const ys = [15, 18, 21, 24, 27], ex = 3.9, front = tz + 0.3;
  const eye = (sx, y) => V(sx * ex, y, shaftFrontZ(ex, y) + 0.2);
  for (const y of ys) for (const sx of [-1, 1]) {
    const p = eye(sx, y);
    S.push(paintOne(new THREE.TorusGeometry(0.55, 0.2, 5, 10).translate(p.x, p.y, p.z), BOOT.eyelet));
  }
  const lace = (a, b) => S.push(paintOne(cylBetweenG(a, b, 0.28), BOOT.lace));
  const edge = (sx, y) => V(sx * 2.6, y, front);
  for (const y of ys) for (const sx of [-1, 1]) lace(eye(sx, y), edge(sx, y));
  lace(edge(-1, 15), edge(1, 15));
  for (let i = 0; i < ys.length - 1; i++) {
    const ym = (ys[i] + ys[i + 1]) / 2;
    lace(edge(-1, ys[i]), V(0, ym, front)); lace(V(0, ym, front), edge(1, ys[i + 1]));
    lace(edge(1, ys[i]), V(0, ym, front + 0.4)); lace(V(0, ym, front + 0.4), edge(-1, ys[i + 1]));
  }
  const knot = V(0, 29, front + 0.3);
  lace(edge(-1, 27), knot); lace(edge(1, 27), knot);
  S.push(paintOne(new THREE.SphereGeometry(0.6, 8, 6).translate(knot.x, knot.y, knot.z), BOOT.lace));
  for (const sx of [-1, 1]) {
    const g = new THREE.TorusGeometry(1.2, 0.3, 5, 12); g.scale(1, 0.6, 1); g.rotateZ(sx * 0.35); g.translate(sx * 1.5, 29.5, front + 0.3);
    S.push(paintOne(g, BOOT.lace));
    lace(V(sx * 0.3, 28.8, front + 0.35), V(sx * 1.1, 26.3, front + 0.45));
  }
  // --- Flicken mit Stichen auf der rechten Schaftseite ---
  { const [a] = shaftAt(8.5), x = a + 0.15;
    S.push(paintOne(new THREE.BoxGeometry(0.4, 3.6, 3.6).rotateX(0.15).translate(x, 8.5, SHAFT.cz), BOOT.patch));
    for (const [dy, dz] of [[1.5, -1], [1.5, 1], [-1.5, -1], [-1.5, 1], [-1, 1.5], [1, 1.5], [-1, -1.5], [1, -1.5]]) S.push(paintOne(new THREE.BoxGeometry(0.3, dz === 1.5 || dz === -1.5 ? 0.8 : 0.25, dz === 1.5 || dz === -1.5 ? 0.25 : 0.8).translate(x + 0.2, 8.5 + dy, SHAFT.cz + dz), BOOT.lace)); }
  // --- runde Fenster: Schaft oben und Fuß unten, beide Seiten ---
  const win = (x, y, z, sx) => {
    const fr = new THREE.TorusGeometry(1.8, 0.42, 5, 14); fr.rotateY(Math.PI / 2); fr.translate(x, y, z); S.push(paintOne(fr, BOOT.dark));
    const gl = new THREE.CylinderGeometry(1.6, 1.6, 0.3, 14); gl.rotateZ(Math.PI / 2); gl.translate(x - sx * 0.05, y, z); G.push(paintOne(gl, WINDOW));
  };
  for (const sx of [-1, 1]) {
    win(sx * (shaftAt(21)[0] + 0.05), 21, SHAFT.cz, sx);
    win(sx * 6.6, 7.4, 4.5, sx);
  }
  // --- Tür vorne in der Spitze (Rundbogen), Knauf, Fußmatte ---
  const arch = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0); return s; };
  S.push(paintOne(new THREE.ExtrudeGeometry(arch(5.6, 6.4), { depth: 0.9, bevelEnabled: false, curveSegments: 8 }).translate(0, 3.4, 15.9), BOOT.dark));
  S.push(paintOne(new THREE.ExtrudeGeometry(arch(4.4, 5.6), { depth: 1.0, bevelEnabled: false, curveSegments: 8 }).translate(0, 3.4, 16.2), BOOT.inside));
  S.push(paintOne(new THREE.SphereGeometry(0.4, 8, 6).translate(1.3, 6, 17.3), BOOT.eyelet));
  S.push(paintOne(new THREE.BoxGeometry(7, 0.6, 2.4).translate(0, 0.3, 18.8), 0xe9d6b0));
  for (const g of [...S, ...G]) g.translate(0, 0, -2); // Mitte unter das Haus
  return { solid: S, glow: G };
}
function cylBetweenG(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), 6);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}

/** Pflanzen oben im Stiefel (Voxel). */
function bootHouse() {
  const cz = SHAFT.cz - 2;
  return [
    [-2.5, 30.6, cz + 0.4, 3, 4, 3, 0x7cb342], [2.5, 30.6, cz + 3, 2.4, 6.5, 2.4, 0x43a047], [-0.5, 30.6, cz - 1.6, 2, 3, 2, 0xa5c94a], [2.5, 37.1, cz + 3, 1.6, 1.6, 1.6, 0xff6f91],
  ];
}

/** Bauchige Teekanne als Häuschen. */
function teapotHouse() {
  const p = [];
  const body = 0x8fd3f4, dots = 0xffffff;
  p.push(...ring(0, 2, 9, 0x6fb7dc));
  p.push(...ring(2, 4, 11, body));
  p.push(...ring(6, 10, 12, body));
  p.push(...ring(16, 4, 10.5, body));
  p.push(...ring(20, 2, 8, 0x6fb7dc));                   // Deckel
  p.push(...ring(22, 2, 5.5, body));
  p.push([0, 24, 0, 3, 3, 3, 0xffd166]);                 // Knauf
  for (const [x, y] of [[-6, 9], [5, 12], [-2, 14], [7, 7]]) p.push([x, y, 12.2, 2, 2, 0.6, dots]); // Punkte
  // Tülle (nach rechts), Henkel (links)
  for (let i = 0; i < 5; i++) p.push([13 + i * 2, 7 + i * 2.2, 0, 3, 3, 3, body]);
  p.push([-13.5, 8, 0, 2.5, 2.5, 3, body], [-16, 10, 0, 2.5, 8, 3, body], [-13.5, 17, 0, 2.5, 2.5, 3, body]);
  // Tür + Fenster
  p.push([0, 2, 12.3, 6, 8, 1, 0x2f5d8a], [2, 5.5, 12.9, 0.8, 0.8, 0.4, 0xffc93c]);
  p.push([-7, 10, 11.4, 3.2, 3.2, 0.8, WINDOW, true], [7, 10, 11.4, 3.2, 3.2, 0.8, WINDOW, true]);
  p.push([0, 0, 14.5, 8, 1, 3, 0xe9d6b0]);
  return p;
}

/** Sardinendose als Wohnwagen, Deckel hinten aufgerollt (drinnen liegen Sardinen). */
function sardineTrailer() {
  const p = [];
  const tin = 0xc4ced8, tinD = 0x9aa6b1, blue = 0x3f7fc4, frame = 0x7d8b98;
  // Dose mit runden Ecken (zwei gekreuzte Quader): unten ganz, oben nur der geschlossene Teil
  p.push([0, 3, 0, 30, 7, 12, tin], [0, 3, 0, 28, 7, 14, tin]);
  p.push([-3.25, 10, 0, 23.5, 2, 12, tin], [-3.75, 10, 0, 22.5, 2, 14, tin]);
  // offener Teil: dünne Wände, goldenes Öl, drei Sardinen
  p.push([11.25, 10, 6.5, 5.5, 2, 1, tin], [11.25, 10, -6.5, 5.5, 2, 1, tin], [14.5, 10, 0, 1, 2, 12, tin]);
  p.push([11.25, 10, 0, 5.5, 0.4, 12, 0xd9b45a]);
  for (const z of [-3.6, 0, 3.6]) {
    p.push([11.4, 10.4, z, 4.6, 1.1, 2.4, 0xd5dde4], [11.4, 11.5, z, 3.8, 0.4, 1.1, 0x4a6f9a]);
    p.push([13.9, 10.4, z, 0.8, 1.1, 1.4, 0xd5dde4], [9.0, 10.7, z + 0.7, 0.4, 0.4, 0.3, 0x2a2a2a]);
  }
  // aufgerollter Deckel als runde Rolle + Dosenschlüssel
  p.push([8.5, 11.4, 0, 4.4, 2.6, 15, tinD], [8.5, 10.9, 0, 2.6, 3.6, 15, tinD]);
  p.push([8.5, 12.4, 8.3, 0.8, 0.8, 1.8, frame], [8.5, 11.2, 9.6, 0.8, 3.2, 0.8, frame], [8.5, 11.2, 10.8, 0.8, 0.8, 1.6, frame], [8.5, 13.6, 10.8, 0.8, 0.8, 1.6, frame], [8.5, 11.2, 12, 0.8, 3.2, 0.8, frame]);
  // aufgedruckter Fisch auf dem Deckel
  p.push([-5, 12, 0, 9, 0.3, 3, 0xffd166], [-5, 12, 0, 6, 0.3, 4.4, 0xffd166]);
  p.push([0.2, 12, 1.1, 1.8, 0.3, 1.4, 0xffd166], [0.2, 12, -1.1, 1.8, 0.3, 1.4, 0xffd166], [-7.3, 12.1, 0.6, 0.8, 0.3, 0.8, 0x3b2a1e]);
  // Ofenrohr
  p.push([-11, 12, -3.5, 1.6, 4, 1.6, frame], [-11, 16, -3.5, 2.4, 0.8, 2.4, frame]);
  // Fenster mit Rahmen auf beiden Seiten, blaues Etikett-Band darunter
  for (const sz of [-1, 1]) {
    for (const x of sz > 0 ? [-11, -5.5, 0] : [-11, -5.5, 0, 6]) {
      p.push([x, 5.4, sz * 7.15, 4.2, 4.2, 0.5, frame], [x, 6, sz * 7.3, 3, 3, 0.6, WINDOW, true]);
    }
    p.push([-2.6, 3.5, sz * 7.1, 22.4, 1.2, 0.4, blue]); // endet vor der runden Ecke (sonst Flackern)
  }
  // Tür (vorne) mit Stufe
  p.push([5, 3, 7.3, 4.6, 7.4, 0.8, 0x2f5d8a], [6.5, 6.4, 7.85, 0.7, 0.7, 0.4, 0xffc93c]);
  // Treppe bis unter die Tür (der Wagen steht auf Rädern, Boden bei y = 3)
  p.push([5, 0, 7.6, 3.6, 3, 3.2, tinD], [5, 0, 10, 3.6, 1.5, 2, tinD]);
  // Rücklichter hinten, Deichsel vorne
  p.push([15.3, 4.5, 4.4, 0.6, 1.4, 2, 0xe2574c], [15.3, 4.5, -4.4, 0.6, 1.4, 2, 0xe2574c]);
  // Deichsel steckt im Wagen, vorne Kupplung und Stützfuß
  p.push([-17.5, 3.4, 0, 7, 1, 1.2, tinD], [-21.6, 3, 0, 1.4, 1.8, 1.8, frame]);
  p.push([-19.5, 0.4, 0, 0.6, 3, 0.6, frame], [-19.5, 0, 0, 1.6, 0.4, 1.6, frame]);
  // runde Muschel-Räder
  for (const x of [-10, 10]) for (const sz of [-1, 1]) {
    const z = sz * 7.6;
    p.push([x, 0.7, z, 5, 3.6, 1, 0xf7a1c4], [x, 0, z, 3.6, 5, 1, 0xf7a1c4]);
    p.push([x, 1.9, z + sz * 0.6, 1.4, 1.2, 0.4, 0xfff1d6]);
  }
  return p;
}

/** Rathaus mit Uhrturm (Uhr als Papp-Sticker vorne). */
function clockTower() {
  const p = [];
  const wall = 0xfff1d6, trim = 0x2f6f8f, roof = 0x3f9cc1;
  p.push([0, 0, 0, 22, 14, 16, wall]);                  // Halle
  p.push([0, 14, 0, 23, 1.6, 17, trim]);
  p.push([0, 15.6, 0, 19, 2, 13, roof], [0, 17.6, 0, 15, 2, 9, roof]);
  p.push([0, 14, -1, 10, 22, 10, wall]);                // Turm
  p.push([0, 36, -1, 11, 1.4, 11, trim]);
  p.push([0, 37.4, -1, 8, 3, 8, roof], [0, 40.4, -1, 5, 3, 5, roof], [0, 43.4, -1, 2, 3, 2, roof]);
  p.push([0, 46.4, -1, 0.5, 4, 0.5, 0x5b4636], [1.6, 48.4, -1, 2.8, 1.8, 0.3, 0xe2574c]); // Fahne
  // Säulen + Tür
  for (const x of [-8, -4, 4, 8]) p.push([x, 0, 8.4, 1.6, 13, 1.2, 0xffffff]);
  p.push([0, 0, 8.3, 5, 8, 1, 0x7a4a2a], [0, 8, 8.3, 3, 1.4, 1, 0x7a4a2a]);
  p.push([-6, 4, 8.2, 2.4, 4, 0.8, WINDOW, true], [6, 4, 8.2, 2.4, 4, 0.8, WINDOW, true]);
  p.push([0, 28, 4.3, 3, 4, 0.8, WINDOW, true]);
  p.push([0, 0, 11, 12, 1, 4, 0xe9d6b0]);               // Treppe
  return p;
}

/** Wohnhaus aus gestapelten Holzkisten. */
function crateHouse() {
  const p = [];
  const wood = 0xc98f55, plank = 0xa8743f;
  const crates = [[0, 0, 0, 18, 11, 14], [-2, 11, -1, 15, 10, 12], [2, 21, 0, 11, 9, 10]];
  for (const [x, y, z, w, h, d] of crates) {
    p.push([x, y, z, w, h, d, wood]);
    const fz = z + d / 2 + 0.2; // Leisten ganz vor der Kiste – bündig würden sie flackern
    p.push([x, y + h - 1, fz, w, 1, 0.4, plank], [x, y, fz, w, 1, 0.4, plank]);
    p.push([x - w / 2 + 0.6, y, fz, 1.2, h, 0.4, plank], [x + w / 2 - 0.6, y, fz, 1.2, h, 0.4, plank]);
  }
  p.push([0, 0, 7.3, 5, 8, 0.8, 0x4a3324]);
  p.push([-5.5, 4, 7.3, 3, 3, 0.6, WINDOW, true], [5.5, 4, 7.3, 3, 3, 0.6, WINDOW, true]);
  p.push([-5, 14.5, 5.3, 3, 3, 0.6, WINDOW, true], [1.5, 14.5, 5.3, 3, 3, 0.6, WINDOW, true]);
  p.push([2, 24, 5.3, 3, 3, 0.6, WINDOW, true]);
  // Leiter seitlich + Pflanzentopf auf dem Dach
  for (let i = 0; i < 7; i++) p.push([9.6, 2 + i * 2.6, 3, 0.6, 0.5, 3, 0x7a4a2a]);
  p.push([9.6, 0, 1.6, 0.6, 20, 0.5, 0x7a4a2a], [9.6, 0, 4.4, 0.6, 20, 0.5, 0x7a4a2a]);
  p.push([4, 30, 0, 3, 2, 3, 0xd9734e], [4, 32, 0, 2, 3, 2, 0x43a047]);
  return p;
}

/** Laden in einem großen Einmachglas: durchsichtiges Glas, innen Theke, Regal und Bonbons. */
function jarShop() {
  const p = [];
  const wood = 0xc98f55;
  p.push(...ring(0, 2, 10.6, 0x9fd3e0));               // Boden
  p.push(...ring(22, 3, 8.6, 0xffc93c));                // Deckel
  p.push([-5.5, 25, -0.4, 0.8, 1.8, 0.8, 0xffd166], [5.5, 25, -0.4, 0.8, 1.8, 0.8, 0xffd166]); // Halter direkt hinter dem Schild
  // innen: Theke, Regal hinten, Bonbonhaufen, Lampe
  p.push([2, 2, -1, 9, 5, 3.6, wood], [2, 7, -1, 10, 0.8, 4.4, 0xe9d6b0]);
  // Regal schmal genug, dass es nirgends durchs Glas ragt
  p.push([0, 2, -6, 11, 0.8, 2.6, wood], [-5.1, 2, -6, 0.8, 13, 2.6, wood], [5.1, 2, -6, 0.8, 13, 2.6, wood]);
  p.push([0, 8, -6, 11, 0.8, 2.6, wood], [0, 14, -6, 11, 0.8, 2.6, wood]);
  const candy = [0xff6f91, 0xffd166, 0x7cb342, 0xb07ef0, 0xff9f45, 0x5aa9e6];
  [[-3.4, 8.8], [-1.1, 8.8], [1.2, 8.8], [3.5, 8.8], [-3, 14.8], [0, 14.8], [3, 14.8]].forEach(([x, y], i) => p.push([x, y, -6, 1.8, 1.8, 1.8, candy[i % 6], true]));
  [[-5, 2, 3], [-3, 2, 4.5], [-5.6, 2, 5.4], [-4, 3.8, 3.8], [-6.4, 2, 2]].forEach(([x, y, z], i) => p.push([x, y, z, 1.8, 1.8, 1.8, candy[(i + 2) % 6], true]));
  [[0, 7.8, -1], [3.2, 7.8, -1.6]].forEach(([x, y, z], i) => p.push([x, y, z, 1.4, 1.4, 1.4, candy[(i + 4) % 6], true]));
  p.push([0, 17, 0, 0.3, 5, 0.3, 0x5b4636], [0, 15.4, 0, 1.6, 1.6, 1.6, WINDOW, true]);
  // Tür vorne in der Mitte, mit Rahmen und Stufe
  p.push([0, 2, 9.9, 5.6, 8.8, 0.6, 0xffc93c], [0, 2, 10.15, 4.4, 8, 0.6, 0x2f5d8a], [1.3, 5.6, 10.6, 0.7, 0.7, 0.4, 0xffd166]);
  p.push([0, 0, 12, 9, 1, 3, 0xe9d6b0]);
  return p;
}
/** Glaswand des Ladens (Voxel-Einheiten): offener Zylinder mit 12 Seiten, eine Seite genau vorne. */
function jarGlass() {
  const pts = [[9.7, 2], [10, 3], [10, 18], [9.4, 20], [8, 21.6], [7.6, 22.4]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 12, Math.PI / 12);
  g.computeVertexNormals();
  return g;
}

/** Brunnen auf dem Platz (Blasen steigen aus der Mitte). */
function fountain() {
  return [
    ...ring(0, 2.5, 7, 0xd8c7a8),
    ...ring(2.5, 0.4, 6, 0x5ac8e6),
    [0, 0, 0, 2.4, 7, 2.4, 0xd8c7a8],
    [0, 7, 0, 4.6, 1, 4.6, 0xd8c7a8],
    [0, 8, 0, 3.4, 0.4, 3.4, 0x5ac8e6],
  ];
}

/** Kleine Post-Bude. */
function postBooth() {
  return [
    [0, 0, 0, 12, 11, 9, 0xffd166],
    [0, 11, 0, 13.5, 1.4, 10.5, 0xe2574c],
    [0, 12.4, 0, 10, 1.4, 7, 0xe2574c],
    [0, 4, 4.7, 7, 5, 0.6, WINDOW, true],
    [0, 3.2, 5.2, 8, 0.8, 1.4, 0xc98f55],
    [-4.6, 0, 4.7, 2, 3, 2, 0x5aa9e6], [-4.6, 3, 4.7, 2.2, 0.6, 2.2, 0x3e7cb1],
  ];
}

function mailbox(color) {
  return [
    [0, 0, 0, 0.9, 7, 0.9, 0x9a6a3c],
    [0, 7, 0, 3, 2.6, 4, color], [0, 9.6, 0, 2.4, 0.8, 3.6, color],
    [1.7, 8, -1, 0.4, 3, 0.6, 0xe2574c],
  ];
}

function lantern() {
  return [
    [0, 0, 0, 1.6, 1, 1.6, 0x5b6b80],
    [0, 1, 0, 0.8, 12, 0.8, 0x5b6b80],
    [0, 13, 0, 2.6, 0.6, 2.6, 0x3e4a5a],
    [0, 13.6, 0, 2, 2.6, 2, 0xffe6a0, true],
    [0, 16.2, 0, 2.8, 0.8, 2.8, 0x3e4a5a], [0, 17, 0, 1, 1, 1, 0x3e4a5a],
  ];
}

/** Papier-Stern als Textur (für schwebende Pastellsterne). */
function starTexture(color) {
  const stk = sticker(128, 128, (ctx) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 26 : 62, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(52, 52, 9, 0, Math.PI * 2); ctx.fill();
  }, { outline: 6, thick: 2, grainK: 0.6 });
  return toTexture(stk.canvas);
}

/* ---------- Aufbau ---------- */
export async function buildTown(scene, rng, { heightAt, obstacles, env, camera }, pause = async () => {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: 0x140d06 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: hdr(0xffffff, 0.9) });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xd6f3fa, roughness: 0.15, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const updaters = [];
  const houses = []; // für das Pflaster: keine Steine unter Häusern

  /** Haus an (x, z) setzen, Front zeigt zur Inselmitte. */
  function place(parts, x, z, r, { scale = 1, turn = 0, extra = [], glass = null, geos = null } = {}) {
    let { geo, glow } = vox([...parts, ...extra], U * scale);
    if (geos) { // freie Formen (in Voxel-Einheiten) zu den Klötzen dazu
      for (const g of [...geos.solid, ...geos.glow]) g.scale(U * scale, U * scale, U * scale);
      geo = mergeAll([geo, ...geos.solid]);
      glow = mergeAll([glow, ...geos.glow]);
    }
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (glow) g.add(new THREE.Mesh(glow, glowMat));
    if (glass) {
      glass.scale(U * scale, U * scale, U * scale);
      const gm = new THREE.Mesh(glass, glassMat);
      gm.renderOrder = 2;
      g.add(gm);
    }
    g.position.set(x, heightAt(x, z) - 0.08, z);
    g.rotation.y = Math.atan2(-x, -z) + turn;
    scene.add(g);
    geo.computeBoundingBox();
    houses.push({ g, box: geo.boundingBox });
    obstacles.push({ x, z, r: r * scale });
    return g;
  }

  const polar = (deg, r) => [Math.cos(deg * Math.PI / 180) * r, Math.sin(deg * Math.PI / 180) * r];
  const at = (deg, r, parts, rad, o = {}) => { const [x, z] = polar(deg, r); return place(parts, x, z, rad, o); };

  /* --- Stadtkern: die „Muschelgasse“ im Bogen hinter der Krabbenwiese --- */
  // äußere Reihe (größere Häuser, Front zur Gasse = zur Inselmitte)
  const can = at(-122, 35.4, canHouse(), 1.8, { extra: strawGeo() });
  await pause();
  at(-112, 35.6, shellTower(), 1.9);
  await pause();
  const hall = at(-101.5, 35.8, clockTower(), 2.2);
  await pause();
  at(-91, 35.6, crateHouse(), 2.0);
  await pause();
  const shop = at(-81.5, 35.2, jarShop(), 1.7, { glass: jarGlass() });
  await pause();
  // innere Reihe (kleine Buden, Front zur Gasse = nach außen)
  const stand = at(-117, 29.9, snackStand(), 1.6, { turn: Math.PI });
  await pause();
  const fountainG = at(-101.5, 30.4, fountain(), 1.5);
  await pause();
  const post = at(-87, 30.0, postBooth(), 1.3, { turn: Math.PI });
  await pause();

  // Schilder an Rathaus, Laden, Post – fest montiert (Rückseite an Wand/Stütze, Unterkante auf einer Kante)
  const signOn = (g, key, style, w, { y = null, bottom = null, back }) => {
    const b = solidSign(t(key), { style, w });
    b.position.set(0, bottom !== null ? bottom * U + b.userData.h / 2 : y * U, back * U + 0.04);
    g.add(b);
    return b;
  };
  signOn(hall, 'town.hall', 'hall', 1.45, { y: 22, back: 4 });            // an der Turmwand, über dem Hallendach
  signOn(shop, 'town.shop', 'shop', 1.6, { bottom: 25, back: 0 });         // steht auf dem Deckel, Halter dahinter
  signOn(post, 'town.post', 'post', 1.1, { bottom: 12.4, back: 3.5 });     // steht auf dem unteren Dach, lehnt am oberen
  await pause();

  // Gasse: Kopfsteinpflaster in Reihen (versetzt wie gemauert), dazwischen helle Fugen, an beiden Rändern Bordsteine
  {
    const A0 = -126, A1 = -78; // Bogen der Gasse in Grad
    const street = new THREE.RingGeometry(31.4, 33.8, 96, 1, (78 * Math.PI) / 180, (48 * Math.PI) / 180);
    street.rotateX(-Math.PI / 2);
    street.translate(0, 0.02, 0);
    const sm = new THREE.Mesh(street, new THREE.MeshStandardMaterial({ color: 0xcdbfa5, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    sm.receiveShadow = true;
    scene.add(sm);
    const pt = new THREE.Vector3();
    const underHouse = (x, z, r) => houses.some(({ g, box }) => {
      g.updateMatrixWorld(true);
      pt.set(x, g.position.y, z);
      g.worldToLocal(pt);
      const k = r / g.scale.x;
      return pt.x > box.min.x - k && pt.x < box.max.x + k && pt.z > box.min.z - k && pt.z < box.max.z + k;
    });
    // alte Würfelfolge beibehalten (danach Gebautes bleibt so an seinem Platz)
    for (let i = 0; i < 150; i++) { polar(range(rng, -125, -79), range(rng, 31.6, 33.6)); range(rng, 0.2, 0.34); rng(); pick(rng, [0, 1, 2]); }
    // ein Pflasterstein: abgerundetes Rechteck mit weicher Kante (Einheitsgröße, wird skaliert)
    const unit = (() => {
      const sh = new THREE.Shape(), w = 0.5, h = 0.5, c = 0.16;
      sh.moveTo(-w + c, -h); sh.lineTo(w - c, -h); sh.quadraticCurveTo(w, -h, w, -h + c); sh.lineTo(w, h - c); sh.quadraticCurveTo(w, h, w - c, h);
      sh.lineTo(-w + c, h); sh.quadraticCurveTo(-w, h, -w, h - c); sh.lineTo(-w, -h + c); sh.quadraticCurveTo(-w, -h, -w + c, -h);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.1, bevelSegments: 2, curveSegments: 3 });
      g.rotateX(-Math.PI / 2); g.translate(0, 0.25, 0);   // liegt auf y = 0, ist 1 hoch
      return paintGeo(g, 0xffffff);                       // Farbe kommt je Stein dazu
    })();
    // Alle Steine teilen sich EINE Form, jeder hat nur Lage, Größe und Farbe (statt ~170 000 Ecken nur ein paar Hundert):
    // so muss beim Laden kaum etwas auf die Grafikkarte, und der Tauchgang ruckelt nicht
    const sr = mulberry32(31337), stones = [], Y = new THREE.Vector3(0, 1, 0);
    const lay = (a, rc, len, wid, hgt, color) => {
      const [x, z] = polar(a, rc);
      if (underHouse(x, z, Math.max(len, wid) * 0.5)) return;
      const yaw = -(a * Math.PI / 180 + Math.PI / 2) + (sr() - 0.5) * 0.08;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.02, z), new THREE.Quaternion().setFromAxisAngle(Y, yaw), new THREE.Vector3(len, hgt, wid));
      const c = new THREE.Color(new THREE.Color(color).multiplyScalar(0.94 + sr() * 0.1).getHex()); // wie früher auf 8 Bit gerundet
      stones.push([m, c]);
    };
    const rows = 5, r0 = 31.62, rw = (33.58 - r0) / rows, span = A1 - A0;
    for (let i = 0; i < rows; i++) {
      const rc = r0 + rw * (i + 0.5), L = (rc * span * Math.PI) / 180, n = Math.round(L / 0.48), step = span / n;
      for (let k = 0; k < n + (i % 2); k++) {
        const a = A0 + step * (k + (i % 2 ? 0 : 0.5));
        if (a < A0 + step * 0.3 || a > A1 - step * 0.3) continue;                       // Enden sauber
        lay(a, rc, ((rc * step * Math.PI) / 180) * 0.86, rw * 0.84, 0.07 + sr() * 0.03,
          [0xe8dfd0, 0xd9cebd, 0xcfc2ad, 0xe2d6c2, 0xbfb3a1][Math.floor(sr() * 5)]);
      }
    }
    for (const rc of [31.5, 33.7]) {                                                     // Bordsteine
      const L = (rc * span * Math.PI) / 180, n = Math.round(L / 0.9), step = span / n;
      for (let k = 0; k < n; k++) lay(A0 + step * (k + 0.5), rc, ((rc * step * Math.PI) / 180) * 0.94, 0.2, 0.12, 0xb3a690);
    }
    const cm = new THREE.InstancedMesh(unit, mat, stones.length);
    stones.forEach(([m, c], i) => { cm.setMatrixAt(i, m); cm.setColorAt(i, c); });
    cm.instanceMatrix.needsUpdate = true;
    cm.instanceColor.needsUpdate = true;
    cm.frustumCulled = false; // eine Gasse: lohnt nicht, und die Grundform allein hat keinen passenden Umriss
    cm.receiveShadow = true;
    scene.add(cm);
  }

  await pause();
  // Laternen am inneren Rand der Gasse, dazwischen Wimpelketten
  {
    const lg = vox(lantern(), U);
    const tops = [];
    for (let deg = -124; deg <= -79; deg += 7.5) {
      const [x, z] = polar(deg, 31.1);
      if (!obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 0.3)) continue;
      const g = new THREE.Group();
      const m = new THREE.Mesh(lg.geo, mat); m.castShadow = true;
      g.add(m, new THREE.Mesh(lg.glow, glowMat));
      g.position.set(x, heightAt(x, z) - 0.05, z);
      scene.add(g);
      obstacles.push({ x, z, r: 0.3 });
      tops.push(new THREE.Vector3(x, heightAt(x, z) + 2.0, z));
    }
    const flags = [], pts = [];
    const cols = [0xe2574c, 0xffd166, 0x2fae8f, 0x5aa9e6, 0xf28aa8];
    for (let s2 = 0; s2 < tops.length - 1; s2++) {
      const a = tops[s2], b = tops[s2 + 1];
      const dir = new THREE.Vector3().subVectors(b, a), yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      for (let i = 0; i <= 10; i++) {
        const k = i / 10, p = a.clone().lerp(b, k);
        p.y -= Math.sin(k * Math.PI) * 0.35;
        pts.push(p);
        if (i === 0 || i === 10 || i % 2) continue;
        const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.15, 0, 0), new THREE.Vector3(0.15, 0, 0), new THREE.Vector3(0, -0.32, 0)]);
        tri.computeVertexNormals();
        tri.rotateY(yaw);
        tri.translate(p.x, p.y, p.z);
        flags.push(paintGeo(tri, cols[(s2 * 5 + i) % cols.length]));
      }
      if (s2 < tops.length - 2) pts.push(null);
    }
    if (flags.length) {
      const fm = new THREE.Mesh(mergeAll(flags), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 }));
      fm.castShadow = true;
      scene.add(fm);
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) if (pts[i] && pts[i + 1]) segs.push(pts[i], pts[i + 1]);
      scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), new THREE.LineBasicMaterial({ color: 0x5b4636 })));
    }
  }

  await pause();
  /* --- abgelegene Häuser, weit verstreut auf der Insel --- */
  const tower = place(bottleLighthouse(), 22, -24, 1.2, { scale: 1.15, geos: lighthouseGeos() });
  await pause();
  const teapot = place(teapotHouse(), 31, -14.5, 1.9, { turn: -0.25 });
  await pause();
  place(sardineTrailer(), -32, -6, 2.0, { turn: 1.2 });
  await pause();
  place(bootHouse(), -31, 15, 1.7, { turn: -0.2, geos: bootGeos() });
  await pause();
  const mailboxes = [[28.6, -12.4, 0xf28aa8], [-29.4, -4.6, 0x2fae8f], [-28.6, 13.4, 0xe2574c]];
  for (const [x, z, c] of mailboxes) {
    const { geo } = vox(mailbox(c), U);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.position.set(x, heightAt(x, z) - 0.05, z);
    m.rotation.y = Math.atan2(-x, -z) + range(rng, -0.4, 0.4);
    scene.add(m);
  }

  // Schwebende Pastellsterne hoch über dem Meer (eigener „Himmel“)
  const floaters = [];
  {
    const texs = ['#ffc6d9', '#c8f2dc', '#d9c8ff', '#ffe0b3', '#bfe6ff', '#fff3a8'].map(starTexture);
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pick(rng, texs), transparent: true, alphaTest: 0.3, depthWrite: false, fog: true }));
      const a = rng() * Math.PI * 2, d = range(rng, 22, 55);
      s.position.set(Math.cos(a) * d, range(rng, 10, 20), Math.sin(a) * d);
      const k = range(rng, 1.0, 2.2);
      s.scale.set(k, k, 1);
      s.material.rotation = rng() * 6;
      floaters.push({ s, y: s.position.y, ph: rng() * 6, spin: range(rng, -0.25, 0.25), amp: 0.6 });
      scene.add(s);
    }
  }

  // Krabben-Sternbild: 12 der Sterne bilden hinter der Stadt eine Krabbe
  // (Körper, zwei Augen auf Stielen, zwei offene Scheren, Beinchen). Höhe so gewählt,
  // dass es in der Startansicht über den Dächern im Bild liegt.
  const CONST_Z = -40;
  const shape = [
    [-3, 6], [3, 6], [3.6, 8.6], [-3.6, 8.6],          // 0–3 Körper: unten links, unten rechts, oben rechts, oben links
    [-1.5, 10.5], [1.5, 10.5],                         // 4–5 Augen
    [-6.8, 10.2], [-8.4, 12.9], [-5.3, 13.1],          // 6–8 linke Schere: Ellbogen, zwei Zangenspitzen
    [6.8, 10.2], [8.4, 12.9], [5.3, 13.1],             // 9–11 rechte Schere
  ];
  const constStars = floaters.slice(0, shape.length);
  shape.forEach(([x0, y0], i) => {
    const f = constStars[i], x = x0 * 1.15, y = 9 + (y0 - 9) * 1.15;
    f.s.position.set(x, y, CONST_Z);
    f.y = y; f.amp = 0.15;
    const k = i === 4 || i === 5 ? 1.25 : 1.55;
    f.s.scale.set(k, k, 1);
  });
  // Verbindungen: Sternindex oder abgeleiteter Punkt { a, b, t } (zwischen zwei Sternen) bzw. { a, dx, dy } (versetzt)
  const links = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [3, 6], [6, 7], [6, 8], [2, 9], [9, 10], [9, 11],
    [{ a: 3, b: 2, t: 0.29 }, 4], [{ a: 3, b: 2, t: 0.71 }, 5],
    [{ a: 0, b: 3, t: 0.15 }, { a: 0, dx: -2.7, dy: -1.25 }], [{ a: 0, b: 3, t: 0.55 }, { a: 0, dx: -3.3, dy: 0.55 }],
    [{ a: 1, b: 2, t: 0.15 }, { a: 1, dx: 2.7, dy: -1.25 }], [{ a: 1, b: 2, t: 0.55 }, { a: 1, dx: 3.3, dy: 0.55 }],
  ];
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), perp = new THREE.Vector3();
  const pt = (d, out) => {
    if (typeof d === 'number') return out.copy(constStars[d].s.position);
    const A = constStars[d.a].s.position;
    if (d.b !== undefined) return out.copy(A).lerp(constStars[d.b].s.position, d.t);
    return out.set(A.x + d.dx, A.y + d.dy, A.z);
  };
  // Linien als schmale Bänder (echte GL-Linien sind überall nur 1 Pixel dünn)
  const W = 0.2;
  const linePos = new Float32Array(links.length * 4 * 3);
  const idx = [];
  links.forEach((_, k) => { const o = k * 4; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  lineGeo.setIndex(idx);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const constLines = new THREE.Mesh(lineGeo, lineMat);
  constLines.frustumCulled = false;
  constLines.visible = false;
  scene.add(constLines);
  const constellation = new THREE.Vector3(0, 9, CONST_Z); // Mittelpunkt (für das Fernrohr der Sternwarte)

  // Imbiss-Schild über der Markise
  const snack = solidSign(t('town.snack'), { style: 'snack', w: 2.1, W: 320, both: true }); // von der Wiese sieht man die Rückseite
  snack.position.set(0, 23.4 * U + snack.userData.h / 2, -4.0 * U + 0.04); // auf zwei Stützen über der Markise
  stand.add(snack);

  // Leuchtturm: drehender Lichtkegel + Schein
  const lampY = 45 * U * 1.15;
  const beamGeo = new THREE.ConeGeometry(1.4, 9, 20, 1, true);
  beamGeo.translate(0, -4.5, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff1b8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const beam = new THREE.Group();
  beam.position.y = lampY;
  for (const s of [1, -1]) { const b = new THREE.Mesh(beamGeo, beamMat); b.rotation.y = s > 0 ? 0 : Math.PI; beam.add(b); }
  tower.add(beam);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,240,170,0.9)', 'rgba(255,220,120,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.position.y = lampY;
  halo.scale.set(3, 3, 1);
  tower.add(halo);

  // Wegweiser mit drei Pfeilen
  {
    const [x, z] = polar(-95.5, 29.4);
    const post = vox([[0, 0, 0, 1.6, 22, 1.6, 0x9a6a3c], [0, 22, 0, 2.4, 1, 2.4, 0x8a5527]], U).geo;
    const g = new THREE.Group();
    const pm = new THREE.Mesh(post, mat); pm.castShadow = true; g.add(pm);
    const boards = [
      [t('town.reef'), 1, '#5aa9e6', 19, 0.25],
      [t('town.lane'), -1, '#f28aa8', 15, -0.35],
      [t('town.chest'), 1, '#c98f55', 11, 0.9],
    ];
    for (const [text, dir, color, y, yaw] of boards) {
      const b = solidSign(text, { style: 'wood', tipColor: color, arrow: dir, w: 1.3, W: 300, H: 74 });
      b.position.set(dir * 0.55, y * U, 0.8 * U + 0.04); // Rückseite liegt am Pfosten an
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      pivot.add(b);
      g.add(pivot);
    }
    g.position.set(x, heightAt(x, z) - 0.05, z);
    g.rotation.y = Math.atan2(-x, -z);
    scene.add(g);
    obstacles.push({ x, z, r: 0.6 });
  }

  // Blasen: Strohhalm-Schornstein, Teekannen-Tülle, Brunnen
  scene.updateMatrixWorld(true);
  const vents = [
    can.localToWorld(new THREE.Vector3(0.4 * U, 47 * U, -4 * U)),
    teapot.localToWorld(new THREE.Vector3(22 * U, 18.5 * U, 0)),
    fountainG.localToWorld(new THREE.Vector3(0, 9 * U, 0)),
  ];

  updaters.push((dt, time) => {
    const night = env.night || 0;
    glowMat.color.copy(hdr(0xffffff, 0.75 + night * 1.6));
    beam.rotation.y = time * 0.6;
    beamMat.opacity = 0.05 + night * 0.18;
    halo.material.opacity = 0.45 + night * 0.5;
    halo.scale.setScalar(2.4 + night * 1.6 + Math.sin(time * 2) * 0.15);
    for (const f of floaters) {
      f.s.position.y = f.y + Math.sin(time * 0.5 + f.ph) * f.amp;
      f.s.material.rotation += f.spin * dt;
      if (camera) f.s.visible = f.s.position.distanceToSquared(camera.position) > 81; // nicht riesig vor der Kamera
    }
    // Sternbild-Linien nur nachts, weich ein-/ausblenden; sie folgen den schaukelnden Sternen
    const o = Math.min(1, Math.max(0, (night - 0.35) / 0.4));
    lineMat.opacity += (o * 0.8 - lineMat.opacity) * Math.min(1, dt * 2);
    constLines.visible = lineMat.opacity > 0.01;
    if (constLines.visible) {
      links.forEach(([i, j], k) => {
        pt(i, P0); pt(j, P1);
        perp.set(-(P1.y - P0.y), P1.x - P0.x, 0).normalize().multiplyScalar(W / 2);
        const o = k * 12;
        linePos[o] = P0.x + perp.x; linePos[o + 1] = P0.y + perp.y; linePos[o + 2] = P0.z;
        linePos[o + 3] = P0.x - perp.x; linePos[o + 4] = P0.y - perp.y; linePos[o + 5] = P0.z;
        linePos[o + 6] = P1.x + perp.x; linePos[o + 7] = P1.y + perp.y; linePos[o + 8] = P1.z;
        linePos[o + 9] = P1.x - perp.x; linePos[o + 10] = P1.y - perp.y; linePos[o + 11] = P1.z;
      });
      lineGeo.attributes.position.needsUpdate = true;
    }
  });
  return { update: (dt, time) => { for (const u of updaters) u(dt, time); }, vents, mat, glowMat, constellation, boardMesh, drawBoard, mailboxes };
}
