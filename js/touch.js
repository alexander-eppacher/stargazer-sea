import * as THREE from 'three';

/* =========================================================
   Touch-Steuerung fürs Handy (die Maus bleibt bei OrbitControls).
   Alle Werte hier an einer Stelle – nach dem Test am Handy einfach anpassen.
   ?tempo=0.8 / ?tempo=1.25 in der Adresse ändert Drehen und Neigen zusammen.
   ========================================================= */
const tempoParam = parseFloat(new URLSearchParams(location.search).get('tempo'));
export const TOUCH = {
  TEMPO: tempoParam > 0.2 && tempoParam < 4 ? tempoParam : 1,

  // ein Finger
  LOCK_PX: 10,                   // ab so viel Bewegung wird die Richtung festgelegt
  TILT_RATIO: 1.7,               // |dy| > 1,7·|dx| → neigen, sonst drehen
  ROTATE_PER_REF: Math.PI,       // 180° pro Bezugslänge …
  REF_MIN: 320, REF_MAX: 520,    // … Bezugslänge = kürzere Bildschirmseite, begrenzt
  TILT_RANGE: 0.35 * Math.PI,    // ganzer Neigungsbereich …
  TILT_SCREEN: 0.45,             // … entspricht 45 % der Bildschirmhöhe

  // Ausgleiten (nur Drehen)
  GLIDE_TAU: 0.3,                // Abklingzeit in s
  GLIDE_MIN_PXS: 150,            // nur wenn der Finger schneller war (px/s) …
  GLIDE_WINDOW_MS: 80,           // … gemessen über die letzten 80 ms
  GLIDE_MAX: 1.5 * 2 * Math.PI,  // höchstens 1,5 Umdrehungen pro Sekunde

  // zwei Finger
  PAN_START_PX: 12,              // Verschieben erst ab so viel Bewegung des Mittelpunkts
  PAN_FWD_MAX: 2.5,              // vorwärts/rückwärts höchstens so viel schneller als seitlich

  // Tippen
  TAP_PX: 10, TAP_MS: 500,       // Tippen = höchstens 10 px und kürzer als 500 ms
  TAP_NEAR_PX: 28,               // nächste Krabbe in diesem Umkreis zählt auch
  DOUBLE_MS: 300, DOUBLE_PX: 30, // Doppeltippen
  DOUBLE_FLY_S: 0.35,            // Flug beim Doppeltippen
  HOME_FLY_S: 0.6,               // Flug zurück zur Startansicht
};

/**
 * Ein Finger: Richtung wird nach LOCK_PX festgelegt – nur drehen oder nur neigen.
 * Zwei Finger: zoomen (sofort) und flach verschieben (ab PAN_START_PX). Weitere Finger zählen nicht.
 * Die gewählte Neigung wird gemerkt; Boden/Wasseroberfläche begrenzen nur die Anzeige.
 */
export function setupTouch({ canvas, camera, controls, reduced, limits }) {
  controls.touches = { ONE: -1, TWO: -1 }; // OrbitControls ignoriert Touch (unbekannte Aktion)

  const pts = new Map();
  let mode = null; // null | 'pending' | 'rotate' | 'tilt' | 'two'
  let anchor = null, base = null, startMid = null, panning = false, samples = [];
  let glide = 0, wantPhi = null, lastPhi = null;
  const pend = { yaw: 0, pitch: 0, tilt: false, panX: 0, panY: 0, zoom: 1 };
  const api = { multi: false, active: false, lastInput: 'mouse', update, stop, get wantPhi() { return wantPhi; } };

  const size = () => ({ w: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight });
  const kRotate = () => {
    const { w, h } = size();
    return (TOUCH.ROTATE_PER_REF / THREE.MathUtils.clamp(Math.min(w, h), TOUCH.REF_MIN, TOUCH.REF_MAX)) * TOUCH.TEMPO;
  };
  const kTilt = () => (TOUCH.TILT_RANGE / (TOUCH.TILT_SCREEN * size().h)) * TOUCH.TEMPO;
  const two = () => {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };
  const one = () => ({ ...pts.values().next().value });

  function start() {
    if (api.active) return;
    api.active = true;
    controls.dispatchEvent({ type: 'start' }); // bricht Kameraflüge ab, blendet den Hinweis aus
  }
  function stop() {
    glide = 0;
    pend.yaw = pend.pitch = pend.panX = pend.panY = 0; pend.zoom = 1; pend.tilt = false;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') { api.lastInput = 'mouse'; return; }
    api.lastInput = 'touch';
    glide = 0; // ein neuer Finger stoppt das Gleiten sofort
    if (pts.size >= 2) return; // weitere Finger werden ignoriert
    if (pts.size === 0) { api.multi = false; api.active = false; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { mode = 'pending'; anchor = one(); }
    else {
      mode = 'two'; api.multi = true; panning = false;
      base = two(); startMid = { x: base.x, y: base.y };
    }
  });
  canvas.addEventListener('wheel', () => { api.lastInput = 'mouse'; }, { passive: true });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!controls.enabled) return;
    const now = e.timeStamp; // Zeit der Berührung selbst (genauer als beim Abarbeiten)

    if (mode === 'two' && pts.size === 2) {
      const g = two();
      start();
      pend.zoom *= base.d / g.d;
      if (!panning) {
        // erst ab PAN_START_PX verschieben – dann ab hier weiterrechnen (kein Sprung)
        if (Math.hypot(g.x - startMid.x, g.y - startMid.y) > TOUCH.PAN_START_PX) panning = true;
      } else {
        pend.panX += g.x - base.x; pend.panY += g.y - base.y;
      }
      base = g;
      return;
    }
    if (pts.size !== 1) return;
    const p = one();
    if (mode === 'pending') {
      const dx = p.x - anchor.x, dy = p.y - anchor.y;
      if (Math.hypot(dx, dy) < TOUCH.LOCK_PX) return;
      mode = Math.abs(dy) > TOUCH.TILT_RATIO * Math.abs(dx) ? 'tilt' : 'rotate';
      base = p; samples = [{ t: now, x: p.x }];
      start();
      return; // ab dem Schwellenpunkt weiterrechnen
    }
    const dx = p.x - base.x, dy = p.y - base.y;
    if (mode === 'rotate') {
      pend.yaw -= dx * kRotate(); // wie die Maus: nach rechts ziehen dreht die Welt nach rechts
      samples.push({ t: now, x: p.x });
      while (samples.length > 2 && now - samples[0].t > 200) samples.shift();
    } else if (mode === 'tilt') {
      pend.pitch -= dy * kTilt(); // wie die Maus: nach unten ziehen = steiler von oben
      pend.tilt = true;
    }
    base = p;
  });

  function up(e) {
    if (e.pointerType !== 'touch' || !pts.delete(e.pointerId)) return;
    const now = e.timeStamp;
    if (pts.size === 0) {
      if (mode === 'rotate' && e.type === 'pointerup' && !reduced() && samples.length >= 2) {
        const last = samples[samples.length - 1];
        if (now - last.t <= TOUCH.GLIDE_WINDOW_MS) {
          const first = samples.find((s) => last.t - s.t <= TOUCH.GLIDE_WINDOW_MS) || last;
          const ms = last.t - first.t;
          const v = ms > 0 ? ((last.x - first.x) / ms) * 1000 : 0; // px/s
          if (Math.abs(v) > TOUCH.GLIDE_MIN_PXS) glide = THREE.MathUtils.clamp(-v * kRotate(), -TOUCH.GLIDE_MAX, TOUCH.GLIDE_MAX);
        }
      }
      mode = null; api.active = false; samples = [];
    } else {
      // von zwei auf einen Finger: ohne Sprung weiter, Richtung neu festlegen
      mode = 'pending'; anchor = one();
    }
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const off = new THREE.Vector3(), sph = new THREE.Spherical(), fwd = new THREE.Vector3(), right = new THREE.Vector3();

  /** Im Bildablauf nach dem Setzen der Neigungsgrenzen und vor controls.update() aufrufen. */
  function update(dt) {
    if (!controls.enabled) { stop(); wantPhi = null; return; }
    if (glide) {
      pend.yaw += glide * dt;
      glide *= Math.exp(-dt / TOUCH.GLIDE_TAU);
      if (Math.abs(glide) < 0.02) glide = 0;
    }
    const touchMode = api.lastInput === 'touch';
    const busy = pend.yaw || pend.pitch || pend.tilt || pend.panX || pend.panY || pend.zoom !== 1;
    if (!busy && !touchMode) { wantPhi = null; return; }

    const t = controls.target;
    off.subVectors(camera.position, t);
    sph.setFromVector3(off);
    // Kamera wurde von außen bewegt (Flug, Folgen, Maus) → deren Neigung übernehmen
    if (wantPhi === null || lastPhi === null || Math.abs(sph.phi - lastPhi) > 1e-3) wantPhi = sph.phi;

    sph.theta += pend.yaw;
    sph.radius = THREE.MathUtils.clamp(sph.radius * pend.zoom, controls.minDistance, controls.maxDistance);
    const [lo, hi] = limits(sph.radius); // Grenzen schon für den neuen Abstand …
    controls.minPolarAngle = lo; controls.maxPolarAngle = hi; // … sonst drückt OrbitControls die alte Grenze zurück
    if (pend.tilt) wantPhi = THREE.MathUtils.clamp(sph.phi + pend.pitch, lo, hi); // an der Grenze nicht „aufstauen“
    sph.phi = THREE.MathUtils.clamp(wantPhi, lo, hi);
    sph.makeSafe();

    if (pend.panX || pend.panY) {
      // flach über den Boden; seitlich 1:1 mit dem Finger (in Bildmitte gemessen)
      const s = (2 * sph.radius * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / size().h;
      const fwdK = Math.min(TOUCH.PAN_FWD_MAX, 1 / Math.max(Math.cos(sph.phi), 1e-3)); // 1/sin(Höhenwinkel)
      fwd.set(-Math.sin(sph.theta), 0, -Math.cos(sph.theta));
      right.set(Math.cos(sph.theta), 0, -Math.sin(sph.theta));
      t.addScaledVector(right, -pend.panX * s).addScaledVector(fwd, pend.panY * s * fwdK);
    }
    off.setFromSpherical(sph);
    camera.position.copy(t).add(off);
    camera.lookAt(t);
    lastPhi = sph.phi;
    pend.yaw = pend.pitch = pend.panX = pend.panY = 0; pend.zoom = 1; pend.tilt = false;
  }

  return api;
}
