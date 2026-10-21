'use strict';

/*
 * Avatar du joueur : quelques choix (id) par catégorie, dessinés côté client en pixel art.
 * Certains éléments se débloquent avec des badges (dont ceux des défis de la semaine) ; les autres sont libres.
 */

const OPTIONS = {
  forme: [['m', 'Masculine'], ['f', 'Féminine']],
  peau: [['clair', 'Teint clair'], ['mat', 'Teint mat'], ['brun', 'Teint brun'], ['fonce', 'Teint foncé']],
  cheveux: [['court', 'Courts'], ['long', 'Longs'], ['chignon', 'Chignon'], ['crete', 'Crête'], ['afro', 'Afro'], ['tresses', 'Tresses'], ['chauve', 'Chauve']],
  couleur: [['brun', 'Brun'], ['noir', 'Noir'], ['blond', 'Blond'], ['roux', 'Roux'], ['gris', 'Gris'], ['rose', 'Rose'], ['bleu', 'Bleu']],
  yeux: [['points', 'Discrets'], ['grands', 'Grands'], ['lunettes', 'Lunettes'], ['heureux', 'Rieurs']],
  barbe: [['aucune', 'Aucune'], ['barbe', 'Barbe'], ['moustache', 'Moustache'], ['bouc', 'Bouc']],
  chapeau: [
    ['aucun', 'Aucun'], ['casque', 'Casque de mineur'], ['haut', 'Haut-de-forme'], ['diademe', 'Diadème'], ['bonnet', 'Bonnet'],
    ['casque-blanc', 'Casque de chef de chantier'], ['casque-or', 'Casque doré'], ['couronne', 'Couronne'],
  ],
  tenue: [
    ['mineur', 'Tenue de mineur'], ['salopette', 'Salopette'], ['robe', 'Robe rose'], ['smoking', 'Smoking'], ['pull', 'Pull bleu'],
    ['scaphandre', 'Combinaison de forage'], ['cape', 'Cape dorée'],
  ],
  objet: [
    ['aucun', 'Rien'], ['pioche', 'Pioche'], ['lanterne', 'Lanterne'], ['fleur', 'Fleur'], ['canne', 'Canne'], ['ballon', 'Ballon'],
    ['fanion', 'Fanion de chantier'], ['dynamite', 'Bâton de dynamite'], ['diamant', 'Diamant'], ['torche', 'Torche'],
  ],
  lieu: [['hublot', 'Au hublot de la foreuse'], ['surface', 'À la surface'], ['aucun', 'Nulle part']],
};

const LABELS = {
  forme: 'Silhouette', peau: 'Teint', cheveux: 'Cheveux', couleur: 'Couleur', yeux: 'Yeux', barbe: 'Barbe',
  chapeau: 'Couvre-chef', tenue: 'Tenue', objet: 'Objet en main', lieu: 'Pendant le forage',
};
const SLOTS = Object.keys(OPTIONS);

// Éléments à débloquer : « catégorie:id » → un de ces badges suffit.
const LOCKS = {
  'objet:fanion': ['defi-1'],
  'chapeau:casque-blanc': ['defi-5'],
  'tenue:cape': ['defi-15'],
  'chapeau:couronne': ['podium-semaine', 'podium-mois'],
  'chapeau:casque-or': ['serie-30', 'serie-50', 'serie-100'],
  'objet:diamant': ['pepites-10', 'jackpot'],
  'objet:dynamite': ['in-extremis'],
  'tenue:scaphandre': ['entrainement-50', 'entrainement-200'],
  'objet:torche': ['sainte-barbe'],
};

function defaultAvatar(userId) {
  const n = Math.abs(Number(userId) || 1);
  const pick = (slot, k, pool) => {
    const ids = pool || OPTIONS[slot].map((o) => o[0]);
    return ids[(n * (k + 3) + k * 7) % ids.length];
  };
  const forme = pick('forme', 1);
  return {
    forme,
    peau: pick('peau', 2),
    cheveux: pick('cheveux', 3, ['court', 'long', 'chignon', 'crete', 'afro', 'tresses', 'chauve']),
    couleur: pick('couleur', 4),
    yeux: pick('yeux', 5),
    barbe: forme === 'm' ? pick('barbe', 6) : 'aucune',
    chapeau: 'casque',
    tenue: 'mineur',
    objet: 'pioche',
    lieu: 'hublot',
  };
}

/** Avatar valide : chaque catégorie retombe sur la valeur par défaut si la valeur enregistrée est inconnue. */
function normalize(raw, userId) {
  let saved = raw;
  if (typeof saved === 'string') {
    try {
      saved = JSON.parse(saved);
    } catch {
      saved = null;
    }
  }
  const base = defaultAvatar(userId);
  if (!saved || typeof saved !== 'object') return base;
  const out = {};
  for (const slot of SLOTS) {
    const ids = OPTIONS[slot].map((o) => o[0]);
    out[slot] = typeof saved[slot] === 'string' && ids.includes(saved[slot]) ? saved[slot] : base[slot];
  }
  return out;
}

/** Catalogue pour l'éditeur : éléments débloqués ou non (selon la liste des badges du joueur, avec leur nom). */
function catalog(badges) {
  const byId = new Map(badges.map((b) => [b.id, b]));
  const out = {};
  for (const slot of SLOTS) {
    out[slot] = {
      label: LABELS[slot],
      options: OPTIONS[slot].map(([id, label]) => {
        const need = LOCKS[`${slot}:${id}`];
        if (!need) return { id, label, unlocked: true, hint: null };
        const defs = need.map((k) => byId.get(k)).filter(Boolean);
        const unlocked = defs.some((b) => b.count > 0);
        const hint = defs.length === 1 ? `Badge « ${defs[0].name} » : ${defs[0].description}` : `Un de ces badges : ${defs.map((b) => `« ${b.name} »`).join(' ou ')}`;
        return { id, label, unlocked, hint };
      }),
    };
  }
  return out;
}

/** Vérifie qu'un avatar ne contient que des éléments connus et débloqués. Renvoie l'avatar nettoyé, ou null. */
function validate(candidate, userId, badges) {
  if (!candidate || typeof candidate !== 'object') return null;
  const cat = catalog(badges);
  const out = {};
  for (const slot of SLOTS) {
    const opt = cat[slot].options.find((o) => o.id === candidate[slot]);
    if (!opt || !opt.unlocked) return null;
    out[slot] = opt.id;
  }
  return out;
}

module.exports = { OPTIONS, LOCKS, defaultAvatar, normalize, catalog, validate };
