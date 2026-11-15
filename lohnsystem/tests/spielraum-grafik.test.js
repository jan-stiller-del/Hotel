'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const FX = require('./abschluss-fixture.js');
const G = require('../src/spielraum-grafik.js');

function config() {
  const sp = { vorgesetzte: 1, hr: 2, gm: 3 };
  return {
    version: 1,
    betrieb: { name: 'Test', wochenstunden: 43.5, dreizehnterProzent: 8.33, maxErfahrungsjahre: 10, einarbeitungMaxProzent: 8 },
    mindestloehne: [{ jahr: 2027, gueltigAbJahresbetrieb: '2027-01-01',
      stufen: { Ia: 3735, Ib: 3967, II: 4094, IIIa: 4555, IIIb: 4663, IV: 5325, P: 2404 } }],
    stufen: { IIIa: { spielraum: sp }, IV: { spielraum: sp }, P: { spielraum: sp } },
    lohnbaender: { Ia: { max: 5600 }, Ib: { max: 5600 }, II: { max: 5600 }, IIIa: { max: 5600 }, IIIb: { max: 5600 }, IV: { max: 5700 }, kader: { min: 6000, max: 7500, ueberschreitbar: true } },
    abteilungen: [{ id: 'a', label: 'A' }],
    bereiche: FX.bereiche,
    abschluesse: FX.abschluesse,
    funktionen: [
      { id: 'rec', abteilung: 'a', label: 'Rec', gaestekontakt: true },
    ].map(FX.funktion),
    bausteine: { erfahrungProJahr: 50, spracheProSprache: 100, maxSprachen: 2, sprachen: ['EN', 'FR', 'IT'], mindestNiveau: 'B2' },
    zusatzbausteine: [],
  };
}
function eingabe(extra) {
  return Object.assign({
    funktionId: 'rec', abschluss: 'efz', weiterbildung6Tage: false, erfahrungJahre: 4,
    sprachen: [{ sprache: 'EN', niveau: 'B2' }, { sprache: 'FR', niveau: 'C1' }, { sprache: 'IT', niveau: 'B2' }],
    beschaeftigungsgrad: 100, vertragsart: 'unbefristet', eintritt: '2027-03-01', sonderfall: 'keiner', zusatzIds: [],
  }, extra || {});
}
function efz() { return E.berechne(config(), eingabe()); }
function marke(m, art) { return m.marken.filter((x) => x.art === art)[0]; }

test('EFZ-Beispiel: Vorschlag 4955', () => {
  assert.equal(efz().vorschlag, 4955);
});

test('drei Bänder GM aussen, HR, Vorgesetzte innen, alle in der Achse', () => {
  const m = G.baueGrafikModell(efz(), null);
  assert.deepEqual(m.baender.map((b) => b.name), ['GM', 'HR', 'Vorgesetzte']);
  assert.deepEqual(m.baender.map((b) => [b.von, b.bis]), [[4807, 5104], [4856, 5055], [4906, 5005]]);
  m.baender.forEach((b) => {
    assert.ok(b.vonProzent >= 0 && b.bisProzent <= 100 && b.vonProzent < b.bisProzent, b.name);
    assert.ok(b.von >= m.achse.min && b.bis <= m.achse.max);
  });
  assert.ok(m.baender[0].vonProzent < m.baender[1].vonProzent && m.baender[1].vonProzent < m.baender[2].vonProzent);
  assert.ok(m.baender[0].bisProzent > m.baender[1].bisProzent && m.baender[1].bisProzent > m.baender[2].bisProzent);
});

test('Marke vorschlag bei 4955, in der Mitte', () => {
  const v = marke(G.baueGrafikModell(efz(), null), 'vorschlag');
  assert.equal(v.wert, 4955);
  assert.ok(Math.abs(v.prozent - 50) < 0.5); // Grenzen sind aufgerundet, daher nicht exakt symmetrisch
  assert.match(v.label, /4955\.00/);
});

test('Marke gewaehlt folgt dem Lohn und fehlt bei null', () => {
  assert.equal(marke(G.baueGrafikModell(efz(), null), 'gewaehlt'), undefined);
  const a = marke(G.baueGrafikModell(efz(), 5040), 'gewaehlt');
  const b = marke(G.baueGrafikModell(efz(), 4900), 'gewaehlt');
  assert.equal(a.wert, 5040);
  assert.ok(a.prozent > 50 && b.prozent < 50);
});

test('Freigabe-Text nach Stufe', () => {
  assert.equal(G.baueGrafikModell(efz(), null).freigabe, null);
  assert.equal(G.baueGrafikModell(efz(), 4955).freigabe, 'keine nötig');
  assert.equal(G.baueGrafikModell(efz(), 4960).freigabe, 'Vorgesetzte');
  assert.equal(G.baueGrafikModell(efz(), 5040).freigabe, 'HR');
  assert.equal(G.baueGrafikModell(efz(), 5100).freigabe, 'GM');
  assert.equal(G.baueGrafikModell(efz(), 5200).freigabe, 'nicht zulässig');
  assert.match(marke(G.baueGrafikModell(efz(), 5040), 'gewaehlt').label, /HR/);
});

test('Mindestlohn und Bandende nur sichtbar, wenn in der Achse', () => {
  const m = G.baueGrafikModell(efz(), null);
  assert.equal(marke(m, 'mindestlohn'), undefined);
  assert.equal(marke(m, 'bandMax'), undefined);
  const e = efz();
  e.mindestlohn = 4800;
  e.bandMax = 5120;
  const m2 = G.baueGrafikModell(e, null);
  const ml = marke(m2, 'mindestlohn');
  assert.ok(ml && ml.prozent >= 0 && ml.prozent <= 100);
  assert.ok(marke(m2, 'bandMax'));
});

test('gewählter Lohn ausserhalb des GM-Bandes: am Achsenrand mit Hinweis ausserhalb', () => {
  const hoch = marke(G.baueGrafikModell(efz(), 5200), 'gewaehlt');
  assert.equal(hoch.prozent, 100);
  assert.equal(hoch.wert, 5200);
  assert.match(hoch.label, /ausserhalb/);
  const tief = marke(G.baueGrafikModell(efz(), 4000), 'gewaehlt');
  assert.equal(tief.prozent, 0);
  assert.match(tief.label, /ausserhalb/);
  assert.doesNotMatch(marke(G.baueGrafikModell(efz(), 5040), 'gewaehlt').label, /ausserhalb/);
});

test('band_zu_eng: Spanne null, keine Division durch null', () => {
  const c = config();
  c.lohnbaender.IV.max = 4400;
  const e = E.berechne(c, eingabe({ abschluss: 'berufspruefung' }));
  assert.ok(e.warnungen.some((w) => w.code === 'band_zu_eng'));
  const m = G.baueGrafikModell(e, null);
  assert.ok(m.achse.max > m.achse.min);
  m.baender.forEach((b) => {
    [b.vonProzent, b.bisProzent].forEach((p) => assert.ok(Number.isFinite(p) && p >= 0 && p <= 100));
  });
  assert.ok(Number.isFinite(marke(m, 'vorschlag').prozent));
});

test('null bei Praktikum, Hinweis, Fehler und fehlendem Ergebnis', () => {
  assert.equal(G.baueGrafikModell(E.berechne(config(), eingabe({ sonderfall: 'praktikum' })), null), null);
  assert.equal(G.baueGrafikModell(E.berechne(config(), eingabe({ sonderfall: 'unter18' })), null), null);
  assert.equal(G.baueGrafikModell(E.berechne(config(), eingabe({ erfahrungJahre: 2.5 })), null), null);
  assert.equal(G.baueGrafikModell(null, null), null);
});

test('ungültiger gewählter Lohn (NaN) wird wie leer behandelt', () => {
  const m = G.baueGrafikModell(efz(), NaN);
  assert.equal(marke(m, 'gewaehlt'), undefined);
  assert.equal(m.freigabe, null);
});

test('Kader mit überschreitbarem Band: Achse reicht bis zum gewählten Lohn, Bandende erscheint', () => {
  const c = config();
  c.funktionen.push(FX.funktion({ id: 'chef', abteilung: 'a', label: 'Chef', gaestekontakt: false, kader: true }));
  const e = E.berechne(c, eingabe({ funktionId: 'chef', abschluss: 'berufspruefung', sprachen: [] }));
  assert.equal(e.vorschlag, 6000);
  const m = G.baueGrafikModell(e, 7400);
  assert.ok(m.achse.max >= 7400);
  assert.ok(marke(m, 'gewaehlt').prozent < 100);
  assert.equal(marke(m, 'bandMax'), undefined); // 7500 liegt noch ausserhalb der Achse
  const m2 = G.baueGrafikModell(e, 7600);
  assert.ok(marke(m2, 'bandMax'));
  assert.ok(marke(m2, 'gewaehlt').prozent < 100);
  const m3 = G.baueGrafikModell(e, null);
  assert.ok(m3.achse.max < 7000); // ohne gewählten Lohn bleibt die Achse beim Spielraum
});
