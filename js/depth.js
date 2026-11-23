/* =========================================================
   Tiefe im Hintergrund: drei gestaffelte Papier-Schattenrisse
   (Tangwald, Felsbögen, ferne Riffhügel), die nach hinten im
   Wasserdunst verschwimmen; ein ferner Fischschwarm als Schattenriss;
   nachts ein paar leuchtende Punkte in der Ferne.
   Stärke: ?tiefe=dezent | deutlich (Standard: siehe DEFAULT)
   ========================================================= */
import * as THREE from 'three';
import { range, radialTexture, mulberry32 } from './util.js';
import { canvas, grain } from './paper.js';

const DEFAULT = 'deutlich';
const PRESETS = {
  dezent: { haze: [0.14, 0.36, 0.6], deep: 0.18, fog: 0.0050, fish: 0.32, outline: 0.32, dots: 0.7, lines: 0.02 },
  deutlich: { haze: [0.3, 0.62, 0.86], deep: 0.4, fog: 0.0064, fish: 0.5, outline: 0.14, dots: 1.0, lines: 0.04 },
};

/* ---------- Schattenrisse auf Papier (weiß = Form, Grauton = Schattierung) ---------- */
function layerCanvas(rng, kind, W = 2048, H = 512) {
  const [c, ctx] = canvas(W, H);
  const draw = (ox) => {
    if (kind === 'kelp') {
      // Tangwald: hohe, wellige Stängel mit Blättern, unten ein Hügelband
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const x = ox + (i / 9) * W + range(rng, -30, 30), r = range(rng, 130, 220); ctx.moveTo(x - r, H); ctx.ellipse(x, H, r, H * range(rng, 0.12, 0.22), 0, Math.PI, 0); }
      ctx.fill();
      ctx.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const x = ox + rng() * W, top = H * range(rng, 0.05, 0.45), w = range(rng, 7, 13), ph = rng() * 6;
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, H);
        for (let y = H; y > top; y -= 12) ctx.lineTo(x + Math.sin(y * 0.018 + ph) * 18, y);
        ctx.stroke();
        for (let y = H - 40; y > top + 20; y -= range(rng, 34, 52)) {
          const lx = x + Math.sin(y * 0.018 + ph) * 18, s = (Math.floor(y) % 2 ? 1 : -1);
          ctx.beginPath(); ctx.ellipse(lx + s * 16, y, 20, 8, s * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (kind === 'arch') {
      // Felsbögen: runde Felsen, manche mit Loch
      for (let i = 0; i < 7; i++) {
        const x = ox + (i / 7) * W + range(rng, -40, 40), r = range(rng, 140, 230), h = H * range(rng, 0.45, 0.75);
        ctx.beginPath(); ctx.ellipse(x, H, r, h, 0, Math.PI, 0); ctx.fill();
        if (rng() < 0.6) { // Bogen: Loch ausschneiden
          ctx.save(); ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath(); ctx.ellipse(x + range(rng, -20, 20), H, r * 0.42, h * 0.55, 0, Math.PI, 0); ctx.fill();
          ctx.restore();
        }
        ctx.beginPath(); ctx.ellipse(x + range(rng, -r, r) * 0.6, H, r * 0.5, h * 0.4, 0, Math.PI, 0); ctx.fill();
      }
    } else {
      // ferne Riffhügel: weiche, flache Kuppen
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const x = ox + (i / 6) * W + range(rng, -60, 60), r = range(rng, 260, 420); ctx.moveTo(x - r, H); ctx.ellipse(x, H, r, H * range(rng, 0.35, 0.6), 0, Math.PI, 0); }
      ctx.fill();
    }
  };
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff';
  for (const ox of [-W, 0, W]) draw(ox);
  // Schattierung innen: Flecken etwas dunkler (wirkt wie Papier-Struktur)
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(140,140,140,0.35)';
  for (let i = 0; i < 90; i++) { ctx.beginPath(); ctx.arc(rng() * W, H * 0.3 + rng() * H * 0.7, range(rng, 6, 22), 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  grain(ctx, W, H, rng, 0.5);
  return c;
}

/** Kante (heller Papierrand) als zweiter Kanal: Rand des Schattenrisses aufhellen. */
function edgeCanvas(src) {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(src, 0, 6); // nur der obere Rand bleibt übrig
  return c;
}

function layerMaterial(tex, edgeTex, color, haze, deep, outline, fogColor, nightU) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, depthWrite: true, transparent: false,
    uniforms: {
      map: { value: tex }, edge: { value: edgeTex }, uCol: { value: new THREE.Color(color) },
      uFog: { value: fogColor }, uHaze: { value: haze }, uDeep: { value: deep }, uEdge: { value: outline }, uNight: nightU,
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D map, edge; uniform vec3 uCol, uFog; uniform float uHaze, uDeep, uEdge, uNight; varying vec2 vUv;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.5) discard;
        vec3 c = uCol * (0.72 + 0.4 * t.r) * (1.0 - uNight * 0.45);
        c = mix(c, vec3(1.0), texture2D(edge, vUv).a * uEdge);   // heller Papierrand oben
        float h = clamp(uHaze + uDeep * (1.0 - vUv.y), 0.0, 1.0); // unten tiefer im Dunst
        gl_FragColor = vec4(mix(c, uFog, h), 1.0);
      }`,
  });
}

function fishTexture() {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(54, 32, 40, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(90, 32); ctx.lineTo(124, 12); ctx.lineTo(118, 32); ctx.lineTo(124, 52); ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDepth(scene, rng, { fogColor, nightU, env, lowY, surface, camera }) {
  const q = new URLSearchParams(location.search).get('tiefe');
  const P = PRESETS[q] || PRESETS[DEFAULT];
  scene.fog.density = P.fog;
  // helle Wellenlinien an der Wasseroberfläche verschwinden in der Ferne schneller (sonst „Bühnenwand“)
  if (surface) surface.material.uniforms.uFade.value = P.lines;
  const updaters = [];

  /* 1. drei gestaffelte Schichten rundherum (je ein offener Zylinder) */
  const layers = [
    { kind: 'kelp', R: 60, H: 30, color: 0x2d8f80, rep: 3 },
    { kind: 'arch', R: 84, H: 40, color: 0x3a7ea6, rep: 2 },
    { kind: 'hill', R: 116, H: 52, color: 0x4f86bd, rep: 2 },
  ];
  layers.forEach((L, i) => {
    const cv = layerCanvas(rng, L.kind);
    const tex = new THREE.CanvasTexture(cv), edge = new THREE.CanvasTexture(edgeCanvas(cv));
    for (const t of [tex, edge]) { t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; }
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(L.R, L.R, L.H, 96, 1, true),
      layerMaterial(tex, edge, L.color, P.haze[i], P.deep, i === 0 ? P.outline : 0, fogColor, nightU),
    );
    // Textur rundherum mehrfach wiederholen
    m.geometry.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * L.rep; });
    m.position.y = lowY + L.H / 2 - 0.5;
    m.rotation.y = rng() * Math.PI * 2;
    m.renderOrder = -5 + i;
    scene.add(m);
  });

  /* 2. ferner Fischschwarm als Schattenriss (ein einziges Objekt) */
  {
    const N = 26;
    const mat = new THREE.MeshBasicMaterial({ map: fishTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 1.1), mat, N);
    mesh.frustumCulled = false;
    const fish = [];
    for (let i = 0; i < N; i++) fish.push({ da: range(rng, -0.12, 0.12), dr: range(rng, -3, 3), dy: range(rng, -2.2, 2.2), s: range(rng, 0.7, 1.2), ph: rng() * 6 });
    const base = new THREE.Color(0x1d4f72), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    scene.add(mesh);
    updaters.push((dt, t) => {
      mat.color.copy(base).lerp(fogColor, 1 - P.fish).multiplyScalar(1 - env.night * 0.4);
      const a0 = t * 0.018, R = 52; // vor der ersten Kulisse, außerhalb der Insel
      fish.forEach((f, i) => {
        const a = a0 + f.da, r = R + f.dr;
        pos.set(Math.cos(a) * r, 11 + f.dy + Math.sin(t * 0.6 + f.ph) * 0.3, Math.sin(a) * r);
        e.set(0, -a + Math.PI, Math.sin(t * 2 + f.ph) * 0.06); // Flanke zeigt zur Inselmitte, Kopf in Schwimmrichtung
        qq.setFromEuler(e);
        mesh.setMatrixAt(i, m4.compose(pos, qq, sc.set(f.s, f.s, f.s)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /* 3. nachts: wenige leuchtende Punkte in der Ferne (ein Punkte-Objekt) */
  {
    const N = 34, arr = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2, r = range(rng, 45, 58); // zwischen Insel und erster Kulisse
      arr.set([Math.cos(a) * r, range(rng, lowY + 1.5, 9), Math.sin(a) * r], i * 3);
      c.set(rng() < 0.6 ? 0x9ff3ff : 0xffe7a0); col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.6, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), vertexColors: true,
      transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    updaters.push((dt, t) => {
      mat.opacity = Math.max(0, (env.night - 0.3) / 0.6) * P.dots * (0.85 + 0.15 * Math.sin(t * 1.3));
      pts.visible = mat.opacity > 0.01;
    });
  }

  /* 4. mehr Abwechslung, Leben in der Ferne, Nachtstimmung (eigener Zufall – die Schichten oben bleiben gleich) */
  extras(scene, mulberry32(4242), { fogColor, nightU, env, lowY, P, camera, updaters });

  return (dt, t) => { for (const u of updaters) u(dt, t); };
}

/* ---------- Silhouetten für die Ferne (weiß = Form) ---------- */
function silCanvas(W, H, draw) { const [c, ctx] = canvas(W, H); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; draw(ctx, W, H); return c; }
/** Korallen-Riff: verzweigte Bäumchen und Fächer in Gruppen, dazwischen Lücken (wirkt nicht wie eine Reihe). */
function reefCanvas(rng, W = 2048, H = 512) {
  return silCanvas(W, H, (ctx) => {
    const tree = (x, h, w) => {
      const grow = (px, py, ang, len, lw, d) => {
        const nx = px + Math.sin(ang) * len, ny = py - Math.cos(ang) * len;
        ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
        if (d > 0) for (const s of [-1, 1]) grow(nx, ny, ang + s * range(rng, 0.25, 0.6), len * range(rng, 0.62, 0.8), lw * 0.7, d - 1);
        else { ctx.beginPath(); ctx.arc(nx, ny, lw * 0.9, 0, 6.3); ctx.fill(); }
      };
      grow(x, H, range(rng, -0.1, 0.1), h * 0.35, w, 4);
    };
    const fan = (x, h) => { ctx.beginPath(); ctx.moveTo(x, H); ctx.ellipse(x, H - h * 0.45, h * 0.5, h * 0.55, 0, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(x, H); ctx.fill(); };
    for (const ox of [-W, 0, W]) {
      for (let gI = 0; gI < 5; gI++) {
        const cx = ox + (gI / 5) * W + range(rng, 40, 200);
        ctx.beginPath(); ctx.ellipse(cx, H, range(rng, 120, 200), range(rng, 26, 50), 0, Math.PI, 0); ctx.fill(); // Sockel
        for (let k = 0; k < 4; k++) {
          const x = cx + range(rng, -110, 110), h = H * range(rng, 0.35, 0.8);
          rng() < 0.55 ? tree(x, h, range(rng, 10, 18)) : fan(x, h * 0.75);
        }
      }
    }
  });
}
/** Versunkenes Schiff, schräg im Sand, mit gebrochenem Mast. */
function wreckCanvas() {
  return silCanvas(1024, 512, (ctx, W, H) => {
    ctx.save(); ctx.translate(W * 0.5, H * 0.86); ctx.rotate(-0.12);
    ctx.beginPath(); ctx.moveTo(-380, -40); ctx.lineTo(360, -70); ctx.quadraticCurveTo(410, -60, 400, 10); ctx.lineTo(-330, 60); ctx.quadraticCurveTo(-400, 30, -380, -40); ctx.fill(); // Rumpf
    ctx.fillRect(-120, -150, 200, 100);                                   // Aufbau
    ctx.fillRect(-20, -380, 22, 260); ctx.save(); ctx.translate(2, -380); ctx.rotate(0.9); ctx.fillRect(0, 0, 16, 140); ctx.restore(); // Mast, oben abgeknickt
    ctx.fillRect(-230, -250, 16, 190);                                    // zweiter Mast
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-222, -250); ctx.lineTo(-10, -370); ctx.moveTo(-222, -250); ctx.lineTo(-380, -40); ctx.stroke(); // Taue
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-260 + i * 120, -10, 14, 0, 6.3); ctx.fill(); } // Bullaugen
    ctx.beginPath(); ctx.moveTo(150, -40); ctx.lineTo(230, -55); ctx.lineTo(200, 20); ctx.closePath(); ctx.fill(); // Loch im Rumpf
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(W * 0.5, H, W * 0.48, 46, 0, Math.PI, 0); ctx.fill(); // Sandhügel davor
  });
}
function mantaCanvas() {
  return silCanvas(512, 256, (ctx, W, H) => {
    ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.22);
    ctx.bezierCurveTo(W * 0.62, H * 0.25, W * 0.8, H * 0.45, W * 0.98, H * 0.55);
    ctx.bezierCurveTo(W * 0.8, H * 0.6, W * 0.62, H * 0.62, W * 0.56, H * 0.78);
    ctx.lineTo(W * 0.5, H * 0.98); ctx.lineTo(W * 0.44, H * 0.78);
    ctx.bezierCurveTo(W * 0.38, H * 0.62, W * 0.2, H * 0.6, W * 0.02, H * 0.55);
    ctx.bezierCurveTo(W * 0.2, H * 0.45, W * 0.38, H * 0.25, W * 0.5, H * 0.22); ctx.fill();
    ctx.fillRect(W * 0.43, H * 0.12, 10, H * 0.14); ctx.fillRect(W * 0.55, H * 0.12, 10, H * 0.14); // Kopflappen
  });
}
function whaleCanvas() {
  return silCanvas(1024, 384, (ctx, W, H) => {
    ctx.beginPath(); ctx.moveTo(W * 0.06, H * 0.55);
    ctx.bezierCurveTo(W * 0.1, H * 0.2, W * 0.55, H * 0.15, W * 0.78, H * 0.42);
    ctx.lineTo(W * 0.9, H * 0.3); ctx.lineTo(W * 0.98, H * 0.22); ctx.lineTo(W * 0.94, H * 0.48); ctx.lineTo(W * 0.99, H * 0.72); ctx.lineTo(W * 0.88, H * 0.6); ctx.lineTo(W * 0.78, H * 0.55);
    ctx.bezierCurveTo(W * 0.55, H * 0.8, W * 0.2, H * 0.82, W * 0.06, H * 0.55); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W * 0.32, H * 0.68); ctx.lineTo(W * 0.42, H * 0.95); ctx.lineTo(W * 0.46, H * 0.7); ctx.fill(); // Brustflosse
  });
}
const silTex = (cv, wrap = false) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (wrap) t.wrapS = THREE.RepeatWrapping; return t; };

function extras(scene, rng, { fogColor, nightU, env, lowY, P, camera, updaters }) {
  // a) Korallen-Riff in leicht farbigen Tönen zwischen Tang und Felsbögen, mit Lücken
  {
    const cv = reefCanvas(rng), tex = silTex(cv, true), edge = silTex(edgeCanvas(cv), true);
    edge.wrapS = THREE.RepeatWrapping;
    const R = 56, H = 20; // vor dem Tangwald: bringt Farbe in den unteren Teil der Kulissen
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true), layerMaterial(tex, edge, 0x9a72c0, 0.3, P.deep, 0.1, fogColor, nightU));
    m.geometry.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * 2; });
    m.position.y = lowY + H / 2 - 0.5; m.rotation.y = 1.3; m.renderOrder = -4;
    scene.add(m);
  }
  // b) versunkenes Schiff weit hinten, steht schräg im Sand
  {
    const cv = wreckCanvas(), tex = silTex(cv), edge = silTex(edgeCanvas(cv));
    const ang = -2.65, R = 51, w = 24, h = 12; // links hinten hinter der Stadt, vor den Kulissen (sonst verdeckt der Tang es)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), layerMaterial(tex, edge, 0x5b4a6e, 0.22, P.deep * 0.4, 0.16, fogColor, nightU));
    m.position.set(Math.cos(ang) * R, lowY + h / 2 - 1.2, Math.sin(ang) * R);
    m.lookAt(0, m.position.y, 0);
    m.renderOrder = -3;
    scene.add(m);
  }
  // c) große Schattenrisse ziehen langsam vorbei: ein Mantarochen (flattert) und ein Wal
  const swimmer = (cv, w, h, R, y, speed, phase, color, haze) => {
    const mat = new THREE.MeshBasicMaterial({ map: silTex(cv), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.renderOrder = -3; scene.add(m);
    const base = new THREE.Color(color);
    updaters.push((dt, t) => {
      const a = phase + t * speed;
      m.position.set(Math.cos(a) * R, y + Math.sin(t * 0.3 + phase) * 1.2, Math.sin(a) * R);
      m.lookAt(0, m.position.y, 0);
      m.rotateY(Math.PI / 2 * Math.sign(speed));                                  // Flanke zur Insel, Kopf in Schwimmrichtung
      m.scale.set(1, 1 + Math.sin(t * 1.4 + phase) * (h > w * 0.45 ? 0.12 : 0.03), 1); // Manta schlägt mit den Flügeln
      mat.color.copy(base).lerp(fogColor, haze).multiplyScalar(1 - env.night * 0.5);
    });
  };
  swimmer(mantaCanvas(), 9, 4.5, 66, 15, 0.022, 0.4, 0x1f4c6e, 0.45);
  swimmer(whaleCanvas(), 26, 9.7, 104, 22, -0.009, 3.6, 0x2a5578, 0.62);
  // d) schwebende Teilchen rund um die Kamera (Tiefe), nachts leuchtendes Plankton
  {
    const N = 420, B = 34, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([range(rng, -B, B), range(rng, -B * 0.4, B * 0.6), range(rng, -B, B)], i * 3); seed[i] = rng(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uNight: nightU, uB: { value: B } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uB; uniform vec3 uCam; varying float vA; varying float vS;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.2 + aSeed * 40.0) * 0.8, uTime * (0.05 + aSeed * 0.08), cos(uTime * 0.17 + aSeed * 30.0) * 0.8);
          p = mod(p - uCam + uB, 2.0 * uB) - uB + uCam;            // Kasten wandert mit der Kamera mit
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z; vA = smoothstep(uB, uB * 0.4, d) * smoothstep(0.5, 3.0, d); vS = aSeed;
          gl_PointSize = (aSeed > 0.85 ? 2.6 : 1.6) * 260.0 / max(d, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight; varying float vA; varying float vS;
        void main() {
          float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          float k = smoothstep(0.5, 0.0, d);
          vec3 day = vec3(0.85, 0.95, 1.0) * 0.16;
          vec3 night = mix(vec3(0.35, 1.0, 0.95), vec3(0.6, 0.7, 1.0), step(0.5, vS)) * (vS > 0.7 ? 0.9 : 0.25); // leuchtendes Plankton
          gl_FragColor = vec4(mix(day, night, uNight) * k * vA, 1.0);
        }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false; pts.renderOrder = 2;
    scene.add(pts);
    updaters.push((dt, t) => { mat.uniforms.uTime.value = t; if (camera) mat.uniforms.uCam.value.copy(camera.position); });
  }
  // e) nachts: ein paar glühende Quallen weit hinten, die langsam auf und ab treiben
  {
    const tex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), jel = [];
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: [0xff8fd8, 0x8ff0ff, 0xc6a0ff][i % 3], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const sp = new THREE.Sprite(mat), a = rng() * Math.PI * 2, R = range(rng, 54, 70);
      sp.position.set(Math.cos(a) * R, range(rng, 4, 14), Math.sin(a) * R);
      sp.scale.setScalar(range(rng, 1.6, 2.6));
      scene.add(sp);
      jel.push({ sp, y: sp.position.y, ph: rng() * 6 });
    }
    updaters.push((dt, t) => {
      const k = Math.max(0, (env.night - 0.3) / 0.6);
      for (const j of jel) {
        j.sp.position.y = j.y + Math.sin(t * 0.25 + j.ph) * 1.5;
        j.sp.material.opacity = k * (0.55 + 0.35 * Math.sin(t * 1.7 + j.ph));
        j.sp.visible = k > 0.01;
      }
    });
  }
}
