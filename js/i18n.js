/*
 * Sprachen: Deutsch und Englisch.
 * Normales Skript (kein Modul), damit schon der Ladebildschirm übersetzt ist.
 *
 * Welche Sprache? 1. ?lang=de|en in der Adresse  2. die zuletzt gewählte (Umschalter oben links)
 *                 3. die Sprache des Browsers (Deutsch -> de, sonst en)
 *
 * Texte im HTML:  data-i18n="schluessel"            -> Text
 *                 data-i18n-html="schluessel"       -> HTML
 *                 data-i18n-attr="placeholder:schluessel,title:schluessel2"
 * Texte im Code:  I18N.t('schluessel', { name: 'x' })  ({name} wird ersetzt; Funktionen bekommen die Werte)
 */
(function () {
  var KEY = 'stargazer.sprache';
  var LANGS = ['de', 'en'];
  var NB = '\u00a0'; // Zahl und Einheit nicht trennen ("18 h")

  /** "a" oder "an" vor einem englischen Wort */
  function an(word) { return /^[aeiou]/i.test(word || '') ? 'an' : 'a'; }
  function ord(n) {
    var s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
    return n + s;
  }

  var DICT = {
    de: {
      // Ladebildschirm
      'load.dive': 'Tauche ab',
      'load.three': 'Lade three.js',
      'load.sea': 'Lade das Meer',
      'load.gl': 'Starte 3D-Grafik',
      'load.reef': 'Baue das Riff',
      'load.reefDone': 'Riff fertig',
      'load.crabs': 'Krabben ziehen ein',
      'load.font': 'Lade Schrift',
      'load.stars': 'Zähle die Sterne',
      'load.shaders': 'Bereite Shader vor',
      'load.almost': 'Gleich geht\'s los',
      'load.done': 'Fertig!',
      'load.skip': 'Tippen zum Überspringen',
      'err.file': '🦀 Die Seite wurde direkt als Datei geöffnet –<br>das blockiert der Browser.<br><br>' +
        'Starte im Projektordner einen kleinen Server:<br>' +
        '<code style="color:#ffd27a">python3 -m http.server 8000</code><br>' +
        'und öffne dann <code style="color:#ffd27a">http://localhost:8000</code>',
      'err.dive': '🦀 Fehler beim Abtauchen:',
      'err.slow': '🦀 Das dauert ungewöhnlich lange…<br>Prüfe deine Internetverbindung<br>oder lade die Seite neu.',
      'gl.title': '🦀 Keine 3D-Grafik verfügbar',
      'gl.text': 'Dein Browser hat WebGL ausgeschaltet oder blockiert<br>(passiert oft in Remote-Desktop-Sitzungen oder ohne Grafiktreiber).',
      'gl.firefox': '<b>Firefox:</b> <code>about:config</code> öffnen → <code>webgl.force-enabled</code> auf <code>true</code> setzen → Seite neu laden.',
      'gl.chrome': '<b>Chrome/Edge:</b> Einstellungen → System → „Grafikbeschleunigung verwenden“ einschalten.<br>Falls das nicht reicht: <code>chrome://flags/#ignore-gpu-blocklist</code> aktivieren und neu starten.',
      'gl.check': 'Prüfen kannst du es auf <code>https://get.webgl.org</code>',

      // Oberfläche
      'lang.label': 'Sprache',
      'title.sub': 'Krabben leben hier',
      'star.label': 'Jeder Stern wird zur Krabbe',
      'star.mine': 'Meine Krabbe',
      'sign.line': 'Jeder Stern wird zur Krabbe',
      'town.snack': 'Algen-Imbiss',
      'town.reef': 'Sternenriff',
      'town.lane': 'Muschelgasse',
      'town.chest': 'Schatzkiste',
      'town.hall': 'Rathaus',
      'town.shop': 'Laden',
      'town.post': 'Post',
      'town.observatory': 'Sternwarte',
      'town.wreck': 'Wrack-Café',
      'town.bath': 'Blubberbad',
      'town.playground': 'Spielplatz',
      'album.title': 'Sammelalbum',
      'album.titleNews': function (v) { return 'Sammelalbum (' + v.n + ' neu)'; },
      'sound.on': 'Unterwasser-Geräusche an',
      'sound.off': 'Ton aus',
      'search.placeholder': 'Finde deine Krabbe… (@name)',
      'search.none': 'Keine Krabbe gefunden – jeder Stern wird zur Krabbe ⭐',
      'wait.other': 'Anderer Name',
      'wait.cancel': 'Warten beenden',
      'wait.soon': 'schlüpft gleich …',
      'wait.slow': 'Noch nicht da – schaut alle 90 s nach',
      'cotd.go': 'Zur Krabbe des Tages',
      'cotd': 'Krabbe des Tages',
      'cotd.star': '★ Krabbe des Tages',
      'legend.title': 'Seltenheiten',
      'legend.note': 'Der Hut wird beim ersten Stern ausgewürfelt und bleibt für immer.',
      'newest.title': 'Neu im Meer',
      'close': 'Schließen',
      'card.size': 'Größe',
      'card.hat': 'Hut',
      'card.variant': 'Sorte',
      'card.since': 'Im Meer seit',
      'card.follow': '🎥 Folgen',
      'card.following': '🎥 Folge…',
      'card.wave': '👋 Winken',
      'card.share': '📤 Teilen',
      'card.mine': '💗 Das bin ich',
      'card.notMine': '🙅 Das bin ich nicht',
      'card.exampleText': 'Das ist eine <b>Beispiel-Krabbe</b>. Sie hält den Platz warm, bis mehr Leute da sind.',
      'card.exampleBtn': '★ Hol dir deine eigene',
      'card.exampleName': 'Beispiel-Krabbe',
      'card.exampleSub': 'Platzhalter, bis mehr Leute da sind',
      'card.number': function (v) { return 'Krabbe #' + v.n + (v.demo ? ' · Demo' : '') + (v.founder ? ' · 🚩 Gründerkrabbe' : ''); },
      'card.birthday': function (v) { return ' · 🎈 Krabbentag (' + v.n + ' ' + (v.n === 1 ? 'Jahr' : 'Jahre') + ')'; },
      'card.grows': '{icon} {stage} · wächst in {time}',
      'card.hatLocked': '🔒 wird {until} enthüllt',
      'card.variantLocked': '🔒 noch eingepackt',
      'card.season': ' (+ {hat} als Saison-Deko)',
      'card.variantNr': 'Nr. {v} · {label}',
      'season.santa': 'Zipfelmütze',
      'season.witch': 'Hexenhut',
      'example.login': 'Beispiel',
      'demo.banner': 'Demo-Modus: noch keine Sterne – hier schwimmen Beispielkrabben.',
      'hint': 'Ziehen = drehen · Scrollen = zoomen · Krabbe anklicken',

      // Stern-Ablauf
      'join.title': 'Jeder Stern wird zur Krabbe',
      'join.star': 'Stern geben',
      'join.starText': 'Gib dem Projekt auf GitHub einen Stern.',
      'join.starBtn': '★ Zu GitHub',
      'join.name': 'Wie heißt du auf GitHub?',
      'join.placeholder': '@deinname',
      'join.nameLabel': 'GitHub-Name',
      'join.go': 'Los!',
      'join.hatch': 'Deine Krabbe schlüpft',
      'join.hatchText': 'Das dauert 1 bis 3 Minuten – die Seite schaut von selbst nach.',
      'join.note': 'Kein Stern nötig, um hier zu stöbern: Das Meer ist ein Bild aller Stargazer.',
      'join.badName': 'Das sieht nicht wie ein GitHub-Name aus.',

      // Meldungen
      'toast.hatched': '🐣 <b>@{login}</b> ist geschlüpft! <span style="color:{color}">{tier}</span>',
      'toast.arrived': '🦀 <b>@{login}</b> ist ins Meer gezogen! <span style="color:{color}">{hat}</span>',
      'toast.treasure': '🎉 Schatz gefunden! Die neueste Krabbe ist <b>@{login}</b>',
      'toast.unmarked': 'Markierung entfernt.',
      'toast.marked': '💗 Gemerkt: <b>@{login}</b> ist deine Krabbe (nur in diesem Browser).',
      'toast.grewInline': ' Deine Krabbe ist gewachsen: jetzt <b>{stage}</b>!',
      'toast.welcome': '👋 Willkommen zurück, <b>@{login}</b>!{grew}',
      'toast.comeBack': 'Deine Krabbe wartet – gib den Stern wieder, dann kommt genau sie zurück. ⭐',
      'toast.found': '🦀 Da bist du ja, <b>@{login}</b>!',
      'toast.egg': '🥚 Dein Ei liegt bei der Schatzkiste. Sobald dein Stern da ist, schlüpft <b>@{name}</b> (1–3 Minuten).',
      'toast.slow': 'Dauert heute länger. Hast du den Stern wirklich gegeben? Die Seite sucht weiter, sobald du wiederkommst.',
      'toast.stopWait': 'Warten beendet.',
      'toast.grew': '🦀 Deine Krabbe ist gewachsen: jetzt <b>{stage}</b>!',

      // Enthüllung
      'reveal.top': 'Du bist eine',
      'reveal.big': function (v) { return v.tier.toUpperCase() + 'E'; },
      'reveal.tail': ' KRABBE!',
      'reveal.locked': '🔒 Dein Hut wird {until} enthüllt',
      'reveal.noHat': 'ganz ohne Hut – pur!',
      'reveal.withHat': 'mit {hat}!',
      'unpack.top': 'Ausgepackt! Deine Krabbe trägt',
      'unpack.nothing': 'GAR NICHTS',
      'unpack.pure': ' – PUR!',
      'unpack.sub': 'Sorte Nr. {v} · {label}',

      // Erste Schritte
      'coach.drag': '👆 Ziehen zum Umschauen',
      'coach.tap': '🦀 Tippe eine Krabbe an',
      'coach.star': '⭐ Jeder Stern wird zur Krabbe – auch deiner',

      // Wachsen
      'time.soon': 'gleich',
      'time.in': 'in {t}',
      'time.days': function (v) { return v.d + NB + (v.d === 1 ? 'Tag' : 'Tagen') + (v.h ? ' ' + v.h + NB + 'Std.' : ''); },
      'time.hours': function (v) { return v.h + NB + 'Std.' + (v.m ? ' ' + v.m + NB + 'Min.' : ''); },
      'time.min': '{m}' + NB + 'Min.',

      // Sorten
      'variant.hue': ', Hutfarbe {n}',
      'variant.original': ', Originalfarbe',
      'variant.edition': ' · {n}. Auflage',

      // Album
      'al.new': 'NEU', 'al.unpack': 'AUSGEPACKT', 'al.grow': 'GEWACHSEN',
      'al.sub': 'Jede Krabbe gibt es nur <b>ein einziges Mal</b>.<br>Pro Seltenheit {n} Sorten – wer findet die Mythischen?',
      'al.total': '<b>{n}</b> von {max} Krabben im Meer',
      'al.nurseryLink': function (v) { return '🐣 <b>' + v.n + '</b> ' + (v.n === 1 ? 'Krabbe wächst' : 'Krabben wachsen') + ' noch in der Kinderstube'; },
      'al.hint': 'Tipp: Klick auf eine Krabbe öffnet ihre Sammelkarte.',
      'al.packTitle': '@{login} – wird {until} ausgepackt',
      'al.nursery': 'Kinderstube',
      'al.nurseryTab': '🐣 Kinder',
      'al.rangeOf': '{a}–{b} von {n}',
      'al.wrapped': 'eingepackt bis halbstark',
      'al.slot': '@{login} – Sorte {v}',
      'al.empty': 'Sorte {v} – noch nicht gefunden',
      'al.range': 'Nr. {a}–{b}',
      'al.page': 'Seite {a} / {n}',
      'al.pages': 'Seite {a}–{b} / {n}',
      'al.prev': 'Zurückblättern',
      'al.next': 'Weiterblättern',
      'al.close': 'Album schließen',

      // Sammelkarte
      'tc.nrUnknown': 'Nr. ???',
      'tc.nr': function (v) { return 'Nr. ' + v.v + (v.edition > 1 ? ' · ' + v.edition + '. Aufl.' : ''); },
      'tc.crab': 'Krabbe #{n}',
      'tc.founder': 'GRÜNDER Nr. {n}',
      'tc.hatIn': 'Hut {until}',
      'tc.hatLocked': 'Hut: 🔒 ???',
      'tc.hat': 'Hut: {hat}',
      'tc.birthday': function (v) { return '🎈 Heute ist Krabbentag: seit ' + v.n + ' ' + (v.n === 1 ? 'Jahr' : 'Jahren') + ' im Meer!'; },
      'tc.flavor': '„{text}“',
      'tc.foot': 'Krabbe #{n} · seit {since}',
      'tc.cotd1': 'KRABBE', 'tc.cotd2': 'DES TAGES',
      'tc.copy': '🔗 Link kopieren',
      'tc.share': '📤 Teilen',
      'tc.save': '💾 Bild speichern',
      'tc.show': '📍 Im Meer zeigen',
      'tc.aria': 'Sammelkarte von @{login}',
      'tc.copied': '🔗 Link kopiert: <b>{url}</b>',
      'tc.copyFail': 'Kopieren hat nicht geklappt – Link: {url}',
      'tc.file': 'krabbe-{login}.png',
      'share.locked': function (v) {
        return 'Ich bin eine ' + v.tier.toLowerCase() + 'e ' + (v.stageId === 'baby' ? 'Babykrabbe' : v.stage) +
          ' im Stargazer Sea. Mein Hut wird ' + v.until + ' enthüllt. Welche bist du?';
      },
      'share.grown': function (v) {
        return 'Ich bin eine ' + v.tier.toLowerCase() + 'e Krabbe' + (v.nr ? ' (Nr. ' + v.nr + ')' : '') +
          (v.hat ? ' mit ' + v.hat : '') + ' im Stargazer Sea. Welche bist du?';
      },
      'tc.stats': ['Scherenkraft', 'Blubberei', 'Tanzlaune'],
      'tc.abilities': [
        ['Scherenklatscher', 'Klatscht zweimal in die Scheren – alle in der Nähe tanzen mit.'],
        ['Blubberblase', 'Pustet eine riesige Blase, die bis zur Oberfläche steigt.'],
        ['Seitwärts-Sprint', 'Rennt so schnell seitwärts, dass der Sand staubt.'],
        ['Muschelversteck', 'Verschwindet blitzschnell hinter der nächsten Koralle.'],
        ['Sternenblick', 'Schaut so lange nach oben, bis ein neuer Stern auftaucht.'],
        ['Hutzauber', 'Rückt den Hut zurecht. Sieht danach doppelt so cool aus.'],
        ['Tiefseetanz', 'Ein Tanz, den nur Krabben wirklich verstehen.'],
        ['Sandburg-Bau', 'Baut in drei Sekunden eine perfekte Sandburg.'],
        ['Gezeitenwelle', 'Wackelt so stark, dass das Seegras mitschwingt.'],
        ['Perlenglanz', 'Poliert die Schale, bis sie wie eine Perle glänzt.'],
        ['Kniff-Kniff', 'Zwickt ganz sanft – nur zur Begrüßung.'],
        ['Strömungsreiter', 'Lässt sich von der Strömung quer durchs Riff tragen.'],
      ],
      'tc.flavors': [
        'Wurde zuletzt beim Schatzsuchen gesichtet.',
        'Sammelt heimlich glitzernde Muscheln.',
        'Hat noch nie einen Tanzwettbewerb verloren.',
        'Schläft am liebsten neben der Riesenmuschel.',
        'Träumt davon, einmal die Oberfläche zu sehen.',
        'Kennt jeden Fisch im Riff beim Namen.',
        'Winkt jedem, der vorbeischwimmt.',
        'Behauptet, den goldenen Stern schon berührt zu haben.',
      ],
      // Seltenheiten, Hüte, Stufen, Schalen und Muster stehen auf Deutsch in rarities.json, growth.js und variants.js
    },

    en: {
      'load.dive': 'Diving in',
      'load.three': 'Loading three.js',
      'load.sea': 'Loading the sea',
      'load.gl': 'Starting 3D graphics',
      'load.reef': 'Building the reef',
      'load.reefDone': 'Reef ready',
      'load.crabs': 'Crabs moving in',
      'load.font': 'Loading font',
      'load.stars': 'Counting the stars',
      'load.shaders': 'Preparing shaders',
      'load.almost': 'Almost there',
      'load.done': 'Done!',
      'load.skip': 'Tap to skip',
      'err.file': '🦀 The page was opened directly as a file –<br>the browser blocks that.<br><br>' +
        'Start a small server in the project folder:<br>' +
        '<code style="color:#ffd27a">python3 -m http.server 8000</code><br>' +
        'and then open <code style="color:#ffd27a">http://localhost:8000</code>',
      'err.dive': '🦀 Something went wrong while diving in:',
      'err.slow': '🦀 This is taking unusually long…<br>Check your internet connection<br>or reload the page.',
      'gl.title': '🦀 No 3D graphics available',
      'gl.text': 'Your browser has WebGL turned off or blocked<br>(this often happens in remote desktop sessions or without graphics drivers).',
      'gl.firefox': '<b>Firefox:</b> open <code>about:config</code> → set <code>webgl.force-enabled</code> to <code>true</code> → reload the page.',
      'gl.chrome': '<b>Chrome/Edge:</b> Settings → System → turn on “Use graphics acceleration”.<br>If that is not enough: enable <code>chrome://flags/#ignore-gpu-blocklist</code> and restart.',
      'gl.check': 'You can check it at <code>https://get.webgl.org</code>',

      'lang.label': 'Language',
      'title.sub': 'crabs live here',
      'star.label': 'Every star becomes a crab',
      'star.mine': 'My crab',
      'sign.line': 'Every star becomes a crab',
      'town.snack': 'Kelp Snacks',
      'town.reef': 'Star Reef',
      'town.lane': 'Shell Lane',
      'town.chest': 'Treasure',
      'town.hall': 'Town Hall',
      'town.shop': 'Shop',
      'town.post': 'Post',
      'town.observatory': 'Observatory',
      'town.wreck': 'Wreck Café',
      'town.bath': 'Bubble Bath',
      'town.playground': 'Playground',
      'album.title': 'Collector’s album',
      'album.titleNews': function (v) { return 'Collector’s album (' + v.n + ' new)'; },
      'sound.on': 'Turn on underwater sounds',
      'sound.off': 'Sound off',
      'search.placeholder': 'Find your crab… (@name)',
      'search.none': 'No crab found – every star becomes a crab ⭐',
      'wait.other': 'Other name',
      'wait.cancel': 'Stop waiting',
      'wait.soon': 'hatching soon …',
      'wait.slow': 'Not here yet – checking every 90 s',
      'cotd.go': 'Go to the crab of the day',
      'cotd': 'Crab of the day',
      'cotd.star': '★ Crab of the day',
      'legend.title': 'Rarities',
      'legend.note': 'The hat is rolled with the first star and stays forever.',
      'newest.title': 'New in the sea',
      'close': 'Close',
      'card.size': 'Size',
      'card.hat': 'Hat',
      'card.variant': 'Variant',
      'card.since': 'In the sea since',
      'card.follow': '🎥 Follow',
      'card.following': '🎥 Following…',
      'card.wave': '👋 Wave',
      'card.share': '📤 Share',
      'card.mine': '💗 That’s me',
      'card.notMine': '🙅 That’s not me',
      'card.exampleText': 'This is an <b>example crab</b>. It keeps the spot warm until more people arrive.',
      'card.exampleBtn': '★ Get your own',
      'card.exampleName': 'Example crab',
      'card.exampleSub': 'Placeholder until more people arrive',
      'card.number': function (v) { return 'Crab #' + v.n + (v.demo ? ' · Demo' : '') + (v.founder ? ' · 🚩 Founder crab' : ''); },
      'card.birthday': function (v) { return ' · 🎈 Crab day (' + v.n + ' ' + (v.n === 1 ? 'year' : 'years') + ')'; },
      'card.grows': '{icon} {stage} · grows in {time}',
      'card.hatLocked': '🔒 revealed {until}',
      'card.variantLocked': '🔒 still wrapped',
      'card.season': ' (+ {hat} as seasonal decoration)',
      'card.variantNr': 'No. {v} · {label}',
      'season.santa': 'Santa hat',
      'season.witch': 'Witch hat',
      'example.login': 'Example',
      'demo.banner': 'Demo mode: no stars yet – example crabs are swimming here.',
      'hint': 'Drag = rotate · Scroll = zoom · Click a crab',

      'join.title': 'Every star becomes a crab',
      'join.star': 'Give a star',
      'join.starText': 'Star the project on GitHub.',
      'join.starBtn': '★ To GitHub',
      'join.name': 'What’s your GitHub name?',
      'join.placeholder': '@yourname',
      'join.nameLabel': 'GitHub name',
      'join.go': 'Go!',
      'join.hatch': 'Your crab hatches',
      'join.hatchText': 'This takes 1 to 3 minutes – the page checks by itself.',
      'join.note': 'No star needed to look around: the sea is a picture of all stargazers.',
      'join.badName': 'That doesn’t look like a GitHub name.',

      'toast.hatched': '🐣 <b>@{login}</b> just hatched! <span style="color:{color}">{tier}</span>',
      'toast.arrived': '🦀 <b>@{login}</b> moved into the sea! <span style="color:{color}">{hat}</span>',
      'toast.treasure': '🎉 Treasure found! The newest crab is <b>@{login}</b>',
      'toast.unmarked': 'Mark removed.',
      'toast.marked': '💗 Saved: <b>@{login}</b> is your crab (only in this browser).',
      'toast.grewInline': ' Your crab has grown: now <b>{stage}</b>!',
      'toast.welcome': '👋 Welcome back, <b>@{login}</b>!{grew}',
      'toast.comeBack': 'Your crab is waiting – star the project again and exactly this crab comes back. ⭐',
      'toast.found': '🦀 There you are, <b>@{login}</b>!',
      'toast.egg': '🥚 Your egg is next to the treasure chest. As soon as your star arrives, <b>@{name}</b> hatches (1–3 minutes).',
      'toast.slow': 'Taking longer today. Did you really give the star? The page keeps looking whenever you come back.',
      'toast.stopWait': 'Stopped waiting.',
      'toast.grew': '🦀 Your crab has grown: now <b>{stage}</b>!',

      'reveal.top': function (v) { return 'You are ' + an(v.tier); },
      'reveal.big': function (v) { return v.tier.toUpperCase(); },
      'reveal.tail': ' CRAB!',
      'reveal.locked': '🔒 Your hat will be revealed {until}',
      'reveal.noHat': 'no hat at all – pure!',
      'reveal.withHat': function (v) { return 'with ' + an(v.hat) + ' ' + v.hat + '!'; },
      'unpack.top': 'Unwrapped! Your crab is wearing',
      'unpack.nothing': 'NOTHING AT ALL',
      'unpack.pure': ' – PURE!',
      'unpack.sub': 'Variant No. {v} · {label}',

      'coach.drag': '👆 Drag to look around',
      'coach.tap': '🦀 Tap a crab',
      'coach.star': '⭐ Every star becomes a crab – yours too',

      'time.soon': 'soon',
      'time.in': 'in {t}',
      'time.days': function (v) { return v.d + NB + (v.d === 1 ? 'day' : 'days') + (v.h ? ' ' + v.h + NB + 'h' : ''); },
      'time.hours': function (v) { return v.h + NB + 'h' + (v.m ? ' ' + v.m + NB + 'min' : ''); },
      'time.min': '{m}' + NB + 'min',

      'variant.hue': ', hat color {n}',
      'variant.original': ', original color',
      'variant.edition': function (v) { return ' · ' + ord(v.n) + ' edition'; },

      'al.new': 'NEW', 'al.unpack': 'UNWRAPPED', 'al.grow': 'GREW',
      'al.sub': 'Every crab exists <b>only once</b>.<br>{n} variants per rarity – who finds the mythic ones?',
      'al.total': '<b>{n}</b> of {max} crabs in the sea',
      'al.nurseryLink': function (v) { return '🐣 <b>' + v.n + '</b> ' + (v.n === 1 ? 'crab is' : 'crabs are') + ' still growing in the nursery'; },
      'al.hint': 'Tip: click a crab to open its trading card.',
      'al.packTitle': '@{login} – unwrapped {until}',
      'al.nursery': 'Nursery',
      'al.nurseryTab': '🐣 Nursery',
      'al.rangeOf': '{a}–{b} of {n}',
      'al.wrapped': 'wrapped until teen',
      'al.slot': '@{login} – variant {v}',
      'al.empty': 'Variant {v} – not found yet',
      'al.range': 'No. {a}–{b}',
      'al.page': 'Page {a} / {n}',
      'al.pages': 'Pages {a}–{b} / {n}',
      'al.prev': 'Previous page',
      'al.next': 'Next page',
      'al.close': 'Close album',

      'tc.nrUnknown': 'No. ???',
      'tc.nr': function (v) { return 'No. ' + v.v + (v.edition > 1 ? ' · ' + ord(v.edition) + ' ed.' : ''); },
      'tc.crab': 'Crab #{n}',
      'tc.founder': 'FOUNDER No. {n}',
      'tc.hatIn': 'Hat {until}',
      'tc.hatLocked': 'Hat: 🔒 ???',
      'tc.hat': 'Hat: {hat}',
      'tc.birthday': function (v) { return '🎈 It’s crab day: ' + v.n + ' ' + (v.n === 1 ? 'year' : 'years') + ' in the sea!'; },
      'tc.flavor': '“{text}”',
      'tc.foot': 'Crab #{n} · since {since}',
      'tc.cotd1': 'CRAB', 'tc.cotd2': 'OF THE DAY',
      'tc.copy': '🔗 Copy link',
      'tc.share': '📤 Share',
      'tc.save': '💾 Save image',
      'tc.show': '📍 Show in the sea',
      'tc.aria': 'Trading card of @{login}',
      'tc.copied': '🔗 Link copied: <b>{url}</b>',
      'tc.copyFail': 'Copying didn’t work – link: {url}',
      'tc.file': 'crab-{login}.png',
      'share.locked': function (v) {
        var tier = v.tier.toLowerCase();
        return 'I’m ' + an(tier) + ' ' + tier + ' ' + (v.stageId === 'baby' ? 'baby' : v.stage.toLowerCase()) +
          ' crab in Stargazer Sea. My hat will be revealed ' + v.until + '. Which one are you?';
      },
      'share.grown': function (v) {
        var tier = v.tier.toLowerCase();
        return 'I’m ' + an(tier) + ' ' + tier + ' crab' + (v.nr ? ' (No. ' + v.nr + ')' : '') +
          (v.hat ? ' with ' + an(v.hat) + ' ' + v.hat : '') + ' in Stargazer Sea. Which one are you?';
      },
      'tc.stats': ['Claw power', 'Bubbliness', 'Dance mood'],
      'tc.abilities': [
        ['Claw Clap', 'Claps its claws twice – everyone nearby dances along.'],
        ['Bubble Blast', 'Blows a giant bubble that rises all the way to the surface.'],
        ['Sideways Sprint', 'Runs sideways so fast that the sand flies.'],
        ['Shell Hideout', 'Vanishes behind the nearest coral in a flash.'],
        ['Star Gaze', 'Looks up until a new star appears.'],
        ['Hat Magic', 'Straightens its hat. Looks twice as cool afterwards.'],
        ['Deep Sea Dance', 'A dance only crabs truly understand.'],
        ['Sandcastle Build', 'Builds a perfect sandcastle in three seconds.'],
        ['Tidal Wave', 'Wiggles so hard that the seagrass sways along.'],
        ['Pearl Polish', 'Polishes its shell until it shines like a pearl.'],
        ['Pinch-Pinch', 'Pinches very gently – just to say hello.'],
        ['Current Rider', 'Lets the current carry it right across the reef.'],
      ],
      'tc.flavors': [
        'Last seen hunting for treasure.',
        'Secretly collects shiny shells.',
        'Has never lost a dance contest.',
        'Loves to sleep next to the giant clam.',
        'Dreams of seeing the surface one day.',
        'Knows every fish in the reef by name.',
        'Waves at everyone who swims by.',
        'Claims to have touched the golden star.',
      ],

      // Seltenheiten
      'tier.common': 'Common', 'tier.uncommon': 'Uncommon', 'tier.rare': 'Rare',
      'tier.epic': 'Epic', 'tier.legendary': 'Legendary', 'tier.mythic': 'Mythic',
      // Hüte
      'hat.none': 'No hat', 'hat.beanie': 'Bobble hat', 'hat.cap': 'Baseball cap',
      'hat.sailor': 'Sailor hat', 'hat.propeller': 'Propeller hat', 'hat.flower': 'Sea flower',
      'hat.tophat': 'Top hat', 'hat.pirate': 'Pirate hat', 'hat.viking': 'Viking helmet',
      'hat.wizard': 'Wizard hat', 'hat.shark': 'Shark fin',
      'hat.crown': 'Golden crown', 'hat.halo': 'Halo', 'hat.starcrown': 'Star crown',
      // Wachstums-Stufen
      'stage.baby': 'Baby', 'stage.jung': 'Youngling', 'stage.halbstark': 'Teen', 'stage.gross': 'Grown-up',
      // Schalen & Muster
      'shell.0': 'Orange', 'shell.1': 'Red', 'shell.2': 'Coral', 'shell.3': 'Gold', 'shell.4': 'Blue', 'shell.5': 'Purple',
      'pattern.0': 'Plain', 'pattern.1': 'Dots', 'pattern.2': 'Stripes', 'pattern.3': 'Freckles', 'pattern.4': 'Belly spot',
    },
  };

  function pickLang() {
    var p = null, saved = null;
    try { p = new URLSearchParams(location.search).get('lang'); } catch (e) { /* alt */ }
    if (LANGS.indexOf(p) >= 0) return p;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* gesperrt */ }
    if (LANGS.indexOf(saved) >= 0) return saved;
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^de\b/i.test(nav) ? 'de' : 'en';
  }

  var lang = pickLang();
  document.documentElement.lang = lang;

  /** Text holen. fallback: falls es den Schlüssel in dieser Sprache nicht gibt (z. B. Hutnamen auf Deutsch). */
  function t(key, vars, fallback) {
    var v = DICT[lang][key];
    if (v === undefined) v = fallback !== undefined ? fallback : DICT.de[key];
    if (v === undefined) return key;
    if (typeof v === 'function') return v(vars || {});
    if (typeof v !== 'string' || !vars) return v;
    return v.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
  }

  /** Alle markierten Texte in root übersetzen. */
  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    root.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var p = pair.split(':');
        el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    root.querySelectorAll('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
  }

  /** Sprache wechseln: merken und die Seite neu laden (alles wird frisch in der neuen Sprache gebaut). */
  function set(l) {
    if (LANGS.indexOf(l) < 0 || l === lang) return;
    try { localStorage.setItem(KEY, l); } catch (e) { /* gesperrt: dann eben über die Adresse */ }
    var url = new URL(location.href);
    url.searchParams.set('lang', l);
    location.replace(url.toString());
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang]');
    if (b) { e.preventDefault(); set(b.getAttribute('data-lang')); }
  });

  window.I18N = {
    lang: lang,
    locale: lang === 'de' ? 'de-DE' : 'en-US',
    t: t, apply: apply, set: set, an: an, ord: ord,
  };
})();
