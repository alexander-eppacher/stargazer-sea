import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildOcean, heightAt, WORLD } from './ocean.js';
import { Crab, setPointScale, LABEL_SIZE } from './crab.js';
import * as sound from './sound.js';
import { openTradingCard, closeTradingCard, tradingCardOpen, portraitThumb } from './card.js';
import { openAlbum, closeAlbum, albumOpen, albumGo } from './album.js';
import { SERIES, variantLabel, editionOf } from './variants.js';
import { updateHatMaterials } from './hats.js';
import { growthOf, newsBetween, timeLeft, untilText, STAGES, UNLOCK } from './growth.js';
import { shared } from './shaders.js';
import { t as tr, locale } from './lang.js';
import { mulberry32, hashString, range, pick, easeInOut, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const POLL_MS = 90_000;
const LOAD = window.__load || { set() {} };
// kurz Luft holen, damit der Browser die Ladeanzeige zeichnen kann (auch in Hintergrund-Tabs)
const tick = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
const params = new URLSearchParams(location.search);
// Browser-Speicher (kann gesperrt sein – dann läuft alles trotzdem)
const store = {
  get(k) { try { return localStorage.getItem(`stargazer.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`stargazer.${k}`, v); } catch { /* egal */ } },
  del(k) { try { localStorage.removeItem(`stargazer.${k}`); } catch { /* egal */ } },
};
// Testen: ?datum=2026-12-24 (Datum erzwingen)
const FORCED_DATE = /^\d{4}-\d{2}-\d{2}$/.test(params.get('datum') || '') ? params.get('datum') : null;
function today() { return FORCED_DATE ? new Date(`${FORCED_DATE}T12:00:00`) : new Date(); }
// Uhr fürs Wachsen. Zum Ausprobieren: ?vorspulen=50 (Stunden in die Zukunft)
let timeShift = (parseFloat(params.get('vorspulen')) || 0) * 3_600_000;
function realNow() { return FORCED_DATE ? today().getTime() : Date.now(); }
function nowMs() { return realNow() + timeShift; }
const growth = (d) => growthOf(d, nowMs());
// "Bewegung reduzieren" aus dem Betriebssystem
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let REDUCED = motionQuery.matches || params.has('reduced');
motionQuery.addEventListener?.('change', (e) => { REDUCED = e.matches; underwater.uniforms.uWobble.value = REDUCED ? 0 : 1; });
LOAD.set(48, tr('load.gl'));

/* =========================================================
   Renderer & Szene
   ========================================================= */
const canvas = $('sea');
let renderer;
for (const opts of [{ powerPreference: 'high-performance' }, { powerPreference: 'default' }, { powerPreference: 'low-power', precision: 'mediump' }]) {
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, ...opts }); break; } catch { /* nächste Variante */ }
}
if (!renderer) {
  window.__seaFailed = true;
  const ff = /firefox/i.test(navigator.userAgent);
  $('loader').classList.remove('intro');
  $('loader').innerHTML = `<div class="gl-help">
    <h2>${tr('gl.title')}</h2>
    <p>${tr('gl.text')}</p>
    <p>${tr(ff ? 'gl.firefox' : 'gl.chrome')}</p>
    <p>${tr('gl.check')}</p>
  </div>`;
  throw new Error('WebGL nicht verfügbar');
}
const lowEnd = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
let maxPixelRatio = Math.min(devicePixelRatio, lowEnd ? 1.25 : 1.75);
renderer.setPixelRatio(maxPixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 1500);
// Start direkt unter der Wasseroberfläche (von dort taucht die Intro-Kamera hinab)
const INTRO_FROM = new THREE.Vector3(13, 31.5, 46), INTRO_CTRL = new THREE.Vector3(-11, 22, 44);
camera.position.copy(REDUCED ? new THREE.Vector3(0, 11, 34) : INTRO_FROM);

const hemi = new THREE.HemisphereLight(0xe2f8ff, 0x7fa9b8, 0.95);
scene.add(hemi);
// Sonne von vorne-oben: Pappaufsteller werfen weiche Schatten nach hinten
const sun = new THREE.DirectionalLight(0xfff1d6, 2.8);
sun.position.set(-14, 36, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun);

const gpuName = (() => {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch { return ''; }
})();
// Zwischenbilder des Composers: 8 Bit im sRGB-Format (SRGB8_ALPHA8). HalfFloat-Zwischenbilder haben auf
// manchen Geräten (z. B. AMD-Grafik unter Windows in Brave) große Teile des Bildes schwarz gelassen,
// und der Grafikkarten-Name ist dort nicht lesbar. sRGB-8-Bit vermeidet Farbstufen in dunklen Verläufen;
// die Passes lesen und schreiben trotzdem linear (die Grafikkarte wandelt selbst um).
// Schalter zum Testen: ?hdr=1 (HalfFloat wie früher)  ?msaa=0  ?fx=0 (ohne Composer)  ?diag=1
const SW = { hdr: params.get('hdr') === '1', fx: params.get('fx') !== '0' };
const activeSwitches = ['hdr', 'msaa', 'fx', 'diag'].filter((k) => params.has(k)).map((k) => `${k}=${params.get(k)}`);
const msaa = params.has('msaa') ? params.get('msaa') !== '0' : !lowEnd;
const rt = new THREE.WebGLRenderTarget(1, 1, { type: SW.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: msaa ? 4 : 0 });
if (!SW.hdr) rt.texture.colorSpace = THREE.SRGBColorSpace;
const composer = new EffectComposer(renderer, rt);
try { localStorage.removeItem('stargazer.msaa'); } catch { /* alter Merker der früheren Selbstprüfung */ }
composer.addPass(new RenderPass(scene, camera));
// Schwelle unter 1.0: in 8-Bit-Zwischenbildern kommt nichts mehr über 1.0 (die internen Bloom-Ziele sind in three HalfFloat)
const BLOOM_T = SW.hdr ? 1.0 : 0.88;
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.35, BLOOM_T);
composer.addPass(bloom);
// Unterwasser-Look: leichte Wellen-Verzerrung, Blaugrün-Tönung, Vignette
const underwater = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: shared.uTime, uWobble: { value: REDUCED ? 0 : 1 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uWobble; uniform float uNight; varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      uv.x += sin(uv.y * 18.0 + uTime * 1.3) * 0.0006 * uWobble;
      uv.y += cos(uv.x * 14.0 + uTime * 1.1) * 0.0006 * uWobble;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      c *= vec3(0.98, 1.0, 1.01);
      // etwas mehr Kontrast: Papierfiguren heben sich klarer ab
      c = mix(c, smoothstep(0.0, 1.0, c), 0.22);
      // Papiermaserung über dem ganzen Bild
      vec2 px = floor(gl_FragCoord.xy / 1.5);
      float n = fract(sin(dot(px, vec2(12.9898, 78.233))) * 43758.5453);
      c *= 0.975 + n * 0.04;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.32);
      vec2 q = vUv - 0.5;
      float vig = 1.0 - dot(q, q) * 0.9;
      c *= mix(0.86 - uNight * 0.24, 1.0, smoothstep(0.0, 1.0, vig));
      c *= mix(vec3(1.0), vec3(0.82, 0.92, 1.12), uNight); // nachts kühler
      // Sättigung oben kann Farbkanäle unter 0 drücken → später pow() im OutputPass = ungültiger Wert
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
});
composer.addPass(underwater);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 4;
controls.maxDistance = 58;
// Ganz rundherum drehen; nicht von unten und nicht senkrecht von oben
const POLAR_MIN = Math.PI * 0.12, POLAR_MAX = Math.PI * 0.47;
controls.minPolarAngle = POLAR_MIN;
controls.maxPolarAngle = POLAR_MAX;
// Verschieben (rechte Maustaste / zwei Finger) nur flach über den Boden, zoomen zur Maus hin
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.autoRotate = false;
controls.enabled = false;

let idleTimer = null;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  fly = null;
  clearTimeout(idleTimer);
  $('hint').style.opacity = 0;
});
controls.addEventListener('end', () => {
  clearTimeout(idleTimer);
});

/* ---------- Saison & Tageszeit ---------- */
// Testen: ?saison=winter|halloween|keine  und  ?zeit=22 (Uhrzeit 0–24)
function seasonFor(d = today()) {
  const forced = params.get('saison');
  if (forced) return forced === 'keine' ? null : forced;
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 12 || (m === 1 && day <= 6)) return 'winter';
  if ((m === 10 && day >= 15) || (m === 11 && day <= 2)) return 'halloween';
  return null;
}
const SEASON = seasonFor();
let forcedHour = params.has('zeit') ? parseFloat(params.get('zeit')) : null;
function hourNow() {
  if (forcedHour !== null && !Number.isNaN(forcedHour)) return forcedHour;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}
function dayPhase(h) {
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const night = h >= 12 ? sm(18.5, 21.5, h) : 1 - sm(5.5, 8, h);
  const dusk = Math.max(0, 1 - Math.abs(h - 19.8) / 1.7) + Math.max(0, 1 - Math.abs(h - 6.6) / 1.3);
  return { night, dusk: Math.min(1, dusk) };
}

LOAD.set(55, tr('load.reef'));
await tick();
const ocean = buildOcean(scene, renderer, camera, { season: SEASON });
LOAD.set(72, tr('load.reefDone'));
await tick();

function pointScale() {
  return renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
setPointScale(pointScale());

/** Diagnose: Zeichenfläche und Composer-Ziele müssen gleich groß sein, sonst Warnung. */
function checkSizes(where) {
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  const a = composer.renderTarget1, b = composer.renderTarget2;
  if (a.width !== db.x || a.height !== db.y || b.width !== db.x || b.height !== db.y) {
    console.warn(`[Stargazer Sea] Größen passen nicht (${where}): Zeichenfläche ${db.x}×${db.y}, rt1 ${a.width}×${a.height}, rt2 ${b.width}×${b.height}`);
  }
}
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(maxPixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  // Composer in ganzen Pixeln, genau so groß wie die Zeichenfläche (der Renderer rundet ab, CSS × Pixelverhältnis nicht)
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  composer.setPixelRatio(1);
  composer.setSize(db.x, db.y);
  // Bewusst: Bloom in CSS-Größe statt Pixelgröße. Das ist günstiger, und der weiche Look ist so abgestimmt.
  bloom.setSize(innerWidth, innerHeight);
  checkSizes('resize');
  ocean.resize();
  setPointScale(pointScale());
}
addEventListener('resize', resize);
resize();

/* ---------- Tag & Nacht anwenden ---------- */
const C_DAY = new THREE.Color(0x4aaedb), C_NIGHT = new THREE.Color(0x0f2f5c), C_DUSK = new THREE.Color(0xd08a96);
const SUN_DAY = new THREE.Color(0xfff1d6), MOON = new THREE.Color(0xa8c0ff), SUN_DUSK = new THREE.Color(0xffb08a);
const HEMI_DAY = new THREE.Color(0xe2f8ff), HEMI_NIGHT = new THREE.Color(0x6f8fd6);
function applyEnv() {
  const { night, dusk } = dayPhase(hourNow());
  ctx.night = night;
  WORLD.fogColor.copy(C_DAY).lerp(C_NIGHT, night).lerp(C_DUSK, dusk * 0.3);
  scene.fog.color.copy(WORLD.fogColor);
  scene.background.copy(WORLD.fogColor);
  hemi.intensity = 0.95 - night * 0.55;
  hemi.color.copy(HEMI_DAY).lerp(HEMI_NIGHT, night);
  sun.intensity = 2.8 - night * 2.0;
  sun.color.copy(SUN_DAY).lerp(MOON, night).lerp(SUN_DUSK, dusk * 0.45);
  renderer.toneMappingExposure = 1.0 - night * 0.1;
  bloom.strength = 0.22 + night * 0.4;
  bloom.threshold = BLOOM_T - night * 0.25;
  underwater.uniforms.uNight.value = night;
  ocean.setEnv(night, dusk);
  document.documentElement.dataset.night = night > 0.5 ? '1' : '0';
}

/* =========================================================
   Daten
   ========================================================= */
function detectRepo() {
  const cfg = window.STARGAZER_CONFIG || {};
  let { owner, repo } = cfg;
  if ((!owner || !repo) && location.hostname.endsWith('.github.io')) {
    owner ||= location.hostname.split('.')[0];
    repo ||= location.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
  }
  return owner && repo ? { owner, repo } : null;
}

async function loadJSON(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

const tiers = (await loadJSON('data/rarities.json')).tiers;
// Namen in der gewählten Sprache (Deutsch steht direkt in rarities.json)
for (const tier of tiers) {
  tier.name = tr(`tier.${tier.id}`, null, tier.name);
  for (const h of tier.hats) h.name = tr(`hat.${h.id}`, null, h.name);
}
const tierById = Object.fromEntries(tiers.map((t) => [t.id, t]));
const hatName = Object.fromEntries(tiers.flatMap((t) => t.hats.map((h) => [h.id, h.name])));
const totalWeight = tiers.reduce((s, t) => s + t.weight, 0);

function demoCrabs() {
  const rng = mulberry32(1337);
  const a = ['coral', 'reef', 'tide', 'bubble', 'kelp', 'shell', 'pearl', 'wave', 'sandy', 'nautilus', 'octo', 'salty', 'deep', 'drift', 'lagoon', 'squid'];
  const b = ['dev', 'coder', 'hacker', 'bot', 'byte', 'pixel', '42', 'lab', 'ops', 'js', 'rs', 'py', 'io', 'git'];
  const out = [];
  const usedV = {};
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < 52; i++) {
    let tier;
    if (i < tiers.length) tier = tiers[tiers.length - 1 - i];
    else {
      let r = rng() * totalWeight;
      tier = tiers.find((t) => (r -= t.weight) <= 0) || tiers[0];
    }
    // einzigartige Sorte pro Seltenheit
    usedV[tier.id] ||= new Set();
    let v;
    do { v = 1 + Math.floor(rng() * SERIES); } while (usedV[tier.id].has(v));
    usedV[tier.id].add(v);
    out.push({
      id: -(i + 1),
      login: `${pick(rng, a)}-${pick(rng, b)}${rng() < 0.4 ? Math.floor(rng() * 99) : ''}`,
      rarity: tier.id,
      variant: v,
      hat: pick(rng, tier.hats).id,
      firstStarredAt: new Date(start + i * 86400000 * 3.3).toISOString(),
      starred: true,
      demo: true,
    });
  }
  // Drei junge Krabben, damit man das Wachsen auch im Demo-Meer sieht
  [6, 30, 54].forEach((h, k) => { out[out.length - 1 - k].firstStarredAt = new Date(realNow() - h * 3_600_000).toISOString(); });
  return out;
}

let allCrabsData = [];
let demo = false;
async function fetchCrabs() {
  try {
    const d = await loadJSON('crabs.json');
    return Array.isArray(d.crabs) ? d.crabs : [];
  } catch (e) {
    console.warn('crabs.json konnte nicht geladen werden', e);
    return null; // unbekannt – vorhandene Krabben NICHT entfernen
  }
}

/* =========================================================
   Krabben-Verwaltung
   ========================================================= */
const crabs = new Map(); // id -> Crab
const hitTargets = [];
let mineId = Number(store.get('meineKrabbe')) || null; // "Das bin ich" (nur in diesem Browser)

const ctx = {
  heightAt,
  growthOf: growth,
  bubbles: ocean.bubbles,
  season: SEASON,
  night: 0,
  isFree(x, z, r) {
    return ocean.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r) && !inRoomZone(x, z, r * 0.5);
  },
  avoid(crab) {
    let ax = 0, az = 0;
    // Platz für die angeklickte Krabbe freihalten
    if (selected && crab !== selected && inRoomZone(crab.x, crab.z)) {
      const e = escapeDir(crab);
      ax += e.x * 2.6; az += e.z * 2.6;
    }
    for (const o of ocean.obstacles) {
      const dx = crab.x - o.x, dz = crab.z - o.z;
      const d = Math.hypot(dx, dz), lim = o.r + 1.4;
      if (d < lim && d > 0.001) { const k = ((lim - d) / lim) * 2.2; ax += (dx / d) * k; az += (dz / d) * k; }
    }
    for (const other of neighbors(crab)) {
      const dx = crab.x - other.x, dz = crab.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.7 && d > 0.001) { const k = ((2.7 - d) / 2.7) * 2.0; ax += (dx / d) * k; az += (dz / d) * k; }
    }
    return { x: ax, z: az };
  },
  resolve(crab) {
    for (const o of ocean.obstacles) {
      const dx = crab.x - o.x, dz = crab.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + 0.6;
      if (d < min) {
        const k = d > 0.001 ? min / d : 1;
        crab.x = o.x + (d > 0.001 ? dx : min) * k;
        crab.z = o.z + (d > 0.001 ? dz : 0) * k;
      }
    }
    for (const other of neighbors(crab)) {
      const dx = crab.x - other.x, dz = crab.z - other.z;
      const d = Math.hypot(dx, dz);
      const minD = crab.state === 'greet' && crab.partner === other ? 1.5 : 1.85;
      if (d < minD && d > 0.001) {
        const push = (minD - d) * 0.35;
        crab.x += (dx / d) * push; crab.z += (dz / d) * push;
      }
    }
    const r = Math.hypot(crab.x, crab.z), max = WORLD.crabRadius + 2;
    if (r > max) { crab.x *= max / r; crab.z *= max / r; }
  },
  onLand(crab) {
    if (crab.isNew) { ocean.chest.flash(); sound.chime(); }
    sound.bubble(0.8);
    // Nachbarn erschrecken sich kurz und freuen sich dann
    for (const other of crabs.values()) {
      if (other === crab || other.drop > 0 || !other.root.visible) continue;
      if (Math.hypot(other.x - crab.x, other.z - crab.z) < 5) other.surprise();
    }
  },
  /** Wie viele Krabben stehen schon an dieser Stelle? */
  crowd(x, z, r) {
    let n = 0;
    const gx = Math.floor(x / GRID), gz = Math.floor(z / GRID), cells = Math.ceil(r / GRID);
    for (let i = -cells; i <= cells; i++) for (let j = -cells; j <= cells; j++) {
      const cell = grid.get(`${gx + i},${gz + j}`);
      if (cell) for (const c of cell) if (Math.hypot(c.x - x, c.z - z) < r) n++;
    }
    return n;
  },
  /** Eine freie Krabbe in der Nähe für eine Begegnung. */
  findPartner(crab) {
    let best = null, bestD = 3.4;
    for (const o of neighbors(crab)) {
      if (o.busy() || o.greetCd > 0 || o === selected || !['idle', 'walk', 'snap', 'bubbles'].includes(o.state)) continue;
      const d = Math.hypot(o.x - crab.x, o.z - crab.z);
      if (d < bestD) { best = o; bestD = d; }
    }
    if (crab === selected) return null;
    return best;
  },
};

applyEnv();
setInterval(applyEnv, 30_000);

// Einfaches Raster für Nachbarsuche
const GRID = 2.5;
let grid = new Map();
function rebuildGrid() {
  grid = new Map();
  for (const c of crabs.values()) {
    if (c.drop > 0 || !c.root.visible) continue;
    const k = `${Math.floor(c.x / GRID)},${Math.floor(c.z / GRID)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(c);
  }
}
function* neighbors(crab) {
  const gx = Math.floor(crab.x / GRID), gz = Math.floor(crab.z / GRID);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const cell = grid.get(`${gx + i},${gz + j}`);
      if (cell) for (const c of cell) if (c !== crab) yield c;
    }
  }
}

function homeSpot(id) {
  const rng = mulberry32(hashString(`home-${id}`));
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(range(rng, 3.5 * 3.5, WORLD.crabRadius ** 2));
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (ctx.isFree(x, z, 1)) return { x, z };
  }
  return { x: 4, z: 4 };
}

function addCrab(data, { isNew = false, delay = 0 } = {}) {
  const tier = tierById[data.rarity] || tiers[0];
  const crab = new Crab(data, tier, ctx);
  const h = homeSpot(data.id);
  crab.place(h.x, h.z);
  crab.isNew = isNew;
  // Neue Babys schlüpfen dort, wo sie wohnen; beim Laden schweben alle Krabben ins Meer
  if (isNew && crab.stage === 0 && !REDUCED) { crab.hatchIn(delay); sound.chime(); }
  else crab.dropIn(REDUCED ? 0.6 : isNew ? 18 : range(Math.random, 8, 16), REDUCED ? 0 : delay);
  scene.add(crab.root);
  crabs.set(data.id, crab);
  hitTargets.push(crab.pickTarget);
  if (data.id === mineId) crab.setMine(true);
  if (birthdayYears(data)) crab.setBirthday(true);
  return crab;
}

function removeCrab(id) {
  const c = crabs.get(id);
  if (!c) return;
  if (selected === c) select(null);
  c.dispose(scene);
  hitTargets.splice(hitTargets.indexOf(c.pickTarget), 1);
  crabs.delete(id);
}

const FOUNDERS = 100; // die ersten 100 Krabben tragen für immer ein Gründer-Fähnchen
function numberCrabs(list) {
  [...list].sort((a, b) => (a.firstStarredAt < b.firstStarredAt ? -1 : a.firstStarredAt > b.firstStarredAt ? 1 : a.id - b.id))
    .forEach((c, i) => { c.number = i + 1; c.founder = !c.demo && !c.example && c.number <= FOUNDERS; });
}

/** Krabbentag: Jahrestag des ersten Sterns -> Anzahl Jahre (sonst 0). */
function birthdayYears(d) {
  if (!d?.firstStarredAt || d.demo || d.example) return 0;
  const f = new Date(d.firstStarredAt), t = today();
  return f.getMonth() === t.getMonth() && f.getDate() === t.getDate() ? Math.max(0, t.getFullYear() - f.getFullYear()) : 0;
}

// Solange es wenige echte Krabben gibt, füllen Beispiel-Krabben das Meer auf (zählen nirgends mit)
const MIN_SEA = 30;
let exampleCache = null;
function exampleCrabs() {
  exampleCache ||= demoCrabs().slice(0, MIN_SEA).map((c, i) => ({ ...c, id: -(1001 + i), login: tr('example.login'), demo: false, example: true }));
  return exampleCache;
}
let fullList = []; // alle Einträge aus crabs.json (auch ohne Stern)

async function syncCrabs(initial = false) {
  let list = await fetchCrabs();
  if (list === null) {
    if (!initial) return; // Netzwerkfehler beim Nachladen: alles so lassen
    list = [];
  }
  list = list.filter((c) => c && c.id != null && typeof c.login === 'string');
  numberCrabs(list);
  fullList = list;
  let active = list.filter((c) => c.starred !== false && c.login);
  if (initial && !active.length) {
    demo = true;
    active = demoCrabs();
    numberCrabs(active);
    $('demo-banner').classList.remove('hidden');
  } else if (active.length && demo) {
    demo = false;
    for (const id of [...crabs.keys()]) removeCrab(id);
    $('demo-banner').classList.add('hidden');
  }
  if (demo && !initial) return;

  allCrabsData = active;
  LOAD.set(84, tr('load.crabs'));
  const fill = demo ? [] : exampleCrabs().slice(0, Math.max(0, MIN_SEA - active.length));
  const inSea = [...active, ...fill];
  const ids = new Set(inSea.map((c) => c.id));
  for (const id of [...crabs.keys()]) if (!ids.has(id)) removeCrab(id);
  let delay = 0;
  const arrived = [];
  for (const c of inSea) {
    if (crabs.has(c.id)) {
      const crab = crabs.get(c.id), wasSealed = !!crab.data.sealed;
      crab.data = { ...crab.data, ...c };
      if (!c.sealed) delete crab.data.sealed;
      if (wasSealed && !c.sealed) crab.applyLook(); // Action hat ausgepackt: echte Sorte übernehmen
      continue;
    }
    if (initial || c.example) {
      addCrab(c, { delay: (initial ? 2.2 : 0.5) + Math.min(delay, 3.5) + Math.random() * 0.6 });
      delay += 3.5 / Math.max(inSea.length, 1);
    } else {
      const crab = addCrab(c, { isNew: true });
      arrived.push(crab);
      if (!isAwaited(c)) {
        const v = { login: escapeHtml(c.login), color: crab.tier.color };
        toast(crab.locked ? tr('toast.hatched', { ...v, tier: crab.tier.name }) : tr('toast.arrived', { ...v, hat: hatName[c.hat] || '' }));
      }
    }
  }
  updateUI();
  updateCrabOfDay();
  if (!initial) checkGrowth();
  updateAlbumBadge();
  checkAwaited(initial);
}

/* =========================================================
   Oberfläche
   ========================================================= */
const repo = detectRepo();
const starBtn = $('star-btn');
const repoUrl = repo ? `https://github.com/${repo.owner}/${repo.repo}` : 'https://github.com';
starBtn.href = repoUrl;

function avatarUrl(c, size = 64) {
  return c.id > 0 ? `https://avatars.githubusercontent.com/u/${c.id}?s=${size}&v=4` : 'assets/crab.png';
}
function longDate(iso) {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function updateUI() {
  $('crab-count').textContent = allCrabsData.length;
  const counts = Object.fromEntries(tiers.map((t) => [t.id, 0]));
  for (const c of allCrabsData) counts[c.rarity] = (counts[c.rarity] || 0) + 1;
  $('legend-list').innerHTML = tiers.map((t) => `
    <li class="${t.id}">
      <span class="gem" style="background:${t.color}; box-shadow:0 0 8px ${t.color}"></span>
      <span style="color:${t.color}; font-weight:800">${t.name}</span>
      <span class="pct">${((t.weight / totalWeight) * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%</span>
      <span class="cnt">${counts[t.id]}<small>/${SERIES}</small></span>
      <span class="hats">${t.hats.map((h) => h.name).join(' · ')}</span>
    </li>`).join('');

  const newest = [...allCrabsData].sort((a, b) => (a.firstStarredAt < b.firstStarredAt ? 1 : -1)).slice(0, 6);
  $('newest-list').innerHTML = newest.map((c) => `
    <li data-id="${c.id}">
      <img src="${avatarUrl(c, 44)}" alt="" loading="lazy" />
      <span class="name">@${escapeHtml(c.login)}</span>
      <span class="dot" style="background:${tierById[c.rarity]?.color}"></span>
    </li>`).join('');
}

$('newest-list').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) focusCrab(crabs.get(Number(li.dataset.id)));
});

for (const [panelId, btnId] of [['legend', 'legend-toggle'], ['newest', 'newest-toggle']]) {
  $(btnId).addEventListener('click', () => {
    const l = $(panelId);
    l.classList.toggle('collapsed');
    $(btnId).setAttribute('aria-expanded', !l.classList.contains('collapsed'));
  });
}

/* ---------- Sound ---------- */
const soundBtn = $('sound-btn');
function setSoundBtn(on) {
  soundBtn.textContent = on ? '🔊' : '🔇';
  soundBtn.setAttribute('aria-pressed', on);
  soundBtn.title = tr(on ? 'sound.off' : 'sound.on');
}
setSoundBtn(false);
soundBtn.addEventListener('click', async () => setSoundBtn(await sound.setSound(!sound.isOn())));
// Wer den Ton schon mal an hatte, bekommt ihn beim ersten Klick irgendwo wieder (Browser erlauben Ton erst nach einer Geste)
if (sound.wantedBefore()) {
  const resume = async () => { if (!sound.isOn()) setSoundBtn(await sound.setSound(true)); };
  addEventListener('pointerdown', resume, { once: true });
}

/* ---------- Krabbe des Tages ---------- */
// Jeden Tag (lokales Datum) wird eine Krabbe ausgelost – für alle Besucher dieselbe.
let crabOfDay = null;
function todayKey() {
  const d = today();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function updateCrabOfDay() {
  const list = [...allCrabsData].sort((a, b) => a.id - b.id);
  const pickData = list.length ? list[hashString(`cotd-${todayKey()}`) % list.length] : null;
  const next = pickData ? crabs.get(pickData.id) : null;
  if (crabOfDay && crabOfDay !== next) crabOfDay.setSpecial(false);
  crabOfDay = next || null;
  const chip = $('cotd');
  if (!crabOfDay) { chip.classList.add('hidden'); return; }
  crabOfDay.setSpecial(true);
  $('cotd-name').textContent = `@${crabOfDay.data.login}`;
  chip.classList.remove('hidden');
}
$('cotd').addEventListener('click', () => focusCrab(crabOfDay));
let dayKey = todayKey();
setInterval(() => {
  if (todayKey() === dayKey) return;
  dayKey = todayKey();
  updateCrabOfDay();
  for (const c of crabs.values()) c.setBirthday(birthdayYears(c.data) > 0);
}, 60_000);

/* ---------- Suche ---------- */
const search = $('search'), results = $('search-results');
let activeIdx = 0, resultList = [];
function renderResults() {
  const q = search.value.trim().replace(/^@/, '').toLowerCase();
  if (!q) { results.innerHTML = ''; resultList = []; return; }
  resultList = allCrabsData.filter((c) => c.login.toLowerCase().includes(q))
    .sort((a, b) => a.login.toLowerCase().indexOf(q) - b.login.toLowerCase().indexOf(q))
    .slice(0, 8);
  activeIdx = 0;
  results.innerHTML = resultList.length
    ? resultList.map((c, i) => `
      <li data-id="${c.id}" class="${i === 0 ? 'active' : ''}">
        <img src="${avatarUrl(c, 44)}" alt="" loading="lazy" />@${escapeHtml(c.login)}
        <span class="dot" style="background:${tierById[c.rarity]?.color}"></span>
      </li>`).join('')
    : `<li style="cursor:default;color:var(--muted)">${tr('search.none')}</li>`;
}
search.addEventListener('input', renderResults);
search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    activeIdx = clamp(activeIdx + (e.key === 'ArrowDown' ? 1 : -1), 0, resultList.length - 1);
    [...results.children].forEach((li, i) => li.classList.toggle('active', i === activeIdx));
  } else if (e.key === 'Enter' && resultList[activeIdx]) {
    pickResult(resultList[activeIdx].id);
  } else if (e.key === 'Escape') {
    search.value = ''; renderResults(); search.blur();
  }
});
results.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (li) pickResult(Number(li.dataset.id));
});
function pickResult(id) {
  search.value = ''; renderResults(); search.blur();
  focusCrab(crabs.get(id));
}

/* ---------- Toast ---------- */
function toast(html) {
  const el = document.createElement('div');
  el.className = 'toast panel';
  el.innerHTML = html;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 5000);
  setTimeout(() => el.remove(), 5800);
}

/* =========================================================
   Auswahl, Karte & Kamera
   ========================================================= */
let selected = null, following = false, fly = null, hovered = null;

function select(crab) {
  if (selected) selected.setSelected(false);
  selected = crab;
  following = false;
  setFollowBtn(false);
  if (!crab) {
    $('card').classList.add('hidden');
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  crab.setSelected(true);
  crab.celebrate(1.6);
  coachDone('tap');
  roomTimer = 0;
  const d = crab.data, tier = crab.tier;
  const card = $('card');
  card.classList.toggle('example', !!d.example);
  if (d.example) {
    $('card-avatar').src = 'assets/crab.png';
    $('card-login').textContent = tr('card.exampleName');
    $('card-login').removeAttribute('href');
    $('card-number').textContent = tr('card.exampleSub');
    $('card-cotd').classList.add('hidden');
    card.classList.add('hidden'); void card.offsetWidth; card.classList.remove('hidden');
    return;
  }
  $('card-avatar').src = avatarUrl(d, 112);
  const login = $('card-login');
  login.textContent = `@${d.login}`;
  login.href = d.id > 0 ? `https://github.com/${d.login}` : '#';
  $('card-number').textContent = tr('card.number', { n: d.number ?? '?', demo: d.demo, founder: d.founder });
  $('card-cotd').classList.toggle('hidden', crab !== crabOfDay);
  const badge = $('card-rarity');
  badge.textContent = tier.name;
  badge.className = `rarity-badge ${tier.id}`;
  badge.style.background = tier.color;
  growFields(crab);
  const years = birthdayYears(d);
  $('card-since').textContent = longDate(d.firstStarredAt) + (years ? tr('card.birthday', { n: years }) : '');
  updateMineBtn();
  $('card-share').classList.remove('pulse');
  card.classList.add('hidden');
  void card.offsetWidth; // Animation neu starten
  card.classList.remove('hidden');
  history.replaceState(null, '', `#@${d.login}`);
}

/** Infokarte: Größe, Hut und Sorte (Hut und Sorte bleiben eingepackt, bis die Krabbe halbstark ist). */
function growFields(crab) {
  const d = crab.data, tier = crab.tier, g = growth(d), now = nowMs();
  $('card-grow').textContent = g.nextAt
    ? tr('card.grows', { icon: g.stage.icon, stage: g.stage.name, time: timeLeft(g.nextAt - now) })
    : `${g.stage.icon} ${g.stage.name}`;
  if (g.locked) {
    $('card-hat').textContent = tr('card.hatLocked', { until: untilText(g.unlockAt - now) });
    $('card-variant').textContent = tr('card.variantLocked');
    return;
  }
  $('card-hat').textContent = (hatName[d.hat] || d.hat) + (crab.seasonHat ? tr('card.season', { hat: tr(crab.seasonHat === 'santa' ? 'season.santa' : 'season.witch') }) : '');
  $('card-variant').textContent = Number.isInteger(d.variant) ? tr('card.variantNr', { v: d.variant, label: variantLabel(tier, d.variant) }) : '–';
}

/* ---------- Platz machen für die angeklickte Krabbe ---------- */
// Freihalten: ein Kreis um die Krabbe + ein "Gang" zwischen ihr und der Kamera, damit niemand davor steht.
const ROOM_R = 2.3, LANE_W = 1.4;
let roomTimer = 0;
function viewPoint() { return fly && fly.crab === selected ? fly.toPos : camera.position; }
function lane() {
  const v = viewPoint();
  let lx = v.x - selected.x, lz = v.z - selected.z;
  const L = Math.hypot(lx, lz) || 1;
  return { lx: lx / L, lz: lz / L, L };
}
function inRoomZone(x, z, pad = 0) {
  if (!selected || selected.drop > 0 || !selected.root.visible) return false;
  const dx = x - selected.x, dz = z - selected.z;
  if (Math.hypot(dx, dz) < ROOM_R + pad) return true;
  const { lx, lz, L } = lane();
  const t = dx * lx + dz * lz;
  if (t <= 0 || t > Math.min(L, 11)) return false;
  return Math.abs(dx * lz - dz * lx) < LANE_W + pad;
}
function escapeDir(c) {
  const { lx, lz } = lane();
  const dx = c.x - selected.x, dz = c.z - selected.z;
  const side = Math.sign(dx * lz - dz * lx) || (c.seed > 50 ? 1 : -1);
  const awayK = Math.hypot(dx, dz) < ROOM_R ? 0.6 : 0.15;
  const d = Math.hypot(dx, dz) || 1;
  const ex = lz * side + (dx / d) * awayK, ez = -lx * side + (dz / d) * awayK;
  const el = Math.hypot(ex, ez) || 1;
  return { x: ex / el, z: ez / el };
}
function makeRoom() {
  if (!selected) return 0;
  let n = 0;
  for (const c of crabs.values()) {
    if (c === selected || !c.root.visible || c.drop > 0 || !inRoomZone(c.x, c.z, 0.35)) continue;
    const e = escapeDir(c);
    let target = null;
    for (const dist of [3.4, 4.4, 5.6, 7]) {
      for (const ang of [0, 0.45, -0.45, 0.9, -0.9]) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        let tx = c.x + (e.x * ca - e.z * sa) * dist, tz = c.z + (e.x * sa + e.z * ca) * dist;
        const r = Math.hypot(tx, tz);
        if (r > WORLD.crabRadius) { tx *= WORLD.crabRadius / r; tz *= WORLD.crabRadius / r; }
        if (!inRoomZone(tx, tz, 0.7) && ctx.isFree(tx, tz, 0.8)) { target = { x: tx, z: tz }; break; }
      }
      if (target) break;
    }
    if (target && c.makeWay(target.x, target.z)) n++;
  }
  return n;
}

function focusCrab(crab) {
  if (!crab) return;
  select(crab);
  const target = crab.worldPos().add(new THREE.Vector3(0, 0.7 * crab.growScale, 0));
  const dir = camera.position.clone().sub(controls.target);
  dir.y = Math.max(dir.y, dir.length() * 0.3);
  dir.normalize();
  fly = {
    t: 0, dur: REDUCED ? 0.001 : 1.6,
    fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
    toTarget: target, toPos: target.clone().addScaledVector(dir, 7.5 * Math.max(0.65, crab.growScale)),
    crab,
  };
  controls.autoRotate = false;
}

$('card').querySelector('.card-close').addEventListener('click', () => select(null));
function setFollowBtn(on) {
  $('card-follow').classList.toggle('on', on);
  $('card-follow').textContent = tr(on ? 'card.following' : 'card.follow');
}
$('card-follow').addEventListener('click', () => {
  if (!selected) return;
  const on = !following;
  if (on) focusCrab(selected);
  following = on;
  setFollowBtn(on);
});
$('card-wave').addEventListener('click', () => selected?.wave());

/* ---------- Sammelalbum ---------- */
function cardInfo(crab, extra = {}) {
  const d = crab.data, g = growth(d);
  return {
    locked: g.locked, stageName: g.stage.name, stageId: g.stage.id, unlockIn: g.locked ? untilText(g.unlockAt - nowMs()) : '',
    crab, data: d, tier: crab.tier,
    tierIndex: Math.max(0, tiers.findIndex((t) => t.id === crab.tier.id)),
    hatName: hatName[d.hat] || d.hat,
    since: longDate(d.firstStarredAt),
    url: shareUrl(d.login),
    series: SERIES,
    variantText: Number.isInteger(d.variant) && !g.locked ? variantLabel(crab.tier, d.variant) : '',
    edition: Number.isInteger(d.variant) ? editionOf(crab.tier, d.variant) : 1,
    birthdayYears: birthdayYears(d),
    crabOfDay: crab === crabOfDay,
    reduced: REDUCED,
    toast,
    ...extra,
  };
}
// Neuheiten seit dem letzten Blick ins Album (neue Krabben, gewachsen, ausgepackt) als Zahl am Buch
let albumSeen = Number(store.get('albumGesehen')) || 0;
if (!albumSeen) { albumSeen = realNow(); store.set('albumGesehen', String(albumSeen)); }
function albumNews(from = albumSeen) {
  const now = nowMs();
  return demo ? [] : allCrabsData.filter((d) => newsBetween(d, from, now));
}
function updateAlbumBadge() {
  const n = albumNews().length, b = $('album-badge');
  b.textContent = n > 99 ? '99+' : String(n);
  b.classList.toggle('hidden', !n);
  $('album-btn').title = n ? tr('album.titleNews', { n }) : tr('album.title');
}
$('album-btn').addEventListener('click', () => {
  sound.bubble(0.8);
  const since = albumSeen, now = nowMs();
  albumSeen = now;
  if (!timeShift) store.set('albumGesehen', String(now));
  updateAlbumBadge();
  openAlbum({
    tiers, data: allCrabsData, crabs,
    growth, until: (t) => untilText(t - nowMs()),
    news: (d) => (demo ? null : newsBetween(d, since, now)),
    portrait: (c) => portraitThumb(c),
    openCard: (c) => openTradingCard(cardInfo(c, { onShow: () => { closeAlbum(); focusCrab(c); } })),
    isCardOpen: () => !!tradingCardOpen(),
    reduced: REDUCED,
  });
});

/* ---------- Teilen: Sammelkarte ---------- */
function shareUrl(login) {
  return `${location.origin}${location.pathname}#@${encodeURIComponent(login)}`;
}
$('card-share').addEventListener('click', () => {
  if (!selected || selected.data.example) return;
  $('card-share').classList.remove('pulse');
  openTradingCard(cardInfo(selected));
  selected.celebrate(1.5);
  sound.chime();
});

/* ---------- Klicken & Hover ---------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;

function pickAt(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(hitTargets, false).find((h) => h.object.parent.visible);
  return hit ? hit.object.userData.crab : null;
}
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  if (fly?.intro) { fly.t = Math.max(fly.t, 1); return; } // Tippen überspringt den Tauchflug
  const crab = pickAt(e);
  if (crab) { focusCrab(crab); sound.bubble(1); return; }
  if (hitChest(e)) { openChest(); return; }
  if (selected) select(null);
});

function hitChest(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(ocean.chest.hits, false).length > 0;
}
let chestCooldown = 0;
function openChest() {
  if (performance.now() < chestCooldown) return;
  chestCooldown = performance.now() + 1500;
  ocean.chest.burst();
  sound.chime();
  const newest = [...allCrabsData].sort((a, b) => (a.firstStarredAt < b.firstStarredAt ? 1 : -1))[0];
  const c = newest && crabs.get(newest.id);
  if (c) {
    toast(tr('toast.treasure', { login: escapeHtml(newest.login) }));
    setTimeout(() => focusCrab(c), 900);
  }
}
let hoverFrame = 0;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || ++hoverFrame % 2) return;
  const crab = pickAt(e);
  if (hovered && hovered !== crab) hovered.labelBoost = 0;
  hovered = crab;
  if (crab) crab.labelBoost = 1;
  canvas.style.cursor = crab || hitChest(e) ? 'pointer' : '';
});

/* =========================================================
   Meine Krabbe ("Das bin ich" – nur in diesem Browser gemerkt)
   ========================================================= */
function mineCrab() { return mineId != null ? crabs.get(mineId) || null : null; }
function setMine(id) {
  mineCrab()?.setMine(false);
  mineId = id;
  if (id == null) store.del('meineKrabbe'); else store.set('meineKrabbe', String(id));
  mineCrab()?.setMine(true);
  rememberMineStage();
  updateMineBtn();
}
function updateMineBtn() {
  const me = mineCrab();
  const btn = $('card-mine');
  if (btn) {
    const isMe = !!selected && selected === me;
    btn.textContent = tr(isMe ? 'card.notMine' : 'card.mine');
    btn.classList.toggle('on', isMe);
  }
  // Oben: "Meine Krabbe" statt Stern-Knopf, sobald man sich markiert hat
  starBtn.classList.toggle('mine', !!me);
  starBtn.querySelector('.star-label').textContent = tr(me ? 'star.mine' : 'star.label');
  starBtn.querySelector('.star-icon').textContent = me ? '🦀' : '★';
}
$('card-mine').addEventListener('click', () => {
  if (!selected || selected.data.example) return;
  if (selected === mineCrab()) { setMine(null); toast(tr('toast.unmarked')); return; }
  setMine(selected.data.id);
  selected.wave();
  toast(tr('toast.marked', { login: escapeHtml(selected.data.login) }));
});
starBtn.addEventListener('click', (e) => {
  e.preventDefault();
  coachDone('star');
  const me = mineCrab();
  if (me) { focusCrab(me); return; }
  openJoin();
});
/** Beim Start: zur eigenen Krabbe schauen (ein Link #@name hat Vorrang). */
function greetMine() {
  const me = mineCrab();
  if (me) {
    const before = Number(store.get('meineStufe'));
    const seen = Number.isInteger(before) && store.get('meineStufe') !== null ? before : me.stage;
    const unpack = seen < UNLOCK && !me.locked;
    // Hut seit dem letzten Besuch ausgepackt? Dann vor deinen Augen auspacken.
    if (unpack) me.setGrowth({ index: seen, scale: STAGES[seen].scale, locked: true }, false);
    focusCrab(me);
    setTimeout(() => {
      if (unpack) { me.setGrowth(growth(me.data), true); unpackReveal(me); return; }
      me.wave();
      const grew = me.stage > seen ? tr('toast.grewInline', { stage: STAGES[me.stage].name }) : '';
      toast(tr('toast.welcome', { login: escapeHtml(me.data.login), grew }));
      rememberMineStage();
    }, REDUCED ? 100 : 1700);
    select(null);
    return true;
  }
  if (mineId != null && fullList.some((c) => c.id === mineId && c.starred === false)) {
    toast(tr('toast.comeBack'));
  }
  return false;
}

/* =========================================================
   Stern-Ablauf: Stern geben -> Name eingeben -> Ei -> Enthüllung
   ========================================================= */
const join = $('join');
$('join-star').href = repoUrl;
function openJoin() {
  join.classList.remove('hidden');
  const n = $('join-name');
  n.value = waitFor?.name || '';
  $('join-msg').textContent = '';
  setTimeout(() => n.focus(), 50);
}
function closeJoin() { join.classList.add('hidden'); }
join.querySelector('.join-close').addEventListener('click', closeJoin);
join.querySelector('.join-backdrop').addEventListener('click', closeJoin);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !join.classList.contains('hidden')) closeJoin(); });
$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('join-name').value.trim().replace(/^@/, '');
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(name)) { $('join-msg').textContent = tr('join.badName'); return; }
  const found = allCrabsData.find((c) => c.login.toLowerCase() === name.toLowerCase());
  closeJoin();
  if (found && crabs.get(found.id)) {
    stopWaiting();
    setMine(found.id);
    focusCrab(crabs.get(found.id));
    toast(tr('toast.found', { login: escapeHtml(found.login) }));
    return;
  }
  startWaiting(name);
});

// Warten auf die eigene Krabbe: alle 15 s nachsehen, höchstens 10 Minuten (danach normal alle 90 s)
const FAST_POLL = 15_000, FAST_FOR = 10 * 60_000;
let waitFor = null, fastTimer = null, waitStart = 0;
try { waitFor = JSON.parse(store.get('warteAuf') || 'null'); } catch { waitFor = null; }
if (waitFor && typeof waitFor.name !== 'string') waitFor = null;

function isAwaited(d) { return !!waitFor && !!d?.login && d.login.toLowerCase() === waitFor.name.toLowerCase(); }
function startWaiting(name) {
  waitFor = { name };
  store.set('warteAuf', JSON.stringify(waitFor));
  beginFastPoll();
  showEgg();
  updateWaitChip();
  toast(tr('toast.egg', { name: escapeHtml(name) }));
  syncCrabs(false);
}
function beginFastPoll() {
  waitStart = performance.now();
  clearInterval(fastTimer);
  fastTimer = setInterval(() => {
    if (!waitFor) { clearInterval(fastTimer); return; }
    if (performance.now() - waitStart > FAST_FOR) {
      clearInterval(fastTimer);
      updateWaitChip(true);
      toast(tr('toast.slow'));
      return;
    }
    if (!document.hidden) syncCrabs(false);
  }, FAST_POLL);
}
function stopWaiting() {
  waitFor = null;
  store.del('warteAuf');
  clearInterval(fastTimer);
  hideEgg();
  updateWaitChip();
}
function updateWaitChip(slow = false) {
  const chip = $('wait-chip');
  chip.classList.toggle('hidden', !waitFor);
  if (!waitFor) return;
  $('wait-name').textContent = `@${waitFor.name}`;
  $('wait-text').textContent = tr(slow ? 'wait.slow' : 'wait.soon');
}
$('wait-other').addEventListener('click', openJoin);
$('wait-cancel').addEventListener('click', () => { stopWaiting(); toast(tr('toast.stopWait')); });
$('wait-chip').addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.closest('.wait-main')) flyTo(EGG_POS); });

/** Nach jedem Nachladen: Ist die erwartete Krabbe angekommen? */
let pendingReveal = null;
function checkAwaited(initial) {
  if (!waitFor) return;
  const data = allCrabsData.find(isAwaited);
  const crab = data && crabs.get(data.id);
  if (!crab) return;
  if (initial) pendingReveal = crab; // erst nach dem Tauchflug zeigen
  else reveal(crab);
}

/* ---------- Das Ei bei der Schatzkiste ---------- */
const EGG_POS = new THREE.Vector3(2.7, 0, 3.0);
EGG_POS.y = heightAt(EGG_POS.x, EGG_POS.z);
let egg = null;
function eggTexture(name, cracked) {
  const c = document.createElement('canvas');
  c.width = 220; c.height = 300;
  const g = c.getContext('2d');
  g.translate(110, 120);
  const shape = () => { g.beginPath(); g.ellipse(0, 0, 70, 92, 0, 0, Math.PI * 2); };
  g.fillStyle = '#fff'; g.save(); g.scale(1.12, 1.1); shape(); g.fill(); g.restore();
  g.fillStyle = '#fbf1dc'; shape(); g.fill();
  g.fillStyle = '#ffb7c9';
  for (const [x, y, r] of [[-30, -40, 12], [25, -55, 9], [35, 10, 14], [-35, 30, 10], [5, 55, 11], [-5, -5, 8]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  if (cracked) {
    g.strokeStyle = '#6b5a4a'; g.lineWidth = 5; g.lineJoin = 'round';
    // senkrechter Zickzack-Riss: genau hier bricht das Ei in zwei Hälften auf
    g.beginPath(); g.moveTo(0, -92); [[-12, -66], [10, -40], [-12, -12], [10, 16], [-10, 44], [8, 70], [0, 92]].forEach(([x, y]) => g.lineTo(x, y)); g.stroke();
    g.beginPath(); g.moveTo(-12, -12); g.lineTo(-34, -24); g.moveTo(10, 16); g.lineTo(32, 6); g.stroke();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = '800 26px Nunito, system-ui, sans-serif';
  const label = `@${name}`;
  let size = 26;
  while (g.measureText(label).width > 196 && size > 12) { size--; g.font = `800 ${size}px Nunito, system-ui, sans-serif`; }
  const w = g.measureText(label).width + 28;
  g.fillStyle = '#fff'; g.strokeStyle = '#ff5d8f'; g.lineWidth = 5;
  g.beginPath(); g.roundRect(110 - w / 2, 244, w, 44, 22); g.fill(); g.stroke();
  g.fillStyle = '#23324a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 110, 267);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function showEgg() {
  if (!waitFor) return;
  if (!egg) {
    egg = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    egg.center.set(0.5, 0.04);
    egg.scale.set(1.2, 1.64, 1);
    egg.renderOrder = 25;
    scene.add(egg);
  }
  egg.material.map?.dispose();
  egg.material.map = eggTexture(waitFor.name, false);
  egg.material.needsUpdate = true;
  egg.position.copy(EGG_POS);
  egg.visible = true;
  egg.userData.crackT = 0;
}
function hideEgg() { if (egg) egg.visible = false; }
// Schalenhälften fliegen nach links und rechts weg
let shards = [];
const camRight = new THREE.Vector3();
function splitEgg() {
  const tex = egg.material.map;
  for (const side of [-1, 1]) {
    const tx = tex.clone();
    tx.repeat.set(0.5, 1);
    tx.offset.set(side < 0 ? 0 : 0.5, 0);
    tx.needsUpdate = true;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
    s.center.set(side < 0 ? 1 : 0, 0.04);
    s.scale.set(0.6, 1.64, 1);
    s.renderOrder = 25;
    s.userData = { side, t: 0 };
    s.position.copy(EGG_POS);
    scene.add(s);
    shards.push(s);
  }
  ocean.bubbles.spawn(EGG_POS.x, EGG_POS.y + 0.6, EGG_POS.z, 30, 0.9, 0.06, 0.2);
  hideEgg();
}
function updateShards(dt) {
  if (!shards.length) return;
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  shards = shards.filter((s) => {
    const u = s.userData;
    u.t += dt;
    s.position.copy(EGG_POS).addScaledVector(camRight, u.side * u.t * 1.6);
    s.position.y += Math.max(-0.3, 1.6 * u.t - 3.2 * u.t * u.t);
    s.material.rotation = -u.side * Math.min(1.4, u.t * 2.6);
    s.material.opacity = Math.min(1, Math.max(0, (1.4 - u.t) / 0.5));
    if (u.t < 1.4) return true;
    scene.remove(s); s.material.map.dispose(); s.material.dispose();
    return false;
  });
}
function updateEgg(dt, t) {
  updateShards(dt);
  if (!egg?.visible) return;
  if (egg.userData.crackT > 0) {
    egg.userData.crackT -= dt;
    egg.material.rotation = Math.sin(t * 40) * 0.12 * Math.min(1, 1.6 - egg.userData.crackT);
    if (egg.userData.crackT <= 0) { if (REDUCED) hideEgg(); else splitEgg(); }
    return;
  }
  // wackelt ab und zu
  const k = (t % 3.2) < 0.9 ? Math.sin(t * 18) * 0.13 : 0;
  egg.material.rotation = REDUCED ? 0 : k;
}

/* ---------- Enthüllung ---------- */
function reveal(crab) {
  const name = waitFor?.name;
  waitFor = null;
  store.del('warteAuf');
  clearInterval(fastTimer);
  updateWaitChip();
  setMine(crab.data.id);
  // Ei wackelt, bricht in zwei Hälften auf – und die Krabbe schlüpft genau dort heraus
  const HATCH = REDUCED ? 0 : 0.9;
  if (egg?.visible) {
    egg.material.map?.dispose();
    egg.material.map = eggTexture(name || crab.data.login, true);
    egg.material.needsUpdate = true;
    egg.userData.crackT = HATCH || 0.01;
  }
  crab.place(EGG_POS.x, EGG_POS.z + 0.1);
  if (REDUCED) crab.dropIn(0.6, 0); else crab.hatchIn(HATCH);
  crab.isNew = true;
  select(null);
  flyTo(new THREE.Vector3(EGG_POS.x, EGG_POS.y + 0.5, EGG_POS.z + 0.1), 7);
  sound.bubble(1);
  const tier = crab.tier, hat = hatName[crab.data.hat] || '', g = growth(crab.data);
  setTimeout(() => {
    showReveal({
      color: tier.color, top: tr('reveal.top', { tier: tier.name }), big: tr('reveal.big', { tier: tier.name }), tail: tr('reveal.tail'),
      sub: g.locked ? tr('reveal.locked', { until: untilText(g.unlockAt - nowMs()) }) : crab.data.hat === 'none' ? tr('reveal.noHat') : tr('reveal.withHat', { hat }),
      at: crab,
      done: () => { focusCrab(crab); $('card-share').classList.add('pulse'); },
    });
  }, REDUCED ? 300 : 2400);
}

/** Großes Banner mitten auf dem Bildschirm, dazu Konfetti und Glockenton. */
function showReveal({ color, top, big, tail, sub, at, done }) {
  if (!REDUCED && at) ocean.chest.confetti?.burst(at.x, at.root.position.y + 1.2, at.z, 160);
  sound.chime();
  const el = $('reveal');
  el.style.setProperty('--c', color);
  $('reveal-top').textContent = top;
  $('reveal-tier').textContent = big;
  $('reveal-tail').textContent = tail;
  $('reveal-hat').textContent = sub;
  el.classList.remove('hidden', 'hat-shown', 'out');
  setTimeout(() => el.classList.add('hat-shown'), 1300);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => { el.classList.add('hidden'); done?.(); }, 4700);
}

/** Der Hut der eigenen Krabbe wurde gerade ausgepackt. */
function unpackReveal(crab) {
  const d = crab.data, hat = hatName[d.hat] || d.hat;
  rememberMineStage();
  showReveal({
    color: crab.tier.color, top: tr('unpack.top'),
    big: d.hat === 'none' ? tr('unpack.nothing') : hat.toUpperCase(), tail: d.hat === 'none' ? tr('unpack.pure') : '!',
    sub: Number.isInteger(d.variant) ? tr('unpack.sub', { v: d.variant, label: variantLabel(crab.tier, d.variant) }) : '',
    at: crab,
    done: () => { focusCrab(crab); $('card-share').classList.add('pulse'); },
  });
  crab.celebrate(2.5);
}

function rememberMineStage() {
  const me = mineCrab();
  if (me && !timeShift) store.set('meineStufe', String(me.stage));
}

/* ---------- Wachsen: alle 20 s nachsehen, ob eine Krabbe eine Stufe weiter ist ---------- */
function checkGrowth() {
  for (const c of crabs.values()) {
    const g = growth(c.data);
    if (g.index === c.stage && g.locked === c.locked) continue;
    const unpacked = c.setGrowth(g, !document.hidden);
    if (c === mineCrab()) {
      if (unpacked) unpackReveal(c);
      else { toast(tr('toast.grew', { stage: g.stage.name })); rememberMineStage(); }
    }
  }
  if (selected && !selected.data.example) growFields(selected);
  updateAlbumBadge();
}
setInterval(checkGrowth, 20_000);

/** Kamera zu einem Punkt fliegen (ohne Krabbe auszuwählen). */
function flyTo(target, dist = 8) {
  const dir = camera.position.clone().sub(controls.target);
  dir.y = Math.max(dir.y, dir.length() * 0.3);
  dir.normalize();
  const to = target.clone();
  if (to.y < 0.5) to.y = heightAt(to.x, to.z) + 0.7;
  fly = {
    t: 0, dur: REDUCED ? 0.001 : 1.6,
    fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
    toTarget: to, toPos: to.clone().addScaledVector(dir, dist),
  };
}

/* =========================================================
   Erste Schritte: drei kleine Hinweise beim ersten Besuch
   ========================================================= */
const COACH = [
  { id: 'drag', text: tr('coach.drag'), pos: 'bottom' },
  { id: 'tap', text: tr('coach.tap'), pos: 'middle' },
  { id: 'star', text: tr('coach.star'), pos: 'star' },
];
let coachStep = -1, coachTimer = null;
function startCoach() {
  if (store.get('hinweiseGesehen') === '1' || selected || params.has('keineHinweise')) return false;
  $('hint').style.opacity = 0; // der kleine Dauer-Hinweis kommt erst danach
  coachStep = -1;
  nextCoach();
  return true;
}
function nextCoach() {
  clearTimeout(coachTimer);
  coachStep++;
  const el = $('coach');
  if (coachStep >= COACH.length) {
    el.classList.add('hidden');
    $('star-btn').classList.remove('pulse');
    store.set('hinweiseGesehen', '1');
    $('hint').style.opacity = 0.75;
    coachStep = -1;
    return;
  }
  const c = COACH[coachStep];
  el.textContent = c.text;
  el.dataset.pos = c.pos;
  // Stern-Hinweis unter die rechte Spalte (Stern, Suche, Krabbe des Tages), nicht darüber
  const wide = !matchMedia('(max-width: 760px)').matches;
  el.style.top = c.pos === 'star' && wide ? `${Math.round($('hud-actions').getBoundingClientRect().bottom + 16)}px` : '';
  $('star-btn').classList.toggle('pulse', c.pos === 'star');
  el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  coachTimer = setTimeout(nextCoach, 6000);
}
function coachDone(id) { if (coachStep >= 0 && COACH[coachStep]?.id === id) nextCoach(); }
controls.addEventListener('start', () => coachDone('drag'));
$('coach').addEventListener('click', nextCoach);

/* =========================================================
   Start
   ========================================================= */
LOAD.set(76, tr('load.font'));
if (document.fonts?.load) {
  try { await Promise.race([document.fonts.load('800 40px Nunito'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* egal */ }
}
LOAD.set(80, tr('load.stars'));
await syncCrabs(true);
updateMineBtn();
if (waitFor) { showEgg(); beginFastPoll(); updateWaitChip(); }
LOAD.set(90, tr('load.shaders'));
await tick();
// Shader vorab übersetzen (verhindert Ruckler beim ersten Bild)
try {
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 4000))]);
  else renderer.compile(scene, camera);
} catch { /* egal – dann eben beim ersten Bild */ }
LOAD.set(98, tr('load.almost'));
setInterval(() => { if (!document.hidden) syncCrabs(false); }, POLL_MS);

// Intro-Kamerafahrt: von der Oberfläche in einem Bogen durch Blasen hinunter zum Riff
fly = {
  t: -0.5 / 5.5, dur: REDUCED ? 0.001 : 5.5, // kurz warten, bis die Blasenwolke den Ladebildschirm wegwischt
  fromPos: camera.position.clone(), fromTarget: new THREE.Vector3(0, 4, 2),
  toPos: new THREE.Vector3(0, 11, 34), toTarget: new THREE.Vector3(0, 1.4, 0),
  ctrl: REDUCED ? null : INTRO_CTRL,
  intro: true,
};
if (REDUCED) fly.t = 0;

const clock = new THREE.Clock();
let first = true;
const tmp = new THREE.Vector3(), lastFollow = new THREE.Vector3();

function frame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  window.__fps = Math.round(0.9 * (window.__fps || 60) + 0.1 / Math.max(rawDt, 1e-3));
  const t = clock.elapsedTime;
  shared.uTime.value = t;
  updateHatMaterials(t);

  rebuildGrid();
  ocean.update(dt, t);
  updateEgg(dt, t);
  const shadowDist = (crabs.size > 300 ? 12 : crabs.size > 120 ? 20 : 1e9) * quality.shadowK;
  for (const c of crabs.values()) {
    c.hold = c === selected && !following;
    c.update(dt, t, camera);
    c.camDist = camera.position.distanceTo(c.root.position);
    c.setShadowLOD(c.camDist < shadowDist || c === selected);
  }
  if (++labelFrame % 4 === 0) chooseLabels();
  if (selected && (roomTimer -= dt) <= 0) { roomTimer = 0.4; makeRoom(); }
  for (const c of crabs.values()) c.updateLabel(dt);
  adaptQuality(rawDt);

  // Kamera
  if (fly) {
    fly.t += dt / fly.dur;
    const k = easeInOut(Math.min(Math.max(fly.t, 0), 1));
    if (fly.crab) {
      fly.toTarget.copy(fly.crab.worldPos()).y += 0.7;
    }
    if (fly.ctrl) {
      // weiche Kurve (quadratische Bézierkurve)
      const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
      camera.position.set(
        a * fly.fromPos.x + b * fly.ctrl.x + c * fly.toPos.x,
        a * fly.fromPos.y + b * fly.ctrl.y + c * fly.toPos.y,
        a * fly.fromPos.z + b * fly.ctrl.z + c * fly.toPos.z,
      );
    } else camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
    if (fly.intro && k < 0.8 && !REDUCED) introBubbles(dt, k);
    if (fly.t >= 1) {
      if (fly.intro) {
        controls.enabled = true;
        document.body.classList.remove('intro-flying');
        const linked = openHashCrab();
        const revealing = !!pendingReveal;
        if (pendingReveal) { const c = pendingReveal; pendingReveal = null; setTimeout(() => reveal(c), 300); }
        else if (!linked) greetMine();
        if (linked || revealing || !startCoach()) $('hint').style.opacity = 0.75;
      }
      if (fly.crab) lastFollow.copy(fly.crab.worldPos());
      fly = null;
    }
  } else if (following && selected) {
    selected.worldPos(tmp);
    const delta = tmp.clone().sub(lastFollow);
    camera.position.add(delta);
    controls.target.add(delta);
    lastFollow.copy(tmp);
  }
  if (!fly) {
    // Boden und Wasseroberfläche gleich als Neigungsgrenze einrechnen – sonst drückt die
    // Korrektur unten die Kamera hoch und die Steuerung zieht sie wieder runter (Ruckeln)
    const r = camera.position.distanceTo(controls.target) || 1, ty = controls.target.y;
    const low = (heightAt(camera.position.x, camera.position.z) + 0.8 - ty) / r;
    const high = (WORLD.surfaceY - 4 - ty) / r;
    controls.maxPolarAngle = Math.min(POLAR_MAX, Math.acos(THREE.MathUtils.clamp(low, -1, 1)));
    controls.minPolarAngle = Math.min(controls.maxPolarAngle, Math.max(POLAR_MIN, Math.acos(THREE.MathUtils.clamp(high, -1, 1))));
    controls.update();
    keepInSea();
  }

  // Kamera über dem Boden & unter Wasser halten (Sicherheitsnetz)
  const minY = heightAt(camera.position.x, camera.position.z) + 0.7;
  if (camera.position.y < minY) camera.position.y = minY;
  if (camera.position.y > WORLD.surfaceY - 4 && !fly?.intro) camera.position.y = WORLD.surfaceY - 4;

  if (SW.fx) composer.render(dt); else renderer.render(scene, camera);

  if (first) {
    first = false;
    LOAD.set(100, tr('load.done'));
    document.documentElement.dataset.bereit = '1'; // für die automatischen Tests
    // große Blasenwolke wischt den Ladebildschirm weg, dahinter beginnt der Tauchflug
    window.__introBurst?.();
    setTimeout(() => $('loader').classList.add('fade'), REDUCED ? 0 : 450);
    setTimeout(() => $('loader').remove(), REDUCED ? 1000 : 1500);
  }
  requestAnimationFrame(frame);
}

/* ---------- Namensschilder: nur die nächsten, ohne Überlappung ---------- */
const MAX_LABELS = 8, LABEL_RANGE = 26;
let labelFrame = 0;
const projV = new THREE.Vector3();
function chooseLabels() {
  const H = renderer.domElement.clientHeight, W = renderer.domElement.clientWidth;
  const pxPerUnit = (camera.projectionMatrix.elements[5] * H) / 2; // Sprite-Größe in Pixeln (sizeAttenuation: false)
  const list = [...crabs.values()].filter((c) => c.root.visible && c.camDist < LABEL_RANGE).sort((a, b) => a.camDist - b.camDist);
  const placed = [];
  // Ausgewählte & Hover-Krabbe zuerst reservieren
  const prio = [...new Set([selected, hovered, mineCrab(), crabOfDay].filter(Boolean))];
  const order = [...prio, ...list.filter((c) => !prio.includes(c))];
  for (const c of crabs.values()) c.labelWanted = false;
  let shown = 0;
  for (const c of order) {
    if (!c.root.visible) continue;
    const isPrio = prio.includes(c);
    if (!isPrio && shown >= MAX_LABELS) break;
    if (!isPrio && c.camDist >= LABEL_RANGE) continue;
    projV.set(c.x, c.root.position.y + c.labelY + c.hop, c.z).project(camera);
    if (projV.z > 1 || Math.abs(projV.x) > 1.1 || Math.abs(projV.y) > 1.1) continue;
    const sx = (projV.x + 1) / 2 * W, sy = (1 - projV.y) / 2 * H;
    const h = LABEL_SIZE * pxPerUnit, w = c.label.scale.x * pxPerUnit;
    const box = { l: sx - w / 2, r: sx + w / 2, t: sy - h, b: sy };
    if (!isPrio && placed.some((o) => box.l < o.r + 6 && o.l < box.r + 6 && box.t < o.b + 5 && o.t < box.b + 5)) continue;
    placed.push(box);
    c.labelWanted = true;
    if (!isPrio) shown++;
  }
}

/* ---------- Automatische Qualität ---------- */
// Läuft es dauerhaft ruckelig, wird stufenweise vereinfacht (Auflösung, Leuchten, Schatten).
const quality = { level: 0, shadowK: 1, acc: 0, frames: 0, warm: 0, locked: params.has('hq') };
function adaptQuality(rawDt) {
  if (quality.locked || document.hidden || rawDt > 3) return; // nur echte Pausen (Tab-Wechsel) ignorieren
  quality.warm += rawDt;
  if (quality.warm < 4) return; // Start (Shader, Texturen) nicht mitzählen
  quality.acc += rawDt; quality.frames++;
  if (quality.acc < 3) return;
  const fps = quality.frames / quality.acc;
  quality.acc = 0; quality.frames = 0;
  if (fps >= 40 || quality.level >= 3) return;
  quality.level++;
  if (quality.level === 1) { maxPixelRatio = Math.max(1, maxPixelRatio * 0.75); resize(); }
  if (quality.level === 2) { bloom.enabled = false; quality.shadowK = 0.5; }
  if (quality.level === 3) { maxPixelRatio = 1; sun.shadow.mapSize.set(1024, 1024); sun.shadow.map?.dispose(); sun.shadow.map = null; quality.shadowK = 0.3; resize(); }
  console.info(`[Stargazer Sea] Qualität reduziert auf Stufe ${quality.level} (${fps.toFixed(0)} fps)`);
}

/** Blickpunkt bleibt über der Insel: Verschieben/Zoomen führt nicht aus dem Meer hinaus. */
const SEA_R = WORLD.crabRadius + 3, CAM_R = 46, shift = new THREE.Vector3();
function keepInSea() {
  const t = controls.target;
  shift.copy(t);
  const d = Math.hypot(t.x, t.z);
  if (d > SEA_R) { t.x *= SEA_R / d; t.z *= SEA_R / d; }
  t.y = THREE.MathUtils.clamp(t.y, heightAt(t.x, t.z) + 0.2, 10);
  shift.subVectors(t, shift);
  if (shift.lengthSq() > 1e-10) camera.position.add(shift);
  // Kamera selbst nicht über den Inselrand hinaus: sonst näher an den Blickpunkt heranrücken
  const c = camera.position, dx = c.x - t.x, dz = c.z - t.z;
  if (Math.hypot(c.x, c.z) > CAM_R) {
    const a = dx * dx + dz * dz, b = 2 * (t.x * dx + t.z * dz), q = t.x * t.x + t.z * t.z - CAM_R * CAM_R;
    const s = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * q))) / (2 * a);
    if (s > 0 && s < 1) c.set(t.x + dx * s, t.y + (c.y - t.y) * s, t.z + dz * s);
  }
}

/** Während des Tauchflugs: Blasen vor der Kamera, durch die wir hindurchfliegen. */
const fwd = new THREE.Vector3(), side = new THREE.Vector3();
function introBubbles(dt, k) {
  const n = Math.round((1 - k) * 70 * dt + Math.random());
  if (!n) return;
  fwd.subVectors(controls.target, camera.position).normalize();
  side.crossVectors(fwd, camera.up).normalize();
  for (let i = 0; i < n; i++) {
    const d = 2 + Math.random() * 9, s = (Math.random() - 0.5) * 9, u = (Math.random() - 0.5) * 6;
    ocean.bubbles.spawn(
      camera.position.x + fwd.x * d + side.x * s, camera.position.y + fwd.y * d + u, camera.position.z + fwd.z * d + side.z * s,
      1, 0.4, 0.07, 0.3,
    );
  }
}

function openHashCrab() {
  let m = null;
  try { m = decodeURIComponent(location.hash).match(/^#@(.+)$/); } catch { /* kaputter Link */ }
  if (!m) return false;
  const data = allCrabsData.find((c) => c.login.toLowerCase() === m[1].toLowerCase());
  if (data) setTimeout(() => focusCrab(crabs.get(data.id)), 300);
  return !!data;
}

/** Diagnose: alle Größen und Einstellungen; wird ausgegeben und in die Zwischenablage kopiert. */
async function diag() {
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  const t = (x) => x && { w: x.width, h: x.height, samples: x.samples, colorSpace: x.texture.colorSpace || 'linear', type: x.texture.type === THREE.HalfFloatType ? 'HalfFloat' : x.texture.type === THREE.UnsignedByteType ? 'UnsignedByte' : String(x.texture.type) };
  const d = {
    gpuName, userAgent: navigator.userAgent, devicePixelRatio, inner: `${innerWidth}×${innerHeight}`,
    rendererPixelRatio: renderer.getPixelRatio(), drawingBuffer: `${db.x}×${db.y}`,
    canvasCss: `${canvas.clientWidth}×${canvas.clientHeight}`,
    composerSize: `${composer._width}×${composer._height} @${composer._pixelRatio}`,
    rt1: t(composer.renderTarget1), rt2: t(composer.renderTarget2),
    bloom: { inChain: composer.passes.includes(bloom), enabled: bloom.enabled, bright: t(bloom.renderTargetBright), mips: bloom.renderTargetsHorizontal.map((x) => `${x.width}×${x.height}`) },
    qualityLevel: quality.level, msaa, switches: activeSwitches.join(' ') || 'keine',
  };
  const text = JSON.stringify(d, null, 2);
  console.log(text);
  try { await navigator.clipboard.writeText(text); } catch {
    try { const ta = Object.assign(document.createElement('textarea'), { value: text }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch { /* egal */ }
  }
  return d;
}
// ?diag=1: Diagnose als Kasten anzeigen (für Handys ohne Konsole)
if (params.get('diag') === '1') {
  setTimeout(async () => {
    const d = await diag();
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;max-height:55vh;overflow:auto;z-index:9999;background:#fffdf5;color:#222;font:11px/1.35 monospace;padding:10px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.35);white-space:pre-wrap';
    const btn = Object.assign(document.createElement('button'), { textContent: 'Kopieren' });
    btn.style.cssText = 'float:right;font:600 13px system-ui;padding:6px 12px;margin:0 0 6px 8px';
    btn.onclick = async () => { await diag(); btn.textContent = 'Kopiert ✓'; };
    box.append(btn, JSON.stringify(d, null, 2));
    document.body.append(box);
  }, 6000);
}

window.__sea = {
  crabs, camera, controls, focusCrab, scene, renderer, sync: syncCrabs, ocean, quality, sound,
  get crabOfDay() { return crabOfDay; }, get reduced() { return REDUCED; }, get selected() { return selected; }, openChest, chooseLabels,
  albumOpen, albumGo, closeAlbum, season: SEASON, get night() { return ctx.night; }, setHour(h) { forcedHour = h; applyEnv(); },
  inRoomZone, makeRoom, tradingCardOpen, closeTradingCard,
  setMine, mineCrab, startWaiting, stopWaiting, reveal, openJoin, get waitFor() { return waitFor; }, get coachStep() { return coachStep; },
  get fly() { return fly; }, msaa, gpuName, diag, today, birthdayYears, growth, checkGrowth, albumNews,
  /** Zeit vorspulen (Stunden) und sofort wachsen lassen – für Tests und zum Ausprobieren. */
  skipTime(hours) { timeShift += hours * 3_600_000; checkGrowth(); },
  skip() {
    fly = null; controls.enabled = true; document.body.classList.remove('intro-flying');
    for (const c of crabs.values()) { c.dropDelay = 0; c.drop = 0.001; c.root.visible = true; }
  },
};
// Tauchgang-Mindestdauer abwarten (Tippen überspringt), dann geht's los
if (window.__introWait && !REDUCED) await window.__introWait();
requestAnimationFrame(frame);
