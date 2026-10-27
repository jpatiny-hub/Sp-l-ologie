'use strict';

const { HttpError } = require('./errors');
const Avatar = require('./avatar');
const { usernameKey } = require('./auth');

/*
 * Messagerie entre joueurs : messages privés d'un joueur à un autre, sans pièce jointe.
 * - 500 caractères au plus par message, 20 messages par minute au plus par joueur ;
 * - un joueur peut en bloquer un autre (il ne reçoit plus ses messages) ;
 * - un message reçu peut être signalé : le responsable voit le message signalé et ceux qui le précèdent ;
 * - les messages de plus de 90 jours sont effacés.
 */
const MAX_LENGTH = 500;
const PER_MINUTE = 20;
const KEEP_MS = 90 * 24 * 3600 * 1000;
const THREAD_LIMIT = 100;
const FOREMAN_NAME = 'Le Contremaître';

class MessageService {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
    this.lastCleanup = 0;
  }

  cleanup() {
    const now = this.now();
    if (now - this.lastCleanup < 3600 * 1000) return;
    this.lastCleanup = now;
    this.db.prepare('DELETE FROM messages WHERE created_at < ?').run(now - KEEP_MS);
    this.db.prepare('DELETE FROM message_reports WHERE message_id NOT IN (SELECT id FROM messages)').run();
  }

  userByName(name) {
    const u = this.db.prepare('SELECT id, username, avatar, is_system FROM users WHERE username_key = ?').get(usernameKey(String(name || '')));
    if (!u) throw new HttpError(404, 'Joueur introuvable.');
    return u;
  }

  person(u) {
    return { username: u.username, avatar: Avatar.normalize(u.avatar, u.id), system: !!u.is_system };
  }

  /** Le compte technique « Le Contremaître », créé au premier message automatique. */
  foreman() {
    const found = this.db.prepare('SELECT id, username, avatar, is_system FROM users WHERE is_system = 1').get();
    if (found) return found;
    let key = usernameKey(FOREMAN_NAME);
    if (this.db.prepare('SELECT 1 AS x FROM users WHERE username_key = ?').get(key)) key = `${key}-mascotte`;
    const { lastInsertRowid } = this.db
      .prepare("INSERT INTO users (username, username_key, password_hash, recovery_hash, created_at, is_admin, is_system) VALUES (?, ?, '!', '!', ?, 0, 1)")
      .run(FOREMAN_NAME, key, this.now());
    return this.db.prepare('SELECT id, username, avatar, is_system FROM users WHERE id = ?').get(Number(lastInsertRowid));
  }

  /** Message automatique du Contremaître à un joueur. */
  fromForeman(recipientId, body) {
    const f = this.foreman();
    this.db.prepare('INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)').run(f.id, recipientId, String(body).slice(0, MAX_LENGTH), this.now());
  }

  unread(userId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL').get(userId).n;
  }

  /** Les joueurs avec qui écrire (tous les autres joueurs). */
  people(userId) {
    return this.db
      .prepare('SELECT id, username, avatar, is_system FROM users WHERE id <> ? AND is_system = 0 ORDER BY username_key')
      .all(userId)
      .map((u) => this.person(u));
  }

  /** Conversations du joueur : dernier message et nombre de messages non lus, la plus récente en premier. */
  conversations(userId) {
    this.cleanup();
    const rows = this.db
      .prepare(
        `SELECT m.*, CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END AS other_id
         FROM messages m
         WHERE m.id IN (
           SELECT MAX(id) FROM messages WHERE sender_id = ? OR recipient_id = ?
           GROUP BY CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END)
         ORDER BY m.id DESC`,
      )
      .all(userId, userId, userId, userId);
    const unread = new Map(
      this.db
        .prepare('SELECT sender_id, COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL GROUP BY sender_id')
        .all(userId)
        .map((r) => [r.sender_id, r.n]),
    );
    const blocked = new Set(this.db.prepare('SELECT blocked_id FROM message_blocks WHERE user_id = ?').all(userId).map((r) => r.blocked_id));
    return {
      unread: this.unread(userId),
      conversations: rows.map((m) => {
        const other = this.db.prepare('SELECT id, username, avatar, is_system FROM users WHERE id = ?').get(m.other_id);
        return { ...this.person(other), last: { body: m.body, at: m.created_at, mine: m.sender_id === userId }, unread: unread.get(m.other_id) || 0, blocked: blocked.has(m.other_id) };
      }),
    };
  }

  /** Échange avec un joueur (les 100 derniers messages). Les messages reçus sont marqués comme lus. */
  thread(userId, name) {
    const other = this.userByName(name);
    if (other.id === userId) throw new HttpError(400, 'Choisis un autre joueur que toi-même.');
    this.db
      .prepare('UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL')
      .run(this.now(), other.id, userId);
    const rows = this.db
      .prepare(
        `SELECT id, sender_id, body, created_at FROM messages
         WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
         ORDER BY id DESC LIMIT ?`,
      )
      .all(userId, other.id, other.id, userId, THREAD_LIMIT)
      .reverse();
    const blocked = !!this.db.prepare('SELECT 1 AS x FROM message_blocks WHERE user_id = ? AND blocked_id = ?').get(userId, other.id);
    return {
      with: this.person(other),
      blocked,
      unread: this.unread(userId),
      messages: rows.map((m) => ({ id: m.id, mine: m.sender_id === userId, body: m.body, at: m.created_at })),
    };
  }

  send(userId, name, text) {
    const other = this.userByName(name);
    if (other.id === userId) throw new HttpError(400, 'Choisis un autre joueur que toi-même.');
    if (other.is_system) throw new HttpError(403, 'Le Contremaître ne lit pas les messages : il se contente de t\'en envoyer.');
    const body = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!body) throw new HttpError(400, 'Écris un message.');
    if (body.length > MAX_LENGTH) throw new HttpError(400, `Message trop long (${MAX_LENGTH} caractères au plus).`);
    const now = this.now();
    const recent = this.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND created_at > ?').get(userId, now - 60 * 1000).n;
    if (recent >= PER_MINUTE) throw new HttpError(429, 'Tu écris trop vite : réessaie dans une minute.');
    if (this.db.prepare('SELECT 1 AS x FROM message_blocks WHERE user_id = ? AND blocked_id = ?').get(other.id, userId)) {
      throw new HttpError(403, 'Ce joueur ne reçoit pas de messages de ta part.');
    }
    if (this.db.prepare('SELECT 1 AS x FROM message_blocks WHERE user_id = ? AND blocked_id = ?').get(userId, other.id)) {
      throw new HttpError(409, 'Tu as bloqué ce joueur : débloque-le pour lui écrire.');
    }
    this.db.prepare('INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)').run(userId, other.id, body, now);
    return this.thread(userId, name);
  }

  block(userId, name, blocked) {
    const other = this.userByName(name);
    if (other.id === userId) throw new HttpError(400, 'Choisis un autre joueur que toi-même.');
    if (blocked) this.db.prepare('INSERT OR IGNORE INTO message_blocks (user_id, blocked_id) VALUES (?, ?)').run(userId, other.id);
    else this.db.prepare('DELETE FROM message_blocks WHERE user_id = ? AND blocked_id = ?').run(userId, other.id);
    return this.thread(userId, name);
  }

  /** Signale un message reçu : le responsable le verra avec le début de la conversation. */
  report(userId, messageId) {
    const m = this.db.prepare('SELECT id, sender_id, recipient_id FROM messages WHERE id = ?').get(Number(messageId));
    if (!m || m.recipient_id !== userId) throw new HttpError(404, 'Message introuvable.');
    this.db.prepare('INSERT OR IGNORE INTO message_reports (message_id, reporter_id, created_at) VALUES (?, ?, ?)').run(m.id, userId, this.now());
    return { ok: true };
  }

  /** Messages signalés, à traiter par le responsable (avec les messages qui précèdent dans la conversation). */
  reports() {
    const rows = this.db.prepare('SELECT * FROM message_reports WHERE handled_at IS NULL ORDER BY created_at DESC LIMIT 100').all();
    return rows
      .map((r) => {
        const m = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(r.message_id);
        if (!m) return null;
        const name = (id) => (this.db.prepare('SELECT username FROM users WHERE id = ?').get(id) || {}).username;
        const context = this.db
          .prepare(
            `SELECT sender_id, body, created_at FROM messages
             WHERE id <= ? AND ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
             ORDER BY id DESC LIMIT 4`,
          )
          .all(m.id, m.sender_id, m.recipient_id, m.recipient_id, m.sender_id)
          .reverse()
          .map((c) => ({ from: name(c.sender_id), body: c.body, at: c.created_at }));
        return { id: m.id, reporter: name(r.reporter_id), from: name(m.sender_id), to: name(m.recipient_id), body: m.body, at: m.created_at, reportedAt: r.created_at, context };
      })
      .filter(Boolean);
  }

  handled(messageId) {
    this.db.prepare('UPDATE message_reports SET handled_at = ? WHERE message_id = ? AND handled_at IS NULL').run(this.now(), Number(messageId));
    return { ok: true };
  }
}

module.exports = { MessageService, MAX_LENGTH, PER_MINUTE };
