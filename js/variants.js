/*
 * Einzigartige Krabben: Jede Seltenheit hat nummerierte Sorten (Serie 1 = Nr. 1–100).
 * Eine Sorte = Hut-Typ + Hutfarbe + Schalenfarbe + Muster. Jede Nummer wird nur EINMAL vergeben
 * (das macht scripts/sync_stargazers.py – dort steht dieselbe Rechnung).
 * Die Seltenheit wird immer nach den festen Chancen gewürfelt; ist eine Seltenheit voll,
 * geht es mit der nächsten Auflage weiter.
 */
import { t } from './lang.js';

export const SERIES = 100;
export const HUES = 10; // Hutfarben: 0 = Original, danach Farbton-Verschiebung in 36°-Schritten

export const SHELLS = [
  { name: 'Orange', color: '#de7856' },
  { name: 'Rot', color: '#d84a3c' },
  { name: 'Koralle', color: '#ec7a8a' },
  { name: 'Gold', color: '#e5a030' },
  { name: 'Blau', color: '#4b87d6' },
  { name: 'Lila', color: '#9a6ad4' },
];
export const PATTERNS = ['Schlicht', 'Punkte', 'Streifen', 'Sommersprossen', 'Bauchfleck'];

const cache = new Map();

/** Alle Kombinationen einer Seltenheit, in fester Reihenfolge (identisch zum Python-Skript). */
export function combos(tier) {
  if (cache.has(tier.id)) return cache.get(tier.id);
  const list = [];
  for (const h of tier.hats) {
    for (let shell = 0; shell < SHELLS.length; shell++) {
      // ohne Hut ist die Hutfarbe unsichtbar -> dann färbt sie das Muster, und "Schlicht" entfällt
      const patterns = h.id === 'none' ? [1, 2, 3, 4] : [0, 1, 2, 3, 4];
      for (const pattern of patterns) for (let hue = 0; hue < HUES; hue++) list.push({ hat: h.id, shell, pattern, hue });
    }
  }
  const step = stepFor(list.length);
  const out = { list, step };
  cache.set(tier.id, out);
  return out;
}

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
/** Schrittweite, die alle Kombinationen genau einmal durchläuft (teilerfremd zur Anzahl). */
export function stepFor(n) {
  let a = 37;
  while (gcd(a, n) !== 1) a++;
  return a;
}

/**
 * Sorte Nr. v (ab 1) -> Aussehen.
 * Sind alle Kombinationen einer Seltenheit vergeben, läuft die Nummer einfach weiter:
 * Nr. Anzahl+1 … beginnt die 2. Auflage (gleiche Kombinationen, aber andere Scherenspitzen).
 */
export function decodeVariant(tier, v) {
  const { list, step } = combos(tier);
  const k = ((v - 1) * step) % list.length;
  return { ...list[k], variant: v, capacity: list.length, edition: editionOf(tier, v) };
}

export function editionOf(tier, v) {
  return Math.floor((v - 1) / combos(tier).list.length) + 1;
}

/** Farbe der Scherenspitzen je Auflage (Auflage 1 = keine Markierung). */
export const EDITION_TIPS = ['#bfe3ff', '#3b2a33', '#ffd23f', '#7ee0b5', '#ff9ad5']; // 2. Auflage hell, 3. dunkel, …
export function editionTip(edition) {
  return edition > 1 ? EDITION_TIPS[(edition - 2) % EDITION_TIPS.length] : null;
}

export function variantLabel(tier, v) {
  const d = decodeVariant(tier, v);
  const shell = t(`shell.${d.shell}`, null, SHELLS[d.shell].name), pattern = t(`pattern.${d.pattern}`, null, PATTERNS[d.pattern]);
  const hue = d.hat === 'none' ? '' : d.hue ? t('variant.hue', { n: d.hue + 1 }) : t('variant.original');
  return `${shell}, ${pattern}${hue}${d.edition > 1 ? t('variant.edition', { n: d.edition }) : ''}`;
}
