'use strict';

// Vérifie les fichiers de thèmes : doublons, niveaux manquants, statistiques.
// Usage : npm run themes:check

const config = require('../src/config');
const { loadThemes } = require('../src/themes');
const { scoreAnswer } = require('../src/scoring');

const themes = loadThemes(config.THEMES_DIR);
let problems = 0;
let total = 0;

for (const theme of themes.values()) {
  const perLevel = [0, 0, 0, 0, 0, 0];
  for (const a of theme.answers) perLevel[a.level]++;
  total += theme.answers.length;
  const points = [1, 2, 3, 4, 5].map((level) => {
    const answer = theme.answers.find((a) => a.level === level);
    return answer ? scoreAnswer(theme, new Map(), answer.key).points : '-';
  });
  console.log(
    `${theme.active ? ' ' : '×'} ${theme.id.padEnd(22)} ${String(theme.answers.length).padStart(4)} réponses ` +
      `(niv. 1-5 : ${perLevel.slice(1).join('/')}) → points ${points.join('/')}  « ${theme.title} »`,
  );
  for (const warning of theme.warnings) {
    console.log(`    ⚠ ${warning}`);
    problems++;
  }
}

console.log(`\n${themes.size} thèmes, ${total} réponses, ${problems} avertissement(s).`);
process.exitCode = problems ? 1 : 0;
