/*
 * Wachsen: Jede Krabbe schlüpft als Baby und wird in 3 Tagen groß.
 * Alles wird aus dem Zeitpunkt des ersten Sterns berechnet, darum sehen alle Besucher dasselbe.
 *
 *   Baby        ab 0 Std.   45 %  Eierschale auf dem Kopf, Sorte eingepackt
 *   Jungkrabbe  ab 24 Std.  62 %
 *   Halbstark   ab 48 Std.  80 %  Hut wird enthüllt, Album-Paket geht auf
 *   Ausgewachsen ab 72 Std. 100 %
 *
 * Solange eine Krabbe "sealed" ist, stehen Hut und Sorte nur verschlüsselt in crabs.json
 * (die Action packt sie nach 48 Std. aus). Bis dahin bleibt sie auch hier eingepackt.
 */
import { t } from './lang.js';

export const HOUR = 3_600_000;
const stage = (id, name, at, scale, icon) => ({ id, at, scale, icon, get name() { return t(`stage.${id}`, null, name); } });
export const STAGES = [
  stage('baby', 'Baby', 0, 0.45, '[ic:hatch]'),
  stage('jung', 'Jungkrabbe', 24, 0.62, '[ic:crab]'),
  stage('halbstark', 'Halbstark', 48, 0.8, '[ic:crab]'),
  stage('gross', 'Ausgewachsen', 72, 1, '[ic:crab]'),
];
export const UNLOCK = 2; // ab dieser Stufe sind Hut und Sorte sichtbar
const GROWN = { index: STAGES.length - 1, stage: STAGES[STAGES.length - 1], scale: 1, locked: false, nextAt: null, unlockAt: null, start: null };
const SEALED = { ...GROWN, locked: true };

/** Wachstum einer Krabbe zum Zeitpunkt now (ms). */
export function growthOf(d, now) {
  const start = Date.parse(d?.firstStarredAt || '');
  if (!Number.isFinite(start)) return d?.sealed ? SEALED : GROWN;
  const age = (now - start) / HOUR;
  let index = 0;
  for (let i = 0; i < STAGES.length; i++) if (age >= STAGES[i].at) index = i;
  const next = STAGES[index + 1];
  return {
    index,
    stage: STAGES[index],
    scale: STAGES[index].scale,
    locked: index < UNLOCK || !!d.sealed,
    nextAt: next ? start + next.at * HOUR : null,
    unlockAt: start + STAGES[UNLOCK].at * HOUR,
    start,
  };
}

/**
 * Was ist bei dieser Krabbe zwischen from und to (ms) passiert?
 * Rückgabe: das wichtigste Ereignis ('new' | 'unpack' | 'grow') oder null.
 */
export function newsBetween(d, from, to) {
  const start = Date.parse(d?.firstStarredAt || '');
  if (!Number.isFinite(start)) return null;
  const inside = (t) => t > from && t <= to;
  if (inside(start)) return 'new';
  if (inside(start + STAGES[UNLOCK].at * HOUR) && !d.sealed) return 'unpack';
  if (STAGES.some((s, i) => i > 0 && i !== UNLOCK && inside(start + s.at * HOUR))) return 'grow';
  return null;
}

/** "in 1 Tag 4 Std." – oder "gleich", wenn die Zeit schon um ist (Action packt gerade aus). */
export function untilText(ms) {
  return ms > 30_000 ? t('time.in', { t: timeLeft(ms) }) : t('time.soon');
}

/** Restzeit hübsch: "1 Tag 4 Std.", "5 Std. 12 Min.", "3 Min." */
export function timeLeft(ms) {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d) return t('time.days', { d, h });
  if (h) return t('time.hours', { h, m });
  return t('time.min', { m });
}
