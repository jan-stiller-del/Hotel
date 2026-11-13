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
- Erfahrung: nur einschlägig, halbe Jahre erlaubt, höchstens 10 Jahre, CHF-Betrag pro Jahr aus der Konfiguration.
- Sprache: Englisch, Französisch, Italienisch ab B2 (Muttersprache zählt gleich), nur bei Funktionen mit Gästekontakt, Obergrenze `maxSprachen`; Deutsch ohne Zuschlag.
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
