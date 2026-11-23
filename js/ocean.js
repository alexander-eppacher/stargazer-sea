import * as THREE from 'three';
import { mulberry32, pick, range, clamp, noise3, mergeAll, setSway, vox, hdr, radialTexture, paint } from './util.js';
import { patch, shared, standard, CAUSTIC_GLSL } from './shaders.js';
import {
  canvas, css, toTexture, grain, sticker, stickerGeometry, crossedGeometry, corrugatedTexture,
  drawBranchCoral, drawFanCoral, drawTubeCoral, drawAnemone, drawKelp, drawTuft, drawStarfish, drawShell,
  drawUrchin, drawAnchor, drawSign, drawPebbles, drawRipples, drawClamShell,
  drawXmasTree, drawPresent, drawPumpkin, drawGhost,
  fishAtlas, drawJellyBell, drawTentacles, drawTurtleBody, drawFlipper, drawManta, drawStar,
  sandTexture, cardboardTexture, frillTexture, grainTexture,
} from './paper.js';
import { t } from './lang.js';
import { buildTown } from './town.js';
import { buildPlaces, PLACE_SPOTS } from './places.js';
import { buildDepth } from './depth.js';

export const WORLD = {
  crabRadius: 27,
  surfaceY: 34,
  lowY: -5,
  fogColor: new THREE.Color(0x4aaedb),
  fogDensity: 0.0046,
};

/* =========================================================
   Gelände: flache Papp-Insel mit Plateaus, außen tieferer Meeresboden
   ========================================================= */
const islandR = (a) => 39 + 2.5 * Math.sin(3 * a + 0.5) + 1.5 * Math.sin(5 * a + 2) + 0.8 * Math.sin(9 * a);
export const PLATEAUS = [
  { x: -17, z: -17, r: 6.5, h: 1.6, s: 1 },
  { x: 11, z: -24, r: 7.5, h: 2.6, s: 2 },
  { x: 26, z: -8, r: 4.8, h: 1.2, s: 3 },
  { x: -29, z: 3, r: 4.4, h: 1.0, s: 4 },
];
const plateauR = (p, a) => p.r * (1 + 0.08 * Math.sin(4 * a + p.s) + 0.05 * Math.sin(7 * a + p.s * 2));

export function heightAt(x, z) {
  for (const p of PLATEAUS) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.hypot(dx, dz) < plateauR(p, Math.atan2(dz, dx))) return p.h;
  }
  return Math.hypot(x, z) < islandR(Math.atan2(z, x)) ? 0 : WORLD.lowY;
}

const UPV = new THREE.Vector3(0, 1, 0);
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

/* ---------- Materialien für Pappaufsteller ---------- */
const matCache = new Map();
export function cutMat(tex, sway = 0, speed = 1, glow = 0.2) {
  const key = `${tex.uuid}|${sway}|${speed}|${glow}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95,
      emissiveMap: tex, emissive: new THREE.Color(glow, glow, glow),
    });
    if (sway) patch(m, { sway, swaySpeed: speed });
    matCache.set(key, m);
  }
  return matCache.get(key);
}
export function depthMat(tex, sway = 0, speed = 1) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  if (sway) patch(m, { sway, swaySpeed: speed });
  return m;
}
function cutMesh(geo, tex, { sway = 0, speed = 1, shadow = true, glow } = {}) {
  const m = new THREE.Mesh(geo, cutMat(tex, sway, speed, glow));
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (shadow) m.customDepthMaterial = depthMat(tex, sway, speed);
  return m;
}
const art = (stk) => ({ stk, t: toTexture(stk.canvas) });

/* =========================================================
   Haupt-Aufbau
   ========================================================= */
export function buildOcean(scene, renderer, camera, opts = {}) {
  const rng = mulberry32(20240607);
  const updaters = [];
  const env = { night: 0, dusk: 0 };
  const nightU = { value: 0 }, winterU = { value: opts.season === 'winter' ? 1 : 0 };
  const obstacles = PLATEAUS.map((p) => ({ x: p.x, z: p.z, r: p.r * 1.08 + 0.4 }));

  const free = (x, z, r) => obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
  function spot(rMin, rMax, clearance, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(range(rng, rMin * rMin, rMax * rMax));
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (free(x, z, clearance)) return { x, z };
    }
    return null;
  }

  scene.fog = new THREE.FogExp2(WORLD.fogColor, WORLD.fogDensity);
  scene.background = WORLD.fogColor.clone();

  /* ---------- Wasser-Hintergrund ---------- */
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uFog: { value: WORLD.fogColor }, uNight: nightU },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFog; uniform float uNight; varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 c = mix(uFog, vec3(0.03, 0.16, 0.32) * (1.0 - uNight * 0.6), smoothstep(0.0, -0.6, y));
          c = mix(c, mix(vec3(0.55, 0.9, 1.0), vec3(0.12, 0.2, 0.42), uNight), smoothstep(0.05, 0.8, y));
          float cs = max(dot(vDir, normalize(vec3(-0.2, 1.0, 0.3))), 0.0);
          float sun = pow(cs, 14.0);
          vec3 glow = mix(vec3(0.6, 0.9, 1.0) * 0.7, vec3(0.7, 0.8, 1.0) * 0.35, uNight); // nachts: Mondschein
          float moon = smoothstep(0.985, 0.993, cs) * uNight;                              // verschwommene Mondscheibe durchs Wasser
          gl_FragColor = vec4(c + glow * sun + vec3(0.75, 0.85, 1.0) * moon * 0.55, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -10;
  scene.add(dome);
  updaters.push(() => dome.position.copy(camera.position));

  /* ---------- Wasseroberfläche ---------- */
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900).rotateX(Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: shared.uTime, uNight: nightU, uFade: { value: 0.01 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uNight; uniform float uFade; varying vec3 vW;
        ${CAUSTIC_GLSL}
        void main() {
          float a = causticRaw(vW.xz * 0.02, uTime * 0.35);
          float d = length(vW.xz - cameraPosition.xz);
          vec3 col = vec3(0.7, 0.95, 1.0) * (0.5 + step(0.35, a) * 0.6) * (1.0 - uNight * 0.7);
          gl_FragColor = vec4(col, exp(-d * uFade) * 0.7); // uFade: wie schnell die hellen Linien in der Ferne verschwinden
        }`,
    }),
  );
  surface.position.y = WORLD.surfaceY;
  scene.add(surface);

  /* ---------- Lichtstrahlen ---------- */
  const rays = [];
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: shared.uTime, uSeed: { value: rng() * 10 }, uOpacity: { value: 0.2 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uSeed, uOpacity; varying vec2 vUv;
        void main() {
          float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
          float flick = 0.6 + 0.4 * sin(uTime * 0.6 + uSeed * 6.0 + vUv.y * 2.0);
          gl_FragColor = vec4(vec3(1.0, 0.98, 0.85) * edge * pow(vUv.y, 1.5) * flick * uOpacity, 1.0);
        }`,
    });
    const w = range(rng, 2.5, 6), h = range(rng, 34, 44);
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0), mat);
    ray.rotation.order = 'YXZ';
    ray.rotation.z = range(rng, 0.15, 0.35);
    const a = rng() * Math.PI * 2, d = range(rng, 3, 40);
    ray.userData = { bx: Math.cos(a) * d, bz: Math.sin(a) * d, ph: rng() * 10 };
    ray.position.set(ray.userData.bx, WORLD.surfaceY, ray.userData.bz);
    scene.add(ray);
    rays.push(ray);
  }
  updaters.push((dt, t) => {
    for (const r of rays) {
      const u = r.userData;
      r.position.x = u.bx + Math.sin(t * 0.05 + u.ph) * 5;
      r.position.z = u.bz + Math.cos(t * 0.04 + u.ph) * 5;
      r.rotation.y = Math.atan2(camera.position.x - r.position.x, camera.position.z - r.position.z);
      const dist = Math.hypot(camera.position.x - r.position.x, camera.position.z - r.position.z);
      r.material.uniforms.uOpacity.value = 0.22 * smoothstep(3, 10, dist) * (1 - env.night * 0.85);
    }
  });

  /* ---------- Papp-Insel ---------- */
  const sandTex = sandTexture(rng, 0xf4d9a0);
  sandTex.repeat.set(0.085, 0.085);
  const lowSandTex = sandTexture(rng, 0xb9d6d6);
  lowSandTex.repeat.set(0.05, 0.05);
  const cardTex = cardboardTexture(rng);
  cardTex.repeat.set(0.3, 0.3);
  frillTexture(rng, 0xfbeec4); // nur würfeln wie früher (damit der übrige Aufbau gleich bleibt) …
  const frill = frillTexture(mulberry32(812), 0xfbeec4, 2); // … gezeichnet wird doppelt so fein
  frill.anisotropy = 8;
  const edgeTex = corrugatedTexture(mulberry32(813));
  const sandMat = standard({ map: sandTex, roughness: 1 }, { caustics: 0.55 });
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 1 });
  const frillMat = new THREE.MeshStandardMaterial({ map: frill, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, emissiveMap: frill, emissive: 0x1a1a1a });

  function slab(rFn, cx, cz, top, depth, n = 120) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = rFn(a);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
    // Deckel aus Sand …
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, top, 0);
    const mesh = new THREE.Mesh(g, sandMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    // … und eine runde Seitenwand aus gestapelter Wellpappe (glatt schattiert, Muster läuft sauber um)
    const LAYER = 0.65, TILE = 2.2, wp = [], wn = [], wu = [], wi = [];
    let run = 0;
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], pPrev = pts[(i - 1 + n) % n], pNext = pts[(i + 1) % n];
      if (i > 0) run += p.distanceTo(pts[i - 1]);
      let nx = pNext.y - pPrev.y, nz = -(pNext.x - pPrev.x);
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      if (nx * (p.x - cx) + nz * (p.y - cz) < 0) { nx = -nx; nz = -nz; }
      wp.push(p.x, top, p.y, p.x, top - depth, p.y);
      wn.push(nx, 0, nz, nx, 0, nz);
      wu.push(run / TILE, depth / LAYER, run / TILE, 0);
      if (i < n) { const b = i * 2; wi.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
    wg.setIndex(wi);
    const wall = new THREE.Mesh(wg, edgeMat);
    wall.castShadow = wall.receiveShadow = true;
    scene.add(wall);
    // gewellte Papierkante
    const pos = [], uv = [], idx = [];
    let len = 0;
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], pPrev = pts[(i - 1 + n) % n], pNext = pts[(i + 1) % n];
      const tx = pNext.x - pPrev.x, tz = pNext.y - pPrev.y;
      let nx = tz, nz = -tx;
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      if (nx * (p.x - cx) + nz * (p.y - cz) < 0) { nx = -nx; nz = -nz; }
      if (i > 0) len += pts[i % n].distanceTo(pts[i - 1]);
      pos.push(p.x + nx * 0.03, top + 0.03, p.y + nz * 0.03, p.x + nx * 0.32, top - 0.7, p.y + nz * 0.32);
      uv.push(len / 3, 1, len / 3, 0);
      if (i < n) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    fg.setIndex(idx);
    fg.computeVertexNormals();
    const fm = new THREE.Mesh(fg, frillMat);
    fm.receiveShadow = true;
    scene.add(fm);
  }
  slab(islandR, 0, 0, 0, 7, 360);
  for (const p of PLATEAUS) slab((a) => plateauR(p, a), p.x, p.z, p.h, p.h + 0.5, 160);

  const low = new THREE.Mesh(
    new THREE.CircleGeometry(260, 64).rotateX(-Math.PI / 2),
    standard({ map: lowSandTex, roughness: 1 }, { caustics: 0.5 }),
  );
  low.position.y = WORLD.lowY - 0.01;
  low.receiveShadow = true;
  scene.add(low);

  /* ---------- Hintergrund: gestaffelte Kulissen im Wasserdunst (js/depth.js) ---------- */
  updaters.push(buildDepth(scene, mulberry32(9001), { fogColor: WORLD.fogColor, nightU, env, lowY: WORLD.lowY, surface, camera }));
  // Die alten Kulissen haben hier 140176 Zufallszahlen verbraucht. Überspringen, damit alle
  // Korallen, Steine usw. danach genau an derselben Stelle bleiben wie vorher.
  for (let i = 0; i < 140176; i++) rng();

  /* ---------- Schatztruhe + Papierstern ---------- */
  const chest = buildChest(scene, rng);
  obstacles.push({ x: 0, z: 0, r: 2.1 });
  updaters.push(chest.update);

  /* ---------- Krabbenstadt am hinteren Inselrand ---------- */
  const townStart = obstacles.length, sceneStart = scene.children.length;
  const town = buildTown(scene, mulberry32(4711), { heightAt, obstacles, env, camera });
  updaters.push(town.update);
  // Plätze für Blubberbad & Spielplatz schon jetzt reservieren (kein Gras/Korallen darin)
  for (const [x, z, r] of Object.values(PLACE_SPOTS)) obstacles.push({ x, z, r });

  /* ---------- Nichts soll ineinander stecken ----------
     Feste Dinge merken (x, z, Radius, Höhe). Deko, die hineinragen würde, wird nur ausgeblendet –
     gewürfelt wird trotzdem gleich, damit sich der Rest der Insel nicht verschiebt. */
  const solids = [];
  const plants = []; // Seetang, Eck-Pflanzen, Seesterne: dort wächst hinterher kein Gras
  const blocked = (x, z, r, k = 0.9, soft = true) =>
    solids.some((o) => (soft || !o.soft) && Math.hypot(o.x - x, o.z - z) < (o.r + r) * k);
  const onStreet = (x, z) => {
    const d = Math.hypot(x, z), a = (Math.atan2(z, x) * 180) / Math.PI;
    return d > 30.9 && d < 34.3 && a > -127.5 && a < -76.5;
  };
  for (const o of obstacles.slice(townStart)) solids.push({ x: o.x, z: o.z, r: o.r });
  for (const [x, z] of town.mailboxes) solids.push({ x, z, r: 0.4 });
  // später gebaute feste Dinge: Anker, Wegweiser, Riesenmuschel, Sandbank mit Wrack, Truhe
  for (const [x, z, r] of [[17.5, 7, 1.0], [-8.5, 15.5, 0.7], [8.5, 13.5, 1.5], [30, -30, 7.6], [0, 0, 1.6]]) solids.push({ x, z, r });

  /* ---------- Krabbenwiese ausdünnen (Radius ≤ 29, freier Kreis um die Truhe) ---------- */
  // Weggelassenes wird trotzdem „gewürfelt“, damit alles danach (z. B. die Korallen auf den
  // Plateaus und damit der Platz der Sternwarte) genau gleich bleibt.
  const MEADOW = WORLD.crabRadius + 2, CHEST_FREE = 5;
  const inMeadow = (x, z) => Math.hypot(x, z) <= MEADOW;
  const every = (k) => { let n = 0; return () => n++ % k === 0; };
  const ghosts = [];   // Platzhalter-Hindernisse bis nach den Korallen (gleiche Würfelfolge)
  let dry = false;     // true: nur würfeln, nichts bauen

  /* ---------- Papierfelsen ---------- */
  const rockGeos = [];
  const grainTex = grainTexture(rng);
  function rock(x, z, size, sy = 0.75, keep = true) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position, seed = rng() * 50;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + noise3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3) * 0.3);
      p.setXYZ(i, v.x * size, Math.max(v.y, -0.3) * size * sy, v.z * size);
    }
    g.computeVertexNormals();
    const base = new THREE.Color(pick(rng, [0xa7b8cf, 0xc2b4a6, 0x9fc0b6, 0xb6a9c9]));
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      c.copy(base).multiplyScalar(0.9 + rng() * 0.2);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.rotateY(rng() * Math.PI * 2);
    g.translate(x, heightAt(x, z), z);
    if (keep) rockGeos.push(g);
  }
  const keepRock = every(3);
  for (let i = 0; i < 11; i++) {
    const s = range(rng, 0.4, 1.5);
    const sp = spot(6, 34, s + 0.3);
    if (!sp) continue;
    const keep = !inMeadow(sp.x, sp.z) || keepRock();     // in der Wiese nur jeder dritte Stein
    const show = keep && !blocked(sp.x, sp.z, s * 1.1);
    rock(sp.x, sp.z, s, 0.75, show);
    if (show) solids.push({ x: sp.x, z: sp.z, r: s * 1.1, top: s * 0.75 });
    // pad: Steine sind breiter als ihr Platz – Krabben halten etwas mehr Abstand
    if (s > 0.6) (keep ? obstacles : ghosts).push({ x: sp.x, z: sp.z, r: s * 0.9, pad: s * 0.3 });
    if (!keep && s > 0.6) obstacles.push(ghosts[ghosts.length - 1]);
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, d = range(rng, 44, 62);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, size = range(rng, 2, 5), sy = range(rng, 0.6, 1.1);
    const show = !blocked(x, z, size * 1.05, 1); // große Felsen nicht ineinander
    rock(x, z, size, sy, show);
    if (show) solids.push({ x, z, r: size * 1.1, top: size * sy });
  }
  const rockMesh = new THREE.Mesh(
    mergeAll(rockGeos, ['position', 'normal', 'color', 'uv']),
    standard({ vertexColors: true, flatShading: true, map: grainTex, roughness: 1, emissive: 0x1a1a22 }, { caustics: 0.4 }),
  );
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  // Blubber-Felsen: ein paar kantige Steine (wie die Felsen der Insel), zwischen denen es blubbert.
  // Eigener Zufall je Stelle, damit der übrige Aufbau der Insel gleich bleibt.
  const vents = [], ventGeos = [];
  function ventRock(r, x, y, z, size, sy, base) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position, seed = r() * 50;
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, k);
      v.multiplyScalar(1 + noise3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3) * 0.3);
      p.setXYZ(k, v.x * size, Math.max(v.y, -0.3) * size * sy, v.z * size);
    }
    g.computeVertexNormals();
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let k = 0; k < p.count; k += 3) {
      c.set(base).multiplyScalar(0.9 + r() * 0.2);
      for (let q = 0; q < 3; q++) col.set([c.r, c.g, c.b], (k + q) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.rotateY(r() * Math.PI * 2);
    g.translate(x, y, z);
    ventGeos.push(g);
  }
  for (let i = 0; i < 3; i++) {
    const sp = spot(10, 30, 2);
    if (!sp) continue;
    const r = mulberry32(7100 + i * 31), y0 = heightAt(sp.x, sp.z), turn = r() * Math.PI * 2;
    const base = [0xa7b8cf, 0x9fc0b6, 0xb6a9c9][i];
    // drei bis vier Steine eng im Kreis, die Blasen steigen in der Mitte zwischen ihnen auf
    const n = 3 + (i % 2);
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2, d = 0.36 + r() * 0.05, size = 0.33 + r() * 0.1, sy = 1.3 + r() * 0.4;
      ventRock(r, sp.x + Math.cos(a) * d, y0 - 0.05, sp.z + Math.sin(a) * d, size, sy, base);
    }
    // kleine Brocken davor
    for (let k = 0; k < 3; k++) {
      const a = turn + 0.5 + k * 2.2, d = 0.85 + r() * 0.15;
      ventRock(r, sp.x + Math.cos(a) * d, y0 - 0.03, sp.z + Math.sin(a) * d, 0.12 + r() * 0.08, 0.8, base);
    }
    obstacles.push({ x: sp.x, z: sp.z, r: 0.9 });
    solids.push({ x: sp.x, z: sp.z, r: 0.8, top: 0.7 });
    vents.push(new THREE.Vector3(sp.x, y0 + 0.45, sp.z));
  }
  if (ventGeos.length) {
    const vm = new THREE.Mesh(mergeAll(ventGeos, ['position', 'normal', 'color', 'uv']), rockMesh.material);
    vm.castShadow = vm.receiveShadow = true;
    scene.add(vm);
  }

  /* ---------- Korallen (Pappaufsteller) ---------- */
  const A = {
    branch: [0xff6f91, 0xff9f45, 0xffd23f, 0xb07ef0, 0x4fe0c0, 0xff5470].map((c) => art(drawBranchCoral(rng, c))),
    fan: [0xff5470, 0xb07ef0, 0xff9f45].map((c) => art(drawFanCoral(rng, c))),
    tube: [0xffb347, 0xc77dff, 0x5ce1e6].map((c) => art(drawTubeCoral(rng, c))),
    anemone: [[0xd94f8a, 0xffe0f0], [0x7b4cd6, 0xffd6a5], [0x2ec4b6, 0xe8fff7]].map(([a, b]) => art(drawAnemone(rng, a, b))),
    kelp: [0x43a047, 0x7cb342, 0x2e8b57].map((c) => art(drawKelp(rng, c))),
    tuft: [0x4cc26a, 0x8bd450, 0x2fae8f, 0xa5c94a].map((c) => art(drawTuft(rng, c))),
  };

  /** Fächerkoralle: EIN Fächer, sanft gebogen wie eine Karte (statt zwei gekreuzter Fächer, die abgehackt wirken). */
  function bentFan(stk, worldW, segY) {
    const g = stickerGeometry(stk, worldW, 'bottom', 12, segY), p = g.attributes.position;
    const Rb = worldW * 0.8, half = (stk.canvas.width * g.userData.k) / 2, mid = Rb * (1 - Math.cos(half / Rb)) / 2;
    for (let i = 0; i < p.count; i++) {
      const ang = p.getX(i) / Rb;
      p.setX(i, Rb * Math.sin(ang));
      p.setZ(i, Rb * (1 - Math.cos(ang)) - mid);
    }
    g.computeVertexNormals();
    return { list: [g], height: g.userData.contentH };
  }
  const moundTex = {};
  const groups = new Map();
  function addCut(kind, x, z, worldW, { planes = 2, sway = 0, speed = 1, segY = 1 } = {}) {
    const a = pick(rng, A[kind]);
    const { list, height } = kind === 'fan' ? bentFan(a.stk, worldW, segY) : crossedGeometry(a.stk, worldW, planes, segY);
    const yaw = rng() * Math.PI, y = heightAt(x, z) - 0.02;
    for (const g of list) {
      g.rotateY(yaw);
      g.translate(x, y, z);
      setSway(g, y, height, 1.5);
    }
    if (dry) return height;
    const key = `${a.t.uuid}|${sway}|${speed}`;
    if (!groups.has(key)) groups.set(key, { t: a.t, geos: [], sway, speed });
    groups.get(key).geos.push(...list);
    return height;
  }

  const reefAnemones = [];
  const plateauCorals = [];
  const reefs = [];
  for (let i = 0; i < 6; i++) { const sp = spot(8, 28, 2.5); if (sp) reefs.push(sp); }
  for (const p of PLATEAUS) reefs.push({ x: p.x, z: p.z, plateau: p });
  const keepReef = every(2);
  for (const rc of reefs) {
    dry = !rc.plateau && !keepReef();
    const n = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, d = rc.plateau ? range(rng, 0, rc.plateau.r * 0.7) : range(rng, 0, 4);
      const x = rc.x + Math.cos(a) * d, z = rc.z + Math.sin(a) * d;
      if (Math.hypot(x, z) < 5) continue;
      if (!rc.plateau && !free(x, z, 0.7)) continue;
      if (rc.plateau) plateauCorals.push({ x, z });
      const type = pick(rng, ['branch', 'branch', 'branch', 'fan', 'fan', 'tube', 'tube', 'anemone', 'mound', 'mound']);
      const s = range(rng, 0.8, 1.3);
      // halbe Breite des Aufstellers: ragt er in etwas hinein, wird er nur nicht gebaut
      const rv = { branch: 0.94, fan: 1.02, tube: 0.64, anemone: 0.68, mound: 0.9 }[type] * s;
      const clusterDry = dry;
      if (blocked(x, z, rv)) dry = true;
      let r = 0.8 * s, h = 0.7 * s;
      if (type === 'branch') { h = addCut('branch', x, z, 2.2 * s, { planes: 3, sway: 0.06, segY: 3 }); r = 0.9 * s; }
      else if (type === 'fan') { h = addCut('fan', x, z, 2.4 * s, { planes: 2, sway: 0.1, segY: 3 }); }
      else if (type === 'tube') { h = addCut('tube', x, z, 1.6 * s); r = 0.7 * s; }
      else if (type === 'anemone') {
        h = addCut('anemone', x, z, 1.7 * s, { planes: 3, sway: 0.12, speed: 1.8, segY: 3 });
        if (!dry) reefAnemones.push({ x, y: heightAt(x, z) + h * 0.8, z, s });
        r = 0.7 * s;
      } else { mound(x, z, s); r = 0.9 * s; }
      if (!dry) solids.push({ x, z, r: rv, top: heightAt(x, z) + h, soft: type !== 'mound' });
      dry = clusterDry;
      if (!rc.plateau) { const o = { x, z, r, pad: Math.max(0, rv - r) }; obstacles.push(o); if (dry) ghosts.push(o); }
    }
  }
  dry = false;
  // Platzhalter wieder entfernen: dort ist jetzt wirklich frei (Krabben dürfen hin)
  for (const g of ghosts) obstacles.splice(obstacles.indexOf(g), 1);
  // äußere Riffe auf dem tiefen Boden
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, d = range(rng, 43, 62);
    const kind = pick(rng, ['branch', 'fan', 'tube']);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, w = range(rng, 2.5, 4.5);
    const hide = blocked(x, z, w * 0.42);
    if (hide) dry = true;
    addCut(kind, x, z, w, { sway: kind === 'tube' ? 0 : 0.08, segY: 3 });
    dry = false;
    if (!hide) solids.push({ x, z, r: w * 0.42, soft: true });
  }
  // Kelp am Inselrand (vorne frei) und draußen
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const edge = i < 40;
    const d = edge ? islandR(a) - range(rng, 1, 4) : range(rng, 42, 60);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (edge && (!free(x, z, 0.5) || Math.abs(Math.atan2(x, z)) < 1.0)) continue;
    const w = range(rng, 1.1, 1.8);
    const hide = onStreet(x, z) || blocked(x, z, 0.35, 0.9, false);
    if (hide) dry = true;
    addCut('kelp', x, z, w, { sway: 0.9, speed: 0.6, segY: 10 });
    dry = false;
    if (!hide) plants.push({ x, z, r: 0.6 });
    if (edge) obstacles.push({ x, z, r: 0.5 });
  }
  const addCutLater = [];
  const flushCuts = () => {
    for (const args of addCutLater) addCut(...args);
    pruneTufts();
    for (const g of groups.values()) {
      scene.add(cutMesh(mergeAll(g.geos, ['position', 'normal', 'uv', 'aSway']), g.t, { sway: g.sway, speed: g.speed }));
    }
  };

  /** Grasbüschel, die später Gebautes (Seetang, Eck-Pflanzen, Seesterne) berühren würden, weglassen. */
  function pruneTufts() {
    const m4 = new THREE.Matrix4();
    for (const mesh of new Set(tufts.map((t) => t.mesh))) {
      const list = tufts.filter((t) => t.mesh === mesh);
      let n = 0;
      list.forEach((t, i) => {
        if (plants.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < p.r + t.half)) { tufts.splice(tufts.indexOf(t), 1); return; }
        mesh.getMatrixAt(i, m4);
        mesh.setMatrixAt(n++, m4);
      });
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  } // weggelassene Büschel fliegen aus der Liste: ein zweiter Aufruf passt dann wieder zu den Matrizen

  // Hirnkorallen als Papp-Kuppeln
  function mound(x, z, s) {
    const col = pick(rng, [0xf7a1c4, 0xb8e986, 0xffcf7a, 0x9fd8ff]);
    if (!moundTex[col]) {
      const [c, ctx] = canvas(256, 128);
      ctx.fillStyle = css(col); ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = css(col, -0.25); ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        let px = rng() * 256, py = rng() * 128, a = rng() * 6;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let k = 0; k < 8; k++) { a += range(rng, -1.2, 1.2); px += Math.cos(a) * 9; py += Math.sin(a) * 9; ctx.lineTo(px, py); }
        ctx.stroke();
      }
      grain(ctx, 256, 128, rng, 1.5);
      moundTex[col] = toTexture(c);
    }
    const g = new THREE.SphereGeometry(0.9 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.75, 1);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: moundTex[col], roughness: 1, flatShading: true, emissiveMap: moundTex[col], emissive: 0x333333 }));
    m.position.set(x, heightAt(x, z) - 0.05, z);
    m.castShadow = m.receiveShadow = true;
    if (!dry) scene.add(m);
  }

  /* ---------- Grasbüschel (instanziert) ---------- */
  const tufts = [];
  // Büschel wachsen in Grüppchen (wirkt natürlicher als gleichmäßig verstreut)
  const tuftPatches = [];
  for (let i = 0; i < 34; i++) { const sp = spot(4, 36, 0.5, 6); if (sp) tuftPatches.push({ ...sp, r: range(rng, 1.2, 3.2) }); }
  for (const a of A.tuft) {
    const { list, height } = crossedGeometry(a.stk, 0.9, 2, 2);
    const g = mergeAll(list, ['position', 'normal', 'uv']);
    setSway(g, 0, height, 1.5);
    const count = 115;
    const mesh = new THREE.InstancedMesh(g, cutMat(a.t, 0.1, 1.5), count);
    const dropTuft = (() => { let n = 0; return () => n++ % 3 === 2; })();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    let n = 0;
    let skipped = 0;
    for (let i = 0; i < count * 4 && n + skipped < count; i++) {
      let sp;
      if (rng() < 0.8 && tuftPatches.length) {
        const pc = pick(rng, tuftPatches), ang = rng() * Math.PI * 2, d = Math.sqrt(rng()) * pc.r;
        sp = { x: pc.x + Math.cos(ang) * d, z: pc.z + Math.sin(ang) * d };
        if (!free(sp.x, sp.z, 0.25)) continue;
      } else sp = spot(4, 37, 0.3, 3);
      if (!sp || heightAt(sp.x, sp.z) < 0) continue;
      const rr = Math.hypot(sp.x, sp.z);
      if (rr < CHEST_FREE) continue;
      if (rr <= MEADOW && dropTuft()) { skipped++; continue; } // Wiese: ein Drittel weniger (nicht woanders hin)
      pos.set(sp.x, heightAt(sp.x, sp.z) - 0.02, sp.z);
      q.setFromAxisAngle(UPV, rng() * Math.PI);
      const s = range(rng, 0.6, 1.4);
      // nicht durchs Pflaster, Häuser, Steine oder mitten durch Korallen wachsen (zählt wie „weggelassen“)
      if (onStreet(sp.x, sp.z) || blocked(sp.x, sp.z, 0.3, 1, false) || blocked(sp.x, sp.z, 0.3, 0.55)) { skipped++; continue; }
      mesh.setMatrixAt(n++, m4.compose(pos, q, sc.set(s, s, s)));
      tufts.push({ mesh, x: sp.x, z: sp.z, half: 0.45 * s });
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  /* ---------- Seesterne & Muscheln (echte kleine Formen auf dem Boden) ---------- */
  {
    // die alten Bilder werden nur noch gewürfelt, damit der übrige Aufbau der Insel gleich bleibt
    const decos = [
      ...[0xff7b39, 0xff4d6d, 0xb07ef0, 0x5b8cff, 0xffc93c].map((c) => ({ stk: drawStarfish(rng, c), c, kind: 'star', size: [0.5, 0.9], n: 3 })),
      ...[0xffe5d9, 0xf6bd60, 0xf7a1c4].map((c) => ({ stk: drawShell(rng, c), c, kind: 'shell', size: [0.35, 0.6], n: 3 })),
    ];
    const keepSmall = every(3);
    const decoGeos = [];
    for (const d of decos) {
      const geos = [];
      for (let i = 0; i < d.n; i++) {
        const sp = spot(CHEST_FREE, 36, 0.4, 10);
        if (!sp) continue;
        if (inMeadow(sp.x, sp.z) && !keepSmall()) continue;
        const size = range(rng, ...d.size);
        const g = d.kind === 'star' ? starfish3D(size * 0.42, d.c, geos.length) : shell3D(size * 0.6, d.c);
        g.rotateY(rng() * Math.PI * 2);
        // dem Hang folgen: nach der Boden-Neigung kippen, damit nichts halb im Sand steckt oder schwebt
        const e = 0.25, nx = heightAt(sp.x - e, sp.z) - heightAt(sp.x + e, sp.z), nz = heightAt(sp.x, sp.z - e) - heightAt(sp.x, sp.z + e);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 2 * e, nz).normalize()));
        const deg = Math.atan2(sp.z, sp.x) * 180 / Math.PI, rr = Math.hypot(sp.x, sp.z);
        if (deg > -127 && deg < -77 && rr > 31 && rr < 34.2) continue; // nicht auf die Pflastersteine der Muschelgasse
        g.translate(sp.x, heightAt(sp.x, sp.z) - 0.01, sp.z);
        plants.push({ x: sp.x, z: sp.z, r: size * 0.5 });
        geos.push(g);
      }
      decoGeos.push(...geos);
    }
    if (decoGeos.length) {
      const m = new THREE.Mesh(mergeAll(decoGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true, side: THREE.DoubleSide })); // Muschel unten offen
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }

  /* ---------- Neue Deko: Seeigel, Kiesel, Sandrillen, Anker, Schild, Riesenmuschel ---------- */
  {
    // Seeigel (kleine gekreuzte Pappaufsteller)
    const urchins = [0x7b3fa0, 0x2f3a7a, 0xb23a6e].map((c) => art(drawUrchin(rng, c)));
    const ug = new Map();
    const keepUrchin = every(3);
    for (let i = 0; i < 4; i++) {
      const sp = spot(7, 28, 0.6, 12);
      if (!sp || !keepUrchin()) continue;
      const a = pick(rng, urchins);
      const { list } = crossedGeometry(a.stk, range(rng, 0.55, 0.85), 2);
      const yaw = rng() * Math.PI, y = heightAt(sp.x, sp.z) - 0.02;
      for (const g of list) { g.rotateY(yaw); g.translate(sp.x, y, sp.z); }
      if (!ug.has(a)) ug.set(a, []);
      ug.get(a).push(...list);
      obstacles.push({ x: sp.x, z: sp.z, r: 0.45 });
    }
    for (const [a, geos] of ug) scene.add(cutMesh(mergeAll(geos, ['position', 'normal', 'uv']), a.t));

    // Kiesel-Flecken und Sandrillen flach auf dem Boden
    const flat = (stk, size, n, mat, lift) => {
      const geos = [];
      for (let i = 0; i < n; i++) {
        const sp = spot(5, 35, size * 0.4, 10);
        if (!sp) continue;
        const g = stickerGeometry(stk, size * range(rng, 0.8, 1.2), 'center');
        g.rotateX(-Math.PI / 2); g.rotateY(rng() * Math.PI * 2);
        g.translate(sp.x, heightAt(sp.x, sp.z) + lift + i * 0.0005, sp.z);
        geos.push(g);
      }
      const m = new THREE.Mesh(mergeAll(geos, ['position', 'normal', 'uv']), mat);
      m.receiveShadow = true;
      scene.add(m);
    };
    drawPebbles(rng); // nur würfeln wie früher
    { // Kiesel-Fleck: echte kleine Steine statt Bild
      const sp = spot(5, 35, 1.6 * 0.4, 10);
      const k = sp ? range(rng, 0.8, 1.2) : 1, yaw = sp ? rng() * Math.PI * 2 : 0;
      if (sp) {
        const pr = mulberry32(5150), pg = [];
        for (let i = 0; i < 11; i++) {
          const a = pr() * Math.PI * 2 + yaw, d = Math.sqrt(pr()) * 0.62 * k, r0 = (0.07 + pr() * 0.07) * k;
          const g = new THREE.DodecahedronGeometry(r0, 0); g.scale(1 + pr() * 0.4, 0.45, 1); g.rotateY(pr() * 3);
          const x = sp.x + Math.cos(a) * d, z = sp.z + Math.sin(a) * d;
          g.translate(x, heightAt(x, z) + r0 * 0.2, z);
          pg.push(paint(g, [0xcfc6b8, 0xb9c7cf, 0xd8c7b0, 0xaebfb5, 0xe4d8c4][i % 5], { shade: true }));
        }
        const m = new THREE.Mesh(mergeAll(pg), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
      }
    }
    const rip = drawRipples(rng, 0xf4d9a0);
    flat(rip, 4.2, 16, new THREE.MeshStandardMaterial({ map: toTexture(rip.canvas), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), 0.012);

    // Anker, schräg im Sand
    const an = art(drawAnchor(rng));
    const anchor = cutMesh(stickerGeometry(an.stk, 1.7, 'bottom'), an.t);
    anchor.position.set(17.5, heightAt(17.5, 7) - 0.35, 7);
    anchor.rotation.set(0, -0.5, 0.42);
    scene.add(anchor);
    obstacles.push({ x: 17.5, z: 7, r: 1.0 });

    // Wegweiser
    const sg = art(drawSign(rng, ['Stargazer Sea', t('sign.line')]));
    // Schild mit Dicke: Vorderseite (Schrift), schlichte Rückseite und ein Kern dazwischen für Brett und Pfahl
    const sign = new THREE.Group();
    const front = cutMesh(stickerGeometry(sg.stk, 2.3, 'bottom'), sg.t);
    const sgBack = art(drawSign(mulberry32(4242), ['', ''])); // eigener Zufall: der übrige Aufbau bleibt gleich
    const back = cutMesh(stickerGeometry(sgBack.stk, 2.3, 'bottom'), sgBack.t);
    const T = 0.1, k = front.geometry.userData.k, H = sg.stk.h;
    front.position.z = T / 2; back.position.z = -T / 2; back.rotation.y = Math.PI;
    // Kern aus Holz (Brett und Pfahl in ihren Holzfarben), etwas dünner als der Abstand, sonst flackert er mit den Bildern
    const wood = (geo, color) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })); m.castShadow = true; return m; };
    const board = wood(new THREE.BoxGeometry(282 * k, 126 * k, T * 0.7).translate(0, (H - 74) * k, 0), 0xb07a42);
    const post = wood(new THREE.BoxGeometry(32 * k, 110 * k, T * 0.7).translate(0, 55 * k, 0), 0x8a5a30);
    sign.add(front, back, board, post);
    sign.position.set(-8.5, heightAt(-8.5, 15.5) - 0.05, 15.5);
    sign.rotation.set(0, 0.32, -0.05);
    scene.add(sign);
    obstacles.push({ x: -8.5, z: 15.5, r: 0.9 });

    // Rahmen vorne: zwei große Pflanzengruppen in den unteren Ecken (Tiefe!)
    for (const [fx, fz] of [[-12.5, 21.5], [13, 22]]) {
      const placed = [];
      for (let k = 0; k < 2; k++) {
        let x = fx + range(rng, -1.6, 1.6), z = fz + range(rng, -1.2, 1.2);
        const kind = pick(rng, ['branch', 'fan', 'kelp', 'branch']);
        const w = kind === 'kelp' ? range(rng, 1.4, 1.9) : range(rng, 2.6, 3.4);
        const rv = kind === 'kelp' ? 0.5 : w * 0.5;
        // zweite Pflanze so weit zur Seite rücken, dass sie die erste nicht durchsticht
        for (const p of placed) {
          const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), need = p.rv + rv;
          if (d < need) { const ux = d > 0.01 ? dx / d : 1, uz = d > 0.01 ? dz / d : 0; x = p.x + ux * need; z = p.z + uz * need; }
        }
        placed.push({ x, z, rv });
        plants.push({ x, z, r: rv + 0.1 });
        if (kind === 'kelp') addCutLater.push(['kelp', x, z, w, { sway: 0.9, speed: 0.6, segY: 10 }]);
        else addCutLater.push([kind, x, z, w, { planes: 2, sway: 0.08, segY: 3 }]);
      }
      obstacles.push({ x: fx, z: fz, r: 2.2 });
    }
  }
  const clam = buildClam(scene, rng, 8.5, 13.5);
  obstacles.push({ x: 8.5, z: 13.5, r: 1.6 });
  updaters.push(clam);

  flushCuts();

  /* ---------- Besondere Orte: Sternwarte, Wrack-Café, Blubberbad, Spielplatz ---------- */
  const places = buildPlaces(scene, { heightAt, obstacles, plateaus: PLATEAUS, plateauCorals, env, ...town });
  updaters.push(places.update);
  town.vents.push(...places.vents);

  /* ---------- Mehr Leben: Seegras-Felder, Korallengruppen, Kelp-Wäldchen, Kleinkram, kleine Orte ---------- */
  buildExtras({ scene, heightAt, obstacles, plants, solids, blocked, onStreet, free, A, tufts, pruneTufts, bentFan });

  /* ---------- Tiere ---------- */
  const sky = skyline(scene, sceneStart, solids);
  updaters.push(buildFish(scene, rng, camera, reefAnemones, sky));
  const glowMats = [];
  updaters.push(buildJellies(scene, rng, camera, glowMats, sky));
  updaters.push(buildTurtle(scene, rng, 1.0, 30, 11, 0.055, 0, sky));
  updaters.push(buildTurtle(scene, rng, 0.7, 22, 7.5, -0.075, 2.4, sky));
  updaters.push(buildManta(scene, rng));

  /* ---------- Blasen ---------- */
  const bubbles = new Bubbles(scene, renderer, camera, 1200);
  updaters.push((dt) => {
    for (const v of vents) if (Math.random() < dt * 7) bubbles.spawn(v.x, v.y, v.z, 1, 0.25, 0.1, 0.26);
    for (const v of town.vents) if (Math.random() < dt * 3) bubbles.spawn(v.x, v.y, v.z, 1, 0.2, 0.08, 0.2);
    for (const v of places.foam) if (Math.random() < dt * 9) bubbles.spawn(v.x, v.y, v.z, 1, 0.5, 0.12, 0.3); // Blubberbad
    for (const a of reefAnemones) if (Math.random() < dt * 0.25) bubbles.spawn(a.x, a.y, a.z, 3, 0.3, 0.06, 0.14);
    if (Math.random() < dt) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * 36;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      bubbles.spawn(x, heightAt(x, z) + 0.1, z, 2 + Math.floor(Math.random() * 3), 0.2, 0.05, 0.14);
    }
    bubbles.update(dt);
  });
  chest.bubbles = bubbles;
  const confetti = new Confetti(scene);
  updaters.push((dt) => confetti.update(dt));
  chest.confetti = confetti;

  updaters.push(buildSnow(scene, rng, renderer, camera, nightU, winterU));

  /* ---------- Saison-Deko ---------- */
  if (opts.season === 'winter') updaters.push(buildWinter(scene, rng, obstacles));
  if (opts.season === 'halloween') updaters.push(buildHalloween(scene, rng, obstacles, camera, spot, env));

  return {
    obstacles, bubbles, chest, env, sky,
    /** Tag/Nacht: night 0..1 */
    setEnv(night, dusk) {
      env.night = night; env.dusk = dusk;
      nightU.value = night;
      for (const m of glowMats) m.emissive.setScalar(0.55 + night * 1.5); // Quallen leuchten nachts
      chest.setNight?.(night);
    },
    update(dt, t) { for (const u of updaters) u(dt, t); },
    resize() { bubbles.resize(); },
  };
}

/* =========================================================
   Schatztruhe + Papierstern
   ========================================================= */
/* =========================================================
   Mehr Leben auf der Insel (eigener Zufall – der übrige Aufbau bleibt gleich).
   Die Mitte (Krabbenwiese) bleibt frei; alles hält Abstand zu Häusern, Orten und Korallen.
   ========================================================= */
function buildExtras({ scene, heightAt, obstacles, plants, solids, blocked, onStreet, free, A, tufts, pruneTufts, bentFan }) {
  const r = mulberry32(9001);
  const rr = (a, b) => a + r() * (b - a);
  const taken = [];                                               // was hier schon neu gebaut wurde
  const ok = (x, z, rad, { inner = 14 } = {}) => {
    const d = Math.hypot(x, z);
    return d > inner && d < islandR(Math.atan2(z, x)) - 2.5 - rad && free(x, z, rad) && !blocked(x, z, rad, 1) && !onStreet(x, z)
      && !plants.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rad) && !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + rad)
      && Math.hypot(x - 30, z + 30) > 9 && Math.hypot(x, z - 1) > 6   // Wrack-Sandbank, Truhe
      && Object.values(PLACE_SPOTS).every(([px, pz, pr]) => Math.hypot(x - px, z - pz) > pr + rad + 1.8); // Spielplatz & Bad sind größer als ihr Platzhalter
  };
  const claim = (x, z, rad, { block = true, plant = true } = {}) => {
    taken.push({ x, z, r: rad });
    if (plant) plants.push({ x, z, r: rad });                       // dort kein Gras mehr
    if (block) { obstacles.push({ x, z, r: rad }); solids.push({ x, z, r: rad }); }
  };
  const find = (rMin, rMax, rad, tries = 60, o) => {
    for (let i = 0; i < tries; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(rr(rMin * rMin, rMax * rMax)), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (ok(x, z, rad, o)) return { x, z };
    }
    return null;
  };
  const tilt = (g, x, z) => { // Boden-Neigung übernehmen
    const e = 0.25, nx = heightAt(x - e, z) - heightAt(x + e, z), nz = heightAt(x, z - e) - heightAt(x, z + e);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 2 * e, nz).normalize()));
    return g;
  };
  const solid = [];                                                // alles Feste, am Ende in einem Mesh
  const S = (g, c) => solid.push(paint(g.index ? g.toNonIndexed() : g, c, { shade: true }));

  // --- Papp-Pflanzen (Korallen, Kelp, Anemonen) wie die übrigen: nach Bild gruppiert ---
  const cutGroups = new Map();
  const cut = (kind, x, z, w, { planes = 2, sway = 0.08, speed = 1, segY = 3, y = null } = {}) => {
    const a = A[kind][Math.floor(r() * A[kind].length)];
    const { list, height } = kind === 'fan' ? bentFan(a.stk, w, segY) : crossedGeometry(a.stk, w, planes, segY);
    const yaw = r() * Math.PI, y0 = y ?? heightAt(x, z) - 0.02;
    for (const g of list) { g.rotateY(yaw); g.translate(x, y0, z); setSway(g, y0, height, 1.5); }
    const key = `${a.t.uuid}|${sway}|${speed}`;
    if (!cutGroups.has(key)) cutGroups.set(key, { t: a.t, geos: [], sway, speed });
    cutGroups.get(key).geos.push(...list);
    return height;
  };

  // 1) Korallengruppen rund um die Wiese
  for (let i = 0; i < 9; i++) {
    const c = find(19, 37, 2.2);
    if (!c) continue;
    claim(c.x, c.z, 2.2, { block: false, plant: false });
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, d = rr(0, 1.6), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const kind = ['branch', 'fan', 'tube', 'branch', 'anemone'][Math.floor(r() * 5)], s = rr(0.7, 1.15);
      const rad = { branch: 0.9, fan: 0.95, tube: 0.6, anemone: 0.65 }[kind] * s;
      if (!free(x, z, rad * 0.6) || blocked(x, z, rad, 1) || plants.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rad * 0.8)) continue;
      const w = { branch: 2.0, fan: 2.2, tube: 1.5, anemone: 1.6 }[kind] * s;
      cut(kind, x, z, w, kind === 'tube' ? { sway: 0 } : kind === 'anemone' ? { planes: 3, sway: 0.12, speed: 1.8 } : kind === 'branch' ? { planes: 3, sway: 0.06 } : { sway: 0.1 });
      plants.push({ x, z, r: rad }); solids.push({ x, z, r: rad, soft: true }); obstacles.push({ x, z, r: rad * 0.8 });
    }
  }

  // 2) Kelp-Wäldchen am Inselrand
  for (let i = 0; i < 4; i++) {
    const c = find(30, 38, 1.8);
    if (!c) continue;
    claim(c.x, c.z, 1.8, { block: false, plant: false });
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2, d = rr(0, 1.4), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const w = rr(1.4, 2.0), rad = w * 0.45; // Blätter reichen so weit – Nachbarn nicht durchstechen
      if (!free(x, z, 0.3) || plants.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rad)) continue;
      cut('kelp', x, z, w, { planes: 2, sway: 0.9, speed: 0.6, segY: 10 });
      plants.push({ x, z, r: rad }); obstacles.push({ x, z, r: 0.4 });
    }
  }

  // 3) Anemonen auf kleinen Steinen
  const rock = (x, y, z, size, sy, base) => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, seed = r() * 50;
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, k);
      v.multiplyScalar(1 + noise3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3) * 0.25);
      p.setXYZ(k, v.x * size, Math.max(v.y, -0.3) * size * sy, v.z * size);
    }
    g.translate(x, y, z);
    S(g, base);
  };
  for (let i = 0; i < 5; i++) {
    const c = find(15, 36, 0.9);
    if (!c) continue;
    claim(c.x, c.z, 0.9);
    const y = heightAt(c.x, c.z), size = rr(0.5, 0.7), sy = 0.75;
    rock(c.x, y - 0.05, c.z, size, sy, [0xa7b8cf, 0x9fc0b6, 0xb6a9c9][i % 3]);
    cut('anemone', c.x, c.z, rr(1.0, 1.3), { planes: 3, sway: 0.12, speed: 1.8, y: y + size * sy * 0.8 });
  }

  // 4) Dichte Seegras-Felder (Büschel wie die übrigen, in Feldern)
  for (const a of A.tuft) {
    const { list, height } = crossedGeometry(a.stk, 0.9, 2, 2);
    const g = mergeAll(list, ['position', 'normal', 'uv']);
    setSway(g, 0, height, 1.5);
    const pts = [];
    for (let f = 0; f < 4; f++) {
      const c = find(16, 37, 1.2, 40, { inner: 16 });
      if (!c) continue;
      const fr = rr(1.0, 1.8);
      for (let k = 0; k < 14; k++) {
        const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * fr, x = c.x + Math.cos(ang) * d, z = c.z + Math.sin(ang) * d;
        if (free(x, z, 0.25) && !blocked(x, z, 0.3, 1) && !onStreet(x, z) && !plants.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.3)) pts.push([x, z]);
      }
    }
    if (!pts.length) continue;
    const mesh = new THREE.InstancedMesh(g, cutMat(a.t, 0.1, 1.5), pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    pts.forEach(([x, z], k) => {
      const s = rr(0.7, 1.25);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
      m4.compose(pos.set(x, heightAt(x, z) - 0.03, z), q, sc.set(s, s * rr(0.85, 1.2), s));
      mesh.setMatrixAt(k, m4);
      tufts.push({ mesh, x, z, half: 0.45 * s });
    });
    mesh.receiveShadow = true;
    mesh.name = 'extrasGrass';
    scene.add(mesh);
  }

  // 5) Sanddollars und Seeigel im Sand
  for (let i = 0; i < 12; i++) {
    const c = find(8, 37, 0.3, 30, { inner: 8 });
    if (!c) continue;
    claim(c.x, c.z, 0.3, { block: false });
    const R = rr(0.16, 0.24), parts = [];
    parts.push(paint(new THREE.CylinderGeometry(R, R * 1.03, 0.045, 22).toNonIndexed(), 0xeadfc4, { shade: true }));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, petal = new THREE.SphereGeometry(R * 0.32, 8, 4);
      petal.scale(0.38, 0.12, 1); petal.translate(0, 0.022, R * 0.42); petal.rotateY(a);
      parts.push(paint(petal.toNonIndexed(), 0xcbb991, { shade: true }));
    }
    const g = mergeAll(parts); g.rotateY(r() * 6.28); tilt(g, c.x, c.z); g.translate(c.x, heightAt(c.x, c.z) + 0.01, c.z);
    solid.push(g);
  }
  const spikeDirs = (() => { const ico = new THREE.IcosahedronGeometry(1, 1), p = ico.attributes.position, out = [], seen = new Set();
    for (let k = 0; k < p.count; k++) { const v = new THREE.Vector3().fromBufferAttribute(p, k).normalize(), key = v.toArray().map((x) => x.toFixed(3)).join(); if (!seen.has(key) && v.y > -0.3) { seen.add(key); out.push(v); } }
    return out; })();
  for (let i = 0; i < 7; i++) {
    const c = find(10, 37, 0.4, 30, { inner: 10 });
    if (!c) continue;
    claim(c.x, c.z, 0.4, { plant: true });
    const R = rr(0.14, 0.2), col = [0x5b2a86, 0x2f3a7a, 0x8a2b5b][i % 3], parts = [];
    const body = new THREE.IcosahedronGeometry(R, 1); body.scale(1, 0.8, 1); parts.push(paint(body, col, { shade: true })); // Ikosaeder ist schon ohne Index
    for (const v of spikeDirs) {
      const len = R * rr(1.1, 1.7), cone = new THREE.ConeGeometry(R * 0.09, len, 4);
      cone.translate(0, len / 2, 0); cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v));
      cone.translate(v.x * R * 0.85, v.y * R * 0.7, v.z * R * 0.85);
      parts.push(paint(cone.toNonIndexed(), new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.15).getHex(), { shade: true }));
    }
    const g = mergeAll(parts); g.translate(c.x, heightAt(c.x, c.z) + R * 0.5, c.z);
    solid.push(g);
  }

  // 6) Kleine Orte
  const spotFor = (rad, rMin = 18, rMax = 36) => find(rMin, rMax, rad, 120, { inner: rMin });
  // a) Flaschenpost: Flasche liegt schräg im Sand, Korken, Brief guckt heraus
  { const c = spotFor(1.0);
    if (c) {
      claim(c.x, c.z, 1.0);
      const L = [];
      const bottle = new THREE.LatheGeometry([[0, 0], [0.22, 0], [0.26, 0.05], [0.26, 0.62], [0.2, 0.75], [0.1, 0.86], [0.09, 1.02], [0.11, 1.05], [0.11, 1.1], [0, 1.1]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
      L.push(paint(bottle.toNonIndexed(), 0x5fb98a, { shade: true }));
      L.push(paint(new THREE.CylinderGeometry(0.085, 0.075, 0.14, 10).translate(0, 1.15, 0).toNonIndexed(), 0xc49a6c, { shade: true }));
      const scroll = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10); scroll.translate(0, 0.42, 0); L.push(paint(scroll.toNonIndexed(), 0xfff1d6, { shade: true }));
      L.push(paint(new THREE.TorusGeometry(0.062, 0.015, 4, 10).rotateX(Math.PI / 2).translate(0, 0.45, 0).toNonIndexed(), 0xe2574c, { shade: true })); // Schleife um den Brief
      const g = mergeAll(L); g.rotateZ(Math.PI / 2 - 0.12); g.rotateY(r() * 6.28); g.translate(c.x, heightAt(c.x, c.z) + 0.14, c.z);
      solid.push(g);
      // kleiner Sandwall davor
      const mound = new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); mound.scale(1.4, 0.25, 0.8); mound.translate(c.x, heightAt(c.x, c.z) - 0.02, c.z);
      S(mound, 0xeed39a);
    } }
  // b) Ruderboot, halb im Sand versunken, Ruder daneben
  { const c = spotFor(2.0, 22, 36);
    if (c) {
      claim(c.x, c.z, 2.0);
      const B = [], wood = 0x9a6a3c, woodL = 0xb8834d;
      // Rumpf: halbe, längliche Schale (Planken abwechselnd), innen dunkler
      const hull = (rad, col, inner) => {
        const g = new THREE.SphereGeometry(rad, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        g.scale(1, 0.85, 2.1);
        const n = g.toNonIndexed();
        if (inner) { const p = n.attributes.position; for (let k = 0; k < p.count; k += 3) { const t = [p.getX(k + 1), p.getY(k + 1), p.getZ(k + 1)]; p.setXYZ(k + 1, p.getX(k + 2), p.getY(k + 2), p.getZ(k + 2)); p.setXYZ(k + 2, ...t); } }
        n.computeVertexNormals();
        const p = n.attributes.position, col2 = new Float32Array(p.count * 3), cc = new THREE.Color();
        for (let k = 0; k < p.count; k += 3) { const y = (p.getY(k) + p.getY(k + 1) + p.getY(k + 2)) / 3; cc.set(Math.floor(-y / 0.09) % 2 ? col : new THREE.Color(col).multiplyScalar(1.12).getHex()); for (let q = 0; q < 3; q++) col2.set([cc.r, cc.g, cc.b], (k + q) * 3); }
        n.setAttribute('color', new THREE.BufferAttribute(col2, 3));
        return n;
      };
      B.push(hull(0.62, wood, false), hull(0.56, 0x6e4a2a, true));
      B.push(paint(new THREE.TorusGeometry(0.6, 0.06, 5, 32).rotateX(Math.PI / 2).scale(1, 1, 2.1).toNonIndexed(), woodL, { shade: true })); // Bordrand
      B.push(paint(new THREE.BoxGeometry(1.08, 0.06, 0.24).translate(0, -0.1, 0.25).toNonIndexed(), woodL, { shade: true }), paint(new THREE.BoxGeometry(0.9, 0.06, 0.22).translate(0, -0.1, -0.6).toNonIndexed(), woodL, { shade: true })); // zwei Sitzbänke
      const by = r() * 6.28, g = mergeAll(B); g.rotateZ(0.18); g.rotateX(-0.1); g.rotateY(by);
      g.translate(c.x, heightAt(c.x, c.z) + 0.22, c.z);                                  // liegt leicht schräg, der Bauch steckt im Sand
      solid.push(g);
      const oar = mergeAll([paint(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6).toNonIndexed(), woodL, { shade: true }), paint(new THREE.BoxGeometry(0.16, 0.42, 0.03).translate(0, -0.85, 0).toNonIndexed(), woodL, { shade: true })]);
      oar.rotateZ(Math.PI / 2); oar.rotateX(Math.PI / 2); oar.rotateY(by + Math.PI / 2 + 0.15); // flach im Sand, neben dem Boot
      const ox = c.x + Math.cos(by) * 1.05, oz = c.z - Math.sin(by) * 1.05; oar.translate(ox, heightAt(ox, oz) + 0.04, oz);
      solid.push(oar);
    } }
  // c) Steinköpfe: drei kleine Köpfe mit Moos, schauen zur Inselmitte
  { const c = spotFor(1.8, 20, 35);
    if (c) {
      claim(c.x, c.z, 1.8);
      const yaw = Math.atan2(-c.x, -c.z);
      [[-1.0, 0.9], [0, 1.15], [1.0, 0.8]].forEach(([off, s]) => {
        const H = [];
        const stone = 0x9aa3ad, dark = 0x6f7882, moss = 0x7cb342;
        H.push(paint(new THREE.BoxGeometry(0.5, 0.9, 0.42).translate(0, 0.45, 0).toNonIndexed(), stone, { shade: true }));   // Kopf
        H.push(paint(new THREE.BoxGeometry(0.54, 0.12, 0.2).translate(0, 0.66, 0.16).toNonIndexed(), dark, { shade: true })); // Stirn
        H.push(paint(new THREE.BoxGeometry(0.12, 0.32, 0.16).translate(0, 0.46, 0.25).toNonIndexed(), stone, { shade: true })); // Nase
        H.push(paint(new THREE.BoxGeometry(0.28, 0.05, 0.05).translate(0, 0.22, 0.22).toNonIndexed(), dark, { shade: true })); // Mund
        H.push(paint(new THREE.BoxGeometry(0.52, 0.06, 0.44).translate(0, 0.9, 0).toNonIndexed(), moss, { shade: true }));   // Moos oben
        H.push(paint(new THREE.SphereGeometry(0.09, 6, 4).translate(-0.18, 0.95, 0.05).toNonIndexed(), 0x9ccc65, { shade: true }));
        const g = mergeAll(H); g.scale(s, s, s); g.rotateY(yaw + rr(-0.15, 0.15)); g.rotateZ(rr(-0.08, 0.08));
        const x = c.x + Math.cos(yaw) * off, z = c.z - Math.sin(yaw) * off;
        g.translate(x, heightAt(x, z) - 0.12 * s, z);
        solid.push(g);
      });
    } }
  // d) Mini-Garten: Zaun, runde Büsche, Blumen, Kieselweg, Gießkanne
  { const c = spotFor(1.9, 18, 34);
    if (c) {
      claim(c.x, c.z, 1.9);
      const y0 = heightAt(c.x, c.z), Gd = [], R0 = 1.5;
      for (let k = 0; k < 22; k++) {                                     // Lattenzaun mit Lücke als Tor
        const a = (k / 22) * Math.PI * 2;
        if (k === 0 || k === 21) continue;
        const x = c.x + Math.cos(a) * R0, z = c.z + Math.sin(a) * R0, post = new THREE.BoxGeometry(0.08, 0.42, 0.05);
        post.rotateY(-a); post.translate(x, heightAt(x, z) + 0.2, z); Gd.push(paint(post.toNonIndexed(), 0xfff1d6, { shade: true }));
      }
      const rail = new THREE.TorusGeometry(R0, 0.025, 4, 44, Math.PI * 2 * (19 / 22)); rail.rotateX(Math.PI / 2); rail.rotateY(-Math.PI * 2 / 22); // vom ersten bis zum letzten Pfosten
      rail.translate(c.x, y0 + 0.28, c.z); Gd.push(paint(rail.toNonIndexed(), 0xfff1d6, { shade: true }));
      const bushes = [[-0.6, -0.3, 0.32, 0x4caf50], [0.5, -0.55, 0.26, 0x66bb6a], [0.2, 0.6, 0.3, 0x43a047], [-0.2, 0.05, 0.2, 0]]; // letzter: Platz der Gießkanne
      for (const [dx, dz, s, col] of bushes.slice(0, 3)) { // Büsche
        const b = new THREE.IcosahedronGeometry(s, 1); b.scale(1, 0.85, 1); b.translate(c.x + dx, heightAt(c.x + dx, c.z + dz) + s * 0.7, c.z + dz); Gd.push(paint(b, col, { shade: true }));
      }
      const flowers = [];
      for (let k = 0; k < 9; k++) {                                       // Blumen
        const a = r() * Math.PI * 2, d = rr(0.3, 1.15), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, h = rr(0.25, 0.4);
        if (bushes.some(([dx, dz, s]) => Math.hypot(c.x + dx - x, c.z + dz - z) < s + 0.1) || (z - c.z < 0.15 && z - c.z > -0.15 && x > c.x)) continue; // nicht in Büsche, Kanne oder Weg
        if (flowers.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 0.16)) continue; // Blüten nicht ineinander
        flowers.push([x, z]);
        Gd.push(paint(new THREE.CylinderGeometry(0.015, 0.015, h, 4).translate(x, heightAt(x, z) + h / 2, z).toNonIndexed(), 0x388e3c, { shade: true }));
        Gd.push(paint(new THREE.SphereGeometry(0.06, 6, 4).translate(x, heightAt(x, z) + h + 0.03, z).toNonIndexed(), [0xff6f91, 0xffd166, 0xb07ef0, 0xff9f45][k % 4], { shade: true }));
      }
      for (let k = 0; k < 6; k++) {                                       // Kieselweg zum Tor (Lücke bei Winkel 0)
        const x = c.x + R0 * (0.25 + k * 0.17), z = c.z + (k % 2 ? 0.05 : -0.05), p = new THREE.DodecahedronGeometry(0.07);
        p.scale(1.3, 0.4, 1); p.translate(x, heightAt(x, z) + 0.01, z); Gd.push(paint(p, 0xd8cfc0, { shade: true }));
      }
      // Gießkanne
      const cx = c.x - 0.2, cz = c.z + 0.05, cy = heightAt(cx, cz);
      const can = [paint(new THREE.CylinderGeometry(0.14, 0.16, 0.26, 12).translate(0, 0.13, 0).toNonIndexed(), 0x4fc3f7, { shade: true }),
        paint(new THREE.CylinderGeometry(0.025, 0.035, 0.32, 6).rotateZ(-0.9).translate(0.22, 0.2, 0).toNonIndexed(), 0x4fc3f7, { shade: true }),
        paint(new THREE.TorusGeometry(0.1, 0.02, 4, 10, Math.PI).translate(0, 0.26, 0).toNonIndexed(), 0x0288d1, { shade: true })];
      const cg = mergeAll(can); cg.rotateY(r() * 6.28); cg.translate(cx, cy, cz); Gd.push(cg);
      solid.push(...Gd);
    } }

  // alles bauen
  if (solid.length) {
    const m = new THREE.Mesh(mergeAll(solid), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
    m.castShadow = m.receiveShadow = true;
    m.name = 'extras';
    scene.add(m);
  }
  for (const g of cutGroups.values()) scene.add(Object.assign(cutMesh(mergeAll(g.geos, ['position', 'normal', 'uv', 'aSway']), g.t, { sway: g.sway, speed: g.speed }), { name: 'extrasCut' }));
  pruneTufts(); // altes Gras dort weg, wo jetzt etwas steht
}

/** Seestern zum Anfassen: fünf runde Arme, leicht gewölbt, mit hellen Noppen. R = Armlänge. */
function starfish3D(R, color, seed) {
  const sh = new THREE.Shape(), n = 5, ri = R * 0.42, r = mulberry32(300 + seed * 17), bend = 0.12;
  const Ls = Array.from({ length: n }, () => R * (0.88 + r() * 0.24)); // Arme leicht verschieden lang
  sh.moveTo(Ls[0], 0);
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = a0 + Math.PI / n, a2 = a0 + (2 * Math.PI) / n, L = Ls[k], L2 = Ls[(k + 1) % n];
    sh.quadraticCurveTo(Math.cos(a0 + bend) * L * 0.6, Math.sin(a0 + bend) * L * 0.6, Math.cos(a1) * ri, Math.sin(a1) * ri);
    sh.quadraticCurveTo(Math.cos(a2 - bend) * L2 * 0.6, Math.sin(a2 - bend) * L2 * 0.6, Math.cos(a2) * L2, Math.sin(a2) * L2);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: R * 0.08, bevelEnabled: true, bevelThickness: R * 0.1, bevelSize: R * 0.09, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, R * 0.1, 0);
  const parts = [paint(g, color, { shade: true })];
  // helle Noppen auf jedem Arm
  const dot = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).getHex();
  for (let k = 0; k < n; k++) for (const f of [0.35, 0.62]) {
    const a = (k / n) * Math.PI * 2, b = new THREE.SphereGeometry(R * 0.07, 6, 4);
    b.translate(Math.cos(a) * R * f, R * 0.29, -Math.sin(a) * R * f);
    parts.push(paint(b, dot, { shade: true }));
  }
  parts.push(paint(new THREE.SphereGeometry(R * 0.09, 6, 4).translate(0, R * 0.3, 0), dot, { shade: true }));
  return mergeAll(parts);
}
/** Kleine Jakobsmuschel: gewölbter Fächer mit Rippen, liegt mit der Wölbung nach oben. R = Länge. */
function shell3D(R, color) {
  const NU = 22, NV = 6, RIBS = 7, pos = [];
  const P = (u, v) => {
    const phi = (u - 0.5) * 2.4, rib = 0.06 * R * Math.abs(Math.sin(phi * RIBS / 1.2)) * v;
    const rho = R * v * (1 + 0.04 * Math.cos(phi * RIBS * 2 / 1.2));
    return [Math.sin(phi) * rho, R * 0.26 * Math.sin(Math.PI * Math.min(1, v * 1.05)) * Math.cos(phi * 0.45) + rib, Math.cos(phi) * rho - R * 0.45];
  };
  for (let a = 0; a < NU; a++) for (let b = 0; b < NV; b++) {
    const p00 = P(a / NU, b / NV), p10 = P((a + 1) / NU, b / NV), p11 = P((a + 1) / NU, (b + 1) / NV), p01 = P(a / NU, (b + 1) / NV);
    pos.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Rippen etwas dunkler als die Rillen dazwischen
  const col = new Float32Array(pos.length), c = new THREE.Color();
  for (let k = 0; k < pos.length; k += 9) {
    const x = (pos[k] + pos[k + 3] + pos[k + 6]) / 3, z = (pos[k + 2] + pos[k + 5] + pos[k + 8]) / 3 + R * 0.45;
    c.set(color).multiplyScalar(0.8 + 0.28 * (1 - Math.abs(Math.sin(Math.atan2(x, z) * RIBS / 1.2))));
    for (let q = 0; q < 9; q += 3) col.set([c.r, c.g, c.b], k + q);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ear = new THREE.BoxGeometry(R * 0.5, R * 0.08, R * 0.16).translate(0, R * 0.03, -R * 0.47); // „Öhrchen“ am Schloss
  return mergeAll([g, paint(ear, new THREE.Color(color).multiplyScalar(0.85).getHex(), { shade: true })]);
}

function buildChest(scene, rng) {
  const group = new THREE.Group();
  group.rotation.set(0, 0.35, 0);
  scene.add(group);
  const U = 0.1;
  const wood = 0xb5763d, woodL = 0xc98a4b, woodD = 0x6e4320, gold = 0xffc93c, goldD = 0xd9a521, ink = 0x3a2410;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissive: 0x2a1a08 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: hdr(0xffffff, 1.6) });
  /** Quader in Voxel-Einheiten (y = Unterkante). */
  const B = (w, h, d, x, y, z, c) => paint(new THREE.BoxGeometry(w * U, h * U, d * U).translate(x * U, (y + h / 2) * U, z * U), c, { shade: true });

  // --- Kasten: dunkler Kern, Planken mit Fugen, Eckpfosten, Goldecken, Goldbänder, Griffe, Schloss ---
  const P = [], G = [];
  P.push(B(24.6, 12, 14.6, 0, 0, 0, woodD));                                // Kern (sieht man in den Fugen)
  P.push(B(26.4, 1, 16.4, 0, 0, 0, woodD));                                 // Fußleiste
  for (let k = 0; k < 3; k++) {
    const y = 1.2 + k * 3.65, c = k % 2 ? woodL : wood;
    for (const sz of [-1, 1]) P.push(B(22.6, 3.3, 0.8, 0, y, sz * 7.6, c));     // vorne/hinten
    for (const sx of [-1, 1]) P.push(B(0.8, 3.3, 12.6, sx * 12.6, y, 0, c));    // Seiten
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.push(B(2.4, 12, 2.4, sx * 12.2, 0, sz * 7.2, woodD));                     // Eckpfosten
    for (const y of [-0.1, 9.95]) P.push(B(2.8, 2.2, 2.8, sx * 12.2, y, sz * 7.2, gold)); // Goldecken (oben etwas höher als der Rest, sonst Flackern)
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) P.push(B(1.8, 12.1, 0.5, sx * 6.5, 0, sz * 8.2, gold)); // Goldbänder vorne/hinten
    // Griff an der Seite: Platte + Ring
    P.push(B(0.5, 2.6, 3.4, sx * 13.2, 6.4, 0, goldD));
    const ring = new THREE.TorusGeometry(1.5 * U, 0.32 * U, 6, 14); ring.rotateY(Math.PI / 2); ring.translate(sx * 13.6 * U, 5.6 * U, 0);
    P.push(paint(ring, gold, { shade: true }));
  }
  P.push(B(4.2, 4.6, 0.6, 0, 6.6, 8.3, gold), B(1, 1.6, 0.3, 0, 7.6, 8.65, ink), B(0.5, 0.9, 0.3, 0, 6.9, 8.65, ink)); // Schloss mit Schlüsselloch
  // Schatz innen: leuchtendes Gold, Münzstapel und Edelsteine (bleibt unter dem geschlossenen Deckel)
  G.push(B(23.5, 0.7, 13.5, 0, 11.4, 0, 0xffb81c));
  for (const [x, z, n] of [[-5, -1, 3], [-2, 2, 4], [3, -2, 2], [6, 1.5, 3], [1, 0, 5]]) {
    for (let q = 0; q < n; q++) { const c = new THREE.CylinderGeometry(1.3 * U, 1.3 * U, 0.45 * U, 12); c.rotateZ((q % 2 ? 0.12 : -0.1)); c.translate((x + q * 0.15) * U, (12.3 + q * 0.5) * U, z * U); P.push(paint(c, q % 2 ? 0xffc93c : 0xf4a91a, { shade: true })); }
  }
  for (const [x, z, y, c] of [[-7, 2, 12.6, 0xff4d6d], [4, 3, 12.5, 0x4cc9f0], [8, -2, 12.4, 0x7ae582], [-3, -3, 12.5, 0xb07ef0]]) {
    const gem = new THREE.OctahedronGeometry(1.1 * U); gem.scale(1, 1.3, 1); gem.translate(x * U, (y + 1) * U, z * U); G.push(paint(gem, c));
  }
  const bm = new THREE.Mesh(mergeAll(P), mat);
  bm.castShadow = bm.receiveShadow = true;
  const gemMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: hdr(0xffffff, 1.1) }); // Edelsteine leuchten, behalten aber ihre Farbe
  group.add(bm, new THREE.Mesh(G.shift(), glowMat), new THREE.Mesh(mergeAll(G), gemMat));

  // --- Deckel: gewölbt wie ein Fass (Planken), Goldbänder über die Wölbung, Goldkante, Schließblech ---
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 12 * U, -8 * U);
  group.add(lidPivot);
  /** Bogen (halbe Ellipse über der Tiefe 0..16) als Körper entlang x, von x0 bis x1. */
  const arch = (rz, ry, x0, x1, color, planks = false, strip = 0) => {
    const sh = new THREE.Shape(), N = 14;
    sh.moveTo(8 - rz, 0);
    for (let i = 1; i <= N; i++) { const t = Math.PI - (i / N) * Math.PI; sh.lineTo(8 + Math.cos(t) * rz, Math.sin(t) * ry); }
    // strip > 0: nur ein Band über der Wölbung (innen zurück), sonst ganzer Körper
    if (strip) for (let i = N; i >= 0; i--) { const t = Math.PI - (i / N) * Math.PI; sh.lineTo(8 + Math.cos(t) * (rz - strip), Math.sin(t) * (ry - strip)); }
    else sh.lineTo(8 - rz, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 });
    // (z, y, e) -> (x1 - e, y, z): Achsen tauschen ohne die Flächen umzudrehen
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, x1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
    g.scale(U, U, U);
    const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals();
    if (!planks) return paint(n, color, { shade: true });
    // Planken: Farbe je Dreieck nach dem Winkel auf der Wölbung (Fugen dunkel)
    const pa = n.attributes.position, col = new Float32Array(pa.count * 3), c = new THREE.Color();
    for (let k = 0; k < pa.count; k += 3) {
      let zc = 0, yc = 0, xc = 0;
      for (let q = 0; q < 3; q++) { xc += pa.getX(k + q) / 3; yc += pa.getY(k + q) / 3; zc += pa.getZ(k + q) / 3; }
      const end = Math.abs(Math.abs(xc / U) - Math.abs(x0)) < 0.01 || Math.abs(Math.abs(xc / U) - Math.abs(x1)) < 0.01;
      const ang = Math.atan2(yc / U / ry, (zc / U - 8) / rz), band = Math.floor(((ang / Math.PI) * 5));
      c.set(end ? woodD : band % 2 ? woodL : wood);
      for (let q = 0; q < 3; q++) col.set([c.r, c.g, c.b], (k + q) * 3);
    }
    n.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return n;
  };
  const L = [];
  L.push(arch(8, 5.2, -12.8, 12.8, wood, true));
  L.push(B(26.4, 1, 16.4, 0, -0.2, 8, woodD));                                   // untere Deckelkante
  for (const x of [-6.5, 6.5]) L.push(arch(8.35, 5.55, x - 0.9, x + 0.9, gold, false, 0.6)); // Goldbänder über die Wölbung
  for (const x of [-12.4, 12.4]) L.push(arch(8.3, 5.5, x - 0.7, x + 0.7, gold, false, 0.7)); // Goldkanten an den Enden (nur Rand)
  L.push(B(2.4, 3.4, 0.5, 0, -2.6, 16.6, gold), B(1, 1, 0.4, 0, -1.2, 16.95, goldD)); // Schließblech über dem Schloss
  const lm = new THREE.Mesh(mergeAll(L), mat);
  lm.castShadow = true;
  lidPivot.add(lm);

  // Münzen auf dem Sand: echte flache Goldmünzen mit erhabenem Rand, einzeln, schräg oder gestapelt
  const coinParts = [];
  const coin = (x, y, z, rx, rz, ry) => {
    const rim = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 18), face = new THREE.CylinderGeometry(0.115, 0.115, 0.05, 18);
    const mark = new THREE.BoxGeometry(0.035, 0.052, 0.12);   // eingeprägter Strich wie früher auf dem Bild
    for (const [g, c] of [[rim, 0xf0a61c], [face, 0xffd23f], [mark, 0xf0a61c]]) {
      g.rotateY(ry); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z);
      coinParts.push(paint(g, c, { shade: true }));
    }
  };
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    let d = range(rng, 1.5, 2.5);
    const tilt = range(rng, -0.3, 0.3);
    // nicht unter die Truhe (Grundfläche samt Goldecken, Truhe ist um 0.35 gedreht): sonst nach außen schieben
    const under = (dd) => { const x = Math.cos(a) * dd, z = Math.sin(a) * dd, c = Math.cos(0.35), sn = Math.sin(0.35);
      return Math.abs(x * c - z * sn) < 1.36 + 0.22 && Math.abs(x * sn + z * c) < 0.86 + 0.22; };
    while (under(d)) d += 0.05;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (i % 5 === 0) for (let q = 0; q < 3 + (i % 2); q++) coin(x + q * 0.012, 0.02 + q * 0.042, z - q * 0.01, q * 0.03, -q * 0.02, a + q); // Stapel
    else coin(x, 0.02 + Math.abs(tilt) * 0.15, z, tilt * 0.6, tilt * 0.4, a * 3);                  // einzeln, leicht schräg im Sand
  }
  const coinMesh = new THREE.Mesh(mergeAll(coinParts), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.35, emissive: 0x3a2400 }));
  coinMesh.castShadow = coinMesh.receiveShadow = true;
  scene.add(coinMesh);

  // Großer Papierstern
  const starStk = drawStar();
  const starTex = toTexture(starStk.canvas);
  const star = new THREE.Mesh(
    stickerGeometry(starStk, 2.4, 'center'),
    new THREE.MeshStandardMaterial({ map: starTex, alphaTest: 0.5, side: THREE.DoubleSide, emissiveMap: starTex, emissive: new THREE.Color(1.1, 1.0, 0.85), roughness: 0.8 }),
  );
  star.castShadow = true;
  star.customDepthMaterial = depthMat(starTex);
  star.position.set(0, 4.6, 0);
  scene.add(star);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,230,140,0.7)', 'rgba(255,200,80,0)'),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.set(5, 5, 1);
  star.add(halo);

  const light = new THREE.PointLight(0xffc35a, 0, 10, 1.6);
  light.position.set(0, 1.6, 0);
  scene.add(light);

  // unsichtbare Klickfläche (Truhe + Stern)
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hits = [
    new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 2.4).translate(0, 1.0, 0), hitMat),
    new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), hitMat),
  ];
  scene.add(hits[0]);
  star.add(hits[1]);

  let open = 0, wasOpen = false, flash = 0, forceOpen = 0, tLast = 0, nightGlow = 0;
  const api = {
    bubbles: null, confetti: null, star, hits,
    flash() { flash = 1; },
    setNight(n) { nightGlow = n; },
    /** Klick auf die Truhe: aufspringen, Konfetti, Blasen. */
    burst() {
      forceOpen = 3.2;
      flash = 1;
      api.confetti?.burst(0, 1.4, 0, 160);
      api.bubbles?.spawn(0, 1.3, 0, 30, 0.9, 0.07, 0.22);
    },
    update(dt, t) {
      tLast = t;
      forceOpen = Math.max(0, forceOpen - dt);
      const cyc = t % 14;
      const target = forceOpen > 0 || (cyc > 7 && cyc < 12) ? 1 : 0;
      open += (target - open) * Math.min(1, dt * (target ? 3.5 : 2.5));
      lidPivot.rotation.x = -open * 1.15;
      light.intensity = open * 10 + nightGlow * 6;
      const isOpen = open > 0.5;
      if (isOpen && !wasOpen && api.bubbles) api.bubbles.spawn(0, 1.3, 0, 40, 0.9, 0.07, 0.22);
      wasOpen = isOpen;
      flash = Math.max(0, flash - dt * 0.7);
      star.rotation.y = t * 1.6 + flash * 14;
      star.position.y = 4.6 + Math.sin(t * 1.4) * 0.3 + flash * 1.2;
      halo.material.opacity = 0.6 + flash * 0.4;
      halo.scale.setScalar(5 * (1 + flash * 0.8));
    },
  };
  return api;
}

/* =========================================================
   Riesenmuschel mit Perle (öffnet sich langsam)
   ========================================================= */
function buildClam(scene, rng, x, z) {
  const g = new THREE.Group();
  // auf den höchsten Punkt unter der Schale setzen – sonst versinkt sie am Hang halb im Sand
  let y = heightAt(x, z);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; y = Math.max(y, heightAt(x + Math.cos(a) * 1.0, z + Math.sin(a) * 0.9)); }
  g.position.set(x, y - 0.03, z);
  g.rotation.set(-0.08, 0.25, 0, 'YXZ'); // vorne etwas angehoben: man sieht in die Öffnung
  scene.add(g);
  drawClamShell(rng, false); drawClamShell(rng, true); // nur würfeln wie früher, damit der übrige Aufbau gleich bleibt
  // Echte Schalen statt Papp-Aufsteller: zwei gewölbte Fächer mit Rippen und Wellenrand, innen perlmuttfarben
  const R = 1.2, RZ = 1.0, RIBS = 9;
  function shell(sign, outer, inner, D) {
    // ovale Schale um ihre Mitte (hinten rund statt spitz), Rippen laufen vom Schloss hinten aus
    const NU = 44, NV = 9, P = (u, v, off) => {
      const phi = (u - 0.5) * Math.PI * 2;
      const x0 = Math.sin(phi) * R * v, z0 = Math.cos(phi) * RZ * v;
      const fan = Math.atan2(x0, z0 + RZ), front = 0.35 + 0.65 * Math.max(0, Math.cos(phi));
      const wav = 1 + 0.04 * Math.cos(fan * RIBS * 2) * front;              // Wellenrand vorne
      const rib = 0.08 * Math.abs(Math.sin(fan * RIBS)) * v * front;       // Rippen
      const bulge = D * Math.pow(Math.max(0, 1 - v * v), 0.7);
      const zig = 0.07 * Math.sin(fan * RIBS * 2) * Math.pow(v, 6) * front; // Zickzack-Rand: beide Schalen greifen ineinander
      return [x0 * wav, sign * (bulge + rib - off * (1 - v * v)) + zig, z0 * wav];
    };
    const out = [], inn = [];
    for (let a = 0; a < NU; a++) for (let b = 0; b < NV; b++) {
      for (const [list, off] of [[out, 0], [inn, 0.05]]) {
        const p00 = P(a / NU, b / NV, off), p10 = P((a + 1) / NU, b / NV, off), p11 = P((a + 1) / NU, (b + 1) / NV, off), p01 = P(a / NU, (b + 1) / NV, off);
        list.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      }
    }
    const mk = (pos, color, flip) => {
      if (flip) for (let k = 0; k < pos.length; k += 9) for (let q = 0; q < 3; q++) [pos[k + 3 + q], pos[k + 6 + q]] = [pos[k + 6 + q], pos[k + 3 + q]];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      // Außen: Rippen dunkler als die Rillen dazwischen (je Dreieck nach seinem Winkel im Fächer)
      const c = new THREE.Color(), col = new Float32Array(pos.length);
      for (let k = 0; k < pos.length; k += 9) {
        const x = (pos[k] + pos[k + 3] + pos[k + 6]) / 3, z = (pos[k + 2] + pos[k + 5] + pos[k + 8]) / 3;
        const ridge = Math.abs(Math.sin(Math.atan2(x, z + RZ) * RIBS));
        c.set(color).multiplyScalar(color === 0xfbe3ee ? 1 : 0.78 + 0.3 * (1 - ridge));
        for (let q = 0; q < 9; q += 3) col.set([c.r, c.g, c.b], k + q);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    };
    // Außenseite zeigt weg von der Öffnung, Innenseite zur Öffnung
    return mergeAll([mk(out, outer, sign > 0), mk(inn, inner, sign < 0)]);
  }
  const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true });
  const DL = 0.55, DU = 0.4; // untere Schale tiefer (trägt die Perle), Deckel flacher
  const lower = new THREE.Mesh(shell(-1, 0x4aa89b, 0xfbe3ee, DL), shellMat);
  lower.position.set(0, DL, 0);
  lower.castShadow = lower.receiveShadow = true;
  g.add(lower);
  const hinge = new THREE.Group();
  hinge.position.set(0, DL, -RZ); // Schloss hinten am Rand
  g.add(hinge);
  const upper = new THREE.Mesh(shell(1, 0x5cc4b4, 0xfbe3ee, DU), shellMat);
  upper.castShadow = true;
  upper.position.z = RZ;
  hinge.add(upper);
  // Schloss: ein dickes Band hinten, das beide Schalen zusammenhält (sitzt fest an der unteren Schale,
  // der Deckel dreht genau um seine Achse) – mit zwei kleinen Buckeln oben und unten
  {
    const band = new THREE.CylinderGeometry(0.13, 0.13, 0.9, 12); band.rotateZ(Math.PI / 2);
    const capL = new THREE.SphereGeometry(0.13, 10, 6).translate(-0.45, 0, 0), capR = new THREE.SphereGeometry(0.13, 10, 6).translate(0.45, 0, 0);
    const knobs = [new THREE.SphereGeometry(0.15, 10, 6).scale(1.5, 0.8, 0.8).translate(0, -0.1, -0.1), new THREE.SphereGeometry(0.14, 10, 6).scale(1.5, 0.8, 0.8).translate(0, 0.1, -0.1)]; // nach hinten, nicht in die Öffnung
    const parts = [band, capL, capR].map((q) => paint(q.toNonIndexed(), 0x2f7f74, { shade: true }));
    parts.push(...knobs.map((q) => paint(q.toNonIndexed(), 0x3d978a, { shade: true })));
    const lig = new THREE.Mesh(mergeAll(parts), shellMat);
    lig.position.set(0, DL, -RZ + 0.02);
    lig.castShadow = true;
    g.add(lig);
  }
  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xfff4fb, roughness: 0.15, metalness: 0.1, emissive: 0x3a3040 }),
  );
  pearl.position.set(0, 0.05 + 0.25, 0.1); // liegt in der unteren Schale
  pearl.castShadow = true;
  g.add(pearl);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,255,255,1)', 'rgba(255,240,255,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  glint.scale.set(0.55, 0.55, 1);
  pearl.add(glint);
  let open = 0;
  return (dt, t) => {
    const cyc = (t + 3) % 11;
    const target = cyc > 5 && cyc < 9.5 ? 1 : 0;
    open += (target - open) * Math.min(1, dt * 1.6);
    hinge.rotation.x = -(0.12 + open * 0.6); // immer einen Spalt offen, ganz offen zeigt sie die Perle
    glint.material.opacity = open * (0.55 + 0.45 * Math.sin(t * 3));
  };
}

/* =========================================================
   Papier-Konfetti (instanziert)
   ========================================================= */
class Confetti {
  constructor(scene, max = 320) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(0.14, 0.09);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const colors = [0xff5d8f, 0xffc93c, 0x4fd1c5, 0x7c83ff, 0xff8a3c, 0x7ee081, 0xffffff];
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, c.set(colors[i % colors.length]));
    scene.add(this.mesh);
    this.p = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(1, 1, 1);
  }
  burst(x, y, z, n = 120) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3.5;
      this.p.push({
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(Math.cos(a) * sp * 0.6, 4 + Math.random() * 4, Math.sin(a) * sp * 0.6),
        rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4),
        life: 4 + Math.random() * 2.5, ph: Math.random() * 10,
      });
    }
  }
  update(dt) {
    if (!this.p.length) { this.mesh.count = 0; return; }
    const t = performance.now() * 0.001;
    this.p = this.p.filter((p) => (p.life -= dt) > 0);
    this.p.forEach((p, i) => {
      p.vel.y -= dt * 3.2;                 // langsam sinken (Wasser!)
      p.vel.multiplyScalar(1 - Math.min(1, dt * 1.8));
      p.vel.y = Math.max(p.vel.y, -0.9);
      p.pos.addScaledVector(p.vel, dt);
      p.pos.x += Math.sin(t * 3 + p.ph) * dt * 0.4;
      const ground = heightAt(p.pos.x, p.pos.z) + 0.03;
      if (p.pos.y < ground) { p.pos.y = ground; p.vel.set(0, 0, 0); p.spin.multiplyScalar(0.9); }
      p.rot.addScaledVector(p.spin, dt);
      const k = Math.min(1, p.life / 0.6);
      this.s.setScalar(k);
      this.m4.compose(p.pos, this.q.setFromEuler(this.e.set(p.rot.x, p.rot.y, p.rot.z)), this.s);
      this.mesh.setMatrixAt(i, this.m4);
      // Farben rotieren mit dem Index – Farbe beim Burst fest zuordnen
    });
    this.mesh.count = this.p.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* =========================================================
   Papierfische (instanziert, Atlas)
   ========================================================= */
/**
 * „Himmel“ über festen Dingen: Höhe, unter die Fische, Quallen und Schildkröten nicht tauchen.
 * Aus den Häusern/Orten (einzelne Meshes) und den gemerkten Steinen/Korallen; zu den Rändern
 * hin sanft abfallend, damit Schwärme weich darüber gleiten statt zu springen.
 */
function skyline(scene, start, solids) {
  const RES = 0.5, HALF = 66, N = Math.round((2 * HALF) / RES) + 1, SLOPE = 0.9, GAP = 0.5;
  const grid = new Float32Array(N * N).fill(-99);
  const raise = (minX, maxX, minZ, maxZ, top) => {
    const reach = (top + 6) / SLOPE;
    const i0 = Math.max(0, Math.floor((minX - reach + HALF) / RES)), i1 = Math.min(N - 1, Math.ceil((maxX + reach + HALF) / RES));
    const j0 = Math.max(0, Math.floor((minZ - reach + HALF) / RES)), j1 = Math.min(N - 1, Math.ceil((maxZ + reach + HALF) / RES));
    for (let j = j0; j <= j1; j++) {
      const z = j * RES - HALF, dz = Math.max(minZ - z, 0, z - maxZ);
      for (let i = i0; i <= i1; i++) {
        const x = i * RES - HALF, dx = Math.max(minX - x, 0, x - maxX);
        const h = top + GAP - Math.hypot(dx, dz) * SLOPE;
        if (h > grid[j * N + i]) grid[j * N + i] = h;
      }
    }
  };
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3(), size = new THREE.Vector3();
  for (const ch of scene.children.slice(start)) {
    ch.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes.position) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.depthWrite === false || !o.visible) return; // Lichtkegel, Glas usw.
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).getSize(size);
      if (size.x > 16 || size.z > 16 || size.y > 16 || size.y < 0.3) return; // nur einzelne Dinge
      raise(box.min.x, box.max.x, box.min.z, box.max.z, box.max.y);
    });
  }
  for (const o of solids) if (o.top !== undefined) raise(o.x - o.r * 0.7, o.x + o.r * 0.7, o.z - o.r * 0.7, o.z + o.r * 0.7, o.top);
  return (x, z) => {
    const fx = (x + HALF) / RES, fz = (z + HALF) / RES;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return -99;
    const u = fx - i, v = fz - j, k = j * N + i;
    return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + N] * (1 - u) + grid[k + N + 1] * u) * v;
  };
}

function buildFish(scene, rng, camera, anemones, sky) {
  const schools = [
    { n: 34, d: 0, size: 0.9, R: 20, y: 6, speed: 0.11, spread: 3.2 },
    { n: 46, d: 1, size: 0.6, R: 13, y: 4, speed: -0.16, spread: 2.4 },
    { n: 30, d: 2, size: 0.8, R: 30, y: 10, speed: 0.07, spread: 4 },
    { n: 22, d: 3, size: 0.75, R: 17, y: 8, speed: -0.1, spread: 2.6 },
    { n: 16, d: 4, size: 1.0, R: 25, y: 5, speed: 0.09, spread: 3 },
    { n: 60, d: 5, size: 0.4, R: 9, y: 3, speed: 0.22, spread: 1.8 },
    { n: 26, d: 6, size: 0.8, R: 36, y: 13, speed: -0.06, spread: 3.5 },
  ];
  const total = schools.reduce((s, c) => s + c.n, 0) + anemones.length * 2;
  const geo = new THREE.PlaneGeometry(1, 0.5, 6, 1);
  const atl = new Float32Array(total * 2);
  const mat = new THREE.MeshStandardMaterial({ map: fishAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x262626 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute vec2 aAtlas;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * vec2(0.25, 0.5) + aAtlas;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wig = sin(uTime * 10.0 + float(gl_InstanceID) * 1.37 + transformed.x * 6.0);
        transformed.z += wig * 0.12 * smoothstep(0.05, -0.5, transformed.x);`);
  };
  mat.customProgramCacheKey = () => 'paperfish';
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const fish = [];
  const setAtlas = (i, d) => { atl[i * 2] = (d % 4) * 0.25; atl[i * 2 + 1] = (1 - Math.floor(d / 4)) * 0.5; };
  for (const s of schools) {
    const phase = rng() * Math.PI * 2;
    for (let i = 0; i < s.n; i++) {
      setAtlas(fish.length, s.d);
      fish.push({
        s, phase, lag: rng() * 2.2,
        off: new THREE.Vector3(range(rng, -1, 1), range(rng, -0.4, 0.4), range(rng, -1, 1)).multiplyScalar(s.spread),
        wob: rng() * 10, size: s.size * range(rng, 0.85, 1.15), push: new THREE.Vector3(),
      });
    }
  }
  for (const a of anemones) {
    for (let k = 0; k < 2; k++) { setAtlas(fish.length, 7); fish.push({ clown: a, k, wob: rng() * 10, size: 0.5, push: new THREE.Vector3() }); }
  }
  geo.setAttribute('aAtlas', new THREE.InstancedBufferAttribute(atl, 2));

  const center = (s, phase, t, out) => {
    const ang = phase + t * s.speed;
    const R = s.R * (1 + 0.25 * Math.sin(t * 0.13 + phase));
    return out.set(Math.cos(ang) * R, s.y + Math.sin(t * 0.3 + phase) * 2, Math.sin(ang) * R * 0.85);
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), away = new THREE.Vector3();
  const xA = new THREE.Vector3(), yA = new THREE.Vector3(), zA = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  return (dt, t) => {
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (f.clown) {
        const an = f.clown, ang = t * 0.9 + f.k * Math.PI + Math.sin(t * 2 + f.wob) * 0.3;
        const r = 0.9 * an.s + Math.sin(t * 1.3 + f.wob) * 0.15;
        a.set(an.x + Math.cos(ang) * r, an.y + Math.sin(t * 2.1 + f.wob) * 0.12, an.z + Math.sin(ang) * r);
        b.set(an.x + Math.cos(ang + 0.1) * r, a.y, an.z + Math.sin(ang + 0.1) * r);
      } else {
        const tt = t - f.lag;
        center(f.s, f.phase, tt, a); center(f.s, f.phase, tt + 0.08, b);
        const w = Math.sin(t * 0.9 + f.wob) * 0.1;
        a.add(f.off).addScalar(w); b.add(f.off).addScalar(w);
        away.subVectors(a, camera.position);
        const d = away.length();
        if (d < 8) f.push.addScaledVector(away.normalize(), (8 - d) * dt * 2.5); // Schwärme weichen der Kamera aus
        f.push.multiplyScalar(1 - Math.min(1, dt * 0.8));
        a.add(f.push); b.add(f.push);
        const minY = Math.max(heightAt(a.x, a.z) + 0.9, sky(a.x, a.z) + f.size * 0.3); // nicht durch Häuser & Co.
        if (a.y < minY) { const dy = minY - a.y; a.y += dy; b.y += dy; }
      }
      xA.subVectors(b, a).normalize();
      zA.crossVectors(xA, UPV);
      if (zA.lengthSq() < 1e-4) zA.set(0, 0, 1);
      zA.normalize();
      yA.crossVectors(zA, xA);
      m4.makeBasis(xA.multiplyScalar(f.size), yA.multiplyScalar(f.size), zA.multiplyScalar(f.size));
      m4.setPosition(a);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

/* =========================================================
   Papierquallen
   ========================================================= */
function buildJellies(scene, rng, camera, glowMats = [], sky = () => -99) {
  const assets = [0xff9ad5, 0x8fe9ff, 0xc3a6ff, 0xffc29e].map((c) => {
    const bell = drawJellyBell(rng, c), ten = drawTentacles(rng, c);
    return { bell, ten, bt: toTexture(bell.canvas), tt: toTexture(ten.canvas) };
  });
  const jellies = [];
  for (let i = 0; i < 9; i++) {
    const as = pick(rng, assets);
    const g = new THREE.Group();
    const bell = new THREE.Mesh(stickerGeometry(as.bell, 1.6, 'bottom'), cutMat(as.bt, 0, 1, 0.55));
    const tg = stickerGeometry(as.ten, 1.2, 'bottom', 1, 8);
    const th = tg.userData.contentH;
    tg.translate(0, -th + 0.15, 0);
    setSway(tg, 0, -th, 1.2);
    const ten = new THREE.Mesh(tg, cutMat(as.tt, 0.25, 2, 0.55));
    for (const m of [bell.material, ten.material]) if (!glowMats.includes(m)) glowMats.push(m);
    g.add(ten, bell);
    const s = range(rng, 0.6, 1.2);
    g.scale.setScalar(s);
    const a = rng() * Math.PI * 2, d = range(rng, 6, 34);
    g.position.set(Math.cos(a) * d, range(rng, 6, 22), Math.sin(a) * d);
    scene.add(g);
    jellies.push({ g, bell, ten, s, ph: rng() * 10, period: range(rng, 1.8, 2.8), vy: 0, drift: rng() * Math.PI * 2 });
  }
  return (dt, t) => {
    for (const j of jellies) {
      const cyc = ((t + j.ph) % j.period) / j.period;
      const p = cyc < 0.3 ? Math.sin((cyc / 0.3) * Math.PI) : 0;
      j.bell.scale.set(1 - 0.15 * p, 1 + 0.12 * p, 1);
      j.ten.scale.set(1 - 0.1 * p, 1 - 0.12 * p, 1);
      j.vy += (p * 1.6 - 0.25 - j.vy) * dt * 1.5;
      j.g.position.y += j.vy * dt * j.s;
      j.drift += dt * 0.05;
      j.g.position.x += Math.cos(j.drift) * dt * 0.25;
      j.g.position.z += Math.sin(j.drift) * dt * 0.25;
      const floor = Math.max(3.5, sky(j.g.position.x, j.g.position.z) + 1.4 * j.s); // Fäden nicht durchs Dach
      if (j.g.position.y > 27) j.g.position.y = floor + 0.5;
      if (j.g.position.y < floor) { j.g.position.y += (floor - j.g.position.y) * Math.min(1, dt * 3); j.vy = Math.abs(j.vy) + 0.5; }
      j.g.rotation.y = Math.atan2(camera.position.x - j.g.position.x, camera.position.z - j.g.position.z);
      j.g.rotation.z = Math.sin(t * 0.5 + j.ph) * 0.12;
    }
  };
}

/* =========================================================
   Papier-Schildkröte
   ========================================================= */
function buildTurtle(scene, rng, scale, R, y, speed, phase, sky = () => -99) {
  const bodyStk = drawTurtleBody(rng), flipStk = drawFlipper(rng);
  const bt = toTexture(bodyStk.canvas), ft = toTexture(flipStk.canvas);
  const g = new THREE.Group();
  const body = new THREE.Mesh(stickerGeometry(bodyStk, 3, 'center'), cutMat(bt));
  body.castShadow = true;
  body.customDepthMaterial = depthMat(bt);
  g.add(body);
  const flippers = [];
  for (const [x, yy, z, w, base, ph] of [[0.55, -0.15, 0.03, 1.2, -2.1, 0], [-0.9, -0.2, 0.03, 0.7, -2.6, 1], [0.55, -0.15, -0.03, 1.2, -2.1, 2.2], [-0.9, -0.2, -0.03, 0.7, -2.6, 3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, yy, z);
    const geo = stickerGeometry(flipStk, w, 'center');
    geo.translate(w / 2, 0, 0);
    pivot.add(new THREE.Mesh(geo, cutMat(ft)));
    g.add(pivot);
    flippers.push({ pivot, base, ph });
  }
  g.scale.setScalar(scale);
  scene.add(g);
  const m4 = new THREE.Matrix4(), xA = new THREE.Vector3(), yA = new THREE.Vector3(), zA = new THREE.Vector3();
  return (dt, t) => {
    const ang = phase + t * speed, dir = Math.sign(speed);
    const px = Math.cos(ang) * R, pz = Math.sin(ang) * R * 0.9;
    g.position.set(px, Math.max(y + Math.sin(t * 0.4 + phase) * 1.5, sky(px, pz) + 1.2 * scale), pz);
    xA.set(-Math.sin(ang) * dir, Math.cos(t * 0.4 + phase) * 0.15, Math.cos(ang) * 0.9 * dir).normalize();
    zA.crossVectors(xA, UPV).normalize();
    yA.crossVectors(zA, xA);
    g.quaternion.setFromRotationMatrix(m4.makeBasis(xA, yA, zA));
    for (const f of flippers) f.pivot.rotation.z = f.base + Math.sin(t * 2 + phase + f.ph) * 0.55;
  };
}

/* =========================================================
   Papier-Mantarochen
   ========================================================= */
function buildManta(scene, rng) {
  const stk = drawManta(rng);
  const t0 = toTexture(stk.canvas);
  const g = stickerGeometry(stk, 9, 'center', 24, 12);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI);
  const flap = 'float ax = abs(transformed.x); transformed.y += sin(uTime * 1.3 - ax * 0.32) * 0.07 * ax * ax;';
  const mat = patch(new THREE.MeshStandardMaterial({ map: t0, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, emissiveMap: t0, emissive: 0x444444 }), { vertex: flap });
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.customDepthMaterial = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t0, alphaTest: 0.5 }), { vertex: flap });
  mesh.frustumCulled = false;
  scene.add(mesh);
  return (dt, t) => {
    const ang = t * 0.035 + 1, R = 50 + Math.sin(t * 0.05) * 6;
    mesh.position.set(Math.cos(ang) * R, 16 + Math.sin(t * 0.11) * 3, Math.sin(ang) * R);
    mesh.rotation.set(0, Math.atan2(-Math.sin(ang), Math.cos(ang)), -0.15, 'YXZ');
  };
}

/* =========================================================
   Papierblasen
   ========================================================= */
export class Bubbles {
  constructor(scene, renderer, camera, max = 1000) {
    this.max = max; this.renderer = renderer; this.camera = camera;
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max); this.life = new Float32Array(max); this.ph = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 0.01);
          vA = aAlpha;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c) * 2.0;
          if (d > 1.0 || vA < 0.01) discard;
          vec3 col = vec3(0.72, 0.93, 1.0);
          float a = 0.4;
          if (d > 0.7) { col = vec3(1.0); a = 1.0; }
          if (length(c - vec2(-0.16, -0.16)) * 2.0 < 0.22) { col = vec3(1.0); a = 1.0; }
          gl_FragColor = vec4(col, a * vA);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.resize();
  }
  resize() {
    this.mat.uniforms.uScale.value = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }
  spawn(x, y, z, n = 1, spread = 0.2, smin = 0.06, smax = 0.16) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + Math.random() * spread * 0.5;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.size[i] = smin + Math.random() * (smax - smin);
      this.vel[i] = 0.6 + Math.random() * 0.8;
      this.life[i] = 1; this.alpha[i] = 1; this.ph[i] = Math.random() * 10;
    }
  }
  update(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.vel[i] = Math.min(this.vel[i] + dt * 0.5, 2.8);
      this.pos[i * 3 + 1] += this.vel[i] * dt;
      this.pos[i * 3] += Math.sin(t * 4 + this.ph[i]) * dt * 0.35;
      this.pos[i * 3 + 2] += Math.cos(t * 3.4 + this.ph[i]) * dt * 0.35;
      if (this.pos[i * 3 + 1] > WORLD.surfaceY - 0.3) this.life[i] = 0;
      this.alpha[i] = this.life[i] > 0 ? 1 : 0;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true;
  }
}

/* ---------- Schwebeteilchen ---------- */
function buildSnow(scene, rng, renderer, camera, nightU = { value: 0 }, winterU = { value: 0 }) {
  const n = 1500;
  const pos = new Float32Array(n * 3), spd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([range(rng, -50, 50), range(rng, 0, 34), range(rng, -50, 50)], i * 3);
    spd[i] = rng();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: shared.uTime, uCam: { value: camera.position }, uScale: { value: 400 }, uNight: nightU, uWinter: winterU },
    vertexShader: /* glsl */ `
      attribute float aSpeed; uniform float uTime; uniform vec3 uCam; uniform float uScale; uniform float uWinter; varying float vA;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTime * (0.08 + aSpeed * 0.12), 34.0) - 2.0;
        p.x += sin(uTime * 0.25 + aSpeed * 40.0) * 0.8;
        p.z += cos(uTime * 0.2 + aSpeed * 30.0) * 0.8;
        p.xz = uCam.xz + mod(p.xz - uCam.xz + 50.0, 100.0) - 50.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.05 + aSpeed * 0.05) * (1.0 + uWinter * 1.8) * uScale / max(-mv.z, 0.01);
        float dz = -mv.z * 0.03;
        vA = exp(-dz * dz) * (0.7 + uWinter * 0.3); // statt pow mit möglicher negativer Basis
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight; uniform float uWinter; varying float vA;
      void main() {
        if (length(gl_PointCoord - 0.5) > 0.5) discard;
        // nachts leuchtet das Plankton türkis (im Winter bleibt es weißer Schnee)
        vec3 col = mix(vec3(1.0), vec3(0.45, 1.6, 1.4), uNight * (1.0 - uWinter * 0.7));
        gl_FragColor = vec4(col, vA * (1.0 + uNight * 0.5));
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return () => { mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); };
}


/* =========================================================
   Saison: Winter (Dezember) – Weihnachtsbaum mit Lichtern + Geschenke
   ========================================================= */
function buildWinter(scene, rng, obstacles) {
  const tx = -4.4, tz = -3.4;
  const treeStk = drawXmasTree(rng);
  const treeT = toTexture(treeStk.canvas);
  const tree = cutMesh(stickerGeometry(treeStk, 2.6, 'bottom'), treeT, { glow: 0.35 });
  tree.position.set(tx, heightAt(tx, tz) - 0.05, tz);
  tree.rotation.y = 0.3;
  scene.add(tree);
  const tree2 = tree.clone();
  tree2.rotation.y = 0.3 + Math.PI / 2;
  scene.add(tree2);
  obstacles.push({ x: tx, z: tz, r: 1.4 });
  const presents = [[0xef4444, 0xfacc15], [0x3b82f6, 0xffffff], [0x22c55e, 0xef4444], [0xa855f7, 0xfde047]];
  presents.forEach(([c, r], i) => {
    const stk = drawPresent(rng, c, r);
    const m = cutMesh(stickerGeometry(stk, 0.75, 'bottom'), toTexture(stk.canvas));
    const a = 0.6 + i * 1.3, d = 1.35;
    m.position.set(tx + Math.cos(a) * d, heightAt(tx, tz) - 0.02, tz + Math.sin(a) * d);
    m.rotation.y = rng() * 0.8 - 0.4;
    scene.add(m);
  });
  // blinkende Lichter am Baum (kleine leuchtende Punkte)
  const n = 22, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const palette = [new THREE.Color(3, 0.6, 0.5), new THREE.Color(3, 2.4, 0.6), new THREE.Color(0.6, 1.6, 3), new THREE.Color(0.8, 3, 1.2)];
  for (let i = 0; i < n; i++) {
    const h = 0.3 + rng() * 2.0, half = (1 - h / 2.6) * 1.15;
    const a = rng() * Math.PI * 2;
    pos.set([tx + Math.cos(a) * half * 0.9, heightAt(tx, tz) + h, tz + Math.sin(a) * half * 0.9], i * 3);
    const c = palette[i % palette.length]; col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  scene.add(new THREE.Points(g, mat));
  return (dt, t) => { mat.opacity = 0.65 + 0.35 * Math.sin(t * 3); };
}

/* =========================================================
   Saison: Halloween – leuchtende Kürbisse + schwebende Geister
   ========================================================= */
function buildHalloween(scene, rng, obstacles, camera, spot, env) {
  const body = drawPumpkin(rng), face = drawPumpkin(rng, true);
  const bodyT = toTexture(body.canvas), faceT = toTexture(face.canvas);
  const faceMat = new THREE.MeshBasicMaterial({ map: faceT, transparent: true, alphaTest: 0.3, toneMapped: false, color: new THREE.Color(1.6, 1.1, 0.5), side: THREE.DoubleSide });
  const faces = [];
  const places = [{ x: 3.2, z: 2.6, s: 1.1 }];
  for (let i = 0; i < 8; i++) { const sp = spot(6, 30, 1.2, 20); if (sp) places.push({ ...sp, s: range(rng, 0.6, 0.95) }); }
  for (const p of places) {
    const w = 1.2 * p.s;
    const m = cutMesh(stickerGeometry(body, w, 'bottom'), bodyT);
    const fg = stickerGeometry(face, w, 'bottom');
    const f = new THREE.Mesh(fg, faceMat);
    f.position.z = 0.02;
    const grp = new THREE.Group();
    grp.add(m, f);
    grp.position.set(p.x, heightAt(p.x, p.z) - 0.03, p.z);
    grp.rotation.y = Math.atan2(-p.x, 34 - p.z) * 0.6; // grob zur Startkamera drehen
    scene.add(grp);
    obstacles.push({ x: p.x, z: p.z, r: 0.6 * p.s });
    faces.push(f);
  }
  const ghostStk = drawGhost(rng);
  const ghostT = toTexture(ghostStk.canvas);
  const ghosts = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(stickerGeometry(ghostStk, 1.3, 'center'),
      new THREE.MeshStandardMaterial({ map: ghostT, transparent: true, opacity: 0.85, alphaTest: 0.05, side: THREE.DoubleSide, emissiveMap: ghostT, emissive: 0x666677, depthWrite: false }));
    scene.add(m);
    ghosts.push({ m, a: rng() * Math.PI * 2, r: range(rng, 6, 18), y: range(rng, 3, 7), sp: range(rng, 0.05, 0.12) * (rng() < 0.5 ? 1 : -1), ph: rng() * 10 });
  }
  return (dt, t) => {
    const k = 0.75 + env.night * 0.6;
    faceMat.color.setRGB(1.6 * k, 1.05 * k, 0.45 * k).multiplyScalar(0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.3));
    for (const g of ghosts) {
      g.a += g.sp * dt;
      g.m.position.set(Math.cos(g.a) * g.r, g.y + Math.sin(t * 1.2 + g.ph) * 0.5, Math.sin(g.a) * g.r);
      g.m.rotation.y = Math.atan2(camera.position.x - g.m.position.x, camera.position.z - g.m.position.z);
      g.m.rotation.z = Math.sin(t * 1.5 + g.ph) * 0.12;
    }
  };
}
