/*
 * Zeichnet die Lade-Animation (Himmel, Wasseroberfläche, Lichtstrahlen, Fische, Seetang, Blasen).
 * Läuft bevorzugt in einem eigenen Worker (js/intro-worker.js) auf einer OffscreenCanvas: dann taucht die
 * Kamera ruhig weiter, auch wenn die Seite nebenbei das Meer baut und dabei kurz beschäftigt ist.
 * Ohne Worker-Unterstützung läuft derselbe Code direkt auf der Seite.
 */
self.IntroScene = function (ctx, night) {
  night = night || 0;
  var W = 0, H = 0;
  var cam = -0.62, crossed = false, burst = 0, last = 0, start = 0;
  var bubbles = [], fish = [], kelp = [];
  var clouds = [
    { x: 0.12, d: -1.05, s: 1.0, v: 9 }, { x: 0.62, d: -0.92, s: 1.3, v: 6 },
    { x: 0.35, d: -0.7, s: 0.8, v: 12 }, { x: 0.86, d: -0.62, s: 0.9, v: 8 },
  ];
  var KELP_SPAN = 14 * 0.22;
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
  // Wasser wird mit der Tiefe dunkler und endet genau in der Farbe des Meers dahinter
  // (Tag 0x4aaedb, Nacht 0x0f2f5c wie in main.js) – so gibt es beim Übergang keinen Helligkeitssprung.
  var DAY = [[126, 214, 242], [104, 196, 234], [86, 184, 226], [74, 174, 219]];
  var NIGHT = [[44, 86, 140], [30, 66, 116], [20, 54, 102], [15, 47, 92]];
  var WATER = DAY.map(function (c, i) { return [0, 1, 2].map(function (k) { return c[k] + (NIGHT[i][k] - c[k]) * night; }); });
  function waterAt(d) {
    var x = Math.max(0, Math.min(WATER.length - 1.001, d * 1.1));
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
      sg.addColorStop(0, lerpColor([127, 208, 255], [10, 22, 52], night)); sg.addColorStop(1, lerpColor([223, 246, 255], [44, 70, 120], night));
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, Math.min(H, surf));
      // Sonne (nachts Mond und Sterne)
      var sx = W * 0.8, syy = sy(-1.0);
      if (night > 0.5) {
        ctx.fillStyle = '#fff';
        for (var st = 0; st < 40; st++) { var stx = (st * 97.3) % W, sty = sy(-1.25 + ((st * 37) % 100) / 100 * 1.1); ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(t * 1.5 + st)); ctx.fillRect(stx, sty, 2, 2); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(200,220,255,0.25)'; ctx.beginPath(); ctx.arc(sx, syy, 70, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f4f1e6'; ctx.beginPath(); ctx.arc(sx, syy, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = lerpColor([127, 208, 255], [10, 22, 52], night); ctx.beginPath(); ctx.arc(sx + 18, syy - 10, 38, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,214,90,0.35)'; ctx.beginPath(); ctx.arc(sx, syy, 74, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, syy, 52, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(sx, syy, 45, 0, Math.PI * 2); ctx.fill();
      }
      clouds.forEach(function (cl) {
        var x = ((cl.x * W + t * cl.v) % (W + 260)) - 130;
        paperBlob(x, sy(cl.d), cl.s * Math.min(1.4, W / 900 + 0.5), night > 0.5 ? '#5a6f96' : '#ffffff');
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
      // oben hinausgewandert: ein Stück tiefer wieder einsetzen, so geht der Tauchgang endlos weiter
      if (base < 0 && cam > 1) { k.d += KELP_SPAN; k.h = 0.35 + Math.random() * 0.35; return; }
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
      if (y < -60 && cam > 1) { f.d = cam + 0.62 + Math.random() * 0.5; f.x = f.v > 0 ? -0.1 : 1.1; return; }
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

  return {
    resize: function (w, h, dpr) { W = w; H = h; ctx.canvas.width = Math.round(w * dpr); ctx.canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); },
    burst: function () { burst = 0.9; for (var k = 0; k < 60; k++) spawnBubble(true, true); },
    state: function () { return { cam: cam, crossed: crossed, bubbles: bubbles.length }; },
    /** ein Bild weiter; die Tauchtiefe hängt nur von der Zeit ab (stetig weiter nach unten, nie Stillstand) */
    step: function (now) {
      if (!start) { start = now; last = now; }
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      var t = (now - start) / 1000;
      // erst zügig durch die Oberfläche, danach gleichmäßig weiter in die Tiefe – nie Stillstand, solange geladen wird
      var target = -0.62 + 2.2 * (1 - Math.exp(-t / 1.4)) + 0.3 * t;
      cam += (target - cam) * Math.min(1, dt * 2.2);
      if (!crossed && cam > -0.02) { crossed = true; splash(); }
      if (burst > 0) {
        burst -= dt;
        for (var k = 0; k < 6; k++) spawnBubble(true, Math.random() < 0.7);
      }
      draw(t, dt);
    },
  };
};
