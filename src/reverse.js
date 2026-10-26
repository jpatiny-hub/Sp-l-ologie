'use strict';

const { toKey, numberKey } = require('./matching');
const { HttpError } = require('./errors');

/*
 * Mode inversé (ébauche, réservée au responsable du jeu) : le jeu montre des réponses d'un thème une par une, de la plus rare à la
 * plus évidente, et le joueur doit retrouver le thème en donnant des mots-clés. Chaque proposition ratée révèle l'indice suivant.
 * Rien n'est enregistré dans les forages, les badges, les podiums ni les décomptes de réponses.
 */

const ROUNDS = 5;
const CLUES = 6;
const POINTS = [100, 70, 50, 35, 20, 10];
const MIN_ANSWERS = 12;
const MAX_CANDIDATES = 6;
const MIN_SCORE = 3;
// Les thèmes « quelque chose qui… » se devinent mal à partir de réponses seules.
const EXCLUDED_TITLE = /^quelque chose/i;

const STOP = new Set(
  `un une des du de la le les et ou qui que qu quelque chose type d l c j n s ce cet cette ces on au aux en dans sur sous pour par avec sans son sa ses leur leurs
   plus moins est etre avoir fait faire nom noms comme tout tous toute toutes autre autres meme meme meme a y il elle ils elles ne pas ni car donc mais`.split(/\s+/),
);

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stem(word) {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word;
}

function tokens(text) {
  const out = [];
  for (const w of normalize(text).split(' ')) {
    if (!w || STOP.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
    out.push(stem(w));
  }
  return [...new Set(out)];
}

/** Index des mots des titres (poids plein) et des commentaires (poids réduit) de tous les thèmes éligibles. */
function buildIndex(themes) {
  const entries = [];
  const df = new Map();
  for (const theme of themes.values()) {
    if (!theme.active || theme.answers.length < MIN_ANSWERS || EXCLUDED_TITLE.test(theme.title)) continue;
    const title = new Set(tokens(theme.title));
    const notes = new Set(tokens((theme.notes || []).join(' ')));
    notes.forEach((w) => title.has(w) && notes.delete(w));
    entries.push({ theme, title, notes });
    for (const w of new Set([...title, ...notes])) df.set(w, (df.get(w) || 0) + 1);
  }
  const idf = (w) => Math.log((entries.length + 1) / ((df.get(w) || 0) + 0.5));
  return { entries, idf, df };
}

function containsClue(theme, clue) {
  return clue.keys.some((k) => theme.index.has(k));
}

class ReverseService {
  constructor(db, themes, rand = Math.random) {
    this.db = db;
    this.themes = themes;
    this.rand = rand;
    this.games = new Map(); // utilisateur → partie en cours (conservée en mémoire : ébauche de test)
    this.indexCache = null;
  }

  get index() {
    if (!this.indexCache || this.indexCache.size !== this.themes.size) {
      this.indexCache = buildIndex(this.themes);
      this.indexCache.size = this.themes.size;
    }
    return this.indexCache;
  }

  /** Mots-clés → thèmes candidats avec leur score (mots rares = score élevé). */
  interpret(text) {
    const { entries, idf } = this.index;
    const words = tokens(text);
    const scored = entries.map(({ theme, title, notes }) => {
      let score = 0;
      const hit = [];
      for (const w of words) {
        let weight = 0;
        if (title.has(w)) weight = 1;
        else if (notes.has(w)) weight = 0.6;
        else if (w.length >= 5) {
          const near = [...title].some((t) => t.length >= 5 && (t.startsWith(w) || w.startsWith(t))) ? 0.7 : 0;
          weight = near;
        }
        if (weight) {
          score += idf(w) * weight;
          hit.push(w);
        }
      }
      return { theme, score, hit };
    });
    scored.sort((a, b) => b.score - a.score || a.theme.id.localeCompare(b.theme.id));
    const best = scored[0] ? scored[0].score : 0;
    const candidates = best >= MIN_SCORE ? scored.filter((s) => s.score >= Math.max(MIN_SCORE, best * 0.75)) : [];
    return { words, best, candidates, top: scored.slice(0, 5).filter((s) => s.score > 0) };
  }

  /** Indices d'un thème : de la réponse la plus rare à la plus évidente, en évitant les réponses qui vont avec trop d'autres thèmes. */
  buildClues(theme) {
    const counts = new Map(
      this.db.prepare('SELECT answer_key, n FROM answer_counts WHERE theme_id = ?').all(theme.id).map((x) => [x.answer_key, x.n]),
    );
    const pool = theme.answers
      .filter((a) => a.label.length <= 42)
      .map((a) => ({ a, keys: [...new Set(a.names.flatMap((n) => [toKey(n), numberKey(n)]).filter(Boolean))], n: counts.get(a.key) || 0 }))
      .sort((x, y) => y.a.level - x.a.level || x.n - y.n);
    const k = Math.min(CLUES, pool.length);
    const eligible = this.index.entries.map((e) => e.theme);
    const others = (keys) => eligible.filter((t) => t.id !== theme.id && keys.some((key) => t.index.has(key))).length;
    let best = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      const picked = [];
      const used = new Set();
      for (let i = 0; i < k; i++) {
        const centre = Math.round((i * (pool.length - 1)) / Math.max(1, k - 1));
        const span = Math.max(1, Math.floor(pool.length / (2 * k)));
        const window = [];
        for (let p = Math.max(0, centre - span); p <= Math.min(pool.length - 1, centre + span); p++) if (!used.has(p)) window.push(p);
        if (!window.length) continue;
        // Parmi les réponses voisines, une des moins partagées avec d'autres thèmes (au hasard à égalité).
        const scored = window.map((p) => ({ p, o: others(pool[p].keys) + this.rand() * 0.9 })).sort((x, y) => x.o - y.o);
        const choice = attempt === 0 ? scored[0] : scored[Math.floor(this.rand() * Math.min(3, scored.length))];
        used.add(choice.p);
        picked.push(choice.p);
      }
      picked.sort((x, y) => x - y); // de la plus rare (début de la liste triée) à la plus évidente
      const clues = picked.map((p) => ({ label: pool[p].a.label, level: pool[p].a.level, keys: pool[p].keys }));
      const common = eligible.filter((t) => clues.every((c) => containsClue(t, c))).length;
      if (!best || common < best.common) best = { clues, common };
      if (common <= 2) break;
    }
    return best.clues;
  }

  pickThemes() {
    const ids = this.index.entries.map((e) => e.theme.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, ROUNDS);
  }

  start(userId) {
    const rounds = this.pickThemes().map((themeId) => {
      const theme = this.themes.get(themeId);
      return { themeId, title: theme.title, clues: this.buildClues(theme), revealed: 1, guesses: [], status: 'playing', points: 0 };
    });
    const game = { rounds, current: 0, score: 0 };
    this.games.set(userId, game);
    return this.view(userId);
  }

  get(userId) {
    const game = this.games.get(userId);
    if (!game) throw new HttpError(404, 'Aucune partie en cours : lance une partie.');
    return game;
  }

  view(userId) {
    const game = this.games.get(userId);
    if (!game) return { active: false };
    const round = game.rounds[game.current];
    const over = round.status !== 'playing';
    return {
      active: true,
      round: game.current + 1,
      rounds: game.rounds.length,
      score: game.score,
      finished: game.finished === true,
      status: round.status,
      points: round.points,
      potential: over ? 0 : POINTS[round.revealed - 1],
      cluesTotal: round.clues.length,
      clues: round.clues.slice(0, round.revealed).map((c) => ({ label: c.label, level: c.level })),
      guesses: round.guesses,
      theme: over ? round.title : null,
      themeId: over ? round.themeId : null,
      lastRound: game.current === game.rounds.length - 1,
    };
  }

  guess(userId, text) {
    const game = this.get(userId);
    const round = game.rounds[game.current];
    if (round.status !== 'playing') throw new HttpError(409, 'Cette manche est terminée.');
    const clean = String(text || '').trim().slice(0, 200);
    if (!clean) throw new HttpError(400, 'Écris quelques mots-clés.');
    const read = this.interpret(clean);
    const shown = round.clues.slice(0, round.revealed);
    const entry = {
      text: clean,
      words: read.words,
      candidates: read.top.map((s) => ({ title: s.theme.title, score: Math.round(s.score * 10) / 10, clues: shown.filter((c) => containsClue(s.theme, c)).length })),
    };
    if (!read.words.length || read.best < MIN_SCORE) {
      entry.verdict = 'incompris';
      entry.note = 'Je ne reconnais pas ces mots dans les thèmes : aucun indice n\'est révélé.';
      round.guesses.push(entry);
      return this.view(userId);
    }
    if (read.candidates.length > MAX_CANDIDATES) {
      entry.verdict = 'vague';
      entry.note = `Trop vague (${read.candidates.length} thèmes correspondent) : précise ta réponse, aucun indice n'est révélé.`;
      round.guesses.push(entry);
      return this.view(userId);
    }
    const found = read.candidates.find((s) => shown.every((c) => containsClue(s.theme, c)));
    if (found) {
      entry.verdict = 'juste';
      entry.note = `Thème trouvé : « ${found.theme.title} ».`;
      round.guesses.push(entry);
      round.status = 'found';
      round.points = POINTS[round.revealed - 1];
      game.score += round.points;
      return this.view(userId);
    }
    const close = read.candidates.some((s) => shown.some((c) => containsClue(s.theme, c)));
    entry.verdict = close ? 'proche' : 'non';
    entry.note = close ? 'Tu es proche : ce thème contient au moins un des indices, mais pas tous.' : 'Ce n\'est pas ça.';
    round.guesses.push(entry);
    this.reveal(round);
    return this.view(userId);
  }

  /** Passe à l'indice suivant ; sans indice restant, la manche est perdue. */
  reveal(round) {
    if (round.revealed < round.clues.length) round.revealed += 1;
    else round.status = 'failed';
  }

  giveUp(userId) {
    const game = this.get(userId);
    const round = game.rounds[game.current];
    if (round.status !== 'playing') throw new HttpError(409, 'Cette manche est terminée.');
    round.status = 'failed';
    return this.view(userId);
  }

  next(userId) {
    const game = this.get(userId);
    const round = game.rounds[game.current];
    if (round.status === 'playing') throw new HttpError(409, 'La manche est en cours.');
    if (game.current < game.rounds.length - 1) game.current += 1;
    else game.finished = true;
    return this.view(userId);
  }
}

module.exports = { ReverseService, POINTS, tokens, normalize };
