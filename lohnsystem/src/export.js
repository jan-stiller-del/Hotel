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
  function prozentText(x) { return String(x).replace('.', ','); }

  // Reine Funktion: Zeilen [Bezeichnung, Wert]; Geldbeträge bleiben Zahlen.
  function baueExportZeilen(e, k) {
    var z = [];
    function add(label, wert) { z.push([label, wert === undefined || wert === null ? '' : wert]); }
    add('Einstiegslohn Hotel Waldhaus Flims', 'Erstellt am ' + datumDe(k.datum));
    add('Funktion', k.funktionLabel);
    add('Eintrittsdatum', datumDe(k.eintritt));
    add('Vertragsart', k.vertragsart);
    add('Stufe', e.stufe === 'P' ? 'Praktikum' : e.stufe);
    add('Mindestlohn (Tabelle ' + e.tabelleJahr + ')', e.mindestlohn);
    e.positionen.forEach(function (p) { add(p.label, p.betrag); });
    add('Vorschlag Vollzeit pro Monat', e.vorschlag);
    if (e.spanneStufen) {
      [['vorgesetzte', 'Vorgesetzte'], ['hr', 'HR'], ['gm', 'GM']].forEach(function (s) {
        var r = e.spanneStufen[s[0]];
        add('Spielraum ' + s[1] + ' (von bis, Vollzeit)', r.min + ' bis ' + r.max);
      });
    }
    add('Gewählter Vollzeit-Monatslohn', k.gewaehlterMonatslohn);
    add('Freigabe durch', k.freigabe === 'keine' ? 'keine (Vorschlag übernommen)' : k.freigabe);
    add('Begründung', k.begruendung || '');
    add('Monatslohn bei ' + prozentText(k.beschaeftigungsgrad) + ' % (auf Basis Vorschlag)', e.monatslohn);
    add('13. Monatslohn', e.dreizehnter);
    add('Total pro Monat', e.totalMonat);
    add('Jahresbrutto', e.jahresbrutto);
    add('Stundenansatz (Vollzeitbasis)', e.stundenansatz);
    if (e.entschaedigungen.length) {
      add('Entschädigungen', 'nicht Teil des Bruttolohns');
      e.entschaedigungen.forEach(function (x) { add(x.label, x.betrag); });
    }
    if (e.einarbeitung) {
      var ein = e.einarbeitung;
      if (ein.erlaubt) {
        add('Einarbeitung reduziert um ' + prozentText(ein.reduktionProzent) + ' % (Monatslohn Vollzeit-Basis)', ein.reduzierterMonatslohn);
        add('Einarbeitung reduziert, Total pro Monat', ein.reduzierterTotal);
        add('Voller Lohn ab', datumDe(ein.volllohnAb));
      } else {
        add('Einarbeitung', 'Keine Reduktion möglich: ' + ein.grund);
      }
    }
    e.warnungen.forEach(function (w) { add('Warnung', w.text); });
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
