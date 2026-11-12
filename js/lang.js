/* Übersetzungen für die Module (die Texte selbst stehen in i18n.js). */
const I = window.I18N || { lang: 'de', locale: 'de-DE', t: (k, v, f) => f ?? k, an: () => 'a', ord: (n) => `${n}.` };

export const lang = I.lang;
export const locale = I.locale;
export const t = I.t;
export const an = I.an;
