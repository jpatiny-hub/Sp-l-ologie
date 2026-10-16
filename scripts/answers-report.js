'use strict';

// Rapport pour enrichir les thèmes :
//  - les réponses refusées les plus fréquentes (peut-être à ajouter au fichier du thème) ;
//  - les réponses les plus données (pour ajuster leur niveau de difficulté).
// Usage : npm run answers:report [-- <id-du-thème>]

const path = require('node:path');
const config = require('../src/config');
const { openDb } = require('../src/db');
const { loadThemes } = require('../src/themes');
const { probabilities } = require('../src/scoring');

const only = process.argv[2];
const db = openDb(path.join(config.DATA_DIR, 'speleologie.sqlite'));
const themes = loadThemes(config.THEMES_DIR);

for (const theme of themes.values()) {
  if (only && theme.id !== only) continue;
  const unknown = db
    .prepare('SELECT example, n FROM unknown_answers WHERE theme_id = ? ORDER BY n DESC, last_at DESC LIMIT 15')
    .all(theme.id);
  const counts = new Map(
    db.prepare('SELECT answer_key, n FROM answer_counts WHERE theme_id = ?').all(theme.id).map((r) => [r.answer_key, r.n]),
  );
  if (!unknown.length && !counts.size) continue;

  console.log(`\n=== ${theme.title} (${theme.id}.txt)`);
  if (counts.size) {
    const { probs, total } = probabilities(theme, counts);
    console.log(`  Réponses les plus données (${total} au total) :`);
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([key, n]) => {
        const answer = theme.answers.find((a) => a.key === key);
        if (!answer) return;
        const share = ((100 * n) / total).toFixed(1);
        console.log(`    ${String(n).padStart(4)} × ${answer.label} (niveau ${answer.level}, ${share} % des réponses, p estimée ${(100 * probs.get(key)).toFixed(2)} %)`);
      });
  }
  if (unknown.length) {
    console.log('  Réponses refusées :');
    unknown.forEach((u) => console.log(`    ${String(u.n).padStart(4)} × ${u.example}`));
  }
}
