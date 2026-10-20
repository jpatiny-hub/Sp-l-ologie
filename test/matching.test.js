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

test('seules les saisies différentes du nom affiché demandent une confirmation', () => {
  // Casse, accents, article : c'est bien la réponse affichée.
  assert.equal(matchAnswer(theme, 'le gruyere').approximate, false);
  assert.equal(matchAnswer(theme, 'st-feuillien').approximate, false);
  // Variante ou faute de frappe : le joueur doit valider la proposition.
  assert.equal(matchAnswer(theme, 'Fromage de Herve').approximate, true);
  assert.equal(matchAnswer(theme, 'Camenbert').approximate, true);
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

test('touches voisines du clavier : une demi-faute seulement', () => {
  assert.equal(editDistance('zeta', 'eeta', 1), 0.5); // z à côté de e (AZERTY)
  assert.equal(editDistance('wlan', 'qlan', 1), 0.5);
  assert.equal(editDistance('abcd', 'apcd', 1), 1); // b et p ne sont pas voisines
  const t = parseTheme('t', 'titre: t\n1: Belgique; Allemagne; Norvège; Cuba; Iran\n');
  assert.equal(matchAnswer(t, 'Belgiqye').answer.label, 'Belgique'); // u/y voisines
  assert.equal(matchAnswer(t, 'Cuna').answer.label, 'Cuba'); // b/n voisines : accepté même à 4 lettres
  assert.equal(matchAnswer(t, 'Cuxa'), null); // x n'est pas voisine de b
  assert.equal(matchAnswer(t, 'Irak'), null); // 4 lettres : pas de faute ordinaire
});

test('tolérance plus large sur les longs noms', () => {
  const t = parseTheme('t', 'titre: t\n1: Constantinople; Pétaouchnok-les-Bains\n');
  assert.equal(matchAnswer(t, 'Constantinoplle').answer.label, 'Constantinople');
  assert.equal(matchAnswer(t, 'Petaouchnok les Bainns').answer.label, 'Pétaouchnok-les-Bains');
  assert.equal(matchAnswer(t, 'Petaouxhnok les Bainns').answer.label, 'Pétaouchnok-les-Bains'); // 2 fautes
  assert.equal(matchAnswer(t, 'Petaouxhnxk les Bainns').answer.label, 'Pétaouchnok-les-Bains'); // 3 fautes (13 lettres ou plus)
});

test('nom de famille seul, quand il est unique dans le thème', () => {
  const t = parseTheme('t', 'titre: t\n1: François Hollande; Emmanuel Macron; Jacques Chirac; Jean Chirac; Louis Napoléon Bonaparte = Napoléon III\n');
  const m = matchAnswer(t, 'Hollande');
  assert.equal(m.answer.label, 'François Hollande');
  assert.equal(m.approximate, true, 'confirmation demandée');
  assert.equal(matchAnswer(t, 'Chirac'), null, 'ambigu : deux Chirac');
  assert.equal(matchAnswer(t, 'Francois'), null, 'le prénom seul reste refusé');
});
