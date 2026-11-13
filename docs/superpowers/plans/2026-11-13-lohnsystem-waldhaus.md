# Lohnsystem Waldhaus Flims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Browser-Programm, mit dem HR des Waldhaus Flims Einstiegslöhne (brutto) nach L-GAV berechnet, plus eine Leseansicht der Lohnbänder für Mitarbeitende.

**Architecture:** Reine Rechenlogik in `lohnsystem/src/` (klassische Skripte mit UMD-Wrapper, damit sie in Node getestet werden und per `file://` im Browser laufen). Alle Zahlen (Mindestlöhne, Bänder, Bausteine, Spielraum) stehen in einer Konfigurationsdatei `config.js`, nie im Code. HR-Seite und Leseansicht lesen dieselbe Konfiguration.

**Tech Stack:** Vanilla JavaScript, HTML, Node-Testrunner (`node --test`, keine Abhängigkeiten), SheetJS für den Excel-Export (cdnjs, feste Version; dieselbe Bibliothek wie im bestehenden `Umsatz-Dashboard.html`, dort prüfen).

**Spec:** `docs/superpowers/specs/2026-11-13-lohnsystem-waldhaus-design.md`

## Global Constraints

- Nur Bruttolöhne in CHF pro Monat, Vollzeit; keine Nettolöhne, keine Sozialabzüge, keine Kinderzulagen.
- Mindestlöhne 2027: Ia 3735, Ib 3967, II 4094, IIIa 4555, IIIb 4663, IV 5325, Praktikum 2404.
- 13. Monatslohn monatlich ausbezahlt: 8,33 %, separat ausgewiesen; Mindestlohnvergleich ohne 13.-Anteil.
- Wochenstunden Vorgabe 43,5 (Betriebswert, konfigurierbar); Stundenansatz = Monatslohn / (Wochenstunden × 52 / 12), also 188,5 Stunden pro Monat.
- Erfahrung: nur einschlägig, nur ganze Jahre (0 bis 10), CHF-Betrag pro Jahr aus der Konfiguration (Entscheid von Jan, ersetzt «halbe Jahre erlaubt»).
- Sprache: Deutsch, Englisch, Französisch, Italienisch ab B2 (Muttersprache zählt gleich), CHF 20 pro Sprache, nur bei Funktionen mit Gästekontakt, `maxSprachen` 4 (keine wirksame Obergrenze). Erfahrung CHF 10 pro Jahr. (Entscheid von Jan, ersetzt «Deutsch ohne Zuschlag».)
- Einarbeitungsreduktion: höchstens 8 %, standardmässig aus; Stufe Ia/Ib bis 12 Monate (wenn nie mindestens 4 Monate in einem L-GAV-Betrieb gearbeitet), sonst 3 Monate; Stufe II/IIIa nur 3 Monate und nur bei erster L-GAV-Stelle; nie bei IIIb, IV, Praktikum; nie bei Rückkehr ins gleiche Haus mit Unterbruch unter 24 Monaten.
- Der Mindestlohn schlägt das Band-Maximum (mit Warnung). Wirksamer Bandstart = Maximum aus Bandminimum und Stufen-Mindestlohn.
- Beträge auf 5 Rappen runden.
- Programm läuft per Doppelklick (`file://`), kein Server; externe Skripte nur von cdnjs.cloudflare.com mit fester Version.
- Oberfläche auf Deutsch. Funktionsliste und Beträge in der mitgelieferten Konfiguration sind als «Beispiel» gekennzeichnet (Jan liefert die echten Werte).
- Nicht im Umfang: Lernende, Direktion, Lohnentwicklung, Speichern früherer Berechnungen.

## Review Focus

- Eintrittsdatum genau am Stichtag (31.12.2026 / 1.1.2027, Saison 30.4. / 1.5.): richtige Tabelle muss gewählt werden. Test in Task 2.
- Erfahrung über 10 Jahre, negativ, nicht auf 0,5 gerastet oder keine Zahl: wird begrenzt bzw. abgelehnt, kein NaN im Ergebnis. Test in Task 2.
- Beschäftigungsgrad 0 oder über 100: Fehler statt Lohn. Test in Task 2.
- Konfiguration mit Bandminimum unter dem Mindestlohn, Bandmaximum darunter, unbekannter Funktion oder fehlender Stufe: Warnung beziehungsweise Validierungsfehler. Tests in Task 1 und 3.
- Sprachenliste leer, nur Deutsch oder Sprachen bei Funktion ohne Gästekontakt: kein Zuschlag, keine Fehlermeldung. Test in Task 2.
- Import einer kaputten oder fremden Datei und Umlaute im Excel-Export: Fehlermeldung statt leerer Oberfläche. Tests in Tasks 6 und 7.

---

### Task 1: Konfigurationsmodell und Validierung

**Files:**
- Create: `lohnsystem/src/config.js`
- Create: `lohnsystem/config/config.js` (Standardkonfiguration)
- Test: `lohnsystem/tests/config.test.js`

**Interfaces:**
- Produces: `validateConfig(config: object): { ok: boolean, fehler: string[], warnungen: string[] }`; globale Konstante `STUFEN = ['Ia','Ib','II','IIIa','IIIb','IV','P']` (P = Praktikum); `parseConfigDatei(text: string): object` (liest den Inhalt einer exportierten `config.js` oder einer reinen JSON-Datei, wirft `Error` mit deutscher Meldung bei kaputtem Inhalt); `serializeConfig(config: object): string` (erzeugt `window.LOHN_CONFIG = {...};`).
- Modul-Export: UMD, in Node `module.exports`, im Browser `window.LohnConfig`.

Konfigurationsform (alle Zahlen aus der Spec):
`{ version, betrieb:{name, wochenstunden:43.5, dreizehnterProzent:8.33, maxErfahrungsjahre:10, einarbeitungMaxProzent:8}, mindestloehne:[{jahr, gueltigAbJahresbetrieb, gueltigAbSaison, stufen:{Ia..IV,P}}], stufen:{<Stufe>:{label, spielraumProzent}}, abteilungen:[{id,label}], funktionen:[{id,abteilung,label,gaestekontakt,bandMin,bandMax,erfahrungProJahr?,beispiel}], bausteine:{erfahrungProJahr, spracheProSprache, maxSprachen, sprachen:['EN','FR','IT'], mindestNiveau:'B2'}, zusatzbausteine:[{id,label,art:'lohn'|'entschaedigung',betrag}] }`

- [ ] **Step 1: Failing tests schreiben.** In `config.test.js`: `validateConfig` akzeptiert die Standardkonfiguration; lehnt ab (je ein Test): fehlende Mindestlohn-Stufe, `bandMin > bandMax`, Funktion mit unbekannter Abteilung, doppelte Funktions-ID, `wochenstunden <= 0`; liefert nur eine **Warnung** (kein Fehler), wenn `bandMin` unter dem Mindestlohn der Stufe IIIa liegt und wenn `bandMax` unter dem Mindestlohn von IV liegt. `parseConfigDatei(serializeConfig(c))` ergibt `c`; `parseConfigDatei('kaputt')` wirft einen Error mit dem Text «Konfigurationsdatei nicht lesbar».
- [ ] **Step 2: Tests laufen lassen, erwarteter Fehlschlag.** Run: `node --test lohnsystem/tests/config.test.js` → FAIL (Modul fehlt).
- [ ] **Step 3: `lohnsystem/src/config.js` mit den drei Funktionen implementieren.** Parsen: nach dem ersten `=` den JSON-Teil ausschneiden, sonst die ganze Datei als JSON lesen.
- [ ] **Step 4: Standardkonfiguration `lohnsystem/config/config.js` anlegen.** Inhalt: Mindestlöhne 2027 aus den Global Constraints (`gueltigAbJahresbetrieb: '2027-01-01'`, `gueltigAbSaison: '2027-05-01'`, Stichtag mit Kommentar «offen, bei Kontrollstelle klären»); die sieben Abteilungen aus der Spec; je 2 Beispiel-Funktionen pro Abteilung mit `beispiel: true` und Gästekontakt `false` für Küche und Technischer Dienst; Platzhalterbeträge (Erfahrung 50 CHF pro Jahr, Sprache 100 CHF, `maxSprachen` 2, Spielraum 3 % pro Stufe), jeweils mit `beispiel`-Kennzeichnung im Feld `hinweis`. Die Datei beginnt mit `window.LOHN_CONFIG = `.
- [ ] **Step 5: Tests laufen lassen.** Run: `node --test lohnsystem/tests/config.test.js` → PASS.
- [ ] **Step 6: Commit.** `git add lohnsystem && git commit -m "feat: Konfigurationsmodell und Validierung"`

### Task 2: Rechenkern (Stufe, Mindestlohn, Bausteine, Band, 13., Stunden)

**Files:**
- Create: `lohnsystem/src/engine.js`
- Test: `lohnsystem/tests/engine.test.js`

**Interfaces:**
- Consumes: Konfigurationsform aus Task 1.
- Produces: `bestimmeStufe(input): { stufe: string|null, warnungen: Warnung[] }`; `findeMindestlohnTabelle(config, eintritt: 'YYYY-MM-DD', vertragsart: 'unbefristet'|'saison'): { tabelle: object|null, veraltet: boolean }`; `berechne(config, input): Ergebnis`. Typen: `Warnung = { code: string, text: string }`; `Ergebnis = { modus:'berechnet'|'hinweis'|'fehler', stufe, mindestlohn, tabelleJahr, bandStart, bandMax, positionen:[{label, betrag, art:'basis'|'lohn'}], vorschlag, monatslohn, dreizehnter, totalMonat, jahresbrutto, stundenansatz, entschaedigungen:[{label, betrag}], spanne, einarbeitung, warnungen:Warnung[], fehler:string[] }`. `spanne` und `einarbeitung` füllt Task 3, hier `null`.
- `input = { funktionId, abschluss:'keiner'|'progresso'|'eba'|'efz'|'berufspruefung'|'hf'|'hotelfachschule', weiterbildung6Tage:boolean, stufeManuell?:string, erfahrungJahre:number, sprachen:[{sprache, niveau}], beschaeftigungsgrad:number (1–100), vertragsart, eintritt, sonderfall:'keiner'|'praktikum'|'unter18'|'vollzeitstudium'|'wiedereingliederung', zusatzIds:string[] }`.
- Modul-Export UMD, Browser `window.LohnEngine`.

- [ ] **Step 1: Failing tests schreiben** (Konfiguration im Test selbst aufbauen, nicht die Standardkonfiguration). `bestimmeStufe`: keiner→Ia, progresso→Ib, eba→II, efz→IIIa, efz plus `weiterbildung6Tage`→IIIb, berufspruefung→IV; `hf`/`hotelfachschule` ohne `stufeManuell` → `stufe: null` und Warnung `hf_offen`, mit `stufeManuell: 'IV'` → IV plus dieselbe Warnung. `findeMindestlohnTabelle`: Eintritt `2026-12-31` unbefristet → Tabelle 2026 (zweite Testtabelle), `2027-01-01` → 2027; Saison `2027-04-30` → 2026, `2027-05-01` → 2027; Eintritt nach `gueltigAb` der letzten Tabelle plus über ein Jahr → `veraltet: true`. `berechne` mit EFZ-Funktion (Band 4300–5600), 4 Jahre Erfahrung à 50, Gästekontakt, Sprachen `[{EN,B2},{FR,C1},{IT,B2}]`, `maxSprachen 2`, Sprache 100: positionen Basis 4555, Erfahrung 200, Sprache 200 → `vorschlag 4955.00`, `dreizehnter` = 8,33 % auf 5 Rappen gerundet, `totalMonat = monatslohn + dreizehnter`, `jahresbrutto = totalMonat × 12`, `stundenansatz = monatslohn / 188.5` auf 2 Stellen. Weitere Tests: 15 Jahre Erfahrung zählt wie 10; `erfahrungJahre: 2.3` oder `-1` oder `'x'` → `modus:'fehler'`; Küchenfunktion mit Sprachen → keine Sprachposition, kein Fehler; Sprachenliste leer oder nur `{DE,C2}` → keine Sprachposition; Niveau `B1` zählt nicht; Teilzeit 60 % → `monatslohn = vorschlag × 0.6` (gerundet), Mindestlohnvergleich auf Vollzeitbasis; Grad `0` und `101` → `modus:'fehler'`; Band zu eng (`bandMax` 4400 bei Stufe IV, Mindestlohn 5325) → `vorschlag 5325` und Warnung `band_zu_eng`; Zusatzbaustein `art:'lohn'` erhöht den Vorschlag, `art:'entschaedigung'` erscheint nur in `entschaedigungen` und ändert `totalMonat` nicht; `sonderfall:'praktikum'` → Lohn gleich Tabellenwert Stufe P, keine Erfahrungs- und Sprachposition, kein Band; `unter18`, `vollzeitstudium`, `wiedereingliederung` → `modus:'hinweis'` ohne Lohnzahlen; unbekannte `funktionId` → `modus:'fehler'`.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/engine.test.js` → FAIL.
- [ ] **Step 3: `engine.js` implementieren.** Rechenreihenfolge: Eingaben prüfen → Sonderfall → Stufe → Tabelle → Basis → Lohnbausteine → Bandstart/Bandmax → Klemmen (Mindestlohn schlägt Bandmax) → Teilzeit → 13. → Stunden. Rundung `runde5(x)` auf 5 Rappen. Mindestlohnvergleich nie auf dem 13.-Anteil.
- [ ] **Step 4: Run:** gleicher Befehl → PASS.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Rechenkern fuer Einstiegslohn"`

### Task 3: Spielraum, Einarbeitungsreduktion, Abweichungsbegründung

**Files:**
- Modify: `lohnsystem/src/engine.js`
- Test: `lohnsystem/tests/engine-spielraum-einarbeitung.test.js`

**Interfaces:**
- Consumes: `berechne`, Konfiguration aus Task 1.
- Produces: `input.einarbeitung = { aktiv:boolean, reduktionProzent:number, frueheresLGAVMonate:number, rueckkehrHausUnterbruchMonate:number|null }` (optional); `pruefeEinarbeitung(config, { stufe, einarbeitung, eintritt }): { erlaubt:boolean, maxMonate:number, grund:string }`; `Ergebnis.spanne = { min:number, max:number } | null`; `Ergebnis.einarbeitung = { erlaubt, grund, maxMonate, reduktionProzent, reduzierterMonatslohn, reduzierterTotal, volllohnAb:'YYYY-MM-DD' } | null`; `pruefeAbweichung(ergebnis, gewaehlterMonatslohn:number, begruendung:string): { ok:boolean, fehler:string[] }`.

- [ ] **Step 1: Failing tests schreiben.** `pruefeEinarbeitung`: Ia, nie L-GAV gearbeitet (0 Monate) → erlaubt, 12 Monate; Ia mit 4 früheren Monaten → 3 Monate; Ia mit 3 Monaten → 12; II/IIIa mit 0 Monaten → 3 Monate; II/IIIa mit 1 Monat → nicht erlaubt; IIIb, IV, P → nicht erlaubt; Rückkehr ins Haus nach 23 Monaten → nicht erlaubt, nach 24 → regulär nach den Stufenregeln; `reduktionProzent: 9` → Fehler im Ergebnis (`modus:'fehler'`), 8 erlaubt. `berechne` mit aktiver Einarbeitung (IIIa, 0 Monate, Eintritt `2027-03-15`, Reduktion 8 %): `reduzierterMonatslohn = runde5(monatslohn × 0.92)`, `volllohnAb = '2027-06-15'`, Warnung `stufe_ii_unsicher` nur bei Stufe II; bei Rückkehrer zeigt `einarbeitung.erlaubt === false` mit Begründungstext und `reduzierterMonatslohn` ist `null`. Ohne `einarbeitung.aktiv` bleibt `Ergebnis.einarbeitung === null`. `spanne`: Stufe mit 3 % → `min = max(vorschlag × 0.97, bandStart)`, `max = min(vorschlag × 1.03, bandMax)`, beides auf 5 Rappen; Spanne nie unter dem Mindestlohn; bei `band_zu_eng` ist `min === max === Mindestlohn`. `pruefeAbweichung`: Lohn innerhalb der Spanne ohne Begründung → ok; ausserhalb ohne Begründung (leer oder nur Leerzeichen) → Fehler «Begründung nötig»; ausserhalb mit Begründung → ok; unter dem Mindestlohn (ohne aktive, erlaubte Einarbeitung) → immer Fehler, auch mit Begründung.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/engine-spielraum-einarbeitung.test.js` → FAIL.
- [ ] **Step 3: Implementieren.** Monate addieren mit Datumsarithmetik (Monatsende beachten: 31.8. plus 6 Monate ergibt 28.2./1.3. nach Wahl, aber dokumentiert und getestet).
- [ ] **Step 4: Alle Tests laufen lassen.** Run: `node --test lohnsystem/tests` → PASS.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Spielraum und Einarbeitungsreduktion"`

### Task 4: HR-Rechner (Dropdowns, Ergebnis, Rechenweg)

**Files:**
- Create: `lohnsystem/hr.html`
- Create: `lohnsystem/src/hr-app.js`
- Create: `lohnsystem/src/hr.css`

**Interfaces:**
- Consumes: `window.LOHN_CONFIG`, `LohnEngine.berechne`, `LohnConfig.validateConfig`.
- Produces: Seite mit Formular (Abteilung → Funktion abhängig, Abschluss, Weiterbildungskästchen, HF-Stufenwahl, Erfahrung in 0,5er-Schritten, Sprachen mit Niveau, Beschäftigungsgrad, Vertragsart, Eintrittsdatum, Sonderfall, frühere L-GAV-Tätigkeit, Einarbeitungsoption, Zusatzbausteine) und Ergebnisbereich (Vorschlag, Spanne, Rechenweg Zeile für Zeile, 13.-Anteil, Total, Stundenansatz, Warnungen farblich, Entschädigungen getrennt). Funktion `renderErgebnis(ergebnis: Ergebnis): void`. Gewählter Lohn und Begründungsfeld (für Task 5): Elemente mit den IDs `gewaehlterLohn` und `begruendung`.

- [ ] **Step 1: Seite und Formular bauen.** Dropdown-Werte kommen aus der Konfiguration, nichts hart im HTML. Beispiel-Funktionen zeigen den Zusatz «(Beispiel)». Bei ungültiger Konfiguration (`validateConfig`) wird nur eine Fehlerliste angezeigt, kein Formular.
- [ ] **Step 2: Ergebnisdarstellung `renderErgebnis` schreiben.** Bei `modus:'hinweis'` nur Hinweistext, bei `'fehler'` die Fehlerliste.
- [ ] **Step 3: Im Browser prüfen** (Browser-Pane, `file://`): EFZ-Beispiel aus Task 2 ergibt 4955.00, 13.-Anteil 412.75 (8,33 %), Warnung bei gewähltem HF-Abschluss, Fehlerliste bei Beschäftigungsgrad 0, Konsole ohne Fehler. Prüfung auch bei Handybreite (375 px).
- [ ] **Step 4: Commit.** `git add lohnsystem && git commit -m "feat: HR-Rechner Oberflaeche"`

### Task 5: Abweichung, Begründung und Excel-Export

**Files:**
- Modify: `lohnsystem/hr.html`, `lohnsystem/src/hr-app.js`
- Create: `lohnsystem/src/export.js`
- Test: `lohnsystem/tests/export.test.js`

**Interfaces:**
- Consumes: `pruefeAbweichung`, `Ergebnis`.
- Produces: `baueExportZeilen(ergebnis: Ergebnis, kontext: { funktionLabel, eintritt, vertragsart, gewaehlterMonatslohn, begruendung, datum }): string[][]` (reine Funktion, testbar); `exportiereExcel(zeilen): void` (SheetJS, löst den Download aus).

- [ ] **Step 1: Failing test schreiben.** `baueExportZeilen` enthält Zeilen für Funktion, Stufe, Mindestlohn mit Tabellenjahr, jede Position, Vorschlag, Spanne, gewählten Lohn, Begründung, 13.-Anteil, Total, Stundenansatz, Entschädigungen getrennt, Einarbeitung (reduziert und voll ab Datum), Warnungen; Umlaute bleiben unverändert («Gästekontakt», «Begründung»); Einarbeitung fehlt, wenn `null`.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/export.test.js` → FAIL.
- [ ] **Step 3: `export.js` implementieren, im HR-Formular Felder `gewaehlterLohn` und `begruendung` einbinden.** Exportknopf bleibt gesperrt, solange `pruefeAbweichung` einen Fehler meldet; Fehlertext steht neben dem Knopf. SheetJS-Skript von cdnjs mit fester Version.
- [ ] **Step 4: Run:** `node --test lohnsystem/tests` → PASS; im Browser eine Excel-Datei exportieren und die Umlaute und Zahlen kontrollieren.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Abweichung mit Begruendung und Excel-Export"`

### Task 5b: Grafische Darstellung des Spielraums (Wunsch von Jan)

**Files:**
- Modify: `lohnsystem/hr.html`, `lohnsystem/src/hr-app.js`, `lohnsystem/src/hr.css`
- Create: `lohnsystem/src/spielraum-grafik.js` (UMD, Browser `window.LohnGrafik`)
- Test: `lohnsystem/tests/spielraum-grafik.test.js`

**Interfaces:**
- Consumes: `Ergebnis` (`vorschlag`, `mindestlohn`, `bandStart`, `bandMax`, `spanne`, `spanneStufen`), gewählter Vollzeit-Lohn aus `gewaehlterLohn`.
- Produces: `baueGrafikModell(ergebnis, gewaehlterLohn: number|null): { achse:{min,max}, baender:[{name:'GM'|'HR'|'Vorgesetzte', von, bis, vonProzent, bisProzent}], marken:[{art:'vorschlag'|'gewaehlt'|'mindestlohn'|'bandMax', wert, prozent, label}], freigabe:string|null } | null` (Positionen in Prozent der Achsenbreite; `null` wenn `spanneStufen` null, also Praktikum, Hinweis, Fehler); `renderGrafik(modell, zielElement): void` (SVG oder CSS-Balken, Text per `textContent`, nicht nur Farbe als Signal: Beschriftung und Muster).

- [ ] **Step 1: Failing tests schreiben.** `baueGrafikModell` mit dem EFZ-Beispiel (Vorschlag 4955, Stufen 1/2/3 %): drei Bänder in der Reihenfolge GM (aussen), HR, Vorgesetzte (innen), alle innerhalb der Achse; Marke «vorschlag» bei 4955; Marke «gewaehlt» springt mit dem gewählten Lohn, bei `null` fehlt sie; Marke «mindestlohn» nur sichtbar, wenn sie innerhalb der Achse liegt; gewählter Lohn ausserhalb des GM-Bandes wird am Achsenrand mit Hinweis «ausserhalb» angezeigt statt abgeschnitten; `band_zu_eng` (min = max = Mindestlohn) ergibt ein Modell ohne Division durch null; `null` für Praktikum.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren und unter der Spielraum-Tabelle in `hr.html` einbinden.** Die Grafik aktualisiert sich live beim Ändern von `gewaehlterLohn`, zeigt die Freigabe-Beschriftung am Balken und ist bei 375 px lesbar.
- [ ] **Step 4: Im Browser prüfen** (Server auf Port 8765, nicht starten oder stoppen): EFZ-Beispiel, gewählter Lohn 5040 steht im HR-Band, 5200 ausserhalb; Konsole ohne Fehler.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Spielraum grafisch darstellen"`

### Task 5d: 13. Monatslohn immer separat ausweisen (Wunsch von Jan)

**Files:**
- Modify: `lohnsystem/hr.html`, `lohnsystem/src/hr-app.js`, `lohnsystem/src/hr.css`, `lohnsystem/src/export.js`
- Test: `lohnsystem/tests/export.test.js`, `lohnsystem/tests/hr-app.test.js`

**Interfaces:**
- Produces: Block «Auszahlung pro Monat» in der HR-Ansicht und im Excel-Export mit den Zeilen Monatslohn brutto (Vollzeit bzw. bei X %), «13. Monatslohn (8,33 %), monatlich ausbezahlt, separat ausgewiesen» (Satz aus `betrieb.dreizehnterProzent`), Total pro Monat, Jahresbrutto, Hinweis «Mindestlohnvergleich ohne 13. Monatslohn»; die 13.-Zeile steht nie im Rechenweg.

- [ ] **Step 1: Failing tests.** `baueExportZeilen` enthält den Block in dieser Reihenfolge mit der 13.-Zeile als eigene, mit Bezeichnung hervorgehobene Zeile; der Rechenweg im Export und im Rechner enthält keine 13.-Zeile mehr; der Satz kommt aus der Konfiguration (nicht fest «8,33»); bei Teilzeit zeigt der Block Beträge für den Beschäftigungsgrad; Stundenansatz steht ausserhalb des Blocks und ohne 13.-Anteil.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren** (Oberfläche mit textContent, Zahlen als Zahlen im Export, 13.-Zeile visuell abgesetzt, nicht nur durch Farbe).
- [ ] **Step 4: Im Browser prüfen** (Server Port 8765, nicht starten oder stoppen), auch bei 375 px; Konsole ohne Fehler.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: 13. Monatslohn separat ausweisen"`

### Task 5e: Anerkennung der Abschlüsse je Funktionsbereich (L-GAV-Kommentar zu Art. 10, S. 26–27)

Der L-GAV stuft nach Abschluss **und** ausgeübter Tätigkeit ein: «Die Ausbildung muss sich auf die ausgeübte Tätigkeit im Gastgewerbe beziehen.» Ein Abschluss ist nur in den im Kommentar angekreuzten Funktionsbereichen anerkannt, sonst gilt Stufe Ia (im Streitfall entscheidet die Paritätische Aufsichtskommission). Quelle und Tabellen: Kommentar zum L-GAV, 3. Auflage 2024, S. 26–27. Die Wortlaute vor Verwendung im Original prüfen.

**Files:**
- Modify: `lohnsystem/config/config.js`, `lohnsystem/src/config.js` (Validierung), `lohnsystem/src/engine.js`, `lohnsystem/src/hr-app.js`, `lohnsystem/hr.html`, `lohnsystem/src/export.js`
- Test: `lohnsystem/tests/config.test.js`, `lohnsystem/tests/engine.test.js`, `lohnsystem/tests/hr-app.test.js`, `lohnsystem/tests/export.test.js`

**Interfaces:**
- Config neu: `bereiche: [{id,label}]` mit `kueche` (Küche), `restauration` (Restauration), `hotellerie` (Hotellerie/Hauswirtschaft), `hotelempfang` (Hotelempfang), `backoffice` (Kaufmännisches Backoffice), `hotelkommunikation` (Hotelkommunikation); `abschluesse: [{id,label,stufe:'Ib'|'II'|'IIIa'|'IV'|null,bereiche:string[]|'*'}]` (`stufe:null` = Stufe von Hand, z. B. HF, Hotelfachschule); jede Funktion bekommt `bereich: string|null` (null = nicht in den Tabellen geregelt: Spa, Technischer Dienst, Kinderbetreuung, Sicherheit u. a.).
- Engine: `input.abschluss` bleibt, wird aber als Id aus `config.abschluesse` gelesen (plus `'keiner'` = Stufe Ia). `bestimmeStufe(config, input)`: Abschluss ist anerkannt, wenn die Funktion ein `bereich` hat und es in `abschluss.bereiche` steht (oder `'*'`); dann gilt `abschluss.stufe`; bei `stufe` IIIa und `weiterbildung6Tage` gilt IIIb. Nicht anerkannt (anderer Bereich oder `bereich` null) → Stufe Ia mit Warnung `abschluss_nicht_anerkannt` («Abschluss in diesem Bereich nicht anerkannt, Einstufung Ia; Gleichwertigkeit prüft im Streitfall die Paritätische Aufsichtskommission; HR kann die Stufe von Hand wählen»). Funktion ohne `bereich` zusätzlich Warnung `bereich_ungeregelt` («Für diesen Bereich enthält der L-GAV-Kommentar keine Anerkennungstabelle; Auskunft der Kontrollstelle einholen»). `stufeManuell` überschreibt immer, mit Warnung `stufe_manuell`.

Daten für `abschluesse` (Kommentar S. 26–27; K = kueche, R = restauration, H = hotellerie, E = hotelempfang, B = backoffice, C = hotelkommunikation):
- Ib (Progresso): Küchenmitarbeiter/in [K]; Restaurationsmitarbeiter/in [R]; Hotelleriemitarbeiter/in [H]; Progresso Allrounder [K,R,H].
- II (EBA): Küchenangestellte/r EBA [K]; Restaurationsangestellte/r EBA [R]; Hotellerieangestellte/r EBA [H]; Hauswirtschaftspraktiker/in EBA [H].
- IIIa (EFZ): Koch/Köchin EFZ [K,R]; Servicefachangestellte/r EFZ [R]; Hotelfachassistent/in EFZ [H]; Gastronomiefachassistent/in EFZ (Doppellehre) [R,H] (E nur mit Zusatzausbildung Gästeempfangsassistent/in HGA: eigener Eintrag «… mit Zusatz HGA» [R,H,E]); Restaurationsfachmann/-frau EFZ [R]; Hotelfachmann/-frau EFZ [H]; Fachmann/Fachfrau Hauswirtschaft EFZ [H]; Kaufmann/Kauffrau HGT EFZ [E,B]; Kaufmann/Kauffrau EFZ [E,B]; Hotelkommunikationsfachfrau/-mann [R,H,E,C].
- IV (Fachausweis): Gastronomiekoch/-köchin FA [K]; Koch/Köchin der Spital-, Heim- und Gemeinschaftsgastronomie FA [K]; Chefkoch/Chefköchin FA [K]; Restaurationsleiter/in FA [R]; Bereichsleiter/in Restauration FA [R]; Hauswirtschaftsleiter/in FA [H]; Bereichsleiter/in Hotellerie–Hauswirtschaft FA [H]; Hotelempfangs- und Administrationsleiter/in FA [E,B]; Chef de réception FA [E,B]; Gastrobetriebsleiter/in FA [K,R].
- Ohne Stufe (von Hand): Höhere Fachschule (HF) / Hotelfachschule; Ausländischer Abschluss, 2 Jahre (wie EBA, SBFI-Gleichwertigkeit prüfen); Ausländischer Abschluss, 3 Jahre (wie EFZ, SBFI-Gleichwertigkeit prüfen); Anderer Abschluss (Gleichwertigkeit offen).
- `keiner`: Stufe Ia, in allen Bereichen.
- Funktionen: jeder Funktion der Standardliste ein `bereich` zuordnen (Küche → `kueche`; Restaurant und Bankett → `restauration`; Housekeeping → `hotellerie`; Réception inklusive Concierge, Night Auditor, Reservation → `hotelempfang`; Administration Buchhaltung und HR → `backoffice`; Sales und Marketing → `backoffice`; Spa und Wellness sowie Technischer Dienst → `null`).

- [ ] **Step 1: Failing tests.** Config: `validateConfig` akzeptiert die Standardkonfiguration; Fehler bei `abschluss.bereiche` mit unbekannter Bereich-Id, bei Funktion mit unbekanntem `bereich`, bei doppelter Abschluss-Id. Engine (je ein Test): Koch EFZ in Küche → IIIa; Koch EFZ in Service → IIIa; Koch EFZ in Housekeeping → Ia mit `abschluss_nicht_anerkannt`; Restaurationsfachfrau EFZ in Küche → Ia; Hotelfachfrau EFZ an der Réception → Ia mit Warnung; Kaufmann/Kauffrau EFZ an der Réception → IIIa; Koch EFZ plus `weiterbildung6Tage` im Service → IIIb; Chefkoch FA im Service → Ia mit Warnung (nicht anerkannt); Küchenangestellte EBA im Housekeeping → Ia; Progresso Allrounder in allen drei Bereichen → Ib; Kosmetiker-Abschluss («Anderer Abschluss») im Spa → Ia mit `bereich_ungeregelt`; `stufeManuell: 'IIIa'` überschreibt mit `stufe_manuell`; HF ohne `stufeManuell` → wie bisher `modus:'fehler'` («Stufe wählen»).
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren** (Config-Daten, Validierung, `bestimmeStufe`, Abschluss-Dropdown und Bereichsanzeige im Rechner aus der Konfiguration, Warnungen sichtbar, Export-Zeilen «Abschluss», «Funktionsbereich», «Einstufungshinweis»).
- [ ] **Step 4: Im Browser prüfen** (Server Port 8765, nicht starten oder stoppen): Koch EFZ im Service → IIIa; Koch EFZ im Housekeeping → Ia mit Warnung; Konsole ohne Fehler.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Einstufung nach Abschluss und Funktionsbereich"`

### Task 5h: Hinweis bei übersprungener Lohnstufe (Wunsch von Jan)

Zweck: Niemand soll unbemerkt mehr verdienen, als es seiner Stufe entspricht. Erreicht oder übersteigt der Lohn durch Erfahrung und Sprachzuschläge den Mindestlohn der nächsthöheren Stufe, zeigt der Rechner das an.

**Files:**
- Modify: `lohnsystem/src/engine.js`, `lohnsystem/src/hr-app.js`, `lohnsystem/src/hr.css`, `lohnsystem/src/export.js`
- Test: `lohnsystem/tests/engine.test.js`, `lohnsystem/tests/hr-app.test.js`, `lohnsystem/tests/export.test.js`

**Interfaces:**
- Produces: `pruefeStufenvergleich(config, tabelle, stufe, vollzeitLohn): { stufe, mindestlohn, ueberStufe: number, ueberStufeProzent: number, naechsteStufe: string|null, mindestlohnNaechste: number|null, uebersprungen: boolean }`. Reihenfolge der Stufen: Ia, Ib, II, IIIa, IIIb, IV (Praktikum ausgenommen: `null`); `uebersprungen` ist wahr, wenn `vollzeitLohn >= mindestlohnNaechste`. `Ergebnis.stufenvergleich` ist das Ergebnis für den Vorschlag (`null` bei Praktikum, Hinweis, Fehler); Warnung `stufe_uebersprungen` («Der Lohn liegt auf oder über dem Mindestlohn der nächsthöheren Stufe X (CHF Y). Prüfen, ob die Einstufung stimmt und ob der Lohn gegenüber Mitarbeitenden gleicher Qualifikation begründbar ist.»). Im Rechner wird zusätzlich der **gewählte** Lohn verglichen (er kann bis zur GM-Grenze über dem Vorschlag liegen).

- [ ] **Step 1: Failing tests.** Engine: Stufe IIIa (Mindestlohn 4555), nächste Stufe IIIb (4663): Vorschlag 4675 → `uebersprungen` wahr, `ueberStufe` 120, Warnung `stufe_uebersprungen`; Vorschlag 4655 → nicht übersprungen; genau 4663 → übersprungen (Gleichheit zählt); Stufe IV → `naechsteStufe` null, nie übersprungen; Stufe Ia mit Ib 3967; Praktikum → `stufenvergleich` null; Tabelle ohne die nächste Stufe → nicht übersprungen ohne Absturz. hr-app: ein reiner Helfer erzeugt aus `stufenvergleich` die Anzeigezeilen («Lohn über Stufen-Mindestlohn: +CHF X (Y %)», bei `uebersprungen` eine hervorgehobene Zeile), getestet auch für den gewählten Lohn. Export: Zeilen «Mindestlohn der Stufe», «Lohn über Stufen-Mindestlohn» (CHF und Prozent), «Nächsthöhere Stufe übersprungen: ja/nein» (mit Stufe und Betrag), jeweils für den **gewählten** Lohn.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren** (Anzeige im Ergebnisbereich unter dem Mindestlohn, Warnung farblich und mit Text, live beim Ändern des gewählten Lohns, nur sichtbar bei `modus:'berechnet'`).
- [ ] **Step 4: Im Browser prüfen** (Server Port 8765, nicht starten oder stoppen): EFZ, 10 Jahre Erfahrung, Deutsch, Englisch, Französisch und Italienisch ergibt 4555 + 100 + 80 = 4735, die Warnung erscheint (IIIb 4663); mit 0 Jahren und ohne Sprachen erscheint sie nicht; Konsole ohne Fehler.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Hinweis bei uebersprungener Lohnstufe"`

### Task 5i: Beschriftung gelernter Beruf / neue Funktion, Erfahrung, Beispiel-Hinweis (Wünsche von Jan)

**Files:**
- Modify: `lohnsystem/config/config.js`, `lohnsystem/src/config.js` (nur falls das Flag validiert wird), `lohnsystem/src/hr-app.js`, `lohnsystem/hr.html`, `lohnsystem/src/hr.css`, `lohnsystem/src/export.js`
- Test: `lohnsystem/tests/config.test.js`, `lohnsystem/tests/hr-app.test.js`, `lohnsystem/tests/export.test.js`

**Interfaces:**
- Produces: (a) Beschriftungen «Gelernter Beruf / Abschluss» (bisher «Abschluss») und «Funktion im Waldhaus (neue Stelle)»; (b) reine Funktion `baueAnerkennungsZeile(config, abschlussId, funktionId, ergebnis): { text: string, art: 'ok'|'warnung'|'offen' }` erzeugt die Vergleichszeile zwischen den beiden Feldern, zum Beispiel «Gelernt: Koch/Köchin EFZ (Küche, Restauration) → Neue Stelle: Chef de rang (Restauration): anerkannt, Stufe IIIa»; bei nicht anerkanntem Abschluss «… nicht anerkannt, Einstufung Ia»; ohne Abschluss oder Funktion `art:'offen'`; (c) Erfahrung: Label «Einschlägige Erfahrung in dieser Funktion (Jahre)» mit Hilfetext «Es zählt nur Erfahrung, die in der künftigen Funktion gesammelt wurde, nicht die Zeit im gelernten Beruf.»; (d) die Kennzeichnung «(Beispiel)» hinter den Funktionen entfällt (`beispiel` bei allen Funktionen auf `false` oder entfernt, Konfigurationstests passen sich an); stattdessen zeigt die Seite oben einen einzigen Hinweis «Lohnbänder sind Beispielwerte, bis sie freigegeben sind.», solange `betrieb.baenderBestaetigt` nicht `true` ist (Standardkonfiguration: `false`); (e) Excel-Export: getrennte Zeilen «Gelernter Beruf / Abschluss» und «Funktion im Waldhaus» sowie die Anerkennungszeile.

- [ ] **Step 1: Failing tests.** `baueAnerkennungsZeile`: Koch EFZ → Chef de rang → `ok` mit Stufe IIIa; Koch EFZ → Room Attendant → `warnung` mit «nicht anerkannt, Einstufung Ia»; kein Abschluss gewählt → `offen`; Spa-Funktion → Hinweis «Bereich nicht geregelt». Config: kein `beispiel: true` mehr an Funktionen, `betrieb.baenderBestaetigt === false`. HR: der Hinweis erscheint nur, wenn das Flag nicht `true` ist (reine Hilfsfunktion `zeigeBaenderHinweis(config)`). Export: Zeilen vorhanden und getrennt.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren** (Beschriftungen, Zeile live zwischen den Feldern, Hilfetext, Hinweis oben, Export).
- [ ] **Step 4: Im Browser prüfen** (Server Port 8765, nicht starten oder stoppen): Zeile für Koch EFZ → Chef de rang und → Room Attendant; kein «(Beispiel)» hinter den Funktionen; Hinweis oben sichtbar; Konsole ohne Fehler; 375 px ohne Horizontalscroll.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: gelernter Beruf und neue Funktion getrennt, Beispiel-Hinweis zentral"`

### Task 5k: Kader mit 50-Stunden-Woche und Überstundenpauschale (Wunsch von Jan)

Grundlage: Recherche zu L-GAV Art. 15 Ziff. 4–7 und ArG (Kommentar S. 37–43). Kader (Abteilungsleitung) arbeiten 50 Stunden pro Woche, 6,5 Stunden über der Normalarbeitszeit von 43,5; diese werden als Pauschale zu 100 % in den Bruttolohn eingerechnet und separat ausgewiesen. Rechtliche Leitplanken (im Rechner als Hinweise sichtbar): Der Mindestlohn der Stufe muss mit dem **Grundlohn** für 43,5 Stunden erreicht werden, die Pauschale darf ihn nicht auffüllen. Unter CHF 6'750 Grundlohn (ohne 13. Monatslohn) ist die Pauschale zu 100 % nur zulässig, wenn alle drei Voraussetzungen von Art. 15 Ziff. 5 erfüllt sind: Arbeitszeiterfassung nach Art. 21, monatliche schriftliche Mitteilung des Überstundensaldos, Auszahlung spätestens mit der letzten Lohnzahlung; sonst gilt 125 % (Ziff. 6). Ab CHF 6'750 kann die Überstundenentschädigung schriftlich frei vereinbart werden (Ziff. 7, im Rahmen des Gesetzes). 50 Stunden sind im Gastgewerbe die gesetzliche Höchstarbeitszeit (Art. 9 ArG); Überzeit darüber ist zuschlagspflichtig.

**Files:**
- Modify: `lohnsystem/config/config.js`, `lohnsystem/src/config.js`, `lohnsystem/src/engine.js`, `lohnsystem/src/hr-app.js`, `lohnsystem/src/export.js`, `lohnsystem/hr.html` (falls nötig)
- Test: `lohnsystem/tests/config.test.js`, `lohnsystem/tests/engine.test.js`, `lohnsystem/tests/hr-app.test.js`, `lohnsystem/tests/export.test.js`

**Interfaces:**
- Config neu: `betrieb.kaderWochenstunden: 50`, `betrieb.ueberstundenSatz: 1.0` (Jan: 100 %), `betrieb.ueberstundenGrenze6750: 6750`, `betrieb.dreizehnterInklPauschale: true` (13. Monatslohn auf Grundlohn plus Pauschale, vorsichtige Variante); Funktionen bekommen `kader: boolean` (Standard `false`).
- Engine: `rechneBetraege(config, vollzeitLohn, { beschaeftigungsgrad, einarbeitung, kader })` liefert zusätzlich `ueberstundenpauschale` (Monatsbetrag, null wenn nicht Kader), `pauschaleStundenProMonat` (6,5 × 52 / 12 = 28,17), `pauschale125` (Vergleichswert bei 125 %); Pauschale = `runde5(vollzeitLohn / (betrieb.wochenstunden × 52 / 12) × (kaderWochenstunden − wochenstunden) × 52 / 12 × satz)`, bei Teilzeit auf den Beschäftigungsgrad skaliert (Kader in Teilzeit: Wochenstunden-Differenz proportional); `dreizehnter` auf Grundlohn plus Pauschale, wenn `dreizehnterInklPauschale`; `totalMonat` = Grundlohn + Pauschale + 13.; Mindestlohnvergleich, Band, Spielraum, Stufenvergleich und Stundenansatz bleiben auf dem Grundlohn. `Ergebnis.kader = { aktiv, pauschale, pauschale125, stundenProMonat, grundlohnUnterGrenze: boolean }`. Neue Warnung `kader_voraussetzungen` (nur wenn Grundlohn unter 6750 und Satz kleiner als 1,25): «Pauschale zu 100 % nur zulässig bei Arbeitszeiterfassung (Art. 21 L-GAV), monatlicher schriftlicher Saldomitteilung und Auszahlung spätestens mit der letzten Lohnzahlung; sonst 125 % (CHF X). Eine 50-Stunden-Normalarbeitszeit ist unter CHF 6'750 nicht vereinbar, es handelt sich um Überstunden.»; Hinweis `kader_ab_grenze` ab 6750 («Überstundenentschädigung kann schriftlich frei vereinbart werden, Art. 15 Ziff. 7»); Hinweis `kader_hoechstarbeitszeit` («50 Stunden = gesetzliche Höchstarbeitszeit im Gastgewerbe, Überzeit darüber mit 25 % Zuschlag»).
- UI/Export: Block «Auszahlung pro Monat» zeigt für Kader «Grundlohn (43,5 h)», «Überstundenpauschale (6,5 h pro Woche, 28,17 h pro Monat, 100 %)» als eigene Zeile, «13. Monatslohn (auf Grundlohn plus Pauschale)», Total, Jahresbrutto; Hinweise sichtbar; Export mit denselben Zeilen aus `kontext.betraege`.

- [ ] **Step 1: Failing tests.** Config: Funktion mit `kader:true` valide, Standardwerte; Validierung `kaderWochenstunden` > `wochenstunden` und höchstens 50, `ueberstundenSatz` ≥ 1. Engine: Grundlohn 5325: Stundenansatz 28.25 (5325 / 188.5), Pauschale 795.80 bei 100 % (28,1667 h) und 994.75 bei 125 %, 13. Monatslohn auf 6120.80 × 8,33 %, Total; Kader mit Grundlohn ≥ 6750 → Hinweis `kader_ab_grenze`, keine Warnung `kader_voraussetzungen`; Nicht-Kader unverändert (`kader` null, keine Pauschale); Mindestlohn auf Grundlohn (Pauschale füllt nicht auf); Teilzeit 80 %; `dreizehnterInklPauschale: false`. UI: reiner Helfer für die Auszahlungszeilen erweitert (Reihenfolge, Beschriftung), Hinweise. Export: Zeilen vorhanden, Zahlen als Zahlen.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren** (Config-Flag `kader` für die Funktionen der Abteilungsleitung laut Jan, Engine, Anzeige, Export).
- [ ] **Step 4: Im Browser prüfen** (Server Port 8765, nicht starten oder stoppen): Chef de cuisine, Stufe IV, Grundlohn 5325: Pauschale 795.80, Total inkl. 13., Warnung `kader_voraussetzungen` sichtbar; Nicht-Kader ohne Pauschale; Konsole ohne Fehler.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Kader mit 50-Stunden-Woche und Ueberstundenpauschale"`

### Task 5l: Strikt nach Stufe, das Funktionsband hebt nicht mehr an (Entscheid von Jan: «strikt Ia»)

Bisher galt als Untergrenze das Maximum aus Funktions-Bandminimum und Stufen-Mindestlohn: Wer wegen eines nicht anerkannten Abschlusses nur Stufe Ia hat (zum Beispiel Hotelfachfrau an der Réception), wurde auf das Band der Funktion (IIIa, 4555) angehoben. Neu gilt strikt die Stufe: Untergrenze ist der **L-GAV-Mindestlohn der Stufe** der Person, das Funktions-Bandminimum hebt nicht mehr an und bleibt Orientierung für die Funktion.

**Files:**
- Modify: `lohnsystem/src/engine.js`, `lohnsystem/src/hr-app.js`, `lohnsystem/src/export.js`
- Test: `lohnsystem/tests/engine.test.js`, `lohnsystem/tests/engine-spielraum-einarbeitung.test.js`, `lohnsystem/tests/hr-app.test.js`, `lohnsystem/tests/export.test.js`

**Interfaces:**
- Engine: wirksamer Bandstart = Stufen-Mindestlohn (statt `max(bandMin, Mindestlohn)`); Bandmaximum der Funktion begrenzt weiterhin nach oben, der Mindestlohn schlägt das Bandmaximum (Warnung `band_zu_eng` wie bisher); Spielraum-Untergrenze und Freigabe-Bereiche beziehen sich auf den Stufen-Mindestlohn (nicht auf das Funktionsband). `Ergebnis.bandStart` ist jetzt der Stufen-Mindestlohn, `Ergebnis.funktionsband = { min, max }` zeigt das Band der Funktion. Neuer Hinweis `unter_funktionsband` (nur wenn der Vorschlag unter dem Funktions-Bandminimum liegt): «Der Lohn liegt unter dem Lohnband der Funktion (CHF X bis Y), weil die Einstufung der Person (Stufe Z) tiefer ist als die typische Stufe der Funktion. Einstufung und Anerkennung des Abschlusses prüfen.»
- UI: die Ergebniszeile zeigt «Stufe …, Mindestlohn CHF … (Tabelle …), Lohnband der Funktion CHF … bis …»; der Hinweis erscheint in der Warnliste; Excel-Export: Zeile «Lohnband der Funktion» (von–bis) und der Hinweis.
- Die Stufen- und Einarbeitungs-Logik, `Stufenvergleich`, Kader-Pauschale und Anerkennung bleiben unverändert.

- [ ] **Step 1: Failing tests.** Engine: Hotelfachfrau (Abschluss nicht anerkannt → Ia) als Receptionist (Band 4555–4900): Vorschlag 3735 ohne Zuschläge (nicht 4555), mit 5 Jahren Erfahrung 3785, Hinweis `unter_funktionsband`, keine Anhebung; Kaufmann/Kauffrau HGT EFZ als Receptionist (IIIa): Vorschlag 4555, kein Hinweis `unter_funktionsband`; Gastronomiekoch FA (IV) in einer Funktion mit Band 4555–4900: Mindestlohn schlägt das Bandmaximum, Vorschlag 5325, Warnung `band_zu_eng`; Spielraum/Freigabe unten bei 3735 beginnend für Ia; Praktikum unverändert. Die Tests aus Task 5e und 5h, die das Anheben auf das Funktions-Bandminimum festhielten (erwartetes `stufe_uebersprungen` bei Ia/Ib am Bandboden), werden auf das neue Verhalten angepasst: die erwarteten Warncodes und Beträge stimmen mit der neuen Untergrenze überein, nicht abgeschwächt.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren** (Engine, Anzeige, Export).
- [ ] **Step 4: Im Browser prüfen** (Server Port 8765, nicht starten oder stoppen): Hotelfachfrau-Beispiel (Abschluss «Hotelfachmann/-frau EFZ», Funktion Receptionist) zeigt 3735 mit dem Hinweis; Konsole ohne Fehler.
- [ ] **Step 5: Commit.** `git add` mit expliziten Pfaden, `git commit -m "feat: strikt nach Stufe, Funktionsband hebt nicht mehr an"`

### Task 5n: Abrechnung mit dem gewählten Lohn direkt unter dem Feld (Wunsch von Jan)

Zweck: Unter dem Feld «Gewählter Vollzeit-Monatslohn» steht live die komplette Abrechnung für diesen Lohn, nicht nur für den Vorschlag. Bildschirm und Excel-Export zeigen dieselbe Rechnung (`rechneBetraege` mit dem gewählten Lohn, `kontext.betraege`).

**Files:**
- Modify: `lohnsystem/src/hr-app.js`, `lohnsystem/hr.html`, `lohnsystem/src/hr.css`
- Test: `lohnsystem/tests/hr-app.test.js`

**Interfaces:**
- Produces: reiner Helfer `baueWahlAbrechnung(config, ergebnis, gewaehlterLohn, kontext): { titel, zeilen:[{label, betrag, art}], differenz:{ chf, prozent }|null } | null` (`null` bei leerem oder ungültigem Lohn, Sonderfall, Hinweis, Fehler); Zeilen wie im Block «Auszahlung pro Monat» (Monatslohn brutto Vollzeit bzw. bei X %, Überstundenpauschale nur bei Kader, 13. Monatslohn mit Satz aus der Konfiguration separat, Total pro Monat, Jahresbrutto) plus Stundenansatz ohne 13. Monatslohn; bei aktiver und erlaubter Einarbeitung zusätzlich die reduzierten Beträge; `differenz` = gewählter Lohn minus Vorschlag in CHF und Prozent (eine Nachkommastelle), `null` bei gleichem Lohn. Der Block erscheint direkt unter dem Feld `gewaehlterLohn` (vor Begründung und Export-Knopf), live bei jeder Eingabe, mit Titel «Abrechnung mit gewähltem Lohn (CHF X)».

- [ ] **Step 1: Failing tests.** `baueWahlAbrechnung` für Vorschlag 4675, gewählt 5000 (Vollzeit): 13. Monatslohn 416.50, Total 5416.50, Jahresbrutto 64998.00, Stundenansatz 26.53, `differenz` +325.00 und 7,0 %; gleicher Lohn → `differenz` null und Zeilen identisch mit denen des Vorschlags; Teilzeit 60 %; Kader (Pauschale und 13. auf Grundlohn plus Pauschale); Einarbeitung aktiv; ungültiger oder leerer Lohn → `null`; Satz aus der Konfiguration (anderer Satz im Test).
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren** (Helfer wiederverwendet `rechneBetraege`, Block unter dem Feld, textContent, Hervorhebung der Differenz mit Text).
- [ ] **Step 4: Im Browser prüfen** (Server Port 8765, nicht starten oder stoppen): Wert ändern, die Abrechnung aktualisiert sich live; 375 px ohne Horizontalscroll; Konsole ohne Fehler.
- [ ] **Step 5: Commit.** `git add` mit expliziten Pfaden, `git commit -m "feat: Abrechnung mit gewaehltem Lohn unter dem Feld"`

### Task 5m: Erklärung bei den Stufen (Wunsch von Jan)

Zweck: Die Stufen-Titel (Ia, Ib, II, IIIa, IIIb, IV, Praktikum) sagen allein nichts. Überall, wo eine Stufe vorkommt, steht eine kurze Erklärung.

**Files:**
- Modify: `lohnsystem/config/config.js`, `lohnsystem/src/config.js`, `lohnsystem/src/hr-app.js`, `lohnsystem/hr.html`, `lohnsystem/src/lesen-app.js`, `lohnsystem/lesen.html` (falls nötig), `lohnsystem/src/export.js`
- Test: `lohnsystem/tests/config.test.js`, `lohnsystem/tests/hr-app.test.js`, `lohnsystem/tests/lesen.test.js`, `lohnsystem/tests/export.test.js`

**Interfaces:**
- Config: `stufen.<S>.erklaerung` (Text) für Ia «ohne Berufslehre», Ib «ohne Berufslehre, mit Progresso-Abschluss», II «zweijährige Grundbildung (EBA)», IIIa «Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)», IIIb «EFZ plus 6 Tage berufsspezifische Weiterbildung», IV «Berufsprüfung (eidg. Fachausweis)», P «Praktikant/in einer anerkannten Hotelfachschule»; `validateConfig` verlangt die Erklärung für jede Stufe der Mindestlohn-Tabelle. Reiner Helfer `stufeMitErklaerung(config, stufe): string` («Stufe IIIa, Berufslehre mit eidg. Fähigkeitszeugnis (EFZ)»), bei fehlender Erklärung nur «Stufe IIIa».
- UI: Ergebniszeile («Stufe IIIa, Berufslehre mit EFZ …»), Dropdown «Stufe von Hand wählen» (Option mit Erklärung), Anerkennungszeile, die Hinweise mit Stufennamen; Leseansicht: eigene Spalte «Erklärung» in der Mindestlohn-Tabelle; Excel-Export: Zeile «Stufe» mit Erklärung.

- [ ] **Step 1: Failing tests.** Config: jede Stufe hat eine Erklärung; Validierungsfehler bei fehlender Erklärung; `stufeMitErklaerung` für IIIa, für Praktikum, für unbekannte Stufe; Leseansicht-Modell: Mindestlohn-Zeilen enthalten `erklaerung`; Export: Zeile «Stufe» enthält den Text; Dropdown-Optionen (reiner Helfer) enthalten die Erklärung.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/*.test.js` → FAIL.
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Im Browser prüfen** (Server Port 8765, nicht starten oder stoppen): hr.html und lesen.html zeigen die Erklärungen; 375 px ohne Horizontalscroll; Konsole ohne Fehler.
- [ ] **Step 5: Commit.** `git add` mit expliziten Pfaden, `git commit -m "feat: Erklaerung bei den Stufen"`

### Task 6: Konfigurations-Editor, Import und Export, Jahrespflege

**Files:**
- Create: `lohnsystem/config.html`
- Create: `lohnsystem/src/config-editor.js`
- Test: `lohnsystem/tests/config-editor.test.js`

**Interfaces:**
- Consumes: `validateConfig`, `parseConfigDatei`, `serializeConfig`.
- Produces: Funktionen `neueJahrestabelle(config, jahr: number, prozent: number): object` (kopiert die letzte Tabelle, multipliziert Stufenwerte mit `1 + prozent/100`, rundet auf ganze Franken, setzt `gueltigAbJahresbetrieb` auf `jahr-01-01` und `gueltigAbSaison` auf `jahr-05-01`, die alten Tabellen bleiben); `fuegeBausteinHinzu(config, baustein): object` (prüft eindeutige ID und gültige `art`). Seite zum Bearbeiten der Konfiguration (Mindestlohn-Tabellen, Funktionen und Bänder, Bausteinbeträge, Spielraum pro Stufe, Zusatzbausteine) mit «Exportieren» (Download `config.js`), «Importieren» (Datei wählen) und «Standard wiederherstellen». Entwurfs-Zwischenspeicher nur innerhalb des Editors: `localStorage` (mit try/catch, Seite funktioniert ohne).

- [ ] **Step 1: Failing tests schreiben.** `neueJahrestabelle(c, 2028, 0.6)` ergibt Ia 3757 (3735 × 1,006 gerundet), die 2027-Tabelle bleibt unverändert, `gueltigAbSaison` ist `2028-05-01`; doppelte Baustein-ID wird abgelehnt; unbekannte `art` wird abgelehnt; zwei Bausteine mit `art:'entschaedigung'` (Spesen, private IT) lassen sich hinzufügen und die validierte Konfiguration bleibt gültig.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/config-editor.test.js` → FAIL.
- [ ] **Step 3: Implementieren, Editor-Seite bauen.** Jede Änderung läuft durch `validateConfig`; Fehler verhindern das Exportieren, Warnungen werden angezeigt. Import einer kaputten oder fremden Datei zeigt «Konfigurationsdatei nicht lesbar» und lässt die bestehende Konfiguration unverändert. `hr.html` und `lesen.html` lesen **immer nur** `config/config.js`, nie den Browserspeicher, damit alle Personen mit denselben Zahlen rechnen. Der Editor zeigt an, wenn sein Entwurf von `config/config.js` abweicht («Entwurf noch nicht veröffentlicht, Datei exportieren und ersetzen»).
- [ ] **Step 4: Run:** `node --test lohnsystem/tests` → PASS; im Browser Import einer absichtlich kaputten Datei prüfen.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Konfigurations-Editor mit Import, Export und Jahrespflege"`

### Task 7: Leseansicht für Mitarbeitende

**Files:**
- Create: `lohnsystem/lesen.html`
- Create: `lohnsystem/src/lesen-app.js`
- Test: `lohnsystem/tests/lesen.test.js`

**Interfaces:**
- Consumes: `window.LOHN_CONFIG` (Standardkonfiguration, `config/config.js`).
- Produces: `baueLeseModell(config, datum: 'YYYY-MM-DD'): { jahr, mindestloehne:[{stufe,label,betrag}], baender:[{abteilung, funktionen:[{label, bandMin, bandMax}]}], regeln:{ erfahrungProJahr, maxErfahrungsjahre, spracheProSprache, maxSprachen, sprachen, mindestNiveau }, hinweise:string[] }`. Das Modell enthält **keinen** Spielraum und **keine** Einarbeitungsreduktion. Seite ohne Eingabefelder und ohne Personendaten; eigenständig, einbettbar (kein Verweis auf HR-Seiten).

- [ ] **Step 1: Failing tests schreiben.** Das Modell enthält Bänder je Abteilung und die Mindestlöhne der zum Datum gültigen Tabelle; die Schlüssel `spielraumProzent` und `einarbeitung` kommen nirgends im Modell vor (Test über `JSON.stringify(modell)`); Funktionen mit `beispiel:true` bleiben gekennzeichnet; leere Konfiguration führt zu einem lesbaren Hinweis statt Absturz.
- [ ] **Step 2: Run:** `node --test lohnsystem/tests/lesen.test.js` → FAIL.
- [ ] **Step 3: Implementieren und Seite bauen** (Tabellen pro Abteilung, Mindestlöhne, Regeln der Bausteine in Klartext, Hinweis «Bruttolöhne pro Monat, Vollzeit, 13. Monatslohn separat»).
- [ ] **Step 4: Run:** `node --test lohnsystem` → PASS; im Browser bei 375 px Breite und per `<iframe>` in einer Testseite prüfen, dass nichts abgeschnitten wird.
- [ ] **Step 5: Commit.** `git add lohnsystem && git commit -m "feat: Leseansicht fuer Mitarbeitende"`

### Task 8: Anleitung und Abschlussprüfung

**Files:**
- Create: `lohnsystem/README.md`

- [ ] **Step 1: Anleitung für HR schreiben** (Deutsch, kurz): Ablage des Ordners `lohnsystem` in einem gemeinsamen Laufwerkordner (HR nur lesend, eine Person pflegt `config/config.js`), Start per Doppelklick auf `hr.html`, jährlich neue Tabelle anlegen, Bausteine hinzufügen, Konfiguration exportieren und die Datei `config/config.js` ersetzen, Leseansicht veröffentlichen. Dazu die offenen Punkte aus der Spec (Funktionsliste, Beträge und Spielraum von Jan, Fragen an die Kontrollstelle) und der Hinweis, dass die Beispieldaten ersetzt werden müssen.
- [ ] **Step 2: Gesamtlauf.** Run: `node --test lohnsystem` → alle PASS. Im Browser: Rechner, Editor und Leseansicht je einmal durchspielen und prüfen, dass der Rechner mit den Werten aus dem Editor rechnet und dass die Leseansicht dieselben Mindestlöhne zeigt.
- [ ] **Step 3: Commit.** `git add lohnsystem && git commit -m "docs: Anleitung fuer HR"`
