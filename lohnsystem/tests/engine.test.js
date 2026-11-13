'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

function baueConfig() {
  return {
    version: 1,
    betrieb: { name: 'Test', wochenstunden: 43.5, dreizehnterProzent: 8.33, maxErfahrungsjahre: 10, einarbeitungMaxProzent: 8 },
    mindestloehne: [
      { jahr: 2027, gueltigAbJahresbetrieb: '2027-01-01', gueltigAbSaison: '2027-05-01',
        stufen: { Ia: 3735, Ib: 3967, II: 4094, IIIa: 4555, IIIb: 4663, IV: 5325, P: 2404 } },
      { jahr: 2026, gueltigAbJahresbetrieb: '2026-01-01', gueltigAbSaison: '2026-05-01',
        stufen: { Ia: 3700, Ib: 3900, II: 4000, IIIa: 4500, IIIb: 4600, IV: 5200, P: 2300 } },
    ],
    stufen: {},
    abteilungen: [{ id: 'a', label: 'A' }],
    funktionen: [
      { id: 'rec', abteilung: 'a', label: 'Rec', gaestekontakt: true, bandMin: 4300, bandMax: 5600 },
      { id: 'koch', abteilung: 'a', label: 'Koch', gaestekontakt: false, bandMin: 4300, bandMax: 5600 },
      { id: 'eng', abteilung: 'a', label: 'Eng', gaestekontakt: true, bandMin: 4300, bandMax: 4400 },
    ],
    bausteine: { erfahrungProJahr: 50, spracheProSprache: 100, maxSprachen: 2, sprachen: ['DE', 'EN', 'FR', 'IT'], mindestNiveau: 'B2' },
    zusatzbausteine: [
      { id: 'zl', label: 'Zulage', art: 'lohn', betrag: 150 },
      { id: 'ze', label: 'Pauschale', art: 'entschaedigung', betrag: 80 },
    ],
  };
}

function eingabe(extra) {
  return Object.assign({
    funktionId: 'rec', abschluss: 'efz', weiterbildung6Tage: false, erfahrungJahre: 0,
    sprachen: [], beschaeftigungsgrad: 100, vertragsart: 'unbefristet', eintritt: '2027-03-01',
    sonderfall: 'keiner', zusatzIds: [],
  }, extra || {});
}

test('bestimmeStufe: Abschluss zu Stufe', () => {
  const s = (i) => E.bestimmeStufe(i).stufe;
  assert.equal(s({ abschluss: 'keiner' }), 'Ia');
  assert.equal(s({ abschluss: 'progresso' }), 'Ib');
  assert.equal(s({ abschluss: 'eba' }), 'II');
  assert.equal(s({ abschluss: 'efz' }), 'IIIa');
  assert.equal(s({ abschluss: 'efz', weiterbildung6Tage: true }), 'IIIb');
  assert.equal(s({ abschluss: 'berufspruefung' }), 'IV');
});

test('bestimmeStufe: HF ohne Handwahl offen, mit Handwahl IV; beides mit Warnung', () => {
  for (const ab of ['hf', 'hotelfachschule']) {
    const offen = E.bestimmeStufe({ abschluss: ab });
    assert.equal(offen.stufe, null);
    assert.ok(offen.warnungen.some((w) => w.code === 'hf_offen'));
    const manuell = E.bestimmeStufe({ abschluss: ab, stufeManuell: 'IV' });
    assert.equal(manuell.stufe, 'IV');
    assert.ok(manuell.warnungen.some((w) => w.code === 'hf_offen'));
  }
});

test('findeMindestlohnTabelle: Stichtage Jahresbetrieb', () => {
  const c = baueConfig();
  assert.equal(E.findeMindestlohnTabelle(c, '2026-12-31', 'unbefristet').tabelle.jahr, 2026);
  assert.equal(E.findeMindestlohnTabelle(c, '2027-01-01', 'unbefristet').tabelle.jahr, 2027);
});

test('findeMindestlohnTabelle: Stichtage Saison', () => {
  const c = baueConfig();
  assert.equal(E.findeMindestlohnTabelle(c, '2027-04-30', 'saison').tabelle.jahr, 2026);
  assert.equal(E.findeMindestlohnTabelle(c, '2027-05-01', 'saison').tabelle.jahr, 2027);
});

test('findeMindestlohnTabelle: veraltet nach über einem Jahr', () => {
  const c = baueConfig();
  assert.equal(E.findeMindestlohnTabelle(c, '2027-12-31', 'unbefristet').veraltet, false);
  const r = E.findeMindestlohnTabelle(c, '2028-01-02', 'unbefristet');
  assert.equal(r.veraltet, true);
  assert.equal(r.tabelle.jahr, 2027);
});

test('findeMindestlohnTabelle: vor der ersten Tabelle keine Tabelle', () => {
  assert.equal(E.findeMindestlohnTabelle(baueConfig(), '2025-06-01', 'unbefristet').tabelle, null);
});

test('berechne: EFZ mit Erfahrung und Sprachen', () => {
  const r = E.berechne(baueConfig(), eingabe({
    erfahrungJahre: 4,
    sprachen: [{ sprache: 'EN', niveau: 'B2' }, { sprache: 'FR', niveau: 'C1' }, { sprache: 'IT', niveau: 'B2' }],
  }));
  assert.equal(r.modus, 'berechnet');
  assert.equal(r.stufe, 'IIIa');
  assert.equal(r.mindestlohn, 4555);
  assert.equal(r.tabelleJahr, 2027);
  assert.deepEqual(r.positionen.map((p) => [p.betrag, p.art]), [[4555, 'basis'], [200, 'lohn'], [200, 'lohn']]);
  assert.equal(r.vorschlag, 4955);
  assert.equal(r.monatslohn, 4955);
  assert.equal(r.dreizehnter, 412.75);
  assert.equal(r.totalMonat, 5367.75);
  assert.equal(r.jahresbrutto, 64413);
  assert.equal(r.stundenansatz, Math.round((4955 / 188.5) * 100) / 100);
  assert.equal(r.bandStart, 4555);
  assert.equal(r.bandMax, 5600);
  assert.equal(r.spanne, null);
  assert.equal(r.einarbeitung, null);
});

test('berechne: Erfahrung über 10 Jahre zählt wie 10', () => {
  const a = E.berechne(baueConfig(), eingabe({ erfahrungJahre: 15 }));
  const b = E.berechne(baueConfig(), eingabe({ erfahrungJahre: 10 }));
  assert.equal(a.vorschlag, b.vorschlag);
  assert.equal(a.vorschlag, 5055);
});

test('berechne: ungültige Erfahrung ist ein Fehler ohne NaN', () => {
  for (const v of [2.3, -1, 'x', NaN, undefined]) {
    const r = E.berechne(baueConfig(), eingabe({ erfahrungJahre: v }));
    assert.equal(r.modus, 'fehler', String(v));
    assert.ok(r.fehler.length > 0);
    assert.equal(r.vorschlag, null);
  }
});

test('berechne: nur ganze Erfahrungsjahre, halbe Jahre sind ein Fehler', () => {
  for (const v of [0.5, 2.5]) {
    const r = E.berechne(baueConfig(), eingabe({ erfahrungJahre: v }));
    assert.equal(r.modus, 'fehler', String(v));
    assert.match(r.fehler[0], /ganzen Jahren/);
  }
  assert.equal(E.berechne(baueConfig(), eingabe({ erfahrungJahre: 3 })).vorschlag, 4705);
  assert.equal(E.berechne(baueConfig(), eingabe({ erfahrungJahre: 0 })).modus, 'berechnet');
});

test('berechne: Deutsch zählt wie jede andere Sprache', () => {
  const r = E.berechne(baueConfig(), eingabe({ sprachen: [{ sprache: 'DE', niveau: 'B2' }, { sprache: 'EN', niveau: 'C1' }] }));
  assert.equal(r.modus, 'berechnet');
  assert.deepEqual(r.positionen.map((p) => p.betrag), [4555, 200]);
  assert.equal(r.vorschlag, 4755);
  const b1 = E.berechne(baueConfig(), eingabe({ sprachen: [{ sprache: 'DE', niveau: 'B1' }] }));
  assert.equal(b1.positionen.length, 1);
  assert.equal(b1.vorschlag, 4555);
});

test('berechne: Funktion ohne Gästekontakt gibt keinen Sprachzuschlag', () => {
  const r = E.berechne(baueConfig(), eingabe({ funktionId: 'koch', sprachen: [{ sprache: 'EN', niveau: 'C1' }] }));
  assert.equal(r.modus, 'berechnet');
  assert.equal(r.positionen.length, 1);
  assert.equal(r.fehler.length, 0);
});

test('berechne: leere Sprachenliste oder nur B1 ergeben keine Sprachposition', () => {
  for (const sprachen of [[], [{ sprache: 'DE', niveau: 'B1' }], [{ sprache: 'EN', niveau: 'B1' }]]) {
    const r = E.berechne(baueConfig(), eingabe({ sprachen }));
    assert.equal(r.modus, 'berechnet');
    assert.equal(r.positionen.length, 1);
    assert.equal(r.vorschlag, 4555);
  }
});

test('berechne: Muttersprache zählt wie B2', () => {
  const r = E.berechne(baueConfig(), eingabe({ sprachen: [{ sprache: 'EN', niveau: 'Muttersprache' }] }));
  assert.equal(r.vorschlag, 4655);
});

test('berechne: Teilzeit 60 Prozent, Mindestlohnvergleich auf Vollzeitbasis', () => {
  const r = E.berechne(baueConfig(), eingabe({ beschaeftigungsgrad: 60 }));
  assert.equal(r.vorschlag, 4555);
  assert.equal(r.monatslohn, 2733);
  assert.equal(r.monatslohn, Math.round(4555 * 0.6 * 20) / 20);
  assert.equal(r.warnungen.filter((w) => w.code === 'band_zu_eng').length, 0);
  assert.equal(r.stundenansatz, 24.16);
  const voll = E.berechne(baueConfig(), eingabe({ beschaeftigungsgrad: 100 }));
  assert.equal(voll.stundenansatz, 24.16);
  assert.equal(voll.stundenansatz, Math.round((voll.vorschlag / 188.5) * 100) / 100);
});

test('berechne: Beschäftigungsgrad 0 und 101 sind Fehler', () => {
  for (const g of [0, 101, -5, 'x']) {
    assert.equal(E.berechne(baueConfig(), eingabe({ beschaeftigungsgrad: g })).modus, 'fehler');
  }
});

test('berechne: Band zu eng, Mindestlohn schlägt Bandmaximum', () => {
  const r = E.berechne(baueConfig(), eingabe({ funktionId: 'eng', abschluss: 'berufspruefung' }));
  assert.equal(r.modus, 'berechnet');
  assert.equal(r.vorschlag, 5325);
  assert.ok(r.warnungen.some((w) => w.code === 'band_zu_eng'));
});

test('berechne: Vorschlag über Bandmaximum wird geklemmt', () => {
  const r = E.berechne(baueConfig(), eingabe({ abschluss: 'berufspruefung', erfahrungJahre: 10, zusatzIds: ['zl'] }));
  assert.equal(r.vorschlag, 5600);
});

test('berechne: Zusatzbaustein Lohn erhöht, Entschädigung nicht', () => {
  const basis = E.berechne(baueConfig(), eingabe());
  const lohn = E.berechne(baueConfig(), eingabe({ zusatzIds: ['zl'] }));
  assert.equal(lohn.vorschlag, basis.vorschlag + 150);
  const ent = E.berechne(baueConfig(), eingabe({ zusatzIds: ['ze'] }));
  assert.equal(ent.vorschlag, basis.vorschlag);
  assert.equal(ent.totalMonat, basis.totalMonat);
  assert.deepEqual(ent.entschaedigungen, [{ label: 'Pauschale', betrag: 80 }]);
});

test('berechne: Praktikum gleich Tabellenwert P ohne Bausteine und Band', () => {
  const r = E.berechne(baueConfig(), eingabe({
    sonderfall: 'praktikum', erfahrungJahre: 5, sprachen: [{ sprache: 'EN', niveau: 'C1' }],
  }));
  assert.equal(r.modus, 'berechnet');
  assert.equal(r.stufe, 'P');
  assert.equal(r.vorschlag, 2404);
  assert.equal(r.positionen.length, 1);
  assert.equal(r.bandStart, null);
  assert.equal(r.bandMax, null);
});

test('berechne: Sonderfälle ohne Berechnung ergeben Hinweis', () => {
  for (const sonderfall of ['unter18', 'vollzeitstudium', 'wiedereingliederung']) {
    const r = E.berechne(baueConfig(), eingabe({ sonderfall }));
    assert.equal(r.modus, 'hinweis', sonderfall);
    assert.equal(r.vorschlag, null);
    assert.equal(r.monatslohn, null);
    assert.equal(r.totalMonat, null);
    assert.ok(r.warnungen.length > 0);
  }
});

test('berechne: unbekannte Funktion ist ein Fehler', () => {
  const r = E.berechne(baueConfig(), eingabe({ funktionId: 'gibtsnicht' }));
  assert.equal(r.modus, 'fehler');
  assert.ok(r.fehler.length > 0);
});

test('berechne: HF ohne Stufenwahl ergibt Fehler mit hf_offen', () => {
  const r = E.berechne(baueConfig(), eingabe({ abschluss: 'hf' }));
  assert.equal(r.modus, 'fehler');
  assert.deepEqual(r.fehler, ['Stufe wählen']);
  assert.ok(r.warnungen.some((w) => w.code === 'hf_offen'));
});

test('berechne: HF mit Stufenwahl rechnet', () => {
  const r = E.berechne(baueConfig(), eingabe({ abschluss: 'hf', stufeManuell: 'IV' }));
  assert.equal(r.modus, 'berechnet');
  assert.equal(r.stufe, 'IV');
  assert.equal(r.vorschlag, 5325);
});

test('berechne: veraltete Tabelle erzeugt Warnung', () => {
  const r = E.berechne(baueConfig(), eingabe({ eintritt: '2029-01-01' }));
  assert.ok(r.warnungen.some((w) => w.code === 'tabelle_veraltet'));
});

test('rechneBetraege: gewaehlter Lohn, Teilzeit 60 % und Einarbeitung 8 %', () => {
  const cfg = baueConfig();
  const b = E.rechneBetraege(cfg, 5040, { beschaeftigungsgrad: 60, einarbeitung: { erlaubt: true, reduktionProzent: 8 } });
  assert.equal(b.monatslohn, 3024);
  assert.equal(b.dreizehnter, 251.9);
  assert.equal(b.totalMonat, 3275.9);
  assert.equal(b.jahresbrutto, 39310.8);
  assert.equal(b.stundenansatz, 26.74);
  assert.equal(b.reduzierterMonatslohn, 2782.1);
  assert.equal(b.reduzierterTotal, 3013.85);
  const o = E.rechneBetraege(cfg, 5040, { beschaeftigungsgrad: 100, einarbeitung: { erlaubt: false, reduktionProzent: 8 } });
  assert.equal(o.reduzierterMonatslohn, null);
  assert.equal(o.reduzierterTotal, null);
});

test('Standardkonfiguration: EFZ-Beispiel Réceptionist/in ergibt 4675', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8'), sandbox);
  const config = JSON.parse(JSON.stringify(sandbox.window.LOHN_CONFIG));
  assert.equal(config.bausteine.erfahrungProJahr, 10);
  assert.equal(config.bausteine.spracheProSprache, 20);
  assert.deepEqual(config.bausteine.sprachen, ['DE', 'EN', 'FR', 'IT']);
  assert.equal(config.bausteine.maxSprachen, 4);
  const r = E.berechne(config, eingabe({
    funktionId: 'reception-mitarbeiter', erfahrungJahre: 4,
    sprachen: [{ sprache: 'DE', niveau: 'B2' }, { sprache: 'EN', niveau: 'B2' }, { sprache: 'FR', niveau: 'C1' }, { sprache: 'IT', niveau: 'B2' }],
  }));
  assert.deepEqual(r.positionen.map((p) => p.betrag), [4555, 40, 80]);
  assert.equal(r.vorschlag, 4675);
});
