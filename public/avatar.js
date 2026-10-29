'use strict';

/*
 * Avatar du joueur en pixel art : grille de 16 x 28 pixels, dessinée à partir de quelques choix (voir src/avatar.js).
 *   Avatar.canvas(av, { scale, view })  → <canvas> (view : 'full', 'bust' ou 'head')
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

  function paint(c, o) {
    const P = (x, y, w, h, col) => {
      c.fillStyle = col;
      c.fillRect(x, y, w, h);
    };
    const skin = SKIN[o.peau] || SKIN.clair;
    const hair = HAIR[o.couleur] || HAIR.brun;
    const fem = o.forme === 'f';
    const oy = OY;
    const outfit = o.tenue || 'mineur';

    // Cape dorée : derrière le corps.
    if (outfit === 'cape') {
      P(3, oy + 7, 10, 11, '#c8941c');
      P(3, oy + 17, 10, 1, '#a77f12');
    }
    // Jambes.
    const legs = { smoking: '#222', scaphandre: '#6b7a8c', cape: '#3a4a6b', armure: '#8a8f98', pirate: '#5a3a1a', cuisinier: '#4a4a52' }[outfit] || '#3a4a6b';
    if (outfit === 'robe') {
      P(5, oy + 15, 2, 5, skin);
      P(9, oy + 15, 2, 5, skin);
      P(5, oy + 20, 2, 1, '#b02a6a');
      P(9, oy + 20, 2, 1, '#b02a6a');
    } else {
      P(5, oy + 14, 3, 7, legs);
      P(8, oy + 14, 3, 7, legs);
      P(5, oy + 21, 3, 1, K);
      P(8, oy + 21, 3, 1, K);
    }
    // Torse et bras.
    const top = { mineur: '#d9772b', salopette: '#d9772b', robe: '#e86aa8', smoking: '#222', pull: '#4a86e8', scaphandre: '#8aa0b8', cape: '#4a86e8', armure: '#aeb6c2', pirate: '#f3f3f3', cuisinier: '#ffffff', blouse: '#f3f3f3' }[outfit] || '#d9772b';
    if (fem) {
      P(5, oy + 7, 6, 4, top);
      if (outfit === 'robe') {
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
    // Mains.
    P(2, oy + 13, 2, 1, skin);
    P(12, oy + 13, 2, 1, skin);
    // Tête.
    P(5, oy, 6, 7, skin);
    P(4, oy + 1, 8, 5, skin);
    P(7, oy + 7, 2, 1, skin);
    // Yeux.
    const eyes = o.yeux || 'points';
    if (eyes === 'points') {
      P(6, oy + 3, 1, 1, K);
      P(9, oy + 3, 1, 1, K);
    } else if (eyes === 'grands') {
      P(5, oy + 3, 2, 2, '#fff');
      P(9, oy + 3, 2, 2, '#fff');
      P(6, oy + 4, 1, 1, '#2a6fdb');
      P(9, oy + 4, 1, 1, '#2a6fdb');
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
    }
    else if (eyes === 'monocle') {
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
    } else if (eyes === 'etoiles') {
      for (const x of [6, 9]) {
        P(x, oy + 2, 1, 3, '#ffd84a');
        P(x - 1, oy + 3, 3, 1, '#ffd84a');
        P(x, oy + 3, 1, 1, '#fff');
      }
    }
    P(7, oy + 5, 2, 1, '#c25a4a');
    if (fem) {
      P(5, oy + 5, 1, 1, '#e8908a');
      P(10, oy + 5, 1, 1, '#e8908a');
    }
    // Cheveux.
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
    }
    // Barbe.
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
    }
    // Traits du visage.
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
    // Couvre-chef.
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
    }
    // Objet en main.
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
    }
  }

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

  /** Nouveau canevas pixel art ; `scale` = pixels d'écran par pixel d'avatar. */
  function canvas(av, { scale = 3, view = 'full' } = {}) {
    const [sx, sy, sw, sh] = VIEWS[view] || VIEWS.full;
    const c = document.createElement('canvas');
    c.className = `avatar avatar-${view}`;
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

  global.Avatar = { canvas, sprite, W, H, OY };
})(window);
