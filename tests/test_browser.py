"""
Browser-Tests mit Playwright (Chromium, Software-Grafik).

Einmalig einrichten:   pip install -r requirements-dev.txt && python -m playwright install chromium
Starten:               python -m unittest discover -s tests -v

Startet selbst einen kleinen Webserver; prüft Laden ohne Fehler, Suche, Karte, Album,
Sorten (gleich wie Python), nur echte Krabben (keine Platzhalter), Gründer, Krabbentag, „Meine Krabbe“,
Stern-Ablauf mit Enthüllung, Wachsen (Kinderstube, Neuheiten-Zahl), „Bewegung reduzieren“,
den Umschalter Deutsch/Englisch und die Touch-Steuerung am Handy.
"""
import functools
import http.server
import json
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None

ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
IGNORE = ("willReadFrequently", "GPU stall", "Automatic fallback", "WebGL", "swiftshader", "GL Driver", "avatars.githubusercontent")
SLOW = 180_000  # Software-Grafik ist langsam


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def real_crabs(n, first="2026-01-01", extra=()):
    """n erfundene echte Krabben (ID > 0), eindeutige Sorten."""
    out = []
    for i in range(1, n + 1):
        out.append({"id": i, "login": f"krabbe{i}", "rarity": "common", "hat": "beanie", "variant": i,
                    "firstStarredAt": f"{first}T00:00:{i:02d}Z", "starred": True})
    out.extend(extra)
    return {"updated": "2026-01-01T00:00:00Z", "crabs": out}


@unittest.skipIf(sync_playwright is None, "Playwright nicht installiert (pip install -r requirements-dev.txt)")
class BrowserTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}/"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(args=ARGS)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def open(self, query="?keineHinweise", crabs=None, ctx=None, skip=True, **kw):
        kw.setdefault("timezone_id", "Europe/Vienna")
        kw.setdefault("locale", "de-DE")
        ctx = ctx or self.browser.new_context(viewport=kw.pop("viewport", {"width": 1280, "height": 720}), **kw)
        self.addCleanup(ctx.close)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and not any(s in m.text for s in IGNORE) and errors.append(m.text))
        if crabs is None:
            crabs = real_crabs(40)  # feste Testdaten statt der echten crabs.json (die ändert sich laufend)
        if crabs is not False:
            state = {"data": crabs}
            page.route("**/crabs.json*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(state["data"])))
            page.crabs_state = state
        page.goto(self.base + query, timeout=SLOW)  # Software-Grafik: mit zwei offenen Seiten kann schon das Laden dauern
        page.wait_for_selector("html[data-bereit='1']", state="attached", timeout=SLOW)
        if skip:
            page.evaluate("__sea.skip()")
        return page, errors

    # ---------- Grundfunktionen ----------
    def test_loads_without_errors(self):
        page, errors = self.open()
        self.assertGreaterEqual(page.evaluate("__sea.crabs.size"), 30)
        page.wait_for_timeout(1500)
        self.assertEqual(errors, [])

    def test_variants_match_python(self):
        page, _ = self.open()
        vec = json.loads((ROOT / "tests" / "variants_vectors.json").read_text("utf-8"))["vectors"]
        got = page.evaluate("""async (vec) => {
            const m = await import('./js/variants.js');
            const tiers = (await (await fetch('data/rarities.json')).json()).tiers;
            const out = {};
            for (const t of tiers) out[t.id] = vec[t.id].map((e) => { const d = m.decodeVariant(t, e.v); return { v: e.v, hat: d.hat, shell: d.shell, pattern: d.pattern, hue: d.hue, edition: d.edition }; });
            return out;
        }""", vec)
        self.assertEqual(got, vec)

    def test_search_card_album(self):
        page, errors = self.open()
        login = page.evaluate("[...__sea.crabs.values()][3].data.login")
        page.fill("#search", login[:6])
        page.keyboard.press("Enter")
        page.wait_for_selector("#card:not(.hidden)", timeout=SLOW)
        self.assertIn(login[:6], page.text_content("#card-login"))
        page.click("#card-share")
        page.wait_for_selector("#tcard canvas", timeout=SLOW)
        page.evaluate("__sea.closeTradingCard()")
        page.click("#album-btn")
        page.wait_for_selector("#album .al-progress li", timeout=SLOW)
        self.assertEqual(page.locator("#album .al-progress li").count(), 6)
        self.assertEqual(errors, [])

    def test_settings(self):
        page, errors = self.open()
        page.click("#settings-btn")
        page.wait_for_selector("#settings:not(.hidden)")
        # Schalter unter „Mehr“: Seltenheiten ausblenden, wird gemerkt
        page.click("#settings-more")
        page.click("#settings label.row:has([data-set='legend'])")
        page.click("#settings-back")
        self.assertFalse(page.is_visible("#legend"))
        # Qualität fest auf Niedrig: Stufe 3, Auto misst nicht mehr
        page.click("[data-set='quality'] [data-v='low']")
        self.assertEqual(page.evaluate("__sea.quality.level"), 3)
        self.assertEqual(page.get_attribute("[data-set='quality'] [data-v='low']", "aria-checked"), "true")
        page.click("[data-set='theme'] [data-v='dark']")
        self.assertEqual(page.evaluate("document.documentElement.dataset.theme"), "dark")
        saved = page.evaluate("JSON.parse(localStorage.getItem('stargazer.einstellungen'))")
        self.assertEqual(saved, {"legend": False, "quality": "low", "theme": "dark"})
        # Escape: erst zurück von „Mehr“, dann zu
        page.click("#settings-more")
        page.keyboard.press("Escape")
        self.assertTrue(page.is_visible("#settings-more"))
        page.keyboard.press("Escape")
        page.wait_for_selector("#settings", state="hidden")
        # Neu laden: Werte bleiben
        page.reload()
        page.wait_for_selector("html[data-bereit='1']", state="attached", timeout=SLOW)
        self.assertEqual(page.evaluate("__sea.quality.level"), 3)
        self.assertEqual(page.evaluate("document.documentElement.dataset.theme"), "dark")
        self.assertFalse(page.is_visible("#legend"))
        # Zurücksetzen
        page.evaluate("__sea.skip()")
        page.click("#settings-btn")
        page.click("#settings-more")
        page.click("#settings-reset")
        self.assertEqual(page.evaluate("__sea.quality.level"), 0)
        self.assertEqual(page.evaluate("localStorage.getItem('stargazer.einstellungen')"), "{}")
        self.assertIsNone(page.evaluate("document.documentElement.dataset.theme"))
        self.assertEqual(errors, [])

    def test_language_switch(self):
        # Englischer Browser -> englische Seite
        page, errors = self.open(locale="en-US")
        self.assertEqual(page.evaluate("document.documentElement.lang"), "en")
        self.assertEqual(page.text_content(".star-label"), "Every star becomes a crab")
        self.assertIn("Common", page.text_content("#legend-list"))
        self.assertEqual(page.get_attribute("[data-lang='en']", "aria-pressed"), "true")
        self.assertEqual(page.evaluate("""async () => {
            const g = await import('./js/growth.js');
            return [g.untilText(26 * 3600e3), g.untilText(1000), g.STAGES[2].name].map((x) => x.replaceAll('\\u00a0', ' '));
        }"""), ["in 1 day 2 h", "soon", "Teen"])
        page.click("#album-btn")
        page.wait_for_selector("#album .al-progress li", timeout=SLOW)
        self.assertEqual(page.text_content("#album h2"), "Collector’s album")
        page.evaluate("__sea.closeAlbum()")
        # Umschalten auf Deutsch (in den Einstellungen): wird gemerkt
        page.click("#settings-btn")
        page.click("[data-lang='de']")
        page.wait_for_url("**lang=de*", timeout=SLOW)
        page.wait_for_selector("html[data-bereit='1']", state="attached", timeout=SLOW)
        self.assertEqual(page.evaluate("document.documentElement.lang"), "de")
        self.assertEqual(page.text_content(".star-label"), "Jeder Stern wird zur Krabbe")
        self.assertIn("Gewöhnlich", page.text_content("#legend-list"))
        self.assertEqual(page.evaluate("localStorage.getItem('stargazer.sprache')"), "de")
        self.assertEqual(errors, [])

    def test_reduced_motion(self):
        page, _ = self.open(reduced_motion="reduce")
        self.assertTrue(page.evaluate("__sea.reduced"))
        self.assertEqual(page.locator(".intro-canvas").count(), 0)

    def test_intro_min_duration(self):
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 720}, timezone_id="Europe/Vienna", locale="de-DE")
        page, _ = self.open(ctx=ctx)
        self.assertEqual(page.evaluate("window.__introMin"), 3000, "erster Besuch: 3 s")
        page.close()  # Software-Grafik: zwei Meere gleichzeitig bremsen sich gegenseitig stark aus (der Speicher bleibt)
        page2 = ctx.new_page()
        page2.goto(self.base + "?keineHinweise", timeout=SLOW)
        self.assertEqual(page2.evaluate("window.__introMin"), 1200, "danach: 1,2 s")
        page2.keyboard.press("Space")
        self.assertTrue(page2.evaluate("window.__introSkipped"))

    # ---------- Neue Funktionen ----------
    def test_only_real_crabs(self):
        """Keine Platzhalter: nur echte Krabben im Meer; ohne Sterne ein kurzer Hinweis."""
        page, errors = self.open(crabs=real_crabs(5))
        page.wait_for_timeout(500)
        self.assertEqual(page.evaluate("__sea.crabs.size"), 5)
        self.assertEqual(page.text_content("#crab-count"), "5")
        self.assertTrue(page.evaluate("document.getElementById('demo-banner').classList.contains('hidden')"))
        page.context.close()  # Software-Grafik: zwei Meere gleichzeitig bremsen sich gegenseitig stark aus
        empty, errors2 = self.open(crabs={"updated": "2026-01-01T00:00:00Z", "crabs": []})
        empty.wait_for_timeout(500)
        self.assertEqual(empty.evaluate("__sea.crabs.size"), 0)
        self.assertFalse(empty.evaluate("document.getElementById('demo-banner').classList.contains('hidden')"))
        self.assertEqual(errors + errors2, [])

    def test_founders_and_birthday(self):
        page, _ = self.open("?keineHinweise&datum=2027-01-01", crabs=real_crabs(3))
        self.assertEqual(page.evaluate("[...__sea.crabs.values()].filter(c => c.data.founder).length"), 3)
        self.assertEqual(page.evaluate("[...__sea.crabs.values()].filter(c => c.balloon?.visible).length"), 3)
        page.evaluate("__sea.focusCrab(__sea.crabs.get(1))")
        page.wait_for_selector("#card:not(.hidden)", timeout=SLOW)
        self.assertIn("Gründer", page.text_content("#card-number"))
        self.assertIn("Krabbentag", page.text_content("#card-since"))

    def test_mine_is_remembered(self):
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 720}, timezone_id="Europe/Vienna", locale="de-DE")
        page, _ = self.open(crabs=real_crabs(4), ctx=ctx)
        page.evaluate("__sea.setMine(2)")
        self.assertIn("mine", page.get_attribute("#star-btn", "class"))
        page.reload()
        page.wait_for_selector("html[data-bereit='1']", state="attached", timeout=SLOW)
        self.assertEqual(page.evaluate("__sea.mineCrab()?.data.id"), 2)
        self.assertEqual(page.text_content("#star-btn .star-label"), "Meine Krabbe")

    def test_keyboard_pan(self):
        """WASD/Pfeiltasten schieben Kamera und Blickpunkt über die Insel; im Suchfeld nicht."""
        page, errors = self.open(crabs=real_crabs(4))
        page.wait_for_timeout(1500)  # Tauchflug starten lassen, dann überspringen
        page.evaluate("__sea.skip(); __sea.controls.autoRotate = false; window.__f = 0; (function f() { __f++; requestAnimationFrame(f); })()")
        page.wait_for_function("!__sea.fly")
        frames = lambda n: page.wait_for_function(f"__f >= {page.evaluate('__f') + n}", timeout=SLOW)  # Software-Grafik: in Bildern warten
        frames(4)
        pos = "(() => { const t = __sea.controls.target, c = __sea.camera.position; return [t.x, t.z, c.x - t.x, c.z - t.z]; })()"
        moved_from = lambda p: f"(() => {{ const t = __sea.controls.target; return Math.hypot(t.x - {p[0]}, t.z - {p[1]}) > 0.5; }})()"

        before = page.evaluate(pos)
        page.keyboard.down("w"); page.wait_for_function(moved_from(before), timeout=SLOW); page.keyboard.up("w"); frames(8)
        after = page.evaluate(pos)
        fwd = (-before[2], -before[3])  # Blickrichtung (Kamera → Ziel)
        moved = (after[0] - before[0], after[1] - before[1])
        self.assertGreater(moved[0] * fwd[0] + moved[1] * fwd[1], 0, (before, after))
        self.assertAlmostEqual(after[2], before[2], delta=0.05, msg=(before, after))  # Kamera fährt mit, Blickwinkel bleibt

        # seitlich mit Pfeil rechts: überwiegend quer zur Blickrichtung
        page.keyboard.down("ArrowRight"); page.wait_for_function(moved_from(after), timeout=SLOW); page.keyboard.up("ArrowRight"); frames(8)
        side = page.evaluate(pos)
        mv, f2 = (side[0] - after[0], side[1] - after[1]), (-after[2], -after[3])
        n_mv, n_f = (mv[0] ** 2 + mv[1] ** 2) ** 0.5, (f2[0] ** 2 + f2[1] ** 2) ** 0.5
        self.assertLess(abs(mv[0] * f2[0] + mv[1] * f2[1]) / (n_mv * n_f), 0.3, (after, side))

        # Tippen im Suchfeld bewegt nichts
        page.click("#search"); page.keyboard.type("wasd"); frames(4)
        typed = page.evaluate(pos)
        self.assertAlmostEqual(typed[0], side[0], delta=1e-3)
        self.assertAlmostEqual(typed[1], side[1], delta=1e-3)
        self.assertEqual(errors, [])

    def test_find_me_by_name(self):
        """„Bist du schon im Meer?“: nur den Namen fragen; unbekannt → Schritte zum Stern zeigen."""
        page, errors = self.open(crabs=real_crabs(4))
        page.click("#find-me")
        page.wait_for_selector("#join.find:not(.hidden)")
        self.assertEqual(page.text_content("#join-title"), "Bist du schon im Meer?")
        self.assertFalse(page.is_visible("#join-star"))  # kein Stern-Schritt
        # noch nicht im Meer → Stern-Schritte erscheinen, Name bleibt stehen, kein Warten
        page.fill("#join-name", "@niemand")
        page.click("#join-form button")
        self.assertTrue(page.is_visible("#join-star"))
        self.assertEqual(page.input_value("#join-name"), "niemand")
        self.assertIn("noch nicht im Meer", page.text_content("#join-msg"))
        self.assertIsNone(page.evaluate("__sea.waitFor"))
        page.click(".join-close")
        # vorhanden → gemerkt, Knopf verschwindet
        page.click("#find-me")
        page.fill("#join-name", "Krabbe3")
        page.click("#join-form button")
        page.wait_for_selector("#join", state="hidden")
        self.assertEqual(page.evaluate("__sea.mineCrab()?.data.id"), 3)
        self.assertFalse(page.is_visible("#find-me"))
        page.wait_for_selector("#card:not(.hidden)", timeout=SLOW)
        self.assertIn("Nicht meine Krabbe", page.text_content("#card-mine"))
        self.assertEqual(errors, [])

    def test_star_flow_and_reveal(self):
        page, errors = self.open(crabs=real_crabs(5))
        page.click("#star-btn")
        page.wait_for_selector("#join:not(.hidden)")
        page.fill("#join-name", "@Neue-Krabbe")
        page.click("#join-form button")
        self.assertEqual(page.evaluate("__sea.waitFor.name"), "Neue-Krabbe")
        page.wait_for_selector("#wait-chip:not(.hidden)")
        # Stern kommt an (wie nach dem Lauf der Action)
        page.crabs_state["data"] = real_crabs(5, extra=[{"id": 777, "login": "neue-krabbe", "rarity": "epic", "hat": "wizard",
                                                         "variant": 3, "firstStarredAt": "2026-02-01T00:00:00Z", "starred": True}])
        page.evaluate("__sea.sync(false)")
        page.wait_for_function("!__sea.waitFor", timeout=SLOW)
        self.assertEqual(page.evaluate("__sea.mineCrab()?.data.id"), 777)
        page.wait_for_selector("#reveal:not(.hidden)", timeout=SLOW)
        self.assertIn("EPISCH", page.text_content("#reveal"))
        page.wait_for_selector("#card:not(.hidden)", timeout=SLOW)
        self.assertEqual(errors, [])

    def test_growth_and_nursery(self):
        """Babys sind klein und tragen Eierschale; Hut und Sorte bleiben eingepackt, auch im Album."""
        now = datetime.now(timezone.utc)
        data = real_crabs(4)
        for c, hours in zip(data["crabs"], (5, 30, 50, 100)):
            c["firstStarredAt"] = (now - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
        page, errors = self.open(crabs=data)
        stages = page.evaluate("[1, 2, 3, 4].map((id) => [__sea.crabs.get(id).stage, __sea.crabs.get(id).locked])")
        self.assertEqual(stages, [[0, True], [1, True], [2, False], [3, False]])
        self.assertLess(page.evaluate("__sea.crabs.get(1).root.scale.x"), page.evaluate("__sea.crabs.get(4).root.scale.x"))
        page.evaluate("__sea.focusCrab(__sea.crabs.get(1))")
        page.wait_for_selector("#card:not(.hidden)")
        self.assertEqual(page.locator("#card-hat svg.ic-lock").count(), 1)  # Schloss-Icon statt Emoji
        self.assertIn("eingepackt", page.text_content("#card-variant"))
        self.assertIn("Baby", page.text_content("#card-grow"))
        page.evaluate("__sea.focusCrab(null)")
        # Album: Babys liegen eingepackt in der Kinderstube, nicht auf ihrem Sorten-Platz
        page.click("#album-btn")
        page.wait_for_selector("#album .al-nursery-link")
        shown = page.evaluate("[...__sea.albumOpen().byTier.values()].flatMap((m) => [...m.values()]).map((d) => d.id).sort()")
        self.assertEqual(shown, [3, 4])
        page.click("#album .al-nursery-link")
        page.wait_for_function("document.querySelectorAll('#album .al-slot.pack').length === 2", timeout=SLOW)
        page.evaluate("__sea.closeAlbum()")
        self.assertTrue(page.evaluate("document.getElementById('album-badge').classList.contains('hidden')"))
        # 20 Stunden später: 1 ist gewachsen, 2 ist ausgepackt -> 2 Neuheiten am Buch
        page.evaluate("__sea.skipTime(20)")
        stages = page.evaluate("[1, 2].map((id) => [__sea.crabs.get(id).stage, __sea.crabs.get(id).locked])")
        self.assertEqual(stages, [[1, True], [2, False]])
        self.assertEqual(page.text_content("#album-badge"), "2")
        self.assertEqual(errors, [])

    def test_sealed_crab_unpacks(self):
        """Versiegelt (Hut nur verschlüsselt in crabs.json): bleibt eingepackt, bis die Action entsiegelt."""
        start = (datetime.now(timezone.utc) - timedelta(hours=50)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sealed = {"id": 50, "login": "geheim", "rarity": "epic", "shell": 4, "pattern": 1, "hue": 3,
                  "sealed": "abc", "firstStarredAt": start, "starred": True}
        page, errors = self.open(crabs=real_crabs(4, extra=[sealed]))
        self.assertEqual(page.evaluate("[__sea.crabs.get(50).locked, __sea.crabs.get(50).look.shell]"), [True, 4])
        page.evaluate("__sea.focusCrab(__sea.crabs.get(50))")
        page.wait_for_selector("#card:not(.hidden)")
        self.assertIn("gleich", page.text_content("#card-hat"))
        # Die Action hat entsiegelt: Sorte steht jetzt offen in crabs.json
        opened = {k: v for k, v in sealed.items() if k not in ("sealed", "shell", "pattern", "hue")}
        opened.update(variant=250, hat="wizard")  # Nr. 250 = Zauberhut, Blau, Punkte, Farbton 3
        page.crabs_state["data"] = real_crabs(4, extra=[opened])
        page.evaluate("__sea.sync(false)")
        page.wait_for_function("!__sea.crabs.get(50).locked", timeout=SLOW)
        self.assertIn("Zauberhut", page.text_content("#card-hat"))
        self.assertEqual(errors, [])

    def test_waiting_survives_reload(self):
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 720}, timezone_id="Europe/Vienna", locale="de-DE")
        page, _ = self.open(crabs=real_crabs(5), ctx=ctx)
        page.evaluate("__sea.startWaiting('spaeter')")
        page.reload()
        page.wait_for_selector("html[data-bereit='1']", state="attached", timeout=SLOW)
        self.assertEqual(page.evaluate("__sea.waitFor?.name"), "spaeter")
        self.assertTrue(page.is_visible("#wait-chip"))

    def test_first_visit_hints(self):
        page, _ = self.open("", crabs=real_crabs(5), skip=False)
        page.wait_for_function("__sea.coachStep >= 0 || localStorage.getItem('stargazer.hinweiseGesehen')", timeout=SLOW)
        self.assertTrue(page.is_visible("#coach"))

    def test_mobile_layout(self):
        page, errors = self.open(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True)
        self.assertFalse(page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        self.assertEqual(errors, [])

    # ---------- Touch-Steuerung am Handy ----------
    PHONE = dict(viewport={"width": 390, "height": 760}, is_mobile=True, has_touch=True, device_scale_factor=2)

    def phone(self, query="?keineHinweise"):
        page, errors = self.open(query, crabs=real_crabs(12), **self.PHONE)
        def frames(n=3):
            """warten, bis n Bilder gezeichnet sind (Software-Grafik: ein Bild kann über eine Sekunde dauern)"""
            page.evaluate("""(n) => new Promise((r) => { const f = __sea.renderer.info.render.frame;
                const chk = () => (__sea.renderer.info.render.frame > f + n ? r() : setTimeout(chk, 30)); chk(); })""", n)
        frames()  # Bildablauf startet erst nach der Mindestdauer des Tauchgangs
        page.evaluate("""() => { window.__tlog = []; for (const t of ['pointerdown', 'pointerup', 'pointercancel'])
            __sea.renderer.domElement.addEventListener(t, (e) => __tlog.push(t + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY)
              + ' ' + document.elementFromPoint(e.clientX, e.clientY)?.id)); }""")
        cdp = page.context.new_cdp_session(page)

        # eigene Uhr für die Berührungen: Software-Grafik ist so langsam, dass echte Abstände nicht stimmen
        clock = [time.time()]

        def touch(kind, pts, ms=16):
            if pts and not isinstance(pts[0], (list, tuple)):
                pts = [pts]  # ein Finger
            clock[0] += ms / 1000
            if kind == "touchStart" and ms >= 300:
                clock[0] = max(clock[0], time.time())  # neue Berührung: an die echte Zeit anschließen
            cdp.send("Input.dispatchTouchEvent", {"type": kind, "timestamp": clock[0],
                                                  "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})

        def gesture(path, steps=12, hold=150, settle=400):
            """path(f) → Fingerpositionen bei f = 0…1. hold = ruhig halten vor dem Loslassen (kein Ausgleiten)."""
            for attempt in range(3):
                n0 = page.evaluate("__tlog.length")
                touch("touchStart", path(0), ms=400)
                try:
                    # Software-Grafik: manchmal kommt die allererste Berührung gar nicht an (kein pointerdown) –
                    # dann abbrechen und noch einmal ansetzen; das prüft die Zustellung, nicht die Steuerung
                    page.wait_for_function(f"__tlog.length > {n0}", timeout=4000)
                    break
                except Exception:
                    touch("touchCancel", [], ms=16)
            for k in range(1, steps + 1):
                touch("touchMove", path(k / steps))
                if k == 1:
                    # Richtung festlegen lassen, bevor weitere Bewegungen kommen – bei sehr langsamen
                    # Bildern fasst der Browser sonst die ersten Bewegungen zusammen (Weg geht verloren)
                    frames(1)
                page.wait_for_timeout(16)
            page.wait_for_timeout(hold)
            touch("touchEnd", [], ms=16 + hold)
            if settle:
                frames()

        def tap(x, y, gap=400):
            touch("touchStart", [(x, y)], ms=gap)
            touch("touchEnd", [], ms=60)

        page.touch, page.gesture, page.tap, page.wait_frames = touch, gesture, tap, frames
        return page, errors

    @staticmethod
    def cam(page):
        return page.evaluate("""(() => { const c = __sea.camera.position, t = __sea.controls.target, o = c.clone().sub(t);
            return { th: Math.atan2(o.x, o.z), phi: Math.acos(o.y / o.length()), r: o.length(), tx: t.x, tz: t.z,
                     sel: __sea.selected ? __sea.selected.data.login : null }; })()""")

    @staticmethod
    def home(page, r=None):
        page.wait_for_function("!__sea.fly", timeout=30000)  # Software-Grafik: Flüge dauern hier viele Sekunden
        page.evaluate("""(r) => { __sea.controls.target.set(0, 1.4, 0);
            const p = new __sea.camera.position.constructor(0, 11, 34); if (r) p.setLength(r); __sea.camera.position.copy(p); }""", r)
        page.wait_frames()

    def test_touch_one_finger(self):
        page, errors = self.phone()
        self.assertIn("Wischen", page.inner_text("#hint"))
        self.home(page)
        a = self.cam(page)
        # leicht schräg wischen → nur drehen, 180° pro 390 px (abzüglich der 10 px Schwelle)
        page.gesture(lambda f: (100 + 160 * f, 400 + 40 * f))
        b = self.cam(page)
        self.assertAlmostEqual(b["phi"], a["phi"], places=3)
        turn = abs(b["th"] - a["th"])
        self.assertTrue(1.0 < turn < 1.35, (turn, page.evaluate("[__tlog, __sea.controls.enabled, !!__sea.fly, (() => { const e = document.elementFromPoint(100, 400); return e && (e.id || e.className || e.tagName); })()]")))
        # senkrecht wischen → nur neigen
        page.gesture(lambda f: (200, 250 + 120 * f))
        c = self.cam(page)
        self.assertAlmostEqual(c["th"], b["th"], places=3)
        self.assertLess(c["phi"], b["phi"] - 0.1)
        # schnell wischen und sofort loslassen → gleitet nach
        page.gesture(lambda f: (80 + 200 * f, 400), steps=6, hold=0, settle=0)
        page.wait_frames(1)
        g1 = self.cam(page)["th"]
        page.wait_frames(3)
        self.assertGreater(abs(self.cam(page)["th"] - g1), 0.02)
        # Neigung merken: steil von oben, weit raus (Wasseroberfläche begrenzt), wieder rein → wie vorher
        self.home(page, r=9)
        page.gesture(lambda f: (200, 150 + 400 * f))
        steep = self.cam(page)
        page.gesture(lambda f: [(120 + 60 * f, 380), (270 - 60 * f, 380)])  # zusammen → raus (150 → 30 px)
        far = self.cam(page)
        self.assertGreater(far["r"], steep["r"] * 3)  # (Kamera bleibt innerhalb des Meeres, daher nicht ganz ×4)
        self.assertGreater(far["phi"], steep["phi"] + 0.1)
        page.gesture(lambda f: [(180 - 60 * f, 380), (210 + 60 * f, 380)])  # auseinander → rein (30 → 150 px)
        back = self.cam(page)
        self.assertAlmostEqual(back["phi"], steep["phi"], delta=0.02)
        self.assertEqual(errors, [])

    def test_touch_two_fingers_and_taps(self):
        page, errors = self.phone("?keineHinweise&tempo=1.25")
        self.home(page)
        a = self.cam(page)
        # Tempo-Schalter wirkt auf das Drehen
        page.gesture(lambda f: (100 + 160 * f, 400))
        turn = abs(self.cam(page)["th"] - a["th"])
        self.assertTrue(1.3 < turn < 1.65, turn)
        self.home(page)
        a = self.cam(page)
        # zusammen ziehen ≤ 12 px Mittelpunkt-Bewegung: nur zoomen, nicht verschieben, kein Tippen
        page.gesture(lambda f: [(150 + 30 * f, 380 + 8 * f), (250 - 30 * f, 380 + 8 * f)])
        b = self.cam(page)
        self.assertGreater(b["r"], a["r"] * 1.3)
        self.assertAlmostEqual(b["tx"], a["tx"], places=3)
        self.assertAlmostEqual(b["tz"], a["tz"], places=3)
        self.assertIsNone(b["sel"])
        # zwei Finger gemeinsam nach unten ziehen → Blickpunkt rückt vor (flach)
        page.gesture(lambda f: [(150, 300 + 150 * f), (250, 300 + 150 * f)])
        c = self.cam(page)
        self.assertLess(c["tz"], b["tz"] - 1)
        self.assertAlmostEqual(c["th"], b["th"], places=3)
        # Knopf „Startansicht“ sichtbar → zurück
        page.wait_for_selector("#home-btn:not(.hidden)", timeout=5000)
        page.click("#home-btn")
        page.wait_for_function("!__sea.fly && document.getElementById('home-btn').classList.contains('hidden')", timeout=10000)
        # Startansicht: Kamera (0, 15.5, 40), Blickpunkt (0, 2.5, -3) → Abstand √(13² + 43²) ≈ 44,9
        self.assertAlmostEqual(self.cam(page)["r"], (13 ** 2 + 43 ** 2) ** 0.5, delta=1)
        # knapp neben eine Krabbe tippen (20 px) → ausgewählt
        xy = page.evaluate("""(() => { const v = new __sea.camera.position.constructor();
            for (const c of __sea.crabs.values()) { c.worldPos(v).y += 0.35 * c.growScale; v.project(__sea.camera);
              if (v.z < 1 && Math.abs(v.x) < 0.5 && Math.abs(v.y) < 0.5) return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; } })()""")
        self.assertIsNotNone(xy)
        page.tap(xy[0] + 20, xy[1])
        page.wait_for_function("__sea.selected", timeout=5000)
        page.click("#card .card-close")
        page.wait_for_timeout(2000)
        # Doppeltippen auf freien Boden → hinfliegen, Abstand halbiert
        self.home(page)
        r0 = self.cam(page)["r"]
        y = page.evaluate("document.getElementById('hud-actions').getBoundingClientRect().top") - 60  # freier Boden über der Leiste unten
        page.tap(195, y)
        page.tap(198, y + 2, gap=120)
        page.wait_for_timeout(300)
        page.wait_for_function("!__sea.fly", timeout=30000)
        self.assertAlmostEqual(self.cam(page)["r"], r0 / 2, delta=1.5)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
