'use strict';

const { addDays } = require('./dates');
const { ROUNDS_PER_GAME } = require('./config');

/*
 * Défi de la semaine : un objectif par semaine (lundi → dimanche), le même pour tous, choisi à tour de rôle.
 * La progression se calcule à partir des forages du jour de la semaine ; rien n'est stocké.
 */
const CHALLENGES = [
  { id: 'pepites', text: 'Trouve 3 pépites cette semaine', goal: 3, unit: ['pépite', 'pépites'], measure: (w) => w.pepites },
  { id: 'jours', text: 'Fore au moins 5 jours cette semaine', goal: 5, unit: ['jour', 'jours'], measure: (w) => w.days },
  { id: 'profond', text: 'Fais 2 forages de plus de 300 points', goal: 2, unit: ['forage', 'forages'], measure: (w) => w.deep },
  { id: 'rares', text: 'Donne 8 réponses rares (Rubis ou mieux) cette semaine', goal: 8, unit: ['réponse', 'réponses'], measure: (w) => w.rares },
  { id: 'complets', text: 'Réponds aux 7 thèmes sans en passer, 3 fois cette semaine', goal: 3, unit: ['forage', 'forages'], measure: (w) => w.complete },
  { id: 'regulier', text: 'Fore chaque jour, du lundi au dimanche', goal: 7, unit: ['jour', 'jours'], measure: (w) => w.days },
  // Ajoutés avec les avatars (à partir de la semaine du 26 octobre 2026).
  { id: 'score', text: 'Cumule 1 800 points sur tes forages de la semaine', goal: 1800, unit: ['point', 'points'], measure: (w) => w.score },
  { id: 'soufre', text: 'Donne 12 réponses Soufre (20 à 39 points) cette semaine', goal: 12, unit: ['réponse', 'réponses'], measure: (w) => w.soufre },
  { id: 'illimite', text: 'Termine 5 parties en mode illimité cette semaine', goal: 5, unit: ['partie', 'parties'], measure: (w) => w.illimite },
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
      "SELECT id, score FROM games WHERE user_id = ? AND mode = 'daily' AND finished_at IS NOT NULL AND day BETWEEN ? AND ?",
    )
    .all(userId, start, addDays(start, 6));
  const stats = { days: games.length, pepites: 0, rares: 0, deep: 0, complete: 0, score: 0, soufre: 0, illimite: 0 };
  stats.illimite = db
    .prepare('SELECT COUNT(*) AS n FROM training_log WHERE user_id = ? AND day BETWEEN ? AND ?')
    .get(userId, start, addDays(start, 6)).n;
  const rounds = db.prepare('SELECT outcome, points FROM rounds WHERE game_id = ?');
  for (const g of games) {
    if (g.score > 300) stats.deep++;
    stats.score += g.score;
    const rs = rounds.all(g.id);
    stats.pepites += rs.filter((r) => r.points >= 100).length;
    stats.rares += rs.filter((r) => r.outcome === 'answer' && r.points >= 60).length;
    stats.soufre += rs.filter((r) => r.outcome === 'answer' && r.points >= 20 && r.points < 40).length;
    if (rs.filter((r) => r.outcome === 'answer').length === ROUNDS_PER_GAME) stats.complete++;
  }
  return stats;
}

/** Progression du joueur sur le défi de la semaine qui commence le lundi `start`. */
function challengeProgress(db, userId, start) {
  const challenge = challengeFor(start);
  const progress = Math.min(challenge.goal, challenge.measure(weekStats(db, userId, start)));
  return { id: challenge.id, text: challenge.text, goal: challenge.goal, progress, done: progress >= challenge.goal, unit: challenge.unit };
}

module.exports = { CHALLENGES, challengeFor, challengeProgress, weekStats };
