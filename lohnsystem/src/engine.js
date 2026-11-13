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
  var SONDERFAELLE_HINWEIS = {
    unter18: 'Unter 18 Jahre: Lohn individuell festlegen, keine Berechnung.',
    vollzeitstudium: 'Vollzeitstudium: Lohn individuell festlegen, keine Berechnung.',
    wiedereingliederung: 'Wiedereingliederung: Lohn individuell festlegen, keine Berechnung.'
  };

  function istZahl(x) { return typeof x === 'number' && isFinite(x); }
  function runde5(x) { return Math.round(x * 20 + 1e-9) / 20; }
  function runde2(x) { return Math.round(x * 100 + 1e-9) / 100; }

  function dezimal(x) { return String(x).replace('.', ','); }

  // Alle Beträge aus einem Vollzeit-Monatslohn (Grundlohn); einzige Stelle der Rundungsregeln.
  // opt: { beschaeftigungsgrad, einarbeitung: { erlaubt, reduktionProzent } | null, kader: boolean }
  // Kader: Überstundenpauschale = Stundenansatz (2 Stellen) x Pauschalstunden pro Monat (2 Stellen) x Satz, bei Teilzeit auf den Beschäftigungsgrad skaliert.
  function rechneBetraege(config, vollzeitLohn, opt) {
    var betrieb = config.betrieb;
    var grad = opt.beschaeftigungsgrad;
    var monatslohn = runde5(vollzeitLohn * grad / 100);
    var stundenansatz = runde2(vollzeitLohn / (betrieb.wochenstunden * 52 / 12));
    var kader = !!opt.kader && istZahl(betrieb.kaderWochenstunden);
    var pauschale = null;
    var pauschale125 = null;
    var stundenProMonat = null;
    var bezeichnungen = null;
    if (kader) {
      var satz = istZahl(betrieb.ueberstundenSatz) ? betrieb.ueberstundenSatz : 1;
      var diff = betrieb.kaderWochenstunden - betrieb.wochenstunden;
      var vollStunden = runde2(diff * 52 / 12);
      pauschale = runde5(stundenansatz * vollStunden * satz * grad / 100);
      pauschale125 = runde5(stundenansatz * vollStunden * 1.25 * grad / 100);
      stundenProMonat = runde2(vollStunden * grad / 100);
      var inkl = betrieb.dreizehnterInklPauschale !== false;
      bezeichnungen = {
        grundlohn: 'Grundlohn (' + dezimal(betrieb.wochenstunden) + ' h)' + (grad === 100 ? '' : ' bei ' + dezimal(grad) + ' %'),
        pauschale: 'Überstundenpauschale (' + dezimal(runde2(diff * grad / 100)) + ' h pro Woche, ' + dezimal(stundenProMonat) + ' h pro Monat, ' + dezimal(Math.round(satz * 10000) / 100) + ' %)',
        dreizehnter: inkl ? '13. Monatslohn (auf Grundlohn plus Pauschale)'
          : '13. Monatslohn (' + dezimal(betrieb.dreizehnterProzent) + ' %), monatlich ausbezahlt, separat ausgewiesen'
      };
    }
    var basis13 = kader && betrieb.dreizehnterInklPauschale !== false ? monatslohn + pauschale : monatslohn;
    var dreizehnter = runde5(basis13 * betrieb.dreizehnterProzent / 100);
    var totalMonat = runde2(monatslohn + (pauschale || 0) + dreizehnter);
    var reduzierterMonatslohn = null;
    var reduzierterTotal = null;
    var ein = opt.einarbeitung;
    if (ein && ein.erlaubt) {
      reduzierterMonatslohn = runde5(monatslohn * (1 - ein.reduktionProzent / 100));
      reduzierterTotal = runde2(reduzierterMonatslohn + runde5(reduzierterMonatslohn * betrieb.dreizehnterProzent / 100));
    }
    return {
      monatslohn: monatslohn, dreizehnter: dreizehnter, totalMonat: totalMonat,
      jahresbrutto: runde2(totalMonat * 12),
      stundenansatz: stundenansatz,
      reduzierterMonatslohn: reduzierterMonatslohn, reduzierterTotal: reduzierterTotal,
      ueberstundenpauschale: pauschale, pauschaleStundenProMonat: stundenProMonat, pauschale125: pauschale125,
      bezeichnungen: bezeichnungen
    };
  }

  function findeAbschluss(config, id) {
    return ((config && config.abschluesse) || []).filter(function (x) { return x.id === id; })[0] || null;
  }

  // Stufe aus Abschluss und Funktionsbereich (L-GAV-Kommentar zu Art. 10): Der Abschluss zählt nur im anerkannten Bereich.
  function bestimmeStufe(config, input) {
    var warnungen = [];
    input = input || {};
    var manuell = STUFEN_MANUELL.indexOf(input.stufeManuell) >= 0 ? input.stufeManuell : null;
    var funktion = ((config && config.funktionen) || []).filter(function (x) { return x.id === input.funktionId; })[0] || null;
    var bereich = funktion && funktion.bereich ? funktion.bereich : null;
    var ab = input.abschluss === 'keiner' ? null : findeAbschluss(config, input.abschluss);
    if (ab && ab.stufe === null && !manuell) {
      warnungen.push({ code: 'hf_offen', text: ab.label + ': Stufe bitte von Hand wählen.' });
    }
    if (manuell) {
      warnungen.push({ code: 'stufe_manuell', text: 'Stufe von Hand gewählt (' + manuell + '), die Einstufung nach Abschluss und Funktionsbereich wird übergangen.' });
      return { stufe: manuell, warnungen: warnungen };
    }
    if (input.abschluss === 'keiner') { return { stufe: 'Ia', warnungen: warnungen }; }
    if (!ab || ab.stufe === null) { return { stufe: null, warnungen: warnungen }; }
    var anerkannt = !!bereich && (ab.bereiche === '*' || (Array.isArray(ab.bereiche) && ab.bereiche.indexOf(bereich) >= 0));
    if (!anerkannt) {
      warnungen.push({ code: 'abschluss_nicht_anerkannt', text: 'Abschluss in diesem Bereich nicht anerkannt, Einstufung Ia; Gleichwertigkeit prüft im Streitfall die Paritätische Aufsichtskommission; HR kann die Stufe von Hand wählen.' });
      if (!bereich) {
        warnungen.push({ code: 'bereich_ungeregelt', text: 'Für diesen Bereich enthält der L-GAV-Kommentar keine Anerkennungstabelle; Auskunft der Kontrollstelle einholen.' });
      }
      return { stufe: 'Ia', warnungen: warnungen };
    }
    var stufe = ab.stufe;
    if (stufe === 'IIIa' && input.weiterbildung6Tage) { stufe = 'IIIb'; }
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

  // Vergleich eines Vollzeitlohns mit dem Mindestlohn seiner Stufe und der nächsthöheren Stufe (Praktikum ausgenommen).
  function pruefeStufenvergleich(config, tabelle, stufe, vollzeitLohn) {
    var i = STUFEN_MANUELL.indexOf(stufe);
    var stufen = tabelle && tabelle.stufen;
    if (i < 0 || !stufen || !istZahl(stufen[stufe]) || !istZahl(vollzeitLohn)) { return null; }
    var mindestlohn = stufen[stufe];
    var naechste = i + 1 < STUFEN_MANUELL.length ? STUFEN_MANUELL[i + 1] : null;
    var mlNaechste = naechste && istZahl(stufen[naechste]) ? stufen[naechste] : null;
    return {
      stufe: stufe, mindestlohn: mindestlohn,
      ueberStufe: runde2(vollzeitLohn - mindestlohn),
      ueberStufeProzent: Math.round((vollzeitLohn - mindestlohn) / mindestlohn * 1000) / 10,
      naechsteStufe: mlNaechste === null ? null : naechste,
      mindestlohnNaechste: mlNaechste,
      uebersprungen: mlNaechste !== null && vollzeitLohn >= mlNaechste
    };
  }

  function leeresErgebnis(modus, warnungen, fehler) {
    return {
      modus: modus, stufe: null, mindestlohn: null, tabelleJahr: null, bandStart: null, bandMax: null,
      positionen: [], vorschlag: null, monatslohn: null, dreizehnter: null, totalMonat: null,
      jahresbrutto: null, stundenansatz: null, entschaedigungen: [], spanne: null, spanneStufen: null, einarbeitung: null,
      stufenvergleich: null, kader: null, ueberstundenpauschale: null, bezeichnungen: null,
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
    if (!istZahl(e) || e < 0 || Math.floor(e) !== e) {
      f.push('Erfahrung muss in ganzen Jahren angegeben werden (0, 1, 2, ...).');
    }
    if (input.vertragsart !== 'unbefristet' && input.vertragsart !== 'saison') {
      f.push('Vertragsart unbekannt.');
    }
    if (typeof input.eintritt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.eintritt)) {
      f.push('Eintrittsdatum fehlt oder ist ungültig.');
    }
    if (input.abschluss !== 'keiner' && !findeAbschluss(config, input.abschluss)) {
      f.push('Abschluss unbekannt.');
    }
    var ein = input.einarbeitung;
    if (ein && ein.aktiv) {
      var maxProzent = istZahl(config && config.betrieb && config.betrieb.einarbeitungMaxProzent)
        ? config.betrieb.einarbeitungMaxProzent : 8;
      if (!istZahl(ein.reduktionProzent) || ein.reduktionProzent < 0 || ein.reduktionProzent > maxProzent) {
        f.push('Die Einarbeitungsreduktion darf höchstens ' + maxProzent + ' % betragen.');
      }
      if (!istZahl(ein.frueheresLGAVMonate) || ein.frueheresLGAVMonate < 0) {
        f.push('Frühere L-GAV-Tätigkeit in Monaten angeben (Zahl ab 0).');
      }
      var ub = ein.rueckkehrHausUnterbruchMonate;
      if (ub !== null && ub !== undefined && (!istZahl(ub) || ub < 0)) {
        f.push('Unterbruch bei Rückkehr ins Haus in Monaten angeben (Zahl ab 0) oder leer lassen.');
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
    // Monatsende: Tag auf den letzten Tag des Zielmonats begrenzen (31.8.2027 + 6 Monate = 29.2.2028, Schaltjahr; 28.2. in einem normalen Jahr)
    var letzter = new Date(Date.UTC(nj, nm + 1, 0)).getUTCDate();
    var nt = Math.min(t, letzter);
    return nj + '-' + ('0' + (nm + 1)).slice(-2) + '-' + ('0' + nt).slice(-2);
  }

  function pruefeEinarbeitung(config, daten) {
    var stufe = daten && daten.stufe;
    var e = (daten && daten.einarbeitung) || {};
    var frueher = e.frueheresLGAVMonate;
    var unterbruch = e.rueckkehrHausUnterbruchMonate;
    function nein(grund) { return { erlaubt: false, maxMonate: 0, grund: grund }; }
    if (!istZahl(frueher) || frueher < 0) {
      return nein('Frühere L-GAV-Tätigkeit in Monaten fehlt oder ist ungültig.');
    }
    if (unterbruch !== null && unterbruch !== undefined && (!istZahl(unterbruch) || unterbruch < 0)) {
      return nein('Unterbruch bei Rückkehr ins Haus ist ungültig.');
    }
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
      var bs = bestimmeStufe(config, input);
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

    var istKader = sonder !== 'praktikum' && funktion.kader === true && istZahl(betrieb.kaderWochenstunden);
    var betraege = rechneBetraege(config, vorschlag, { beschaeftigungsgrad: input.beschaeftigungsgrad, einarbeitung: null, kader: istKader });
    var monatslohn = betraege.monatslohn;

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
        var eb = rechneBetraege(config, vorschlag, { beschaeftigungsgrad: input.beschaeftigungsgrad, einarbeitung: { erlaubt: true, reduktionProzent: rp } });
        einarbeitung.reduzierterMonatslohn = eb.reduzierterMonatslohn;
        einarbeitung.reduzierterTotal = eb.reduzierterTotal;
        einarbeitung.volllohnAb = monateHinzu(input.eintritt, ep.maxMonate);
      }
    }

    var stufenvergleich = sonder === 'praktikum' ? null : pruefeStufenvergleich(config, tab.tabelle, stufe, vorschlag);
    if (stufenvergleich && stufenvergleich.uebersprungen) {
      warnungen.push({ code: 'stufe_uebersprungen', text: 'Der Lohn liegt auf oder über dem Mindestlohn der nächsthöheren Stufe ' + stufenvergleich.naechsteStufe
        + ' (CHF ' + stufenvergleich.mindestlohnNaechste.toFixed(2) + '). Prüfen, ob die Einstufung stimmt und ob der Lohn gegenüber Mitarbeitenden gleicher Qualifikation begründbar ist.' });
    }

    var kaderErgebnis = null;
    if (istKader) {
      var grenze = betrieb.ueberstundenGrenze6750;
      var unterGrenze = vorschlag < grenze;
      kaderErgebnis = { aktiv: true, pauschale: betraege.ueberstundenpauschale, pauschale125: betraege.pauschale125,
        stundenProMonat: betraege.pauschaleStundenProMonat, grundlohnUnterGrenze: unterGrenze };
      if (unterGrenze && betrieb.ueberstundenSatz < 1.25) {
        warnungen.push({ code: 'kader_voraussetzungen', text: 'Pauschale zu 100 % nur zulässig bei Arbeitszeiterfassung (Art. 21 L-GAV), monatlicher schriftlicher Saldomitteilung und Auszahlung spätestens mit der letzten Lohnzahlung; sonst 125 % (CHF '
          + betraege.pauschale125.toFixed(2) + '). Eine 50-Stunden-Normalarbeitszeit ist unter CHF 6\'750 nicht vereinbar, es handelt sich um Überstunden.' });
      }
      if (!unterGrenze) {
        warnungen.push({ code: 'kader_ab_grenze', text: 'Überstundenentschädigung kann schriftlich frei vereinbart werden, Art. 15 Ziff. 7.' });
      }
      warnungen.push({ code: 'kader_hoechstarbeitszeit', text: '50 Stunden = gesetzliche Höchstarbeitszeit im Gastgewerbe, Überzeit darüber mit 25 % Zuschlag.' });
    }

    return {
      modus: 'berechnet', stufe: stufe, mindestlohn: mindestlohn, tabelleJahr: tab.tabelle.jahr,
      bandStart: bandStart, bandMax: bandMax, positionen: positionen, vorschlag: vorschlag,
      monatslohn: monatslohn, dreizehnter: betraege.dreizehnter, totalMonat: betraege.totalMonat,
      jahresbrutto: betraege.jahresbrutto,
      stundenansatz: betraege.stundenansatz,
      ueberstundenpauschale: betraege.ueberstundenpauschale, kader: kaderErgebnis, bezeichnungen: betraege.bezeichnungen,
      entschaedigungen: entschaedigungen, spanne: spanne, spanneStufen: spanneStufen, einarbeitung: einarbeitung,
      stufenvergleich: stufenvergleich,
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
    pruefeStufenvergleich: pruefeStufenvergleich,
    berechne: berechne,
    rechneBetraege: rechneBetraege,
    pruefeEinarbeitung: pruefeEinarbeitung,
    monateHinzu: monateHinzu,
    pruefeAbweichung: pruefeAbweichung
  };
}));
