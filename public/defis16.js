'use strict';

/*
 * Défis en 16 bits (refonte, réservée au responsable) : deux scènes de mine dans le style des grottes du jeu
 * (roche tramée, cristaux lumineux, rayons de lumière, brume, poussières, bords assombris).
 *   Defis16.weekly(canvas, ch, avatar, t)       → « Ton filon » : une cathédrale de cristal, une passerelle par étape du défi qui monte vers les diamants
 *   Defis16.collective(canvas, data, colors, t) → « Galerie commune » : une seule foreuse sur un pont au-dessus du lac, un seul sol doré qui avance avec les points
 *   Defis16.SIZE                                → taille des canevas [largeur, hauteur]
 * t = temps en secondes (0 = image fixe).
 */
(function (global) {
  const SIZE = { weekly: [160, 200], collective: [160, 200] };
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

  // Ambiances : la semaine est violette, le mois turquoise.
  MOODS.w = { rock: ['#15112a', '#221a3c', '#2f2550', '#403368', '#56467f'], dark: '#08060f', air: '#8a6cff', ore: ['#c79bff', '#5ee0ff', '#ffc24a'] };
  MOODS.c = { rock: ['#0b1a1c', '#112a2e', '#183b40', '#245259', '#34707a'], dark: '#050e10', air: '#40e0d0', ore: ['#6bf0b0', '#5ee0ff', '#ffc24a'] };
  const VIOLET = ['#4a2a8c', '#b48cff', '#ece0ff'];

  /** Cascade : filets d'eau qui tombent du plafond jusqu'au lac, éclaboussures et brume. */
  function waterfall(x, wx, top, bottom, t) {
    for (let i = 0; i < 6; i++) {
      const col = wx + i;
      x.fillStyle = i % 2 ? 'rgba(150,210,255,0.55)' : 'rgba(210,240,255,0.7)';
      x.fillRect(col, top, 1, bottom - top);
      for (let k = 0; k < 5; k++) {
        const y = top + (((hash(k * 3 + i) * (bottom - top) + t * (30 + i * 4)) % (bottom - top)) + (bottom - top)) % (bottom - top);
        x.fillStyle = 'rgba(255,255,255,0.9)';
        x.fillRect(col, Math.floor(y), 1, 3);
      }
    }
    x.globalCompositeOperation = 'lighter';
    glow(x, wx + 3, bottom - 2, 20, '#9fe0ff', 0.25 + 0.05 * Math.sin(t * 3));
    for (let k = 0; k < 6; k++) {
      x.fillStyle = 'rgba(220,245,255,0.6)';
      x.fillRect(wx + 3 + Math.round(Math.sin(t * 5 + k * 2) * (3 + k)), bottom - 2 - ((Math.floor(t * 8) + k * 3) % 7), 1, 1);
    }
    x.globalCompositeOperation = 'source-over';
  }

  /** Touffe de champignons luminescents. */
  function mushrooms(x, mx, my, s, t, color) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 2 + mx);
    [[0, 0, 4], [6, 1, 3], [-5, 2, 3]].forEach(([dx, dy, w], i) => {
      const cx = mx + dx * s;
      const h = (w + 1) * s;
      x.fillStyle = '#d8d0c0';
      x.fillRect(cx, my + dy - h + 2, 1, h - 1);
      x.fillStyle = color[0];
      x.fillRect(cx - w + 1, my + dy - h, w * 2 - 1, 2);
      x.fillStyle = color[1];
      x.fillRect(cx - w + 2, my + dy - h, w * 2 - 3, 1);
      x.fillStyle = '#ffffff';
      x.fillRect(cx - 1 + (i % 2), my + dy - h, 1, 1);
    });
    glow(x, mx, my - 4 * s, 22 * s, color[1], 0.22 * pulse);
  }

  /** Wagon de minerai au loin, sur un rail du fond : il traverse lentement la caverne. */
  function farCart(x, W, y, t, period) {
    x.fillStyle = 'rgba(143,153,168,0.35)';
    x.fillRect(0, y + 8, W, 1);
    for (let i = 0; i < W; i += 9) { x.fillStyle = 'rgba(90,60,30,0.5)'; x.fillRect(i, y + 9, 3, 1); }
    const cx = ((t / period) % 1) * (W + 40) - 20;
    x.fillStyle = 'rgba(22,18,28,0.85)';
    x.fillRect(cx, y, 14, 8);
    x.fillStyle = 'rgba(95,104,119,0.9)';
    x.fillRect(cx + 1, y + 1, 12, 5);
    [['#ffc24a', 2], ['#5ee0ff', 6], ['#c79bff', 9]].forEach(([c, dx]) => { x.fillStyle = c; x.fillRect(cx + dx, y - 2, 3, 3); });
    x.fillStyle = 'rgba(22,18,28,0.9)';
    x.fillRect(cx + 2, y + 7, 3, 2);
    x.fillRect(cx + 9, y + 7, 3, 2);
    glow(x, cx + 7, y - 2, 12, '#ffd070', 0.12);
  }

  /** Chauves-souris qui passent au loin. */
  function bats(x, W, t) {
    x.fillStyle = 'rgba(8,6,15,0.9)';
    for (let k = 0; k < 3; k++) {
      const bx = ((t * (9 + k * 3) + k * 57) % (W + 30)) - 15;
      const by = 34 + k * 14 + Math.sin(t * 2 + k) * 6;
      const flap = Math.floor(t * 8 + k) % 2;
      x.fillRect(bx, by, 3, 2);
      x.fillRect(bx - 2, by - (flap ? 2 : 0), 2, 1);
      x.fillRect(bx + 3, by - (flap ? 2 : 0), 2, 1);
    }
  }

  /**
   * Foreuse de chantier à chenilles, dessinée d'un seul tenant : chenilles intégrées au châssis, cabine vitrée avec gyrophare,
   * échappement qui fume, bras hydraulique et foret conique qui tourne. Pointe du foret en (tipX, baseY - 21), chenilles posées sur baseY.
   */
  function tunnelDrill(x, tipX, baseY, t, moving) {
    const ox = tipX - 72;
    const INK = '#16121c';
    const Y = ['#fff3a0', '#ffd23f', '#f0a81c', '#b8700f', '#7a430a'];
    const S = ['#f2f6fa', '#c3cbd6', '#8f99a8', '#5f6877', '#3b414d'];
    const r = (px, py, w, h, c) => { x.fillStyle = c; x.fillRect(ox + px, baseY + py, w, h); };
    const sh = moving ? Math.round(Math.sin(t * 10)) : 0;
    // Chenilles (py : -15 à 0) : carter arrondi, patins sur le dessus et le dessous, galets et barbotins qui tournent
    r(3, -15, 52, 15, INK);
    r(1, -13, 56, 11, INK);
    r(4, -14, 50, 13, S[4]);
    r(3, -12, 52, 9, S[4]);
    const off = moving ? Math.floor(t * 14) % 4 : 0;
    for (let i = -1; i < 14; i++) {
      const px = 3 + i * 4 + off;
      if (px < 3 || px > 50) continue;
      r(px, -15, 3, 2, S[2]);
      r(px, -2, 3, 2, S[2]);
      r(px, -15, 3, 1, S[1]);
    }
    r(6, -11, 46, 7, S[3]);
    [8, 20, 32, 44].forEach((wx, i) => {
      r(wx, -11, 7, 7, INK);
      r(wx + 1, -10, 5, 5, S[1]);
      r(wx + 1, -10, 5, 1, S[0]);
      r(wx + 2, -9, 3, 3, S[3]);
      const spin = moving ? Math.floor(t * 12 + i) % 2 : 0;
      r(wx + 3, -9 + spin, 1, 3 - spin, S[0]);
    });
    r(0, -9, 3, 5, INK);
    r(53, -9, 3, 5, INK);
    // Châssis (py : -31 à -14) : posé dans le cadre des chenilles, jaune de chantier
    r(2, -31 + sh, 50, 18, INK);
    r(3, -30 + sh, 48, 16, Y[2]);
    r(3, -30 + sh, 48, 3, Y[0]);
    r(3, -27 + sh, 48, 2, Y[1]);
    r(3, -17 + sh, 48, 3, Y[3]);
    // bandes de sécurité à l'avant du châssis
    for (let i = 0; i < 6; i++) r(38 + i * 2, -16 + sh, 1, 2, INK);
    // rivets et grille d'aération
    [6, 18, 30, 46].forEach((bx) => r(bx, -29 + sh, 1, 1, Y[0]));
    r(8, -24 + sh, 14, 6, Y[4]);
    for (let i = 0; i < 6; i++) r(9 + i * 2, -23 + sh, 1, 4, INK);
    // Cabine vitrée avec toit et gyrophare
    r(26, -42 + sh, 22, 12, INK);
    r(27, -41 + sh, 20, 10, Y[2]);
    r(29, -40 + sh, 16, 8, '#0e3a5e');
    r(30, -39 + sh, 14, 6, '#8fe3ff');
    r(30, -39 + sh, 5, 2, '#e8fbff');
    r(37, -38 + sh, 6, 1, '#3fb3e8');
    r(25, -43 + sh, 24, 2, S[3]);
    r(25, -43 + sh, 24, 1, S[1]);
    const beacon = Math.floor(t * 5) % 2 === 0;
    r(35, -47 + sh, 5, 4, INK);
    r(36, -46 + sh, 3, 2, beacon ? '#ff9a30' : '#7a3a10');
    // Échappement qui fume
    r(6, -40 + sh, 3, 10, S[4]);
    r(5, -41 + sh, 5, 2, S[3]);
    for (let i = 0; i < 4; i++) {
      const sy = -44 - ((Math.floor(t * 6) + i * 4) % 14);
      x.fillStyle = `rgba(200,200,210,${0.5 - ((Math.floor(t * 6) + i * 4) % 14) / 36})`;
      x.fillRect(ox + 5 + Math.round(Math.sin(t * 2 + i) * 2) + i, baseY + sy + sh, 3, 3);
    }
    // Bras hydraulique : vérin du châssis jusqu'à la tête du foret
    r(52, -27 + sh, 8, 8, INK);
    r(52, -26 + sh, 8, 6, S[2]);
    r(52, -26 + sh, 8, 1, S[0]);
    r(54, -29 + sh, 6, 2, S[1]);
    r(54, -29 + sh, 2, 12, S[3]);
    // Foret conique : stries en spirale qui défilent
    const spin = Math.floor(t * 16) % 4;
    for (let c = 0; c < 20; c++) {
      const half = Math.max(1, Math.round(10 - c * 0.5));
      const cx = 60 + c;
      for (let yy = -half; yy <= half; yy++) {
        const band = (c + yy + spin * 2) % 8 < 4;
        const edge = yy === -half || yy === half;
        x.fillStyle = edge ? S[4] : band ? S[1] : S[2];
        x.fillRect(ox + cx, baseY - 21 + sh + yy, 1, 1);
      }
      x.fillStyle = S[0];
      x.fillRect(ox + cx, baseY - 21 + sh - half + 2, 1, 1);
    }
    // Feux avant, étincelles à la pointe, lueur
    r(51, -31 + sh, 3, 2, '#fff2a8');
    x.globalCompositeOperation = 'lighter';
    glow(x, ox + 53, baseY - 30 + sh, 22, '#ffd070', 0.3);
    glow(x, ox + 36, baseY - 44 + sh, 18, '#ff9a30', beacon ? 0.28 : 0.05);
    x.globalCompositeOperation = 'source-over';
    if (moving) {
      for (let i = 0; i < 6; i++) {
        x.fillStyle = ['#ffd070', '#fff', '#ff9a30'][i % 3];
        x.fillRect(ox + 81 + (i % 3) * 2, baseY - 24 + sh + ((i + Math.floor(t * 12)) % 7), 1, 1);
      }
    }
  }

  /** Cathédrale commune aux deux scènes : voûte, stalactites, piliers de cristal au fond, lac et reflets. */
  function cathedral(x, W, H, key, mood, t, o) {
    x.drawImage(rock(key, W, H, mood), 0, 0);
    const m = MOODS[mood];
    x.fillStyle = m.dark;
    x.fillRect(0, 20, W, H - 20);
    for (let i = 0; i < W; i += 2) { x.fillStyle = m.rock[0]; x.fillRect(i, 18, 2, Math.floor(hash(i * 3.1 + o.seed) * 20)); }
    o.pillars.forEach(([px, py, s, v], i) => crystals2(x, px, py, s, 0.5 + 0.2 * Math.sin(t + i), t + i, v ? VIOLET : null));
    const ly = o.lake;
    const g = x.createLinearGradient(0, ly, 0, H);
    g.addColorStop(0, o.water[0]);
    g.addColorStop(1, o.water[1]);
    x.fillStyle = g;
    x.fillRect(0, ly, W, H - ly);
    for (let k = 0; k < 14; k++) {
      x.fillStyle = `rgba(150,220,255,${0.1 + 0.1 * Math.sin(t * 2 + k)})`;
      x.fillRect(((hash(k + o.seed) * W + Math.sin(t + k) * 5) % W) | 0, (ly + 4 + k * 3.4) | 0, 16 + hash(k + 3) * 24, 1);
    }
  }
  const crystals2 = (x, px, py, s, lit, t, pal) => crystalsScaled(x, px, py, s, lit, t, pal);
  /** Amas de cristaux à l'échelle s. */
  function crystalsScaled(x, px, py, s, lit, t, pal) {
    pal = pal || ['#1e86b0', '#5ee0ff', '#e6ffff'];
    const a = (Math.sin(t * 3 + px) + 1) / 2;
    x.globalAlpha = 0.4 + 0.6 * lit;
    [[0, 0, 5, 12], [-6, 2, 4, 8], [6, 2, 4, 9], [-11, 4, 3, 5], [11, 4, 3, 6]].forEach(([dx, dy, w, h]) => {
      const ww = Math.round(w * s);
      const hh2 = Math.round(h * s);
      const left = px + Math.round(dx * s) - (ww >> 1);
      x.fillStyle = pal[0];
      x.fillRect(left, py + dy - hh2, ww, hh2);
      x.fillStyle = pal[1];
      x.fillRect(left, py + dy - hh2, Math.max(1, ww - 2), hh2 - 1);
      x.fillStyle = pal[2];
      x.fillRect(left, py + dy - hh2, 1, Math.max(1, hh2 - 4));
    });
    x.globalAlpha = 1;
    glow(x, px, py - 6 * s, 34 * s, pal[1], (0.18 + 0.2 * a) * lit);
    x.fillStyle = `rgba(255,255,255,${lit * a})`;
    x.fillRect(px - 1, py - Math.round(18 * s), 1, 5);
    x.fillRect(px - 3, py - Math.round(16 * s), 5, 1);
  }

  /** Défi de la semaine : passerelles qui montent vers les diamants, une lanterne par étape, ton mineur sur la dernière franchie. */
  function weekly(canvas, ch, avatar, t) {
    const [W, H] = SIZE.weekly;
    const x = setup(canvas, SIZE.weekly);
    const goal = Math.max(1, ch.goal);
    const done = !!ch.done;
    const ly = 150;
    cathedral(x, W, H, 'wcat', 'w', t, { seed: 9, lake: ly, water: ['#16224a', '#080c20'], pillars: [[18, 150, 2.2, false], [140, 130, 2.6, true], [96, 110, 1.6, false]] });
    farCart(x, W, 44, t, 40);
    waterfall(x, 68, 22, ly, t);
    mushrooms(x, 22, 118, 1, t, ['#c0509a', '#ff8ad0']);
    mushrooms(x, 150, 160, 1, t, ['#2aa0c0', '#7ae8ff']);
    bats(x, W, t);
    // Passerelles : de la rive gauche vers le sommet, une par étape
    const pos = (k) => { const f = goal === 1 ? 0 : (k - 1) / (goal - 1); return [Math.round(8 + f * 100), Math.round(142 - f * 66)]; };
    for (let k = 1; k <= goal; k++) {
      const [px, py] = pos(k);
      const lit = ch.progress >= k;
      x.fillStyle = '#16121c';
      x.fillRect(px, py, 30, 4);
      x.fillStyle = lit ? '#9a6a3a' : '#4a3a2a';
      x.fillRect(px, py, 30, 2);
      for (let q = 0; q < 30; q += 6) { x.fillStyle = '#3a2410'; x.fillRect(px + q, py + 2, 1, 2); }
      timber(x, px + 4, py + 4, py + 30);
      timber(x, px + 24, py + 4, py + 30);
      x.fillStyle = '#16121c';
      x.fillRect(px + 12, py - 9, 5, 7);
      x.fillStyle = lit ? '#ffd84a' : '#4a3a20';
      x.fillRect(px + 13, py - 8, 3, 5);
      if (lit) glow(x, px + 14, py - 6, 26, '#ffb030', 0.3 + 0.05 * Math.sin(t * 8 + k));
    }
    // Reflets des passerelles allumées dans l'eau
    x.globalAlpha = 0.25;
    for (let k = 1; k <= Math.min(goal, ch.progress); k++) { const [px, py] = pos(k); x.fillStyle = '#ffd84a'; x.fillRect(px + 10, ly + Math.round((ly - py) * 0.15) + 4, 10, 1); }
    x.globalAlpha = 1;
    // Diamants au sommet
    crystalsScaled(x, 142, 74, 1.4, done ? 1 : 0.4, t);
    crystalsScaled(x, 150, 92, 1.1, done ? 1 : 0.4, t + 2);
    // Ton mineur, sur la dernière passerelle franchie
    const who = global.Avatar ? global.Avatar.sprite({ ...(avatar || {}), objet: 'aucun' }) : null;
    if (who) {
      const [px, py] = pos(Math.max(1, Math.min(goal, ch.progress || 1)));
      x.drawImage(who, px + 10, py - who.height + Math.round(Math.sin(t * 2) * (ch.progress ? 0 : 0)));
      glow(x, px + 16, py - 14, 22, '#ffd070', 0.16);
    }
    if (done) {
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        x.fillStyle = ['#ffd84a', '#5ee0ff', '#ffffff'][i % 3];
        x.fillRect(100 + Math.floor(hash(i + 1) * 56), Math.floor(100 - ((hash(i + 9) * 80 + t * 14) % 80)), 1, 2);
      }
      x.globalCompositeOperation = 'source-over';
    }
    stalactites(x, W, 0, 'w', 2);
    atmosphere(x, W, H, t, 'w', [14, 70, 118]);
  }

  /** Défi du mois : une seule foreuse du jeu sur un pont au-dessus du lac, un seul sol doré qui avance avec les points. */
  function collective(canvas, data, colors, t) {
    const [W, H] = SIZE.collective;
    const x = setup(canvas, SIZE.collective);
    const f = Math.min(1, data.total / Math.max(1, data.goal));
    const ly = 140;
    const by = 112;
    const tip = Math.round(72 + 46 * f);
    cathedral(x, W, H, 'ccat', 'c', t, { seed: 4, lake: ly, water: ['#0e3a44', '#04141a'], pillars: [[20, 120, 2.4, false], [54, 86, 1.4, false], [128, 110, 2.8, false]] });
    farCart(x, W, 50, t + 12, 46);
    waterfall(x, 36, 22, ly, t);
    mushrooms(x, 100, 70, 1, t, ['#2aa0c0', '#7ae8ff']);
    mushrooms(x, 8, 134, 1, t, ['#c0509a', '#ff8ad0']);
    bats(x, W, t);
    // Pont : poteaux, planches ; la part creusée est soulignée d'un seul liseré doré
    x.fillStyle = '#16121c';
    x.fillRect(0, by, tip + 6, 5);
    for (let k = 0; k < tip + 6; k += 8) timber(x, k + 2, by + 5, by + 28);
    x.fillStyle = '#9a6a3a';
    x.fillRect(0, by, tip + 6, 2);
    x.fillStyle = '#ffd070';
    x.fillRect(0, by + 2, tip + 6, 1);
    x.globalAlpha = 0.3;
    x.fillRect(0, ly + Math.round((ly - by) * 0.12) + 2, tip + 6, 2);
    x.globalAlpha = 1;
    // Fanions à 25, 50 et 75 %
    [0.25, 0.5, 0.75].forEach((q) => {
      const fx = Math.round(72 + 46 * q);
      x.fillStyle = '#5a3a1e';
      x.fillRect(fx, by - 18, 1, 15);
      x.fillStyle = f >= q ? '#ffd84a' : '#4a3a20';
      x.fillRect(fx + 1, by - 18, 7, 4);
      x.fillRect(fx + 1, by - 14, 4, 1);
    });
    // Foreuse de chantier à chenilles, d'un seul tenant, posée sur le pont
    tunnelDrill(x, tip, by, t, !data.reached);
    // Chambre de diamants
    const lit = data.reached ? 1 : 0.3 + 0.7 * f;
    crystalsScaled(x, 142, by, 1.5, lit, t + 1);
    crystalsScaled(x, 126, by + 2, 1, lit, t, VIOLET);
    lanternsAlong(x, tip, t);
    stalactites(x, W, 0, 'c', 5);
    atmosphere(x, W, H, t, 'c', [20, 80, 126]);
  }
  function lanternsAlong(x, tip, t) {
    for (let k = 34; k < tip - 10; k += 60) lantern(x, k, 24, t, 'c');
  }

  global.Defis16 = { weekly, collective, SIZE };
})(window);
