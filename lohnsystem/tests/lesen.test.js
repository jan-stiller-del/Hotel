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

test('Standardkonfiguration ergibt Modell ohne Fehler, 7 Abteilungen, 58 Funktionen', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  assert.equal(m.fehler, undefined);
  assert.equal(m.funktionen.length, 7);
  assert.equal(m.funktionen.reduce((s, b) => s + b.funktionen.length, 0), 48);
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

test('Gaestekontakt der Funktionen, keine Kader-Funktionen und keine Funktionsbänder', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  const reception = m.funktionen.filter((b) => b.abteilung === 'Réception und Reservation')[0];
  const r = reception.funktionen.filter((f) => f.label === 'Receptionist')[0];
  assert.equal(r.gaestekontakt, true);
  assert.equal(r.kader, undefined);
  assert.equal(r.bandMin, undefined);
  assert.equal(reception.funktionen.filter((f) => f.label === 'Front Office Manager').length, 0);
  const kueche = m.funktionen.filter((b) => b.abteilung === 'Küche')[0];
  assert.equal(kueche.funktionen[0].gaestekontakt, false);
});

test('Lohnbänder pro Stufe: Minimum ist der Mindestlohn, Maximum aus der Konfiguration, kein Kaderband', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  const s = (st) => m.lohnbaender.stufen.filter((x) => x.stufe === st)[0];
  assert.deepEqual(m.lohnbaender.stufen.map((x) => x.stufe), ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV']);
  assert.equal(s('Ia').label, 'Stufe Ia');
  assert.equal(s('IIIa').min, 4555);
  assert.equal(s('IIIa').max, 4900);
  assert.equal(s('Ib').max, 4450);
  assert.equal(m.lohnbaender.kader, undefined);
});

test('Regeln der Zuschlaege aus der Konfiguration', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  assert.equal(m.regeln.erfahrungProJahr, 10);
  assert.equal(m.regeln.maxErfahrungsjahre, 20);
  assert.equal(m.regeln.spracheProSprache, 20);
  assert.equal(m.regeln.mindestNiveau, 'B1');
  assert.equal(m.regeln.teilNiveau, 'A2');
  assert.equal(m.regeln.teilProzent, 50);
  assert.equal(m.regeln.muttersprachFaktor, 2);
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
  assert.equal(m.texte.berechnung, 'Einstiegslohn = Mindestlohn der Stufe der Person + Zuschläge, höchstens bis zum Ende des Lohnbands der Stufe.');
  assert.equal(m.texte.baender, 'Das Lohnband hängt an der Ausbildung der Person (Stufe). Gleiche Ausbildung ergibt gleichen Lohn, unabhängig von der Funktion.');
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

test('Öffentliche Leseansicht: nirgends ein Hinweis auf Kader, Kaderband oder Kader-Funktionen', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  const json = JSON.stringify(m);
  assert.doesNotMatch(json, /kader/i);
  for (const l of ['Front Office Manager', 'Chef de cuisine', 'F&B Manager', 'HR Manager', 'Head of Engineering']) {
    assert.ok(!json.includes(l), l);
  }
});

test('Texte: Sprachkenntnisse müssen überprüft oder mit Diplom belegt sein', () => {
  const m = baueLeseModell(standardConfig(), '2027-02-01');
  assert.equal(m.texte.sprachNachweis, 'Die Sprachkenntnisse müssen überprüft werden oder durch ein Diplom belegt sein.');
});
