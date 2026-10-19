'use strict';

const crypto = require('node:crypto');
const { ROUNDS_PER_GAME, TIMER_SECONDS, TIMER_GRACE_MS } = require('./config');
const { dayKey, addDays, weekStart, monthStart, addMonths, monthEnd } = require('./dates');
const { transaction } = require('./db');
const { matchAnswer, toKey } = require('./matching');
const { scoreAnswer, probabilities, pointsFor, tierFor } = require('./scoring');
const { BadgeService } = require('./badges');

const PERIODS = ['day', 'week', 'month'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class GameService {
  constructor(db, themes, now = Date.now) {
    this.db = db;
    this.themes = themes;
    this.now = now;
    this.timerMs = TIMER_SECONDS * 1000;
    this.badges = new BadgeService(db, now);
  }

  today() {
    return dayKey(this.now());
  }

  activeThemeIds() {
    return [...this.themes.values()].filter((t) => t.active && t.answers.length).map((t) => t.id);
  }

  /** Thèmes du jour : tirés une fois, en privilégiant ceux qui n'ont pas servi depuis longtemps. */
  dailyThemes(day) {
    const rows = this.db.prepare('SELECT theme_id FROM daily_themes WHERE day = ? ORDER BY slot').all(day);
    if (rows.length === ROUNDS_PER_GAME) return rows.map((r) => r.theme_id);

    const lastUsed = new Map(
      this.db
        .prepare('SELECT theme_id, MAX(day) AS last FROM daily_themes WHERE day < ? GROUP BY theme_id')
        .all(day)
        .map((r) => [r.theme_id, r.last]),
    );
    const candidates = shuffle(this.activeThemeIds());
    if (candidates.length < ROUNDS_PER_GAME) throw new HttpError(500, 'Pas assez de thèmes actifs.');
    // Tri stable : à ancienneté égale, l'ordre aléatoire est conservé.
    candidates.sort((a, b) => (lastUsed.get(a) || '').localeCompare(lastUsed.get(b) || ''));
    const chosen = candidates.slice(0, ROUNDS_PER_GAME);
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM daily_themes WHERE day = ?').run(day);
      const insert = this.db.prepare('INSERT INTO daily_themes (day, slot, theme_id) VALUES (?, ?, ?)');
      chosen.forEach((id, slot) => insert.run(day, slot, id));
    });
    return chosen;
  }

  dailyGameFor(userId, day) {
    return this.db.prepare("SELECT * FROM games WHERE user_id = ? AND day = ? AND mode = 'daily'").get(userId, day);
  }

  startGame(userId, mode) {
    const day = this.today();
    if (mode === 'daily') {
      const existing = this.dailyGameFor(userId, day);
      if (existing) return this.state(existing.id, userId);
      return this.state(this.createGame(userId, 'daily', day, this.dailyThemes(day)), userId);
    }
    if (mode === 'training') {
      // Les thèmes du jour sont exclus pour ne pas pouvoir s'entraîner dessus.
      const excluded = new Set(this.dailyThemes(day));
      const pool = shuffle(this.activeThemeIds().filter((id) => !excluded.has(id)));
      if (pool.length < ROUNDS_PER_GAME) throw new HttpError(500, 'Pas assez de thèmes pour un entraînement.');
      this.db.prepare("DELETE FROM games WHERE user_id = ? AND mode = 'training'").run(userId);
      return this.state(this.createGame(userId, 'training', day, pool.slice(0, ROUNDS_PER_GAME)), userId);
    }
    throw new HttpError(400, 'Mode de jeu inconnu.');
  }

  createGame(userId, mode, day, themeIds) {
    return transaction(this.db, () => {
      const { lastInsertRowid } = this.db
        .prepare('INSERT INTO games (user_id, mode, day, created_at) VALUES (?, ?, ?, ?)')
        .run(userId, mode, day, this.now());
      const gameId = Number(lastInsertRowid);
      const insert = this.db.prepare('INSERT INTO rounds (game_id, slot, theme_id) VALUES (?, ?, ?)');
      themeIds.forEach((id, slot) => insert.run(gameId, slot, id));
      return gameId;
    });
  }

  loadGame(gameId, userId) {
    const game = this.db.prepare('SELECT * FROM games WHERE id = ? AND user_id = ?').get(gameId, userId);
    if (!game) throw new HttpError(404, 'Partie introuvable.');
    const rounds = this.db.prepare('SELECT * FROM rounds WHERE game_id = ? ORDER BY slot').all(gameId);
    return { game, rounds };
  }

  /** Clôture automatiquement un thème dont le chrono est dépassé. */
  expireIfNeeded(game, rounds) {
    const current = rounds.find((r) => r.answered_at == null);
    if (current && current.served_at != null && this.now() > current.served_at + this.timerMs + TIMER_GRACE_MS) {
      this.finishRound(game, current, { outcome: 'timeout', points: 0 });
      return true;
    }
    return false;
  }

  finishRound(game, round, { outcome, points, input = null, answer = null, probability = null }) {
    const finished = transaction(this.db, () => {
      const now = this.now();
      const { changes } = this.db
        .prepare(
          `UPDATE rounds SET answered_at = ?, outcome = ?, points = ?, input = ?, answer_key = ?, answer_label = ?, probability = ?
           WHERE game_id = ? AND slot = ? AND answered_at IS NULL`,
        )
        .run(now, outcome, points, input, answer ? answer.key : null, answer ? answer.label : null, probability, game.id, round.slot);
      if (!changes) return false;
      if (answer && game.mode === 'daily') {
        this.db
          .prepare(
            `INSERT INTO answer_counts (theme_id, answer_key, n) VALUES (?, ?, 1)
             ON CONFLICT (theme_id, answer_key) DO UPDATE SET n = n + 1`,
          )
          .run(round.theme_id, answer.key);
      }
      const remaining = this.db
        .prepare('SELECT COUNT(*) AS n FROM rounds WHERE game_id = ? AND answered_at IS NULL')
        .get(game.id).n;
      this.db
        .prepare('UPDATE games SET score = score + ?, finished_at = ? WHERE id = ?')
        .run(points, remaining === 0 ? now : null, game.id);
      if (game.mode === 'training') this.recordTraining(game, round, { outcome, points, answer }, remaining === 0);
      return remaining === 0;
    });
    if (finished) this.badges.awardForGame(game.id);
    this.badges.awardThemes(game.user_id, this.today());
  }

  /** Cumule les statistiques du mode illimité (les parties elles-mêmes sont effacées ensuite). */
  recordTraining(game, round, { outcome, points, answer }, gameDone) {
    this.db.prepare('INSERT OR IGNORE INTO training_stats (user_id) VALUES (?)').run(game.user_id);
    const answered = outcome === 'answer';
    this.db
      .prepare(
        `UPDATE training_stats SET themes = themes + 1, answers = answers + ?, points = points + ?, pepites = pepites + ?
         WHERE user_id = ?`,
      )
      .run(answered ? 1 : 0, points, answered && points >= 100 ? 1 : 0, game.user_id);
    if (answered) {
      const theme = this.themes.get(round.theme_id);
      this.db
        .prepare('UPDATE training_stats SET best_round = ?, best_round_theme = ?, best_round_answer = ? WHERE user_id = ? AND best_round < ?')
        .run(points, theme ? theme.title : round.theme_id, answer.label, game.user_id, points);
    }
    if (gameDone) {
      const { score } = this.db.prepare('SELECT score FROM games WHERE id = ?').get(game.id);
      this.db
        .prepare('UPDATE training_stats SET games = games + 1, best_score = MAX(best_score, ?) WHERE user_id = ?')
        .run(score, game.user_id);
    }
  }

  /** Statistiques du joueur : forages quotidiens et mode illimité. */
  playerStats(userId) {
    const daily = this.db
      .prepare(
        `SELECT COUNT(*) AS themes,
                SUM(r.outcome = 'answer') AS answers,
                COALESCE(SUM(r.points), 0) AS points,
                SUM(r.points >= 100) AS pepites,
                COUNT(DISTINCT r.theme_id) AS distinctThemes
         FROM rounds r JOIN games g ON g.id = r.game_id
         WHERE g.user_id = ? AND g.mode = 'daily' AND r.answered_at IS NOT NULL`,
      )
      .get(userId);
    const best = this.db
      .prepare(
        `SELECT r.points, r.theme_id, r.answer_label FROM rounds r JOIN games g ON g.id = r.game_id
         WHERE g.user_id = ? AND g.mode = 'daily' AND r.outcome = 'answer' ORDER BY r.points DESC, g.day DESC LIMIT 1`,
      )
      .get(userId);
    const bestTheme = best && this.themes.get(best.theme_id);
    const t = this.db.prepare('SELECT * FROM training_stats WHERE user_id = ?').get(userId);
    const avg = (points, n) => (n ? Math.round(points / n) : 0);
    return {
      daily: {
        themes: daily.themes,
        distinctThemes: daily.distinctThemes,
        answers: daily.answers || 0,
        average: avg(daily.points, daily.answers || 0),
        pepites: daily.pepites || 0,
        best: best ? { points: best.points, theme: bestTheme ? bestTheme.title : best.theme_id, answer: best.answer_label } : null,
      },
      training: {
        games: t ? t.games : 0,
        themes: t ? t.themes : 0,
        answers: t ? t.answers : 0,
        average: t ? avg(t.points, t.answers) : 0,
        pepites: t ? t.pepites : 0,
        bestScore: t ? t.best_score : 0,
        best: t && t.best_round ? { points: t.best_round, theme: t.best_round_theme, answer: t.best_round_answer } : null,
      },
      themesSeen: daily.themes + (t ? t.themes : 0),
    };
  }

  /**
   * Comparaison d'un jour : réponses et points de chaque joueur, thème par thème.
   * Réservé aux jours passés, ou au jour en cours une fois son propre forage terminé.
   */
  compareDay(day, userId) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > this.today()) throw new HttpError(400, 'Jour invalide.');
    if (day === this.today()) {
      const mine = this.dailyGameFor(userId, day);
      if (!mine || mine.finished_at == null) throw new HttpError(403, 'Termine ton forage du jour pour voir les réponses des autres.');
    }
    const games = this.db
      .prepare(
        `SELECT g.id, g.score, g.user_id AS userId, u.username FROM games g JOIN users u ON u.id = g.user_id
         WHERE g.mode = 'daily' AND g.day = ? AND g.finished_at IS NOT NULL ORDER BY g.score DESC, u.username_key ASC`,
      )
      .all(day);
    const roundsOf = this.db.prepare('SELECT * FROM rounds WHERE game_id = ? ORDER BY slot');
    const players = games.map((g) => ({
      username: g.username,
      score: g.score,
      me: g.userId === userId,
      rounds: roundsOf.all(g.id).map((r) => ({
        slot: r.slot,
        outcome: r.outcome,
        answer: r.answer_label,
        input: r.input,
        points: r.points,
        tier: tierFor(r.points, r.outcome).id,
      })),
    }));
    const slots = games.length ? roundsOf.all(games[0].id) : [];
    const themes = slots.map((r) => {
      const theme = this.themes.get(r.theme_id);
      return { slot: r.slot, title: theme ? theme.title : 'Thème indisponible' };
    });
    return { day, themes, players };
  }

  roundView(round, game) {
    const theme = this.themes.get(round.theme_id);
    const served = round.served_at != null;
    const done = round.answered_at != null;
    return {
      slot: round.slot,
      title: served ? (theme ? theme.title : 'Thème indisponible') : null,
      status: done ? 'done' : served ? 'active' : 'pending',
      input: done ? round.input : null,
      answer: done ? round.answer_label : null,
      points: done ? round.points : null,
      outcome: done ? round.outcome : null,
      probability: done ? round.probability : null,
      tier: done ? tierFor(round.points, round.outcome) : null,
      othersCount: done && game && round.answer_key ? this.othersCount(game, round) : null,
    };
  }

  /** Nombre d'autres joueurs ayant donné la même réponse en partie quotidienne. */
  othersCount(game, round) {
    const row = this.db
      .prepare('SELECT n FROM answer_counts WHERE theme_id = ? AND answer_key = ?')
      .get(round.theme_id, round.answer_key);
    const n = row ? row.n : 0;
    return Math.max(0, game.mode === 'daily' ? n - 1 : n);
  }

  /** Scores des forages quotidiens terminés ce jour-là (anonymes), pour situer le joueur. */
  dayScores(day) {
    return this.db
      .prepare("SELECT score FROM games WHERE mode = 'daily' AND day = ? AND finished_at IS NOT NULL ORDER BY score")
      .all(day)
      .map((r) => r.score);
  }

  state(gameId, userId) {
    let { game, rounds } = this.loadGame(gameId, userId);
    if (this.expireIfNeeded(game, rounds)) ({ game, rounds } = this.loadGame(gameId, userId));
    const current = rounds.find((r) => r.answered_at == null && r.served_at != null);
    const finished = game.finished_at != null;
    return {
      id: game.id,
      mode: game.mode,
      day: game.day,
      score: game.score,
      finished,
      timerSeconds: TIMER_SECONDS,
      rounds: rounds.map((r) => this.roundView(r, game)),
      dayScores: finished && game.mode === 'daily' ? this.dayScores(game.day) : null,
      current: current
        ? { slot: current.slot, remainingMs: Math.max(0, current.served_at + this.timerMs - this.now()) }
        : null,
    };
  }

  /** Révèle le thème suivant et démarre son chrono. */
  reveal(gameId, userId) {
    let { game, rounds } = this.loadGame(gameId, userId);
    if (this.expireIfNeeded(game, rounds)) ({ game, rounds } = this.loadGame(gameId, userId));
    const next = rounds.find((r) => r.answered_at == null);
    if (next && next.served_at == null) {
      this.db.prepare('UPDATE rounds SET served_at = ? WHERE game_id = ? AND slot = ?').run(this.now(), game.id, next.slot);
    }
    return this.state(gameId, userId);
  }

  activeRound(gameId, userId) {
    const { game, rounds } = this.loadGame(gameId, userId);
    if (game.finished_at != null) throw new HttpError(409, 'Cette partie est terminée.');
    const round = rounds.find((r) => r.answered_at == null);
    if (!round || round.served_at == null) throw new HttpError(409, "Aucun thème n'est en cours.");
    return { game, round };
  }

  /**
   * Réponse du joueur. Si la saisie ne correspond qu'approximativement (faute de frappe, variante),
   * le jeu propose la réponse reconnue (`confirm`) : le joueur la renvoie dans `accept` pour valider,
   * ou envoie `reject` pour la refuser et tenter autre chose.
   */
  answer(gameId, userId, text, { accept = null, reject = false } = {}) {
    const input = typeof text === 'string' ? text.trim().slice(0, 80) : '';
    if (!input) throw new HttpError(400, 'Réponse vide.');
    const { game, round } = this.activeRound(gameId, userId);
    const resultFor = (result) => ({
      result,
      round: this.roundView(this.db.prepare('SELECT * FROM rounds WHERE game_id = ? AND slot = ?').get(game.id, round.slot), game),
      state: this.state(gameId, userId),
    });

    if (this.now() > round.served_at + this.timerMs + TIMER_GRACE_MS) {
      this.finishRound(game, round, { outcome: 'timeout', points: 0 });
      return resultFor('timeout');
    }

    const theme = this.themes.get(round.theme_id);
    const match = theme ? matchAnswer(theme, input) : null;
    if (!match || (match.approximate && reject)) {
      if (game.mode === 'daily' && theme) this.recordUnknown(theme.id, input);
      return { result: 'unknown', input, state: this.state(gameId, userId) };
    }
    if (match.approximate && accept !== match.answer.label) {
      return { result: 'confirm', input, suggestion: match.answer.label, state: this.state(gameId, userId) };
    }

    const counts = new Map(
      this.db.prepare('SELECT answer_key, n FROM answer_counts WHERE theme_id = ?').all(theme.id).map((r) => [r.answer_key, r.n]),
    );
    const score = scoreAnswer(theme, counts, match.answer.key);
    this.finishRound(game, round, {
      outcome: 'answer',
      points: score.points,
      input,
      answer: match.answer,
      probability: score.probability,
    });
    return resultFor('ok');
  }

  /**
   * Le joueur pense qu'une réponse refusée est correcte : elle est notée pour vérification
   * (aucun point n'est donné). Possible pour le thème en cours ou un thème déjà joué.
   */
  reportAnswer(gameId, userId, slot, text) {
    const input = typeof text === 'string' ? text.trim().slice(0, 80) : '';
    const key = toKey(input);
    if (!key) throw new HttpError(400, 'Réponse vide.');
    const { rounds } = this.loadGame(gameId, userId);
    const round = Number.isInteger(slot)
      ? rounds.find((r) => r.slot === slot)
      : rounds.find((r) => r.answered_at == null && r.served_at != null);
    if (!round || round.served_at == null) throw new HttpError(404, 'Thème introuvable.');
    const theme = this.themes.get(round.theme_id);
    if (!theme) throw new HttpError(404, 'Ce thème n\'existe plus.');
    const match = matchAnswer(theme, input);
    if (match) return { status: 'known', label: match.answer.label };
    // Signalé pendant la manche (sans préciser de manche) : donne droit aux points si la réponse est ajoutée.
    const during = !Number.isInteger(slot) && round.answered_at == null;
    const recent = this.db
      .prepare('SELECT COUNT(*) AS n FROM answer_reports WHERE user_id = ? AND created_at > ?')
      .get(userId, this.now() - 24 * 3600 * 1000).n;
    if (recent >= 30) throw new HttpError(429, 'Beaucoup de signalements aujourd\'hui : merci, on en reste là pour l\'instant !');
    this.db
      .prepare(
        'INSERT OR IGNORE INTO answer_reports (user_id, theme_id, input_key, input, created_at, game_id, slot) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(userId, theme.id, key, input, this.now(), during ? gameId : null, during ? round.slot : null);
    return { status: 'recorded' };
  }

  /** Réponses signalées, regroupées par thème et par saisie (les plus demandées d'abord). */
  reportedAnswers() {
    const rows = this.db
      .prepare(
        `SELECT theme_id, input_key, MIN(input) AS input, COUNT(*) AS players, MIN(created_at) AS first_at,
                MAX(created_at) AS last_at, SUM(handled_at IS NULL) AS pending, SUM(credit = 'credited') AS credited
         FROM answer_reports GROUP BY theme_id, input_key
         ORDER BY pending > 0 DESC, players DESC, last_at DESC LIMIT 300`,
      )
      .all();
    return rows.map((r) => {
      const theme = this.themes.get(r.theme_id);
      // Réponse ajoutée au thème depuis le signalement : plus rien à faire.
      const added = Boolean(theme && matchAnswer(theme, r.input));
      return {
        themeId: r.theme_id,
        themeTitle: theme ? theme.title : r.theme_id,
        inputKey: r.input_key,
        input: r.input,
        players: r.players,
        firstAt: r.first_at,
        lastAt: r.last_at,
        credited: r.credited || 0,
        status: added ? 'added' : r.pending ? 'pending' : 'handled',
      };
    });
  }

  /**
   * Accorde les points aux joueurs qui avaient signalé, pendant leur manche, une réponse qui a
   * depuis été ajoutée au thème. Conditions : manche close sans réponse valide, forage quotidien,
   * et semaine du forage encore en cours (on ne modifie pas un podium hebdomadaire terminé).
   * Renvoie le nombre de joueurs crédités.
   */
  creditReports() {
    // Signalements faits avant que la manche soit retenue : on la retrouve avec l'heure du signalement
    // (manche de ce thème qui était ouverte à ce moment-là).
    const old = this.db.prepare('SELECT rowid AS id, * FROM answer_reports WHERE game_id IS NULL AND credit IS NULL').all();
    for (const r of old) {
      const round = this.db
        .prepare(
          `SELECT r.game_id, r.slot FROM rounds r JOIN games g ON g.id = r.game_id
           WHERE g.user_id = ? AND r.theme_id = ? AND r.served_at IS NOT NULL AND r.served_at <= ?
             AND (r.answered_at IS NULL OR r.answered_at >= ?)
           ORDER BY r.served_at DESC LIMIT 1`,
        )
        .get(r.user_id, r.theme_id, r.created_at, r.created_at);
      if (round) this.db.prepare('UPDATE answer_reports SET game_id = ?, slot = ? WHERE rowid = ?').run(round.game_id, round.slot, r.id);
    }
    const rows = this.db
      .prepare('SELECT rowid AS id, * FROM answer_reports WHERE game_id IS NOT NULL AND credit IS NULL')
      .all();
    let credited = 0;
    for (const r of rows) {
      const theme = this.themes.get(r.theme_id);
      const match = theme && matchAnswer(theme, r.input);
      if (!match) continue; // pas (encore) ajoutée au thème
      const game = this.db.prepare('SELECT * FROM games WHERE id = ?').get(r.game_id);
      const round = this.db.prepare('SELECT * FROM rounds WHERE game_id = ? AND slot = ?').get(r.game_id, r.slot);
      const setCredit = (status, points = null) =>
        this.db.prepare('UPDATE answer_reports SET credit = ?, points = ? WHERE rowid = ?').run(status, points, r.id);
      if (!game || !round || game.mode !== 'daily' || round.answered_at == null) {
        setCredit('ineligible');
      } else if (round.outcome === 'answer') {
        setCredit('kept'); // le joueur a trouvé une autre réponse depuis : il garde ses points
      } else if (weekStart(game.day) !== weekStart(this.today())) {
        setCredit('expired');
      } else {
        const counts = new Map(
          this.db.prepare('SELECT answer_key, n FROM answer_counts WHERE theme_id = ?').all(theme.id).map((x) => [x.answer_key, x.n]),
        );
        const score = scoreAnswer(theme, counts, match.answer.key);
        transaction(this.db, () => {
          this.db
            .prepare(
              `UPDATE rounds SET outcome = 'answer', points = ?, input = ?, answer_key = ?, answer_label = ?, probability = ?
               WHERE game_id = ? AND slot = ?`,
            )
            .run(score.points, r.input, match.answer.key, match.answer.label, score.probability, r.game_id, r.slot);
          this.db.prepare('UPDATE games SET score = score + ? WHERE id = ?').run(score.points, r.game_id);
          this.db
            .prepare(
              `INSERT INTO answer_counts (theme_id, answer_key, n) VALUES (?, ?, 1)
               ON CONFLICT (theme_id, answer_key) DO UPDATE SET n = n + 1`,
            )
            .run(theme.id, match.answer.key);
          setCredit('credited', score.points);
        });
        this.badges.awardForGame(r.game_id);
        credited++;
      }
    }
    return credited;
  }

  markReportHandled(themeId, inputKey) {
    this.db
      .prepare('UPDATE answer_reports SET handled_at = ? WHERE theme_id = ? AND input_key = ? AND handled_at IS NULL')
      .run(this.now(), themeId, inputKey);
  }

  /** Un joueur propose un thème : titre obligatoire, précisions facultatives (au plus 5 par jour). */
  suggestTheme(userId, title, details) {
    const t = typeof title === 'string' ? title.trim().replace(/\s+/g, ' ').slice(0, 140) : '';
    const d = typeof details === 'string' ? details.trim().slice(0, 1500) : '';
    if (t.length < 5) throw new HttpError(400, 'Décris le thème en quelques mots (au moins 5 caractères).');
    const recent = this.db
      .prepare('SELECT COUNT(*) AS n FROM theme_suggestions WHERE user_id = ? AND created_at > ?')
      .get(userId, this.now() - 24 * 3600 * 1000).n;
    if (recent >= 5) throw new HttpError(429, 'Beaucoup de propositions aujourd\'hui : merci, reviens demain !');
    this.db.prepare('INSERT INTO theme_suggestions (user_id, title, details, created_at) VALUES (?, ?, ?, ?)').run(userId, t, d, this.now());
    return { ok: true };
  }

  /** Propositions d'un joueur (les plus récentes d'abord). */
  mySuggestions(userId) {
    return this.db
      .prepare('SELECT id, title, details, created_at AS createdAt, handled_at AS handledAt FROM theme_suggestions WHERE user_id = ? ORDER BY id DESC LIMIT 50')
      .all(userId)
      .map((r) => ({ ...r, handled: r.handledAt != null }));
  }

  /** Toutes les propositions, avec l'auteur (responsable du jeu). */
  allSuggestions() {
    return this.db
      .prepare(
        `SELECT s.id, s.title, s.details, s.created_at AS createdAt, s.handled_at AS handledAt, u.username
         FROM theme_suggestions s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC`,
      )
      .all()
      .map((r) => ({ ...r, handled: r.handledAt != null }));
  }

  markSuggestionHandled(id) {
    this.db.prepare('UPDATE theme_suggestions SET handled_at = ? WHERE id = ? AND handled_at IS NULL').run(this.now(), id);
  }

  /** Toutes les réponses d'un thème déjà joué, avec leur rareté actuelle. */
  themeAnswers(gameId, userId, slot) {
    const { game, rounds } = this.loadGame(gameId, userId);
    if (game.finished_at == null) throw new HttpError(409, 'Termine ta partie pour voir les réponses.');
    const round = rounds.find((r) => r.slot === slot);
    if (!round) throw new HttpError(404, 'Thème introuvable.');
    const theme = this.themes.get(round.theme_id);
    if (!theme) throw new HttpError(404, 'Ce thème n\'existe plus.');
    const counts = new Map(
      this.db.prepare('SELECT answer_key, n FROM answer_counts WHERE theme_id = ?').all(theme.id).map((r) => [r.answer_key, r.n]),
    );
    const { probs, pMax } = probabilities(theme, counts);
    const answers = theme.answers
      .map((a) => {
        const count = counts.get(a.key) || 0;
        const points = pointsFor(probs.get(a.key), pMax, count > 0);
        return { label: a.label, points, tier: tierFor(points, 'answer').id, count, mine: a.key === round.answer_key };
      })
      .sort((a, b) => a.points - b.points || b.count - a.count || a.label.localeCompare(b.label, 'fr'));
    return { slot, title: theme.title, answers };
  }

  skip(gameId, userId) {
    const { game, round } = this.activeRound(gameId, userId);
    const expired = this.now() >= round.served_at + this.timerMs;
    this.finishRound(game, round, { outcome: expired ? 'timeout' : 'skip', points: 0 });
    return {
      result: expired ? 'timeout' : 'skip',
      round: this.roundView(this.db.prepare('SELECT * FROM rounds WHERE game_id = ? AND slot = ?').get(game.id, round.slot), game),
      state: this.state(gameId, userId),
    };
  }

  recordUnknown(themeId, input) {
    const key = toKey(input);
    if (!key) return;
    this.db
      .prepare(
        `INSERT INTO unknown_answers (theme_id, input_key, example, n, last_at) VALUES (?, ?, ?, 1, ?)
         ON CONFLICT (theme_id, input_key) DO UPDATE SET n = n + 1, example = excluded.example, last_at = excluded.last_at`,
      )
      .run(themeId, key, input, this.now());
  }

  todaySummary(userId) {
    const day = this.today();
    const game = this.dailyGameFor(userId, day);
    if (!game) return { day, gameId: null, score: 0, finished: false, roundsDone: 0 };
    const roundsDone = this.db
      .prepare('SELECT COUNT(*) AS n FROM rounds WHERE game_id = ? AND answered_at IS NOT NULL')
      .get(game.id).n;
    return { day, gameId: game.id, score: game.score, finished: game.finished_at != null, roundsDone };
  }

  /** Début, fin et voisins de la période (jour, semaine lundi → dimanche, mois) contenant `day`. */
  periodRange(period, day) {
    if (period === 'day') return { start: day, end: day, prev: addDays(day, -1), next: addDays(day, 1) };
    if (period === 'month') {
      const start = monthStart(day);
      return { start, end: monthEnd(day), prev: addMonths(start, -1), next: addMonths(start, 1) };
    }
    const start = weekStart(day);
    return { start, end: addDays(start, 6), prev: addDays(start, -7), next: addDays(start, 7) };
  }

  /** Classement des forages quotidiens sur la période contenant `day`. */
  leaderboard(day, userId, period = 'week') {
    if (!PERIODS.includes(period)) throw new HttpError(400, 'Période inconnue.');
    const { start, end, prev, next } = this.periodRange(period, day);
    const rows = this.db
      .prepare(
        `SELECT u.id AS userId, u.username, SUM(g.score) AS score, COUNT(*) AS days
         FROM games g JOIN users u ON u.id = g.user_id
         WHERE g.mode = 'daily' AND g.day BETWEEN ? AND ?
         GROUP BY u.id
         ORDER BY score DESC, u.username_key ASC`,
      )
      .all(start, end);
    let rank = 0;
    let previousScore = null;
    const entries = rows.map((r, i) => {
      if (r.score !== previousScore) {
        rank = i + 1;
        previousScore = r.score;
      }
      return { rank, username: r.username, score: r.score, days: r.days, me: r.userId === userId };
    });
    const today = this.today();
    return {
      period,
      start,
      end,
      prev,
      next: next <= today ? next : null,
      isCurrent: start <= today && today <= end,
      entries: entries.slice(0, 50),
      me: entries.find((e) => e.me) || null,
    };
  }
}

module.exports = { GameService, HttpError };
