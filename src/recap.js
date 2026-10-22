'use strict';

const { addDays, weekStart } = require('./dates');
const { tierFor } = require('./scoring');

/*
 * Récap du lundi : « La Gazette de la mine ». Le premier jour de la nouvelle semaine, chaque joueur voit le bilan
 * de la semaine écoulée (lundi → dimanche) : podium, records, moments forts. Rien n'est stocké sauf la dernière semaine vue.
 */
const FIRST_RECAP_WEEK = '2026-10-19';

/** Semaine (lundi) dont le récap attend ce joueur, ou null. */
function pendingRecap(db, userId, today) {
  const week = addDays(weekStart(today), -7);
  if (week < FIRST_RECAP_WEEK) return null;
  const user = db.prepare('SELECT created_at, recap_seen FROM users WHERE id = ?').get(userId);
  if (!user || (user.recap_seen && user.recap_seen >= week)) return null;
  const end = addDays(week, 6);
  // Les inscrits de la semaine en cours n'ont pas de semaine écoulée à découvrir.
  if (user.created_at >= Date.parse(`${addDays(end, 1)}T00:00:00Z`)) return null;
  const any = db.prepare("SELECT 1 AS x FROM games WHERE mode = 'daily' AND finished_at IS NOT NULL AND day BETWEEN ? AND ? LIMIT 1").get(week, end);
  return any ? week : null;
}

function markRecapSeen(db, userId, week) {
  db.prepare('UPDATE users SET recap_seen = ? WHERE id = ? AND (recap_seen IS NULL OR recap_seen < ?)').run(week, userId, week);
}

function weeklyRecap(game, week, userId) {
  const db = game.db;
  const start = weekStart(week);
  const end = addDays(start, 6);
  const board = game.leaderboard(start, userId, 'week');
  const games = db
    .prepare(
      `SELECT g.id, g.day, g.score, g.user_id AS userId, u.username FROM games g JOIN users u ON u.id = g.user_id
       WHERE g.mode = 'daily' AND g.finished_at IS NOT NULL AND g.day BETWEEN ? AND ?`,
    )
    .all(start, end);
  const best = games.slice().sort((a, b) => b.score - a.score || a.day.localeCompare(b.day))[0] || null;
  const rounds = games.length
    ? db
        .prepare(
          `SELECT r.points, r.theme_id, r.answer_label, g.user_id AS userId, u.username, g.day, g.id AS gameId, r.slot
           FROM rounds r JOIN games g ON g.id = r.game_id JOIN users u ON u.id = g.user_id
           WHERE g.mode = 'daily' AND g.finished_at IS NOT NULL AND g.day BETWEEN ? AND ? AND r.outcome = 'answer'`,
        )
        .all(start, end)
    : [];
  const rarest = rounds.slice().sort((a, b) => b.points - a.points || a.day.localeCompare(b.day))[0] || null;
  const themeTitle = (id) => (game.themes.get(id) ? game.themes.get(id).title : id);
  // Réponse la plus applaudie (réactions reçues).
  const applause = games.length
    ? db
        .prepare(
          `SELECT rx.game_id AS gameId, rx.slot, COUNT(*) AS n FROM reactions rx
           WHERE rx.game_id IN (${games.map(() => '?').join(',')}) GROUP BY rx.game_id, rx.slot ORDER BY n DESC, rx.game_id LIMIT 1`,
        )
        .get(...games.map((g) => g.id))
    : null;
  const applauded = applause && rounds.find((r) => r.gameId === applause.gameId && r.slot === applause.slot);
  const mineRounds = rounds.filter((r) => r.userId === userId);
  const mine = board.me;
  return {
    start,
    end,
    entries: board.entries.slice(0, 10),
    champion: board.entries[0] || null,
    players: board.entries.length,
    games: games.length,
    totalPoints: games.reduce((n, g) => n + g.score, 0),
    pepites: rounds.filter((r) => r.points >= 100).length,
    best: best && { username: best.username, score: best.score, day: best.day },
    rarest: rarest && { username: rarest.username, answer: rarest.answer_label, theme: themeTitle(rarest.theme_id), points: rarest.points, tier: tierFor(rarest.points, 'answer').id },
    applauded: applauded && { username: applauded.username, answer: applauded.answer_label, theme: themeTitle(applauded.theme_id), reactions: applause.n },
    me: mine && {
      rank: mine.rank,
      score: mine.score,
      days: mine.days,
      best: Math.max(0, ...games.filter((g) => g.userId === userId).map((g) => g.score)),
      pepites: mineRounds.filter((r) => r.points >= 100).length,
      rares: mineRounds.filter((r) => r.points >= 60).length,
    },
  };
}

module.exports = { pendingRecap, markRecapSeen, weeklyRecap, FIRST_RECAP_WEEK };
