(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'));
  } else {
    root.LohnEditor = factory(root.LohnConfig);
  }
}(typeof window !== 'undefined' ? window : this, function (LohnConfig) {
  'use strict';

  var ARTEN = ['lohn', 'entschaedigung'];
  var SPRACHEN_CODES = ['DE', 'EN', 'FR', 'IT'];
  var NIVEAUS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  function istZahl(x) {
    return typeof x === 'number' && isFinite(x);
  }

  function kopie(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function istDatum(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) { return false; }
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  function fehlerErgebnis(config, fehler) {
    return { ok: false, config: config, fehler: fehler };
  }

  // Wendet eine Änderung auf eine Kopie an und prüft das Ergebnis; bei Fehlern bleibt die Eingabe unverändert.
  function anwenden(config, aendere) {
    var neu = kopie(config);
    var vorFehler = aendere(neu) || [];
    if (vorFehler.length) { return fehlerErgebnis(config, vorFehler); }
    var pruefung = LohnConfig.validateConfig(neu);
    if (!pruefung.ok) { return fehlerErgebnis(config, pruefung.fehler); }
    return { ok: true, config: neu, fehler: [] };
  }

  function unbekannteFelder(patch, erlaubt) {
    return Object.keys(patch || {}).filter(function (k) { return erlaubt.indexOf(k) < 0; })
      .map(function (k) { return 'Unbekanntes Feld «' + k + '».'; });
  }

  function tabelle(config, jahr) {
    return (config.mindestloehne || []).filter(function (t) { return t.jahr === jahr; })[0];
  }

  // ---- Mindestlöhne und Jahrespflege ----

  function neueJahrestabelle(config, jahr, prozent) {
    return anwenden(config, function (c) {
      if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) { return ['Das Jahr muss eine ganze Zahl zwischen 2000 und 2100 sein.']; }
      if (!istZahl(prozent) || prozent < -5 || prozent > 20) { return ['Die Teuerung muss eine Zahl zwischen −5 und 20 Prozent sein.']; }
      if (tabelle(c, jahr)) { return ['Für das Jahr ' + jahr + ' gibt es schon eine Mindestlohn-Tabelle.']; }
      var tabellen = c.mindestloehne || [];
      if (!tabellen.length) { return ['Keine Mindestlohn-Tabelle als Vorlage vorhanden.']; }
      var letzte = tabellen.reduce(function (a, b) { return b.jahr > a.jahr ? b : a; });
      var stufen = {};
      Object.keys(letzte.stufen).forEach(function (s) {
        stufen[s] = Math.round(letzte.stufen[s] * (100 + prozent) / 100);
      });
      tabellen.push({
        jahr: jahr,
        gueltigAbJahresbetrieb: jahr + '-01-01',
        gueltigAbSaison: jahr + '-05-01',
        stufen: stufen,
      });
      return [];
    });
  }

  function setzeMindestlohn(config, jahr, stufe, betrag) {
    return anwenden(config, function (c) {
      var t = tabelle(c, jahr);
      if (!t) { return ['Keine Mindestlohn-Tabelle für das Jahr ' + jahr + '.']; }
      if (LohnConfig.STUFEN.indexOf(stufe) < 0) { return ['Unbekannte Stufe «' + stufe + '».']; }
      if (!istZahl(betrag) || betrag <= 0) { return ['Der Mindestlohn muss eine Zahl grösser als 0 sein.']; }
      t.stufen[stufe] = betrag;
      return [];
    });
  }

  function setzeStichtage(config, jahr, jahresbetrieb, saison) {
    return anwenden(config, function (c) {
      var t = tabelle(c, jahr);
      if (!t) { return ['Keine Mindestlohn-Tabelle für das Jahr ' + jahr + '.']; }
      var fehler = [];
      if (!istDatum(jahresbetrieb)) { fehler.push('Stichtag Jahresbetrieb: ungültiges Datum (Format JJJJ-MM-TT).'); }
      if (!istDatum(saison)) { fehler.push('Stichtag Saison: ungültiges Datum (Format JJJJ-MM-TT).'); }
      if (fehler.length) { return fehler; }
      t.gueltigAbJahresbetrieb = jahresbetrieb;
      t.gueltigAbSaison = saison;
      return [];
    });
  }

  // ---- Stufen ----

  function setzeStufe(config, stufe, patch) {
    return anwenden(config, function (c) {
      patch = patch || {};
      var fehler = unbekannteFelder(patch, ['erklaerung', 'spielraum']);
      if (LohnConfig.STUFEN.indexOf(stufe) < 0 || !c.stufen || !c.stufen[stufe]) {
        return ['Unbekannte Stufe «' + stufe + '».'];
      }
      var s = c.stufen[stufe];
      if (patch.erklaerung !== undefined) {
        if (typeof patch.erklaerung !== 'string' || patch.erklaerung.trim() === '') {
          fehler.push('Die Erklärung der Stufe ' + stufe + ' darf nicht leer sein.');
        } else {
          s.erklaerung = patch.erklaerung.trim();
        }
      }
      if (patch.spielraum !== undefined) {
        var sp = patch.spielraum;
        if (stufe === 'P') {
          fehler.push('Für das Praktikum gibt es keinen Spielraum.');
        } else if (!sp || !istZahl(sp.vorgesetzte) || !istZahl(sp.hr) || !istZahl(sp.gm)) {
          fehler.push('Spielraum: Werte für Vorgesetzte, HR und GM müssen Zahlen sein.');
        } else if (sp.vorgesetzte < 0 || sp.hr < 0 || sp.gm < 0) {
          fehler.push('Spielraum: Werte dürfen nicht negativ sein.');
        } else if (sp.vorgesetzte > sp.hr || sp.hr > sp.gm) {
          fehler.push('Spielraum: Werte müssen aufsteigend sein (Vorgesetzte, HR, GM).');
        } else if (sp.gm > 20) {
          fehler.push('Spielraum: Werte dürfen höchstens 20 Prozent betragen.');
        } else {
          s.spielraum = { vorgesetzte: sp.vorgesetzte, hr: sp.hr, gm: sp.gm };
        }
      }
      return fehler;
    });
  }

  // ---- Funktionen ----

  var FUNKTION_FELDER = ['label', 'abteilung', 'bereich', 'gaestekontakt', 'kader', 'bandAlsUntergrenze', 'bandMin', 'bandMax'];

  function pruefeFunktionsfelder(c, f, patch) {
    var fehler = [];
    var abteilungIds = (c.abteilungen || []).map(function (a) { return a.id; });
    var bereichIds = (c.bereiche || []).map(function (b) { return b.id; });
    if (patch.label !== undefined && (typeof patch.label !== 'string' || patch.label.trim() === '')) {
      fehler.push('Die Bezeichnung der Funktion darf nicht leer sein.');
    }
    if (patch.abteilung !== undefined && abteilungIds.indexOf(patch.abteilung) < 0) {
      fehler.push('Unbekannte Abteilung «' + patch.abteilung + '».');
    }
    if (patch.bereich !== undefined && patch.bereich !== null && bereichIds.indexOf(patch.bereich) < 0) {
      fehler.push('Unbekannter Funktionsbereich «' + patch.bereich + '».');
    }
    ['gaestekontakt', 'kader', 'bandAlsUntergrenze'].forEach(function (k) {
      if (patch[k] !== undefined && typeof patch[k] !== 'boolean') { fehler.push('«' + k + '» muss ja oder nein sein.'); }
    });
    ['bandMin', 'bandMax'].forEach(function (k) {
      if (patch[k] !== undefined && (!istZahl(patch[k]) || patch[k] <= 0)) {
        fehler.push((k === 'bandMin' ? 'Bandminimum' : 'Bandmaximum') + ' muss eine Zahl grösser als 0 sein.');
      }
    });
    if (!fehler.length) {
      var min = patch.bandMin !== undefined ? patch.bandMin : f.bandMin;
      var max = patch.bandMax !== undefined ? patch.bandMax : f.bandMax;
      if (min >= max) { fehler.push('Das Bandminimum muss kleiner sein als das Bandmaximum.'); }
    }
    return fehler;
  }

  function aktualisiereFunktion(config, id, patch) {
    return anwenden(config, function (c) {
      patch = patch || {};
      var f = (c.funktionen || []).filter(function (x) { return x.id === id; })[0];
      if (!f) { return ['Funktion «' + id + '» nicht gefunden.']; }
      var fehler = unbekannteFelder(patch, FUNKTION_FELDER).concat(pruefeFunktionsfelder(c, f, patch));
      if (fehler.length) { return fehler; }
      Object.keys(patch).forEach(function (k) {
        f[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
      });
      if (patch.kader === false) { delete f.kader; }
      if (patch.bandAlsUntergrenze === false) { delete f.bandAlsUntergrenze; }
      return [];
    });
  }

  function slug(text) {
    return String(text).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[éèêë]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ôò]/g, 'o').replace(/[îï]/g, 'i').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function fuegeFunktionHinzu(config, funktion) {
    return anwenden(config, function (c) {
      var neu = funktion || {};
      var fehler = unbekannteFelder(neu, FUNKTION_FELDER.concat(['id']));
      var f = {
        abteilung: neu.abteilung,
        bereich: neu.bereich === undefined ? null : neu.bereich,
        label: typeof neu.label === 'string' ? neu.label.trim() : neu.label,
        gaestekontakt: neu.gaestekontakt === undefined ? false : neu.gaestekontakt,
        bandMin: neu.bandMin,
        bandMax: neu.bandMax,
      };
      if (neu.kader === true) { f.kader = true; }
      if (neu.bandAlsUntergrenze === true) { f.bandAlsUntergrenze = true; }
      ['label', 'abteilung', 'bandMin', 'bandMax'].forEach(function (k) {
        if (f[k] === undefined) { fehler.push('Angabe fehlt: ' + k + '.'); }
      });
      fehler = fehler.concat(fehler.length ? [] : pruefeFunktionsfelder(c, f, f));
      if (fehler.length) { return fehler; }
      var ids = (c.funktionen || []).map(function (x) { return x.id; });
      var id = neu.id;
      if (id !== undefined && id !== '') {
        if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) { return ['Ungültige Funktions-ID «' + id + '» (nur Kleinbuchstaben, Ziffern und Bindestrich).']; }
        if (ids.indexOf(id) >= 0) { return ['Die Funktions-ID «' + id + '» gibt es schon.']; }
      } else {
        var basis = f.abteilung + '-' + (slug(f.label) || 'funktion');
        id = basis;
        for (var n = 2; ids.indexOf(id) >= 0; n++) { id = basis + '-' + n; }
      }
      var eintrag = { id: id };
      Object.keys(f).forEach(function (k) { eintrag[k] = f[k]; });
      eintrag.beispiel = false;
      c.funktionen.push(eintrag);
      return [];
    });
  }

  function entferneFunktion(config, id) {
    return anwenden(config, function (c) {
      var vorher = (c.funktionen || []).length;
      c.funktionen = (c.funktionen || []).filter(function (x) { return x.id !== id; });
      return c.funktionen.length === vorher ? ['Funktion «' + id + '» nicht gefunden.'] : [];
    });
  }

  // ---- Bausteine, Betrieb, Zusatzbausteine ----

  function setzeBausteine(config, patch) {
    return anwenden(config, function (c) {
      patch = patch || {};
      var fehler = unbekannteFelder(patch, ['erfahrungProJahr', 'spracheProSprache', 'maxSprachen', 'sprachen', 'mindestNiveau']);
      var b = c.bausteine || (c.bausteine = {});
      ['erfahrungProJahr', 'spracheProSprache'].forEach(function (k) {
        if (patch[k] !== undefined) {
          if (!istZahl(patch[k]) || patch[k] < 0) { fehler.push('«' + k + '» muss eine Zahl ab 0 sein.'); } else { b[k] = patch[k]; }
        }
      });
      if (patch.maxSprachen !== undefined) {
        if (!Number.isInteger(patch.maxSprachen) || patch.maxSprachen < 1) { fehler.push('Die höchste Anzahl Sprachen muss eine ganze Zahl ab 1 sein.'); } else { b.maxSprachen = patch.maxSprachen; }
      }
      if (patch.sprachen !== undefined) {
        var ok = Array.isArray(patch.sprachen) && patch.sprachen.every(function (s) { return SPRACHEN_CODES.indexOf(s) >= 0; });
        if (!ok) { fehler.push('Sprachen: erlaubt sind ' + SPRACHEN_CODES.join(', ') + '.'); } else { b.sprachen = patch.sprachen.slice(); }
      }
      if (patch.mindestNiveau !== undefined) {
        if (NIVEAUS.indexOf(patch.mindestNiveau) < 0) { fehler.push('Mindestniveau: erlaubt sind ' + NIVEAUS.join(', ') + '.'); } else { b.mindestNiveau = patch.mindestNiveau; }
      }
      return fehler;
    });
  }

  var BETRIEB_ZAHLEN = {
    wochenstunden: ['Wochenstunden', function (x) { return x > 0; }, 'eine Zahl grösser als 0'],
    dreizehnterProzent: ['13. Monatslohn in Prozent', function (x) { return x >= 0 && x <= 100; }, 'eine Zahl zwischen 0 und 100'],
    maxErfahrungsjahre: ['Höchste anrechenbare Erfahrungsjahre', function (x) { return Number.isInteger(x) && x >= 0; }, 'eine ganze Zahl ab 0'],
    einarbeitungMaxProzent: ['Höchste Einarbeitungsreduktion in Prozent', function (x) { return x >= 0 && x <= 100; }, 'eine Zahl zwischen 0 und 100'],
    kaderWochenstunden: ['Kader-Wochenstunden', function (x) { return x > 0 && x <= 50; }, 'eine Zahl grösser als 0 und höchstens 50'],
    ueberstundenSatz: ['Überstundensatz', function (x) { return x >= 1; }, 'eine Zahl ab 1 (1 = 100 %)'],
    ueberstundenGrenze6750: ['Grenze Überstundenentschädigung', function (x) { return x > 0; }, 'eine Zahl grösser als 0'],
  };
  var BETRIEB_JANEIN = {
    dreizehnterInklPauschale: '«13. Monatslohn inkl. Pauschale»',
    baenderBestaetigt: '«Bänder bestätigt»',
  };

  function setzeBetrieb(config, patch) {
    return anwenden(config, function (c) {
      patch = patch || {};
      var erlaubt = Object.keys(BETRIEB_ZAHLEN).concat(Object.keys(BETRIEB_JANEIN));
      var fehler = unbekannteFelder(patch, erlaubt);
      var b = c.betrieb || (c.betrieb = {});
      Object.keys(patch).forEach(function (k) {
        var v = patch[k];
        if (BETRIEB_ZAHLEN[k]) {
          if (!istZahl(v) || !BETRIEB_ZAHLEN[k][1](v)) {
            fehler.push(BETRIEB_ZAHLEN[k][0] + ' muss ' + BETRIEB_ZAHLEN[k][2] + ' sein.');
          } else { b[k] = v; }
        } else if (BETRIEB_JANEIN[k]) {
          if (typeof v !== 'boolean') { fehler.push(BETRIEB_JANEIN[k] + ' muss ja oder nein sein.'); } else { b[k] = v; }
        }
      });
      return fehler;
    });
  }

  function fuegeBausteinHinzu(config, baustein) {
    return anwenden(config, function (c) {
      var z = baustein || {};
      var fehler = unbekannteFelder(z, ['id', 'label', 'art', 'betrag']);
      if (typeof z.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(z.id)) { fehler.push('Die ID des Bausteins fehlt oder ist ungültig (nur Kleinbuchstaben, Ziffern und Bindestrich).'); }
      if (typeof z.label !== 'string' || z.label.trim() === '') { fehler.push('Die Bezeichnung des Bausteins darf nicht leer sein.'); }
      if (ARTEN.indexOf(z.art) < 0) { fehler.push('Die Art muss «lohn» oder «entschaedigung» sein.'); }
      if (!istZahl(z.betrag) || z.betrag < 0) { fehler.push('Der Betrag muss eine Zahl ab 0 sein.'); }
      if (fehler.length) { return fehler; }
      c.zusatzbausteine = c.zusatzbausteine || [];
      if (c.zusatzbausteine.some(function (x) { return x.id === z.id; })) { return ['Die Baustein-ID «' + z.id + '» gibt es schon.']; }
      c.zusatzbausteine.push({ id: z.id, label: z.label.trim(), art: z.art, betrag: z.betrag });
      return [];
    });
  }

  function entferneBaustein(config, id) {
    return anwenden(config, function (c) {
      var vorher = (c.zusatzbausteine || []).length;
      c.zusatzbausteine = (c.zusatzbausteine || []).filter(function (x) { return x.id !== id; });
      return c.zusatzbausteine.length === vorher ? ['Baustein «' + id + '» nicht gefunden.'] : [];
    });
  }

  // ---- Vergleich mit der veröffentlichten Datei ----

  function unterscheidet(a, b) {
    return LohnConfig.serializeConfig(a) !== LohnConfig.serializeConfig(b);
  }

  return {
    ARTEN: ARTEN,
    SPRACHEN_CODES: SPRACHEN_CODES,
    NIVEAUS: NIVEAUS,
    BETRIEB_ZAHLEN: Object.keys(BETRIEB_ZAHLEN),
    BETRIEB_JANEIN: Object.keys(BETRIEB_JANEIN),
    neueJahrestabelle: neueJahrestabelle,
    setzeMindestlohn: setzeMindestlohn,
    setzeStichtage: setzeStichtage,
    setzeStufe: setzeStufe,
    aktualisiereFunktion: aktualisiereFunktion,
    fuegeFunktionHinzu: fuegeFunktionHinzu,
    entferneFunktion: entferneFunktion,
    setzeBausteine: setzeBausteine,
    setzeBetrieb: setzeBetrieb,
    fuegeBausteinHinzu: fuegeBausteinHinzu,
    entferneBaustein: entferneBaustein,
    unterscheidet: unterscheidet,
  };
}));
