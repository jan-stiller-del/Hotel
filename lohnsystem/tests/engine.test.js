'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const FX = require('./abschluss-fixture.js');

function baueConfig() {
  return {
    version: 1,
    betrieb: { name: 'Test', wochenstunden: 43.5, dreizehnterProzent: 8.33, maxErfahrungsjahre: 10, einarbeitungMaxProzent: 8 },
    mindestloehne: [
      { jahr: 2027, gueltigAbJahresbetrieb: '2027-01-01',
        stufen: { Ia: 3735, Ib: 3967, II: 4094, IIIa: 4555, IIIb: 4663, IV: 5325, P: 2404 } },
      { jahr: 2026, gueltigAbJahresbetrieb: '2026-01-01',
        stufen: { Ia: 3700, Ib: 3900, II: 4000, IIIa: 4500, IIIb: 4600, IV: 5200, P: 2300 } },
    ],
    stufen: {},
    lohnbaender: { Ia: { max: 5600 }, Ib: { max: 5600 }, II: { max: 5600 }, IIIa: { max: 5600 }, IIIb: { max: 5600 }, IV: { max: 5700 }, kader: { min: 6000, max: 7500, ueberschreitbar: true } },
    abteilungen: [{ id: 'a', label: 'A' }],
    bereiche: FX.bereiche,
    abschluesse: FX.abschluesse,
    funktionen: [
      { id: 'rec', abteilung: 'a', label: 'Rec', gaestekontakt: true, bandMin: 4300, bandMax: 5600 },
      { id: 'koch', abteilung: 'a', label: 'Koch', gaestekontakt: false, bandMin: 4300, bandMax: 5600 },
      { id: 'eng', abteilung: 'a', label: 'Eng', gaestekontakt: true, bandMin: 4300, bandMax: 4400 },
    ].map(FX.funktion),
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
  const c = baueConfig();
  const s = (i) => E.bestimmeStufe(c, Object.assign({ funktionId: 'rec' }, i)).stufe;
  assert.equal(s({ abschluss: 'keiner' }), 'Ia');
  assert.equal(s({ abschluss: 'progresso' }), 'Ib');
  assert.equal(s({ abschluss: 'eba' }), 'II');
  assert.equal(s({ abschluss: 'efz' }), 'IIIa');
  assert.equal(s({ abschluss: 'efz', weiterbildung6Tage: true }), 'IIIb');
  assert.equal(s({ abschluss: 'berufspruefung' }), 'IV');
});

test('bestimmeStufe: HF ohne Handwahl offen (hf_offen), mit Handwahl IV ohne hf_offen', () => {
  const c = baueConfig();
  const offen = E.bestimmeStufe(c, { funktionId: 'rec', abschluss: 'hf' });
  assert.equal(offen.stufe, null);
  assert.ok(offen.warnungen.some((w) => w.code === 'hf_offen'));
  const manuell = E.bestimmeStufe(c, { funktionId: 'rec', abschluss: 'hf', stufeManuell: 'IV' });
  assert.equal(manuell.stufe, 'IV');
  assert.ok(!manuell.warnungen.some((w) => w.code === 'hf_offen'));
  assert.ok(manuell.warnungen.some((w) => w.code === 'stufe_manuell'));
});

test('findeMindestlohnTabelle: Stichtage Jahresbetrieb', () => {
  const c = baueConfig();
  assert.equal(E.findeMindestlohnTabelle(c, '2026-12-31', 'unbefristet').tabelle.jahr, 2026);
  assert.equal(E.findeMindestlohnTabelle(c, '2027-01-01', 'unbefristet').tabelle.jahr, 2027);
});

test('findeMindestlohnTabelle: befristete Stelle folgt dem Stichtag Jahresbetrieb (1.1.)', () => {
  const c = baueConfig();
  assert.equal(E.findeMindestlohnTabelle(c, '2026-12-31', 'befristet').tabelle.jahr, 2026);
  assert.equal(E.findeMindestlohnTabelle(c, '2027-01-01', 'befristet').tabelle.jahr, 2027);
  assert.equal(E.findeMindestlohnTabelle(c, '2027-03-01', 'befristet').tabelle.jahr, 2027);
});

test('Vertragsart befristet wird akzeptiert', () => {
  const c = baueConfig();
  const r = E.berechne(c, Object.assign({}, eingabe(), { vertragsart: 'befristet' }));
  assert.ok(!(r.fehler || []).some((x) => /Vertragsart/.test(x)));
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
  const c = baueConfig();
  c.lohnbaender.IV.max = 5000;
  const r = E.berechne(c, eingabe({ abschluss: 'berufspruefung' }));
  assert.equal(r.modus, 'berechnet');
  assert.equal(r.vorschlag, 5325);
  assert.ok(r.warnungen.some((w) => w.code === 'band_zu_eng'));
});

test('berechne: Vorschlag über Bandmaximum wird geklemmt', () => {
  const r = E.berechne(baueConfig(), eingabe({ abschluss: 'berufspruefung', erfahrungJahre: 10, zusatzIds: ['zl'] }));
  assert.equal(r.vorschlag, 5700);
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
  assert.equal(b.reduzierterMonatslohn, 2783);
  assert.equal(b.reduzierterTotal, 3014.8);
  const o = E.rechneBetraege(cfg, 5040, { beschaeftigungsgrad: 100, einarbeitung: { erlaubt: false, reduktionProzent: 8 } });
  assert.equal(o.reduzierterMonatslohn, null);
  assert.equal(o.reduzierterTotal, null);
});

test('Standardkonfiguration: EFZ-Beispiel Receptionist/in (Kaufmann HGT EFZ) ergibt 4675', () => {
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
    funktionId: 'reception-receptionist', abschluss: 'kaufmann-hgt-efz', erfahrungJahre: 4,
    sprachen: [{ sprache: 'DE', niveau: 'B2' }, { sprache: 'EN', niveau: 'B2' }, { sprache: 'FR', niveau: 'C1' }, { sprache: 'IT', niveau: 'B2' }],
  }));
  assert.deepEqual(r.positionen.map((p) => p.betrag), [4555, 40, 80]);
  assert.equal(r.vorschlag, 4675);
});

// ---- Einstufung nach Abschluss und Funktionsbereich (Standardkonfiguration) ----
function standardConfig() {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.LOHN_CONFIG));
}
const SC = standardConfig();
function stufeFuer(funktionId, abschluss, extra) {
  const r = E.berechne(SC, eingabe(Object.assign({ funktionId, abschluss }, extra || {})));
  return { stufe: r.stufe, codes: r.warnungen.map((w) => w.code), r };
}

test('Einstufung: Koch EFZ in der Küche ergibt IIIa ohne Warnung', () => {
  const r = stufeFuer('kueche-commis', 'koch-efz');
  assert.equal(r.stufe, 'IIIa');
  assert.deepEqual(r.codes, []);
});

test('Einstufung: Koch EFZ im Service ergibt IIIa', () => {
  const r = stufeFuer('service-commis-de-rang', 'koch-efz');
  assert.equal(r.stufe, 'IIIa');
  assert.deepEqual(r.codes, []);
});

test('Einstufung: Koch EFZ im Housekeeping ergibt Ia mit Warnung', () => {
  const r = stufeFuer('housekeeping-zimmermaedchen', 'koch-efz');
  assert.equal(r.stufe, 'Ia');
  assert.deepEqual(r.codes, ['abschluss_nicht_anerkannt']);
  assert.match(r.r.warnungen[0].text, /nicht anerkannt/);
});

test('Einstufung: Restaurationsfachfrau EFZ in der Küche ergibt Ia', () => {
  const r = stufeFuer('kueche-commis', 'restaurationsfachmann-efz');
  assert.equal(r.stufe, 'Ia');
  assert.equal(r.r.vorschlag, 3735);
  assert.deepEqual(r.codes, ['abschluss_nicht_anerkannt']);
});

test('Einstufung: Hotelfachfrau EFZ an der Réception ergibt Ia mit Warnung', () => {
  const r = stufeFuer('reception-receptionist', 'hotelfachmann-efz');
  assert.equal(r.stufe, 'Ia');
  assert.equal(r.r.vorschlag, 3735);
  assert.deepEqual(r.codes, ['abschluss_nicht_anerkannt']);
});

test('Einstufung: Kaufmann/Kauffrau EFZ an der Réception ergibt IIIa', () => {
  const r = stufeFuer('reception-receptionist', 'kaufmann-efz');
  assert.equal(r.stufe, 'IIIa');
  assert.deepEqual(r.codes, []);
});

test('Einstufung: Koch EFZ mit Weiterbildung von 6 Tagen im Service ergibt IIIb', () => {
  const r = stufeFuer('service-commis-de-rang', 'koch-efz', { weiterbildung6Tage: true });
  assert.equal(r.stufe, 'IIIb');
});

test('Einstufung: Chefkoch FA im Service ist nicht anerkannt, Ia mit Warnung', () => {
  const r = stufeFuer('service-commis-de-rang', 'chefkoch-fa');
  assert.equal(r.stufe, 'Ia');
  assert.equal(r.r.vorschlag, 3735);
  assert.deepEqual(r.codes, ['abschluss_nicht_anerkannt']);
});

test('Einstufung: Küchenangestellte EBA im Housekeeping ergibt Ia', () => {
  const r = stufeFuer('housekeeping-zimmermaedchen', 'kuechenangestellte-eba');
  assert.equal(r.stufe, 'Ia');
});

test('Einstufung: Progresso Allrounder in Küche, Service und Housekeeping ergibt Ib', () => {
  for (const f of ['kueche-commis', 'service-commis-de-rang', 'housekeeping-zimmermaedchen']) {
    const r = stufeFuer(f, 'progresso-allrounder');
    assert.equal(r.stufe, 'Ib', f);
    assert.deepEqual(r.codes, [], f);
    assert.equal(r.r.vorschlag, 3967, f);
  }
});

test('Einstufung: Abschluss im Spa (Bereich nicht geregelt) ergibt Ia mit beiden Warnungen', () => {
  const r = stufeFuer('spa-kosmetiker-efz', 'kaufmann-efz');
  assert.equal(r.stufe, 'Ia');
  assert.deepEqual(r.codes.slice().sort(), ['abschluss_nicht_anerkannt', 'bereich_ungeregelt']);
});

test('Einstufung: kein Abschluss im Spa ergibt Ia ohne Warnung', () => {
  const r = stufeFuer('spa-kosmetiker-efz', 'keiner');
  assert.equal(r.stufe, 'Ia');
  assert.deepEqual(r.codes, []);
});

test('Einstufung: stufeManuell überschreibt mit Warnung stufe_manuell', () => {
  const r = stufeFuer('housekeeping-zimmermaedchen', 'koch-efz', { stufeManuell: 'IIIa' });
  assert.equal(r.stufe, 'IIIa');
  assert.ok(r.codes.includes('stufe_manuell'));
  assert.ok(!r.codes.includes('abschluss_nicht_anerkannt'));
});

test('Einstufung: anderer Abschluss verlangt die Stufe von Hand', () => {
  const r = stufeFuer('spa-kosmetiker-efz', 'anderer');
  assert.equal(r.r.modus, 'fehler');
  assert.deepEqual(r.r.fehler, ['Stufe wählen']);
});

test('Einstufung: HF ohne stufeManuell ergibt Fehler «Stufe wählen»', () => {
  const r = stufeFuer('reception-receptionist', 'hf');
  assert.equal(r.r.modus, 'fehler');
  assert.deepEqual(r.r.fehler, ['Stufe wählen']);
  const mit = stufeFuer('reception-receptionist', 'hf', { stufeManuell: 'IV' });
  assert.equal(mit.stufe, 'IV');
});

test('Einstufung: unbekannte Abschluss-Id ist ein Fehler', () => {
  const r = stufeFuer('reception-receptionist', 'gibtsnicht');
  assert.equal(r.r.modus, 'fehler');
  assert.ok(r.r.fehler.includes('Abschluss unbekannt.'));
});

// ---------- Task 5h: Hinweis bei übersprungener Lohnstufe ----------
const TAB27 = { stufen: { Ia: 3735, Ib: 3967, II: 4094, IIIa: 4555, IIIb: 4663, IV: 5325, P: 2404 } };

test('pruefeStufenvergleich: IIIa gegen IIIb, Gleichheit zählt als übersprungen', () => {
  const v = E.pruefeStufenvergleich({}, TAB27, 'IIIa', 4675);
  assert.equal(v.stufe, 'IIIa');
  assert.equal(v.mindestlohn, 4555);
  assert.equal(v.ueberStufe, 120);
  assert.equal(v.ueberStufeProzent, 2.6);
  assert.equal(v.naechsteStufe, 'IIIb');
  assert.equal(v.mindestlohnNaechste, 4663);
  assert.equal(v.uebersprungen, true);
  assert.equal(E.pruefeStufenvergleich({}, TAB27, 'IIIa', 4655).uebersprungen, false);
  assert.equal(E.pruefeStufenvergleich({}, TAB27, 'IIIa', 4663).uebersprungen, true);
  assert.equal(E.pruefeStufenvergleich({}, TAB27, 'IIIa', 4662.95).uebersprungen, false);
});

test('pruefeStufenvergleich: Ia gegen Ib, IV ohne nächste Stufe, Praktikum null', () => {
  const ia = E.pruefeStufenvergleich({}, TAB27, 'Ia', 3970);
  assert.equal(ia.naechsteStufe, 'Ib');
  assert.equal(ia.mindestlohnNaechste, 3967);
  assert.equal(ia.uebersprungen, true);
  const iv = E.pruefeStufenvergleich({}, TAB27, 'IV', 9000);
  assert.equal(iv.naechsteStufe, null);
  assert.equal(iv.mindestlohnNaechste, null);
  assert.equal(iv.uebersprungen, false);
  assert.equal(E.pruefeStufenvergleich({}, TAB27, 'P', 3000), null);
});

test('pruefeStufenvergleich: nächste Stufe fehlt in der Tabelle, kein Absturz, kein NaN', () => {
  const v = E.pruefeStufenvergleich({}, { stufen: { IIIa: 4555 } }, 'IIIa', 9000);
  assert.equal(v.uebersprungen, false);
  assert.equal(v.mindestlohnNaechste, null);
  assert.ok(Number.isFinite(v.ueberStufe) && Number.isFinite(v.ueberStufeProzent));
  assert.equal(E.pruefeStufenvergleich({}, { stufen: {} }, 'IIIa', 4600), null);
});

test('berechne: Vorschlag über der nächsten Stufe gibt stufenvergleich und Warnung stufe_uebersprungen', () => {
  const c = baueConfig();
  const e = E.berechne(c, eingabe({ erfahrungJahre: 3 })); // 4555 + 150 = 4705
  assert.equal(e.vorschlag, 4705);
  assert.equal(e.stufenvergleich.uebersprungen, true);
  assert.equal(e.stufenvergleich.naechsteStufe, 'IIIb');
  const w = e.warnungen.filter((x) => x.code === 'stufe_uebersprungen');
  assert.equal(w.length, 1);
  assert.match(w[0].text, /nächsthöheren Stufe IIIb \(CHF 4663\.00\)/);
});

test('berechne: Vorschlag unter der nächsten Stufe gibt keine Warnung', () => {
  const e = E.berechne(baueConfig(), eingabe({ erfahrungJahre: 2 })); // 4655
  assert.equal(e.stufenvergleich.uebersprungen, false);
  assert.ok(!e.warnungen.some((x) => x.code === 'stufe_uebersprungen'));
});

test('berechne: von Hand gewählte Stufe ist die Basis des Vergleichs', () => {
  const e = E.berechne(baueConfig(), eingabe({ abschluss: 'keiner', stufeManuell: 'II', erfahrungJahre: 5 })); // 4094 + 250 = 4344 < 4555
  assert.equal(e.stufenvergleich.stufe, 'II');
  assert.equal(e.stufenvergleich.naechsteStufe, 'IIIa');
  assert.equal(e.stufenvergleich.uebersprungen, false);
});

test('berechne: Praktikum, Hinweis und Fehler haben stufenvergleich null, keine Warnung', () => {
  const c = baueConfig();
  const p = E.berechne(c, eingabe({ sonderfall: 'praktikum' }));
  assert.equal(p.stufenvergleich, null);
  assert.ok(!p.warnungen.some((x) => x.code === 'stufe_uebersprungen'));
  assert.equal(E.berechne(c, eingabe({ sonderfall: 'unter18' })).stufenvergleich, null);
  assert.equal(E.berechne(c, eingabe({ beschaeftigungsgrad: 0 })).stufenvergleich, null);
});

test('berechne: Stufe aus der Anerkennungsregel (nicht anerkannt, Ia) ist die Basis, Erfahrung erreicht Ib', () => {
  const c = JSON.parse(JSON.stringify(SC));
  const f = c.funktionen.filter((x) => x.id === 'housekeeping-zimmermaedchen')[0];
  f.erfahrungProJahr = 50;
  f.bandMax = 4500;
  const e = E.berechne(c, eingabe({ funktionId: 'housekeeping-zimmermaedchen', abschluss: 'koch-efz', erfahrungJahre: 5 })); // 3735 + 250
  assert.equal(e.stufe, 'Ia');
  assert.ok(e.warnungen.some((w) => w.code === 'abschluss_nicht_anerkannt'));
  assert.equal(e.vorschlag, 3985);
  assert.equal(e.stufenvergleich.naechsteStufe, 'Ib');
  assert.equal(e.stufenvergleich.mindestlohnNaechste, 3967);
  assert.equal(e.stufenvergleich.ueberStufe, 250);
  assert.equal(e.stufenvergleich.uebersprungen, true);
  assert.ok(e.warnungen.some((w) => w.code === 'stufe_uebersprungen'));
});

test('berechne: von Hand gewählte Stufe IIIa vergleicht gegen IIIb', () => {
  const e = E.berechne(baueConfig(), eingabe({ abschluss: 'keiner', stufeManuell: 'IIIa', erfahrungJahre: 3 })); // 4555 + 150
  assert.equal(e.stufenvergleich.stufe, 'IIIa');
  assert.equal(e.stufenvergleich.naechsteStufe, 'IIIb');
  assert.equal(e.stufenvergleich.ueberStufe, 150);
  assert.equal(e.stufenvergleich.uebersprungen, true);
  assert.ok(e.warnungen.some((w) => w.code === 'stufe_manuell'));
  assert.ok(e.warnungen.some((w) => w.code === 'stufe_uebersprungen'));
});

test('berechne: Einarbeitung aktiv vergleicht den vollen Vollzeitlohn, nicht den reduzierten', () => {
  const einarb = { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null };
  const e = E.berechne(baueConfig(), eingabe({ erfahrungJahre: 3, einarbeitung: einarb })); // 4705, reduziert 4328.60
  assert.equal(e.einarbeitung.erlaubt, true);
  assert.ok(e.einarbeitung.reduzierterMonatslohn < 4663);
  assert.equal(e.vorschlag, 4705);
  assert.equal(e.stufenvergleich.ueberStufe, 150);
  assert.equal(e.stufenvergleich.uebersprungen, true);
  const knapp = E.berechne(baueConfig(), eingabe({ erfahrungJahre: 2, einarbeitung: einarb })); // 4655 < 4663
  assert.equal(knapp.stufenvergleich.uebersprungen, false);
});

test('berechne: Teilzeit 60 % vergleicht den Vollzeitlohn, nicht den skalierten Monatslohn', () => {
  const e = E.berechne(baueConfig(), eingabe({ erfahrungJahre: 3, beschaeftigungsgrad: 60 }));
  assert.equal(e.vorschlag, 4705);
  assert.equal(e.monatslohn, 2823);
  assert.equal(e.stufenvergleich.ueberStufe, 150);
  assert.equal(e.stufenvergleich.uebersprungen, true);
});

// ---- Task 5k: Kader mit 50-Stunden-Woche und Ueberstundenpauschale ----
function kaderConfig(betriebExtra) {
  const c = baueConfig();
  Object.assign(c.betrieb, { kaderWochenstunden: 50, ueberstundenSatz: 1.0, ueberstundenGrenze6750: 6750, dreizehnterInklPauschale: true }, betriebExtra || {});
  c.funktionen.push(
    FX.funktion({ id: 'chef', abteilung: 'a', label: 'Chef', gaestekontakt: false, kader: true }),
    FX.funktion({ id: 'chefhoch', abteilung: 'a', label: 'Chef hoch', gaestekontakt: false, kader: true }),
    FX.funktion({ id: 'chefweit', abteilung: 'a', label: 'Chef weit', gaestekontakt: false, kader: true })
  );
  c.lohnbaender.kader = { min: 4300, max: 7500, ueberschreitbar: true };
  return c;
}
const kEin = (extra) => eingabe(Object.assign({ funktionId: 'chef', abschluss: 'berufspruefung' }, extra || {}));

test('Kader 5325: Stundenansatz, Pauschale 100 % und 125 %, 13. Monatslohn und Total', () => {
  const e = E.berechne(kaderConfig(), kEin());
  assert.equal(e.stufe, 'IV');
  assert.equal(e.vorschlag, 5325);
  assert.equal(e.monatslohn, 5325);
  assert.equal(e.stundenansatz, 28.25);
  assert.equal(e.ueberstundenpauschale, 796);
  assert.equal(e.kader.aktiv, true);
  assert.equal(e.kader.pauschale, 796);
  assert.equal(e.kader.pauschale125, 995);
  assert.equal(e.kader.stundenProMonat, 28.17);
  assert.equal(e.kader.grundlohnUnterGrenze, true);
  assert.equal(e.dreizehnter, 509.9); // (5325 + 796) x 8,33 %, auf 5 Rappen
  assert.equal(e.totalMonat, 6630.9);
  assert.equal(e.jahresbrutto, 79570.8);
});

test('Kader: Mindestlohn, Band und Stufenvergleich bleiben auf dem Grundlohn', () => {
  const e = E.berechne(kaderConfig(), kEin());
  assert.equal(e.mindestlohn, 5325);
  assert.equal(e.bandStart, 5325);
  assert.equal(e.stufenvergleich.ueberStufe, 0);
  // Die Pauschale fuellt den Mindestlohn nicht auf: Der Grundlohn ist der Stufen-Mindestlohn (das Funktionsband 4300 hebt nicht an), nicht um die Pauschale gekuerzt
  const weit = E.berechne(kaderConfig(), kEin({ funktionId: 'chefweit' }));
  assert.equal(weit.vorschlag, 5325);
  assert.equal(weit.monatslohn, 5325);
});

test('Kader: Hinweise unter 6750, alle drei Texte', () => {
  const e = E.berechne(kaderConfig(), kEin());
  const v = e.warnungen.find((w) => w.code === 'kader_voraussetzungen');
  assert.ok(v);
  assert.equal(v.text, 'Pauschale zu 100 % nur zulässig bei Arbeitszeiterfassung (Art. 21 L-GAV), monatlicher schriftlicher Saldomitteilung und Auszahlung spätestens mit der letzten Lohnzahlung; sonst 125 % (CHF 995.00). Eine 50-Stunden-Normalarbeitszeit ist unter CHF 6\'750 nicht vereinbar, es handelt sich um Überstunden.');
  const h = e.warnungen.find((w) => w.code === 'kader_hoechstarbeitszeit');
  assert.equal(h.text, '50 Stunden = gesetzliche Höchstarbeitszeit im Gastgewerbe, Überzeit darüber mit 25 % Zuschlag.');
  assert.ok(!e.warnungen.some((w) => w.code === 'kader_ab_grenze'));
});

test('Kader ab 6750 Grundlohn: Hinweis kader_ab_grenze, keine Voraussetzungswarnung', () => {
  // Das Funktionsband hebt nicht mehr an: Der Grundlohn 6825 entsteht aus Fachausweis IV (5325) plus einer Zulage von 1500.
  const c = kaderConfig();
  c.zusatzbausteine.push({ id: 'zg', label: 'Grosse Zulage', art: 'lohn', betrag: 1500 });
  const e = E.berechne(c, kEin({ funktionId: 'chefhoch', zusatzIds: ['zg'] }));
  assert.equal(e.vorschlag, 6825);
  assert.equal(e.kader.grundlohnUnterGrenze, false);
  const a = e.warnungen.find((w) => w.code === 'kader_ab_grenze');
  assert.equal(a.text, 'Überstundenentschädigung kann schriftlich frei vereinbart werden, Art. 15 Ziff. 7.');
  assert.ok(!e.warnungen.some((w) => w.code === 'kader_voraussetzungen'));
  assert.ok(e.warnungen.some((w) => w.code === 'kader_hoechstarbeitszeit'));
});

test('Kader: Grundlohn genau 6750 zaehlt als ab Grenze; Pauschale hilft nicht, die Grenze zu erreichen', () => {
  const ab = E.berechne(kaderConfig({ ueberstundenGrenze6750: 5325 }), kEin());
  assert.equal(ab.kader.grundlohnUnterGrenze, false);
  const unter = E.berechne(kaderConfig({ ueberstundenGrenze6750: 6000 }), kEin()); // Grundlohn 5325 + Pauschale 795.80 > 6000
  assert.equal(unter.kader.grundlohnUnterGrenze, true);
});

test('Kader mit Satz 1,25: keine Voraussetzungswarnung', () => {
  const e = E.berechne(kaderConfig({ ueberstundenSatz: 1.25 }), kEin());
  assert.equal(e.kader.pauschale, 995);
  assert.ok(!e.warnungen.some((w) => w.code === 'kader_voraussetzungen'));
});

test('Nicht-Kader: unveraendert, keine Pauschale', () => {
  const e = E.berechne(kaderConfig(), eingabe({ funktionId: 'koch', abschluss: 'berufspruefung' }));
  assert.equal(e.kader, null);
  assert.equal(e.ueberstundenpauschale, null);
  assert.equal(e.totalMonat, E.berechne(baueConfig(), eingabe({ funktionId: 'koch', abschluss: 'berufspruefung' })).totalMonat);
  assert.ok(!e.warnungen.some((w) => /^kader_/.test(w.code)));
});

test('Kader in Teilzeit 80 %: Pauschale skaliert', () => {
  const e = E.berechne(kaderConfig(), kEin({ beschaeftigungsgrad: 80 }));
  assert.equal(e.monatslohn, 4260);
  assert.equal(e.ueberstundenpauschale, 637); // 28.25 x 22.54 h (22,536 gerundet)
  assert.equal(e.dreizehnter, 407.9);
  assert.equal(e.totalMonat, 5304.9);
  assert.equal(e.stundenansatz, 28.25);
});

test('dreizehnterInklPauschale false: 13. Monatslohn nur auf den Grundlohn', () => {
  const e = E.berechne(kaderConfig({ dreizehnterInklPauschale: false }), kEin());
  assert.equal(e.dreizehnter, 443.55);
  assert.equal(e.totalMonat, 6564.55);
});

test('rechneBetraege: Kader-Felder und Bezeichnungen', () => {
  const b = E.rechneBetraege(kaderConfig(), 5325, { beschaeftigungsgrad: 100, einarbeitung: null, kader: true });
  assert.equal(b.ueberstundenpauschale, 796);
  assert.equal(b.pauschaleStundenProMonat, 28.17);
  assert.equal(b.pauschale125, 995);
  assert.equal(b.bezeichnungen.grundlohn, 'Grundlohn (43,5 h)');
  assert.equal(b.bezeichnungen.pauschale, 'Überstundenpauschale (6,5 h pro Woche, 28,17 h pro Monat, 100 %)');
  assert.equal(b.bezeichnungen.dreizehnter, '13. Monatslohn (auf Grundlohn plus Pauschale)');
  const n = E.rechneBetraege(kaderConfig(), 5325, { beschaeftigungsgrad: 100, einarbeitung: null, kader: false });
  assert.equal(n.ueberstundenpauschale, null);
  assert.equal(n.pauschale125, null);
  assert.equal(n.bezeichnungen, null);
});

test('Kader: gedruckte Stunden x Stundenansatz x Satz ergeben den Betrag (Vollzeit und 80 %)', () => {
  [100, 80].forEach((grad) => {
    const e = E.berechne(kaderConfig(), kEin({ beschaeftigungsgrad: grad }));
    const h = Number(e.bezeichnungen.pauschale.match(/([\d,]+) h pro Monat/)[1].replace(',', '.'));
    assert.equal(h, e.kader.stundenProMonat);
    assert.equal(E.runde1(e.stundenansatz * h * 1), e.ueberstundenpauschale);
    assert.equal(E.runde1(e.stundenansatz * h * 1.25), e.kader.pauschale125);
  });
  const e80 = E.berechne(kaderConfig(), kEin({ beschaeftigungsgrad: 80 }));
  assert.equal(e80.kader.pauschale125, 796); // 28.25 x 22.54 x 1.25 = 795.94 -> 796
});

test('Kader mit Einarbeitung 8 %: reduzierte Pauschale, 13. und Total', () => {
  const einarb = { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null };
  const e = E.berechne(kaderConfig(), kEin({ funktionId: 'chefweit', abschluss: 'efz', einarbeitung: einarb }));
  assert.equal(e.stufe, 'IIIa');
  assert.equal(e.vorschlag, 4555);
  assert.equal(e.ueberstundenpauschale, 681); // 24.16 x 28.17
  assert.equal(e.einarbeitung.erlaubt, true);
  assert.equal(e.einarbeitung.reduzierterMonatslohn, 4191);
  assert.equal(e.einarbeitung.reduzierteUeberstundenpauschale, 627); // 22.23 x 28.17 = 626.22, aufgerundet
  // 13.: (4191 + 627) x 8,33 % = 401.34 -> 401.35 (5 Rappen); Total 4191 + 627 + 401.35
  assert.equal(e.einarbeitung.reduzierterTotal, 5219.35);
  const n = E.berechne(kaderConfig(), eingabe({ funktionId: 'koch', abschluss: 'efz', einarbeitung: einarb }));
  assert.equal(n.einarbeitung.reduzierteUeberstundenpauschale, null);
});

// ---- Lohnband hängt an der Person (Stufe), Kader haben das Kaderband ----
const hotelfachAnRezeption = (extra) => E.berechne(SC, eingabe(Object.assign({ funktionId: 'reception-receptionist', abschluss: 'hotelfachmann-efz' }, extra || {})));
const codesVon = (r) => r.warnungen.map((w) => w.code);

test('Band: Hotelfachfrau (Ia) als Receptionist bekommt das Band Ia, 3735 bis 4050', () => {
  const r = hotelfachAnRezeption();
  assert.equal(r.stufe, 'Ia');
  assert.equal(r.mindestlohn, 3735);
  assert.equal(r.bandStart, 3735);
  assert.equal(r.bandMax, 4050);
  assert.deepEqual(r.band, { art: 'stufe', min: 3735, max: 4050, ueberschreitbar: false });
  assert.equal(r.vorschlag, 3735);
  assert.deepEqual(codesVon(r), ['abschluss_nicht_anerkannt']);
});

test('Band: mit 5 Jahren Erfahrung 3785', () => {
  const r = hotelfachAnRezeption({ erfahrungJahre: 5 });
  assert.equal(r.vorschlag, 3785);
  assert.equal(r.bandStart, 3735);
});

test('Band: gleiche Ausbildung ergibt in verschiedenen Funktionen denselben Lohn und dasselbe Band', () => {
  for (const abschluss of ['keiner', 'koch-efz']) {
    const funktionen = abschluss === 'keiner'
      ? ['housekeeping-zimmermaedchen', 'service-servicehilfe', 'kueche-kuechenhilfe']
      : ['kueche-chef-de-partie', 'service-chef-de-rang', 'service-sommelier'];
    const rs = funktionen.map((f) => E.berechne(SC, eingabe({ funktionId: f, abschluss, erfahrungJahre: 2, sprachen: [] })));
    rs.forEach((r) => {
      assert.equal(r.vorschlag, rs[0].vorschlag, abschluss);
      assert.deepEqual(r.band, rs[0].band, abschluss);
    });
  }
});

test('Band: Gastronomiekoch FA (IV) in einer Funktion mit tieferer Einstufung hat das Band IV', () => {
  const r = E.berechne(SC, eingabe({ funktionId: 'kueche-commis', abschluss: 'gastronomiekoch-fa' }));
  assert.equal(r.stufe, 'IV');
  assert.equal(r.vorschlag, 5325);
  assert.equal(r.bandStart, 5325);
  assert.equal(r.bandMax, 5700);
  assert.deepEqual(codesVon(r), []);
});

test('Band: Spielraum und Freigabe beginnen für Ia bei 3735', () => {
  const r = hotelfachAnRezeption();
  ['vorgesetzte', 'hr', 'gm'].forEach((t) => assert.equal(r.spanneStufen[t].min, 3735, t));
  assert.ok(r.spanneStufen.gm.max > 3735 && r.spanneStufen.gm.max <= 4050);
  assert.equal(E.pruefeAbweichung(r, 3735, '').freigabe, 'keine');
  const unter = E.pruefeAbweichung(r, 3734.95, '');
  assert.equal(unter.ok, false);
  assert.deepEqual(unter.fehler, ['Der gewählte Lohn liegt unter dem Mindestlohn.']);
});

test('Band: Nicht-Kader über dem Spielraum bleibt ein Fehler', () => {
  const r = hotelfachAnRezeption();
  const p = E.pruefeAbweichung(r, 4500, 'Begründung');
  assert.equal(p.ok, false);
  assert.deepEqual(p.fehler, ['Abweichung ausserhalb des zulässigen Spielraums.']);
});

test('Band: Praktikum hat kein Band', () => {
  const r = E.berechne(SC, eingabe({ funktionId: 'reception-receptionist', abschluss: 'keiner', sonderfall: 'praktikum' }));
  assert.equal(r.stufe, 'P');
  assert.equal(r.vorschlag, r.mindestlohn);
  assert.equal(r.bandStart, null);
  assert.equal(r.bandMax, null);
  assert.equal(r.band, null);
  const k = E.berechne(SC, eingabe({ funktionId: 'kueche-kuechenchef', abschluss: 'keiner', sonderfall: 'praktikum' }));
  assert.equal(k.band, null);
});

test('Band: bei Hinweis- und Fehlermodus gibt es kein Band', () => {
  assert.equal(E.berechne(SC, eingabe({ funktionId: 'reception-receptionist', abschluss: 'keiner', sonderfall: 'unter18' })).band, null);
  assert.equal(E.berechne(SC, eingabe({ funktionId: 'gibtsnicht' })).band, null);
});

test('Band: Stufe ohne Eintrag in lohnbaender ergibt einen Fehler statt Absturz', () => {
  const c = JSON.parse(JSON.stringify(SC));
  delete c.lohnbaender.IIIa;
  const r = E.berechne(c, eingabe({ funktionId: 'reception-receptionist', abschluss: 'kaufmann-efz' }));
  assert.equal(r.modus, 'fehler');
  assert.deepEqual(r.fehler, ['Kein Lohnband für Stufe IIIa.']);
});

test('Band: Mindestlohn über dem Stufenmaximum, Mindestlohn gilt mit Warnung band_zu_eng', () => {
  const c = JSON.parse(JSON.stringify(SC));
  c.lohnbaender.IIIa.max = 4000;
  const r = E.berechne(c, eingabe({ funktionId: 'reception-receptionist', abschluss: 'kaufmann-efz' }));
  assert.equal(r.vorschlag, 4555);
  assert.equal(r.bandMax, 4555);
  assert.deepEqual(codesVon(r), ['band_zu_eng']);
});

// ---- Kaderband ----

test('Kaderband: Chef de cuisine (IV) startet bei 6000, Maximum 7500, überschreitbar', () => {
  const r = E.berechne(SC, eingabe({ funktionId: 'kueche-kuechenchef', abschluss: 'gastronomiekoch-fa' }));
  assert.equal(r.stufe, 'IV');
  assert.deepEqual(r.band, { art: 'kader', min: 6000, max: 7500, ueberschreitbar: true });
  assert.equal(r.bandStart, 6000);
  assert.equal(r.bandMax, 7500);
  assert.equal(r.vorschlag, 6000);
});

test('Kaderband gilt unabhängig von der Ausbildung', () => {
  const r = E.berechne(SC, eingabe({ funktionId: 'reception-leitung', abschluss: 'keiner' }));
  assert.equal(r.stufe, 'Ia');
  assert.equal(r.band.art, 'kader');
  assert.equal(r.bandStart, 6000);
  assert.equal(r.vorschlag, 6000);
});

test('Kaderband: Erfahrung und Sprachen kommen auf den Start von 6000, nach oben bis 7500 begrenzt', () => {
  const k = (extra) => E.berechne(SC, eingabe(Object.assign({ funktionId: 'reception-leitung', abschluss: 'chef-de-reception-fa', erfahrungJahre: 0, sprachen: [] }, extra)));
  assert.equal(k().vorschlag, 6000);
  const r = k({ erfahrungJahre: 3, sprachen: [{ sprache: 'EN', niveau: 'B1' }, { sprache: 'DE', niveau: 'Muttersprache' }] });
  assert.equal(r.vorschlag, 6090); // 6000 + 30 Erfahrung + 20 + 40 Sprachen
  assert.deepEqual(r.positionen.map((p) => [p.label, p.betrag]), [
    ['Basis Stufe IV', 5325], ['Kaderband: Anhebung auf den Start von CHF 6000.00', 675], ['Erfahrung (3 Jahre)', 30], ['Sprachen (1 Muttersprache, 1 voll)', 60]]);
  assert.equal(r.mindestlohn, 5325);
  const c = JSON.parse(JSON.stringify(SC));
  c.zusatzbausteine.push({ id: 'zz', label: 'Grosse Zulage', art: 'lohn', betrag: 5000 });
  const oben = E.berechne(c, eingabe({ funktionId: 'reception-leitung', abschluss: 'chef-de-reception-fa', erfahrungJahre: 0, sprachen: [], zusatzIds: ['zz'] }));
  assert.equal(oben.vorschlag, 7500);
  const nk = E.berechne(SC, eingabe({ funktionId: 'reception-receptionist', abschluss: 'kaufmann-efz', erfahrungJahre: 0, sprachen: [] }));
  assert.ok(!nk.positionen.some((p) => /Kaderband/.test(p.label)));
});

// Kaderband mit knappem Maximum 6100, damit der Spielraum (3 % von 6000 = 6180) über das Maximum hinausreicht.
function engesKader() {
  const c = JSON.parse(JSON.stringify(SC));
  c.lohnbaender.kader = { min: 6000, max: 6100, ueberschreitbar: true };
  return { c, r: E.berechne(c, eingabe({ funktionId: 'kueche-kuechenchef', abschluss: 'gastronomiekoch-fa' })) };
}

test('Kaderband: der Spielraum wird vom Bandmaximum nicht begrenzt, bei Stufenbändern schon', () => {
  const { r } = engesKader();
  assert.equal(r.vorschlag, 6000);
  assert.equal(r.spanneStufen.gm.max, 6180);
  const s = hotelfachAnRezeption();
  assert.ok(s.spanneStufen.gm.max <= s.bandMax);
});

test('Kaderband: Lohn über dem Spielraum wird abgelehnt, auch wenn er unter dem Maximum liegt', () => {
  const r = E.berechne(SC, eingabe({ funktionId: 'kueche-kuechenchef', abschluss: 'gastronomiekoch-fa' }));
  for (const lohn of [6500, 7400, 7800]) {
    const p = E.pruefeAbweichung(r, lohn, 'Begründung');
    assert.equal(p.ok, false, String(lohn));
    assert.deepEqual(p.fehler, ['Abweichung ausserhalb des zulässigen Spielraums.']);
  }
});

test('Kaderband: Lohn im Spielraum über dem Maximum braucht Begründung und gilt als Freigabe GM', () => {
  const { r } = engesKader();
  const ohne = E.pruefeAbweichung(r, 6110, '');
  assert.equal(ohne.ok, false);
  assert.ok(ohne.fehler[0].includes('Begründung'));
  const mit = E.pruefeAbweichung(r, 6110, 'Marktlage'); // 1,8 % wäre HR, über dem Maximum gilt GM
  assert.equal(mit.ok, true);
  assert.equal(mit.freigabe, 'GM');
  assert.equal(mit.ueberBandmax, true);
  assert.equal(E.pruefeAbweichung(r, 6190, 'Marktlage').ok, false);
});

test('Kaderband: genau auf dem Maximum ist keine Überschreitung', () => {
  const { r } = engesKader();
  const p = E.pruefeAbweichung(r, 6100, 'Marktlage');
  assert.equal(p.ok, true);
  assert.equal(p.freigabe, 'HR');
  assert.equal(p.ueberBandmax, false);
});

// ---- Kader-Entschaedigungen (nurKader) werden automatisch angewendet ----

test('Kader (Chef de cuisine): Handy 20 und Spesen 200 automatisch als Entschaedigung', () => {
  const r = E.berechne(SC, eingabe({ funktionId: 'kueche-kuechenchef', abschluss: 'gastronomiekoch-fa' }));
  assert.deepEqual(r.entschaedigungen.map((x) => [x.label, x.betrag]),
    [['Entschädigung private Handynutzung', 20], ['Spesenentschädigung', 200]]);
  assert.equal(r.vorschlag, 6000);
});

test('Kein Kader (Sous-chef): nur 5 Franken Handy-Entschaedigung', () => {
  const r = E.berechne(SC, eingabe({ funktionId: 'kueche-sous-chef', abschluss: 'gastronomiekoch-fa' }));
  assert.deepEqual(r.entschaedigungen.map((x) => [x.label, x.betrag]), [['Entschädigung private Handynutzung', 5]]);
});

test('Waescheentschaedigung: nur 50 und 20, Teilzeit anteilig, Schürze nur im Service', () => {
  const voll = E.berechne(SC, eingabe({ funktionId: 'kueche-commis', abschluss: 'gastronomiekoch-fa', zusatzIds: ['waesche-kleidung'] }));
  assert.deepEqual(voll.entschaedigungen.map((x) => [x.label, x.betrag]).filter((x) => /Wäsche/.test(x[0])),
    [['Wäscheentschädigung Berufs- und Dienstkleidung (L-GAV Art. 30)', 50]]);
  const teil = E.berechne(SC, eingabe({ funktionId: 'kueche-commis', abschluss: 'gastronomiekoch-fa', beschaeftigungsgrad: 60, zusatzIds: ['waesche-kleidung'] }));
  assert.ok(teil.entschaedigungen.some((x) => x.betrag === 30));
  assert.equal(teil.vorschlag, voll.vorschlag);
  const falsch = E.berechne(SC, eingabe({ funktionId: 'kueche-commis', abschluss: 'gastronomiekoch-fa', zusatzIds: ['waesche-schuerze'] }));
  assert.equal(falsch.modus, 'fehler');
  const service = E.berechne(SC, eingabe({ funktionId: 'service-chef-de-rang', abschluss: 'koch-efz', zusatzIds: ['waesche-kleidung', 'waesche-schuerze'] }));
  assert.deepEqual(service.entschaedigungen.filter((x) => /Wäsche/.test(x.label)).map((x) => x.betrag), [50, 20]);
  const etage = E.berechne(SC, eingabe({ funktionId: 'housekeeping-zimmermaedchen', abschluss: 'keiner', zusatzIds: ['waesche-kleidung'] }));
  assert.notEqual(etage.modus, 'fehler');
});

test('Handy-Entschaedigung wird auf das Pensum reduziert', () => {
  const teil = E.berechne(SC, eingabe({ funktionId: 'kueche-sous-chef', abschluss: 'gastronomiekoch-fa', beschaeftigungsgrad: 60 }));
  assert.deepEqual(teil.entschaedigungen.map((x) => [x.label, x.betrag]), [['Entschädigung private Handynutzung', 3]]);
  const kader = E.berechne(SC, eingabe({ funktionId: 'kueche-kuechenchef', abschluss: 'gastronomiekoch-fa', beschaeftigungsgrad: 50 }));
  assert.deepEqual(kader.entschaedigungen.map((x) => [x.label, x.betrag]), [['Entschädigung private Handynutzung', 10], ['Spesenentschädigung', 100]]);
});

test('Zusatzbausteine von Hand: nur für Kader gewählt von Nicht-Kader ist ein Fehler, Doppelte zählen einmal', () => {
  const nk = E.berechne(SC, eingabe({ funktionId: 'kueche-sous-chef', abschluss: 'gastronomiekoch-fa', zusatzIds: ['kader-spesen'] }));
  assert.equal(nk.modus, 'fehler');
  assert.ok(nk.fehler[0].includes('nur für Kader'));
  const doppelt = E.berechne(SC, eingabe({ funktionId: 'kueche-commis', abschluss: 'gastronomiekoch-fa', zusatzIds: ['waesche-kleidung', 'waesche-kleidung'] }));
  assert.equal(doppelt.entschaedigungen.filter((x) => /Wäsche/.test(x.label)).length, 1);
});

// ---- Sprachniveau: A1 nichts, A2 halber Betrag, ab B1 voller Betrag ----
function sprachConfig() {
  const c = baueConfig();
  Object.assign(c.bausteine, { mindestNiveau: 'B1', teilNiveau: 'A2', teilProzent: 50 });
  return c;
}
const spr = (...paare) => paare.map(([sprache, niveau]) => ({ sprache, niveau }));
const sprachBetrag = (r) => (r.positionen.find((p) => /^Sprachen/.test(p.label)) || { betrag: 0 }).betrag;

test('Sprachniveau: A1 nichts, A2 halber Betrag, ab B1 voller Betrag', () => {
  const c = sprachConfig();
  const b = (sp) => sprachBetrag(E.berechne(c, eingabe({ sprachen: sp })));
  assert.equal(b(spr(['EN', 'A1'])), 0);
  assert.equal(b(spr(['EN', 'A2'])), 50);
  assert.equal(b(spr(['EN', 'B1'])), 100);
  assert.equal(b(spr(['EN', 'C2'])), 100);
  assert.equal(b(spr(['DE', 'Muttersprache'])), 100);
  assert.equal(b(spr(['EN', 'B1'], ['FR', 'A2'])), 150);
});

test('Sprachniveau: Höchstzahl zählt volle Sprachen zuerst, Beschriftung nennt halbe', () => {
  const c = sprachConfig(); // maxSprachen 2
  const b = (sp) => sprachBetrag(E.berechne(c, eingabe({ sprachen: sp })));
  assert.equal(b(spr(['FR', 'A2'], ['DE', 'B1'], ['EN', 'B1'])), 200);
  assert.equal(b(spr(['IT', 'A2'], ['FR', 'A2'], ['EN', 'A2'])), 100);
  const r = E.berechne(c, eingabe({ sprachen: spr(['EN', 'B1'], ['FR', 'A2']) }));
  assert.equal(r.positionen.find((p) => /^Sprachen/.test(p.label)).label, 'Sprachen (1 voll, 1 zu 50 %)');
  const nurVoll = E.berechne(c, eingabe({ sprachen: spr(['EN', 'B1'], ['FR', 'B2']) }));
  assert.equal(nurVoll.positionen.find((p) => /^Sprachen/.test(p.label)).label, 'Sprachen (2)');
});

test('Sprachniveau: ohne teilNiveau in der Konfiguration zählt nur ab dem Mindestniveau', () => {
  const c = baueConfig(); // mindestNiveau B2, kein teilNiveau
  assert.equal(sprachBetrag(E.berechne(c, eingabe({ sprachen: spr(['EN', 'B1']) }))), 0);
  assert.equal(sprachBetrag(E.berechne(c, eingabe({ sprachen: spr(['EN', 'B2']) }))), 100);
});

test('Muttersprache zählt den doppelten Betrag, auch bei der Höchstzahl zuerst', () => {
  const c = sprachConfig();
  c.bausteine.muttersprachFaktor = 2;
  const b = (sp) => sprachBetrag(E.berechne(c, eingabe({ sprachen: sp })));
  assert.equal(b(spr(['DE', 'Muttersprache'])), 200);
  assert.equal(b(spr(['DE', 'Muttersprache'], ['EN', 'B1'])), 300);
  assert.equal(b(spr(['FR', 'A2'], ['EN', 'B1'], ['DE', 'Muttersprache'])), 300); // Höchstzahl 2: Muttersprache, dann voll
  assert.equal(b(spr(['DE', 'Muttersprache'], ['IT', 'Muttersprache'], ['EN', 'B1'])), 400);
  const r = E.berechne(c, eingabe({ sprachen: spr(['DE', 'Muttersprache'], ['EN', 'B1']) }));
  assert.equal(r.positionen.find((p) => /^Sprachen/.test(p.label)).label, 'Sprachen (1 Muttersprache, 1 voll)');
  const ohne = baueConfig(); // ohne muttersprachFaktor: wie jede Sprache
  assert.equal(sprachBetrag(E.berechne(ohne, eingabe({ sprachen: spr(['DE', 'Muttersprache']) }))), 100);
});

test('Sprachniveau: nur bei Gästekontakt', () => {
  const c = sprachConfig();
  assert.equal(sprachBetrag(E.berechne(c, eingabe({ funktionId: 'koch', sprachen: spr(['EN', 'C1']) }))), 0);
});

test('Eintritt vor dem Stichtag: befristet behaelt den alten Mindestlohn, unbefristet bekommt ab Stichtag den hoeheren', () => {
  const c = baueConfig();
  const bef = E.berechne(c, eingabe({ vertragsart: 'befristet', eintritt: '2026-12-15' }));
  assert.equal(bef.positionen[0].betrag, 4500);
  const hb = bef.warnungen.find((w) => w.code === 'mindestlohn_befristet');
  assert.ok(hb && /bis Vertragsende/.test(hb.text) && /4500/.test(hb.text));
  const unb = E.berechne(c, eingabe({ vertragsart: 'unbefristet', eintritt: '2026-12-15' }));
  assert.equal(unb.positionen[0].betrag, 4500);
  const hu = unb.warnungen.find((w) => w.code === 'mindestlohn_ab_stichtag');
  assert.ok(hu && /01.01.2027/.test(hu.text) && /4555/.test(hu.text));
  const spaeter = E.berechne(c, eingabe({ vertragsart: 'unbefristet', eintritt: '2027-03-01' }));
  assert.ok(!spaeter.warnungen.some((w) => w.code === 'mindestlohn_ab_stichtag'));
});
