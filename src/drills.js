'use strict';
/**
 * Foreuses 16-bit (refonte) : chaque joueur compose sa foreuse dans l'Atelier, soit à partir de trois pièces
 * (carrosserie, blindage, foret), soit en choisissant un modèle de fête ou de série tout fait.
 * Dessins : public/drills16.js. Ici, seulement la liste des pièces et ce qui les débloque.
 *
 * Choix stocké dans users.drill16 : « style/blindage/foret » ou l'identifiant d'un modèle.
 * Sans choix, la foreuse 16-bit est déduite de l'ancienne foreuse pixel art (skin_body, skin_bit) :
 * le joueur garde ce qu'il avait gagné, en version 16-bit.
 */

// [id, nom, badges qui débloquent (un seul suffit ; liste vide = offert)]
const STYLES = [
  ['chantier', 'Chantier', []],
  ['bathyscaphe', 'Bathyscaphe', ['serie-3']],
  ['vapeur', 'Vapeur', ['serie-7']],
  ['geode', 'Géode', ['serie-30']],
  ['forge', 'Fournaise', ['serie-100']],
  ['prospecteur', 'Prospecteur', ['pepites-1']],
  ['neon', 'Néon', ['pepites-10']],
  ['char', 'Char', ['annihilation', 'coup-de-boutoir']],
];
const ARMORS = [
  ['aucun', 'Aucun', []],
  ['plaques', 'Plaques rivetées', []],
  ['lourd', 'Blindage lourd', ['imprenable', 'muraille-de-troie', 'attaquant-15', 'defenseur-15']],
  ['pointes', 'Hérisson', ['invaincu', 'rival']],
  ['ecailles', 'Carapace', ['sentinelle-6', 'nemesis']],
];
const BITS = [
  ['spirale', 'Spirale', []],
  ['tariere', 'Tarière', ['profondeur-260']],
  ['tricone', 'Tricône', ['profondeur-500']],
  ['couronne', 'Couronne diamant', ['profondeur-650']],
  ['carotteuse', 'Carotteuse', ['profondeur-700']],
  ['tambour', 'Tambour', ['podium-jour', 'podium-semaine', 'podium-mois']],
  ['fraise', 'Fraise à dents', ['attaquant-5', 'defenseur-5']],
  ['double', 'Double foret', ['souffre-douleur', 'remontada']],
  ['plasma', 'Plasma', ['duel-parfait']],
];
// Modèles de fête et de série : carrosserie, blindage et foret d'un seul tenant, avec un effet animé.
const MODELS = [
  ['chaudron', 'Chaudron', ['halloween']],
  ['citrouille', 'Citrouille', ['halloween', 'cranes-complet']],
  ['noel', 'Père Noël', ['noel']],
  ['sapin', 'Sapin', ['noel']],
  ['cupidon', 'Cupidon', ['saint-valentin']],
  ['nicolas', 'Grand Saint', ['saint-nicolas']],
  ['paques', 'Lapin', ['paques']],
  ['nouvelan', 'Minuit', ['nouvel-an']],
  ['gille', 'Gille', ['mardi-gras']],
  ['pi', 'Pi', ['pi-day']],
  ['poisson', 'Poisson', ['poisson-avril']],
  ['gateau', 'Gâteau', ['anniversaire']],
  ['chevalier', 'Chevalier', ['attaquant-15', 'defenseur-15']],
  ['pirate', 'Pirate', ['filon']],
  ['pionnier', 'Pionnier', ['sainte-barbe', 'mole-day']],
  ['horloger', 'Horloger', ['serie-14', 'lanterne-rallumee']],
];

const DEFAULT = 'chantier/aucun/spirale';

// Ancienne foreuse pixel art → pièces 16-bit débloquées par les mêmes badges.
const FROM_BODY = {
  acier: { style: 'bathyscaphe' }, cuivre: { style: 'vapeur' }, emeraude: { style: 'geode' }, obsidienne: { style: 'forge' },
  or: { style: 'prospecteur' }, diamant: { style: 'neon' }, tank: { style: 'char' }, belier: { style: 'char' },
  pierre: { armor: 'lourd' }, 'muraille-de-troie': { armor: 'lourd' }, gladiateur: { armor: 'lourd' }, rempart: { armor: 'lourd' },
  'blinde-arme': { armor: 'pointes' }, catapulte: { armor: 'pointes' }, drakkar: { armor: 'ecailles' }, nemesis: { armor: 'ecailles' },
  citrouille: { model: 'citrouille' }, 'jack-o-lantern': { model: 'citrouille' }, cupidon: { model: 'cupidon' }, noel: { model: 'noel' },
  mitre: { model: 'nicolas' }, oeuf: { model: 'paques' }, 'feu-artifice': { model: 'nouvelan' }, casque: { model: 'pionnier' }, taupe: { model: 'pionnier' },
};
const FROM_BIT = { tariere: 'tariere', tricone: 'tricone', diamant: 'couronne', carotteuse: 'carotteuse', epee: 'fraise', hache: 'fraise', trident: 'double', rapiere: 'double', excalibur: 'plasma' };

/** Foreuse 16-bit tirée de l'ancienne foreuse (joueur qui n'est pas encore passé à l'Atelier). */
function fromSkin(body, bit) {
  const b = FROM_BODY[body] || {};
  if (b.model) return b.model;
  return `${b.style || 'chantier'}/${b.armor || 'aucun'}/${FROM_BIT[bit] || 'spirale'}`;
}

const has = (list, id) => list.some(([x]) => x === id);

/** Valeur stockée ou proposée → { model } ou { style, armor, bit }, ou null si elle n'existe pas. */
function parse(value) {
  if (typeof value !== 'string') return null;
  if (has(MODELS, value)) return { model: value };
  const [style, armor, bit, extra] = value.split('/');
  if (extra !== undefined || !has(STYLES, style) || !has(ARMORS, armor) || !has(BITS, bit)) return null;
  return { style, armor, bit };
}

/** Foreuse 16-bit d'un joueur (ligne users avec drill16, skin_body, skin_bit). */
function drillOf(user) {
  if (user && parse(user.drill16)) return user.drill16;
  return fromSkin(user && user.skin_body, user && user.skin_bit);
}

/**
 * Catalogue de l'Atelier pour un joueur : badges = liste du profil ({ id, name, description, count }).
 * Chaque pièce : { id, name, unlocked, hint }.
 */
function catalog(badges) {
  const byId = new Map(badges.map((b) => [b.id, b]));
  const entry = ([id, name, need]) => {
    const known = need.map((k) => byId.get(k)).filter(Boolean);
    const unlocked = !need.length || known.some((b) => b.count > 0);
    const hint = unlocked || !known.length ? null : known.length === 1 ? `Badge « ${known[0].name} » : ${known[0].description}` : `Un de ces badges : ${known.map((b) => `« ${b.name} » (${b.description})`).join(' ou ')}`;
    return { id, name, unlocked, hint };
  };
  return { styles: STYLES.map(entry), armors: ARMORS.map(entry), bits: BITS.map(entry), models: MODELS.map(entry) };
}

/** La foreuse proposée est-elle entièrement débloquée ? */
function allowed(value, cat) {
  const p = parse(value);
  if (!p) return false;
  const ok = (list, id) => list.some((x) => x.id === id && x.unlocked);
  return p.model ? ok(cat.models, p.model) : ok(cat.styles, p.style) && ok(cat.armors, p.armor) && ok(cat.bits, p.bit);
}

module.exports = { STYLES, ARMORS, BITS, MODELS, DEFAULT, fromSkin, parse, drillOf, catalog, allowed };
