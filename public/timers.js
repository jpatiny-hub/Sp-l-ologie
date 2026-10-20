/*
 * Décompte du chrono en pixel art : quatre apparences (batterie de lampe, mèche de dynamite, wagonnet, lanterne).
 * Chaque dessin tient dans un canvas logique de 96 × 20 pixels, agrandi par le navigateur.
 */
(function (global) {
  const W = 96;
  const H = 20;
  const BG = '#120d0a';
  const DARK = '#1b1410';

  // Couleurs du décompte (bien, bientôt, urgent) selon le mode de couleurs.
  const TONES = {
    normal: ['#7fcf5a', '#f2c230', '#e2553f'],
    'rouge-vert': ['#6fb5f0', '#f6e86a', '#c76a00'],
    'bleu-jaune': ['#2e8b57', '#ff9ab0', '#d62828'],
    gris: ['#dedede', '#b8b8b8', '#ffffff'],
  };

  function rnd(n) {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  }
  function px(ctx, x, y, color, w = 1, h = 1) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }
  function sprite(ctx, rows, x0, y0, pal, k = 1) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && pal[ch] && px(ctx, x0 + x * k, y0 + y * k, pal[ch], k, k)));
  }

  function toneOf(left, colors) {
    return left > 15 ? colors[0] : left > 7 ? colors[1] : colors[2];
  }

  // --- Batterie de la lampe frontale : huit segments qui s'éteignent ---
  function battery(ctx, left, total, frame, colors, calm) {
    const cells = 8;
    const lit = Math.ceil((left / total) * cells);
    const tone = toneOf(left, colors);
    px(ctx, 9, 3, DARK, 78, 14);
    px(ctx, 87, 8, DARK, 3, 5);
    px(ctx, 10, 4, BG, 76, 12);
    for (let i = 0; i < cells; i++) px(ctx, 12 + i * 9, 6, i < lit ? tone : '#2a211c', 8, 8);
    // Dernière tranche : le segment restant clignote.
    if (!calm && left <= 5 && frame % 2 === 0) px(ctx, 12 + (lit - 1) * 9, 6, '#fff6b0', 8, 8);
    sprite(ctx, ['.kkk.', 'kyyyk', 'kyffk', '.kkk.'], 2, 8, { k: DARK, y: '#f2c230', f: '#fff6b0' });
  }

  // --- Mèche de dynamite : elle brûle de gauche à droite jusqu'au bâton ---
  function fuse(ctx, left, total, frame, colors, calm) {
    const ratio = left / total;
    const x0 = 4;
    const x1 = 74;
    const tip = x0 + Math.round((x1 - x0) * (1 - ratio));
    sprite(ctx, ['kkkkkkkk', 'krrrrrrk', 'krrrrrrk', 'kwwwwwwk', 'krrrrrrk', 'krrrrrrk', 'kkkkkkkk'], 78, 3, { k: DARK, r: '#c8362d', w: '#f3e9d2' }, 2);
    for (let x = tip; x <= x1; x++) px(ctx, x, 9 + (x % 6 < 3 ? 0 : 1), x % 4 < 2 ? '#c9a36b' : '#8b6a3c', 1, 2);
    px(ctx, x1, 8, '#c9a36b', 4, 3);
    const urgent = left <= 5;
    const seed = calm ? 3 : frame;
    for (let i = 0; i < (urgent ? 9 : 5); i++) {
      const a = rnd(i + seed * 3) * 6.28;
      const r = rnd(i * 7 + seed) * (urgent ? 7 : 4);
      px(ctx, tip + Math.cos(a) * r, 10 + Math.sin(a) * r, i % 2 ? '#ffd84a' : urgent ? colors[2] : '#ff9a3c', 2, 2);
    }
    px(ctx, tip - 1, 8, '#fff6b0', 3, 4);
  }

  // --- Wagonnet : il roule vers le butoir de fin de rail ---
  function cart(ctx, left, total, frame, colors, calm) {
    const ratio = left / total;
    const pos = 2 + Math.round(58 * (1 - ratio));
    for (let x = 0; x < W; x++) {
      px(ctx, x, 16, '#a9b0b8');
      if (x % 6 === 0) px(ctx, x, 17, '#8a5a2b', 2, 3);
    }
    px(ctx, 86, 4, '#c8362d', 7, 13);
    px(ctx, 86, 4, '#f3e9d2', 7, 3);
    sprite(ctx, ['kkkkkkkkkkkk', 'knnnnnnnnnnk', 'knnyyyynnnnk', 'knnnnnnnnnnk', '.kkkkkkkkkk.'], pos, 3, { k: DARK, n: '#8a5a2b', y: '#f2c230' }, 2);
    const wheel = frame % 2 === 0 ? 5 : 4;
    px(ctx, pos + 3, 13, DARK, 5, wheel);
    px(ctx, pos + 15, 13, DARK, 5, wheel);
    if (left <= 8) for (let i = 0; i < 3; i++) px(ctx, pos - 3 - i * 3, 12 + (i % 2) * 2, '#cfc3a6', 2, 2);
  }

  // --- Lanterne : la lumière autour d'elle rétrécit et la flamme rougit ---
  function lantern(ctx, left, total, frame, colors, calm) {
    const ratio = left / total;
    const cx = 10;
    const cy = 10;
    const R = 4 + ratio * 40;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - cx) * 0.55, y - cy);
        if (d >= R * 0.55) continue;
        const a = 1 - d / (R * 0.55);
        if ((x + y) % (a > 0.5 ? 1 : 2) === 0) px(ctx, x, y, `rgba(255,200,90,${a > 0.66 ? 0.5 : a > 0.33 ? 0.3 : 0.15})`);
      }
    }
    const flicker = !calm && frame % 3 === 0 ? 1 : 0;
    const urgent = left <= 7;
    sprite(
      ctx,
      ['..kkkk..', '.k....k.', '.kkkkkk.', 'kSSSSSSk', 'kyyffyyk', 'kyffffyk', 'kyffffyk', 'kyyffyyk', 'kSSSSSSk', 'kkkkkkkk', '.kk..kk.'],
      6,
      4 - flicker,
      { k: DARK, S: '#7d7d86', y: urgent ? '#7a2a20' : '#f2c230', f: urgent ? colors[2] : '#fff6b0' },
    );
  }

  const DRAW = { batterie: battery, meche: fuse, wagonnet: cart, lanterne: lantern };

  /**
   * Dessine le décompte : `left` et `total` en secondes, `now` en millisecondes (pour les étincelles et les scintillements).
   * `calm` fige les animations (préférence « moins de mouvement »).
   */
  function draw(canvas, skin, left, total, now, mode, calm) {
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    const colors = TONES[mode] || TONES.normal;
    (DRAW[skin] || battery)(ctx, Math.max(0, left), total, Math.floor(now / 120), colors, Boolean(calm));
  }

  global.Timers = { draw, SKINS: Object.keys(DRAW), WIDTH: W, HEIGHT: H };
})(window);
