'use strict';

const Gems = require('./gems');

/*
 * Titres de mineur : une étiquette que le joueur choisit d'afficher à côté de son pseudo (récapitulatifs, classements).
 * Chaque titre se gagne en forant un nombre de jours (titres de rang) ou grâce à un badge (un des badges listés suffit).
 */
const RANK_TITLES = [
  ['apprenti-foreur', 'Apprenti foreur', 1],
  ['mineur-confirme', 'Mineur confirmé', 5],
  ['mineur-de-fond', 'Mineur de fond', 10],
  ['maitre-foreur', 'Maître foreur', 30],
  ['gardien-du-noyau', 'Gardien du noyau', 100],
  ['seigneur-des-galeries', 'Seigneur des galeries', 200],
  ['legende-de-la-mine', 'Légende de la mine', 300],
];

// [identifiant, libellé, badges (un seul suffit)]
const BADGE_TITLES = [
  // Pépites et exploits
  ['chercheur-d-or', "Chercheur d'or", ['pepites-1']],
  ['orpailleur', 'Orpailleur', ['pepites-10']],
  ['roi-des-pepites', 'Roi des pépites', ['pepites-50']],
  ['le-veinard', 'Le Veinard', ['jackpot']],
  ['diamantaire', 'Diamantaire', ['diamantaire']],
  ['funambule', 'Funambule', ['in-extremis']],
  ['infaillible', 'Infaillible', ['sans-eboulement']],
  ['oeil-de-lynx', 'Œil de lynx', ['oeil-de-lynx']],
  ['eclair', 'Éclair de génie', ['eclair']],
  // Séries et profondeur
  ['assidu', 'Assidu', ['serie-7']],
  ['increvable', 'Increvable', ['serie-30']],
  ['eternel', 'Éternel de la mine', ['serie-100']],
  ['explorateur-du-manteau', 'Explorateur du manteau', ['profondeur-500']],
  ['aventurier-du-noyau', 'Aventurier du noyau', ['profondeur-700']],
  // Podiums
  ['champion-du-jour', 'Champion du jour', ['podium-jour']],
  ['champion-de-la-semaine', 'Champion de la semaine', ['podium-semaine']],
  ['maitre-du-mois', 'Maître du mois', ['podium-mois']],
  ['lanterne-rouge', 'Lanterne rouge', ['lanterne-rouge']],
  // Duels
  ['duelliste', 'Duelliste', ['attaquant-5']],
  ['gladiateur', 'Gladiateur', ['attaquant-15']],
  ['rempart', 'Rempart', ['defenseur-15']],
  ['grand-diplomate', 'Grand diplomate', ['diplomate-6']],
  ['invaincu', 'Invaincu', ['invaincu']],
  ['lame-parfaite', 'Lame parfaite', ['duel-parfait']],
  ['roi-de-la-remontada', 'Roi de la remontada', ['remontada']],
  ['cauchemar-des-rivaux', 'Cauchemar de ses rivaux', ['souffre-douleur']],
  ['victime-attitree', 'Victime attitrée', ['nemesis']],
  // Défis, entraînement, thèmes, public
  ['chercheur-de-diamants', 'Chercheur de diamants', ['defi-1']],
  ['maitre-du-filon', 'Maître du filon', ['defi-10']],
  ['releve-defis', 'Relève-défis', ['defi-5']],
  ['maitre-des-defis', 'Maître des défis', ['defi-15']],
  ['rat-d-entrainement', "Rat d'entraînement", ['entrainement-200']],
  ['encyclopediste', 'Encyclopédiste', ['themes-1000']],
  ['star-de-la-mine', 'Star de la mine', ['public-50']],
  ['meilleur-fan', 'Meilleur fan', ['supporter-100']],
  // Jours particuliers
  ['maitre-citrouille', 'Maître citrouille', ['halloween']],
  ['lutin-de-la-mine', 'Lutin de la mine', ['noel']],
  ['reveillonneur', 'Réveillonneur', ['nouvel-an']],
  ['coeur-de-mineur', 'Cœur de mineur', ['saint-valentin']],
  ['chasseur-d-oeufs', "Chasseur d'œufs", ['paques']],
  ['porte-malheur', 'Porte-malheur', ['vendredi-13']],
];

// Titres des galeries du mois (un par pierre) et des badges secrets par thématique.
const SECRET_TITLES = {
  nature: 'Le Naturaliste', cuisine: 'Fin gourmet', cinema: 'Rat de cinéma', musique: "Oreille d'or", geo: 'Globe-trotteur', science: 'Esprit curieux', sport: 'Champion de la mine', 'touche-a-tout': 'Esprit universel',
};
Object.entries(SECRET_TITLES).forEach(([cat, label]) => BADGE_TITLES.push([`cat-${cat}`, label, [`cat-${cat}`]]));
Gems.LIST.forEach((g) => BADGE_TITLES.push([`filon-${g.id}`, `Chercheur ${/^[aeiouyéèêàâ]/i.test(g.name) ? "d'" : 'de '}${g.name}`, [`filon-${g.id}`]]));

const TITLES = [
  ...RANK_TITLES.map(([id, label, days]) => ({ id, label, days, badges: null })),
  ...BADGE_TITLES.map(([id, label, badges]) => ({ id, label, days: null, badges })),
];
const BY_ID = new Map(TITLES.map((t) => [t.id, t]));

const labelOf = (id) => (BY_ID.has(id) ? BY_ID.get(id).label : null);

/**
 * Catalogue du joueur : chaque titre avec son état (débloqué ou non) et, sinon, comment l'obtenir.
 * `badges` : badges du profil (avec leur nom) ; `days` : jours forés.
 */
function catalog(badges, days) {
  const byId = new Map(badges.map((b) => [b.id, b]));
  return TITLES.map((t) => {
    if (t.days != null) return { id: t.id, label: t.label, unlocked: days >= t.days, hint: `Forer ${t.days} ${t.days > 1 ? 'jours' : 'jour'}`, kind: 'rang' };
    const defs = t.badges.map((id) => byId.get(id)).filter(Boolean);
    const unlocked = defs.some((b) => b.count > 0);
    const hint = defs.length ? `Badge « ${defs.map((b) => b.name).join(' » ou « ')} »` : 'Badge à découvrir';
    return { id: t.id, label: t.label, unlocked, hint, kind: 'badge' };
  });
}

/** Vrai si le titre existe et que le joueur l'a débloqué. */
function isUnlocked(id, badges, days) {
  return catalog(badges, days).some((t) => t.id === id && t.unlocked);
}

module.exports = { TITLES, RANK_TITLES, catalog, isUnlocked, labelOf };
