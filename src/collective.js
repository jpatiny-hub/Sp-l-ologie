'use strict';

const { addDays, monthStart, monthEnd } = require('./dates');
const Avatar = require('./avatar');

/*
 * Défi collectif du mois : tous les joueurs creusent ensemble un tunnel jusqu'au diamant.
 * Chaque point marqué en forage du jour fait avancer la foreuse ; rien n'est stocké, tout se calcule
 * à partir des forages du mois. La première édition commence le jour de sa mise en ligne, et couvre le reste d'octobre.
 */
const GOAL = 10000;
const FIRST_START = '2026-10-23';

function collectiveStatus(db, today, userId) {
  const month = monthStart(today);
  const start = month < FIRST_START ? FIRST_START : month;
  const end = monthEnd(today);
  if (today < start) return null;
  const rows = db
    .prepare(
      `SELECT u.id AS userId, u.username, u.avatar, SUM(g.score) AS points
       FROM games g JOIN users u ON u.id = g.user_id
       WHERE g.mode = 'daily' AND g.day BETWEEN ? AND ?
       GROUP BY u.id HAVING points > 0
       ORDER BY points DESC, u.username_key ASC`,
    )
    .all(start, end);
  const total = rows.reduce((n, r) => n + r.points, 0);
  let reachedOn = null;
  if (total >= GOAL) {
    let sum = 0;
    const perDay = db
      .prepare("SELECT day, SUM(score) AS points FROM games WHERE mode = 'daily' AND day BETWEEN ? AND ? GROUP BY day ORDER BY day")
      .all(start, end);
    for (const d of perDay) {
      sum += d.points;
      if (sum >= GOAL) {
        reachedOn = d.day;
        break;
      }
    }
  }
  const daysLeft = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) + 1;
  return {
    month: month.slice(0, 7),
    start,
    end,
    goal: GOAL,
    total,
    reached: total >= GOAL,
    reachedOn,
    daysLeft,
    players: rows.map((r) => ({ username: r.username, avatar: Avatar.normalize(r.avatar, r.userId), points: r.points, me: r.userId === userId })),
  };
}

module.exports = { collectiveStatus, GOAL, FIRST_START };
