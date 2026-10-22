'use strict';

/*
 * Notes de mise à jour affichées une fois à chaque joueur (sur l'accueil), jusqu'à ce qu'il les ferme.
 * Pour en annoncer une nouvelle : ajouter un élément à la fin avec un `id` supérieur aux précédents.
 * Les comptes créés après la publication d'une note ne la voient pas (ils découvrent le jeu tel quel).
 */
const NEWS = [
  {
    id: 1,
    date: '2026-10-19',
    title: 'Nouveautés du jeu',
    items: [
      'Une idée de thème ? Dans ton carnet, la section « Proposer un thème » t\'attend : écris ton idée (avec des exemples si tu veux) et le responsable du jeu l\'examinera.',
      'Plus de 100 nouveaux thèmes : drapeaux, pays, langues officielles, sports, Drag Race, pizzas, pièces de la maison, artistes Spotify…',
      'Cinq nouveaux badges : Sentier battu, Autoroute, Sept sur sept, Lanterne rouge, et Fierté (le 17 mai, avec une foreuse arc-en-ciel).',
      'Les paliers de rareté ont de nouveaux noms : Gravier, Soufre, Cuivre, Rubis et Pépite. Il y a plus de pépites, et le centre de la Terre est atteint à 600 points.',
      'La foreuse creuse plus longtemps, et à la fin du forage la vue dézoome pour montrer la distance restante jusqu\'au centre de la Terre.',
      'Les chiffres sont acceptés à la place des chiffres romains : « Louis 14 » vaut « Louis XIV ».',
    ],
  },
  {
    id: 2,
    date: '2026-10-19',
    title: 'Statistiques et comparaisons',
    items: [
      'Ton carnet affiche maintenant des statistiques détaillées : forages du jour et mode illimité (thèmes rencontrés, moyenne, meilleure réponse…).',
      'Sept nouveaux badges récompensent le nombre de thèmes rencontrés, tous modes de jeu confondus.',
      'Dans le podium (onglet « Jour ») et à la fin de ton forage, tu peux comparer tes réponses et tes points avec ceux des autres joueurs, thème par thème. Seuls les forages du jour (mode compétition) sont comparables : le mode illimité reste personnel.',
    ],
  },
  {
    id: 3,
    date: '2026-10-20',
    title: 'Fautes de frappe mieux pardonnées',
    items: [
      'Les fautes de frappe sont plus tolérantes : une touche voisine sur le clavier (z au lieu de e…) ne compte que pour une demi-faute, les longs noms acceptent jusqu\'à trois fautes, et le nom de famille seul est reconnu quand il est unique dans le thème. Le jeu te demande toujours de confirmer.',
      'Lettres grecques : les variantes d\'orthographe sont acceptées (dzêta, éta, psy…). Le koala géant a rejoint les marsupiaux, et la série The 100 a été ajoutée.',
    ],
  },
  {
    id: 4,
    date: '2026-10-21',
    title: '78 nouveaux thèmes',
    items: ['78 nouveaux thèmes rejoignent le jeu à partir d\'aujourd\'hui : à vous de les découvrir au fil des forages !'],
  },
  {
    id: 5,
    date: '2026-10-21',
    title: 'Ce qui change dans le jeu',
    items: [
      'Ton carnet est plus léger : chaque section (statistiques, atelier, propositions, badges…) se replie d\'un clic, et le jeu retient ce que tu as laissé ouvert.',
      'Les badges sont présentés dans un tableau de pastilles : touche-en une pour afficher son détail dans une fenêtre flottante.',
      'Dans le récapitulatif d\'un forage, un champ de recherche te permet de retrouver tout de suite si une réponse figurait dans la liste d\'un thème (noms et variantes acceptées).',
      'La carrosserie « Or massif » a enfin sa propre allure : plus brillante et reflétée, elle ne ressemble plus à la foreuse classique.',
      'Les réponses signalées par les joueurs sont désormais examinées une à une : rien n\'est validé automatiquement.',
      'Le chrono a un nouveau look : une batterie de lampe frontale qui s\'éteint. Trois autres apparences se débloquent avec des badges et se choisissent dans l\'atelier : la mèche de dynamite, le wagonnet et la lanterne.',
      'Pendant un forage : le chrono affiche les secondes et tremble dans les cinq dernières, sept pastilles montrent la rareté de chaque thème joué, et le clavier du téléphone reste ouvert d\'un thème à l\'autre.',
      'À l\'accueil, une lanterne de mineur suit ta série de jours et te dit combien de temps il reste pour ne pas la perdre, avec le badge le plus proche à décrocher.',
      'Dans la comparaison, tu vois quand quelqu\'un a donné la même réponse que toi, ou quand tu es le seul à avoir trouvé une réponse.',
      'Carnet : une recherche et un filtre (obtenus / à gagner) dans les badges.',
      'Le récapitulatif est repensé : ta meilleure réponse du jour en haut, puis une carte par thème qui se déplie, avec un bouton pour voir toutes les réponses du thème (et les chercher). Dans cette liste, ∞ indique combien de fois une réponse a été donnée en mode illimité.',
      'Dans ton carnet : un bilan du mois, un calendrier de tes jours forés, la courbe de tes derniers scores, la répartition de tes réponses par rareté, ta réponse signature et ta meilleure profondeur sur une coupe de la Terre.',
      'Étais de galerie : tu en gagnes un tous les 7 jours forés d\'affilée (3 au maximum), et un étai sauve automatiquement ta série quand tu rates un jour. Ils s\'affichent à l\'accueil sous ta lanterne.',
      'À l\'accueil, un défi de la semaine (le même pour tous) avec sa barre de progression.',
      'Seize nouveaux badges : Lanterne rallumée, Mois complet, Filon, Jackpot, In extremis, Éclair, Œil de lynx, trois pour l\'entraînement, trois pour les défis, et trois jours particuliers (4 mai, 23 avril, 21 juin).',
      'Paramètres : un thème clair, et trois modes pour les daltoniens (rouge-vert, bleu-jaune, niveaux de gris), avec un symbole par niveau de rareté. Sur ordinateur, Entrée enchaîne les étapes du forage et les flèches parcourent le récapitulatif.',
    ],
  },
  {
    id: 6,
    date: '2026-10-22',
    title: 'Ton profil, ton personnage et 63 nouveaux thèmes',
    items: [
      'Ton carnet devient ton Profil. En haut, ton pseudo et ton personnage ; en dessous, dans l\'ordre : badges, atelier, carnet, bilan, statistiques, puis « Proposer un thème ».',
      'Crée ton personnage : avec des flèches, change la silhouette, les cheveux, les yeux, la barbe, le couvre-chef, la tenue et l\'objet en main (pioche, lanterne… mais aussi diadème, robe rose ou smoking). Les teints et couleurs de cheveux sont libres.',
      'Ton personnage apparaît à côté de ton pseudo dans les listes et les comparaisons, debout sur ta marche du podium, et pendant le forage : au hublot de la foreuse ou à la surface, comme tu préfères.',
      'Certains éléments se gagnent : fanion, casque de chef de chantier et cape dorée avec les défis de la semaine ; couronne, casque doré, diamant, dynamite, torche et combinaison de forage avec d\'autres badges. Un élément verrouillé s\'essaie à l\'écran et indique comment le débloquer.',
      'Nouveau : la galerie de secours ! Dans chaque forage (du jour comme en mode illimité), tu peux prendre une galerie de secours pour changer gratuitement un thème par un autre, le même pour tous les joueurs. Une fois la galerie empruntée, passer un thème coûte le thème.',
      'Chaque pépite fait scintiller le jeu : plus tu en trouves dans un forage, plus le son est brillant, et ton téléphone vibre une fois par pépite (si le son est activé).',
      'Tu peux changer de pseudo, une fois par semaine, en confirmant ton mot de passe. Tes parties, badges et classements te suivent.',
      'Neuf nouveaux défis de la semaine : un par palier de rareté (15 réponses Gravier, 10 Soufre, 6 Cuivre, 3 Rubis, et 2 pépites), un score cumulé, des parties en mode illimité, un forage de 450 points, des réponses en moins de 8 secondes, et forer le week-end.',
      'Nouveau mode « Lecture facile » (Paramètres, rubrique Lecture), pensé pour la dyslexie : police plus lisible, lettres et lignes plus espacées, fond crème doux. Les points et le chrono ne changent pas.',
      '63 nouveaux thèmes : Kaamelott, League of Legends, Minecraft, Loup-Garou, Age of Empires II, les os du corps, les tentacules, les métiers disparus, les expressions avec un animal ou une couleur, les fonctions de YouTube et d\'Instagram, les parcs d\'attractions… et de nombreux thèmes ont été vérifiés et complétés (palmarès à jour jusqu\'en 2026, films, chansons, exoplanètes).',
      'Les réponses que tu signales reçoivent une réponse : dans « Proposer un thème », la liste « Mes réponses signalées » indique si elle est acceptée, avec un message, et les points éventuellement accordés.',
    ],
  },
  {
    id: 7,
    date: '2026-10-23',
    title: 'Duels, défi collectif et nouvel accueil',
    highlights: [
      { icon: 'sabre', text: "Duels : défie un joueur sur 7 thèmes, au chrono ou « À l'aise » (sans chrono)" },
      { icon: 'diamant', text: 'Défi collectif du mois : 10 000 points à creuser ensemble jusqu\'au diamant' },
      { icon: 'coeur', text: 'Réactions aux réponses des autres, dans le comparatif' },
      { icon: 'trophee', text: 'Le lundi, le récap de la semaine : la Gazette de la mine' },
      { icon: 'lanterne-mineur', text: 'Nouvel accueil : ton profil en premier, une lanterne dont la flamme grandit avec ta série' },
      { icon: 'horloge', text: 'Les nouveaux thèmes arrivent maintenant à 2 h du matin' },
    ],
    items: [
      'Duels : onglet « Duel » de l\'accueil. Choisis un adversaire parmi les joueurs, vous jouez les mêmes 7 thèmes chacun de votre côté. Pendant la partie, tes réponses sont « validées » sans révéler leur rareté : le résultat se révèle thème par thème, avec les deux foreuses qui creusent en direct, quand vous avez fini tous les deux.',
      'Deux modes : Standard (30 secondes par thème) et « À l\'aise » (sans chrono). Le mode « À l\'aise » existe aussi dans l\'onglet Infini ; il ne compte ni pour les statistiques ni pour les badges de forage, ni pour les classements.',
      'Nouveaux badges de duel : Attaquant, Défenseur, Diplomate, Sentinelle, Rival, Souffre-douleur, Némésis, Invaincu, Duel parfait (gagner les 7 thèmes) et Remontada (gagner après avoir perdu les 3 premiers thèmes), avec de nouvelles apparences de foreuse à débloquer.',
      'Défi collectif : chaque point de ton forage du jour fait avancer la foreuse dans un tunnel commun. Objectif : 10 000 points avant la fin du mois. Chaque joueur a sa couleur dans le tunnel, et un tas de diamants t\'attend au bout. Les défis de la semaine et du mois sont réunis dans l\'encadré « Défis ».',
      'Comparatif : touche un symbole sous la réponse d\'un autre joueur pour réagir (bien vu, j\'aime, bien creusé, audacieux, surprenant).',
      'Récap du lundi : à la première ouverture de la semaine, le podium de la semaine écoulée sous un feu d\'artifice, puis la Gazette de la mine avec les moments forts et ton bilan.',
      'Accueil : ton profil passe en premier avec ta série (la lanterne s\'enflamme de plus en plus jusqu\'à un mois d\'affilée), tes étais (touche-les pour tout savoir), les prochains badges à obtenir, puis les modes de jeu, les défis et le podium (jour, semaine ou mois).',
      'Modes daltoniens : les décors du forage, les graphiques et toute l\'interface sont désormais adaptés.',
      'Le changement de jour se fait maintenant à 2 h du matin au lieu de minuit : les nouveaux thèmes, les séries et les défis changent à ce moment-là.',
    ],
  },
  {
    id: 8,
    date: '2026-10-23',
    title: 'Revanche, musée des pépites et journal de la mine',
    highlights: [
      { icon: 'sabre', text: 'Revanche en un clic à la fin d\'un duel' },
      { icon: 'pepite', text: 'Le musée des pépites : toutes les réponses introuvables, trouvées par le groupe' },
      { icon: 'livre', text: 'Le Petit Mineur : les dernières nouvelles de la mine, sur l\'accueil' },
      { icon: 'coeur', text: 'Badges de réactions (Public conquis, Star de la mine, Supporter, Meilleur fan) et deux nouvelles foreuses' },
      { icon: 'galerie', text: 'Installe le jeu sur l\'écran d\'accueil de ton téléphone (Paramètres)' },
    ],
    items: [
      'Revanche : à la fin d\'un duel, un bouton relance tout de suite un duel contre le même joueur, avec les mêmes règles.',
      'Musée des pépites : une nouvelle section de l\'accueil qui liste, jour après jour, les réponses que personne n\'avait trouvées avant, avec le thème et le joueur. Les pépites du jour apparaissent le lendemain.',
      'Le Petit Mineur : sur l\'accueil, une section dépliable avec les trois nouvelles les plus récentes (duels, pépites, badges, défi collectif) ; le bouton « Plus de nouvelles » en montre dix. Une pépite est annoncée sans dire laquelle.',
      'Badges de réactions : « Public conquis » (10 réactions reçues), « Star de la mine » (50 : foreuse Ovation), « Supporter » (20 réactions données) et « Meilleur fan » (100 : foreuse Claque).',
      'Messages du Contre maître : le responsable du jeu peut maintenant passer une annonce à tous les joueurs, affichée en haut de l\'accueil jusqu\'à ce que chacun l\'ait lue.',
      'Installation : dans les Paramètres, « Installer l\'application » ajoute le jeu à l\'écran d\'accueil de ton téléphone ; il s\'ouvre alors en plein écran.',
    ],
  },
];

const LATEST_NEWS_ID = NEWS[NEWS.length - 1].id;

/** Notes plus récentes que `seen`. */
function unseenNews(seen) {
  return NEWS.filter((n) => n.id > (seen || 0));
}

module.exports = { NEWS, LATEST_NEWS_ID, unseenNews };
