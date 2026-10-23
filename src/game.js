'use strict';

const crypto = require('node:crypto');
const { ROUNDS_PER_GAME, TIMER_SECONDS, TIMER_GRACE_MS } = require('./config');
const { dayKey, addDays, weekStart, monthStart, addMonths, monthEnd } = require('./dates');
const { transaction } = require('./db');
const { HttpError } = require('./errors');
const { DuelService } = require('./duels');
const { matchAnswer, toKey } = require('./matching');
const { scoreAnswer, probabilities, pointsFor, tierFor } = require('./scoring');
const { BadgeService } = require('./badges');
const { usernameKey } = require('./auth');
const Avatar = require('./avatar');

const PERIODS = ['day', 'week', 'month'];
// Réactions possibles dans le comparatif.
const REACTIONS = ['bienvu', 'coeur', 'creuse', 'audace', 'surprise'];


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
    this.duels = new DuelService(this);
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

  /**
   * Thème de remplacement du jour (le « joker ») : le même pour tous, tiré parmi les thèmes pas encore choisis ce jour-là,
   * en privilégiant ceux qui n'ont pas servi depuis longtemps.
   */
  dailySpare(day) {
    const existing = this.db.prepare('SELECT theme_id FROM daily_spare WHERE day = ?').get(day);
    if (existing && this.themes.get(existing.theme_id)) return existing.theme_id;
    const todays = new Set(this.dailyThemes(day));
    const lastUsed = new Map(
      this.db
        .prepare('SELECT theme_id, MAX(day) AS last FROM daily_themes WHERE day < ? GROUP BY theme_id')
        .all(day)
        .map((r) => [r.theme_id, r.last]),
    );
    const candidates = shuffle(this.activeThemeIds().filter((id) => !todays.has(id)));
    if (!candidates.length) return null;
    candidates.sort((a, b) => (lastUsed.get(a) || '').localeCompare(lastUsed.get(b) || ''));
    this.db.prepare('INSERT OR REPLACE INTO daily_spare (day, theme_id) VALUES (?, ?)').run(day, candidates[0]);
    return candidates[0];
  }

  /** Thème de remplacement de la partie (joker), ou null s'il n'y en a pas ou s'il est déjà utilisé. */
  spareFor(game) {
    if (game.joker_used) return null;
    return game.mode === 'daily' ? this.dailySpare(game.day) : game.spare_theme || null;
  }

  dailyGameFor(userId, day) {
    return this.db.prepare("SELECT * FROM games WHERE user_id = ? AND day = ? AND mode = 'daily'").get(userId, day);
  }

  /** Tire `count` thèmes au hasard, en écartant ceux du jour (on ne s'entraîne pas sur les thèmes du forage). */
  randomThemes(count, extra = 0) {
    const excluded = new Set(this.dailyThemes(this.today()));
    const pool = shuffle(this.activeThemeIds().filter((id) => !excluded.has(id)));
    if (pool.length < count + extra) throw new HttpError(500, 'Pas assez de thèmes pour cette partie.');
    return pool.slice(0, count + extra);
  }

  startGame(userId, mode, { noTimer = false } = {}) {
    const day = this.today();
    if (mode === 'daily') {
      const existing = this.dailyGameFor(userId, day);
      if (existing) return this.state(existing.id, userId);
      return this.state(this.createGame(userId, 'daily', day, this.dailyThemes(day)), userId);
    }
    if (mode === 'training') {
      const pool = this.randomThemes(ROUNDS_PER_GAME, 1);
      this.db.prepare("DELETE FROM games WHERE user_id = ? AND mode = 'training'").run(userId);
      return this.state(this.createGame(userId, 'training', day, pool.slice(0, ROUNDS_PER_GAME), pool[ROUNDS_PER_GAME] || null, { noTimer }), userId);
    }
    throw new HttpError(400, 'Mode de jeu inconnu.');
  }

  createGame(userId, mode, day, themeIds, spare = null, { duelId = null, noTimer = false } = {}) {
    return transaction(this.db, () => {
      const { lastInsertRowid } = this.db
        .prepare('INSERT INTO games (user_id, mode, day, created_at, spare_theme, duel_id, no_timer) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, mode, day, this.now(), spare, duelId, noTimer ? 1 : 0);
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
    if (game.no_timer) return false;
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
      // Le mode « à l'aise » (sans chrono) ne compte ni pour les badges ni pour les statistiques.
      if (game.mode === 'training' && !game.no_timer) this.recordTraining(game, round, { outcome, points, answer }, remaining === 0);
      return remaining === 0;
    });
    if (finished) {
      this.badges.awardForGame(game.id);
      if (game.mode === 'duel') this.duels.afterGame(game);
    }
    this.badges.awardThemes(game.user_id, this.today());
  }

  /** Cumule les statistiques du mode illimité (les parties elles-mêmes sont effacées ensuite). */
  recordTraining(game, round, { outcome, points, answer }, gameDone) {
    this.db.prepare('INSERT OR IGNORE INTO training_stats (user_id) VALUES (?)').run(game.user_id);
    if (answer) {
      this.db
        .prepare(
          `INSERT INTO training_answer_counts (theme_id, answer_key, n) VALUES (?, ?, 1)
           ON CONFLICT (theme_id, answer_key) DO UPDATE SET n = n + 1`,
        )
        .run(round.theme_id, answer.key);
    }
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
      this.db.prepare('INSERT OR IGNORE INTO training_log (user_id, day, game_id) VALUES (?, ?, ?)').run(game.user_id, game.day, game.id);
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
    const charts = this.chartData(userId);
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
      charts,
    };
  }

  /** Données des graphiques du carnet : calendrier des jours forés, derniers scores, répartition par rareté, réponse signature. */
  chartData(userId) {
    const today = this.today();
    const start = addDays(weekStart(today), -77); // 12 semaines, du lundi au dimanche
    const games = this.db
      .prepare("SELECT day, score FROM games WHERE user_id = ? AND mode = 'daily' AND finished_at IS NOT NULL AND day >= ? ORDER BY day")
      .all(userId, start);
    const byDay = new Map(games.map((g) => [g.day, g.score]));
    const calendar = [];
    for (let d = start; d <= addDays(weekStart(today), 6); d = addDays(d, 1)) calendar.push({ day: d, score: byDay.has(d) ? byDay.get(d) : null, future: d > today });
    const recent = this.db
      .prepare("SELECT day, score FROM games WHERE user_id = ? AND mode = 'daily' AND finished_at IS NOT NULL ORDER BY day DESC LIMIT 30")
      .all(userId)
      .reverse();
    const points = this.db
      .prepare("SELECT r.points FROM rounds r JOIN games g ON g.id = r.game_id WHERE g.user_id = ? AND g.mode = 'daily' AND r.outcome = 'answer'")
      .all(userId);
    const tiers = { evident: 0, courant: 0, original: 0, rare: 0, pepite: 0 };
    points.forEach((r) => (tiers[tierFor(r.points, 'answer').id] += 1));
    const signature = this.db
      .prepare(
        `SELECT r.answer_label AS answer, COUNT(*) AS n FROM rounds r JOIN games g ON g.id = r.game_id
         WHERE g.user_id = ? AND g.mode = 'daily' AND r.outcome = 'answer' AND r.answer_label IS NOT NULL
         GROUP BY r.answer_key ORDER BY n DESC, MAX(r.points) DESC LIMIT 1`,
      )
      .get(userId);
    return { calendar, recent, tiers, signature: signature && signature.n >= 2 ? signature : null };
  }

  /** Bilan d'un mois (AAAA-MM) : jours forés, points, meilleurs moments et progression par rapport au mois précédent. */
  monthSummary(userId, month) {
    const current = /^\d{4}-\d{2}$/.test(month || '') ? month : this.today().slice(0, 7);
    const first = `${current}-01`;
    const last = monthEnd(first);
    const totals = (from, to) => {
      const games = this.db
        .prepare("SELECT id, day, score FROM games WHERE user_id = ? AND mode = 'daily' AND finished_at IS NOT NULL AND day BETWEEN ? AND ?")
        .all(userId, from, to);
      const rounds = games.length
        ? this.db
            .prepare(`SELECT r.points, r.outcome, r.theme_id, r.answer_label, g.day FROM rounds r JOIN games g ON g.id = r.game_id WHERE g.id IN (${games.map(() => '?').join(',')})`)
            .all(...games.map((g) => g.id))
        : [];
      const total = games.reduce((n, g) => n + g.score, 0);
      return { games, rounds, total, average: games.length ? Math.round(total / games.length) : 0 };
    };
    const now = totals(first, last);
    const prevFirst = addMonths(first, -1);
    const before = totals(prevFirst, monthEnd(prevFirst));
    const best = now.games.slice().sort((a, b) => b.score - a.score)[0] || null;
    const answered = now.rounds.filter((r) => r.outcome === 'answer');
    const bestRound = answered.slice().sort((a, b) => b.points - a.points)[0] || null;
    const bestTheme = bestRound ? this.themes.get(bestRound.theme_id) : null;
    const chart = this.chartData(userId);
    return {
      month: current,
      days: now.games.length,
      totalPoints: now.total,
      average: now.average,
      bestGame: best && { day: best.day, score: best.score },
      bestRound: bestRound && { points: bestRound.points, answer: bestRound.answer_label, theme: bestTheme ? bestTheme.title : bestRound.theme_id, day: bestRound.day },
      pepites: now.rounds.filter((r) => r.points >= 100).length,
      rares: answered.filter((r) => r.points >= 60).length,
      skipped: now.rounds.filter((r) => r.outcome !== 'answer').length,
      previous: { days: before.games.length, average: before.average, totalPoints: before.total },
      signature: chart.signature,
    };
  }

  /** Tableau de bord du responsable : réponses refusées, thèmes concernés et activité récente. */
  adminDashboard() {
    const today = this.today();
    const refused = this.db
      .prepare('SELECT theme_id, example, n FROM unknown_answers ORDER BY n DESC, last_at DESC LIMIT 15')
      .all()
      .map((r) => ({ theme: (this.themes.get(r.theme_id) || {}).title || r.theme_id, input: r.example, n: r.n }));
    const refusedThemes = this.db
      .prepare('SELECT theme_id, SUM(n) AS n FROM unknown_answers GROUP BY theme_id ORDER BY n DESC LIMIT 10')
      .all()
      .map((r) => ({ theme: (this.themes.get(r.theme_id) || {}).title || r.theme_id, n: r.n }));
    const perDay = this.db
      .prepare("SELECT day, COUNT(*) AS n FROM games WHERE mode = 'daily' AND finished_at IS NOT NULL AND day >= ? GROUP BY day ORDER BY day")
      .all(addDays(today, -6));
    const week = weekStart(today);
    const players = this.db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM games WHERE mode = 'daily' AND day >= ?").get(week).n;
    const total = this.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const pending = this.db.prepare('SELECT COUNT(DISTINCT theme_id || input_key) AS n FROM answer_reports WHERE handled_at IS NULL').get().n;
    const trainingTotal = this.db.prepare('SELECT COALESCE(SUM(games), 0) AS n FROM training_stats').get().n;
    return { activePlayersThisWeek: players, totalPlayers: total, perDay, refused, refusedThemes, pendingReports: pending, trainingGames: trainingTotal };
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
        `SELECT g.id, g.score, g.user_id AS userId, u.username, u.avatar FROM games g JOIN users u ON u.id = g.user_id
         WHERE g.mode = 'daily' AND g.day = ? AND g.finished_at IS NOT NULL ORDER BY g.score DESC, u.username_key ASC`,
      )
      .all(day);
    const roundsOf = this.db.prepare('SELECT * FROM rounds WHERE game_id = ? ORDER BY slot');
    // Réactions reçues par chaque manche, et celles du joueur qui regarde.
    const reacted = new Map();
    if (games.length) {
      const rows = this.db
        .prepare(`SELECT game_id, slot, reactor_id, kind FROM reactions WHERE game_id IN (${games.map(() => '?').join(',')})`)
        .all(...games.map((g) => g.id));
      for (const r of rows) {
        const key = `${r.game_id}:${r.slot}`;
        if (!reacted.has(key)) reacted.set(key, { counts: {}, mine: null });
        const entry = reacted.get(key);
        entry.counts[r.kind] = (entry.counts[r.kind] || 0) + 1;
        if (r.reactor_id === userId) entry.mine = r.kind;
      }
    }
    const players = games.map((g) => ({
      username: g.username,
      avatar: Avatar.normalize(g.avatar, g.userId),
      score: g.score,
      me: g.userId === userId,
      rounds: roundsOf.all(g.id).flatMap((r) => {
        const result = {
          slot: r.slot,
          themeId: r.theme_id,
          outcome: r.outcome,
          answer: r.answer_label,
          input: r.input,
          points: r.points,
          tier: tierFor(r.points, r.outcome).id,
          rid: `${g.id}:${r.slot}`,
          reactions: (reacted.get(`${g.id}:${r.slot}`) || { counts: {} }).counts,
          mine: (reacted.get(`${g.id}:${r.slot}`) || { mine: null }).mine,
        };
        // Galerie de secours : le thème remplacé apparaît comme « galerie de secours », et le thème de remplacement
        // forme une rubrique à part (en dernier), où seuls ceux qui ont utilisé la galerie figurent.
        if (!r.swapped_from) return [result];
        return [
          { slot: r.slot, themeId: r.swapped_from, outcome: 'joker', answer: null, input: null, points: 0, tier: 'skip' },
          { ...result, spare: true },
        ];
      }),
    }));
    // Thèmes du jour : ceux de chaque joueur (un joueur qui a utilisé son joker a le thème de remplacement à la place d'un autre).
    const order = [];
    const seen = new Set();
    for (const p of players) {
      for (const r of p.rounds) {
        if (seen.has(r.themeId)) continue;
        seen.add(r.themeId);
        order.push({ slot: r.spare ? 100 + r.slot : r.slot, themeId: r.themeId, spare: !!r.spare });
      }
    }
    order.sort((a, b) => a.slot - b.slot);
    const themes = order.map((o) => {
      const theme = this.themes.get(o.themeId);
      return { slot: o.slot, themeId: o.themeId, spare: o.spare, title: theme ? theme.title : 'Thème indisponible' };
    });
    return { day, themes, players };
  }

  /**
   * Réaction du joueur à la réponse d'un autre (`rid` = « partie:manche » telle que donnée par le comparatif).
   * Une seule réaction par réponse : en choisir une autre remplace la précédente, `kind` nul la retire.
   */
  react(userId, rid, kind) {
    const m = /^(\d+):(\d+)$/.exec(String(rid || ''));
    if (!m) throw new HttpError(400, 'Réponse inconnue.');
    if (kind !== null && !REACTIONS.includes(kind)) throw new HttpError(400, 'Réaction inconnue.');
    const gameId = Number(m[1]);
    const slot = Number(m[2]);
    const target = this.db.prepare("SELECT * FROM games WHERE id = ? AND mode = 'daily' AND finished_at IS NOT NULL").get(gameId);
    if (!target) throw new HttpError(404, 'Réponse introuvable.');
    if (target.user_id === userId) throw new HttpError(403, 'Tu ne peux pas réagir à ta propre réponse.');
    const round = this.db.prepare("SELECT outcome FROM rounds WHERE game_id = ? AND slot = ? AND answered_at IS NOT NULL").get(gameId, slot);
    if (!round || round.outcome !== 'answer') throw new HttpError(404, 'Pas de réponse à laquelle réagir.');
    // Comme le comparatif : le jour en cours n'est ouvert qu'à ceux qui ont terminé leur forage.
    if (target.day === this.today()) {
      const mine = this.dailyGameFor(userId, target.day);
      if (!mine || mine.finished_at == null) throw new HttpError(403, 'Termine ton forage du jour pour réagir.');
    }
    if (kind === null) this.db.prepare('DELETE FROM reactions WHERE game_id = ? AND slot = ? AND reactor_id = ?').run(gameId, slot, userId);
    else {
      this.db
        .prepare(
          `INSERT INTO reactions (game_id, slot, reactor_id, kind, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (game_id, slot, reactor_id) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at`,
        )
        .run(gameId, slot, userId, kind, this.now());
    }
    if (kind !== null) {
      this.badges.awardReactions(userId, this.today());
      this.badges.awardReactions(target.user_id, this.today());
    }
    const counts = {};
    this.db
      .prepare('SELECT kind, COUNT(*) AS n FROM reactions WHERE game_id = ? AND slot = ? GROUP BY kind')
      .all(gameId, slot)
      .forEach((r) => (counts[r.kind] = r.n));
    return { rid: `${gameId}:${slot}`, reactions: counts, mine: kind };
  }

  /** Vrai pour la partie d'un duel dont le résultat n'est pas encore révélé : ni points ni rareté d'ici là. */
  duelHidden(game) {
    if (!game || game.mode !== 'duel') return false;
    const d = this.db.prepare('SELECT status FROM duels WHERE id = ?').get(game.duel_id);
    return !d || d.status !== 'done';
  }

  roundView(round, game) {
    const theme = this.themes.get(round.theme_id);
    const served = round.served_at != null;
    const done = round.answered_at != null;
    if (this.duelHidden(game)) {
      return {
        slot: round.slot,
        title: served ? (theme ? theme.title : 'Thème indisponible') : null,
        status: done ? 'done' : served ? 'active' : 'pending',
        input: done ? round.input : null,
        answer: done ? round.answer_label : null,
        points: null,
        outcome: done ? round.outcome : null,
        probability: null,
        tier: null,
        othersCount: null,
      };
    }
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
    const hidden = this.duelHidden(game);
    const duel = game.mode === 'duel' ? this.duelInfo(game) : null;
    return {
      id: game.id,
      mode: game.mode,
      day: game.day,
      score: hidden ? null : game.score,
      finished,
      noTimer: !!game.no_timer,
      duel,
      timerSeconds: TIMER_SECONDS,
      // Joker : on peut changer gratuitement un thème par partie ; ensuite, passer coûte le thème.
      joker: { available: !finished && !!this.spareFor(game) && !!current, used: !!game.joker_used },
      rounds: rounds.map((r) => this.roundView(r, game)),
      dayScores: finished && game.mode === 'daily' ? this.dayScores(game.day) : null,
      current: current
        ? { slot: current.slot, remainingMs: game.no_timer ? null : Math.max(0, current.served_at + this.timerMs - this.now()) }
        : null,
    };
  }

  /** Duel auquel appartient la partie : numéro, mode et adversaire. */
  duelInfo(game) {
    const d = this.db.prepare('SELECT * FROM duels WHERE id = ?').get(game.duel_id);
    if (!d) return null;
    const otherId = d.challenger_id === game.user_id ? d.opponent_id : d.challenger_id;
    const other = this.db.prepare('SELECT username FROM users WHERE id = ?').get(otherId);
    return { id: d.id, mode: d.mode, opponent: other ? other.username : '?', status: d.status };
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

    if (!game.no_timer && this.now() > round.served_at + this.timerMs + TIMER_GRACE_MS) {
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

  /**
   * Réponses signalées, regroupées par thème et par saisie (les plus demandées d'abord).
   * Rien n'est jamais traité ni crédité automatiquement : le responsable décide, signalement par signalement.
   */
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
      const match = theme ? matchAnswer(theme, r.input) : null;
      const reporters = this.db
        .prepare(
          `SELECT a.rowid AS id, a.*, u.username FROM answer_reports a JOIN users u ON u.id = a.user_id
           WHERE a.theme_id = ? AND a.input_key = ? ORDER BY a.created_at`,
        )
        .all(r.theme_id, r.input_key)
        .map((p) => {
          const target = p.credit !== 'credited' ? this.creditTarget(p) : null;
          return { username: p.username, credited: p.credit === 'credited', creditableDay: target ? target.day : null, duel: !!(target && target.mode === 'duel') };
        });
      return {
        reporters,
        themeId: r.theme_id,
        themeTitle: theme ? theme.title : r.theme_id,
        inputKey: r.input_key,
        input: r.input,
        players: r.players,
        firstAt: r.first_at,
        lastAt: r.last_at,
        credited: r.credited || 0,
        // Réponse reconnue par le thème aujourd'hui (peut être ajoutée depuis, ou une approximation d'une autre réponse).
        inTheme: match ? match.answer.label : null,
        reply: (this.db.prepare('SELECT verdict, message FROM answer_reports WHERE theme_id = ? AND input_key = ? AND verdict IS NOT NULL ORDER BY updated_at DESC LIMIT 1').get(r.theme_id, r.input_key)) || null,
        status: r.pending ? 'pending' : 'handled',
      };
    });
  }

  /** Transforme une manche sans réponse valide en réponse `match` (points selon la rareté actuelle). */
  applyCredit(gameId, slot, theme, match, input) {
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
        .run(score.points, input, match.answer.key, match.answer.label, score.probability, gameId, slot);
      this.db.prepare('UPDATE games SET score = score + ? WHERE id = ?').run(score.points, gameId);
      this.db
        .prepare(
          `INSERT INTO answer_counts (theme_id, answer_key, n) VALUES (?, ?, 1)
           ON CONFLICT (theme_id, answer_key) DO UPDATE SET n = n + 1`,
        )
        .run(theme.id, match.answer.key);
    });
    this.badges.awardForGame(gameId);
    // Partie de duel : si le duel est terminé, son résultat est revu avec les nouveaux points.
    this.duels.revise(gameId);
    return score.points;
  }

  /** Manche de forage quotidien du joueur sur ce thème qui s'est close sans réponse valide (la plus récente). */
  creditableRound(userId, themeId) {
    return this.db
      .prepare(
        `SELECT g.id AS gameId, g.day, g.mode, r.slot FROM rounds r JOIN games g ON g.id = r.game_id
         WHERE g.user_id = ? AND g.mode = 'daily' AND r.theme_id = ? AND r.answered_at IS NOT NULL AND r.outcome <> 'answer'
         ORDER BY g.day DESC LIMIT 1`,
      )
      .get(userId, themeId);
  }

  /** Manche visée par un signalement : celle où il a été fait si elle est connue, sinon la dernière sans réponse valide. */
  creditTarget(report) {
    if (report.game_id != null && report.slot != null) {
      const exact = this.db
        .prepare(
          `SELECT g.id AS gameId, g.day, g.mode, r.slot FROM rounds r JOIN games g ON g.id = r.game_id
           WHERE g.id = ? AND r.slot = ? AND g.mode IN ('daily', 'duel') AND r.answered_at IS NOT NULL AND r.outcome <> 'answer'`,
        )
        .get(report.game_id, report.slot);
      if (exact) return exact;
    }
    return this.creditableRound(report.user_id, report.theme_id);
  }

  /**
   * Ajustement manuel du responsable : accorde les points d'une réponse signalée à un joueur,
   * sur sa manche sans réponse valide. La réponse doit déjà figurer dans le thème.
   */
  creditManually(themeId, inputKey, username, answerKey) {
    const report = this.db
      .prepare(
        `SELECT a.rowid AS id, a.* FROM answer_reports a JOIN users u ON u.id = a.user_id
         WHERE a.theme_id = ? AND a.input_key = ? AND u.username_key = ?`,
      )
      .get(themeId, inputKey, usernameKey(String(username)));
    if (!report) throw new HttpError(404, 'Signalement introuvable.');
    if (report.credit === 'credited') throw new HttpError(409, 'Points déjà accordés.');
    const theme = this.themes.get(themeId);
    let match = theme && matchAnswer(theme, report.input);
    if (!match && theme && typeof answerKey === 'string') {
      // Geste ponctuel : le responsable désigne la réponse visée, sans toucher au thème ni aux règles d'orthographe.
      const answer = theme.answers.find((a) => a.key === answerKey);
      if (answer) match = { answer };
    }
    if (!match) throw new HttpError(409, "Choisis la réponse visée, ou ajoute-la d'abord au thème.");
    const target = this.creditTarget(report);
    if (!target) throw new HttpError(409, 'Aucune manche sans réponse valide pour ce thème.');
    // La manche est marquée comme créditée avant l'attribution : les badges de vitesse l'ignorent.
    this.db.prepare("UPDATE answer_reports SET credit = 'credited', points = 0, game_id = ?, slot = ? WHERE rowid = ?").run(target.gameId, target.slot, report.id);
    let points;
    try {
      points = this.applyCredit(target.gameId, target.slot, theme, match, report.input);
    } catch (err) {
      this.db.prepare('UPDATE answer_reports SET credit = NULL, points = NULL WHERE rowid = ?').run(report.id);
      throw err;
    }
    this.db.prepare('UPDATE answer_reports SET points = ?, updated_at = ? WHERE rowid = ?').run(points, this.now(), report.id);
    this.badges.awardLynx(report.user_id, this.today());
    return { points, day: target.day };
  }

  /**
   * Un seul geste pour un signalement accepté : points rendus à tous les joueurs qui peuvent les recevoir
   * (forages du jour et duels, dont le résultat est alors révisé), retour « acceptée » et signalement traité.
   */
  grantReport(themeId, inputKey, answerKey, message) {
    const reports = this.db
      .prepare('SELECT a.*, u.username FROM answer_reports a JOIN users u ON u.id = a.user_id WHERE a.theme_id = ? AND a.input_key = ?')
      .all(themeId, inputKey);
    if (!reports.length) throw new HttpError(404, 'Signalement introuvable.');
    const granted = [];
    const skipped = [];
    for (const r of reports) {
      if (r.credit === 'credited') continue;
      try {
        const res = this.creditManually(themeId, inputKey, r.username, answerKey);
        granted.push({ username: r.username, points: res.points, day: res.day });
      } catch (err) {
        if (!(err instanceof HttpError) || err.status === 409 && /Choisis/.test(err.message)) throw err;
        skipped.push({ username: r.username, reason: err.message });
      }
    }
    this.replyToReport(themeId, inputKey, 'accepted', message || 'Réponse acceptée : merci pour ton signalement !');
    this.markReportHandled(themeId, inputKey);
    return { granted, skipped };
  }

  /**
   * Le responsable associe après coup une réponse du thème à la manche d'un joueur qui n'avait pas de réponse valide
   * (chrono écoulé, thème passé) ce jour-là. Les points suivent la rareté actuelle de la réponse.
   */
  assignAnswer(day, username, themeId, answerKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || day > this.today()) throw new HttpError(400, 'Jour invalide.');
    const user = this.db.prepare('SELECT id FROM users WHERE username_key = ?').get(usernameKey(String(username || '')));
    if (!user) throw new HttpError(404, 'Joueur introuvable.');
    const game = this.dailyGameFor(user.id, day);
    if (!game) throw new HttpError(404, "Ce joueur n'a pas de forage ce jour-là.");
    const round = this.db
      .prepare('SELECT * FROM rounds WHERE game_id = ? AND theme_id = ? AND answered_at IS NOT NULL')
      .get(game.id, String(themeId || ''));
    if (!round) throw new HttpError(404, 'Thème introuvable dans ce forage.');
    if (round.outcome === 'answer') throw new HttpError(409, 'Ce thème a déjà une réponse valide.');
    const theme = this.themes.get(round.theme_id);
    const answer = theme && theme.answers.find((a) => a.key === answerKey);
    if (!answer) throw new HttpError(409, 'Choisis une réponse de ce thème.');
    this.db.prepare('UPDATE rounds SET credited = 1 WHERE game_id = ? AND slot = ?').run(game.id, round.slot);
    let points;
    try {
      points = this.applyCredit(game.id, round.slot, theme, { answer }, answer.label);
    } catch (err) {
      this.db.prepare('UPDATE rounds SET credited = 0 WHERE game_id = ? AND slot = ?').run(game.id, round.slot);
      throw err;
    }
    return { points, answer: answer.label, score: this.db.prepare('SELECT score FROM games WHERE id = ?').get(game.id).score };
  }

  /** Retour du responsable aux joueurs ayant signalé cette saisie : verdict et message (modifiable). */
  replyToReport(themeId, inputKey, verdict, message) {
    if (verdict !== 'accepted' && verdict !== 'refused') throw new HttpError(400, 'Choisis « acceptée » ou « refusée ».');
    const text = String(message || '').trim().slice(0, 600);
    const res = this.db
      .prepare('UPDATE answer_reports SET verdict = ?, message = ?, updated_at = ? WHERE theme_id = ? AND input_key = ?')
      .run(verdict, text || null, this.now(), themeId, inputKey);
    if (!res.changes) throw new HttpError(404, 'Signalement introuvable.');
    return { ok: true };
  }

  /** Les signalements d'un joueur, avec le retour reçu ; `unread` compte ceux dont le retour n'a pas été vu. */
  myReports(userId) {
    const rows = this.db
      .prepare(
        `SELECT theme_id, input, created_at, handled_at, credit, points, verdict, message, updated_at, seen_at, game_id
         FROM answer_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      )
      .all(userId);
    const reports = rows.map((r) => {
      const theme = this.themes.get(r.theme_id);
      return {
        input: r.input,
        themeTitle: theme ? theme.title : r.theme_id,
        createdAt: r.created_at,
        status: r.handled_at != null || r.verdict ? 'handled' : 'pending',
        verdict: r.verdict || null,
        message: r.message || null,
        points: r.credit === 'credited' ? r.points : null,
        duel: r.credit === 'credited' ? this.duels.revisionNote(r.game_id, userId) : null,
        unread: r.updated_at != null && (r.seen_at == null || r.seen_at < r.updated_at),
      };
    });
    return { reports, unread: reports.filter((r) => r.unread).length };
  }

  markMyReportsSeen(userId) {
    this.db.prepare('UPDATE answer_reports SET seen_at = ? WHERE user_id = ? AND updated_at IS NOT NULL').run(this.now(), userId);
  }

  markReportHandled(themeId, inputKey) {
    // Réponse désormais reconnue par le thème : les joueurs qui l'avaient signalée reçoivent « Œil de lynx ».
    const theme = this.themes.get(themeId);
    const reports = this.db.prepare('SELECT user_id, input FROM answer_reports WHERE theme_id = ? AND input_key = ? AND handled_at IS NULL').all(themeId, inputKey);
    if (theme && reports.length && matchAnswer(theme, reports[0].input)) reports.forEach((r) => this.badges.awardLynx(r.user_id, this.today()));
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
    if (this.duelHidden(game)) throw new HttpError(403, 'Les réponses seront visibles quand le duel sera terminé.');
    if (game.mode !== 'daily') {
      // Un thème d'entraînement ou de duel qui est aussi un thème du jour : réponses cachées tant que le forage du jour n'est pas fini.
      const round = this.db.prepare('SELECT theme_id FROM rounds WHERE game_id = ? AND slot = ?').get(game.id, slot);
      const today = this.dailyGameFor(userId, this.today());
      if (round && (!today || today.finished_at == null) && this.dailyThemes(this.today()).includes(round.theme_id)) {
        throw new HttpError(403, 'Termine ton forage du jour pour voir les réponses de ce thème.');
      }
    }
    const round = rounds.find((r) => r.slot === slot);
    if (!round) throw new HttpError(404, 'Thème introuvable.');
    const theme = this.themes.get(round.theme_id);
    if (!theme) throw new HttpError(404, 'Ce thème n\'existe plus.');
    const counts = new Map(
      this.db.prepare('SELECT answer_key, n FROM answer_counts WHERE theme_id = ?').all(theme.id).map((r) => [r.answer_key, r.n]),
    );
    const training = new Map(
      this.db.prepare('SELECT answer_key, n FROM training_answer_counts WHERE theme_id = ?').all(theme.id).map((r) => [r.answer_key, r.n]),
    );
    const { probs, pMax } = probabilities(theme, counts);
    const answers = theme.answers
      .map((a) => {
        const count = counts.get(a.key) || 0;
        const points = pointsFor(probs.get(a.key), pMax, count > 0);
        return { label: a.label, aliases: (a.names || []).slice(1), points, tier: tierFor(points, 'answer').id, count, trainingCount: training.get(a.key) || 0, mine: a.key === round.answer_key };
      })
      .sort((a, b) => a.points - b.points || b.count - a.count || a.label.localeCompare(b.label, 'fr'));
    return { slot, title: theme.title, answers };
  }

  skip(gameId, userId) {
    const { game, round } = this.activeRound(gameId, userId);
    const expired = !game.no_timer && this.now() >= round.served_at + this.timerMs;
    const spare = expired ? null : this.spareFor(game);
    if (spare && this.themes.get(spare)) {
      // Joker : le thème est remplacé (le même thème de remplacement pour tout le monde) et son chrono repart.
      transaction(this.db, () => {
        this.db
          .prepare('UPDATE rounds SET swapped_from = theme_id, theme_id = ?, served_at = ? WHERE game_id = ? AND slot = ? AND answered_at IS NULL')
          .run(spare, this.now(), game.id, round.slot);
        this.db.prepare('UPDATE games SET joker_used = 1 WHERE id = ?').run(game.id);
      });
      return {
        result: 'joker',
        round: this.roundView(this.db.prepare('SELECT * FROM rounds WHERE game_id = ? AND slot = ?').get(game.id, round.slot), this.loadGame(gameId, userId).game),
        state: this.state(gameId, userId),
      };
    }
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
        `SELECT u.id AS userId, u.username, u.avatar, SUM(g.score) AS score, COUNT(*) AS days
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
      return { rank, username: r.username, avatar: Avatar.normalize(r.avatar, r.userId), score: r.score, days: r.days, me: r.userId === userId };
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

module.exports = { GameService, HttpError, REACTIONS };
