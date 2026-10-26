'use strict';

const Avatar = require('./avatar');
const { CATALOG } = require('./badges');
const { collectiveStatus } = require('./collective');
const { addDays } = require('./dates');

/*
 * « Le Petit Mineur » : les dernières nouvelles de la mine (duels terminés, pépites, badges, défi collectif).
 * Calculé à la lecture à partir de ce qui existe déjà ; les pépites sont annoncées sans dire laquelle, pour ne rien dévoiler.
 */
const SKIPPED_BADGES = new Set(['premier-forage', 'pensees-jumelles']);
const SKIPPED_CATEGORIES = new Set(['themes', 'entrainement']);

function feed(game, userId, limit = 3) {
  const db = game.db;
  const now = game.now();
  const who = (id) => {
    const u = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(id);
    return u ? { username: u.username, avatar: Avatar.normalize(u.avatar, id) } : null;
  };
  const events = [];

  // Duels terminés.
  for (const d of db.prepare("SELECT * FROM duels WHERE status = 'done' AND validated_at IS NOT NULL ORDER BY finished_at DESC LIMIT 15").all()) {
    const a = who(d.challenger_id);
    const b = who(d.opponent_id);
    if (!a || !b) continue;
    if (d.winner_id == null) {
      events.push({ type: 'duel', ts: d.finished_at, icon: 'sabre', user: a, text: `${a.username} et ${b.username} font match nul en duel (${d.challenger_score} partout).` });
    } else {
      const winnerIsA = d.winner_id === d.challenger_id;
      const [w, l] = winnerIsA ? [a, b] : [b, a];
      const [ws, ls] = winnerIsA ? [d.challenger_score, d.opponent_score] : [d.opponent_score, d.challenger_score];
      events.push({ type: 'duel', ts: d.finished_at, icon: 'sabre', user: w, text: `${w.username} bat ${l.username} en duel : ${ws} à ${ls}.` });
    }
  }

  // Pépites : une annonce par forage, sans dire laquelle.
  for (const r of db
    .prepare(
      `SELECT g.user_id AS userId, g.day, COUNT(*) AS n, MAX(r.answered_at) AS ts FROM rounds r JOIN games g ON g.id = r.game_id
       WHERE g.mode = 'daily' AND r.outcome = 'answer' AND r.points >= 100 GROUP BY g.id ORDER BY ts DESC LIMIT 15`,
    )
    .all()) {
    const u = who(r.userId);
    if (u) events.push({ type: 'pepite', ts: r.ts, icon: 'pepite', user: u, text: `${u.username} a trouvé ${r.n > 1 ? `${r.n} pépites` : 'une pépite'} dans son forage du ${r.day.slice(8)}/${r.day.slice(5, 7)}.` });
  }

  // Badges : regroupés par joueur et par jour.
  const byUserDay = new Map();
  for (const b of db.prepare('SELECT user_id, kind, instance, earned_on, created_at FROM badges ORDER BY created_at DESC LIMIT 80').all()) {
    const def = CATALOG.get(b.kind);
    if (!def || SKIPPED_BADGES.has(b.kind) || SKIPPED_CATEGORIES.has(def.category)) continue;
    const key = `${b.user_id}|${b.earned_on}`;
    if (!byUserDay.has(key)) byUserDay.set(key, { userId: b.user_id, ts: b.created_at, badges: [] });
    byUserDay.get(key).badges.push(def.name(b.instance));
  }
  for (const g of byUserDay.values()) {
    const u = who(g.userId);
    if (!u) continue;
    const text = g.badges.length === 1 ? `${u.username} gagne le badge « ${g.badges[0]} ».` : `${u.username} gagne ${g.badges.length} badges, dont « ${g.badges[0]} ».`;
    events.push({ type: 'badge', ts: g.ts, icon: 'medaille', user: u, text });
  }

  // Défi collectif atteint récemment.
  const collective = collectiveStatus(db, game.today(), userId);
  if (collective && collective.reached && collective.reachedOn >= addDays(game.today(), -14)) {
    events.push({ type: 'collective', ts: Date.parse(`${collective.reachedOn}T23:00:00Z`), icon: 'diamant', user: null, text: 'Le diamant du mois est atteint : bravo à tous les mineurs !' });
  }

  events.sort((a, b) => b.ts - a.ts);
  return { now, events: events.slice(0, Math.max(1, Math.min(20, limit))) };
}

module.exports = { feed };
