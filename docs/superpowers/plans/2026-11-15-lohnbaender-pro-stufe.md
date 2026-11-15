# Lohnbänder pro Stufe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Lohnband hängt an der Ausbildung der Person (Stufe) plus ein eigenes Kaderband, statt an der Funktion; Bänder sind in der Konfiguration pflegbar.

**Architecture:** Neuer Konfigurationsblock `lohnbaender` (ein Eintrag pro Stufe plus `kader`). Die Funktionen verlieren `bandMin`, `bandMax`, `bandAlsUntergrenze`. Der Rechenkern liest das Band aus dem Block, das Ergebnis trägt ein Feld `band`. Editor und Leseansicht bekommen einen Teil «Lohnbänder pro Stufe».

**Tech Stack:** Plain JS (Browser-Globals `window.LOHN_CONFIG`, `window.LohnEngine`), Tests mit `node --test tests/*.test.js` im Ordner `lohnsystem/`, kein package.json. Dateien haben CRLF-Zeilenenden: Edits mit zeilenende-toleranten Mitteln machen.

**Spec:** `docs/superpowers/specs/2026-11-15-lohnbaender-pro-stufe-design.md`

## Global Constraints

- Werte: Ia 4050, Ib 4450, II 4450, IIIa 4900, IIIb 5000, IV 5700 (nur Maximum), Kader min 6000, max 7500, `ueberschreitbar: true`.
- Die Maxima sind nicht pro Jahr getrennt, ein Satz gilt für alle Mindestlohn-Tabellen.
- Praktikum (Stufe P) hat kein Band, Vorschlag ist der Mindestlohn.
- Ein Kader (`funktion.kader === true`) bekommt das Kaderband, unabhängig von der Ausbildung. Start ist `max(Mindestlohn der Stufe, Kaderminimum)`.
- Über dem Maximum eines überschreitbaren Bandes: Begründung nötig, Freigabe «GM», Hinweis in der Abrechnung.
- Spielraum-Prozente (1/2/3 %) unverändert.
- Texte auf Deutsch, Betragsformat wie bisher (`chf()`).

## Review Focus

- Funktion ohne eigene Bandfelder (alte Konfiguration importiert): Import bleibt gültig und ignoriert `bandMin`/`bandMax`, zeigt aber eine Warnung statt eines Fehlers.
- Stufe ohne Eintrag in `lohnbaender`: Validierung meldet einen Fehler, die Berechnung stürzt nicht ab.
- Mindestlohn einer Tabelle über dem Bandmaximum der Stufe: Validierung meldet es, die Berechnung nimmt den Mindestlohn mit Warnung `band_zu_eng`.
- Gewählter Lohn bei Kader genau auf dem Maximum: keine Begründung nötig, kein Hinweis.
- Gewählter Lohn bei Nicht-Kader über dem Maximum: weiter «Abweichung ausserhalb des zulässigen Spielraums».
- Kader mit Praktikum: kein Band, Mindestlohn P.

---

### Task 1: Konfiguration und Validierung

**Files:**
- Modify: `lohnsystem/config/config.js` (Block `lohnbaender` ergänzen, Felder `bandMin`, `bandMax`, `bandAlsUntergrenze` aus allen Funktionen entfernen)
- Modify: `lohnsystem/src/config.js:149-165` (Funktionsprüfung)
- Test: `lohnsystem/tests/config.test.js`

**Interfaces:**
- Produces: `config.lohnbaender` = `{ Ia: {max}, Ib: {max}, II: {max}, IIIa: {max}, IIIb: {max}, IV: {max}, kader: {min, max, ueberschreitbar: true} }`. Stufeneinträge haben optional `ueberschreitbar: boolean` (fehlt = false).
- Produces: `validate(config)` meldet zusätzlich Fehler für fehlende Stufen, `max <= 0`, Kader `min > max`, Stufenmaximum unter dem Mindestlohn einer Tabelle.

- [ ] **Step 1: Failing tests in `tests/config.test.js`:** Standardkonfiguration hat die Maxima `{Ia:4050, Ib:4450, II:4450, IIIa:4900, IIIb:5000, IV:5700}` und `kader` `{min:6000, max:7500, ueberschreitbar:true}`; keine Funktion hat `bandMin`/`bandMax`/`bandAlsUntergrenze`; Fehler bei fehlender Stufe `IIIb`; Fehler bei `kader.min > kader.max`; Fehler bei Stufenmaximum unter dem Mindestlohn der Stufe.
- [ ] **Step 2:** Tests laufen lassen, Fehlschlag erwarten.
- [ ] **Step 3:** In `config/config.js` den Block `lohnbaender` mit den Werten oben einfügen und die drei Funktionsfelder bei allen Funktionen entfernen. In `src/config.js` die Prüfung von `bandMin`/`bandMax` pro Funktion durch die Prüfung des Blocks ersetzen. Ein Import mit alten Funktionsfeldern bleibt gültig, das ist eine Warnung.
- [ ] **Step 4:** Bestehende Konfigurationstests anpassen (Bandpaare-Test, `band('kueche-kuechenchef')`-Test entfallen oder werden zu Tests auf `lohnbaender`). `node --test tests/config.test.js` muss grün sein, die übrigen Testdateien dürfen hier noch rot sein.
- [ ] **Step 5: Commit** (`feat: Konfiguration mit Lohnbändern pro Stufe`).

### Task 2: Rechenkern

**Files:**
- Modify: `lohnsystem/src/engine.js` (Bandwahl bei 350-380, Warnung `unter_funktionsband` bei ~421, Ergebnisfeld bei 444 und 159, `pruefeAbweichung`)
- Modify: `lohnsystem/tests/abschluss-fixture.js` (Fixture-Konfigurationen mit `lohnbaender` versorgen), `tests/engine.test.js`, `tests/engine-spielraum-einarbeitung.test.js`
- Test: dieselben

**Interfaces:**
- Consumes: `config.lohnbaender` aus Task 1.
- Produces: `berechne(config, input)` liefert statt `funktionsband` das Feld `band` = `{ art: 'stufe'|'kader', min, max, ueberschreitbar }`, bei Praktikum `null`. `bandStart` und `bandMax` bleiben.
- Produces: `pruefeAbweichung(ergebnis, gewaehlterMonatslohn, begruendung)` liefert zusätzlich `ueberBandmax: boolean`.
- Entfällt: Warnung `unter_funktionsband` (die Funktion hat kein Band mehr), `funktionsband` im Ergebnis.

- [ ] **Step 1: Failing tests in `tests/engine.test.js`:** gleiche Ausbildung in zwei Funktionen (Etage und Service, Ia) ergibt denselben Vorschlag und dasselbe `band`; Kader-Funktion mit EFZ hat `band` `{art:'kader', min:6000, max:7500, ueberschreitbar:true}` und `bandStart` 6000; Nicht-Kader mit Ia hat `bandMax` 4050; Praktikum hat `band: null`; Kader mit Praktikum ebenfalls; `pruefeAbweichung` bei Kader mit 7800 und leerer Begründung `ok:false` mit Hinweis auf Begründung, mit Begründung `ok:true`, `freigabe:'GM'`, `ueberBandmax:true`; bei Kader genau 7500 `ueberBandmax:false`; Nicht-Kader über dem Maximum weiter `ok:false`.
- [ ] **Step 2:** Tests laufen lassen, Fehlschlag erwarten.
- [ ] **Step 3:** In `berechne` das Band bestimmen (Praktikum `null`; `funktion.kader === true` → `lohnbaender.kader`; sonst `{ max: lohnbaender[stufe].max, min: mindestlohn, ueberschreitbar: lohnbaender[stufe].ueberschreitbar === true }`). `bandStart` bei Kader `max(mindestlohn, band.min)`, sonst `mindestlohn`. Warnung `band_zu_eng` bleibt. `funktionsband` und `unter_funktionsband` entfernen. `pruefeAbweichung`: liegt der Lohn über `ergebnis.bandMax` und `ergebnis.band.ueberschreitbar`, dann Freigabe «GM», Begründung Pflicht, `ueberBandmax:true`.
- [ ] **Step 4:** Alle Engine-Tests und Fixtures anpassen (alte Erwartungen `unter_funktionsband` und `funktionsband` entfallen, Fixture-Funktionen verlieren Bandfelder und die Konfigurationen bekommen `lohnbaender`). `node --test tests/engine*.test.js tests/spielraum-grafik.test.js` grün.
- [ ] **Step 5: Commit** (`feat: Rechenkern liest das Lohnband aus der Stufe, Kaderband mit überschreitbarem Maximum`).

### Task 3: Editor-Logik

**Files:**
- Modify: `lohnsystem/src/config-editor.js` (Funktionsfelder bei 136-210, neue Funktion `setzeBand`, `neueJahrestabelle` bei 53)
- Test: `lohnsystem/tests/config-editor.test.js`

**Interfaces:**
- Consumes: `config.lohnbaender`.
- Produces: `setzeBand(config, bandId: string, patch: { min?: number, max?: number, ueberschreitbar?: boolean }) -> { ok, config, fehler }` im selben Ergebnisformat wie die übrigen Editor-Funktionen (`anwenden`). `bandId` ist eine Stufe oder `'kader'`. Bei Stufen ist `min` nicht erlaubt.
- Entfällt: `bandMin`, `bandMax`, `bandAlsUntergrenze` in `FUNKTION_FELDER`, in `aktualisiereFunktion` und `fuegeFunktionHinzu`.

- [ ] **Step 1: Failing tests:** `setzeBand(c, 'IIIa', {max: 5000})` setzt das Maximum; `{max: 0}` und `{max: 'x'}` sind Fehler; `{min: 4000}` bei einer Stufe ist ein Fehler; `setzeBand(c, 'kader', {min: 6500, max: 8000})` geht, `min > max` ist ein Fehler; `ueberschreitbar` nur boolean; unbekannte `bandId` ist ein Fehler; Maximum unter dem Mindestlohn der Stufe ist ein Fehler; `fuegeFunktionHinzu` ohne Bandfelder gelingt, mit Bandfeldern ist ein Fehler (unbekanntes Feld).
- [ ] **Step 2:** Fehlschlag erwarten.
- [ ] **Step 3:** `setzeBand` implementieren (Ergebnis wird über `validate` geprüft wie bei den anderen Funktionen) und die Bandfelder bei den Funktionen entfernen. Alte Bandtests ersetzen oder löschen.
- [ ] **Step 4:** `node --test tests/config-editor.test.js` grün.
- [ ] **Step 5: Commit** (`feat: Bänder pro Stufe im Konfigurations-Editor pflegen`).

### Task 4: Editor-Oberfläche

**Files:**
- Modify: `lohnsystem/config.html` (neuer Abschnitt `id="baenderTitel"` zwischen «Stufen» und «Funktionen»), `lohnsystem/src/config-editor-app.js` (Funktionsformulare bei 331-390 ohne Bandfelder, neue Zeichnung der Bandtabelle), `lohnsystem/src/config-editor.css` falls nötig

**Interfaces:**
- Consumes: `setzeBand` aus Task 3, `findeMindestlohnTabelle` für die Anzeige des Mindestlohns.

- [ ] **Step 1:** Abschnitt «Lohnbänder pro Stufe» mit Tabelle: Stufe, Ausbildung, Mindestlohn (nur Anzeige, aktuelle Tabelle), Maximum (Eingabe), Häkchen «Max überschreitbar». Zeile «Kader» mit Minimum, Maximum und Häkchen als Eingaben. Jede Änderung ruft `setzeBand`, Fehler erscheinen im vorhandenen Fehlerbereich.
- [ ] **Step 2:** Im Abschnitt «Funktionen und Bänder» (umbenennen in «Funktionen») die Felder Bandminimum, Bandmaximum und «Band als Untergrenze» aus Liste und Formular entfernen. Kader-Häkchen bleibt.
- [ ] **Step 3:** Im Browser prüfen: lokaler Server wie bisher, `config.html` öffnen, Maximum von IIIa ändern, Fehlerfall `0` eingeben, Kaderband ändern, keine Konsolenfehler.
- [ ] **Step 4: Commit** (`feat: Lohnbänder pro Stufe in der Konfigurationsoberfläche`).

### Task 5: Leseansicht, HR-Maske, Export

**Files:**
- Modify: `lohnsystem/src/lesen-app.js:55-70,175-185`, `lohnsystem/src/hr-app.js:441` (Zeile mit `e.funktionsband`), `lohnsystem/src/export.js:33`, `lohnsystem/src/spielraum-grafik.js` (nur wenn `bandMax` bei überschreitbar anders gezeigt werden soll, sonst unverändert)
- Test: `lohnsystem/tests/lesen.test.js`, `lohnsystem/tests/hr-app.test.js`, `lohnsystem/tests/export.test.js`

**Interfaces:**
- Consumes: `ergebnis.band` und `ueberBandmax` aus Task 2.

- [ ] **Step 1: Failing tests:** `lesen`: Abschnitt «Lohnbänder pro Stufe» mit sechs Stufenzeilen plus Kaderzeile (Min und Max), keine Funktionsbänder mehr; `export`: Zeile «Lohnband» zeigt Stufe oder Kader mit Min und Max, bei Praktikum keine Zeile; `hr-app`: Hinweiszeile «über dem Bandmaximum von CHF 7500.00», wenn der gewählte Lohn das Maximum übersteigt.
- [ ] **Step 2:** Fehlschlag erwarten.
- [ ] **Step 3:** Leseansicht auf die Bandtabelle umstellen, `funktionsband`-Zeilen in HR-Maske und Export durch `band` ersetzen, Hinweis bei Überschreitung in der Abrechnung mit gewähltem Lohn ergänzen.
- [ ] **Step 4:** `node --test tests/*.test.js` komplett grün.
- [ ] **Step 5: Commit** (`feat: Lohnbänder in Leseansicht, Abrechnung und Export`).

### Task 6: Gesamtprüfung

- [ ] **Step 1:** Alle Tests: `node --test tests/*.test.js` ohne Fehler.
- [ ] **Step 2:** Im Browser durchgehen: HR-Maske mit Ia in Küche und Service gleicher Lohn, Kader mit gewähltem Lohn 7800 ohne und mit Begründung, Praktikum, `lesen.html` und `config.html` ohne Konsolenfehler.
- [ ] **Step 3:** Ergebnis melden, nichts pushen ohne Auftrag.
