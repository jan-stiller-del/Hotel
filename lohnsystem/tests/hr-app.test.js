'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { formularZuInput, waehleOption, baueSprachZeilen, baueAuszahlungZeilen, baueAbschlussGruppen, funktionsbereichText } = require('../src/hr-app.js');

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
