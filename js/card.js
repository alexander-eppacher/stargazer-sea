import * as THREE from 'three';
import { mulberry32, hashString } from './util.js';
import { t as tr } from './lang.js';

/*
 * Sammelkarte zum Teilen: eigene Karte im Stil eines Trading-Card-Games.
 * Das Bild der Krabbe wird mit einem kleinen zweiten Renderer aus der echten 3D-Figur gemacht.
 */

const CW = 630, CH = 880;
let portraitRenderer = null;

/* ---------- Porträt aus der 3D-Figur ---------- */
function renderPortrait(obj) {
  try {
    if (!portraitRenderer) {
      const c = document.createElement('canvas');
      c.width = c.height = 600;
      portraitRenderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
      portraitRenderer.setPixelRatio(1);
      portraitRenderer.setSize(600, 600, false);
      portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      portraitRenderer.toneMappingExposure = 0.9;
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe2f8ff, 0x7fa9b8, 0.8));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.7);
    sun.position.set(-3, 6, 8);
    scene.add(sun);
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    obj.traverse((o) => { if (o.isMesh && o.material.visible !== false) box.expandByObject(o, true); });
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
    const dist = (Math.max(size.x, size.y) * 0.62) / Math.tan(THREE.MathUtils.degToRad(12));
    cam.position.set(center.x, center.y + size.y * 0.04, center.z + dist);
    cam.lookAt(center);
    portraitRenderer.setClearColor(0x000000, 0);
    portraitRenderer.render(scene, cam);
    scene.remove(obj);
    return portraitRenderer.domElement;
  } catch (e) {
    console.warn('Porträt nicht möglich', e);
    return null;
  }
}

/** Kleines Porträt (fürs Album), pro Krabbe nur einmal gerendert. */
const thumbs = new WeakMap();
export function portraitThumb(crab, size = 150) {
  if (thumbs.has(crab)) return thumbs.get(crab);
  const src = renderPortrait(crab.portraitClone());
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(src, 0, 0, size, size);
  thumbs.set(crab, c);
  return c;
}

/* ---------- Inhalte (aus der ID ausgewürfelt, immer gleich) ---------- */
// Fähigkeiten, Sprüche und Werte stehen in beiden Sprachen in i18n.js
const ABILITIES = tr('tc.abilities');
const FLAVOR = tr('tc.flavors');
const STATS = tr('tc.stats');

function cardData(d, tierIndex) {
  const rng = mulberry32(hashString(`card-${d.id}-${d.login}`));
  const base = 22 + tierIndex * 11;
  const stats = STATS.map((name) => [name, Math.min(99, Math.round(base + rng() * 42))]);
  const a = [...ABILITIES].sort(() => rng() - 0.5).slice(0, 2)
    .map(([n, t], i) => [n, t, (2 + tierIndex + Math.floor(rng() * 4) + i * 2) * 10]);
  return { stats, abilities: a, flavor: FLAVOR[Math.floor(rng() * FLAVOR.length)] };
}

/* ---------- Zeichnen ---------- */
function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color(0xffffff), k); else c.lerp(new THREE.Color(0x000000), -k);
  return `#${c.getHexString()}`;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function fitText(ctx, text, maxW, size, weight = 800, family = 'Nunito, system-ui, sans-serif') {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 1; } while (ctx.measureText(text).width > maxW && s > 10);
}
function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t;
  }
  ctx.fillText(line, x, y);
  return y;
}
function starPath(ctx, cx, cy, r1, r2) {
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1;
    i ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function drawCard(info) {
  const { data: d, tier, tierIndex, hatName, since, portrait, crabOfDay, variantText } = info;
  const cd = cardData(d, tierIndex);
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const ctx = c.getContext('2d');
  const col = tier.color, rng = mulberry32(hashString(`deco-${d.id}`));
  const holo = tierIndex >= 3;

  // Rahmen
  const g = ctx.createLinearGradient(0, 0, CW, CH);
  g.addColorStop(0, shade(col, 0.25)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.35));
  ctx.fillStyle = g; rr(ctx, 0, 0, CW, CH, 34); ctx.fill();
  if (tier.id === 'mythic') {
    const rb = ctx.createLinearGradient(0, 0, CW, CH);
    ['#ff8ad8', '#ffd36e', '#7ef0c8', '#7cb8ff', '#c79bff'].forEach((s, i, a) => rb.addColorStop(i / (a.length - 1), s));
    ctx.fillStyle = rb; rr(ctx, 0, 0, CW, CH, 34); ctx.fill();
  }
  ctx.fillStyle = '#fffaf0'; rr(ctx, 18, 18, CW - 36, CH - 36, 22); ctx.fill();
  // Bastel-Look: feine Papierfasern
  ctx.save(); rr(ctx, 18, 18, CW - 36, CH - 36, 22); ctx.clip();
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(160,130,90,0.06)' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(18 + rng() * (CW - 36), 18 + rng() * (CH - 36), 1 + rng() * 3, 1);
  }
  ctx.restore();

  // Kopfzeile
  ctx.fillStyle = shade(col, 0.82); rr(ctx, 30, 30, CW - 60, 70, 16); ctx.fill();
  ctx.fillStyle = '#2b3a55'; ctx.textBaseline = 'middle';
  fitText(ctx, `@${d.login}`, CW - 220, 40);
  ctx.fillText(`@${d.login}`, 48, 66);
  ctx.textAlign = 'right';
  ctx.font = '800 22px Nunito, system-ui, sans-serif'; ctx.fillStyle = shade(col, -0.45);
  ctx.fillText(info.locked ? tr('tc.nrUnknown') : Number.isInteger(d.variant) ? tr('tc.nr', { v: d.variant, edition: info.edition }) : tr('tc.crab', { n: d.number ?? '?' }), CW - 48, 66);
  ctx.textAlign = 'left';

  // Bildfenster
  const ax = 42, ay = 112, aw = CW - 84, ah = 360;
  ctx.save();
  rr(ctx, ax, ay, aw, ah, 14); ctx.clip();
  const water = ctx.createLinearGradient(0, ay, 0, ay + ah);
  water.addColorStop(0, '#7fd3f0'); water.addColorStop(0.7, '#3fa6d6'); water.addColorStop(1, '#2f8ec2');
  ctx.fillStyle = water; ctx.fillRect(ax, ay, aw, ah);
  ctx.globalAlpha = 0.18; ctx.fillStyle = '#fffbe6';
  for (let i = 0; i < 5; i++) {
    const x = ax + 40 + i * 120 + rng() * 40;
    ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x + 50, ay); ctx.lineTo(x - 40, ay + ah); ctx.lineTo(x - 110, ay + ah); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Sand + Seegras
  ctx.fillStyle = '#f4d9a0';
  ctx.beginPath(); ctx.moveTo(ax, ay + ah - 70);
  for (let x = 0; x <= aw; x += 30) ctx.lineTo(ax + x, ay + ah - 70 + Math.sin(x * 0.03) * 8);
  ctx.lineTo(ax + aw, ay + ah); ctx.lineTo(ax, ay + ah); ctx.fill();
  ctx.fillStyle = '#4cc26a';
  for (const sx of [ax + 40, ax + aw - 60, ax + aw - 120]) {
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(sx + k * 8, ay + ah - 60); ctx.quadraticCurveTo(sx + k * 8 - 10, ay + ah - 110 - rng() * 40, sx + k * 8 + 4, ay + ah - 130 - rng() * 30); ctx.lineTo(sx + k * 8 + 8, ay + ah - 60); ctx.fill(); }
  }
  // Blasen
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(ax + rng() * aw, ay + rng() * (ah - 90), 4 + rng() * 9, 0, Math.PI * 2); ctx.stroke(); }
  // Holo-Folie (episch und besser)
  if (holo) {
    ctx.globalCompositeOperation = 'overlay';
    const hg = ctx.createLinearGradient(ax, ay, ax + aw, ay + ah);
    ['#ff7ad9', '#ffe27a', '#7ef0c8', '#7cb8ff', '#d39bff', '#ff7ad9'].forEach((s, i, a) => hg.addColorStop(i / (a.length - 1), s));
    ctx.globalAlpha = tier.id === 'mythic' ? 0.55 : 0.38;
    ctx.fillStyle = hg; ctx.fillRect(ax, ay, aw, ah);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 16; i++) { starPath(ctx, ax + rng() * aw, ay + rng() * ah * 0.8, 9 + rng() * 6, 3.5); ctx.fill(); }
  }
  // Porträt
  if (portrait) {
    const s = Math.min(aw, ah) * 1.12;
    ctx.drawImage(portrait, ax + (aw - s) / 2, ay + ah - s + 12, s, s);
  } else {
    const img = info.fallbackImg;
    if (img?.complete) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, ax + aw / 2 - 110, ay + ah / 2 - 110, 220, 220); }
  }
  ctx.restore();
  ctx.strokeStyle = shade(col, -0.2); ctx.lineWidth = 6; rr(ctx, ax, ay, aw, ah, 14); ctx.stroke();
  // Klebestreifen an den Ecken des Bildes
  for (const [tx, ty, rot] of [[ax + 10, ay + 4, -0.6], [ax + aw - 10, ay + 4, 0.6]]) {
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(rot);
    ctx.fillStyle = 'rgba(255,246,214,0.82)'; ctx.fillRect(-38, -12, 76, 24);
    ctx.fillStyle = 'rgba(200,180,140,0.25)'; for (let k = -38; k < 38; k += 6) ctx.fillRect(k, -12, 2, 24);
    ctx.restore();
  }
  // Gründer-Stempel
  if (d.founder) {
    ctx.save(); ctx.translate(ax + 92, ay + ah - 40); ctx.rotate(-0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; rr(ctx, -78, -24, 156, 48, 10); ctx.fill();
    ctx.strokeStyle = '#e8484f'; ctx.lineWidth = 4; rr(ctx, -72, -18, 144, 36, 8); ctx.stroke();
    ctx.fillStyle = '#e8484f'; ctx.textAlign = 'center'; ctx.font = '900 18px Nunito, system-ui, sans-serif';
    ctx.fillText(tr('tc.founder', { n: d.number }), 0, 2);
    ctx.restore(); ctx.textAlign = 'left';
  }

  // Noch nicht ausgewachsen: Wachstums-Stempel
  if (info.locked) {
    ctx.save(); ctx.translate(ax + aw - 112, ay + ah - 46); ctx.rotate(0.1);
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; rr(ctx, -96, -32, 192, 64, 12); ctx.fill();
    ctx.strokeStyle = '#3b82c4'; ctx.lineWidth = 4; rr(ctx, -90, -26, 180, 52, 9); ctx.stroke();
    ctx.fillStyle = '#2f6fa8'; ctx.textAlign = 'center';
    ctx.font = '900 18px Nunito, system-ui, sans-serif'; ctx.fillText(`🐣 ${(info.stageName || 'Baby').toUpperCase()}`, 0, -7);
    ctx.font = '800 14px Nunito, system-ui, sans-serif'; ctx.fillText(tr('tc.hatIn', { until: info.unlockIn }), 0, 13);
    ctx.restore(); ctx.textAlign = 'left';
  }

  // Seltenheits-Band
  const by = ay + ah + 16;
  ctx.fillStyle = col; rr(ctx, 42, by, CW - 84, 52, 26); ctx.fill();
  ctx.fillStyle = '#fff'; starPath(ctx, 76, by + 26, 16, 7); ctx.fill();
  ctx.fillStyle = '#16213a'; ctx.font = '900 26px Nunito, system-ui, sans-serif';
  ctx.fillText(tier.name, 100, by + 27);
  ctx.textAlign = 'right'; ctx.font = '800 22px Nunito, system-ui, sans-serif';
  ctx.fillText(info.locked ? tr('tc.hatLocked') : tr('tc.hat', { hat: hatName }), CW - 66, by + 27);
  ctx.textAlign = 'left';

  // Werte
  let y = by + 80;
  ctx.font = '800 19px Nunito, system-ui, sans-serif';
  for (const [name, v] of cd.stats) {
    ctx.fillStyle = '#4b5b78'; ctx.fillText(name, 48, y);
    ctx.fillStyle = '#e7eef6'; rr(ctx, 190, y - 10, 330, 20, 10); ctx.fill();
    ctx.fillStyle = shade(col, -0.05); rr(ctx, 190, y - 10, 330 * (v / 100), 20, 10); ctx.fill();
    ctx.fillStyle = '#2b3a55'; ctx.textAlign = 'right'; ctx.fillText(String(v), CW - 48, y); ctx.textAlign = 'left';
    y += 32;
  }

  // Fähigkeiten
  y += 6;
  for (const [name, text, power] of cd.abilities) {
    ctx.strokeStyle = '#e3d9c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(48, y - 14); ctx.lineTo(CW - 48, y - 14); ctx.stroke();
    ctx.fillStyle = '#2b3a55'; ctx.font = '900 22px Nunito, system-ui, sans-serif'; ctx.fillText(name, 48, y + 6);
    const pips = Math.max(1, Math.min(5, Math.round(power / 20)));
    for (let k = 0; k < 5; k++) { ctx.fillStyle = k < pips ? shade(col, -0.3) : '#e3d9c4'; starPath(ctx, CW - 60 - (4 - k) * 24, y - 2, 10, 4.5); ctx.fill(); }
    ctx.fillStyle = '#5c6b86'; ctx.font = '600 17px Nunito, system-ui, sans-serif';
    y = wrap(ctx, text, 48, y + 32, CW - 140, 21) + 34;
  }

  // Fußzeile
  ctx.fillStyle = '#8a7a5a'; ctx.font = 'italic 600 16px Nunito, system-ui, sans-serif';
  const flavor = info.birthdayYears ? tr('tc.birthday', { n: info.birthdayYears }) : tr('tc.flavor', { text: cd.flavor });
  wrap(ctx, flavor, 48, CH - 84, CW - 96, 19);
  ctx.fillStyle = '#6f7f99';
  const foot = tr('tc.foot', { n: d.number ?? '?', since }) + (variantText ? ` · ${variantText}` : '');
  fitText(ctx, foot, CW - 96, 15, 700);
  ctx.fillText(foot, 48, CH - 50);
  // Adresse, damit ein geteiltes Bild zurück ins Meer führt
  const short = (info.url || '').replace(/^https?:\/\//, '').replace(/#.*$/, '').replace(/\/$/, '');
  ctx.fillStyle = '#de7856';
  fitText(ctx, `★ ${short || 'Stargazer Sea'}`, CW - 96, 16, 900);
  ctx.fillText(`★ ${short || 'Stargazer Sea'}`, 48, CH - 30);
  if (crabOfDay) {
    ctx.save(); ctx.translate(CW - 92, 150); ctx.rotate(0.25);
    ctx.fillStyle = '#ffcf3f'; starPath(ctx, 0, 0, 52, 26); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#6b4d00'; ctx.font = '900 13px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(tr('tc.cotd1'), 0, -4); ctx.fillText(tr('tc.cotd2'), 0, 12);
    ctx.restore();
  }
  return c;
}

/* ---------- Anzeigen & Teilen ---------- */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* Fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

let open = null;
export function closeTradingCard() {
  if (!open) return;
  open.el.classList.add('out');
  const el = open.el;
  setTimeout(() => el.remove(), 250);
  removeEventListener('keydown', open.onKey);
  open = null;
}

/**
 * info: { crab, data, tier, tierIndex, hatName, since, url, crabOfDay, reduced, toast }
 */
export function openTradingCard(info) {
  closeTradingCard();
  const portrait = renderPortrait(info.crab.portraitClone());
  const fallbackImg = new Image();
  fallbackImg.src = 'assets/crab.png';
  const canvasEl = drawCard({ ...info, portrait, fallbackImg });
  const holo = info.tierIndex >= 3;

  const el = document.createElement('div');
  el.id = 'tcard';
  el.innerHTML = `
    <div class="tc-backdrop"></div>
    <div class="tc-box" role="dialog" aria-modal="true" aria-label="${tr('tc.aria', { login: info.data.login.replace(/[<>&"]/g, '') })}">
      <div class="tc-tilt ${info.reduced ? '' : 'tc-flip'}">
        <div class="tc-card"></div>
        <div class="tc-shine ${holo ? 'holo' : ''} ${info.tier.id}"></div>
      </div>
      <div class="tc-actions">
        <button class="btn tc-copy">${tr('tc.copy')}</button>
        ${navigator.share ? `<button class="btn tc-share">${tr('tc.share')}</button>` : ''}
        <button class="btn tc-save">${tr('tc.save')}</button>
        ${info.onShow ? `<button class="btn tc-show">${tr('tc.show')}</button>` : ''}
      </div>
      <button class="tc-close" aria-label="${tr('close')}">✕</button>
    </div>`;
  el.querySelector('.tc-card').appendChild(canvasEl);
  document.body.appendChild(el);

  // 3D-Kippen + Glanz folgt der Maus / dem Finger
  const tilt = el.querySelector('.tc-tilt'), shine = el.querySelector('.tc-shine');
  const move = (e) => {
    if (info.reduced) return;
    const r = tilt.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) - 0.5, py = ((e.clientY - r.top) / r.height) - 0.5;
    tilt.style.transform = `rotateY(${px * 18}deg) rotateX(${-py * 14}deg)`;
    shine.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
    shine.style.setProperty('--my', `${(py + 0.5) * 100}%`);
  };
  tilt.addEventListener('pointermove', move);
  tilt.addEventListener('pointerleave', () => { tilt.style.transform = ''; });

  const blob = () => new Promise((res) => canvasEl.toBlob(res, 'image/png'));
  const fileName = tr('tc.file', { login: info.data.login });
  el.querySelector('.tc-copy').addEventListener('click', async () => {
    const ok = await copyText(info.url);
    info.toast(ok ? tr('tc.copied', { url: info.url.replace(/[<>&"]/g, '') }) : tr('tc.copyFail', { url: info.url }));
  });
  el.querySelector('.tc-share')?.addEventListener('click', async () => {
    const nr = Number.isInteger(info.data.variant) ? info.data.variant : null;
    const hat = info.data.hat && info.data.hat !== 'none' ? info.hatName : '';
    const text = info.locked
      ? tr('share.locked', { tier: info.tier.name, stageId: info.stageId, stage: info.stageName, until: info.unlockIn })
      : tr('share.grown', { tier: info.tier.name, nr, hat });
    try {
      const b = await blob();
      const file = b && new File([b], fileName, { type: 'image/png' });
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title: 'Stargazer Sea', text, url: info.url, files: [file] });
      else await navigator.share({ title: 'Stargazer Sea', text, url: info.url });
    } catch { /* abgebrochen */ }
  });
  el.querySelector('.tc-save').addEventListener('click', async () => {
    const b = await blob();
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  el.querySelector('.tc-show')?.addEventListener('click', () => { closeTradingCard(); info.onShow(); });
  el.querySelector('.tc-close').addEventListener('click', closeTradingCard);
  el.querySelector('.tc-backdrop').addEventListener('click', closeTradingCard);
  const onKey = (e) => { if (e.key === 'Escape') closeTradingCard(); };
  addEventListener('keydown', onKey);
  open = { el, onKey, canvas: canvasEl };
  return canvasEl;
}

export function tradingCardOpen() { return open; }
