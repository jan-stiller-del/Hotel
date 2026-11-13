'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  validateConfig, parseConfigDatei, serializeConfig, STUFEN,
} = require('../src/config.js');

function ladeStandardkonfiguration() {
  const text = fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(text, sandbox);
  // JSON-Kopie, damit Objekte aus dem vm-Kontext normale Prototypen haben
  return JSON.parse(JSON.stringify(sandbox.window.LOHN_CONFIG));
}

function kopie() {
  return JSON.parse(JSON.stringify(ladeStandardkonfiguration()));
}

test('STUFEN enthält die sieben Stufen', () => {
  assert.deepStrictEqual(STUFEN, ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV', 'P']);
});

test('Standardkonfiguration wird akzeptiert, ohne Warnungen', () => {
  const r = validateConfig(ladeStandardkonfiguration());
  assert.deepStrictEqual(r.fehler, []);
  assert.deepStrictEqual(r.warnungen, []);
  assert.strictEqual(r.ok, true);
});

test('Standardkonfiguration: Inhalt gemäss Vorgabe', () => {
  const c = ladeStandardkonfiguration();
  assert.deepStrictEqual(c.mindestloehne[0].stufen,
    { Ia: 3735, Ib: 3967, II: 4094, IIIa: 4555, IIIb: 4663, IV: 5325, P: 2404 });
  assert.strictEqual(c.mindestloehne[0].gueltigAbJahresbetrieb, '2027-01-01');
  assert.strictEqual(c.mindestloehne[0].gueltigAbSaison, '2027-05-01');
  assert.strictEqual(c.abteilungen.length, 7);
  assert.deepStrictEqual(c.zusatzbausteine, []);
  assert.strictEqual(c.betrieb.wochenstunden, 43.5);
  for (const a of c.abteilungen) {
    assert.strictEqual(c.funktionen.filter((f) => f.abteilung === a.id).length, 2);
  }
  for (const f of c.funktionen) {
    assert.strictEqual(f.beispiel, true);
    const ohne = f.abteilung === 'kueche' || f.abteilung === 'technik';
    assert.strictEqual(f.gaestekontakt, !ohne);
  }
});

test('fehlende Mindestlohn-Stufe wird abgelehnt', () => {
  const c = kopie();
  delete c.mindestloehne[0].stufen.IIIb;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('IIIb')));
});

test('bandMin grösser als bandMax wird abgelehnt', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 6000;
  c.funktionen[0].bandMax = 5000;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.length > 0);
});

test('Funktion mit unbekannter Abteilung wird abgelehnt', () => {
  const c = kopie();
  c.funktionen[0].abteilung = 'gibt-es-nicht';
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes('gibt-es-nicht')));
});

test('doppelte Funktions-ID wird abgelehnt', () => {
  const c = kopie();
  c.funktionen[1].id = c.funktionen[0].id;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.fehler.some((t) => t.includes(c.funktionen[0].id)));
});

test('wochenstunden <= 0 wird abgelehnt', () => {
  for (const w of [0, -5]) {
    const c = kopie();
    c.betrieb.wochenstunden = w;
    const r = validateConfig(c);
    assert.strictEqual(r.ok, false);
    assert.ok(r.fehler.some((t) => t.includes('Wochenstunden')));
  }
});

test('bandMin unter Mindestlohn IIIa: nur Warnung', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 4000;
  c.funktionen[0].bandMax = 6000;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.fehler, []);
  assert.strictEqual(r.warnungen.length, 1);
});

test('bandMax unter Mindestlohn IV: nur Warnung', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 4600;
  c.funktionen[0].bandMax = 5000;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.fehler, []);
  assert.strictEqual(r.warnungen.length, 1);
});

test('Nicht-Objekt wird mit Fehler abgelehnt, ohne Absturz', () => {
  assert.strictEqual(validateConfig(null).ok, false);
  assert.strictEqual(validateConfig({}).ok, false);
});

test('parseConfigDatei(serializeConfig(c)) ergibt c', () => {
  const c = kopie();
  const text = serializeConfig(c);
  assert.ok(text.startsWith('window.LOHN_CONFIG = '));
  assert.ok(text.trimEnd().endsWith(';'));
  assert.deepStrictEqual(parseConfigDatei(text), c);
});

test('parseConfigDatei liest reines JSON', () => {
  const c = kopie();
  assert.deepStrictEqual(parseConfigDatei(JSON.stringify(c)), c);
});

test('parseConfigDatei wirft bei kaputtem Inhalt', () => {
  assert.throws(() => parseConfigDatei('kaputt'), /Konfigurationsdatei nicht lesbar/);
  assert.throws(() => parseConfigDatei('window.LOHN_CONFIG = {kaputt};'),
    /Konfigurationsdatei nicht lesbar/);
  assert.throws(() => parseConfigDatei(''), /Konfigurationsdatei nicht lesbar/);
});
