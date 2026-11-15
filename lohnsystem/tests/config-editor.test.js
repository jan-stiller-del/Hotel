'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../src/config-editor.js');
const { validateConfig, parseConfigDatei, serializeConfig } = require('../src/config.js');

const DATEI = path.join(__dirname, '..', 'config', 'config.js');

function lade() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(DATEI, 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.LOHN_CONFIG));
}

function tiefEinfrieren(x) {
  if (x && typeof x === 'object') {
    Object.values(x).forEach(tiefEinfrieren);
    Object.freeze(x);
  }
  return x;
}

const meldungsfrei = (r) => assert.ok(r.ok, r.fehler.join(' | '));

// ---- Jahrespflege ----

test('neueJahrestabelle 2028 mit 0,6 %: gerundete Werte, alte Tabelle bleibt', () => {
  const c = lade();
  const r = E.neueJahrestabelle(c, 2028, 0.6);
  meldungsfrei(r);
  assert.strictEqual(r.config.mindestloehne.length, 2);
  const neu = r.config.mindestloehne.find((t) => t.jahr === 2028);
  assert.strictEqual(neu.stufen.Ia, 3757);
  assert.strictEqual(neu.stufen.IIIa, 4582);
  assert.strictEqual(neu.stufen.IV, 5357);
  assert.strictEqual(neu.gueltigAbJahresbetrieb, '2028-01-01');
  assert.deepStrictEqual(r.config.mindestloehne.find((t) => t.jahr === 2027), c.mindestloehne[0]);
  assert.deepStrictEqual(r.fehler, []);
});

test('neueJahrestabelle lehnt doppeltes Jahr und unsinnige Teuerung ab', () => {
  const c = lade();
  const doppelt = E.neueJahrestabelle(c, 2027, 1);
  assert.strictEqual(doppelt.ok, false);
  assert.match(doppelt.fehler[0], /2027.*schon/);
  assert.strictEqual(doppelt.config, c);
  assert.strictEqual(E.neueJahrestabelle(c, 2028, 25).ok, false);
  assert.strictEqual(E.neueJahrestabelle(c, 2028, -6).ok, false);
  assert.strictEqual(E.neueJahrestabelle(c, 2028, NaN).ok, false);
  assert.strictEqual(E.neueJahrestabelle(c, 2028.5, 1).ok, false);
  assert.strictEqual(E.neueJahrestabelle(c, 2028, 0).ok, true);
  assert.strictEqual(E.neueJahrestabelle(c, 2028, -5).ok, true);
  assert.strictEqual(E.neueJahrestabelle(c, 2028, 5).ok, true);
  // 20 % Teuerung bringt den Mindestlohn der Stufe IV über das Bandmaximum 5700: Fehler, erst das Band anheben.
  assert.strictEqual(E.neueJahrestabelle(c, 2028, 20).ok, false);
});

test('setzeMindestlohn und setzeStichtage', () => {
  const c = lade();
  const r = E.setzeMindestlohn(c, 2027, 'Ia', 3800);
  meldungsfrei(r);
  assert.strictEqual(r.config.mindestloehne[0].stufen.Ia, 3800);
  assert.strictEqual(E.setzeMindestlohn(c, 2027, 'Ia', 0).ok, false);
  assert.strictEqual(E.setzeMindestlohn(c, 2027, 'X', 3800).ok, false);
  assert.strictEqual(E.setzeMindestlohn(c, 1999, 'Ia', 3800).ok, false);
  const s = E.setzeStichtage(c, 2027, '2027-02-01');
  meldungsfrei(s);
  assert.strictEqual(s.config.mindestloehne[0].gueltigAbJahresbetrieb, '2027-02-01');
  assert.strictEqual(E.setzeStichtage(c, 2027, '2027-13-01').ok, false);
  assert.strictEqual(E.setzeStichtage(c, 2027, '2027-02-30').ok, false);
  assert.strictEqual(E.setzeStichtage(c, 2027, '1.2.2027').ok, false);
});

// ---- Stufen ----

test('setzeStufe: Spielraum aufsteigend, nicht negativ, nicht für Praktikum', () => {
  const c = lade();
  const ok = E.setzeStufe(c, 'IIIa', { spielraum: { vorgesetzte: 1, hr: 2, gm: 3 } });
  meldungsfrei(ok);
  assert.deepStrictEqual(ok.config.stufen.IIIa.spielraum, { vorgesetzte: 1, hr: 2, gm: 3 });
  const absteigend = E.setzeStufe(c, 'IIIa', { spielraum: { vorgesetzte: 3, hr: 2, gm: 1 } });
  assert.strictEqual(absteigend.ok, false);
  assert.match(absteigend.fehler[0], /aufsteigend/);
  assert.strictEqual(E.setzeStufe(c, 'IIIa', { spielraum: { vorgesetzte: -1, hr: 2, gm: 3 } }).ok, false);
  assert.strictEqual(E.setzeStufe(c, 'IIIa', { spielraum: { vorgesetzte: 1, hr: 2, gm: 21 } }).ok, false);
  assert.strictEqual(E.setzeStufe(c, 'IIIa', { spielraum: { vorgesetzte: 1, hr: 2 } }).ok, false);
  assert.strictEqual(E.setzeStufe(c, 'P', { spielraum: { vorgesetzte: 1, hr: 2, gm: 3 } }).ok, false);
});

test('setzeStufe: Erklärung ändern, leere Erklärung abgelehnt', () => {
  const c = lade();
  const r = E.setzeStufe(c, 'II', { erklaerung: '  EBA, zweijährig ' });
  meldungsfrei(r);
  assert.strictEqual(r.config.stufen.II.erklaerung, 'EBA, zweijährig');
  assert.strictEqual(E.setzeStufe(c, 'II', { erklaerung: '  ' }).ok, false);
  assert.strictEqual(E.setzeStufe(c, 'II', { unbekannt: 1 }).ok, false);
});

// ---- Funktionen ----

test('aktualisiereFunktion: Bereich und Kader, Bandfelder gibt es bei der Funktion nicht mehr', () => {
  const c = lade();
  const id = 'kueche-commis';
  for (const feld of [{ bandMin: 4600 }, { bandMax: 5000 }, { bandAlsUntergrenze: true }]) {
    assert.strictEqual(E.aktualisiereFunktion(c, id, feld).ok, false, JSON.stringify(feld));
  }
  assert.strictEqual(E.aktualisiereFunktion(c, id, { bereich: 'gibtsnicht' }).ok, false);
  assert.strictEqual(E.aktualisiereFunktion(c, id, { abteilung: 'gibtsnicht' }).ok, false);
  assert.strictEqual(E.aktualisiereFunktion(c, 'gibtsnicht', { label: 'x' }).ok, false);
  const kader = E.aktualisiereFunktion(c, id, { kader: true });
  meldungsfrei(kader);
  assert.strictEqual(kader.config.funktionen.find((x) => x.id === id).kader, true);
  const zurueck = E.aktualisiereFunktion(kader.config, id, { kader: false });
  meldungsfrei(zurueck);
  assert.ok(!zurueck.config.funktionen.find((x) => x.id === id).kader);
  const bereichNull = E.aktualisiereFunktion(c, id, { bereich: null });
  meldungsfrei(bereichNull);
});

test('fuegeFunktionHinzu: doppelte ID abgelehnt, erzeugte ID eindeutig', () => {
  const c = lade();
  const neu = { abteilung: 'kueche', bereich: 'kueche', label: 'Chef de partie Spezial', gaestekontakt: false };
  const a = E.fuegeFunktionHinzu(c, neu);
  meldungsfrei(a);
  assert.strictEqual(a.config.funktionen.length, c.funktionen.length + 1);
  const eintrag = a.config.funktionen[a.config.funktionen.length - 1];
  assert.strictEqual(eintrag.id, 'kueche-chef-de-partie-spezial');
  const b = E.fuegeFunktionHinzu(a.config, neu);
  meldungsfrei(b);
  const ids = b.config.funktionen.map((f) => f.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.strictEqual(ids[ids.length - 1], 'kueche-chef-de-partie-spezial-2');
  const dup = E.fuegeFunktionHinzu(c, Object.assign({ id: 'kueche-commis' }, neu));
  assert.strictEqual(dup.ok, false);
  assert.match(dup.fehler[0], /schon/);
  assert.strictEqual(E.fuegeFunktionHinzu(c, Object.assign({}, neu, { label: '' })).ok, false);
  assert.strictEqual(E.fuegeFunktionHinzu(c, Object.assign({}, neu, { bandMin: 5000, bandMax: 4000 })).ok, false); // Bandfelder sind unbekannt
  assert.strictEqual(E.fuegeFunktionHinzu(c, Object.assign({}, neu, { bereich: 'x' })).ok, false);
});

test('entferneFunktion', () => {
  const c = lade();
  const r = E.entferneFunktion(c, 'kueche-commis');
  meldungsfrei(r);
  assert.strictEqual(r.config.funktionen.length, c.funktionen.length - 1);
  assert.strictEqual(E.entferneFunktion(c, 'gibtsnicht').ok, false);
});

// ---- Bausteine, Betrieb, Zusatzbausteine ----

test('setzeBausteine', () => {
  const c = lade();
  const r = E.setzeBausteine(c, { erfahrungProJahr: 15, spracheProSprache: 25, maxSprachen: 3, sprachen: ['DE', 'EN'], mindestNiveau: 'C1' });
  meldungsfrei(r);
  assert.strictEqual(r.config.bausteine.erfahrungProJahr, 15);
  assert.deepStrictEqual(r.config.bausteine.sprachen, ['DE', 'EN']);
  assert.strictEqual(E.setzeBausteine(c, { erfahrungProJahr: -1 }).ok, false);
  assert.strictEqual(E.setzeBausteine(c, { maxSprachen: 0 }).ok, false);
  assert.strictEqual(E.setzeBausteine(c, { sprachen: ['XX'] }).ok, false);
  assert.strictEqual(E.setzeBausteine(c, { mindestNiveau: 'Z9' }).ok, false);
});

test('setzeBetrieb: gleiche Regeln wie validateConfig', () => {
  const c = lade();
  const r = E.setzeBetrieb(c, { wochenstunden: 42, dreizehnterInklPauschale: false, baenderBestaetigt: false });
  meldungsfrei(r);
  assert.strictEqual(r.config.betrieb.wochenstunden, 42);
  assert.strictEqual(r.config.betrieb.dreizehnterInklPauschale, false);
  assert.strictEqual(E.setzeBetrieb(c, { wochenstunden: 0 }).ok, false);
  assert.strictEqual(E.setzeBetrieb(c, { kaderWochenstunden: 43.5 }).ok, false);
  assert.strictEqual(E.setzeBetrieb(c, { kaderWochenstunden: 51 }).ok, false);
  assert.strictEqual(E.setzeBetrieb(c, { ueberstundenSatz: 0.5 }).ok, false);
  assert.strictEqual(E.setzeBetrieb(c, { ueberstundenGrenze6750: 0 }).ok, false);
  assert.strictEqual(E.setzeBetrieb(c, { dreizehnterInklPauschale: 'ja' }).ok, false);
  assert.strictEqual(E.setzeBetrieb(c, { einarbeitungMaxProzent: 120 }).ok, false);
  assert.strictEqual(E.setzeBetrieb(c, { name: 'X' }).ok, false);
});

test('fuegeBausteinHinzu: Entschädigungen akzeptiert, Konfiguration bleibt gültig', () => {
  const c = lade();
  const a = E.fuegeBausteinHinzu(c, { id: 'spesen', label: 'Spesen', art: 'entschaedigung', betrag: 150 });
  meldungsfrei(a);
  const b = E.fuegeBausteinHinzu(a.config, { id: 'it-mittel-privat', label: 'IT-Mittel private', art: 'entschaedigung', betrag: 40 });
  meldungsfrei(b);
  assert.strictEqual(b.config.zusatzbausteine.length, 7);
  assert.strictEqual(validateConfig(b.config).ok, true);
  const lohn = E.fuegeBausteinHinzu(b.config, { id: 'zulage', label: 'Zulage', art: 'lohn', betrag: 0 });
  meldungsfrei(lohn);
});

test('fuegeBausteinHinzu: doppelte ID, unbekannte Art, Betrag, Bezeichnung abgelehnt', () => {
  const c = lade();
  const a = E.fuegeBausteinHinzu(c, { id: 'spesen', label: 'Spesen', art: 'entschaedigung', betrag: 150 }).config;
  assert.strictEqual(E.fuegeBausteinHinzu(a, { id: 'spesen', label: 'Nochmal', art: 'lohn', betrag: 1 }).ok, false);
  assert.strictEqual(E.fuegeBausteinHinzu(c, { id: 'x', label: 'X', art: 'sonstiges', betrag: 1 }).ok, false);
  assert.strictEqual(E.fuegeBausteinHinzu(c, { id: 'x', label: 'X', art: 'lohn', betrag: -1 }).ok, false);
  assert.strictEqual(E.fuegeBausteinHinzu(c, { id: 'x', label: ' ', art: 'lohn', betrag: 1 }).ok, false);
  assert.strictEqual(E.fuegeBausteinHinzu(c, { id: '', label: 'X', art: 'lohn', betrag: 1 }).ok, false);
});

test('entferneBaustein', () => {
  const c = E.fuegeBausteinHinzu(lade(), { id: 'spesen', label: 'Spesen', art: 'entschaedigung', betrag: 150 }).config;
  const r = E.entferneBaustein(c, 'spesen');
  meldungsfrei(r);
  assert.deepStrictEqual(r.config.zusatzbausteine.map((z) => z.id), ['kader-handy', 'kader-spesen', 'handy-mitarbeiter', 'waesche-kleidung', 'waesche-schuerze']);
  assert.strictEqual(E.entferneBaustein(c, 'gibtsnicht').ok, false);
});

// ---- Eingabe bleibt unverändert ----

test('alle Funktionen lassen die (tief eingefrorene) Eingabe unverändert', () => {
  const c = tiefEinfrieren(lade());
  const vorher = JSON.stringify(c);
  const aufrufe = [
    () => E.neueJahrestabelle(c, 2028, 0.6),
    () => E.neueJahrestabelle(c, 2027, 0.6),
    () => E.setzeMindestlohn(c, 2027, 'Ia', 3800),
    () => E.setzeStichtage(c, 2027, '2027-02-01'),
    () => E.setzeStufe(c, 'Ia', { erklaerung: 'neu', spielraum: { vorgesetzte: 1, hr: 2, gm: 4 } }),
    () => E.setzeStufe(c, 'Ia', { spielraum: { vorgesetzte: 3, hr: 2, gm: 1 } }),
    () => E.aktualisiereFunktion(c, 'kueche-commis', { label: '', kader: true }),
    () => E.aktualisiereFunktion(c, 'kueche-commis', { bereich: 'x' }),
    () => E.fuegeFunktionHinzu(c, { abteilung: 'kueche', label: '' }),
    () => E.setzeBand(c, 'IIIa', { max: 5000 }),
    () => E.entferneFunktion(c, 'kueche-commis'),
    () => E.setzeBausteine(c, { erfahrungProJahr: 12 }),
    () => E.setzeBetrieb(c, { wochenstunden: 42 }),
    () => E.fuegeBausteinHinzu(c, { id: 'a', label: 'A', art: 'lohn', betrag: 1 }),
    () => E.entferneBaustein(c, 'a'),
  ];
  aufrufe.forEach((f) => { f(); });
  assert.strictEqual(JSON.stringify(c), vorher);
  // Ergebnis ist eine eigene Kopie, nicht die Eingabe
  const r = E.setzeBetrieb(c, { wochenstunden: 42 });
  assert.notStrictEqual(r.config, c);
  assert.notStrictEqual(r.config.betrieb, c.betrieb);
});

// ---- Import und Vergleich ----

test('ausgelieferte config.js: lesen, schreiben, wieder lesen ergibt dasselbe', () => {
  const text = fs.readFileSync(DATEI, 'utf8');
  const a = parseConfigDatei(text);
  assert.deepStrictEqual(a, lade());
  const b = parseConfigDatei(serializeConfig(a));
  assert.deepStrictEqual(b, a);
  assert.strictEqual(validateConfig(a).ok, true);
});

test('unterscheidet erkennt Änderungen, nicht gleiche Kopien', () => {
  const c = lade();
  assert.strictEqual(E.unterscheidet(c, JSON.parse(JSON.stringify(c))), false);
  const r = E.setzeBetrieb(c, { wochenstunden: 42 });
  assert.strictEqual(E.unterscheidet(r.config, c), true);
});

test('setzeBand: Stufenmaximum und Häkchen ändern', () => {
  const c = lade();
  const ok = E.setzeBand(c, 'IIIa', { max: 5000, ueberschreitbar: true });
  meldungsfrei(ok);
  assert.strictEqual(ok.config.lohnbaender.IIIa.max, 5000);
  assert.strictEqual(ok.config.lohnbaender.IIIa.ueberschreitbar, true);
  const aus = E.setzeBand(ok.config, 'IIIa', { ueberschreitbar: false });
  meldungsfrei(aus);
  assert.ok(!aus.config.lohnbaender.IIIa.ueberschreitbar);
  assert.strictEqual(c.lohnbaender.IIIa.max, 4900);
});

test('setzeBand: Fehlerfälle', () => {
  const c = lade();
  for (const [id, patch] of [['IIIa', { max: 0 }], ['IIIa', { max: 'x' }], ['IIIa', { min: 4000 }], ['IIIa', { ueberschreitbar: 'ja' }],
    ['gibtsnicht', { max: 5000 }], ['IIIa', { max: 4000 }], ['IIIa', { gibtsnicht: 1 }], ['P', { max: 3000 }]]) {
    const r = E.setzeBand(c, id, patch);
    assert.strictEqual(r.ok, false, id + JSON.stringify(patch));
    assert.strictEqual(r.config, c);
  }
});

test('setzeBand: Kaderband Minimum, Maximum und Häkchen', () => {
  const c = lade();
  const ok = E.setzeBand(c, 'kader', { min: 6500, max: 8000, ueberschreitbar: false });
  meldungsfrei(ok);
  assert.deepStrictEqual(ok.config.lohnbaender.kader, { min: 6500, max: 8000, ueberschreitbar: false });
  assert.strictEqual(E.setzeBand(c, 'kader', { min: 9000 }).ok, false);
  assert.strictEqual(E.setzeBand(c, 'kader', { max: 5000 }).ok, false);
});

test('aktualisiereFunktion: bandAlsUntergrenze ist ein unbekanntes Feld', () => {
  const r = E.aktualisiereFunktion(lade(), 'kueche-commis', { bandAlsUntergrenze: true });
  assert.strictEqual(r.ok, false);
});
