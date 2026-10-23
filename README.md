# Spéléologie ⛏️

Jeu quotidien en pixel art, inspiré de *Krillion* : chaque jour, 7 thèmes, et pour chacun
**30 secondes** pour donner la réponse **la plus improbable** possible. Chaque point fait
descendre une foreuse à travers les couches de la Terre : terre végétale, limon, pierre bleue,
veine de houille, croûte, manteau… et, pour un sans-faute de réponses introuvables (700 points),
le **centre de la Terre**.

- Comptes avec identifiant + mot de passe, session conservée 90 jours sur l'appareil.
- Code de récupération remis à l'inscription (mot de passe oublié).
- Podiums du jour, de la semaine (lundi → dimanche) et du mois, à l'heure de Bruxelles.
- Mode entraînement illimité (thèmes au hasard, ne compte pas).
- Tolérance orthographique (accents, majuscules, articles, pluriels, fautes de frappe) : quand la
  saisie n'est pas exactement le nom d'une réponse (faute de frappe, variante), le jeu propose la
  réponse reconnue et le joueur valide ou refuse. Fautes tolérées selon la longueur (aucune jusqu'à
  3 lettres, 1 de 5 à 8, 2 de 9 à 12, 3 au-delà) ; une touche voisine du clavier (AZERTY ou QWERTY)
  ne compte que pour une demi-faute, même sur 4 lettres ; le nom de famille seul est reconnu quand
  il est unique dans le thème.
- Ajustement manuel (responsable) : dans la liste des signalements, « Accorder les points » à un joueur dont la réponse signalée est reconnue par le thème (`POST /api/admin/reports/credit`).
- Pendant le forage : chrono chiffré qui tremble à 5 s, pastilles de rareté, clavier gardé ouvert entre deux thèmes (champ relais), Entrée enchaîne les étapes. Accueil : lanterne de série et badge le plus proche. Paramètres : thème clair, modes daltoniens (rouge-vert, bleu-jaune, gris). Mode illimité : compteur des réponses données (`training_answer_counts`), sans historique et hors du modèle de rareté.
- Joker, thématisé en « galerie de secours » : un thème par partie (forage du jour ou illimité) peut être changé gratuitement, par le thème de remplacement du jour (`daily_spare`, le même pour tous) ; ensuite, passer coûte le thème. Chaque pépite ajoute du scintillement sonore et une vibration (`Sound.tier`, `Sound.buzz`).
- Profil : page réorganisée (profil et avatar, badges, atelier, carnet, bilan, statistiques, propositions). Avatar pixel art personnalisable (`src/avatar.js`, `public/avatar.js`) : choix par flèches, éléments à débloquer avec des badges (dont ceux des défis de la semaine), affiché dans les listes, sur le podium et pendant le forage (hublot ou surface). Changement de pseudo (`POST /api/profile/rename`) : mot de passe demandé, un changement par semaine, pas de doublon. Neuf nouveaux défis de la semaine (un par palier de rareté, score cumulé, parties illimitées, forage de 450 points, rapidité, week-end ; table `training_log`).
- Carnet : bilan du mois, calendrier des jours forés, courbe des scores, répartition par rareté, coupe de la Terre ; accueil : défi de la semaine (`src/challenges.js`) ; nouveaux badges (vitesse, séries, pépites, entraînement, défis, œil de lynx) ; tableau de bord du responsable (`/api/admin/dashboard`).
- Étais de galerie (gels de série) : un par tranche de 7 jours forés d'affilée, 3 au maximum, ils pardonnent automatiquement un jour manqué ; seuls les jours manqués à partir de `FREEZE_FROM` (21 octobre 2026) sont pardonnés (`BadgeService.streakInfo`).
- Apparences du chrono (`public/timers.js`, `users.skin_timer`) : batterie de lampe offerte ; mèche de dynamite (badges « In extremis » ou « Filon »), wagonnet (« Habitué du terrain d'essai » ou « Mois complet »), lanterne (« Lanterne rallumée » ou « Boyau étroit »).
- Carnet : sections repliables (état gardé sur l'appareil) et badges en tableau, le détail s'ouvrant dans une fenêtre flottante. Dans le récapitulatif, un champ de recherche filtre les réponses d'un thème (noms et variantes).
- Fin de partie : position parmi les joueurs du jour, carnet de forage, nombre de joueurs ayant
  donné la même réponse et, pour chaque thème, toutes les réponses classées par rareté.
- Bruitages synthétisés (sans fichier son), taille du texte réglable, mode daltonien.
- Statistiques du carnet (forages du jour et mode illimité), badges de thèmes rencontrés (tous modes) et comparaison thème par thème des réponses des joueurs (`/api/compare`, une fois son propre forage terminé).
- Badges (séries de jours, profondeur, pépites, exploits, premières places des podiums, jours
  particuliers comme Halloween, la Sainte-Barbe ou le passage à la nouvelle année) qui débloquent
  des carrosseries et des forets pour la foreuse, choisis dans l'atelier (`src/badges.js`).
- Plus de 300 thèmes actifs, tous des listes fermées et complètes (« Un film avec Jim Carrey »,
  « Une fleur qui sent mauvais », « Un pays où l'on roule à gauche »…) : comme seules les réponses
  listées sont acceptées, un thème trop large refuserait de bonnes réponses. Plus de 15 000 réponses,
  avec une difficulté estimée pour un public belge.

- Jour de jeu : il commence à 2 h, heure de Bruxelles (`DAY_START_HOUR` dans `src/config.js`), pas à minuit.
- Accueil : profil en premier (série avec une lanterne dont la flamme grandit jusqu'à 30 jours, étais en pastille discrète avec fenêtre d'explication, prochains badges), puis « Jouer » (onglets Forage, Duel, Infini), « Défis » (semaine et mois), « Podium » (jour, semaine, mois), règles. Courte note « Quoi de neuf ? » (`highlights` dans `src/news.js`) avec le détail repliable.
- Duels (`src/duels.js`, tables `duels`, `duel_themes`, parties en mode `duel`) : un joueur en défie un autre sur 7 thèmes tirés au sort, chacun joue sa partie quand il veut. Pendant la partie, ni points ni rareté (les réponses sont seulement « validées ») ; le résultat se révèle quand les deux ont fini, thème après thème avec les deux foreuses. Deux modes : standard (30 s) et « à l'aise » (sans chrono, `games.no_timer`, aussi proposé en mode illimité ; ne compte ni pour les statistiques ni pour les badges de forage). Un duel sans réponse expire au bout de 4 jours ; 3 duels ouverts au plus par joueur. Badges de duel (attaquant, défenseur, diplomate, sentinelle, rival, souffre-douleur, némésis, invaincu, duel parfait, remontada) et apparences de foreuse associées. L'ancienne base est migrée au démarrage pour accepter le mode `duel` (copie `.avant-duels` à côté du fichier).
- Réactions (`POST /api/reactions`, table `reactions`) : une par réponse des autres dans le comparatif.
- Défi collectif du mois (`src/collective.js`) : tous les points des forages du jour du mois s'additionnent vers 10 000 ; un tunnel avec la part de chaque joueur et un tas de diamants au bout. Les forages joués avant la mise en place du défi comptent aussi (le mois entier).
- Récap du lundi (`src/recap.js`, `users.recap_seen`) : à la première ouverture de la nouvelle semaine, podium sous un feu d'artifice puis « La Gazette de la mine » (moments forts, bilan personnel).
- Modes daltoniens : filtre de couleur sur toute la page (`filter` sur `<html>`, voir `style.css`) plus symboles de rareté.

Aucune dépendance externe : Node.js ≥ 22.13 suffit (base SQLite intégrée à Node).

## Lancer en local

```bash
npm start            # http://localhost:3000
npm test             # tests automatiques
npm run themes:check # vérifie les fichiers de thèmes
```

La base de données est créée dans `var/speleologie.sqlite` (modifiable avec `DATA_DIR`).

## Comment la rareté est calculée

Chaque réponse d'un thème a un **niveau de difficulté** de 1 (évident) à 5 (très obscur), estimé
pour des joueurs belges : *Herve* est un fromage de niveau 1, *Anderlecht* et le *Standard* sont
des clubs de niveau 1, *Taleggio* est de niveau 4, etc.

1. **A priori** : chaque niveau est environ 3 fois moins probable que le précédent. Cela donne la
   probabilité qu'un joueur pris au hasard pense à cette réponse.
2. **Apprentissage** : chaque réponse donnée en partie quotidienne met à jour ces probabilités
   (modèle de Dirichlet-multinomial). Avec peu de joueurs, l'a priori domine (il pèse autant que
   500 réponses) ; au fil des semaines, les vraies habitudes des joueurs prennent le dessus.
   Une réponse que tout le monde donne finit par ne plus rien rapporter, une réponse que personne
   ne trouve devient plus précieuse.
3. **Points** : ils dépendent de la « surprise » de la réponse (−log p) par rapport à la réponse la
   plus attendue du thème : de **10** (gravier) à **90** (rubis). Une réponse rare (niveau 4 ou 5) que
   **personne n'avait encore donnée** est une **pépite : 100 points**. Les paliers, du plus
   courant au plus rare : gravier, soufre, cuivre, rubis, pépite. 600 points = le centre de la Terre.

Sans données, cela donne 10 / 29 / 48 / 100 / 100 points pour les niveaux 1 à 5.
Les réglages sont dans `src/scoring.js` (`LEVEL_WEIGHTS`, `PRIOR_STRENGTH`).

## Ajouter ou modifier des thèmes

Un fichier par thème dans `data/themes/` :

```
titre: Un fromage
1: Camembert; Herve = Fromage de Herve; Brie
2: Maredsous; Passendale
4: Taleggio; Plateau de Herve
5: Casu marzu
```

- le chiffre est le niveau de difficulté (1 à 5) ;
- les réponses sont séparées par `;` ;
- les variantes d'une même réponse sont séparées par `=` (la première est le nom affiché) ;
- `actif: non` retire le thème du tirage (le fichier reste pour l'historique des parties).
- Un thème doit être une liste **fermée et complète** : toute bonne réponse qu'un joueur pourrait
  taper doit y figurer. Mieux vaut un critère qui restreint (« Un film réalisé par Alfred
  Hitchcock ») qu'une catégorie ouverte (« Un film »).
- Pas d'exemples dans le titre (« Un agrume », pas « Un agrume (citron, orange…) »), sauf si le
  thème est si précis que le titre serait flou sans eux (« Un pinnipède (animal proche du phoque) »).
  Les dates de coupure (« jusqu'en 2025 ») et les définitions utiles restent.

Lance ensuite `npm run themes:check` pour repérer les doublons.

Pour enrichir les thèmes avec ce que les joueurs tapent :

```bash
npm run answers:report            # réponses refusées les plus fréquentes et réponses les plus données
npm run answers:report -- fromages
```

Une réponse souvent refusée mais valable mérite d'être ajoutée ; une réponse beaucoup plus
fréquente que son niveau ne le laisse penser peut descendre d'un niveau.

Les joueurs peuvent aussi **signaler** une réponse refusée qu'ils pensent correcte (bouton « Je
pense que … est correcte » pendant la manche, ou « Une bonne réponse manque ? » dans la liste des
réponses d'un thème). Aucun point n'est donné ; le responsable du jeu retrouve les signalements
dans son carnet (« Réponses signalées ») et peut les copier pour les ajouter aux thèmes. Le
responsable est le premier compte créé, ou les identifiants listés dans `ADMIN_USERS`.

Rien n'est traité ni crédité automatiquement : un signalement reste « à vérifier » jusqu'à ce que le
responsable le marque comme traité, et les points ne sont jamais accordés tout seuls. Quand la réponse
est reconnue par le thème, la liste propose « Accorder les points » pour chaque joueur concerné (sur la
manche où le signalement a été fait, ou à défaut sa dernière manche sans réponse valide sur ce thème).
Les points suivent la rareté du moment, une seule fois par signalement.
Les manches de duel se créditent de la même façon : le résultat du duel est alors révisé (scores, vainqueur, badges) et les deux joueurs le revoient avec la mention « révisé ». Le bouton « Accepter » (`POST /api/admin/reports/grant`) accorde les points à tous les signalants, envoie le retour « acceptée » et classe le signalement.
Décisions en lot (`POST /api/admin/reports/decisions`) : le responsable colle une liste JSON `{ themeId, input, verdict: "accepter" | "refuser", answer?, message? }` ; « Aperçu » ne modifie rien, « Appliquer » accorde les points, envoie les retours et classe les signalements.

## Administration

- **Mot de passe perdu sans code de récupération** :
  `npm run password:reset -- <identifiant>` affiche un mot de passe temporaire et un nouveau code.
- **Durée du chrono** : variable d'environnement `TIMER_SECONDS` (30 par défaut).

## Mise en ligne

Le jeu est hébergé sur un serveur personnel. Chaque fusion sur `main` lance le workflow
`.github/workflows/deploy.yml` :

1. les tests sont exécutés (rien n'est déployé s'ils échouent) ;
2. le port SSH du serveur est ouvert le temps du déploiement (action `.github/actions/firewall`,
   pare-feu OPNsense), puis refermé à la fin, même en cas d'échec ;
3. la nouvelle version est copiée dans `$SPELEO_DEPLOY_PATH/releases/<commit>`, le lien
   `current` bascule dessus d'un coup et le service `speleologie` redémarre.

Le workflow ne vérifie pas que le jeu a bien redémarré : `GET /api/health` (qui répond
`{"ok":true}` quand le jeu et sa base fonctionnent) peut servir à une surveillance côté serveur.

Les deux versions précédentes restent sur le serveur pour un retour en arrière (refaire pointer
`current` vers l'une d'elles, puis redémarrer le service).

Secrets attendus dans l'environnement GitHub `prod` : `OPNSENSE_CREDENTIALS`,
`OPNSENSE_ENDPOINT`, `OPNSENSE_RULE_ID`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`,
`DEPLOY_USER`, `SPELEO_DEPLOY_PATH`.

### À préparer une fois sur le serveur

- **Node.js ≥ 22.13** (aucune dépendance npm à installer).
- **Le service** : modèle dans [`deploy/speleologie.service`](deploy/speleologie.service), à adapter
  (chemins, port, utilisateur). Variables importantes :
  - `DATA_DIR` : dossier **permanent hors des versions**, qui contiendra `speleologie.sqlite`.
    En production, le jeu refuse de démarrer sans cette variable, pour ne jamais ranger la base
    dans un dossier de version qui sera supprimé.
  - `HOST=127.0.0.1` : le jeu n'écoute que localement, derrière le proxy.
  - `ADMIN_USERS` (facultatif) : identifiants, séparés par des virgules, qui voient les réponses
    signalées ; par défaut, le premier compte créé.
  - `PORT` : le port vers lequel pointe le proxy HTTPS.
- **Le droit de redémarrer le service** pour l'utilisateur de déploiement, par exemple dans
  `/etc/sudoers.d/speleologie` :
  `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart speleologie`.
- **Un proxy HTTPS** (nginx, Caddy, Traefik…) vers `127.0.0.1:<port>`. HTTPS est obligatoire :
  en production, le cookie de session n'est envoyé qu'en connexion sécurisée. Le proxy doit
  ajouter l'adresse du visiteur dans `X-Forwarded-For` (le jeu en lit la dernière valeur pour
  limiter les tentatives de connexion).
- **Derrière un tunnel Cloudflare** seulement : ajouter `Environment=CLIENT_IP_HEADER=cf-connecting-ip`
  au service, pour que le jeu lise l'adresse réelle des joueurs dans l'en-tête posé par Cloudflare.
  Sans Cloudflare devant le serveur, ne pas le régler : un visiteur pourrait inventer cet en-tête.
- **Des sauvegardes** de `DATA_DIR/speleologie.sqlite`, par exemple chaque nuit :
  `sqlite3 speleologie.sqlite ".backup sauvegarde.sqlite"`.

Scripts d'administration sur le serveur, depuis le dossier `current` et avec les mêmes variables
que le service : `DATA_DIR=… npm run answers:report`, `DATA_DIR=… npm run password:reset -- <identifiant>`.

Le `Dockerfile` reste disponible pour un hébergement en conteneur (volume monté sur `/data`).

Le site n'est pas référencé par les moteurs de recherche, et il faut se connecter pour jouer.

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `server.js` | Serveur HTTP, routes de l'API, sessions |
| `src/game.js` | Thèmes du jour, parties, chrono, podium, réactions |
| `src/duels.js` | Duels : défis, parties jumelles, résultat |
| `src/collective.js` | Défi collectif du mois |
| `src/recap.js` | Récap du lundi (Gazette de la mine) |
| `src/scoring.js` | Modèle probabiliste de rareté |
| `src/matching.js` | Normalisation et tolérance orthographique |
| `src/themes.js` | Lecture des fichiers de thèmes |
| `src/auth.js` | Mots de passe (scrypt), codes de récupération, limitation des tentatives |
| `public/pixel.js` | Rendu pixel art de la coupe de terrain, de son décor et de la foreuse |
| `public/sound.js` | Bruitages (Web Audio) |
| `public/icons.js` | Icônes des badges |
| `src/badges.js` | Badges, calendrier des jours particuliers, apparences débloquées |
| `public/app.js` | Interface du jeu |

Polices : *Press Start 2P* et *VT323* (licence SIL OFL, fichiers dans `public/fonts/`).
