'use strict';

const fs = require('node:fs');
const { dbFile, listBackups } = require('./backup');

/*
 * Journal des erreurs et rapport de santé du jeu (réservé au responsable). Le journal garde les 30 derniers jours,
 * 500 lignes au plus ; les messages identiques et rapprochés sont comptés une seule fois pour ne pas le saturer.
 */
const KEEP_MS = 30 * 24 * 3600 * 1000;
const KEEP_ROWS = 500;
const DEDUP_MS = 60 * 1000;
const KINDS = new Set(['serveur', 'processus', 'navigateur']);

class ErrorLog {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
    this.last = new Map(); // message → dernier enregistrement, pour regrouper les rafales
  }

  record(kind, message, { detail = null, path: where = null, userId = null } = {}) {
    try {
      const k = KINDS.has(kind) ? kind : 'serveur';
      const text = String(message || 'Erreur inconnue').slice(0, 300);
      const t = this.now();
      const memo = `${k}|${text}|${where || ''}`;
      if (t - (this.last.get(memo) || 0) < DEDUP_MS) return false;
      this.last.set(memo, t);
      if (this.last.size > 200) this.last.clear();
      this.db
        .prepare('INSERT INTO error_log (at, kind, message, detail, path, user_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(t, k, text, detail ? String(detail).slice(0, 2000) : null, where ? String(where).slice(0, 200) : null, userId);
      this.db.prepare('DELETE FROM error_log WHERE at < ? OR id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT ?)').run(t - KEEP_MS, KEEP_ROWS);
      return true;
    } catch {
      return false; // le journal ne doit jamais faire tomber le jeu
    }
  }

  recent(limit = 30) {
    return this.db.prepare('SELECT id, at, kind, message, detail, path FROM error_log ORDER BY id DESC LIMIT ?').all(limit);
  }

  since(ms) {
    return this.db.prepare('SELECT kind, COUNT(*) AS n FROM error_log WHERE at >= ? GROUP BY kind').all(this.now() - ms);
  }

  clear() {
    this.db.exec('DELETE FROM error_log');
  }
}

/** Santé du jeu : version, durée de fonctionnement, base, sauvegardes, erreurs récentes et files d'attente. */
function healthReport(db, { errors, version, startedAt, now = Date.now }) {
  const file = dbFile(db);
  const size = file && fs.existsSync(file) ? fs.statSync(file).size : null;
  const quick = db.prepare('PRAGMA quick_check').get().quick_check;
  const backups = listBackups(db);
  const latest = backups[0] || null;
  const count = (sql) => db.prepare(sql).get().n;
  const day = 24 * 3600 * 1000;
  const t = now();
  const problems = [];
  if (quick !== 'ok') problems.push('Le contrôle d\'intégrité de la base signale un problème.');
  if (!latest) problems.push('Aucune sauvegarde trouvée.');
  else if (t - latest.at > 36 * 3600 * 1000) problems.push(`Dernière sauvegarde ancienne (${Math.round((t - latest.at) / 3600000)} h).`);
  const last24 = errors.since(day);
  const errCount = last24.reduce((sum, x) => sum + x.n, 0);
  if (errCount >= 10) problems.push(`${errCount} erreurs enregistrées ces dernières 24 h.`);
  return {
    ok: problems.length === 0,
    problems,
    version,
    uptimeSeconds: Math.round((t - startedAt) / 1000),
    node: process.version,
    database: { bytes: size, integrity: quick },
    backups: { count: backups.length, latest, list: backups.slice(0, 12) },
    errors: { last24h: last24, recent: errors.recent(25) },
    totals: {
      users: count('SELECT COUNT(*) AS n FROM users'),
      games: count('SELECT COUNT(*) AS n FROM games'),
      duelsToValidate: count("SELECT COUNT(*) AS n FROM duels WHERE status = 'done' AND validated_at IS NULL"),
      reportsPending: count('SELECT COUNT(DISTINCT theme_id || input_key) AS n FROM answer_reports WHERE handled_at IS NULL'),
    },
  };
}

module.exports = { ErrorLog, healthReport };
