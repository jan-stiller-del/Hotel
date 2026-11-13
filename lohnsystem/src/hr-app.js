(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LohnHrApp = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var ABSCHLUESSE = [
    ['keiner', 'Kein Abschluss (Stufe Ia)'],
    ['progresso', 'Progresso (Stufe Ib)'],
    ['eba', 'EBA (Stufe II)'],
    ['efz', 'EFZ (Stufe IIIa)'],
    ['berufspruefung', 'Berufsprüfung / Fachausweis (Stufe IV)'],
    ['hf', 'Höhere Fachschule (Stufe von Hand wählen)']
  ];
  var SONDERFAELLE = [
    ['keiner', 'Kein Sonderfall'],
    ['praktikum', 'Praktikum'],
    ['unter18', 'Unter 18 Jahre'],
    ['vollzeitstudium', 'Vollzeitstudium'],
    ['wiedereingliederung', 'Wiedereingliederung']
  ];
  var VERTRAGSARTEN = [['unbefristet', 'Jahresstelle (unbefristet)'], ['saison', 'Saisonstelle']];
  var STUFEN_HF = ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV'];
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

    // Dropdowns aus der Konfiguration füllen
    config.abteilungen.forEach(function (a) { option($('abteilung'), a.id, a.label); });
    option($('abschluss'), '', '– bitte wählen –');
    ABSCHLUESSE.forEach(function (a) { option($('abschluss'), a[0], a[1]); });
    SONDERFAELLE.forEach(function (a) { option($('sonderfall'), a[0], a[1]); });
    VERTRAGSARTEN.forEach(function (a) { option($('vertragsart'), a[0], a[1]); });
    option($('stufeManuell'), '', '– bitte wählen –');
    STUFEN_HF.forEach(function (s) { option($('stufeManuell'), s, config.stufen[s] ? config.stufen[s].label : s); });
    for (var h = 0; h <= config.betrieb.maxErfahrungsjahre; h++) {
      option($('erfahrung'), String(h), h + (h === 1 ? ' Jahr' : ' Jahre'));
    }
    var sprachCodes = (config.bausteine && config.bausteine.sprachen) || [];
    sprachCodes.forEach(function (code) {
      var zeile = el('div', 'sprache');
      var label = el('label', null, SPRACHNAMEN[code] || code);
      label.htmlFor = 'sprache-' + code;
      var sel = el('select');
      sel.id = 'sprache-' + code;
      option(sel, '', '– keine –');
      NIVEAUS.forEach(function (n) { option(sel, n, n); });
      zeile.appendChild(label);
      zeile.appendChild(sel);
      $('sprachenListe').appendChild(zeile);
    });
    $('sprachenHilfe').textContent = 'Gezählt werden Sprachen ab Niveau ' + config.bausteine.mindestNiveau
      + ', höchstens ' + config.bausteine.maxSprachen + '.';
    var zusatz = config.zusatzbausteine || [];
    $('zusatzWrap').hidden = zusatz.length === 0;
    zusatz.forEach(function (z) {
      var label = el('label', 'inline');
      var cb = doc.createElement('input');
      cb.type = 'checkbox';
      cb.value = z.id;
      cb.name = 'zusatz';
      label.appendChild(cb);
      label.appendChild(doc.createTextNode(' ' + z.label + ' (CHF ' + chf(z.betrag) + (z.art === 'entschaedigung' ? ', Entschädigung' : '') + ')'));
      $('zusatzListe').appendChild(label);
    });
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
          option(sel, f.id, f.label + (f.beispiel ? ' (Beispiel)' : ''));
        }
      });
      sel.value = waehleOption(ids, alt);
      if (sel.selectedIndex < 0) { sel.selectedIndex = 0; }
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
        weiterbildung6Tage: $('abschluss').value === 'efz' && $('weiterbildung6Tage').checked,
        stufeManuell: $('abschluss').value === 'hf' ? $('stufeManuell').value : '',
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
      out.appendChild(el('p', 'hilfe', 'Stufe ' + (e.stufe === 'P' ? 'Praktikum' : e.stufe)
        + ', Mindestlohn CHF ' + chf(e.mindestlohn) + ' (Tabelle ' + e.tabelleJahr + ')'
        + (e.bandStart !== null ? ', Lohnband CHF ' + chf(e.bandStart) + ' bis ' + chf(e.bandMax) : '')));

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

      out.appendChild(el('h3', null, 'Rechenweg'));
      var rw = el('table');
      e.positionen.forEach(function (p) { zeile(rw, p.label, chf(p.betrag)); });
      zeile(rw, 'Vorschlag Vollzeit (begrenzt auf das Lohnband)', chf(e.vorschlag), 'summe');
      var grad = Number(kontext.beschaeftigungsgrad);
      zeile(rw, 'Monatslohn bei ' + String(grad).replace('.', ',') + ' %', chf(e.monatslohn));
      zeile(rw, '13. Monatslohn (' + prozent(config.betrieb.dreizehnterProzent) + ')', chf(e.dreizehnter));
      zeile(rw, 'Total pro Monat', chf(e.totalMonat), 'summe');
      zeile(rw, 'Jahresbrutto', chf(e.jahresbrutto));
      zeile(rw, 'Stundenansatz (Vollzeitbasis, ' + String(config.betrieb.wochenstunden).replace('.', ',') + ' Wochenstunden)', chf(e.stundenansatz));
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

    // Freigabestufe live anzeigen und Exportknopf nur bei gültiger Wahl freigeben.
    function pruefeWahl() {
      zeichneGrafik();
      var zeile = $('freigabeZeile');
      var knopf = $('exportKnopf');
      if (!letztesErgebnis || letztesErgebnis.modus !== 'berechnet') {
        zeile.textContent = '';
        knopf.disabled = true;
        $('exportHinweis').textContent = '';
        return;
      }
      var roh = String($('gewaehlterLohn').value).trim();
      var wert = roh === '' ? NaN : Number(roh);
      var p = window.LohnEngine.pruefeAbweichung(letztesErgebnis, wert, $('begruendung').value);
      if (p.freigabe) {
        zeile.textContent = 'Freigabe durch: ' + (p.freigabe === 'keine' ? 'keine nötig (Vorschlag)' : p.freigabe);
      } else {
        zeile.textContent = p.fehler.join(' ');
      }
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
      var zeilen = window.LohnExport.baueExportZeilen(letztesErgebnis, {
        funktionLabel: f ? f.label : '', eintritt: $('eintritt').value, vertragsart: vertrag ? vertrag[1] : '',
        beschaeftigungsgrad: $('beschaeftigungsgrad').value,
        betraege: window.LohnEngine.rechneBetraege(config, wert, {
          beschaeftigungsgrad: Number($('beschaeftigungsgrad').value),
          einarbeitung: letztesErgebnis.einarbeitung
        }),
        gewaehlterMonatslohn: wert, begruendung: $('begruendung').value.trim(), freigabe: p.freigabe,
        datum: new Date().toISOString().slice(0, 10)
      });
      var name = 'Einstiegslohn_' + (f ? f.id : 'Lohn') + '_' + $('eintritt').value + '.xlsx';
      var r = window.LohnExport.exportiereExcel(zeilen, name);
      $('exportHinweis').textContent = r.ok ? 'Excel-Datei wurde erstellt.' : r.meldung;
    }
    function wahlLeeren() {
      $('gewaehlterLohn').value = '';
      manuell = false;
      letzterVorschlag = null;
    }

    function aktualisieren() {
      var f = aktuelleFunktion();
      var abschluss = $('abschluss').value;
      var sonder = $('sonderfall').value;
      $('wbWrap').hidden = abschluss !== 'efz';
      $('hfWrap').hidden = abschluss !== 'hf';
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
        pruefeWahl();
        return;
      }
      var ergebnis = window.LohnEngine.berechne(config, formularZuInput(lies()));
      letztesErgebnis = ergebnis;
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
    $('abteilung').addEventListener('change', funktionenFuellen);
    $('formular').addEventListener('input', aktualisieren);
    $('formular').addEventListener('change', aktualisieren);
    funktionenFuellen();
    aktualisieren();
    window.renderErgebnis = renderErgebnis;
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    start();
  }

  return { formularZuInput: formularZuInput, waehleOption: waehleOption };
}));
