'use strict';

/*
 * Défi du mois en groupe : douze galeries, une par mois du calendrier, chacune menant à un filon de pierres précieuses.
 * Chaque galerie a sa pierre, son ambiance (couleurs du décor, lac d'eau, de glace ou de lave) et ses récompenses :
 * une carrosserie de foreuse « <Pierre> », une aura et un titre pour les joueurs qui ont foré 10 jours du mois
 * quand le groupe a atteint le filon.
 * Les couleurs sont envoyées au navigateur avec l'état du défi (`public/defis16.js` les utilise telles quelles).
 */

// Première galerie : novembre 2026. Avant, c'est l'ancien défi (10 000 points).
const FIRST_MONTH = '2026-11';
// Jours à forer dans le mois pour toucher les récompenses de la galerie.
const MIN_DAYS = 10;
// Joueur actif : au moins 4 jours de forage le mois précédent. Jamais moins de 4 joueurs pour fixer l'objectif.
const ACTIVE_DAYS = 4;
const MIN_PLAYERS = 4;
// Joueurs actifs comptés au minimum pour certains mois (décision du responsable : novembre 2026 = 10 joueurs, soit 45 000 points).
const MIN_PLAYERS_BY_MONTH = { '2026-11': 10 };

// Objectifs par joueur actif et nature du défi (tirée à tour de rôle, voir CYCLE).
const KINDS = {
  points: { per: 4500, unit: ['point', 'points'], title: (g) => `Creusons ensemble ${g} points avant la fin du mois.`, done: 'Le filon est atteint, bravo à tous !', note: 'Chaque point de chacun fait avancer la foreuse vers le filon.' },
  pepites: { per: 3, unit: ['pépite', 'pépites'], title: (g) => `Trouvons ensemble ${g} pépites avant la fin du mois.`, done: 'Le filon est atteint, bravo à tous !', note: 'Chaque pépite (100 points ou plus) fait avancer la foreuse vers le filon.' },
  rubis: { per: 12, unit: ['réponse', 'réponses'], title: (g) => `Donnons ensemble ${g} réponses Rubis ou mieux avant la fin du mois.`, done: 'Le filon est atteint, bravo à tous !', note: 'Chaque réponse de 60 points ou plus fait avancer la foreuse vers le filon.' },
  reponses: { per: 90, unit: ['réponse', 'réponses'], title: (g) => `Donnons ensemble ${g} réponses valides avant la fin du mois.`, done: 'Le filon est atteint, bravo à tous !', note: 'Chaque réponse valide, même facile, fait avancer la foreuse vers le filon.' },
  jours: { per: 16, unit: ['jour de forage', 'jours de forage'], title: (g) => `Cumulons ensemble ${g} jours de forage avant la fin du mois.`, done: 'Le filon est atteint, bravo à tous !', note: 'Chaque forage du jour, quel que soit son score, fait avancer la foreuse vers le filon.' },
};
// Nature du défi selon le mois (1 = janvier).
const CYCLE = { 11: 'points', 12: 'reponses', 1: 'jours', 2: 'rubis', 3: 'points', 4: 'pepites', 5: 'reponses', 6: 'jours', 7: 'rubis', 8: 'points', 9: 'pepites', 10: 'reponses' };

// [fond de la galerie ×4, roche ×5] et couleurs d'ambiance ; `gem` = pierre du filon (ombre → reflet), `deco` = quatre palettes de cristaux.
const pal = (a, b, c, d) => [a, b, c, d];
const GEMS = {
  11: { id: 'emeraude', name: 'émeraudes', one: 'Émeraude', gallery: 'Galerie des fougères', gem: pal('#05381c', '#118a45', '#4ade80', '#d4ffe4'), deco: [pal('#0a4a3a', '#1fa07a', '#5effc0', '#d8ffee'), pal('#05381c', '#118a45', '#4ade80', '#d4ffe4'), pal('#0e3a5a', '#1e86b0', '#5ee0ff', '#d8fbff'), pal('#6a3a06', '#c8801c', '#ffc24a', '#fff0b8')], water: ['#7ae8ff', '#3fb3e8', '#1e76b0', '#123f6b'], wall: ['#06121a', '#0b2228', '#11382f', '#184a3a'], rock: ['#15110f', '#201a16', '#2a2419', '#363023', '#463e2d'], glow: '#4effb0', trait: 'les fougères lumineuses' },
  12: { id: 'saphir', name: 'saphirs', one: 'Saphir', gallery: 'Galerie de givre', gem: pal('#0a1e5a', '#1e50c8', '#5a90ff', '#d8e8ff'), deco: [pal('#1e86b0', '#8fd0f0', '#d8fbff', '#ffffff'), pal('#0e3a5a', '#1e86b0', '#5ee0ff', '#d8fbff'), pal('#0a1e5a', '#1e50c8', '#5a90ff', '#d8e8ff'), pal('#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff')], water: ['#ffffff', '#d8f4ff', '#a8dcf4', '#6ab0d8'], wall: ['#08101e', '#0e1c34', '#16284a', '#20386a'], rock: ['#12141a', '#1a1e28', '#262c3a', '#343c50', '#465068'], glow: '#9fd8ff', trait: 'la glace et le givre' },
  1: { id: 'topaze', name: 'topazes', one: 'Topaze', gallery: 'Galerie des braises', gem: pal('#6a3a06', '#c8801c', '#ffc24a', '#fff0b8'), deco: [pal('#6a3a06', '#c8801c', '#ffc24a', '#fff0b8'), pal('#5a1e06', '#e87a20', '#ffc060', '#fff3c0'), pal('#6a0a14', '#d02e22', '#ff6a4a', '#ffd0c0'), pal('#4a2a08', '#a8741a', '#e8c850', '#fffbd0')], water: ['#fff3a0', '#ffc060', '#e87a20', '#a84410'], wall: ['#140a08', '#241410', '#38201a', '#502c20'], rock: ['#1a110d', '#281a14', '#3a251b', '#4e3224', '#664230'], glow: '#ff9a40', trait: 'la lave et les braises' },
  2: { id: 'rubis', name: 'rubis', one: 'Rubis', gallery: 'Galerie des cœurs', gem: pal('#4a0a14', '#a8142a', '#ff4a64', '#ffd0d8'), deco: [pal('#4a0a14', '#a8142a', '#ff4a64', '#ffd0d8'), pal('#6a1a4a', '#d03a8a', '#ff8ad0', '#ffe0f0'), pal('#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff'), pal('#6a3a06', '#c8801c', '#ffc24a', '#fff0b8')], water: ['#ffd0e0', '#ff8ab0', '#d03a6a', '#7a1a3a'], wall: ['#14080e', '#22101a', '#341a28', '#4a2438'], rock: ['#1a1012', '#281a1e', '#3a252a', '#4e3239', '#664450'], glow: '#ff6a8a', trait: 'les rubis et les roses de pierre' },
  3: { id: 'peridot', name: 'péridots', one: 'Péridot', gallery: 'Galerie des prés', gem: pal('#1a4a05', '#5aa010', '#a8ee3a', '#eaffc0'), deco: [pal('#1a4a05', '#5aa010', '#a8ee3a', '#eaffc0'), pal('#6a6a06', '#c8c01c', '#f4ee4a', '#fffbc0'), pal('#0a4a3a', '#1fa07a', '#5effc0', '#d8ffee'), pal('#6a1a4a', '#d03a8a', '#ff8ad0', '#ffe0f0')], water: ['#d8ffc0', '#8ae860', '#3fae2e', '#1a6a1a'], wall: ['#08140a', '#102412', '#1a381c', '#264e26'], rock: ['#13140d', '#1d2014', '#2a2e1c', '#384028', '#4a5636'], glow: '#a8ee3a', trait: 'l\'herbe et les fleurs sauvages' },
  4: { id: 'opale', name: 'opales', one: 'Opale', gallery: 'Galerie arc-en-ciel', gem: pal('#4a3a8a', '#e0a8e8', '#a8f0e0', '#ffffff'), deco: [pal('#6a1a4a', '#d03a8a', '#ff8ad0', '#ffe0f0'), pal('#0a4a3a', '#1fa07a', '#5effc0', '#d8ffee'), pal('#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff'), pal('#6a3a06', '#c8801c', '#ffc24a', '#fff0b8')], water: ['#ffe0ff', '#c8a0ff', '#80c8ff', '#60e0c0'], wall: ['#0c0a1a', '#161230', '#221c4a', '#302a68'], rock: ['#14121a', '#1e1a26', '#2c2638', '#3c344e', '#504866'], glow: '#d8a8ff', trait: 'toutes les couleurs à la fois' },
  5: { id: 'aigue-marine', name: 'aigues-marines', one: 'Aigue-marine', gallery: 'Galerie des sources', gem: pal('#0a4a5a', '#2aa8b8', '#7ae8e8', '#e0ffff'), deco: [pal('#0a4a5a', '#2aa8b8', '#7ae8e8', '#e0ffff'), pal('#0e3a5a', '#1e86b0', '#5ee0ff', '#d8fbff'), pal('#0a4a3a', '#1fa07a', '#5effc0', '#d8ffee'), pal('#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff')], water: ['#e0ffff', '#7ae8e8', '#2aa8b8', '#0e5a6a'], wall: ['#061418', '#0a2630', '#103c4a', '#185468'], rock: ['#101416', '#181e22', '#222c32', '#303c44', '#42525c'], glow: '#7ae8e8', trait: 'l\'eau claire des sources' },
  6: { id: 'amethyste', name: 'améthystes', one: 'Améthyste', gallery: 'Galerie violette', gem: pal('#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff'), deco: [pal('#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff'), pal('#6a1a4a', '#d03a8a', '#ff8ad0', '#ffe0f0'), pal('#0e3a5a', '#1e86b0', '#5ee0ff', '#d8fbff'), pal('#4a2a8c', '#8a6cff', '#b8a0ff', '#ece0ff')], water: ['#f3e0ff', '#c79bff', '#7a32b0', '#3a1a6a'], wall: ['#0c0818', '#160e2c', '#221646', '#30205e'], rock: ['#15111a', '#201a28', '#2e2438', '#3e3250', '#52446a'], glow: '#c79bff', trait: 'les géodes d\'améthyste' },
  7: { id: 'citrine', name: 'citrines', one: 'Citrine', gallery: 'Galerie du soleil', gem: pal('#7a4a06', '#d8921c', '#ffd04a', '#fff6c0'), deco: [pal('#7a4a06', '#d8921c', '#ffd04a', '#fff6c0'), pal('#6a3a06', '#c8801c', '#ffc24a', '#fff0b8'), pal('#6a6a06', '#c8c01c', '#f4ee4a', '#fffbc0'), pal('#6a1a14', '#d85a22', '#ff9a4a', '#ffe0c0')], water: ['#fff6c0', '#ffd04a', '#d8921c', '#7a4a06'], wall: ['#141008', '#241c10', '#382a18', '#503c22'], rock: ['#1a1510', '#28201a', '#3a2e22', '#4e3e2e', '#68523c'], glow: '#ffd04a', trait: 'la lumière du soleil' },
  8: { id: 'tourmaline', name: 'tourmalines', one: 'Tourmaline', gallery: 'Galerie du prisme', gem: pal('#0a4a2a', '#d83a8a', '#5aeaa0', '#ffe0f0'), deco: [pal('#0a4a2a', '#2cb868', '#5aeaa0', '#d4ffe4'), pal('#6a1a4a', '#d83a8a', '#ff8ad0', '#ffe0f0'), pal('#0e3a5a', '#1e86b0', '#5ee0ff', '#d8fbff'), pal('#6a3a06', '#c8801c', '#ffc24a', '#fff0b8')], water: ['#ffe0f0', '#ff8ad0', '#5aeaa0', '#118a45'], wall: ['#0a1014', '#14202a', '#22303c', '#34445a'], rock: ['#121415', '#1a1e20', '#262c2e', '#343c40', '#465256'], glow: '#ff8ad0', trait: 'des cristaux roses et verts' },
  9: { id: 'grenat', name: 'grenats', one: 'Grenat', gallery: 'Galerie des vendanges', gem: pal('#3a0a10', '#8a1a24', '#d8383c', '#ffc0b8'), deco: [pal('#3a0a10', '#8a1a24', '#d8383c', '#ffc0b8'), pal('#6a3a06', '#c8801c', '#ffc24a', '#fff0b8'), pal('#5a1e06', '#e87a20', '#ffc060', '#fff3c0'), pal('#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff')], water: ['#ffc0b8', '#d8383c', '#8a1a24', '#3a0a10'], wall: ['#120808', '#201010', '#341a18', '#4a2622'], rock: ['#1a110f', '#281a16', '#3a261f', '#4e342a', '#66463a'], glow: '#ff6a5a', trait: 'les couleurs de l\'automne' },
  10: { id: 'onyx', name: 'onyx', one: 'Onyx', gallery: 'Galerie des ombres', gem: pal('#08080e', '#2a2a44', '#6a6a9a', '#e8e8ff'), deco: [pal('#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff'), pal('#5a1e06', '#e87a20', '#ffc060', '#fff3c0'), pal('#08080e', '#2a2a44', '#6a6a9a', '#e8e8ff'), pal('#0a4a3a', '#1fa07a', '#5effc0', '#d8ffee')], water: ['#e8e8ff', '#6a6a9a', '#2a2a44', '#08080e'], wall: ['#05050a', '#0c0c16', '#14142a', '#1e1e3c'], rock: ['#0f0e12', '#17151c', '#201e28', '#2c2a38', '#3c3a4e'], glow: '#b48cff', trait: 'les ombres et les lueurs oranges' },
};

// Les douze pierres dans l'ordre des galeries : de novembre 2026 à octobre 2027.
const LIST = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => GEMS[m]);

/** Numéro de mois (1 à 12) d'un jour AAAA-MM-JJ ou d'un mois AAAA-MM. */
const monthNumber = (day) => Number(day.slice(5, 7));
const gemOf = (day) => GEMS[monthNumber(day)];
const kindOf = (day) => CYCLE[monthNumber(day)];
/** Les galeries sont en service à partir de novembre 2026. */
const galleryOn = (day) => day.slice(0, 7) >= FIRST_MONTH;
const niceGoal = (v) => {
  if (v < 20) return Math.max(1, Math.ceil(v));
  const step = v < 200 ? 5 : v < 2000 ? 10 : v < 20000 ? 50 : 100;
  return Math.round(v / step) * step;
};

module.exports = { MIN_PLAYERS_BY_MONTH, GEMS, LIST, CYCLE, KINDS, FIRST_MONTH, MIN_DAYS, ACTIVE_DAYS, MIN_PLAYERS, gemOf, kindOf, galleryOn, niceGoal, monthNumber };
