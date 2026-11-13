(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LohnEngine = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var STUFEN_MANUELL = ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV'];
  var NIVEAUS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'MS'];
  var ABSCHLUSS_STUFE = { keiner: 'Ia', progresso: 'Ib', eba: 'II', efz: 'IIIa', berufspruefung: 'IV' };
  var SONDERFAELLE_HINWEIS = {
    unter18: 'Unter 18 Jahre: Lohn individuell festlegen, keine Berechnung.',
    vollzeitstudium: 'Vollzeitstudium: Lohn individuell festlegen, keine Berechnung.',
    wiedereingliederung: 'Wiedereingliederung: Lohn individuell festlegen, keine Berechnung.'
  };

  function istZahl(x) { return typeof x === 'number' && isFinite(x); }
  function runde5(x) { return Math.round(x * 20 + 1e-9) / 20; }
  function runde2(x) { return Math.round(x * 100 + 1e-9) / 100; }

  function bestimmeStufe(input) {
    var warnungen = [];
    var ab = input && input.abschluss;
    if (ab === 'hf' || ab === 'hotelfachschule') {
      warnungen.push({ code: 'hf_offen', text: 'Höhere Fachschule: Stufe bitte von Hand wählen.' });
      var m = input.stufeManuell;
      return { stufe: STUFEN_MANUELL.indexOf(m) >= 0 ? m : null, warnungen: warnungen };
    }
    var stufe = ABSCHLUSS_STUFE[ab];
    if (!stufe) { return { stufe: null, warnungen: warnungen }; }
    if (ab === 'efz' && input.weiterbildung6Tage) { stufe = 'IIIb'; }
    return { stufe: stufe, warnungen: warnungen };
  }

  function einJahrSpaeter(datum) {
    return (parseInt(datum.slice(0, 4), 10) + 1) + datum.slice(4);
  }

  function findeMindestlohnTabelle(config, eintritt, vertragsart) {
    var feld = vertragsart === 'saison' ? 'gueltigAbSaison' : 'gueltigAbJahresbetrieb';
    var tabellen = (config && Array.isArray(config.mindestloehne)) ? config.mindestloehne : [];
    var treffer = null;
    var letzte = null;
    tabellen.forEach(function (t) {
      var ab = t[feld];
      if (typeof ab !== 'string') { return; }
      if (!letzte || ab > letzte[feld]) { letzte = t; }
      if (ab <= eintritt && (!treffer || ab > treffer[feld])) { treffer = t; }
    });
    var veraltet = !!(treffer && letzte && treffer === letzte && eintritt > einJahrSpaeter(letzte[feld]));
    return { tabelle: treffer, veraltet: veraltet };
  }

  function leeresErgebnis(modus, warnungen, fehler) {
    return {
      modus: modus, stufe: null, mindestlohn: null, tabelleJahr: null, bandStart: null, bandMax: null,
      positionen: [], vorschlag: null, monatslohn: null, dreizehnter: null, totalMonat: null,
      jahresbrutto: null, stundenansatz: null, entschaedigungen: [], spanne: null, spanneStufen: null, einarbeitung: null,
      warnungen: warnungen || [], fehler: fehler || []
    };
  }

  function fehlerErgebnis(fehler, warnungen) {
    return leeresErgebnis('fehler', warnungen, fehler);
  }

  function pruefeEingaben(config, input, funktion) {
    var f = [];
    if (!funktion) { f.push('Funktion unbekannt.'); }
    if (!istZahl(input.beschaeftigungsgrad) || input.beschaeftigungsgrad < 1 || input.beschaeftigungsgrad > 100) {
      f.push('Beschäftigungsgrad muss zwischen 1 und 100 liegen.');
    }
    var e = input.erfahrungJahre;
    if (!istZahl(e) || e < 0 || Math.round(e * 2) !== e * 2) {
      f.push('Erfahrung muss eine Zahl in halben Jahren sein (0, 0.5, 1, ...).');
    }
    if (input.vertragsart !== 'unbefristet' && input.vertragsart !== 'saison') {
      f.push('Vertragsart unbekannt.');
    }
    if (typeof input.eintritt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.eintritt)) {
      f.push('Eintrittsdatum fehlt oder ist ungültig.');
    }
    var ab = input.abschluss;
    if (!ABSCHLUSS_STUFE[ab] && ab !== 'hf' && ab !== 'hotelfachschule') {
      f.push('Abschluss unbekannt.');
    }
    var ein = input.einarbeitung;
    if (ein && ein.aktiv) {
      var maxProzent = istZahl(config && config.betrieb && config.betrieb.einarbeitungMaxProzent)
        ? config.betrieb.einarbeitungMaxProzent : 8;
      if (!istZahl(ein.reduktionProzent) || ein.reduktionProzent < 0 || ein.reduktionProzent > maxProzent) {
        f.push('Die Einarbeitungsreduktion darf höchstens ' + maxProzent + ' % betragen.');
      }
    }
    return f;
  }

  function zaehleSprachen(config, funktion, sprachen) {
    if (!funktion.gaestekontakt || !Array.isArray(sprachen)) { return 0; }
    var b = config.bausteine || {};
    var min = NIVEAUS.indexOf(b.mindestNiveau || 'B2');
    var gezaehlt = {};
    var n = 0;
    sprachen.forEach(function (s) {
      if (!s || (b.sprachen || []).indexOf(s.sprache) < 0 || gezaehlt[s.sprache]) { return; }
      var niveau = s.niveau === 'Muttersprache' ? 'MS' : s.niveau;
      if (NIVEAUS.indexOf(niveau) >= min) { gezaehlt[s.sprache] = true; n++; }
    });
    return Math.min(n, b.maxSprachen === undefined ? n : b.maxSprachen);
  }

  function monateHinzu(datum, monate) {
    var j = parseInt(datum.slice(0, 4), 10);
    var m = parseInt(datum.slice(5, 7), 10) - 1;
    var t = parseInt(datum.slice(8, 10), 10);
    var summe = m + monate;
    var nj = j + Math.floor(summe / 12);
    var nm = ((summe % 12) + 12) % 12;
    // Monatsende: Tag auf den letzten Tag des Zielmonats begrenzen (31.8. + 6 Monate = 28.2.)
    var letzter = new Date(Date.UTC(nj, nm + 1, 0)).getUTCDate();
    var nt = Math.min(t, letzter);
    return nj + '-' + ('0' + (nm + 1)).slice(-2) + '-' + ('0' + nt).slice(-2);
  }

  function pruefeEinarbeitung(config, daten) {
    var stufe = daten && daten.stufe;
    var e = (daten && daten.einarbeitung) || {};
    var frueher = istZahl(e.frueheresLGAVMonate) ? e.frueheresLGAVMonate : 0;
    var unterbruch = e.rueckkehrHausUnterbruchMonate;
    function nein(grund) { return { erlaubt: false, maxMonate: 0, grund: grund }; }
    if (istZahl(unterbruch) && unterbruch < 24) {
      return nein('Rückkehr ins gleiche Haus mit Unterbruch unter 24 Monaten: keine Einarbeitungsreduktion.');
    }
    if (stufe === 'Ia' || stufe === 'Ib') {
      if (frueher < 4) {
        return { erlaubt: true, maxMonate: 12, grund: 'Stufe I, nie mindestens 4 Monate in einem L-GAV-Betrieb: bis 12 Monate.' };
      }
      return { erlaubt: true, maxMonate: 3, grund: 'Stufe I, bereits mindestens 4 Monate in einem L-GAV-Betrieb: bis 3 Monate.' };
    }
    if (stufe === 'II' || stufe === 'IIIa') {
      if (frueher === 0) {
        return { erlaubt: true, maxMonate: 3, grund: 'Stufe ' + stufe + ', erste Beschäftigung in einem L-GAV-Betrieb: bis 3 Monate.' };
      }
      return nein('Stufe ' + stufe + ': nur bei der ersten Beschäftigung in einem L-GAV-Betrieb.');
    }
    return nein('Bei Stufe ' + (stufe === 'P' ? 'Praktikum' : stufe) + ' ist keine Einarbeitungsreduktion zulässig.');
  }

  function berechneSpanne(vorschlag, prozent, bandStart, bandMax) {
    return {
      min: runde5(Math.max(vorschlag * (1 - prozent / 100), bandStart)),
      max: runde5(Math.min(vorschlag * (1 + prozent / 100), bandMax))
    };
  }

  function berechne(config, input) {
    input = input || {};
    var funktion = ((config && config.funktionen) || []).filter(function (x) { return x.id === input.funktionId; })[0];
    var fehler = pruefeEingaben(config, input, funktion);
    if (fehler.length) { return fehlerErgebnis(fehler); }

    var sonder = input.sonderfall || 'keiner';
    if (SONDERFAELLE_HINWEIS[sonder]) {
      return leeresErgebnis('hinweis', [{ code: 'sonderfall_' + sonder, text: SONDERFAELLE_HINWEIS[sonder] }]);
    }

    var warnungen = [];
    var stufe;
    if (sonder === 'praktikum') {
      stufe = 'P';
    } else {
      var bs = bestimmeStufe(input);
      warnungen = warnungen.concat(bs.warnungen);
      if (!bs.stufe) { return fehlerErgebnis(['Stufe wählen'], warnungen); }
      stufe = bs.stufe;
    }

    var tab = findeMindestlohnTabelle(config, input.eintritt, input.vertragsart);
    if (!tab.tabelle) { return fehlerErgebnis(['Keine Mindestlohn-Tabelle für dieses Eintrittsdatum.'], warnungen); }
    if (tab.veraltet) {
      warnungen.push({ code: 'tabelle_veraltet', text: 'Die Mindestlohn-Tabelle ist veraltet, bitte Konfiguration prüfen.' });
    }
    var mindestlohn = tab.tabelle.stufen[stufe];
    var betrieb = config.betrieb;

    var zusatz = [];
    var entschaedigungen = [];
    var zusatzFehler = [];
    (input.zusatzIds || []).forEach(function (id) {
      var z = (config.zusatzbausteine || []).filter(function (x) { return x.id === id; })[0];
      if (!z) { zusatzFehler.push('Zusatzbaustein unbekannt: ' + id + '.'); return; }
      if (z.art === 'entschaedigung') {
        entschaedigungen.push({ label: z.label, betrag: z.betrag });
      } else {
        zusatz.push({ label: z.label, betrag: z.betrag, art: 'lohn' });
      }
    });
    if (zusatzFehler.length) { return fehlerErgebnis(zusatzFehler, warnungen); }

    var positionen = [{ label: 'Basis Stufe ' + (stufe === 'P' ? 'Praktikum' : stufe), betrag: mindestlohn, art: 'basis' }];
    var vorschlag;
    var bandStart = null;
    var bandMax = null;

    if (sonder === 'praktikum') {
      vorschlag = mindestlohn;
    } else {
      var jahre = Math.min(input.erfahrungJahre, betrieb.maxErfahrungsjahre);
      var proJahr = istZahl(funktion.erfahrungProJahr) ? funktion.erfahrungProJahr : config.bausteine.erfahrungProJahr;
      if (jahre > 0 && proJahr > 0) {
        positionen.push({ label: 'Erfahrung (' + jahre + ' Jahre)', betrag: runde5(jahre * proJahr), art: 'lohn' });
      }
      var nSprachen = zaehleSprachen(config, funktion, input.sprachen);
      if (nSprachen > 0) {
        positionen.push({ label: 'Sprachen (' + nSprachen + ')', betrag: runde5(nSprachen * config.bausteine.spracheProSprache), art: 'lohn' });
      }
      positionen = positionen.concat(zusatz);

      var summe = positionen.reduce(function (s, p) { return s + p.betrag; }, 0);
      bandStart = Math.max(funktion.bandMin, mindestlohn);
      bandMax = funktion.bandMax;
      if (bandMax < mindestlohn) {
        warnungen.push({ code: 'band_zu_eng', text: 'Das Bandmaximum liegt unter dem Mindestlohn; der Mindestlohn gilt.' });
        bandMax = mindestlohn;
      }
      vorschlag = runde5(Math.min(Math.max(summe, bandStart), bandMax));
    }

    var monatslohn = runde5(vorschlag * input.beschaeftigungsgrad / 100);
    var dreizehnter = runde5(monatslohn * betrieb.dreizehnterProzent / 100);
    var totalMonat = runde2(monatslohn + dreizehnter);

    var spanne = null;
    var spanneStufen = null;
    var sp = config.stufen && config.stufen[stufe] && config.stufen[stufe].spielraum;
    if (sonder !== 'praktikum' && sp && istZahl(sp.vorgesetzte) && istZahl(sp.hr) && istZahl(sp.gm)) {
      spanneStufen = {
        vorgesetzte: berechneSpanne(vorschlag, sp.vorgesetzte, bandStart, bandMax),
        hr: berechneSpanne(vorschlag, sp.hr, bandStart, bandMax),
        gm: berechneSpanne(vorschlag, sp.gm, bandStart, bandMax)
      };
      spanne = { min: spanneStufen.gm.min, max: spanneStufen.gm.max };
    }

    var einarbeitung = null;
    if (input.einarbeitung && input.einarbeitung.aktiv) {
      var ep = pruefeEinarbeitung(config, { stufe: stufe, einarbeitung: input.einarbeitung, eintritt: input.eintritt });
      if (stufe === 'II') {
        warnungen.push({ code: 'stufe_ii_unsicher', text: 'Einarbeitungsreduktion bei Stufe II: Vertragstext und GastroSuisse-Merkblatt widersprechen sich, bitte bei der Kontrollstelle klären.' });
      }
      var rp = input.einarbeitung.reduktionProzent;
      einarbeitung = { erlaubt: ep.erlaubt, grund: ep.grund, maxMonate: ep.maxMonate, reduktionProzent: rp,
        reduzierterMonatslohn: null, reduzierterTotal: null, volllohnAb: null };
      if (ep.erlaubt) {
        var reduziert = runde5(monatslohn * (1 - rp / 100));
        einarbeitung.reduzierterMonatslohn = reduziert;
        einarbeitung.reduzierterTotal = runde2(reduziert + runde5(reduziert * betrieb.dreizehnterProzent / 100));
        einarbeitung.volllohnAb = monateHinzu(input.eintritt, ep.maxMonate);
      }
    }

    return {
      modus: 'berechnet', stufe: stufe, mindestlohn: mindestlohn, tabelleJahr: tab.tabelle.jahr,
      bandStart: bandStart, bandMax: bandMax, positionen: positionen, vorschlag: vorschlag,
      monatslohn: monatslohn, dreizehnter: dreizehnter, totalMonat: totalMonat,
      jahresbrutto: runde2(totalMonat * 12),
      stundenansatz: runde2(vorschlag / (betrieb.wochenstunden * 52 / 12)),
      entschaedigungen: entschaedigungen, spanne: spanne, spanneStufen: spanneStufen, einarbeitung: einarbeitung,
      warnungen: warnungen, fehler: []
    };
  }

  function pruefeAbweichung(ergebnis, gewaehlterMonatslohn, begruendung) {
    var fehler = [];
    if (!ergebnis || ergebnis.modus !== 'berechnet') {
      return { ok: false, fehler: ['Kein berechneter Lohn vorhanden.'], freigabe: null };
    }
    if (!istZahl(gewaehlterMonatslohn)) {
      return { ok: false, fehler: ['Gewählter Monatslohn ist keine Zahl.'], freigabe: null };
    }
    var eps = 1e-9;
    if (gewaehlterMonatslohn < ergebnis.mindestlohn - eps) {
      return { ok: false, fehler: ['Der gewählte Lohn liegt unter dem Mindestlohn.'], freigabe: null };
    }
    if (Math.abs(gewaehlterMonatslohn - ergebnis.vorschlag) < eps) {
      return { ok: true, fehler: [], freigabe: 'keine' };
    }
    var st = ergebnis.spanneStufen;
    var tiers = [['vorgesetzte', 'Vorgesetzte'], ['hr', 'HR'], ['gm', 'GM']];
    var freigabe = null;
    if (st) {
      for (var i = 0; i < tiers.length; i++) {
        var r = st[tiers[i][0]];
        if (gewaehlterMonatslohn >= r.min - eps && gewaehlterMonatslohn <= r.max + eps) {
          freigabe = tiers[i][1];
          break;
        }
      }
    }
    if (!freigabe) {
      return { ok: false, fehler: ['Abweichung ausserhalb des zulässigen Spielraums.'], freigabe: null };
    }
    if (freigabe !== 'Vorgesetzte' && !(typeof begruendung === 'string' && begruendung.trim())) {
      fehler.push('Begründung nötig: Die Abweichung braucht die Freigabe von ' + freigabe + '.');
    }
    return { ok: fehler.length === 0, fehler: fehler, freigabe: freigabe };
  }

  return {
    runde5: runde5,
    bestimmeStufe: bestimmeStufe,
    findeMindestlohnTabelle: findeMindestlohnTabelle,
    berechne: berechne,
    pruefeEinarbeitung: pruefeEinarbeitung,
    pruefeAbweichung: pruefeAbweichung
  };
}));
