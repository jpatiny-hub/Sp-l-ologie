'use strict';

const { addDays, dayKey } = require('./dates');
const { ROUNDS_PER_GAME } = require('./config');

/*
 * Défi de la semaine : un objectif par semaine (lundi → dimanche), le même pour tous, choisi à tour de rôle.
 * La progression se calcule à partir des forages du jour de la semaine ; rien n'est stocké.
 */
const CHALLENGES = [
  { id: 'pepites', text: 'Trouve 2 pépites cette semaine', goal: 2, unit: ['pépite', 'pépites'], measure: (w) => w.pepites },
  { id: 'jours', text: 'Fore au moins 5 jours cette semaine', goal: 5, unit: ['jour', 'jours'], measure: (w) => w.days },
  { id: 'profond', text: 'Fais 2 forages de plus de 300 points', goal: 2, unit: ['forage', 'forages'], measure: (w) => w.deep },
  { id: 'rares', text: 'Donne 8 réponses rares (Rubis ou mieux) cette semaine', goal: 8, unit: ['réponse', 'réponses'], measure: (w) => w.rares },
  { id: 'complets', text: 'Réponds aux 7 thèmes sans en passer, 3 fois cette semaine', goal: 3, unit: ['forage', 'forages'], measure: (w) => w.complete },
  { id: 'regulier', text: 'Fore chaque jour, du lundi au dimanche', goal: 7, unit: ['jour', 'jours'], measure: (w) => w.days },
  // Ajoutés avec les avatars (à partir de la semaine du 26 octobre 2026).
  { id: 'gravier', text: 'Donne 15 réponses Gravier (moins de 20 points) cette semaine', goal: 15, unit: ['réponse', 'réponses'], measure: (w) => w.gravier },
  { id: 'soufre', text: 'Donne 10 réponses Soufre (20 à 39 points) cette semaine', goal: 10, unit: ['réponse', 'réponses'], measure: (w) => w.soufre },
  { id: 'cuivre', text: 'Donne 6 réponses Cuivre (40 à 59 points) cette semaine', goal: 6, unit: ['réponse', 'réponses'], measure: (w) => w.cuivre },
  { id: 'rubis', text: 'Donne 3 réponses Rubis (60 à 99 points) cette semaine', goal: 3, unit: ['réponse', 'réponses'], measure: (w) => w.rubis },
  { id: 'score', text: 'Cumule 1 800 points sur tes forages de la semaine', goal: 1800, unit: ['point', 'points'], measure: (w) => w.score },
  { id: 'illimite', text: 'Termine 5 parties en mode illimité cette semaine', goal: 5, unit: ['partie', 'parties'], measure: (w) => w.illimite },
  { id: 'forage450', text: 'Fais un forage de 450 points ou plus', goal: 1, unit: ['forage', 'forages'], measure: (w) => (w.best >= 450 ? 1 : 0) },
  { id: 'rapides', text: 'Donne 10 réponses valides en moins de 8 secondes cette semaine', goal: 10, unit: ['réponse', 'réponses'], measure: (w) => w.rapides },
  { id: 'weekend', text: 'Fore le samedi et le dimanche', goal: 2, unit: ['jour', 'jours'], measure: (w) => w.weekend },
  // Défis de duel (à partir de la semaine du 26 octobre 2026) : seuls les duels terminés cette semaine comptent.
  { id: 'duels', text: 'Termine 10 duels cette semaine', goal: 10, unit: ['duel', 'duels'], measure: (w) => w.duels },
  { id: 'duel-victoire', text: 'Gagne 4 duels cette semaine', goal: 4, unit: ['duel', 'duels'], measure: (w) => w.duelWins },
  { id: 'duel-adversaires', text: 'Affronte 3 joueurs différents en duel cette semaine', goal: 3, unit: ['joueur', 'joueurs'], measure: (w) => w.duelOpponents },
  { id: 'duel-pepite', text: 'Trouve une pépite dans un duel cette semaine', goal: 1, unit: ['pépite', 'pépites'], measure: (w) => w.duelPepites },
  { id: 'duel-ecart', text: "Gagne un duel avec au moins 100 points d'avance", goal: 1, unit: ['duel', 'duels'], measure: (w) => (w.duelMargin >= 100 ? 1 : 0) },
];
const LEGACY_COUNT = 6;
const NEW_CHALLENGES_FROM = '2026-10-26';

/** Défi de la semaine qui commence le lundi `start`. */
function challengeFor(start) {
  const n = Math.floor(Date.parse(`${start}T12:00:00Z`) / (7 * 86400000));
  // Les semaines déjà commencées gardent leur défi d'origine.
  return CHALLENGES[n % (start < NEW_CHALLENGES_FROM ? LEGACY_COUNT : CHALLENGES.length)];
}

function weekStats(db, userId, start) {
  const games = db
    .prepare(
      "SELECT id, score, day FROM games WHERE user_id = ? AND mode = 'daily' AND finished_at IS NOT NULL AND day BETWEEN ? AND ?",
    )
    .all(userId, start, addDays(start, 6));
  const stats = { days: games.length, pepites: 0, rares: 0, deep: 0, complete: 0, score: 0, gravier: 0, soufre: 0, cuivre: 0, rubis: 0, illimite: 0, best: 0, rapides: 0, weekend: 0 };
  stats.illimite = db
    .prepare('SELECT COUNT(*) AS n FROM training_log WHERE user_id = ? AND day BETWEEN ? AND ?')
    .get(userId, start, addDays(start, 6)).n;
  const rounds = db.prepare('SELECT outcome, points, served_at, answered_at FROM rounds WHERE game_id = ?');
  for (const g of games) {
    if (g.score > 300) stats.deep++;
    stats.score += g.score;
    stats.best = Math.max(stats.best, g.score);
    if ([0, 6].includes(new Date(`${g.day}T12:00:00Z`).getUTCDay())) stats.weekend++;
    const rs = rounds.all(g.id);
    stats.pepites += rs.filter((r) => r.points >= 100).length;
    stats.rares += rs.filter((r) => r.outcome === 'answer' && r.points >= 60).length;
    stats.cuivre += rs.filter((r) => r.outcome === 'answer' && r.points >= 40 && r.points < 60).length;
    stats.rapides += rs.filter((r) => r.outcome === 'answer' && r.served_at != null && r.answered_at != null && r.answered_at - r.served_at < 8000).length;
    stats.gravier += rs.filter((r) => r.outcome === 'answer' && r.points < 20).length;
    stats.rubis += rs.filter((r) => r.outcome === 'answer' && r.points >= 60 && r.points < 100).length;
    stats.soufre += rs.filter((r) => r.outcome === 'answer' && r.points >= 20 && r.points < 40).length;
    if (rs.filter((r) => r.outcome === 'answer').length === ROUNDS_PER_GAME) stats.complete++;
  }
  Object.assign(stats, duelWeekStats(db, userId, start));
  return stats;
}

/** Duels terminés (les deux parties jouées) durant la semaine qui commence le lundi `start`, vus du joueur. */
function duelWeekStats(db, userId, start) {
  const end = addDays(start, 6);
  const out = { duels: 0, duelWins: 0, duelOpponents: 0, duelPepites: 0, duelMargin: 0 };
  const opponents = new Set();
  const duels = db
    .prepare("SELECT * FROM duels WHERE status = 'done' AND validated_at IS NOT NULL AND (challenger_id = ? OR opponent_id = ?)")
    .all(userId, userId)
    .filter((d) => d.finished_at != null && dayKey(d.finished_at) >= start && dayKey(d.finished_at) <= end);
  for (const d of duels) {
    const mine = d.challenger_id === userId;
    const myScore = mine ? d.challenger_score : d.opponent_score;
    const theirScore = mine ? d.opponent_score : d.challenger_score;
    out.duels++;
    opponents.add(mine ? d.opponent_id : d.challenger_id);
    if (d.winner_id === userId) {
      out.duelWins++;
      out.duelMargin = Math.max(out.duelMargin, myScore - theirScore);
    }
    const gameId = mine ? d.challenger_game_id : d.opponent_game_id;
    out.duelPepites += db.prepare('SELECT COUNT(*) AS n FROM rounds WHERE game_id = ? AND points >= 100').get(gameId).n;
  }
  out.duelOpponents = opponents.size;
  return out;
}

/** Progression du joueur sur le défi de la semaine qui commence le lundi `start`. */
function challengeProgress(db, userId, start) {
  const challenge = challengeFor(start);
  const progress = Math.min(challenge.goal, challenge.measure(weekStats(db, userId, start)));
  return { id: challenge.id, text: challenge.text, goal: challenge.goal, progress, done: progress >= challenge.goal, unit: challenge.unit };
}

module.exports = { CHALLENGES, challengeFor, challengeProgress, weekStats };
