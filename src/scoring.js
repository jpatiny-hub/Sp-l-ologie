'use strict';

/*
 * Modèle probabiliste de rareté
 * -----------------------------
 * Chaque réponse d'un thème a un niveau de difficulté (1 = évident … 5 = très obscur),
 * estimé pour un public belge. Ce niveau donne un poids a priori : la probabilité
 * qu'un joueur pris au hasard donne cette réponse.
 *
 * Les réponses réellement données en partie quotidienne viennent affiner ces probabilités
 * (modèle de Dirichlet-multinomial) :
 *
 *     p(réponse) = (FORCE_A_PRIORI × poids/Σpoids + nb de fois donnée) / (FORCE_A_PRIORI + nb total de réponses)
 *
 * Tant qu'il y a peu de joueurs, l'a priori domine ; plus les données s'accumulent,
 * plus le comportement réel des joueurs compte.
 *
 * Les points dépendent de la « surprise » de la réponse (en théorie de l'information :
 * -ln p) comparée à la réponse la plus attendue du thème :
 *     t = ln(p_max / p) / ÉCHELLE  (borné entre 0 et 1)   →   points = 10 + 80 × t
 * Une réponse rare (t ≥ 0,70, soit un niveau 4 ou 5) que personne n'avait encore donnée est une « pépite » : 100 points.
 */

// Poids a priori par niveau : chaque niveau est environ 3 fois moins probable que le précédent.
const LEVEL_WEIGHTS = [0, 1, 0.35, 0.12, 0.04, 0.012];

// Nombre de « réponses fictives » que représente l'a priori. Plus il est grand,
// plus il faut de vraies réponses pour faire évoluer la cote d'une réponse.
const PRIOR_STRENGTH = 500;

// Écart de surprise entre le niveau 1 et le niveau 5 : sert d'unité pour t.
const SCALE = Math.log(LEVEL_WEIGHTS[1] / LEVEL_WEIGHTS[5]);

const PEPITE_THRESHOLD = 0.7;

const TIERS = {
  invalid: { id: 'invalid', label: 'Hors thème', emoji: '⬛' },
  timeout: { id: 'timeout', label: 'Temps écoulé', emoji: '⬛' },
  skip: { id: 'skip', label: 'Passé', emoji: '⬛' },
  // Rareté, de la roche commune au métal précieux.
  evident: { id: 'evident', label: 'Gravier', emoji: '🟫' },
  courant: { id: 'courant', label: 'Soufre', emoji: '🟨' },
  original: { id: 'original', label: 'Cuivre', emoji: '🟧' },
  rare: { id: 'rare', label: 'Rubis', emoji: '🟥' },
  pepite: { id: 'pepite', label: 'Pépite !', emoji: '💎' },
};

function tierFor(points, outcome) {
  if (outcome === 'timeout') return TIERS.timeout;
  if (outcome === 'skip') return TIERS.skip;
  if (!points) return TIERS.invalid;
  if (points >= 100) return TIERS.pepite;
  if (points >= 60) return TIERS.rare;
  if (points >= 40) return TIERS.original;
  if (points >= 20) return TIERS.courant;
  return TIERS.evident;
}

/** Probabilités a posteriori de toutes les réponses du thème. `counts` : Map clé → nb de fois donnée. */
function probabilities(theme, counts) {
  let total = 0;
  for (const answer of theme.answers) total += counts.get(answer.key) || 0;
  const probs = new Map();
  let pMax = 0;
  for (const answer of theme.answers) {
    const prior = (PRIOR_STRENGTH * answer.weight) / theme.weightTotal;
    const p = (prior + (counts.get(answer.key) || 0)) / (PRIOR_STRENGTH + total);
    probs.set(answer.key, p);
    if (p > pMax) pMax = p;
  }
  return { probs, pMax, total };
}

/** Points d'une réponse de probabilité `p` (`pMax` : celle de la réponse la plus attendue). */
function pointsFor(p, pMax, alreadyGiven) {
  const t = Math.min(1, Math.max(0, Math.log(pMax / p) / SCALE));
  return t >= PEPITE_THRESHOLD && !alreadyGiven ? 100 : Math.round(10 + 80 * t);
}

/** Points rapportés par `answerKey` pour le thème, compte tenu des réponses déjà données. */
function scoreAnswer(theme, counts, answerKey) {
  const { probs, pMax } = probabilities(theme, counts);
  const p = probs.get(answerKey);
  if (p === undefined) throw new Error(`Réponse inconnue pour le thème ${theme.id} : ${answerKey}`);
  const points = pointsFor(p, pMax, (counts.get(answerKey) || 0) > 0);
  return { points, probability: p, pepite: points === 100, tier: tierFor(points, 'answer') };
}

module.exports = { LEVEL_WEIGHTS, PRIOR_STRENGTH, SCALE, TIERS, tierFor, probabilities, pointsFor, scoreAnswer };
