'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { dayKey } = require('./dates');

/*
 * Sauvegarde automatique : une copie cohérente de la base par jour (VACUUM INTO, sûr même pendant que le jeu tourne),
 * rangée dans « backups » à côté du fichier de la base. Les plus anciennes sont supprimées au-delà de `keep` jours.
 */
const PREFIX = 'speleologie-';

function dbFile(db) {
  const main = db.prepare('PRAGMA database_list').all().find((r) => r.name === 'main');
  return main && main.file ? main.file : null;
}

/** Crée la sauvegarde du jour si elle n'existe pas encore. Renvoie le chemin créé, ou null. */
function runBackup(db, { now = Date.now, keep = 7 } = {}) {
  const file = dbFile(db);
  if (!file) return null;
  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${PREFIX}${dayKey(now())}.sqlite`);
  let created = null;
  if (!fs.existsSync(target)) {
    const tmp = `${target}.tmp`;
    fs.rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    fs.renameSync(tmp, target);
    created = target;
  }
  // Rotation : on garde les `keep` plus récentes.
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.sqlite'))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(dir, old), { force: true });
  return created;
}

/** Vérifie au démarrage puis toutes les heures : la sauvegarde du jour se fait donc à la première occasion. */
function scheduleBackups(db, options = {}) {
  const tick = () => {
    try {
      const made = runBackup(db, options);
      if (made) console.log(`Sauvegarde de la base : ${made}`);
    } catch (err) {
      console.error('Sauvegarde de la base impossible :', err.message);
    }
  };
  tick();
  const timer = setInterval(tick, 3600 * 1000);
  timer.unref();
  return timer;
}

module.exports = { runBackup, scheduleBackups, dbFile };
