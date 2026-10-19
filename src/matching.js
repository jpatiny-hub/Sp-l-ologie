'use strict';

// Articles retirés en début de réponse (français, plus quelques articles néerlandais/anglais
// fréquents dans les noms belges : « De Panne », « Het Zoute », « The Kooks »).
const LEADING_ARTICLES = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'het', 'the']);

const ROMAN = /^(?=[ivxlcdm])m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;
const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
// Mots français qui se lisent aussi comme des chiffres romains.
const NOT_ROMAN = new Set(['dix', 'mix', 'mi', 'ci', 'di', 'li', 'mil', 'did', 'mm']);

/** « xvii » → « 17 » ; null si le mot n'est pas un chiffre romain plausible. */
function romanToNumber(word) {
  if (NOT_ROMAN.has(word) || !ROMAN.test(word)) return null;
  let total = 0;
  for (let i = 0; i < word.length; i++) {
    const v = ROMAN_VALUES[word[i]];
    total += i + 1 < word.length && v < ROMAN_VALUES[word[i + 1]] ? -v : v;
  }
  return total;
}

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
  // Chiffres romains après un nom : « Louis XVII » = « Louis 17 », « Napoléon Ier » = « Napoléon 1er ».
  for (let i = 1; i < words.length; i++) {
    if (words[i] === 'ier') words[i] = '1er';
    else {
      const n = romanToNumber(words[i]);
      if (n) words[i] = String(n);
    }
  }
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
 * Retourne { answer, distance, approximate } ou null si rien ne correspond.
 * `approximate` : la saisie n'est pas le nom affiché de la réponse (faute de frappe ou variante),
 * le joueur doit alors confirmer la proposition.
 * En cas d'égalité entre deux réponses, la plus courante l'emporte (pas de points offerts par une faute).
 */
function matchAnswer(theme, input) {
  const key = toKey(input);
  if (!key) return null;
  const exact = theme.index.get(key);
  if (exact) return { answer: exact, distance: 0, approximate: key !== exact.key };

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
  return best ? { answer: best, distance: bestDistance, approximate: true } : null;
}

module.exports = { normalizeWords, toKey, maxEdits, editDistance, matchAnswer };
