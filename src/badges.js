'use strict';

const { addDays, weekStart, monthStart, monthEnd, addMonths } = require('./dates');
const { ROUNDS_PER_GAME } = require('./config');

/*
 * Badges
 * ------
 * Gagnés en partie quotidienne, sauf ceux des thèmes rencontrés (tous modes confondus). Chaque badge ne se gagne
 * qu'une fois ; son « instance » garde la trace de l'occasion (jour, période de podium, année). Certains débloquent une carrosserie ou un foret.
 */

// Séries de jours consécutifs : du matériel de spéléo de plus en plus engagé.
const STREAKS = [
  [3, 'Mousqueton'],
  [7, 'Descendeur'],
  [14, 'Boyau étroit'],
  [30, 'Siphon'],
  [50, 'Aven'],
  [100, 'Gouffre'],
  [200, 'Abîme'],
  [365, 'Gardien du noyau'],
];

// Profondeur atteinte en un forage (points du jour).
const DEPTHS = [
  [260, 'Plongée dans le manteau', 'Atteindre le manteau inférieur (220 points en un forage)', 220],
  [500, 'Fer en fusion', 'Atteindre le noyau externe (430 points en un forage)', 430],
  [650, 'Cœur de cristal', 'Atteindre le noyau interne (560 points en un forage)', 560],
  [700, 'Voyage au centre de la Terre', 'Atteindre le centre de la Terre (600 points en un forage)', 600],
];

const PEPITES = [
  [1, "Chercheur d'or", 'Trouver une première pépite'],
  [10, "Filon d'or", 'Trouver 10 pépites'],
  [50, "Mine d'or", 'Trouver 50 pépites'],
];

// Thèmes rencontrés, tous modes de jeu confondus (forage du jour et mode illimité).
const THEMES = [
  [25, 'Coup de sonde'],
  [100, 'Carottier'],
  [250, 'Géologue'],
  [500, 'Chef de chantier'],
  [1000, 'Maître mineur'],
  [2500, 'Grand prospecteur'],
  [5000, 'Mémoire de la Terre'],
];

// Jours particuliers : il suffit de terminer le forage du jour ce jour-là.
const CALENDAR = {
  'nouvel-an': { name: (y) => `Passage à ${y}`, description: (y) => `Forage du 1er janvier ${y}`, icon: 'feu-artifice', body: 'feu-artifice' },
  epiphanie: { name: () => 'Fève enfouie', description: (y) => `Forage de l'Épiphanie, le 6 janvier ${y}`, icon: 'feve' },
  'darwin-day': { name: () => 'Évolution', description: (y) => `Forage du Darwin Day, le 12 février ${y}`, icon: 'fossile' },
  'saint-valentin': { name: () => 'Cœur de pierre', description: (y) => `Forage de la Saint-Valentin ${y}`, icon: 'coeur', body: 'cupidon' },
  'bissextile': { name: () => 'Jour bissextile', description: (y) => `Forage du 29 février ${y}`, icon: 'calendrier-29' },
  'pi-day': { name: () => 'Forage π', description: (y) => `Forage du jour de π, le 14 mars ${y}`, icon: 'pi' },
  'poisson-avril': { name: () => "Poisson fossile", description: (y) => `Forage du 1er avril ${y}`, icon: 'poisson' },
  'jour-terre': { name: () => 'Jour de la Terre', description: (y) => `Forage du jour de la Terre, le 22 avril ${y}`, icon: 'globe', body: 'globe' },
  paques: { name: () => 'Œuf de dinosaure', description: (y) => `Forage du dimanche de Pâques ${y}`, icon: 'oeuf', body: 'oeuf' },
  'premier-mai': { name: () => 'Gueule noire', description: (y) => `Forage de la fête du Travail ${y}, en hommage aux mineurs`, icon: 'lampe-mineur' },
  'fierte': { name: () => 'Fierté', description: (y) => `Forage du 17 mai ${y}, journée mondiale contre l'homophobie, la transphobie et la biphobie`, icon: 'drapeau-fierte', body: 'fierte' },
  'fete-nationale': { name: () => 'Tricolore', description: (y) => `Forage du 21 juillet ${y}, fête nationale belge`, icon: 'drapeau', body: 'tricolore' },
  'mole-day': { name: () => 'Jour de la mole', description: (y) => `Forage du Mole Day (6,022 × 10²³), le 23 octobre ${y}`, icon: 'taupe', body: 'taupe' },
  halloween: { name: () => 'Citrouille diabolique', description: (y) => `Forage d'Halloween ${y}`, icon: 'citrouille', body: 'citrouille' },
  toussaint: { name: () => 'Feu follet', description: (y) => `Forage de la Toussaint ${y}`, icon: 'fantome', body: 'spectre' },
  armistice: { name: () => 'Coquelicot', description: (y) => `Forage du 11 novembre ${y}`, icon: 'coquelicot' },
  'sainte-barbe': { name: () => 'Protégé de sainte Barbe', description: (y) => `Forage du 4 décembre ${y}, fête de la patronne des mineurs`, icon: 'casque', body: 'casque' },
  'saint-nicolas': { name: () => 'Grand saint Nicolas', description: (y) => `Forage du 6 décembre ${y}`, icon: 'mitre', body: 'mitre' },
  noel: { name: () => 'Stalactite de Noël', description: (y) => `Forage du 25 décembre ${y}`, icon: 'sapin', body: 'noel' },
  'saint-sylvestre': { name: (y) => `Adieu ${y}`, description: (y) => `Dernier forage de l'année, le 31 décembre ${y}`, icon: 'horloge' },
  'vendredi-13': { name: () => 'Chat noir', description: () => 'Forage un vendredi 13', icon: 'chat', body: 'chat-noir' },
};

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus/Jones/Butcher). */
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const FIXED_DAYS = {
  '01-01': 'nouvel-an',
  '01-06': 'epiphanie',
  '02-12': 'darwin-day',
  '02-14': 'saint-valentin',
  '02-29': 'bissextile',
  '03-14': 'pi-day',
  '04-01': 'poisson-avril',
  '04-22': 'jour-terre',
  '05-01': 'premier-mai',
  '05-17': 'fierte',
  '07-21': 'fete-nationale',
  '10-23': 'mole-day',
  '10-31': 'halloween',
  '11-01': 'toussaint',
  '11-11': 'armistice',
  '12-04': 'sainte-barbe',
  '12-06': 'saint-nicolas',
  '12-25': 'noel',
  '12-31': 'saint-sylvestre',
};

/** Badges de calendrier associés au jour AAAA-MM-JJ. */
function calendarKinds(day) {
  const kinds = [];
  if (FIXED_DAYS[day.slice(5)]) kinds.push(FIXED_DAYS[day.slice(5)]);
  if (easter(Number(day.slice(0, 4))) === day) kinds.push('paques');
  if (day.endsWith('-13') && new Date(`${day}T12:00:00Z`).getUTCDay() === 5) kinds.push('vendredi-13');
  return kinds;
}

/** Année de la prochaine occurrence (aujourd'hui compris) d'un badge de calendrier. */
function nextYear(kind, today) {
  const year = Number(today.slice(0, 4));
  for (let y = year; y < year + 8; y++) {
    const md = Object.keys(FIXED_DAYS).find((k) => FIXED_DAYS[k] === kind);
    const day = md ? `${y}-${md}` : kind === 'paques' ? easter(y) : null;
    if (!day) return year;
    const real = new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day; // pas de 29 février fictif
    if (real && day >= today && calendarKinds(day).includes(kind)) return y;
  }
  return year;
}

// Catalogue : id → { category, name(instance), description(instance), icon, unlock }.
const CATALOG = new Map();
function define(id, def) {
  CATALOG.set(id, { id, ...def, name: typeof def.name === 'function' ? def.name : () => def.name });
}

define('premier-forage', { category: 'exploit', name: 'Premier coup de pioche', description: () => 'Terminer un premier forage du jour', icon: 'pioche' });
const STREAK_BODIES = { 3: 'acier', 7: 'cuivre', 30: 'emeraude', 100: 'obsidienne' };
STREAKS.forEach(([n, name]) => {
  define(`serie-${n}`, {
    category: 'serie',
    name,
    description: () => `Forer ${n} jours d'affilée`,
    icon: 'lampe',
    label: String(n),
    unlock: STREAK_BODIES[n] ? { type: 'body', id: STREAK_BODIES[n] } : null,
  });
});
const DEPTH_BITS = { 260: 'tariere', 500: 'tricone', 650: 'diamant', 700: 'carotteuse' };
DEPTHS.forEach(([n, name, description], i) => {
  define(`profondeur-${n}`, { category: 'profondeur', name, description: () => description, icon: `couche-${i + 1}`, unlock: { type: 'bit', id: DEPTH_BITS[n] } });
});
const PEPITE_BODIES = { 1: 'or', 10: 'diamant' };
PEPITES.forEach(([n, name, description]) => {
  define(`pepites-${n}`, {
    category: 'pepites',
    name,
    description: () => description,
    icon: 'pepite',
    label: String(n),
    unlock: PEPITE_BODIES[n] ? { type: 'body', id: PEPITE_BODIES[n] } : null,
  });
});
THEMES.forEach(([n, name]) => {
  define(`themes-${n}`, { category: 'themes', name, description: () => `Rencontrer ${n} thèmes, tous modes de jeu confondus`, icon: 'carotte', label: String(n) });
});
define('sans-eboulement', { category: 'exploit', name: 'Sans éboulement', description: () => 'Répondre aux 7 thèmes du jour, sans en passer aucun', icon: 'bouclier' });
define('diamantaire', { category: 'exploit', name: 'Diamantaire', description: () => 'Donner 7 réponses rares ou mieux (60 points ou plus) dans le même forage', icon: 'diamant' });
define('sentier-battu', { category: 'exploit', name: 'Sentier battu', description: () => 'Donner 7 réponses communes (moins de 40 points) dans le même forage', icon: 'sentier' });
define('autoroute', { category: 'exploit', name: 'Autoroute', description: () => 'Donner 7 réponses évidentes (moins de 20 points) dans le même forage', icon: 'autoroute' });
define('podium-jour', { category: 'podium', name: 'Chef de cordée', description: () => 'Finir 1er du podium du jour (au moins 3 joueurs)', icon: 'medaille', unlock: { type: 'body', id: 'cordee' } });
define('podium-semaine', { category: 'podium', name: "Chef d'expédition", description: () => 'Finir 1er du podium de la semaine (au moins 3 joueurs)', icon: 'trophee', unlock: { type: 'body', id: 'expedition' } });
define('podium-mois', { category: 'podium', name: 'Légende des profondeurs', description: () => 'Finir 1er du podium du mois (au moins 3 joueurs)', icon: 'couronne', unlock: { type: 'body', id: 'legende' } });
define('semaine-en-tete', { category: 'podium', name: 'Sept sur sept', description: () => 'Finir 1er du podium chaque jour d\'une même semaine, du lundi au dimanche (au moins 3 joueurs chaque jour)', icon: 'etoile-or' });
define('lanterne-rouge', { category: 'podium', name: 'Lanterne rouge', description: () => 'Finir dernier du podium chaque jour d\'une même semaine, du lundi au dimanche (au moins 3 joueurs chaque jour)', icon: 'lanterne' });
for (const [id, c] of Object.entries(CALENDAR)) {
  define(id, { category: 'calendrier', name: c.name, description: c.description, icon: c.icon, unlock: c.body ? { type: 'body', id: c.body } : null });
}

// Apparences de la foreuse. Celles qui ne sont débloquées par aucun badge sont disponibles d'emblée.
const BODIES = [
  ['classique', 'Classique'], ['acier', 'Acier'], ['cuivre', 'Cuivre'], ['emeraude', 'Émeraude'], ['obsidienne', 'Obsidienne'],
  ['or', 'Or massif'], ['diamant', 'Diamant'], ['cordee', 'Cordée'], ['expedition', 'Expédition'], ['legende', 'Légende'],
  ['feu-artifice', "Feu d'artifice"], ['cupidon', 'Cupidon'], ['globe', 'Planète bleue'], ['oeuf', 'Œuf de Pâques'],
  ['tricolore', 'Tricolore'], ['fierte', 'Arc-en-ciel'], ['taupe', 'Taupe'], ['citrouille', 'Citrouille diabolique'], ['spectre', 'Spectre'],
  ['casque', 'Casque de mineur'], ['mitre', 'Mitre'], ['noel', 'Noël'], ['chat-noir', 'Chat noir'],
];
const BITS = [['standard', 'Foret standard'], ['tariere', 'Tarière'], ['tricone', 'Tricône'], ['diamant', 'Couronne diamantée'], ['carotteuse', 'Carotteuse']];

const PODIUM_MIN_PLAYERS = 3;

class BadgeService {
  constructor(db, now) {
    this.db = db;
    this.now = now;
    this.podiumsCheckedOn = null;
  }

  /** Chaque badge ne se gagne qu'une fois : la première occasion est gardée. */
  give(userId, kind, instance, earnedOn) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO badges (user_id, kind, instance, earned_on, created_at)
         SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM badges WHERE user_id = ? AND kind = ?)`,
      )
      .run(userId, kind, String(instance), earnedOn, this.now(), userId, kind);
  }

  /** Jours (AAAA-MM-JJ, croissants) où le joueur a terminé son forage. */
  playedDays(userId) {
    return this.db
      .prepare("SELECT day FROM games WHERE user_id = ? AND mode = 'daily' AND finished_at IS NOT NULL ORDER BY day")
      .all(userId)
      .map((r) => r.day);
  }

  /** Série de jours consécutifs se terminant le jour `day`. */
  static streakEndingOn(days, day) {
    const set = new Set(days);
    let n = 0;
    for (let d = day; set.has(d); d = addDays(d, -1)) n++;
    return n;
  }

  static bestStreak(days) {
    let best = 0;
    let run = 0;
    let previous = null;
    for (const d of days) {
      run = previous && addDays(previous, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      previous = d;
    }
    return best;
  }

  /** Badges gagnés en terminant le forage quotidien `gameId`. */
  awardForGame(gameId) {
    const game = this.db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    if (!game || game.mode !== 'daily' || game.finished_at == null) return;
    const userId = game.user_id;
    const day = game.day;
    const rounds = this.db.prepare('SELECT outcome, points FROM rounds WHERE game_id = ?').all(gameId);

    this.give(userId, 'premier-forage', '1', day);
    const streak = BadgeService.streakEndingOn(this.playedDays(userId), day);
    STREAKS.forEach(([n]) => streak >= n && this.give(userId, `serie-${n}`, '1', day));
    DEPTHS.forEach(([n, , , threshold]) => game.score >= threshold && this.give(userId, `profondeur-${n}`, '1', day));
    const pepites = this.db
      .prepare("SELECT COUNT(*) AS n FROM rounds r JOIN games g ON g.id = r.game_id WHERE g.user_id = ? AND g.mode = 'daily' AND r.points >= 100")
      .get(userId).n;
    PEPITES.forEach(([n]) => pepites >= n && this.give(userId, `pepites-${n}`, '1', day));
    const answered = rounds.filter((r) => r.outcome === 'answer');
    if (answered.length === ROUNDS_PER_GAME) this.give(userId, 'sans-eboulement', day, day);
    if (answered.length === ROUNDS_PER_GAME && answered.every((r) => r.points >= 60)) this.give(userId, 'diamantaire', day, day);
    if (answered.length === ROUNDS_PER_GAME && answered.every((r) => r.points < 40)) this.give(userId, 'sentier-battu', day, day);
    if (answered.length === ROUNDS_PER_GAME && answered.every((r) => r.points < 20)) this.give(userId, 'autoroute', day, day);
    calendarKinds(day).forEach((kind) => this.give(userId, kind, day.slice(0, 4), day));
  }

  /** Nombre de thèmes rencontrés (forages du jour et mode illimité). */
  themesSeen(userId) {
    const daily = this.db
      .prepare("SELECT COUNT(*) AS n FROM rounds r JOIN games g ON g.id = r.game_id WHERE g.user_id = ? AND g.mode = 'daily' AND r.answered_at IS NOT NULL")
      .get(userId).n;
    const training = this.db.prepare('SELECT themes FROM training_stats WHERE user_id = ?').get(userId);
    return daily + (training ? training.themes : 0);
  }

  /** Badges des thèmes rencontrés, vérifiés après chaque thème terminé. */
  awardThemes(userId, today) {
    const seen = this.themesSeen(userId);
    THEMES.forEach(([n]) => seen >= n && this.give(userId, `themes-${n}`, '1', today));
  }

  /** Rattrape les badges des forages joués avant l'arrivée des badges (sans effet ensuite). */
  backfill() {
    // Badges gagnés plusieurs fois avant la règle « une seule fois » : on garde le premier.
    this.db.exec(`DELETE FROM badges WHERE rowid NOT IN (
      SELECT (SELECT b2.rowid FROM badges b2 WHERE b2.user_id = b.user_id AND b2.kind = b.kind ORDER BY b2.earned_on, b2.rowid LIMIT 1)
      FROM badges b GROUP BY b.user_id, b.kind)`);
    const ids = this.db.prepare("SELECT id FROM games WHERE mode = 'daily' AND finished_at IS NOT NULL ORDER BY day").all();
    for (const { id } of ids) this.awardForGame(id);
    const users = this.db.prepare('SELECT id FROM users').all();
    for (const { id } of users) this.awardThemes(id, new Date(this.now()).toISOString().slice(0, 10));
  }

  /**
   * Podiums des périodes terminées (jour, semaine, mois) : le ou les premiers reçoivent le badge.
   * Vérifié au plus une fois par jour ; rattrape les deux derniers mois.
   */
  awardPodiums(today) {
    if (this.podiumsCheckedOn === today) return;
    this.podiumsCheckedOn = today;
    const from = addMonths(today, -2);
    const games = this.db
      .prepare("SELECT user_id, day, score FROM games WHERE mode = 'daily' AND day >= ? AND day < ?")
      .all(from, today);
    const periods = [
      ['podium-jour', (d) => [d, d]],
      ['podium-semaine', (d) => [weekStart(d), addDays(weekStart(d), 6)]],
      ['podium-mois', (d) => [monthStart(d), monthEnd(d)]],
    ];
    for (const [kind, range] of periods) {
      const totals = new Map();
      for (const g of games) {
        const [start, end] = range(g.day);
        if (end >= today || start < from) continue;
        if (!totals.has(start)) totals.set(start, { end, scores: new Map() });
        const scores = totals.get(start).scores;
        scores.set(g.user_id, (scores.get(g.user_id) || 0) + g.score);
      }
      for (const [start, { end, scores }] of totals) {
        if (scores.size < PODIUM_MIN_PLAYERS) continue;
        const best = Math.max(...scores.values());
        for (const [userId, score] of scores) if (score === best) this.give(userId, kind, start, end);
      }
    }
    this.awardWeekStreaks(games, from, today);
  }

  /**
   * Semaines terminées (lundi à dimanche) où un joueur a fini premier, ou dernier, chaque jour.
   * Il faut au moins 3 joueurs chaque jour ; pour la dernière place, les scores ne doivent pas tous être égaux.
   */
  awardWeekStreaks(games, from, today) {
    const weeks = new Map();
    for (const g of games) {
      const start = weekStart(g.day);
      if (addDays(start, 6) >= today || start < from) continue;
      if (!weeks.has(start)) weeks.set(start, new Map());
      const days = weeks.get(start);
      if (!days.has(g.day)) days.set(g.day, new Map());
      days.get(g.day).set(g.user_id, g.score);
    }
    for (const [start, days] of weeks) {
      if (days.size < 7) continue;
      const rows = [...days.values()];
      if (rows.some((scores) => scores.size < PODIUM_MIN_PLAYERS)) continue;
      const end = addDays(start, 6);
      for (const userId of rows[0].keys()) {
        if (!rows.every((scores) => scores.has(userId))) continue;
        if (rows.every((scores) => scores.get(userId) === Math.max(...scores.values()))) this.give(userId, 'semaine-en-tete', start, end);
        if (rows.every((scores) => scores.get(userId) === Math.min(...scores.values()) && Math.min(...scores.values()) < Math.max(...scores.values()))) {
          this.give(userId, 'lanterne-rouge', start, end);
        }
      }
    }
  }

  /** Carnet du joueur : statistiques, badges (obtenus ou à gagner) et apparences débloquées. */
  profile(userId, today) {
    this.awardPodiums(today);
    const days = this.playedDays(userId);
    const rows = this.db
      .prepare('SELECT kind, instance, earned_on, seen_at FROM badges WHERE user_id = ? ORDER BY earned_on, kind')
      .all(userId);
    const earned = new Map();
    for (const r of rows) {
      if (!CATALOG.has(r.kind)) continue;
      if (!earned.has(r.kind)) earned.set(r.kind, []);
      earned.get(r.kind).push(r);
    }
    const badges = [...CATALOG.values()].map((def) => {
      const got = earned.get(def.id) || [];
      const last = got[got.length - 1];
      const instance = def.category === 'calendrier' ? (last ? last.instance : nextYear(def.id, today)) : last && last.instance;
      return {
        id: def.id,
        category: def.category,
        name: def.name(instance),
        description: def.description(instance),
        icon: def.icon,
        label: def.label || null,
        count: got.length,
        firstOn: got.length ? got[0].earned_on : null,
        lastOn: last ? last.earned_on : null,
        years: def.category === 'calendrier' ? got.map((g) => g.instance) : null,
        isNew: got.some((g) => g.seen_at == null),
        unlock: def.unlock || null,
      };
    });
    const unlocked = new Set();
    badges.forEach((b) => b.count && b.unlock && unlocked.add(`${b.unlock.type}:${b.unlock.id}`));
    const hintFor = (type, id) => {
      const badge = badges.find((b) => b.unlock && b.unlock.type === type && b.unlock.id === id);
      return badge ? `Badge « ${badge.name} » : ${badge.description}` : null;
    };
    const skinList = (list, type) =>
      list.map(([id, name]) => {
        const hint = hintFor(type, id);
        return { id, name, unlocked: !hint || unlocked.has(`${type}:${id}`), hint };
      });
    const user = this.db.prepare('SELECT skin_body, skin_bit FROM users WHERE id = ?').get(userId);
    const pepites = this.db
      .prepare("SELECT COUNT(*) AS n FROM rounds r JOIN games g ON g.id = r.game_id WHERE g.user_id = ? AND g.mode = 'daily' AND r.points >= 100")
      .get(userId).n;
    const bestScore = this.db.prepare("SELECT MAX(score) AS s FROM games WHERE user_id = ? AND mode = 'daily'").get(userId).s || 0;
    const current = Math.max(BadgeService.streakEndingOn(days, today), BadgeService.streakEndingOn(days, addDays(today, -1)));
    return {
      stats: { currentStreak: current, bestStreak: BadgeService.bestStreak(days), daysPlayed: days.length, pepites, bestScore },
      badges,
      bodies: skinList(BODIES, 'body'),
      bits: skinList(BITS, 'bit'),
      skin: this.skinOf(user),
    };
  }

  skinOf(user) {
    return { body: (user && user.skin_body) || 'classique', bit: (user && user.skin_bit) || 'standard' };
  }

  markSeen(userId) {
    this.db.prepare('UPDATE badges SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL').run(this.now(), userId);
  }

  /** Change l'apparence de la foreuse, si elle est débloquée. Renvoie false sinon. */
  setSkin(userId, today, { body, bit }) {
    const profile = this.profile(userId, today);
    const ok = (list, id) => list.some((s) => s.id === id && s.unlocked);
    if (!ok(profile.bodies, body) || !ok(profile.bits, bit)) return false;
    this.db.prepare('UPDATE users SET skin_body = ?, skin_bit = ? WHERE id = ?').run(body, bit, userId);
    return true;
  }

  unseenCount(userId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM badges WHERE user_id = ? AND seen_at IS NULL').get(userId).n;
  }
}

module.exports = { BadgeService, CATALOG, calendarKinds, easter, STREAKS };
