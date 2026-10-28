'use strict';

const { ROUNDS_PER_GAME } = require('./config');
const { transaction } = require('./db');
const { HttpError } = require('./errors');
const { tierFor } = require('./scoring');
const { dayKey } = require('./dates');
const { usernameKey } = require('./auth');
const Avatar = require('./avatar');

/*
 * Duels
 * -----
 * Un joueur en défie un autre sur 7 thèmes tirés au sort, les mêmes pour les deux. Chacun joue sa partie (mode « duel »)
 * quand il veut, sans connaître la rareté de ses réponses : le résultat se révèle quand les deux ont fini.
 * Deux modes : « standard » (30 secondes par thème) et « à l'aise » (sans chrono).
 */
const DUEL_TTL_MS = 3 * 24 * 3600 * 1000;
const MAX_OPEN = 5;
// « éclair » : 15 secondes par thème, « long » : 60 secondes, « à l'aise » : sans chrono.
const MODES = ['standard', 'aise', 'eclair', 'long'];
const TIMER_OF = { eclair: 15, long: 60 };
const MODE_LABEL = { standard: 'standard', aise: "à l'aise", eclair: 'éclair, 15 secondes', long: 'long, 60 secondes' };
const HOUR = 3600 * 1000;

/** « 3 jours », « 30 heures », « moins d'une heure » : le temps qu'il reste, en toutes lettres. */
function leftText(ms) {
  const hours = Math.max(0, Math.round(ms / HOUR));
  if (hours >= 48) return `${Math.floor(hours / 24)} jours`;
  if (hours <= 0) return "moins d'une heure";
  return hours === 1 ? '1 heure' : `${hours} heures`;
}

class DuelService {
  constructor(game) {
    this.game = game;
    this.db = game.db;
  }

  now() {
    return this.game.now();
  }

  /** Les duels laissés trop longtemps sans réponse sont abandonnés. */
  expire() {
    const now = this.now();
    // Un duel dont l'adversaire a commencé sa partie n'expire plus : il pourra la finir.
    const late = this.db
      .prepare("SELECT * FROM duels WHERE status = 'open' AND opponent_game_id IS NULL AND expires_at < ?")
      .all(now);
    for (const d of late) {
      this.db.prepare("UPDATE duels SET status = 'expired' WHERE id = ? AND status = 'open'").run(d.id);
      this.notifyForfeit(d);
    }
    this.remind();
    this.validateDue();
  }

  /** Le Contremaître écrit à un joueur (sans effet si la messagerie n'est pas branchée). */
  tell(userId, body) {
    if (!this.notify) return;
    try {
      this.notify(userId, body);
    } catch (err) {
      console.error('Message du contremaître impossible :', err.message);
    }
  }

  name(id) {
    return (this.userRow(id) || {}).username || 'un joueur';
  }

  /** Le défieur a fini sa partie : l'adversaire en est informé et le décompte commence. */
  announce(d) {
    if (d.notice_at != null) return;
    this.db.prepare('UPDATE duels SET notice_at = ? WHERE id = ?').run(this.now(), d.id);
    const mode = MODE_LABEL[d.mode] || 'standard';
    this.tell(
      d.opponent_id,
      `${this.name(d.challenger_id)} te défie en duel (${mode}). Tu as ${leftText(d.expires_at - this.now())} pour jouer ton tour, sinon tu seras forfait.`,
    );
  }

  /** Rappels avant le forfait : à 24 h puis à 6 h de la fin du délai, tant que l'adversaire n'a pas commencé. */
  remind() {
    const now = this.now();
    const rows = this.db
      .prepare(
        `SELECT d.* FROM duels d JOIN games g ON g.id = d.challenger_game_id
         WHERE d.status = 'open' AND d.opponent_game_id IS NULL AND g.finished_at IS NOT NULL
           AND d.expires_at >= ? AND d.expires_at - ? <= ?`,
      )
      .all(now, now, 24 * HOUR);
    for (const d of rows) {
      const left = d.expires_at - now;
      const stage = left <= 6 * HOUR ? 6 : 24;
      const column = stage === 6 ? 'warn6_at' : 'warn24_at';
      if (d[column] != null) continue;
      // Un rappel à 24 h n'a plus de sens s'il ne reste que quelques heures : on ne le rattrape pas.
      this.db.prepare(`UPDATE duels SET ${column} = ?${stage === 6 ? ', warn24_at = COALESCE(warn24_at, ?)' : ''} WHERE id = ?`).run(...(stage === 6 ? [now, now, d.id] : [now, d.id]));
      this.tell(d.opponent_id, `plus que ${leftText(left)} pour jouer ton tour du duel contre ${this.name(d.challenger_id)}, sinon tu seras forfait.`);
    }
  }

  /** Délai dépassé : le duel est annulé, les deux joueurs en sont informés. */
  notifyForfeit(d) {
    const cg = d.challenger_game_id && this.db.prepare('SELECT finished_at FROM games WHERE id = ?').get(d.challenger_game_id);
    if (!cg || cg.finished_at == null) return; // le défieur n'avait pas fini lui-même : personne n'est en faute
    this.tell(d.opponent_id, `le délai est passé, tu es forfait pour le duel contre ${this.name(d.challenger_id)}. Le duel est annulé.`);
    this.tell(d.challenger_id, `${this.name(d.opponent_id)} n'a pas joué son tour à temps et est forfait. Le duel est annulé.`);
  }

  userRow(id) {
    return this.db.prepare('SELECT id, username, avatar, skin_body, skin_bit, skin_timer FROM users WHERE id = ?').get(id);
  }

  person(id) {
    const u = this.userRow(id);
    return u && { username: u.username, avatar: Avatar.normalize(u.avatar, u.id) };
  }

  /** Lance un duel : crée le duel et la partie du défieur, qui joue tout de suite. */
  create(userId, opponentName, mode) {
    this.expire();
    if (!MODES.includes(mode)) throw new HttpError(400, 'Mode de duel inconnu.');
    const opponent = this.db.prepare('SELECT id FROM users WHERE username_key = ?').get(usernameKey(String(opponentName || '')));
    if (!opponent) throw new HttpError(404, 'Joueur introuvable.');
    if (opponent.id === userId) throw new HttpError(400, 'Choisis un autre joueur que toi-même.');
    const open = this.db.prepare("SELECT COUNT(*) AS n FROM duels WHERE challenger_id = ? AND status = 'open'").get(userId).n;
    if (open >= MAX_OPEN) throw new HttpError(409, `Tu as déjà ${MAX_OPEN} duels en cours : attends qu'un adversaire réponde.`);
    const pair = this.db
      .prepare(
        `SELECT 1 AS x FROM duels WHERE status = 'open'
         AND ((challenger_id = ? AND opponent_id = ?) OR (challenger_id = ? AND opponent_id = ?))`,
      )
      .get(userId, opponent.id, opponent.id, userId);
    if (pair) throw new HttpError(409, 'Un duel est déjà en cours avec ce joueur.');
    const themeIds = this.game.randomThemes(ROUNDS_PER_GAME);
    const now = this.now();
    const duelId = transaction(this.db, () => {
      const { lastInsertRowid } = this.db
        .prepare('INSERT INTO duels (challenger_id, opponent_id, mode, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(userId, opponent.id, mode, now, now + DUEL_TTL_MS);
      const id = Number(lastInsertRowid);
      const insert = this.db.prepare('INSERT INTO duel_themes (duel_id, slot, theme_id) VALUES (?, ?, ?)');
      themeIds.forEach((theme, slot) => insert.run(id, slot, theme));
      return id;
    });
    let gameId;
    try {
      gameId = this.game.createGame(userId, 'duel', this.game.today(), themeIds, null, { duelId, noTimer: mode === 'aise', timerSec: TIMER_OF[mode] || null });
    } catch (err) {
      this.db.prepare('DELETE FROM duels WHERE id = ?').run(duelId);
      throw err;
    }
    this.db.prepare('UPDATE duels SET challenger_game_id = ? WHERE id = ?').run(gameId, duelId);
    return this.game.state(gameId, userId);
  }

  duelFor(duelId, userId) {
    const d = this.db.prepare('SELECT * FROM duels WHERE id = ?').get(duelId);
    if (!d || (d.challenger_id !== userId && d.opponent_id !== userId)) throw new HttpError(404, 'Duel introuvable.');
    return d;
  }

  /** L'adversaire relève le défi : sa partie reprend les mêmes thèmes. */
  accept(duelId, userId) {
    this.expire();
    const d = this.duelFor(duelId, userId);
    if (d.opponent_id !== userId) throw new HttpError(403, "Ce défi s'adresse à ton adversaire.");
    if (d.status !== 'open') throw new HttpError(409, "Ce duel n'est plus en cours.");
    const mine = d.opponent_game_id && this.db.prepare('SELECT id FROM games WHERE id = ?').get(d.opponent_game_id);
    if (mine) return this.game.state(mine.id, userId);
    const theirs = this.db.prepare('SELECT finished_at FROM games WHERE id = ?').get(d.challenger_game_id);
    if (!theirs || theirs.finished_at == null) throw new HttpError(409, "Ton adversaire n'a pas encore fini sa partie.");
    const themeIds = this.db.prepare('SELECT theme_id FROM duel_themes WHERE duel_id = ? ORDER BY slot').all(duelId).map((r) => r.theme_id);
    const gameId = this.game.createGame(userId, 'duel', this.game.today(), themeIds, null, { duelId, noTimer: d.mode === 'aise', timerSec: TIMER_OF[d.mode] || null });
    this.db.prepare('UPDATE duels SET opponent_game_id = ? WHERE id = ?').run(gameId, duelId);
    return this.game.state(gameId, userId);
  }

  decline(duelId, userId) {
    this.expire();
    const d = this.duelFor(duelId, userId);
    if (d.opponent_id !== userId) throw new HttpError(403, "Ce défi s'adresse à ton adversaire.");
    if (d.status !== 'open' || d.opponent_game_id) throw new HttpError(409, "Ce duel n'est plus à refuser.");
    this.db.prepare("UPDATE duels SET status = 'declined', finished_at = ? WHERE id = ?").run(this.now(), duelId);
    return { ok: true };
  }

  /** Une partie de duel vient de se terminer : si l'autre aussi, le résultat est fixé et les badges attribués. */
  afterGame(game) {
    if (game.duel_id == null) return;
    const d = this.db.prepare('SELECT * FROM duels WHERE id = ?').get(game.duel_id);
    if (!d || d.status !== 'open') return;
    if (d.challenger_game_id === game.id) this.announce(d);
    const get = (id) => (id ? this.db.prepare('SELECT * FROM games WHERE id = ?').get(id) : null);
    const cg = get(d.challenger_game_id);
    const og = get(d.opponent_game_id);
    if (!cg || !og || cg.finished_at == null || og.finished_at == null) return;
    const winner = cg.score > og.score ? d.challenger_id : og.score > cg.score ? d.opponent_id : null;
    this.db
      .prepare("UPDATE duels SET status = 'done', finished_at = ?, winner_id = ?, challenger_score = ?, opponent_score = ? WHERE id = ?")
      .run(this.now(), winner, cg.score, og.score, d.id);
    // Badges, crânes, pépites et défis ne sont attribués qu'à la validation (validateDue), le lendemain à 2 h 30.
  }

  /**
   * Validation des duels terminés : le lendemain à 2 h 30 (heure de Bruxelles), une fois traités les signalements
   * des joueurs, le résultat devient définitif et les badges, crânes, pépites et défis de duel sont attribués.
   */
  validateDue() {
    const cutoff = dayKey(this.now() - 30 * 60 * 1000);
    const pending = this.db.prepare("SELECT * FROM duels WHERE status = 'done' AND validated_at IS NULL").all();
    for (const d of pending) {
      if (d.finished_at != null && dayKey(d.finished_at) >= cutoff) continue;
      this.db.prepare('UPDATE duels SET validated_at = ? WHERE id = ?').run(this.now(), d.id);
      const today = this.game.today();
      this.game.badges.awardDuels(d.challenger_id, today);
      this.game.badges.awardDuels(d.opponent_id, today);
      [d.challenger_id, d.opponent_id].forEach((id) => this.game.skulls.award(id, today));
    }
  }

  /**
   * Des points ont été accordés après coup sur une partie de duel : si le duel est terminé, les scores et le vainqueur
   * sont recalculés (le résultat d'origine est conservé), le résultat redevient « à voir » pour les deux joueurs
   * et les badges de duel sont revérifiés.
   */
  revise(gameId) {
    const game = this.db.prepare('SELECT duel_id FROM games WHERE id = ?').get(gameId);
    if (!game || game.duel_id == null) return;
    const d = this.db.prepare('SELECT * FROM duels WHERE id = ?').get(game.duel_id);
    if (!d || d.status !== 'done') return;
    const cg = this.db.prepare('SELECT score FROM games WHERE id = ?').get(d.challenger_game_id);
    const og = this.db.prepare('SELECT score FROM games WHERE id = ?').get(d.opponent_game_id);
    if (!cg || !og) return;
    const winner = cg.score > og.score ? d.challenger_id : og.score > cg.score ? d.opponent_id : null;
    if (d.validated_at == null) {
      // Pas encore validé : personne n'a vu le résultat, on le corrige sans en garder trace.
      this.db.prepare('UPDATE duels SET challenger_score = ?, opponent_score = ?, winner_id = ? WHERE id = ?').run(cg.score, og.score, winner, d.id);
      return;
    }
    const first = d.revised_at == null;
    this.db
      .prepare(
        `UPDATE duels SET challenger_score = ?, opponent_score = ?, winner_id = ?, revised_at = ?,
           old_challenger_score = ?, old_opponent_score = ?, old_winner_id = ?,
           challenger_seen_at = NULL, opponent_seen_at = NULL WHERE id = ?`,
      )
      .run(
        cg.score,
        og.score,
        winner,
        this.now(),
        first ? d.challenger_score : d.old_challenger_score,
        first ? d.opponent_score : d.old_opponent_score,
        first ? d.winner_id : d.old_winner_id,
        d.id,
      );
    const today = this.game.today();
    this.game.badges.awardDuels(d.challenger_id, today);
    this.game.badges.awardDuels(d.opponent_id, today);
    [d.challenger_id, d.opponent_id].forEach((id) => this.game.skulls.award(id, today));
  }

  /** Phrase pour le joueur dont le signalement a révisé un duel (ou null si la partie n'est pas un duel révisé). */
  revisionNote(gameId, userId) {
    if (gameId == null) return null;
    const g = this.db.prepare('SELECT duel_id FROM games WHERE id = ?').get(gameId);
    const d = g && g.duel_id != null && this.db.prepare('SELECT * FROM duels WHERE id = ?').get(g.duel_id);
    if (!d || d.revised_at == null) return null;
    const mine = d.challenger_id === userId;
    const other = this.person(mine ? d.opponent_id : d.challenger_id).username;
    const label = (winner) => (winner == null ? 'une égalité' : winner === userId ? 'une victoire' : 'une défaite');
    const now = mine ? `${d.challenger_score} à ${d.opponent_score}` : `${d.opponent_score} à ${d.challenger_score}`;
    const before = label(d.old_winner_id);
    const after = label(d.winner_id);
    return `Ton duel contre ${other} a été révisé : ${after} (${now})${before === after ? '' : `, au lieu de ${before}`}.`;
  }

  /** Les adversaires possibles, avec le bilan des duels déjà joués contre eux. */
  opponents(userId) {
    const users = this.db.prepare('SELECT id, username, avatar FROM users WHERE id <> ? AND is_system = 0 ORDER BY username_key').all(userId);
    const done = this.db
      .prepare("SELECT * FROM duels WHERE status = 'done' AND validated_at IS NOT NULL AND (challenger_id = ? OR opponent_id = ?)")
      .all(userId, userId);
    const open = this.db
      .prepare("SELECT challenger_id, opponent_id FROM duels WHERE status = 'open' AND (challenger_id = ? OR opponent_id = ?)")
      .all(userId, userId);
    return users.map((u) => {
      const between = done.filter((d) => d.challenger_id === u.id || d.opponent_id === u.id);
      return {
        username: u.username,
        avatar: Avatar.normalize(u.avatar, u.id),
        wins: between.filter((d) => d.winner_id === userId).length,
        losses: between.filter((d) => d.winner_id === u.id).length,
        draws: between.filter((d) => d.winner_id == null).length,
        busy: open.some((d) => d.challenger_id === u.id || d.opponent_id === u.id),
      };
    });
  }

  /** Tout ce que le joueur doit voir : défis reçus, duels en attente, résultats récents. */
  list(userId) {
    this.expire();
    const rows = this.db
      .prepare("SELECT * FROM duels WHERE (challenger_id = ? OR opponent_id = ?) AND status IN ('open', 'done') ORDER BY id DESC LIMIT 60")
      .all(userId, userId);
    const finished = (gameId) => {
      const g = gameId && this.db.prepare('SELECT finished_at FROM games WHERE id = ?').get(gameId);
      return !!(g && g.finished_at != null);
    };
    const received = [];
    const sent = [];
    const results = [];
    const checking = [];
    for (const d of rows) {
      const mineIsChallenger = d.challenger_id === userId;
      const otherId = mineIsChallenger ? d.opponent_id : d.challenger_id;
      const other = this.person(otherId);
      const base = { id: d.id, mode: d.mode, other, createdAt: d.created_at, expiresAt: d.expires_at };
      if (d.status === 'done' && d.validated_at == null) {
        // Joué par les deux : le contremaître vérifie, le résultat n'est connu que le lendemain.
        checking.push({ ...base, finishedAt: d.finished_at });
        continue;
      }
      if (d.status === 'done') {
        const myScore = mineIsChallenger ? d.challenger_score : d.opponent_score;
        const theirScore = mineIsChallenger ? d.opponent_score : d.challenger_score;
        results.push({ ...base, finishedAt: d.finished_at, myScore, theirScore, outcome: d.winner_id == null ? 'draw' : d.winner_id === userId ? 'win' : 'loss', revised: d.revised_at != null, seen: (mineIsChallenger ? d.challenger_seen_at : d.opponent_seen_at) != null });
        continue;
      }
      if (mineIsChallenger) {
        const mine = finished(d.challenger_game_id);
        sent.push({ ...base, gameId: d.challenger_game_id, status: mine ? 'waiting' : 'playing' });
      } else if (finished(d.challenger_game_id)) {
        const mine = d.opponent_game_id;
        received.push({ ...base, gameId: mine || null, status: mine ? 'playing' : 'invited' });
      }
    }
    const record = { wins: 0, losses: 0, draws: 0 };
    for (const r of this.db.prepare("SELECT winner_id FROM duels WHERE status = 'done' AND validated_at IS NOT NULL AND (challenger_id = ? OR opponent_id = ?)").all(userId, userId)) {
      if (r.winner_id == null) record.draws++;
      else if (r.winner_id === userId) record.wins++;
      else record.losses++;
    }
    return {
      opponents: this.opponents(userId),
      received,
      sent,
      checking,
      results: results.slice(0, 10),
      record,
      limits: { open: MAX_OPEN, ttlDays: DUEL_TTL_MS / 86400000 },
    };
  }

  /** Pastilles de l'accueil : défis à relever et résultats pas encore vus. */
  summary(userId) {
    this.expire();
    const invites = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM duels d JOIN games g ON g.id = d.challenger_game_id
         WHERE d.status = 'open' AND d.opponent_id = ? AND g.finished_at IS NOT NULL AND d.opponent_game_id IS NULL`,
      )
      .get(userId).n;
    const unseen = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM duels WHERE status = 'done' AND validated_at IS NOT NULL AND
         ((challenger_id = ? AND challenger_seen_at IS NULL) OR (opponent_id = ? AND opponent_seen_at IS NULL))`,
      )
      .get(userId, userId).n;
    return { invites, unseen };
  }

  markSeen(duelId, userId) {
    const d = this.duelFor(duelId, userId);
    const column = d.challenger_id === userId ? 'challenger_seen_at' : 'opponent_seen_at';
    this.db.prepare(`UPDATE duels SET ${column} = ? WHERE id = ? AND ${column} IS NULL`).run(this.now(), duelId);
    return { ok: true };
  }

  /** Résultat complet d'un duel terminé : les deux joueurs, leurs foreuses et, thème par thème, les réponses. */
  result(duelId, userId) {
    const d = this.duelFor(duelId, userId);
    if (d.status !== 'done') throw new HttpError(409, "Le duel n'est pas terminé : il manque la partie de ton adversaire.");
    if (d.validated_at == null) {
      // Les deux ont joué : le contremaître vérifie, le résultat est dévoilé le lendemain.
      const otherId = d.challenger_id === userId ? d.opponent_id : d.challenger_id;
      return { id: d.id, mode: d.mode, pending: true, opponent: this.person(otherId).username };
    }
    const side = (id, gameId, score) => {
      const u = this.userRow(id);
      return {
        username: u.username,
        avatar: Avatar.normalize(u.avatar, u.id),
        skin: this.game.badges.skinOf(u),
        me: id === userId,
        score,
        rounds: this.db.prepare('SELECT * FROM rounds WHERE game_id = ? ORDER BY slot').all(gameId),
      };
    };
    const a = side(d.challenger_id, d.challenger_game_id, d.challenger_score);
    const b = side(d.opponent_id, d.opponent_game_id, d.opponent_score);
    const view = (r) => ({ outcome: r.outcome, answer: r.answer_label, points: r.points || 0, tier: tierFor(r.points, r.outcome).id });
    const themes = this.db
      .prepare('SELECT slot, theme_id FROM duel_themes WHERE duel_id = ? ORDER BY slot')
      .all(duelId)
      .map((t) => {
        const theme = this.game.themes.get(t.theme_id);
        const ra = a.rounds.find((r) => r.slot === t.slot);
        const rb = b.rounds.find((r) => r.slot === t.slot);
        return { slot: t.slot, themeId: t.theme_id, title: theme ? theme.title : 'Thème indisponible', a: view(ra), b: view(rb) };
      });
    const strip = ({ rounds, ...rest }) => rest;
    return {
      id: d.id,
      mode: d.mode,
      finishedAt: d.finished_at,
      a: strip(a),
      b: strip(b),
      winner: d.winner_id == null ? null : d.winner_id === d.challenger_id ? 'a' : 'b',
      revision: d.revised_at == null ? null : { at: d.revised_at, a: d.old_challenger_score, b: d.old_opponent_score, winner: d.old_winner_id == null ? null : d.old_winner_id === d.challenger_id ? 'a' : 'b' },
      themes,
    };
  }
}

module.exports = { DuelService, MODES, MAX_OPEN };
