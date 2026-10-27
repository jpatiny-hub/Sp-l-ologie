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
    title: 'Duels, défi collectif, musée des pépites et nouvel accueil',
    highlights: [
      { icon: 'sabre', text: "Duels : défie un joueur sur 7 thèmes, au chrono ou « À l'aise » (sans chrono), avec revanche en un clic" },
      { icon: 'diamant', text: 'Défi collectif du mois : 10 000 points à creuser ensemble jusqu\'au diamant' },
      { icon: 'coeur', text: 'Réactions aux réponses des autres, avec leurs badges et deux nouvelles foreuses' },
      { icon: 'pepite', text: 'Le musée des pépites et « Le Petit Mineur », les nouvelles de la mine' },
      { icon: 'trophee', text: 'Le lundi, le récap de la semaine : la Gazette de la mine' },
      { icon: 'lanterne-mineur', text: 'Nouvel accueil : ton profil en premier, une lanterne dont la flamme grandit avec ta série' },
      { icon: 'galerie', text: "Installe le jeu sur l'écran d'accueil de ton téléphone (Paramètres)" },
      { icon: 'horloge', text: 'Les nouveaux thèmes arrivent maintenant à 2 h du matin' },
    ],
    items: [
      'Duels : onglet « Duel » de l\'accueil. Choisis un adversaire parmi les joueurs, vous jouez les mêmes 7 thèmes chacun de votre côté. Pendant la partie, tes réponses sont « validées » sans révéler leur rareté : le résultat se révèle thème par thème, avec les deux foreuses qui creusent en direct, quand vous avez fini tous les deux. À la fin, un bouton lance tout de suite la revanche.',
      'Deux modes : Standard (30 secondes par thème) et « À l\'aise » (sans chrono). Le mode « À l\'aise » existe aussi dans l\'onglet Infini ; il ne compte ni pour les statistiques ni pour les badges de forage, ni pour les classements.',
      'Nouveaux badges de duel : Attaquant, Défenseur, Diplomate, Sentinelle, Rival, Souffre-douleur, Némésis, Invaincu, Duel parfait (gagner les 7 thèmes) et Remontada (gagner après avoir perdu les 3 premiers thèmes), avec de nouvelles apparences de foreuse à débloquer.',
      'Défi collectif : chaque point de ton forage du jour fait avancer la foreuse dans un tunnel commun. Objectif : 10 000 points avant la fin du mois. Chaque joueur a sa couleur dans le tunnel, et un tas de diamants t\'attend au bout. Les défis de la semaine et du mois sont réunis dans l\'encadré « Défis ».',
      'Comparatif : touche un symbole sous la réponse d\'un autre joueur pour réagir (bien vu, j\'aime, bien creusé, audacieux, surprenant). Badges « Public conquis » (10 réactions reçues), « Star de la mine » (50 : foreuse Ovation), « Supporter » (20 réactions données) et « Meilleur fan » (100 : foreuse Claque).',
      'Musée des pépites : une section de l\'accueil qui liste, jour après jour, les réponses que personne n\'avait trouvées avant, avec le thème et le joueur. Les pépites du jour apparaissent le lendemain.',
      'Le Petit Mineur : une section dépliable de l\'accueil avec les trois nouvelles les plus récentes (duels, pépites, badges, défi collectif) ; « Plus de nouvelles » en montre dix. Une pépite est annoncée sans dire laquelle.',
      'Récap du lundi : à la première ouverture de la semaine, le podium de la semaine écoulée sous un feu d\'artifice, puis la Gazette de la mine avec les moments forts et ton bilan.',
      'Accueil : ton profil passe en premier avec ta série (la lanterne s\'enflamme de plus en plus jusqu\'à un mois d\'affilée), tes étais (touche-les pour tout savoir), les prochains badges à obtenir, puis les modes de jeu, les défis et le podium (jour, semaine ou mois).',
      'Installation : dans les Paramètres, « Installer l\'application » ajoute le jeu à l\'écran d\'accueil de ton téléphone ; il s\'ouvre alors en plein écran.',
      'Messages du Contre maître : le responsable du jeu peut maintenant passer une annonce à tous les joueurs, affichée en haut de l\'accueil jusqu\'à ce que chacun l\'ait lue.',
      'Modes daltoniens : les décors du forage, les graphiques et toute l\'interface sont désormais adaptés.',
      'Le changement de jour se fait maintenant à 2 h du matin au lieu de minuit : les nouveaux thèmes, les séries et les défis changent à ce moment-là.',
    ],
  },
  {
    id: 8,
    date: '2026-10-24',
    title: "Halloween, badges de duel et accueil allégé",
    highlights: [
      { icon: 'citrouille', text: "L'ambiance d'Halloween jusqu'au 31 octobre : ossements, fantômes, yeux dans le noir et araignée" },
      { icon: 'muraille', text: "Nouveaux badges de duel : victoires écrasantes en attaque et en défense, et égalités" },
      { icon: 'lanterne-mineur', text: "Accueil allégé : un tiroir « Plus », des défis repliés" },
      { icon: 'coeur', text: "Une alerte quand le responsable répond à l'un de tes signalements" },
    ],
    items: [
      "Halloween : du 24 au 31 octobre, le jeu se pare de décors macabres. Sous la terre, des ossements et des fantômes ; dans le noir, des yeux qui clignent ; une araignée descend de temps en temps. Les éléments macabres s'invitent aussi dans les défis. Tout disparaît automatiquement après le 31 ; si tu préfères du calme, l'option « réduire les animations » est respectée.",
      "Badges de duel : « Coup de boutoir » et « Annihilation » récompensent les grandes victoires quand tu lances le duel (foreuses Bélier et Blindé) ; « Imprenable » et « Muraille de Troie » celles où tu relèves le duel (foreuses Pierre et Muraille de Troie). Chaque camp a deux paliers, selon l'avance en points et le nombre de thèmes gagnés sur 7.",
      "Les égalités ont aussi leurs badges : « Frères d'armes » (une égalité), « Match miroir » (trois égalités) et « Jumeaux » (exactement les mêmes points sur les 7 thèmes, avec la foreuse Jumeaux).",
      "Accueil allégé : les défis se replient avec un petit résumé, les prochains badges aussi, et un onglet « Plus » ouvre un tiroir (musée des pépites, Petit Mineur, règles, invitation, Contre maître).",
      "Inviter des amis : un bouton de partage du lien du jeu, en haut de l'écran et dans les Paramètres.",
      "Signalements : quand le responsable répond à l'un de tes signalements (accepté, refusé, ou réponse ajoutée au thème), un bandeau t'attend sur l'accueil et mène à la liste « Mes réponses signalées ». Les duels dont le score a été corrigé t'en informent aussi.",
      "Thèmes : le thème des gares belges repose désormais sur les chiffres SNCB 2025 (les 40 gares les plus fréquentées en semaine) ; « Un pays d'Afrique » refuse les anciens États historiques situés hors d'Afrique ; les parties du corps acceptent coude, genou, pied et autres noms courants ; et de nombreuses réponses signalées ont été ajoutées.",
    ],
  },
  {
    id: 9,
    date: '2026-10-26',
    title: 'Duels : le contremaître vérifie',
    highlights: [
      { icon: 'sabre', text: 'Duels : le résultat est dévoilé le lendemain matin, après vérification du contremaître' },
      { icon: 'diamant', text: "Une annonce sur l'accueil quand le défi collectif du mois est réussi" },
      { icon: 'galerie', text: 'Le défi de la semaine réussi : ton personnage attrape le diamant' },
      { icon: 'trophee', text: 'Podiums du jour, de la semaine et du mois, avec feu d\'artifice et tes statistiques' },
      { icon: 'coeur', text: 'Plus de 150 nouveaux thèmes — merci aux mineurs pour vos propositions !' },
    ],
    items: [
      "Duels : quand vous avez fini tous les deux, le contremaître vérifie les plans. Le résultat, l'animation, les badges et les pépites de duel sont dévoilés le lendemain matin, après 2 h 30, pour que les réponses signalées soient tranchées avant. Ton duel apparaît en attendant sous « Chez le contremaître ».",
      "Défi du mois : quand tout le monde a creusé jusqu'au diamant, une annonce s'affiche sur l'accueil. Défi de la semaine : une fois réussi, ton personnage va jusqu'au diamant et le tient dans sa main.",
      "Podiums : chaque matin, le podium de la veille t'attend avec un feu d'artifice, puis ta Gazette personnelle. Le lundi, tu vois aussi la semaine écoulée, et le 1er du mois le podium du mois. Chaque célébration est un peu différente !",
      "Nouveaux thèmes : plus de 150 filons viennent d'être ouverts. Un grand merci aux mineurs qui ont proposé des thèmes : continuez à les envoyer, la galerie n'a pas de fond !",
    ],
  },
  {
    id: 10,
    date: '2026-10-27',
    title: 'Messagerie entre mineurs',
    highlights: [
      { icon: 'coeur', text: 'Une messagerie pour écrire à un autre joueur (enveloppe en haut de l\'écran)' },
      { icon: 'galerie', text: 'Récapitulatif du jour plus lisible : un thème par ligne, à déplier pour voir les autres joueurs' },
      { icon: 'horloge', text: 'Chrono à zéro : plus de galerie de secours proposée, on passe directement au thème suivant' },
      { icon: 'sabre', text: 'Jusqu\'à 5 duels en parallèle, et revanche possible dès que le contremaître vérifie' },
    ],
    items: [
      "Messagerie : clique sur l'enveloppe en haut de l'écran pour écrire à un autre joueur. Un point rouge indique les messages non lus. Les messages sont privés et effacés après 90 jours ; tu peux bloquer un joueur ou signaler un message qui te dérange au responsable du jeu.",
      "Récapitulatif du jour : les thèmes sont en liste, avec ta réponse et ton score ; touche un thème pour voir les réponses de tous les autres joueurs.",
      "Duels : tu peux maintenant avoir 5 duels en cours en même temps. Quand un duel est terminé des deux côtés et que le contremaître le vérifie, tu peux déjà défier de nouveau le même joueur.",
      "Chrono : quand le décompte arrive à zéro, la galerie de secours n'est plus proposée (elle obligeait à revenir en arrière) ; le thème est simplement noté « temps écoulé ».",
    ],
  },
  {
    id: 11,
    date: '2026-10-28',
    title: 'Nouvelle mine : accueil, profil et cosmétiques',
    highlights: [
      { icon: 'maison', text: 'Un accueil et un profil entièrement refaits, avec une petite taupe mineuse' },
      { icon: 'casque', text: 'Des titres à afficher à côté de ton pseudo, et plein de nouveaux cosmétiques' },
      { icon: 'taupe', text: 'Un court tutoriel pour (re)découvrir le principe du jeu' },
    ],
    items: [
      "Interface refaite : nouvel accueil (ton mineur, le forage du jour, la vie de la mine, le podium), barre de navigation en bas de l'écran avec des pastilles pour les nouveautés, un profil en onglets avec carte de mineur, tuiles, vitrine et vestiaire, et un journal de la mine (Petit Mineur) qu'on peut feuilleter jour par jour.",
      "Titres : touche le cadre de titre sur ta carte de mineur pour choisir celui qui s'affiche à côté de ton pseudo. Ils se gagnent avec les jours forés et avec les badges.",
      "Cosmétiques : épées, haches et autres forets, blindages armés, casques, armures, tenues de pirate ou de cuisinier, monocle, cache-œil, barbes et traits du visage. Plusieurs se gagnent en duel.",
      "Duels : un défi doit être relevé dans les 4 jours. Le décompte est affiché, et le Contremaître t'envoie un message pour te prévenir (puis un rappel à 24 h et à 6 h de la fin) : sans réponse, c'est forfait et le duel est annulé.",
      "Tutoriel : cinq écrans pour rappeler le principe (la réponse correcte la moins probable rapporte le plus de points) et les modes de jeu. Tu peux le revoir depuis les réglages.",
    ],
  },
];

const LATEST_NEWS_ID = NEWS[NEWS.length - 1].id;

/** Notes plus récentes que `seen`. */
function unseenNews(seen) {
  return NEWS.filter((n) => n.id > (seen || 0));
}

module.exports = { NEWS, LATEST_NEWS_ID, unseenNews };
