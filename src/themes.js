'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { toKey } = require('./matching');
const { LEVEL_WEIGHTS } = require('./scoring');

/*
 * Format d'un fichier de thème (data/themes/<id>.txt) :
 *
 *   titre: Un fromage
 *   # commentaire
 *   1: Camembert; Brie; Parmesan = Parmigiano = Parmigiano Reggiano
 *   2: ...
 *   5: ...
 *
 * - le chiffre en début de ligne est le niveau de difficulté (1 = évident, 5 = très obscur) ;
 * - les réponses sont séparées par « ; » ;
 * - les variantes acceptées d'une même réponse sont séparées par « = » (la première est le nom affiché) ;
 * - « actif: non » retire le thème du tirage sans supprimer le fichier.
 */

function parseTheme(id, text) {
  const theme = { id, title: null, active: true, answers: [], index: new Map(), weightTotal: 0, warnings: [] };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = line.match(/^([^:]+):(.*)$/);
    if (!m) throw new Error(`${id}.txt ligne ${i + 1} : format non reconnu`);
    const field = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (field === 'titre') {
      theme.title = value;
    } else if (field === 'actif') {
      theme.active = !/^(non|no|false|0)$/i.test(value);
    } else if (/^[1-5]$/.test(field)) {
      for (const entry of value.split(';')) {
        const names = entry.split('=').map((s) => s.trim()).filter(Boolean);
        if (names.length) addAnswer(theme, Number(field), names, i + 1);
      }
    } else {
      throw new Error(`${id}.txt ligne ${i + 1} : champ « ${m[1].trim()} » inconnu`);
    }
  });
  if (!theme.title) throw new Error(`${id}.txt : ligne « titre: » manquante`);
  return theme;
}

function addAnswer(theme, level, names, line) {
  const keys = [...new Set(names.map(toKey).filter(Boolean))];
  if (!keys.length) return;
  const existing = theme.index.get(keys[0]);
  if (existing) {
    theme.warnings.push(`ligne ${line} : « ${names[0]} » fait doublon avec « ${existing.label} »`);
    return;
  }
  const answer = { key: keys[0], label: names[0], names, level, weight: LEVEL_WEIGHTS[level] };
  theme.answers.push(answer);
  theme.weightTotal += answer.weight;
  for (const key of keys) {
    const other = theme.index.get(key);
    if (other) {
      theme.warnings.push(`ligne ${line} : la variante « ${key} » de « ${names[0]} » existe déjà pour « ${other.label} »`);
      continue;
    }
    theme.index.set(key, answer);
  }
}

function loadThemes(dir) {
  const themes = new Map();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  for (const file of files) {
    const id = path.basename(file, '.txt');
    themes.set(id, parseTheme(id, fs.readFileSync(path.join(dir, file), 'utf8')));
  }
  return themes;
}

module.exports = { parseTheme, loadThemes };
