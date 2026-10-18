# Spéléologie ⛏️

Jeu quotidien en pixel art, inspiré de *Krillion* : chaque jour, 7 thèmes, et pour chacun
**30 secondes** pour donner la réponse **la plus improbable** possible. Chaque point fait
descendre une foreuse à travers les couches de la Terre : terre végétale, limon, pierre bleue,
veine de houille, croûte, manteau… et, pour un sans-faute de réponses introuvables (700 points),
le **centre de la Terre**.

- Comptes avec identifiant + mot de passe, session conservée 90 jours sur l'appareil.
- Code de récupération remis à l'inscription (mot de passe oublié).
- Podium hebdomadaire (somme des forages du lundi au dimanche, heure de Bruxelles).
- Mode entraînement illimité (thèmes au hasard, ne compte pas).
- Tolérance orthographique (accents, majuscules, articles, pluriels, fautes de frappe).
- 75 thèmes (culture générale, sciences, cinéma, musique, littérature, Belgique…), près de
  20 000 réponses, avec une difficulté estimée pour un public belge.

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
   plus attendue du thème : de **10** (évident) à **90** (très rare). Une réponse très rare que
   **personne n'avait encore donnée** est une **pépite : 100 points**.

Sans données, cela donne 10 / 29 / 48 / 68 / 100 points pour les niveaux 1 à 5.
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
- `actif: non` retire le thème du tirage.

Lance ensuite `npm run themes:check` pour repérer les doublons.

Pour enrichir les thèmes avec ce que les joueurs tapent :

```bash
npm run answers:report            # réponses refusées les plus fréquentes et réponses les plus données
npm run answers:report -- fromages
```

Une réponse souvent refusée mais valable mérite d'être ajoutée ; une réponse beaucoup plus
fréquente que son niveau ne le laisse penser peut descendre d'un niveau.

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
| `src/game.js` | Thèmes du jour, parties, chrono, podium |
| `src/scoring.js` | Modèle probabiliste de rareté |
| `src/matching.js` | Normalisation et tolérance orthographique |
| `src/themes.js` | Lecture des fichiers de thèmes |
| `src/auth.js` | Mots de passe (scrypt), codes de récupération, limitation des tentatives |
| `public/pixel.js` | Rendu pixel art de la coupe de terrain et de la foreuse |
| `public/app.js` | Interface du jeu |

Polices : *Press Start 2P* et *VT323* (licence SIL OFL, fichiers dans `public/fonts/`).
