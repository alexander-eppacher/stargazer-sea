import * as THREE from 'three';
import { mulberry32, pick, range, clamp, noise3, mergeAll, setSway, vox, hdr, radialTexture } from './util.js';
import { patch, shared, standard, CAUSTIC_GLSL } from './shaders.js';
import {
  canvas, css, toTexture, grain, sticker, stickerGeometry, crossedGeometry,
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
          float sun = pow(max(dot(vDir, normalize(vec3(-0.2, 1.0, 0.3))), 0.0), 14.0);
          vec3 glow = mix(vec3(0.6, 0.9, 1.0) * 0.7, vec3(0.7, 0.8, 1.0) * 0.35, uNight); // nachts: Mondschein
          gl_FragColor = vec4(c + glow * sun, 1.0);
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
  const frill = frillTexture(rng, 0xfbeec4);
  const sandMat = standard({ map: sandTex, roughness: 1 }, { caustics: 0.55 });
  const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 1 });
  const frillMat = new THREE.MeshStandardMaterial({ map: frill, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, emissiveMap: frill, emissive: 0x1a1a1a });

  function slab(rFn, cx, cz, top, depth, n = 120) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = rFn(a);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, top - depth, 0);
    const mesh = new THREE.Mesh(g, [sandMat, cardMat]);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
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
  slab(islandR, 0, 0, 0, 7);
  for (const p of PLATEAUS) slab((a) => plateauR(p, a), p.x, p.z, p.h, p.h + 0.5, 64);

  const low = new THREE.Mesh(
    new THREE.CircleGeometry(260, 64).rotateX(-Math.PI / 2),
    standard({ map: lowSandTex, roughness: 1 }, { caustics: 0.5 }),
  );
  low.position.y = WORLD.lowY - 0.01;
  low.receiveShadow = true;
  scene.add(low);

  /* ---------- Hintergrund: gestaffelte Kulissen im Wasserdunst (js/depth.js) ---------- */
  updaters.push(buildDepth(scene, mulberry32(9001), { fogColor: WORLD.fogColor, nightU, env, lowY: WORLD.lowY, surface }));
  // Die alten Kulissen haben hier 140176 Zufallszahlen verbraucht. Überspringen, damit alle
  // Korallen, Steine usw. danach genau an derselben Stelle bleiben wie vorher.
  for (let i = 0; i < 140176; i++) rng();

  /* ---------- Schatztruhe + Papierstern ---------- */
  const chest = buildChest(scene, rng);
  obstacles.push({ x: 0, z: 0, r: 2.1 });
  updaters.push(chest.update);

  /* ---------- Krabbenstadt am hinteren Inselrand ---------- */
  const town = buildTown(scene, mulberry32(4711), { heightAt, obstacles, env, camera });
  updaters.push(town.update);
  // Plätze für Blubberbad & Spielplatz schon jetzt reservieren (kein Gras/Korallen darin)
  for (const [x, z, r] of Object.values(PLACE_SPOTS)) obstacles.push({ x, z, r });

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
    rock(sp.x, sp.z, s, 0.75, keep);
    if (s > 0.6) (keep ? obstacles : ghosts).push({ x: sp.x, z: sp.z, r: s * 0.9 });
    if (!keep && s > 0.6) obstacles.push(ghosts[ghosts.length - 1]);
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, d = range(rng, 44, 62);
    rock(Math.cos(a) * d, Math.sin(a) * d, range(rng, 2, 5), range(rng, 0.6, 1.1));
  }
  const rockMesh = new THREE.Mesh(
    mergeAll(rockGeos, ['position', 'normal', 'color', 'uv']),
    standard({ vertexColors: true, flatShading: true, map: grainTex, roughness: 1, emissive: 0x1a1a22 }, { caustics: 0.4 }),
  );
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  // Blubber-Schlote (Papprollen)
  const vents = [];
  for (let i = 0; i < 3; i++) {
    const sp = spot(10, 30, 2);
    if (!sp) continue;
    const y0 = heightAt(sp.x, sp.z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.75, 1.6, 14, 1, true), new THREE.MeshStandardMaterial({ map: cardTex, side: THREE.DoubleSide, roughness: 1 }));
    m.position.set(sp.x, y0 + 0.8, sp.z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    obstacles.push({ x: sp.x, z: sp.z, r: 0.9 });
    vents.push(new THREE.Vector3(sp.x, y0 + 1.6, sp.z));
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

  const moundTex = {};
  const groups = new Map();
  function addCut(kind, x, z, worldW, { planes = 2, sway = 0, speed = 1, segY = 1 } = {}) {
    const a = pick(rng, A[kind]);
    const { list, height } = crossedGeometry(a.stk, worldW, planes, segY);
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
      let r = 0.8 * s;
      if (type === 'branch') { addCut('branch', x, z, 2.2 * s, { planes: 3, sway: 0.06, segY: 3 }); r = 0.9 * s; }
      else if (type === 'fan') { addCut('fan', x, z, 2.4 * s, { planes: 2, sway: 0.1, segY: 3 }); }
      else if (type === 'tube') { addCut('tube', x, z, 1.6 * s); r = 0.7 * s; }
      else if (type === 'anemone') {
        const h = addCut('anemone', x, z, 1.7 * s, { planes: 3, sway: 0.12, speed: 1.8, segY: 3 });
        if (!dry) reefAnemones.push({ x, y: heightAt(x, z) + h * 0.8, z, s });
        r = 0.7 * s;
      } else { mound(x, z, s); r = 0.9 * s; }
      if (!rc.plateau) { const o = { x, z, r }; obstacles.push(o); if (dry) ghosts.push(o); }
    }
  }
  dry = false;
  // Platzhalter wieder entfernen: dort ist jetzt wirklich frei (Krabben dürfen hin)
  for (const g of ghosts) obstacles.splice(obstacles.indexOf(g), 1);
  // äußere Riffe auf dem tiefen Boden
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, d = range(rng, 43, 62);
    const kind = pick(rng, ['branch', 'fan', 'tube']);
    addCut(kind, Math.cos(a) * d, Math.sin(a) * d, range(rng, 2.5, 4.5), { sway: kind === 'tube' ? 0 : 0.08, segY: 3 });
  }
  // Kelp am Inselrand (vorne frei) und draußen
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const edge = i < 40;
    const d = edge ? islandR(a) - range(rng, 1, 4) : range(rng, 42, 60);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (edge && (!free(x, z, 0.5) || Math.abs(Math.atan2(x, z)) < 1.0)) continue;
    addCut('kelp', x, z, range(rng, 1.1, 1.8), { sway: 0.9, speed: 0.6, segY: 10 });
    if (edge) obstacles.push({ x, z, r: 0.5 });
  }
  const addCutLater = [];
  const flushCuts = () => {
    for (const args of addCutLater) addCut(...args);
    for (const g of groups.values()) {
      scene.add(cutMesh(mergeAll(g.geos, ['position', 'normal', 'uv', 'aSway']), g.t, { sway: g.sway, speed: g.speed }));
    }
  };

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
      mesh.setMatrixAt(n++, m4.compose(pos, q, sc.set(s, s, s)));
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  /* ---------- Seesterne & Muscheln (Sticker auf dem Boden) ---------- */
  {
    const decos = [
      ...[0xff7b39, 0xff4d6d, 0xb07ef0, 0x5b8cff, 0xffc93c].map((c) => ({ stk: drawStarfish(rng, c), size: [0.5, 0.9], n: 3 })),
      ...[0xffe5d9, 0xf6bd60, 0xf7a1c4].map((c) => ({ stk: drawShell(rng, c), size: [0.35, 0.6], n: 3 })),
    ];
    const keepSmall = every(3);
    for (const d of decos) {
      const t = toTexture(d.stk.canvas);
      const geos = [];
      for (let i = 0; i < d.n; i++) {
        const sp = spot(CHEST_FREE, 36, 0.4, 10);
        if (!sp) continue;
        if (inMeadow(sp.x, sp.z) && !keepSmall()) continue;
        const g = stickerGeometry(d.stk, range(rng, ...d.size), 'center');
        g.rotateX(-Math.PI / 2);
        g.rotateY(rng() * Math.PI * 2);
        g.translate(sp.x, heightAt(sp.x, sp.z) + 0.025 + i * 0.001, sp.z);
        geos.push(g);
      }
      if (!geos.length) continue;
      const m = new THREE.Mesh(mergeAll(geos, ['position', 'normal', 'uv']), cutMat(t, 0, 1, 0.25));
      m.receiveShadow = true;
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
    const peb = drawPebbles(rng);
    flat(peb, 1.6, 1, cutMat(toTexture(peb.canvas), 0, 1, 0.2), 0.02);
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
    const sign = cutMesh(stickerGeometry(sg.stk, 2.3, 'bottom'), sg.t);
    sign.position.set(-8.5, heightAt(-8.5, 15.5) - 0.05, 15.5);
    sign.rotation.set(0, 0.32, -0.05);
    scene.add(sign);
    obstacles.push({ x: -8.5, z: 15.5, r: 0.9 });

    // Rahmen vorne: zwei große Pflanzengruppen in den unteren Ecken (Tiefe!)
    for (const [fx, fz] of [[-12.5, 21.5], [13, 22]]) {
      for (let k = 0; k < 2; k++) {
        const x = fx + range(rng, -1.6, 1.6), z = fz + range(rng, -1.2, 1.2);
        const kind = pick(rng, ['branch', 'fan', 'kelp', 'branch']);
        if (kind === 'kelp') addCutLater.push(['kelp', x, z, range(rng, 1.4, 1.9), { sway: 0.9, speed: 0.6, segY: 10 }]);
        else addCutLater.push([kind, x, z, range(rng, 2.6, 3.4), { planes: 2, sway: 0.08, segY: 3 }]);
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

  /* ---------- Tiere ---------- */
  updaters.push(buildFish(scene, rng, camera, reefAnemones));
  const glowMats = [];
  updaters.push(buildJellies(scene, rng, camera, glowMats));
  updaters.push(buildTurtle(scene, rng, 1.0, 30, 11, 0.055, 0));
  updaters.push(buildTurtle(scene, rng, 0.7, 22, 7.5, -0.075, 2.4));
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
    obstacles, bubbles, chest, env,
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
function buildChest(scene, rng) {
  const group = new THREE.Group();
  group.rotation.set(0, 0.35, 0);
  scene.add(group);
  const U = 0.1;
  const wood = 0xb5763d, woodD = 0x8a5527, gold = 0xffc93c;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: 0x2a1a08 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: hdr(0xffffff, 1.6) });

  const base = vox([
    [0, 0, 0, 26, 12, 16, wood],
    [0, 3.5, 8.05, 26, 0.6, 0.2, woodD], [0, 7.5, 8.05, 26, 0.6, 0.2, woodD],
    [-10, 0, 0, 2, 12.2, 16.4, gold], [10, 0, 0, 2, 12.2, 16.4, gold],
    [0, 8, 8.3, 3, 3.5, 0.8, gold], [0, 8.6, 8.75, 1, 1.4, 0.3, 0x3a2410],
    [0, 11.4, 0, 23.5, 0.8, 13.5, 0xffe27a, true],
  ], U);
  const bm = new THREE.Mesh(base.geo, mat);
  bm.castShadow = bm.receiveShadow = true;
  group.add(bm, new THREE.Mesh(base.glow, glowMat));

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 12 * U, -8 * U);
  group.add(lidPivot);
  const lid = vox([
    [0, 0, 8, 26, 3, 16, wood], [0, 3, 8, 25, 2.2, 14, wood], [0, 5.2, 8, 23, 1.4, 11, woodD],
    [-10, 0, 8, 2, 6.8, 16.4, gold], [10, 0, 8, 2, 6.8, 16.4, gold],
  ], U);
  const lm = new THREE.Mesh(lid.geo, mat);
  lm.castShadow = true;
  lidPivot.add(lm);

  // Münzen als kleine Sticker
  const coinStk = sticker(64, 64, (ctx) => {
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(32, 32, 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59e0b'; ctx.fillRect(28, 16, 8, 32);
  }, { outline: 5, thick: 2 });
  const coinTex = toTexture(coinStk.canvas);
  const coins = [];
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, d = range(rng, 1.5, 2.5);
    const g = stickerGeometry(coinStk, 0.32, 'center');
    g.rotateX(-Math.PI / 2 + range(rng, -0.3, 0.3));
    g.translate(Math.cos(a) * d, 0.04 + i * 0.002, Math.sin(a) * d);
    coins.push(g);
  }
  scene.add(new THREE.Mesh(mergeAll(coins, ['position', 'normal', 'uv']), cutMat(coinTex, 0, 1, 0.5)));

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
  const y = heightAt(x, z);
  g.position.set(x, y - 0.05, z);
  g.rotation.y = 0.25;
  scene.add(g);
  const lowStk = drawClamShell(rng, false), topStk = drawClamShell(rng, true);
  const lowT = toTexture(lowStk.canvas), topT = toTexture(topStk.canvas);
  const W = 2.4;
  const lower = cutMesh(stickerGeometry(lowStk, W, 'bottom'), lowT);
  g.add(lower);
  const lowH = lowStk.h * (W / lowStk.w);
  const hinge = new THREE.Group();
  hinge.position.set(0, lowH * 0.92, -0.06);
  g.add(hinge);
  const upper = cutMesh(stickerGeometry(topStk, W, 'bottom'), topT);
  hinge.add(upper);
  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xfff4fb, roughness: 0.15, metalness: 0.1, emissive: 0x3a3040 }),
  );
  pearl.position.set(0, lowH * 0.98, -0.03); // liegt IN der Muschel, guckt über den Rand
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
    hinge.rotation.x = -open * 0.75;
    hinge.position.y = lowH * 0.92 + open * 0.18;
    pearl.position.y = lowH * (0.9 + open * 0.12);
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
function buildFish(scene, rng, camera, anemones) {
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
        const minY = heightAt(a.x, a.z) + 0.9;
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
function buildJellies(scene, rng, camera, glowMats = []) {
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
      if (j.g.position.y > 27) j.g.position.y = 4;
      if (j.g.position.y < 3.5) j.vy = Math.abs(j.vy) + 0.5;
      j.g.rotation.y = Math.atan2(camera.position.x - j.g.position.x, camera.position.z - j.g.position.z);
      j.g.rotation.z = Math.sin(t * 0.5 + j.ph) * 0.12;
    }
  };
}

/* =========================================================
   Papier-Schildkröte
   ========================================================= */
function buildTurtle(scene, rng, scale, R, y, speed, phase) {
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
    g.position.set(Math.cos(ang) * R, y + Math.sin(t * 0.4 + phase) * 1.5, Math.sin(ang) * R * 0.9);
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
