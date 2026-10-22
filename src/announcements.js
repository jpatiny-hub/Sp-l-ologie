'use strict';

const { HttpError } = require('./errors');

/*
 * Annonces du « Contre maître » : un court message à tous les joueurs, affiché sur l'accueil jusqu'à ce que
 * chacun l'ait lu (« Compris ») ou que sa durée soit passée.
 */
const MAX_LENGTH = 600;
const MAX_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

class AnnouncementService {
  constructor(db, now) {
    this.db = db;
    this.now = now;
  }

  /** Annonces en cours que ce joueur n'a pas encore lues (la plus récente en premier). */
  unseen(userId) {
    const row = this.db.prepare('SELECT announce_seen FROM users WHERE id = ?').get(userId);
    return this.db
      .prepare('SELECT id, text, created_at AS createdAt FROM announcements WHERE id > ? AND removed_at IS NULL AND expires_at > ? ORDER BY id DESC')
      .all(row ? row.announce_seen : 0, this.now());
  }

  markSeen(userId, id) {
    if (!Number.isInteger(id)) throw new HttpError(400, 'Annonce inconnue.');
    this.db.prepare('UPDATE users SET announce_seen = MAX(announce_seen, ?) WHERE id = ?').run(id, userId);
    return { ok: true };
  }

  publish(text, days) {
    const clean = typeof text === 'string' ? text.trim().replace(/\r\n/g, '\n') : '';
    if (clean.length < 3) throw new HttpError(400, 'Écris un message (au moins 3 caractères).');
    if (clean.length > MAX_LENGTH) throw new HttpError(400, `Message trop long (${MAX_LENGTH} caractères au plus).`);
    const d = Number.isInteger(days) ? Math.min(MAX_DAYS, Math.max(1, days)) : 7;
    const now = this.now();
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO announcements (text, created_at, expires_at) VALUES (?, ?, ?)')
      .run(clean, now, now + d * DAY_MS);
    return { id: Number(lastInsertRowid), expiresAt: now + d * DAY_MS };
  }

  remove(id) {
    if (!Number.isInteger(id)) throw new HttpError(400, 'Annonce inconnue.');
    const res = this.db.prepare('UPDATE announcements SET removed_at = ? WHERE id = ? AND removed_at IS NULL').run(this.now(), id);
    if (!res.changes) throw new HttpError(404, 'Annonce introuvable.');
    return { ok: true };
  }

  /** Liste du responsable : les 20 dernières, avec leur état. */
  list() {
    const now = this.now();
    return this.db
      .prepare('SELECT id, text, created_at AS createdAt, expires_at AS expiresAt, removed_at AS removedAt FROM announcements ORDER BY id DESC LIMIT 20')
      .all()
      .map((a) => ({ ...a, status: a.removedAt ? 'removed' : a.expiresAt > now ? 'active' : 'expired' }));
  }
}

module.exports = { AnnouncementService, MAX_LENGTH };
