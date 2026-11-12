/*
 * Lade-Animation: Wir starten über dem Meer und tauchen beim Laden immer tiefer
 * (Himmel, Wolken, Wasseroberfläche, Lichtstrahlen, Fische, Seetang, viele Blasen).
 * Normales Skript (kein Modul), damit es sofort läuft – noch bevor three.js geladen ist.
 * main.js ruft am Ende window.__introBurst() auf: große Blasenwolke, dann geht's ins 3D-Meer.
 * Mindestdauer: beim ersten Besuch 3 s, danach 1,2 s – Tippen oder eine Taste überspringt.
 */
(function () {
  var loader = document.getElementById('loader');
  if (!loader || location.protocol === 'file:') return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var c = document.createElement('canvas');
  c.className = 'intro-canvas';
  c.setAttribute('aria-hidden', 'true');
  loader.insertBefore(c, loader.firstChild);
  loader.classList.add('intro');
  var ctx = c.getContext('2d');
  var W = 0, H = 0;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  // Tiefe in Bildschirmhöhen: < 0 = Himmel, 0 = Wasseroberfläche
  var cam = -0.62, crossed = false, burst = 0, last = performance.now(), start = last;

  // Mindestdauer (die Ladeanzeige in index.html läuft gleichmäßig über diese Zeit)
  var KEY = 'stargazer.introGesehen', seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { /* Speicher gesperrt */ }
  window.__introMin = seen ? 1200 : 3000;
  window.__introT0 = start;
  window.__introSkipped = false;
  var waiters = [];
  function release() {
    if (!waiters.length) return;
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* egal */ }
    waiters.splice(0).forEach(function (r) { r(); });
  }
  function skip() {
    if (window.__introSkipped) return;
    window.__introSkipped = true;
    release();
  }
  loader.addEventListener('pointerdown', skip);
  addEventListener('keydown', function (e) { if (loader.isConnected && !e.repeat) skip(); });
  var skipHint = document.createElement('div');
  skipHint.className = 'intro-skip';
  skipHint.textContent = window.I18N ? I18N.t('load.skip') : 'Tippen zum Überspringen';
  loader.appendChild(skipHint);
  setTimeout(function () { skipHint.classList.add('show'); }, 1000);
  /** main.js wartet darauf, bevor der Tauchflug beginnt. */
  window.__introWait = function () {
    return new Promise(function (r) {
      var left = window.__introMin - (performance.now() - start);
      if (window.__introSkipped || left <= 0) { waiters.push(r); release(); return; }
      waiters.push(r);
      setTimeout(release, left);
    });
  };
  var bubbles = [], fish = [], kelp = [];
  var clouds = [
    { x: 0.12, d: -1.05, s: 1.0, v: 9 }, { x: 0.62, d: -0.92, s: 1.3, v: 6 },
    { x: 0.35, d: -0.7, s: 0.8, v: 12 }, { x: 0.86, d: -0.62, s: 0.9, v: 8 },
  ];
  for (var i = 0; i < 14; i++) {
    kelp.push({ side: i % 2, d: 0.9 + i * 0.22 + Math.random() * 0.1, h: 0.35 + Math.random() * 0.35, ph: Math.random() * 6, par: 1.15 + Math.random() * 0.25, col: ['#3fae5c', '#2f9e7a', '#6cbf45'][i % 3] });
  }
  for (i = 0; i < 7; i++) {
    fish.push({ d: 0.5 + i * 0.32, x: Math.random(), v: (0.04 + Math.random() * 0.05) * (i % 2 ? 1 : -1), s: 0.7 + Math.random() * 0.6, col: ['#ffb347', '#ff7b7b', '#7cc7ff', '#ffd23f', '#b48cff'][i % 5] });
  }

  function lerpColor(a, b, t) {
    var r = Math.round(a[0] + (b[0] - a[0]) * t), g = Math.round(a[1] + (b[1] - a[1]) * t), bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  var WATER = [[126, 214, 242], [74, 174, 219], [36, 120, 180], [16, 70, 128], [8, 40, 84]];
  function waterAt(d) {
    var x = Math.max(0, Math.min(WATER.length - 1.001, d * 1.3));
    var i = Math.floor(x);
    return lerpColor(WATER[i], WATER[i + 1], x - i);
  }
  function sy(d) { return (d - cam) * H + H * 0.5; }

  function spawnBubble(fast, big) {
    bubbles.push({
      x: Math.random() * W,
      d: fast ? cam + 0.55 + Math.random() * 0.2 : cam + 0.5 + Math.random() * 0.1,
      r: big ? 18 + Math.random() * 50 : 3 + Math.random() * 11,
      v: fast ? 1.6 + Math.random() * 2.2 : 0.12 + Math.random() * 0.3,
      ph: Math.random() * 6, w: 10 + Math.random() * 20,
    });
  }
  function splash() {
    for (var k = 0; k < 70; k++) {
      bubbles.push({ x: Math.random() * W, d: 0.02 + Math.random() * 0.45, r: 4 + Math.random() * 16, v: 0.25 + Math.random() * 0.5, ph: Math.random() * 6, w: 14 + Math.random() * 24 });
    }
  }

  function paperBlob(x, y, s, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    var parts = [[-40, 6, 26], [-12, -10, 34], [22, -2, 28], [48, 10, 20], [0, 14, 30]];
    ctx.fillStyle = 'rgba(80,110,140,0.25)';
    parts.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1] + 6, p[2], 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = fill;
    parts.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  function draw(t, dt) {
    // Wasser (Hintergrund über die ganze Höhe)
    var top = cam - 0.5, bot = cam + 0.5;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, waterAt(Math.max(0, top)));
    g.addColorStop(1, waterAt(Math.max(0, bot)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Himmel
    var surf = sy(0);
    if (surf > 0) {
      var sg = ctx.createLinearGradient(0, sy(-1.2), 0, surf);
      sg.addColorStop(0, '#7fd0ff'); sg.addColorStop(1, '#dff6ff');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, Math.min(H, surf));
      // Sonne
      var sx = W * 0.8, syy = sy(-1.0);
      ctx.fillStyle = 'rgba(255,214,90,0.35)'; ctx.beginPath(); ctx.arc(sx, syy, 74, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, syy, 52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(sx, syy, 45, 0, Math.PI * 2); ctx.fill();
      clouds.forEach(function (cl) {
        var x = ((cl.x * W + t * cl.v) % (W + 260)) - 130;
        paperBlob(x, sy(cl.d), cl.s * Math.min(1.4, W / 900 + 0.5), '#ffffff');
      });
    }

    // Lichtstrahlen unter der Oberfläche
    if (surf < H * 1.3) {
      ctx.save();
      for (var k = 0; k < 6; k++) {
        var rx = (k / 6) * W + Math.sin(t * 0.3 + k) * 30;
        var a = 0.11 * Math.max(0, 1 - Math.max(0, cam) / 2.2);
        var lg = ctx.createLinearGradient(0, surf, 0, surf + H * 1.4);
        lg.addColorStop(0, 'rgba(255,250,220,' + a + ')'); lg.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(rx, surf); ctx.lineTo(rx + 60, surf); ctx.lineTo(rx - 120, surf + H * 1.4); ctx.lineTo(rx - 230, surf + H * 1.4);
        ctx.fill();
      }
      ctx.restore();
    }

    // Seetang an den Rändern (Parallaxe)
    kelp.forEach(function (k) {
      var base = (k.d - cam * k.par) * H + H * 0.5 + H * 0.5;
      var len = k.h * H;
      if (base - len > H || base < 0) return;
      var x0 = k.side ? W - 30 - (k.d * 37 % 50) : 30 + (k.d * 53 % 50);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 22; ctx.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (var s = 0; s <= 12; s++) {
          var yy = base - (s / 12) * len, xx = x0 + Math.sin(t * 1.4 + k.ph + s * 0.5) * 10 * (s / 12);
          s ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
        ctx.strokeStyle = k.col; ctx.lineWidth = 13;
      }
    });

    // Fische
    fish.forEach(function (f) {
      f.x += f.v * dt;
      if (f.x > 1.15) f.x = -0.15; if (f.x < -0.15) f.x = 1.15;
      var y = sy(f.d), x = f.x * W;
      if (y < -40 || y > H + 40) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(f.v > 0 ? f.s : -f.s, f.s);
      var tail = Math.sin(t * 8 + f.d * 10) * 4;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(0, 0, 25, 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-38, -14 + tail); ctx.lineTo(-38, 14 + tail); ctx.fill();
      ctx.fillStyle = f.col;
      ctx.beginPath(); ctx.ellipse(0, 0, 21, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-33, -10 + tail); ctx.lineTo(-33, 10 + tail); ctx.fill();
      ctx.fillStyle = '#23324a'; ctx.beginPath(); ctx.arc(11, -3, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Wasseroberfläche (gewellter Papierrand)
    if (surf > -40 && surf < H + 40) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, surf + 18);
      for (var x = 0; x <= W + 20; x += 20) ctx.lineTo(x, surf + Math.sin(x * 0.02 + t * 2) * 7);
      ctx.lineTo(W, surf + 30); ctx.lineTo(0, surf + 30); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
      ctx.beginPath();
      for (x = 0; x <= W + 20; x += 20) { var yv = surf + Math.sin(x * 0.02 + t * 2) * 7; x ? ctx.lineTo(x, yv) : ctx.moveTo(x, yv); }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.stroke();
      ctx.restore();
    }

    // Blasen
    var spawnRate = cam > 0 ? 28 : 6;
    if (Math.random() < spawnRate * dt) spawnBubble(false, false);
    if (Math.random() < spawnRate * dt * 0.6) spawnBubble(false, false);
    for (var b = bubbles.length - 1; b >= 0; b--) {
      var bb = bubbles[b];
      bb.d -= bb.v * dt;
      var by = sy(bb.d), bx = bb.x + Math.sin(t * 2 + bb.ph) * bb.w * 0.3;
      if (bb.d < 0.01 || by < -bb.r * 2) { bubbles.splice(b, 1); continue; }
      if (by > H + 80) continue;
      ctx.fillStyle = 'rgba(210,245,255,0.28)';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(2, bb.r * 0.14);
      ctx.beginPath(); ctx.arc(bx, by, bb.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(bx - bb.r * 0.35, by - bb.r * 0.35, bb.r * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    if (bubbles.length > 260) bubbles.splice(0, bubbles.length - 260);
  }

  function frame(now) {
    if (!c.isConnected) return; // Ladebildschirm ist weg
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var p = (window.__load && window.__load.value) || 0;
    var t = (now - start) / 1000;
    // Ziel-Tiefe folgt dem Ladefortschritt; ein bisschen sinken wir auch so (wenn es mal hängt)
    var target = -0.62 + (p / 100) * 3.0 + Math.min(0.35, t * 0.03);
    cam += (target - cam) * Math.min(1, dt * 1.8);
    if (!crossed && cam > -0.02) { crossed = true; splash(); }
    if (burst > 0) {
      burst -= dt;
      for (var k = 0; k < 6; k++) spawnBubble(true, Math.random() < 0.7);
    }
    draw(t, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /** Fertig geladen: große Blasenwolke über den ganzen Bildschirm. */
  window.__introBurst = function () {
    burst = 0.9;
    for (var k = 0; k < 60; k++) spawnBubble(true, true);
  };
  window.__introState = function () { return { cam: cam, crossed: crossed, bubbles: bubbles.length }; };
})();
