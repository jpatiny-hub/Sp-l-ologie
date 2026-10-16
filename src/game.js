'use strict';

const crypto = require('node:crypto');
const { ROUNDS_PER_GAME, TIMER_SECONDS, TIMER_GRACE_MS } = require('./config');
const { dayKey, addDays, weekStart } = require('./dates');
const { transaction } = require('./db');
const { matchAnswer, toKey } = require('./matching');
const { scoreAnswer, tierFor } = require('./scoring');

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
    transaction(this.db, () => {
      const now = this.now();
      const { changes } = this.db
        .prepare(
          `UPDATE rounds SET answered_at = ?, outcome = ?, points = ?, input = ?, answer_key = ?, answer_label = ?, probability = ?
           WHERE game_id = ? AND slot = ? AND answered_at IS NULL`,
        )
        .run(now, outcome, points, input, answer ? answer.key : null, answer ? answer.label : null, probability, game.id, round.slot);
      if (!changes) return;
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
    });
  }

  roundView(round) {
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
    };
  }

  state(gameId, userId) {
    let { game, rounds } = this.loadGame(gameId, userId);
    if (this.expireIfNeeded(game, rounds)) ({ game, rounds } = this.loadGame(gameId, userId));
    const current = rounds.find((r) => r.answered_at == null && r.served_at != null);
    return {
      id: game.id,
      mode: game.mode,
      day: game.day,
      score: game.score,
      finished: game.finished_at != null,
      timerSeconds: TIMER_SECONDS,
      rounds: rounds.map((r) => this.roundView(r)),
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

  answer(gameId, userId, text) {
    const input = typeof text === 'string' ? text.trim().slice(0, 80) : '';
    if (!input) throw new HttpError(400, 'Réponse vide.');
    const { game, round } = this.activeRound(gameId, userId);
    const resultFor = (result) => ({
      result,
      round: this.roundView(this.db.prepare('SELECT * FROM rounds WHERE game_id = ? AND slot = ?').get(game.id, round.slot)),
      state: this.state(gameId, userId),
    });

    if (this.now() > round.served_at + this.timerMs + TIMER_GRACE_MS) {
      this.finishRound(game, round, { outcome: 'timeout', points: 0 });
      return resultFor('timeout');
    }

    const theme = this.themes.get(round.theme_id);
    const match = theme ? matchAnswer(theme, input) : null;
    if (!match) {
      if (game.mode === 'daily' && theme) this.recordUnknown(theme.id, input);
      return { result: 'unknown', input, state: this.state(gameId, userId) };
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

  skip(gameId, userId) {
    const { game, round } = this.activeRound(gameId, userId);
    const expired = this.now() >= round.served_at + this.timerMs;
    this.finishRound(game, round, { outcome: expired ? 'timeout' : 'skip', points: 0 });
    return {
      result: expired ? 'timeout' : 'skip',
      round: this.roundView(this.db.prepare('SELECT * FROM rounds WHERE game_id = ? AND slot = ?').get(game.id, round.slot)),
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

  /** Classement de la semaine (lundi → dimanche) contenant `day`. */
  leaderboard(day, userId) {
    const start = weekStart(day);
    const end = addDays(start, 6);
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
      weekStart: start,
      weekEnd: end,
      isCurrent: start === weekStart(today),
      hasNext: start < weekStart(today),
      entries: entries.slice(0, 50),
      me: entries.find((e) => e.me) || null,
    };
  }
}

module.exports = { GameService, HttpError };
