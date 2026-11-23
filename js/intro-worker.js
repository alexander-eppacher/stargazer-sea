/* Lade-Animation im eigenen Faden: zeichnet auf die übergebene OffscreenCanvas (siehe intro-draw.js). */
importScripts('intro-draw.js');
var scene = null, running = false;
var raf = self.requestAnimationFrame ? function (f) { self.requestAnimationFrame(f); } : function (f) { setTimeout(function () { f(performance.now()); }, 16); };
var lastDraw = 0;
// höchstens ~30 Bilder pro Sekunde: reicht für die Animation und lässt der Seite beim Laden mehr Rechenzeit
function loop(now) { if (!running) return; if (now - lastDraw >= 30) { lastDraw = now; scene.step(now); } raf(loop); }
self.onmessage = function (e) {
  var m = e.data;
  if (m.type === 'init') { scene = self.IntroScene(m.canvas.getContext('2d')); scene.resize(m.w, m.h, m.dpr); running = true; raf(loop); }
  else if (m.type === 'resize' && scene) scene.resize(m.w, m.h, m.dpr);
  else if (m.type === 'burst' && scene) scene.burst();
  else if (m.type === 'stop') { running = false; self.close(); }
};
