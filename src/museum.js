'use strict';

const Avatar = require('./avatar');

/*
 * Musée des pépites : toutes les réponses que personne n'avait trouvées avant (100 points et plus), par le groupe,
 * en forage du jour comme en duel (décomptes séparés).
 * Les pépites du jour en cours ne sont pas montrées (ce serait donner des réponses) : elles entrent au musée le lendemain.
 */
// Forages du jour, et duels terminés (les pépites d'un duel entrent au musée une fois le duel fini et le jour passé).
const DONE = `(g.mode = 'daily' OR (g.mode = 'duel' AND EXISTS (
  SELECT 1 FROM duels d WHERE d.status = 'done' AND (d.challenger_game_id = g.id OR d.opponent_game_id = g.id))))`;

function museum(game, userId) {
  const today = game.today();
  const rows = game.db
    .prepare(
      `SELECT r.answer_label AS answer, r.theme_id AS themeId, g.day, g.mode, u.id AS userId, u.username, u.avatar
       FROM rounds r JOIN games g ON g.id = r.game_id JOIN users u ON u.id = g.user_id
       WHERE ${DONE} AND r.outcome = 'answer' AND r.points >= 100 AND g.day < ?
       ORDER BY g.day DESC, r.answered_at DESC, r.slot DESC`,
    )
    .all(today);
  const todayCount = game.db
    .prepare(`SELECT COUNT(*) AS n FROM rounds r JOIN games g ON g.id = r.game_id WHERE ${DONE} AND r.outcome = 'answer' AND r.points >= 100 AND g.day = ?`)
    .get(today).n;
  const perPlayer = new Map();
  for (const r of rows) {
    if (!perPlayer.has(r.userId)) perPlayer.set(r.userId, { username: r.username, avatar: Avatar.normalize(r.avatar, r.userId), count: 0, me: r.userId === userId });
    perPlayer.get(r.userId).count++;
  }
  const entries = rows.slice(0, 300).map((r) => {
    const theme = game.themes.get(r.themeId);
    return { day: r.day, answer: r.answer, theme: theme ? theme.title : 'Thème indisponible', username: r.username, avatar: Avatar.normalize(r.avatar, r.userId), me: r.userId === userId, duel: r.mode === 'duel' };
  });
  return {
    total: rows.length,
    todayCount,
    players: [...perPlayer.values()].sort((a, b) => b.count - a.count || a.username.localeCompare(b.username)),
    entries,
  };
}

module.exports = { museum };
