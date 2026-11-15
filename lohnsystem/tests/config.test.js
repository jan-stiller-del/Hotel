'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  validateConfig, parseConfigDatei, serializeConfig, STUFEN,
} = require('../src/config.js');

function ladeStandardkonfiguration() {
  const text = fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(text, sandbox);
  // JSON-Kopie, damit Objekte aus dem vm-Kontext normale Prototypen haben
  return JSON.parse(JSON.stringify(sandbox.window.LOHN_CONFIG));
}

function kopie() {
  return JSON.parse(JSON.stringify(ladeStandardkonfiguration()));
}

test('STUFEN enthält die sieben Stufen', () => {
  assert.deepStrictEqual(STUFEN, ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV', 'P']);
});

test('Standardkonfiguration wird akzeptiert, ohne Warnungen', () => {
  const r = validateConfig(ladeStandardkonfiguration());
  assert.deepStrictEqual(r.fehler, []);
  assert.deepStrictEqual(r.warnungen, []);
  assert.strictEqual(r.ok, true);
});

test('Standardkonfiguration: Inhalt gemäss Vorgabe', () => {
  const c = ladeStandardkonfiguration();
  assert.deepStrictEqual(c.mindestloehne[0].stufen,
    { Ia: 3735, Ib: 3967, II: 4094, IIIa: 4555, IIIb: 4663, IV: 5325, P: 2404 });
  assert.strictEqual(c.mindestloehne[0].gueltigAbJahresbetrieb, '2027-01-01');
  assert.strictEqual(c.abteilungen.length, 7);
  assert.deepStrictEqual(c.zusatzbausteine.map((z) => [z.id, z.art, z.betrag, z.nurKader]),
    [['kader-handy', 'entschaedigung', 20, true], ['kader-spesen', 'entschaedigung', 200, true], ['handy-mitarbeiter', 'entschaedigung', 5, undefined],
     ['waesche-kleidung', 'entschaedigung', 50, undefined], ['waesche-schuerze', 'entschaedigung', 20, undefined]]);
  assert.strictEqual(c.betrieb.wochenstunden, 43.5);
  const anzahl = { reception: 12, housekeeping: 7, kueche: 8, service: 10, spa: 7, technik: 4, administration: 10 };
  for (const a of c.abteilungen) {
    assert.strictEqual(c.funktionen.filter((f) => f.abteilung === a.id).length, anzahl[a.id], a.id);
  }
  assert.strictEqual(c.betrieb.baenderBestaetigt, true);
  assert.strictEqual(c.funktionen.length, 58);
  assert.strictEqual(new Set(c.funktionen.map((f) => f.id)).size, 58);
  for (const f of c.funktionen) {
    assert.notStrictEqual(f.beispiel, true, f.id);
    assert.ok(f.id.startsWith(f.abteilung + '-'), f.id);
    assert.strictEqual(f.bandMin, undefined, f.id);
    assert.strictEqual(f.bandMax, undefined, f.id);
    assert.strictEqual(f.bandAlsUntergrenze, undefined, f.id);
    if (['kueche', 'technik'].includes(f.abteilung)) assert.strictEqual(f.gaestekontakt, false, f.id);
    if (['reception', 'service', 'spa'].includes(f.abteilung)) assert.strictEqual(f.gaestekontakt, true, f.id);
  }
  for (const a of c.abteilungen) {
    const labels = c.funktionen.filter((f) => f.abteilung === a.id).map((f) => f.label);
    assert.strictEqual(new Set(labels).size, labels.length, 'Labels doppelt in ' + a.id);
  }
  const lab = (id) => c.funktionen.find((f) => f.id === id).label;
  assert.strictEqual(lab('reception-receptionist'), 'Receptionist');
  assert.strictEqual(lab('kueche-kuechenhilfe'), 'Allrounder Küche / Casserollier');
  assert.strictEqual(lab('kueche-commis'), 'Commis de cuisine');
  assert.strictEqual(lab('service-restaurationsfachfrau-efz'), 'Demi-chef de rang');
  assert.strictEqual(lab('technik-leitung'), 'Head of Engineering');
  const neu = {
    'reception-guest-relations': ['Guest Relations Agent', true, 4555, 4900],
    'housekeeping-laundry-supervisor': ['Laundry Supervisor', false, 4555, 4900],
    'kueche-tournant': ['Tournant', false, 4663, 5100],
    'service-sommelier': ['Sommelier', true, 4663, 5000],
    'service-chef-de-rang': ['Chef de rang', true, 4663, 5000],
    'spa-fitness-trainer': ['Fitness Trainer', true, 4555, 4900],
    'spa-physiotherapist': ['Physiotherapist', true, 4555, 4900],
    'administration-revenue-manager': ['Revenue Manager', false, 5325, 5700],
    'administration-event-manager': ['Event Manager', true, 5325, 5700],
    'administration-it-manager': ['IT Manager', false, 5325, 5700],
    'reception-reservations-manager': ['Reservations Manager', true, 5325, 5700],
  };
  for (const [id, [label, g]] of Object.entries(neu)) {
    const f = c.funktionen.find((x) => x.id === id);
    assert.ok(f, id);
    assert.strictEqual(f.label, label, id);
    assert.strictEqual(f.gaestekontakt, g, id);
  }
  const gk = (id) => c.funktionen.find((f) => f.id === id).gaestekontakt;
  assert.strictEqual(gk('housekeeping-gouvernante'), true);
  assert.strictEqual(gk('housekeeping-lingerie'), false);
  assert.strictEqual(gk('housekeeping-gouvernante'), true);
  assert.strictEqual(gk('administration-sales-marketing'), true);
  assert.strictEqual(gk('administration-marketingfachperson'), true);
  assert.strictEqual(gk('administration-buchhalter'), false);
});

test('Lohnbänder: Maxima pro Stufe und Kaderband', () => {
  const c = ladeStandardkonfiguration();
  const max = {};
  for (const s of ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV']) max[s] = c.lohnbaender[s].max;
  assert.deepStrictEqual(max, { Ia: 4050, Ib: 4450, II: 4450, IIIa: 4900, IIIb: 5000, IV: 5700 });
  assert.deepStrictEqual(c.lohnbaender.kader, { min: 6000, max: 7500, ueberschreitbar: true });
});

test('Kader-Funktionen: zehn Stück, alle teilen das Kaderband', () => {
  const c = ladeStandardkonfiguration();
  assert.strictEqual(c.funktionen.filter((f) => f.kader === true).length, 10);
});

test('fehlende Mindestlohn-Stufe wird abgelehnt', () => {
  const c = kopie();
  delete c.mindestloehne[0].stufen.IIIb;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('IIIb')));
});

test('fehlende Stufe in den Lohnbändern wird abgelehnt', () => {
  const c = kopie();
  delete c.lohnbaender.IIIb;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('IIIb')));
});

test('Kaderband mit Minimum über Maximum wird abgelehnt', () => {
  const c = kopie();
  c.lohnbaender.kader = { min: 8000, max: 7500, ueberschreitbar: true };
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('Kaderband')));
});

test('Stufenmaximum unter dem Mindestlohn der Stufe wird abgelehnt', () => {
  const c = kopie();
  c.lohnbaender.IIIa.max = 4000;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('IIIa')));
});

test('Maximum null oder keine Zahl wird abgelehnt', () => {
  for (const w of [0, 'x', -1]) {
    const c = kopie();
    c.lohnbaender.II.max = w;
    assert.strictEqual(validateConfig(c).ok, false);
  }
});

test('Standardkonfiguration: Sprachniveau A1 nichts, A2 halb, ab B1 voll', () => {
  const b = ladeStandardkonfiguration().bausteine;
  assert.strictEqual(b.mindestNiveau, 'B1');
  assert.strictEqual(b.teilNiveau, 'A2');
  assert.strictEqual(b.teilProzent, 50);
  assert.strictEqual(b.muttersprachFaktor, 2);
});

test('Lohnband: ueberschreitbar muss ja oder nein sein', () => {
  const c = kopie();
  c.lohnbaender.kader.ueberschreitbar = 'ja';
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('ja oder nein')));
});

test('Kaderband: Maximum unter dem höchsten Mindestlohn wird abgelehnt', () => {
  const c = kopie();
  c.lohnbaender.kader = { min: 4000, max: 5000, ueberschreitbar: true };
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('Kaderband') && t.includes('Mindestlohn')));
});

test('alte Bandfelder bei einer Funktion: gültig, aber Warnung', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 3500;
  c.funktionen[0].bandMax = 6000;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.warnungen.length, 1);
});

test('Funktion mit unbekannter Abteilung wird abgelehnt', () => {
  const c = kopie();
  c.funktionen[0].abteilung = 'gibt-es-nicht';
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('gibt-es-nicht')));
});

test('doppelte Funktions-ID wird abgelehnt', () => {
  const c = kopie();
  c.funktionen[1].id = c.funktionen[0].id;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes(c.funktionen[0].id)));
});

test('wochenstunden <= 0 wird abgelehnt', () => {
  for (const w of [0, -5]) {
    const c = kopie();
    c.betrieb.wochenstunden = w;
    const r = validateConfig(c);
    assert.strictEqual(r.ok, false);
    assert.ok(r.fehler.some((t) => t.includes('Wochenstunden')));
  }
});

test('Nicht-Objekt wird mit Fehler abgelehnt, ohne Absturz', () => {
  assert.strictEqual(validateConfig(null).ok, false);
  assert.strictEqual(validateConfig({}).ok, false);
});

test('parseConfigDatei(serializeConfig(c)) ergibt c', () => {
  const c = kopie();
  const text = serializeConfig(c);
  assert.ok(text.startsWith('window.LOHN_CONFIG = '));
  assert.ok(text.trimEnd().endsWith(';'));
  assert.deepStrictEqual(parseConfigDatei(text), c);
});

test('parseConfigDatei liest reines JSON', () => {
  const c = kopie();
  assert.deepStrictEqual(parseConfigDatei(JSON.stringify(c)), c);
});

test('parseConfigDatei wirft bei kaputtem Inhalt', () => {
  assert.throws(() => parseConfigDatei('kaputt'), /Konfigurationsdatei nicht lesbar/);
  assert.throws(() => parseConfigDatei('window.LOHN_CONFIG = {kaputt};'),
    /Konfigurationsdatei nicht lesbar/);
  assert.throws(() => parseConfigDatei(''), /Konfigurationsdatei nicht lesbar/);
});

test('Standardkonfiguration: Bereiche, Abschlüsse und Funktionsbereiche', () => {
  const k = ladeStandardkonfiguration();
  assert.deepStrictEqual(k.bereiche.map((b) => b.id),
    ['kueche', 'restauration', 'hotellerie', 'hotelempfang', 'backoffice', 'hotelkommunikation']);
  const ab = (id) => k.abschluesse.find((a) => a.id === id);
  assert.deepStrictEqual(ab('koch-efz').bereiche, ['kueche', 'restauration']);
  assert.strictEqual(ab('koch-efz').stufe, 'IIIa');
  assert.strictEqual(ab('progresso-allrounder').stufe, 'Ib');
  assert.strictEqual(ab('hf').stufe, null);
  assert.strictEqual(k.abschluesse.filter((a) => a.stufe === null).length, 4);
  const bereich = (id) => k.funktionen.find((f) => f.id === id).bereich;
  assert.strictEqual(bereich('reception-concierge'), 'hotelempfang');
  assert.strictEqual(bereich('housekeeping-gouvernante'), 'hotellerie');
  assert.strictEqual(bereich('kueche-sous-chef'), 'kueche');
  assert.strictEqual(bereich('service-sommelier'), 'restauration');
  assert.strictEqual(bereich('administration-sales-marketing'), 'backoffice');
  assert.strictEqual(bereich('spa-masseur'), null);
  assert.strictEqual(bereich('technik-leitung'), null);
});

test('Abschluss mit unbekannter Bereich-Id wird abgelehnt', () => {
  const c = kopie();
  c.abschluesse.find((a) => a.id === 'koch-efz').bereiche = ['kueche', 'gibt-es-nicht'];
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('gibt-es-nicht')));
});

test('Funktion mit unbekanntem Bereich wird abgelehnt', () => {
  const c = kopie();
  c.funktionen[0].bereich = 'gibt-es-nicht';
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('gibt-es-nicht')));
});

test('Funktion ohne Bereichsangabe wird abgelehnt, null ist erlaubt', () => {
  const c = kopie();
  delete c.funktionen[0].bereich;
  assert.strictEqual(validateConfig(c).ok, false);
  c.funktionen[0].bereich = null;
  assert.strictEqual(validateConfig(c).ok, true);
});

test('doppelte Abschluss-Id wird abgelehnt', () => {
  const c = kopie();
  c.abschluesse[1].id = c.abschluesse[0].id;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes(c.abschluesse[0].id)));
});

test('Abschluss mit ungültiger Stufe oder reservierter Id keiner wird abgelehnt', () => {
  const c = kopie();
  c.abschluesse[0].stufe = 'IIIb';
  assert.strictEqual(validateConfig(c).ok, false);
  const d = kopie();
  d.abschluesse[0].id = 'keiner';
  assert.strictEqual(validateConfig(d).ok, false);
});

test('Kader-Funktionen und Betriebswerte in der Standardkonfiguration', () => {
  const c = ladeStandardkonfiguration();
  assert.strictEqual(c.betrieb.kaderWochenstunden, 50);
  assert.strictEqual(c.betrieb.ueberstundenSatz, 1);
  assert.strictEqual(c.betrieb.ueberstundenGrenze6750, 6750);
  assert.strictEqual(c.betrieb.dreizehnterInklPauschale, true);
  const kader = c.funktionen.filter((f) => f.kader === true).map((f) => f.label).sort();
  assert.deepStrictEqual(kader, ['Chef de cuisine', 'Director of Sales and Marketing', 'Executive Housekeeper',
    'F&B Manager', 'Front Office Manager', 'HR Manager', 'Head of Engineering', 'IT Manager',
    'Rooms Division Manager', 'Spa Manager']);
  assert.strictEqual(c.funktionen.find((f) => f.label === 'Chef de partie').kader === true, false);
});

test('Kader-Werte werden validiert', () => {
  const fehler = (aendern) => { const c = kopie(); aendern(c.betrieb); return validateConfig(c); };
  assert.strictEqual(fehler((b) => { b.kaderWochenstunden = 43.5; }).ok, false);
  assert.strictEqual(fehler((b) => { b.kaderWochenstunden = 51; }).ok, false);
  assert.strictEqual(fehler((b) => { b.kaderWochenstunden = 'x'; }).ok, false);
  assert.strictEqual(fehler((b) => { b.ueberstundenSatz = 0.9; }).ok, false);
  assert.strictEqual(fehler((b) => { b.ueberstundenGrenze6750 = 0; }).ok, false);
  assert.strictEqual(fehler((b) => { b.dreizehnterInklPauschale = 'ja'; }).ok, false);
  assert.strictEqual(fehler((b) => { b.kaderWochenstunden = 44; b.ueberstundenSatz = 1.25; }).ok, true);
  const ohne = kopie();
  delete ohne.betrieb.kaderWochenstunden;
  const r = validateConfig(ohne);
  assert.strictEqual(r.ok, false); // Kader-Funktionen ohne Betriebswerte
  ohne.funktionen.forEach((f) => { f.kader = false; });
  assert.strictEqual(validateConfig(ohne).ok, true);
});

const { stufeMitErklaerung, stufeErklaerung } = require('../src/config.js');

test('Standardkonfiguration: jede Stufe hat die vorgegebene Erklärung', () => {
  const c = ladeStandardkonfiguration();
  assert.deepStrictEqual(STUFEN.map((s) => c.stufen[s].erklaerung), [
    'ohne Berufslehre',
    'ohne Berufslehre, mit Progresso-Abschluss',
    'zweijährige Grundbildung (EBA)',
    'Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)',
    'EFZ plus 6 Tage berufsspezifische Weiterbildung',
    'Berufsprüfung (eidg. Fachausweis)',
    'Praktikant/in einer anerkannten Hotelfachschule',
  ]);
});

test('validateConfig: fehlende Erklärung einer Stufe ist ein Fehler', () => {
  const c = kopie();
  delete c.stufen.IIIa.erklaerung;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((f) => /Erklärung/.test(f) && /IIIa/.test(f)));
  const c2 = kopie();
  c2.stufen.P.erklaerung = '  ';
  assert.ok(validateConfig(c2).fehler.some((f) => /Erklärung/.test(f) && /\bP\b/.test(f)));
});

test('stufeMitErklaerung: Stufe mit Erklärung, Praktikum, fehlende Erklärung, unbekannte Stufe', () => {
  const c = ladeStandardkonfiguration();
  assert.strictEqual(stufeMitErklaerung(c, 'IIIa'), 'Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)');
  assert.strictEqual(stufeMitErklaerung(c, 'P'), 'Praktikum, Praktikant/in einer anerkannten Hotelfachschule');
  delete c.stufen.IIIa.erklaerung;
  assert.strictEqual(stufeMitErklaerung(c, 'IIIa'), 'Stufe IIIa');
  assert.strictEqual(stufeMitErklaerung(c, 'X'), 'Stufe X');
  assert.strictEqual(stufeMitErklaerung({}, 'IIIa'), 'Stufe IIIa');
  assert.strictEqual(stufeMitErklaerung(null, 'IIIa'), 'Stufe IIIa');
  assert.strictEqual(stufeErklaerung(ladeStandardkonfiguration(), 'II'), 'zweijährige Grundbildung (EBA)');
  assert.strictEqual(stufeErklaerung(c, 'IIIa'), '');
});

test('parseConfigDatei liest die ausgelieferte config.js mit Kommentaren', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8');
  assert.ok(/^\s*\/\//m.test(text), 'Testvoraussetzung: Datei enthält Zeilenkommentare');
  assert.deepStrictEqual(parseConfigDatei(text), ladeStandardkonfiguration());
});

test('parseConfigDatei entfernt Zeilen- und Blockkommentare ausserhalb von Strings', () => {
  const text = '// Kopf mit = Zeichen\nwindow.LOHN_CONFIG = {\n  /* Block\n  über Zeilen */\n  "a": 1, // Rest\n  "b": [2, /* mitten */ 3]\n};\n';
  assert.deepStrictEqual(parseConfigDatei(text), { a: 1, b: [2, 3] });
});

test('parseConfigDatei lässt // und /* in Strings stehen', () => {
  const text = 'window.LOHN_CONFIG = { "url": "http://example.ch/x", "k": "a // b /* c */", "q": "mit \\" // Quote" }; // Ende';
  assert.deepStrictEqual(parseConfigDatei(text),
    { url: 'http://example.ch/x', k: 'a // b /* c */', q: 'mit " // Quote' });
});

test('parseConfigDatei: unbeendeter Blockkommentar ist nicht lesbar', () => {
  assert.throws(() => parseConfigDatei('window.LOHN_CONFIG = {"a":1} /* offen'),
    /Konfigurationsdatei nicht lesbar/);
});
