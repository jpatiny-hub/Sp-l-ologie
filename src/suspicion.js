'use strict';

const { dayKey } = require('./dates');
const { tierFor } = require('./scoring');

/*
 * Signaux discrets sur la façon dont les réponses sont données, pour le responsable du jeu.
 * Le navigateur du joueur indique : texte collé, temps passé hors de la page, tentatives de copie de l'intitulé, nombre de frappes.
 * Le serveur y ajoute la rapidité de la première réponse. Ce sont des indices (un appel, une notification ou un bon
 * dactylographe suffisent à en déclencher), jamais des preuves : rien n'est bloqué ni sanctionné automatiquement.
 */
const KEEP_MS = 90 * 24 * 3600 * 1000;
const AWAY_MIN_MS = 3000; // moins que ça : un simple coup d'œil à une notification
const FAST_RARE_MS = 5000; // une réponse rare ou pépite en moins de 5 s
const num = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

class PlaySignals {
  constructor(db, now, themes) {
    this.db = db;
    this.now = now;
    this.themes = themes;
    this.lastPurge = 0;
  }

  /** Enregistre (ou complète) les signaux d'une manche : les compteurs ne font que monter pendant la manche. */
  record(game, round, input, sig) {
    const s = sig && typeof sig === 'object' ? sig : {};
    const now = this.now();
    const elapsed = round.served_at != null ? Math.max(0, now - round.served_at) : null;
    this.db
      .prepare(
        `INSERT INTO play_signals (game_id, slot, user_id, created_at, first_ms, last_ms, paste_n, away_ms, away_n, copy_n, edits_n, len)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, slot) DO UPDATE SET last_ms = excluded.last_ms, len = excluded.len,
           paste_n = MAX(paste_n, excluded.paste_n), away_ms = MAX(away_ms, excluded.away_ms), away_n = MAX(away_n, excluded.away_n),
           copy_n = MAX(copy_n, excluded.copy_n), edits_n = MAX(edits_n, excluded.edits_n)`,
      )
      .run(game.id, round.slot, game.user_id, now, elapsed, elapsed, num(s.p, 99), num(s.a, 3600000), num(s.n, 99), num(s.c, 99), num(s.e, 999), String(input || '').length);
    if (now - this.lastPurge > 3600 * 1000) {
      this.lastPurge = now;
      this.db.prepare('DELETE FROM play_signals WHERE created_at < ?').run(now - KEEP_MS);
    }
  }

  /** Bilan par joueur sur les `days` derniers jours, du plus marqué au moins marqué. */
  report(days = 14) {
    const since = this.now() - Math.max(1, Math.min(90, days)) * 24 * 3600 * 1000;
    const rows = this.db
      .prepare(
        `SELECT s.*, u.username, g.mode, g.day, r.theme_id, r.input, r.answer_label, r.points, r.outcome
         FROM play_signals s
         JOIN users u ON u.id = s.user_id
         JOIN games g ON g.id = s.game_id
         JOIN rounds r ON r.game_id = s.game_id AND r.slot = s.slot
         WHERE s.created_at >= ? AND u.is_system = 0
         ORDER BY s.created_at DESC`,
      )
      .all(since);
    const players = new Map();
    for (const r of rows) {
      let p = players.get(r.user_id);
      if (!p) players.set(r.user_id, (p = { username: r.username, rounds: 0, pastes: 0, copies: 0, fastRare: 0, away: 0, flagged: [] }));
      p.rounds += 1;
      const tier = r.outcome === 'answer' ? tierFor(r.points, 'answer').id : null;
      const why = [];
      if (r.paste_n > 0) {
        p.pastes += 1;
        why.push('texte collé');
      }
      if (r.copy_n > 0) {
        p.copies += 1;
        why.push('copie de l\'intitulé tentée');
      }
      if ((tier === 'rare' || tier === 'pepite') && r.first_ms != null && r.first_ms < FAST_RARE_MS && r.outcome === 'answer') {
        p.fastRare += 1;
        why.push(`réponse ${tier === 'pepite' ? 'pépite' : 'rare'} en ${(r.first_ms / 1000).toFixed(1)} s`);
      }
      if (r.away_ms >= AWAY_MIN_MS) {
        p.away += 1;
        why.push(`page quittée ${Math.round(r.away_ms / 1000)} s`);
      }
      if (why.length && p.flagged.length < 12) {
        const theme = this.themes.get(r.theme_id);
        p.flagged.push({ day: r.day, mode: r.mode, theme: theme ? theme.title : r.theme_id, answer: r.answer_label || r.input || null, why });
      }
    }
    const list = [...players.values()].map((p) => {
      const strong = p.pastes + p.copies + p.fastRare;
      const level = strong >= 3 || (strong >= 1 && p.away >= 4) ? 'forte' : strong >= 1 || p.away >= 4 ? 'a-observer' : 'rien';
      return { ...p, strong, level };
    });
    const rank = { forte: 0, 'a-observer': 1, rien: 2 };
    list.sort((a, b) => rank[a.level] - rank[b.level] || b.strong - a.strong || b.away - a.away || a.username.localeCompare(b.username, 'fr'));
    return { days, since: dayKey(since), players: list };
  }
}

module.exports = { PlaySignals, AWAY_MIN_MS, FAST_RARE_MS };
