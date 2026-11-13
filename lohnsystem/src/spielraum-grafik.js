(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'));
  } else {
    root.LohnGrafik = factory(root.LohnEngine);
  }
}(typeof window !== 'undefined' ? window : this, function (Engine) {
  'use strict';

  function istZahl(x) { return typeof x === 'number' && isFinite(x); }
  function chf(x) { return Number(x).toFixed(2); }
  function p4(x) { return Math.round(x * 10000) / 10000; }

  // Reines Modell: drei verschachtelte Bänder und Marken, Positionen in Prozent der Achsenbreite.
  function baueGrafikModell(ergebnis, gewaehlterLohn) {
    if (!ergebnis || ergebnis.modus !== 'berechnet' || !ergebnis.spanneStufen) { return null; }
    var st = ergebnis.spanneStufen;
    var gm = st.gm;
    var breite = gm.max - gm.min;
    var rand = breite > 0 ? breite * 0.1 : 50;
    var achse = { min: gm.min - rand, max: gm.max + rand };
    var ganz = achse.max - achse.min;
    function prozent(wert) { return p4(Math.min(100, Math.max(0, (wert - achse.min) / ganz * 100))); }
    function band(name, r) {
      return { name: name, von: r.min, bis: r.max, vonProzent: prozent(r.min), bisProzent: prozent(r.max) };
    }
    var baender = [band('GM', st.gm), band('HR', st.hr), band('Vorgesetzte', st.vorgesetzte)];

    var marken = [{ art: 'vorschlag', wert: ergebnis.vorschlag, prozent: prozent(ergebnis.vorschlag),
      label: 'Vorschlag CHF ' + chf(ergebnis.vorschlag) }];
    if (istZahl(ergebnis.mindestlohn) && ergebnis.mindestlohn >= achse.min && ergebnis.mindestlohn <= achse.max) {
      marken.push({ art: 'mindestlohn', wert: ergebnis.mindestlohn, prozent: prozent(ergebnis.mindestlohn),
        label: 'Mindestlohn CHF ' + chf(ergebnis.mindestlohn) });
    }
    if (istZahl(ergebnis.bandMax) && ergebnis.bandMax >= achse.min && ergebnis.bandMax <= achse.max) {
      marken.push({ art: 'bandMax', wert: ergebnis.bandMax, prozent: prozent(ergebnis.bandMax),
        label: 'Bandende CHF ' + chf(ergebnis.bandMax) });
    }

    var freigabe = null;
    if (istZahl(gewaehlterLohn)) {
      var p = Engine.pruefeAbweichung(ergebnis, gewaehlterLohn, 'x');
      freigabe = p.freigabe === 'keine' ? 'keine nötig' : (p.freigabe || 'nicht zulässig');
      var ausserhalb = gewaehlterLohn < gm.min || gewaehlterLohn > gm.max;
      marken.push({ art: 'gewaehlt', wert: gewaehlterLohn, prozent: prozent(gewaehlterLohn),
        label: 'Gewählt CHF ' + chf(gewaehlterLohn) + (ausserhalb ? ', ausserhalb des Spielraums' : '') + ', Freigabe: ' + freigabe });
    }
    return { achse: achse, baender: baender, marken: marken, freigabe: freigabe };
  }

  var KURZ = { vorschlag: 'V', gewaehlt: 'G', mindestlohn: 'M', bandMax: 'B' };

  // Zeichnet das Modell als CSS-Balken in zielElement; nur textContent, kein innerHTML.
  function renderGrafik(modell, ziel) {
    var doc = ziel.ownerDocument;
    function el(tag, klasse, text) {
      var e = doc.createElement(tag);
      if (klasse) { e.className = klasse; }
      if (text !== undefined && text !== null) { e.textContent = text; }
      return e;
    }
    while (ziel.firstChild) { ziel.removeChild(ziel.firstChild); }
    if (!modell) { return; }

    var wrap = el('div', 'sg');
    var flaggen = el('div', 'sg-flaggen');
    var spur = el('div', 'sg-spur');
    spur.setAttribute('role', 'img');
    var beschreibung = modell.baender.map(function (b) { return b.name + ' CHF ' + chf(b.von) + ' bis ' + chf(b.bis); });
    spur.setAttribute('aria-label', 'Spielraum: ' + beschreibung.join('; '));

    modell.baender.forEach(function (b) {
      var d = el('div', 'sg-band sg-' + b.name.toLowerCase());
      d.style.left = b.vonProzent + '%';
      d.style.width = Math.max(b.bisProzent - b.vonProzent, 0.5) + '%';
      spur.appendChild(d);
    });
    var sortiert = modell.marken.slice().sort(function (a, b) { return a.prozent - b.prozent; });
    sortiert.forEach(function (m, i) {
      var linie = el('div', 'sg-marke sg-m-' + m.art);
      linie.style.left = m.prozent + '%';
      spur.appendChild(linie);
      var f = el('span', 'sg-flagge sg-f-' + m.art + (i % 2 ? ' sg-tief' : ''), KURZ[m.art]);
      f.style.left = m.prozent + '%';
      flaggen.appendChild(f);
    });
    wrap.appendChild(flaggen);
    wrap.appendChild(spur);

    var achse = el('div', 'sg-achse');
    achse.appendChild(el('span', null, 'CHF ' + chf(modell.achse.min)));
    achse.appendChild(el('span', null, 'CHF ' + chf(modell.achse.max)));
    wrap.appendChild(achse);

    var legende = el('ul', 'sg-legende');
    modell.marken.forEach(function (m) {
      var li = el('li');
      li.appendChild(el('span', 'sg-flagge-text sg-f-' + m.art, KURZ[m.art]));
      li.appendChild(doc.createTextNode(' ' + m.label));
      legende.appendChild(li);
    });
    modell.baender.forEach(function (b) {
      var li = el('li');
      li.appendChild(el('span', 'sg-muster sg-' + b.name.toLowerCase()));
      li.appendChild(doc.createTextNode(' ' + b.name + ': CHF ' + chf(b.von) + ' bis ' + chf(b.bis)));
      legende.appendChild(li);
    });
    wrap.appendChild(legende);
    if (modell.freigabe) {
      wrap.appendChild(el('p', 'sg-freigabe', 'Freigabe durch: ' + modell.freigabe));
    }
    ziel.appendChild(wrap);
  }

  return { baueGrafikModell: baueGrafikModell, renderGrafik: renderGrafik };
}));
