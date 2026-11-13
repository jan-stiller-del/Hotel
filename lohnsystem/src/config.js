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
        if (istZahl(stufen.IIIa) && f.bandMin < stufen.IIIa) {
          warnungen.push(name + ': Bandminimum liegt unter dem Mindestlohn der Stufe IIIa (Tabelle '
            + jahr + ').');
        }
        if (istZahl(stufen.IV) && f.bandMax < stufen.IV) {
          warnungen.push(name + ': Bandmaximum liegt unter dem Mindestlohn der Stufe IV (Tabelle '
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
