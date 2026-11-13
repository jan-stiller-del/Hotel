'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const FX = require('./abschluss-fixture.js');
const { validateConfig } = require('../src/config.js');

function baueConfig() {
  const stufen = {};
  ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV', 'P'].forEach((s) => {
    stufen[s] = { label: s, spielraum: { vorgesetzte: 1, hr: 2, gm: 3 } };
  });
  return {
    version: 1,
    betrieb: { name: 'Test', wochenstunden: 43.5, dreizehnterProzent: 8.33, maxErfahrungsjahre: 10, einarbeitungMaxProzent: 8 },
    mindestloehne: [
      { jahr: 2027, gueltigAbJahresbetrieb: '2027-01-01', gueltigAbSaison: '2027-05-01',
        stufen: { Ia: 3735, Ib: 3967, II: 4094, IIIa: 4555, IIIb: 4663, IV: 5325, P: 2404 } },
    ],
    stufen,
    abteilungen: [{ id: 'a', label: 'A' }],
    bereiche: FX.bereiche,
    abschluesse: FX.abschluesse,
    funktionen: [
      { id: 'rec', abteilung: 'a', label: 'Rec', gaestekontakt: true, bandMin: 4300, bandMax: 5600 },
      { id: 'schmal', abteilung: 'a', label: 'Schmal', gaestekontakt: true, bandMin: 4750, bandMax: 4800 },
      { id: 'weit', abteilung: 'a', label: 'Weit', gaestekontakt: true, bandMin: 4300, bandMax: 6000 },
      { id: 'eng', abteilung: 'a', label: 'Eng', gaestekontakt: true, bandMin: 4300, bandMax: 4400 },
    ].map(FX.funktion),
    bausteine: { erfahrungProJahr: 50, spracheProSprache: 100, maxSprachen: 2, sprachen: ['EN', 'FR', 'IT'], mindestNiveau: 'B2' },
    zusatzbausteine: [],
  };
}

function eingabe(extra) {
  return Object.assign({
    funktionId: 'rec', abschluss: 'efz', weiterbildung6Tage: false, erfahrungJahre: 4,
    sprachen: [], beschaeftigungsgrad: 100, vertragsart: 'unbefristet', eintritt: '2027-03-15',
    sonderfall: 'keiner', zusatzIds: [],
  }, extra || {});
}

const cfg = baueConfig();
const ein = (stufe, e) => E.pruefeEinarbeitung(cfg, { stufe, einarbeitung: Object.assign(
  { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null }, e), eintritt: '2027-03-15' });

// ---- pruefeEinarbeitung ----
test('pruefeEinarbeitung: Stufe Ia/Ib', () => {
  let r = ein('Ia', { frueheresLGAVMonate: 0 });
  assert.equal(r.erlaubt, true);
  assert.equal(r.maxMonate, 12);
  assert.ok(r.grund.length > 0);
  assert.equal(ein('Ia', { frueheresLGAVMonate: 4 }).maxMonate, 3);
  assert.equal(ein('Ia', { frueheresLGAVMonate: 4 }).erlaubt, true);
  assert.equal(ein('Ia', { frueheresLGAVMonate: 3 }).maxMonate, 12);
  assert.equal(ein('Ib', { frueheresLGAVMonate: 0 }).maxMonate, 12);
});

test('pruefeEinarbeitung: Stufe II/IIIa nur erste L-GAV-Stelle, 3 Monate', () => {
  ['II', 'IIIa'].forEach((s) => {
    const r = ein(s, { frueheresLGAVMonate: 0 });
    assert.equal(r.erlaubt, true);
    assert.equal(r.maxMonate, 3);
    const n = ein(s, { frueheresLGAVMonate: 1 });
    assert.equal(n.erlaubt, false);
    assert.equal(n.maxMonate, 0);
    assert.ok(n.grund.length > 0);
  });
});

test('pruefeEinarbeitung: IIIb, IV, P nie', () => {
  ['IIIb', 'IV', 'P'].forEach((s) => {
    const r = ein(s, { frueheresLGAVMonate: 0 });
    assert.equal(r.erlaubt, false);
    assert.ok(r.grund.length > 0);
  });
});

test('pruefeEinarbeitung: Rückkehr ins Haus', () => {
  const r23 = ein('Ia', { rueckkehrHausUnterbruchMonate: 23 });
  assert.equal(r23.erlaubt, false);
  assert.match(r23.grund, /24 Monate/);
  const r24 = ein('Ia', { rueckkehrHausUnterbruchMonate: 24 });
  assert.equal(r24.erlaubt, true);
  assert.equal(r24.maxMonate, 12);
  assert.equal(ein('IIIa', { rueckkehrHausUnterbruchMonate: 24 }).maxMonate, 3);
});

// ---- berechne: Einarbeitung ----
test('berechne: Einarbeitung IIIa, 0 Monate, 8 %', () => {
  const r = E.berechne(cfg, eingabe({ einarbeitung: { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null } }));
  assert.equal(r.modus, 'berechnet');
  const e = r.einarbeitung;
  assert.equal(e.erlaubt, true);
  assert.equal(e.maxMonate, 3);
  assert.equal(e.reduktionProzent, 8);
  assert.equal(e.reduzierterMonatslohn, E.runde5(r.monatslohn * 0.92));
  assert.equal(e.reduzierterMonatslohn, 4374.6);
  assert.ok(e.reduzierterTotal > e.reduzierterMonatslohn);
  assert.equal(e.volllohnAb, '2027-06-15');
  assert.ok(!r.warnungen.some((w) => w.code === 'stufe_ii_unsicher'));
});

test('berechne: Warnung stufe_ii_unsicher nur bei Stufe II', () => {
  const r = E.berechne(cfg, eingabe({ abschluss: 'eba', einarbeitung: { aktiv: true, reduktionProzent: 5, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null } }));
  assert.equal(r.einarbeitung.erlaubt, true);
  assert.ok(r.warnungen.some((w) => w.code === 'stufe_ii_unsicher'));
});

test('berechne: Rückkehrer, Einarbeitung nicht erlaubt', () => {
  const r = E.berechne(cfg, eingabe({ einarbeitung: { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: 10 } }));
  assert.equal(r.modus, 'berechnet');
  assert.equal(r.einarbeitung.erlaubt, false);
  assert.ok(r.einarbeitung.grund.length > 0);
  assert.equal(r.einarbeitung.reduzierterMonatslohn, null);
  assert.equal(r.einarbeitung.reduzierterTotal, null);
  assert.equal(r.einarbeitung.volllohnAb, null);
});

test('berechne: Reduktion 9 % ist Fehler, 8 % erlaubt', () => {
  const r = E.berechne(cfg, eingabe({ einarbeitung: { aktiv: true, reduktionProzent: 9, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null } }));
  assert.equal(r.modus, 'fehler');
  assert.ok(r.fehler.some((f) => f.includes('8')));
  const ok = E.berechne(cfg, eingabe({ einarbeitung: { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null } }));
  assert.equal(ok.modus, 'berechnet');
});

test('berechne: ohne aktive Einarbeitung bleibt einarbeitung null', () => {
  assert.equal(E.berechne(cfg, eingabe()).einarbeitung, null);
  const r = E.berechne(cfg, eingabe({ einarbeitung: { aktiv: false, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null } }));
  assert.equal(r.einarbeitung, null);
});

test('berechne: Volllohn-Datum mit Monatsende (31.8. + 6 Monate = 28.2.)', () => {
  const r = E.berechne(cfg, eingabe({ abschluss: 'keiner', eintritt: '2027-08-31',
    einarbeitung: { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 4, rueckkehrHausUnterbruchMonate: null } }));
  // Ia mit 4 Monaten: 3 Monate -> 30.11.
  assert.equal(r.einarbeitung.volllohnAb, '2027-11-30');
  const r12 = E.berechne(cfg, eingabe({ abschluss: 'keiner', eintritt: '2027-08-31',
    einarbeitung: { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null } }));
  // 12 Monate: 2028-08-31
  assert.equal(r12.einarbeitung.volllohnAb, '2028-08-31');
  const r29 = E.berechne(cfg, eingabe({ abschluss: 'efz', eintritt: '2027-11-30',
    einarbeitung: { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null } }));
  assert.equal(r29.einarbeitung.volllohnAb, '2028-02-29');
});

// ---- spanne / spanneStufen ----
test('spanne: mit GM-Limit 3 %', () => {
  const r = E.berechne(cfg, eingabe());
  assert.equal(r.vorschlag, 4755);
  assert.deepEqual(r.spanne, { min: 4612.35, max: 4897.65 });
  assert.deepEqual(r.spanneStufen, {
    vorgesetzte: { min: 4707.45, max: 4802.55 },
    hr: { min: 4659.9, max: 4850.1 },
    gm: { min: 4612.35, max: 4897.65 },
  });
});

test('spanne: begrenzt durch Band', () => {
  const r = E.berechne(cfg, eingabe({ funktionId: 'schmal' }));
  assert.equal(r.vorschlag, 4755);
  assert.deepEqual(r.spanne, { min: 4750, max: 4800 });
  assert.deepEqual(r.spanneStufen.vorgesetzte, { min: 4750, max: 4800 });
});

test('spanne: nie unter dem Mindestlohn', () => {
  const r = E.berechne(cfg, eingabe({ funktionId: 'weit', abschluss: 'berufspruefung', erfahrungJahre: 0 }));
  assert.equal(r.vorschlag, 5325);
  assert.equal(r.spanne.min, 5325);
  assert.equal(r.spanneStufen.hr.min, 5325);
  assert.equal(r.spanne.max, 5484.75);
});

test('spanne: band_zu_eng ergibt min = max = Mindestlohn', () => {
  const r = E.berechne(cfg, eingabe({ funktionId: 'eng', abschluss: 'berufspruefung' }));
  assert.ok(r.warnungen.some((w) => w.code === 'band_zu_eng'));
  assert.deepEqual(r.spanne, { min: 5325, max: 5325 });
  ['vorgesetzte', 'hr', 'gm'].forEach((t) => assert.deepEqual(r.spanneStufen[t], { min: 5325, max: 5325 }));
});

test('spanne: null ohne Spielraum in der Konfiguration und bei Fehlern', () => {
  const c = baueConfig();
  c.stufen = {};
  const r = E.berechne(c, eingabe());
  assert.equal(r.spanne, null);
  assert.equal(r.spanneStufen, null);
  assert.equal(E.berechne(cfg, eingabe({ beschaeftigungsgrad: 0 })).spanne, null);
});

// ---- pruefeAbweichung ----
const erg = () => E.berechne(cfg, eingabe());

test('pruefeAbweichung: Vorschlag ist freigabe keine, ohne Begründung ok', () => {
  assert.deepEqual(E.pruefeAbweichung(erg(), 4755, ''), { ok: true, fehler: [], freigabe: 'keine' });
});

test('pruefeAbweichung: Vorgesetzte, ohne Begründung ok', () => {
  assert.deepEqual(E.pruefeAbweichung(erg(), 4800, ''), { ok: true, fehler: [], freigabe: 'Vorgesetzte' });
  assert.deepEqual(E.pruefeAbweichung(erg(), 4707.45, '  '), { ok: true, fehler: [], freigabe: 'Vorgesetzte' });
});

test('pruefeAbweichung: HR und GM brauchen Begründung', () => {
  const hr = E.pruefeAbweichung(erg(), 4850, '');
  assert.equal(hr.ok, false);
  assert.equal(hr.freigabe, 'HR');
  assert.ok(hr.fehler.some((f) => f.includes('Begründung nötig')));
  assert.equal(E.pruefeAbweichung(erg(), 4850, '   ').ok, false);
  assert.deepEqual(E.pruefeAbweichung(erg(), 4850, 'Marktlage'), { ok: true, fehler: [], freigabe: 'HR' });
  const gm = E.pruefeAbweichung(erg(), 4890, '');
  assert.equal(gm.ok, false);
  assert.equal(gm.freigabe, 'GM');
  assert.deepEqual(E.pruefeAbweichung(erg(), 4890, 'Schlüsselperson'), { ok: true, fehler: [], freigabe: 'GM' });
  assert.equal(E.pruefeAbweichung(erg(), 4612.35, 'Grund').freigabe, 'GM');
});

test('pruefeAbweichung: ausserhalb GM-Spanne ist Fehler', () => {
  const r = E.pruefeAbweichung(erg(), 4900, 'Begründung');
  assert.equal(r.ok, false);
  assert.equal(r.freigabe, null);
  assert.ok(r.fehler.some((f) => f.includes('Abweichung ausserhalb des zulässigen Spielraums')));
});

test('pruefeAbweichung: unter Mindestlohn immer Fehler', () => {
  const r = E.pruefeAbweichung(erg(), 4500, '');
  assert.equal(r.ok, false);
  assert.equal(r.freigabe, null);
  const mit = E.pruefeAbweichung(erg(), 4500, 'Mit Begründung');
  assert.equal(mit.ok, false);
  assert.equal(mit.freigabe, null);
  assert.ok(mit.fehler.some((f) => f.includes('Mindestlohn')));
});

test('pruefeAbweichung: ungültige Eingaben', () => {
  assert.equal(E.pruefeAbweichung(erg(), NaN, 'x').ok, false);
  assert.equal(E.pruefeAbweichung(E.berechne(cfg, eingabe({ beschaeftigungsgrad: 0 })), 4755, '').ok, false);
});

// ---- validateConfig: Spielraum ----
function validConfigMitDefault() {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const text = fs.readFileSync(path.join(__dirname, '..', 'config', 'config.js'), 'utf8');
  const sb = { window: {} };
  vm.runInNewContext(text, sb);
  return JSON.parse(JSON.stringify(sb.window.LOHN_CONFIG));
}

test('validateConfig: Standardkonfiguration hat gültigen Spielraum', () => {
  const c = validConfigMitDefault();
  assert.deepEqual(validateConfig(c).fehler, []);
  assert.deepEqual(c.stufen.IIIa.spielraum, { vorgesetzte: 1, hr: 2, gm: 3 });
  assert.ok(c.stufen.IIIa.hinweis.includes('von Jan bestätigt'));
});

test('validateConfig: Spielraum fehlt', () => {
  const c = validConfigMitDefault();
  delete c.stufen.IIIa.spielraum;
  const r = validateConfig(c);
  assert.equal(r.ok, false);
  assert.ok(r.fehler.some((f) => f.includes('IIIa') && f.includes('Spielraum')));
  const c2 = validConfigMitDefault();
  delete c2.stufen.IV.spielraum.hr;
  assert.equal(validateConfig(c2).ok, false);
  const c3 = validConfigMitDefault();
  delete c3.stufen;
  assert.equal(validateConfig(c3).ok, false);
});

test('validateConfig: Spielraum negativ', () => {
  const c = validConfigMitDefault();
  c.stufen.Ib.spielraum.vorgesetzte = -1;
  const r = validateConfig(c);
  assert.equal(r.ok, false);
  assert.ok(r.fehler.some((f) => f.includes('Ib') && f.includes('negativ')));
});

test('validateConfig: Spielraum nicht aufsteigend', () => {
  const c = validConfigMitDefault();
  c.stufen.II.spielraum = { vorgesetzte: 3, hr: 2, gm: 1 };
  const r = validateConfig(c);
  assert.equal(r.ok, false);
  assert.ok(r.fehler.some((f) => f.includes('II') && f.includes('aufsteigend')));
  const gleich = validConfigMitDefault();
  gleich.stufen.II.spielraum = { vorgesetzte: 2, hr: 2, gm: 2 };
  assert.equal(validateConfig(gleich).ok, true);
});

// ---- ungültige Einarbeitungsdaten ----
test('pruefeEinarbeitung: ungültige Daten gewähren nie erlaubt', () => {
  const p = (e) => E.pruefeEinarbeitung(cfg, { stufe: 'Ia', einarbeitung: e, eintritt: '2027-03-15' });
  [
    { aktiv: true },
    { aktiv: true, frueheresLGAVMonate: '0' },
    { aktiv: true, frueheresLGAVMonate: -1 },
    { aktiv: true, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: '10' },
    { aktiv: true, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: -5 },
  ].forEach((e) => {
    const r = p(e);
    assert.equal(r.erlaubt, false);
    assert.equal(r.maxMonate, 0);
    assert.ok(r.grund.length > 0);
  });
});

test('berechne: ungültige Einarbeitungsdaten ergeben Fehler', () => {
  const basis = { aktiv: true, reduktionProzent: 8, frueheresLGAVMonate: 0, rueckkehrHausUnterbruchMonate: null };
  const faelle = [
    { frueheresLGAVMonate: undefined },
    { frueheresLGAVMonate: '0' },
    { frueheresLGAVMonate: -1 },
    { rueckkehrHausUnterbruchMonate: '10' },
    { rueckkehrHausUnterbruchMonate: -3 },
  ];
  faelle.forEach((f) => {
    const r = E.berechne(cfg, eingabe({ einarbeitung: Object.assign({}, basis, f) }));
    assert.equal(r.modus, 'fehler');
    assert.ok(r.fehler.length > 0);
  });
  assert.ok(E.berechne(cfg, eingabe({ einarbeitung: { aktiv: true, reduktionProzent: 8 } }))
    .fehler.some((t) => t.includes('Frühere L-GAV-Tätigkeit')));
  // inaktiv: Daten werden nicht geprüft
  assert.equal(E.berechne(cfg, eingabe({ einarbeitung: { aktiv: false } })).modus, 'berechnet');
});

test('monateHinzu: 31.8.2027 + 6 Monate = 29.2.2028 (Schaltjahr)', () => {
  assert.equal(E.monateHinzu('2027-08-31', 6), '2028-02-29');
  assert.equal(E.monateHinzu('2026-08-31', 6), '2027-02-28');
});
