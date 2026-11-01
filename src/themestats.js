'use strict';

const { toKey } = require('./matching');
const { addDays, dayKey } = require('./dates');

/*
 * Suivi des thèmes pour le responsable du jeu (onglet « Thèmes » du Contre maître) : pour chaque thème joué, qui l'a trouvé,
 * passé, laissé filer ou remplacé par le joker, et les saisies refusées tapées avant. Réservé au responsable, jamais montré aux joueurs.
 *
 * Le journal `theme_plays` (une ligne par manche et par thème, tous modes) garde aussi le mode illimité, dont les parties sont
 * effacées à la suivante. Les manches plus anciennes du forage et des duels viennent de la table `rounds` (sans les refus).
 * Les duels ne comptent qu'une fois validés (résultats cachés jusque-là).
 */

const MODES = ['daily', 'duel', 'training'];
const MAX_TRIES = 12;

class ThemeStats {
  constructor(db, themes, now = Date.now) {
    this.db = db;
    this.themes = themes;
    this.now = now;
  }

  /** Crée la ligne du journal si elle n'existe pas encore. */
  ensure(game, round, themeId = round.theme_id) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO theme_plays (game_id, slot, theme_id, user_id, mode, day, duel_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(game.id, round.slot, themeId, game.user_id, game.mode, game.day, game.duel_id || null, this.now());
  }

  /** Une saisie refusée (ou une proposition approchée que le joueur a refusée). */
  tried(game, round, input) {
    if (!toKey(input)) return;
    this.ensure(game, round);
    const row = this.db.prepare('SELECT tries FROM theme_plays WHERE game_id = ? AND slot = ? AND theme_id = ?').get(game.id, round.slot, round.theme_id);
    const tries = parse(row && row.tries);
    if (tries.length >= MAX_TRIES) return;
    tries.push(String(input).slice(0, 80));
    this.db.prepare('UPDATE theme_plays SET tries = ? WHERE game_id = ? AND slot = ? AND theme_id = ?').run(JSON.stringify(tries), game.id, round.slot, round.theme_id);
  }

  /** Fin de la manche : trouvé, passé ou temps écoulé. */
  finished(game, round, { outcome, points, answer }) {
    this.ensure(game, round);
    const ms = round.served_at != null ? Math.max(0, this.now() - round.served_at) : null;
    this.db
      .prepare('UPDATE theme_plays SET outcome = ?, points = ?, answer_label = ?, ms = ? WHERE game_id = ? AND slot = ? AND theme_id = ?')
      .run(outcome, points || 0, answer ? answer.label : null, ms, game.id, round.slot, round.theme_id);
  }

  /** Le joueur a remplacé ce thème par le joker. */
  joker(game, round) {
    this.ensure(game, round);
    const ms = round.served_at != null ? Math.max(0, this.now() - round.served_at) : null;
    this.db.prepare("UPDATE theme_plays SET outcome = 'joker', points = 0, ms = ? WHERE game_id = ? AND slot = ? AND theme_id = ?").run(ms, game.id, round.slot, round.theme_id);
  }

  /** Toutes les manches terminées de la période (journal + anciennes manches du forage et des duels). */
  rows({ days = 30, mode = null, themeId = null, day = null } = {}) {
    const today = this.today();
    const from = day || (days ? addDays(today, -(days - 1)) : '0000-00-00');
    const to = day || '9999-99-99';
    const modes = mode && MODES.includes(mode) ? [mode] : MODES;
    const marks = modes.map(() => '?').join(',');
    const themeCond = themeId ? 'AND p.theme_id = ?' : '';
    const logged = this.db
      .prepare(
        `SELECT p.game_id, p.slot, p.theme_id, p.user_id, p.mode, p.day, p.outcome, p.points, p.answer_label, p.ms, p.tries, u.username
         FROM theme_plays p JOIN users u ON u.id = p.user_id
         LEFT JOIN duels d ON d.id = p.duel_id
         WHERE p.outcome IS NOT NULL AND p.day BETWEEN ? AND ? AND p.mode IN (${marks}) ${themeCond}
           AND (p.mode <> 'duel' OR d.validated_at IS NOT NULL)`,
      )
      .all(from, to, ...modes, ...(themeId ? [themeId] : []))
      .map((r) => ({ ...r, tries: parse(r.tries), tracked: true }));
    const seen = new Set(logged.map((r) => `${r.game_id}:${r.slot}:${r.theme_id}`));
    const oldModes = modes.filter((m) => m !== 'training');
    let old = [];
    if (oldModes.length) {
      const oldMarks = oldModes.map(() => '?').join(',');
      const themeOld = themeId ? 'AND (r.theme_id = ? OR r.swapped_from = ?)' : '';
      old = this.db
        .prepare(
          `SELECT r.game_id, r.slot, r.theme_id, r.swapped_from, g.user_id, g.mode, g.day, r.outcome, r.points, r.answer_label,
                  r.served_at, r.answered_at, u.username
           FROM rounds r JOIN games g ON g.id = r.game_id JOIN users u ON u.id = g.user_id
           LEFT JOIN duels d ON d.id = g.duel_id
           WHERE r.answered_at IS NOT NULL AND g.day BETWEEN ? AND ? AND g.mode IN (${oldMarks}) ${themeOld}
             AND (g.mode <> 'duel' OR d.validated_at IS NOT NULL)`,
        )
        .all(from, to, ...oldModes, ...(themeId ? [themeId, themeId] : []));
    }
    const out = logged;
    for (const r of old) {
      const base = { game_id: r.game_id, slot: r.slot, user_id: r.user_id, mode: r.mode, day: r.day, username: r.username, tries: [], tracked: false };
      if (r.swapped_from && (!themeId || r.swapped_from === themeId) && !seen.has(`${r.game_id}:${r.slot}:${r.swapped_from}`)) {
        out.push({ ...base, theme_id: r.swapped_from, outcome: 'joker', points: 0, answer_label: null, ms: null });
      }
      if ((!themeId || r.theme_id === themeId) && !seen.has(`${r.game_id}:${r.slot}:${r.theme_id}`)) {
        const ms = r.outcome === 'answer' && r.served_at != null ? Math.max(0, r.answered_at - r.served_at) : null;
        out.push({ ...base, theme_id: r.theme_id, outcome: r.outcome, points: r.points, answer_label: r.answer_label, ms });
      }
    }
    return out;
  }

  today() {
    return dayKey(this.now());
  }

  /** Classement des thèmes joués sur la période, les plus difficiles en tête. */
  overview({ days = 30, mode = null } = {}) {
    const byTheme = new Map();
    for (const r of this.rows({ days, mode })) {
      if (!byTheme.has(r.theme_id)) byTheme.set(r.theme_id, []);
      byTheme.get(r.theme_id).push(r);
    }
    const pending = new Map(
      this.db.prepare('SELECT theme_id, COUNT(*) AS n FROM answer_reports WHERE handled_at IS NULL GROUP BY theme_id').all().map((r) => [r.theme_id, r.n]),
    );
    const themes = [...byTheme.entries()].map(([themeId, rows]) => ({ ...this.summarize(themeId, rows), pendingReports: pending.get(themeId) || 0 }));
    themes.sort((a, b) => a.foundRate - b.foundRate || b.plays - a.plays || a.title.localeCompare(b.title, 'fr'));
    return { days, mode: mode || null, themes };
  }

  summarize(themeId, rows) {
    const theme = this.themes.get(themeId);
    const count = (o) => rows.filter((r) => r.outcome === o).length;
    const found = count('answer');
    const plays = rows.length;
    const tracked = rows.filter((r) => r.tracked);
    const tries = tracked.reduce((s, r) => s + r.tries.length, 0);
    const refusedKeys = new Set(tracked.flatMap((r) => r.tries.map(toKey)));
    const times = rows.filter((r) => r.outcome === 'answer' && r.ms != null).map((r) => r.ms).sort((a, b) => a - b);
    const modes = {};
    for (const r of rows) modes[r.mode] = (modes[r.mode] || 0) + 1;
    const foundRate = plays ? found / plays : 0;
    const triesPerPlay = tracked.length ? tries / tracked.length : null;
    let flag = null;
    if (plays >= 3 && foundRate < 0.6 && (triesPerPlay == null || triesPerPlay >= 1 || refusedKeys.size >= 3)) flag = 'flou';
    else if (plays >= 3 && foundRate < 0.75) flag = 'dur';
    return {
      themeId,
      title: theme ? theme.title : themeId,
      active: Boolean(theme && theme.active),
      plays,
      players: new Set(rows.map((r) => r.user_id)).size,
      found,
      skipped: count('skip'),
      timeout: count('timeout'),
      joker: count('joker'),
      foundRate,
      triesPerPlay,
      distinctRefused: refusedKeys.size,
      medianMs: times.length ? times[Math.floor(times.length / 2)] : null,
      modes,
      lastDay: rows.reduce((m, r) => (r.day > m ? r.day : m), ''),
      flag,
    };
  }

  /** Détail d'un thème : réponses refusées et acceptées, et ce que chaque joueur a tenté. */
  detail(themeId, { days = 30, mode = null } = {}) {
    const rows = this.rows({ days, mode, themeId });
    const refused = new Map();
    for (const r of rows) {
      for (const t of r.tries) {
        const key = toKey(t);
        const cur = refused.get(key) || { input: t, count: 0, players: new Set() };
        cur.count += 1;
        cur.players.add(r.user_id);
        refused.set(key, cur);
      }
    }
    const accepted = new Map();
    for (const r of rows) if (r.outcome === 'answer' && r.answer_label) accepted.set(r.answer_label, (accepted.get(r.answer_label) || 0) + 1);
    // Refus du forage du jour enregistrés avant ce suivi (cumul, sans date) : utile tant que le journal est jeune.
    const older = this.db.prepare('SELECT input_key, example, n FROM unknown_answers WHERE theme_id = ? ORDER BY n DESC LIMIT 15').all(themeId);
    const reports = this.db
      .prepare('SELECT input, COUNT(*) AS n FROM answer_reports WHERE theme_id = ? AND handled_at IS NULL GROUP BY input_key ORDER BY n DESC')
      .all(themeId);
    return {
      ...this.summarize(themeId, rows),
      refused: [...refused.entries()]
        .map(([key, v]) => ({ inputKey: key, input: v.input, count: v.count, players: v.players.size }))
        .sort((a, b) => b.count - a.count || a.input.localeCompare(b.input, 'fr'))
        .slice(0, 30),
      olderRefused: older.map((r) => ({ inputKey: r.input_key, input: r.example, count: r.n })),
      accepted: [...accepted.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr')).slice(0, 30),
      reports: reports.map((r) => ({ input: r.input, count: r.n })),
      history: rows
        .sort((a, b) => (b.day > a.day ? 1 : b.day < a.day ? -1 : a.username.localeCompare(b.username, 'fr')))
        .slice(0, 60)
        .map((r) => ({ day: r.day, mode: r.mode, username: r.username, outcome: r.outcome, answer: r.answer_label, points: r.points, ms: r.ms, tries: r.tries, tracked: r.tracked })),
    };
  }
}

function parse(json) {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

module.exports = { ThemeStats };
