'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toKey, editDistance, matchAnswer } = require('../src/matching');
const { parseTheme } = require('../src/themes');

const theme = parseTheme(
  'test',
  `titre: Test
1: Camembert; Herve = Fromage de Herve; Brie
2: Saint-Feuillien; Chèvre
4: Taleggio; Pont-l'Évêque
5: Bœuf bourguignon; Gruyère`,
);

test('normalisation : accents, casse, articles, ponctuation, pluriels', () => {
  assert.equal(toKey('Le Camembert'), toKey('camembert'));
  assert.equal(toKey('CHÈVRE'), toKey('chevre'));
  assert.equal(toKey('St Feuillien'), toKey('Saint-Feuillien'));
  assert.equal(toKey("l'Escaut"), toKey('Escaut'));
  assert.equal(toKey('Bœuf'), toKey('boeuf'));
  assert.equal(toKey('Les Marolles'), toKey('marolle'));
  assert.equal(toKey('  pont l eveque !'), toKey("Pont-l'Évêque"));
});

test('distance de Damerau-Levenshtein', () => {
  assert.equal(editDistance('taleggio', 'taleggio', 2), 0);
  assert.equal(editDistance('talegio', 'taleggio', 2), 1);
  assert.equal(editDistance('tlaeggio', 'taleggio', 2), 1); // inversion
  assert.equal(editDistance('abc', 'xyz', 1), 2); // arrêt anticipé : renvoie max + 1
});

test('correspondance exacte et via une variante', () => {
  assert.equal(matchAnswer(theme, 'herve').answer.label, 'Herve');
  assert.equal(matchAnswer(theme, 'Fromage de Herve').answer.label, 'Herve');
  assert.equal(matchAnswer(theme, 'st-feuillien').answer.label, 'Saint-Feuillien');
});

test('tolérance orthographique proportionnelle à la longueur', () => {
  assert.equal(matchAnswer(theme, 'Talegio').answer.label, 'Taleggio');
  assert.equal(matchAnswer(theme, 'Camenbert').answer.label, 'Camembert');
  assert.equal(matchAnswer(theme, 'Gruyere').answer.label, 'Gruyère');
  assert.equal(matchAnswer(theme, 'boeuf bourgignon').answer.label, 'Bœuf bourguignon');
  // Mots courts : aucune faute tolérée.
  assert.equal(matchAnswer(theme, 'Bri'), null);
  // Trop éloigné.
  assert.equal(matchAnswer(theme, 'Tallegiooo'), null);
});

test('réponse hors thème refusée', () => {
  assert.equal(matchAnswer(theme, 'Voiture'), null);
  assert.equal(matchAnswer(theme, ''), null);
  assert.equal(matchAnswer(theme, '???'), null);
});

test('symboles : C, C++ et C# restent distincts, les exposants sont lus', () => {
  assert.notEqual(toKey('C'), toKey('C++'));
  assert.notEqual(toKey('C'), toKey('C#'));
  assert.equal(toKey('C sharp'), toKey('C#'));
  assert.equal(toKey('E=mc²'), toKey('Emc2'));
});
