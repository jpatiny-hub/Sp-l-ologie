'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { dayKey } = require('./dates');

/*
 * Sauvegardes automatiques, rangées dans « backups » à côté du fichier de la base (VACUUM INTO : copie cohérente, sûre même
 * pendant que le jeu tourne). Chaque copie est relue et contrôlée (quick_check) avant d'être gardée.
 *  - une par jour (`speleologie-AAAA-MM-JJ.sqlite`), les `keep` plus récentes sont gardées ;
 *  - une avant chaque démarrage du jeu, donc avant chaque mise à jour et avant toute migration (`speleologie-demarrage-…`) ;
 *  - une à la demande du responsable (`speleologie-manuelle-…`).
 */
const PREFIX = 'speleologie-';
const DAILY = /^speleologie-(\d{4}-\d{2}-\d{2})\.sqlite$/;
const EXTRA = /^speleologie-(demarrage|manuelle)-(\d{8}T\d{6}Z)\.sqlite$/;
const KEEP_EXTRA = 10;
const START_THROTTLE_MS = 10 * 60 * 1000;

function dbFile(db) {
  const main = db.prepare('PRAGMA database_list').all().find((r) => r.name === 'main');
  return main && main.file ? main.file : null;
}

const backupDir = (file) => path.join(path.dirname(file), 'backups');
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const stampMs = (text) => Date.parse(text.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));

/** Contrôle d'une copie : elle s'ouvre et son contrôle d'intégrité est bon. */
function verifyBackup(file) {
  const copy = new DatabaseSync(file, { readOnly: true });
  try {
    return copy.prepare('PRAGMA quick_check').get().quick_check === 'ok';
  } finally {
    copy.close();
  }
}

/** Copie la base ouverte `source` vers `target` (écriture dans un fichier temporaire, contrôle, puis renommage). */
function copyVerified(source, target) {
  const tmp = `${target}.tmp`;
  fs.rmSync(tmp, { force: true });
  source.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  if (!verifyBackup(tmp)) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`la copie ${path.basename(target)} est corrompue`);
  }
  fs.renameSync(tmp, target);
}

function rotate(dir, keep) {
  const names = fs.readdirSync(dir);
  const daily = names.filter((f) => DAILY.test(f)).sort();
  for (const old of daily.slice(0, Math.max(0, daily.length - keep))) fs.rmSync(path.join(dir, old), { force: true });
  for (const kind of ['demarrage', 'manuelle']) {
    const group = names.filter((f) => (EXTRA.exec(f) || [])[1] === kind).sort();
    for (const old of group.slice(0, Math.max(0, group.length - KEEP_EXTRA))) fs.rmSync(path.join(dir, old), { force: true });
  }
}

/** Crée la sauvegarde du jour si elle n'existe pas encore. Renvoie le chemin créé, ou null. */
function runBackup(db, { now = Date.now, keep = 14 } = {}) {
  const file = dbFile(db);
  if (!file) return null;
  const dir = backupDir(file);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${PREFIX}${dayKey(now())}.sqlite`);
  let created = null;
  if (!fs.existsSync(target)) {
    copyVerified(db, target);
    created = target;
  }
  rotate(dir, keep);
  return created;
}

/** Sauvegarde supplémentaire à la demande du responsable (avant une opération délicate, par exemple). */
function backupNow(db, { now = Date.now, keep = 14 } = {}) {
  const file = dbFile(db);
  if (!file) return null;
  const dir = backupDir(file);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${PREFIX}manuelle-${stamp(now())}.sqlite`);
  copyVerified(db, target);
  rotate(dir, keep);
  return target;
}

/**
 * À appeler avant d'ouvrir la base (donc avant les migrations de la nouvelle version) : copie de l'état laissé par la version
 * précédente. Au plus une toutes les dix minutes, pour qu'une boucle de redémarrages ne remplisse pas le disque.
 */
function snapshotBeforeStart(file, { now = Date.now, keep = 14 } = {}) {
  if (!file || file === ':memory:' || !fs.existsSync(file)) return null;
  const dir = backupDir(file);
  fs.mkdirSync(dir, { recursive: true });
  const recent = fs
    .readdirSync(dir)
    .map((f) => EXTRA.exec(f))
    .filter((m) => m && m[1] === 'demarrage')
    .some((m) => now() - stampMs(m[2]) < START_THROTTLE_MS);
  if (recent) return null;
  const source = new DatabaseSync(file);
  try {
    const target = path.join(dir, `${PREFIX}demarrage-${stamp(now())}.sqlite`);
    copyVerified(source, target);
    rotate(dir, keep);
    return target;
  } finally {
    source.close();
  }
}

/** Sauvegardes présentes, les plus récentes d'abord. */
function listBackups(db) {
  const file = dbFile(db);
  if (!file) return [];
  const dir = backupDir(file);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => DAILY.test(f) || EXTRA.test(f))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      const extra = EXTRA.exec(name);
      return { name, kind: extra ? (extra[1] === 'demarrage' ? 'avant démarrage' : 'manuelle') : 'quotidienne', at: stat.mtimeMs, bytes: stat.size };
    })
    .sort((a, b) => b.at - a.at);
}

/** Vérifie au démarrage puis toutes les heures : la sauvegarde du jour se fait donc à la première occasion. */
function scheduleBackups(db, options = {}) {
  const tick = () => {
    try {
      const made = runBackup(db, options);
      if (made) console.log(`Sauvegarde de la base : ${made}`);
    } catch (err) {
      console.error('Sauvegarde de la base impossible :', err.message);
      if (options.onError) options.onError(err);
    }
  };
  tick();
  const timer = setInterval(tick, 3600 * 1000);
  timer.unref();
  return timer;
}

module.exports = { runBackup, backupNow, snapshotBeforeStart, listBackups, verifyBackup, scheduleBackups, dbFile };
