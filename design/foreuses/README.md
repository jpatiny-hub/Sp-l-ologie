# Foreuse de base — jaune et cubique

Première foreuse du jeu, redessinée en pixel art (décision de Jonas, 29 octobre 2026). À retravailler plus tard.

## Contenu du dossier
- `foreuse-de-base.js` : le dessin, en un seul fichier sans dépendance. Ouvre `apercu.html` dans un navigateur pour le voir (aucun serveur nécessaire).
- `apercu.html` / `apercu.png` : aperçu de toutes les versions.
- `foreuse-de-base-*.png` : exports prêts à regarder (pixels nets).

## Versions dessinées
| Version | Taille | Usage prévu |
|---|---|---|
| 16-bit classique, échelle 1 | 40 × 68 px | foreuse du jeu, à la taille des avatars 16-bit |
| 16-bit classique, échelle 2,4 | 96 × 163 px | foreuse « grande », même finesse de pixels que le décor |
| Minimaliste, échelles 1 et 2,4 | 26 × 44 px et 62 × 106 px | pastilles, classement, boutique |

Les formes sont recalculées à chaque échelle (ce n'est pas un agrandissement de pixels) : les contours et les détails fins restent nets.

## Description
Caisse jaune à coins arrondis, lampe orange, bande de sécurité noire en bas, hublot rond avec le visage du joueur, jupe grise rivetée, foret conique en acier à spirale. Câble de suspension au sommet.

## Utilisation du dessin
```js
const F = FOREUSE_DE_BASE;
const sprite = F.dessiner16(avatar, 2.4);   // avatar = sprite d'un personnage 16-bit (28 × 37 px) ; null = hublot vide
document.body.append(F.versCanevas(sprite, 2));
```
Le visage du hublot est lu dans le sprite de l'avatar (zone de la tête, autour du pixel 12, 12). `F.avatarExemple()` fournit un mineur pour tester.

## Pistes pour la suite
- Version animée : foret qui tourne (3 images), lampe qui clignote, secousse pendant la descente.
- Variantes de cosmétiques : couleurs de caisse, forets, blindages (même construction, autres palettes).
- Intégration dans `public/pixel.js` (remplace `drawDrill`) en bêta réservée au responsable, après le choix définitif de la taille.
- Autres foreuses étudiées (steampunk lourde, steampunk élégante, futuriste) : non enregistrées ici, à redemander si besoin.
