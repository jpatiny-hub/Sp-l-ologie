'use strict';

// Articles retirés en début de réponse (français, plus quelques articles néerlandais/anglais
// fréquents dans les noms belges : « De Panne », « Het Zoute », « The Kooks »).
const LEADING_ARTICLES = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'het', 'the']);

const ROMAN = /^(?=[ivxlcdm])m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;
const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
// Dans la clé « chiffres » : lettres issues d'élisions (« d'urgence », « l'eau ») et abréviations courantes
// (CD, DC, cm, ml…) qui ne sont pas des chiffres romains. La clé d'origine (stockée en base) n'y touche pas.
const NOT_ROMAN_NUMERIC = new Set(['c', 'd', 'l', 'm', 'cd', 'dc', 'mc', 'cm', 'dm', 'cl', 'dl', 'ml', 'lc', 'ld', 'md', 'lm', 'dd']);

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

// Nombres écrits en lettres (y compris septante, octante/huitante, nonante) → chiffres.
const NUMBER_WORDS = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30,
  quarante: 40, cinquante: 50, soixante: 60, septante: 70, octante: 80, huitante: 80, nonante: 90,
  // Titres anglais : « Eight Days a Week », « Twenty One Pilots ».
  one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const BIG_WORDS = { hundred: 100, thousand: 1000, cent: 100, cents: 100, mille: 1000, million: 1e6, millions: 1e6, milliard: 1e9, milliards: 1e9 };
const ORDINAL_WORDS = {
  premier: '1er', premiere: '1er', deuxieme: '2e', second: '2e', seconde: '2e', troisieme: '3e', quatrieme: '4e',
  cinquieme: '5e', sixieme: '6e', septieme: '7e', huitieme: '8e', neuvieme: '9e', dixieme: '10e', onzieme: '11e',
  douzieme: '12e', treizieme: '13e', quatorzieme: '14e', quinzieme: '15e', seizieme: '16e', vingtieme: '20e',
  centieme: '100e', millieme: '1000e',
};

/** Le nombre `v` peut-il s'ajouter à `cur` dans une même écriture (« vingt » + « trois », mais pas « deux » + « trois ») ? */
function canAdd(cur, v) {
  const r = cur % 100;
  if (r === 0) return true;
  if (v >= 100) return false;
  if (r >= 20 && r % 10 === 0 && v < 10) return true;
  if ((r === 60 || r === 80) && v >= 10 && v < 20) return true;
  return r === 10 && v >= 7 && v < 10;
}

/** « vingt mille lieues » → « 20000 lieues », « 2eme » → « 2e », « 1 000 » → « 1000 ». */
function numberize(words) {
  const out = [];
  for (let i = 0; i < words.length; ) {
    const w = words[i];
    if (ORDINAL_WORDS[w]) { out.push(ORDINAL_WORDS[w]); i++; continue; }
    const ord = w.match(/^(\d+)(?:e|eme|ieme|em|ere)$/);
    if (ord) { out.push(w.endsWith('ere') && ord[1] === '1' ? '1er' : `${ord[1]}e`); i++; continue; }
    if (!(w in NUMBER_WORDS) && !(w in BIG_WORDS)) { out.push(w); i++; continue; }
    let total = 0;
    let cur = 0;
    let used = 0;
    let j = i;
    while (j < words.length) {
      let t = words[j];
      let skip = 0;
      if (t === 'et' && used && (words[j + 1] in NUMBER_WORDS || words[j + 1] in BIG_WORDS)) { t = words[j + 1]; skip = 1; }
      if (t in NUMBER_WORDS) {
        const v = NUMBER_WORDS[t];
        if (v === 20 && cur % 100 >= 2 && cur % 100 < 10) cur += (cur % 100) * 19;
        else if (!canAdd(cur, v)) break;
        else cur += v;
      } else if (t in BIG_WORDS) {
        const v = BIG_WORDS[t];
        if (v === 100) {
          const r = cur % 100;
          if (r >= 10) break;
          cur += (r || 1) * 100 - r;
        } else { total += (cur || 1) * v; cur = 0; }
      } else break;
      used++;
      j += 1 + skip;
    }
    if (!used || (used === 1 && (w === 'un' || w === 'une'))) { out.push(w); i++; continue; }
    out.push(String(total + cur));
    i = j;
  }
  const merged = [];
  for (const w of out) {
    const last = merged.length - 1;
    if (last >= 0 && /^\d{3}$/.test(w) && /^[1-9]\d{0,2}$/.test(merged[last])) merged[last] += w;
    else merged.push(w);
  }
  return merged;
}

/**
 * Découpe une réponse en mots normalisés : minuscules, sans accents, sans ponctuation,
 * sans article initial, « st » → « saint », pluriels simples (-s, -x) retirés.
 */
function normalizeWords(text, numbers = false) {
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
  let words = cleaned.split(' ');
  while (words.length > 1 && LEADING_ARTICLES.has(words[0])) words.shift();
  // Chiffres romains après un nom : « Louis XVII » = « Louis 17 », « Napoléon Ier » = « Napoléon 1er ».
  for (let i = 1; i < words.length; i++) {
    if (words[i] === 'ier') words[i] = '1er';
    else {
      const n = numbers && NOT_ROMAN_NUMERIC.has(words[i]) ? null : romanToNumber(words[i]);
      if (n) words[i] = String(n);
    }
  }
  if (numbers) words = numberize(words);
  return words
    .map((w) => (w === 'st' ? 'saint' : w === 'ste' ? 'sainte' : w))
    .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w));
}

/** Clé de comparaison : les mots normalisés collés (« Saint-Feuillien » = « st feuillien »). */
function toKey(text) {
  return normalizeWords(text).join('');
}

/** Clé « chiffres » : « La valse à mille temps » et « La valse à 1000 temps » donnent la même. */
function numberKey(text) {
  return normalizeWords(text, true).join('');
}

/** Nombre de fautes tolérées selon la longueur de la clé (une touche voisine ne compte que pour une demi-faute). */
function maxEdits(length) {
  if (length <= 3) return 0;
  if (length === 4) return 0.5;
  if (length <= 8) return 1;
  if (length <= 12) return 2;
  return 3;
}

// Claviers AZERTY (belge) et QWERTY : deux lettres voisines se confondent facilement au doigt.
const KEY_ROWS = [
  ['azertyuiop', 'qsdfghjklm', 'wxcvbn'],
  ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
];
const ROW_SHIFT = [0, 0.3, 0.8];
const NEIGHBOURS = new Map();
for (const rows of KEY_ROWS) {
  const keys = [];
  rows.forEach((row, y) => [...row].forEach((ch, i) => keys.push({ ch, y, x: i + ROW_SHIFT[y] })));
  for (const a of keys) {
    for (const b of keys) {
      if (a.ch === b.ch) continue;
      const dy = Math.abs(a.y - b.y);
      const dx = Math.abs(a.x - b.x);
      if ((dy === 0 && dx < 1.1) || (dy === 1 && dx < 0.85)) {
        if (!NEIGHBOURS.has(a.ch)) NEIGHBOURS.set(a.ch, new Set());
        NEIGHBOURS.get(a.ch).add(b.ch);
      }
    }
  }
}

function substitutionCost(x, y) {
  if (x === y) return 0;
  const near = NEIGHBOURS.get(x);
  return near && near.has(y) ? 0.5 : 1;
}

/**
 * Distance d'édition (Damerau-Levenshtein restreinte) où remplacer une lettre par une touche
 * voisine du clavier ne coûte qu'une demi-faute. Arrêtée dès qu'elle dépasse `max`.
 */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + substitutionCost(a[i - 1], b[j - 1]));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

// Mots de liaison ignorés quand on compare des mots-clés (« rouler à contre-sens » ↔ « rouler en sens inverse »).
const FILLER_WORDS = new Set([
  'a', 'au', 'aux', 'avec', 'sans', 'sur', 'sous', 'dans', 'en', 'et', 'ou', 'par', 'pour', 'chez', 'vers',
  'qui', 'que', 'qu', 'ne', 'pas', 'se', 's', 'y', 'on', 'il', 'elle', 'je', 'ai', 'est', 'son', 'sa', 'ses',
  'mon', 'ma', 'mes', 'ce', 'cet', 'cette', 'de', 'du', 'des', 'd', 'le', 'la', 'les', 'l', 'un', 'une',
]);

/** Mots-clés d'une saisie : mots normalisés, sans mots de liaison, sans doublon. */
function keywords(words) {
  return [...new Set(words.filter((w) => !FILLER_WORDS.has(w)))];
}

function sameKeyword(a, b) {
  if (a === b) return true;
  return a.length >= 6 && b.length >= 6 && editDistance(a, b, 1) <= 1;
}

const keywordCache = new WeakMap();

/** Réponses « longues » (au moins 3 mots-clés) avec les mots-clés de chacun de leurs noms. */
function keywordIndex(theme) {
  let index = keywordCache.get(theme);
  if (index) return index;
  index = [];
  for (const answer of theme.answers) {
    const sets = (answer.names || [answer.label]).map((name) => keywords(normalizeWords(name, true))).filter((k) => k.length >= 3);
    if (sets.length) index.push({ answer, sets });
  }
  keywordCache.set(theme, index);
  return index;
}

/**
 * Repli pour les réponses longues : la saisie donne au moins 2 mots-clés, tous présents dans une seule
 * réponse du thème (« sens inverse circulation » → « Circulation en sens inverse »). Ambigu → rien.
 */
function keywordMatch(theme, words) {
  const wanted = keywords(words);
  if (wanted.length < 2) return null;
  let found = null;
  for (const { answer, sets } of keywordIndex(theme)) {
    if (!sets.some((set) => wanted.every((w) => set.some((k) => sameKeyword(w, k))))) continue;
    if (found) return null;
    found = answer;
  }
  return found ? { answer: found, distance: 0, approximate: true, via: 'mots-clés' } : null;
}

const surnameCache = new WeakMap();

/** Dernier mot (normalisé) → réponse, uniquement quand un seul nom du thème se termine par ce mot. */
function surnameIndex(theme) {
  let index = surnameCache.get(theme);
  if (index) return index;
  index = new Map();
  const ambiguous = new Set();
  for (const answer of theme.answers) {
    for (const name of answer.names || [answer.label]) {
      const words = normalizeWords(name);
      if (words.length < 2) continue;
      const last = words[words.length - 1];
      if (last.length < 4 || /^\d/.test(last)) continue;
      if (index.has(last) && index.get(last) !== answer) ambiguous.add(last);
      index.set(last, answer);
    }
  }
  // Un mot qui est déjà une réponse à part entière ne sert pas de raccourci.
  for (const last of ambiguous) index.delete(last);
  for (const key of theme.index.keys()) index.delete(key);
  surnameCache.set(theme, index);
  return index;
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
  if (exact) return { answer: exact, distance: 0, approximate: key !== exact.key, via: key === exact.key ? 'nom exact' : 'variante' };
  const nkey = numberKey(input);
  const viaNumbers = nkey !== key && theme.index.get(nkey);
  if (viaNumbers) return { answer: viaNumbers, distance: 0, approximate: nkey !== numberKey(viaNumbers.label), via: 'nombres' };

  const words = normalizeWords(input);
  if (words.length === 1) {
    const surname = surnameIndex(theme).get(words[0]);
    if (surname) return { answer: surname, distance: 0, approximate: true, via: 'nom de famille' };
  }

  const max = maxEdits(key.length);
  if (max === 0) return keywordMatch(theme, normalizeWords(input, true));
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
  return best ? { answer: best, distance: bestDistance, approximate: true, via: 'faute de frappe' } : keywordMatch(theme, normalizeWords(input, true));
}

module.exports = { normalizeWords, toKey, numberKey, maxEdits, editDistance, matchAnswer };
