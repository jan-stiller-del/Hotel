(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LohnExport = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function datumDe(iso) {
    return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';
  }
  // Diese Warnungen stehen im Export als «Einstufungshinweis», nicht als «Warnung».
  var EINSTUFUNG_CODES = ['abschluss_nicht_anerkannt', 'bereich_ungeregelt', 'stufe_manuell'];

  function prozentText(x) { return String(x).replace('.', ','); }

  // Reine Funktion: Zeilen [Bezeichnung, Wert]; Geldbeträge bleiben Zahlen.
  function baueExportZeilen(e, k) {
    var z = [];
    function add(label, wert) { z.push([label, wert === undefined || wert === null ? '' : wert]); }
    add('Einstiegslohn Hotel Waldhaus Flims', 'Erstellt am ' + datumDe(k.datum));
    add('Gelernter Beruf / Abschluss', k.abschlussLabel);
    add('Funktion im Waldhaus', k.funktionLabel);
    add('Funktionsbereich', k.funktionsbereich);
    if (k.anerkennung) { add('Anerkennung', k.anerkennung); }
    add('Eintrittsdatum', datumDe(k.eintritt));
    add('Vertragsart', k.vertragsart);
    add('Stufe', k.stufeText || (e.stufe === 'P' ? 'Praktikum' : e.stufe));
    var hinweise = e.warnungen.filter(function (w) { return EINSTUFUNG_CODES.indexOf(w.code) >= 0; });
    if (hinweise.length) { add('Einstufungshinweis', hinweise.map(function (w) { return w.text; }).join(' ')); }
    add('Mindestlohn (Tabelle ' + e.tabelleJahr + ')', e.mindestlohn);
    if (e.funktionsband) { add('Lohnband der Funktion (von bis)', e.funktionsband.min + ' bis ' + e.funktionsband.max); }
    e.positionen.forEach(function (p) { add(p.label, p.betrag); });
    add('Vorschlag Vollzeit pro Monat', e.vorschlag);
    if (e.spanneStufen) {
      [['vorgesetzte', 'Vorgesetzte'], ['hr', 'HR'], ['gm', 'GM']].forEach(function (s) {
        var r = e.spanneStufen[s[0]];
        add('Spielraum ' + s[1] + ' (von bis, Vollzeit)', r.min + ' bis ' + r.max);
      });
    }
    add('Gewählter Vollzeit-Monatslohn', k.gewaehlterMonatslohn);
    var sv = k.stufenvergleich;
    if (sv) {
      add('Mindestlohn der Stufe', sv.mindestlohn);
      add('Lohn über Stufen-Mindestlohn', (sv.ueberStufe < 0 ? '-' : '') + 'CHF ' + Math.abs(sv.ueberStufe).toFixed(2) + ' (' + prozentText(sv.ueberStufeProzent.toFixed(1)) + ' %)');
      add('Nächsthöhere Stufe übersprungen', sv.uebersprungen ? 'ja (' + (k.naechsteStufeText || sv.naechsteStufe) + ', CHF ' + sv.mindestlohnNaechste.toFixed(2) + ')' : 'nein');
    }
    add('Freigabe durch', k.freigabe === 'keine' ? 'keine (Vorschlag übernommen)' : k.freigabe);
    add('Begründung', k.begruendung || '');
    var b = k.betraege;
    // Eigener Block: der 13. Monatslohn steht nie im Rechenweg, sondern hier als eigene, benannte Zeile.
    add('Auszahlung pro Monat', '');
    var kader = b.ueberstundenpauschale !== null && b.ueberstundenpauschale !== undefined && !!b.bezeichnungen;
    add(kader ? b.bezeichnungen.grundlohn : 'Monatslohn brutto ' + (Number(k.beschaeftigungsgrad) === 100 ? '(Vollzeit)' : 'bei ' + prozentText(k.beschaeftigungsgrad) + ' %'), b.monatslohn);
    if (kader) { add(b.bezeichnungen.pauschale, b.ueberstundenpauschale); }
    add(kader ? b.bezeichnungen.dreizehnter : '13. Monatslohn (' + prozentText(k.dreizehnterProzent) + ' %), monatlich ausbezahlt, separat ausgewiesen', b.dreizehnter);
    add('Total pro Monat', b.totalMonat);
    add('Jahresbrutto', b.jahresbrutto);
    add('Hinweis', 'Der Mindestlohnvergleich erfolgt ohne 13. Monatslohn.');
    add('Stundenansatz (Vollzeitbasis)', b.stundenansatz);
    if (e.entschaedigungen.length) {
      add('Entschädigungen', 'nicht Teil des Bruttolohns');
      e.entschaedigungen.forEach(function (x) { add(x.label, x.betrag); });
      add('Brutto pro Monat gesamt (Total plus Zulagen)', Math.round((b.totalMonat + e.entschaedigungen.reduce(function (s, x) { return s + x.betrag; }, 0)) * 100) / 100);
    }
    if (e.einarbeitung) {
      var ein = e.einarbeitung;
      if (ein.erlaubt) {
        add('Einarbeitung reduziert um ' + prozentText(ein.reduktionProzent) + ' % (Monatslohn)', b.reduzierterMonatslohn);
        if (b.reduzierteUeberstundenpauschale !== null && b.reduzierteUeberstundenpauschale !== undefined) {
          add('Einarbeitung reduziert, Überstundenpauschale (auf reduziertem Grundlohn)', b.reduzierteUeberstundenpauschale);
        }
        add('Einarbeitung reduziert, Total pro Monat', b.reduzierterTotal);
        add('Voller Lohn ab', datumDe(ein.volllohnAb));
      } else {
        add('Einarbeitung', 'Keine Reduktion möglich: ' + ein.grund);
      }
    }
    e.warnungen.forEach(function (w) {
      if (EINSTUFUNG_CODES.indexOf(w.code) < 0) { add('Warnung', w.text); }
    });
    return z;
  }

  // Löst den Download aus; gibt {ok, meldung} zurück statt zu werfen.
  function exportiereExcel(zeilen, dateiname) {
    var X = (typeof XLSX !== 'undefined') ? XLSX : null;
    if (!X || !X.utils || !X.writeFile) {
      return { ok: false, meldung: 'Der Excel-Export ist nicht verfügbar: Die Excel-Bibliothek konnte nicht geladen werden (keine Internetverbindung?).' };
    }
    try {
      var ws = X.utils.aoa_to_sheet(zeilen);
      ws['!cols'] = [{ wch: 62 }, { wch: 36 }];
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, 'Lohn');
      X.writeFile(wb, dateiname || 'Einstiegslohn.xlsx');
      return { ok: true, meldung: '' };
    } catch (err) {
      return { ok: false, meldung: 'Der Excel-Export ist fehlgeschlagen.' };
    }
  }

  return { baueExportZeilen: baueExportZeilen, exportiereExcel: exportiereExcel };
}));
