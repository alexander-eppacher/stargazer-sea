/*
 * Unterwasser-Geräusche: echte Aufnahmen (CC0, siehe assets/sounds/QUELLEN.md),
 * gedämpft durch einen Tiefpass. Standardmäßig AUS – erst ein Klick auf den Lautsprecher lädt
 * und startet sie. Klappt das Laden nicht, gibt es ein im Browser erzeugtes Meeresrauschen.
 */
const KEY = 'stargazer-sea-sound';
const BASE = 'assets/sounds/';

let ac = null, master = null, started = false, enabled = false, bubbleTimer = null;
let buffers = { meer: null, blubbern: null, blops: [] };
let loading = null, ambientNodes = [], usingRecording = false;

function store(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* egal */ } }
export function wantedBefore() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }

async function loadBuffer(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return ac.decodeAudioData(await res.arrayBuffer());
}

function loadAll() {
  if (loading) return loading;
  const ogg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"');
  loading = Promise.allSettled([
    loadBuffer(ogg ? 'meer.ogg' : 'meer.mp3').catch(() => loadBuffer('meer.mp3')),
    loadBuffer('blubbern.mp3'),
    loadBuffer('blop1.mp3'),
    loadBuffer('blop2.mp3'),
  ]).then(([m, b, p1, p2]) => {
    buffers.meer = m.status === 'fulfilled' ? m.value : null;
    buffers.blubbern = b.status === 'fulfilled' ? b.value : null;
    buffers.blops = [p1, p2].filter((p) => p.status === 'fulfilled').map((p) => p.value);
    return buffers;
  });
  return loading;
}

function setup() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = 0;
  master.connect(ac.destination);
  started = true;
  return true;
}

/* ---------- Meeresrauschen: Aufnahme in Schleife mit Überblendung ---------- */
function startAmbientRecording(buf) {
  usingRecording = true;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 650;
  lp.Q.value = 0.5;
  const out = ac.createGain();
  out.gain.value = 0.9;
  lp.connect(out).connect(master);
  ambientNodes.push(lp, out);
  const XF = 3; // Sekunden Überblendung
  const play = (when) => {
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + XF);
    g.gain.setValueAtTime(1, when + buf.duration - XF);
    g.gain.linearRampToValueAtTime(0, when + buf.duration);
    src.connect(g).connect(lp);
    src.start(when);
    src.stop(when + buf.duration + 0.05);
    const next = when + buf.duration - XF;
    const wait = Math.max(0, (next - ac.currentTime - 1) * 1000);
    ambientNodes.timer = setTimeout(() => { if (started) play(Math.max(next, ac.currentTime + 0.05)); }, wait);
  };
  play(ac.currentTime + 0.05);
}

/* Ersatz: braunes Rauschen (falls die Dateien fehlen) */
function startAmbientSynth() {
  usingRecording = false;
  const len = ac.sampleRate * 4;
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
  }
  const noise = ac.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
  const amb = ac.createGain();
  amb.gain.value = 0.55;
  noise.connect(lp).connect(amb).connect(master);
  noise.start();
}

/** Ein einzelnes "Blubb" – echtes Plopp, sonst ein kleiner Ton. */
export function bubble(strength = 1) {
  if (!enabled || !ac) return;
  const t = ac.currentTime;
  if (buffers.blops.length) {
    const src = ac.createBufferSource();
    src.buffer = buffers.blops[Math.floor(Math.random() * buffers.blops.length)];
    src.playbackRate.value = 0.85 + Math.random() * 0.5;
    const g = ac.createGain();
    g.gain.value = 0.55 * strength;
    src.connect(g).connect(master);
    src.start(t);
    return;
  }
  const o = ac.createOscillator();
  const g = ac.createGain();
  const f0 = 260 + Math.random() * 380;
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * (2.2 + Math.random()), t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09 * strength, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.15);
}

/** Kurzer Ausschnitt aus der Blubber-Aufnahme (zufällige Stelle, weich ein-/ausgeblendet). */
function bubbleBurst() {
  if (!enabled || !ac) return;
  const buf = buffers.blubbern;
  if (!buf) { bubble(0.7); return; }
  const len = 0.5 + Math.random() * 1.1;
  const off = Math.random() * Math.max(0.1, buf.duration - len);
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.8 + Math.random() * 0.35;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1800;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32, t + 0.08);
  g.gain.setValueAtTime(0.32, t + len - 0.15);
  g.gain.linearRampToValueAtTime(0, t + len);
  src.connect(lp).connect(g).connect(master);
  src.start(t, off, len + 0.05);
}

/** Kleine fröhliche Tonfolge (Schatzkiste, neue Krabbe). */
export function chime() {
  if (!enabled || !ac) return;
  const t = ac.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    const s = t + i * 0.09;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.07, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
    o.connect(g).connect(master);
    o.start(s);
    o.stop(s + 0.4);
  });
}

function scheduleBubbles() {
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    if (enabled && !document.hidden) bubbleBurst();
    scheduleBubbles();
  }, 2500 + Math.random() * 5000);
}

export function isOn() { return enabled; }
export function usesRecording() { return usingRecording; }

export async function setSound(on) {
  enabled = on;
  store(on);
  if (on) {
    if (!started) {
      if (!setup()) { enabled = false; return false; }
      try { await ac.resume(); } catch { /* Browser blockiert evtl. */ }
      await loadAll();
      if (buffers.meer) startAmbientRecording(buffers.meer); else startAmbientSynth();
    }
    try { await ac.resume(); } catch { /* egal */ }
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(0.5, ac.currentTime, 0.6);
    scheduleBubbles();
  } else if (ac) {
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(0, ac.currentTime, 0.2);
    clearTimeout(bubbleTimer);
  }
  return enabled;
}

export function audioState() { return ac ? ac.state : 'none'; }
export function loadedSounds() { return { meer: !!buffers.meer, blubbern: !!buffers.blubbern, blops: buffers.blops.length }; }

// Im Hintergrund-Tab stumm (spart Akku)
document.addEventListener('visibilitychange', () => {
  if (!ac || !enabled) return;
  if (document.hidden) ac.suspend().catch(() => {});
  else ac.resume().catch(() => {});
});
