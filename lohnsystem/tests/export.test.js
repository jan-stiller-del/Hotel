'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../src/export.js');

function ergebnis(extra) {
  return Object.assign({
    modus: 'berechnet', stufe: 'IIIa', mindestlohn: 4555, tabelleJahr: 2027,
    bandStart: 4555, bandMax: 5600,
    positionen: [
      { label: 'Mindestlohn Stufe IIIa', betrag: 4555, art: 'lohn' },
      { label: 'Gästekontakt Sprachen (2)', betrag: 200, art: 'lohn' }
    ],
    vorschlag: 4955, monatslohn: 4955, dreizehnter: 412.75, totalMonat: 5367.75,
    jahresbrutto: 64413, stundenansatz: 26.3,
    entschaedigungen: [{ label: 'Pauschale', betrag: 80 }],
    spanne: { min: 4755, max: 5155 },
    spanneStufen: { vorgesetzte: { min: 4905, max: 5005 }, hr: { min: 4855, max: 5055 }, gm: { min: 4755, max: 5155 } },
    einarbeitung: { erlaubt: true, grund: 'ok', maxMonate: 3, reduktionProzent: 8,
      reduzierterMonatslohn: 4560, reduzierterTotal: 4940, volllohnAb: '2027-04-01' },
    warnungen: [{ code: 'x', text: 'Achtung Warnung' }], fehler: []
  }, extra || {});
}
const kontext = {
  funktionLabel: 'Réception Gästekontakt', eintritt: '2027-01-01', vertragsart: 'Jahresstelle (unbefristet)',
  beschaeftigungsgrad: 80, dreizehnterProzent: 8.33, gewaehlterMonatslohn: 5040, begruendung: 'Begründung: Erfahrung',
  freigabe: 'HR', datum: '2026-11-13',
  betraege: { monatslohn: 4032, dreizehnter: 335.85, totalMonat: 4367.85, jahresbrutto: 52414.2, stundenansatz: 28.5,
    reduzierterMonatslohn: 3709.45, reduzierterTotal: 4018.43 }
};
function finde(zeilen, label) { return zeilen.filter(function (z) { return String(z[0]).indexOf(label) === 0; }); }

test('baueExportZeilen: alle Pflichtzeilen, Umlaute unveraendert', () => {
  const z = X.baueExportZeilen(ergebnis(), kontext);
  assert.ok(z.every(r => Array.isArray(r) && r.length === 2));
  assert.equal(finde(z, 'Funktion')[0][1], 'Réception Gästekontakt');
  assert.equal(finde(z, 'Stufe')[0][1], 'IIIa');
  assert.match(String(finde(z, 'Mindestlohn')[0][0]), /2027/);
  assert.equal(finde(z, 'Mindestlohn')[0][1], 4555);
  assert.equal(finde(z, 'Gästekontakt Sprachen (2)')[0][1], 200);
  assert.equal(finde(z, 'Vorschlag')[0][1], 4955);
  assert.equal(finde(z, 'Spielraum Vorgesetzte').length, 1);
  assert.equal(finde(z, 'Spielraum HR').length, 1);
  assert.equal(finde(z, 'Spielraum GM').length, 1);
  assert.equal(finde(z, 'Gewählter Vollzeit-Monatslohn')[0][1], 5040);
  assert.equal(finde(z, 'Freigabe durch')[0][1], 'HR');
  assert.equal(finde(z, 'Begründung')[0][1], 'Begründung: Erfahrung');
  assert.match(String(finde(z, 'Monatslohn brutto')[0][0]), /80 %/);
  assert.equal(finde(z, 'Monatslohn brutto')[0][1], 4032);
  assert.equal(finde(z, '13. Monatslohn')[0][1], 335.85);
  assert.equal(finde(z, 'Total pro Monat')[0][1], 4367.85);
  assert.equal(finde(z, 'Jahresbrutto')[0][1], 52414.2);
  assert.equal(finde(z, 'Stundenansatz')[0][1], 28.5);
  const ent = finde(z, 'Entschädigung');
  assert.ok(ent.length >= 1);
  assert.ok(z.some(r => /nicht Teil des Bruttolohns/.test(String(r[0]) + String(r[1]))));
  assert.equal(finde(z, 'Pauschale')[0][1], 80);
  assert.equal(finde(z, 'Einarbeitung reduziert um')[0][1], 3709.45);
  assert.equal(finde(z, 'Einarbeitung reduziert, Total')[0][1], 4018.43);
  assert.equal(finde(z, 'Voller Lohn ab')[0][1], '01.04.2027');
  assert.ok(z.some(r => String(r[1]).indexOf('Achtung Warnung') >= 0));
});

test('baueExportZeilen: Einarbeitung null und Spanne null entfallen', () => {
  const z = X.baueExportZeilen(ergebnis({ einarbeitung: null, spanneStufen: null, spanne: null }), kontext);
  assert.equal(finde(z, 'Einarbeitung').length, 0);
  assert.equal(finde(z, 'Voller Lohn ab').length, 0);
  assert.equal(finde(z, 'Spielraum').length, 0);
});

function index(z, label) { return z.findIndex(function (r) { return String(r[0]).indexOf(label) === 0; }); }

test('Export: Block Auszahlung pro Monat in fester Reihenfolge, 13. als eigene Zeile', () => {
  const z = X.baueExportZeilen(ergebnis(), kontext);
  const i = index(z, 'Auszahlung pro Monat');
  assert.ok(i >= 0);
  assert.match(String(z[i + 1][0]), /^Monatslohn brutto bei 80 %/);
  assert.equal(z[i + 1][1], 4032);
  assert.equal(z[i + 2][0], '13. Monatslohn (8,33 %), monatlich ausbezahlt, separat ausgewiesen');
  assert.equal(z[i + 2][1], 335.85);
  assert.equal(z[i + 3][0], 'Total pro Monat');
  assert.equal(z[i + 3][1], 4367.85);
  assert.equal(z[i + 4][0], 'Jahresbrutto');
  assert.equal(z[i + 4][1], 52414.2);
  assert.equal(z[i + 5][0], 'Hinweis');
  assert.match(z[i + 5][1], /Mindestlohnvergleich erfolgt ohne 13\. Monatslohn/);
});

test('Export: 13. Monatslohn steht nicht im Rechenweg, Stundenansatz ausserhalb des Blocks', () => {
  const z = X.baueExportZeilen(ergebnis(), kontext);
  const block = index(z, 'Auszahlung pro Monat');
  assert.ok(index(z, 'Vorschlag Vollzeit pro Monat') < block);
  assert.ok(z.slice(0, block).every(r => String(r[0]).indexOf('13. Monatslohn') !== 0));
  assert.equal(z.filter(r => String(r[0]).indexOf('13. Monatslohn') === 0).length, 1);
  const st = index(z, 'Stundenansatz');
  assert.ok(st > index(z, 'Hinweis'));
  assert.equal(z[st][1], 28.5);
});

test('Export: Satz kommt aus der Konfiguration, Vollzeit ohne Prozentangabe', () => {
  const z = X.baueExportZeilen(ergebnis(), Object.assign({}, kontext, { dreizehnterProzent: 4.5, beschaeftigungsgrad: 100 }));
  assert.equal(finde(z, '13. Monatslohn')[0][0], '13. Monatslohn (4,5 %), monatlich ausbezahlt, separat ausgewiesen');
  assert.equal(finde(z, 'Monatslohn brutto')[0][0], 'Monatslohn brutto (Vollzeit)');
});

test('exportiereExcel: ohne SheetJS keine Ausnahme, deutsche Meldung', () => {
  const r = X.exportiereExcel([['a', 1]], 'x.xlsx');
  assert.equal(r.ok, false);
  assert.match(r.meldung, /Excel/);
});
