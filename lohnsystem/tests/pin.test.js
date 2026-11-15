'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sha256Hex, hashFuerPin, pinStimmt } = require('../src/pin.js');

test('sha256Hex: bekannte Prüfwerte', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex('a'.repeat(1000)), crypto.createHash('sha256').update('a'.repeat(1000)).digest('hex'));
  assert.equal(sha256Hex('Käse € 0815'), crypto.createHash('sha256').update('Käse € 0815', 'utf8').digest('hex'));
});

test('hashFuerPin: mit Salz, also nicht der blosse Hash der Ziffern', () => {
  assert.notEqual(hashFuerPin('0815'), sha256Hex('0815'));
  assert.equal(hashFuerPin('0815'), hashFuerPin('0815'));
});

test('pinStimmt: richtige PIN, falsche PIN, Leerzeichen und leere Eingabe', () => {
  const hash = hashFuerPin('0815');
  assert.equal(pinStimmt('0815', hash), true);
  assert.equal(pinStimmt(' 0815 ', hash), true);
  assert.equal(pinStimmt('0816', hash), false);
  assert.equal(pinStimmt('', hash), false);
  assert.equal(pinStimmt(null, hash), false);
  assert.equal(pinStimmt('0815', ''), false);
  assert.equal(pinStimmt('0815', undefined), false);
});

test('config/pin.js: gesetzter Hash passt zur PIN, die PIN selbst steht nicht in der Datei', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'config', 'pin.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(text, sandbox);
  assert.match(sandbox.window.LOHN_PIN_HASH, /^[0-9a-f]{64}$/);
  assert.equal(pinStimmt('0815', sandbox.window.LOHN_PIN_HASH), true);
  assert.doesNotMatch(text, /0815/);
});

test('geschützte Seiten laden die PIN-Sperre, die Leseansicht und die Startseite nicht', () => {
  const lies = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const f of ['hr.html', 'config.html']) {
    const t = lies(f);
    assert.match(t, /config\/pin\.js/, f);
    assert.match(t, /src\/pin\.js/, f);
    assert.ok(t.indexOf('src/pin.js') < t.indexOf('<body'), f + ': Sperre muss im Kopf geladen werden');
  }
  for (const f of ['lesen.html', 'index.html']) {
    assert.doesNotMatch(lies(f), /pin\.js/, f);
  }
});
