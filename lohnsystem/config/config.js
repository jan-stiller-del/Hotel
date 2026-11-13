window.LOHN_CONFIG = {
  "version": 1,
  "betrieb": {
    "name": "Waldhaus Flims",
    "wochenstunden": 43.5,
    "dreizehnterProzent": 8.33,
    "maxErfahrungsjahre": 10,
    "einarbeitungMaxProzent": 8
  },
  // Stichtag der Mindestlohn-Tabelle (Jahresbetrieb 1.1.2027, Saison 1.5.2027): offen, bei Kontrollstelle klären
  "mindestloehne": [
    {
      "jahr": 2027,
      "gueltigAbJahresbetrieb": "2027-01-01",
      "gueltigAbSaison": "2027-05-01",
      "stufen": { "Ia": 3735, "Ib": 3967, "II": 4094, "IIIa": 4555, "IIIb": 4663, "IV": 5325, "P": 2404 }
    }
  ],
  "stufen": {
    "Ia":   { "label": "Stufe Ia",   "spielraumProzent": 3, "hinweis": "Beispiel: Platzhalterwert" },
    "Ib":   { "label": "Stufe Ib",   "spielraumProzent": 3, "hinweis": "Beispiel: Platzhalterwert" },
    "II":   { "label": "Stufe II",   "spielraumProzent": 3, "hinweis": "Beispiel: Platzhalterwert" },
    "IIIa": { "label": "Stufe IIIa", "spielraumProzent": 3, "hinweis": "Beispiel: Platzhalterwert" },
    "IIIb": { "label": "Stufe IIIb", "spielraumProzent": 3, "hinweis": "Beispiel: Platzhalterwert" },
    "IV":   { "label": "Stufe IV",   "spielraumProzent": 3, "hinweis": "Beispiel: Platzhalterwert" },
    "P":    { "label": "Praktikum",  "spielraumProzent": 3, "hinweis": "Beispiel: Platzhalterwert" }
  },
  "abteilungen": [
    { "id": "reception", "label": "Réception und Reservation" },
    { "id": "housekeeping", "label": "Housekeeping (inklusive Lingerie)" },
    { "id": "kueche", "label": "Küche" },
    { "id": "service", "label": "Restaurant und Bankett (Service)" },
    { "id": "spa", "label": "Spa und Wellness" },
    { "id": "technik", "label": "Technischer Dienst" },
    { "id": "administration", "label": "Administration (Buchhaltung, HR, Sales und Marketing)" }
  ],
  "funktionen": [
    { "id": "reception-mitarbeiter", "abteilung": "reception", "label": "Réceptionist/in", "gaestekontakt": true, "bandMin": 4600, "bandMax": 5900, "beispiel": true },
    { "id": "reception-leitung", "abteilung": "reception", "label": "Leiter/in Réception", "gaestekontakt": true, "bandMin": 5400, "bandMax": 7200, "beispiel": true },
    { "id": "housekeeping-mitarbeiter", "abteilung": "housekeeping", "label": "Zimmermädchen / Roomboy", "gaestekontakt": true, "bandMin": 4600, "bandMax": 5600, "beispiel": true },
    { "id": "housekeeping-leitung", "abteilung": "housekeeping", "label": "Leiter/in Housekeeping", "gaestekontakt": true, "bandMin": 5400, "bandMax": 7000, "beispiel": true },
    { "id": "kueche-koch", "abteilung": "kueche", "label": "Koch / Köchin", "gaestekontakt": false, "bandMin": 4700, "bandMax": 6000, "beispiel": true },
    { "id": "kueche-leitung", "abteilung": "kueche", "label": "Sous-Chef / Küchenchef", "gaestekontakt": false, "bandMin": 5600, "bandMax": 8000, "beispiel": true },
    { "id": "service-mitarbeiter", "abteilung": "service", "label": "Servicefachangestellte/r", "gaestekontakt": true, "bandMin": 4600, "bandMax": 5800, "beispiel": true },
    { "id": "service-leitung", "abteilung": "service", "label": "Restaurantleiter/in", "gaestekontakt": true, "bandMin": 5500, "bandMax": 7500, "beispiel": true },
    { "id": "spa-mitarbeiter", "abteilung": "spa", "label": "Spa-Therapeut/in", "gaestekontakt": true, "bandMin": 4600, "bandMax": 5900, "beispiel": true },
    { "id": "spa-leitung", "abteilung": "spa", "label": "Leiter/in Spa", "gaestekontakt": true, "bandMin": 5500, "bandMax": 7300, "beispiel": true },
    { "id": "technik-mitarbeiter", "abteilung": "technik", "label": "Haustechniker/in", "gaestekontakt": false, "bandMin": 4700, "bandMax": 6100, "beispiel": true },
    { "id": "technik-leitung", "abteilung": "technik", "label": "Leiter/in Technischer Dienst", "gaestekontakt": false, "bandMin": 5600, "bandMax": 7500, "beispiel": true },
    { "id": "administration-mitarbeiter", "abteilung": "administration", "label": "Sachbearbeiter/in Administration", "gaestekontakt": true, "bandMin": 4700, "bandMax": 6200, "beispiel": true },
    { "id": "administration-leitung", "abteilung": "administration", "label": "Leiter/in Administration", "gaestekontakt": true, "bandMin": 5800, "bandMax": 8000, "beispiel": true }
  ],
  "bausteine": {
    "erfahrungProJahr": 50,
    "spracheProSprache": 100,
    "maxSprachen": 2,
    "sprachen": ["EN", "FR", "IT"],
    "mindestNiveau": "B2",
    "hinweis": "Beispiel: Platzhalterbeträge, echte Werte liefert HR"
  },
  "zusatzbausteine": []
};
