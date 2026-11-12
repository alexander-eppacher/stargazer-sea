import * as THREE from 'three';
import { range, pick } from './util.js';

/*
 * Papier-Baukasten: alles wird zur Laufzeit auf Canvas gezeichnet
 * (Pappaufsteller mit weißem Rand, Papiermaserung, Karton).
 */

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')];
}

export function css(color, k = 0) {
  const c = new THREE.Color(color);
  if (k > 0) c.lerp(new THREE.Color(0xffffff), k);
  if (k < 0) c.lerp(new THREE.Color(0x000000), -k);
  return `#${c.getHexString()}`;
}

export function toTexture(c, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Papiermaserung (nur dort, wo schon gemalt wurde). */
export function grain(ctx, w, h, rng = Math.random, k = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const n = Math.floor((w * h) / 70 * k);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(60,40,20,0.06)';
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < n / 30; i++) {
    const x = rng() * w, y = rng() * h, a = rng() * Math.PI, l = 4 + rng() * 14;
    ctx.strokeStyle = rng() < 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(60,40,20,0.05)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  ctx.restore();
}

function silhouette(src, color) {
  const [s, ctx] = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, s.width, s.height);
  return s;
}

/**
 * Sticker/Pappaufsteller: draw(ctx, w, h) malt den Inhalt,
 * dann kommen weißer Rand + graue Papierkante + Maserung dazu.
 * Rückgabe: { canvas, pad, w, h }
 */
export function sticker(w, h, draw, { outline = 8, thick = 3, grainK = 1, rng = Math.random, edge = '#ffffff' } = {}) {
  const pad = outline + thick + 3;
  const [a, actx] = canvas(w + pad * 2, h + pad * 2);
  actx.translate(pad, pad);
  draw(actx, w, h);
  const [o, octx] = canvas(a.width, a.height);
  if (outline > 0) {
    const white = silhouette(a, edge), dark = silhouette(a, 'rgba(110,115,130,0.85)');
    const steps = 20;
    for (const r of [outline, outline * 0.55]) {
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        octx.drawImage(dark, Math.cos(ang) * r, Math.sin(ang) * r + thick);
      }
    }
    for (const r of [outline, outline * 0.55]) {
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        octx.drawImage(white, Math.cos(ang) * r, Math.sin(ang) * r);
      }
    }
  }
  octx.drawImage(a, 0, 0);
  if (grainK) grain(octx, o.width, o.height, rng, grainK);
  return { canvas: o, pad, w, h };
}

/**
 * Ebene für einen Sticker. worldW = Breite des Inhalts in Welt-Einheiten.
 * anchor 'bottom': Unterkante des Inhalts bei y = 0; 'center': Mitte bei 0.
 */
export function stickerGeometry(stk, worldW, anchor = 'bottom', segX = 1, segY = 1) {
  const k = worldW / stk.w;
  const c = stk.canvas;
  const g = new THREE.PlaneGeometry(c.width * k, c.height * k, segX, segY);
  if (anchor === 'bottom') g.translate(0, (c.height / 2 - stk.pad) * k, 0);
  g.userData.contentH = stk.h * k;
  g.userData.k = k;
  return g;
}

/** Zwei (oder drei) gekreuzte Ebenen – wie die Papp-Bäume in Bastel-Dioramen. */
export function crossedGeometry(stk, worldW, planes = 2, segY = 1) {
  const base = stickerGeometry(stk, worldW, 'bottom', 1, segY);
  const list = [];
  for (let i = 0; i < planes; i++) {
    const g = base.clone();
    g.rotateY((i / planes) * Math.PI);
    list.push(g);
  }
  return { list, height: base.userData.contentH };
}

/* =========================================================
   Malfunktionen
   ========================================================= */
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function dots(ctx, w, h, color, rng, n = 20, rMin = 2, rMax = 5) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) circle(ctx, rng() * w, rng() * h, range(rng, rMin, rMax));
  ctx.restore();
}

export function drawBranchCoral(rng, color) {
  const W = 260, H = 250;
  return sticker(W, H, (ctx) => {
    const segs = [], tips = [];
    const grow = (x, y, ang, len, w, d) => {
      let x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len;
      x2 = Math.max(w + 6, Math.min(W - w - 6, x2));
      y2 = Math.max(w + 6, y2);
      segs.push([x, y, x2, y2, w]);
      if (d === 0) { tips.push([x2, y2, w]); return; }
      const n = d > 2 ? 2 : 2 + (rng() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        grow(x2, y2, ang + (i - (n - 1) / 2) * range(rng, 0.55, 0.85) + range(rng, -0.15, 0.15), len * range(rng, 0.68, 0.82), w * 0.72, d - 1);
      }
    };
    grow(W / 2, H, range(rng, -0.1, 0.1), 66, 26, 4);
    ctx.lineCap = 'round';
    ctx.strokeStyle = css(color);
    for (const [x1, y1, x2, y2, w] of segs) { ctx.lineWidth = w; line(ctx, x1, y1, x2, y2); }
    ctx.fillStyle = css(color, 0.3);
    for (const [x, y, w] of tips) circle(ctx, x, y, w * 0.85);
    ctx.strokeStyle = css(color, 0.35);
    for (const [x1, y1, x2, y2, w] of segs) { ctx.lineWidth = w * 0.3; line(ctx, x1 - w * 0.18, y1, x2 - w * 0.18, y2); }
    dots(ctx, W, H, css(color, 0.5), rng, 40, 1.5, 3.5);
  }, { rng });
}

export function drawFanCoral(rng, color) {
  const W = 260, H = 230;
  return sticker(W, H, (ctx) => {
    const cx = W / 2, cy = H - 26;
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI * 0.92 + (i / n) * Math.PI * 0.84;
      const r = range(rng, 150, 190);
      ctx.quadraticCurveTo(cx + Math.cos(a - 0.08) * r * 1.08, cy + Math.sin(a - 0.08) * r * 1.08, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.lineTo(cx + 12, cy);
    ctx.fill();
    ctx.strokeStyle = css(color, -0.28);
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * 0.9 + (i / 13) * Math.PI * 0.8;
      line(ctx, cx, cy, cx + Math.cos(a) * 200, cy + Math.sin(a) * 200);
    }
    ctx.lineWidth = 2;
    for (let r = 40; r < 200; r += 26) { ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); }
    ctx.fillStyle = css(color, -0.35);
    ctx.fillRect(cx - 9, cy - 10, 18, 36);
    dots(ctx, W, H, css(color, 0.45), rng, 30, 2, 4);
  }, { rng });
}

export function drawTubeCoral(rng, color) {
  const W = 220, H = 200;
  return sticker(W, H, (ctx) => {
    const n = 5 + Math.floor(rng() * 3);
    const tubes = [];
    for (let i = 0; i < n; i++) tubes.push({ x: range(rng, 30, W - 30), w: range(rng, 26, 40), h: range(rng, 70, 190) });
    tubes.sort((a, b) => b.h - a.h);
    for (const t of tubes) {
      const top = H - t.h;
      ctx.fillStyle = css(color);
      ctx.beginPath(); ctx.roundRect(t.x - t.w / 2, top, t.w, t.h, [t.w / 2, t.w / 2, 4, 4]); ctx.fill();
      ctx.fillStyle = css(color, -0.18);
      ctx.fillRect(t.x + t.w * 0.15, top + 8, t.w * 0.35, t.h - 8);
      ctx.fillStyle = css(color, 0.4);
      ctx.beginPath(); ctx.ellipse(t.x, top + 6, t.w / 2, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3b1530';
      ctx.beginPath(); ctx.ellipse(t.x, top + 6, t.w / 2 - 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }, { rng });
}

export function drawAnemone(rng, color, tip) {
  const W = 220, H = 180;
  return sticker(W, H, (ctx) => {
    const cx = W / 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI / 2 + (i / 21 - 0.5) * 2.4;
      const len = range(rng, 70, 110);
      const x1 = cx + range(rng, -24, 24), y1 = H - 55;
      const x2 = x1 + Math.cos(a) * len, y2 = y1 + Math.sin(a) * len;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, css(color)); grad.addColorStop(1, css(tip));
      ctx.strokeStyle = grad; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(x1 + Math.cos(a + 0.4) * len * 0.5, y1 + Math.sin(a + 0.4) * len * 0.5, x2, y2); ctx.stroke();
      ctx.fillStyle = css(tip, 0.3); circle(ctx, x2, y2, 6.5);
    }
    ctx.fillStyle = css(color, -0.3);
    ctx.beginPath(); ctx.roundRect(cx - 40, H - 60, 80, 60, [20, 20, 6, 6]); ctx.fill();
    dots(ctx, W, H, css(color, 0.2), rng, 12, 3, 6);
  }, { rng });
}

export function drawKelp(rng, color) {
  const W = 120, H = 520;
  return sticker(W, H, (ctx) => {
    const pts = [];
    for (let y = H; y >= 10; y -= 20) pts.push([W / 2 + Math.sin(y * 0.03 + rng() * 0.5) * 14, y]);
    ctx.fillStyle = css(color, 0.1);
    pts.forEach(([x, y], i) => {
      if (i % 2 || i < 2) return;
      const s = i % 4 ? 1 : -1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(s * -0.6);
      ctx.beginPath(); ctx.ellipse(s * 26, 0, 30, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    ctx.strokeStyle = css(color); ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = css(color, 0.35); ctx.lineWidth = 4;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x - 3, y) : ctx.moveTo(x - 3, y))); ctx.stroke();
    ctx.fillStyle = css(0xe8c547); circle(ctx, pts[pts.length - 1][0], 16, 9);
  }, { rng, outline: 6 });
}

export function drawTuft(rng, color) {
  const W = 140, H = 100;
  return sticker(W, H, (ctx) => {
    const n = 7;
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = css(color, pass ? 0.18 : -0.1);
      for (let i = 0; i < n; i++) {
        const x = 20 + (i / (n - 1)) * (W - 40) + range(rng, -6, 6);
        const h = range(rng, 50, 98) * (pass ? 0.75 : 1);
        const lean = (x - W / 2) * 0.5 + range(rng, -10, 10);
        ctx.beginPath();
        ctx.moveTo(x - 11, H);
        ctx.quadraticCurveTo(x - 4 + lean * 0.3, H - h * 0.6, x + lean, H - h);
        ctx.quadraticCurveTo(x + 4 + lean * 0.3, H - h * 0.5, x + 11, H);
        ctx.fill();
      }
    }
  }, { rng, outline: 5, thick: 2 });
}

export function drawStarfish(rng, color) {
  const S = 128;
  return sticker(S, S, (ctx) => {
    ctx.fillStyle = css(color);
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 22 : 60;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else {
        const pa = a - Math.PI / 10;
        ctx.quadraticCurveTo(S / 2 + Math.cos(pa) * 36, S / 2 + Math.sin(pa) * 36, x, y);
      }
    }
    ctx.fill();
    dots(ctx, S, S, css(color, 0.45), rng, 40, 2, 3.5);
  }, { rng, outline: 6 });
}

export function drawShell(rng, color) {
  const W = 120, H = 100;
  return sticker(W, H, (ctx) => {
    const cx = W / 2, cy = H - 10;
    ctx.fillStyle = css(color);
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 80, Math.PI * 1.15, Math.PI * 1.85); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = css(color, -0.25); ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 1.17 + (i / 8) * Math.PI * 0.66;
      line(ctx, cx, cy, cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
    }
    ctx.fillStyle = css(color, -0.15); ctx.fillRect(cx - 14, cy - 6, 28, 12);
  }, { rng, outline: 5 });
}

/** Fisch von der Seite, Kopf nach rechts. */
function drawFish(ctx, W, H, d) {
  const cx = W * 0.47, cy = H / 2, rx = W * 0.33, ry = H * 0.3;
  ctx.fillStyle = css(d.fin ?? d.body, -0.05);
  ctx.beginPath(); ctx.moveTo(cx - rx * 0.8, cy); ctx.lineTo(8, cy - ry * 1.15); ctx.quadraticCurveTo(26, cy, 8, cy + ry * 1.15); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - rx * 0.4, cy - ry * 0.7); ctx.quadraticCurveTo(cx, cy - ry * 1.7, cx + rx * 0.4, cy - ry * 0.8); ctx.fill();
  ctx.fillStyle = css(d.body);
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = css(d.body, 0.35); ctx.fillRect(cx - rx, cy + ry * 0.25, rx * 2, ry);
  if (d.stripe) {
    ctx.fillStyle = css(d.stripe);
    for (const sx of d.stripes ?? [0]) {
      if (d.edge) { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(cx + sx * rx - 11, cy - ry, 22, ry * 2); ctx.fillStyle = css(d.stripe); }
      ctx.fillRect(cx + sx * rx - 7, cy - ry, 14, ry * 2);
    }
  }
  if (d.back) { ctx.fillStyle = css(d.back); ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 0.6); }
  if (d.half) { ctx.fillStyle = css(d.half); ctx.fillRect(cx - rx, cy - ry, rx * 0.95, ry * 2); }
  ctx.restore();
  ctx.fillStyle = '#fff'; circle(ctx, cx + rx * 0.58, cy - ry * 0.18, ry * 0.32);
  ctx.fillStyle = '#111'; circle(ctx, cx + rx * 0.62, cy - ry * 0.18, ry * 0.18);
  ctx.strokeStyle = css(d.body, -0.3); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx + rx * 0.25, cy, ry * 0.6, -0.9, 0.9); ctx.stroke();
}

export const FISH = [
  { body: 0x3d7bff, fin: 0xffd23f, stripe: 0x1d2a6b, stripes: [-0.1] },
  { body: 0xffd23f, fin: 0xffb000, stripe: 0xffffff, stripes: [0.1] },
  { body: 0xd7e3ea, back: 0x6aa8d8, fin: 0xb8cad6 },
  { body: 0xff5f6d, fin: 0xff9aa2 },
  { body: 0xffd23f, half: 0x9b5de5, fin: 0xb07ef0 },
  { body: 0x5ef2d6, fin: 0x2ec4b6 },
  { body: 0xff9f43, stripe: 0x7a2e00, stripes: [-0.4, 0, 0.4], fin: 0xffbe76 },
  { body: 0xff7b00, stripe: 0xffffff, stripes: [-0.35, 0.35], fin: 0xff9a3c, edge: true },
];

/** Atlas mit allen Fischen (4 × 2). */
export function fishAtlas() {
  const CW = 256, CH = 128;
  const [c, ctx] = canvas(CW * 4, CH * 2);
  FISH.forEach((d, i) => {
    const stk = sticker(200, 96, (cx, w, h) => drawFish(cx, w, h, d), { outline: 6, thick: 2 });
    const col = i % 4, row = Math.floor(i / 4);
    ctx.drawImage(stk.canvas, col * CW + (CW - stk.canvas.width) / 2, row * CH + (CH - stk.canvas.height) / 2);
  });
  return toTexture(c);
}

export function drawJellyBell(rng, color) {
  const W = 200, H = 130;
  return sticker(W, H, (ctx) => {
    ctx.fillStyle = css(color, 0.15);
    ctx.beginPath();
    ctx.moveTo(6, H - 18);
    ctx.bezierCurveTo(6, -20, W - 6, -20, W - 6, H - 18);
    for (let i = 0; i < 8; i++) {
      const x1 = W - 6 - (i / 8) * (W - 12), x2 = W - 6 - ((i + 1) / 8) * (W - 12);
      ctx.quadraticCurveTo((x1 + x2) / 2, H + 2, x2, H - 18);
    }
    ctx.fill();
    ctx.fillStyle = css(color, 0.55);
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.48, W * 0.24, H * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(W * 0.32, H * 0.3, 16, 9, -0.5, 0, Math.PI * 2); ctx.fill();
  }, { rng, outline: 7 });
}

export function drawTentacles(rng, color) {
  const W = 180, H = 260;
  return sticker(W, H, (ctx) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x0 = 20 + (i / 5) * (W - 40);
      ctx.strokeStyle = css(color, i % 2 ? 0.3 : 0);
      ctx.lineWidth = i % 2 ? 6 : 10;
      ctx.beginPath(); ctx.moveTo(x0, 0);
      for (let y = 0; y <= H - 10; y += 10) ctx.lineTo(x0 + Math.sin(y * 0.05 + i) * 10, y);
      ctx.stroke();
    }
  }, { rng, outline: 4, thick: 1 });
}

export function drawTurtleBody(rng) {
  const W = 300, H = 150;
  return sticker(W, H, (ctx) => {
    const skin = '#9fcf6a';
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(W - 52, H * 0.56, 44, 30, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(40, H * 0.62); ctx.lineTo(4, H * 0.7); ctx.lineTo(40, H * 0.78); ctx.fill();
    ctx.fillStyle = '#3f8f4a';
    ctx.beginPath(); ctx.moveTo(30, H * 0.78); ctx.bezierCurveTo(40, -10, W - 70, -10, W - 80, H * 0.78); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5fae55';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.ellipse(75 + i * 46, H * 0.42 - Math.sin((i + 0.5) / 4 * Math.PI) * 14, 20, 16, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f3e3a8';
    ctx.fillRect(30, H * 0.74, W - 110, 14);
    ctx.fillStyle = '#111'; circle(ctx, W - 38, H * 0.48, 6);
    ctx.fillStyle = '#fff'; circle(ctx, W - 36, H * 0.46, 2);
  }, { rng, outline: 7 });
}

export function drawFlipper(rng) {
  const W = 120, H = 50;
  return sticker(W, H, (ctx) => {
    ctx.fillStyle = '#8cc35c';
    ctx.beginPath(); ctx.moveTo(0, H / 2 - 12); ctx.quadraticCurveTo(W * 0.7, -4, W, H * 0.7); ctx.quadraticCurveTo(W * 0.5, H, 0, H / 2 + 12); ctx.fill();
    ctx.fillStyle = '#b6df8d'; circle(ctx, W * 0.55, H * 0.45, 6); circle(ctx, W * 0.3, H * 0.5, 5);
  }, { rng, outline: 5 });
}

export function drawManta(rng) {
  const W = 420, H = 260;
  return sticker(W, H, (ctx) => {
    ctx.fillStyle = '#2b3f63';
    ctx.beginPath();
    ctx.moveTo(W / 2, 20);
    ctx.quadraticCurveTo(W * 0.62, 40, W - 4, H * 0.5);
    ctx.quadraticCurveTo(W * 0.62, H * 0.62, W / 2 + 18, H * 0.78);
    ctx.lineTo(W / 2 + 3, H);
    ctx.lineTo(W / 2 - 3, H);
    ctx.lineTo(W / 2 - 18, H * 0.78);
    ctx.quadraticCurveTo(W * 0.38, H * 0.62, 4, H * 0.5);
    ctx.quadraticCurveTo(W * 0.38, 40, W / 2, 20);
    ctx.fill();
    ctx.fillStyle = '#3d5a88';
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.42, 42, 70, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8eef5';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(W / 2 + s * 70, H * 0.5, 30, 10, s * 0.5, 0, Math.PI * 2); ctx.fill(); }
  }, { rng, outline: 7 });
}

export function drawStar(color = 0xffd23f) {
  const S = 220;
  return sticker(S, S, (ctx) => {
    const star = (r1, r2, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? r2 : r1;
        const x = S / 2 + Math.cos(a) * r, y = S / 2 + 8 + Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.fill();
    };
    star(108, 48, css(0xf59e0b));
    star(96, 42, css(color));
    star(52, 24, css(color, 0.45));
  }, { outline: 9, thick: 4 });
}

/* ---------- Boden ---------- */
export function sandTexture(rng, base = 0xf2dca8) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = css(base); ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = range(rng, 30, 90);
    ctx.fillStyle = rng() < 0.5 ? css(base, 0.12) : css(base, -0.06);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r, r * 0.6, rng() * 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = css(base, -0.12);
  for (let i = 0; i < 140; i++) circle(ctx, rng() * S, rng() * S, range(rng, 1.5, 3.5));
  ctx.fillStyle = css(base, 0.3);
  for (let i = 0; i < 90; i++) circle(ctx, rng() * S, rng() * S, range(rng, 2, 4));
  grain(ctx, S, S, rng, 1.6);
  return toTexture(c, { repeat: true });
}

export function cardboardTexture(rng) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#c99c62'; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 32) {
    ctx.fillStyle = 'rgba(90,55,20,0.18)'; ctx.fillRect(0, y, W, 3);
    ctx.fillStyle = 'rgba(255,240,210,0.15)'; ctx.fillRect(0, y + 3, W, 2);
  }
  for (let x = 0; x < W; x += 64) {
    ctx.fillStyle = 'rgba(90,55,20,0.1)'; ctx.fillRect(x + rng() * 20, 0, 2, H);
  }
  grain(ctx, W, H, rng, 2);
  return toTexture(c, { repeat: true });
}

/** Wellige Kante (Überhang) um die Inseln. */
export function frillTexture(rng, color = 0xf7e6b8) {
  const W = 256, H = 64;
  const stk = sticker(W, H - 16, (ctx, w, h) => {
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.5);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x1 = w - (i / n) * w, x2 = w - ((i + 1) / n) * w;
      ctx.quadraticCurveTo((x1 + x2) / 2, h * 1.25, x2, h * 0.5);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = css(color, -0.08);
    for (let i = 0; i < n; i++) circle(ctx, (i + 0.5) / n * w, h * 0.6, 5);
  }, { rng, outline: 5, thick: 3 });
  // horizontal kachelbar machen: Ränder abschneiden
  const [c, ctx] = canvas(W, stk.canvas.height);
  ctx.drawImage(stk.canvas, stk.pad, 0, W, stk.canvas.height, 0, 0, W, stk.canvas.height);
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Hintergrund-Ring (Hügel/Riffe), horizontal kachelbar. */
export function backdropTexture(rng, color, { height = 0.55, bumps = 9, deco = 'weed', W = 2048, H = 512 } = {}) {
  const [c, ctx] = canvas(W, H);
  const outline = (draw) => {
    ctx.save(); ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 14; draw(true);
    ctx.restore(); draw(false);
  };
  const humps = [];
  for (let i = 0; i < bumps; i++) humps.push({ x: (i / bumps) * W + range(rng, -40, 40), r: range(rng, 120, 260) * (W / 2048), h: range(rng, 0.6, 1) });
  const path = (ox) => {
    for (const hp of humps) {
      ctx.moveTo(hp.x + ox - hp.r, H);
      ctx.ellipse(hp.x + ox, H, hp.r, H * height * hp.h, 0, Math.PI, 0);
    }
  };
  outline((stroke) => {
    ctx.beginPath();
    for (const ox of [-W, 0, W]) path(ox);
    if (stroke) ctx.stroke(); else { ctx.fillStyle = css(color); ctx.fill(); }
  });
  // Verzierung
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = css(color, -0.12);
  for (let i = 0; i < 70; i++) circle(ctx, rng() * W, H * (1 - height * 0.8) + rng() * H * height, range(rng, 4, 12));
  ctx.restore();
  if (deco === 'weed') {
    ctx.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const x = rng() * W, hgt = range(rng, 60, 180);
      const hp = humps.reduce((best, h) => (Math.abs(h.x - x) < Math.abs(best.x - x) ? h : best), humps[0]);
      const dx = (x - hp.x) / hp.r;
      if (Math.abs(dx) > 0.9) continue;
      const top = H - Math.sqrt(1 - dx * dx) * H * height * hp.h;
      ctx.strokeStyle = css(color, -0.18); ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(x, top + 6);
      for (let y = 0; y < hgt; y += 10) ctx.lineTo(x + Math.sin(y * 0.06 + i) * 8, top - y);
      ctx.stroke();
    }
  }
  grain(ctx, W, H, rng, 0.6);
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function grainTexture(rng) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, rng, 3);
  return toTexture(c, { repeat: true });
}

/* ---------- neue Deko ---------- */
export function drawUrchin(rng, color) {
  const W = 150, H = 110;
  return sticker(W, H, (ctx) => {
    const cx = W / 2, cy = H - 34;
    ctx.strokeStyle = css(color, -0.25); ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const a = Math.PI + (i / 25) * Math.PI + range(rng, -0.05, 0.05);
      const l = range(rng, 48, 70);
      ctx.lineWidth = range(rng, 4, 6);
      line(ctx, cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.95);
    }
    ctx.fillStyle = css(color);
    ctx.beginPath(); ctx.ellipse(cx, cy + 6, 40, 30, 0, Math.PI, 0); ctx.lineTo(cx + 40, H); ctx.lineTo(cx - 40, H); ctx.fill();
    ctx.fillStyle = css(color, 0.3);
    for (let i = 0; i < 7; i++) circle(ctx, cx - 26 + i * 9, cy + 2 - Math.sin((i / 6) * Math.PI) * 12, 3);
  }, { rng, outline: 5, thick: 2 });
}

export function drawAnchor(rng) {
  const W = 200, H = 300;
  return sticker(W, H, (ctx) => {
    const cx = W / 2, iron = '#5b6b80', ironL = '#8496ad';
    ctx.strokeStyle = iron; ctx.lineCap = 'round';
    ctx.lineWidth = 20; ctx.beginPath(); ctx.arc(cx, 34, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 24; line(ctx, cx, 56, cx, H - 40);
    ctx.lineWidth = 18; line(ctx, cx - 58, 92, cx + 58, 92);
    ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(cx, H - 110, 78, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.fillStyle = iron;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx + sx * 64, H - 54); ctx.lineTo(cx + sx * 96, H - 84); ctx.lineTo(cx + sx * 86, H - 40); ctx.fill();
    }
    ctx.strokeStyle = ironL; ctx.lineWidth = 6; line(ctx, cx - 6, 64, cx - 6, H - 60);
    dots(ctx, W, H, 'rgba(190,120,60,0.55)', rng, 26, 3, 7); // Rost
  }, { rng, outline: 7, thick: 3 });
}

export function drawSign(rng, lines) {
  const W = 300, H = 230;
  return sticker(W, H, (ctx) => {
    ctx.fillStyle = '#9a6a3c'; ctx.fillRect(W / 2 - 12, 120, 24, H - 120);
    ctx.fillStyle = '#c98f55';
    ctx.beginPath(); ctx.roundRect(10, 12, W - 20, 124, 14); ctx.fill();
    ctx.fillStyle = '#b77d45';
    for (let y = 40; y < 130; y += 30) ctx.fillRect(18, y, W - 36, 3);
    ctx.fillStyle = '#ffe9c2';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 38px Nunito, system-ui, sans-serif';
    ctx.fillText(lines[0], W / 2, 52);
    let size = 26;
    do { ctx.font = `800 ${size}px Nunito, system-ui, sans-serif`; size--; } while (ctx.measureText(lines[1]).width > W - 44 && size > 12);
    ctx.fillText(lines[1], W / 2, 98);
  }, { rng, outline: 7, thick: 3 });
}

export function drawPebbles(rng) {
  const W = 220, H = 160;
  return sticker(W, H, (ctx) => {
    for (let i = 0; i < 9; i++) {
      const c = pick(rng, [0xcfc6b8, 0xb9c7cf, 0xd8c7b0, 0xaebfb5, 0xe4d8c4]);
      ctx.fillStyle = css(c);
      ctx.beginPath(); ctx.ellipse(range(rng, 40, W - 40), range(rng, 35, H - 35), range(rng, 14, 30), range(rng, 10, 20), rng() * 3, 0, Math.PI * 2); ctx.fill();
    }
  }, { rng, outline: 4, thick: 2 });
}

export function drawRipples(rng, base = 0xf2dca8) {
  const W = 360, H = 200;
  const [c, ctx] = canvas(W, H);
  ctx.strokeStyle = css(base, -0.14); ctx.lineWidth = 7; ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const y0 = 40 + k * 38;
    ctx.beginPath();
    for (let x = 20; x <= W - 20; x += 8) {
      const y = y0 + Math.sin(x * 0.04 + k) * 9;
      x === 20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = css(base, 0.25); ctx.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const y0 = 34 + k * 38;
    ctx.beginPath();
    for (let x = 30; x <= W - 30; x += 8) {
      const y = y0 + Math.sin(x * 0.04 + k) * 9;
      x === 30 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // weich ausblenden
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  return { canvas: c, pad: 0, w: W, h: H };
}

/** Riesenmuschel: Unter- bzw. Oberschale (von vorne gesehen), gewellter Rand. */
export function drawClamShell(rng, top) {
  const W = 240, H = 120;
  return sticker(W, H, (ctx) => {
    const cx = W / 2, n = 7;
    const base = top ? 0x8fdccf : 0x63c3b6, dark = 0x3d9c90;
    ctx.fillStyle = css(base);
    ctx.beginPath();
    if (top) {
      // Kuppel mit Wellenrand unten
      ctx.moveTo(8, H - 14);
      ctx.bezierCurveTo(10, 10, W - 10, 10, W - 8, H - 14);
      for (let i = n; i > 0; i--) { const x1 = 8 + (i / n) * (W - 16), x0 = 8 + ((i - 1) / n) * (W - 16); ctx.quadraticCurveTo((x0 + x1) / 2, H + 2, x0, H - 14); }
    } else {
      // Schale mit Wellenrand oben
      ctx.moveTo(8, 14);
      for (let i = 0; i < n; i++) { const x0 = 8 + (i / n) * (W - 16), x1 = 8 + ((i + 1) / n) * (W - 16); ctx.quadraticCurveTo((x0 + x1) / 2, -2, x1, 14); }
      ctx.bezierCurveTo(W - 10, H - 4, 10, H - 4, 8, 14);
    }
    ctx.closePath(); ctx.fill();
    // Rippen
    ctx.save(); ctx.clip();
    ctx.strokeStyle = css(dark); ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const x = 8 + (i / n) * (W - 16);
      if (top) line(ctx, cx + (x - cx) * 0.2, 18, x, H - 10);
      else line(ctx, x, 10, cx + (x - cx) * 0.2, H - 8);
    }
    ctx.fillStyle = css(base, 0.35);
    for (let i = 0; i < n; i++) circle(ctx, 8 + ((i + 0.5) / n) * (W - 16), top ? H - 16 : 16, 5);
    ctx.restore();
  }, { rng, outline: 6, thick: 3 });
}

/* ---------- Saison-Deko ---------- */
export function drawXmasTree(rng) {
  const W = 240, H = 330;
  return sticker(W, H, (ctx) => {
    const cx = W / 2;
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(cx - 16, H - 46, 32, 46);
    const layers = [[H - 40, 112, 92], [H - 110, 92, 86], [H - 175, 70, 78], [H - 236, 46, 70]];
    for (const [y, hw, hh] of layers) {
      ctx.fillStyle = '#1f8f4e';
      ctx.beginPath(); ctx.moveTo(cx - hw, y); ctx.lineTo(cx, y - hh); ctx.lineTo(cx + hw, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2fb064';
      ctx.beginPath(); ctx.moveTo(cx - hw * 0.15, y - hh * 0.9); ctx.lineTo(cx, y - hh); ctx.lineTo(cx + hw * 0.75, y - 4); ctx.lineTo(cx + hw * 0.2, y - 4); ctx.closePath(); ctx.fill();
    }
    // Kugeln
    const balls = ['#ef4444', '#facc15', '#3b82f6', '#f472b6', '#ffffff'];
    for (let i = 0; i < 16; i++) {
      const L = layers[i % 4], t = rng();
      const y = L[0] - 8 - rng() * (L[2] * 0.6);
      const half = L[1] * (1 - (L[0] - y) / L[2]) * 0.85;
      ctx.fillStyle = balls[i % balls.length];
      circle(ctx, cx + (t * 2 - 1) * half, y, 7);
    }
    // Stern
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 9 : 22; const x = cx + Math.cos(a) * r, y = H - 306 + 22 + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.fill();
  }, { rng, outline: 8, thick: 4 });
}

export function drawPresent(rng, color, ribbon) {
  const W = 110, H = 100;
  return sticker(W, H, (ctx) => {
    ctx.fillStyle = css(color); ctx.fillRect(6, 30, W - 12, H - 30);
    ctx.fillStyle = css(color, 0.15); ctx.fillRect(0, 18, W, 20);
    ctx.fillStyle = css(ribbon); ctx.fillRect(W / 2 - 8, 18, 16, H - 18);
    ctx.beginPath(); ctx.ellipse(W / 2 - 16, 12, 16, 10, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W / 2 + 16, 12, 16, 10, 0.4, 0, Math.PI * 2); ctx.fill();
  }, { rng, outline: 6, thick: 3 });
}

/** Kürbis; face=true malt nur das Gesicht (für die leuchtende Ebene). */
export function drawPumpkin(rng, face = false) {
  const W = 180, H = 150;
  return sticker(W, H, (ctx) => {
    const cx = W / 2, cy = H / 2 + 12;
    if (!face) {
      ctx.fillStyle = '#5b8f2d'; ctx.fillRect(cx - 7, 4, 14, 26);
      for (const [dx, rx, c] of [[-46, 42, '#e8741e'], [46, 42, '#e8741e'], [-20, 44, '#f28a2e'], [20, 44, '#f28a2e'], [0, 40, '#f79a3c']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx + dx, cy, rx, 58, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = face ? '#ffd35a' : '#3a1a05';
    ctx.beginPath(); ctx.moveTo(cx - 44, cy - 14); ctx.lineTo(cx - 22, cy - 34); ctx.lineTo(cx - 12, cy - 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 44, cy - 14); ctx.lineTo(cx + 22, cy - 34); ctx.lineTo(cx + 12, cy - 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 50, cy + 12);
    for (let i = 0; i <= 8; i++) ctx.lineTo(cx - 50 + i * 12.5, cy + 12 + (i % 2 ? 14 : 0));
    ctx.lineTo(cx + 44, cy + 34); ctx.lineTo(cx - 44, cy + 34); ctx.closePath(); ctx.fill();
  }, face ? { outline: 0, thick: 0, grainK: 0 } : { rng, outline: 7, thick: 3 });
}

export function drawGhost(rng) {
  const W = 150, H = 190;
  return sticker(W, H, (ctx) => {
    ctx.fillStyle = '#f4f7ff';
    ctx.beginPath(); ctx.moveTo(10, H - 10);
    ctx.lineTo(10, 70); ctx.arc(W / 2, 70, W / 2 - 10, Math.PI, 0); ctx.lineTo(W - 10, H - 10);
    for (let i = 4; i >= 0; i--) ctx.quadraticCurveTo(10 + (i + 0.5) * ((W - 20) / 5), H + 12, 10 + i * ((W - 20) / 5), H - 10);
    ctx.fill();
    ctx.fillStyle = '#2b3a55';
    ctx.beginPath(); ctx.ellipse(W / 2 - 22, 72, 9, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W / 2 + 22, 72, 9, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W / 2, 112, 12, 16, 0, 0, Math.PI * 2); ctx.fill();
  }, { rng, outline: 6, thick: 3 });
}

export { pick };
