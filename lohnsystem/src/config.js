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

    var hatKader = (Array.isArray(config.funktionen) ? config.funktionen : []).some(function (f) { return f && f.kader === true; });
    if (betrieb && (hatKader || betrieb.kaderWochenstunden !== undefined)) {
      var kws = betrieb.kaderWochenstunden;
      if (!istZahl(kws) || (istZahl(betrieb.wochenstunden) && kws <= betrieb.wochenstunden) || kws > 50) {
        fehler.push('Kader-Wochenstunden müssen eine Zahl grösser als die Wochenstunden und höchstens 50 sein.');
      }
      if (!istZahl(betrieb.ueberstundenSatz) || betrieb.ueberstundenSatz < 1) {
        fehler.push('Überstundensatz muss eine Zahl ab 1 sein (1 = 100 %).');
      }
      if (!istZahl(betrieb.ueberstundenGrenze6750) || betrieb.ueberstundenGrenze6750 <= 0) {
        fehler.push('Die Grenze für die Überstundenentschädigung muss eine Zahl grösser als 0 sein.');
      }
      if (typeof betrieb.dreizehnterInklPauschale !== 'boolean') {
        fehler.push('«13. Monatslohn inkl. Pauschale» muss ja oder nein sein.');
      }
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
      var erkl = stufenKonfig[s] && stufenKonfig[s].erklaerung;
      if (typeof erkl !== 'string' || erkl.trim() === '') {
        fehler.push('Erklärung der Stufe ' + s + ' fehlt (Feld erklaerung).');
      }
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
      if (f.bandMin !== undefined || f.bandMax !== undefined || f.bandAlsUntergrenze !== undefined) {
        warnungen.push(name + ': Die Bandfelder bei der Funktion werden nicht mehr verwendet, das Band hängt an der Stufe.');
      }
    });

    var baender = config.lohnbaender;
    if (!baender || typeof baender !== 'object') {
      fehler.push('Lohnbänder fehlen.');
    } else {
      STUFEN.filter(function (st) { return st !== 'P'; }).forEach(function (st) {
        var b = baender[st];
        if (!b || !istZahl(b.max) || b.max <= 0) {
          fehler.push('Lohnband Stufe ' + st + ': Maximum fehlt oder ist ungültig.');
          return;
        }
        tabellen.forEach(function (t) {
          var ml = t && t.stufen && t.stufen[st];
          if (istZahl(ml) && b.max < ml) {
            fehler.push('Lohnband Stufe ' + st + ': Maximum liegt unter dem Mindestlohn (Tabelle ' + (t.jahr !== undefined ? t.jahr : '?') + ').');
          }
        });
      });
      var k = baender.kader;
      if (!k || !istZahl(k.min) || !istZahl(k.max) || k.min <= 0 || k.max <= 0) {
        fehler.push('Kaderband: Minimum und Maximum fehlen oder sind ungültig.');
      } else if (k.min > k.max) {
        fehler.push('Kaderband: Minimum ist grösser als Maximum.');
      }
    }

    return { ok: fehler.length === 0, fehler: fehler, warnungen: warnungen };
  }

  function serializeConfig(config) {
    return 'window.LOHN_CONFIG = ' + JSON.stringify(config, null, 2) + ';\n';
  }

  // Entfernt // und /* */ ausserhalb von Strings; null bei unbeendetem Blockkommentar.
  function ohneKommentare(text) {
    var aus = '';
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text.charAt(i);
      var d = text.charAt(i + 1);
      if (c === '"' || c === "'") {
        var j = i + 1;
        while (j < n && text.charAt(j) !== c) {
          j += text.charAt(j) === '\\' ? 2 : 1;
        }
        aus += text.slice(i, j + 1);
        i = j + 1;
      } else if (c === '/' && d === '/') {
        while (i < n && text.charAt(i) !== '\n') { i++; }
      } else if (c === '/' && d === '*') {
        var ende = text.indexOf('*/', i + 2);
        if (ende < 0) { return null; }
        aus += ' ';
        i = ende + 2;
      } else {
        aus += c;
        i++;
      }
    }
    return aus;
  }

  function parseConfigDatei(text) {
    var meldung = 'Konfigurationsdatei nicht lesbar';
    var roh = ohneKommentare(String(text === undefined || text === null ? '' : text));
    if (roh === null) { throw new Error(meldung); }
    var s = roh.trim();
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

  // Erklärungstext einer Stufe oder '' (Leseansicht und Eingabeseite dürfen ohne Erklärung weiterlaufen).
  function stufeErklaerung(config, stufe) {
    var s = config && config.stufen && config.stufen[stufe];
    return (s && typeof s.erklaerung === 'string') ? s.erklaerung.trim() : '';
  }

  // Name der Stufe wie in der Konfiguration («Stufe IIIa», «Praktikum»), sonst «Stufe X».
  function stufeName(config, stufe) {
    var s = config && config.stufen && config.stufen[stufe];
    return (s && s.label) || 'Stufe ' + stufe;
  }

  // «Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)»; ohne Erklärung nur «Stufe IIIa».
  function stufeMitErklaerung(config, stufe) {
    var erkl = stufeErklaerung(config, stufe);
    return stufeName(config, stufe) + (erkl ? ', ' + erkl : '');
  }

  return {
    STUFEN: STUFEN,
    stufeErklaerung: stufeErklaerung,
    stufeName: stufeName,
    stufeMitErklaerung: stufeMitErklaerung,
    validateConfig: validateConfig,
    parseConfigDatei: parseConfigDatei,
    serializeConfig: serializeConfig,
  };
}));
