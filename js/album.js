/*
 * Sammelalbum: ein Buch mit allen Krabben, sortiert nach Seltenheit.
 * Pro Seltenheit gibt es nummerierte Plätze (Sorte 1–100, bei Bedarf mehr).
 * Gefundene Krabben zeigen ihr Bild, fehlende ein "?".
 * Krabben, die noch wachsen, liegen eingepackt in der Kinderstube (kein Spicken: Platz und Hut bleiben geheim).
 */
import { SERIES } from './variants.js';
import { t as tr } from './lang.js';

const PER_PAGE = 20; // 4 × 5
let state = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NEWS = { new: 'al.new', unpack: 'al.unpack', grow: 'al.grow' };

function buildPages(tiers, data, growth) {
  const byTier = new Map(tiers.map((t) => [t.id, new Map()]));
  const nursery = [];
  for (const d of data) {
    if (!byTier.has(d.rarity)) continue;
    if (growth?.(d).locked) nursery.push(d);
    else if (Number.isInteger(d.variant)) byTier.get(d.rarity).set(d.variant, d);
  }
  nursery.sort((a, b) => growth(a).unlockAt - growth(b).unlockAt);
  const pages = [{ type: 'overview' }];
  const firstPage = {};
  if (nursery.length) {
    firstPage.nursery = pages.length;
    for (let i = 0; i < nursery.length; i += PER_PAGE) pages.push({ type: 'nursery', list: nursery.slice(i, i + PER_PAGE), from: i, total: nursery.length });
  }
  for (const t of tiers) {
    const owned = byTier.get(t.id);
    const slots = Math.max(SERIES, ...owned.keys());
    firstPage[t.id] = pages.length;
    for (let start = 1; start <= slots; start += PER_PAGE) {
      pages.push({ type: 'tier', tier: t, from: start, to: Math.min(slots, start + PER_PAGE - 1), owned, slots });
    }
  }
  return { pages, firstPage, byTier, nursery };
}

const newTag = (s, d) => {
  const n = s.news?.(d);
  return n ? `<span class="al-new">${tr(NEWS[n])}</span>` : '';
};

function pageHTML(p, s) {
  if (!p) return '<div class="al-blank"></div>';
  if (p.type === 'overview') {
    const total = s.tiers.reduce((n, t) => n + s.byTier.get(t.id).size, 0);
    const max = s.tiers.reduce((n, t) => n + Math.max(SERIES, ...s.byTier.get(t.id).keys()), 0);
    return `
      <div class="al-overview">
        <h2>${tr('album.title')}</h2>
        <p class="al-sub">${tr('al.sub', { n: SERIES })}</p>
        <div class="al-total">${tr('al.total', { n: total, max })}</div>
        <ul class="al-progress">
          ${s.tiers.map((t) => {
            const n = s.byTier.get(t.id).size, m = Math.max(SERIES, ...s.byTier.get(t.id).keys());
            return `<li><button data-jump="${t.id}">
              <span class="al-gem" style="background:${t.color}"></span><span class="al-tname">${esc(t.name)}</span>
              <span class="al-bar"><i style="width:${(n / m) * 100}%;background:${t.color}"></i></span><span class="al-cnt">${n}/${m}</span>
            </button></li>`;
          }).join('')}
        </ul>
        ${s.nursery.length ? `<button class="al-nursery-link" data-jump="nursery">${tr('al.nurseryLink', { n: s.nursery.length })}</button>` : ''}
        <p class="al-hint">${tr('al.hint')}</p>
      </div>`;
  }
  if (p.type === 'nursery') {
    const cells = p.list.map((d) => {
      const t = s.tiers.find((x) => x.id === d.rarity) || s.tiers[0];
      const g = s.growth(d);
      return `<button class="al-slot owned pack" data-id="${d.id}" style="--c:${t.color}" title="${esc(tr('al.packTitle', { login: d.login, until: s.until(g.unlockAt) }))}">
        <span class="al-pack"><span class="al-lock">🔒</span></span>${newTag(s, d)}
        <span class="al-num">${esc(s.until(g.unlockAt))}</span><span class="al-name">@${esc(d.login)}</span></button>`;
    }).join('');
    return `
      <div class="al-head" style="--c:#7cb8e0"><span class="al-gem" style="background:#7cb8e0"></span>${tr('al.nursery')}
        <span class="al-range">${p.total > PER_PAGE ? tr('al.rangeOf', { a: p.from + 1, b: p.from + p.list.length, n: p.total }) : tr('al.wrapped')}</span></div>
      <div class="al-grid">${cells}</div>`;
  }
  const t = p.tier;
  let cells = '';
  for (let v = p.from; v <= p.to; v++) {
    const d = p.owned.get(v);
    cells += d
      ? `<button class="al-slot owned" data-id="${d.id}" style="--c:${t.color}" title="${esc(tr('al.slot', { login: d.login, v }))}">
           <span class="al-pic" data-pic="${d.id}"></span>${newTag(s, d)}<span class="al-num">${v}</span><span class="al-name">@${esc(d.login)}</span></button>`
      : `<div class="al-slot empty" title="${esc(tr('al.empty', { v }))}"><span class="al-q">?</span><span class="al-num">${v}</span></div>`;
  }
  return `
    <div class="al-head" style="--c:${t.color}"><span class="al-gem" style="background:${t.color}"></span>${esc(t.name)}
      <span class="al-range">${tr('al.range', { a: p.from, b: p.to })}</span></div>
    <div class="al-grid">${cells}</div>`;
}

function render(dir = 0) {
  const s = state;
  const per = s.single ? 1 : 2;
  const left = s.pages[s.index], right = s.single ? null : s.pages[s.index + 1];
  const L = s.el.querySelector('.al-page.left'), Rr = s.el.querySelector('.al-page.right');
  const fill = () => {
    L.innerHTML = pageHTML(left, s);
    if (!s.single) Rr.innerHTML = pageHTML(right, s);
    const last = Math.min(s.pages.length, s.index + per);
    s.el.querySelector('.al-pageno').textContent = s.single ? tr('al.page', { a: s.index + 1, n: s.pages.length }) : tr('al.pages', { a: s.index + 1, b: last, n: s.pages.length });
    s.el.querySelector('.al-prev').disabled = s.index === 0;
    s.el.querySelector('.al-next').disabled = s.index + per >= s.pages.length;
    const cur = [left, right].find((p) => p?.type === 'tier')?.tier.id;
    s.el.querySelector('.al-tab-nursery')?.classList.toggle('active', [left, right].some((p) => p?.type === 'nursery'));
    s.el.querySelectorAll('.al-tab').forEach((b) => b.classList.toggle('active', b.dataset.tier === cur));
    queuePortraits();
  };
  if (!dir || s.reduced) { fill(); return; }
  // Seite umblättern: ein Blatt dreht sich über den Buchrücken
  const leaf = document.createElement('div');
  leaf.className = `al-leaf ${dir > 0 ? 'fwd' : 'back'} ${s.single ? 'single' : ''}`;
  s.el.querySelector('.al-spread').appendChild(leaf);
  setTimeout(fill, 230);
  setTimeout(() => leaf.remove(), 560);
}

function queuePortraits() {
  const s = state;
  const todo = [...s.el.querySelectorAll('.al-pic:empty')];
  const step = () => {
    if (!state || state !== s) return;
    const t0 = performance.now();
    while (todo.length && performance.now() - t0 < 24) {
      const el = todo.shift();
      const crab = s.crabs.get(Number(el.dataset.pic));
      const img = crab && s.portrait(crab);
      if (img) el.appendChild(img);
    }
    if (todo.length) setTimeout(step, 16);
  };
  step();
}

function go(to, dir) {
  const s = state;
  let i = Math.max(0, Math.min(to, s.pages.length - 1));
  if (!s.single) i -= i % 2;
  if (i === s.index) return;
  const d = dir ?? (Math.sign(i - s.index) || 1);
  s.index = i;
  render(d);
}

export function albumOpen() { return state; }

export function closeAlbum() {
  if (!state) return;
  const el = state.el;
  el.classList.add('out');
  setTimeout(() => el.remove(), 250);
  removeEventListener('keydown', state.onKey);
  state = null;
}

/**
 * opts: { tiers, data (aktive Krabben), crabs (Map id->Crab), portrait(crab)->Element, openCard(crab), isCardOpen(), reduced,
 *         growth(d)->{locked, unlockAt}, until(ms)->"in 2 Tagen"/"gleich", news(d)->'new'|'unpack'|'grow'|null }
 */
export function openAlbum(opts) {
  closeAlbum();
  const { pages, firstPage, byTier, nursery } = buildPages(opts.tiers, opts.data, opts.growth);
  const el = document.createElement('div');
  el.id = 'album';
  el.innerHTML = `
    <div class="al-backdrop"></div>
    <div class="al-book ${opts.reduced ? '' : 'al-open-anim'}" role="dialog" aria-modal="true" aria-label="${esc(tr('album.title'))}">
      <nav class="al-tabs">
        ${opts.tiers.map((t) => `<button class="al-tab" data-tier="${t.id}" style="--c:${t.color}" title="${esc(t.name)}">
          <span>${esc(t.name)}</span><small>${byTier.get(t.id).size}/${Math.max(SERIES, ...byTier.get(t.id).keys())}</small></button>`).join('')}
        ${nursery.length ? `<button class="al-tab al-tab-nursery" data-tier="nursery" style="--c:#7cb8e0" title="${esc(tr('al.nursery'))}"><span>${tr('al.nurseryTab')}</span><small>${nursery.length}</small></button>` : ''}
      </nav>
      <div class="al-spread">
        <div class="al-page left"></div>
        <div class="al-page right"></div>
      </div>
      <div class="al-nav">
        <button class="btn al-prev" aria-label="${tr('al.prev')}">◀</button>
        <span class="al-pageno"></span>
        <button class="btn al-next" aria-label="${tr('al.next')}">▶</button>
      </div>
      <button class="al-close" aria-label="${tr('al.close')}">✕</button>
    </div>`;
  document.body.appendChild(el);
  const single = matchMedia('(max-width: 760px)').matches;
  if (single) el.classList.add('single');
  state = {
    el, pages, firstPage, byTier, nursery, tiers: opts.tiers, crabs: opts.crabs, portrait: opts.portrait, index: 0, single, reduced: opts.reduced,
    growth: opts.growth, until: opts.until || (() => ''), news: opts.news,
  };

  const per = () => (state.single ? 1 : 2);
  el.querySelector('.al-prev').addEventListener('click', () => go(state.index - per(), -1));
  el.querySelector('.al-next').addEventListener('click', () => go(state.index + per(), 1));
  el.querySelector('.al-close').addEventListener('click', closeAlbum);
  el.querySelector('.al-backdrop').addEventListener('click', closeAlbum);
  el.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tier]'), jump = e.target.closest('[data-jump]'), slot = e.target.closest('.al-slot.owned');
    if (tab) go(firstPage[tab.dataset.tier]);
    else if (jump) go(firstPage[jump.dataset.jump]);
    else if (slot) { const c = opts.crabs.get(Number(slot.dataset.id)); if (c) opts.openCard(c); }
  });
  // Wischen auf dem Handy
  let sx = null;
  el.querySelector('.al-spread').addEventListener('pointerdown', (e) => { sx = e.clientX; });
  el.querySelector('.al-spread').addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 60) go(state.index + (dx < 0 ? per() : -per()), dx < 0 ? 1 : -1);
  });
  const onKey = (e) => {
    if (opts.isCardOpen?.()) return; // erst die Sammelkarte schließen
    if (e.key === 'Escape') closeAlbum();
    else if (e.key === 'ArrowRight') go(state.index + per(), 1);
    else if (e.key === 'ArrowLeft') go(state.index - per(), -1);
  };
  addEventListener('keydown', onKey);
  state.onKey = onKey;
  render(0);
  return state;
}

export function albumGo(page) { if (state) go(page, 1); }
