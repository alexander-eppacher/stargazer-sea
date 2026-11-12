import * as THREE from 'three';
import { mulberry32, hashString, range, pick, radialTexture, hdr } from './util.js';
import { shared } from './shaders.js';
import { sticker, toTexture, stickerGeometry, canvas, css } from './paper.js';
import { decodeVariant, SHELLS, editionTip } from './variants.js';
import { cutMat, depthMat, WORLD } from './ocean.js';
import { buildHat } from './hats.js';

/* Maße in "Pixeln" (siehe Vorlage) */
export const U = 0.11;
const P = 14; // Canvas-Pixel pro Krabben-Pixel
const LEG_H = 3, BODY_W = 12, BODY_H = 6;
const TOP = LEG_H + BODY_H;
const ORANGE = '#de7856', ORANGE_D = '#c8663f', ORANGE_DD = '#a24f30';
const CLAW_W = 4.2, CLAW_H = 3.6;

/* ---------- geteilte Ressourcen ---------- */
const R = {};
function res() {
  if (R.ready) return R;
  R.ready = true;
  const mk = (stk, glow = 0.3) => {
    const t = toTexture(stk.canvas);
    return { stk, t, mat: cutMat(t, 0, 1, glow), depth: depthMat(t) };
  };
  R.mk = mk;
  R.skins = new Map();
  R.bodies = new Map();
  const base = skin(0); // Standard-Orange (liefert auch die Maße für die Geometrie)

  // Gesichter: gleiche Fläche wie der Körper, ohne Rand
  const face = (draw) => {
    const stk = sticker(BODY_W * P, BODY_H * P, (ctx) => { ctx.fillStyle = '#111'; ctx.strokeStyle = '#111'; draw(ctx); }, { outline: 0, thick: 0, grainK: 0 });
    const t = toTexture(stk.canvas);
    return { stk, t, mat: new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }) };
  };
  const rect = (ctx, x, y, w, h) => ctx.fillRect(x * P, y * P, w * P, h * P);
  const square = (ctx) => { rect(ctx, 2.3, 1.3, 1.3, 1.5); rect(ctx, 8.4, 1.3, 1.3, 1.5); };
  const arrows = (ctx, left = true, right = true) => {
    ctx.lineWidth = 0.55 * P; ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
    if (left) { ctx.beginPath(); ctx.moveTo(2.0 * P, 1.1 * P); ctx.lineTo(3.7 * P, 2.05 * P); ctx.lineTo(2.0 * P, 3.0 * P); ctx.stroke(); }
    if (right) { ctx.beginPath(); ctx.moveTo(10.0 * P, 1.1 * P); ctx.lineTo(8.3 * P, 2.05 * P); ctx.lineTo(10.0 * P, 3.0 * P); ctx.stroke(); }
  };
  const smile = (ctx) => { rect(ctx, 5.0, 3.55, 0.45, 0.45); rect(ctx, 5.4, 4.0, 1.2, 0.45); rect(ctx, 6.55, 3.55, 0.45, 0.45); };
  const heart = (ctx, cx, cy) => {
    const g = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
    const c = 0.28;
    ctx.fillStyle = '#ff4f7b';
    g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') rect(ctx, cx - 3.5 * c + i * c, cy - 3 * c + j * c, c + 0.01, c + 0.01); }));
    ctx.fillStyle = '#ffd0dc';
    rect(ctx, cx - 2.5 * c, cy - 2 * c, c, c);
    ctx.fillStyle = '#111';
  };
  R.faces = {
    open: face(square),
    blink: face((ctx) => { rect(ctx, 2.1, 2.1, 1.7, 0.4); rect(ctx, 8.2, 2.1, 1.7, 0.4); }),
    happy: face((ctx) => arrows(ctx)),
    smile: face((ctx) => { square(ctx); smile(ctx); }),
    wink: face((ctx) => { rect(ctx, 2.3, 1.3, 1.3, 1.5); arrows(ctx, false, true); smile(ctx); }),
    surprised: face((ctx) => {
      rect(ctx, 2.1, 0.9, 1.7, 2.0); rect(ctx, 8.2, 0.9, 1.7, 2.0);
      ctx.fillStyle = '#fff'; rect(ctx, 2.3, 1.1, 0.5, 0.5); rect(ctx, 8.4, 1.1, 0.5, 0.5); ctx.fillStyle = '#111';
      rect(ctx, 5.4, 3.3, 1.2, 0.35); rect(ctx, 5.4, 4.3, 1.2, 0.35); rect(ctx, 5.25, 3.5, 0.35, 0.95); rect(ctx, 6.4, 3.5, 0.35, 0.95);
    }),
    sleepy: face((ctx) => {
      ctx.lineWidth = 0.42 * P; ctx.lineCap = 'square';
      for (const x of [2.95, 9.05]) { ctx.beginPath(); ctx.arc(x * P, 1.9 * P, 0.75 * P, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
      rect(ctx, 5.6, 3.9, 0.8, 0.35);
    }),
    love: face((ctx) => { heart(ctx, 2.95, 2.05); heart(ctx, 9.05, 2.05); smile(ctx); }),
    blow: face((ctx) => { square(ctx); rect(ctx, 5.55, 3.5, 0.9, 0.9); }),
    chomp: face((ctx) => { square(ctx); rect(ctx, 5.3, 3.8, 1.4, 0.35); }),
  };

  R.bodyGeo = stickerGeometry(body(0, 0, 0).stk, BODY_W * U).translate(0, LEG_H * U, 0);
  R.faceGeo = stickerGeometry(R.faces.open.stk, BODY_W * U).translate(0, LEG_H * U, 0.012);
  R.clawGeo = stickerGeometry(base.clawClosed.stk, CLAW_W * U, 'center').translate((CLAW_W / 2 - 0.3) * U, 0, 0);
  R.legGeo = stickerGeometry(base.leg.stk, 1 * U);

  R.shadowMat = new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(20,40,60,0.35)', 'rgba(20,40,60,0)'),
    transparent: true, depthWrite: false,
  });
  R.shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  R.ringGeo = new THREE.RingGeometry(1.05, 1.25, 40).rotateX(-Math.PI / 2);
  R.glowTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  R.hit = new THREE.BoxGeometry(BODY_W * U * 1.5, TOP * U * 1.3, 0.6).translate(0, (TOP / 2) * U, 0);
  R.hitMat = new THREE.MeshBasicMaterial({ visible: false });

  // Funkel-Partikel für legendär & mythisch
  const n = 18, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  const rr = mulberry32(7);
  for (let i = 0; i < n; i++) { pos.set([range(rr, -1, 1), range(rr, 0, 1), range(rr, -1, 1)], i * 3); ph[i] = rr() * 10; }
  R.sparkGeo = new THREE.BufferGeometry();
  R.sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  R.sparkGeo.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  R.sparkMats = {};
  R.pointScale = { value: 400 };

  // "z z Z" und Herz als kleine Sprites
  R.zzzTex = spriteTex(160, 90, (ctx) => {
    ctx.font = '800 38px Nunito, system-ui, sans-serif';
    ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#3b6fd8';
    [['z', 18, 78, 30], ['z', 60, 56, 38], ['Z', 104, 36, 50]].forEach(([ch, x, y, sz]) => {
      ctx.font = `800 ${sz}px Nunito, system-ui, sans-serif`;
      ctx.strokeText(ch, x, y); ctx.fillText(ch, x, y);
    });
  });
  R.heartTex = spriteTex(80, 72, (ctx) => {
    const g = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
    const c = 9, ox = 8, oy = 8;
    ctx.fillStyle = '#fff';
    g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') ctx.fillRect(ox + i * c - 5, oy + j * c - 5, c + 10, c + 10); }));
    ctx.fillStyle = '#ff4f7b';
    g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') ctx.fillRect(ox + i * c, oy + j * c, c, c); }));
  });

  // Lichtkegel für die Krabbe des Tages
  R.beamGeo = new THREE.CylinderGeometry(0.5, 1.5, 9, 24, 1, true).translate(0, 4.5, 0);
  R.beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vF;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vF = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying float vF;
      void main() {
        float a = smoothstep(0.0, 0.12, vUv.y) * (0.35 + 0.65 * (1.0 - vUv.y)) * pow(vF, 1.6);
        a *= 0.85 + 0.15 * sin(uTime * 2.0 + vUv.y * 8.0);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.45) * a * 0.55, 1.0);
      }`,
  });
  return R;
}

/* ---------- Haut je Schalenfarbe (Scheren & Beine), ab 2. Auflage mit farbigen Scherenspitzen ---------- */
function skin(shell, edition = 1) {
  const key = `${shell}|${edition}`;
  if (R.skins.has(key)) return R.skins.get(key);
  const tip = editionTip(edition);
  const C = SHELLS[shell].color, D = css(C, -0.1), DD = css(C, -0.28);
  const leg = R.mk(sticker(1 * P, 3.4 * P, (ctx, w, h) => {
    ctx.fillStyle = C; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = D; ctx.fillRect(0, h - P * 0.4, w, P * 0.4);
  }, { outline: 6, thick: 3 }));
  // Scheren (offen / zu) – gleiche Größe, damit nur das Material getauscht wird
  const claw = (open) => R.mk(sticker(CLAW_W * P, CLAW_H * P, (ctx) => {
    const r = (x, y, w, h, c = C) => { ctx.fillStyle = c; ctx.fillRect(x * P, y * P, w * P, h * P); };
    r(0, 1.3, 1.4, 1.1);                 // Arm
    r(1.0, 0.7, 1.9, 2.4);               // Handballen
    r(1.0, 2.75, 1.9, 0.35, D);
    if (open) {
      r(2.6, 0.0, 1.6, 1.15);            // oberer Finger hoch
      r(3.6, 1.15, 0.6, 0.3);            // Spitze nach innen
      r(2.6, 2.3, 1.3, 1.2);             // unterer Finger runter
      r(3.3, 2.0, 0.6, 0.3);
      r(2.6, 3.2, 1.3, 0.3, D);
    } else {
      r(2.6, 0.45, 1.6, 1.25);
      r(2.6, 1.9, 1.4, 1.2);
      r(2.5, 1.7, 1.7, 0.22, DD);        // Spalt
      r(2.6, 2.85, 1.4, 0.25, D);
    }
    if (tip) { // Auflage erkennbar: Spitzen einfärben (nur dort, wo schon Schere ist)
      ctx.globalCompositeOperation = 'source-atop';
      r(3.35, 0, 1.0, CLAW_H, tip);
      r(3.22, 0, 0.16, CLAW_H, 'rgba(40,28,30,0.55)'); // feine Trennlinie, damit auch helle Spitzen auffallen
      ctx.globalCompositeOperation = 'source-over';
    }
  }, { outline: 7, thick: 3 }));
  const sk = { leg, clawClosed: claw(false), clawOpen: claw(true) };
  R.skins.set(key, sk);
  return sk;
}

/* ---------- Körper je Sorte: Schalenfarbe + Muster (Farbe aus dem Farbton) ---------- */
function body(shell, pattern, hue) {
  const key = `${shell}|${pattern}|${hue}`;
  if (R.bodies.has(key)) return R.bodies.get(key);
  const C = SHELLS[shell].color, D = css(C, -0.1);
  const h0 = (hue * 36 + 32) % 360;
  const light = `hsl(${h0} 85% 80%)`, dark = `hsl(${h0} 60% 36%)`;
  const b = R.mk(sticker(BODY_W * P, BODY_H * P, (ctx, w, h) => {
    const r = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x * P, y * P, ww * P, hh * P); };
    ctx.fillStyle = C; ctx.fillRect(0, 0, w, h);
    if (pattern === 1) { // Punkte (am Rand, die Augen bleiben frei)
      for (const [x, y] of [[0.5, 0.5], [10.7, 0.6], [0.6, 4.2], [10.6, 4.0], [5.5, 0.3], [3.6, 4.6], [7.6, 4.7], [1.6, 2.6], [9.8, 2.4]]) r(x, y, 0.8, 0.8, light);
    } else if (pattern === 2) { // Streifen
      r(0, 0.25, 12, 0.55, dark); r(0, 4.6, 12, 0.5, dark);
    } else if (pattern === 3) { // Sommersprossen unter den Augen
      for (const [x, y] of [[2.0, 3.2], [3.0, 3.6], [3.8, 3.1], [8.3, 3.1], [9.1, 3.6], [10.0, 3.2]]) r(x, y, 0.42, 0.42, dark);
    } else if (pattern === 4) { // Bauchfleck
      ctx.fillStyle = light; ctx.beginPath(); ctx.roundRect(3.4 * P, 4.0 * P, 5.2 * P, 1.6 * P, [0.8 * P, 0.8 * P, 0, 0]); ctx.fill();
    }
    ctx.fillStyle = D; ctx.fillRect(0, h - P * 0.5, w, P * 0.5);
  }, { outline: 9, thick: 4 }));
  R.bodies.set(key, b);
  return b;
}

function spriteTex(w, h, draw) {
  const [c, ctx] = canvas(w, h);
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sparkMaterial(color, rainbow) {
  const key = color + (rainbow ? 'r' : '');
  if (R.sparkMats[key]) return R.sparkMats[key];
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color(color) }, uScale: R.pointScale },
    vertexShader: /* glsl */ `
      attribute float aPh;
      uniform float uTime; uniform float uScale;
      varying float vA; varying float vPh;
      void main() {
        float life = fract(uTime * 0.6 + aPh);
        float ang = aPh * 6.0 + uTime * 0.8;
        vec3 p = vec3(cos(ang) * (0.8 + position.x * 0.3), 0.2 + life * 1.8, sin(ang) * (0.8 + position.z * 0.3));
        vA = sin(life * 3.14159);
        vPh = aPh;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.1 + 0.08 * vA) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime;
      varying float vA; varying float vPh;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float star = abs(c.x) * abs(c.y) * 60.0 + length(c) * 1.2;
        if (star > 0.75 || vA < 0.05) discard;
        vec3 col = uColor;
        ${rainbow ? 'col = 0.6 + 0.4 * cos(6.2831 * (uTime * 0.15 + vPh + vec3(0.0, 0.33, 0.67)));' : ''}
        if (star > 0.55) col = vec3(1.0);
        gl_FragColor = vec4(col * 1.3, vA);
      }`,
  });
  R.sparkMats[key] = m;
  return m;
}

/* ---------- Namensschild ---------- */
const LABEL_H = 0.026;
/** opts: special (Krabbe des Tages), mine (meine Krabbe), founder (Gründer), example (Beispiel-Krabbe) */
function makeLabel(login, color, opts = {}) {
  const { special = false, mine = false, founder = false, example = false } = opts;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '800 40px Nunito, system-ui, sans-serif';
  ctx.font = font;
  const tw = Math.ceil(ctx.measureText(login).width);
  const pad = 22, gem = special || mine ? 30 : 22, flag = founder ? 40 : 0;
  c.width = tw + pad * 2 + gem + 10 + flag;
  c.height = 64;
  ctx.font = font;
  ctx.fillStyle = special ? '#fff7d6' : mine ? '#fff0f5' : example ? '#eef1f5' : '#ffffff';
  ctx.strokeStyle = special ? '#f5b316' : mine ? '#ff5d8f' : color;
  ctx.lineWidth = special || mine ? 7 : 5;
  ctx.beginPath();
  ctx.roundRect(4, 4, c.width - 8, c.height - 8, 30);
  ctx.fill();
  ctx.stroke();
  if (founder) { // kleines Gründer-Fähnchen rechts
    const fx = c.width - pad - 26;
    ctx.fillStyle = '#7a5a3a'; ctx.fillRect(fx, 14, 4, 38);
    ctx.fillStyle = '#e8484f';
    ctx.beginPath(); ctx.moveTo(fx + 4, 14); ctx.lineTo(fx + 28, 22); ctx.lineTo(fx + 4, 31); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(fx + 12, 22, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(pad + gem / 2, c.height / 2);
  if (mine && !special) { // Herz: das bin ich
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.bezierCurveTo(-18, -2, -10, -16, 0, -6);
    ctx.bezierCurveTo(10, -16, 18, -2, 0, 12);
    ctx.fill();
  } else if (special) {
    ctx.fillStyle = '#f5b316';
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 6 : 15;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.fill();
  } else {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.fillRect(-7, -7, 14, 14);
  }
  ctx.restore();
  ctx.fillStyle = example ? '#7d8796' : '#23324a';
  ctx.textBaseline = 'middle';
  ctx.fillText(login, pad + gem + 10, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false, color: 0xf0f0f0, opacity: 0 });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(LABEL_H * (c.width / c.height), LABEL_H, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 20;
  sprite.visible = false;
  return sprite;
}

/** Aussehen aus den Daten: Sorte -> alles; versiegelt -> nur Schale/Muster/Farbton; ganz alt -> klassisch orange. */
function lookOf(tier, data) {
  if (Number.isInteger(data.variant) && data.variant > 0) {
    const look = decodeVariant(tier, data.variant);
    data.hat = look.hat;
    return look;
  }
  if (data.sealed) return { hat: 'none', shell: data.shell | 0, pattern: data.pattern | 0, hue: data.hue | 0, edition: 1, variant: null };
  return { hat: data.hat, shell: 0, pattern: 0, hue: 0, variant: null };
}

/* =========================================================
   Krabbe
   ========================================================= */
export class Crab {
  constructor(data, tier, ctx) {
    const r = res();
    this.data = data;
    this.tier = tier;
    this.ctx = ctx;
    this.rng = mulberry32(hashString(String(data.id) + data.login));
    this.seed = this.rng() * 100;
    this.look = lookOf(tier, data);
    this.skin = skin(this.look.shell, this.look.edition || 1);
    const bodyArt = body(this.look.shell, this.look.pattern, this.look.hue);

    this.root = new THREE.Group();
    this.card = new THREE.Group(); // schaut immer zur Kamera
    this.root.add(this.card);
    this.upper = new THREE.Group(); // Körper + Scheren + Gesicht + Hut (hüpft beim Laufen)
    this.card.add(this.upper);

    const piece = (geo, a, parent) => {
      const m = new THREE.Mesh(geo, a.mat);
      m.castShadow = true;
      m.customDepthMaterial = a.depth;
      parent.add(m);
      return m;
    };
    this.body = piece(r.bodyGeo, bodyArt, this.upper);
    this.face = new THREE.Mesh(r.faceGeo, r.faces.open.mat);
    this.upper.add(this.face);

    this.arms = [1, -1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * (BODY_W / 2 - 0.4) * U, (TOP - 2.6) * U, -0.006);
      pivot.scale.x = side;
      const claw = piece(r.clawGeo, this.skin.clawClosed, pivot);
      this.upper.add(pivot);
      pivot.userData.claw = claw;
      return pivot;
    });

    this.legs = [-4.5, -2.5, 2.5, 4.5].map((x) => {
      const m = piece(r.legGeo, this.skin.leg, this.card);
      m.position.set(x * U, 0, -0.008);
      return m;
    });

    // Wachstum (Baby -> ausgewachsen): Größe und ob Hut/Sorte noch eingepackt sind
    const g = ctx.growthOf?.(data) || { scale: 1, locked: false, index: 3 };
    this.growScale = g.scale;
    this.stage = g.index;
    this.locked = g.locked;
    this.growAnim = null;
    this.root.scale.setScalar(g.scale);

    this.shadow = new THREE.Mesh(r.shadowGeo, r.shadowMat);
    this.shadow.scale.set(2.0, 1, 1.0);
    this.shadow.position.y = 0.03;
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);

    this.ring = new THREE.Mesh(r.ringGeo, new THREE.MeshBasicMaterial({
      color: hdr(tier.color, 1.6), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.ring.position.y = 0.06;
    this.ring.visible = false;
    this.root.add(this.ring);

    this.hit = new THREE.Mesh(r.hit, r.hitMat);
    this.hit.userData.crab = this;
    this.card.add(this.hit);

    this.special = false;
    this.mine = false;
    this.shadowOn = true;
    this.buildHat();
    this.label = makeLabel(data.login, data.example ? '#9aa5b4' : tier.color, this.labelOpts());
    this.label.position.y = this.labelY;
    this.root.add(this.label);
    this.labelOpacity = 0;
    this.labelWanted = false;

    if (tier.id === 'legendary' || tier.id === 'mythic') {
      const sp = new THREE.Points(r.sparkGeo, sparkMaterial(tier.color, tier.id === 'mythic'));
      sp.frustumCulled = false;
      this.root.add(sp);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: r.glowTex, color: hdr(tier.color, tier.id === 'mythic' ? 0.45 : 0.3),
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      glow.scale.set(3.2, 3.2, 1);
      glow.position.set(0, 0.7, -0.3);
      this.aura = glow;
      this.root.add(glow);
    }

    // Zustand
    this.x = 0; this.z = 0;
    this.state = 'idle';
    this.timer = range(this.rng, 0.5, 3);
    this.target = null;
    this.speed = range(this.rng, 0.9, 1.5);
    this.walkPhase = 0;
    this.moving = 0;
    this.blink = range(this.rng, 1, 5);
    this.expr = null; this.exprT = 0;
    this.clawOpen = false; this.snapT = 0;
    this.hop = 0; this.hopV = 0;
    this.drop = 0; this.dropV = 0; this.dropDelay = 0;
    this.facing = this.rng() < 0.5 ? 1 : -1;
    this.flip = this.facing;
    this.selected = false;
    this.hold = false;
    this.labelBoost = 0;
    this.greetCd = range(this.rng, 4, 20);
    this.partner = null;
    this.rush = 0;
  }

  /** Die Action hat die Krabbe entsiegelt: echte Sorte übernehmen (Scherenspitzen der Auflage, Hutfarbe). */
  applyLook() {
    this.look = lookOf(this.tier, this.data);
    this.skin = skin(this.look.shell, this.look.edition || 1);
    for (const leg of this.legs) { leg.material = this.skin.leg.mat; leg.customDepthMaterial = this.skin.leg.depth; }
    this.clawOpen = null; // Scheren im nächsten Bild neu einkleiden
  }

  /** Hut aufsetzen: Babys tragen Eierschale, danach den echten Hut (oder Saison-Deko). */
  buildHat() {
    if (this.hat) {
      this.upper.remove(this.hat.group);
      this.hat.group.traverse((o) => o.geometry?.dispose());
    }
    const data = this.data;
    // Saison-Deko: Krabben ohne Hut bekommen im Dezember eine Zipfelmütze, an Halloween einen Hexenhut
    this.seasonHat = !this.locked && data.hat === 'none' && this.ctx.season ? { winter: 'santa', halloween: 'witch' }[this.ctx.season] : null;
    const id = this.locked ? 'eggshell' : this.seasonHat || data.hat;
    this.hat = buildHat(id, U, this.locked || this.seasonHat ? 0 : this.look.hue);
    this.hat.group.position.y = TOP * U;
    this.hat.group.rotation.z = this.locked ? -0.1 : 0;
    this.upper.add(this.hat.group);
    // Namensschild knapp über die echte Oberkante des Huts setzen
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const hatBox = new THREE.Box3().setFromObject(this.hat.group, true).applyMatrix4(inv);
    let hatTop = hatBox.isEmpty() ? TOP * U : Math.max(TOP * U, hatBox.max.y);
    if (id === 'halo') hatTop = Math.max(hatTop, (TOP + 6.8) * U); // Ring schwebt erst in der Animation nach oben
    this.labelY = hatTop + 0.3;
    if (this.label) this.label.position.y = this.labelY;
    // Alles, was echte Schatten wirft (für Schatten-LOD)
    this.casters = [];
    this.root.traverse((o) => { if (o.isMesh && o.castShadow) this.casters.push(o); });
    for (const m of this.casters) m.castShadow = this.shadowOn;
  }

  /**
   * Neue Wachstumsstufe. animate: kleiner Wachstums-Hüpfer mit Blasen.
   * Rückgabe: true, wenn dabei der Hut ausgepackt wurde.
   */
  setGrowth(g, animate = true) {
    const unpacked = this.locked && !g.locked;
    if (g.index === this.stage && g.locked === this.locked) return false;
    this.stage = g.index;
    if (g.locked !== this.locked) { this.locked = g.locked; this.buildHat(); }
    const from = this.root.scale.x;
    this.growScale = g.scale;
    if (animate && this.root.visible) {
      this.growAnim = { from, to: g.scale, t: 0, dur: 0.9 };
      this.hopV = 3;
      this.setExpr('surprised', 0.7);
      this.ctx.bubbles.spawn(this.x, this.root.position.y + 0.5, this.z, unpacked ? 30 : 14, 0.9, 0.05, 0.16);
    } else {
      this.growAnim = null;
      this.root.scale.setScalar(g.scale);
    }
    return unpacked;
  }

  /** Aus dem Ei schlüpfen: erscheint winzig an Ort und Stelle, ploppt auf Babygröße, hüpft und schüttelt sich. */
  hatchIn(delay = 0) {
    this.drop = 0; this.dropV = 0;
    this.dropDelay = delay;
    this.root.visible = delay <= 0;
    this.root.scale.setScalar(0.05);
    this.growAnim = { from: 0.05, to: this.growScale, t: 0, dur: 0.8 };
    this.hatching = true;
  }

  /* ---------- Hilfen ---------- */
  setExpr(name, dur) { this.expr = name; this.exprT = dur; }
  busy() { return this.drop > 0 || this.dropDelay > 0 || this.hold || !!this.growAnim || ['greet', 'surprised', 'wave'].includes(this.state); }

  place(x, z) {
    this.x = x; this.z = z;
    this.root.position.set(x, this.ctx.heightAt(x, z), z);
  }

  dropIn(height = 14, delay = 0) {
    this.drop = height;
    this.dropV = 0;
    this.dropDelay = delay;
    this.root.visible = delay <= 0;
  }

  get pickTarget() { return this.hit; }

  worldPos(out = new THREE.Vector3()) {
    return out.set(this.x, this.root.position.y + this.hop, this.z);
  }

  celebrate(dur = 2.2) {
    this.state = 'dance';
    this.timer = dur;
    this.setExpr('happy', dur);
    if (this.drop <= 0) this.hopV = 3;
  }

  wave() {
    this.state = 'wave';
    this.timer = 2.8;
    this.setExpr(this.rng() < 0.5 ? 'smile' : 'happy', 2.8);
    const p = this.worldPos();
    this.ctx.bubbles.spawn(p.x, p.y + 1, p.z, 14, 0.6, 0.06, 0.16);
  }

  /** Eine Krabbe ist in der Nähe gelandet. */
  surprise() {
    if (this.busy() || this.state === 'sleep' && this.rng() < 0.5) return;
    this.state = 'surprised';
    this.timer = range(this.rng, 0.7, 1.1);
    this.setExpr('surprised', this.timer);
    this.hopV = 2.2;
  }

  /** Zwei Krabben treffen sich: winken, tanzen oder verlieben sich. */
  greet(other, kind, dur) {
    this.state = 'greet';
    this.greetKind = kind;
    this.timer = dur;
    this.partner = other;
    this.greetCd = range(this.rng, 18, 40);
    this.setExpr(kind === 'love' ? 'love' : kind === 'dance' ? 'happy' : 'smile', dur);
    this.target = null;
    if (kind === 'love') this.showHeart(dur);
  }

  /** Platz machen, weil eine andere Krabbe angeklickt wurde: zügig zur Seite gehen. */
  makeWay(tx, tz) {
    if (this.drop > 0 || this.dropDelay > 0 || this.hold) return false;
    if (this.state === 'walk' && this.rush > 0) return false; // ist schon unterwegs
    this.state = 'walk';
    this.target = { x: tx, z: tz };
    this.timer = 8;
    this.rush = 1.7;
    this.partner = null;
    if (this.rng() < 0.6) this.setExpr(this.rng() < 0.5 ? 'surprised' : 'smile', 0.8);
    return true;
  }

  /** Kopie der Figur für das Sammelkarten-Bild (fröhlich, Scheren hoch). */
  portraitClone() {
    const save = {
      face: this.face.material, sx: this.card.scale.x, rot: this.card.rotation.clone(), up: this.upper.position.y,
      legs: this.legs.map((l) => l.position.y), arms: this.arms.map((a) => a.rotation.z),
      claws: this.arms.map((a) => a.userData.claw.material),
    };
    this.face.material = R.faces.happy.mat;
    this.card.scale.x = 1;
    this.card.rotation.set(0, 0, 0);
    this.upper.position.y = 0;
    this.legs.forEach((l) => { l.position.y = 0; });
    this.arms[0].rotation.z = 0.55; this.arms[1].rotation.z = -0.55;
    for (const a of this.arms) a.userData.claw.material = this.skin.clawOpen.mat;
    // userData enthält Verweise (Krabbe, Scheren) – beim Kopieren kurz ausblenden
    const stash = [];
    this.card.traverse((o) => { stash.push([o, o.userData]); o.userData = {}; });
    const c = this.card.clone();
    for (const [o, u] of stash) o.userData = u;
    this.face.material = save.face;
    this.card.scale.x = save.sx;
    this.card.rotation.copy(save.rot);
    this.upper.position.y = save.up;
    this.legs.forEach((l, i) => { l.position.y = save.legs[i]; });
    this.arms.forEach((a, i) => { a.rotation.z = save.arms[i]; a.userData.claw.material = save.claws[i]; });
    c.position.set(0, 0, 0);
    return c;
  }

  showHeart(dur) {
    if (!this.heart) {
      this.heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.heartTex, transparent: true, depthWrite: false }));
      this.heart.scale.set(0.42, 0.38, 1);
      this.root.add(this.heart);
    }
    this.heartT = dur;
    this.heartDur = dur;
    this.heart.visible = true;
  }

  chooseNext() {
    const r = this.rng();
    // Begegnung?
    if (this.greetCd <= 0 && r < 0.45) {
      const other = this.ctx.findPartner?.(this);
      if (other) {
        const kind = pick(this.rng, ['wave', 'wave', 'dance', 'dance', 'love']);
        const dur = range(this.rng, 2.4, 3.4);
        this.greet(other, kind, dur);
        other.greet(this, kind, dur);
        return;
      }
    }
    // nachts schlafen die Krabben öfter und länger
    const night = this.ctx.night || 0;
    if (night > 0.05 && this.rng() < night * 0.62) { this.state = 'sleep'; this.timer = range(this.rng, 10, 26); return; }
    if (r < 0.6) {
      for (let i = 0; i < 10; i++) {
        const a = this.rng() * Math.PI * 2, d = range(this.rng, 3, 13);
        let tx = this.x + Math.cos(a) * d, tz = this.z + Math.sin(a) * d;
        const rr = Math.hypot(tx, tz);
        if (rr > WORLD.crabRadius) { tx *= (WORLD.crabRadius / rr) * 0.9; tz *= (WORLD.crabRadius / rr) * 0.9; }
        // freie Plätze bevorzugen, damit sich keine Klumpen bilden
        if (this.ctx.isFree(tx, tz, 0.9) && (this.ctx.crowd?.(tx, tz, 2.2) ?? 0) < 2) {
          this.state = 'walk'; this.target = { x: tx, z: tz }; this.timer = 16;
          return;
        }
      }
    }
    if (r < 0.66) { this.celebrate(range(this.rng, 1.5, 3)); return; }
    if (r < 0.74) { this.state = 'bubbles'; this.timer = range(this.rng, 1.5, 2.5); return; }
    if (r < 0.82) { this.state = 'snap'; this.timer = range(this.rng, 1.0, 1.8); this.setExpr(this.rng() < 0.5 ? 'smile' : 'chomp', this.timer); return; }
    if (r < 0.88) { this.state = 'sleep'; this.timer = range(this.rng, 6, 12); return; }
    this.state = 'idle';
    this.timer = range(this.rng, 1, 4);
    // ab und zu einfach so ein Gesicht ziehen
    if (this.rng() < 0.35) this.setExpr(pick(this.rng, ['smile', 'wink', 'surprised', 'smile']), range(this.rng, 0.8, 1.6));
  }

  update(dt, t, camera) {
    const ctx = this.ctx;
    const yaw = Math.atan2(camera.position.x - this.x, camera.position.z - this.z);

    // --- Einschweben ---
    if (this.dropDelay > 0) {
      this.dropDelay -= dt;
      if (this.dropDelay > 0) return;
      this.root.visible = true;
    }
    if (this.hatching) { // gerade geschlüpft: Hüpfer, Schütteln, dann Freudentanz
      this.hatching = false;
      this.hopV = 3.4;
      this.state = 'surprised';
      this.timer = 1.0;
      this.setExpr('surprised', 1.0);
      ctx.bubbles.spawn(this.x, this.root.position.y + 0.3, this.z, 16, 0.8, 0.05, 0.14);
    }
    if (this.growAnim) {
      const a = this.growAnim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const k = 1 + 2.7 * (a.t - 1) ** 3 + 1.7 * (a.t - 1) ** 2; // easeOutBack: kurz drüber, dann zurück
      this.root.scale.setScalar(a.from + (a.to - a.from) * k);
      if (a.t >= 1) { this.root.scale.setScalar(a.to); this.growAnim = null; }
    }
    let spin = 0;
    if (this.drop > 0) {
      this.dropV = Math.max(this.dropV - dt * 2.2, -3.0);
      this.drop += this.dropV * dt;
      spin = t * 5 + this.seed; // flattert wie ein Blatt Papier
      if (this.drop <= 0) {
        this.drop = 0;
        ctx.bubbles.spawn(this.x, this.root.position.y + 0.2, this.z, 18, 1.2, 0.05, 0.14);
        ctx.onLand?.(this);
        this.celebrate(2);
      }
    }

    // --- Verhalten ---
    this.timer -= dt;
    this.greetCd -= dt;
    let moveX = 0, moveZ = 0;
    const posing = this.hold && ['walk', 'idle', 'bubbles', 'sleep', 'snap'].includes(this.state);
    if (posing && this.drop <= 0) {
      this.state = 'idle';
      this.timer = 1;
    } else if (this.drop <= 0) {
      switch (this.state) {
        case 'idle':
          if (this.timer <= 0) this.chooseNext();
          break;
        case 'walk': {
          const dx = this.target.x - this.x, dz = this.target.z - this.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.35 || this.timer <= 0) { this.state = 'idle'; this.timer = range(this.rng, 0.8, 3); this.rush = 0; break; }
          let mx = dx / d, mz = dz / d;
          const av = ctx.avoid(this);
          mx += av.x; mz += av.z;
          const ml = Math.hypot(mx, mz) || 1;
          const slow = Math.min(1, d / 0.8); // sanft abbremsen
          const sp = this.speed * (this.rush > 0 ? this.rush : 1) * slow;
          moveX = (mx / ml) * sp; moveZ = (mz / ml) * sp;
          break;
        }
        case 'dance':
          if (this.hop <= 0.001 && this.hopV <= 0) this.hopV = 2.6;
          if (this.timer <= 0) { this.state = 'idle'; this.timer = range(this.rng, 0.5, 2); }
          break;
        case 'greet':
          if (this.greetKind === 'dance' && this.hop <= 0.001 && this.hopV <= 0) this.hopV = 2.4;
          if (this.timer <= 0) { this.state = 'idle'; this.timer = range(this.rng, 1, 2.5); this.partner = null; }
          break;
        case 'surprised':
          if (this.timer <= 0) this.celebrate(range(this.rng, 0.8, 1.4));
          break;
        case 'wave':
        case 'snap':
          if (this.timer <= 0) { this.state = 'idle'; this.timer = 1.5; }
          break;
        case 'sleep':
          if (this.timer <= 0) { this.state = 'idle'; this.timer = range(this.rng, 1, 2); this.setExpr('blink', 0.6); }
          break;
        case 'bubbles':
          if (Math.random() < dt * 10) ctx.bubbles.spawn(this.x + Math.sin(yaw) * 0.3, this.root.position.y + 0.6, this.z + Math.cos(yaw) * 0.3, 1, 0.1, 0.05, 0.12);
          if (this.timer <= 0) { this.state = 'idle'; this.timer = range(this.rng, 0.5, 2); }
          break;
      }
    }

    this.x += moveX * dt;
    this.z += moveZ * dt;
    ctx.resolve(this);

    const speedNow = Math.hypot(moveX, moveZ);
    this.moving += ((speedNow > 0.05 ? 1 : 0) - this.moving) * Math.min(1, dt * 8);

    // Papier-Umklappen, wenn die Laufrichtung (aus Kamerasicht) wechselt
    if (speedNow > 0.05) {
      const side = moveX * Math.cos(yaw) - moveZ * Math.sin(yaw);
      if (Math.abs(side) > 0.15) this.facing = side > 0 ? 1 : -1;
    } else if (this.state === 'greet' && this.partner) {
      // zum Gegenüber drehen
      const side = (this.partner.x - this.x) * Math.cos(yaw) - (this.partner.z - this.z) * Math.sin(yaw);
      if (Math.abs(side) > 0.1) this.facing = side > 0 ? 1 : -1;
    }
    this.flip += (this.facing - this.flip) * Math.min(1, dt * 9);

    // --- Hüpfen ---
    this.hopV -= dt * 9;
    this.hop = Math.max(0, this.hop + this.hopV * dt);
    if (this.hop === 0 && this.hopV < 0) this.hopV = 0;

    // --- Position & Ausrichtung ---
    const ground = ctx.heightAt(this.x, this.z);
    this.root.position.set(this.x, ground + this.drop, this.z);
    this.card.rotation.set(0, yaw + spin, 0);
    this.card.scale.x = this.drop > 0 ? 1 : (Math.abs(this.flip) < 0.04 ? 0.04 * Math.sign(this.flip || 1) : this.flip);
    const dropL = this.drop / (this.root.scale.x || 1); // Kinder des Wurzelknotens sind mitskaliert
    this.shadow.position.y = 0.03 - dropL;
    const sh = 1 / (1 + this.hop * 0.8 + this.drop * 0.15);
    this.shadow.scale.set(2.0 * sh, 1, 1.0 * sh);

    // --- Animation ---
    const sleeping = this.state === 'sleep';
    if (this.moving > 0.01) this.walkPhase += dt * this.speed * 10;
    const s = Math.sin(this.walkPhase);
    const lift = 1.0 * U * this.moving;
    this.legs.forEach((leg, i) => { leg.position.y = Math.max(0, i % 2 ? -s : s) * lift + this.hop; });
    const breathe = Math.sin(t * (sleeping ? 1.2 : 2) + this.seed) * (sleeping ? 0.35 : 0.15) * U;
    this.upper.position.y = Math.abs(s) * 0.6 * U * this.moving + this.hop + breathe * (1 - this.moving) - (sleeping ? 0.25 * U : 0);
    // Watscheln
    let tilt = s * 0.07 * this.moving;
    if (this.state === 'dance' || (this.state === 'greet' && this.greetKind === 'dance')) tilt += Math.sin(t * 10) * 0.08;
    if (sleeping) tilt += 0.06 * this.facing;
    if (this.state === 'surprised') tilt += Math.sin(t * 30) * 0.03;
    this.card.rotation.z = this.drop > 0 ? Math.sin(t * 3 + this.seed) * 0.35 : tilt;

    // Scheren: Winkel + auf/zu
    const [armR, armL] = this.arms;
    let open = false;
    if (this.state === 'wave' || (this.state === 'greet' && this.greetKind === 'wave')) {
      armR.rotation.z = 1.0 + Math.sin(t * 14) * 0.45;
      armL.rotation.z = -(0.15 + Math.sin(t * 3) * 0.1);
      open = Math.sin(t * 14) > 0;
    } else if (this.state === 'dance' || this.drop > 0 || (this.state === 'greet' && this.greetKind === 'dance')) {
      armR.rotation.z = 0.6 + Math.sin(t * 10) * 0.5;
      armL.rotation.z = -(0.6 + Math.sin(t * 10 + Math.PI) * 0.5);
      open = Math.sin(t * 5) > 0;
    } else if (this.state === 'snap') {
      armR.rotation.z = 0.55 + Math.sin(t * 3) * 0.1;
      armL.rotation.z = -(0.55 + Math.sin(t * 3 + 1) * 0.1);
      open = Math.sin(t * 22 + this.seed) > 0;
    } else if (this.state === 'surprised') {
      armR.rotation.z = 0.9; armL.rotation.z = -0.9; open = true;
    } else if (this.state === 'greet') { // love: Scheren ans "Herz"
      armR.rotation.z = -0.35; armL.rotation.z = 0.35;
    } else if (sleeping) {
      armR.rotation.z = -0.35; armL.rotation.z = -0.35;
    } else {
      const a = Math.sin(this.walkPhase) * 0.3 * this.moving + Math.sin(t * 1.6 + this.seed) * 0.08;
      armR.rotation.z = a;
      armL.rotation.z = a;
      // gelegentliches Klick-Klack
      this.snapT -= dt;
      if (this.snapT < -range(this.rng, 3, 9)) this.snapT = 0.45;
      open = this.snapT > 0 && Math.sin(this.snapT * 40) > 0;
    }
    if (open !== this.clawOpen) {
      this.clawOpen = open;
      const m = open ? this.skin.clawOpen : this.skin.clawClosed;
      for (const arm of this.arms) { arm.userData.claw.material = m.mat; arm.userData.claw.customDepthMaterial = m.depth; }
    }

    // Gesicht
    this.exprT -= dt;
    this.blink -= dt;
    let f;
    if (this.exprT > 0) f = this.expr;
    else if (sleeping) f = 'sleepy';
    else if (this.state === 'bubbles') f = Math.sin(t * 9) > 0 ? 'blow' : 'open';
    else f = 'open';
    if (f === 'open' && this.blink < 0) {
      f = 'blink';
      if (this.blink < -0.13) this.blink = range(this.rng, 1.5, 6);
    }
    this.face.material = R.faces[f].mat;
    this.faceName = f;

    // z z Z beim Schlafen
    if (sleeping || this.zzz?.visible) {
      if (!this.zzz) {
        this.zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.zzzTex, transparent: true, depthWrite: false }));
        this.zzz.scale.set(0.75, 0.42, 1);
        this.root.add(this.zzz);
      }
      this.zzz.visible = sleeping;
      const k = (t * 0.6 + this.seed) % 1;
      this.zzz.position.set(0.45 * this.facing, TOP * U + 0.25 + k * 0.35, 0.1);
      this.zzz.material.opacity = Math.sin(k * Math.PI);
    }
    if (this.heart?.visible) {
      this.heartT -= dt;
      const k = 1 - Math.max(0, this.heartT) / this.heartDur;
      this.heart.position.set(0.5 * this.facing, TOP * U + 0.3 + k * 0.7, 0.1);
      this.heart.material.opacity = Math.min(1, Math.sin(k * Math.PI) * 1.6);
      if (this.heartT <= 0) this.heart.visible = false;
    }

    this.hat.update(t, this, dt);

    if (this.ring.visible) {
      const k = 1 + Math.sin(t * 4) * 0.08;
      this.ring.scale.set(k, 1, k);
      this.ring.position.y = 0.06 - dropL;
    }
    if (this.beam) {
      this.beam.position.y = -dropL;
      this.beam.scale.setScalar(1 / (this.root.scale.x || 1)); // Lichtkegel immer gleich hoch
      this.goldRing.position.y = 0.07 - dropL;
      const k = 1 + Math.sin(t * 2.5) * 0.06;
      this.goldRing.scale.set(1.2 * k, 1, 1.2 * k);
    }
    if (this.aura) this.aura.material.opacity = 0.45 + Math.sin(t * 2.5 + this.seed) * 0.2;
    if (this.balloon?.visible) {
      this.balloon.position.set(1.02, (TOP - 3.4) * U + this.upper.position.y + Math.sin(t * 1.7 + this.seed) * 0.05, 0.05);
      this.balloon.material.rotation = Math.sin(t * 1.3 + this.seed) * 0.08;
    }
  }

  setSelected(v) {
    this.selected = v;
    this.ring.visible = v;
    // Namensschild der ausgewählten Krabbe nie von anderen verdecken lassen
    this.label.material.depthTest = !v;
    this.label.renderOrder = v ? 999 : 20;
    if (v && this.state === 'sleep') { this.state = 'idle'; this.timer = 1; }
  }

  labelOpts() {
    return { special: this.special, mine: this.mine, founder: !!this.data.founder, example: !!this.data.example };
  }

  /** Namensschild neu zeichnen (z. B. wenn sich "meine Krabbe" oder "Gründer" ändert). */
  refreshLabel() {
    const old = this.label;
    this.label = makeLabel(this.data.login, this.data.example ? '#9aa5b4' : this.tier.color, this.labelOpts());
    this.label.position.y = this.labelY;
    this.label.material.opacity = old.material.opacity;
    this.label.visible = old.visible;
    this.label.material.depthTest = old.material.depthTest;
    this.label.renderOrder = old.renderOrder;
    this.root.remove(old);
    old.material.map.dispose(); old.material.dispose();
    this.root.add(this.label);
  }

  /** Meine Krabbe: rosa Schild mit Herz. */
  setMine(on) {
    if (on === this.mine) return;
    this.mine = on;
    this.refreshLabel();
  }

  /** Krabbentag (Jahrestag des ersten Sterns): hält einen Papierballon. */
  setBirthday(on) {
    if (on && !this.balloon) {
      this.balloon = new THREE.Sprite(new THREE.SpriteMaterial({ map: balloonTex(), transparent: true, depthWrite: false }));
      this.balloon.scale.set(0.55, 1.1, 1);
      this.balloon.center.set(0.5, 0);
      this.card.add(this.balloon); // dreht und klappt mit der Krabbe mit

    }
    if (this.balloon) this.balloon.visible = on;
  }

  /** Krabbe des Tages: goldenes Schild, Lichtkegel, goldener Ring. */
  setSpecial(on) {
    if (on === this.special) return;
    this.special = on;
    const old = this.label;
    this.label = makeLabel(this.data.login, this.data.example ? '#9aa5b4' : this.tier.color, this.labelOpts());
    this.label.position.y = this.labelY;
    this.label.material.opacity = old.material.opacity;
    this.label.visible = old.visible;
    this.label.material.depthTest = old.material.depthTest;
    this.label.renderOrder = old.renderOrder;
    this.root.remove(old);
    old.material.map.dispose(); old.material.dispose();
    this.root.add(this.label);
    if (on) {
      this.beam = new THREE.Mesh(R.beamGeo, R.beamMat);
      this.beam.renderOrder = 5;
      this.goldRing = new THREE.Mesh(R.ringGeo, new THREE.MeshBasicMaterial({ color: hdr(0xffc93c, 1.4), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      this.root.add(this.beam, this.goldRing);
    } else if (this.beam) {
      this.root.remove(this.beam, this.goldRing);
      this.goldRing.material.dispose();
      this.beam = this.goldRing = null;
    }
  }

  /** Sanftes Ein-/Ausblenden des Namensschilds (Auswahl kommt aus main.js). */
  updateLabel(dt) {
    const want = this.selected || this.labelBoost > 0 || this.labelWanted;
    const target = want && this.root.visible ? 1 : 0;
    this.labelOpacity += (target - this.labelOpacity) * Math.min(1, dt * 8);
    if (this.selected) this.labelOpacity = 1;
    this.label.material.opacity = this.labelOpacity;
    this.label.visible = this.labelOpacity > 0.02;
    // Schild bleibt gleich groß, auch wenn die Krabbe klein ist
    const g = this.root.scale.x || 1, img = this.label.material.map.image;
    this.label.scale.set((LABEL_H * (img.width / img.height)) / g, LABEL_H / g, 1);
  }

  /** Weit entfernte Krabben werfen keinen echten Schatten (spart Draw-Calls). */
  setShadowLOD(on) {
    if (on === this.shadowOn) return;
    this.shadowOn = on;
    for (const m of this.casters) m.castShadow = on;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.ring.material.dispose();
    this.goldRing?.material.dispose();
    this.zzz?.material.dispose();
    this.heart?.material.dispose();
    this.balloon?.material.dispose();
  }
}

/** Papierballon mit Schnur (einmal gezeichnet, von allen Geburtstagskrabben geteilt). */
let _balloonTex = null;
function balloonTex() {
  if (_balloonTex) return _balloonTex;
  _balloonTex = spriteTex(100, 200, (ctx) => {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(50, 112); ctx.bezierCurveTo(40, 140, 60, 165, 50, 200); ctx.stroke();
    ctx.strokeStyle = '#6b5a4a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(50, 60, 42, 52, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(38, 118); ctx.lineTo(62, 118); ctx.lineTo(50, 104); ctx.fill();
    ctx.fillStyle = '#ff5d6c';
    ctx.beginPath(); ctx.ellipse(50, 60, 35, 45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(43, 112); ctx.lineTo(57, 112); ctx.lineTo(50, 102); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(36, 42, 8, 14, -0.4, 0, Math.PI * 2); ctx.fill();
  });
  return _balloonTex;
}

export const LABEL_SIZE = LABEL_H;

export function setPointScale(v) {
  res().pointScale.value = v;
}
