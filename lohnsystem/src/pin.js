(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LohnPin = factory();
    root.LohnPin.sperreStarten(root);
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SALZ = 'lohnsystem-waldhaus:';
  var SCHLUESSEL = 'lohnsystem-pin-ok';

  // SHA-256 in reinem JavaScript (kein Web Crypto nötig, läuft auch von einer Datei oder über http).
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8Bytes(text) {
    var s = unescape(encodeURIComponent(String(text)));
    var out = [];
    for (var i = 0; i < s.length; i++) { out.push(s.charCodeAt(i)); }
    return out;
  }

  function sha256Hex(text) {
    var bytes = utf8Bytes(text);
    var laengeBits = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) { bytes.push(0); }
    for (var s = 56; s >= 0; s -= 8) {
      bytes.push(s >= 32 ? 0 : Math.floor(laengeBits / Math.pow(2, s)) & 0xff);
    }
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var block = 0; block < bytes.length; block += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] = (bytes[block + i * 4] << 24) | (bytes[block + i * 4 + 1] << 16) | (bytes[block + i * 4 + 2] << 8) | bytes[block + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  function hashFuerPin(pin) { return sha256Hex(SALZ + String(pin)); }

  function pinStimmt(eingabe, hash) {
    if (typeof eingabe !== 'string' || typeof hash !== 'string' || hash === '') { return false; }
    var pin = eingabe.trim();
    return pin !== '' && hashFuerPin(pin) === hash;
  }

  function merkenLesen(win) {
    try { return win.sessionStorage.getItem(SCHLUESSEL); } catch (e) { return null; }
  }
  function merkenSchreiben(win, hash) {
    try { win.sessionStorage.setItem(SCHLUESSEL, hash); } catch (e) { /* ohne Speicher fragt die Seite bei jedem Laden */ }
  }

  // Sperre: versteckt die Seite, bis die richtige PIN eingegeben wurde (bis der Browser geschlossen wird).
  // Das ist eine einfache Hürde im Browser, kein Zugriffsschutz auf dem Server.
  function sperreStarten(win) {
    var hash = win.LOHN_PIN_HASH;
    var doc = win.document;
    if (typeof hash !== 'string' || hash === '') { return; }
    if (merkenLesen(win) === hash) { return; }
    var stil = doc.createElement('style');
    stil.id = 'pinStil';
    stil.textContent = 'html.pin-gesperrt body > *:not(#pinSperre) { display:none !important; }'
      + '#pinSperre { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px; background:#132538; font:16px/1.45 system-ui,"Segoe UI",Arial,sans-serif; }'
      + '#pinSperre form { width:100%; max-width:320px; padding:24px; border-radius:8px; background:#fff; color:#1d2430; }'
      + '#pinSperre h1 { margin:0 0 4px; font-size:1.25rem; } #pinSperre p { margin:0 0 12px; color:#5b6573; font-size:.9rem; }'
      + '#pinSperre label { display:block; margin-bottom:4px; font-weight:600; }'
      + '#pinSperre input { width:100%; font:inherit; font-size:1.4rem; letter-spacing:.3em; padding:8px 10px; border:1px solid #c9d0d9; border-radius:6px; }'
      + '#pinSperre button { margin-top:12px; width:100%; font:inherit; padding:9px 14px; border:1px solid #132538; border-radius:6px; background:#132538; color:#fff; cursor:pointer; }'
      + '#pinSperre input:focus-visible, #pinSperre button:focus-visible { outline:3px solid #1f4e79; outline-offset:2px; }'
      + '#pinSperre .pin-fehler { margin:8px 0 0; color:#b3261e; font-weight:600; min-height:1.3em; }';
    doc.head.appendChild(stil);
    doc.documentElement.classList.add('pin-gesperrt');
    function aufbauen() {
      var box = doc.createElement('div');
      box.id = 'pinSperre';
      var form = doc.createElement('form');
      var h1 = doc.createElement('h1'); h1.textContent = 'PIN eingeben';
      var hinweis = doc.createElement('p'); hinweis.textContent = 'Diese Seite ist nur für HR.';
      var label = doc.createElement('label'); label.setAttribute('for', 'pinEingabe'); label.textContent = 'PIN';
      var eingabe = doc.createElement('input');
      eingabe.id = 'pinEingabe'; eingabe.type = 'password'; eingabe.autocomplete = 'off';
      eingabe.setAttribute('inputmode', 'numeric'); eingabe.setAttribute('aria-describedby', 'pinFehler');
      var knopf = doc.createElement('button'); knopf.type = 'submit'; knopf.textContent = 'Öffnen';
      var fehler = doc.createElement('p'); fehler.id = 'pinFehler'; fehler.className = 'pin-fehler'; fehler.setAttribute('role', 'alert');
      [h1, hinweis, label, eingabe, knopf, fehler].forEach(function (e) { form.appendChild(e); });
      box.appendChild(form);
      doc.body.insertBefore(box, doc.body.firstChild);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (pinStimmt(eingabe.value, hash)) {
          merkenSchreiben(win, hash);
          doc.documentElement.classList.remove('pin-gesperrt');
          box.parentNode.removeChild(box);
          var s = doc.getElementById('pinStil'); if (s) { s.parentNode.removeChild(s); }
        } else {
          fehler.textContent = 'Falsche PIN.';
          eingabe.value = '';
          eingabe.focus();
        }
      });
      eingabe.focus();
    }
    if (doc.body) { aufbauen(); } else { doc.addEventListener('DOMContentLoaded', aufbauen); }
  }

  return { sha256Hex: sha256Hex, hashFuerPin: hashFuerPin, pinStimmt: pinStimmt, sperreStarten: sperreStarten };
}));
