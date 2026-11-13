(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LohnConfig = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // P = Praktikum
  var STUFEN = ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV', 'P'];
  // Stufen, die ein Abschluss festlegen kann (IIIb ergibt sich aus IIIa plus Weiterbildung); null = von Hand.
  var ABSCHLUSS_STUFEN = ['Ib', 'II', 'IIIa', 'IV'];

  function istZahl(x) {
    return typeof x === 'number' && isFinite(x);
  }

  function validateConfig(config) {
    var fehler = [];
    var warnungen = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { ok: false, fehler: ['Konfiguration ist kein Objekt.'], warnungen: warnungen };
    }

    var betrieb = config.betrieb;
    if (!betrieb || !istZahl(betrieb.wochenstunden) || betrieb.wochenstunden <= 0) {
      fehler.push('Wochenstunden müssen eine Zahl grösser als 0 sein.');
    }

    var tabellen = config.mindestloehne;
    if (!Array.isArray(tabellen) || tabellen.length === 0) {
      fehler.push('Keine Mindestlohn-Tabelle vorhanden.');
      tabellen = [];
    }
    tabellen.forEach(function (t, i) {
      var name = 'Mindestlohn-Tabelle ' + (t && t.jahr !== undefined ? t.jahr : (i + 1));
      var stufen = (t && t.stufen) || {};
      STUFEN.forEach(function (s) {
        if (!istZahl(stufen[s]) || stufen[s] <= 0) {
          fehler.push(name + ': Mindestlohn für Stufe ' + s + ' fehlt oder ist ungültig.');
        }
      });
    });

    var stufenKonfig = (config.stufen && typeof config.stufen === 'object') ? config.stufen : {};
    STUFEN.forEach(function (s) {
      var sp = stufenKonfig[s] && stufenKonfig[s].spielraum;
      var name = 'Spielraum Stufe ' + s;
      if (!sp || !istZahl(sp.vorgesetzte) || !istZahl(sp.hr) || !istZahl(sp.gm)) {
        fehler.push(name + ': Werte für Vorgesetzte, HR und GM fehlen oder sind ungültig.');
      } else if (sp.vorgesetzte < 0 || sp.hr < 0 || sp.gm < 0) {
        fehler.push(name + ': Werte dürfen nicht negativ sein.');
      } else if (sp.vorgesetzte > sp.hr || sp.hr > sp.gm) {
        fehler.push(name + ': Werte müssen aufsteigend sein (Vorgesetzte, HR, GM).');
      }
    });

    var abteilungIds = {};
    (Array.isArray(config.abteilungen) ? config.abteilungen : []).forEach(function (a) {
      if (a && a.id) { abteilungIds[a.id] = true; }
    });

    var bereichIds = {};
    (Array.isArray(config.bereiche) ? config.bereiche : []).forEach(function (b, i) {
      var id = b && b.id;
      if (!id) {
        fehler.push('Bereich ' + (i + 1) + ': ID fehlt.');
      } else if (bereichIds[id]) {
        fehler.push('Doppelte Bereichs-ID: ' + id + '.');
      } else {
        bereichIds[id] = true;
      }
    });
    if (!Array.isArray(config.bereiche) || config.bereiche.length === 0) {
      fehler.push('Keine Funktionsbereiche vorhanden.');
    }

    var abschlussIds = {};
    if (!Array.isArray(config.abschluesse)) {
      fehler.push('Keine Abschlüsse vorhanden.');
    }
    (Array.isArray(config.abschluesse) ? config.abschluesse : []).forEach(function (a, i) {
      var id = a && a.id;
      var name = 'Abschluss ' + (id || (i + 1));
      if (!id) {
        fehler.push(name + ': ID fehlt.');
      } else if (id === 'keiner') {
        fehler.push(name + ': die ID «keiner» ist reserviert.');
      } else if (abschlussIds[id]) {
        fehler.push('Doppelte Abschluss-ID: ' + id + '.');
      }
      if (id) { abschlussIds[id] = true; }
      if (!a) { return; }
      if (!a.label) { fehler.push(name + ': Bezeichnung fehlt.'); }
      if (a.stufe !== null && ABSCHLUSS_STUFEN.indexOf(a.stufe) < 0) {
        fehler.push(name + ': ungültige Stufe «' + a.stufe + '» (erlaubt: Ib, II, IIIa, IV oder null für von Hand).');
      }
      if (a.bereiche !== '*') {
        if (!Array.isArray(a.bereiche)) {
          fehler.push(name + ': Bereiche müssen eine Liste oder «*» sein.');
        } else {
          a.bereiche.forEach(function (b) {
            if (!bereichIds[b]) { fehler.push(name + ': unbekannter Bereich «' + b + '».'); }
          });
        }
      }
    });

    var funktionIds = {};
    (Array.isArray(config.funktionen) ? config.funktionen : []).forEach(function (f, i) {
      var id = f && f.id;
      var name = 'Funktion ' + (id || (i + 1));
      if (!id) {
        fehler.push(name + ': ID fehlt.');
      } else if (funktionIds[id]) {
        fehler.push('Doppelte Funktions-ID: ' + id + '.');
      }
      if (id) { funktionIds[id] = true; }
      if (!f) { return; }
      if (!abteilungIds[f.abteilung]) {
        fehler.push(name + ': unbekannte Abteilung «' + f.abteilung + '».');
      }
      if (f.bereich === undefined || (f.bereich !== null && !bereichIds[f.bereich])) {
        fehler.push(name + ': unbekannter Bereich «' + f.bereich + '» (Bereich oder null angeben).');
      }
      if (!istZahl(f.bandMin) || !istZahl(f.bandMax)) {
        fehler.push(name + ': Bandminimum und Bandmaximum müssen Zahlen sein.');
        return;
      }
      if (f.bandMin > f.bandMax) {
        fehler.push(name + ': Bandminimum ist grösser als Bandmaximum.');
        return;
      }
      tabellen.forEach(function (t) {
        var stufen = (t && t.stufen) || {};
        var jahr = t && t.jahr !== undefined ? t.jahr : '?';
        if (istZahl(stufen.Ia) && f.bandMin < stufen.Ia) {
          warnungen.push(name + ': Bandminimum liegt unter dem Mindestlohn der Stufe Ia (Tabelle '
            + jahr + ').');
        }
      });
    });

    return { ok: fehler.length === 0, fehler: fehler, warnungen: warnungen };
  }

  function serializeConfig(config) {
    return 'window.LOHN_CONFIG = ' + JSON.stringify(config, null, 2) + ';\n';
  }

  function parseConfigDatei(text) {
    var meldung = 'Konfigurationsdatei nicht lesbar';
    var s = String(text === undefined || text === null ? '' : text).trim();
    var json = s;
    var i = s.indexOf('=');
    if (i >= 0 && !/^[\[{]/.test(s)) {
      json = s.slice(i + 1).trim().replace(/;\s*$/, '');
    }
    var wert;
    try {
      wert = JSON.parse(json);
    } catch (e) {
      throw new Error(meldung);
    }
    if (!wert || typeof wert !== 'object' || Array.isArray(wert)) {
      throw new Error(meldung);
    }
    return wert;
  }

  return {
    STUFEN: STUFEN,
    validateConfig: validateConfig,
    parseConfigDatei: parseConfigDatei,
    serializeConfig: serializeConfig,
  };
}));
