(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LohnLesen = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var STUFEN_REIHENFOLGE = ['Ia', 'Ib', 'II', 'IIIa', 'IIIb', 'IV', 'P'];
  var SPRACHNAMEN = { DE: 'Deutsch', EN: 'Englisch', FR: 'Französisch', IT: 'Italienisch' };
  var BAENDER_HINWEIS = 'Lohnbänder sind Beispielwerte, bis sie freigegeben sind.';

  var Cfg = typeof require === 'function' ? require('./config.js') : window.LohnConfig;

  function istZahl(x) { return typeof x === 'number' && isFinite(x); }
  function liste(x) { return Array.isArray(x) ? x : []; }

  function zeigeBaenderHinweis(config) {
    return !(config && config.betrieb && config.betrieb.baenderBestaetigt === true);
  }

  // Mindestlohn-Tabelle für unbefristete Anstellung: die jüngste Tabelle, die am Datum bereits gilt;
  // gilt noch keine, wird die nächste kommende gezeigt (mit Datum «gültig ab» in der Beschriftung).
  function waehleTabelle(config, datum) {
    var treffer = null;
    var erste = null;
    liste(config.mindestloehne).forEach(function (t) {
      var ab = t && t.gueltigAbJahresbetrieb;
      if (typeof ab !== 'string') { return; }
      if (!erste || ab < erste.gueltigAbJahresbetrieb) { erste = t; }
      if (ab <= datum && (!treffer || ab > treffer.gueltigAbJahresbetrieb)) { treffer = t; }
    });
    return treffer || erste;
  }

  function stufenLabel(config, stufe) {
    var s = config.stufen && config.stufen[stufe];
    return (s && s.label) || 'Stufe ' + stufe;
  }

  // Reine Umwandlung der Konfiguration in das Modell der Leseansicht (ohne HR-interne Angaben).
  function baueLeseModell(config, datum) {
    if (!config || typeof config !== 'object' || !config.betrieb || !Array.isArray(config.mindestloehne)
        || !Array.isArray(config.funktionen) || !Array.isArray(config.abteilungen) || !config.bausteine) {
      return { fehler: 'Die Lohnübersicht kann zurzeit nicht angezeigt werden (Konfiguration fehlt oder ist unvollständig). Bitte HR informieren.' };
    }
    var tabelle = waehleTabelle(config, datum);
    if (!tabelle || !tabelle.stufen) {
      return { fehler: 'Für dieses Datum liegt keine Mindestlohn-Tabelle vor. Bitte HR informieren.' };
    }
    var betrieb = config.betrieb;
    var b = config.bausteine;
    var zukuenftig = tabelle.gueltigAbJahresbetrieb > datum;

    var mindestloehne = STUFEN_REIHENFOLGE.filter(function (st) { return istZahl(tabelle.stufen[st]); }).map(function (st) {
      return { stufe: st, label: stufenLabel(config, st), betrag: tabelle.stufen[st], erklaerung: Cfg.stufeErklaerung(config, st) };
    });

    var funktionen = config.abteilungen.map(function (a) {
      return {
        abteilung: a.label,
        // Kader-Funktionen und das Kaderband erscheinen nicht in der öffentlichen Leseansicht.
        funktionen: config.funktionen.filter(function (f) { return f.abteilung === a.id && f.kader !== true; }).map(function (f) {
          return { label: f.label, gaestekontakt: f.gaestekontakt === true, bereich: f.bereich || null };
        })
      };
    }).filter(function (x) { return x.funktionen.length > 0; });

    var lb = config.lohnbaender || {};
    var lohnbaender = {
      stufen: STUFEN_REIHENFOLGE.filter(function (st) { return st !== 'P' && lb[st] && istZahl(lb[st].max) && istZahl(tabelle.stufen[st]); }).map(function (st) {
        return { stufe: st, label: stufenLabel(config, st), erklaerung: Cfg.stufeErklaerung(config, st), min: tabelle.stufen[st], max: lb[st].max, ueberschreitbar: lb[st].ueberschreitbar === true };
      })
    };

    var bereichLabels = {};
    liste(config.bereiche).forEach(function (br) { bereichLabels[br.id] = br.label; });
    var anerkennung = liste(config.abschluesse).map(function (a) {
      var einzelfall = a.stufe === null || a.stufe === undefined;
      return {
        abschluss: a.label,
        stufe: einzelfall ? null : Cfg.stufeMitErklaerung(config, a.stufe),
        einzelfall: einzelfall,
        bereiche: liste(a.bereiche).map(function (id) { return bereichLabels[id] || id; })
      };
    });

    return {
      jahr: tabelle.jahr,
      gueltigAb: tabelle.gueltigAbJahresbetrieb,
      zukuenftig: zukuenftig,
      mindestlohnHinweis: zukuenftig ? 'Diese Mindestlöhne gelten erst ab dem ' + datumCH(tabelle.gueltigAbJahresbetrieb) + '. Bis dahin gelten die bisherigen Mindestlöhne.' : null,
      mindestloehne: mindestloehne,
      lohnbaender: lohnbaender,
      funktionen: funktionen,
      texte: {
        berechnung: 'Einstiegslohn = Mindestlohn der Stufe der Person + Zuschläge, höchstens bis zum Ende des Lohnbands der Stufe.',
        sprachNachweis: 'Die Sprachkenntnisse müssen überprüft werden oder durch ein Diplom belegt sein.',
        baender: 'Das Lohnband hängt an der Ausbildung der Person (Stufe). Gleiche Ausbildung ergibt gleichen Lohn, unabhängig von der Funktion.'
      },
      regeln: {
        erfahrungProJahr: b.erfahrungProJahr,
        maxErfahrungsjahre: betrieb.maxErfahrungsjahre,
        spracheProSprache: b.spracheProSprache,
        sprachen: liste(b.sprachen).map(function (c) { return { code: c, label: SPRACHNAMEN[c] || c }; }),
        mindestNiveau: b.mindestNiveau,
        teilNiveau: b.teilNiveau || null,
        teilProzent: istZahl(b.teilProzent) ? b.teilProzent : null,
        muttersprachFaktor: istZahl(b.muttersprachFaktor) ? b.muttersprachFaktor : 1,
        dreizehnterProzent: betrieb.dreizehnterProzent,
        wochenstunden: betrieb.wochenstunden
      },
      anerkennung: anerkennung,
      hinweise: zeigeBaenderHinweis(config) ? [BAENDER_HINWEIS] : []
    };
  }

  // ---------- Darstellung (nur Browser) ----------

  function chf(n) {
    var t = Number(n).toFixed(2).split('.');
    return t[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u2019') + '.' + t[1];
  }
  function datumCH(iso) { var p = String(iso).split('-'); return p.length === 3 ? Number(p[2]) + '.' + Number(p[1]) + '.' + p[0] : iso; }
  function zahl(n) { return String(n).replace('.', ','); }

  function el(tag, text, klasse) {
    var e = document.createElement(tag);
    if (text !== undefined && text !== null) { e.textContent = text; }
    if (klasse) { e.className = klasse; }
    return e;
  }
  function tabelle(caption, kopf, zeilen, zahlenSpalten) {
    var wrap = el('div', null, 'tabelle-wrap');
    var t = el('table');
    t.appendChild(el('caption', caption));
    var thead = el('thead');
    var tr = el('tr');
    kopf.forEach(function (k, i) {
      var th = el('th', k, zahlenSpalten.indexOf(i) >= 0 ? 'zahl' : '');
      th.scope = 'col';
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tbody = el('tbody');
    zeilen.forEach(function (z) {
      var r = el('tr');
      z.forEach(function (zelle, i) {
        var erste = i === 0;
        var c = el(erste ? 'th' : 'td', zelle, zahlenSpalten.indexOf(i) >= 0 ? 'zahl' : '');
        if (erste) { c.scope = 'row'; }
        r.appendChild(c);
      });
      tbody.appendChild(r);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  function rendere(m, ziel) {
    ziel.textContent = '';
    if (m.fehler) {
      var f = el('p', m.fehler, 'meldung fehler');
      f.setAttribute('role', 'alert');
      ziel.appendChild(f);
      return;
    }
    var r = m.regeln;
    m.hinweise.forEach(function (h) { ziel.appendChild(el('p', h, 'meldung info')); });

    var s1 = el('section');
    s1.appendChild(el('h2', 'Wie wird der Einstiegslohn berechnet?'));
    s1.appendChild(el('p', 'Alle Beträge sind Bruttolöhne pro Monat in CHF für eine Vollzeitstelle (' + zahl(r.wochenstunden) + ' Stunden pro Woche). Der 13. Monatslohn (' + zahl(r.dreizehnterProzent) + ' %) kommt zusätzlich dazu und wird separat ausgewiesen.'));
    s1.appendChild(el('p', m.texte.berechnung));
    ziel.appendChild(s1);

    var s2 = el('section');
    s2.appendChild(el('h2', 'Mindestlöhne nach Stufe'));
    if (m.mindestlohnHinweis) { s2.appendChild(el('p', m.mindestlohnHinweis, 'meldung info')); }
    s2.appendChild(tabelle('Mindestlöhne ' + m.jahr + ' (gültig ab ' + datumCH(m.gueltigAb) + '), brutto pro Monat in CHF', ['Stufe', 'Erklärung', 'Mindestlohn (CHF)'],
      m.mindestloehne.map(function (x) { return [x.label, x.erklaerung || '–', chf(x.betrag)]; }), [2]));
    ziel.appendChild(s2);

    var s3 = el('section');
    s3.appendChild(el('h2', 'Lohnbänder pro Stufe'));
    s3.appendChild(el('p', m.texte.baender));
    var bandZeilen = m.lohnbaender.stufen.map(function (x) { return [x.label + (x.erklaerung ? ', ' + x.erklaerung : ''), chf(x.min), chf(x.max)]; });
    s3.appendChild(tabelle('Lohnbänder pro Stufe, brutto pro Monat in CHF', ['Stufe', 'Band von (CHF)', 'Band bis (CHF)'], bandZeilen, [1, 2]));
    s3.appendChild(el('h2', 'Funktionen'));
    s3.appendChild(el('p', '«Gästekontakt» bedeutet, dass bei der Funktion Sprachzuschläge möglich sind.'));
    m.funktionen.forEach(function (b) {
      s3.appendChild(el('h3', b.abteilung));
      s3.appendChild(tabelle('Funktionen ' + b.abteilung, ['Funktion', 'Gästekontakt'],
        b.funktionen.map(function (f) { return [f.label, f.gaestekontakt ? 'ja' : 'nein']; }), []));
    });
    ziel.appendChild(s3);

    var s4 = el('section');
    s4.appendChild(el('h2', 'Zuschläge'));
    s4.appendChild(el('h3', 'Erfahrung'));
    var ul1 = el('ul');
    ul1.appendChild(el('li', 'CHF ' + zahl(r.erfahrungProJahr) + ' pro Jahr Erfahrung.'));
    ul1.appendChild(el('li', 'Es zählt nur Erfahrung nach dem Lehrabschluss in der künftigen Funktion.'));
    ul1.appendChild(el('li', 'Es zählen nur ganze Jahre, höchstens ' + zahl(r.maxErfahrungsjahre) + ' Jahre.'));
    s4.appendChild(ul1);
    s4.appendChild(el('h3', 'Sprachen'));
    var ul2 = el('ul');
    ul2.appendChild(el('li', 'CHF ' + zahl(r.spracheProSprache) + ' pro Sprache ab Niveau ' + r.mindestNiveau + '.'));
    if (r.teilNiveau && r.teilProzent) { ul2.appendChild(el('li', 'Ab Niveau ' + r.teilNiveau + ' gibt es ' + zahl(r.teilProzent) + ' % davon (CHF ' + zahl(r.spracheProSprache * r.teilProzent / 100) + '), darunter nichts.')); }
    if (r.muttersprachFaktor > 1) { ul2.appendChild(el('li', 'Die Muttersprache zählt ' + (r.muttersprachFaktor === 2 ? 'doppelt' : zahl(r.muttersprachFaktor) + '-fach') + ' (CHF ' + zahl(r.spracheProSprache * r.muttersprachFaktor) + ').')); }
    ul2.appendChild(el('li', 'Nur bei Funktionen mit Gästekontakt.'));
    ul2.appendChild(el('li', m.texte.sprachNachweis));
    ul2.appendChild(el('li', 'Zählende Sprachen: ' + r.sprachen.map(function (x) { return x.label; }).join(', ') + '.'));
    s4.appendChild(ul2);
    ziel.appendChild(s4);

    var s5 = el('section');
    s5.appendChild(el('h2', 'Welche Ausbildung wird anerkannt?'));
    s5.appendChild(el('p', 'Der L-GAV stuft nach Abschluss und ausgeübter Tätigkeit ein.'));
    s5.appendChild(tabelle('Anerkannte Abschlüsse mit Stufe und Funktionsbereichen', ['Abschluss', 'Stufe', 'Funktionsbereiche'],
      m.anerkennung.map(function (a) {
        return [a.abschluss, a.einzelfall ? 'Einstufung im Einzelfall' : a.stufe, a.bereiche.length ? a.bereiche.join(', ') : '–'];
      }), []));
    ziel.appendChild(s5);

    ziel.appendChild(el('p', 'Dies sind Einstiegslöhne bei Neuanstellung; Fragen an HR.', 'fussnote'));
  }

  function heute() {
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  function start() {
    var config = window.LOHN_CONFIG;
    var ziel = document.getElementById('inhalt');
    var modell;
    if (window.LohnConfig && config && !window.LohnConfig.validateConfig(config).ok) {
      modell = { fehler: 'Die Lohnübersicht kann zurzeit nicht angezeigt werden (Konfiguration ungültig). Bitte HR informieren.' };
    } else {
      modell = baueLeseModell(config, heute());
    }
    rendere(modell, ziel);
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
  }

  return { baueLeseModell: baueLeseModell, zeigeBaenderHinweis: zeigeBaenderHinweis };
}));
