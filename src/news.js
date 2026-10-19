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
      'Dans le podium (onglet « Jour ») et à la fin de ton forage, tu peux comparer tes réponses et tes points avec ceux des autres joueurs, thème par thème.',
    ],
  },
];

const LATEST_NEWS_ID = NEWS[NEWS.length - 1].id;

/** Notes plus récentes que `seen`. */
function unseenNews(seen) {
  return NEWS.filter((n) => n.id > (seen || 0));
}

module.exports = { NEWS, LATEST_NEWS_ID, unseenNews };
