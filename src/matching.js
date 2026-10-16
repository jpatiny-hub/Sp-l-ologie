'use strict';

// Articles retirés en début de réponse (français, plus quelques articles néerlandais/anglais
// fréquents dans les noms belges : « De Panne », « Het Zoute », « The Kooks »).
const LEADING_ARTICLES = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'het', 'the']);

/**
 * Découpe une réponse en mots normalisés : minuscules, sans accents, sans ponctuation,
 * sans article initial, « st » → « saint », pluriels simples (-s, -x) retirés.
 */
function normalizeWords(text) {
  const cleaned = String(text)
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' et ')
    // « C++ », « C# » et « C » doivent rester distincts.
    .replace(/\+/g, ' plus ')
    .replace(/#/g, ' sharp ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!cleaned) return [];
  const words = cleaned.split(' ');
  while (words.length > 1 && LEADING_ARTICLES.has(words[0])) words.shift();
  return words
    .map((w) => (w === 'st' ? 'saint' : w === 'ste' ? 'sainte' : w))
    .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w));
}

/** Clé de comparaison : les mots normalisés collés (« Saint-Feuillien » = « st feuillien »). */
function toKey(text) {
  return normalizeWords(text).join('');
}

/** Nombre de fautes tolérées selon la longueur de la clé. */
function maxEdits(length) {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  return 2;
}

/** Distance d'édition (Damerau-Levenshtein restreinte), arrêtée dès qu'elle dépasse `max`. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Cherche la réponse du thème correspondant à la saisie.
 * Retourne { answer, distance } ou null si rien ne correspond.
 * En cas d'égalité entre deux réponses, la plus courante l'emporte (pas de points offerts par une faute).
 */
function matchAnswer(theme, input) {
  const key = toKey(input);
  if (!key) return null;
  const exact = theme.index.get(key);
  if (exact) return { answer: exact, distance: 0 };

  const max = maxEdits(key.length);
  if (max === 0) return null;
  let best = null;
  let bestDistance = max + 1;
  for (const [candidate, answer] of theme.index) {
    const limit = Math.min(max, maxEdits(candidate.length));
    if (limit === 0 || Math.abs(candidate.length - key.length) > limit) continue;
    const d = editDistance(key, candidate, limit);
    if (d > limit) continue;
    if (d < bestDistance || (d === bestDistance && answer.level < best.level)) {
      best = answer;
      bestDistance = d;
    }
  }
  return best ? { answer: best, distance: bestDistance } : null;
}

module.exports = { normalizeWords, toKey, maxEdits, editDistance, matchAnswer };
