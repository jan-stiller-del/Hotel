(function () {
  'use strict';

  var C = window.LohnConfig;
  var E = window.LohnEditor;
  var SPEICHER_SCHLUESSEL = 'lohnsystem-config-entwurf-v1';
  var SEKTIONEN = ['betrieb', 'mindestloehne', 'stufen', 'baender', 'funktionen', 'bausteine', 'zusatz', 'import'];

  var veroeffentlicht = null; // Stand der Datei config/config.js
  var arbeit = null;          // Arbeitskopie
  var offen = {};             // abgelehnte Eingaben: Schlüssel -> { sektion, texte }
  var importFehler = null;    // Meldung des letzten Imports (sperrt den Export nicht)
  var autospeichern = false;  // erst nach der Entscheidung über einen vorhandenen Entwurf
  var filterAbteilung = '';

  function $(id) { return document.getElementById(id); }

  function kopie(x) { return JSON.parse(JSON.stringify(x)); }

  // Elemente nur mit textContent aufbauen, nie mit innerHTML.
  function el(tag, optionen, kinder) {
    var e = document.createElement(tag);
    var o = optionen || {};
    if (o.text !== undefined) { e.textContent = o.text; }
    if (o.cls) { e.className = o.cls; }
    Object.keys(o.attr || {}).forEach(function (k) { e.setAttribute(k, o.attr[k]); });
    (kinder || []).forEach(function (k) { if (k) { e.appendChild(k); } });
    return e;
  }

  function leeren(e) { while (e.firstChild) { e.removeChild(e.firstChild); } }

  var zaehler = 0;
  function neueId(prefix) { zaehler += 1; return prefix + '-' + zaehler; }

  // Beschriftetes Feld: Label über dem Eingabeelement.
  function feld(text, eingabe, hilfe) {
    var id = neueId('f');
    eingabe.id = id;
    return el('div', { cls: 'feld' }, [el('label', { text: text, attr: { 'for': id } }), eingabe,
      hilfe ? el('p', { text: hilfe, cls: 'hilfe' }) : null]);
  }

  function zahlFeld(wert, schritt) {
    return el('input', { attr: { type: 'number', inputmode: 'decimal', step: schritt || 'any', value: wert === undefined || wert === null ? '' : String(wert) } });
  }

  function textFeld(wert) {
    return el('input', { attr: { type: 'text', value: wert === undefined || wert === null ? '' : String(wert) } });
  }

  function auswahl(optionen, wert) {
    var s = el('select');
    optionen.forEach(function (o) {
      var opt = el('option', { text: o[1], attr: { value: o[0] } });
      if (o[0] === wert) { opt.selected = true; }
      s.appendChild(opt);
    });
    return s;
  }

  function zahl(eingabe) {
    return eingabe.value.trim() === '' ? NaN : Number(eingabe.value);
  }

  // ---- Entwurf im Browser (nur Editor, nie hr.html oder lesen.html) ----

  function speicherLesen() {
    try { return window.localStorage.getItem(SPEICHER_SCHLUESSEL); } catch (e) { return null; }
  }
  function speicherSchreiben(text) {
    try { window.localStorage.setItem(SPEICHER_SCHLUESSEL, text); return true; } catch (e) { return false; }
  }
  function speicherLoeschen() {
    try { window.localStorage.removeItem(SPEICHER_SCHLUESSEL); } catch (e) { /* ohne Speicher weiterarbeiten */ }
  }

  function entwurfAblegen() {
    if (!autospeichern) { return; }
    if (E.unterscheidet(arbeit, veroeffentlicht)) {
      speicherSchreiben(C.serializeConfig(arbeit));
    } else {
      speicherLoeschen();
    }
  }

  // ---- Anzeige von Meldungen, Status, Export ----

  function meldungenZeigen() {
    SEKTIONEN.forEach(function (s) {
      var box = $('meldung-' + s);
      leeren(box);
      var texte = [];
      Object.keys(offen).forEach(function (k) {
        if (offen[k].sektion === s) { offen[k].texte.forEach(function (t) { texte.push(t); }); }
      });
      if (s === 'import' && importFehler) { texte = importFehler.slice(); }
      if (texte.length) {
        var ul = el('ul');
        texte.forEach(function (t) { ul.appendChild(el('li', { text: t })); });
        box.appendChild(ul);
      }
      box.hidden = texte.length === 0;
    });
  }

  function statusZeigen() {
    var p = C.validateConfig(arbeit);
    var box = $('status');
    leeren(box);
    var offenAnzahl = Object.keys(offen).length;
    var kopf;
    if (!p.ok) {
      kopf = 'Die Konfiguration enthält Fehler. Exportieren ist gesperrt.';
    } else if (offenAnzahl) {
      kopf = 'Eine Eingabe wurde abgelehnt und ist noch nicht übernommen. Exportieren ist gesperrt.';
    } else {
      kopf = 'Die Konfiguration ist gültig.' + (p.warnungen.length ? ' Es gibt Warnungen.' : '');
    }
    box.className = 'meldung ' + ((!p.ok || offenAnzahl) ? 'fehler' : (p.warnungen.length ? 'warnung' : 'info'));
    box.appendChild(el('p', { text: kopf, cls: 'status-kopf' }));
    [['Fehler', p.fehler], ['Warnungen', p.warnungen]].forEach(function (g) {
      if (g[1].length) {
        box.appendChild(el('p', { text: g[0] + ':', cls: 'status-titel' }));
        var ul = el('ul');
        g[1].forEach(function (t) { ul.appendChild(el('li', { text: t })); });
        box.appendChild(ul);
      }
    });
    $('exportKnopf').disabled = !p.ok || offenAnzahl > 0;
    $('abweichung').hidden = !E.unterscheidet(arbeit, veroeffentlicht);
  }

  function nachAenderung() {
    entwurfAblegen();
    meldungenZeigen();
    statusZeigen();
  }

  function markieren(eingaben, ungueltig) {
    eingaben.forEach(function (e) {
      if (ungueltig) { e.setAttribute('aria-invalid', 'true'); } else { e.removeAttribute('aria-invalid'); }
    });
  }

  // Änderung an Feldern, die schon auf der Seite stehen: kein Neuaufbau, damit der Fokus bleibt.
  function uebernehmen(schluessel, sektion, ergebnis, eingaben) {
    if (ergebnis.ok) {
      arbeit = ergebnis.config;
      delete offen[schluessel];
      markieren(eingaben, false);
    } else {
      offen[schluessel] = { sektion: sektion, texte: ergebnis.fehler };
      markieren(eingaben, true);
    }
    nachAenderung();
  }

  // Änderung, die Zeilen hinzufügt oder entfernt: Seite neu aufbauen.
  function umbauen(schluessel, sektion, ergebnis) {
    if (ergebnis.ok) {
      arbeit = ergebnis.config;
      offen = {}; // der Neuaufbau setzt alle Felder auf die Arbeitskopie zurück
      importFehler = null;
      alleZeigen();
      return;
    }
    offen[schluessel] = { sektion: sektion, texte: ergebnis.fehler };
    nachAenderung();
  }

  // ---- Betrieb ----

  var BETRIEB_FELDER = [
    ['wochenstunden', 'Wochenstunden (Vollzeit)', '0.5'],
    ['dreizehnterProzent', '13. Monatslohn in Prozent', 'any'],
    ['maxErfahrungsjahre', 'Höchste anrechenbare Erfahrungsjahre', '1'],
    ['einarbeitungMaxProzent', 'Höchste Einarbeitungsreduktion in Prozent', 'any'],
    ['kaderWochenstunden', 'Kader-Wochenstunden', '0.5'],
    ['ueberstundenSatz', 'Überstundensatz (1 = 100 %)', 'any'],
    ['ueberstundenGrenze6750', 'Grenze Überstundenentschädigung (CHF)', 'any'],
  ];
  var BETRIEB_JANEIN = [
    ['dreizehnterInklPauschale', '13. Monatslohn inkl. Pauschale'],
    ['baenderBestaetigt', 'Lohnbänder sind bestätigt (sonst gelten sie als Beispielwerte)'],
  ];

  function betriebZeigen() {
    var ziel = $('betriebFelder');
    leeren(ziel);
    var b = arbeit.betrieb || {};
    var raster = el('div', { cls: 'raster' });
    BETRIEB_FELDER.forEach(function (f) {
      var eingabe = zahlFeld(b[f[0]], f[2]);
      eingabe.addEventListener('change', function () {
        var patch = {};
        patch[f[0]] = zahl(eingabe);
        uebernehmen('betrieb-' + f[0], 'betrieb', E.setzeBetrieb(arbeit, patch), [eingabe]);
      });
      raster.appendChild(feld(f[1], eingabe));
    });
    ziel.appendChild(raster);
    BETRIEB_JANEIN.forEach(function (f) {
      var box = el('input', { attr: { type: 'checkbox' } });
      box.checked = b[f[0]] === true;
      var id = neueId('f');
      box.id = id;
      box.addEventListener('change', function () {
        var patch = {};
        patch[f[0]] = box.checked;
        uebernehmen('betrieb-' + f[0], 'betrieb', E.setzeBetrieb(arbeit, patch), [box]);
      });
      ziel.appendChild(el('div', { cls: 'feld' }, [el('label', { cls: 'inline', attr: { 'for': id } }, [box, document.createTextNode(' ' + f[1])])]));
    });
  }

  // ---- Mindestlöhne und Jahrespflege ----

  function mindestloehneZeigen() {
    var ziel = $('tabellen');
    leeren(ziel);
    var tabellen = (arbeit.mindestloehne || []).slice().sort(function (a, b) { return b.jahr - a.jahr; });
    tabellen.forEach(function (t) {
      var set = el('fieldset', { cls: 'jahr' }, [el('legend', { text: 'Mindestlöhne ' + t.jahr + ' (CHF pro Monat)' })]);
      var raster = el('div', { cls: 'raster' });
      C.STUFEN.forEach(function (s) {
        var eingabe = zahlFeld(t.stufen[s], 'any');
        eingabe.addEventListener('change', function () {
          uebernehmen('ml-' + t.jahr + '-' + s, 'mindestloehne', E.setzeMindestlohn(arbeit, t.jahr, s, zahl(eingabe)), [eingabe]);
        });
        raster.appendChild(feld(C.stufeName(arbeit, s), eingabe));
      });
      set.appendChild(raster);
      var d1 = el('input', { attr: { type: 'date', value: t.gueltigAbJahresbetrieb || '' } });
      var stichtage = function () {
        uebernehmen('stichtag-' + t.jahr, 'mindestloehne', E.setzeStichtage(arbeit, t.jahr, d1.value), [d1]);
      };
      d1.addEventListener('change', stichtage);
      set.appendChild(el('div', { cls: 'raster' }, [feld('Gültig ab (Eintrittsdatum)', d1)]));
      ziel.appendChild(set);
    });
    var letztes = tabellen.length ? tabellen[0].jahr : new Date().getFullYear();
    $('neuesJahr').value = String(letztes + 1);
  }

  function neuesJahrAnlegen(ev) {
    ev.preventDefault();
    var jahr = zahl($('neuesJahr'));
    var prozent = zahl($('teuerung'));
    umbauen('neues-jahr', 'mindestloehne', E.neueJahrestabelle(arbeit, jahr, prozent));
  }

  // ---- Stufen ----

  function stufenZeigen() {
    var ziel = $('stufenListe');
    leeren(ziel);
    C.STUFEN.forEach(function (s) {
      var k = (arbeit.stufen || {})[s] || {};
      var set = el('fieldset', { cls: 'stufe' }, [el('legend', { text: C.stufeName(arbeit, s) })]);
      var erkl = textFeld(k.erklaerung);
      set.appendChild(feld('Erklärung', erkl));
      var eingaben = [erkl];
      var felder = null;
      if (s !== 'P') {
        var sp = k.spielraum || {};
        var v = zahlFeld(sp.vorgesetzte, 'any');
        var h = zahlFeld(sp.hr, 'any');
        var g = zahlFeld(sp.gm, 'any');
        felder = [v, h, g];
        eingaben = eingaben.concat(felder);
        var gruppe = el('div', { cls: 'spielraum-gruppe', attr: { role: 'group', 'aria-labelledby': '' } });
        var titelId = neueId('t');
        gruppe.setAttribute('aria-labelledby', titelId);
        gruppe.appendChild(el('p', { text: 'Vorgesetzte / HR / GM, kumulativ in % vom Vorschlag', cls: 'feldname', attr: { id: titelId } }));
        gruppe.appendChild(el('div', { cls: 'raster raster-3' }, [feld('Vorgesetzte (%)', v), feld('HR (%)', h), feld('GM (%)', g)]));
        set.appendChild(gruppe);
      } else {
        set.appendChild(el('p', { text: 'Für das Praktikum gibt es keinen Spielraum.', cls: 'hilfe' }));
      }
      var speichern = function () {
        var patch = { erklaerung: erkl.value };
        if (felder) { patch.spielraum = { vorgesetzte: zahl(felder[0]), hr: zahl(felder[1]), gm: zahl(felder[2]) }; }
        uebernehmen('stufe-' + s, 'stufen', E.setzeStufe(arbeit, s, patch), eingaben);
      };
      eingaben.forEach(function (e) { e.addEventListener('change', speichern); });
      ziel.appendChild(set);
    });
  }

  // ---- Lohnbänder pro Stufe ----

  function baenderZeigen() {
    var body = $('baenderBody');
    leeren(body);
    var tabellen = (arbeit.mindestloehne || []).slice().sort(function (a, b) { return b.jahr - a.jahr; });
    var neueste = (tabellen[0] || {}).stufen || {};
    var baender = arbeit.lohnbaender || {};
    function zeile(id, name, minAnzeige, minFeld, b) {
      var max = zahlFeld(b.max, 'any');
      var ueber = el('input', { attr: { type: 'checkbox' } });
      ueber.checked = b.ueberschreitbar === true;
      max.setAttribute('aria-label', 'Maximum: ' + name);
      ueber.setAttribute('aria-label', 'Max überschreitbar: ' + name);
      var alle = [max, ueber].concat(minFeld ? [minFeld] : []);
      var speichern = function () {
        var patch = { max: zahl(max), ueberschreitbar: ueber.checked };
        if (minFeld) { patch.min = zahl(minFeld); }
        uebernehmen('band-' + id, 'baender', E.setzeBand(arbeit, id, patch), alle);
      };
      alle.forEach(function (e) { e.addEventListener('change', speichern); });
      body.appendChild(el('tr', {}, [zelle(el('span', { text: name })), minFeld ? zelle(minFeld, 'zahl') : el('td', { cls: 'zahl', text: minAnzeige }),
        zelle(max, 'zahl'), zelle(ueber, 'mitte')]));
    }
    E.BAND_STUFEN.forEach(function (s) {
      var ml = neueste[s];
      zeile(s, C.stufeName(arbeit, s) + (C.stufeErklaerung(arbeit, s) ? ', ' + C.stufeErklaerung(arbeit, s) : ''), typeof ml === 'number' ? ml.toFixed(2) : '–', null, baender[s] || {});
    });
    var k = baender.kader || {};
    zeile('kader', 'Kader (alle Kader-Funktionen, unabhängig von der Ausbildung)', '', zahlFeld(k.min, 'any'), k);
  }

  // ---- Funktionen ----

  function abteilungOptionen() {
    return (arbeit.abteilungen || []).map(function (a) { return [a.id, a.label]; });
  }
  function bereichOptionen() {
    return [['', '(keiner)']].concat((arbeit.bereiche || []).map(function (b) { return [b.id, b.label]; }));
  }

  function funktionenZeigen() {
    var sel = $('filterAbteilung');
    leeren(sel);
    [['', 'Alle Abteilungen']].concat(abteilungOptionen()).forEach(function (o) {
      var opt = el('option', { text: o[1], attr: { value: o[0] } });
      if (o[0] === filterAbteilung) { opt.selected = true; }
      sel.appendChild(opt);
    });
    var body = $('funktionenBody');
    leeren(body);
    var sichtbar = 0;
    (arbeit.funktionen || []).forEach(function (f) {
      if (filterAbteilung && f.abteilung !== filterAbteilung) { return; }
      sichtbar += 1;
      body.appendChild(funktionsZeile(f));
    });
    $('funktionenAnzahl').textContent = sichtbar + ' von ' + (arbeit.funktionen || []).length + ' Funktionen';
  }

  function zelle(kind, cls) { return el('td', { cls: cls }, [kind]); }

  function funktionsZeile(f) {
    var name = f.label;
    var label = textFeld(f.label);
    var abt = auswahl(abteilungOptionen(), f.abteilung);
    var ber = auswahl(bereichOptionen(), f.bereich === null || f.bereich === undefined ? '' : f.bereich);
    var gast = el('input', { attr: { type: 'checkbox' } });
    gast.checked = f.gaestekontakt === true;
    var kader = el('input', { attr: { type: 'checkbox' } });
    kader.checked = f.kader === true;
    label.setAttribute('aria-label', 'Bezeichnung: ' + name);
    abt.setAttribute('aria-label', 'Abteilung: ' + name);
    ber.setAttribute('aria-label', 'Funktionsbereich: ' + name);
    gast.setAttribute('aria-label', 'Gästekontakt: ' + name);
    kader.setAttribute('aria-label', 'Kader: ' + name);
    var alle = [label, abt, ber, gast, kader];
    var speichern = function () {
      var patch = {
        label: label.value, abteilung: abt.value, bereich: ber.value === '' ? null : ber.value,
        gaestekontakt: gast.checked, kader: kader.checked,
      };
      uebernehmen('funktion-' + f.id, 'funktionen', E.aktualisiereFunktion(arbeit, f.id, patch), alle);
    };
    alle.forEach(function (e) { e.addEventListener('change', speichern); });
    var weg = el('button', { text: 'Entfernen', attr: { type: 'button', 'aria-label': 'Funktion entfernen: ' + name } });
    weg.addEventListener('click', function () {
      if (!window.confirm('Funktion «' + f.label + '» entfernen?')) { return; }
      delete offen['funktion-' + f.id];
      umbauen('entfernen-' + f.id, 'funktionen', E.entferneFunktion(arbeit, f.id));
    });
    return el('tr', {}, [zelle(label), zelle(abt), zelle(ber), zelle(gast, 'mitte'), zelle(kader, 'mitte'), zelle(weg)]);
  }

  function funktionNeuZeigen() {
    var ziel = $('funktionNeu');
    leeren(ziel);
    var label = textFeld('');
    var abt = auswahl(abteilungOptionen(), filterAbteilung || (abteilungOptionen()[0] || [''])[0]);
    var ber = auswahl(bereichOptionen(), '');
    var gast = el('input', { attr: { type: 'checkbox' } });
    var kader = el('input', { attr: { type: 'checkbox' } });
    var raster = el('div', { cls: 'raster' }, [feld('Bezeichnung', label), feld('Abteilung', abt), feld('Funktionsbereich', ber)]);
    ziel.appendChild(raster);
    [['Gästekontakt', gast], ['Kader (bekommt das Kaderband)', kader]].forEach(function (p) {
      var id = neueId('f');
      p[1].id = id;
      ziel.appendChild(el('div', { cls: 'feld' }, [el('label', { cls: 'inline', attr: { 'for': id } }, [p[1], document.createTextNode(' ' + p[0])])]));
    });
    var knopf = el('button', { text: 'Funktion hinzufügen', attr: { type: 'submit' } });
    ziel.appendChild(el('div', { cls: 'feld' }, [knopf]));
    ziel.onsubmit = function (ev) {
      ev.preventDefault();
      umbauen('neue-funktion', 'funktionen', E.fuegeFunktionHinzu(arbeit, {
        label: label.value, abteilung: abt.value, bereich: ber.value === '' ? null : ber.value,
        gaestekontakt: gast.checked, kader: kader.checked,
      }));
    };
  }

  // ---- Bausteine und Zusatzbausteine ----

  function bausteineZeigen() {
    var ziel = $('bausteineFelder');
    leeren(ziel);
    var b = arbeit.bausteine || {};
    var erf = zahlFeld(b.erfahrungProJahr, 'any');
    var spr = zahlFeld(b.spracheProSprache, 'any');
    var max = zahlFeld(b.maxSprachen, '1');
    var niveau = auswahl(E.NIVEAUS.map(function (n) { return [n, n]; }), b.mindestNiveau);
    [[erf, 'erfahrungProJahr'], [spr, 'spracheProSprache'], [max, 'maxSprachen']].forEach(function (p) {
      p[0].addEventListener('change', function () {
        var patch = {};
        patch[p[1]] = zahl(p[0]);
        uebernehmen('bausteine-' + p[1], 'bausteine', E.setzeBausteine(arbeit, patch), [p[0]]);
      });
    });
    niveau.addEventListener('change', function () {
      uebernehmen('bausteine-niveau', 'bausteine', E.setzeBausteine(arbeit, { mindestNiveau: niveau.value }), [niveau]);
    });
    ziel.appendChild(el('div', { cls: 'raster' }, [
      feld('Erfahrung: CHF pro Jahr', erf), feld('Sprache: CHF pro Sprache', spr),
      feld('Höchste Anzahl Sprachen', max), feld('Mindestniveau Sprache', niveau)]));
    var gruppeId = neueId('t');
    var boxen = E.SPRACHEN_CODES.map(function (code) {
      var box = el('input', { attr: { type: 'checkbox', value: code } });
      box.checked = (b.sprachen || []).indexOf(code) >= 0;
      return box;
    });
    var gruppe = el('div', { cls: 'feld', attr: { role: 'group', 'aria-labelledby': gruppeId } }, [
      el('p', { text: 'Anrechenbare Sprachen', cls: 'feldname', attr: { id: gruppeId } })]);
    boxen.forEach(function (box) {
      var id = neueId('f');
      box.id = id;
      box.addEventListener('change', function () {
        var codes = boxen.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
        uebernehmen('bausteine-sprachen', 'bausteine', E.setzeBausteine(arbeit, { sprachen: codes }), boxen);
      });
      gruppe.appendChild(el('label', { cls: 'inline kurz', attr: { 'for': id } }, [box, document.createTextNode(' ' + box.value)]));
    });
    ziel.appendChild(gruppe);
  }

  function zusatzZeigen() {
    var body = $('zusatzBody');
    leeren(body);
    var liste = arbeit.zusatzbausteine || [];
    $('zusatzLeer').hidden = liste.length > 0;
    $('zusatzTabelle').hidden = liste.length === 0;
    liste.forEach(function (z) {
      var weg = el('button', { text: 'Entfernen', attr: { type: 'button', 'aria-label': 'Baustein entfernen: ' + z.label } });
      weg.addEventListener('click', function () {
        if (!window.confirm('Baustein «' + z.label + '» entfernen?')) { return; }
        umbauen('zusatz-entfernen', 'zusatz', E.entferneBaustein(arbeit, z.id));
      });
      body.appendChild(el('tr', {}, [
        el('td', { text: z.label }), el('td', { text: z.art === 'lohn' ? 'Lohn' : 'Entschädigung' }),
        el('td', { text: String(z.betrag), cls: 'zahl' }), zelle(weg)]));
    });
  }

  function idAusText(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function zusatzNeuZeigen() {
    var ziel = $('zusatzNeu');
    leeren(ziel);
    var label = textFeld('');
    var art = auswahl([['lohn', 'Lohn (Teil des Bruttolohns)'], ['entschaedigung', 'Entschädigung (kein Lohn)']], 'lohn');
    var betrag = zahlFeld('', 'any');
    var id = textFeld('');
    ziel.appendChild(el('div', { cls: 'raster' }, [feld('Bezeichnung', label), feld('Art', art), feld('Betrag (CHF pro Monat)', betrag),
      feld('ID (leer = aus der Bezeichnung)', id)]));
    ziel.appendChild(el('div', { cls: 'feld' }, [el('button', { text: 'Baustein hinzufügen', attr: { type: 'submit' } })]));
    ziel.onsubmit = function (ev) {
      ev.preventDefault();
      umbauen('zusatz-neu', 'zusatz', E.fuegeBausteinHinzu(arbeit, {
        id: id.value.trim() === '' ? idAusText(label.value) : id.value.trim(),
        label: label.value, art: art.value, betrag: zahl(betrag),
      }));
    };
  }

  // ---- Abschlüsse und Bereiche (nur lesen) ----

  function leseTabelleZeigen() {
    var bereichName = {};
    (arbeit.bereiche || []).forEach(function (b) { bereichName[b.id] = b.label; });
    var bb = $('bereicheBody');
    leeren(bb);
    (arbeit.bereiche || []).forEach(function (b) {
      bb.appendChild(el('tr', {}, [el('td', { text: b.label }), el('td', { text: b.id })]));
    });
    var ab = $('abschluesseBody');
    leeren(ab);
    (arbeit.abschluesse || []).forEach(function (a) {
      var namen = a.bereiche === '*' ? 'alle Bereiche' : (a.bereiche || []).map(function (x) { return bereichName[x] || x; }).join(', ');
      ab.appendChild(el('tr', {}, [
        el('td', { text: a.label }), el('td', { text: a.stufe === null ? 'von Hand' : a.stufe }),
        el('td', { text: namen || '–' })]));
    });
  }

  // ---- Gesamtanzeige ----

  function alleZeigen() {
    betriebZeigen();
    mindestloehneZeigen();
    stufenZeigen();
    baenderZeigen();
    funktionenZeigen();
    funktionNeuZeigen();
    bausteineZeigen();
    zusatzZeigen();
    zusatzNeuZeigen();
    leseTabelleZeigen();
    nachAenderung();
  }

  // ---- Export, Import, Zurücksetzen ----

  function exportieren() {
    var p = C.validateConfig(arbeit);
    if (!p.ok || Object.keys(offen).length) { return; }
    var blob = new Blob([C.serializeConfig(arbeit)], { type: 'text/javascript;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { attr: { href: url, download: 'config.js' } });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importMeldung(texte) {
    importFehler = texte;
    nachAenderung();
  }

  function importieren(text) {
    var neu;
    try {
      neu = C.parseConfigDatei(text);
    } catch (e) {
      importMeldung(['Konfigurationsdatei nicht lesbar']);
      return;
    }
    var p = C.validateConfig(neu);
    if (!p.ok) {
      importMeldung(['Die Konfigurationsdatei ist lesbar, aber ungültig oder veraltet:'].concat(p.fehler));
      return;
    }
    arbeit = neu;
    offen = {};
    importFehler = null;
    alleZeigen();
  }

  function dateiGewaehlt(ev) {
    var datei = ev.target.files && ev.target.files[0];
    if (!datei) { return; }
    var leser = new FileReader();
    leser.onload = function () { importieren(String(leser.result)); };
    leser.onerror = function () { importMeldung(['Konfigurationsdatei nicht lesbar']); };
    leser.readAsText(datei);
    ev.target.value = '';
  }

  function standardWiederherstellen() {
    if (!window.confirm('Alle Änderungen verwerfen und die veröffentlichte Konfiguration (config/config.js) wiederherstellen?')) { return; }
    arbeit = kopie(veroeffentlicht);
    offen = {};
    importFehler = null;
    speicherLoeschen();
    alleZeigen();
  }

  // ---- Entwurf beim Start ----

  function entwurfAngebot() {
    var text = speicherLesen();
    if (!text) { autospeichern = true; return; }
    var entwurf = null;
    try {
      entwurf = C.parseConfigDatei(text);
      if (!C.validateConfig(entwurf).ok) { entwurf = null; }
    } catch (e) { entwurf = null; }
    if (!entwurf || !E.unterscheidet(entwurf, veroeffentlicht)) {
      speicherLoeschen();
      autospeichern = true;
      return;
    }
    var banner = $('entwurfBanner');
    banner.hidden = false;
    $('entwurfWeiter').addEventListener('click', function () {
      arbeit = entwurf;
      autospeichern = true;
      banner.hidden = true;
      alleZeigen();
    });
    $('entwurfVerwerfen').addEventListener('click', function () {
      speicherLoeschen();
      autospeichern = true;
      banner.hidden = true;
      nachAenderung();
    });
  }

  function start() {
    var pruefung = window.LOHN_CONFIG ? C.validateConfig(window.LOHN_CONFIG) : { ok: false, fehler: ['config/config.js konnte nicht geladen werden.'] };
    if (!window.LOHN_CONFIG) {
      var box = $('konfigFehler');
      box.hidden = false;
      box.textContent = pruefung.fehler[0];
      return;
    }
    veroeffentlicht = kopie(window.LOHN_CONFIG);
    arbeit = kopie(window.LOHN_CONFIG);
    $('seite').hidden = false;
    $('filterAbteilung').addEventListener('change', function (ev) {
      filterAbteilung = ev.target.value;
      funktionenZeigen();
    });
    $('jahrForm').addEventListener('submit', neuesJahrAnlegen);
    $('exportKnopf').addEventListener('click', exportieren);
    $('importDatei').addEventListener('change', dateiGewaehlt);
    $('standardKnopf').addEventListener('click', standardWiederherstellen);
    alleZeigen();
    entwurfAngebot();
  }

  start();
}());
