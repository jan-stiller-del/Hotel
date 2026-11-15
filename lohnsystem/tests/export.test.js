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
  funktionLabel: 'Réception Gästekontakt', funktionsbereich: 'Hotelempfang', abschlussLabel: 'Kaufmann/Kauffrau EFZ', eintritt: '2027-01-01', vertragsart: 'Jahresstelle (unbefristet)',
  beschaeftigungsgrad: 80, dreizehnterProzent: 8.33, gewaehlterMonatslohn: 5040, begruendung: 'Begründung: Erfahrung',
  anerkennung: 'Gelernt: X → Neue Stelle: Y: anerkannt, Stufe IIIa', freigabe: 'HR', datum: '2026-11-13',
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

test('Export: Abschluss, Funktionsbereich und Einstufungshinweis', () => {
  const warn = [
    { code: 'abschluss_nicht_anerkannt', text: 'Nicht anerkannt.' },
    { code: 'bereich_ungeregelt', text: 'Bereich ungeregelt.' },
    { code: 'x', text: 'Andere Warnung' }
  ];
  const z = X.baueExportZeilen(ergebnis({ warnungen: warn }), kontext);
  assert.equal(finde(z, 'Funktionsbereich')[0][1], 'Hotelempfang');
  assert.equal(finde(z, 'Gelernter Beruf / Abschluss')[0][1], 'Kaufmann/Kauffrau EFZ');
  assert.equal(finde(z, 'Funktion im Waldhaus')[0][1], 'Réception Gästekontakt');
  assert.equal(finde(z, 'Anerkennung')[0][1], 'Gelernt: X → Neue Stelle: Y: anerkannt, Stufe IIIa');
  const labels = z.map(r => r[0]);
  assert.ok(labels.indexOf('Gelernter Beruf / Abschluss') < labels.indexOf('Funktion im Waldhaus'));
  assert.equal(finde(z, 'Einstufungshinweis').length, 1);
  assert.equal(finde(z, 'Einstufungshinweis')[0][1], 'Nicht anerkannt. Bereich ungeregelt.');
  assert.deepEqual(finde(z, 'Warnung').map(r => r[1]), ['Andere Warnung']);
});

test('Export: ohne Einstufungswarnung keine Zeile Einstufungshinweis', () => {
  const z = X.baueExportZeilen(ergebnis(), kontext);
  assert.equal(finde(z, 'Einstufungshinweis').length, 0);
  assert.equal(finde(z, 'Warnung').length, 1);
});

test('baueExportZeilen: Stufenvergleich für den gewählten Lohn', () => {
  const sv = { stufe: 'IIIa', mindestlohn: 4555, ueberStufe: 120, ueberStufeProzent: 2.6, naechsteStufe: 'IIIb', mindestlohnNaechste: 4663, uebersprungen: true };
  const z = X.baueExportZeilen(ergebnis(), Object.assign({}, kontext, { stufenvergleich: sv }));
  assert.equal(finde(z, 'Mindestlohn der Stufe')[0][1], 4555);
  assert.equal(finde(z, 'Lohn über Stufen-Mindestlohn')[0][1], 'CHF 120.00 (2,6 %)');
  assert.equal(finde(z, 'Nächsthöhere Stufe übersprungen')[0][1], 'ja (IIIb, CHF 4663.00)');
  const nein = X.baueExportZeilen(ergebnis(), Object.assign({}, kontext, { stufenvergleich: Object.assign({}, sv, { uebersprungen: false }) }));
  assert.equal(finde(nein, 'Nächsthöhere Stufe übersprungen')[0][1], 'nein');
});

test('baueExportZeilen: ohne Stufenvergleich keine Vergleichszeilen', () => {
  const z = X.baueExportZeilen(ergebnis(), kontext);
  assert.equal(finde(z, 'Lohn über Stufen-Mindestlohn').length, 0);
  assert.equal(finde(z, 'Nächsthöhere Stufe').length, 0);
});

test('baueExportZeilen: Kader-Zeilen mit Pauschale als Zahl, aus kontext.betraege', () => {
  const k = Object.assign({}, kontext, { beschaeftigungsgrad: 100, betraege: {
    monatslohn: 5325, ueberstundenpauschale: 795.8, dreizehnter: 509.9, totalMonat: 6630.7, jahresbrutto: 79568.4, stundenansatz: 28.25,
    bezeichnungen: { grundlohn: 'Grundlohn (43,5 h)',
      pauschale: 'Überstundenpauschale (6,5 h pro Woche, 28,17 h pro Monat, 100 %)',
      dreizehnter: '13. Monatslohn (auf Grundlohn plus Pauschale)' } } });
  const z = X.baueExportZeilen(ergebnis(), k);
  const labels = z.map(r => r[0]);
  const i = labels.indexOf('Auszahlung pro Monat');
  assert.deepEqual(labels.slice(i + 1, i + 7), ['Grundlohn (43,5 h)',
    'Überstundenpauschale (6,5 h pro Woche, 28,17 h pro Monat, 100 %)',
    'Zwischentotal (Grundlohn plus Pauschale)',
    '13. Monatslohn (auf Grundlohn plus Pauschale)', 'Total pro Monat', 'Jahresbrutto']);
  assert.equal(z[i + 1][1], 5325);
  assert.equal(z[i + 2][1], 795.8);
  assert.equal(typeof z[i + 2][1], 'number');
  assert.equal(z[i + 3][1], 6120.8);
  assert.equal(z[i + 4][1], 509.9);
});

test('baueExportZeilen: ohne Pauschale bleibt der Block wie bisher', () => {
  const z = X.baueExportZeilen(ergebnis(), kontext);
  assert.ok(!z.some(r => /Überstundenpauschale/.test(r[0])));
  assert.equal(finde(z, 'Monatslohn brutto bei 80 %')[0][1], 4032);
});

test('baueExportZeilen: Einarbeitung bei Kader mit reduzierter Pauschale', () => {
  const k = Object.assign({}, kontext, { betraege: Object.assign({}, kontext.betraege, { reduzierteUeberstundenpauschale: 626.2, reduzierterTotal: 5218.05 }) });
  const z = X.baueExportZeilen(ergebnis(), k);
  assert.equal(finde(z, 'Einarbeitung reduziert, Überstundenpauschale')[0][1], 626.2);
  assert.equal(finde(z, 'Einarbeitung reduziert, Total pro Monat')[0][1], 5218.05);
  assert.ok(!X.baueExportZeilen(ergebnis(), kontext).some(r => /Einarbeitung reduziert, Überstunden/.test(r[0])));
});

test('Export: Zeile «Lohnband» neben dem Mindestlohn, Kaderband benannt, entfällt ohne Band', () => {
  const z = X.baueExportZeilen(ergebnis({ band: { art: 'stufe', min: 4555, max: 4900, ueberschreitbar: false }, bandStart: 4555, bandMax: 4900 }), kontext);
  const i = z.findIndex((r) => r[0] === 'Mindestlohn (Tabelle 2027)');
  assert.deepEqual(z[i + 1], ['Lohnband (von bis)', '4555 bis 4900']);
  const k = X.baueExportZeilen(ergebnis({ band: { art: 'kader', min: 6000, max: 7500, ueberschreitbar: true }, bandStart: 6000, bandMax: 7500 }), kontext);
  assert.deepEqual(finde(k, 'Lohnband'), [['Lohnband (von bis)', '6000 bis 7500 (Kaderband)']]);
  const start = X.baueExportZeilen(ergebnis({ band: { art: 'kader', min: 4000, max: 5000, ueberschreitbar: true }, bandStart: 5325, bandMax: 5325 }), kontext);
  assert.deepEqual(finde(start, 'Lohnband'), [['Lohnband (von bis)', '5325 bis 5325 (Kaderband)']]);
  assert.equal(finde(X.baueExportZeilen(ergebnis({ band: null }), kontext), 'Lohnband').length, 0);
});

test('baueExportZeilen: Zeile «Stufe» mit Erklärung, nächsthöhere Stufe mit Erklärung', () => {
  const sv = { stufe: 'IIIa', mindestlohn: 4555, ueberStufe: 120, ueberStufeProzent: 2.6, naechsteStufe: 'IIIb', mindestlohnNaechste: 4663, uebersprungen: true };
  const k = Object.assign({}, kontext, { stufenvergleich: sv, stufeText: 'Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)',
    naechsteStufeText: 'Stufe IIIb, EFZ plus 6 Tage berufsspezifische Weiterbildung' });
  const z = X.baueExportZeilen(ergebnis(), k);
  assert.equal(finde(z, 'Stufe')[0][1], 'Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)');
  assert.equal(finde(z, 'Mindestlohn der Stufe')[0][1], 4555);
  assert.equal(finde(z, 'Nächsthöhere Stufe übersprungen')[0][1], 'ja (Stufe IIIb, EFZ plus 6 Tage berufsspezifische Weiterbildung, CHF 4663.00)');
});

test('Export: Hinweis «über dem Bandmaximum» nur bei überschreitbarem Band und Lohn über dem wirksamen Maximum', () => {
  const band = { art: 'kader', min: 6000, max: 7500, ueberschreitbar: true };
  const hinweise = (z) => z.filter((r) => /über dem Bandmaximum/.test(String(r[1])));
  const k = (lohn) => Object.assign({}, kontext, { gewaehlterMonatslohn: lohn });
  assert.equal(hinweise(X.baueExportZeilen(ergebnis({ band, bandStart: 6000, bandMax: 7500 }), k(8000))).length, 1);
  assert.equal(hinweise(X.baueExportZeilen(ergebnis({ band, bandStart: 6000, bandMax: 7500 }), k(7500))).length, 0);
  const fest = { art: 'stufe', min: 4555, max: 4900, ueberschreitbar: false };
  assert.equal(hinweise(X.baueExportZeilen(ergebnis({ band: fest, bandStart: 4555, bandMax: 4900 }), k(8000))).length, 0);
});
