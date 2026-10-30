'use strict';

/*
 * Défis en 16 bits (refonte, réservée au responsable) : deux galeries de mine détaillées, à la place des anciens petits tunnels.
 *   Defis16.weekly(canvas, ch, avatar, t)      → « Ton filon » : le personnage creuse vers un diamant, l'avancée suit le défi de la semaine
 *   Defis16.collective(canvas, data, colors, t) → « Galerie commune » : la foreuse avance avec les points du mois, un plancher coloré par joueur
 *   Defis16.SIZE                                → taille des canevas [largeur, hauteur]
 * t = temps en secondes (0 = image fixe).
 */
(function (global) {
  const SIZE = { weekly: [164, 76], collective: [164, 72] };
  const hash = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
  const backdrops = {};

  /** Roche en strates avec filons de minerai et deux fossiles (peinte une fois). */
  function rock(key, W, H) {
    if (backdrops[key]) return backdrops[key];
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const layers = [['#3a2414', '#4a2f1a', '#5a3a20'], ['#33291f', '#463a2c', '#58493a'], ['#2c2a33', '#3b3945', '#4c4a58']];
    for (let y = 0; y < H; y++) {
      const band = layers[Math.min(2, Math.floor((y / H) * 3 + hash(Math.floor(y / 6)) * 0.4))];
      for (let i = 0; i < W; i++) {
        const n = hash(i * 3.17 + y * 9.31 + (key === 'w' ? 1 : 5));
        x.fillStyle = n < 0.35 ? band[0] : n < 0.8 ? band[1] : band[2];
        x.fillRect(i, y, 1, 1);
      }
    }
    // Filons : or, cuivre, bleu
    const veins = ['#e8c547', '#d9822b', '#5ee0ff', '#e8c547'];
    for (let k = 0; k < 14; k++) {
      const vx = Math.floor(hash(k * 7.3 + 1) * (W - 6));
      const vy = Math.floor(hash(k * 3.9 + 2) * (H - 4));
      x.fillStyle = veins[k % 4];
      x.fillRect(vx, vy, 2, 1);
      x.fillRect(vx + 1, vy + 1, 2, 1);
      x.fillStyle = 'rgba(255,255,255,0.5)';
      x.fillRect(vx, vy, 1, 1);
    }
    // Fossile en spirale (ammonite) et arête de poisson
    const fx = Math.floor(W * 0.58);
    const fy = Math.floor(H * 0.3);
    x.fillStyle = '#b9a98a';
    [[1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 2], [0, 1], [1, 1], [2, 2]].forEach(([dx, dy]) => x.fillRect(fx + dx, fy + dy, 1, 1));
    const bx = Math.floor(W * 0.28);
    const by = Math.floor(H * 0.72);
    x.fillStyle = '#c8bda0';
    x.fillRect(bx, by, 9, 1);
    for (let i = 1; i < 8; i += 2) { x.fillRect(bx + i, by - 2, 1, 2); x.fillRect(bx + i, by + 1, 1, 2); }
    backdrops[key] = c;
    return c;
  }

  /** Étai : deux montants et une poutre, avec ombre. */
  function timber(x, px, top, bottom) {
    x.fillStyle = '#7c5230';
    x.fillRect(px, top, 3, bottom - top);
    x.fillStyle = '#a07040';
    x.fillRect(px, top, 1, bottom - top);
    x.fillStyle = '#432812';
    x.fillRect(px + 2, top, 1, bottom - top);
  }

  /** Lanterne suspendue, lueur douce qui vacille. */
  function lantern(x, lx, ly, t) {
    const flick = 0.85 + 0.15 * Math.sin(t * 8 + lx);
    x.fillStyle = '#3a2c22';
    x.fillRect(lx, ly - 8, 1, 8);
    x.fillStyle = '#16121c';
    x.fillRect(lx - 3, ly, 7, 1);
    x.fillRect(lx - 3, ly + 7, 7, 1);
    x.fillStyle = '#ffd84a';
    x.fillRect(lx - 2, ly + 1, 5, 6);
    x.fillStyle = '#fff2a8';
    x.fillRect(lx - 1, ly + 2, 3, 3);
    const g = x.createRadialGradient(lx, ly + 4, 1, lx, ly + 4, 26);
    g.addColorStop(0, `rgba(255, 216, 74, ${0.3 * flick})`);
    g.addColorStop(1, 'rgba(255, 216, 74, 0)');
    x.fillStyle = g;
    x.fillRect(lx - 26, ly - 22, 52, 52);
  }

  function rails(x, W, y, from) {
    x.fillStyle = '#3d2814';
    for (let i = from; i < W; i += 7) x.fillRect(i, y + 2, 4, 2);
    x.fillStyle = '#8f99a8';
    x.fillRect(from, y, W - from, 1);
    x.fillStyle = '#5f6877';
    x.fillRect(from, y + 1, W - from, 1);
  }

  /** Cristal de diamant (petit amas) : (px, py) = pointe du bas. */
  function crystals(x, px, py, lit, t) {
    const a = (Math.sin(t * 5) + 1) / 2;
    x.globalAlpha = lit;
    [[0, 0, 5, 9], [-5, 2, 4, 6], [5, 2, 4, 7], [-9, 4, 3, 4], [9, 4, 3, 5]].forEach(([dx, dy, w, h]) => {
      x.fillStyle = '#1e86b0';
      x.fillRect(px + dx - Math.floor(w / 2), py + dy - h, w, h);
      x.fillStyle = '#5ee0ff';
      x.fillRect(px + dx - Math.floor(w / 2), py + dy - h, Math.max(1, w - 2), h - 1);
      x.fillStyle = '#e6ffff';
      x.fillRect(px + dx - Math.floor(w / 2), py + dy - h, 1, Math.max(1, h - 3));
    });
    x.globalAlpha = 1;
    x.fillStyle = `rgba(255,255,255,${lit * a})`;
    x.fillRect(px - 1, py - 14, 1, 5);
    x.fillRect(px - 3, py - 12, 5, 1);
    const g = x.createRadialGradient(px, py - 5, 1, px, py - 5, 24);
    g.addColorStop(0, `rgba(94, 224, 255, ${0.28 * lit})`);
    g.addColorStop(1, 'rgba(94, 224, 255, 0)');
    x.fillStyle = g;
    x.fillRect(px - 24, py - 30, 48, 48);
  }

  /** Défi de la semaine : galerie, étais, lanternes, rails ; le personnage creuse la roche vers l'alcôve de cristaux. */
  function weekly(canvas, ch, avatar, t) {
    const [W, H] = SIZE.weekly;
    if (canvas.width !== W) { canvas.width = W; canvas.height = H; }
    const x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;
    const floor = 64;
    const f = Math.min(1, ch.progress / ch.goal);
    const reach = 100;
    const x0 = ch.done ? 110 : Math.round(4 + (reach - 4) * f);
    x.drawImage(rock('w', W, H), 0, 0);
    // Galerie creusée jusqu'au personnage (ou jusqu'à l'alcôve une fois le défi réussi)
    const head = ch.done ? W : x0 + 24;
    x.fillStyle = '#120d0a';
    x.fillRect(0, 10, head, floor - 10);
    for (let i = 0; i < head; i += 3) for (let y = 10; y < floor; y += 3) if (hash(i * 1.9 + y * 4.3) > 0.82) { x.fillStyle = '#1b1410'; x.fillRect(i, y, 3, 3); }
    // Alcôve de cristaux au bout, dans la roche tant que le défi n'est pas fini
    x.fillStyle = '#0d0a10';
    x.fillRect(128, 26, 36, floor - 26);
    // Plafond : poutre et étais
    x.fillStyle = '#5a3a1e';
    x.fillRect(0, 8, head, 3);
    x.fillStyle = '#7c5230';
    x.fillRect(0, 8, head, 1);
    for (let i = 14; i < head - 6; i += 34) timber(x, i, 8, floor);
    // Lanternes
    for (let i = 40; i < head - 10; i += 68) lantern(x, i, 14, t);
    // Sol, rails, petit wagon de minerai à l'arrière
    x.fillStyle = '#2a1a0c';
    x.fillRect(0, floor, head, 4);
    rails(x, W, floor + 1, 0);
    if (x0 > 34) {
      x.fillStyle = '#16121c';
      x.fillRect(5, floor - 11, 20, 11);
      x.fillStyle = '#8f99a8';
      x.fillRect(6, floor - 10, 18, 8);
      x.fillStyle = '#c3cbd6';
      x.fillRect(6, floor - 10, 18, 1);
      [[8, '#e8c547'], [13, '#d9822b'], [18, '#5ee0ff']].forEach(([dx, c]) => { x.fillStyle = c; x.fillRect(dx, floor - 13, 4, 3); });
      x.fillStyle = '#16121c';
      x.fillRect(7, floor - 1, 4, 3);
      x.fillRect(19, floor - 1, 4, 3);
    }
    // Repères d'avancement : une petite lampe par étape du défi, sur le sol
    for (let k = 1; k <= ch.goal; k++) {
      const mx = Math.round(4 + (reach - 4) * (k / ch.goal)) + 12;
      const on = ch.progress >= k;
      x.fillStyle = on ? '#ffd84a' : '#4a3a20';
      x.fillRect(mx, floor + 5, 3, 2);
      if (on) { x.fillStyle = 'rgba(255,216,74,0.35)'; x.fillRect(mx - 1, floor + 4, 5, 4); }
    }
    crystals(x, 146, floor, ch.done ? 1 : 0.6, t);
    const who = global.Avatar ? Avatar.sprite({ ...(avatar || {}), objet: 'aucun' }) : null;
    if (who) x.drawImage(who, x0, floor - 27);
    if (ch.done) {
      // Bras levé avec un éclat de diamant, étincelles
      x.fillStyle = '#f0c090';
      for (let i = 0; i < 8; i++) x.fillRect(x0 + 12 + i, floor - 16 - Math.floor(i * 0.7), 2, 2);
      crystals(x, x0 + 22, floor - 14, 1, t + 1);
      for (let i = 0; i < 8; i++) {
        x.fillStyle = ['#ffd84a', '#5ee0ff', '#ffffff'][i % 3];
        x.fillRect(100 + Math.floor(hash(i + 1) * 60), Math.floor(14 + ((hash(i + 9) * 40 + t * 12) % 40)), 1, 2);
      }
      return;
    }
    // Coup de pioche : levée, milieu, impact, milieu
    const frame = [0, 1, 2, 1][Math.floor(t * 4) % 4];
    const hx = x0 + 12;
    const hy = floor - 27 + 17;
    const px = (a, b, c) => { x.fillStyle = c; x.fillRect(a, b, 1, 1); };
    if (frame === 0) {
      for (let i = 0; i < 8; i++) px(hx + 1 + Math.floor(i * 0.7), hy - i, '#8a5a2b');
      for (let i = -3; i <= 3; i++) px(hx + 6 + i, hy - 8 + (Math.abs(i) === 3 ? 1 : 0), '#c9ced6');
    } else if (frame === 1) {
      for (let i = 0; i < 9; i++) px(hx + 1 + i, hy - Math.floor(i * 0.3), '#8a5a2b');
      for (let i = -3; i <= 3; i++) px(hx + 10, hy - 3 + i, '#c9ced6');
    } else {
      for (let i = 0; i < 9; i++) px(hx + 1 + i, hy + Math.floor(i * 0.5), '#8a5a2b');
      for (let i = -3; i <= 3; i++) px(hx + 10 + Math.floor(Math.abs(i) * 0.3), hy + 4 + i, '#c9ced6');
      [[13, 2], [14, 5], [15, 0], [12, 7]].forEach(([dx, dy], k) => px(hx + dx + ((k + Math.floor(t * 8)) % 2), hy + dy - ((k + Math.floor(t * 8)) % 3), '#c9a46b'));
    }
  }

  /** Défi du mois : la foreuse de chantier avance dans la galerie commune, plancher coloré par joueur, chambre de diamants au bout. */
  function collective(canvas, data, colors, t) {
    const [W, H] = SIZE.collective;
    if (canvas.width !== W) { canvas.width = W; canvas.height = H; }
    const x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;
    const floor = 56;
    const f = Math.min(1, data.total / data.goal);
    const pile = 128;
    const reach = pile - 36;
    const head = Math.round(2 + (reach - 2) * f);
    x.drawImage(rock('c', W, H), 0, 0);
    x.fillStyle = '#120d0a';
    x.fillRect(0, 8, head + 34, floor - 8);
    // Chambre des diamants
    x.fillStyle = '#0d0a10';
    x.fillRect(pile - 8, 4, W - pile + 8, floor - 4);
    x.fillStyle = '#5a3a1e';
    x.fillRect(0, 6, head + 34, 3);
    x.fillStyle = '#7c5230';
    x.fillRect(0, 6, head + 34, 1);
    for (let i = 12; i < head + 20; i += 30) timber(x, i, 6, floor);
    for (let i = 30; i < head + 20; i += 60) lantern(x, i, 12, t);
    // Sol, rails
    x.fillStyle = '#2a1a0c';
    x.fillRect(0, floor, head + 34, 3);
    rails(x, pile - 8, floor + 1, 0);
    // Plancher coloré : la part de galerie creusée par chaque joueur
    let from = 0;
    const span = head + 24;
    data.players.forEach((p, i) => {
      const w = i === data.players.length - 1 ? span - from : Math.round((span * p.points) / Math.max(1, data.total));
      x.fillStyle = colors[i % colors.length];
      x.fillRect(from, floor + 4, Math.max(0, w), 3);
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(from, floor + 4, Math.max(0, w), 1);
      from += w;
    });
    // Fanions tous les quarts de l'objectif
    [0.25, 0.5, 0.75].forEach((q) => {
      const fx = Math.round(2 + (reach - 2) * q) + 24;
      const on = f >= q;
      x.fillStyle = '#5a3a1e';
      x.fillRect(fx, floor - 14, 1, 14);
      x.fillStyle = on ? '#ffd84a' : '#4a3a20';
      x.fillRect(fx + 1, floor - 14, 5, 3);
      x.fillRect(fx + 1, floor - 11, 3, 1);
    });
    // Foreuse de chantier : carrosserie jaune, cabine vitrée, chenilles, foret qui tourne
    const bob = Math.round(Math.sin(t * 10));
    const dx = head;
    const dy = floor - 20 + bob;
    x.fillStyle = '#16121c';
    x.fillRect(dx, dy + 3, 27, 16);
    x.fillStyle = '#f0a81c';
    x.fillRect(dx + 1, dy + 4, 19, 13);
    x.fillStyle = '#ffd23f';
    x.fillRect(dx + 1, dy + 4, 19, 3);
    x.fillStyle = '#b8700f';
    x.fillRect(dx + 1, dy + 14, 19, 3);
    x.fillStyle = '#16121c';
    x.fillRect(dx + 5, dy, 11, 6);
    x.fillStyle = '#8fe3ff';
    x.fillRect(dx + 6, dy + 1, 9, 4);
    x.fillStyle = '#e8fbff';
    x.fillRect(dx + 6, dy + 1, 3, 2);
    x.fillStyle = '#5f6877';
    x.fillRect(dx - 1, dy + 17, 23, 4);
    for (let i = 0; i < 6; i++) { x.fillStyle = (i + Math.floor(t * 12)) % 2 ? '#3b414d' : '#8f99a8'; x.fillRect(dx + i * 4, dy + 18, 2, 2); }
    const spin = Math.floor(t * 14) % 3;
    x.fillStyle = '#c3cbd6';
    x.fillRect(dx + 21, dy + 6, 6, 9);
    x.fillStyle = '#8f99a8';
    for (let i = 0; i < 3; i++) x.fillRect(dx + 21 + i * 2, dy + 6 + ((i + spin) % 3) * 3, 2, 3);
    if (!data.reached) for (let i = 0; i < 4; i++) {
      x.fillStyle = '#f2c230';
      x.fillRect(dx + 29 + i * 3, dy + 8 + ((i + Math.floor(t * 12)) % 4), 1, 1);
    }
    // Chambre : tas de diamants et reflets
    crystals(x, pile + 14, floor, data.reached ? 1 : 0.55 + 0.45 * f, t);
    crystals(x, pile + 30, floor, data.reached ? 1 : 0.5 + 0.4 * f, t + 2);
    crystals(x, pile + 4, floor, data.reached ? 1 : 0.45 + 0.35 * f, t + 4);
  }

  global.Defis16 = { weekly, collective, SIZE };
})(window);
