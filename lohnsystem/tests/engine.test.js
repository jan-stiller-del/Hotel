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
      { jahr: 2027, gueltigAbJahresbetrieb: '2027-01-01', gueltigAbSaison: '2027-05-01',
        stufen: { Ia: 3735, Ib: 3967, II: 4094, IIIa: 4555, IIIb: 4663, IV: 5325, P: 2404 } },
      { jahr: 2026, gueltigAbJahresbetrieb: '2026-01-01', gueltigAbSaison: '2026-05-01',
        stufen: { Ia: 3700, Ib: 3900, II: 4000, IIIa: 4500, IIIb: 4600, IV: 5200, P: 2300 } },
    ],
    stufen: {},
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
  const r = stufeFuer('kueche-koch-efz', 'koch-efz');
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
  const r = stufeFuer('kueche-koch-efz', 'restaurationsfachmann-efz');
  assert.equal(r.stufe, 'Ia');
  assert.deepEqual(r.codes, ['abschluss_nicht_anerkannt', 'stufe_uebersprungen']);
});

test('Einstufung: Hotelfachfrau EFZ an der Réception ergibt Ia mit Warnung', () => {
  const r = stufeFuer('reception-receptionist', 'hotelfachmann-efz');
  assert.equal(r.stufe, 'Ia');
  assert.deepEqual(r.codes, ['abschluss_nicht_anerkannt', 'stufe_uebersprungen']);
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
  assert.deepEqual(r.codes, ['abschluss_nicht_anerkannt', 'stufe_uebersprungen']);
});

test('Einstufung: Küchenangestellte EBA im Housekeeping ergibt Ia', () => {
  const r = stufeFuer('housekeeping-zimmermaedchen', 'kuechenangestellte-eba');
  assert.equal(r.stufe, 'Ia');
});

test('Einstufung: Progresso Allrounder in Küche, Service und Housekeeping ergibt Ib', () => {
  for (const f of ['kueche-koch-efz', 'service-commis-de-rang', 'housekeeping-zimmermaedchen']) {
    const r = stufeFuer(f, 'progresso-allrounder');
    assert.equal(r.stufe, 'Ib', f);
    assert.deepEqual(r.codes, f === 'housekeeping-zimmermaedchen' ? [] : ['stufe_uebersprungen'], f);
  }
});

test('Einstufung: Abschluss im Spa (Bereich nicht geregelt) ergibt Ia mit beiden Warnungen', () => {
  const r = stufeFuer('spa-kosmetiker-efz', 'kaufmann-efz');
  assert.equal(r.stufe, 'Ia');
  assert.deepEqual(r.codes.slice().sort(), ['abschluss_nicht_anerkannt', 'bereich_ungeregelt', 'stufe_uebersprungen']);
});

test('Einstufung: kein Abschluss im Spa ergibt Ia ohne Warnung', () => {
  const r = stufeFuer('spa-kosmetiker-efz', 'keiner');
  assert.equal(r.stufe, 'Ia');
  assert.deepEqual(r.codes, ['stufe_uebersprungen']);
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
    FX.funktion({ id: 'chef', abteilung: 'a', label: 'Chef', gaestekontakt: false, bandMin: 5325, bandMax: 5700, kader: true }),
    FX.funktion({ id: 'chefhoch', abteilung: 'a', label: 'Chef hoch', gaestekontakt: false, bandMin: 6800, bandMax: 7500, kader: true }),
    FX.funktion({ id: 'chefweit', abteilung: 'a', label: 'Chef weit', gaestekontakt: false, bandMin: 4300, bandMax: 5700, kader: true })
  );
  return c;
}
const kEin = (extra) => eingabe(Object.assign({ funktionId: 'chef', abschluss: 'berufspruefung' }, extra || {}));

test('Kader 5325: Stundenansatz, Pauschale 100 % und 125 %, 13. Monatslohn und Total', () => {
  const e = E.berechne(kaderConfig(), kEin());
  assert.equal(e.stufe, 'IV');
  assert.equal(e.vorschlag, 5325);
  assert.equal(e.monatslohn, 5325);
  assert.equal(e.stundenansatz, 28.25);
  assert.equal(e.ueberstundenpauschale, 795.8);
  assert.equal(e.kader.aktiv, true);
  assert.equal(e.kader.pauschale, 795.8);
  assert.equal(e.kader.pauschale125, 994.75);
  assert.equal(e.kader.stundenProMonat, 28.17);
  assert.equal(e.kader.grundlohnUnterGrenze, true);
  assert.equal(e.dreizehnter, 509.85); // (5325 + 795.80) x 8,33 %
  assert.equal(e.totalMonat, 6630.65);
  assert.equal(e.jahresbrutto, 79567.8);
});

test('Kader: Mindestlohn, Band und Stufenvergleich bleiben auf dem Grundlohn', () => {
  const e = E.berechne(kaderConfig(), kEin());
  assert.equal(e.mindestlohn, 5325);
  assert.equal(e.bandStart, 5325);
  assert.equal(e.stufenvergleich.ueberStufe, 0);
  // Die Pauschale fuellt den Mindestlohn nicht auf: Band darunter wird auf den Mindestlohn angehoben, nicht um die Pauschale gekuerzt
  const weit = E.berechne(kaderConfig(), kEin({ funktionId: 'chefweit' }));
  assert.equal(weit.vorschlag, 5325);
  assert.equal(weit.monatslohn, 5325);
});

test('Kader: Hinweise unter 6750, alle drei Texte', () => {
  const e = E.berechne(kaderConfig(), kEin());
  const v = e.warnungen.find((w) => w.code === 'kader_voraussetzungen');
  assert.ok(v);
  assert.equal(v.text, 'Pauschale zu 100 % nur zulässig bei Arbeitszeiterfassung (Art. 21 L-GAV), monatlicher schriftlicher Saldomitteilung und Auszahlung spätestens mit der letzten Lohnzahlung; sonst 125 % (CHF 994.75). Eine 50-Stunden-Normalarbeitszeit ist unter CHF 6\'750 nicht vereinbar, es handelt sich um Überstunden.');
  const h = e.warnungen.find((w) => w.code === 'kader_hoechstarbeitszeit');
  assert.equal(h.text, '50 Stunden = gesetzliche Höchstarbeitszeit im Gastgewerbe, Überzeit darüber mit 25 % Zuschlag.');
  assert.ok(!e.warnungen.some((w) => w.code === 'kader_ab_grenze'));
});

test('Kader ab 6750 Grundlohn: Hinweis kader_ab_grenze, keine Voraussetzungswarnung', () => {
  const e = E.berechne(kaderConfig(), kEin({ funktionId: 'chefhoch' }));
  assert.equal(e.vorschlag, 6800);
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
  assert.equal(e.kader.pauschale, 994.75);
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
  assert.equal(e.ueberstundenpauschale, 636.65);
  assert.equal(e.dreizehnter, 407.9);
  assert.equal(e.totalMonat, 5304.55);
  assert.equal(e.stundenansatz, 28.25);
});

test('dreizehnterInklPauschale false: 13. Monatslohn nur auf den Grundlohn', () => {
  const e = E.berechne(kaderConfig({ dreizehnterInklPauschale: false }), kEin());
  assert.equal(e.dreizehnter, 443.55);
  assert.equal(e.totalMonat, 6564.35);
});

test('rechneBetraege: Kader-Felder und Bezeichnungen', () => {
  const b = E.rechneBetraege(kaderConfig(), 5325, { beschaeftigungsgrad: 100, einarbeitung: null, kader: true });
  assert.equal(b.ueberstundenpauschale, 795.8);
  assert.equal(b.pauschaleStundenProMonat, 28.17);
  assert.equal(b.pauschale125, 994.75);
  assert.equal(b.bezeichnungen.grundlohn, 'Grundlohn (43,5 h)');
  assert.equal(b.bezeichnungen.pauschale, 'Überstundenpauschale (6,5 h pro Woche, 28,17 h pro Monat, 100 %)');
  assert.equal(b.bezeichnungen.dreizehnter, '13. Monatslohn (auf Grundlohn plus Pauschale)');
  const n = E.rechneBetraege(kaderConfig(), 5325, { beschaeftigungsgrad: 100, einarbeitung: null, kader: false });
  assert.equal(n.ueberstundenpauschale, null);
  assert.equal(n.pauschale125, null);
  assert.equal(n.bezeichnungen, null);
});
