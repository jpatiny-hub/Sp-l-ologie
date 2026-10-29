# Spéléologie — notes pour Claude

Jeu quotidien en pixel art (quiz « la réponse la plus improbable ») pour un petit groupe de scientifiques belges.
Le responsable du jeu, Jonas, écrit en français et se tutoie : réponds en français simple et concis, sans jargon.
Détails du jeu : `README.md`. Idées en attente : `IDEES.md`.

## Règles permanentes de Jonas
- **Pas de fusion ni de déploiement** sans son accord, sauf déploiement programmé ou s'il écrit « déploie », « mets en ligne », « directement » ou « maintenant ». Chaque fusion dans `main` déclenche un déploiement en production.
- Un changement de réponses seulement (thèmes) : déploiement sans note de mise à jour.
- Les mesures anti-triche ne sont jamais annoncées aux joueurs.
- Thèmes : ne jamais écraser un fichier existant ; le titre ne cite pas d'exemples de réponses ; garder les formes « Méga » des Pokémon.
- Résultats de duel cachés jusqu'à la validation ; les réactions de la mascotte en duel restent neutres (elles ne révèlent jamais la rareté).
- L'ambiance sonore (coups de pioche, grondement, musiques, bruits de boutons, chrono sonore) est ouverte à tous depuis le 29 octobre ; coups de pioche, grondement et musique « Galerie » sont activés par défaut. Les autres nouveautés se testent d'abord chez le responsable (bêta) avant tout le monde.
- Évite les minuteries inutiles. Ne notifie pas les joueurs sans demande explicite.

## Architecture
- Node ≥ 22, `node:sqlite`, `node:http`, **aucune dépendance npm**, CSP stricte (pas de script en ligne).
- `server.js` : routes (`'METHODE /chemin'`). `src/` : un service par domaine (`game.js`, `duels.js`, `messages.js`, `badges.js`, `suspicion.js`, `matching.js`, `scoring.js`, `themes.js`…).
- `public/` : `index.html`, `app.js` (très gros : ne le lis jamais en entier, cherche avec Grep puis lis la zone), `style.css`, `sound.js`, `ambience.js`, `pixel.js`, `icons.js`, `avatar.js`.
- `data/themes/*.txt` : un fichier par thème (format dans l'en-tête de `src/themes.js`). `data/special-days.json` : jours aux thèmes imposés.
- Base SQLite créée au démarrage (`src/db.js`, migrations par ajout de colonnes) ; sauvegardes automatiques.
- Jour de jeu : commence à 2 h, heure de Bruxelles. Validation des duels le lendemain à 2 h 30.

## Commandes
- `npm test` (≈ 120 tests, doit être entièrement vert avant tout push) ; un test aléatoire de `test/reverse.test.js` peut échouer isolément : relancer une fois.
- `npm run themes:check` : vérifie les fichiers de thèmes (doublons, niveaux).
- `npm start` : serveur local sur le port 3000 (`DATA_DIR`, `PORT` modifiables).
- Navigateur de test : Playwright est installé ; passer par `evaluate(() => el.click())` si un tutoriel masque l'écran.

## Façon de travailler
- Une branche par sujet, PR vers `main`. Déploiement = fusion en squash dans `main` ; le workflow `.github/workflows/deploy.yml` lance les tests, déploie, vérifie `/api/health` et revient en arrière en cas d'échec.
- Les nouveautés pour joueurs passent par `BETA_FLAGS` / `betaOn()` ; les essais admin par `labOn()`. Une note « Quoi de neuf ? » se fait dans `src/news.js`.
- Toute méthode appelée côté navigateur (`Sound.xxx`, etc.) doit exister : `test/frontend.test.js` le vérifie. Après un gros remaniement d'un fichier, relis la liste de ce qui existait avant (git diff) pour ne rien supprimer sans le vouloir.
- Les signalements de joueurs : je juge chaque réponse (acceptée seulement si elle correspond bien au thème), je donne à Jonas un bloc JSON pour « Appliquer des décisions en lot » ; les réponses acceptées qui demandent un changement de thème doivent d'abord être déployées.
- Pour économiser du contexte : travaille par morceaux, délègue la collecte de réponses à l'agent `collecteur-themes` et la relecture à l'agent `relecteur`, ne colle pas de longs journaux de tests (garde les lignes `not ok` et le total).
