'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stufeMitErklaerung } = require('../src/config.js');
const { baueStufeManuellOptionen, formularZuInput, waehleOption, baueSprachZeilen, baueAuszahlungZeilen, baueWahlAbrechnung, formatDifferenz, baueAbschlussGruppen, funktionsbereichText, bereichLabel, baueAnerkennungsZeile, zeigeStufeManuell, zeigeBaenderHinweis, stufeManuellBleibt } = require('../src/hr-app.js');

function werte(extra) {
  return Object.assign({
    funktionId: 'reception-receptionist', abschluss: 'efz', weiterbildung6Tage: false, stufeManuell: '',
    erfahrung: '4', sprachen: {}, beschaeftigungsgrad: '100', vertragsart: 'unbefristet',
    eintritt: '2027-02-01', sonderfall: 'keiner', zusatzIds: [],
    einarbeitung: { aktiv: false, frueherMonate: '', unterbruchMonate: '', reduktionProzent: '8' }
  }, extra);
}

test('Grundfelder werden uebernommen und Zahlen geparst', () => {
  const i = formularZuInput(werte({ beschaeftigungsgrad: '80' }));
  assert.equal(i.funktionId, 'reception-receptionist');
  assert.equal(i.abschluss, 'efz');
  assert.equal(i.beschaeftigungsgrad, 80);
  assert.equal(i.erfahrungJahre, 4);
  assert.equal(i.vertragsart, 'unbefristet');
  assert.equal(i.eintritt, '2027-02-01');
  assert.equal(i.sonderfall, 'keiner');
});

test('Erfahrung in ganzen Jahren', () => {
  assert.equal(formularZuInput(werte({ erfahrung: '4' })).erfahrungJahre, 4);
  assert.equal(formularZuInput(werte({ erfahrung: '1' })).erfahrungJahre, 1);
  assert.equal(formularZuInput(werte({ erfahrung: '0' })).erfahrungJahre, 0);
  assert.equal(formularZuInput(werte({ erfahrung: '' })).erfahrungJahre, 0);
});

test('Deutsch wird wie jede andere Sprache uebernommen', () => {
  const i = formularZuInput(werte({ sprachen: { DE: 'Muttersprache', EN: 'B2' } }));
  assert.deepEqual(i.sprachen, [{ sprache: 'DE', niveau: 'Muttersprache' }, { sprache: 'EN', niveau: 'B2' }]);
});

test('Sprachen: nur gewaehlte mit Niveau, Reihenfolge Sprachcode', () => {
  const i = formularZuInput(werte({ sprachen: { EN: 'B2', FR: 'C1', IT: '' } }));
  assert.deepEqual(i.sprachen, [{ sprache: 'EN', niveau: 'B2' }, { sprache: 'FR', niveau: 'C1' }]);
  assert.deepEqual(formularZuInput(werte({ sprachen: {} })).sprachen, []);
});

test('Einarbeitung nur wenn aktiv', () => {
  assert.equal(formularZuInput(werte()).einarbeitung, undefined);
  const i = formularZuInput(werte({ einarbeitung: { aktiv: true, frueherMonate: '2', unterbruchMonate: '30', reduktionProzent: '6' } }));
  assert.deepEqual(i.einarbeitung, { aktiv: true, reduktionProzent: 6, frueheresLGAVMonate: 2, rueckkehrHausUnterbruchMonate: 30 });
});

test('Leerer Unterbruch wird null, leere fruehere Monate ebenfalls', () => {
  const i = formularZuInput(werte({ einarbeitung: { aktiv: true, frueherMonate: '0', unterbruchMonate: '', reduktionProzent: '8' } }));
  assert.equal(i.einarbeitung.rueckkehrHausUnterbruchMonate, null);
  assert.equal(i.einarbeitung.frueheresLGAVMonate, 0);
  const j = formularZuInput(werte({ einarbeitung: { aktiv: true, frueherMonate: '', unterbruchMonate: '', reduktionProzent: '8' } }));
  assert.equal(j.einarbeitung.frueheresLGAVMonate, null);
});

test('Sonderfall ohne Abschluss: Abschluss keiner', () => {
  assert.equal(formularZuInput(werte({ abschluss: '', sonderfall: 'praktikum' })).abschluss, 'keiner');
  assert.equal(formularZuInput(werte({ abschluss: '' })).abschluss, '');
});

test('Weiterbildung, HF-Stufe, Zusatzbausteine', () => {
  const i = formularZuInput(werte({ weiterbildung6Tage: true, abschluss: 'hf', stufeManuell: 'IIIb', zusatzIds: ['x'] }));
  assert.equal(i.weiterbildung6Tage, true);
  assert.equal(i.stufeManuell, 'IIIb');
  assert.deepEqual(i.zusatzIds, ['x']);
  assert.equal(formularZuInput(werte({ stufeManuell: '' })).stufeManuell, null);
});

test('Leerer Beschaeftigungsgrad wird null', () => {
  assert.equal(formularZuInput(werte({ beschaeftigungsgrad: '' })).beschaeftigungsgrad, null);
});

test('waehleOption behaelt vorhandenen Wert, sonst leer', () => {
  assert.equal(waehleOption(['a', 'b'], 'b'), 'b');
  assert.equal(waehleOption(['a', 'b'], 'x'), '');
  assert.equal(waehleOption([], ''), '');
  assert.equal(waehleOption(['a'], undefined), '');
});

function standardkonfiguration() {
  const text = fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(text, sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.LOHN_CONFIG));
}

test('baueSprachZeilen: Standardkonfiguration enthaelt Deutsch vor EN, FR, IT', () => {
  assert.deepEqual(baueSprachZeilen(standardkonfiguration()), [
    { code: 'DE', id: 'sprache-DE', label: 'Deutsch' },
    { code: 'EN', id: 'sprache-EN', label: 'Englisch' },
    { code: 'FR', id: 'sprache-FR', label: 'Französisch' },
    { code: 'IT', id: 'sprache-IT', label: 'Italienisch' }
  ]);
});

test('baueSprachZeilen: unbekannter Code nimmt den Code als Beschriftung, leere Liste gibt leeres Array', () => {
  assert.deepEqual(baueSprachZeilen({ bausteine: { sprachen: ['XX'] } }), [{ code: 'XX', id: 'sprache-XX', label: 'XX' }]);
  assert.deepEqual(baueSprachZeilen({ bausteine: { sprachen: [] } }), []);
  assert.deepEqual(baueSprachZeilen({}), []);
});

const ERG = { monatslohn: 2805, dreizehnter: 233.65, totalMonat: 3038.65, jahresbrutto: 36463.8, stundenansatz: 24.8 };

test('baueAuszahlungZeilen: Reihenfolge, Arten, Satz aus der Konfiguration, Teilzeit', () => {
  const cfg = { betrieb: { dreizehnterProzent: 8.33 } };
  const z = baueAuszahlungZeilen(ERG, cfg, { beschaeftigungsgrad: '60' });
  assert.deepEqual(z.map(r => r.art), ['lohn', 'dreizehnter', 'summe', 'jahr', 'hinweis']);
  assert.equal(z[0].label, 'Monatslohn brutto bei 60 %');
  assert.equal(z[0].betrag, 2805);
  assert.equal(z[1].label, '13. Monatslohn (8,33 %), monatlich ausbezahlt, separat ausgewiesen');
  assert.equal(z[1].betrag, 233.65);
  assert.equal(z[2].label, 'Total pro Monat');
  assert.equal(z[2].betrag, 3038.65);
  assert.equal(z[3].betrag, 36463.8);
  assert.match(z[4].label, /Mindestlohnvergleich erfolgt ohne 13\. Monatslohn/);
  assert.equal(z[4].betrag, null);
});

test('baueAuszahlungZeilen: Vollzeit, anderer Satz, kein Stundenansatz im Block', () => {
  const z = baueAuszahlungZeilen(ERG, { betrieb: { dreizehnterProzent: 5 } }, { beschaeftigungsgrad: '100' });
  assert.equal(z[0].label, 'Monatslohn brutto (Vollzeit)');
  assert.match(z[1].label, /\(5 %\)/);
  assert.ok(z.every(r => !/Stundenansatz/.test(r.label)));
});

function standardConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.LOHN_CONFIG));
}

test('baueAbschlussGruppen: keiner zuerst, dann Gruppen nach Stufe mit Beschriftung aus der Konfiguration', () => {
  const cfg = standardConfig();
  const g = baueAbschlussGruppen(cfg);
  assert.deepEqual(g.map(x => x.label),
    ['Ohne Abschluss', 'Ib Progresso', 'II EBA', 'IIIa EFZ', 'IV Fachausweis', 'Stufe von Hand wählen']);
  assert.deepEqual(g[0].optionen, [{ id: 'keiner', label: 'Kein Abschluss (Stufe Ia)' }]);
  const alle = g.slice(1).reduce((a, x) => a.concat(x.optionen), []);
  assert.equal(alle.length, cfg.abschluesse.length);
  assert.equal(g[3].optionen.find(o => o.id === 'koch-efz').label, 'Koch/Köchin EFZ');
  assert.ok(g[5].optionen.some(o => o.id === 'hf'));
});

test('baueAbschlussGruppen: leere Gruppen entfallen, fehlende Konfiguration ergibt nur «keiner»', () => {
  const g = baueAbschlussGruppen({ abschluesse: [{ id: 'x', label: 'X', stufe: 'II', bereiche: '*' }] });
  assert.deepEqual(g.map(x => x.label), ['Ohne Abschluss', 'II EBA']);
  assert.equal(baueAbschlussGruppen({}).length, 1);
});

test('funktionsbereichText: Bereich aus der Konfiguration oder «nicht geregelt»', () => {
  const cfg = standardConfig();
  const f = (id) => cfg.funktionen.find(x => x.id === id);
  assert.equal(funktionsbereichText(cfg, f('kueche-commis')), 'Funktionsbereich: Küche');
  assert.equal(funktionsbereichText(cfg, f('spa-masseur')), 'Funktionsbereich: nicht geregelt');
  assert.equal(funktionsbereichText(cfg, null), '');
});

test('bereichLabel: direkter Nachschlag in config.bereiche', () => {
  const cfg = standardConfig();
  const f = (id) => cfg.funktionen.find(x => x.id === id);
  assert.equal(bereichLabel(cfg, f('kueche-commis')), 'Küche');
  assert.equal(bereichLabel(cfg, f('spa-masseur')), 'nicht geregelt');
  assert.equal(bereichLabel(cfg, null), '');
});

test('baueAnerkennungsZeile: anerkannt mit Stufe aus dem Ergebnis', () => {
  const cfg = standardConfig();
  const r = baueAnerkennungsZeile(cfg, 'koch-efz', 'service-chef-de-rang', { modus: 'berechnet', stufe: 'IIIa', warnungen: [] });
  assert.equal(r.art, 'ok');
  assert.equal(r.text, 'Gelernt: Koch/Köchin EFZ (Küche, Restauration) → Neue Stelle: Chef de rang (Restauration): anerkannt, Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)');
});

test('baueAnerkennungsZeile: Stufe aus der Konfiguration ohne Ergebnis', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'koch-efz', 'service-chef-de-rang', null);
  assert.ok(r.text.endsWith('anerkannt, Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)'));
});

test('baueAnerkennungsZeile: nicht anerkannt, Einstufung Ia', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'koch-efz', 'housekeeping-zimmermaedchen', null);
  assert.equal(r.art, 'warnung');
  assert.match(r.text, /Neue Stelle: Room Attendant \(Hotellerie\/Hauswirtschaft\): nicht anerkannt, Einstufung Ia/);
});

test('baueAnerkennungsZeile: Bereich nicht geregelt', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'koch-efz', 'spa-spa-assistenz', null);
  assert.equal(r.art, 'warnung');
  assert.match(r.text, /nicht anerkannt, Einstufung Ia/);
  assert.match(r.text, /Bereich nicht geregelt, Auskunft der Kontrollstelle einholen/);
});

test('baueAnerkennungsZeile: ohne Abschluss oder Funktion offen', () => {
  const cfg = standardConfig();
  assert.equal(baueAnerkennungsZeile(cfg, '', 'service-chef-de-rang', null).art, 'offen');
  assert.equal(baueAnerkennungsZeile(cfg, 'koch-efz', '', null).art, 'offen');
});

test('baueAnerkennungsZeile: Stufe von Hand und alle Bereiche', () => {
  const cfg = { bereiche: [{ id: 'a', label: 'A' }], funktionen: [{ id: 'f', label: 'F', bereich: 'a' }],
    abschluesse: [{ id: 'hf', label: 'HF', stufe: null, bereiche: [] }, { id: 'x', label: 'X', stufe: 'II', bereiche: '*' }] };
  const hf = baueAnerkennungsZeile(cfg, 'hf', 'f', null);
  assert.equal(hf.art, 'offen');
  assert.match(hf.text, /Stufe von Hand wählen/);
  const x = baueAnerkennungsZeile(cfg, 'x', 'f', null);
  assert.match(x.text, /Gelernt: X \(alle Bereiche\)/);
  assert.match(x.text, /anerkannt, Stufe II$/);
});

test('zeigeBaenderHinweis: nur wenn das Flag nicht true ist', () => {
  assert.equal(zeigeBaenderHinweis({ betrieb: { baenderBestaetigt: false } }), true);
  assert.equal(zeigeBaenderHinweis({ betrieb: {} }), true);
  assert.equal(zeigeBaenderHinweis({ betrieb: { baenderBestaetigt: true } }), false);
  assert.equal(zeigeBaenderHinweis(standardConfig()), false);
});

test('stufeManuellBleibt: nur bei gleichem Abschluss und gleicher Funktion', () => {
  assert.equal(stufeManuellBleibt({ abschluss: 'hf', funktionId: 'a' }, { abschluss: 'hf', funktionId: 'a' }), true);
  assert.equal(stufeManuellBleibt({ abschluss: 'hf', funktionId: 'a' }, { abschluss: 'x', funktionId: 'a' }), false);
  assert.equal(stufeManuellBleibt({ abschluss: 'hf', funktionId: 'a' }, { abschluss: 'hf', funktionId: 'b' }), false);
});

test('baueAnerkennungsZeile: manuelle Stufe bei Abschluss ohne Stufe, Text passt zu ergebnis.stufe', () => {
  const cfg = standardConfig();
  const r = baueAnerkennungsZeile(cfg, 'hf', 'service-chef-de-rang', { stufe: 'IV' }, { stufeManuell: 'IV' });
  assert.equal(r.art, 'warnung');
  assert.ok(r.text.endsWith('von Hand gewählt: Stufe IV, Berufsprüfung (eidg. Fachausweis)'));
  assert.doesNotMatch(r.text, /Stufe von Hand wählen|Einstufung Ia/);
});

test('baueAnerkennungsZeile: manuelle Stufe übersteuert nicht anerkannten Fall', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'koch-efz', 'housekeeping-zimmermaedchen', { stufe: 'IIIa' }, { stufeManuell: 'IIIa' });
  assert.equal(r.art, 'warnung');
  assert.ok(r.text.endsWith('von Hand gewählt: Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)'));
  assert.doesNotMatch(r.text, /Einstufung Ia/);
});

test('baueAnerkennungsZeile: Praktikum ohne Anerkennungsprüfung', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'koch-efz', 'housekeeping-zimmermaedchen', { stufe: 'P' }, { sonderfall: 'praktikum' });
  assert.equal(r.art, 'ok');
  assert.equal(r.text, 'Praktikum, Praktikant/in einer anerkannten Hotelfachschule: keine Anerkennungsprüfung');
  assert.equal(baueAnerkennungsZeile(standardConfig(), '', '', null, { sonderfall: 'praktikum' }).art, 'ok');
});

test('baueAnerkennungsZeile: unbekannter Abschluss ist offen, nicht «kein Abschluss»', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'gibtsnicht', 'service-chef-de-rang', null);
  assert.equal(r.art, 'offen');
  assert.doesNotMatch(r.text, /kein Abschluss/);
});

test('baueAnerkennungsZeile: Stufe im Text entspricht ergebnis.stufe', () => {
  const E = require('../src/engine.js');
  const cfg = standardConfig();
  const faelle = [
    ['koch-efz', 'service-chef-de-rang', 'keiner', ''],
    ['koch-efz', 'housekeeping-zimmermaedchen', 'keiner', ''],
    ['koch-efz', 'housekeeping-zimmermaedchen', 'keiner', 'IIIa'],
    ['hf', 'service-chef-de-rang', 'keiner', 'IV'],
    ['koch-efz', 'service-chef-de-rang', 'praktikum', '']
  ];
  faelle.forEach(([ab, fu, sonder, man]) => {
    const e = E.berechne(cfg, formularZuInput(werte({ abschluss: ab, funktionId: fu, sonderfall: sonder, stufeManuell: man })));
    assert.equal(e.modus, 'berechnet', ab + fu);
    const t = baueAnerkennungsZeile(cfg, ab, fu, e, { stufeManuell: man, sonderfall: sonder }).text;
    if (e.stufe === 'Ia') assert.match(t, /Einstufung Ia/);
    else if (e.stufe === 'P') assert.ok(t.startsWith('Praktikum, '));
    else assert.ok(t.endsWith(stufeMitErklaerung(cfg, e.stufe)), t);
  });
});

test('zeigeStufeManuell: nur wenn nötig oder schon gewählt', () => {
  const cfg = standardConfig();
  assert.equal(zeigeStufeManuell(cfg, 'koch-efz', { warnungen: [] }, ''), false);
  assert.equal(zeigeStufeManuell(cfg, 'koch-efz', null, ''), false);
  assert.equal(zeigeStufeManuell(cfg, 'hf', null, ''), true);
  assert.equal(zeigeStufeManuell(cfg, 'koch-efz', { warnungen: [{ code: 'abschluss_nicht_anerkannt' }] }, ''), true);
  assert.equal(zeigeStufeManuell(cfg, 'koch-efz', { warnungen: [{ code: 'bereich_ungeregelt' }] }, ''), true);
  assert.equal(zeigeStufeManuell(cfg, 'koch-efz', { warnungen: [] }, 'IV'), true);
});

// ---------- Task 5h ----------
const { baueStufenvergleichZeilen } = require('../src/hr-app.js');
const SV = { stufe: 'IIIa', mindestlohn: 4555, ueberStufe: 180, ueberStufeProzent: 4, naechsteStufe: 'IIIb', mindestlohnNaechste: 4663, uebersprungen: true };

test('baueStufenvergleichZeilen: Lohn über Mindestlohn und hervorgehobene Zeile bei Überspringen', () => {
  const z = baueStufenvergleichZeilen(SV);
  assert.equal(z.length, 2);
  assert.equal(z[0].text, 'Lohn über Stufen-Mindestlohn: +CHF 180.00 (4,0 %)');
  assert.equal(z[0].art, 'info');
  assert.match(z[1].text, /^⚠ Nächsthöhere Stufe IIIb \(CHF 4663\.00\) erreicht oder überschritten/);
  assert.equal(z[1].art, 'warnung');
});

test('baueStufenvergleichZeilen: ohne Überspringen nur eine Zeile, null gibt leer, Kommastelle', () => {
  assert.equal(baueStufenvergleichZeilen(Object.assign({}, SV, { uebersprungen: false })).length, 1);
  assert.deepEqual(baueStufenvergleichZeilen(null), []);
  const z = baueStufenvergleichZeilen(Object.assign({}, SV, { ueberStufe: 120, ueberStufeProzent: 2.6, uebersprungen: false }));
  assert.equal(z[0].text, 'Lohn über Stufen-Mindestlohn: +CHF 120.00 (2,6 %)');
});

test('baueStufenvergleichZeilen: Lohn unter dem Mindestlohn zeigt Minus', () => {
  const z = baueStufenvergleichZeilen(Object.assign({}, SV, { ueberStufe: -50, ueberStufeProzent: -1.1, uebersprungen: false }));
  assert.equal(z[0].text, 'Lohn über Stufen-Mindestlohn: -CHF 50.00 (-1,1 %)');
});

test('baueAuszahlungZeilen: Kader mit eigener Pauschalenzeile, Reihenfolge und Beschriftung', () => {
  const cfg = { betrieb: { dreizehnterProzent: 8.33 } };
  const kader = {
    monatslohn: 5325, ueberstundenpauschale: 795.8, dreizehnter: 509.9, totalMonat: 6630.7, jahresbrutto: 79568.4,
    bezeichnungen: {
      grundlohn: 'Grundlohn (43,5 h)',
      pauschale: 'Überstundenpauschale (6,5 h pro Woche, 28,17 h pro Monat, 100 %)',
      dreizehnter: '13. Monatslohn (auf Grundlohn plus Pauschale)'
    }
  };
  const z = baueAuszahlungZeilen(kader, cfg, { beschaeftigungsgrad: '100' });
  assert.deepEqual(z.map(r => r.art), ['lohn', 'pauschale', 'dreizehnter', 'summe', 'jahr', 'hinweis']);
  assert.equal(z[0].label, 'Grundlohn (43,5 h)');
  assert.equal(z[0].betrag, 5325);
  assert.equal(z[1].label, 'Überstundenpauschale (6,5 h pro Woche, 28,17 h pro Monat, 100 %)');
  assert.equal(z[1].betrag, 795.8);
  assert.equal(z[2].label, '13. Monatslohn (auf Grundlohn plus Pauschale)');
  assert.equal(z[3].betrag, 6630.7);
});

test('baueAuszahlungZeilen: ohne Pauschale unveraendert (Nicht-Kader)', () => {
  const z = baueAuszahlungZeilen(Object.assign({ ueberstundenpauschale: null, bezeichnungen: null }, ERG),
    { betrieb: { dreizehnterProzent: 8.33 } }, { beschaeftigungsgrad: '100' });
  assert.deepEqual(z.map(r => r.art), ['lohn', 'dreizehnter', 'summe', 'jahr', 'hinweis']);
});

// ---------- Task 5n: Abrechnung mit gewaehltem Lohn ----------
const Engine = require('../src/engine.js');
const WERG = { modus: 'berechnet', vorschlag: 4675, kader: null, einarbeitung: null };
const wArt = (a, art) => a.zeilen.find(r => r.art === art);

test('baueWahlAbrechnung: Vorschlag 4675, gewaehlt 5000 Vollzeit', () => {
  const a = baueWahlAbrechnung(standardConfig(), WERG, 5000, { beschaeftigungsgrad: '100' });
  assert.equal(a.titel, 'Abrechnung mit gewähltem Lohn (CHF 5000.00)');
  assert.deepEqual(a.zeilen.map(r => r.art), ['lohn', 'dreizehnter', 'summe', 'jahr', 'stundenansatz']);
  assert.equal(wArt(a, 'lohn').betrag, 5000);
  assert.equal(wArt(a, 'dreizehnter').betrag, 416.5);
  assert.equal(wArt(a, 'summe').betrag, 5416.5);
  assert.equal(wArt(a, 'jahr').betrag, 64998);
  assert.equal(wArt(a, 'stundenansatz').betrag, 26.53);
  assert.match(wArt(a, 'stundenansatz').label, /ohne 13\. Monatslohn/);
  assert.deepEqual(a.differenz, { chf: 325, prozent: 7 });
  assert.equal(formatDifferenz(a.differenz), 'Differenz zum Vorschlag: +CHF 325.00 (7,0 %)');
});

test('baueWahlAbrechnung: Handy und Waesche erscheinen als Zulagen unter dem Bruttolohn', () => {
  const erg = Object.assign({}, WERG, { entschaedigungen: [
    { label: 'Entschädigung private Handynutzung', betrag: 5 },
    { label: 'Wäscheentschädigung Berufskleidung (L-GAV Art. 30)', betrag: 30 }] });
  const a = baueWahlAbrechnung(standardConfig(), erg, 5000, { beschaeftigungsgrad: '60' });
  assert.deepEqual(a.zeilen.map(r => r.art), ['lohn', 'dreizehnter', 'summe', 'jahr', 'kopf', 'entschaedigung', 'entschaedigung', 'summe', 'stundenansatz']);
  const ents = a.zeilen.filter(r => r.art === 'entschaedigung');
  assert.deepEqual(ents.map(r => r.betrag), [5, 30]);
  const ohne = baueWahlAbrechnung(standardConfig(), WERG, 5000, { beschaeftigungsgrad: '60' });
  assert.equal(a.zeilen.filter(r => r.art === 'summe')[0].betrag, wArt(ohne, 'summe').betrag);
  assert.equal(a.zeilen.filter(r => r.art === 'summe')[1].betrag, Math.round((wArt(ohne, 'summe').betrag + 35) * 100) / 100);
});

test('baueWahlAbrechnung: gleicher Lohn, keine Differenz, Zeilen wie beim Vorschlag', () => {
  const cfg = standardConfig();
  const a = baueWahlAbrechnung(cfg, WERG, 4675, { beschaeftigungsgrad: '100' });
  assert.equal(a.differenz, null);
  const b = Engine.rechneBetraege(cfg, 4675, { beschaeftigungsgrad: 100, einarbeitung: null, kader: false });
  const erwartet = baueAuszahlungZeilen(b, cfg, { beschaeftigungsgrad: '100' }).filter(r => r.art !== 'hinweis');
  assert.deepEqual(a.zeilen.slice(0, erwartet.length), erwartet);
});

test('baueWahlAbrechnung: Zahlen stimmen exakt mit rechneBetraege ueberein', () => {
  const cfg = standardConfig();
  const b = Engine.rechneBetraege(cfg, 4700, { beschaeftigungsgrad: 100, einarbeitung: null, kader: false });
  const a = baueWahlAbrechnung(cfg, WERG, 4700, { beschaeftigungsgrad: '100' });
  assert.equal(wArt(a, 'lohn').betrag, b.monatslohn);
  assert.equal(wArt(a, 'dreizehnter').betrag, b.dreizehnter);
  assert.equal(wArt(a, 'summe').betrag, b.totalMonat);
  assert.equal(wArt(a, 'jahr').betrag, b.jahresbrutto);
  assert.equal(wArt(a, 'stundenansatz').betrag, b.stundenansatz);
  assert.equal(b.dreizehnter, 391.5);
  assert.equal(b.totalMonat, 5091.5);
});

test('baueWahlAbrechnung: Teilzeit 60 %', () => {
  const cfg = standardConfig();
  const a = baueWahlAbrechnung(cfg, WERG, 5000, { beschaeftigungsgrad: '60' });
  const b = Engine.rechneBetraege(cfg, 5000, { beschaeftigungsgrad: 60, einarbeitung: null, kader: false });
  assert.equal(wArt(a, 'lohn').label, 'Monatslohn brutto bei 60 %');
  assert.equal(wArt(a, 'lohn').betrag, 3000);
  assert.equal(wArt(a, 'summe').betrag, b.totalMonat);
  assert.equal(wArt(a, 'stundenansatz').betrag, 26.53);
});

test('baueWahlAbrechnung: Kader mit Pauschale, 13. auf Grundlohn plus Pauschale', () => {
  const cfg = standardConfig();
  const kader = Object.assign({}, WERG, { vorschlag: 5325, kader: { aktiv: true } });
  const a = baueWahlAbrechnung(cfg, kader, 5325, { beschaeftigungsgrad: '100' });
  assert.deepEqual(a.zeilen.map(r => r.art), ['lohn', 'pauschale', 'dreizehnter', 'summe', 'jahr', 'stundenansatz']);
  assert.equal(wArt(a, 'pauschale').betrag, 796);
  assert.equal(wArt(a, 'pauschale').label, 'Überstundenpauschale (6,5 h pro Woche, 28,17 h pro Monat, 100 %)');
  assert.equal(wArt(a, 'dreizehnter').label, '13. Monatslohn (auf Grundlohn plus Pauschale)');
  assert.equal(wArt(a, 'dreizehnter').betrag, 509.9);
  assert.equal(wArt(a, 'summe').betrag, 6630.9);
  assert.equal(a.differenz, null);
});

test('baueWahlAbrechnung: Einarbeitung aktiv und erlaubt zeigt reduzierte Betraege', () => {
  const cfg = standardConfig();
  const e = Object.assign({}, WERG, { einarbeitung: { erlaubt: true, reduktionProzent: 8 } });
  const a = baueWahlAbrechnung(cfg, e, 5000, { beschaeftigungsgrad: '100' });
  const b = Engine.rechneBetraege(cfg, 5000, { beschaeftigungsgrad: 100, einarbeitung: { erlaubt: true, reduktionProzent: 8 }, kader: false });
  const ein = a.zeilen.filter(r => r.art === 'einarbeitung');
  assert.equal(ein.length, 2);
  assert.equal(ein[0].betrag, b.reduzierterMonatslohn);
  assert.equal(ein[1].betrag, b.reduzierterTotal);
  assert.match(ein[0].label, /8 %/);
  const nicht = baueWahlAbrechnung(cfg, Object.assign({}, WERG, { einarbeitung: { erlaubt: false, reduktionProzent: 8 } }), 5000, { beschaeftigungsgrad: '100' });
  assert.ok(nicht.zeilen.every(r => r.art !== 'einarbeitung'));
});

test('baueWahlAbrechnung: Einarbeitung bei Kader mit reduzierter Pauschale', () => {
  const cfg = standardConfig();
  const e = Object.assign({}, WERG, { vorschlag: 5325, kader: { aktiv: true }, einarbeitung: { erlaubt: true, reduktionProzent: 8 } });
  const a = baueWahlAbrechnung(cfg, e, 5325, { beschaeftigungsgrad: '100' });
  const b = Engine.rechneBetraege(cfg, 5325, { beschaeftigungsgrad: 100, einarbeitung: { erlaubt: true, reduktionProzent: 8 }, kader: true });
  const ein = a.zeilen.filter(r => r.art === 'einarbeitung');
  assert.deepEqual(ein.map(r => r.betrag), [b.reduzierterMonatslohn, b.reduzierteUeberstundenpauschale, b.reduzierterTotal]);
});

test('baueWahlAbrechnung: Satz des 13. Monatslohns aus der Konfiguration', () => {
  const cfg = standardConfig();
  cfg.betrieb.dreizehnterProzent = 5;
  const a = baueWahlAbrechnung(cfg, WERG, 5000, { beschaeftigungsgrad: '100' });
  assert.equal(wArt(a, 'dreizehnter').betrag, 250);
  assert.match(wArt(a, 'dreizehnter').label, /\(5 %\)/);
});

test('baueWahlAbrechnung: ungueltiger Lohn oder kein berechnetes Ergebnis gibt null', () => {
  const cfg = standardConfig();
  const k = { beschaeftigungsgrad: '100' };
  [NaN, null, undefined, '', 'abc', 0, -5, Infinity].forEach(w => assert.equal(baueWahlAbrechnung(cfg, WERG, w, k), null));
  assert.equal(baueWahlAbrechnung(cfg, Object.assign({}, WERG, { modus: 'sonderfall' }), 5000, k), null);
  assert.equal(baueWahlAbrechnung(cfg, null, 5000, k), null);
});

test('formatDifferenz: Vorzeichen und Dezimalkomma, Minus bei tieferem Lohn', () => {
  assert.equal(formatDifferenz({ chf: -50, prozent: -1.1 }), 'Differenz zum Vorschlag: -CHF 50.00 (-1,1 %)');
  assert.equal(formatDifferenz(null), '');
});

test('baueStufeManuellOptionen: erste Option leer, danach Stufe mit Erklärung', () => {
  const o = baueStufeManuellOptionen(standardConfig());
  assert.deepEqual(o[0], { value: '', label: '– bitte wählen –' });
  assert.deepEqual(o.map((x) => x.value), ['', 'Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV']);
  assert.equal(o[4].label, 'IIIa – Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)');
  assert.equal(o[1].label, 'Ia – ohne Berufslehre');
});

test('baueStufeManuellOptionen: ohne Erklärung nur die Stufe, ohne Konfiguration leer', () => {
  const c = standardConfig();
  delete c.stufen.II.erklaerung;
  assert.equal(baueStufeManuellOptionen(c)[3].label, 'II');
  assert.equal(baueStufeManuellOptionen(null).length, 7);
});

test('baueStufenvergleichZeilen: nächsthöhere Stufe mit Erklärung, wenn die Konfiguration übergeben wird', () => {
  const z = baueStufenvergleichZeilen(SV, standardConfig());
  assert.equal(z[1].text, '⚠ Nächsthöhere Stufe IIIb, EFZ plus 6 Tage berufsspezifische Weiterbildung (CHF 4663.00) erreicht oder überschritten');
});
