# Lohnbänder pro Stufe und Kaderband – Entwurf

Stand: 15.11.2026, Lohnsystem Waldhaus Flims, Ordner `lohnsystem/`. Entwurf zur Freigabe durch Jan.

## Ziel und Grund

Der Lohn einer Person wird durch ihre Ausbildung festgelegt. Darum hängt das Lohnband heute an der falschen Stelle: Es steht bei jeder Funktion einzeln (Min und Max), obwohl die Berechnung schon «strikt nach Stufe» startet. Gleiche Ausbildung soll gleich viel Lohn bedeuten, egal in welcher Funktion. Beispiele von Jan: Ein Ungelernter auf der Etage verdient gleich viel wie ein Ungelernter im Service. Alle Chef de partie und Chef de rang haben dasselbe Band.

Jan will die Bänder in einem eigenen Teil der Konfiguration sehen und von Hand eingeben können.

## Entscheide von Jan

- Das Band hängt an der Person (Ausbildung, Stufe), nicht an der Funktion.
- Kader bekommen ein eigenes Band von 6'000 bis 7'500, unabhängig von der Ausbildung. Es gilt für alle zehn Kader-Funktionen.
- Bei Kadern darf der gewählte Lohn über dem Bandmaximum liegen und wird trotzdem berechnet.
- Stufe Ib (Progresso) hat das Maximum 4'450, wie Stufe II.
- Die Berechnung ist pro Stufe, die Funktion bestimmt keinen Lohn mehr.

## Nicht-Ziele

- Keine Änderung der Mindestlohn-Tabellen pro Jahr, der Erfahrungs- und Sprachzuschläge, des 13. Monatslohns oder der Überstundenpauschale.
- Keine Änderung der Stufenbestimmung aus Abschluss und Weiterbildung.
- Kein Ausbau der Freigabestufen (Vorgesetzte 1 %, HR 2 %, GM 3 %).

## Ansätze

- **A. Eigene Bandtabelle in der Konfiguration (gewählt).** Neuer Block `lohnbaender` mit einer Zeile pro Stufe plus «kader». Die Funktionen verlieren Min und Max. Die Berechnung liest das Band daraus. Jede Zahl steht an einer Stelle. Dafür werden Rechenkern, Editor und Tests umgebaut.
- **B. Bänder bleiben bei den Funktionen, ein Knopf füllt sie.** Wenig Umbau, aber die Zahlen stehen doppelt, und die Berechnung folgt weiter der Funktion. Erfüllt Jans Regel nicht.
- **C. Nur eine Ansicht.** Ändert nichts am Lohn. Erfüllt das Ziel nicht.

Jan hat die Wahl dem Bauenden überlassen, A ist die Empfehlung.

## Design

### Bandtabelle

`config.lohnbaender`, ein Eintrag pro Stufe `Ia`, `Ib`, `II`, `IIIa`, `IIIb`, `IV` und ein Eintrag `kader`:

| Band | Minimum | Maximum | Max überschreitbar |
|---|---|---|---|
| Ia | Mindestlohn der Stufe | 4'050 | nein |
| Ib | Mindestlohn der Stufe | 4'450 | nein |
| II | Mindestlohn der Stufe | 4'450 | nein |
| IIIa | Mindestlohn der Stufe | 4'900 | nein |
| IIIb | Mindestlohn der Stufe | 5'000 | nein |
| IV | Mindestlohn der Stufe | 5'700 | nein |
| Kader | 6'000 | 7'500 | ja |

Bei den Stufen wird nur das Maximum gespeichert. Das Minimum ist der Mindestlohn der Eintrittstabelle und ändert sich mit dem Jahr. Nur beim Kaderband stehen Min und Max in der Konfiguration. Die Werte der Stufen Ia, II, IIIa, IIIb, IV stammen aus den heutigen Funktionsbändern, Ib von Jan.

### Berechnung

1. Die Stufe kommt aus dem Abschluss wie bisher, auch bei «Anderer Abschluss» (Stufe von Hand gewählt).
2. Welches Band gilt: Praktikum hat kein Band, der Vorschlag ist der Mindestlohn der Stufe P. Ist die Funktion Kader (`kader: true`), gilt das Kaderband, sonst das Band der Stufe.
3. Start: bei Kader das höhere von Mindestlohn der Stufe und Kaderminimum (6'000), sonst der Mindestlohn der Stufe. Das ersetzt `bandAlsUntergrenze`.
4. Vorschlag: Summe aus Basis, Erfahrung, Sprachen und Lohn-Zusatzbausteinen, begrenzt auf Start und Bandmaximum.
5. Ist das Bandmaximum kleiner als der Mindestlohn, gilt der Mindestlohn wie bisher mit Warnung.

### Kader über dem Maximum

- Gilt nur für Bänder mit `ueberschreitbar: true`, heute das Kaderband. Der Vorschlag bleibt auf dem Maximum begrenzt.
- Ein gewählter Lohn über dem Maximum wird berechnet, nach unten gilt weiter der Mindestlohn der Stufe.
- Er braucht eine Begründung und gilt als Freigabe «GM».
- In der Abrechnung steht ein Hinweis «über dem Bandmaximum von CHF …».
- Innerhalb des Bandes gelten die Freigabestufen wie bisher.

### Konfiguration und Editor

- `bandMin`, `bandMax` und `bandAlsUntergrenze` entfallen bei den Funktionen. Die Funktionen behalten Gästekontakt, Kader, Abteilung und Funktionsbereich.
- Neuer Teil in `config.html`: «Lohnbänder pro Stufe». Eine Tabelle mit Stufe, Ausbildung, Mindestlohn (nur Anzeige), Maximum (Eingabe) und Häkchen «Max überschreitbar». Das Kaderband hat Min und Max als Eingabe.
- Prüfung beim Speichern: Maximum grösser als der Mindestlohn aller Jahrestabellen der Stufe. Kaderminimum nicht über dem Kadermaximum.
- Beim Anlegen einer neuen Jahrestabelle bleiben die Bänder unverändert, ein zu tiefes Maximum wird als Fehler gemeldet.

### Anzeige

- Leseansicht (`lesen.html`) zeigt die Bänder pro Stufe statt pro Funktion.
- HR-Maske und Spielraum-Grafik lesen das Band aus dem Ergebnis, die Felder `bandStart` und `bandMax` bleiben.

### Folgen für heutige Werte

- Sechs Kader-Funktionen steigen von 5'325 bis 5'700 auf 6'000 bis 7'500.
- Der Tournant (heute 4'663 bis 5'100) hat künftig das Band seiner Stufe.
- Wer eine Funktion mit höherem Band ohne passende Ausbildung besetzt, bekommt das Band seiner Ausbildung, zum Beispiel ein Commis ohne Lehre das Band Ia.

## Zu prüfen beim Bau

- Alle Tests rund um `bandMin`, `bandMax`, `bandAlsUntergrenze` und `funktionsband` anpassen (Konfiguration, Editor, Engine, Leseansicht, Spielraum-Grafik).
- Neue Tests: gleiche Ausbildung in verschiedenen Funktionen gibt gleichen Lohn, Kaderband unabhängig von der Ausbildung, gewählter Lohn über dem Kadermaximum, Praktikum ohne Band, Ib.

## Eigene Annahmen (bitte prüfen)

- Das Stufenmaximum ist nicht pro Jahr getrennt, ein Satz Bänder gilt für alle Tabellen.
- Über dem Maximum gibt es keine zweite Obergrenze, nur Begründung und Freigabe GM.
- Das Häkchen «Max überschreitbar» gibt es für jedes Band, ist aber nur beim Kaderband gesetzt.
- Die Spielraum-Prozente (1 / 2 / 3 %) gelten unverändert auch im Kaderband.
