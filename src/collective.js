'use strict';

const { addDays, monthStart, monthEnd, dayKey } = require('./dates');
const Avatar = require('./avatar');

/*
 * Défi collectif du mois : tous les joueurs creusent ensemble un tunnel jusqu'au diamant.
 * Chaque point marqué en forage du jour fait avancer la foreuse ; rien n'est stocké, tout se calcule
 * à partir des forages du mois, y compris ceux joués avant la mise en place du défi.
 */
const GOAL = 10000;
// Défi duel du mois : le groupe termine ensemble ce nombre de duels avant la fin du mois.
const DUEL_GOAL = 50;

function collectiveStatus(db, today, userId) {
  const month = monthStart(today);
  const start = month;
  const end = monthEnd(today);
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
  const duels = db
    .prepare("SELECT challenger_id, opponent_id, finished_at FROM duels WHERE status = 'done' AND validated_at IS NOT NULL AND finished_at IS NOT NULL")
    .all()
    .filter((d) => dayKey(d.finished_at) >= start && dayKey(d.finished_at) <= end);
  const duel = { goal: DUEL_GOAL, total: duels.length, mine: duels.filter((d) => d.challenger_id === userId || d.opponent_id === userId).length, reached: duels.length >= DUEL_GOAL };
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
    duel,
    players: rows.map((r) => ({ username: r.username, avatar: Avatar.normalize(r.avatar, r.userId), points: r.points, me: r.userId === userId })),
  };
}

module.exports = { collectiveStatus, GOAL };
