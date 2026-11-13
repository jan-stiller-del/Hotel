'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { formularZuInput, waehleOption, baueSprachZeilen, baueAuszahlungZeilen, baueAbschlussGruppen, funktionsbereichText, bereichLabel, baueAnerkennungsZeile, zeigeStufeManuell, zeigeBaenderHinweis, stufeManuellBleibt } = require('../src/hr-app.js');

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
  assert.equal(funktionsbereichText(cfg, f('kueche-koch-efz')), 'Funktionsbereich: Küche');
  assert.equal(funktionsbereichText(cfg, f('spa-masseur')), 'Funktionsbereich: nicht geregelt');
  assert.equal(funktionsbereichText(cfg, null), '');
});

test('bereichLabel: direkter Nachschlag in config.bereiche', () => {
  const cfg = standardConfig();
  const f = (id) => cfg.funktionen.find(x => x.id === id);
  assert.equal(bereichLabel(cfg, f('kueche-koch-efz')), 'Küche');
  assert.equal(bereichLabel(cfg, f('spa-masseur')), 'nicht geregelt');
  assert.equal(bereichLabel(cfg, null), '');
});

test('baueAnerkennungsZeile: anerkannt mit Stufe aus dem Ergebnis', () => {
  const cfg = standardConfig();
  const r = baueAnerkennungsZeile(cfg, 'koch-efz', 'service-chef-de-rang', { modus: 'berechnet', stufe: 'IIIa', warnungen: [] });
  assert.equal(r.art, 'ok');
  assert.equal(r.text, 'Gelernt: Koch/Köchin EFZ (Küche, Restauration) → Neue Stelle: Chef de rang (Restauration): anerkannt, Stufe IIIa');
});

test('baueAnerkennungsZeile: Stufe aus der Konfiguration ohne Ergebnis', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'koch-efz', 'service-chef-de-rang', null);
  assert.match(r.text, /anerkannt, Stufe IIIa$/);
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
  assert.match(r.text, /von Hand gewählt: Stufe IV$/);
  assert.doesNotMatch(r.text, /Stufe von Hand wählen|Einstufung Ia/);
});

test('baueAnerkennungsZeile: manuelle Stufe übersteuert nicht anerkannten Fall', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'koch-efz', 'housekeeping-zimmermaedchen', { stufe: 'IIIa' }, { stufeManuell: 'IIIa' });
  assert.equal(r.art, 'warnung');
  assert.match(r.text, /von Hand gewählt: Stufe IIIa$/);
  assert.doesNotMatch(r.text, /Einstufung Ia/);
});

test('baueAnerkennungsZeile: Praktikum ohne Anerkennungsprüfung', () => {
  const r = baueAnerkennungsZeile(standardConfig(), 'koch-efz', 'housekeeping-zimmermaedchen', { stufe: 'P' }, { sonderfall: 'praktikum' });
  assert.equal(r.art, 'ok');
  assert.equal(r.text, 'Praktikum: Stufe P, keine Anerkennungsprüfung');
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
    else assert.match(t, new RegExp(e.stufe === 'P' ? 'Stufe P,' : 'Stufe ' + e.stufe + '$'));
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
