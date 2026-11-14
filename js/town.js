/* =========================================================
   Krabbenstadt: kleine Comic-Häuschen am hinteren Inselrand
   (Dosenhaus, Muschelturm, Flaschen-Leuchtturm, Algen-Imbiss,
   Wegweiser, Wimpelkette). Fenster leuchten nachts.
   ========================================================= */
import * as THREE from 'three';
import { vox, hdr, mergeAll, range, pick, radialTexture } from './util.js';
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
function drawBoard(text, { color = '#c98f55', ink = '#fff3dc', arrow = 0, W = 300, H = 74 } = {}) {
  return sticker(W, H, (ctx) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    const tip = arrow ? 34 : 0;
    const x0 = arrow < 0 ? tip : 0, x1 = arrow > 0 ? W - tip : W;
    ctx.moveTo(x0, 0); ctx.lineTo(x1, 0);
    if (arrow > 0) ctx.lineTo(W, H / 2);
    ctx.lineTo(x1, H); ctx.lineTo(x0, H);
    if (arrow < 0) ctx.lineTo(0, H / 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x0 + 6, H * 0.33, x1 - x0 - 12, 3);
    ctx.fillRect(x0 + 6, H * 0.66, x1 - x0 - 12, 3);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = 40;
    do { ctx.font = `900 ${size}px Nunito, system-ui, sans-serif`; size--; } while (ctx.measureText(text).width > x1 - x0 - 24 && size > 12);
    ctx.fillText(text, (x0 + x1) / 2, H / 2 + 2);
  }, { outline: 6, thick: 3 });
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
  const s = Math.round(r * 0.83);
  return [
    [0, y, 0, r * 2, h, s * 2, color], [0, y, 0, s * 2, h, r * 2, color],
  ];
}

function canHouse() {
  const p = [];
  // Dose: Metallboden, bunte Banderole, Metalldeckel
  p.push(...ring(0, 3, 12, 0xb9c3cc));
  p.push(...ring(3, 22, 12.2, 0xe2574c));
  p.push(...ring(10, 7, 12.4, 0xfff1d6));         // helles Etikett-Band
  p.push(...ring(12.5, 2, 12.6, 0x2fae8f));       // Streifen im Etikett
  p.push(...ring(25, 2, 12, 0xb9c3cc));
  p.push(...ring(27, 1, 10.5, 0xd5dde4));
  // Ringlasche auf dem Deckel
  p.push([3, 28, 2, 6, 0.8, 4, 0x9aa6b1], [3, 28, -1.5, 3, 0.8, 1.5, 0xd5dde4]);
  // Tür + Fenster vorne (z+)
  p.push([0, 3, 12.6, 7, 11, 1.2, 0x3b5b8c], [2.2, 8, 13.3, 1, 1, 0.4, 0xffc93c]);
  p.push([-6.5, 16.5, 12.9, 3.6, 3.6, 0.8, WINDOW, true], [6.5, 16.5, 12.9, 3.6, 3.6, 0.8, WINDOW, true]);
  p.push([-6.5, 15.9, 12.5, 4.8, 4.8, 0.6, 0x8a5527], [6.5, 15.9, 12.5, 4.8, 4.8, 0.6, 0x8a5527]);
  p.push([0, 19.5, 12.7, 3.6, 3.6, 0.8, WINDOW, true]);
  // Stufe
  p.push([0, 0, 14, 9, 1.5, 3, 0xc7b08a]);
  return p;
}

/** Biegsamer Strohhalm als Schornstein (rot-weiß). */
function strawGeo() {
  const parts = [];
  for (let i = 0; i < 8; i++) parts.push([-6, 27 + i * 2, -4, 2.4, 2, 2.4, i % 2 ? 0xffffff : 0xe2574c]);
  for (let i = 0; i < 4; i++) parts.push([-6 + (i + 1) * 1.6, 43 + i * 0.9, -4, 2.4, 2, 2.4, i % 2 ? 0xffffff : 0xe2574c]);
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

function bottleLighthouse() {
  const p = [];
  const glass = 0x3fae7a, glassD = 0x2e8c60;
  p.push(...ring(0, 26, 7, glass));
  p.push(...ring(8, 9, 7.3, 0xfff1d6));            // Etikett
  p.push([0, 10.5, 7.2, 8, 4, 0.6, 0xe2574c]);    // Stern-Logo angedeutet
  p.push(...ring(26, 3, 5.6, glass));
  p.push(...ring(29, 3, 4, glassD));
  p.push([0, 32, 0, 5, 9, 5, glass]);             // Flaschenhals
  p.push([0, 41, 0, 6.4, 1.5, 6.4, 0xc49a6c]);    // Korken-Kragen
  p.push([0, 42.5, 0, 6, 5, 6, 0xfff3b0, true]);  // Laternenraum (leuchtet)
  p.push([0, 47.5, 0, 7.4, 1.4, 7.4, 0xe2574c], [0, 48.9, 0, 4.4, 2, 4.4, 0xe2574c], [0, 50.9, 0, 1.4, 2, 1.4, 0xe2574c]);
  // Tür + Bullaugen
  p.push([0, 0, 7.4, 5, 8, 1.2, 0x204a3a]);
  p.push([0, 19, 7.4, 3, 3, 0.8, WINDOW, true]);
  return p;
}

function snackStand() {
  const p = [];
  // Theke
  p.push([0, 0, 0, 22, 9, 10, 0xffd166], [0, 9, 0.5, 23, 1.2, 11, 0xf4a259]);
  p.push([0, 2, 5.1, 18, 4, 0.4, 0xffffff]);
  for (let i = -8; i <= 8; i += 4) p.push([i, 2.6, 5.4, 2, 2.8, 0.3, 0x2fae8f]);
  // Pfosten
  for (const x of [-10, 10]) p.push([x, 10, 4, 1.4, 10, 1.4, 0xb5763d], [x, 10, -4, 1.4, 12, 1.4, 0xb5763d]);
  // Markise: rot-weiße Streifen, leicht schräg (zwei Stufen)
  for (let i = 0; i < 6; i++) {
    const c = i % 2 ? 0xffffff : 0xe2574c;
    p.push([-10 + i * 4 + 2 - 2, 20, 1.5, 4, 1.4, 6, c], [-10 + i * 4 + 2 - 2, 19.2, 5.8, 4, 1.2, 3, c]);
  }
  // Algen-Spieße auf der Theke
  for (const x of [-6, -2, 2]) p.push([x, 10.2, 1, 0.6, 4, 0.6, 0xb5763d], [x, 12.5, 1, 2, 2.6, 2, 0x7cb342]);
  // Becher
  p.push([6, 10.2, 1, 2.6, 3.4, 2.6, 0x9fd8ff], [6, 13.6, 1, 0.5, 2.5, 0.5, 0xe2574c]);
  // Lampe unter der Markise
  p.push([0, 17.2, 2, 2, 1.6, 2, WINDOW, true]);
  return p;
}

/** Alter Wanderstiefel als Haus: Spitze zeigt zur Mitte. */
function bootHouse() {
  const p = [];
  const leather = 0x9a5f3a, dark = 0x6e3f24, sole = 0x3a2a20;
  p.push([0, 0, 2, 16, 2.5, 26, sole]);                 // Sohle
  p.push([0, 2.5, 3, 15, 10, 23, leather]);             // Fuß
  p.push([0, 2.5, 13.5, 13, 7, 3, leather]);            // runde Spitze
  p.push([0, 12.5, -3, 15, 18, 11, leather]);           // Schaft
  p.push([0, 30.5, -3, 16, 2, 12, dark]);               // Kragen
  for (let i = 0; i < 4; i++) p.push([0, 14 + i * 4, 2.7, 9 - (i % 2) * 2, 1, 0.6, 0xfff1d6]); // Schnürsenkel
  p.push([0, 2.5, 15.2, 6, 7, 1, 0x3b2a1e], [1.6, 5.5, 15.9, 0.8, 0.8, 0.4, 0xffc93c]);       // Tür in der Spitze
  p.push([-7.7, 6, 4, 0.8, 3.5, 3.5, WINDOW, true], [7.7, 6, 4, 0.8, 3.5, 3.5, WINDOW, true]); // Seitenfenster
  p.push([0, 20, 2.6, 4, 3.5, 0.8, WINDOW, true]);
  // Pflanzen wachsen oben aus dem Schaft
  p.push([-3, 32, -3, 3, 4, 3, 0x7cb342], [2.5, 32, -1, 2.5, 6, 2.5, 0x43a047], [0, 32, -6, 2, 3, 2, 0xa5c94a], [2.5, 38, -1, 1.6, 1.6, 1.6, 0xff6f91]);
  return p;
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

/** Sardinendose als Wohnwagen, Deckel halb aufgerollt. */
function sardineTrailer() {
  const p = [];
  const tin = 0xc4ced8, tinD = 0x9aa6b1;
  p.push([0, 2.5, 0, 30, 9, 14, tin]);
  p.push([0, 6, 7.05, 26, 3, 0.4, 0x5aa9e6]);            // blaues Band
  p.push([-9, 6.3, 7.3, 4, 2, 0.4, 0xffd166], [-4, 6.3, 7.3, 4, 2, 0.4, 0xffd166], [1, 6.3, 7.3, 4, 2, 0.4, 0xffd166]); // Fischchen
  // aufgerollter Deckel hinten oben
  p.push([11, 11.5, 0, 6, 3, 15, tinD], [11, 14.5, 0, 4, 2, 15, tin], [7, 11.5, 0, 3, 1, 14.4, tinD]);
  // Tür, Fenster
  p.push([6, 2.5, 7.1, 5, 7.5, 0.8, 0x2f5d8a]);
  p.push([-6, 9, 7.1, 3.4, 2.4, 0.6, WINDOW, true], [-12, 9, 7.1, 3.4, 2.4, 0.6, WINDOW, true]);
  // Muschel-Räder + Deichsel
  for (const x of [-9, 9]) for (const z of [-7.4, 7.4]) p.push([x, 0, z, 5, 5, 1, 0xf7a1c4]);
  p.push([-17, 1.5, 0, 6, 1, 1.2, tinD]);
  p.push([0, 0, 10.5, 6, 0.8, 3, 0xe9d6b0]);
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
    p.push([x, y + h - 1, z + d / 2 + 0.1, w, 1, 0.4, plank], [x, y, z + d / 2 + 0.1, w, 1, 0.4, plank]);
    p.push([x - w / 2 + 0.6, y, z + d / 2 + 0.1, 1.2, h, 0.4, plank], [x + w / 2 - 0.6, y, z + d / 2 + 0.1, 1.2, h, 0.4, plank]);
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

/** Laden in einem großen Einmachglas, innen bunte Bonbons. */
function jarShop() {
  const p = [];
  const glass = 0xbfe9f2;
  p.push(...ring(0, 2, 9, 0x9fd3e0));
  p.push(...ring(2, 18, 10, glass));
  p.push(...ring(20, 2, 8, glass));
  p.push(...ring(22, 3, 8.6, 0xffc93c));                // Deckel
  p.push([0, 25, 0, 5, 1.2, 5, 0xffd166]);
  // Bonbons hinter dem Schaufenster (leuchten)
  p.push([0, 6, 10.2, 12, 9, 0.6, 0x8fd3f4]);
  for (const [x, y, c] of [[-4, 8, 0xff6f91], [0, 9.5, 0xffd166], [4, 8, 0x7cb342], [-2, 12, 0xb07ef0], [3, 12.5, 0xff9f45]]) p.push([x, y, 10.5, 2.4, 2.4, 0.6, c, true]);
  p.push([7, 2, 9.6, 4, 7, 0.8, 0x2f5d8a]);
  p.push([0, 0, 12, 9, 1, 3, 0xe9d6b0]);
  return p;
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
export function buildTown(scene, rng, { heightAt, obstacles, env, camera }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: 0x140d06 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: hdr(0xffffff, 0.9) });
  const updaters = [];

  /** Haus an (x, z) setzen, Front zeigt zur Inselmitte. */
  function place(parts, x, z, r, { scale = 1, turn = 0, extra = [] } = {}) {
    const { geo, glow } = vox([...parts, ...extra], U * scale);
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (glow) g.add(new THREE.Mesh(glow, glowMat));
    g.position.set(x, heightAt(x, z) - 0.08, z);
    g.rotation.y = Math.atan2(-x, -z) + turn;
    scene.add(g);
    obstacles.push({ x, z, r: r * scale });
    return g;
  }

  const polar = (deg, r) => [Math.cos(deg * Math.PI / 180) * r, Math.sin(deg * Math.PI / 180) * r];
  const at = (deg, r, parts, rad, o = {}) => { const [x, z] = polar(deg, r); return place(parts, x, z, rad, o); };

  /* --- Stadtkern: die „Muschelgasse“ im Bogen hinter der Krabbenwiese --- */
  // äußere Reihe (größere Häuser, Front zur Gasse = zur Inselmitte)
  const can = at(-122, 35.4, canHouse(), 1.8, { extra: strawGeo() });
  at(-112, 35.6, shellTower(), 1.9);
  const hall = at(-101.5, 35.8, clockTower(), 2.2);
  at(-91, 35.6, crateHouse(), 2.0);
  const shop = at(-81.5, 35.2, jarShop(), 1.7);
  // innere Reihe (kleine Buden, Front zur Gasse = nach außen)
  const stand = at(-117, 29.9, snackStand(), 1.6, { turn: Math.PI });
  const fountainG = at(-101.5, 30.4, fountain(), 1.5);
  const post = at(-87, 30.0, postBooth(), 1.3, { turn: Math.PI });

  // Schilder an Rathaus, Laden, Post
  const signOn = (g, key, color, y, z, w = 1.9) => {
    const b = boardMesh(drawBoard(t(key), { color, W: 300, H: 70 }), w);
    b.position.set(0, y * U, z * U);
    g.add(b);
  };
  signOn(hall, 'town.hall', '#2f6f8f', 27, 9.4);
  signOn(shop, 'town.shop', '#e2574c', 26.5, 0, 1.6);
  signOn(post, 'town.post', '#ffb703', 15.5, 4.2, 1.2);

  // Gasse: heller Pflasterweg mit einzelnen Steinen
  {
    const street = new THREE.RingGeometry(31.4, 33.8, 64, 1, (78 * Math.PI) / 180, (48 * Math.PI) / 180);
    street.rotateX(-Math.PI / 2);
    street.translate(0, 0.02, 0);
    const sm = new THREE.Mesh(street, new THREE.MeshStandardMaterial({ color: 0xbfb6aa, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    sm.receiveShadow = true;
    scene.add(sm);
    const cobbles = [];
    for (let i = 0; i < 150; i++) {
      const [x, z] = polar(range(rng, -125, -79), range(rng, 31.6, 33.6));
      const g = new THREE.CylinderGeometry(range(rng, 0.2, 0.34), 0.34, 0.08, 6);
      g.rotateY(rng() * 3);
      g.translate(x, 0.05, z);
      cobbles.push(paintGeo(g, pick(rng, [0xe6ddd0, 0xd7cdbf, 0xa59c90])));
    }
    const cm = new THREE.Mesh(mergeAll(cobbles), mat);
    cm.receiveShadow = true;
    scene.add(cm);
  }

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

  /* --- abgelegene Häuser, weit verstreut auf der Insel --- */
  const tower = place(bottleLighthouse(), 22, -24, 1.2, { scale: 1.15 });
  const teapot = place(teapotHouse(), 31, -14.5, 1.9, { turn: -0.25 });
  place(sardineTrailer(), -32, -6, 2.0, { turn: 1.2 });
  place(bootHouse(), -31, 15, 1.7, { turn: -0.2 });
  for (const [x, z, c] of [[28.6, -12.4, 0xf28aa8], [-29.4, -4.6, 0x2fae8f], [-28.6, 13.4, 0xe2574c]]) {
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
  const snack = boardMesh(drawBoard(t('town.snack'), { color: '#2fae8f', W: 320, H: 70 }), 2.1);
  snack.position.set(0, 23.5 * U, 1.5 * U);
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
      const b = boardMesh(drawBoard(text, { color, arrow: dir }), 1.3);
      b.position.set(dir * 0.55, y * U, 0);
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
    snack.rotation.z = Math.sin(time * 1.3) * 0.04;
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
  return { update: (dt, time) => { for (const u of updaters) u(dt, time); }, vents, mat, glowMat, constellation, boardMesh, drawBoard };
}
