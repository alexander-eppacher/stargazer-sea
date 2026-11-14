/* Übersetzungen für die Module (die Texte selbst stehen in i18n.js). */
const I = window.I18N || { lang: 'de', locale: 'de-DE', t: (k, v, f) => f ?? k, an: () => 'a', ord: (n) => `${n}.` };

export const lang = I.lang;
export const locale = I.locale;
export const t = I.t;
export const an = I.an;
export const icon = (n) => I.icon(n);
export const icons = (s, plain) => I.icons(s, plain);
export const plain = I.plain;
export const iconPaths = I.iconPaths;
