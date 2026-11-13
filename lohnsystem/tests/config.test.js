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
  const anzahl = { reception: 11, housekeeping: 9, kueche: 14, service: 14, spa: 8, technik: 7, administration: 12 };
  for (const a of c.abteilungen) {
    assert.strictEqual(c.funktionen.filter((f) => f.abteilung === a.id).length, anzahl[a.id], a.id);
  }
  assert.strictEqual(c.funktionen.length, 75);
  assert.strictEqual(new Set(c.funktionen.map((f) => f.id)).size, 75);
  for (const f of c.funktionen) {
    assert.strictEqual(f.beispiel, true);
    assert.ok(f.id.startsWith(f.abteilung + '-'), f.id);
    assert.ok(f.bandMin < f.bandMax, f.id);
    if (['kueche', 'technik'].includes(f.abteilung)) assert.strictEqual(f.gaestekontakt, false, f.id);
    if (['reception', 'service', 'spa'].includes(f.abteilung)) assert.strictEqual(f.gaestekontakt, true, f.id);
  }
  for (const a of c.abteilungen) {
    const labels = c.funktionen.filter((f) => f.abteilung === a.id).map((f) => f.label);
    assert.strictEqual(new Set(labels).size, labels.length, 'Labels doppelt in ' + a.id);
  }
  const lab = (id) => c.funktionen.find((f) => f.id === id).label;
  assert.strictEqual(lab('reception-receptionist'), 'Receptionist');
  assert.strictEqual(lab('kueche-koch-efz'), 'Cuisinier');
  assert.strictEqual(lab('kueche-kuechenangestellte-eba'), 'Commis de cuisine (Einstieg)');
  assert.strictEqual(lab('service-restaurationsfachfrau-efz'), 'Demi-chef de rang');
  assert.strictEqual(lab('technik-leitung'), 'Head of Engineering');
  const neu = {
    'reception-chauffeur': ['Chauffeur', true, 3735, 4500],
    'reception-guest-relations': ['Guest Relations Agent', true, 4555, 5450],
    'housekeeping-laundry-supervisor': ['Laundry Supervisor', false, 4555, 5450],
    'kueche-saucier': ['Saucier', false, 5325, 6400],
    'kueche-entremetier': ['Entremetier', false, 5325, 6400],
    'kueche-garde-manger': ['Garde-manger', false, 5325, 6400],
    'kueche-tournant': ['Tournant', false, 5325, 6400],
    'kueche-cuisinier-fruehstueck': ['Cuisinier au petit-déjeuner', false, 4555, 5450],
    'service-sommelier': ['Sommelier', true, 4663, 5600],
    'service-chef-de-rang': ['Chef de rang', true, 4663, 5600],
    'service-commis-de-bar': ['Commis de bar', true, 4094, 4900],
    'spa-fitness-trainer': ['Fitness Trainer', true, 4555, 5450],
    'spa-physiotherapist': ['Physiotherapist', true, 4555, 5450],
    'technik-electrician': ['Electrician', false, 4555, 5450],
    'administration-revenue-manager': ['Revenue Manager', false, 5325, 6400],
    'administration-event-manager': ['Event Manager', true, 5325, 6400],
    'administration-it-manager': ['IT Manager', false, 5325, 6400],
    'administration-reservations-manager': ['Reservations Manager', false, 5325, 6400],
  };
  for (const [id, [label, g, min, max]] of Object.entries(neu)) {
    const f = c.funktionen.find((x) => x.id === id);
    assert.ok(f, id);
    assert.strictEqual(f.label, label, id);
    assert.strictEqual(f.gaestekontakt, g, id);
    assert.strictEqual(f.bandMin, min, id);
    assert.strictEqual(f.bandMax, max, id);
  }
  const gk = (id) => c.funktionen.find((f) => f.id === id).gaestekontakt;
  assert.strictEqual(gk('housekeeping-hausbursche'), false);
  assert.strictEqual(gk('housekeeping-lingerie'), false);
  assert.strictEqual(gk('housekeeping-gouvernante'), true);
  assert.strictEqual(gk('administration-sales-marketing'), true);
  assert.strictEqual(gk('administration-marketingfachperson'), true);
  assert.strictEqual(gk('administration-buchhalter'), false);
  const rec = c.funktionen.find((f) => f.id === 'reception-receptionist');
  assert.strictEqual(rec.bandMin, 4555);
  assert.strictEqual(rec.bandMax, 5450);
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

test('bandMin unter Mindestlohn Ia: nur Warnung', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 3500;
  c.funktionen[0].bandMax = 6000;
  const r = validateConfig(c);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.fehler, []);
  assert.strictEqual(r.warnungen.length, 1);
});

test('Band einer Stufe Ia (3735 bis 4500) ist ohne Warnung', () => {
  const c = kopie();
  c.funktionen[0].bandMin = 3735;
  c.funktionen[0].bandMax = 4500;
  const r = validateConfig(c);
  assert.deepStrictEqual(r.warnungen, []);
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
