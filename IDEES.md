# Idées en attente

À jour au 28 octobre 2026. Dire « on fait X » pour lancer l'une d'elles.

## Décidées, à faire
- **Foreuse de base jaune et cubique en pixel art** : dessin enregistré dans `design/foreuses/` (16-bit et minimaliste, échelles 1 et 2,4). À retravailler, puis à intégrer en bêta (avec les avatars 16-bit choisis).

## À décider par Jonas
- **Notifications push** (activation volontaire, d'abord sur le compte du responsable). Analyse de sécurité faite : clé privée à protéger, liste blanche des services de push, contenu neutre, désabonnement possible, un rappel par jour au plus.
- **Forage bonus** (un thème supplémentaire en récompense).
- **Vote sur les thèmes** proposés par les joueurs.
- **Surveillance des joueurs** : joueurs actifs ou inactifs, séries en danger, nouveaux joueurs, absents depuis X jours.
- **Décor d'automne** après Halloween.

## Chantiers techniques
- Découper `public/app.js` (≈ 280 Ko) en modules par domaine : forage, profil, administration, messagerie. À faire dans une session dédiée, sans autre nouveauté en parallèle.
- Tests de bout en bout dans le navigateur pour les parcours principaux (forage, duel, profil).
