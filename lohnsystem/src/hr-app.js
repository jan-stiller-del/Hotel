(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LohnHrApp = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Reihenfolge und Titel der Gruppen im Abschluss-Dropdown (nach Stufe; null = Stufe von Hand).
  var ABSCHLUSS_GRUPPEN = [
    ['Ib', 'Ib Progresso'],
    ['II', 'II EBA'],
    ['IIIa', 'IIIa EFZ'],
    ['IV', 'IV Fachausweis'],
    [null, 'Stufe von Hand wählen']
  ];
  var SONDERFAELLE = [
    ['keiner', 'Kein Sonderfall'],
    ['praktikum', 'Praktikum'],
    ['unter18', 'Unter 18 Jahre'],
    ['vollzeitstudium', 'Vollzeitstudium'],
    ['wiedereingliederung', 'Wiedereingliederung']
  ];
  var VERTRAGSARTEN = [['unbefristet', 'Unbefristete Stelle'], ['befristet', 'Befristete Stelle']];
  var STUFEN_MANUELL = ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV'];

  var Cfg = typeof require === 'function' ? require('./config.js') : window.LohnConfig;

  // Optionen für «Stufe von Hand wählen»: Stufe mit Erklärung («IIIa – Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)»).
  function baueStufeManuellOptionen(config) {
    return [{ value: '', label: '– bitte wählen –' }].concat(STUFEN_MANUELL.map(function (s) {
      var erkl = Cfg.stufeErklaerung(config, s);
      return { value: s, label: erkl ? s + ' – ' + erkl : s };
    }));
  }
  var NIVEAUS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Muttersprache'];
  var SPRACHNAMEN = { EN: 'Englisch', FR: 'Französisch', IT: 'Italienisch', DE: 'Deutsch' };

  // Reine Umwandlung der Formularwerte (Texte) in das Eingabeobjekt der Rechenengine.
  function zahl(v) {
    if (v === null || v === undefined || String(v).trim() === '') { return null; }
    return Number(String(v).replace(',', '.'));
  }

  function formularZuInput(w) {
    var sonderfall = w.sonderfall || 'keiner';
    var abschluss = w.abschluss || (sonderfall !== 'keiner' ? 'keiner' : '');
    var erfahrung = zahl(w.erfahrung);
    var sprachen = [];
    var gewaehlt = w.sprachen || {};
    Object.keys(gewaehlt).forEach(function (code) {
      if (gewaehlt[code]) { sprachen.push({ sprache: code, niveau: gewaehlt[code] }); }
    });
    var input = {
      funktionId: w.funktionId,
      abschluss: abschluss,
      weiterbildung6Tage: !!w.weiterbildung6Tage,
      stufeManuell: w.stufeManuell || null,
      erfahrungJahre: erfahrung === null ? 0 : erfahrung,
      sprachen: sprachen,
      beschaeftigungsgrad: zahl(w.beschaeftigungsgrad),
      vertragsart: w.vertragsart,
      eintritt: w.eintritt,
      sonderfall: sonderfall,
      zusatzIds: Array.isArray(w.zusatzIds) ? w.zusatzIds.slice() : []
    };
    var e = w.einarbeitung;
    if (e && e.aktiv) {
      input.einarbeitung = {
        aktiv: true,
        reduktionProzent: zahl(e.reduktionProzent),
        frueheresLGAVMonate: zahl(e.frueherMonate),
        rueckkehrHausUnterbruchMonate: zahl(e.unterbruchMonate)
      };
    }
    return input;
  }

  // Zeilen der Sprachen-Auswahl, in der Reihenfolge von config.bausteine.sprachen (Deutsch wie jede andere Sprache).
  function baueSprachZeilen(config) {
    var codes = (config && config.bausteine && config.bausteine.sprachen) || [];
    return codes.map(function (code) {
      return { code: code, id: 'sprache-' + code, label: SPRACHNAMEN[code] || code };
    });
  }

  // Block «Auszahlung pro Monat»: Zeilen {label, betrag, art}; der 13. Monatslohn steht immer als eigene Zeile.
  function baueAuszahlungZeilen(e, config, kontext) {
    var satz = String(config.betrieb.dreizehnterProzent).replace('.', ',');
    var grad = Number(kontext.beschaeftigungsgrad);
    var lohnLabel = grad === 100 ? 'Monatslohn brutto (Vollzeit)' : 'Monatslohn brutto bei ' + String(grad).replace('.', ',') + ' %';
    var kader = e.ueberstundenpauschale !== null && e.ueberstundenpauschale !== undefined && !!e.bezeichnungen;
    var zeilen = [{ label: kader ? e.bezeichnungen.grundlohn : lohnLabel, betrag: e.monatslohn, art: 'lohn' }];
    if (kader) { zeilen.push({ label: e.bezeichnungen.pauschale, betrag: e.ueberstundenpauschale, art: 'pauschale' }); }
    return zeilen.concat([
      { label: kader ? e.bezeichnungen.dreizehnter : '13. Monatslohn (' + satz + ' %), monatlich ausbezahlt, separat ausgewiesen', betrag: e.dreizehnter, art: 'dreizehnter' },
      { label: 'Total pro Monat', betrag: e.totalMonat, art: 'summe' },
      { label: 'Jahresbrutto', betrag: e.jahresbrutto, art: 'jahr' },
      { label: 'Hinweis: Der Mindestlohnvergleich erfolgt ohne 13. Monatslohn.', betrag: null, art: 'hinweis' }
    ]);
  }

  // Abrechnung für den gewählten Vollzeitlohn: dieselben Beträge wie im Excel-Export (Engine.rechneBetraege), dieselben Zeilen wie
  // «Auszahlung pro Monat», dazu Einarbeitung (falls aktiv und erlaubt) und Stundenansatz ohne 13. Monatslohn.
  // null bei Sonderfall, Hinweis, Fehler oder ungültigem Lohn. differenz: gewählter Lohn minus Vorschlag, null bei gleichem Lohn.
  function baueWahlAbrechnung(config, ergebnis, gewaehlterLohn, kontext) {
    var wert = Number(gewaehlterLohn);
    if (!ergebnis || ergebnis.modus !== 'berechnet' || gewaehlterLohn === null || gewaehlterLohn === '' || !isFinite(wert) || wert <= 0) { return null; }
    var Engine = typeof require === 'function' ? require('./engine.js') : window.LohnEngine;
    var grad = Number(kontext.beschaeftigungsgrad);
    var ein = ergebnis.einarbeitung && ergebnis.einarbeitung.erlaubt ? ergebnis.einarbeitung : null;
    var b = Engine.rechneBetraege(config, wert, { beschaeftigungsgrad: grad, einarbeitung: ein, kader: !!ergebnis.kader });
    var zeilen = baueAuszahlungZeilen(b, config, kontext).filter(function (r) { return r.art !== 'hinweis'; });
    // Zulagen und Entschädigungen (Handy, Wäsche usw.): stehen unter dem Bruttolohn, sind aber nicht Teil davon.
    if (ergebnis.entschaedigungen && ergebnis.entschaedigungen.length) {
      zeilen.push({ label: 'Zulagen und Entschädigungen', betrag: null, art: 'kopf' });
      var zulagenSumme = 0;
      ergebnis.entschaedigungen.forEach(function (x) { zeilen.push({ label: x.label, betrag: x.betrag, art: 'entschaedigung' }); zulagenSumme += x.betrag; });
      zeilen.push({ label: 'Brutto pro Monat gesamt (Total plus Zulagen)', betrag: Math.round((b.totalMonat + zulagenSumme) * 100) / 100, art: 'summe' });
    }
    if (ergebnis.band && ergebnis.band.ueberschreitbar && wert > ergebnis.band.max + 1e-9) {
      zeilen.push({ label: 'Hinweis: Der gewählte Lohn liegt über dem Bandmaximum von CHF ' + ergebnis.band.max.toFixed(2) + ' (Freigabe GM mit Begründung).', betrag: null, art: 'hinweis' });
    }
    if (ein) {
      var rp = String(ein.reduktionProzent).replace('.', ',');
      zeilen.push({ label: 'Während der Einarbeitung (um ' + rp + ' % reduziert): Monatslohn', betrag: b.reduzierterMonatslohn, art: 'einarbeitung' });
      if (b.reduzierteUeberstundenpauschale !== null && b.reduzierteUeberstundenpauschale !== undefined) {
        zeilen.push({ label: 'Überstundenpauschale auf reduziertem Grundlohn', betrag: b.reduzierteUeberstundenpauschale, art: 'einarbeitung' });
      }
      zeilen.push({ label: 'Total pro Monat während der Einarbeitung (mit 13. Monatslohn)', betrag: b.reduzierterTotal, art: 'einarbeitung' });
    }
    zeilen.push({ label: 'Stundenansatz (Vollzeitbasis, ' + String(config.betrieb.wochenstunden).replace('.', ',') + ' Wochenstunden, ohne 13. Monatslohn)', betrag: b.stundenansatz, art: 'stundenansatz' });
    var diff = Math.round((wert - ergebnis.vorschlag) * 100) / 100;
    return {
      titel: 'Abrechnung mit gewähltem Lohn (CHF ' + wert.toFixed(2) + ')',
      zeilen: zeilen,
      differenz: diff === 0 ? null : { chf: diff, prozent: Math.round(diff / ergebnis.vorschlag * 1000) / 10 }
    };
  }

  // Text der Differenzzeile mit Vorzeichen und Dezimalkomma; leer ohne Differenz.
  function formatDifferenz(d) {
    if (!d) { return ''; }
    return 'Differenz zum Vorschlag: ' + (d.chf < 0 ? '-' : '+') + 'CHF ' + Math.abs(d.chf).toFixed(2)
      + ' (' + (d.prozent < 0 ? '-' : '') + Math.abs(d.prozent).toFixed(1).replace('.', ',') + ' %)';
  }

  // Anzeigezeilen {text, art} aus einem Stufenvergleich (Engine); art 'warnung' = hervorgehobene Zeile mit Marker.
  function baueStufenvergleichZeilen(sv, config) {
    if (!sv) { return []; }
    var d = Number(sv.ueberStufe);
    var zeilen = [{
      text: 'Lohn über Stufen-Mindestlohn: ' + (d < 0 ? '-' : '+') + 'CHF ' + Math.abs(d).toFixed(2)
        + ' (' + Number(sv.ueberStufeProzent).toFixed(1).replace('.', ',') + ' %)',
      art: 'info'
    }];
    if (sv.uebersprungen) {
      zeilen.push({
        text: '⚠ Nächsthöhere ' + Cfg.stufeMitErklaerung(config, sv.naechsteStufe) + ' (CHF ' + Number(sv.mindestlohnNaechste).toFixed(2) + ') erreicht oder überschritten',
        art: 'warnung'
      });
    }
    return zeilen;
  }

  // Gruppen für das Abschluss-Dropdown: «Ohne Abschluss» mit «keiner» zuerst, dann je Stufe die Abschlüsse aus der Konfiguration.
  function baueAbschlussGruppen(config) {
    var gruppen = [{ label: 'Ohne Abschluss', optionen: [{ id: 'keiner', label: 'Kein Abschluss (Stufe Ia)' }] }];
    var liste = (config && config.abschluesse) || [];
    ABSCHLUSS_GRUPPEN.forEach(function (g) {
      var optionen = liste.filter(function (a) { return a.stufe === g[0]; })
        .map(function (a) { return { id: a.id, label: a.label }; });
      if (optionen.length) { gruppen.push({ label: g[1], optionen: optionen }); }
    });
    return gruppen;
  }

  // Bezeichnung des Funktionsbereichs aus config.bereiche; ohne Bereich «nicht geregelt», ohne Funktion leer.
  function bereichLabel(config, funktion) {
    if (!funktion) { return ''; }
    var b = ((config && config.bereiche) || []).filter(function (x) { return x.id === funktion.bereich; })[0];
    return funktion.bereich && b ? b.label : 'nicht geregelt';
  }

  // Schreibgeschützte Anzeige des Funktionsbereichs der gewählten Funktion.
  function funktionsbereichText(config, funktion) {
    return funktion ? 'Funktionsbereich: ' + bereichLabel(config, funktion) : '';
  }

  // Vergleichszeile zwischen gelerntem Beruf und neuer Funktion (gleiche Regel wie die Engine: Abschluss zählt nur im anerkannten Bereich).
  // optionen: { stufeManuell, sonderfall }; der Text richtet sich nach der tatsächlich gerechneten Stufe.
  function baueAnerkennungsZeile(config, abschlussId, funktionId, ergebnis, optionen) {
    optionen = optionen || {};
    var STUFEN_GUELTIG = ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV'];
    if (optionen.sonderfall === 'praktikum') {
      return { text: Cfg.stufeMitErklaerung(config, 'P') + ': keine Anerkennungsprüfung', art: 'ok' };
    }
    var abschluss = abschlussId ? ((config && config.abschluesse) || []).filter(function (x) { return x.id === abschlussId; })[0] || null : null;
    var funktion = funktionId ? ((config && config.funktionen) || []).filter(function (x) { return x.id === funktionId; })[0] || null : null;
    if (!abschlussId || !funktion) {
      return { text: 'Gelernten Beruf und Funktion wählen, dann erscheint hier der Vergleich.', art: 'offen' };
    }
    if (abschlussId !== 'keiner' && !abschluss) {
      return { text: 'Gelernter Beruf unbekannt, bitte neu wählen.', art: 'offen' };
    }
    var bereichText = funktion.bereich ? ' (' + bereichLabel(config, funktion) + ')' : '';
    var neu = ' → Neue Stelle: ' + funktion.label + bereichText + ': ';
    var gelernt = 'Gelernt: kein Abschluss';
    if (abschluss) {
      var bereiche = abschluss.bereiche === '*' ? 'alle Bereiche'
        : (Array.isArray(abschluss.bereiche) ? abschluss.bereiche.map(function (id) {
          var b = ((config && config.bereiche) || []).filter(function (x) { return x.id === id; })[0];
          return b ? b.label : id;
        }).join(', ') : '');
      gelernt = 'Gelernt: ' + abschluss.label + (bereiche ? ' (' + bereiche + ')' : '');
    }
    if (STUFEN_GUELTIG.indexOf(optionen.stufeManuell) >= 0) {
      return { text: gelernt + neu + 'von Hand gewählt: ' + Cfg.stufeMitErklaerung(config, optionen.stufeManuell), art: 'warnung' };
    }
    if (!abschluss) {
      return { text: gelernt + neu + 'Einstufung Ia', art: 'ok' };
    }
    if (abschluss.stufe === null) {
      return { text: gelernt + neu + 'Stufe von Hand wählen', art: 'offen' };
    }
    var bereich = funktion.bereich || null;
    var anerkannt = !!bereich && (abschluss.bereiche === '*' || (Array.isArray(abschluss.bereiche) && abschluss.bereiche.indexOf(bereich) >= 0));
    if (!anerkannt) {
      return { text: gelernt + neu + 'nicht anerkannt, Einstufung Ia'
        + (bereich ? '' : '. Bereich nicht geregelt, Auskunft der Kontrollstelle einholen'), art: 'warnung' };
    }
    var stufe = ergebnis && ergebnis.stufe ? ergebnis.stufe : abschluss.stufe;
    return { text: gelernt + neu + 'anerkannt, ' + Cfg.stufeMitErklaerung(config, stufe), art: 'ok' };
  }

  // Das Feld «Stufe von Hand wählen» erscheint nur, wenn es gebraucht wird oder schon eine Stufe gewählt ist.
  function zeigeStufeManuell(config, abschlussId, ergebnis, stufeManuell) {
    if (stufeManuell) { return true; }
    var ab = abschlussId ? ((config && config.abschluesse) || []).filter(function (x) { return x.id === abschlussId; })[0] : null;
    if (ab && ab.stufe === null) { return true; }
    return !!(ergebnis && Array.isArray(ergebnis.warnungen) && ergebnis.warnungen.some(function (w) {
      return w.code === 'abschluss_nicht_anerkannt' || w.code === 'bereich_ungeregelt';
    }));
  }

  // Der Hinweis «Lohnbänder sind Beispielwerte» gilt, bis die Bänder freigegeben sind.
  function zeigeBaenderHinweis(config) {
    return !(config && config.betrieb && config.betrieb.baenderBestaetigt === true);
  }

  // Eine von Hand gewählte Stufe gilt nur für genau diese Kombination aus Abschluss und Funktion.
  function stufeManuellBleibt(alt, neu) {
    return !!alt && !!neu && alt.abschluss === neu.abschluss && alt.funktionId === neu.funktionId;
  }

  // Welcher Wert bleibt in einem neu gefüllten Select gewählt? Sonst leer («– bitte wählen –»).
  function waehleOption(werte, alt) {
    return (alt && werte.indexOf(alt) >= 0) ? alt : '';
  }

  // ---------- Browser-Teil ----------
  function start() {
    var doc = document;
    var config = window.LOHN_CONFIG;
    var $ = function (id) { return doc.getElementById(id); };

    function el(tag, klasse, text) {
      var e = doc.createElement(tag);
      if (klasse) { e.className = klasse; }
      if (text !== undefined && text !== null) { e.textContent = text; }
      return e;
    }
    function leeren(e) { while (e.firstChild) { e.removeChild(e.firstChild); } }
    function option(select, wert, text) {
      var o = doc.createElement('option');
      o.value = wert;
      o.textContent = text;
      select.appendChild(o);
    }
    function chf(x) { return Number(x).toFixed(2); }
    function prozent(x) { return String(x).replace('.', ',') + ' %'; }
    function datumDe(iso) { return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4); }

    var pruefung = (window.LohnConfig && config) ? window.LohnConfig.validateConfig(config)
      : { ok: false, fehler: ['Konfiguration oder Rechenmodul nicht geladen.'] };
    if (!pruefung.ok) {
      var box = $('konfigFehler');
      box.hidden = false;
      box.appendChild(el('strong', null, 'Die Konfiguration ist ungültig, der Rechner ist gesperrt:'));
      var ul = el('ul');
      pruefung.fehler.forEach(function (f) { ul.appendChild(el('li', null, f)); });
      box.appendChild(ul);
      return;
    }
    $('seite').hidden = false;
    $('baenderHinweis').hidden = !zeigeBaenderHinweis(config);

    // Dropdowns aus der Konfiguration füllen
    config.abteilungen.forEach(function (a) { option($('abteilung'), a.id, a.label); });
    option($('abschluss'), '', '– bitte wählen –');
    baueAbschlussGruppen(config).forEach(function (g) {
      var og = doc.createElement('optgroup');
      og.label = g.label;
      g.optionen.forEach(function (o) { option(og, o.id, o.label); });
      $('abschluss').appendChild(og);
    });
    SONDERFAELLE.forEach(function (a) { option($('sonderfall'), a[0], a[1]); });
    VERTRAGSARTEN.forEach(function (a) { option($('vertragsart'), a[0], a[1]); });
    option($('stufeManuell'), '', '– bitte wählen –');
    baueStufeManuellOptionen(config).slice(1).forEach(function (o) { option($('stufeManuell'), o.value, o.label); });
    for (var h = 0; h <= config.betrieb.maxErfahrungsjahre; h++) {
      option($('erfahrung'), String(h), h + (h === 1 ? ' Jahr' : ' Jahre'));
    }
    var sprachZeilen = baueSprachZeilen(config);
    var sprachCodes = sprachZeilen.map(function (z) { return z.code; });
    sprachZeilen.forEach(function (z) {
      var zeile = el('div', 'sprache');
      var label = el('label', null, z.label);
      label.htmlFor = z.id;
      var sel = el('select');
      sel.id = z.id;
      option(sel, '', '– keine –');
      NIVEAUS.forEach(function (n) { option(sel, n, n); });
      zeile.appendChild(label);
      zeile.appendChild(sel);
      $('sprachenListe').appendChild(zeile);
    });
    $('sprachenHilfe').textContent = 'Gezählt werden Sprachen ab Niveau ' + config.bausteine.mindestNiveau
      + ', höchstens ' + config.bausteine.maxSprachen + '.';
    var zusatz = (config.zusatzbausteine || []).filter(function (z) { return z.nurKader !== true && z.nurNichtKader !== true; });
    function zusatzFuellen() {
      var gewaehlt = {};
      Array.prototype.forEach.call(doc.getElementsByName('zusatz'), function (cb) { if (cb.checked) { gewaehlt[cb.value] = true; } });
      leeren($('zusatzListe'));
      var abt = $('abteilung').value;
      var sichtbar = zusatz.filter(function (z) { return !Array.isArray(z.nurAbteilungen) || z.nurAbteilungen.indexOf(abt) >= 0; });
      sichtbar.forEach(function (z) {
        var label = el('label', 'inline');
        var cb = doc.createElement('input');
        cb.type = 'checkbox';
        cb.value = z.id;
        cb.name = 'zusatz';
        cb.checked = gewaehlt[z.id] === true;
        label.appendChild(cb);
        label.appendChild(doc.createTextNode(' ' + z.label + ' (CHF ' + chf(z.betrag) + (z.art === 'entschaedigung' ? ', Entschädigung' : '') + (z.anteilig ? ', bei Teilzeit anteilig' : '') + ')'));
        $('zusatzListe').appendChild(label);
      });
      $('zusatzWrap').hidden = sichtbar.length === 0;
    }

    $('reduktionProzent').value = config.betrieb.einarbeitungMaxProzent;
    $('reduktionProzent').max = config.betrieb.einarbeitungMaxProzent;

    function funktionenFuellen() {
      var sel = $('funktion');
      var alt = sel.value;
      leeren(sel);
      option(sel, '', '– bitte wählen –');
      var ids = [];
      config.funktionen.forEach(function (f) {
        if (f.abteilung === $('abteilung').value) {
          ids.push(f.id);
          option(sel, f.id, f.label);
        }
      });
      sel.value = waehleOption(ids, alt);
      if (sel.selectedIndex < 0) { sel.selectedIndex = 0; }
    }
    function aktuellerAbschluss() {
      return config.abschluesse.filter(function (a) { return a.id === $('abschluss').value; })[0] || null;
    }
    function aktuelleFunktion() {
      return config.funktionen.filter(function (f) { return f.id === $('funktion').value; })[0] || null;
    }

    function lies() {
      var f = aktuelleFunktion();
      var sprachen = {};
      if (f && f.gaestekontakt) {
        sprachCodes.forEach(function (c) { sprachen[c] = $('sprache-' + c).value; });
      }
      var ids = [];
      Array.prototype.forEach.call(doc.getElementsByName('zusatz'), function (cb) { if (cb.checked) { ids.push(cb.value); } });
      return {
        funktionId: $('funktion').value, abschluss: $('abschluss').value,
        weiterbildung6Tage: !!(aktuellerAbschluss() && aktuellerAbschluss().stufe === 'IIIa') && $('weiterbildung6Tage').checked,
        stufeManuell: $('stufeManuell').value,
        erfahrung: $('erfahrung').value, sprachen: sprachen,
        beschaeftigungsgrad: $('beschaeftigungsgrad').value, vertragsart: $('vertragsart').value,
        eintritt: $('eintritt').value, sonderfall: $('sonderfall').value, zusatzIds: ids,
        einarbeitung: { aktiv: $('einarbeitungAktiv').checked, frueherMonate: $('frueherMonate').value,
          unterbruchMonate: $('unterbruchMonate').value, reduktionProzent: $('reduktionProzent').value }
      };
    }

    function meldung(art, praefix, texte) {
      var box = el('div', 'meldung ' + art);
      box.appendChild(el('strong', null, praefix));
      if (texte.length === 1) {
        box.appendChild(doc.createTextNode(' ' + texte[0]));
      } else {
        var ul = el('ul');
        texte.forEach(function (t) { ul.appendChild(el('li', null, t)); });
        box.appendChild(ul);
      }
      return box;
    }
    function zeile(tabelle, label, wert, klasse) {
      var tr = el('tr', klasse);
      tr.appendChild(el('td', null, label));
      tr.appendChild(el('td', 'zahl', wert));
      tabelle.appendChild(tr);
    }

    // Zeilen des Stufenvergleichs in einen Container schreiben (Marker im Text, nicht nur Farbe).
    function zeigeStufenzeilen(ziel, sv) {
      baueStufenvergleichZeilen(sv, config).forEach(function (z) {
        ziel.appendChild(el('p', 'stufenzeile ' + z.art, z.text));
      });
    }
    // Stufenvergleich für einen gewählten Vollzeitlohn, mit der Tabelle, die für den Vorschlag galt.
    function stufenvergleichFuer(e, wert) {
      if (!e || e.modus !== 'berechnet' || !isFinite(wert)) { return null; }
      var tab = window.LohnEngine.findeMindestlohnTabelle(config, $('eintritt').value, $('vertragsart').value).tabelle;
      return window.LohnEngine.pruefeStufenvergleich(config, tab, e.stufe, wert);
    }

    function renderErgebnis(e, kontext) {
      var out = $('ergebnisInhalt');
      leeren(out);
      var wahl = $('wahlBereich');
      wahl.hidden = e.modus !== 'berechnet';
      if (e.fehler.length) { out.appendChild(meldung('fehler', 'Fehler:', e.fehler)); }
      e.warnungen.forEach(function (w) { out.appendChild(meldung('warnung', 'Warnung:', [w.text])); });
      if (e.modus === 'hinweis') { return; }
      if (e.modus !== 'berechnet') { return; }

      var kopf = el('p', 'vorschlag', 'CHF ' + chf(e.vorschlag) + ' ');
      kopf.appendChild(el('small', null, 'Vollzeit, Vorschlag pro Monat'));
      out.appendChild(kopf);
      out.appendChild(el('p', 'hilfe', Cfg.stufeMitErklaerung(config, e.stufe)
        + ', Mindestlohn CHF ' + chf(e.mindestlohn) + ' (Tabelle ' + e.tabelleJahr + ')'
        + (e.band ? ', Lohnband ' + (e.band.art === 'kader' ? '(Kader) ' : '') + 'CHF ' + chf(e.band.min) + ' bis ' + chf(e.band.max) : '')));
      zeigeStufenzeilen(out, e.stufenvergleich);

      if (e.spanneStufen) {
        out.appendChild(el('h3', null, 'Erlaubter Spielraum (nur HR)'));
        var t = el('table');
        var th = el('tr');
        ['Freigabe durch', 'von', 'bis'].forEach(function (x, i) { th.appendChild(el('th', i ? 'zahl' : null, x)); });
        t.appendChild(th);
        [['vorgesetzte', 'Vorgesetzte'], ['hr', 'HR'], ['gm', 'GM']].forEach(function (s) {
          var r = e.spanneStufen[s[0]];
          var tr = el('tr');
          tr.appendChild(el('td', null, s[1]));
          tr.appendChild(el('td', 'zahl', chf(r.min)));
          tr.appendChild(el('td', 'zahl', chf(r.max)));
          t.appendChild(tr);
        });
        out.appendChild(t);
        out.appendChild(el('p', 'hilfe', 'Die Bereiche gelten kumulativ; ausserhalb des GM-Bereichs ist der Lohn nicht zulässig.'));
        var grafik = el('div', 'spielraum-grafik');
        grafik.id = 'spielraumGrafik';
        out.appendChild(grafik);
      }

      out.appendChild(el('h3', null, 'Auszahlung pro Monat'));
      var az = el('table', 'auszahlung');
      var azHinweis = [];
      baueAuszahlungZeilen(e, config, kontext).forEach(function (r) {
        if (r.art === 'hinweis') { azHinweis.push(r.label); return; }
        zeile(az, r.label, chf(r.betrag), r.art === 'summe' || r.art === 'dreizehnter' ? r.art : null);
      });
      out.appendChild(az);
      azHinweis.forEach(function (t) { out.appendChild(el('p', 'hilfe', t)); });
      out.appendChild(el('p', 'stundenansatz', 'Stundenansatz (Vollzeitbasis, ' + String(config.betrieb.wochenstunden).replace('.', ',') + ' Wochenstunden, ohne 13. Monatslohn): CHF ' + chf(e.stundenansatz)));

      out.appendChild(el('h3', null, 'Rechenweg'));
      var rw = el('table');
      e.positionen.forEach(function (p) { zeile(rw, p.label, chf(p.betrag)); });
      zeile(rw, 'Vorschlag Vollzeit (höchstens bis Bandende der Funktion)', chf(e.vorschlag), 'summe');
      out.appendChild(rw);

      if (e.entschaedigungen.length) {
        out.appendChild(el('h3', null, 'Entschädigungen (nicht im Bruttolohn)'));
        var et = el('table');
        e.entschaedigungen.forEach(function (x) { zeile(et, x.label, chf(x.betrag)); });
        out.appendChild(et);
      }

      if (e.einarbeitung) {
        out.appendChild(el('h3', null, 'Einarbeitungsreduktion'));
        var ein = e.einarbeitung;
        if (ein.erlaubt) {
          out.appendChild(meldung('info', 'Hinweis:', [ein.grund]));
          var et2 = el('table');
          zeile(et2, 'Reduziert um ' + prozent(ein.reduktionProzent) + ' während bis zu ' + ein.maxMonate + ' Monaten: Monatslohn', chf(ein.reduzierterMonatslohn));
          if (ein.reduzierteUeberstundenpauschale !== null && ein.reduzierteUeberstundenpauschale !== undefined) {
            zeile(et2, 'Überstundenpauschale auf reduziertem Grundlohn', chf(ein.reduzierteUeberstundenpauschale));
          }
          zeile(et2, 'Total pro Monat mit 13. Monatslohn', chf(ein.reduzierterTotal));
          zeile(et2, 'Voller Lohn ab', datumDe(ein.volllohnAb));
          out.appendChild(et2);
        } else {
          out.appendChild(meldung('warnung', 'Keine Reduktion möglich:', [ein.grund]));
        }
      }
    }

    var manuell = false;
    var letzterVorschlag = null;
    var letztesErgebnis = null;

    // Spielraum-Grafik mit dem aktuell gewählten Lohn neu zeichnen (Container entsteht in renderErgebnis).
    function zeichneGrafik() {
      var ziel = $('spielraumGrafik');
      if (!ziel || !window.LohnGrafik) { return; }
      var roh = String($('gewaehlterLohn').value).trim();
      var wert = roh === '' ? null : Number(roh);
      window.LohnGrafik.renderGrafik(window.LohnGrafik.baueGrafikModell(letztesErgebnis, wert), ziel);
    }

    // Abrechnung mit dem gewählten Lohn unter dem Feld; leer bei ungültiger oder unzulässiger Wahl.
    function zeigeWahlAbrechnung(wert) {
      var box = $('wahlAbrechnung');
      leeren(box);
      var a = baueWahlAbrechnung(config, letztesErgebnis, wert, { beschaeftigungsgrad: $('beschaeftigungsgrad').value });
      box.hidden = !a;
      if (!a) { return; }
      box.appendChild(el('h4', null, a.titel));
      if (a.differenz) { box.appendChild(el('p', 'differenz', formatDifferenz(a.differenz))); }
      var t = el('table', 'auszahlung');
      a.zeilen.forEach(function (r) { zeile(t, r.label, r.betrag === null ? '' : chf(r.betrag), r.art === 'summe' || r.art === 'dreizehnter' || r.art === 'kopf' ? r.art : null); });
      box.appendChild(t);
    }

    // Freigabestufe live anzeigen und Exportknopf nur bei gültiger Wahl freigeben.
    function pruefeWahl() {
      zeichneGrafik();
      var zeile = $('freigabeZeile');
      var knopf = $('exportKnopf');
      var svBox = $('stufenvergleichWahl');
      leeren(svBox);
      zeigeWahlAbrechnung(NaN);
      if (!letztesErgebnis || letztesErgebnis.modus !== 'berechnet') {
        zeile.textContent = '';
        knopf.disabled = true;
        $('exportHinweis').textContent = '';
        return;
      }
      var roh = String($('gewaehlterLohn').value).trim();
      var wert = roh === '' ? NaN : Number(roh);
      var p = window.LohnEngine.pruefeAbweichung(letztesErgebnis, wert, $('begruendung').value);
      zeigeStufenzeilen(svBox, stufenvergleichFuer(letztesErgebnis, wert));
      if (p.freigabe) {
        zeile.textContent = 'Freigabe durch: ' + (p.freigabe === 'keine' ? 'keine nötig (Vorschlag)' : p.freigabe);
      } else {
        zeile.textContent = p.fehler.join(' ');
      }
      zeigeWahlAbrechnung(p.freigabe ? wert : NaN);
      knopf.disabled = !p.ok;
      $('exportHinweis').textContent = p.ok ? '' : p.fehler.join(' ');
    }

    function exportieren() {
      if (!letztesErgebnis) { return; }
      var wert = Number($('gewaehlterLohn').value);
      var p = window.LohnEngine.pruefeAbweichung(letztesErgebnis, wert, $('begruendung').value);
      if (!p.ok) { pruefeWahl(); return; }
      var vertrag = VERTRAGSARTEN.filter(function (v) { return v[0] === $('vertragsart').value; })[0];
      var f = aktuelleFunktion();
      var svExport = stufenvergleichFuer(letztesErgebnis, wert);
      var zeilen = window.LohnExport.baueExportZeilen(letztesErgebnis, {
        funktionLabel: f ? f.label : '', funktionsbereich: bereichLabel(config, f),
        anerkennung: baueAnerkennungsZeile(config, $('abschluss').value, $('funktion').value, letztesErgebnis,
          { stufeManuell: $('stufeManuell').value, sonderfall: $('sonderfall').value }).text,
        abschlussLabel: abschlussLabel(), eintritt: $('eintritt').value, vertragsart: vertrag ? vertrag[1] : '',
        beschaeftigungsgrad: $('beschaeftigungsgrad').value, dreizehnterProzent: config.betrieb.dreizehnterProzent,
        betraege: window.LohnEngine.rechneBetraege(config, wert, {
          beschaeftigungsgrad: Number($('beschaeftigungsgrad').value),
          einarbeitung: letztesErgebnis.einarbeitung,
          kader: !!letztesErgebnis.kader
        }),
        stufenvergleich: svExport,
        stufeText: Cfg.stufeMitErklaerung(config, letztesErgebnis.stufe),
        naechsteStufeText: svExport ? Cfg.stufeMitErklaerung(config, svExport.naechsteStufe) : '',
        gewaehlterMonatslohn: wert, begruendung: $('begruendung').value.trim(), freigabe: p.freigabe,
        datum: new Date().toISOString().slice(0, 10)
      });
      var name = 'Einstiegslohn_' + (f ? f.id : 'Lohn') + '_' + $('eintritt').value + '.xlsx';
      var r = window.LohnExport.exportiereExcel(zeilen, name);
      $('exportHinweis').textContent = r.ok ? 'Excel-Datei wurde erstellt.' : r.meldung;
    }
    function abschlussLabel() {
      var a = aktuellerAbschluss();
      return a ? a.label : ($('abschluss').value === 'keiner' ? 'Kein Abschluss' : '');
    }
    function wahlLeeren() {
      $('gewaehlterLohn').value = '';
      manuell = false;
      letzterVorschlag = null;
    }

    var MARKER = { ok: '✓ ', warnung: '! ', offen: '… ' };
    function zeigeAnerkennung() {
      var z = baueAnerkennungsZeile(config, $('abschluss').value, $('funktion').value, letztesErgebnis,
        { stufeManuell: $('stufeManuell').value, sonderfall: $('sonderfall').value });
      $('hfWrap').hidden = !zeigeStufeManuell(config, $('abschluss').value, letztesErgebnis, $('stufeManuell').value);
      var box = $('anerkennung');
      box.className = 'anerkennung ' + z.art;
      box.textContent = MARKER[z.art] + z.text;
    }
    var letzterSchluessel = null;
    function aktualisieren() {
      var f = aktuelleFunktion();
      var abschluss = $('abschluss').value;
      var sonder = $('sonderfall').value;
      var schluessel = { abschluss: abschluss, funktionId: $('funktion').value };
      if (!stufeManuellBleibt(letzterSchluessel, schluessel)) { $('stufeManuell').value = ''; }
      letzterSchluessel = schluessel;
      $('wbWrap').hidden = !(aktuellerAbschluss() && aktuellerAbschluss().stufe === 'IIIa');
      $('funktionsbereich').textContent = funktionsbereichText(config, f);
      $('sprachenWrap').hidden = !(f && f.gaestekontakt);
      $('einarbeitungFelder').hidden = !$('einarbeitungAktiv').checked;

      var out = $('ergebnisInhalt');
      var fehlt = [];
      if (!$('funktion').value) { fehlt.push('Funktion'); }
      if (!abschluss && sonder === 'keiner') { fehlt.push('Abschluss'); }
      if (!$('eintritt').value) { fehlt.push('Eintrittsdatum'); }
      if (fehlt.length) {
        leeren(out);
        out.appendChild(el('p', 'leer', 'Noch kein Ergebnis. Bitte angeben: ' + fehlt.join(', ') + '.'));
        $('wahlBereich').hidden = true;
        wahlLeeren();
        letztesErgebnis = null;
        zeigeAnerkennung();
        pruefeWahl();
        return;
      }
      var ergebnis = window.LohnEngine.berechne(config, formularZuInput(lies()));
      letztesErgebnis = ergebnis;
      zeigeAnerkennung();
      renderErgebnis(ergebnis, { beschaeftigungsgrad: $('beschaeftigungsgrad').value });
      if (ergebnis.modus === 'berechnet') {
        if (ergebnis.vorschlag !== letzterVorschlag || !manuell) {
          $('gewaehlterLohn').value = ergebnis.vorschlag.toFixed(2);
          manuell = false;
        }
        letzterVorschlag = ergebnis.vorschlag;
      } else {
        wahlLeeren();
      }
      pruefeWahl();
    }

    $('gewaehlterLohn').addEventListener('input', function () { manuell = true; });
    $('exportKnopf').addEventListener('click', exportieren);
    $('gewaehlterLohn').addEventListener('input', pruefeWahl);
    $('begruendung').addEventListener('input', pruefeWahl);
    $('abteilung').addEventListener('change', function () { funktionenFuellen(); zusatzFuellen(); });
    $('formular').addEventListener('input', aktualisieren);
    $('formular').addEventListener('change', aktualisieren);
    funktionenFuellen();
    zusatzFuellen();
    aktualisieren();
    window.renderErgebnis = renderErgebnis;
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    start();
  }

  return { baueStufeManuellOptionen: baueStufeManuellOptionen, formularZuInput: formularZuInput, waehleOption: waehleOption, baueSprachZeilen: baueSprachZeilen, baueAbschlussGruppen: baueAbschlussGruppen, funktionsbereichText: funktionsbereichText, bereichLabel: bereichLabel, baueAnerkennungsZeile: baueAnerkennungsZeile, zeigeBaenderHinweis: zeigeBaenderHinweis, zeigeStufeManuell: zeigeStufeManuell, stufeManuellBleibt: stufeManuellBleibt, baueAuszahlungZeilen: baueAuszahlungZeilen, baueWahlAbrechnung: baueWahlAbrechnung, formatDifferenz: formatDifferenz, baueStufenvergleichZeilen: baueStufenvergleichZeilen };
}));
