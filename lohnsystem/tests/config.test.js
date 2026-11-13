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
  assert.strictEqual(c.mindestloehne[0].gueltigAbSaison, '2027-05-01');
  assert.strictEqual(c.abteilungen.length, 7);
  assert.deepStrictEqual(c.zusatzbausteine, []);
  assert.strictEqual(c.betrieb.wochenstunden, 43.5);
  const anzahl = { reception: 11, housekeeping: 9, kueche: 14, service: 14, spa: 8, technik: 7, administration: 12 };
  for (const a of c.abteilungen) {
    assert.strictEqual(c.funktionen.filter((f) => f.abteilung === a.id).length, anzahl[a.id], a.id);
  }
  assert.strictEqual(c.betrieb.baenderBestaetigt, true);
  assert.strictEqual(c.funktionen.length, 75);
  assert.strictEqual(new Set(c.funktionen.map((f) => f.id)).size, 75);
  for (const f of c.funktionen) {
    assert.notStrictEqual(f.beispiel, true, f.id);
    assert.ok(f.id.startsWith(f.abteilung + '-'), f.id);
    assert.ok(f.bandMin < f.bandMax, f.id);
    if (['kueche', 'technik'].includes(f.abteilung)) assert.strictEqual(f.gaestekontakt, false, f.id);
    if (['reception', 'service', 'spa'].includes(f.abteilung)) assert.strictEqual(f.gaestekontakt, true, f.id);
  }
  for (const a of c.abteilungen) {
    const labels = c.funktionen.filter((f) => f.abteilung === a.id).map((f) => f.label);
    assert.strictEqual(new Set(labels).size, labels.length, 'Labels doppelt in ' + a.id);
  }
  const lab = (id) => c.funktionen.find((f) => f.id === id).label;
  assert.strictEqual(lab('reception-receptionist'), 'Receptionist');
  assert.strictEqual(lab('kueche-koch-efz'), 'Cuisinier');
  assert.strictEqual(lab('kueche-kuechenangestellte-eba'), 'Commis de cuisine (Einstieg)');
  assert.strictEqual(lab('service-restaurationsfachfrau-efz'), 'Demi-chef de rang');
  assert.strictEqual(lab('technik-leitung'), 'Head of Engineering');
  const neu = {
    'reception-chauffeur': ['Chauffeur', true, 3735, 4050],
    'reception-guest-relations': ['Guest Relations Agent', true, 4555, 4900],
    'housekeeping-laundry-supervisor': ['Laundry Supervisor', false, 4555, 4900],
    'kueche-saucier': ['Saucier', false, 4663, 5000],
    'kueche-entremetier': ['Entremetier', false, 4663, 5000],
    'kueche-garde-manger': ['Garde-manger', false, 4663, 5000],
    'kueche-tournant': ['Tournant', false, 4663, 5000],
    'kueche-cuisinier-fruehstueck': ['Cuisinier au petit-déjeuner', false, 4555, 4900],
    'service-sommelier': ['Sommelier', true, 4663, 5000],
    'service-chef-de-rang': ['Chef de rang', true, 4663, 5000],
    'service-commis-de-bar': ['Commis de bar', true, 4094, 4450],
    'spa-fitness-trainer': ['Fitness Trainer', true, 4555, 4900],
    'spa-physiotherapist': ['Physiotherapist', true, 4555, 4900],
    'technik-electrician': ['Electrician', false, 4555, 4900],
    'administration-revenue-manager': ['Revenue Manager', false, 5325, 5700],
    'administration-event-manager': ['Event Manager', true, 5325, 5700],
    'administration-it-manager': ['IT Manager', false, 5325, 5700],
    'administration-reservations-manager': ['Reservations Manager', false, 5325, 5700],
  };
  for (const [id, [label, g, min, max]] of Object.entries(neu)) {
    const f = c.funktionen.find((x) => x.id === id);
    assert.ok(f, id);
    assert.strictEqual(f.label, label, id);
    assert.strictEqual(f.gaestekontakt, g, id);
    assert.strictEqual(f.bandMin, min, id);
    assert.strictEqual(f.bandMax, max, id);
  }
  const gk = (id) => c.funktionen.find((f) => f.id === id).gaestekontakt;
  assert.strictEqual(gk('housekeeping-hausbursche'), false);
  assert.strictEqual(gk('housekeeping-lingerie'), false);
  assert.strictEqual(gk('housekeeping-gouvernante'), true);
  assert.strictEqual(gk('administration-sales-marketing'), true);
  assert.strictEqual(gk('administration-marketingfachperson'), true);
  assert.strictEqual(gk('administration-buchhalter'), false);
  const rec = c.funktionen.find((f) => f.id === 'reception-receptionist');
  assert.strictEqual(rec.bandMin, 4555);
  assert.strictEqual(rec.bandMax, 4900);
});

test('alle Funktionen einer Stufe teilen dasselbe Einstiegsband', () => {
  const c = ladeStandardkonfiguration();
  const paare = new Set(c.funktionen.map((f) => f.bandMin + '-' + f.bandMax));
  assert.deepStrictEqual([...paare].sort(),
    ['3735-4050', '4094-4450', '4555-4900', '4663-5000', '5325-5700']);
});

test('Küche: Chef-de-partie-Posten tragen Band IIIb (4663-5000), Sous-chef und Chef de cuisine bleiben IV', () => {
  const c = ladeStandardkonfiguration();
  const band = (id) => {
    const f = c.funktionen.find((x) => x.id === id);
    assert.ok(f, id);
    return [f.bandMin, f.bandMax];
  };
  for (const id of ['kueche-chef-de-partie', 'kueche-saucier', 'kueche-entremetier', 'kueche-garde-manger', 'kueche-tournant']) {
    assert.deepStrictEqual(band(id), [4663, 5000], id);
  }
  assert.deepStrictEqual(band('kueche-sous-chef'), [5325, 5700]);
  assert.deepStrictEqual(band('kueche-kuechenchef'), [5325, 5700]);
  assert.deepStrictEqual(band('kueche-demi-chef'), [4663, 5000]);
});

test('Bandzahl pro Einstiegsband: IIIb 9 Funktionen, IV 19 Funktionen', () => {
  const c = ladeStandardkonfiguration();
  const zaehl = (min, max) => c.funktionen.filter((f) => f.bandMin === min && f.bandMax === max).length;
  assert.strictEqual(zaehl(4663, 5000), 9);
  assert.strictEqual(zaehl(5325, 5700), 19);
  assert.strictEqual(zaehl(3735, 4050), 14);
  assert.strictEqual(zaehl(4094, 4450), 7);
  assert.strictEqual(zaehl(4555, 4900), 26);
});

test('fehlende Mindestlohn-Stufe wird abgelehnt', () => {
  const c = kopie();
  delete c.mindestloehne[0].stufen.IIIb;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('IIIb')));
});

test('bandMin grösser als bandMax wird abgelehnt', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 6000;
  c.funktionen[0].bandMax = 5000;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.length > 0);
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

test('bandMin unter Mindestlohn Ia: nur Warnung', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 3500;
  c.funktionen[0].bandMax = 6000;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.fehler, []);
  assert.strictEqual(r.warnungen.length, 1);
});

test('Band einer Stufe Ia (3735 bis 4500) ist ohne Warnung', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 3735;
  c.funktionen[0].bandMax = 4500;
  const r = validateConfig(c);
  assert.deepStrictEqual(r.warnungen, []);
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
  assert.strictEqual(bereich('technik-electrician'), null);
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
  assert.deepStrictEqual(kader, ['Chef de cuisine', 'Directeur de restaurant', 'Event Manager', 'Executive Housekeeper',
    'Front Office Manager', 'HR Manager', 'Head of Engineering', 'IT Manager', 'Marketing Manager',
    'Reservations Manager', 'Revenue Manager', 'Spa Manager']);
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
