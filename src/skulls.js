'use strict';

const config = require('./config');
const { tierFor } = require('./scoring');

/*
 * Jours de collection (config.SKULL_DAYS, ex. Halloween) : les cinq raretés deviennent cinq qualités de crâne
 * (mêmes points) et chaque réponse valide, dans tous les modes, ajoute un crâne à la collection du joueur.
 * Les crânes d'un duel ne comptent pour le joueur qu'une fois le duel terminé (la rareté reste secrète jusque-là).
 */
const QUALITIES = ['evident', 'courant', 'original', 'rare', 'pepite'];
const LABELS = {
  evident: "Crâne d'os",
  courant: 'Crâne jauni',
  original: 'Crâne de bronze',
  rare: 'Crâne aux yeux rubis',
  pepite: "Crâne d'or !",
};
const COLLECTOR_TARGET = 25;

class SkullService {
  constructor(db, game) {
    this.db = db;
    this.game = game;
  }

  isSkullDay(day) {
    return config.SKULL_DAYS.includes(day);
  }

  /** Remplace le nom de rareté par celui du crâne les jours de collection. */
  relabel(tier, day) {
    if (!tier || !this.isSkullDay(day) || !LABELS[tier.id]) return tier;
    return { ...tier, label: LABELS[tier.id], emoji: '💀' };
  }

  /** Un crâne pour cette manche (ou sa nouvelle qualité si des points ont été accordés après coup). */
  record(game, slot, points) {
    if (!game || !this.isSkullDay(game.day) || !points) return;
    const tier = tierFor(points, 'answer').id;
    this.db
      .prepare('INSERT OR REPLACE INTO skulls (game_id, slot, user_id, day, tier, mode, duel_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(game.id, slot, game.user_id, game.day, tier, game.mode, game.duel_id == null ? null : game.duel_id);
  }

  /** Collection visible du joueur : crânes par qualité (les duels non terminés sont exclus). */
  collection(userId) {
    const rows = this.db
      .prepare(
        `SELECT s.tier, COUNT(*) AS n FROM skulls s LEFT JOIN duels d ON d.id = s.duel_id
         WHERE s.user_id = ? AND (s.duel_id IS NULL OR d.status = 'done') GROUP BY s.tier`,
      )
      .all(userId);
    const counts = Object.fromEntries(QUALITIES.map((q) => [q, 0]));
    rows.forEach((r) => {
      if (r.tier in counts) counts[r.tier] = r.n;
    });
    const total = QUALITIES.reduce((sum, q) => sum + counts[q], 0);
    return {
      counts,
      total,
      complete: QUALITIES.every((q) => counts[q] > 0),
      target: COLLECTOR_TARGET,
      labels: LABELS,
    };
  }

  /** Badges de la collection : 25 crânes, puis les cinq qualités réunies (apparence « Jack-o'-lantern »). */
  award(userId, day) {
    const c = this.collection(userId);
    if (c.total >= COLLECTOR_TARGET) this.game.badges.give(userId, 'cranes-25', '1', day);
    if (c.complete) this.game.badges.give(userId, 'cranes-complet', '1', day);
  }
}

module.exports = { SkullService, QUALITIES, LABELS };
