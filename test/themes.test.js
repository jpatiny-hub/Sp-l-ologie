'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { loadThemes, parseTheme } = require('../src/themes');
const { ROUNDS_PER_GAME } = config;

test('tous les thèmes se chargent sans doublon', () => {
  const themes = loadThemes(config.THEMES_DIR);
  assert.ok(themes.size >= ROUNDS_PER_GAME * 2, 'assez de thèmes pour le jour et l’entraînement');
  for (const theme of themes.values()) {
    assert.deepEqual(theme.warnings, [], `${theme.id} : ${theme.warnings.join(' | ')}`);
    assert.ok(theme.answers.length >= 40, `${theme.id} : trop peu de réponses (${theme.answers.length})`);
    assert.ok(theme.answers.some((a) => a.level === 1), `${theme.id} : aucune réponse de niveau 1`);
    assert.ok(theme.answers.some((a) => a.level >= 4), `${theme.id} : aucune réponse rare`);
  }
});

test('format : variantes, niveaux et erreurs', () => {
  const theme = parseTheme('x', 'titre: X\n# commentaire\n1: Un = Uno; Deux\n3: Trois');
  assert.equal(theme.title, 'X');
  assert.equal(theme.answers.length, 3);
  assert.equal(theme.index.get('uno').label, 'Un');
  assert.throws(() => parseTheme('x', '1: Un'), /titre/);
  assert.throws(() => parseTheme('x', 'titre: X\n7: Sept'), /inconnu/);
});
