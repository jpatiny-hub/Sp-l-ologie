'use strict';

/*
 * Avatar du joueur en pixel art : grille de 16 x 28 pixels, dessinée à partir de quelques choix (voir src/avatar.js).
 * Types de personnage : humain, nain (humain trapu), robot à vapeur, taupe, citrouille, squelette, fantôme, golem de cristal, champignon, ver luisant, diablotin, grenouille.
 *   Avatar.canvas(av, { scale, view, finish })  → <canvas> (view : 'full', 'bust' ou 'head' ; finish : style abouti, contours et ombres)
 *   Avatar.sprite(av)                   → canevas 16 x 28 à l'échelle 1 (pour la scène de forage)
 */
(function (global) {
  const W = 16;
  const H = 28;
  const OY = 6; // ligne du haut de la tête
  const SKIN = { clair: '#f1c9a5', mat: '#d9a066', brun: '#9c6a43', fonce: '#6b4328' };
  const HAIR = { brun: '#4a2f1a', noir: '#1b1410', blond: '#e8c547', roux: '#c4562a', gris: '#b8b8c0', rose: '#e86aa8', bleu: '#4a86e8' };
  const K = '#1b1410';
  // Zones recadrées : [x, y, largeur, hauteur] dans la grille.
  const VIEWS = { full: [0, 0, W, H], bust: [0, 0, W, OY + 13], head: [3, 0, 10, OY + 8] };

  // Teinte plus sombre (f < 1) ou plus claire (f > 1) d'une couleur #rrggbb.
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
  }
  // Carrosserie du robot (selon le « teint »), pelage de la taupe, citrouille : [clair, mat, brun, foncé].
  const METAL = { clair: '#c9a23a', mat: '#c8703a', brun: '#9a7048', fonce: '#6a7480' };
  const FUR = { clair: '#8a7a6a', mat: '#6a5648', brun: '#4a3a30', fonce: '#2e2a2e' };
  const GOURD = { clair: '#7dff3a', mat: '#ff8a1a', brun: '#b05ad8', fonce: '#e8eef0' };
  const BONE = { clair: '#e8e4d4', mat: '#d8c8a0', brun: '#b8a070', fonce: '#7a7a8c' };
  const GHOST = { clair: '#e8f0ff', mat: '#bfe8ff', brun: '#d8c0ff', fonce: '#9a9ab8' };
  const CRYSTAL = { clair: '#7fe0ff', mat: '#ff7ac0', brun: '#b078ff', fonce: '#7dff9a' };
  const CAP = { clair: '#d8362d', mat: '#b8843a', brun: '#6a5ad8', fonce: '#3ad8a0' };
  const WORM = { clair: '#c8e86a', mat: '#ffb84a', brun: '#c880ff', fonce: '#6ae8ff' };
  const IMP = { clair: '#d8362d', mat: '#8a4ad8', brun: '#3a9a4a', fonce: '#3a4a8a' };
  const FROG = { clair: '#5ad86a', mat: '#e8a030', brun: '#4a86e8', fonce: '#3a8a5a' };
  const IRIS = { bleu: '#2a6fdb', vert: '#3a9a4a', noisette: '#9a6a2a', gris: '#7a8a9a', violet: '#8a4ad8', dore: '#e8a820' };
  const GLOW = { clair: '#fff59a', mat: '#ffe84a', brun: '#ff9ae8', fonce: '#8affc8' };

  const painter = (c) => (x, y, w, h, col) => {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  };

  /** Jambes, torse, bras et mains. `skin` colore les mains et les jambes nues ; `fur` met la tenue « poil » à cette couleur. */
  function paintBody(P, o, skin, fur) {
    const fem = o.forme === 'f';
    const oy = OY;
    const outfit = o.tenue || 'mineur';
    const robe = outfit === 'robe' || outfit === 'robe-fleurs' || outfit === 'robe-sorciere';
    // Cape dorée : derrière le corps.
    if (outfit === 'cape') {
      P(3, oy + 7, 10, 11, '#c8941c');
      P(3, oy + 17, 10, 1, '#a77f12');
    }
    // Jambes.
    const legs = (o.espece === 'robot' ? shade(METAL[o.peau] || METAL.clair, 0.6) : null) || { smoking: '#222', scaphandre: '#6b7a8c', cape: '#3a4a6b', armure: '#8a8f98', pirate: '#5a3a1a', cuisinier: '#4a4a52', 'mineur-nain': '#5a4a3a', 'armure-naine': '#5a4a3a', 'gilet-vapeur': '#4a3a2a', golem: '#46425a', 'costume-cupidon': '#e8dcc0', 'manteau-noel': '#c8362d', 'chape-eveque': '#c8362d', 'tablier-forge': '#3a3a44', redingote: '#2a2a34', epouvantail: '#6a5a3a', explorateur: '#8a7a4a', herboriste: '#6a5a3a', 'tunique-infernale': '#2a1a2a', 'cire-jaune': '#3a4a6b', poil: fur }[outfit] || '#3a4a6b';
    if (robe) {
      const hem = { robe: '#b02a6a', 'robe-fleurs': '#e8466a', 'robe-sorciere': '#2a1a3a' }[outfit];
      P(5, oy + 15, 2, 5, skin);
      P(9, oy + 15, 2, 5, skin);
      P(5, oy + 20, 2, 1, hem);
      P(9, oy + 20, 2, 1, hem);
    } else {
      P(5, oy + 14, 3, 7, legs);
      P(8, oy + 14, 3, 7, legs);
      P(5, oy + 21, 3, 1, K);
      P(8, oy + 21, 3, 1, K);
    }
    // Torse et bras.
    const top = (o.espece === 'robot' ? METAL[o.peau] || METAL.clair : null) || { mineur: '#d9772b', salopette: '#d9772b', robe: '#e86aa8', 'robe-fleurs': '#f3e1c8', smoking: '#222', pull: '#4a86e8', scaphandre: '#8aa0b8', cape: '#4a86e8', armure: '#aeb6c2', pirate: '#f3f3f3', cuisinier: '#ffffff', blouse: '#f3f3f3', chasuble: '#ff8c1a', 'mineur-nain': '#7a4a24', 'armure-naine': '#9a7a3a', 'gilet-vapeur': '#5a2a1a', golem: '#5a5668', 'costume-cupidon': '#f3e9d2', 'manteau-noel': '#c8362d', 'robe-sorciere': '#4a2a6a', 'chape-eveque': '#c8362d', 'tablier-forge': '#8a8f98', redingote: '#3a2a4a', epouvantail: '#b8843a', explorateur: '#c8b078', herboriste: '#4a8a4a', 'tunique-infernale': '#2a1a2a', 'cire-jaune': '#f2c230', poil: fur }[outfit] || '#d9772b';
    if (fem) {
      P(5, oy + 7, 6, 4, top);
      if (robe) {
        P(4, oy + 11, 8, 3, top);
        P(3, oy + 14, 10, 1, top);
      } else P(5, oy + 11, 6, 3, top);
      P(3, oy + 7, 2, 5, top);
      P(11, oy + 7, 2, 5, top);
    } else {
      P(4, oy + 7, 8, 7, top);
      P(2, oy + 7, 2, 6, top);
      P(12, oy + 7, 2, 6, top);
    }
    if (outfit === 'smoking') {
      P(7, oy + 7, 2, 5, '#f3e9d2');
      P(7, oy + 8, 2, 1, '#c8362d');
      P(6, oy + 7, 1, 1, '#f3e9d2');
    }
    if (outfit === 'mineur') {
      P(4, oy + 9, 8, 1, '#f2c230');
      P(4, oy + 12, 8, 1, '#f2c230');
    }
    if (outfit === 'salopette') {
      P(5, oy + 7, 1, 3, '#555');
      P(10, oy + 7, 1, 3, '#555');
    }
    if (outfit === 'scaphandre') {
      P(6, oy + 8, 4, 3, '#33415c');
      P(7, oy + 9, 1, 1, '#ff6a3d');
      P(9, oy + 9, 1, 1, '#7fcf5a');
      P(4, oy + 13, 8, 1, '#ff6a3d');
    }
    if (outfit === 'cape') {
      P(7, oy + 7, 2, 1, '#f2c230');
    }
    if (outfit === 'armure') {
      P(1, oy + 6, 3, 2, '#8a8f98');
      P(12, oy + 6, 3, 2, '#8a8f98');
      P(7, oy + 8, 2, 5, '#d9dde4');
      P(4, oy + 13, 8, 1, '#6b7078');
    }
    if (outfit === 'pirate') {
      for (const dy of [8, 10]) P(4, oy + dy, 8, 1, '#2a4a9a');
      P(4, oy + 13, 8, 1, '#c8362d');
    }
    if (outfit === 'cuisinier') {
      P(8, oy + 7, 1, 6, '#e1e4ea');
      for (const dy of [8, 10, 12]) P(6, oy + dy, 1, 1, '#222');
    }
    if (outfit === 'blouse') {
      P(6, oy + 7, 4, 1, '#d6dae2');
      P(9, oy + 10, 2, 2, '#d6dae2');
      P(10, oy + 10, 1, 1, '#2a6fdb');
    }
    if (outfit === 'robe-fleurs') {
      [[5, 8], [9, 9], [6, 11], [10, 12], [4, 13], [7, 14], [9, 14]].forEach(([x, y], i) => P(x, oy + y, 1, 1, ['#e8466a', '#f2c230', '#6aa8e8'][i % 3]));
    }
    if (outfit === 'chasuble') {
      P(2, oy + 7, 2, 6, '#5a6270');
      P(12, oy + 7, 2, 6, '#5a6270');
      P(5, oy + 7, 1, 6, '#e8eaee');
      P(10, oy + 7, 1, 6, '#e8eaee');
      P(4, oy + 11, 8, 1, '#e8eaee');
    }
    if (outfit === 'mineur-nain') {
      P(5, oy + 7, 1, 5, '#3a2a14');
      P(10, oy + 7, 1, 5, '#3a2a14');
      P(4, oy + 12, 8, 1, '#3a2a14');
      P(7, oy + 12, 2, 1, '#f2c230');
      P(2, oy + 7, 2, 4, '#e8dcc0');
      P(12, oy + 7, 2, 4, '#e8dcc0');
    }
    if (outfit === 'armure-naine') {
      P(1, oy + 6, 3, 2, '#c8a04a');
      P(12, oy + 6, 3, 2, '#c8a04a');
      P(7, oy + 9, 2, 2, '#f2c230');
      P(4, oy + 7, 8, 1, '#c8a04a');
      P(4, oy + 13, 8, 1, '#5a3a1a');
      P(5, oy + 11, 1, 1, '#d9dde4');
      P(10, oy + 11, 1, 1, '#d9dde4');
    }
    if (outfit === 'gilet-vapeur') {
      P(7, oy + 7, 2, 6, '#f3e9d2');
      P(2, oy + 7, 2, 6, '#f3e9d2');
      P(12, oy + 7, 2, 6, '#f3e9d2');
      P(6, oy + 9, 1, 1, '#d9a21a');
      P(9, oy + 9, 1, 1, '#d9a21a');
      P(6, oy + 11, 1, 1, '#d9a21a');
      P(9, oy + 11, 1, 1, '#d9a21a');
      P(9, oy + 12, 3, 1, '#d9a21a');
    }
    if (outfit === 'costume-cupidon') {
      P(4, oy + 7, 8, 1, '#f2c230');
      P(4, oy + 12, 8, 1, '#f2c230');
      P(7, oy + 9, 2, 1, '#e8508f');
      P(6, oy + 10, 4, 1, '#e8508f');
      P(7, oy + 11, 2, 1, '#e8508f');
    }
    if (outfit === 'manteau-noel') {
      P(4, oy + 7, 8, 1, '#fff');
      P(4, oy + 13, 8, 1, '#fff');
      P(7, oy + 8, 2, 5, '#fff');
      P(4, oy + 11, 8, 1, '#1b1410');
      P(7, oy + 11, 2, 1, '#f2c230');
      P(2, oy + 12, 2, 1, '#fff');
      P(12, oy + 12, 2, 1, '#fff');
    }
    if (outfit === 'robe-sorciere') {
      [[5, 9], [9, 11], [6, 13], [10, 8], [7, 12]].forEach(([x, y]) => P(x, oy + y, 1, 1, '#ffd84a'));
      P(4, oy + 11, 8, 1, '#2a1a3a');
      P(7, oy + 11, 2, 1, '#a8ff5a');
    }
    if (outfit === 'chape-eveque') {
      P(4, oy + 7, 8, 1, '#f2c230');
      P(7, oy + 8, 2, 5, '#f2c230');
      P(5, oy + 8, 1, 5, '#f2c230');
      P(10, oy + 8, 1, 5, '#f2c230');
      P(7, oy + 10, 2, 1, '#c8362d');
      P(4, oy + 13, 8, 1, '#f2c230');
    }
    if (outfit === 'tablier-forge') {
      P(5, oy + 8, 6, 6, '#7a4a24');
      P(5, oy + 7, 1, 1, '#7a4a24');
      P(10, oy + 7, 1, 1, '#7a4a24');
      P(6, oy + 11, 1, 1, '#2a1a10');
      P(9, oy + 9, 1, 1, '#2a1a10');
    }
    if (outfit === 'redingote') {
      P(6, oy + 8, 4, 4, '#c8a04a');
      P(7, oy + 7, 2, 2, '#f3e9d2');
      P(7, oy + 10, 2, 1, '#8a6a1a');
      P(4, oy + 14, 2, 3, '#3a2a4a');
      P(10, oy + 14, 2, 3, '#3a2a4a');
    }
    if (outfit === 'epouvantail') {
      P(5, oy + 9, 2, 2, '#4a86e8');
      P(9, oy + 11, 2, 2, '#c8362d');
      P(2, oy + 13, 2, 1, '#e8c547');
      P(12, oy + 13, 2, 1, '#e8c547');
      P(6, oy + 13, 1, 1, '#e8c547');
    }
    if (outfit === 'explorateur') {
      [[5, 8], [6, 9], [7, 10], [8, 11], [9, 12]].forEach(([x, y]) => P(x, oy + y, 1, 1, '#6a4a2a'));
      P(4, oy + 11, 2, 2, '#a8905a');
      P(10, oy + 9, 2, 2, '#a8905a');
    }
    if (outfit === 'herboriste') {
      P(4, oy + 12, 8, 1, '#6a4a2a');
      P(9, oy + 12, 3, 2, '#8b5a2b');
      P(7, oy + 8, 2, 1, '#8ad87a');
      P(8, oy + 9, 1, 1, '#8ad87a');
    }
    if (outfit === 'tunique-infernale') {
      P(5, oy + 7, 6, 1, '#c8362d');
      P(4, oy + 13, 8, 1, '#ff5a2a');
      P(5, oy + 12, 1, 1, '#ffb43a');
      P(8, oy + 12, 1, 1, '#ffb43a');
      P(10, oy + 12, 1, 1, '#ff5a2a');
    }
    if (outfit === 'cire-jaune') {
      P(4, oy + 7, 8, 1, '#d9a21a');
      P(4, oy + 13, 8, 1, '#d9a21a');
      for (const y of [8, 10, 12]) P(8, oy + y, 1, 1, '#8a6a10');
    }
    if (outfit === 'golem') {
      const cr = CRYSTAL[o.peau] || CRYSTAL.clair;
      P(1, oy + 6, 3, 2, '#6a6678');
      P(12, oy + 6, 3, 2, '#6a6678');
      P(1, oy + 5, 1, 1, cr);
      P(14, oy + 5, 1, 1, cr);
      P(7, oy + 9, 2, 3, cr);
      P(7, oy + 9, 1, 1, shade(cr, 1.4));
      P(4, oy + 13, 8, 1, '#46425a');
    }
    if (o.espece === 'robot') {
      const m = METAL[o.peau] || METAL.clair;
      const d = shade(m, 0.6);
      P(4, oy + 7, 8, 1, shade(m, 1.25));
      P(6, oy + 9, 4, 3, d);
      P(7, oy + 10, 1, 1, '#ffd84a');
      P(9, oy + 10, 1, 1, '#7fcf5a');
      P(7, oy + 11, 2, 1, '#ff6a3d');
      P(4, oy + 13, 8, 1, d);
      P(2, oy + 10, 2, 1, d);
      P(12, oy + 10, 2, 1, d);
      P(4, oy + 8, 1, 1, d);
      P(11, oy + 8, 1, 1, d);
    }
    // Mains.
    P(2, oy + 13, 2, 1, skin);
    P(12, oy + 13, 2, 1, skin);
    if (fur) {
      for (const x of [2, 12]) P(x, oy + 14, 2, 1, '#e8e0d0');
    }
  }

  function paintEyes(P, o, oy) {
    const eyes = o.yeux || 'points';
    const iris = o.iris || 'defaut';
    const ic = iris === 'vairons' ? [IRIS.bleu, IRIS.vert] : [IRIS[iris], IRIS[iris]];
    if (o._blink && eyes !== 'cache-oeil') {
      // Clignement : paupières closes (les lunettes restent en place).
      if (eyes === 'lunettes') P(5, oy + 4, 6, 1, K);
      else {
        P(5, oy + 4, 2, 1, K);
        P(9, oy + 4, 2, 1, K);
      }
      return;
    }
    if (eyes === 'points') {
      P(6, oy + 3, 1, 1, ic[0] || K);
      P(9, oy + 3, 1, 1, ic[1] || K);
    } else if (eyes === 'grands') {
      P(5, oy + 3, 2, 2, '#fff');
      P(9, oy + 3, 2, 2, '#fff');
      P(6, oy + 4, 1, 1, ic[0] || '#2a6fdb');
      P(9, oy + 4, 1, 1, ic[1] || '#2a6fdb');
    } else if (eyes === 'lunettes') {
      P(5, oy + 3, 3, 2, K);
      P(8, oy + 3, 3, 2, K);
      P(6, oy + 3, 1, 1, '#9fe8ff');
      P(9, oy + 3, 1, 1, '#9fe8ff');
    } else if (eyes === 'heureux') {
      P(5, oy + 4, 2, 1, K);
      P(9, oy + 4, 2, 1, K);
      P(6, oy + 3, 1, 1, K);
      P(9, oy + 3, 1, 1, K);
    } else if (eyes === 'monocle') {
      P(6, oy + 3, 1, 1, K);
      P(9, oy + 3, 1, 1, K);
      P(5, oy + 2, 3, 1, '#f2c230');
      P(5, oy + 4, 3, 1, '#f2c230');
      P(5, oy + 3, 1, 1, '#f2c230');
      P(7, oy + 3, 1, 1, '#f2c230');
      P(4, oy + 5, 1, 3, '#f2c230');
    } else if (eyes === 'cache-oeil') {
      P(4, oy + 2, 8, 1, K);
      P(5, oy + 3, 3, 2, K);
      P(9, oy + 3, 1, 1, K);
    } else if (eyes === 'soleil') {
      P(5, oy + 3, 3, 2, '#111');
      P(8, oy + 3, 3, 2, '#111');
      P(7, oy + 3, 1, 1, '#111');
      P(4, oy + 3, 1, 1, K);
      P(11, oy + 3, 1, 1, K);
      P(5, oy + 3, 1, 1, '#5a6a8a');
      P(8, oy + 3, 1, 1, '#5a6a8a');
    } else if (eyes === 'rondes') {
      for (const x of [5, 8]) {
        P(x, oy + 2, 3, 3, '#8a5a1a');
        P(x + 1, oy + 3, 1, 1, '#cfeeff');
      }
      P(7, oy + 3, 1, 1, '#8a5a1a');
    } else if (eyes === 'aviateur') {
      P(4, oy + 3, 8, 1, '#3a2a14');
      for (const x of [5, 8]) {
        P(x, oy + 2, 3, 3, '#b8863a');
        P(x + 1, oy + 3, 1, 1, '#7fe0ff');
      }
    } else if (eyes === 'etoiles') {
      for (const x of [6, 9]) {
        P(x, oy + 2, 1, 3, '#ffd84a');
        P(x - 1, oy + 3, 3, 1, '#ffd84a');
        P(x, oy + 3, 1, 1, '#fff');
      }
    }
  }

  function paintHair(P, o, oy, hair) {
    const h = o.cheveux || 'court';
    if (h === 'court') {
      P(4, oy - 1, 8, 2, hair);
      P(4, oy + 1, 1, 2, hair);
      P(11, oy + 1, 1, 2, hair);
    } else if (h === 'long') {
      P(4, oy - 1, 8, 2, hair);
      P(3, oy, 2, 9, hair);
      P(11, oy, 2, 9, hair);
    } else if (h === 'crete') {
      P(7, oy - 3, 2, 3, hair);
      P(6, oy - 1, 4, 1, hair);
    } else if (h === 'chignon') {
      P(4, oy - 1, 8, 2, hair);
      P(6, oy - 3, 4, 2, hair);
      P(4, oy + 1, 1, 2, hair);
      P(11, oy + 1, 1, 2, hair);
    } else if (h === 'afro') {
      P(3, oy - 3, 10, 4, hair);
      P(3, oy + 1, 2, 3, hair);
      P(11, oy + 1, 2, 3, hair);
    } else if (h === 'tresses') {
      P(4, oy - 1, 8, 2, hair);
      P(3, oy, 1, 10, hair);
      P(12, oy, 1, 10, hair);
      P(3, oy + 10, 1, 1, '#e8c547');
      P(12, oy + 10, 1, 1, '#e8c547');
    } else if (h === 'queue') {
      P(4, oy - 1, 8, 2, hair);
      P(4, oy + 1, 1, 2, hair);
      P(11, oy + 1, 1, 2, hair);
      P(12, oy, 2, 1, hair);
      P(13, oy + 1, 1, 5, hair);
    } else if (h === 'carre') {
      P(4, oy - 1, 8, 2, hair);
      P(3, oy, 2, 5, hair);
      P(11, oy, 2, 5, hair);
    }
  }

  function paintBeard(P, o, oy, hair) {
    const b = o.barbe || 'aucune';
    if (b === 'barbe') {
      P(5, oy + 5, 6, 3, hair);
      P(7, oy + 5, 2, 1, '#c25a4a');
    } else if (b === 'moustache') {
      P(5, oy + 4, 6, 1, hair);
      P(6, oy + 5, 1, 1, hair);
      P(9, oy + 5, 1, 1, hair);
    } else if (b === 'bouc') {
      P(7, oy + 6, 2, 2, hair);
    } else if (b === 'guidon') {
      P(5, oy + 4, 6, 1, hair);
      P(4, oy + 3, 1, 1, hair);
      P(11, oy + 3, 1, 1, hair);
    } else if (b === 'favoris') {
      P(4, oy + 2, 1, 4, hair);
      P(11, oy + 2, 1, 4, hair);
    } else if (b === 'sage') {
      P(5, oy + 5, 6, 3, hair);
      P(6, oy + 8, 4, 3, hair);
      P(7, oy + 11, 2, 2, hair);
      P(7, oy + 5, 2, 1, '#c25a4a');
    } else if (b === 'tressee') {
      P(5, oy + 5, 6, 3, hair);
      P(7, oy + 5, 2, 1, '#c25a4a');
      for (let i = 0; i < 5; i++) {
        P(7 + (i % 2), oy + 8 + i, 1, 1, hair);
        P(8 - (i % 2), oy + 8 + i, 1, 1, shade(hair, 0.7));
      }
      P(7, oy + 13, 2, 1, '#c8362d');
    } else if (b === 'nattes') {
      P(5, oy + 5, 6, 3, hair);
      P(7, oy + 5, 2, 1, '#c25a4a');
      for (const x of [5, 9]) {
        for (let i = 0; i < 4; i++) {
          P(x + (i % 2), oy + 8 + i, 1, 1, hair);
          P(x + 1 - (i % 2), oy + 8 + i, 1, 1, shade(hair, 0.7));
        }
        P(x, oy + 12, 2, 1, '#f2c230');
      }
    } else if (b === 'fourchue') {
      P(5, oy + 5, 6, 3, hair);
      P(5, oy + 8, 2, 3, hair);
      P(9, oy + 8, 2, 3, hair);
      P(7, oy + 5, 2, 1, '#c25a4a');
    }
  }

  function paintTrait(P, o, oy) {
    const tr = o.trait || 'aucun';
    if (tr === 'taches') {
      for (const [x, y] of [[5, 4], [7, 4], [8, 4], [10, 4], [6, 5], [9, 5]]) P(x, oy + y, 1, 1, '#b8693c');
    } else if (tr === 'joues') {
      P(5, oy + 4, 2, 1, '#f08a8a');
      P(9, oy + 4, 2, 1, '#f08a8a');
    } else if (tr === 'cicatrice') {
      P(10, oy + 2, 1, 2, '#c25a4a');
      P(11, oy + 4, 1, 1, '#c25a4a');
      P(10, oy + 3, 2, 1, '#f3e9d2');
    } else if (tr === 'guerre') {
      P(5, oy + 4, 2, 1, '#c8362d');
      P(9, oy + 4, 2, 1, '#c8362d');
      P(5, oy + 5, 2, 1, '#f3f3f3');
      P(9, oy + 5, 2, 1, '#f3f3f3');
    }
  }

  function paintHat(P, o, oy) {
    const hat = o.chapeau || 'aucun';
    if (hat === 'casque') {
      P(4, oy - 2, 8, 3, '#f2c230');
      P(3, oy, 10, 1, '#d9a21a');
      P(7, oy - 3, 2, 1, '#fff6b0');
      P(7, oy - 2, 2, 1, '#fff');
    } else if (hat === 'casque-blanc') {
      P(4, oy - 2, 8, 3, '#f3f3f3');
      P(3, oy, 10, 1, '#c9ccd3');
      P(7, oy - 3, 2, 1, '#ff6a3d');
    } else if (hat === 'casque-or') {
      P(4, oy - 2, 8, 3, '#ffd84a');
      P(3, oy, 10, 1, '#d9a21a');
      P(7, oy - 3, 2, 1, '#fff6b0');
      P(5, oy - 2, 1, 1, '#fff');
      P(10, oy - 1, 1, 1, '#fff');
    } else if (hat === 'haut') {
      P(5, oy - 6, 6, 5, '#1b1b1f');
      P(3, oy - 1, 10, 1, '#1b1b1f');
      P(5, oy - 2, 6, 1, '#c8362d');
    } else if (hat === 'diademe') {
      P(5, oy - 1, 6, 1, '#f2c230');
      P(5, oy - 2, 1, 1, '#f2c230');
      P(7, oy - 3, 2, 2, '#f2c230');
      P(10, oy - 2, 1, 1, '#f2c230');
      P(7, oy - 2, 2, 1, '#e8466a');
    } else if (hat === 'bonnet') {
      P(4, oy - 3, 8, 3, '#4a86e8');
      P(4, oy - 1, 8, 1, '#2d5bb0');
      P(7, oy - 4, 2, 1, '#fff');
    } else if (hat === 'viking') {
      P(4, oy - 2, 8, 3, '#8a8f98');
      P(3, oy, 10, 1, '#6b7078');
      P(7, oy, 2, 3, '#6b7078');
      for (const [x, y] of [[3, -1], [2, -2], [2, -3], [12, -1], [13, -2], [13, -3]]) P(x, oy + y, 1, 1, '#f3e9d2');
    } else if (hat === 'heaume') {
      P(4, oy - 3, 8, 5, '#aeb6c2');
      P(4, oy + 2, 1, 3, '#aeb6c2');
      P(11, oy + 2, 1, 3, '#aeb6c2');
      P(5, oy + 1, 6, 1, K);
      P(7, oy - 5, 2, 2, '#c8362d');
    } else if (hat === 'toque') {
      P(4, oy - 1, 8, 2, '#fff');
      P(3, oy - 5, 10, 4, '#fff');
      P(5, oy - 6, 6, 1, '#fff');
      P(6, oy - 4, 1, 2, '#e1e4ea');
      P(9, oy - 4, 1, 2, '#e1e4ea');
    } else if (hat === 'bandana') {
      P(4, oy - 1, 8, 2, '#c8362d');
      P(5, oy - 1, 1, 1, '#fff');
      P(8, oy, 1, 1, '#fff');
      P(12, oy, 2, 2, '#c8362d');
      P(13, oy + 2, 1, 1, '#c8362d');
    } else if (hat === 'couronne') {
      P(4, oy - 3, 8, 3, '#f2c230');
      P(4, oy - 4, 1, 1, '#f2c230');
      P(7, oy - 4, 2, 1, '#f2c230');
      P(11, oy - 4, 1, 1, '#f2c230');
      P(7, oy - 2, 2, 1, '#c8362d');
    } else if (hat === 'casque-nain') {
      P(4, oy - 2, 8, 3, '#8a8f98');
      P(3, oy, 10, 1, '#6b7078');
      P(7, oy - 3, 2, 1, '#c9ccd3');
      P(7, oy + 1, 2, 3, '#6b7078');
      P(5, oy - 1, 1, 1, '#f2c230');
      P(10, oy - 1, 1, 1, '#f2c230');
    } else if (hat === 'chapeau-metal') {
      P(7, oy - 5, 2, 1, '#d8dde4');
      P(6, oy - 4, 4, 1, '#b8b8c0');
      P(5, oy - 3, 6, 1, '#9a9aa6');
      P(4, oy - 2, 8, 1, '#8a8a96');
      P(3, oy - 1, 10, 1, '#6b6b76');
    } else if (hat === 'melon') {
      P(5, oy - 4, 6, 3, '#2a2a30');
      P(3, oy - 1, 10, 1, '#2a2a30');
      P(5, oy - 2, 6, 1, '#7a1d17');
    } else if (hat === 'bonnet-noel') {
      P(4, oy - 3, 8, 3, '#c8362d');
      P(4, oy - 1, 8, 1, '#fff');
      P(10, oy - 4, 1, 1, '#c8362d');
      P(11, oy - 5, 2, 2, '#fff');
    } else if (hat === 'mitre') {
      P(5, oy - 4, 6, 4, '#c8362d');
      P(6, oy - 6, 4, 2, '#c8362d');
      P(7, oy - 4, 2, 3, '#f2c230');
      P(4, oy - 1, 8, 1, '#f2c230');
    } else if (hat === 'aureole') {
      P(5, oy - 3, 6, 1, '#ffe68a');
      P(4, oy - 2, 1, 1, '#ffe68a');
      P(11, oy - 2, 1, 1, '#ffe68a');
      P(5, oy - 1, 6, 1, '#c8a020');
    } else if (hat === 'chapeau-sorciere') {
      P(8, oy - 6, 2, 1, '#2a1a3a');
      P(7, oy - 5, 4, 1, '#2a1a3a');
      P(6, oy - 4, 5, 1, '#2a1a3a');
      P(5, oy - 3, 6, 1, '#2a1a3a');
      P(5, oy - 2, 6, 1, '#a8ff5a');
      P(2, oy - 1, 12, 1, '#2a1a3a');
    } else if (hat === 'oreilles-lapin') {
      for (const x of [5, 9]) {
        P(x, oy - 6, 2, 5, '#f3f3f8');
        P(x + 1, oy - 5, 1, 3, '#ff9ac8');
      }
      P(4, oy - 1, 8, 1, '#f3f3f8');
    } else if (hat === 'cotillon') {
      P(8, oy - 6, 1, 1, '#ffd84a');
      P(7, oy - 5, 3, 1, '#ff5ac8');
      P(6, oy - 4, 5, 1, '#4ad8ff');
      P(5, oy - 3, 7, 1, '#ff5ac8');
      P(5, oy - 2, 7, 1, '#ffd84a');
      P(5, oy - 1, 7, 1, '#4ad8ff');
    } else if (hat === 'chapeau-paille') {
      P(5, oy - 3, 6, 3, '#e8c547');
      P(2, oy - 1, 12, 1, '#e8c547');
      P(5, oy - 1, 6, 1, '#8b5a2b');
      P(3, oy, 1, 1, '#e8c547');
      P(12, oy, 1, 1, '#e8c547');
    } else if (hat === 'casque-colonial') {
      P(7, oy - 4, 2, 1, '#e8e0c8');
      P(4, oy - 3, 8, 3, '#e8e0c8');
      P(3, oy - 1, 10, 1, '#e8e0c8');
      P(4, oy - 1, 8, 1, '#8b5a2b');
    } else if (hat === 'suroit') {
      P(4, oy - 2, 8, 3, '#f2c230');
      P(2, oy, 12, 1, '#f2c230');
      P(3, oy + 1, 1, 3, '#d9a21a');
      P(12, oy + 1, 1, 3, '#d9a21a');
    } else if (hat === 'casquette') {
      P(4, oy - 2, 8, 3, '#3a6ab8');
      P(7, oy - 3, 2, 1, '#27498a');
      P(7, oy, 6, 1, '#27498a');
    }
  }

  function paintItem(P, o, oy) {
    const it = o.objet || 'aucun';
    if (it === 'pioche') {
      P(14, oy + 5, 1, 9, '#8b5a2b');
      P(12, oy + 4, 4, 1, '#a9b0b8');
      P(12, oy + 5, 1, 1, '#a9b0b8');
      P(15, oy + 5, 1, 1, '#a9b0b8');
    } else if (it === 'lanterne') {
      P(13, oy + 11, 3, 1, '#7d7d86');
      P(13, oy + 12, 3, 3, '#f2c230');
      P(14, oy + 13, 1, 1, '#fff6b0');
      P(13, oy + 15, 3, 1, '#7d7d86');
    } else if (it === 'fleur') {
      P(14, oy + 9, 1, 5, '#2e8b3a');
      P(13, oy + 7, 3, 2, '#e8466a');
      P(14, oy + 8, 1, 1, '#f2c230');
    } else if (it === 'canne') {
      P(14, oy + 7, 1, 8, '#222');
      P(14, oy + 6, 2, 1, '#f2c230');
    } else if (it === 'ballon') {
      P(14, oy + 8, 1, 6, '#999');
      P(13, oy + 3, 3, 5, '#e8466a');
      P(14, oy + 4, 1, 1, '#f9a8c0');
    } else if (it === 'fanion') {
      P(14, oy + 3, 1, 11, '#8b5a2b');
      P(15, oy + 3, 1, 3, '#ff6a3d');
      P(15, oy + 4, 1, 1, '#fff');
    } else if (it === 'dynamite') {
      P(13, oy + 10, 3, 5, '#c8362d');
      P(13, oy + 12, 3, 1, '#f3e9d2');
      P(14, oy + 8, 1, 2, '#8b5a2b');
      P(15, oy + 7, 1, 1, '#ffd84a');
    } else if (it === 'diamant') {
      P(13, oy + 11, 3, 2, '#9fe8ff');
      P(14, oy + 13, 1, 1, '#9fe8ff');
      P(14, oy + 11, 1, 1, '#fff');
      P(13, oy + 10, 3, 1, '#d8f6ff');
    } else if (it === 'epee') {
      P(14, oy + 3, 1, 9, '#dfe6ee');
      P(14, oy + 2, 1, 1, '#fff');
      P(13, oy + 12, 3, 1, '#f2c230');
      P(14, oy + 13, 1, 2, '#8b5a2b');
      P(14, oy + 15, 1, 1, '#f2c230');
    } else if (it === 'bouclier') {
      P(12, oy + 8, 4, 5, '#c0261d');
      P(12, oy + 8, 4, 1, '#f2c230');
      P(13, oy + 13, 2, 1, '#c0261d');
      P(13, oy + 10, 2, 1, '#f3e9d2');
    } else if (it === 'marteau') {
      P(14, oy + 6, 1, 9, '#8b5a2b');
      P(12, oy + 4, 4, 3, '#6b7078');
      P(12, oy + 4, 4, 1, '#a9b0b8');
    } else if (it === 'torche') {
      P(14, oy + 9, 1, 6, '#8b5a2b');
      P(13, oy + 6, 3, 3, '#ff9a3c');
      P(14, oy + 5, 1, 2, '#ffd84a');
    } else if (it === 'arc-coeur') {
      P(13, oy + 4, 2, 1, '#8b5a2b');
      P(15, oy + 5, 1, 7, '#8b5a2b');
      P(13, oy + 12, 2, 1, '#8b5a2b');
      P(13, oy + 5, 1, 7, '#e8e0d0');
      P(14, oy + 7, 2, 1, '#e8508f');
      P(14, oy + 8, 1, 1, '#e8508f');
    } else if (it === 'cadeau') {
      P(13, oy + 11, 3, 3, '#c8362d');
      P(14, oy + 11, 1, 3, '#f2c230');
      P(13, oy + 12, 3, 1, '#f2c230');
      P(13, oy + 10, 3, 1, '#f2c230');
    } else if (it === 'canne-sucre') {
      P(14, oy + 7, 1, 7, '#fff');
      P(14, oy + 8, 1, 1, '#c8362d');
      P(14, oy + 10, 1, 1, '#c8362d');
      P(14, oy + 12, 1, 1, '#c8362d');
      P(14, oy + 6, 2, 1, '#fff');
      P(15, oy + 7, 1, 1, '#c8362d');
    } else if (it === 'balai') {
      P(14, oy + 2, 1, 11, '#8b5a2b');
      P(13, oy + 13, 3, 3, '#c8a04a');
      P(13, oy + 13, 3, 1, '#6a4220');
    } else if (it === 'crosse') {
      P(14, oy + 3, 1, 11, '#f2c230');
      P(13, oy + 2, 3, 1, '#f2c230');
      P(12, oy + 3, 1, 2, '#f2c230');
      P(15, oy + 3, 1, 1, '#f2c230');
    } else if (it === 'panier-paques') {
      P(13, oy + 12, 3, 3, '#c8945a');
      P(13, oy + 11, 3, 1, '#8b5a2b');
      P(13, oy + 10, 1, 1, '#ff9ac8');
      P(15, oy + 10, 1, 1, '#4ad8ff');
      P(14, oy + 10, 1, 1, '#ffd84a');
    } else if (it === 'coupe') {
      P(13, oy + 9, 3, 2, '#fff6b0');
      P(14, oy + 11, 1, 3, '#e8ecf0');
      P(13, oy + 14, 3, 1, '#e8ecf0');
      P(14, oy + 8, 1, 1, '#fff');
    } else if (it === 'tarte') {
      P(12, oy + 11, 4, 2, '#d8a050');
      P(12, oy + 11, 4, 1, '#e8b868');
      P(13, oy + 12, 1, 1, '#b07030');
      P(12, oy + 13, 4, 1, '#c8c8d0');
    } else if (it === 'poisson') {
      P(12, oy + 10, 3, 2, '#5ac8e8');
      P(15, oy + 9, 1, 4, '#3aa8c8');
      P(12, oy + 10, 1, 1, K);
      P(13, oy + 11, 1, 1, '#c8f0ff');
    } else if (it === 'hache') {
      P(14, oy + 4, 1, 10, '#8b5a2b');
      P(12, oy + 3, 2, 4, '#a9b0b8');
      P(13, oy + 4, 1, 2, '#d8dde4');
    } else if (it === 'hache-double') {
      P(14, oy + 4, 1, 10, '#8b5a2b');
      P(12, oy + 3, 2, 4, '#a9b0b8');
      P(15, oy + 3, 1, 4, '#a9b0b8');
      P(13, oy + 4, 1, 2, '#d8dde4');
    } else if (it === 'pipe') {
      P(9, oy + 5, 3, 1, '#6b4a2a');
      P(12, oy + 4, 1, 2, '#3a2a14');
      P(12, oy + 2, 1, 1, '#d8dde4');
      P(13, oy + 1, 1, 1, '#b8b8c0');
    } else if (it === 'chope') {
      P(13, oy + 11, 3, 4, '#f2c230');
      P(13, oy + 10, 3, 1, '#fff');
      P(12, oy + 12, 1, 2, '#d9a21a');
    }
  }

  const LENS = { brun: '#ff9a3c', noir: '#e8466a', blond: '#ffe84a', roux: '#ff5a2a', gris: '#cfd6e0', rose: '#ff7ac0', bleu: '#5ac8ff' };

  function paintMouth(P, o, oy) {
    const m = o.bouche || 'normal';
    const lip = '#c25a4a';
    if (m === 'sourire') {
      P(6, oy + 5, 1, 1, lip);
      P(7, oy + 6, 2, 1, lip);
      P(9, oy + 5, 1, 1, lip);
    } else if (m === 'grimace') {
      P(6, oy + 6, 1, 1, '#7a3a30');
      P(7, oy + 5, 2, 1, '#7a3a30');
      P(9, oy + 6, 1, 1, '#7a3a30');
    } else if (m === 'serieux') {
      P(6, oy + 5, 4, 1, '#7a3a30');
    } else if (m === 'ouvert') {
      P(7, oy + 5, 2, 2, '#5a1a1a');
      P(7, oy + 5, 2, 1, '#fff');
    } else if (m === 'langue') {
      P(7, oy + 5, 2, 1, lip);
      P(8, oy + 6, 1, 1, '#f06a8a');
    } else if (m === 'rouge') {
      P(6, oy + 5, 4, 1, '#d8305a');
    } else if (m === 'dent-or') {
      P(7, oy + 5, 1, 1, lip);
      P(8, oy + 5, 1, 1, '#ffd84a');
    } else P(7, oy + 5, 2, 1, lip);
  }

  /** Compagnon posé sur l'épaule ou qui volette autour de la tête. */
  function paintCompanion(P, o, oy) {
    const c = o.compagnon || 'aucun';
    if (c === 'canari') {
      P(1, oy + 5, 3, 2, '#ffd84a');
      P(1, oy + 4, 2, 1, '#ffd84a');
      P(1, oy + 4, 1, 1, K);
      P(0, oy + 4, 1, 1, '#ff9a3c');
      P(2, oy + 7, 1, 1, '#ff9a3c');
    } else if (c === 'chat-noir') {
      P(1, oy + 5, 3, 2, '#1b1b24');
      P(1, oy + 3, 2, 2, '#1b1b24');
      P(1, oy + 2, 1, 1, '#1b1b24');
      P(2, oy + 2, 1, 1, '#1b1b24');
      P(1, oy + 4, 1, 1, '#ffd84a');
      P(0, oy + 6, 1, 2, '#1b1b24');
      P(3, oy + 7, 1, 1, '#1b1b24');
    } else if (c === 'lucioles') {
      for (const [x, y] of [[1, 1], [13, 3], [2, -2], [14, -1]]) {
        P(x, oy + y, 1, 1, '#e8ff6a');
        P(x, oy + y + 1, 1, 1, 'rgba(232,255,106,0.4)');
      }
    } else if (c === 'chauve-souris') {
      P(1, oy - 1, 2, 2, '#3a2a4a');
      P(0, oy - 2, 1, 2, '#2a1a3a');
      P(3, oy - 2, 1, 2, '#2a1a3a');
      P(1, oy - 2, 1, 1, '#3a2a4a');
      P(2, oy - 1, 1, 1, '#ff4a4a');
    }
  }

  function paintTattoo(P, o, oy) {
    const t = o.tatouage || 'aucun';
    if (t === 'ancre') {
      P(13, oy + 9, 1, 3, '#2a4a9a');
      P(12, oy + 10, 2, 1, '#2a4a9a');
      P(12, oy + 12, 3, 1, '#2a4a9a');
    } else if (t === 'tribal') {
      for (const y of [9, 12]) {
        P(2, oy + y, 2, 1, '#2a2a3a');
        P(12, oy + y, 2, 1, '#2a2a3a');
      }
    } else if (t === 'serpent') {
      [[2, 9], [3, 10], [2, 11], [3, 12]].forEach(([x, y]) => P(x, oy + y, 1, 1, '#3a9a4a'));
    } else if (t === 'larme') {
      P(10, oy + 4, 1, 2, '#2a6fdb');
    } else if (t === 'maori') {
      P(10, oy + 4, 2, 1, '#2a4a9a');
      P(11, oy + 5, 1, 1, '#2a4a9a');
      P(10, oy + 2, 1, 1, '#2a4a9a');
    }
  }

  function paintPiercing(P, o, oy) {
    const p = o.piercing || 'aucun';
    const gold = '#ffe68a';
    const steel = '#e8ecf0';
    if (p === 'nez' || p === 'multiples') P(9, oy + 4, 1, 1, gold);
    if (p === 'sourcil' || p === 'multiples') P(10, oy + 2, 1, 1, steel);
    if (p === 'levre') P(8, oy + 6, 1, 1, steel);
    if (p === 'oreille' || p === 'multiples') {
      P(3, oy + 4, 1, 1, gold);
      P(12, oy + 4, 1, 1, gold);
    }
  }

  function paintNeck(P, o, oy) {
    const a = o.accessoire || 'aucun';
    if (a === 'noeud-papillon') {
      P(6, oy + 7, 1, 2, '#c8362d');
      P(9, oy + 7, 1, 2, '#c8362d');
      P(7, oy + 7, 2, 2, '#8a1d17');
    } else if (a === 'foulard') {
      P(5, oy + 7, 6, 1, '#c8362d');
      P(10, oy + 8, 1, 2, '#c8362d');
    } else if (a === 'medaille') {
      P(7, oy + 7, 2, 1, '#d9a21a');
      P(7, oy + 8, 2, 2, '#ffd84a');
      P(7, oy + 8, 1, 1, '#fff6b0');
    } else if (a === 'coeur') {
      P(5, oy + 9, 1, 1, '#e8466a');
      P(7, oy + 9, 1, 1, '#e8466a');
      P(5, oy + 10, 3, 1, '#e8466a');
      P(6, oy + 11, 1, 1, '#e8466a');
    } else if (a === 'serpentin') {
      [[5, 7, '#ff5ac8'], [6, 8, '#ffd84a'], [7, 7, '#4ad8ff'], [8, 8, '#ff5ac8'], [9, 7, '#ffd84a'], [10, 8, '#4ad8ff']].forEach(([x, y, col]) => P(x, oy + y, 1, 1, col));
      P(10, oy + 9, 1, 2, '#ff5ac8');
    } else if (a === 'pin-pi') {
      P(5, oy + 9, 3, 1, '#f2c230');
      P(5, oy + 10, 1, 2, '#f2c230');
      P(7, oy + 10, 1, 2, '#f2c230');
    } else if (a.startsWith('insigne-')) {
      const n = Number(a[8]);
      const col = ['#c8803a', '#c8ccd4', '#ffd84a'][n - 1];
      P(6, oy + 8, 1, 3, col);
      P(5, oy + 9, 3, 1, col);
      for (let i = 0; i < n; i++) P(5 + i, oy + 11, 1, 1, col);
    } else if (a === 'chaines') {
      [[4, 8], [5, 9], [6, 10], [9, 10], [10, 9], [11, 8]].forEach(([x, y], i) => P(x, oy + y, 1, 1, i % 2 ? '#6a6a76' : '#b8b8c0'));
      P(7, oy + 11, 2, 1, '#b8b8c0');
    } else if (a === 'runes') {
      P(2, oy + 9, 1, 2, '#7fe0ff');
      P(13, oy + 9, 1, 2, '#7fe0ff');
      P(6, oy + 10, 1, 1, '#7fe0ff');
      P(9, oy + 10, 1, 1, '#7fe0ff');
    } else if (a === 'perles') {
      P(5, oy + 7, 6, 1, '#f3f3f3');
      P(6, oy + 8, 4, 1, '#f3f3f3');
    }
  }

  function paintBow(P, o, oy) {
    if (o.accessoire === 'noeud-arc-en-ciel') {
      ['#e8466a', '#f2c230', '#4a86e8'].forEach((col, i) => {
        P(10, oy - 2 + i, 1, 1, col);
        P(12, oy - 2 + i, 1, 1, col);
      });
      P(11, oy - 1, 1, 1, '#fff');
      return;
    }
    if (o.accessoire !== 'noeud-rose') return;
    P(10, oy - 2, 1, 3, '#f06aa8');
    P(12, oy - 2, 1, 3, '#f06aa8');
    P(11, oy - 1, 1, 1, '#b8387a');
  }

  /** Humain ou nain : même dessin, le nain étant raccourci ensuite (voir paint). */
  function paintHuman(P, o) {
    const oy = OY;
    const skin = SKIN[o.peau] || SKIN.clair;
    const hair = HAIR[o.couleur] || HAIR.brun;
    paintBody(P, o, skin, null);
    // Tête.
    P(5, oy, 6, 7, skin);
    P(4, oy + 1, 8, 5, skin);
    P(7, oy + 7, 2, 1, skin);
    paintEyes(P, o, oy);
    paintMouth(P, o, oy);
    if (o.forme === 'f') {
      P(5, oy + 5, 1, 1, '#e8908a');
      P(10, oy + 5, 1, 1, '#e8908a');
    }
    if (o.espece === 'nain') P(7, oy + 4, 2, 1, '#d9786a');
    paintHair(P, o, oy, hair);
    paintBeard(P, o, oy, hair);
    paintTrait(P, o, oy);
    paintTattoo(P, o, oy);
    paintPiercing(P, o, oy);
    paintNeck(P, o, oy);
    paintBow(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Robot à vapeur : carrosserie (teint), lentilles (couleur), cheminée fumante. */
  function paintRobot(P, o) {
    const oy = OY;
    const m = METAL[o.peau] || METAL.clair;
    const d = shade(m, 0.6);
    const l = shade(m, 1.25);
    const lens = LENS[o.couleur] || LENS.brun;
    const model = o.modele || 'classique';
    paintBody(P, { ...o, tenue: 'robot' }, d, null);
    if (model === 'chenilles') {
      P(3, oy + 15, 10, 6, '#3a3a44');
      P(3, oy + 21, 10, 1, K);
      for (const x of [4, 7, 10]) P(x, oy + 17, 2, 2, '#8a8a96');
      P(3, oy + 16, 10, 1, '#55555f');
    }
    P(4, oy, 8, 7, m);
    P(4, oy, 8, 1, l);
    P(4, oy + 6, 8, 1, d);
    P(4, oy, 1, 1, d);
    P(11, oy, 1, 1, d);
    if (model === 'cyclope') {
      P(4, oy + 1, 8, 4, '#2a2a30');
      P(6, oy + 2, 4, 2, lens);
      P(6, oy + 2, 1, 1, '#fff');
      P(7, oy - 2, 2, 2, '#fff6b0');
      P(7, oy, 2, 1, d);
    } else if (model === 'blinde') {
      P(4, oy + 2, 8, 2, '#2a2a30');
      P(5, oy + 3, 6, 1, lens);
      P(0, oy + 6, 3, 3, d);
      P(13, oy + 6, 3, 3, d);
      P(0, oy + 6, 3, 1, l);
      P(13, oy + 6, 3, 1, l);
      P(7, oy - 2, 2, 2, '#c8362d');
    } else if (model === 'dandy') {
      P(4, oy + 1, 8, 4, '#2a2a30');
      P(5, oy + 2, 2, 2, lens);
      P(9, oy + 2, 2, 2, lens);
      P(8, oy + 1, 4, 1, '#f2c230');
      P(8, oy + 4, 4, 1, '#f2c230');
      P(8, oy + 2, 1, 2, '#f2c230');
      P(11, oy + 2, 1, 2, '#f2c230');
      P(12, oy + 5, 1, 3, '#f2c230');
    } else {
      P(4, oy + 1, 8, 4, '#2a2a30');
      P(5, oy + 2, 2, 2, lens);
      P(9, oy + 2, 2, 2, lens);
      P(5, oy + 2, 1, 1, '#fff');
      P(9, oy + 2, 1, 1, '#fff');
    }
    P(6, oy + 5, 4, 1, d);
    P(7, oy + 5, 1, 1, l);
    P(9, oy + 5, 1, 1, l);
    if (model === 'dandy') {
      P(5, oy + 5, 6, 1, '#8a5a1a');
      P(4, oy + 4, 1, 1, '#8a5a1a');
      P(11, oy + 4, 1, 1, '#8a5a1a');
      P(5, oy + 8, 6, 5, '#5a2a1a');
      P(7, oy + 9, 1, 1, '#f2c230');
      P(7, oy + 11, 1, 1, '#f2c230');
    }
    // Cheminée sur le côté et son panache de fumée.
    P(2, oy + 1, 2, 4, d);
    P(2, oy + 1, 2, 1, l);
    P(3, oy - 1, 1, 1, '#e8ecf0');
    P(2, oy - 3, 2, 1, '#c8ccd4');
    P(3, oy - 5, 1, 1, '#aab0ba');
    if ((o.chapeau || 'aucun') === 'aucun' && model === 'classique') {
      P(7, oy - 2, 2, 2, d);
      P(7, oy - 4, 2, 2, '#e8466a');
    }
    paintNeck(P, o, oy);
    paintBow(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Taupe ou taupinette : pelage selon le teint, tenue au choix (ou juste le poil). */
  function paintMole(P, o) {
    const oy = OY;
    const fur = FUR[o.peau] || FUR.clair;
    paintBody(P, o, fur, fur);
    P(5, oy, 6, 1, fur);
    P(4, oy + 1, 8, 6, fur);
    P(7, oy + 7, 2, 1, fur);
    P(4, oy, 1, 1, shade(fur, 0.7));
    P(11, oy, 1, 1, shade(fur, 0.7));
    P(6, oy + 4, 4, 3, shade(fur, 1.3));
    P(7, oy + 4, 2, 2, '#f0a0b0');
    P(5, oy + 3, 1, 1, K);
    P(10, oy + 3, 1, 1, K);
    P(2, oy + 5, 2, 1, '#d8ccbc');
    P(12, oy + 5, 2, 1, '#d8ccbc');
    if (o.forme === 'f') {
      P(4, oy + 2, 1, 1, K);
      P(11, oy + 2, 1, 1, K);
      P(5, oy + 5, 1, 1, '#e8908a');
      P(10, oy + 5, 1, 1, '#e8908a');
    }
    if (['lunettes', 'monocle', 'soleil', 'rondes', 'aviateur', 'cache-oeil'].includes(o.yeux)) paintEyes(P, o, oy);
    paintNeck(P, o, oy);
    paintBow(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Jack-o'-lantern : tête de citrouille fumante (couleur selon le teint), visage taillé et lumineux. */
  function paintGourd(P, o) {
    const oy = OY;
    const c = GOURD[o.peau] || GOURD.clair;
    const glow = GLOW[o.peau] || GLOW.clair;
    const dk = shade(c, 0.65);
    paintBody(P, o, dk, null);
    P(3, oy + 1, 10, 6, c);
    P(4, oy, 8, 1, c);
    P(4, oy + 7, 8, 1, c);
    P(3, oy + 1, 1, 6, dk);
    P(12, oy + 1, 1, 6, dk);
    P(7, oy, 2, 1, dk);
    P(5, oy + 1, 1, 2, shade(c, 1.2));
    // Yeux en colère, nez et bouche taillés ; la lueur vient de l'intérieur.
    P(5, oy + 2, 2, 1, K);
    P(5, oy + 3, 3, 1, K);
    P(9, oy + 2, 2, 1, K);
    P(8, oy + 3, 3, 1, K);
    P(6, oy + 3, 1, 1, glow);
    P(9, oy + 3, 1, 1, glow);
    P(7, oy + 4, 2, 1, K);
    P(5, oy + 5, 6, 1, K);
    P(6, oy + 6, 1, 1, K);
    P(9, oy + 6, 1, 1, K);
    P(7, oy + 5, 1, 1, c);
    P(9, oy + 5, 1, 1, c);
    P(7, oy + 6, 2, 1, glow);
    // Fumée qui s'échappe du dessus.
    P(11, oy - 3, 1, 1, shade(c, 1.15));
    P(12, oy - 4, 2, 1, shade(c, 1.3));
    P(11, oy - 5, 1, 1, shade(c, 1.45));
    if ((o.chapeau || 'aucun') === 'aucun') {
      P(7, oy - 2, 2, 2, '#4a3a1a');
      P(9, oy - 2, 2, 1, '#3a8a3a');
    }
    paintNeck(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Squelette fossile : crâne et mains d'os (teint = ton de l'os), lueur dans les orbites (couleur). */
  function paintSkeleton(P, o) {
    const oy = OY;
    const bone = BONE[o.peau] || BONE.clair;
    const dk = shade(bone, 0.6);
    paintBody(P, o, bone, null);
    P(5, oy, 6, 6, bone);
    P(4, oy + 1, 8, 4, bone);
    P(5, oy + 6, 6, 1, bone);
    P(7, oy + 7, 2, 1, bone);
    P(5, oy + 2, 2, 2, K);
    P(9, oy + 2, 2, 2, K);
    P(5, oy + 3, 1, 1, LENS[o.couleur] || LENS.blond);
    P(10, oy + 3, 1, 1, LENS[o.couleur] || LENS.blond);
    P(7, oy + 4, 2, 1, K);
    for (const x of [5, 7, 9]) P(x, oy + 6, 1, 1, dk);
    if (['lunettes', 'monocle', 'soleil', 'rondes', 'aviateur', 'cache-oeil'].includes(o.yeux)) paintEyes(P, o, oy);
    paintNeck(P, o, oy);
    paintBow(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Fantôme : drap qui flotte (teint = teinte du drap), orbites vides. Pas de jambes ni de tenue. */
  function paintGhost(P, o) {
    const oy = OY;
    const g = GHOST[o.peau] || GHOST.clair;
    const dk = shade(g, 0.8);
    P(5, oy, 6, 1, g);
    P(4, oy + 1, 8, 18, g);
    P(2, oy + 8, 2, 3, g);
    P(12, oy + 8, 2, 3, g);
    P(4, oy + 1, 1, 18, dk);
    P(11, oy + 1, 1, 18, dk);
    for (const x of [4, 6, 8, 10]) P(x, oy + 19, 2, 1, g);
    P(5, oy + 3, 2, 3, K);
    P(9, oy + 3, 2, 3, K);
    P(7, oy + 7, 2, 2, K);
    paintNeck(P, o, oy);
    paintBow(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Golem de cristal : pierre sombre et cristaux lumineux (teint = couleur des cristaux). */
  function paintGolem(P, o) {
    const oy = OY;
    const cr = CRYSTAL[o.peau] || CRYSTAL.clair;
    const st = '#5a5668';
    paintBody(P, { ...o, tenue: 'golem' }, '#6a6678', null);
    P(5, oy, 6, 6, st);
    P(4, oy + 1, 8, 4, st);
    P(5, oy + 6, 6, 1, '#46425a');
    P(7, oy + 7, 2, 1, st);
    P(5, oy + 1, 6, 1, '#6a6678');
    P(5, oy + 3, 2, 1, cr);
    P(9, oy + 3, 2, 1, cr);
    P(6, oy + 5, 4, 1, K);
    if ((o.chapeau || 'aucun') === 'aucun') {
      P(6, oy - 3, 1, 3, cr);
      P(8, oy - 4, 1, 4, cr);
      P(8, oy - 4, 1, 1, shade(cr, 1.4));
      P(10, oy - 2, 1, 2, cr);
    }
    paintNeck(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Champignon lumineux : grand chapeau (teint = couleur du chapeau) sur un pied crème ; le chapeau remplace les couvre-chefs. */
  function paintMushroom(P, o) {
    const oy = OY;
    const c = CAP[o.peau] || CAP.clair;
    const cream = '#f3e9d2';
    paintBody(P, o, cream, null);
    P(5, oy + 1, 6, 6, cream);
    P(4, oy + 2, 8, 4, cream);
    P(7, oy + 7, 2, 1, cream);
    P(4, oy - 3, 8, 1, c);
    P(3, oy - 2, 10, 1, c);
    P(2, oy - 1, 12, 2, c);
    P(3, oy + 1, 10, 1, shade(c, 0.65));
    for (const [x, y] of [[5, -2], [9, -2], [7, -1], [3, -1], [12, -1]]) P(x, oy + y, 1, 1, '#fff');
    P(6, oy + 3, 1, 1, K);
    P(9, oy + 3, 1, 1, K);
    P(7, oy + 5, 2, 1, '#c25a4a');
    for (const [x, y] of [[1, 1], [14, 2], [0, 4], [15, 0]]) P(x, oy + y, 1, 1, shade(c, 1.4));
    paintNeck(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Ver luisant géant : corps annelé (teint = couleur), antennes et queue qui brillent. Sans tenue. */
  function paintWorm(P, o) {
    const oy = OY;
    const c = WORM[o.peau] || WORM.clair;
    const dk = shade(c, 0.65);
    const glow = shade(c, 1.5);
    const widths = [8, 8, 6, 6];
    widths.forEach((w, i) => {
      const y = oy + 7 + i * 3;
      P(8 - w / 2, y, w, 3, c);
      P(8 - w / 2, y + 2, w, 1, dk);
    });
    P(2, oy + 9, 2, 2, c);
    P(12, oy + 9, 2, 2, c);
    P(6, oy + 19, 4, 2, glow);
    P(7, oy + 21, 2, 1, glow);
    P(5, oy, 6, 1, c);
    P(4, oy + 1, 8, 5, c);
    P(5, oy + 6, 6, 1, c);
    P(5, oy - 2, 1, 2, dk);
    P(10, oy - 2, 1, 2, dk);
    P(5, oy - 3, 1, 1, glow);
    P(10, oy - 3, 1, 1, glow);
    P(5, oy + 2, 2, 2, '#fff');
    P(9, oy + 2, 2, 2, '#fff');
    P(6, oy + 3, 1, 1, K);
    P(9, oy + 3, 1, 1, K);
    P(6, oy + 5, 4, 1, dk);
    paintNeck(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Diablotin des profondeurs : peau rouge, cornes, oreilles pointues, queue en pique, crocs. */
  function paintImp(P, o) {
    const oy = OY;
    const c = IMP[o.peau] || IMP.clair;
    const hair = HAIR[o.couleur] || HAIR.noir;
    paintBody(P, o, c, null);
    P(1, oy + 15, 1, 4, c);
    P(2, oy + 18, 1, 1, c);
    P(0, oy + 19, 2, 2, '#ffd84a');
    P(5, oy, 6, 7, c);
    P(4, oy + 1, 8, 5, c);
    P(7, oy + 7, 2, 1, c);
    P(3, oy + 2, 1, 2, c);
    P(12, oy + 2, 1, 2, c);
    P(4, oy - 2, 1, 3, '#f3e9d2');
    P(11, oy - 2, 1, 3, '#f3e9d2');
    P(3, oy - 3, 1, 1, '#f3e9d2');
    P(12, oy - 3, 1, 1, '#f3e9d2');
    P(5, oy + 3, 2, 1, '#ffd84a');
    P(9, oy + 3, 2, 1, '#ffd84a');
    P(6, oy + 3, 1, 1, K);
    P(9, oy + 3, 1, 1, K);
    P(5, oy + 2, 2, 1, shade(c, 0.5));
    P(9, oy + 2, 2, 1, shade(c, 0.5));
    P(6, oy + 5, 4, 1, K);
    P(6, oy + 5, 1, 1, '#fff');
    P(9, oy + 5, 1, 1, '#fff');
    if ((o.cheveux || 'court') !== 'chauve') paintHair(P, { ...o, cheveux: 'court' }, oy, hair);
    paintBeard(P, o, oy, hair);
    paintPiercing(P, o, oy);
    paintTattoo(P, o, oy);
    paintNeck(P, o, oy);
    paintBow(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  /** Mineur-grenouille des cascades : peau verte (ou orange, bleue), gros yeux sur les côtés, grande bouche. */
  function paintFrog(P, o) {
    const oy = OY;
    const c = FROG[o.peau] || FROG.clair;
    paintBody(P, o, c, null);
    P(4, oy + 1, 8, 6, c);
    P(5, oy, 6, 1, c);
    P(7, oy + 7, 2, 1, c);
    for (const x of [3, 10]) {
      P(x, oy + 1, 3, 1, c);
      P(x, oy + 2, 3, 2, '#fff');
    }
    P(4, oy + 2, 1, 2, K);
    P(11, oy + 2, 1, 2, K);
    P(7, oy + 3, 1, 1, shade(c, 0.6));
    P(8, oy + 3, 1, 1, shade(c, 0.6));
    P(5, oy + 5, 6, 1, shade(c, 0.5));
    P(6, oy + 6, 4, 1, '#e8f0a0');
    for (const x of [2, 12]) P(x, oy + 14, 2, 1, c);
    paintNeck(P, o, oy);
    paintBow(P, o, oy);
    paintHat(P, o, oy);
    paintCompanion(P, o, oy);
    paintItem(P, o, oy);
  }

  // Ellipse pleine tracée ligne à ligne (pour les auras).
  function ellipse(P, cx, cy, rx, ry, col) {
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
      if (y < 0 || y >= H) continue;
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)));
      if (half > 0) P(cx - half, y, half * 2, 1, col);
    }
  }

  /** Lueur autour du personnage : dessinée avant tout le reste. */
  function paintAura(P, o) {
    const a = o.aura || 'aucune';
    if (a === 'aucune') return;
    const oy = OY;
    const tint = { dore: '255,216,74', feu: '255,120,40', givre: '140,210,255', etoiles: '200,170,255', ombre: '90,40,140' }[a];
    ellipse(P, 8, oy + 9, 8, 13, `rgba(${tint},0.24)`);
    ellipse(P, 8, oy + 9, 6, 11, `rgba(${tint},0.3)`);
    const dots = (list, col) => list.forEach(([x, y]) => P(x, oy + y, 1, 1, col));
    if (a === 'feu') {
      dots([[3, 18], [12, 16], [5, 21], [11, 20]], '#ffb43a');
      dots([[2, 14], [13, 12]], '#ff5a2a');
    } else if (a === 'givre') {
      dots([[1, 4], [14, 8], [2, 16], [13, 18], [8, -3]], '#e8f6ff');
      dots([[0, 11], [15, 14]], '#9fd8ff');
    } else if (a === 'etoiles') {
      dots([[0, 2], [15, 5], [1, 13], [14, 17], [8, -3]], '#fff2a0');
      dots([[15, 1], [0, 8]], '#c8aaff');
    } else if (a === 'ombre') {
      dots([[2, 19], [4, 21], [11, 20], [13, 18]], 'rgba(60,20,100,0.7)');
      dots([[1, 15], [14, 15]], 'rgba(60,20,100,0.4)');
    }
  }

  /** Ce qui se trouve derrière le corps : ailes, cape, sac. */
  function paintBack(P, o) {
    const d = o.dos || 'aucun';
    if (d === 'aucun') return;
    const oy = OY;
    const both = (fn) => {
      fn((x, y, w, h, col) => P(x, oy + y, w, h, col));
      fn((x, y, w, h, col) => P(15 - x - w + 1, oy + y, w, h, col));
    };
    if (d === 'cape-rouge') {
      P(3, oy + 7, 10, 12, '#c8362d');
      P(3, oy + 18, 10, 1, '#8a1d17');
    } else if (d === 'sac-a-dos') {
      P(12, oy + 6, 3, 7, '#8b5a2b');
      P(12, oy + 6, 3, 1, '#6a4220');
      P(12, oy + 3, 1, 4, '#8b5a2b');
      P(11, oy + 2, 3, 1, '#a9b0b8');
      P(1, oy + 8, 2, 3, '#6a7a8c');
    } else if (d === 'ailes-cupidon') {
      both((Q) => {
        Q(0, 3, 3, 3, '#fff');
        Q(1, 6, 3, 3, '#f0f0f8');
        Q(0, 4, 1, 2, '#d8d8e8');
      });
    } else if (d === 'hotte') {
      P(12, oy + 4, 4, 8, '#8b3a1a');
      P(12, oy + 3, 3, 1, '#8b3a1a');
      P(13, oy + 2, 2, 1, '#c8362d');
      P(14, oy + 1, 1, 1, '#f2c230');
      P(11, oy + 7, 1, 5, '#5a2a10');
    } else if (d === 'reservoir-vapeur') {
      both((Q) => {
        Q(0, 5, 3, 7, '#9a7048');
        Q(0, 5, 1, 7, '#c8a078');
        Q(1, 8, 1, 1, '#ff5a2a');
        Q(1, 3, 1, 1, '#e8ecf0');
      });
    } else if (d === 'poisson-papier') {
      P(0, oy + 9, 3, 2, '#e8f0ff');
      P(0, oy + 11, 1, 1, '#e8f0ff');
      P(1, oy + 9, 1, 1, K);
    } else if (d === 'ailes-fee') {
      both((Q) => {
        Q(0, 2, 3, 4, 'rgba(210,245,255,0.9)');
        Q(1, 6, 3, 4, 'rgba(190,230,255,0.85)');
        Q(0, 3, 1, 2, '#fff');
      });
    } else if (d === 'ailes-chauve-souris') {
      both((Q) => {
        Q(0, 3, 4, 1, '#6a4a8a');
        Q(0, 4, 3, 4, '#6a4a8a');
        Q(0, 8, 1, 1, '#6a4a8a');
        Q(2, 8, 1, 1, '#6a4a8a');
        Q(1, 5, 1, 3, '#8a6aaa');
      });
    } else if (d === 'ailes-dragon') {
      both((Q) => {
        [[3, 7], [2, 5], [1, 3], [0, 1]].forEach(([x, y]) => Q(x, y, 1, 1, '#6a1d17'));
        Q(0, 2, 1, 7, '#c8362d');
        Q(1, 4, 1, 7, '#c8362d');
        Q(2, 6, 1, 6, '#8a1d17');
      });
    }
  }

  function paintSpecies(P, o, species) {
    if (species === 'robot') paintRobot(P, o);
    else if (species === 'taupe') paintMole(P, o);
    else if (species === 'citrouille') paintGourd(P, o);
    else if (species === 'squelette') paintSkeleton(P, o);
    else if (species === 'fantome') paintGhost(P, o);
    else if (species === 'golem') paintGolem(P, o);
    else if (species === 'champignon') paintMushroom(P, o);
    else if (species === 'ver-luisant') paintWorm(P, o);
    else if (species === 'diablotin') paintImp(P, o);
    else if (species === 'grenouille') paintFrog(P, o);
    else paintHuman(P, o);
  }

  /**
   * Panoplies : un ensemble complet porté d'un coup donne un petit bonus visuel (particules).
   * `drill` = nom de la foreuse assortie (voir le fil des foreuses de fête).
   */
  const SETS = [
    { id: 'chaudron', name: 'Sorcière du chaudron', theme: 'halloween', drill: 'Chaudron', pieces: { chapeau: 'chapeau-sorciere', tenue: 'robe-sorciere', objet: 'balai', compagnon: 'chat-noir' }, fx: { kind: 'monte', colors: ['#ff8a2a', '#b46aff', '#7fff5a'] } },
    { id: 'citrouille', name: 'Gardien citrouille', theme: 'halloween', drill: 'Citrouille', pieces: { espece: 'citrouille', tenue: 'epouvantail', chapeau: 'chapeau-paille', objet: 'torche' }, fx: { kind: 'monte', colors: ['#7fff5a', '#c8ff8a', '#ff8a2a'] } },
    { id: 'pere-noel', name: 'Père Noël', theme: 'noel', drill: 'Père Noël', pieces: { chapeau: 'bonnet-noel', tenue: 'manteau-noel', dos: 'hotte', objet: 'cadeau' }, fx: { kind: 'tombe', colors: ['#ffffff', '#cfe8ff'] } },
    { id: 'sapin', name: 'Lutin du sapin', theme: 'noel', drill: 'Sapin', pieces: { chapeau: 'bonnet-noel', objet: 'canne-sucre', compagnon: 'lucioles', aura: 'givre' }, fx: { kind: 'scintille', colors: ['#ff5a5a', '#ffe84a', '#5aff8a', '#5ac8ff'] } },
    { id: 'cupidon', name: 'Cupidon', theme: 'saint-valentin', drill: 'Cupidon', pieces: { chapeau: 'aureole', tenue: 'costume-cupidon', dos: 'ailes-cupidon', objet: 'arc-coeur' }, fx: { kind: 'coeurs', colors: ['#ff4a7a', '#ff9ab8'] } },
    { id: 'grand-saint', name: 'Grand Saint', theme: 'saint-nicolas', drill: 'Grand Saint', pieces: { chapeau: 'mitre', tenue: 'chape-eveque', objet: 'crosse' }, fx: { kind: 'scintille', colors: ['#ffe84a', '#fff8c0'] } },
    { id: 'lapin', name: 'Lapin de Pâques', theme: 'paques', drill: 'Lapin', pieces: { chapeau: 'oreilles-lapin', objet: 'panier-paques', accessoire: 'noeud-papillon' }, fx: { kind: 'monte', colors: ['#ff9ad8', '#9ae8ff', '#ffe89a', '#b8ff9a'] } },
    { id: 'minuit', name: 'Minuit', theme: 'nouvel-an', drill: 'Minuit', pieces: { chapeau: 'cotillon', objet: 'coupe', accessoire: 'serpentin' }, fx: { kind: 'tombe', colors: ['#ff5a8a', '#ffe84a', '#5ac8ff', '#8aff5a'] } },
    { id: 'pi', name: 'Mathématicien du 14 mars', theme: 'pi-day', drill: 'Pi', pieces: { accessoire: 'pin-pi', objet: 'tarte', tenue: 'blouse' }, fx: { kind: 'monte', colors: ['#5ac8ff', '#ffffff'] } },
    { id: 'poisson', name: 'Farceur du 1er avril', theme: 'poisson-avril', drill: 'Poisson', pieces: { dos: 'poisson-papier', objet: 'poisson' }, fx: { kind: 'bulles', colors: ['#cfeaff', '#8ad0ff'] } },
    { id: 'nain', name: 'Pionnier nain', theme: 'mineur', drill: 'Pionnier', pieces: { espece: 'nain', tenue: 'mineur-nain', chapeau: 'casque-nain', objet: 'hache' }, fx: { kind: 'scintille', colors: ['#ffd84a', '#ffb02a'] } },
    { id: 'steampunk', name: 'Horloger à vapeur', theme: 'mineur', drill: 'Horloger', pieces: { espece: 'robot', chapeau: 'chapeau-metal', dos: 'reservoir-vapeur', objet: 'pipe' }, fx: { kind: 'monte', colors: ['#e8e8f0', '#b8b8c8'] } },
    { id: 'chevalier', name: 'Chevalier', theme: 'mineur', drill: 'Chevalier', pieces: { tenue: 'armure', chapeau: 'heaume', objet: 'bouclier' }, fx: { kind: 'scintille', colors: ['#ffffff', '#9ad0ff'] } },
    { id: 'pirate', name: 'Pirate', theme: 'mineur', drill: 'Pirate', pieces: { tenue: 'pirate', chapeau: 'bandana', yeux: 'cache-oeil', accessoire: 'medaille' }, fx: { kind: 'tombe', colors: ['#ffd84a', '#ffb02a'] } },
  ];

  /** Panoplie complète portée par cet avatar, ou null. */
  function activeSet(av) {
    return SETS.find((st) => Object.entries(st.pieces).every(([slot, id]) => (av || {})[slot] === id)) || null;
  }

  /** Particules du bonus de panoplie, dessinées derrière le personnage (image `f` de l'animation). */
  function paintSetBonus(P, fx, f) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const col = fx.colors[i % fx.colors.length];
      const x = (i * 5 + 1) % W;
      const phase = (f * 2 + i * 4) % H;
      if (fx.kind === 'monte') P(x, H - 1 - phase, 1, 1, col);
      else if (fx.kind === 'tombe') P(x, phase, 1, 1, col);
      else if (fx.kind === 'bulles') {
        P(x, H - 1 - phase, 1, 1, col);
        if (i % 3 === 0) P(x + 1, H - 2 - phase, 1, 1, fx.colors[1]);
      } else if (fx.kind === 'coeurs') {
        const y = H - 1 - phase;
        if (i % 2 === 0) {
          P(x, y, 1, 1, col);
          P(x + 2, y, 1, 1, col);
          P(x, y + 1, 3, 1, col);
          P(x + 1, y + 2, 1, 1, col);
        } else P(x, y, 1, 1, col);
      } else if ((f + i) % 3 !== 0) {
        // scintille : croix de quatre pixels qui clignote
        const y = (i * 7 + 2) % (H - 4) + 1;
        P(x, y, 1, 1, col);
        if ((f + i) % 3 === 1) {
          P(x - 1, y, 1, 1, col);
          P(x + 1, y, 1, 1, col);
          P(x, y - 1, 1, 1, col);
          P(x, y + 1, 1, 1, col);
        }
      }
    }
  }

  /** Retouches après dessin : corpulence, pose, secousse du robot. `t` = canevas W x H. */
  function reshape(t, o) {
    const g = t.getContext('2d');
    const copy = () => {
      const k = document.createElement('canvas');
      k.width = W;
      k.height = H;
      k.getContext('2d').drawImage(t, 0, 0);
      return k;
    };
    const y0 = OY + 8;
    const h = 8;
    const corp = o.corpulence || 'normale';
    const n = { costaud: 1, imposant: 2 }[corp] || 0;
    if (n) {
      const k = copy();
      g.clearRect(0, y0, W, h);
      g.drawImage(k, 0, y0, 8, h, -n, y0, 8, h);
      g.drawImage(k, 8, y0, 8, h, n, y0, 8, h);
      for (let x = 8 - n; x < 8 + n; x++) g.drawImage(k, x < 8 ? 7 : 8, y0, 1, h, x, y0, 1, h);
    } else if (corp === 'mince') {
      const k = copy();
      g.clearRect(0, y0, W, h);
      g.drawImage(k, 0, y0, 8, h, 1, y0, 8, h);
      g.drawImage(k, 8, y0, 8, h, 7, y0, 8, h);
    }
    const pose = o.pose || 'debout';
    const px = (x, y) => {
      const d = g.getImageData(x, y, 1, 1).data;
      return d[3] ? `rgb(${d[0]},${d[1]},${d[2]})` : null;
    };
    if (pose === 'victoire') {
      const sleeve = px(3, y0 + 2) || px(4, y0 + 2) || '#d9772b';
      const hand = px(3, y0 + 7) || px(4, y0 + 7) || '#f0c9a0';
      g.clearRect(0, y0, 4, h);
      g.clearRect(12, y0, 4, h);
      for (const x of [2, 13]) {
        g.fillStyle = sleeve;
        g.fillRect(x, y0 - 4, 1, 7);
        g.fillStyle = hand;
        g.fillRect(x, y0 - 6, 1, 2);
      }
      for (const x of [3, 12]) {
        g.fillStyle = sleeve;
        g.fillRect(x, y0 + 1, 1, 2);
      }
    } else if (pose === 'bras-croises') {
      const sleeve = px(3, y0 + 2) || px(4, y0 + 2) || '#d9772b';
      const hand = px(3, y0 + 7) || '#f0c9a0';
      g.clearRect(0, y0 + 3, 4, 5);
      g.clearRect(12, y0 + 3, 4, 5);
      g.fillStyle = sleeve;
      g.fillRect(4, y0 + 3, 8, 2);
      g.fillStyle = hand;
      g.fillRect(4, y0 + 3, 2, 1);
      g.fillRect(10, y0 + 4, 2, 1);
    } else if (pose === 'assis') {
      // Jambes pliées : on retire quatre lignes de jambes et on pose un tabouret.
      const k = copy();
      g.clearRect(0, 0, W, H);
      g.drawImage(k, 0, 0, W, OY + 18, 0, 4, W, OY + 18);
      g.drawImage(k, 0, OY + 20, W, H - OY - 20, 0, OY + 22, W, H - OY - 20);
      g.fillStyle = '#7a5230';
      g.fillRect(2, OY + 21, 12, 2);
      g.fillStyle = '#4a2f1a';
      g.fillRect(3, OY + 23, 1, 4);
      g.fillRect(12, OY + 23, 1, 4);
    }
    if (o._jolt) {
      // Secousse du robot : tout le corps tremble d'un pixel.
      const k = copy();
      g.clearRect(0, 0, W, H);
      g.drawImage(k, o._jolt, 0);
    }
  }

  function paint(c, o) {
    const species = o.espece || 'humain';
    const f = o._f || 0;
    const set = o._bonus ? activeSet(o) : null;
    const o2 = { ...o };
    if (o._mood === 'content') o2.bouche = 'sourire';
    else if (o._mood === 'grimace') o2.bouche = 'grimace';
    if (o._f !== undefined) {
      if (f === 3) o2._blink = true;
      if (species === 'robot' && (f === 1 || f === 2)) o2._jolt = f === 1 ? 1 : -1;
    }
    const t = document.createElement('canvas');
    t.width = W;
    t.height = H;
    const P = painter(t.getContext('2d'));
    paintAura(P, o2);
    paintBack(P, o2);
    paintSpecies(P, o2, species);
    reshape(t, o2);
    if (species === 'nain') {
      // Même dessin que l'humain, mais les jambes raccourcies de quatre pixels : le nain est trapu.
      c.drawImage(t, 0, 0, W, OY + 16, 0, 4, W, OY + 16);
      c.drawImage(t, 0, OY + 18, W, 4, 0, OY + 18, W, 4);
    } else c.drawImage(t, 0, 0);
    if (set) {
      // Particules derrière le personnage (n'écrasent aucun pixel déjà dessiné).
      c.globalCompositeOperation = 'destination-over';
      paintSetBonus(painter(c), set.fx, f);
      c.globalCompositeOperation = 'source-over';
    }
  }

  /**
   * Tenue d'origine et histoire de chaque type de personnage : choisir un type applique ces réglages
   * (sauf ceux que le joueur n'a pas encore débloqués).
   */
  const STORIES = {
    humain: { text: 'Mineur de métier : il connaît chaque galerie par cœur.', preset: { tenue: 'mineur', chapeau: 'casque', objet: 'pioche' } },
    nain: { text: 'Les nains creusent ici depuis avant les cartes. Barbe nattée, hache à la ceinture, rancune tenace envers les éboulements.', preset: { tenue: 'mineur-nain', chapeau: 'casque-nain', objet: 'hache' }, look: { barbe: 'tressee', couleur: 'roux' } },
    robot: { text: 'Automate construit pour pomper l\'eau des galeries. À force de tourner, il a appris à poser des questions.', preset: { chapeau: 'chapeau-metal', objet: 'pipe', accessoire: 'aucun' } },
    taupe: { text: 'Géomètre de la mine : mesure les galeries à l\'oreille et signe ses plans à la plume.', preset: { tenue: 'redingote', chapeau: 'melon', objet: 'canne', accessoire: 'noeud-papillon' }, look: { yeux: 'rondes' } },
    citrouille: { text: 'Gardien des galeries la nuit venue. Il n\'a jamais su qui lui avait taillé ce sourire.', preset: { tenue: 'epouvantail', chapeau: 'chapeau-paille', objet: 'torche', accessoire: 'aucun' } },
    squelette: { text: 'Dernier d\'une expédition perdue il y a un siècle. Il cherche toujours la sortie, sa carte à la main.', preset: { tenue: 'explorateur', chapeau: 'casque-colonial', objet: 'lanterne', accessoire: 'aucun' } },
    fantome: { text: 'Mineur disparu lors d\'un éboulement. Il revient éclairer le chemin des autres, ses chaînes en bandoulière.', preset: { chapeau: 'casque', objet: 'lanterne', accessoire: 'chaines', compagnon: 'lucioles' } },
    golem: { text: 'Gardien de pierre d\'un temple englouti. Ses runes s\'allument quand quelqu\'un creuse trop près.', preset: { accessoire: 'runes', chapeau: 'aucun', objet: 'marteau' } },
    champignon: { text: 'Herboriste des grottes : cultive la lumière entre les stalactites et parle aux lucioles.', preset: { tenue: 'herboriste', objet: 'fleur', compagnon: 'lucioles', accessoire: 'aucun' } },
    'ver-luisant': { text: 'Guide des galeries sombres : sa queue éclaire le chemin, et il connaît tous les raccourcis.', preset: { chapeau: 'casquette', objet: 'lanterne', accessoire: 'foulard' } },
    diablotin: { text: 'Comptable des profondeurs : tient les comptes du feu et ne rend jamais la monnaie.', preset: { tenue: 'tunique-infernale', chapeau: 'aucun', objet: 'torche', accessoire: 'aucun' } },
    grenouille: { text: 'Mineur des cascades : à l\'aise dans l\'eau jusqu\'au cou, ciré jaune toujours ruisselant.', preset: { tenue: 'cire-jaune', chapeau: 'suroit', objet: 'pioche', accessoire: 'aucun' } },
  };
  // Réglages neutres pour les vignettes de la liste des types : elles ne doivent pas dépendre du personnage en cours.
  const NEUTRAL = { forme: 'm', peau: 'clair', cheveux: 'court', couleur: 'brun', yeux: 'points', iris: 'defaut', barbe: 'aucune', trait: 'aucun', bouche: 'normal', piercing: 'aucun', tatouage: 'aucun', accessoire: 'aucun', compagnon: 'aucun', aura: 'aucune', dos: 'aucun', modele: 'classique', lieu: 'hublot' };
  function thumb(species) {
    const story = STORIES[species] || { preset: {} };
    return { ...NEUTRAL, ...story.preset, ...(story.look || {}), espece: species };
  }
  const MODELS = {
    classique: 'Le modèle de série : tuyaux, rivets et un panache de vapeur.',
    cyclope: 'Un seul grand œil et une lanterne sur le crâne : il éclaire devant lui.',
    blinde: 'Épaulières massives et visière fendue : il garde les portes de la mine.',
    chenilles: 'Pas de jambes, des chenilles : rien ne l\'arrête dans les éboulis.',
    dandy: 'Monocle, moustache à ressorts et gilet de laiton : il ne travaille que pour les galas.',
  };

  const cache = new Map();

  /** Canevas 16 x 28 à l'échelle 1 (mis en cache). */
  function sprite(av) {
    const key = JSON.stringify(av || {});
    let c = cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      paint(ctx, av || {});
      if (cache.size > 80) cache.clear();
      cache.set(key, c);
    }
    return c;
  }

  const finishCache = new Map();

  /**
   * Version « aboutie » du sprite : contour de la couleur voisine assombrie, reflet sur les bords haut et gauche, ombre sur les
   * bords bas et droit, petite ombre au sol. Canevas de (W + 2) x (H + 2), l'original décalé d'un pixel.
   */
  function finished(av) {
    const key = JSON.stringify(av || {});
    let out = finishCache.get(key);
    if (out) return out;
    const src = sprite(av).getContext('2d').getImageData(0, 0, W, H).data;
    out = document.createElement('canvas');
    out.width = W + 2;
    out.height = H + 2;
    const c = out.getContext('2d');
    const img = c.createImageData(W + 2, H + 2);
    const d = img.data;
    const at = (x, y) => (y * W + x) * 4;
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[at(x, y) + 3] > 200;
    const tone = (i, f) => [0, 1, 2].map((k) => Math.max(0, Math.min(255, Math.round(src[i + k] * f))));
    const put = (x, y, rgb, a) => {
      const i = ((y + 1) * (W + 2) + (x + 1)) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = a;
    };
    // Ombre au sol sous les pieds.
    for (const [x0, x1, y] of [[5, 10, H], [3, 12, H - 1]]) for (let x = x0; x <= x1; x++) if (!solid(x, y)) put(x, y, [0, 0, 0], 70);
    for (let y = -1; y <= H; y++) {
      for (let x = -1; x <= W; x++) {
        if (solid(x, y)) {
          const i = at(x, y);
          let f = 1;
          if (!solid(x - 1, y) || !solid(x, y - 1)) f = 1.22;
          else if (!solid(x + 1, y) || !solid(x, y + 1)) f = 0.78;
          put(x, y, tone(i, f), 255);
          continue;
        }
        const near = [[0, -1], [-1, 0], [1, 0], [0, 1]].map(([dx, dy]) => [x + dx, y + dy]).find(([nx, ny]) => solid(nx, ny));
        if (near) put(x, y, tone(at(near[0], near[1]), 0.3), 255);
        else if (x >= 0 && y >= 0 && x < W && y < H && src[at(x, y) + 3]) {
          const i = at(x, y);
          put(x, y, [src[i], src[i + 1], src[i + 2]], src[i + 3]);
        }
      }
    }
    c.putImageData(img, 0, 0);
    if (finishCache.size > 80) finishCache.clear();
    finishCache.set(key, out);
    return out;
  }

  /** Nouveau canevas pixel art ; `scale` = pixels d'écran par pixel d'avatar. */
  function canvas(av, { scale = 3, view = 'full', finish = false } = {}) {
    const [sx, sy, sw, sh] = VIEWS[view] || VIEWS.full;
    const c = document.createElement('canvas');
    c.className = `avatar avatar-${view}`;
    if (finish) {
      // Style abouti : le contour déborde d'un pixel de chaque côté de la zone recadrée.
      c.width = (sw + 2) * scale;
      c.height = (sh + 2) * scale;
      const fctx = c.getContext('2d');
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(finished(av), sx, sy, sw + 2, sh + 2, 0, 0, c.width, c.height);
      return c;
    }
    if (global.Pixel && global.Pixel.isHd && global.Pixel.isHd()) {
      // Essai HD-2D : sprite redessiné en haute définition (voir Pixel.hdUpgrade), au double de définition pour les écrans nets.
      const up = global.Pixel.hdUpgrade(sprite(av));
      c.width = sw * scale * 2;
      c.height = sh * scale * 2;
      c.style.width = `${sw * scale}px`;
      c.style.height = `${sh * scale}px`;
      const hctx = c.getContext('2d');
      hctx.imageSmoothingEnabled = true;
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(up.canvas, (sx + up.pad) * 4, (sy + up.pad) * 4, sw * 4, sh * 4, 0, 0, c.width, c.height);
      return c;
    }
    c.width = sw * scale;
    c.height = sh * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite(av), sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
    return c;
  }

  /**
   * Anime un canevas déjà inséré dans la page : clignement, secousse du robot, particules de panoplie.
   * S'arrête tout seul quand le canevas quitte la page. Renvoie une fonction d'arrêt.
   */
  function animate(el, av, opts) {
    const o = opts || {};
    let f = 0;
    const draw = () => {
      if (!el.isConnected) return stop();
      const next = canvas({ ...av, _f: f % 4, _bonus: true }, { scale: o.scale || 3, view: o.view || 'full', finish: !!o.finish });
      const g = el.getContext('2d');
      g.imageSmoothingEnabled = false;
      el.width = next.width;
      el.height = next.height;
      g.drawImage(next, 0, 0);
      f++;
    };
    const timer = setInterval(draw, o.interval || 280);
    function stop() {
      clearInterval(timer);
    }
    draw();
    return stop;
  }

  global.Avatar = { canvas, animate, SETS, activeSet, sprite, finished, STORIES, MODELS, thumb, W, H, OY, SWATCHES: { robot: METAL, taupe: FUR, citrouille: GOURD, squelette: BONE, fantome: GHOST, golem: CRYSTAL, champignon: CAP, 'ver-luisant': WORM, diablotin: IMP, grenouille: FROG, lentilles: LENS } };
})(window);
