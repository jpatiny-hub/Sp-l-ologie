'use strict';

/*
 * Défis en 16 bits (refonte, réservée au responsable) : deux scènes de mine dans le style des grottes du jeu
 * (roche tramée, cristaux lumineux, rayons de lumière, brume, poussières, bords assombris).
 *   Defis16.weekly(canvas, ch, avatar, t)       → « Ton filon » : un puits vertical, une cage d'ascenseur, un palier par étape du défi
 *   Defis16.collective(canvas, data, colors, t) → « Galerie commune » : une seule galerie et une seule foreuse ; le sol est coloré par joueur
 *   Defis16.SIZE                                → taille des canevas [largeur, hauteur]
 * t = temps en secondes (0 = image fixe).
 */
(function (global) {
  const SIZE = { weekly: [160, 200], collective: [160, 150] };
  const hash = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  const cache = {};

  /** Bruit de valeur lissé (une cellule = `cell` pixels). */
  function vnoise(x, y, s, cell) {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const r = (a, b) => hash(a * 127.1 + b * 311.7 + s * 74.7);
    const top = r(x0, y0) + (r(x0 + 1, y0) - r(x0, y0)) * sx;
    const bot = r(x0, y0 + 1) + (r(x0 + 1, y0 + 1) - r(x0, y0 + 1)) * sx;
    return top + (bot - top) * sy;
  }
  const fbm = (x, y, s) => vnoise(x, y, s, 16) * 0.55 + vnoise(x, y, s + 1, 6) * 0.3 + vnoise(x, y, s + 2, 2.5) * 0.15;
  const rgb = (hex, f = 1, a = 1) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${Math.min(255, ((n >> 16) & 255) * f) | 0},${Math.min(255, ((n >> 8) & 255) * f) | 0},${Math.min(255, (n & 255) * f) | 0},${a})`;
  };

  // Deux ambiances : la semaine est ambrée et chaude, le mois violet et bleuté, comme les paliers de grottes du jeu.
  const MOODS = {
    w: { rock: ['#1a1109', '#2a1a0e', '#3c2614', '#523620', '#6e4a2c'], dark: '#0b0705', air: '#e8a040', ore: ['#ffc24a', '#d9822b', '#5ee0ff'] },
    c: { rock: ['#15112a', '#221a3c', '#2f2550', '#403368', '#56467f'], dark: '#08060f', air: '#8a6cff', ore: ['#c79bff', '#5ee0ff', '#ffc24a'] },
  };

  /** Roche tramée : plusieurs tons mêlés par un bruit lissé, avec filons de minerai et deux fossiles (peinte une fois). */
  function rock(key, W, H, mood) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const m = MOODS[mood];
    const seed = mood === 'w' ? 3 : 8;
    for (let y = 0; y < H; y++) {
      for (let i = 0; i < W; i++) {
        const strata = Math.sin((y + vnoise(i, y, seed + 5, 22) * 14) / 7) * 0.12;
        const v = Math.max(0, Math.min(1, fbm(i, y, seed) * 0.85 + strata + 0.05));
        const lv = Math.max(0, Math.min(4, Math.floor(v * 4 + bay(i, y))));
        x.fillStyle = m.rock[lv];
        x.fillRect(i, y, 1, 1);
      }
    }
    // Filons de minerai
    for (let k = 0; k < 18; k++) {
      const vx = Math.floor(hash(k * 7.3 + seed) * (W - 6));
      const vy = Math.floor(hash(k * 3.9 + seed) * (H - 4));
      x.fillStyle = m.ore[k % 3];
      x.fillRect(vx, vy, 2, 1);
      x.fillRect(vx + 1, vy + 1, 2, 1);
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.fillRect(vx, vy, 1, 1);
    }
    // Fossile en spirale et arête de poisson
    const fx = Math.floor(W * 0.62);
    const fy = Math.floor(H * 0.2);
    x.fillStyle = '#b9a98a';
    [[1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 2], [0, 1], [1, 1], [2, 2]].forEach(([dx, dy]) => x.fillRect(fx + dx, fy + dy, 1, 1));
    const bx = Math.floor(W * 0.12);
    const by = Math.floor(H * 0.86);
    x.fillStyle = '#c8bda0';
    x.fillRect(bx, by, 9, 1);
    for (let i = 1; i < 8; i += 2) { x.fillRect(bx + i, by - 2, 1, 2); x.fillRect(bx + i, by + 1, 1, 2); }
    cache[key] = c;
    return c;
  }

  /** Étai de bois : montant, avec lumière à gauche et ombre à droite. */
  function timber(x, px, top, bottom) {
    x.fillStyle = '#7c5230';
    x.fillRect(px, top, 3, bottom - top);
    x.fillStyle = '#a07040';
    x.fillRect(px, top, 1, bottom - top);
    x.fillStyle = '#432812';
    x.fillRect(px + 2, top, 1, bottom - top);
  }

  /** Lueur douce (additive) : lumière qui se mêle à la roche. */
  function glow(x, px, py, r, color, a) {
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, rgb(color, 1.4, a));
    g.addColorStop(1, rgb(color, 1.4, 0));
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }

  /** Stalactites en silhouette au plafond. */
  function stalactites(x, W, y0, mood, seed) {
    x.fillStyle = MOODS[mood].dark;
    for (let i = 0; i < W; i += 3) {
      const len = 3 + Math.floor(hash(i * 1.7 + seed) * 9) * (hash(i + seed) > 0.45 ? 1 : 0.4);
      x.fillRect(i, y0, 3, len);
      x.fillRect(i + 1, y0 + len, 1, 2);
    }
  }

  /** Lanterne suspendue, flamme qui vacille. */
  function lantern(x, lx, ly, t, mood) {
    const flick = 0.85 + 0.15 * Math.sin(t * 8 + lx);
    x.fillStyle = '#3a2c22';
    x.fillRect(lx, ly - 7, 1, 7);
    x.fillStyle = '#16121c';
    x.fillRect(lx - 3, ly, 7, 1);
    x.fillRect(lx - 3, ly + 7, 7, 1);
    x.fillStyle = '#ffd84a';
    x.fillRect(lx - 2, ly + 1, 5, 6);
    x.fillStyle = '#fff2a8';
    x.fillRect(lx - 1, ly + 2, 3, 3);
    x.globalCompositeOperation = 'lighter';
    glow(x, lx, ly + 4, 30, '#ffb030', 0.32 * flick);
    x.globalCompositeOperation = 'source-over';
  }

  /** Amas de cristaux dans la roche : (px, py) = pied de l'amas, lit entre 0 et 1. */
  function crystals(x, px, py, lit, t, hue) {
    const pal = hue === 'v' ? ['#4a2a8c', '#b48cff', '#ece0ff'] : ['#1e86b0', '#5ee0ff', '#e6ffff'];
    const a = (Math.sin(t * 3 + px) + 1) / 2;
    x.globalAlpha = 0.35 + 0.65 * lit;
    [[0, 0, 5, 12], [-6, 2, 4, 8], [6, 2, 4, 9], [-11, 4, 3, 5], [11, 4, 3, 6]].forEach(([dx, dy, w, h]) => {
      const left = px + dx - Math.floor(w / 2);
      x.fillStyle = pal[0];
      x.fillRect(left, py + dy - h, w, h);
      x.fillStyle = pal[1];
      x.fillRect(left, py + dy - h, Math.max(1, w - 2), h - 1);
      x.fillStyle = pal[2];
      x.fillRect(left, py + dy - h, 1, Math.max(1, h - 4));
    });
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'lighter';
    glow(x, px, py - 6, 34, pal[1], (0.18 + 0.2 * a) * lit);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = `rgba(255,255,255,${lit * a})`;
    x.fillRect(px - 1, py - 18, 1, 5);
    x.fillRect(px - 3, py - 16, 5, 1);
  }

  /** Rayons de lumière obliques, brume qui dérive, poussières brillantes et bords assombris, comme dans les grottes. */
  function atmosphere(x, W, H, t, mood, rays) {
    const air = MOODS[mood].air;
    x.globalCompositeOperation = 'lighter';
    rays.forEach((rx, k) => {
      const sway = Math.sin(t * 0.3 + k * 2) * 4;
      x.fillStyle = rgb(air, 1.6, 0.06 + 0.025 * Math.sin(t * 0.8 + k));
      x.beginPath();
      x.moveTo(rx + sway, 0);
      x.lineTo(rx + sway + 9, 0);
      x.lineTo(rx + sway + 38, H);
      x.lineTo(rx + sway + 14, H);
      x.closePath();
      x.fill();
    });
    for (let k = 0; k < 3; k++) {
      const mx = ((hash(k + 1) * W + t * (2 + k)) % (W + 80)) - 40;
      const my = H * (0.3 + 0.25 * k) + Math.sin(t * 0.4 + k) * 4;
      glow(x, mx, my, 46, air, 0.1 + 0.03 * Math.sin(t * 0.4 + k * 2));
    }
    for (let i = 0; i < 18; i++) {
      const sp = 0.4 + hash(i + 40) * 0.8;
      const px = (((hash(i + 80) * W + t * sp * 3 + Math.sin(t * 0.5 + i) * 4) % W) + W) % W;
      const py = (((hash(i + 120) * H - t * sp * 4) % H) + H) % H;
      x.fillStyle = rgb(air, 3, (0.2 + hash(i + 7) * 0.3) * (0.7 + 0.3 * Math.sin(t * (1 + hash(i) * 2) + i)));
      x.fillRect(Math.floor(px), Math.floor(py), 1 + (i % 3 === 0 ? 1 : 0), 1 + (i % 3 === 0 ? 1 : 0));
    }
    x.globalCompositeOperation = 'source-over';
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = vg;
    x.fillRect(0, 0, W, H);
  }

  function setup(canvas, size) {
    const [W, H] = size;
    if (canvas.width !== W) { canvas.width = W; canvas.height = H; }
    const x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;
    return x;
  }

  /** Défi de la semaine : un puits, une cage d'ascenseur qui descend d'un palier à chaque étape, une poche de diamants au fond. */
  function weekly(canvas, ch, avatar, t) {
    const [W, H] = SIZE.weekly;
    const x = setup(canvas, SIZE.weekly);
    const goal = Math.max(1, ch.goal);
    const done = !!ch.done;
    x.drawImage(rock('w', W, H, 'w'), 0, 0);
    // Puits
    const sx = 56;
    const sw = 48;
    x.fillStyle = MOODS.w.dark;
    x.fillRect(sx, 0, sw, H);
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.fillRect(sx, 0, 6, H);
    for (let y = 6; y < H; y += 24) { timber(x, sx - 2, y, y + 24); timber(x, sx + sw - 1, y, y + 24); x.fillStyle = '#5a3a1e'; x.fillRect(sx, y + 12, sw, 2); }
    // Paliers : une galerie latérale par étape, alternativement à gauche et à droite
    const top = 40;
    const gap = (H - 48 - top) / goal;
    const levelY = (k) => Math.round(top + gap * k - gap / 2 + 12);
    for (let k = 1; k <= goal; k++) {
      const y = levelY(k);
      const left = k % 2 === 1;
      const gx = left ? 4 : sx + sw;
      const gw = left ? sx - 4 : W - sx - sw - 4;
      const lit = ch.progress >= k;
      x.fillStyle = MOODS.w.dark;
      x.fillRect(gx, y - 14, gw, 26);
      x.fillStyle = '#5a3a1e';
      x.fillRect(gx, y - 14, gw, 2);
      x.fillStyle = '#2a1a0c';
      x.fillRect(gx, y + 12, gw, 3);
      const lampX = left ? gx + 12 : gx + gw - 12;
      x.fillStyle = '#16121c';
      x.fillRect(lampX - 2, y - 12, 5, 6);
      x.fillStyle = lit ? '#ffd84a' : '#4a3a20';
      x.fillRect(lampX - 1, y - 11, 3, 4);
      if (lit) {
        x.globalCompositeOperation = 'lighter';
        glow(x, lampX, y - 8, 34, '#ffb030', 0.3 + 0.06 * Math.sin(t * 8 + k));
        x.globalCompositeOperation = 'source-over';
      }
      // Wagonnet de minerai sur le palier
      const wx = left ? gx + 22 : gx + 6;
      x.fillStyle = '#16121c';
      x.fillRect(wx, y + 1, 20, 11);
      x.fillStyle = lit ? '#8f99a8' : '#4b525e';
      x.fillRect(wx + 1, y + 2, 18, 8);
      if (lit) [[3, '#ffc24a'], [8, '#d9822b'], [13, '#5ee0ff']].forEach(([dx, c]) => { x.fillStyle = c; x.fillRect(wx + dx, y - 2, 4, 3); });
      x.fillStyle = '#8f99a8';
      x.fillRect(gx, y + 12, gw, 1);
    }
    // Poche de diamants au fond du puits
    const bottom = H - 22;
    x.fillStyle = MOODS.w.dark;
    x.fillRect(sx - 14, bottom - 18, sw + 28, 22);
    crystals(x, sx + sw / 2 - 12, bottom + 2, done ? 1 : 0.35, t, 'c');
    crystals(x, sx + sw / 2 + 10, bottom + 2, done ? 1 : 0.35, t + 2, 'c');
    // Cage d'ascenseur : au palier atteint, avec un léger balancement
    const level = Math.min(goal, Math.max(0, ch.progress));
    const cageY = done ? bottom - 36 : level === 0 ? 8 : levelY(level) - 18;
    const cy = cageY + Math.round(Math.sin(t * 2) * 1.2);
    x.fillStyle = '#8f99a8';
    x.fillRect(sx + sw / 2 - 1, 0, 2, cy);
    x.fillStyle = '#16121c';
    x.fillRect(sx + 7, cy, 34, 34);
    x.fillStyle = '#3b414d';
    x.fillRect(sx + 9, cy + 2, 30, 30);
    x.fillStyle = '#0b0705';
    x.fillRect(sx + 11, cy + 4, 26, 26);
    x.fillStyle = 'rgba(255,200,90,0.25)';
    x.fillRect(sx + 11, cy + 4, 26, 4);
    const who = global.Avatar ? global.Avatar.sprite({ ...(avatar || {}), objet: 'aucun' }) : null;
    if (who) x.drawImage(who, sx + 24 - Math.floor(who.width / 2), cy + 32 - who.height);
    if (done) {
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        x.fillStyle = ['#ffd84a', '#5ee0ff', '#ffffff'][i % 3];
        x.fillRect(sx + Math.floor(hash(i + 1) * sw), Math.floor(bottom - 20 - ((hash(i + 9) * 40 + t * 14) % 40)), 1, 2);
      }
      x.globalCompositeOperation = 'source-over';
    }
    stalactites(x, W, 0, 'w', 1);
    lantern(x, sx - 12, 8, t, 'w');
    lantern(x, sx + sw + 13, 8, t, 'w');
    atmosphere(x, W, H, t, 'w', [sx - 6, sx + 22]);
  }

  /** Défi du mois : une seule galerie, une seule foreuse ; chaque joueur a sa couleur de sol, la chambre de diamants brille de plus en plus. */
  function collective(canvas, data, colors, t) {
    const [W, H] = SIZE.collective;
    const x = setup(canvas, SIZE.collective);
    const floor = 104;
    const f = Math.min(1, data.total / Math.max(1, data.goal));
    const head = Math.round(8 + 92 * f);
    const span = head + 8;
    x.drawImage(rock('c', W, H, 'c'), 0, 0);
    // Galerie commune : voûte étayée, rails
    const end = Math.min(W, head + 34);
    x.fillStyle = MOODS.c.dark;
    x.fillRect(0, 34, end, floor - 34);
    x.fillStyle = '#4a3320';
    x.fillRect(0, 31, end, 4);
    x.fillStyle = '#6e4a2c';
    x.fillRect(0, 31, end, 1);
    for (let k = 10; k < end - 6; k += 28) timber(x, k, 34, floor);
    x.fillStyle = '#2a1a0c';
    x.fillRect(0, floor, end, 3);
    x.fillStyle = '#8f99a8';
    x.fillRect(0, floor - 1, head + 8, 1);
    // Chambre des diamants : s'éclaire avec l'avancée
    x.fillStyle = MOODS.c.dark;
    x.fillRect(128, 28, 32, floor - 28 + 3);
    const lit = data.reached ? 1 : 0.3 + 0.7 * f;
    crystals(x, 138, floor, lit, t, 'c');
    crystals(x, 150, floor, lit, t + 1.5, 'v');
    crystals(x, 144, floor - 26, lit * 0.8, t + 3, 'c');
    // Plancher : une bande par joueur ; petit mineur dessus
    let from = 0;
    data.players.forEach((p, i) => {
      const w = i === data.players.length - 1 ? span - from : Math.round((span * p.points) / Math.max(1, data.total));
      x.fillStyle = colors[i % colors.length];
      x.fillRect(from, floor + 4, Math.max(0, w), 5);
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(from, floor + 4, Math.max(0, w), 1);
      if (w >= 12 && i < 6) {
        const mx = from + Math.round(w / 2) - 5;
        const bob = p.me ? Math.round(Math.sin(t * 6)) : 0;
        x.fillStyle = '#16121c';
        x.fillRect(mx, floor - 18 + bob, 10, 18);
        x.fillStyle = colors[i % colors.length];
        x.fillRect(mx + 1, floor - 10 + bob, 8, 9);
        x.fillStyle = '#f0c090';
        x.fillRect(mx + 2, floor - 15 + bob, 6, 5);
        x.fillStyle = '#ffc24a';
        x.fillRect(mx + 1, floor - 18 + bob, 8, 4);
        if (p.me) { x.fillStyle = '#ffffff'; x.fillRect(mx + 4, floor - 22 + bob, 2, 2); }
      }
      from += w;
    });
    // Fanions à 25, 50 et 75 %
    [0.25, 0.5, 0.75].forEach((q) => {
      const fx = Math.round(8 + 92 * q) + 30;
      x.fillStyle = '#5a3a1e';
      x.fillRect(fx, 16, 1, 15);
      x.fillStyle = f >= q ? '#ffd84a' : '#4a3a20';
      x.fillRect(fx + 1, 16, 7, 4);
      x.fillRect(fx + 1, 20, 4, 1);
    });
    // Foreuse unique
    const bob = Math.round(Math.sin(t * 10));
    const dx = head;
    const dy = floor - 30 + bob;
    x.fillStyle = '#16121c';
    x.fillRect(dx, dy + 4, 34, 26);
    x.fillStyle = '#f0a81c';
    x.fillRect(dx + 1, dy + 5, 24, 20);
    x.fillStyle = '#ffd23f';
    x.fillRect(dx + 1, dy + 5, 24, 4);
    x.fillStyle = '#b8700f';
    x.fillRect(dx + 1, dy + 21, 24, 4);
    x.fillStyle = '#16121c';
    x.fillRect(dx + 6, dy, 14, 8);
    x.fillStyle = '#8fe3ff';
    x.fillRect(dx + 7, dy + 1, 12, 6);
    x.fillStyle = '#e8fbff';
    x.fillRect(dx + 7, dy + 1, 4, 2);
    x.fillStyle = '#c3cbd6';
    x.fillRect(dx + 26, dy + 10, 8, 14);
    x.fillStyle = '#8f99a8';
    for (let i = 0; i < 3; i++) x.fillRect(dx + 26 + i * 3, dy + 10 + ((i + Math.floor(t * 14)) % 3) * 4, 3, 4);
    x.globalCompositeOperation = 'lighter';
    glow(x, dx + 12, dy + 6, 26, '#ffd070', 0.22);
    if (!data.reached) {
      for (let i = 0; i < 5; i++) { x.fillStyle = '#ffd070'; x.fillRect(dx + 35 + i * 2, dy + 12 + ((i + Math.floor(t * 12)) % 5), 1, 1); }
    }
    x.globalCompositeOperation = 'source-over';
    stalactites(x, W, 0, 'c', 2);
    for (let k = 26; k < end - 10; k += 56) lantern(x, k, 36, t, 'c');
    atmosphere(x, W, H, t, 'c', [14, 70, 118]);
  }

  global.Defis16 = { weekly, collective, SIZE };
})(window);
