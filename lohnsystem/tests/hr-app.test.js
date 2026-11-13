'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formularZuInput, waehleOption } = require('../src/hr-app.js');

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
