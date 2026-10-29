'use strict';

/*
 * Avatar du joueur : quelques choix (id) par catégorie, dessinés côté client en pixel art.
 * Certains éléments se débloquent avec des badges (dont ceux des défis de la semaine) ; les autres sont libres.
 */

const OPTIONS = {
  espece: [['humain', 'Humain'], ['nain', 'Nain ou naine'], ['robot', 'Robot à vapeur'], ['taupe', 'Taupe ou taupinette'], ['citrouille', 'Citrouille hantée'], ['squelette', 'Squelette fossile'], ['fantome', 'Fantôme de la mine'], ['golem', 'Golem de cristal']],
  forme: [['m', 'Masculine'], ['f', 'Féminine']],
  peau: [['clair', 'Teint clair'], ['mat', 'Teint mat'], ['brun', 'Teint brun'], ['fonce', 'Teint foncé']],
  cheveux: [['court', 'Courts'], ['long', 'Longs'], ['chignon', 'Chignon'], ['crete', 'Crête'], ['afro', 'Afro'], ['tresses', 'Tresses'], ['chauve', 'Chauve'], ['queue', 'Queue de cheval'], ['carre', 'Carré']],
  couleur: [['brun', 'Brun'], ['noir', 'Noir'], ['blond', 'Blond'], ['roux', 'Roux'], ['gris', 'Gris'], ['rose', 'Rose'], ['bleu', 'Bleu']],
  yeux: [['points', 'Discrets'], ['grands', 'Grands'], ['lunettes', 'Lunettes'], ['heureux', 'Rieurs'], ['monocle', 'Monocle'], ['cache-oeil', 'Cache-œil'], ['etoiles', 'Yeux étoilés'], ['soleil', 'Lunettes de soleil'], ['rondes', 'Lunettes rondes'], ['aviateur', "Lunettes d'aviateur"]],
  barbe: [['aucune', 'Aucune'], ['barbe', 'Barbe'], ['moustache', 'Moustache'], ['bouc', 'Bouc'], ['guidon', 'Moustache en guidon'], ['favoris', 'Favoris'], ['sage', 'Longue barbe de sage'], ['tressee', 'Barbe tressée'], ['nattes', 'Barbe à deux nattes'], ['fourchue', 'Barbe fourchue']],
  trait: [['aucun', 'Aucun'], ['taches', 'Taches de rousseur'], ['joues', 'Joues rosées'], ['cicatrice', 'Cicatrice'], ['guerre', 'Peinture de guerre']],
  bouche: [['normal', 'Discrète'], ['sourire', 'Grand sourire'], ['serieux', 'Sérieuse'], ['ouvert', 'Bouche ouverte'], ['langue', 'Tire la langue'], ['rouge', 'Rouge à lèvres'], ['dent-or', 'Dent en or']],
  compagnon: [['aucun', 'Aucun'], ['canari', 'Canari de mine'], ['lucioles', 'Lucioles'], ['chauve-souris', 'Chauve-souris']],
  piercing: [['aucun', 'Aucun'], ['nez', 'Au nez'], ['sourcil', 'Au sourcil'], ['levre', 'À la lèvre'], ['oreille', 'Aux oreilles'], ['multiples', 'Plusieurs']],
  tatouage: [['aucun', 'Aucun'], ['ancre', 'Ancre'], ['tribal', 'Bracelets tribaux'], ['serpent', 'Serpent'], ['larme', 'Larme'], ['maori', 'Motif sur la joue']],
  accessoire: [['aucun', 'Aucun'], ['noeud-papillon', 'Nœud papillon'], ['noeud-rose', 'Nœud rose'], ['foulard', 'Foulard'], ['medaille', 'Médaille'], ['perles', 'Collier de perles'], ['coeur', 'Broche en cœur'], ['noeud-arc-en-ciel', 'Nœud arc-en-ciel']],
  chapeau: [
    ['aucun', 'Aucun'], ['casque', 'Casque de mineur'], ['haut', 'Haut-de-forme'], ['diademe', 'Diadème'], ['bonnet', 'Bonnet'],
    ['casque-blanc', 'Casque de chef de chantier'], ['casque-or', 'Casque doré'], ['couronne', 'Couronne'],
    ['viking', 'Casque viking'], ['heaume', 'Heaume de chevalier'], ['toque', 'Toque de chef'], ['bandana', 'Bandana de pirate'],
    ['casque-nain', 'Casque de nain'], ['chapeau-metal', 'Chapeau de métal'], ['melon', 'Chapeau melon'], ['casquette', 'Casquette'], ['bonnet-noel', 'Bonnet de Noël'], ['mitre', 'Mitre de saint Nicolas'],
  ],
  tenue: [
    ['mineur', 'Tenue de mineur'], ['salopette', 'Salopette'], ['robe', 'Robe rose'], ['smoking', 'Smoking'], ['pull', 'Pull bleu'],
    ['scaphandre', 'Combinaison de forage'], ['cape', 'Cape dorée'],
    ['armure', 'Armure de chevalier'], ['pirate', 'Marinière de pirate'], ['cuisinier', 'Veste de cuisinier'], ['blouse', 'Blouse de laboratoire'],
    ['chasuble', 'Chasuble orange fluo'], ['robe-fleurs', 'Robe à fleurs'], ['mineur-nain', 'Tenue de mineur nain'], ['armure-naine', 'Armure naine'], ['gilet-vapeur', 'Gilet à vapeur'], ['poil', 'Juste le poil'],
  ],
  objet: [
    ['aucun', 'Rien'], ['pioche', 'Pioche'], ['lanterne', 'Lanterne'], ['fleur', 'Fleur'], ['canne', 'Canne'], ['ballon', 'Ballon'],
    ['fanion', 'Fanion de chantier'], ['dynamite', 'Bâton de dynamite'], ['diamant', 'Diamant'], ['torche', 'Torche'],
    ['epee', 'Épée'], ['bouclier', 'Bouclier'], ['marteau', 'Marteau de forgeron'],
    ['hache', 'Hache'], ['hache-double', 'Hache à deux tranchants'], ['pipe', 'Pipe'], ['chope', 'Chope de bière'],
  ],
  lieu: [['hublot', 'Au hublot de la foreuse'], ['surface', 'À la surface'], ['aucun', 'Nulle part']],
};

const LABELS = {
  espece: 'Type de personnage', bouche: 'Bouche', compagnon: 'Compagnon', piercing: 'Piercings', tatouage: 'Tatouages', accessoire: 'Accessoire', forme: 'Silhouette', peau: 'Teint', cheveux: 'Cheveux', couleur: 'Couleur', yeux: 'Yeux', barbe: 'Barbe', trait: 'Traits du visage',
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
  // Cosmétiques de duel : armes, armures et traits de guerrier.
  'objet:epee': ['attaquant-1'],
  'objet:bouclier': ['defenseur-1'],
  'chapeau:heaume': ['defenseur-5'],
  'chapeau:viking': ['sentinelle-3'],
  'tenue:armure': ['attaquant-15', 'defenseur-15'],
  'yeux:monocle': ['diplomate-3'],
  'yeux:cache-oeil': ['nemesis'],
  'trait:cicatrice': ['rival'],
  'trait:guerre': ['coup-de-boutoir', 'imprenable'],
  // Autres vêtements et traits à gagner.
  'chapeau:toque': ['themes-250'],
  'chapeau:bandana': ['entrainement-10'],
  'tenue:pirate': ['serie-14'],
  'tenue:cuisinier': ['paques', 'noel'],
  'tenue:blouse': ['themes-500'],
  'objet:marteau': ['defi-5'],
  'yeux:etoiles': ['public-10'],
  'barbe:guidon': ['serie-7'],
  'barbe:sage': ['serie-30'],
  'objet:hache': ['attaquant-1'],
  'objet:hache-double': ['attaquant-15'],
  'tenue:armure-naine': ['defenseur-15'],
  'chapeau:casque-nain': ['defenseur-5'],
  // Jours spéciaux (badges du calendrier) et profondeurs.
  'espece:citrouille': ['halloween'],
  'espece:fantome': ['toussaint'],
  'espece:squelette': ['darwin-day', 'halloween'],
  'espece:golem': ['profondeur-650'],
  'compagnon:chauve-souris': ['halloween'],
  'chapeau:bonnet-noel': ['noel'],
  'chapeau:mitre': ['saint-nicolas'],
  'accessoire:coeur': ['saint-valentin'],
  'accessoire:noeud-arc-en-ciel': ['fierte'],
};

function defaultAvatar(userId) {
  const n = Math.abs(Number(userId) || 1);
  const pick = (slot, k, pool) => {
    const ids = pool || OPTIONS[slot].map((o) => o[0]);
    return ids[(n * (k + 3) + k * 7) % ids.length];
  };
  const forme = pick('forme', 1);
  return {
    espece: 'humain',
    forme,
    peau: pick('peau', 2),
    cheveux: pick('cheveux', 3, ['court', 'long', 'chignon', 'crete', 'afro', 'tresses', 'chauve']),
    couleur: pick('couleur', 4),
    yeux: pick('yeux', 5, ['points', 'grands', 'lunettes', 'heureux']),
    barbe: forme === 'm' ? pick('barbe', 6, ['aucune', 'barbe', 'moustache', 'bouc']) : 'aucune',
    trait: 'aucun',
    bouche: 'normal',
    compagnon: 'aucun',
    piercing: 'aucun',
    tatouage: 'aucun',
    accessoire: 'aucun',
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
  if (out.tenue === 'poil' && out.espece !== 'taupe') out.tenue = base.tenue;
  return out;
}

// Éléments que `catalog(…, false)` masque (interrupteur de sécurité ; tout le monde les voit par défaut).
const BETA = new Set([
  'yeux:monocle', 'yeux:cache-oeil', 'yeux:etoiles', 'barbe:guidon', 'barbe:favoris', 'barbe:sage',
  'trait:taches', 'trait:joues', 'trait:cicatrice', 'trait:guerre',
  'chapeau:viking', 'chapeau:heaume', 'chapeau:toque', 'chapeau:bandana',
  'tenue:armure', 'tenue:pirate', 'tenue:cuisinier', 'tenue:blouse',
  'objet:epee', 'objet:bouclier', 'objet:marteau',
  'espece:nain', 'espece:robot', 'espece:taupe', 'espece:citrouille', 'espece:squelette', 'espece:fantome', 'espece:golem',
  'bouche:sourire', 'bouche:serieux', 'bouche:ouvert', 'bouche:langue', 'bouche:rouge', 'bouche:dent-or',
  'compagnon:canari', 'compagnon:lucioles', 'compagnon:chauve-souris',
  'chapeau:bonnet-noel', 'chapeau:mitre', 'accessoire:coeur', 'accessoire:noeud-arc-en-ciel',
  'cheveux:queue', 'cheveux:carre', 'yeux:soleil', 'yeux:rondes', 'yeux:aviateur',
  'barbe:tressee', 'barbe:nattes', 'barbe:fourchue',
  'piercing:nez', 'piercing:sourcil', 'piercing:levre', 'piercing:oreille', 'piercing:multiples',
  'tatouage:ancre', 'tatouage:tribal', 'tatouage:serpent', 'tatouage:larme', 'tatouage:maori',
  'accessoire:noeud-papillon', 'accessoire:noeud-rose', 'accessoire:foulard', 'accessoire:medaille', 'accessoire:perles',
  'chapeau:casque-nain', 'chapeau:chapeau-metal', 'chapeau:melon', 'chapeau:casquette',
  'tenue:chasuble', 'tenue:robe-fleurs', 'tenue:mineur-nain', 'tenue:armure-naine', 'tenue:gilet-vapeur', 'tenue:poil',
  'objet:hache', 'objet:hache-double', 'objet:pipe', 'objet:chope',
]);

/** Catalogue pour l'éditeur : éléments débloqués ou non (selon la liste des badges du joueur, avec leur nom). */
function catalog(badges, beta = true) {
  const byId = new Map(badges.map((b) => [b.id, b]));
  const out = {};
  for (const slot of SLOTS) {
    out[slot] = {
      label: LABELS[slot],
      options: OPTIONS[slot].filter(([id]) => beta || !BETA.has(`${slot}:${id}`)).map(([id, label]) => {
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

// Champs arrivés après coup : une page restée ouverte avant leur arrivée ne les envoie pas.
const OPTIONAL = { trait: 'aucun', bouche: 'normal', compagnon: 'aucun', piercing: 'aucun', tatouage: 'aucun', accessoire: 'aucun', espece: 'humain' };

/** Vérifie qu'un avatar ne contient que des éléments connus et débloqués. Renvoie l'avatar nettoyé, ou null. */
function validate(candidate, userId, badges, beta = true) {
  if (!candidate || typeof candidate !== 'object') return null;
  const cat = catalog(badges, beta);
  const out = {};
  for (const slot of SLOTS) {
    const want = OPTIONAL[slot] && candidate[slot] === undefined ? OPTIONAL[slot] : candidate[slot];
    const opt = cat[slot].options.find((o) => o.id === want);
    if (!opt || !opt.unlocked) return null;
    out[slot] = opt.id;
  }
  // « Juste le poil » est réservé aux taupes.
  if (out.tenue === 'poil' && out.espece !== 'taupe') return null;
  return out;
}

module.exports = { OPTIONS, LOCKS, BETA, defaultAvatar, normalize, catalog, validate };
