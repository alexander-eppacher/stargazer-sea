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
  var dpr = function () { return Math.min(window.devicePixelRatio || 1, 2); };
  var start = performance.now();

  // Zeichnen: am liebsten im Worker (läuft weiter, auch wenn die Seite gerade rechnet), sonst direkt hier
  var worker = null, scene = null;
  try {
    if (c.transferControlToOffscreen && window.Worker && window.OffscreenCanvas) {
      var off = c.transferControlToOffscreen();
      worker = new Worker('js/intro-worker.js');
      worker.onerror = function () { /* Rückfall unten greift nicht mehr – dann bleibt nur der Hintergrund */ };
      worker.postMessage({ type: 'init', canvas: off, w: innerWidth, h: innerHeight, dpr: dpr() }, [off]);
    }
  } catch (e) { worker = null; }
  if (!worker && window.IntroScene) {
    scene = window.IntroScene(c.getContext('2d'));
    scene.resize(innerWidth, innerHeight, dpr());
    (function frame(now) { if (!c.isConnected) return; scene.step(now); requestAnimationFrame(frame); })(performance.now());
  }
  addEventListener('resize', function () {
    if (worker) worker.postMessage({ type: 'resize', w: innerWidth, h: innerHeight, dpr: dpr() });
    else if (scene) scene.resize(innerWidth, innerHeight, dpr());
  });
  // Ladebildschirm weg → Worker beenden
  var stopWatch = setInterval(function () {
    if (c.isConnected) return;
    clearInterval(stopWatch);
    if (worker) { worker.postMessage({ type: 'stop' }); setTimeout(function () { worker.terminate(); }, 200); }
  }, 300);

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

  /** Fertig geladen: große Blasenwolke über den ganzen Bildschirm. */
  window.__introBurst = function () {
    if (worker) worker.postMessage({ type: 'burst' });
    else if (scene) scene.burst();
  };
  window.__introState = function () { return scene ? scene.state() : { worker: !!worker }; };
})();
