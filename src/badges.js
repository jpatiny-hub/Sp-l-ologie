'use strict';

const { addDays, weekStart, monthStart, monthEnd, addMonths } = require('./dates');
const { ROUNDS_PER_GAME, TIMER_SECONDS, FREEZE_FROM } = require('./config');
const { challengeProgress } = require('./challenges');
const Avatar = require('./avatar');
const Titles = require('./titles');
const Drills = require('./drills');

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

// Forages d'entraînement (mode illimité) terminés.
const TRAINING = [
  [10, 'Premiers essais'],
  [50, "Habitué du terrain d'essai"],
  [200, 'Marathonien du forage'],
];

// Duels : lancés, relevés, adversaires variés. Les duels « à l'aise » (sans chrono) comptent ; seuls les exploits (invaincu,
// duel parfait, remontada) demandent un duel standard.
const ATTAQUANT = [[1, 'Attaquant'], [5, 'Attaquant aguerri'], [15, 'Gladiateur']];
const DEFENSEUR = [[1, 'Défenseur'], [5, 'Défenseur aguerri'], [15, 'Rempart']];
const DIPLOMATE = [[3, 'Diplomate'], [6, 'Grand diplomate']];
const SENTINELLE = [[3, 'Sentinelle'], [6, 'Garde de la mine']];

// Réactions reçues et données dans le comparatif.
const PUBLIC = [[10, 'Public conquis'], [50, 'Star de la mine']];
const SUPPORTER = [[20, 'Supporter'], [100, 'Meilleur fan']];

// Défis de la semaine réussis.
const DEFIS = [
  [1, 'Défi relevé'],
  [5, 'Habitué des défis'],
  [15, 'Maître des défis'],
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
  'journee-livre': { name: () => 'Livre de roche', description: (y) => `Forage de la journée mondiale du livre, le 23 avril ${y}`, icon: 'livre' },
  'star-wars': { name: () => 'Que la Force soit avec toi', description: (y) => `Forage du 4 mai ${y} (May the 4th)`, icon: 'sabre' },
  'fete-musique': { name: () => 'Concert souterrain', description: (y) => `Forage de la fête de la musique, le 21 juin ${y}`, icon: 'note' },
  'mardi-gras': { name: () => 'Gille de Binche', description: (y) => `Forage du Mardi gras ${y}`, icon: 'feu-artifice' },
  anniversaire: { name: () => 'Joyeux anniversaire', description: (y) => `Forage le jour de ton anniversaire ${y}`, icon: 'feu-artifice' },
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

/** Jour AAAA-MM-JJ décalé de n jours. */
function shiftDay(day, n) {
  return new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
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
  '04-23': 'journee-livre',
  '05-01': 'premier-mai',
  '05-04': 'star-wars',
  '05-17': 'fierte',
  '06-21': 'fete-musique',
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
  if (shiftDay(easter(Number(day.slice(0, 4))), -47) === day) kinds.push('mardi-gras');
  if (day.endsWith('-13') && new Date(`${day}T12:00:00Z`).getUTCDay() === 5) kinds.push('vendredi-13');
  return kinds;
}

/** Année de la prochaine occurrence (aujourd'hui compris) d'un badge de calendrier. */
function nextYear(kind, today) {
  const year = Number(today.slice(0, 4));
  for (let y = year; y < year + 8; y++) {
    const md = Object.keys(FIXED_DAYS).find((k) => FIXED_DAYS[k] === kind);
    const day = md ? `${y}-${md}` : kind === 'paques' ? easter(y) : kind === 'mardi-gras' ? shiftDay(easter(y), -47) : null;
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
const STREAK_TIMERS = { 14: 'lanterne' };
STREAKS.forEach(([n, name]) => {
  define(`serie-${n}`, {
    category: 'serie',
    name,
    description: () => `Forer ${n} jours d'affilée`,
    icon: 'lampe',
    label: String(n),
    unlock: STREAK_BODIES[n] ? { type: 'body', id: STREAK_BODIES[n] } : STREAK_TIMERS[n] ? { type: 'timer', id: STREAK_TIMERS[n] } : null,
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
TRAINING.forEach(([n, name]) => {
  define(`entrainement-${n}`, { category: 'entrainement', name, description: () => `Terminer ${n} forages en mode illimité`, icon: 'cible', label: String(n), unlock: n === 50 ? { type: 'timer', id: 'wagonnet' } : null });
});
DEFIS.forEach(([n, name]) => {
  define(`defi-${n}`, { category: 'defi', name, description: () => (n === 1 ? 'Réussir un défi de la semaine' : `Réussir ${n} défis de la semaine`), icon: 'fanion', label: n > 1 ? String(n) : null });
});
// Victoires écrasantes en duel (écart de points et manches gagnées sur 7) et égalités ; l'attaque lance le duel, la défense le relève.
const CRUSH = [
  { tier: 1, margin: 120, rounds: 5 },
  { tier: 2, margin: 200, rounds: 6 },
];
const CRUSH_BADGES = {
  attack: [['coup-de-boutoir', 'Coup de boutoir', 'belier', 'belier'], ['annihilation', 'Annihilation', 'explosion', 'tank']],
  defense: [['imprenable', 'Imprenable', 'muraille', 'pierre'], ['muraille-de-troie', 'Muraille de Troie', 'cheval', 'muraille-de-troie']],
};
const DRAW_BADGES = [
  ['freres-d-armes', "Frères d'armes", 'Terminer un duel sur une égalité', 'coeur', null],
  ['match-miroir', 'Match miroir', 'Terminer 3 duels sur une égalité', 'miroir', null],
  ['jumeaux', 'Jumeaux', "Égalité parfaite en duel : exactement les mêmes points sur chacun des 7 thèmes", 'jumeaux', 'jumeaux'],
];
for (const [camp, list] of Object.entries(CRUSH_BADGES)) {
  list.forEach(([id, name, icon, body], i) => {
    const { margin, rounds } = CRUSH[i];
    const how = camp === 'attack' ? 'Gagner un duel que tu as lancé' : 'Gagner un duel que tu as relevé';
    define(id, { category: 'duel', name, description: () => `${how}, avec au moins ${margin} points d'avance et ${rounds} thèmes gagnés sur 7`, icon, unlock: { type: 'body', id: body } });
  });
}
DRAW_BADGES.forEach(([id, name, description, icon, body]) => {
  define(id, { category: 'duel', name, description: () => description, icon, unlock: body ? { type: 'body', id: body } : null });
});
// Foreuses que `profile(…, false)` masque encore (interrupteur de sécurité ; tout le monde les voit par défaut).
const BETA_BODIES = new Set(['blinde-arme', 'catapulte', 'drakkar']);
const BETA_BITS = new Set(['epee', 'rapiere', 'hache', 'trident', 'excalibur']);

// Foreuses (carrosseries et forets) gagnées en duel.
const DUEL_UNLOCKS = {
  'attaquant-5': { type: 'bit', id: 'epee' },
  'attaquant-15': { type: 'body', id: 'gladiateur' },
  'defenseur-5': { type: 'bit', id: 'hache' },
  'defenseur-15': { type: 'body', id: 'rempart' },
  'sentinelle-6': { type: 'body', id: 'drakkar' },
};
ATTAQUANT.forEach(([n, name]) => {
  define(`attaquant-${n}`, { category: 'duel', name, description: () => (n === 1 ? 'Lancer et terminer un premier duel' : `Lancer et terminer ${n} duels`), icon: 'sabre', label: n > 1 ? String(n) : null, unlock: DUEL_UNLOCKS[`attaquant-${n}`] || null });
});
DEFENSEUR.forEach(([n, name]) => {
  define(`defenseur-${n}`, { category: 'duel', name, description: () => (n === 1 ? 'Relever et terminer un premier duel' : `Relever et terminer ${n} duels`), icon: 'bouclier', label: n > 1 ? String(n) : null, unlock: DUEL_UNLOCKS[`defenseur-${n}`] || null });
});
DIPLOMATE.forEach(([n, name]) => {
  define(`diplomate-${n}`, { category: 'duel', name, description: () => `Défier ${n} joueurs différents`, icon: 'drapeau', label: String(n) });
});
SENTINELLE.forEach(([n, name]) => {
  define(`sentinelle-${n}`, { category: 'duel', name, description: () => `Relever le défi de ${n} joueurs différents`, icon: 'oeil', label: String(n), unlock: DUEL_UNLOCKS[`sentinelle-${n}`] || null });
});
define('pensees-jumelles', { category: 'duel', name: 'Pensées jumelles', description: () => 'Trouver, à deux, la même pépite dans un duel', icon: 'jumeaux', secret: true });
define('rival', { category: 'duel', name: 'Rival', description: () => 'Terminer 5 duels contre le même joueur', icon: 'cible', label: '5', unlock: { type: 'body', id: 'catapulte' } });
define('souffre-douleur', { category: 'duel', name: 'Souffre-douleur', description: () => 'Battre 3 fois le même joueur en duel', icon: 'taupe', label: '3', unlock: { type: 'bit', id: 'trident' } });
define('nemesis', { category: 'duel', name: 'Némésis', description: () => 'Perdre 3 fois contre le même joueur en duel : il est ta némésis', icon: 'fantome', label: '3', unlock: { type: 'body', id: 'nemesis' } });
define('invaincu', { category: 'duel', name: 'Invaincu', description: () => 'Gagner 5 duels standard d\'affilée', icon: 'trophee', label: '5', unlock: { type: 'body', id: 'blinde-arme' } });
define('duel-parfait', { category: 'duel', name: 'Duel parfait', description: () => 'Gagner les 7 thèmes d\'un duel standard', icon: 'etoile-or', label: '7', unlock: { type: 'bit', id: 'excalibur' } });
define('remontada', { category: 'duel', name: 'Remontada', description: () => 'Gagner un duel standard après avoir perdu les 3 premiers thèmes', icon: 'eclair', unlock: { type: 'bit', id: 'rapiere' } });
PUBLIC.forEach(([n, name]) => {
  define(`public-${n}`, { category: 'reactions', name, description: () => `Recevoir ${n} réactions à tes réponses dans le comparatif`, icon: n >= 50 ? 'etoile-or' : 'coeur', label: String(n), unlock: n === 50 ? { type: 'body', id: 'ovation' } : null });
});
SUPPORTER.forEach(([n, name]) => {
  define(`supporter-${n}`, { category: 'reactions', name, description: () => `Donner ${n} réactions aux réponses des autres joueurs`, icon: n >= 100 ? 'medaille' : 'fanion', label: String(n), unlock: n === 100 ? { type: 'body', id: 'claque' } : null });
});
define('lanterne-rallumee', { category: 'serie', name: 'Lanterne rallumée', description: () => "Reprendre le forage après avoir perdu une série d'au moins 7 jours", icon: 'lanterne-mineur', unlock: { type: 'timer', id: 'lanterne' } });
define('mois-complet', { category: 'serie', name: 'Mois complet', description: () => 'Forer tous les jours d\'un même mois, du premier au dernier', icon: 'calendrier-plein', unlock: { type: 'timer', id: 'wagonnet' } });
define('filon', { category: 'pepites', name: 'Filon', description: () => 'Trouver 2 pépites dans le même forage', icon: 'pepite', label: '2', unlock: { type: 'timer', id: 'meche' } });
define('jackpot', { category: 'pepites', name: 'Jackpot', description: () => 'Trouver 7 pépites dans le même forage', icon: 'diamant', label: '7' });
define('in-extremis', { category: 'exploit', name: 'In extremis', description: () => 'Donner une réponse valide dans la toute dernière seconde du chrono', icon: 'sablier', unlock: { type: 'timer', id: 'meche' } });
define('eclair', { category: 'exploit', name: 'Éclair', description: () => 'Donner une réponse valide en moins de 3 secondes', icon: 'eclair' });
define('oeil-de-lynx', { category: 'exploit', name: 'Œil de lynx', description: () => 'Faire valider une réponse que tu avais signalée', icon: 'oeil' });
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

define('cranes-25', { category: 'calendrier', name: 'Collectionneur de crânes', description: () => "Réunir 25 crânes pendant un jour de collection (Halloween)", icon: 'crane', label: '25' });
define('cranes-complet', { category: 'calendrier', name: 'Ossuaire complet', description: () => "Réunir les cinq qualités de crâne (os, jauni, bronze, rubis, or) pendant un jour de collection", icon: 'crane', unlock: { type: 'body', id: 'jack-o-lantern' } });

// Apparences de la foreuse. Celles qui ne sont débloquées par aucun badge sont disponibles d'emblée.
const BODIES = [
  ['classique', 'Classique'], ['acier', 'Acier'], ['cuivre', 'Cuivre'], ['emeraude', 'Émeraude'], ['obsidienne', 'Obsidienne'],
  ['or', 'Or massif'], ['diamant', 'Diamant'], ['cordee', 'Cordée'], ['expedition', 'Expédition'], ['legende', 'Légende'],
  ['feu-artifice', "Feu d'artifice"], ['cupidon', 'Cupidon'], ['globe', 'Planète bleue'], ['oeuf', 'Œuf de Pâques'],
  ['tricolore', 'Tricolore'], ['fierte', 'Arc-en-ciel'], ['taupe', 'Taupe'], ['citrouille', 'Citrouille diabolique'], ['jack-o-lantern', "Jack-o'-lantern"], ['spectre', 'Spectre'],
  ['casque', 'Casque de mineur'], ['mitre', 'Mitre'], ['noel', 'Noël'], ['chat-noir', 'Chat noir'],
  ['gladiateur', 'Gladiateur'], ['rempart', 'Rempart'], ['belier', 'Bélier'], ['tank', 'Blindé'], ['blinde-arme', 'Blindage armé'], ['drakkar', 'Drakkar'], ['catapulte', 'Catapulte'], ['pierre', 'Pierre'], ['muraille-de-troie', 'Muraille de Troie'], ['jumeaux', 'Jumeaux'], ['nemesis', 'Némésis'], ['ovation', 'Ovation'], ['claque', 'Claque'],
];
// Apparences du décompte du chrono : la batterie de lampe est offerte, les autres se débloquent avec des badges.
const TIMERS = [['batterie', 'Batterie de lampe'], ['meche', 'Mèche de dynamite'], ['wagonnet', 'Wagonnet'], ['lanterne', 'Lanterne']];
const BITS = [['standard', 'Foret standard'], ['tariere', 'Tarière'], ['tricone', 'Tricône'], ['diamant', 'Couronne diamantée'], ['carotteuse', 'Carotteuse'], ['epee', 'Épée'], ['rapiere', 'Rapière'], ['hache', 'Hache de guerre'], ['trident', 'Trident'], ['excalibur', 'Excalibur']];

const PODIUM_MIN_PLAYERS = 3;

// Jours forés qui donnent un nouveau titre de mineur (voir le profil).
const TITLE_STEPS = [1, 5, 10, 30, 100, 200, 300];

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

  /**
   * Série avec « étais de galerie » (gels de série) : un étai est gagné à chaque tranche de 7 jours forés d'affilée
   * (3 au maximum) et pardonne automatiquement un jour manqué. Seuls les jours manqués à partir de FREEZE_FROM
   * peuvent être pardonnés : l'histoire d'avant n'est pas réécrite.
   * Renvoie { current, best, freezes (disponibles maintenant), pending (étais qui seront utilisés), alive, frozen (jours pardonnés) }.
   */
  static streakInfo(days, today, from = FREEZE_FROM) {
    const between = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
    let streak = 0;
    let best = 0;
    let freezes = 0;
    let prev = null;
    const frozen = [];
    for (const d of days) {
      if (d > today) break;
      if (prev === null) streak = 1;
      else {
        const missed = between(prev, d) - 1;
        if (missed === 0) streak++;
        else if (addDays(prev, 1) >= from && missed <= freezes) {
          freezes -= missed;
          for (let k = 0; k < missed; k++) frozen.push(addDays(prev, 1 + k));
          streak++;
        } else streak = 1;
      }
      if (streak % 7 === 0) freezes = Math.min(3, freezes + 1);
      best = Math.max(best, streak);
      prev = d;
    }
    if (prev === null) return { current: 0, best: 0, freezes: 0, pending: 0, alive: false, frozen };
    const missedNow = Math.max(0, between(prev, today) - 1);
    const alive = missedNow === 0 || (addDays(prev, 1) >= from && missedNow <= freezes);
    return {
      current: alive ? streak : 0,
      best,
      freezes: alive ? freezes - missedNow : freezes,
      pending: alive ? missedNow : 0,
      alive,
      frozen,
    };
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

  /** Pépites du joueur : forages du jour, et duels terminés (le secret d'un duel tient jusqu'à la fin des deux parties). */
  pepiteCount(userId) {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM rounds r JOIN games g ON g.id = r.game_id
         WHERE g.user_id = ? AND r.points >= 100
           AND (g.mode = 'daily' OR (g.mode = 'duel' AND EXISTS (
             SELECT 1 FROM duels d WHERE d.status = 'done' AND d.validated_at IS NOT NULL AND (d.challenger_game_id = g.id OR d.opponent_game_id = g.id))))`,
      )
      .get(userId).n;
  }

  /** Badges gagnés en terminant le forage quotidien `gameId`. */
  awardForGame(gameId) {
    const game = this.db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    if (!game || game.mode !== 'daily' || game.finished_at == null) return;
    const userId = game.user_id;
    const day = game.day;
    const rounds = this.db.prepare('SELECT outcome, points FROM rounds WHERE game_id = ?').all(gameId);

    this.give(userId, 'premier-forage', '1', day);
    const streak = BadgeService.streakInfo(this.playedDays(userId), day).current;
    STREAKS.forEach(([n]) => streak >= n && this.give(userId, `serie-${n}`, '1', day));
    DEPTHS.forEach(([n, , , threshold]) => game.score >= threshold && this.give(userId, `profondeur-${n}`, '1', day));
    const pepites = this.pepiteCount(userId);
    PEPITES.forEach(([n]) => pepites >= n && this.give(userId, `pepites-${n}`, '1', day));
    const answered = rounds.filter((r) => r.outcome === 'answer');
    if (answered.length === ROUNDS_PER_GAME) this.give(userId, 'sans-eboulement', day, day);
    if (answered.length === ROUNDS_PER_GAME && answered.every((r) => r.points >= 60)) this.give(userId, 'diamantaire', day, day);
    if (answered.length === ROUNDS_PER_GAME && answered.every((r) => r.points < 40)) this.give(userId, 'sentier-battu', day, day);
    if (answered.length === ROUNDS_PER_GAME && answered.every((r) => r.points < 20)) this.give(userId, 'autoroute', day, day);
    calendarKinds(day).forEach((kind) => this.give(userId, kind, day.slice(0, 4), day));
    const born = this.db.prepare('SELECT birthday FROM users WHERE id = ?').get(userId);
    if (born && born.birthday === day.slice(5)) this.give(userId, 'anniversaire', day.slice(0, 4), day);

    const pepitesNow = rounds.filter((r) => r.points >= 100).length;
    if (pepitesNow >= 2) this.give(userId, 'filon', day, day);
    if (pepitesNow >= ROUNDS_PER_GAME) this.give(userId, 'jackpot', day, day);

    // Vitesse : réponses valides réellement saisies (une réponse accordée après coup par le responsable ne compte pas).
    const timed = this.db
      .prepare(
        `SELECT r.served_at, r.answered_at FROM rounds r
         WHERE r.game_id = ? AND r.outcome = 'answer' AND r.served_at IS NOT NULL AND r.answered_at IS NOT NULL AND r.credited = 0
           AND NOT EXISTS (SELECT 1 FROM answer_reports a WHERE a.game_id = r.game_id AND a.slot = r.slot AND a.credit = 'credited')`,
      )
      .all(gameId);
    const limit = TIMER_SECONDS * 1000;
    if (timed.some((r) => r.answered_at - r.served_at >= limit - 1000)) this.give(userId, 'in-extremis', day, day);
    if (timed.some((r) => r.answered_at - r.served_at < 3000)) this.give(userId, 'eclair', day, day);

    // Série reprise après une série d'au moins 7 jours perdue.
    const runs = BadgeService.runs(this.playedDays(userId));
    const current = runs.find((r) => r.end >= day && r.start <= day);
    if (current && runs.some((r) => r.end < current.start && r.length >= 7)) this.give(userId, 'lanterne-rallumee', day, day);

    // Mois complet : le dernier jour du mois, tous les jours du mois ont été forés.
    if (day === monthEnd(day)) {
      const played = new Set(this.playedDays(userId));
      let all = true;
      for (let d = monthStart(day); d <= day; d = addDays(d, 1)) if (!played.has(d)) all = false;
      if (all) this.give(userId, 'mois-complet', day.slice(0, 7), day);
    }

    // Défis de la semaine réussis.
    const done = this.completedChallenges(userId);
    DEFIS.forEach(([n]) => done >= n && this.give(userId, `defi-${n}`, day, day));
  }

  /** Séries de jours consécutifs : [{ start, end, length }] dans l'ordre. */
  static runs(days) {
    const out = [];
    for (const d of days) {
      const last = out[out.length - 1];
      if (last && addDays(last.end, 1) === d) {
        last.end = d;
        last.length++;
      } else out.push({ start: d, end: d, length: 1 });
    }
    return out;
  }

  /** Nombre de semaines dont le défi a été réussi. */
  completedChallenges(userId) {
    const weeks = new Set(this.playedDays(userId).map((d) => weekStart(d)));
    let n = 0;
    for (const w of weeks) if (challengeProgress(this.db, userId, w).done) n++;
    return n;
  }

  /** Nombre de thèmes rencontrés (forages du jour et mode illimité). */
  themesSeen(userId) {
    const daily = this.db
      .prepare("SELECT COUNT(*) AS n FROM rounds r JOIN games g ON g.id = r.game_id WHERE g.user_id = ? AND g.mode = 'daily' AND r.answered_at IS NOT NULL")
      .get(userId).n;
    const training = this.db.prepare('SELECT themes FROM training_stats WHERE user_id = ?').get(userId);
    return daily + (training ? training.themes : 0);
  }

  /**
   * Résumé pour l'accueil : série en cours (et si elle est encore à sauver aujourd'hui) et badge le plus proche.
   * Seuls comptent les badges de série, de thèmes rencontrés et de pépites, qui ont un compteur à faire monter.
   */
  homeSummary(userId, today) {
    const days = this.playedDays(userId);
    const playedToday = days.includes(today);
    const info = BadgeService.streakInfo(days, today);
    const current = info.current;
    const owned = new Set(this.db.prepare('SELECT kind FROM badges WHERE user_id = ?').all(userId).map((r) => r.kind));
    const candidates = [];
    const consider = (kinds, progress, unit) => {
      if (progress <= 0) return;
      const next = kinds.find(([n]) => progress < n && !owned.has(kinds.prefix + n));
      if (!next) return;
      const id = kinds.prefix + next[0];
      if (owned.has(id)) return;
      candidates.push({ id, name: CATALOG.get(id).name(), icon: CATALOG.get(id).icon, category: CATALOG.get(id).category, label: CATALOG.get(id).label || null, remaining: next[0] - progress, ratio: (next[0] - progress) / next[0], unit });
    };
    const withPrefix = (list, prefix) => Object.assign(list.slice(), { prefix });
    const pepites = this.pepiteCount(userId);
    consider(withPrefix(STREAKS, 'serie-'), current, ['jour', 'jours']);
    consider(withPrefix(THEMES, 'themes-'), this.themesSeen(userId), ['thème', 'thèmes']);
    consider(withPrefix(PEPITES, 'pepites-'), pepites, ['pépite', 'pépites']);
    const trainingGames = this.db.prepare('SELECT games FROM training_stats WHERE user_id = ?').get(userId);
    consider(withPrefix(TRAINING, 'entrainement-'), trainingGames ? trainingGames.games : 0, ['forage illimité', 'forages illimités']);
    candidates.sort((a, b) => a.ratio - b.ratio || a.remaining - b.remaining);
    const next = candidates[0] || null;
    const start = weekStart(today);
    const challenge = { ...challengeProgress(this.db, userId, start), daysLeft: 7 - Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) };
    challenge.unit = challenge.unit[challenge.goal > 1 ? 1 : 0];
    return { current, playedToday, freezes: info.freezes, pendingFreezes: info.pending, frozenRecently: info.frozen.filter((d) => d >= addDays(today, -3)), challenge, nexts: candidates.slice(0, 3).map((n) => ({ id: n.id, name: n.name, icon: n.icon, category: n.category, label: n.label, remaining: n.remaining, unit: n.remaining > 1 ? n.unit[1] : n.unit[0] })), next: next && { id: next.id, name: next.name, icon: next.icon, category: next.category, label: next.label, remaining: next.remaining, unit: next.remaining > 1 ? next.unit[1] : next.unit[0] } };
  }

  /** Badges des thèmes rencontrés, vérifiés après chaque thème terminé. */
  awardThemes(userId, today) {
    const seen = this.themesSeen(userId);
    THEMES.forEach(([n]) => seen >= n && this.give(userId, `themes-${n}`, '1', today));
    const training = this.db.prepare('SELECT games FROM training_stats WHERE user_id = ?').get(userId);
    TRAINING.forEach(([n]) => training && training.games >= n && this.give(userId, `entrainement-${n}`, '1', today));
  }

  /** Badges de réactions : celles que le joueur a données et celles que ses réponses ont reçues. */
  awardReactions(userId, today) {
    const given = this.db.prepare('SELECT COUNT(*) AS n FROM reactions WHERE reactor_id = ?').get(userId).n;
    const received = this.db
      .prepare('SELECT COUNT(*) AS n FROM reactions rx JOIN games g ON g.id = rx.game_id WHERE g.user_id = ?')
      .get(userId).n;
    SUPPORTER.forEach(([n]) => given >= n && this.give(userId, `supporter-${n}`, '1', today));
    PUBLIC.forEach(([n]) => received >= n && this.give(userId, `public-${n}`, '1', today));
  }

  /** Badges de duel, vérifiés quand un duel se termine (pour chacun des deux joueurs). */
  awardDuels(userId, today) {
    const give = (kind) => this.give(userId, kind, '1', today);
    const pepites = this.pepiteCount(userId);
    PEPITES.forEach(([n]) => pepites >= n && give(`pepites-${n}`));
    const launched = this.db
      .prepare(
        `SELECT d.opponent_id AS other FROM duels d JOIN games g ON g.id = d.challenger_game_id
         WHERE d.challenger_id = ? AND g.finished_at IS NOT NULL AND d.status IN ('open', 'done')`,
      )
      .all(userId);
    ATTAQUANT.forEach(([n]) => launched.length >= n && give(`attaquant-${n}`));
    DIPLOMATE.forEach(([n]) => new Set(launched.map((r) => r.other)).size >= n && give(`diplomate-${n}`));
    const done = this.db
      .prepare("SELECT * FROM duels WHERE status = 'done' AND validated_at IS NOT NULL AND (challenger_id = ? OR opponent_id = ?) ORDER BY finished_at, id")
      .all(userId, userId);
    const defended = done.filter((d) => d.opponent_id === userId);
    DEFENSEUR.forEach(([n]) => defended.length >= n && give(`defenseur-${n}`));
    SENTINELLE.forEach(([n]) => new Set(defended.map((d) => d.challenger_id)).size >= n && give(`sentinelle-${n}`));
    // Rapports avec un même adversaire.
    const per = new Map();
    for (const d of done) {
      const other = d.challenger_id === userId ? d.opponent_id : d.challenger_id;
      if (!per.has(other)) per.set(other, { n: 0, wins: 0, losses: 0 });
      const p = per.get(other);
      p.n++;
      if (d.winner_id === userId) p.wins++;
      else if (d.winner_id === other) p.losses++;
    }
    for (const p of per.values()) {
      if (p.n >= 5) give('rival');
      if (p.wins >= 3) give('souffre-douleur');
      if (p.losses >= 3) give('nemesis');
    }
    // Badge secret : les deux joueurs d'un duel ont trouvé la même pépite (même réponse, 100 points ou plus chacun).
    for (const d of done) {
      if (d.challenger_game_id == null || d.opponent_game_id == null) continue;
      const twin = this.db
        .prepare(
          `SELECT 1 FROM rounds a JOIN rounds b ON a.slot = b.slot AND a.answer_key = b.answer_key
           WHERE a.game_id = ? AND b.game_id = ? AND a.outcome = 'answer' AND b.outcome = 'answer' AND a.points >= 100 AND b.points >= 100 LIMIT 1`,
        )
        .get(d.challenger_game_id, d.opponent_game_id);
      if (twin) give('pensees-jumelles');
    }
    // Exploits : seulement en duel standard.
    const standard = done.filter((d) => d.mode === 'standard');
    let streak = 0;
    for (const d of standard) {
      streak = d.winner_id === userId ? streak + 1 : 0;
      if (streak >= 5) give('invaincu');
    }
    const pointsOf = (gameId) => this.db.prepare('SELECT slot, points FROM rounds WHERE game_id = ? ORDER BY slot').all(gameId).map((r) => r.points || 0);
    // Victoires écrasantes (tous modes) et égalités.
    const sides = (d) => {
      const attack = d.challenger_id === userId;
      return { attack, mine: pointsOf(attack ? d.challenger_game_id : d.opponent_game_id), theirs: pointsOf(attack ? d.opponent_game_id : d.challenger_game_id) };
    };
    let draws = 0;
    for (const d of done) {
      const { attack, mine, theirs } = sides(d);
      if (mine.length !== ROUNDS_PER_GAME || theirs.length !== ROUNDS_PER_GAME) continue;
      if (d.winner_id === userId) {
        const margin = (attack ? d.challenger_score - d.opponent_score : d.opponent_score - d.challenger_score);
        const won = mine.filter((p, i) => p > theirs[i]).length;
        CRUSH.forEach((c, i) => margin >= c.margin && won >= c.rounds && give(CRUSH_BADGES[attack ? 'attack' : 'defense'][i][0]));
      } else if (d.winner_id == null) {
        draws++;
        give('freres-d-armes');
        if (mine.some((p) => p > 0) && mine.every((p, i) => p === theirs[i])) give('jumeaux');
      }
    }
    if (draws >= 3) give('match-miroir');
    for (const d of standard.filter((x) => x.winner_id === userId)) {
      const mine = pointsOf(d.challenger_id === userId ? d.challenger_game_id : d.opponent_game_id);
      const theirs = pointsOf(d.challenger_id === userId ? d.opponent_game_id : d.challenger_game_id);
      if (mine.length === ROUNDS_PER_GAME && mine.every((p, i) => p > theirs[i])) give('duel-parfait');
      if (mine.length >= 3 && [0, 1, 2].every((i) => mine[i] < theirs[i])) give('remontada');
    }
  }

  /** Badge « Œil de lynx » : une réponse signalée par le joueur a été validée par le responsable. */
  awardLynx(userId, day) {
    this.give(userId, 'oeil-de-lynx', '1', day);
  }

  /** Rattrape les badges des forages joués avant l'arrivée des badges (sans effet ensuite). */
  backfill() {
    // Badges gagnés plusieurs fois avant la règle « une seule fois » : on garde le premier.
    this.db.exec(`DELETE FROM badges WHERE rowid NOT IN (
      SELECT (SELECT b2.rowid FROM badges b2 WHERE b2.user_id = b.user_id AND b2.kind = b.kind ORDER BY b2.earned_on, b2.rowid LIMIT 1)
      FROM badges b GROUP BY b.user_id, b.kind)`);
    const ids = this.db.prepare("SELECT id FROM games WHERE mode = 'daily' AND finished_at IS NOT NULL ORDER BY day").all();
    for (const { id } of ids) this.awardForGame(id);
    const users = this.db.prepare('SELECT id FROM users WHERE is_system = 0').all();
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
  profile(userId, today, beta = true, refonte = true) {
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
    // Les badges secrets n'apparaissent nulle part tant qu'ils ne sont pas débloqués.
    const badges = [...CATALOG.values()].filter((def) => !def.secret || earned.has(def.id)).map((def) => {
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
    // Une apparence peut être débloquée par plusieurs badges (le premier obtenu suffit).
    const hintFor = (type, id) => {
      const list = badges.filter((b) => b.unlock && b.unlock.type === type && b.unlock.id === id);
      if (!list.length) return null;
      return list.length === 1 ? `Badge « ${list[0].name} » : ${list[0].description}` : `Un de ces badges : ${list.map((b) => `« ${b.name} » (${b.description})`).join(' ou ')}`;
    };
    const skinList = (list, type) =>
      list.map(([id, name]) => {
        const hint = hintFor(type, id);
        return { id, name, unlocked: !hint || unlocked.has(`${type}:${id}`), hint };
      });
    const user = this.db.prepare('SELECT skin_body, skin_bit, skin_timer, drill16, avatar, title, created_at, birthday FROM users WHERE id = ?').get(userId);
    const pepites = this.pepiteCount(userId);
    const bestScore = this.db.prepare("SELECT MAX(score) AS s FROM games WHERE user_id = ? AND mode = 'daily'").get(userId).s || 0;
    const info = BadgeService.streakInfo(days, today);
    const current = info.current;
    return {
      stats: {
        currentStreak: current,
        bestStreak: info.best,
        freezes: info.freezes,
        daysPlayed: days.length,
        pepites,
        bestScore,
        // Jour où chaque titre de mineur a été atteint (1er, 5e, 10e… jour foré).
        titleDays: Object.fromEntries(TITLE_STEPS.filter((n) => days.length >= n).map((n) => [n, days[n - 1]])),
      },
      badges,
      bodies: skinList(BODIES, 'body').filter((s) => beta || !BETA_BODIES.has(s.id)),
      bits: skinList(BITS, 'bit').filter((s) => beta || !BETA_BITS.has(s.id)),
      timers: skinList(TIMERS, 'timer'),
      skin: this.skinOf(user),
      drill16: Drills.drillOf(user),
      drillCatalog: Drills.catalog(badges),
      avatar: Avatar.normalize(user && user.avatar, userId),
      birthday: (user && user.birthday) || null,
      avatarCatalog: Avatar.catalog(badges.concat(this.anniversaries(user, today)), beta, refonte),
      title: beta && user && Titles.labelOf(user.title) ? user.title : null,
      titles: beta ? Titles.catalog(badges, days.length) : [],
    };
  }

  /** Choisit le titre affiché à côté du pseudo (ou aucun avec `null`). Renvoie false si le titre n'est pas débloqué. */
  setTitle(userId, today, id, beta = true) {
    if (id !== null) {
      if (!beta) return false;
      const profile = this.profile(userId, today, beta);
      if (!Titles.isUnlocked(id, profile.badges, profile.stats.daysPlayed)) return false;
    }
    this.db.prepare('UPDATE users SET title = ? WHERE id = ?').run(id, userId);
    return true;
  }

  /**
   * Badges virtuels d'ancienneté (1, 2 et 3 ans d'inscription), uniquement pour débloquer des cosmétiques d'avatar :
   * ils n'apparaissent ni dans la vitrine ni dans la liste des badges.
   */
  anniversaries(user, today) {
    const joined = user && Number(user.created_at);
    const years = joined ? (Date.parse(`${today}T12:00:00Z`) - joined) / (365.25 * 86400000) : 0;
    return [1, 2, 3].map((n) => ({
      id: `annee-${n}`,
      name: `${n} an${n > 1 ? 's' : ''} dans la mine`,
      description: `Être inscrit depuis ${n} an${n > 1 ? 's' : ''}`,
      count: years >= n ? 1 : 0,
    }));
  }

  /**
   * Remise à zéro unique des avatars à la refonte : chaque avatar enregistré est copié dans `avatar_backup`, puis effacé
   * (le joueur retrouve le personnage standard). Ne touche ni à la foreuse, ni aux titres, ni aux badges. Une seule fois :
   * renvoie null si elle a déjà eu lieu.
   */
  resetAvatars() {
    const done = this.db.prepare("SELECT value FROM settings WHERE key = 'avatars_reset_at'").get();
    if (done) return null;
    const now = this.now();
    this.db.exec('BEGIN');
    try {
      const copied = this.db.prepare('INSERT OR REPLACE INTO avatar_backup (user_id, avatar, saved_at) SELECT id, avatar, ? FROM users WHERE avatar IS NOT NULL').run(now).changes;
      this.db.prepare('UPDATE users SET avatar = NULL WHERE avatar IS NOT NULL').run();
      this.db.prepare("INSERT INTO settings (key, value) VALUES ('avatars_reset_at', ?)").run(String(now));
      this.db.exec('COMMIT');
      return Number(copied);
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Enregistre l'anniversaire (« MM-JJ ») ou l'efface avec `null`. Renvoie false si la date n'existe pas. */
  setBirthday(userId, value) {
    if (value !== null) {
      const m = /^(\d\d)-(\d\d)$/.exec(String(value));
      if (!m) return false;
      const real = new Date(`2024-${value}T12:00:00Z`); // 2024 est bissextile : le 29 février reste possible
      if (Number.isNaN(real.getTime()) || real.toISOString().slice(5, 10) !== value) return false;
    }
    this.db.prepare('UPDATE users SET birthday = ? WHERE id = ?').run(value, userId);
    return true;
  }

  /** Enregistre l'avatar du joueur s'il ne contient que des éléments débloqués. Renvoie l'avatar, ou null. */
  setAvatar(userId, today, candidate, beta = true, refonte = true) {
    const user = this.db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId);
    const clean = Avatar.validate(candidate, userId, this.profile(userId, today, beta, refonte).badges.concat(this.anniversaries(user, today)), beta, refonte);
    if (!clean) return null;
    this.db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(JSON.stringify(clean), userId);
    return clean;
  }

  skinOf(user) {
    return { body: (user && user.skin_body) || 'classique', bit: (user && user.skin_bit) || 'standard', timer: (user && user.skin_timer) || 'batterie' };
  }

  markSeen(userId) {
    this.db.prepare('UPDATE badges SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL').run(this.now(), userId);
  }

  /** Change l'apparence de la foreuse, si elle est débloquée. Renvoie false sinon. */
  setSkin(userId, today, { body, bit, timer }, beta = true) {
    const profile = this.profile(userId, today, beta);
    const ok = (list, id) => list.some((s) => s.id === id && s.unlocked);
    const chosenTimer = timer === undefined ? profile.skin.timer : timer;
    if (!ok(profile.bodies, body) || !ok(profile.bits, bit) || !ok(profile.timers, chosenTimer)) return false;
    this.db.prepare('UPDATE users SET skin_body = ?, skin_bit = ?, skin_timer = ? WHERE id = ?').run(body, bit, chosenTimer, userId);
    return true;
  }

  /** Foreuse 16-bit choisie dans l'Atelier (« style/blindage/foret » ou modèle). Renvoie false si une pièce n'est pas débloquée. */
  setDrill16(userId, today, value) {
    const profile = this.profile(userId, today);
    if (!Drills.allowed(value, profile.drillCatalog)) return false;
    this.db.prepare('UPDATE users SET drill16 = ? WHERE id = ?').run(value, userId);
    return true;
  }

  unseenCount(userId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM badges WHERE user_id = ? AND seen_at IS NULL').get(userId).n;
  }
}

module.exports = { BadgeService, CATALOG, calendarKinds, easter, STREAKS, BODIES, BITS };
