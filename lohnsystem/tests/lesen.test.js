'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { baueLeseModell, zeigeBaenderHinweis } = require('../src/lesen-app.js');

function standardConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.LOHN_CONFIG));
}

test('Standardkonfiguration ergibt Modell ohne Fehler, 7 Abteilungen, 75 Funktionen', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  assert.equal(m.fehler, undefined);
  assert.equal(m.baender.length, 7);
  assert.equal(m.baender.reduce((s, b) => s + b.funktionen.length, 0), 75);
  assert.equal(m.jahr, 2027);
  assert.equal(m.gueltigAb, '2027-01-01');
});

test('Mindestloehne der zum Datum gueltigen Tabelle, mit Stufenbezeichnung', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  const iiia = m.mindestloehne.filter((x) => x.stufe === 'IIIa')[0];
  assert.equal(iiia.betrag, 4555);
  assert.equal(iiia.label, 'Stufe IIIa');
  assert.equal(m.mindestloehne.length, 7);
});

test('Band der Receptionist-Funktion und Gaestekontakt', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  const reception = m.baender.filter((b) => b.abteilung === 'Réception und Reservation')[0];
  const r = reception.funktionen.filter((f) => f.label === 'Receptionist')[0];
  assert.equal(r.bandMin, 4555);
  assert.equal(r.bandMax, 4900);
  assert.equal(r.gaestekontakt, true);
  const kueche = m.baender.filter((b) => b.abteilung === 'Küche')[0];
  assert.equal(kueche.funktionen[0].gaestekontakt, false);
});

test('Regeln der Zuschlaege aus der Konfiguration', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  assert.equal(m.regeln.erfahrungProJahr, 10);
  assert.equal(m.regeln.maxErfahrungsjahre, 10);
  assert.equal(m.regeln.spracheProSprache, 20);
  assert.equal(m.regeln.mindestNiveau, 'B2');
  assert.equal(m.regeln.dreizehnterProzent, 8.33);
  assert.equal(m.regeln.wochenstunden, 43.5);
  assert.deepEqual(m.regeln.sprachen.map((s) => s.label), ['Deutsch', 'Englisch', 'Französisch', 'Italienisch']);
});

test('HR-interne Schluessel kommen nirgends im Modell vor', () => {
  const text = JSON.stringify(baueLeseModell(standardConfig(), '2027-02-01'));
  ['spielraum', 'spielraumProzent', 'einarbeitung', 'freigabe'].forEach((k) => {
    assert.equal(text.toLowerCase().includes(k.toLowerCase()), false, k);
  });
});

test('Anerkennung: Koch/Koechin EFZ mit Kueche und Restauration, Stufe IIIa', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  const koch = m.anerkennung.filter((a) => a.abschluss === 'Koch/Köchin EFZ')[0];
  assert.equal(koch.stufe, 'Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)');
  assert.deepEqual(koch.bereiche, ['Küche', 'Restauration']);
});

test('Abschluss mit stufe null wird als Einzelfall gelistet', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  const hf = m.anerkennung.filter((a) => a.abschluss.indexOf('Höhere Fachschule') === 0)[0];
  assert.equal(hf.stufe, null);
  assert.equal(hf.einzelfall, true);
  assert.deepEqual(hf.bereiche, []);
});

test('Leere oder ungueltige Konfiguration ergibt lesbaren Fehler', () => {
  assert.equal(typeof baueLeseModell({}, '2027-02-01').fehler, 'string');
  assert.equal(typeof baueLeseModell(undefined, '2027-02-01').fehler, 'string');
  assert.equal(typeof baueLeseModell(null, '2027-02-01').fehler, 'string');
});

test('Datum vor der ersten Tabelle zeigt die naechste kommende Tabelle', () => {
  const m = baueLeseModell(standardConfig(), '2026-11-13');
  assert.equal(m.fehler, undefined);
  assert.equal(m.jahr, 2027);
  assert.equal(m.gueltigAb, '2027-01-01');
});

test('Ohne jede Tabelle ergibt lesbaren Fehler', () => {
  const c = standardConfig();
  c.mindestloehne = [];
  assert.equal(typeof baueLeseModell(c, '2027-02-01').fehler, 'string');
});

test('baenderBestaetigt false fuegt Hinweis hinzu, true nicht', () => {
  const c = standardConfig();
  assert.deepEqual(baueLeseModell(c, '2027-02-01').hinweise, []);
  c.betrieb.baenderBestaetigt = false;
  assert.deepEqual(baueLeseModell(c, '2027-02-01').hinweise, ['Lohnbänder sind Beispielwerte, bis sie freigegeben sind.']);
  assert.equal(zeigeBaenderHinweis(c), true);
  assert.equal(zeigeBaenderHinweis(standardConfig()), false);
});

test('zukuenftig: Tabelle noch nicht gueltig ergibt Hinweis mit Datum', () => {
  const m = baueLeseModell(standardConfig(), '2026-11-13');
  assert.equal(m.zukuenftig, true);
  assert.ok(m.mindestlohnHinweis.includes('1.1.2027'));
  assert.ok(m.mindestlohnHinweis.includes('Bis dahin gelten die bisherigen Mindestlöhne.'));
  const g = baueLeseModell(standardConfig(), '2027-02-01');
  assert.equal(g.zukuenftig, false);
  assert.equal(g.mindestlohnHinweis, null);
});

test('Texte: Einstiegslohn ist nicht mehr an das Bandminimum gebunden (strikt nach Stufe)', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  assert.equal(m.texte.berechnung, 'Einstiegslohn = Mindestlohn der Stufe der Person + Zuschläge, höchstens bis zum Ende des Lohnbands der Funktion. Liegt die Stufe der Person tiefer als die typische Stufe der Funktion, kann der Lohn unter dem Lohnband liegen.');
  assert.equal(m.texte.baender, 'Das Lohnband zeigt den Einstiegsbereich für die typische Stufe der Funktion. Massgebend für den Einstiegslohn ist die Stufe der Person (Abschluss und Funktionsbereich).');
});

test('Mindestloehne enthalten die Erklärung der Stufe; ohne Erklärung nur die Bezeichnung', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  assert.equal(m.mindestloehne.filter((x) => x.stufe === 'IIIa')[0].erklaerung, 'Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)');
  assert.equal(m.mindestloehne.filter((x) => x.stufe === 'P')[0].erklaerung, 'Praktikant/in einer anerkannten Hotelfachschule');
  const c = standardConfig();
  delete c.stufen.II.erklaerung;
  const m2 = baueLeseModell(c, '2027-02-01');
  const ii = m2.mindestloehne.filter((x) => x.stufe === 'II')[0];
  assert.equal(ii.label, 'Stufe II');
  assert.equal(ii.erklaerung, '');
});
