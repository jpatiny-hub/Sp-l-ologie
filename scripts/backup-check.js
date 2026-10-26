'use strict';

// Vérifie la dernière sauvegarde automatique : intégrité du fichier, nombre de comptes, de parties et de duels.
// Ne modifie rien. Usage (sur le serveur, avec les mêmes variables que le service) : DATA_DIR=… npm run backup:check
// Pour restaurer : arrêter le service, remplacer speleologie.sqlite par la sauvegarde choisie, redémarrer le service.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');

const dir = path.join(config.DATA_DIR, 'backups');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('speleologie-') && f.endsWith('.sqlite')).sort() : [];
if (!files.length) {
  console.error(`Aucune sauvegarde trouvée dans ${dir}.`);
  process.exit(1);
}
const latest = files[files.length - 1];
const db = new DatabaseSync(path.join(dir, latest), { readOnly: true });
const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
console.log(`Sauvegardes disponibles : ${files.length} (${files[0]} → ${latest})`);
console.log(`Dernière sauvegarde : ${latest}, ${(fs.statSync(path.join(dir, latest)).size / 1024).toFixed(0)} Ko`);
console.log(`Intégrité : ${integrity}`);
console.log(`Comptes : ${count('users')} · parties : ${count('games')} · duels : ${count('duels')} · badges : ${count('badges')}`);
process.exit(integrity === 'ok' ? 0 : 2);
