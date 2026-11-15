'use strict';
// Gemeinsame Abschluss-Daten für Tests mit kleinen eigenen Konfigurationen:
// ein einziger Bereich «b», in dem die klassischen Abschlüsse überall anerkannt sind.
module.exports = {
  bereiche: [{ id: 'b', label: 'Bereich B' }],
  abschluesse: [
    { id: 'progresso', label: 'Progresso', stufe: 'Ib', bereiche: '*' },
    { id: 'eba', label: 'EBA', stufe: 'II', bereiche: '*' },
    { id: 'efz', label: 'EFZ', stufe: 'IIIa', bereiche: '*' },
    { id: 'berufspruefung', label: 'Fachausweis', stufe: 'IV', bereiche: '*' },
    { id: 'hf', label: 'Höhere Fachschule', stufe: null, bereiche: [] },
  ],
  funktion: function (f) { return Object.assign({ bereich: 'b' }, f); },
};
