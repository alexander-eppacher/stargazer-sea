"""
Tests für scripts/sync_stargazers.py – ohne Netz: Die GitHub-Antworten werden vorgetäuscht.

Starten:  python -m unittest discover -s tests -v
"""
import collections
import importlib.util
import io
import json
import os
import random
import shutil
import tempfile
import unittest
from datetime import datetime
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent


def load_sync():
    spec = importlib.util.spec_from_file_location("sync_stargazers", ROOT / "scripts" / "sync_stargazers.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def gazers(ids, login=lambda i: f"user{i}"):
    return [{"user": {"id": i, "login": login(i)}, "starred_at": f"2026-01-{1 + i % 28:02d}T00:{i % 60:02d}:00Z"} for i in ids]


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.mod = load_sync()
        self.mod.rng = random.Random(42)  # gleiche Würfel bei jedem Testlauf
        self.tmp = Path(tempfile.mkdtemp())
        self.mod.CRABS_FILE = self.tmp / "crabs.json"
        self.mod.CRABS_FILE.write_text('{ "updated": null, "crabs": [] }\n', "utf-8")
        self.env = mock.patch.dict(os.environ, {"GITHUB_REPOSITORY": "test/test", "FORCE": "0"})
        self.env.start()
        self.tiers = json.loads((ROOT / "data" / "rarities.json").read_text("utf-8"))["tiers"]

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.tmp)

    def run_sync(self, stargazers=None, error=None):
        def fake(repo, token):
            if error:
                raise error
            return stargazers

        self.mod.fetch_stargazers = fake
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            try:
                code = self.mod.main()
            except Exception as e:  # noqa: BLE001 – so verhält sich auch die Action (Lauf schlägt fehl)
                code = e
        return code, out.getvalue() + err.getvalue()

    def crabs(self):
        return {c["id"]: c for c in json.loads(self.mod.CRABS_FILE.read_text("utf-8"))["crabs"]}

    # ---------- Grundregeln ----------
    def test_unique_and_stable(self):
        code, _ = self.run_sync(gazers(range(1, 1201)))
        self.assertEqual(code, 0)
        first = self.crabs()
        self.assertEqual(len(first), 1200)
        keys = [(c["rarity"], c["variant"]) for c in first.values()]
        self.assertEqual(len(keys), len(set(keys)), "keine doppelte Nummer")
        # zweiter Lauf: nichts ändert sich, Datei bleibt gleich
        before = self.mod.CRABS_FILE.read_text("utf-8")
        code, out = self.run_sync(gazers(range(1, 1201)))
        self.assertEqual(code, 0)
        self.assertIn("Keine Änderungen", out)
        self.assertEqual(before, self.mod.CRABS_FILE.read_text("utf-8"))

    def test_unstar_and_return(self):
        self.run_sync(gazers(range(1, 51)))
        look = {i: (c["rarity"], c["variant"], c["hat"]) for i, c in self.crabs().items()}
        # 7 nimmt den Stern weg, 99 kommt neu dazu, 3 benennt sich um
        self.run_sync(gazers([i for i in range(1, 51) if i != 7] + [99], login=lambda i: "neu3" if i == 3 else f"user{i}"))
        c = self.crabs()
        self.assertFalse(c[7]["starred"])
        self.assertEqual(c[7]["login"], "", "Name wird geleert")
        self.assertEqual(c[3]["login"], "neu3")
        self.assertIn(99, c)
        # 7 gibt den Stern wieder: dieselbe Krabbe kommt zurück
        self.run_sync(gazers(list(range(1, 51)) + [99]))
        c = self.crabs()
        self.assertTrue(c[7]["starred"])
        self.assertEqual(c[7]["login"], "user7")
        for i, v in look.items():
            self.assertEqual((c[i]["rarity"], c[i]["variant"], c[i]["hat"]), v)

    # ---------- Sicherheitsnetz ----------
    def test_api_error_keeps_file(self):
        self.run_sync(gazers(range(1, 31)))
        before = self.mod.CRABS_FILE.read_text("utf-8")
        code, _ = self.run_sync(error=OSError("Seite 2 kaputt"))
        self.assertNotEqual(code, 0)
        self.assertEqual(before, self.mod.CRABS_FILE.read_text("utf-8"))

    def test_emergency_brake(self):
        self.run_sync(gazers(range(1, 101)))
        before = self.mod.CRABS_FILE.read_text("utf-8")
        code, out = self.run_sync(gazers(range(1, 11)))
        self.assertEqual(code, 1)
        self.assertIn("Abbruch", out)
        self.assertEqual(before, self.mod.CRABS_FILE.read_text("utf-8"))
        # mit force geht es
        with mock.patch.dict(os.environ, {"FORCE": "1"}):
            code, _ = self.run_sync(gazers(range(1, 11)))
        self.assertEqual(code, 0)
        self.assertEqual(sum(c["starred"] for c in self.crabs().values()), 10)

    def test_self_check_blocks_tampering(self):
        self.run_sync(gazers(range(1, 21)))
        data = json.loads(self.mod.CRABS_FILE.read_text("utf-8"))
        a, b = data["crabs"][0], data["crabs"][1]
        b["rarity"], b["variant"] = a["rarity"], a["variant"]  # doppelte Nummer
        self.mod.CRABS_FILE.write_text(json.dumps(data), "utf-8")
        code, out = self.run_sync(gazers(range(1, 22)))
        self.assertEqual(code, 1)
        self.assertIn("Selbstprüfung", out)

    # ---------- Versiegeln (Hut geheim bis halbstark) ----------
    def at(self, iso):
        """Uhr der Action auf einen festen Zeitpunkt stellen."""
        self.mod.now_utc = lambda: datetime.fromisoformat(iso.replace("Z", "+00:00"))

    def test_young_crabs_are_sealed(self):
        young = [{"user": {"id": i, "login": f"user{i}"}, "starred_at": "2026-03-01T12:00:00Z"} for i in range(1, 41)]
        with mock.patch.dict(os.environ, {"KRABBEN_SCHLUESSEL": "test-geheim"}):
            self.at("2026-03-02T12:00:00Z")  # 24 Std. alt
            code, out = self.run_sync(young)
            self.assertEqual(code, 0)
            raw = self.mod.CRABS_FILE.read_text("utf-8")
            for c in self.crabs().values():
                self.assertNotIn("hat", c)
                self.assertNotIn("variant", c)
                self.assertTrue(c["sealed"])
                self.assertEqual({"shell", "pattern", "hue"} <= set(c), True)
            hats = {h["id"] for t in self.tiers for h in t["hats"]} - {"none"}
            self.assertFalse([h for h in hats if f'"{h}"' in raw or f"-> {h}" in out], "kein Hut in Datei oder Log")
            # nächster Lauf: gleiche Datei (Siegel wird nicht neu gewürfelt)
            code, out = self.run_sync(young)
            self.assertIn("Keine Änderungen", out)
            self.assertEqual(raw, self.mod.CRABS_FILE.read_text("utf-8"))
            sealed = self.crabs()
            # nach 48 Std.: ausgepackt, Nummer passt zum Siegel und zum Aussehen
            self.at("2026-03-03T12:00:01Z")
            code, out = self.run_sync(young)
            self.assertEqual(code, 0)
            self.assertIn("Ausgepackt", out)
            keys = self.mod.seal_keys("test-geheim")
            tier_by_id = {t["id"]: t for t in self.tiers}
            pairs = set()
            for i, c in self.crabs().items():
                self.assertNotIn("sealed", c)
                self.assertEqual(c["variant"], self.mod.unseal(keys, sealed[i]))
                hat, shell, pattern, hue = self.mod.decode_variant(tier_by_id[c["rarity"]], c["variant"])
                self.assertEqual((c["hat"], shell, pattern, hue), (hat, sealed[i]["shell"], sealed[i]["pattern"], sealed[i]["hue"]))
                pairs.add((c["rarity"], c["variant"]))
            self.assertEqual(len(pairs), 40, "keine doppelte Nummer")

    def test_sealed_needs_right_key(self):
        young = [{"user": {"id": i, "login": f"user{i}"}, "starred_at": "2026-03-01T12:00:00Z"} for i in range(1, 6)]
        self.at("2026-03-01T13:00:00Z")
        with mock.patch.dict(os.environ, {"KRABBEN_SCHLUESSEL": "richtig"}):
            self.run_sync(young)
        before = self.mod.CRABS_FILE.read_text("utf-8")
        code, out = self.run_sync(young)  # ohne Schlüssel
        self.assertEqual(code, 1)
        self.assertIn("KRABBEN_SCHLUESSEL fehlt", out)
        with mock.patch.dict(os.environ, {"KRABBEN_SCHLUESSEL": "falsch"}):
            code, out = self.run_sync(young)
        self.assertEqual(code, 1)
        self.assertIn("passt nicht", out)
        # Siegel auf eine andere Seltenheit umschreiben fällt auf
        data = json.loads(before)
        data["crabs"][0]["rarity"] = "mythic" if data["crabs"][0]["rarity"] != "mythic" else "common"
        self.mod.CRABS_FILE.write_text(json.dumps(data), "utf-8")
        with mock.patch.dict(os.environ, {"KRABBEN_SCHLUESSEL": "richtig"}):
            code, out = self.run_sync(young)
        self.assertEqual(code, 1)
        self.mod.CRABS_FILE.write_text(before, "utf-8")
        self.assertEqual(before, self.mod.CRABS_FILE.read_text("utf-8"))

    # ---------- Auflagen ----------
    def test_editions_keep_chances(self):
        code, _ = self.run_sync(gazers(range(1, 6001)))
        self.assertEqual(code, 0)
        crabs = self.crabs()
        keys = [(c["rarity"], c["variant"]) for c in crabs.values()]
        self.assertEqual(len(keys), len(set(keys)))
        share = collections.Counter(c["rarity"] for c in crabs.values())
        total = sum(t["weight"] for t in self.tiers)
        for t in self.tiers:
            expected = t["weight"] / total
            self.assertAlmostEqual(share[t["id"]] / 6000, expected, delta=max(0.02, expected * 0.25), msg=t["id"])
        common = next(t for t in self.tiers if t["id"] == "common")
        editions = {self.mod.edition_of(common, c["variant"]) for c in crabs.values() if c["rarity"] == "common"}
        self.assertIn(2, editions, "Gewöhnlich ist bei 6000 Krabben in der 2. Auflage")

    def test_first_series_comes_first(self):
        self.run_sync(gazers(range(1, 41)))
        for c in self.crabs().values():
            self.assertLessEqual(c["variant"], 100)

    def test_vectors_match(self):
        vec = json.loads((ROOT / "tests" / "variants_vectors.json").read_text("utf-8"))["vectors"]
        for t in self.tiers:
            for e in vec[t["id"]]:
                h, s, p, u = self.mod.decode_variant(t, e["v"])
                self.assertEqual([h, s, p, u, self.mod.edition_of(t, e["v"])], [e["hat"], e["shell"], e["pattern"], e["hue"], e["edition"]])


if __name__ == "__main__":
    unittest.main()
