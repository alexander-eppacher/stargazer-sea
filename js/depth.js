/* =========================================================
   Tiefe im Hintergrund: drei gestaffelte Papier-Schattenrisse
   (Tangwald, Felsbögen, ferne Riffhügel), die nach hinten im
   Wasserdunst verschwimmen; ein ferner Fischschwarm als Schattenriss;
   nachts ein paar leuchtende Punkte in der Ferne.
   Stärke: ?tiefe=dezent | deutlich (Standard: siehe DEFAULT)
   ========================================================= */
import * as THREE from 'three';
import { range, radialTexture } from './util.js';
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

export function buildDepth(scene, rng, { fogColor, nightU, env, lowY, surface }) {
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

  return (dt, t) => { for (const u of updaters) u(dt, t); };
}
