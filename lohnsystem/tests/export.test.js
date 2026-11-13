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
  beschaeftigungsgrad: 80, gewaehlterMonatslohn: 5040, begruendung: 'Begründung: Erfahrung',
  freigabe: 'HR', datum: '2026-11-13'
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
  assert.match(String(finde(z, 'Monatslohn bei')[0][0]), /80 %/);
  assert.equal(finde(z, '13. Monatslohn')[0][1], 412.75);
  assert.equal(finde(z, 'Total pro Monat')[0][1], 5367.75);
  assert.equal(finde(z, 'Jahresbrutto')[0][1], 64413);
  assert.equal(finde(z, 'Stundenansatz')[0][1], 26.3);
  const ent = finde(z, 'Entschädigung');
  assert.ok(ent.length >= 1);
  assert.ok(z.some(r => /nicht Teil des Bruttolohns/.test(String(r[0]) + String(r[1]))));
  assert.equal(finde(z, 'Pauschale')[0][1], 80);
  assert.equal(finde(z, 'Einarbeitung reduziert')[0][1], 4560);
  assert.equal(finde(z, 'Voller Lohn ab')[0][1], '01.04.2027');
  assert.ok(z.some(r => String(r[1]).indexOf('Achtung Warnung') >= 0));
});

test('baueExportZeilen: Einarbeitung null und Spanne null entfallen', () => {
  const z = X.baueExportZeilen(ergebnis({ einarbeitung: null, spanneStufen: null, spanne: null }), kontext);
  assert.equal(finde(z, 'Einarbeitung').length, 0);
  assert.equal(finde(z, 'Voller Lohn ab').length, 0);
  assert.equal(finde(z, 'Spielraum').length, 0);
});

test('exportiereExcel: ohne SheetJS keine Ausnahme, deutsche Meldung', () => {
  const r = X.exportiereExcel([['a', 1]], 'x.xlsx');
  assert.equal(r.ok, false);
  assert.match(r.meldung, /Excel/);
});
