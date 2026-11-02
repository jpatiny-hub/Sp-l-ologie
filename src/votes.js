'use strict';

const { HttpError } = require('./errors');
const { weekStart, addDays } = require('./dates');
const { TIMEZONE } = require('./config');

/** Réactions possibles à un thème proposé (une seule par thème et par joueur, modifiable jusqu'à la clôture). */
const REACTIONS = ['adore', 'bof', 'difficile', 'facile', 'deja-vu'];

/** Première semaine de vote : les 7 thèmes de départ choisis par le responsable (la semaine du lundi 2 novembre 2026). */
const FIRST_WEEK = '2026-11-02';
const FIRST_THEMES = [
  'Une expression qui contient une couleur',
  'Un style vestimentaire',
  'Une cause de décès absurde, façon Darwin Award',
  'Un légume ou un fruit de saison en automne',
  'Un programme de télé-réalité francophone',
  'Une loi absurde',
  'Un style musical',
];

const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** Instant (ms) où l'heure de Bruxelles vaut `day` à 23 h 59 min 59 s. */
function endOfDay(day) {
  const guess = Date.parse(`${day}T23:59:59Z`);
  const p = Object.fromEntries(hourFormat.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return guess - (local - guess);
}

/**
 * Vote de la semaine sur les thèmes proposés par les joueurs.
 *
 * Le responsable met des propositions « au vote » pour une semaine (du lundi au vendredi 23 h 59, heure de Bruxelles). Chaque joueur
 * donne une réaction par thème (j'adore, bof, trop difficile, trop facile, déjà vu) et peut en changer jusqu'à la clôture.
 * Les décomptes ne sont vus que du responsable. Le chrono reste côté serveur.
 */
class ThemeVoteService {
  constructor(db, today, now = Date.now) {
    this.db = db;
    this.today = today;
    this.now = now;
  }

  week(day = this.today()) {
    return weekStart(day);
  }

  isOpen() {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'theme_vote_open'").get();
    return !!(row && row.value === '1');
  }

  setOpen(open) {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES ('theme_vote_open', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(open ? '1' : '0');
  }

  /** Charge une seule fois les 7 thèmes de départ (au nom du responsable) et ouvre le vote à tous, à partir du lundi 2 novembre. */
  ensureFirstWeek() {
    if (this.today() < FIRST_WEEK) return;
    if (this.db.prepare("SELECT 1 FROM settings WHERE key = 'theme_vote_seeded'").get()) return;
    const admin = this.db.prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
    if (!admin) return;
    this.db.exec('BEGIN');
    try {
      for (const title of FIRST_THEMES) {
        const { lastInsertRowid } = this.db.prepare('INSERT INTO theme_suggestions (user_id, title, details, created_at, handled_at) VALUES (?, ?, ?, ?, NULL)').run(admin.id, title, '', this.now());
        this.db.prepare('INSERT OR IGNORE INTO theme_ballot (week, suggestion_id, added_at) VALUES (?, ?, ?)').run(FIRST_WEEK, Number(lastInsertRowid), this.now());
      }
      this.db.prepare("INSERT INTO settings (key, value) VALUES ('theme_vote_seeded', '1')").run();
      this.setOpen(true);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Thèmes au vote d'une semaine, avec le nombre de réactions de chaque sorte. */
  tally(week) {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.title, s.details, u.username AS author
         FROM theme_ballot b JOIN theme_suggestions s ON s.id = b.suggestion_id JOIN users u ON u.id = s.user_id
         WHERE b.week = ? ORDER BY b.added_at, s.id`,
      )
      .all(week);
    const counts = this.db.prepare('SELECT suggestion_id AS id, reaction, COUNT(*) AS n FROM theme_reactions WHERE week = ? GROUP BY suggestion_id, reaction').all(week);
    return rows.map((r) => {
      const reactions = Object.fromEntries(REACTIONS.map((k) => [k, 0]));
      for (const c of counts) if (c.id === r.id && c.reaction in reactions) reactions[c.reaction] = c.n;
      return { ...r, reactions, total: Object.values(reactions).reduce((a, b) => a + b, 0) };
    });
  }

  closesAt(week = this.week()) {
    return endOfDay(addDays(week, 4));
  }

  /** Dernière semaine terminée qui a eu un vote. */
  lastWeek() {
    const row = this.db.prepare('SELECT MAX(week) AS week FROM theme_ballot WHERE week < ?').get(this.week());
    return row && row.week;
  }

  /** Ce que voit un joueur : les thèmes au vote, ses réactions, la clôture. Aucun décompte. */
  forPlayer(userId) {
    this.ensureFirstWeek();
    const week = this.week();
    const candidates = this.tally(week).map((c) => ({ id: c.id, title: c.title, details: c.details }));
    const mine = Object.fromEntries(this.db.prepare('SELECT suggestion_id AS id, reaction FROM theme_reactions WHERE week = ? AND user_id = ?').all(week, userId).map((r) => [r.id, r.reaction]));
    const closesAt = this.closesAt(week);
    const open = candidates.length > 0 && this.now() <= closesAt;
    return {
      open,
      closesAt,
      week,
      reactions: REACTIONS,
      candidates,
      mine,
      // Le joueur peut proposer le sien une fois ses réactions données (ou le vote clos) ; « Proposer un thème » reste aussi dans le Carnet.
      canPropose: candidates.length > 0 && (!open || candidates.every((c) => mine[c.id])),
    };
  }

  /** Donner sa réaction à un thème (`reaction` null : la retirer). */
  react(userId, suggestionId, reaction) {
    this.ensureFirstWeek();
    const week = this.week();
    if (!this.db.prepare('SELECT 1 FROM theme_ballot WHERE week = ? AND suggestion_id = ?').get(week, suggestionId)) throw new HttpError(404, "Ce thème n'est pas au vote cette semaine.");
    if (this.now() > this.closesAt(week)) throw new HttpError(409, 'Le vote est terminé pour cette semaine.');
    if (reaction == null) {
      this.db.prepare('DELETE FROM theme_reactions WHERE week = ? AND user_id = ? AND suggestion_id = ?').run(week, userId, suggestionId);
    } else {
      if (!REACTIONS.includes(reaction)) throw new HttpError(400, 'Réaction inconnue.');
      this.db
        .prepare('INSERT INTO theme_reactions (week, suggestion_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (week, user_id, suggestion_id) DO UPDATE SET reaction = excluded.reaction, created_at = excluded.created_at')
        .run(week, suggestionId, userId, reaction, this.now());
    }
    return this.forPlayer(userId);
  }

  /** Mettre une proposition au vote de la semaine en cours, ou l'en retirer (ses réactions sont effacées). */
  setCandidate(suggestionId, on) {
    const week = this.week();
    if (!this.db.prepare('SELECT 1 FROM theme_suggestions WHERE id = ?').get(suggestionId)) throw new HttpError(404, 'Proposition inconnue.');
    if (on) {
      this.db.prepare('INSERT OR IGNORE INTO theme_ballot (week, suggestion_id, added_at) VALUES (?, ?, ?)').run(week, suggestionId, this.now());
    } else {
      this.db.prepare('DELETE FROM theme_reactions WHERE week = ? AND suggestion_id = ?').run(week, suggestionId);
      this.db.prepare('DELETE FROM theme_ballot WHERE week = ? AND suggestion_id = ?').run(week, suggestionId);
    }
  }

  /** Vue du responsable : réglage, vote en cours avec décomptes et participation, dernier vote terminé. */
  forAdmin() {
    this.ensureFirstWeek();
    const week = this.week();
    const voters = this.db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM theme_reactions WHERE week = ?').get(week).n;
    const last = this.lastWeek();
    const strip = (c) => ({ id: c.id, title: c.title, author: c.author, reactions: c.reactions, total: c.total });
    return {
      open: this.isOpen(),
      week,
      closesAt: this.closesAt(week),
      voters,
      candidates: this.tally(week).map(strip),
      lastResult: last ? { week: last, ranking: this.tally(last).map(strip) } : null,
    };
  }
}

module.exports = { ThemeVoteService, REACTIONS, FIRST_THEMES, FIRST_WEEK };
