'use strict';

/*
 * Avatar du joueur : quelques choix (id) par catégorie, dessinés côté client en pixel art.
 * Certains éléments se débloquent avec des badges (dont ceux des défis de la semaine) ; les autres sont libres.
 */

const OPTIONS = {
  espece: [['humain', 'Humain'], ['nain', 'Nain ou naine'], ['robot', 'Robot à vapeur'], ['taupe', 'Taupe ou taupinette'], ['citrouille', 'Citrouille hantée'], ['squelette', 'Squelette fossile'], ['fantome', 'Fantôme de la mine'], ['golem', 'Golem de cristal'],
    ['champignon', 'Champignon lumineux'], ['ver-luisant', 'Ver luisant géant'], ['diablotin', 'Diablotin des profondeurs'], ['grenouille', 'Grenouille des cascades']],
  forme: [['m', 'Masculine'], ['f', 'Féminine']],
  peau: [['clair', 'Teint clair'], ['mat', 'Teint mat'], ['brun', 'Teint brun'], ['fonce', 'Teint foncé']],
  cheveux: [['court', 'Courts'], ['long', 'Longs'], ['chignon', 'Chignon'], ['crete', 'Crête'], ['afro', 'Afro'], ['tresses', 'Tresses'], ['chauve', 'Chauve'], ['queue', 'Queue de cheval'], ['carre', 'Carré']],
  couleur: [['brun', 'Brun'], ['noir', 'Noir'], ['blond', 'Blond'], ['roux', 'Roux'], ['gris', 'Gris'], ['rose', 'Rose'], ['bleu', 'Bleu']],
  yeux: [['points', 'Discrets'], ['grands', 'Grands'], ['lunettes', 'Lunettes'], ['heureux', 'Rieurs'], ['monocle', 'Monocle'], ['cache-oeil', 'Cache-œil'], ['etoiles', 'Yeux étoilés'], ['soleil', 'Lunettes de soleil'], ['rondes', 'Lunettes rondes'], ['aviateur', "Lunettes d'aviateur"]],
  barbe: [['aucune', 'Aucune'], ['barbe', 'Barbe'], ['moustache', 'Moustache'], ['bouc', 'Bouc'], ['guidon', 'Moustache en guidon'], ['favoris', 'Favoris'], ['sage', 'Longue barbe de sage'], ['tressee', 'Barbe tressée'], ['nattes', 'Barbe à deux nattes'], ['fourchue', 'Barbe fourchue']],
  trait: [['aucun', 'Aucun'], ['taches', 'Taches de rousseur'], ['joues', 'Joues rosées'], ['cicatrice', 'Cicatrice'], ['guerre', 'Peinture de guerre']],
  corpulence: [['normale', 'Normale'], ['mince', 'Mince'], ['costaud', 'Costaud'], ['imposant', 'Imposante']],
  modele: [['classique', 'Automate à vapeur'], ['cyclope', 'Cyclope-lanterne'], ['blinde', 'Sentinelle blindée'], ['chenilles', 'Foreur à chenilles'], ['dandy', 'Automate de salon']],
  iris: [['defaut', 'Naturelle'], ['bleu', 'Bleus'], ['vert', 'Verts'], ['noisette', 'Noisette'], ['gris', 'Gris'], ['violet', 'Violets'], ['dore', 'Dorés'], ['vairons', 'Vairons']],
  aura: [['aucune', 'Aucune'], ['dore', 'Lueur dorée'], ['feu', 'Braises'], ['givre', 'Givre'], ['etoiles', 'Étoiles'], ['ombre', 'Brume sombre']],
  dos: [['aucun', 'Rien'], ['sac-a-dos', 'Sac de mineur'], ['cape-rouge', 'Cape rouge'], ['ailes-fee', 'Ailes de fée'], ['ailes-chauve-souris', 'Ailes de chauve-souris'], ['ailes-dragon', 'Ailes de dragon'], ['ailes-cupidon', 'Ailes de cupidon'], ['poisson-papier', "Poisson d'avril"], ['hotte', 'Hotte pleine de cadeaux'], ['reservoir-vapeur', 'Réservoir à vapeur']],
  bouche: [['normal', 'Discrète'], ['sourire', 'Grand sourire'], ['serieux', 'Sérieuse'], ['ouvert', 'Bouche ouverte'], ['langue', 'Tire la langue'], ['rouge', 'Rouge à lèvres'], ['dent-or', 'Dent en or']],
  compagnon: [['aucun', 'Aucun'], ['canari', 'Canari de mine'], ['lucioles', 'Lucioles'], ['chauve-souris', 'Chauve-souris'], ['chat-noir', 'Chat noir']],
  piercing: [['aucun', 'Aucun'], ['nez', 'Au nez'], ['sourcil', 'Au sourcil'], ['levre', 'À la lèvre'], ['oreille', 'Aux oreilles'], ['multiples', 'Plusieurs']],
  tatouage: [['aucun', 'Aucun'], ['ancre', 'Ancre'], ['tribal', 'Bracelets tribaux'], ['serpent', 'Serpent'], ['larme', 'Larme'], ['maori', 'Motif sur la joue']],
  accessoire: [['aucun', 'Aucun'], ['noeud-papillon', 'Nœud papillon'], ['noeud-rose', 'Nœud rose'], ['foulard', 'Foulard'], ['medaille', 'Médaille'], ['perles', 'Collier de perles'], ['coeur', 'Broche en cœur'], ['noeud-arc-en-ciel', 'Nœud arc-en-ciel'], ['chaines', 'Chaînes rouillées'], ['runes', 'Runes lumineuses'],
    ['serpentin', 'Serpentin'], ['grelots', 'Grelots dorés'], ['pin-pi', 'Pin\'s π'], ['insigne-1an', 'Insigne de 1 an'], ['insigne-2ans', 'Insigne de 2 ans'], ['insigne-3ans', 'Insigne de 3 ans']],
  chapeau: [
    ['aucun', 'Aucun'], ['casque', 'Casque de mineur'], ['haut', 'Haut-de-forme'], ['diademe', 'Diadème'], ['bonnet', 'Bonnet'],
    ['casque-blanc', 'Casque de chef de chantier'], ['casque-or', 'Casque doré'], ['couronne', 'Couronne'],
    ['viking', 'Casque viking'], ['heaume', 'Heaume de chevalier'], ['toque', 'Toque de chef'], ['bandana', 'Bandana de pirate'],
    ['casque-nain', 'Casque de nain'], ['chapeau-metal', 'Chapeau de métal'], ['melon', 'Chapeau melon'], ['casquette', 'Casquette'], ['bonnet-noel', 'Bonnet de Noël'], ['mitre', 'Mitre de saint Nicolas'],
    ['cotillon', 'Chapeau de fête'], ['aureole', 'Auréole de cupidon'], ['chapeau-sorciere', 'Chapeau de sorcière'], ['oreilles-lapin', 'Oreilles de lapin'], ['plumes-gille', 'Plumes d\'autruche'], ['bougies', 'Couronne de bougies'],
    ['chapeau-paille', 'Chapeau de paille'], ['casque-colonial', 'Casque colonial'], ['suroit', 'Suroît jaune'],
  ],
  tenue: [
    ['mineur', 'Tenue de mineur'], ['salopette', 'Salopette'], ['robe', 'Robe rose'], ['smoking', 'Smoking'], ['pull', 'Pull bleu'],
    ['scaphandre', 'Combinaison de forage'], ['cape', 'Cape dorée'],
    ['armure', 'Armure de chevalier'], ['pirate', 'Marinière de pirate'], ['cuisinier', 'Veste de cuisinier'], ['blouse', 'Blouse de laboratoire'],
    ['chasuble', 'Chasuble orange fluo'], ['robe-fleurs', 'Robe à fleurs'], ['mineur-nain', 'Tenue de mineur nain'], ['costume-gille', 'Costume de Gille'], ['armure-naine', 'Armure naine'], ['gilet-vapeur', 'Gilet à vapeur'], ['costume-cupidon', 'Toge de cupidon'], ['manteau-noel', 'Manteau du Père Noël'], ['robe-sorciere', 'Robe de sorcière'], ['chape-eveque', "Chape d'évêque"],
    ['tablier-forge', 'Tablier de forgeron'], ['redingote', 'Redingote de géomètre'], ['epouvantail', "Habit d'épouvantail"], ['explorateur', "Tenue d'explorateur"], ['herboriste', "Tunique d'herboriste"], ['tunique-infernale', 'Tunique infernale'], ['cire-jaune', 'Ciré jaune'], ['poil', 'Juste le poil'],
  ],
  objet: [
    ['aucun', 'Rien'], ['pioche', 'Pioche'], ['lanterne', 'Lanterne'], ['fleur', 'Fleur'], ['canne', 'Canne'], ['ballon', 'Ballon'],
    ['fanion', 'Fanion de chantier'], ['dynamite', 'Bâton de dynamite'], ['diamant', 'Diamant'], ['torche', 'Torche'],
    ['epee', 'Épée'], ['bouclier', 'Bouclier'], ['marteau', 'Marteau de forgeron'],
    ['arc-coeur', 'Arc de cupidon'], ['cadeau', 'Cadeau'], ['canne-sucre', 'Sucre d\'orge'], ['balai', 'Balai de sorcière'], ['orange', 'Orange de Gille'], ['gateau', 'Gâteau d\'anniversaire'], ['crosse', 'Crosse'], ['panier-paques', 'Panier de Pâques'],
    ['coupe', 'Coupe de champagne'], ['tarte', 'Tarte'], ['poisson', 'Poisson frais'],
    ['hache', 'Hache'], ['hache-double', 'Hache à deux tranchants'], ['pipe', 'Pipe'], ['chope', 'Chope de bière'],
  ],
  lieu: [['hublot', 'Au hublot de la foreuse'], ['surface', 'À la surface'], ['aucun', 'Nulle part']],
};

const LABELS = {
  espece: 'Type de personnage', corpulence: 'Corpulence', modele: 'Modèle de robot', iris: 'Couleur des yeux', aura: 'Aura', dos: 'Dans le dos', bouche: 'Bouche', compagnon: "Sur l'épaule", piercing: 'Piercings', tatouage: 'Tatouages', accessoire: 'Accessoire', forme: 'Silhouette', peau: 'Teint', cheveux: 'Cheveux', couleur: 'Couleur', yeux: 'Yeux', barbe: 'Barbe', trait: 'Traits du visage',
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
  // Séries de fête : un badge de calendrier suffit.
  'chapeau:aureole': ['saint-valentin'], 'tenue:costume-cupidon': ['saint-valentin'], 'dos:ailes-cupidon': ['saint-valentin'], 'objet:arc-coeur': ['saint-valentin'],
  'tenue:manteau-noel': ['noel'], 'dos:hotte': ['noel'], 'objet:cadeau': ['noel', 'saint-nicolas'], 'objet:canne-sucre': ['noel', 'saint-nicolas'],
  'chapeau:chapeau-sorciere': ['halloween'], 'tenue:robe-sorciere': ['halloween'], 'objet:balai': ['halloween'], 'compagnon:chat-noir': ['halloween', 'vendredi-13'],
  'tenue:chape-eveque': ['saint-nicolas'], 'objet:crosse': ['saint-nicolas'],
  'chapeau:oreilles-lapin': ['paques'], 'chapeau:plumes-gille': ['mardi-gras'], 'tenue:costume-gille': ['mardi-gras'], 'objet:orange': ['mardi-gras'], 'accessoire:grelots': ['mardi-gras'], 'chapeau:bougies': ['anniversaire'], 'objet:gateau': ['anniversaire'], 'objet:panier-paques': ['paques'],
  'chapeau:cotillon': ['nouvel-an'], 'objet:coupe': ['nouvel-an'], 'accessoire:serpentin': ['nouvel-an'],
  'accessoire:pin-pi': ['pi-day'], 'objet:tarte': ['pi-day'],
  'dos:poisson-papier': ['poisson-avril'], 'objet:poisson': ['poisson-avril'],
  'dos:reservoir-vapeur': ['serie-50'],
  // Ancienneté : badges virtuels calculés par `BadgeService.profile` d'après la date d'inscription.
  'accessoire:insigne-1an': ['annee-1'], 'accessoire:insigne-2ans': ['annee-2'], 'accessoire:insigne-3ans': ['annee-3'],
  'modele:blinde': ['defenseur-5'],
  'modele:chenilles': ['entrainement-50'],
  'modele:dandy': ['diplomate-3'],
  'espece:champignon': ['serie-7'],
  'espece:ver-luisant': ['sainte-barbe'],
  'espece:diablotin': ['cranes-25'],
  'espece:grenouille': ['jour-terre'],
  'dos:ailes-chauve-souris': ['halloween'],
  'dos:ailes-dragon': ['profondeur-700'],
  'aura:dore': ['podium-semaine', 'podium-mois'],
  'aura:feu': ['sainte-barbe'],
  'aura:givre': ['noel'],
  'aura:etoiles': ['public-10'],
  'aura:ombre': ['toussaint'],
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
    corpulence: 'normale',
    modele: 'classique',
    iris: 'defaut',
    aura: 'aucune',
    dos: 'aucun',
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

// Vestiaire 16-bit (refonte) : réservé au responsable tant que la refonte est en bêta (`catalog(…, …, false)` les masque).
const REFONTE_ITEMS = [
  'espece:nain', 'espece:robot', 'espece:taupe', 'espece:citrouille', 'espece:squelette', 'espece:fantome', 'espece:golem',
  'espece:champignon', 'espece:ver-luisant', 'espece:diablotin', 'espece:grenouille',
  'corpulence:mince', 'corpulence:costaud', 'corpulence:imposant',
  'chapeau:aureole', 'chapeau:plumes-gille', 'chapeau:bougies', 'objet:gateau', 'tenue:costume-gille', 'objet:orange', 'accessoire:grelots', 'chapeau:chapeau-sorciere', 'chapeau:oreilles-lapin',
  'tenue:costume-cupidon', 'tenue:manteau-noel', 'tenue:robe-sorciere', 'tenue:chape-eveque',
  'chapeau:cotillon', 'objet:coupe', 'objet:tarte', 'objet:poisson', 'accessoire:serpentin', 'accessoire:pin-pi', 'dos:poisson-papier',
  'objet:arc-coeur', 'objet:cadeau', 'objet:canne-sucre', 'objet:balai', 'objet:crosse', 'objet:panier-paques',
  'dos:ailes-cupidon', 'dos:hotte', 'dos:reservoir-vapeur', 'compagnon:chat-noir',
  'accessoire:insigne-1an', 'accessoire:insigne-2ans', 'accessoire:insigne-3ans',
  'modele:cyclope', 'modele:blinde', 'modele:chenilles', 'modele:dandy',
  'chapeau:chapeau-paille', 'chapeau:casque-colonial', 'chapeau:suroit', 'accessoire:chaines', 'accessoire:runes',
  'tenue:tablier-forge', 'tenue:redingote', 'tenue:epouvantail', 'tenue:explorateur', 'tenue:herboriste', 'tenue:tunique-infernale', 'tenue:cire-jaune',
  'iris:bleu', 'iris:vert', 'iris:noisette', 'iris:gris', 'iris:violet', 'iris:dore', 'iris:vairons',
  'aura:dore', 'aura:feu', 'aura:givre', 'aura:etoiles', 'aura:ombre',
  'dos:sac-a-dos', 'dos:cape-rouge', 'dos:ailes-fee', 'dos:ailes-chauve-souris', 'dos:ailes-dragon',
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
];
const REFONTE = new Set(REFONTE_ITEMS);

// Éléments que `catalog(…, false)` masque (interrupteur de sécurité ; tout le monde les voit par défaut).
const BETA = new Set([
  'yeux:monocle', 'yeux:cache-oeil', 'yeux:etoiles', 'barbe:guidon', 'barbe:favoris', 'barbe:sage',
  'trait:taches', 'trait:joues', 'trait:cicatrice', 'trait:guerre',
  'chapeau:viking', 'chapeau:heaume', 'chapeau:toque', 'chapeau:bandana',
  'tenue:armure', 'tenue:pirate', 'tenue:cuisinier', 'tenue:blouse',
  'objet:epee', 'objet:bouclier', 'objet:marteau',
  ...REFONTE_ITEMS,
]);

/** Catalogue pour l'éditeur : éléments débloqués ou non (selon la liste des badges du joueur, avec leur nom). */
function catalog(badges, beta = true, refonte = true) {
  const byId = new Map(badges.map((b) => [b.id, b]));
  const out = {};
  for (const slot of SLOTS) {
    out[slot] = {
      label: LABELS[slot],
      options: OPTIONS[slot].filter(([id]) => (beta || !BETA.has(`${slot}:${id}`)) && (refonte || !REFONTE.has(`${slot}:${id}`))).map(([id, label]) => {
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
const OPTIONAL = { trait: 'aucun', corpulence: 'normale', modele: 'classique', iris: 'defaut', aura: 'aucune', dos: 'aucun', bouche: 'normal', compagnon: 'aucun', piercing: 'aucun', tatouage: 'aucun', accessoire: 'aucun', espece: 'humain' };

/** Vérifie qu'un avatar ne contient que des éléments connus et débloqués. Renvoie l'avatar nettoyé, ou null. */
function validate(candidate, userId, badges, beta = true, refonte = true) {
  if (!candidate || typeof candidate !== 'object') return null;
  const cat = catalog(badges, beta, refonte);
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

module.exports = { OPTIONS, LOCKS, BETA, REFONTE, defaultAvatar, normalize, catalog, validate };
