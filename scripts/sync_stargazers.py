#!/usr/bin/env python3
"""
Synchronisiert die Stargazer eines Repos mit crabs.json.

Regeln:
  * Jede Person (GitHub-User-ID) bekommt genau EINE Krabbe.
  * Jede Krabbe ist einzigartig: Pro Seltenheit gibt es nummerierte Sorten
    (Serie 1 = Nr. 1–100, danach geht es mit 101 … weiter). Eine Nummer wird nie
    doppelt vergeben. Aussehen = Hut + Hutfarbe + Schalenfarbe + Muster
    (gleiche Rechnung wie in js/variants.js). Sind alle Kombinationen einer
    Seltenheit vergeben, läuft die Nummer weiter (2. Auflage, 3. Auflage …).
  * Die Seltenheit wird immer nach den festen Chancen gewürfelt und danach
    nie wieder geändert.
  * Wer den Stern entfernt, bleibt in crabs.json gespeichert (starred: false,
    Name wird geleert) und seine Krabbe wird ausgeblendet. Gibt er wieder einen
    Stern, kommt dieselbe Krabbe zurück – es wird nicht neu gewürfelt.

Versiegelt (nur mit KRABBEN_SCHLUESSEL):
  * In den ersten 48 Stunden (bis die Krabbe „halbstark“ ist) stehen Hut und
    Sorten-Nummer NICHT lesbar in crabs.json, sondern verschlüsselt in "sealed".
    Sichtbar sind nur Seltenheit, Schalenfarbe, Muster und Farbton.
    Nach 48 Stunden entsiegelt die Action sie (läuft stündlich).
  * Ohne Schlüssel bleibt alles offen lesbar wie früher.

Sicherheitsnetz (nichts wird gespeichert, wenn …):
  * die GitHub-API einen Fehler liefert (auch auf einer Folgeseite),
  * die Zahl der Sterne auf einmal um mehr als die Hälfte fällt (ab 20 Krabben;
    absichtlich erlauben mit FORCE=1),
  * die Selbstprüfung eine doppelte Nummer, eine verschwundene oder eine
    veränderte Krabbe findet.

Umgebungsvariablen:
  GITHUB_TOKEN       Token (in Actions: secrets.GITHUB_TOKEN)
  GITHUB_REPOSITORY  "owner/repo" (in Actions automatisch gesetzt)
  FORCE              "1" = Notbremse bei starkem Rückgang ausschalten
  KRABBEN_SCHLUESSEL geheimer Schlüssel fürs Versiegeln (in Actions: secrets.KRABBEN_SCHLUESSEL)
"""
import base64
import copy
import hashlib
import hmac
import json
import os
import secrets
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRABS_FILE = ROOT / "crabs.json"
RARITY_FILE = ROOT / "data" / "rarities.json"

rng = secrets.SystemRandom()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ---------- Versiegeln (Hut + Nummer geheim bis "halbstark") ----------
SEAL_HOURS = 48          # wie UNLOCK in js/growth.js
SEAL_LEN = 16            # Klartext immer gleich lang, damit die Länge nichts verrät


def seal_keys(secret: str) -> tuple[bytes, bytes]:
    k = hashlib.sha256(secret.encode("utf-8")).digest()
    return hmac.new(k, b"verschluesseln", "sha256").digest(), hmac.new(k, b"pruefen", "sha256").digest()


def _stream(key: bytes, nonce: bytes, n: int) -> bytes:
    out, i = b"", 0
    while len(out) < n:
        out += hmac.new(key, nonce + i.to_bytes(4, "big"), "sha256").digest()
        i += 1
    return out[:n]


def _bound(crab: dict) -> bytes:
    # Siegel gehört genau zu dieser Krabbe (kann nicht auf eine andere kopiert werden)
    return f"krabbe-v1|{crab['id']}|{crab['rarity']}|{crab['firstStarredAt']}|".encode("utf-8")


def seal(keys: tuple[bytes, bytes], crab: dict, variant: int) -> str:
    enc, mac = keys
    plain = str(variant).encode().ljust(SEAL_LEN, b" ")
    nonce = secrets.token_bytes(16)
    ct = bytes(a ^ b for a, b in zip(plain, _stream(enc, nonce, SEAL_LEN)))
    tag = hmac.new(mac, _bound(crab) + nonce + ct, "sha256").digest()[:16]
    return base64.urlsafe_b64encode(nonce + ct + tag).decode().rstrip("=")


def unseal(keys: tuple[bytes, bytes], crab: dict) -> int:
    enc, mac = keys
    blob = crab["sealed"]
    raw = base64.urlsafe_b64decode(blob + "=" * (-len(blob) % 4))
    nonce, ct, tag = raw[:16], raw[16:-16], raw[-16:]
    if len(ct) != SEAL_LEN or not hmac.compare_digest(tag, hmac.new(mac, _bound(crab) + nonce + ct, "sha256").digest()[:16]):
        raise ValueError("Siegel passt nicht")
    return int(bytes(a ^ b for a, b in zip(ct, _stream(enc, nonce, SEAL_LEN))).decode().strip())


def is_young(crab: dict, now: datetime) -> bool:
    try:
        start = datetime.fromisoformat(crab["firstStarredAt"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return False
    return now < start + timedelta(hours=SEAL_HOURS)


def fetch_stargazers(repo: str, token: str | None) -> list[dict]:
    users, page = [], 1
    while True:
        url = f"https://api.github.com/repos/{repo}/stargazers?per_page=100&page={page}"
        req = urllib.request.Request(url, headers={
            # star+json liefert zusätzlich "starred_at"
            "Accept": "application/vnd.github.star+json",
            "User-Agent": "stargazer-sea",
            "X-GitHub-Api-Version": "2022-11-28",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            batch = json.load(resp)
        if not batch:
            break
        users.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return users


def roll_hat(tiers: list[dict]) -> tuple[str, str]:
    """Nur noch für die Verteilungs-Statistik (Seltenheit würfeln, Hut zufällig)."""
    tier = roll_tier(tiers)
    return tier["id"], rng.choice(tier["hats"])["id"]


def roll_tier(tiers: list[dict]) -> dict:
    total = sum(t["weight"] for t in tiers)
    r = rng.uniform(0, total)
    for tier in tiers:
        r -= tier["weight"]
        if r <= 0:
            return tier
    return tiers[-1]


# ---------- Sorten (identisch zu js/variants.js) ----------
SHELLS = 6
HUES = 10


_combo_cache: dict[str, list[tuple[str, int, int, int]]] = {}


def combos(tier: dict) -> list[tuple[str, int, int, int]]:
    if tier["id"] in _combo_cache:
        return _combo_cache[tier["id"]]
    out = []
    for h in tier["hats"]:
        for shell in range(SHELLS):
            patterns = [1, 2, 3, 4] if h["id"] == "none" else [0, 1, 2, 3, 4]
            for pattern in patterns:
                for hue in range(HUES):
                    out.append((h["id"], shell, pattern, hue))
    _combo_cache[tier["id"]] = out
    return out


def step_for(n: int) -> int:
    from math import gcd
    a = 37
    while gcd(a, n) != 1:
        a += 1
    return a


def decode_variant(tier: dict, v: int) -> tuple[str, int, int, int]:
    lst = combos(tier)
    return lst[((v - 1) * step_for(len(lst))) % len(lst)]


def edition_of(tier: dict, v: int) -> int:
    return (v - 1) // len(combos(tier)) + 1


def pick_variant(tier: dict, used: set[int], series: int, want_hat: str | None = None) -> int:
    """Freie Sorten-Nummer: zuerst Serie 1 (1..series), dann series+1 .. Anzahl,
    danach die nächste Auflage (Anzahl+1 .. 2*Anzahl) usw. Findet immer eine Nummer."""
    capacity = len(combos(tier))
    pools = [range(1, min(series, capacity) + 1), range(series + 1, capacity + 1)]
    edition = 2
    while True:
        for rg in pools:
            pool = [v for v in rg if v not in used]
            if want_hat:
                pool = [v for v in pool if decode_variant(tier, v)[0] == want_hat] or pool
            if pool:
                return rng.choice(pool)
        pools = [range((edition - 1) * capacity + 1, edition * capacity + 1)]
        edition += 1


def self_check(old: dict[int, dict], new: dict[int, dict]) -> list[str]:
    """Prüft vor dem Speichern, dass nichts verloren geht oder doppelt ist."""
    problems = []
    seen: dict[tuple[str, int], int] = {}
    for c in new.values():
        key = (c.get("rarity"), c.get("variant"))
        if key in seen:
            problems.append(f"Nummer doppelt: {key} bei {seen[key]} und {c['id']}")
        seen[key] = c["id"]
    for uid, o in old.items():
        n = new.get(uid)
        if n is None:
            problems.append(f"Krabbe {uid} ist verschwunden")
            continue
        if not isinstance(o.get("variant"), int):
            continue  # alter Eintrag ohne Sorte wurde gerade nachgerüstet
        for field in ("rarity", "variant", "hat", "firstStarredAt"):
            if field in o and o.get(field) != n.get(field):
                problems.append(f"Krabbe {uid}: {field} geändert ({o.get(field)} -> {n.get(field)})")
    return problems


def main() -> int:
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not repo:
        print("GITHUB_REPOSITORY fehlt (z.B. 'owner/repo').", file=sys.stderr)
        return 1
    token = os.environ.get("GITHUB_TOKEN")

    rarities = json.loads(RARITY_FILE.read_text("utf-8"))
    tiers = rarities["tiers"]
    series = int(rarities.get("series", 100))
    tier_by_id = {t["id"]: t for t in tiers}
    data = json.loads(CRABS_FILE.read_text("utf-8")) if CRABS_FILE.exists() else {}
    crabs = {c["id"]: c for c in data.get("crabs", [])}
    before = json.dumps(sorted(crabs.values(), key=lambda c: c["id"]), sort_keys=True)

    # Versiegelte Krabben zum Arbeiten öffnen (gespeichert wird später wieder versiegelt)
    secret = os.environ.get("KRABBEN_SCHLUESSEL", "")
    keys = seal_keys(secret) if secret else None
    old_seals: dict[int, str] = {}
    for c in crabs.values():
        if "sealed" not in c:
            continue
        if not keys:
            print("Abbruch: crabs.json enthält versiegelte Krabben, aber KRABBEN_SCHLUESSEL fehlt.", file=sys.stderr)
            return 1
        tier = tier_by_id.get(c.get("rarity"))
        try:
            v = unseal(keys, c)
            look = decode_variant(tier, v)
        except Exception:  # noqa: BLE001
            print(f"Abbruch: Siegel von Krabbe {c['id']} passt nicht zum Schlüssel.", file=sys.stderr)
            return 1
        if list(look[1:]) != [c.get("shell"), c.get("pattern"), c.get("hue")]:
            print(f"Abbruch: Krabbe {c['id']}: Farbe/Muster passen nicht zum Siegel.", file=sys.stderr)
            return 1
        old_seals[c["id"]] = c.pop("sealed")
        for k in ("shell", "pattern", "hue"):
            c.pop(k, None)
        c["variant"], c["hat"] = v, look[0]
    original = copy.deepcopy(crabs)  # Kopie für die Selbstprüfung
    active_before = sum(1 for c in crabs.values() if c.get("starred"))

    # Bereits vergebene Sorten (auch von Leuten ohne Stern – die bekommen ihre Krabbe ja zurück)
    used: dict[str, set[int]] = {t["id"]: set() for t in tiers}
    for c in crabs.values():
        if isinstance(c.get("variant"), int) and c.get("rarity") in used:
            used[c["rarity"]].add(c["variant"])
    # Alte Einträge ohne Sorte nachrüsten (Hut möglichst behalten)
    for c in sorted(crabs.values(), key=lambda c: (c["firstStarredAt"], c["id"])):
        tier = tier_by_id.get(c.get("rarity"))
        if tier and not isinstance(c.get("variant"), int):
            v = pick_variant(tier, used[tier["id"]], series, want_hat=c.get("hat"))
            if v is not None:
                c["variant"] = v
                c["hat"] = decode_variant(tier, v)[0]
                used[tier["id"]].add(v)

    stargazers = fetch_stargazers(repo, token)  # Fehler -> Abbruch, nichts wird gespeichert

    # Notbremse: Liefert GitHub plötzlich viel weniger Sterne, lieber nichts ändern
    if active_before >= 20 and len(stargazers) < active_before * 0.5 and os.environ.get("FORCE") != "1":
        print(
            f"Abbruch: nur noch {len(stargazers)} statt {active_before} Sterne. "
            "Falls das stimmt: Workflow von Hand mit force starten.",
            file=sys.stderr,
        )
        return 1

    current_ids = set()
    new_crabs = []

    for entry in stargazers:
        user = entry.get("user", entry)
        uid = user["id"]
        current_ids.add(uid)
        crab = crabs.get(uid)
        if crab is None:
            tier = roll_tier(tiers)  # immer nach den festen Chancen
            v = pick_variant(tier, used[tier["id"]], series)
            used[tier["id"]].add(v)
            crab = {
                "id": uid,
                "login": user["login"],
                "rarity": tier["id"],
                "hat": decode_variant(tier, v)[0],
                "variant": v,
                "firstStarredAt": entry.get("starred_at") or now_iso(),
                "starred": True,
            }
            crabs[uid] = crab
            new_crabs.append(crab)
        else:
            # Login kann sich ändern, Hut & Seltenheit NIE.
            crab["login"] = user["login"]
            crab["starred"] = True

    for uid, crab in crabs.items():
        if uid not in current_ids:
            crab["starred"] = False
            crab["login"] = ""  # Datensparsam: Name nur speichern, solange der Stern da ist

    problems = self_check(original, crabs)
    if problems:
        print("Abbruch, Selbstprüfung fehlgeschlagen:", *problems[:20], sep="\n  ", file=sys.stderr)
        return 1

    # Junge Krabben versiegeln: Hut und Nummer verschwinden aus der öffentlichen Datei
    now = now_utc()

    def public(c: dict) -> dict:
        tier = tier_by_id.get(c.get("rarity"))
        if not keys or not tier or not isinstance(c.get("variant"), int) or not is_young(c, now):
            return c
        _, shell, pattern, hue = decode_variant(tier, c["variant"])
        out = {k: val for k, val in c.items() if k not in ("hat", "variant")}
        # altes Siegel weiterverwenden, sonst würde sich die Datei bei jedem Lauf ändern
        out.update(shell=shell, pattern=pattern, hue=hue, sealed=old_seals.get(c["id"]) or seal(keys, c, c["variant"]))
        return out

    ordered = [public(c) for c in sorted(crabs.values(), key=lambda c: (c["firstStarredAt"], c["id"]))]
    after = json.dumps(sorted(ordered, key=lambda c: c["id"]), sort_keys=True)

    for c in new_crabs:
        if keys and is_young(c, now):  # Action-Logs sind öffentlich: Hut nicht verraten
            print(f"🦀 Neue Krabbe: @{c['login']} ({c['rarity']}), Hut bleibt {SEAL_HOURS} Std. versiegelt")
            continue
        ed = edition_of(tier_by_id[c["rarity"]], c["variant"])
        print(f"🦀 Neue Krabbe: @{c['login']} -> {c['hat']} ({c['rarity']}, Sorte {c['variant']}"
              f"{f', {ed}. Auflage' if ed > 1 else ''})")
    unsealed = [c for c in crabs.values() if c["id"] in old_seals and "sealed" not in public(c)]
    for c in unsealed:
        print(f"🎁 Ausgepackt: @{c['login'] or c['id']} trägt {c['hat']} (Sorte {c['variant']})")
    if not keys:
        print("Tipp: Mit dem Geheimnis KRABBEN_SCHLUESSEL bleiben Hüte bis zum Auspacken geheim.")

    if before == after:
        print("Keine Änderungen.")
        return 0

    CRABS_FILE.write_text(
        json.dumps({"updated": now_iso(), "crabs": ordered}, indent=2, ensure_ascii=False) + "\n",
        "utf-8",
    )
    active = sum(1 for c in ordered if c["starred"])
    print(f"crabs.json aktualisiert: {active} aktive Krabben ({len(ordered)} insgesamt).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
