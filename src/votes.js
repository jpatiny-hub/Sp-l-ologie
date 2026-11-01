'use strict';

const { HttpError } = require('./errors');
const { weekStart, addDays } = require('./dates');

/** Nombre de voix par joueur et par semaine. */
const VOTES_PER_WEEK = 3;

/**
 * Vote de la semaine sur les thèmes proposés par les joueurs.
 *
 * Le responsable choisit, parmi les propositions, celles qui passent au vote de la semaine en cours (du lundi 2 h au lundi
 * suivant 2 h, comme le jour de jeu). Chaque joueur a trois voix, une par thème au plus, et ne vote pas pour ses propres
 * propositions. Les décomptes restent cachés aux joueurs jusqu'à la fin de la semaine ; le responsable les voit à tout moment.
 * Tant que le vote n'est pas ouvert à tous (réglage `theme_vote_open`), seul le responsable le voit (bêta).
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

  /** Thèmes au vote d'une semaine, avec leur nombre de voix (du plus voté au moins voté, puis par ordre d'ajout). */
  tally(week) {
    return this.db
      .prepare(
        `SELECT s.id, s.title, s.details, s.user_id AS authorId, u.username AS author,
                (SELECT COUNT(*) FROM theme_votes v WHERE v.week = b.week AND v.suggestion_id = b.suggestion_id) AS votes
         FROM theme_ballot b JOIN theme_suggestions s ON s.id = b.suggestion_id JOIN users u ON u.id = s.user_id
         WHERE b.week = ? ORDER BY votes DESC, b.added_at, s.id`,
      )
      .all(week);
  }

  /** Dernière semaine terminée qui a eu un vote. */
  lastWeek() {
    const row = this.db.prepare('SELECT MAX(week) AS week FROM theme_ballot WHERE week < ?').get(this.week());
    return row && row.week;
  }

  /** Ce que voit un joueur : le vote en cours (sans décompte) et le résultat du dernier vote terminé. */
  forPlayer(userId) {
    const week = this.week();
    const mine = new Set(this.db.prepare('SELECT suggestion_id AS id FROM theme_votes WHERE week = ? AND user_id = ?').all(week, userId).map((r) => r.id));
    const candidates = this.tally(week).map((c) => ({ id: c.id, title: c.title, details: c.details, voted: mine.has(c.id), own: c.authorId === userId }));
    const last = this.lastWeek();
    return {
      week,
      endsOn: addDays(week, 6),
      votesPerWeek: VOTES_PER_WEEK,
      votesLeft: Math.max(0, VOTES_PER_WEEK - mine.size),
      candidates,
      lastResult: last ? { week: last, ranking: this.tally(last).map((c) => ({ title: c.title, votes: c.votes })) } : null,
    };
  }

  /** Donner (on = true) ou retirer sa voix à un thème du vote en cours. */
  vote(userId, suggestionId, on) {
    const week = this.week();
    const row = this.db
      .prepare('SELECT s.user_id AS authorId FROM theme_ballot b JOIN theme_suggestions s ON s.id = b.suggestion_id WHERE b.week = ? AND b.suggestion_id = ?')
      .get(week, suggestionId);
    if (!row) throw new HttpError(404, "Ce thème n'est pas au vote cette semaine.");
    if (!on) {
      this.db.prepare('DELETE FROM theme_votes WHERE week = ? AND user_id = ? AND suggestion_id = ?').run(week, userId, suggestionId);
      return this.forPlayer(userId);
    }
    if (row.authorId === userId) throw new HttpError(400, 'Tu ne peux pas voter pour ta propre proposition.');
    const used = this.db.prepare('SELECT COUNT(*) AS n FROM theme_votes WHERE week = ? AND user_id = ?').get(week, userId).n;
    const already = this.db.prepare('SELECT 1 FROM theme_votes WHERE week = ? AND user_id = ? AND suggestion_id = ?').get(week, userId, suggestionId);
    if (!already && used >= VOTES_PER_WEEK) throw new HttpError(409, `Tu as déjà donné tes ${VOTES_PER_WEEK} voix : retire-en une pour changer d'avis.`);
    this.db.prepare('INSERT OR IGNORE INTO theme_votes (week, suggestion_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(week, suggestionId, userId, this.now());
    return this.forPlayer(userId);
  }

  /** Mettre une proposition au vote de la semaine en cours, ou l'en retirer (ses voix sont effacées). */
  setCandidate(suggestionId, on) {
    const week = this.week();
    if (!this.db.prepare('SELECT 1 FROM theme_suggestions WHERE id = ?').get(suggestionId)) throw new HttpError(404, 'Proposition inconnue.');
    if (on) {
      this.db.prepare('INSERT OR IGNORE INTO theme_ballot (week, suggestion_id, added_at) VALUES (?, ?, ?)').run(week, suggestionId, this.now());
    } else {
      this.db.prepare('DELETE FROM theme_votes WHERE week = ? AND suggestion_id = ?').run(week, suggestionId);
      this.db.prepare('DELETE FROM theme_ballot WHERE week = ? AND suggestion_id = ?').run(week, suggestionId);
    }
  }

  /** Vue du responsable : réglage, vote en cours avec décompte et participation, dernier résultat. */
  forAdmin() {
    const week = this.week();
    const voters = this.db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM theme_votes WHERE week = ?').get(week).n;
    const last = this.lastWeek();
    const strip = (c) => ({ id: c.id, title: c.title, author: c.author, votes: c.votes });
    return {
      open: this.isOpen(),
      week,
      endsOn: addDays(week, 6),
      voters,
      candidates: this.tally(week).map(strip),
      lastResult: last ? { week: last, ranking: this.tally(last).map(strip) } : null,
    };
  }
}

module.exports = { ThemeVoteService, VOTES_PER_WEEK };
