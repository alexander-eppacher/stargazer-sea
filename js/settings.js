/*
 * Einstellungen: rechte Seitenleiste (am Handy ein Blatt von unten).
 * Werte liegen nur im Browser (localStorage). main.js meldet sich mit onChange() für die Wirkung an.
 */
const KEY = 'stargazer.einstellungen';

export const DEFAULTS = Object.freeze({
  quality: 'auto', shadows: true, bloom: true, fps: false,
  sound: false, volSea: 0.8, volFx: 0.8,
  camSpeed: 1, autoRotate: false, theme: 'auto',
  labels: true, hints: true, legend: true, newest: true,
});
const CHOICES = { quality: ['auto', 'high', 'mid', 'low'], theme: ['auto', 'light', 'dark'] };

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    const v = saved[k], d = DEFAULTS[k];
    if (typeof v !== typeof d) continue;
    if (CHOICES[k] && !CHOICES[k].includes(v)) continue;
    if (typeof d === 'number' && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out;
}
function save() {
  const diff = {};
  for (const k of Object.keys(DEFAULTS)) if (k !== 'sound' && S[k] !== DEFAULTS[k]) diff[k] = S[k];
  try { localStorage.setItem(KEY, JSON.stringify(diff)); } catch { /* gesperrt: gilt dann nur bis zum Neuladen */ }
}

/** Aktuelle Werte (nur lesen; ändern über set()). */
export const S = load();
const listeners = new Map();

/** fn(wert) bei jeder Änderung von key aufrufen – und gleich einmal mit dem jetzigen Wert. */
export function onChange(key, fn, now = true) {
  if (!listeners.has(key)) listeners.set(key, []);
  listeners.get(key).push(fn);
  if (now) fn(S[key]);
}

export function set(key, value, { silent = false } = {}) {
  if (!(key in DEFAULTS) || S[key] === value) { syncControl(key); return; }
  S[key] = value;
  save();
  syncControl(key);
  if (!silent) for (const fn of listeners.get(key) || []) fn(value);
}

/* ---------- Seitenleiste ---------- */
const $ = (id) => document.getElementById(id);
const panel = $('settings'), scrim = $('settings-scrim'), btn = $('settings-btn');
const controls = (key) => panel.querySelectorAll(`[data-set="${key}"]`);

function syncControl(key) {
  for (const el of controls(key)) {
    const v = S[key];
    if (el.classList.contains('seg')) {
      for (const b of el.querySelectorAll('[data-v]')) b.setAttribute('aria-checked', String(b.dataset.v === v));
    } else if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'range') { el.value = v; fillRange(el); }
  }
}
/** Gefüllter Teil der Schiene (wie bei iOS) über eine CSS-Variable. */
function fillRange(el) {
  const p = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty('--pct', `${p}%`);
}

for (const key of Object.keys(DEFAULTS)) {
  for (const el of controls(key)) {
    if (el.classList.contains('seg')) {
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) set(key, b.dataset.v); });
    } else if (el.type === 'checkbox') el.addEventListener('change', () => set(key, el.checked));
    else if (el.type === 'range') el.addEventListener('input', () => { fillRange(el); set(key, parseFloat(el.value)); });
  }
  syncControl(key);
}
for (const b of panel.querySelectorAll('[data-lang]')) b.setAttribute('aria-checked', String(b.dataset.lang === window.I18N?.lang));

$('settings-reset').addEventListener('click', () => {
  for (const k of Object.keys(DEFAULTS)) if (k !== 'sound') set(k, DEFAULTS[k]);
});

let lastFocus = null;
export function isOpen() { return !panel.classList.contains('hidden'); }
export function open() {
  if (isOpen()) return;
  lastFocus = document.activeElement;
  panel.classList.remove('hidden', 'out');
  scrim.classList.remove('hidden', 'out');
  btn.setAttribute('aria-expanded', 'true');
  panel.focus({ preventScroll: true });
}
export function close() {
  if (!isOpen()) return;
  btn.setAttribute('aria-expanded', 'false');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.classList.add('out'); scrim.classList.add('out');
  setTimeout(() => {
    panel.classList.add('hidden'); scrim.classList.add('hidden');
    if (panel.classList.contains('more')) { panel.classList.remove('more'); panel.querySelector('.page-main').setAttribute('aria-hidden', 'false'); panel.querySelector('.page-more').setAttribute('aria-hidden', 'true'); }
  }, reduced ? 0 : 260);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
/** Unterseite „Mehr“ zeigen oder zurück zur Hauptseite. */
function showMore(on) {
  panel.classList.toggle('more', on);
  panel.querySelector('.page-main').setAttribute('aria-hidden', String(on));
  panel.querySelector('.page-more').setAttribute('aria-hidden', String(!on));
  $('settings-back').tabIndex = on ? 0 : -1;
  if (on) $('settings-back').focus({ preventScroll: true }); else $('settings-more').focus({ preventScroll: true });
}
$('settings-more').addEventListener('click', () => showMore(true));
$('settings-back').addEventListener('click', () => showMore(false));

btn.addEventListener('click', () => (isOpen() ? close() : open()));
$('settings-close').addEventListener('click', close);
scrim.addEventListener('click', close);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !isOpen()) return;
  e.stopPropagation();
  if (panel.classList.contains('more')) showMore(false); else close();
}, true);

// Am Handy: Blatt am Griff nach unten ziehen schließt es
(() => {
  const grab = panel.querySelector('.sheet-grab'), head = panel.querySelector('.sheet-head');
  let y0 = null, dy = 0;
  const down = (e) => { if (!matchMedia('(max-width: 760px)').matches) return; y0 = e.clientY; dy = 0; panel.style.transition = 'none'; e.target.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; };
  const up = () => {
    if (y0 === null) return;
    y0 = null; panel.style.transition = ''; panel.style.transform = '';
    if (dy > 90) close();
  };
  for (const el of [grab, head]) {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
})();
