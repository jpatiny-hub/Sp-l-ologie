'use strict';

/*
 * Catégories de thèmes pour les badges secrets (« Naturaliste », « Gourmet »…). Les thèmes n'ont pas de catégorie dans leur fichier :
 * elle est déduite de leur identifiant (le nom du fichier). Un thème a au plus une catégorie ; ceux qui n'entrent dans aucune ne comptent pour rien.
 * L'ordre compte : la première catégorie qui correspond l'emporte.
 */
const CATEGORIES = [
  ['cinema', /(^|-)(tintin|asterix|spirou|lucky|luke|schtroumpfs)(-|$)/],
  ['sport', /(^|-)(sport|sports|football|foot|tennis|cyclisme|tour-de-france|athletisme|olympi|basket|rugby|natation|golf|formule|boxe|judo|ski|mondial|coupe-du-monde|nba|nfl|nhl|f1|moto|gymnastique|handball|volley|hockey|equitation|escrime|marathon)(-|$)/],
  ['musique', /(^|-)(chanteu|chanteur|chanteuse|chanson|chansons|groupe|groupes|musique|musical|album|albums|artiste|artistes|rappeur|rap|instrument|instruments|compositeur|opera|festival|festivals|dj|orchestre|boys|girls|band|bands|tomorrowland|concert|hit|hits|tube|tubes|eurovision)(-|$)/],
  ['cinema', /(^|-)(film|films|serie|series|acteur|acteurs|actrice|actrices|realisateur|dessin|dessins|pixar|disney|marvel|mcu|manga|anime|jeu-video|jeux-video|jeux|sitcom|netflix|ghibli|pokemon|nintendo|livre|livres|roman|romans|bande|bd|tintin|asterix|harry|potter|star|wars|seigneur|batman|simpson|simpsons|doctor|who|lego|bond)(-|$)/],
  ['nature', /(^|-)(oiseau|oiseaux|animal|animaux|poisson|poissons|mammifere|mammiferes|insecte|insectes|reptile|reptiles|amphibien|amphibiens|fleur|fleurs|arbre|arbres|plante|plantes|champignon|champignons|felin|felins|chien|chiens|chat|chats|cheval|chevaux|requin|requins|baleine|dinosaure|dinosaures|faune|flore|nature|volcan|volcans|montagne|montagnes|foret|forets|vegetal|serpent|serpents|araignee|papillon|abeille|fourmi|coquillage|sauvage|ocean|oceans|race|races)(-|$)/],
  ['cuisine', /(^|-)(cuisine|plat|plats|recette|recettes|fromage|fromages|boisson|boissons|nourriture|aliment|aliments|dessert|desserts|pates|pizza|biere|bieres|vin|vins|cocktail|cocktails|gateau|gateaux|biscuit|biscuits|chocolat|sauce|sauces|soupe|epice|epices|patisserie|sandwich|burger|fruit|fruits|legume|legumes|repas|bonbon|bonbons|glace|glaces|cafe|the|whisky|alcool|condiment|condiments|viande|poisson-cuisine|boulangerie|gaufre|frite|frites|spaghetti|agrume|agrumes)(-|$)/],
  ['geo', /(^|-)(pays|ville|villes|capitale|capitales|region|regions|fleuve|fleuves|riviere|rivieres|ile|iles|mer|mers|lac|lacs|continent|continents|drapeau|drapeaux|monument|monuments|departement|departements|province|provinces|commune|communes|belgique|france|europe|asie|afrique|amerique|desert|deserts|detroit|frontiere|aeroport|aeroports|gare|gares|metro|territoire|etat|etats|canton|cantons|abbaye|abbayes|chateau|chateaux|cathedrale|cathedrales|musee|musees|rue|rues|autoroute|autoroutes|village|villages)(-|$)/],
  ['science', /(^|-)(element|elements|chimie|chimique|corps|os|muscle|muscles|organe|organes|maladie|maladies|vitamine|vitamines|planete|planetes|etoile|etoiles|galaxie|astronomie|physique|mathematique|mathematiques|science|sciences|scientifique|scientifiques|particule|particules|molecule|molecules|acide|acides|atome|metal|metaux|mineral|mineraux|roche|roches|gaz|unite|unites|mesure|medicament|medicaments|cellule|gene|virus|bacterie|bacteries|lune|systeme|inventeur|inventeurs|invention|inventions|nobel|geologie|biologie|anatomie|alcalins|acides-amines|equation|constante)(-|$)/],
];
const LABELS = { nature: 'animaux et nature', cuisine: 'cuisine et boissons', cinema: 'cinéma, séries, livres et jeux', musique: 'musique', geo: 'géographie', science: 'sciences', sport: 'sport' };

const cache = new Map();
/** Catégorie d'un thème d'après son identifiant, ou null. */
function categoryOf(themeId) {
  if (cache.has(themeId)) return cache.get(themeId);
  const hit = CATEGORIES.find(([, re]) => re.test(String(themeId)));
  const out = hit ? hit[0] : null;
  cache.set(themeId, out);
  return out;
}

module.exports = { CATEGORIES, LABELS, categoryOf };
