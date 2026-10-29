'use strict';

/*
 * La taupe mineuse en 16 bits : 48 × 32 pixels (le double de l'ancienne), contour net, trois tons par matière, reflets.
 *   Mole16.draw(canvas, mood, gaze)  → dessine la taupe ; `gaze` = { x, y } entre -1 et 1 (le regard suit le doigt)
 *   Mole16.scaleTool(canvas)         → double un outil dessiné en 24 × 16 pour l'aligner sur la taupe
 * Humeurs : idle, look, blink, sleep, happy, sad, stars.
 */
(function (global) {
  const W = 48;
  const H = 32;
  const PAL = {
    o: '#150e0b', // contour
    L: '#b98354', M: '#8a5a32', D: '#5d3a1e', // fourrure
    e: '#f1dfb4', E: '#d3b784', // ventre
    y: '#ffe36b', Y: '#f2c230', Z: '#b8860b', // casque
    g: '#9fe8ff', G: '#fffbe0', // lampe
    p: '#f4a9a8', P: '#d77f86', // museau, oreilles
    n: '#43222f', // truffe
    w: '#ffffff', k: '#150e0b', // yeux
    c: '#f6ecd0', // griffes, moustaches
    t: '#e0606e', // langue
    r: '#f08a8a', // joues
    s: '#ffd23f', // étoiles
    b: '#7fd0f7', // larme
  };

  /** Dessine les formes dans une grille de lettres, puis ajoute le contour. */
  function sprite(mood, gaze) {
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    const put = (x, y, ch) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch; };
    // Ellipse ombrée : lumière venant d'en haut à gauche ; `keep` limite les lignes dessinées.
    const ell = (cx, cy, rx, ry, tones, keep) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        if (keep && !keep(y)) continue;
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const nx = (x + 0.5 - cx) / rx;
          const ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny > 1) continue;
          const t = -0.6 * nx - 0.8 * ny;
          put(x, y, t > 0.4 ? tones[0] : t > -0.35 ? tones[1] : tones[2]);
        }
      }
    };
    const rect = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ch); };
    const gx = Math.round((gaze && gaze.x) || 0);
    const gy = Math.round((gaze && gaze.y) || 0);

    // Pieds et griffes.
    ell(17, 29, 4.5, 2.2, 'LMD');
    ell(31, 29, 4.5, 2.2, 'LMD');
    for (const x of [14, 16, 18]) put(x, 31, 'c');
    for (const x of [29, 31, 33]) put(x, 31, 'c');
    // Corps, ventre, bras.
    ell(24, 22, 11.5, 9, 'LMD');
    ell(24, 24, 6.5, 6, 'eeE');
    ell(11.5, 22, 3.2, 5.5, 'LMD');
    ell(36.5, 22, 3.2, 5.5, 'LMD');
    ell(11.5, 27, 2.6, 2.2, 'ppP');
    ell(36.5, 27, 2.6, 2.2, 'ppP');
    for (const x of [10, 12]) put(x, 29, 'c');
    for (const x of [35, 37]) put(x, 29, 'c');
    // Oreilles, tête.
    ell(14, 13, 2.6, 2.6, 'ppP');
    ell(34, 13, 2.6, 2.6, 'ppP');
    ell(24, 16, 11, 8, 'LMD');
    // Casque : dôme, nervure, bord et lampe.
    ell(24, 8, 9.5, 7, 'yYZ', (y) => y <= 9);
    rect(23, 2, 25, 8, 'Y');
    put(23, 2, 'y'); put(23, 3, 'y');
    rect(24, 3, 24, 8, 'Z');
    rect(12, 9, 36, 10, 'Y');
    rect(13, 9, 35, 9, 'y');
    rect(12, 11, 36, 11, 'Z');
    put(12, 9, null); put(36, 9, null); put(12, 11, null); put(36, 11, null);
    ell(24, 6.4, 3.2, 2.4, 'GgG');
    put(23, 5, 'G'); put(24, 5, 'G');

    // Museau, truffe, moustaches.
    ell(24, 19.5, 4.6, 3.4, 'ppP');
    ell(24, 17.8, 2.4, 1.5, 'nnn');
    put(23, 17, 'w'); put(22, 17, 'P');
    for (const [x, y] of [[13, 18], [14, 18], [15, 19], [12, 20], [14, 20], [15, 21]]) put(x, y, 'c');
    for (const [x, y] of [[34, 18], [33, 18], [32, 19], [35, 20], [33, 20], [32, 21]]) put(x, y, 'c');
    put(15, 19, 'c'); put(32, 19, 'c');
    // Joues.
    for (const x of [15, 16]) put(x, 20, 'r');
    for (const x of [31, 32]) put(x, 20, 'r');

    // Yeux (centres en x = 19 et 29, y = 15).
    const eyeOpen = (cx) => {
      ell(cx, 15.5, 2.3, 2.9, 'www');
      const px = cx - 1 + gx;
      const py = 14 + (gy > 0 ? 1 : 0);
      rect(px, py, px + 1, py + 2, 'k');
      put(px, py, 'w'); // reflet
    };
    const closed = (cx) => { rect(cx - 2, 16, cx + 2, 16, 'k'); put(cx - 2, 15, 'k'); put(cx + 2, 15, 'k'); };
    const arc = (cx) => { rect(cx - 1, 14, cx + 1, 14, 'k'); put(cx - 2, 15, 'k'); put(cx + 2, 15, 'k'); put(cx - 2, 16, 'k'); put(cx + 2, 16, 'k'); };
    const star = (cx) => {
      ell(cx, 15.5, 3, 3.3, 'www');
      for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) put(cx + dx, 15 + dy, dx === 0 && dy === 0 ? 'G' : 's');
    };
    for (const cx of [19, 29]) {
      if (mood === 'blink' || mood === 'sleep') closed(cx);
      else if (mood === 'happy') arc(cx);
      else if (mood === 'stars') star(cx);
      else eyeOpen(cx);
    }
    if (mood === 'sad') {
      for (const [x, y] of [[16, 12], [17, 12], [18, 13], [19, 13], [20, 14], [32, 12], [31, 12], [30, 13], [29, 13], [28, 14]]) put(x, y, 'k');
      rect(16, 15, 22, 15, 'M'); rect(26, 15, 32, 15, 'M'); // paupières tombantes
      put(16, 17, 'b'); put(16, 18, 'b'); put(16, 19, 'b');
    }

    // Bouche.
    if (mood === 'happy' || mood === 'stars') {
      ell(24, 22.5, 3.6, 2.4, 'kkk', (y) => y >= 22);
      rect(22, 24, 26, 24, 't');
      rect(21, 22, 27, 22, 'k');
      rect(23, 22, 25, 22, 'w');
    } else if (mood === 'sad') {
      for (const [x, y] of [[22, 23], [23, 22], [24, 22], [25, 22], [26, 23]]) put(x, y, 'k');
    } else if (mood === 'sleep') {
      rect(23, 22, 25, 22, 'k');
      put(24, 23, 'k'); put(25, 23, 'k');
    } else {
      for (const [x, y] of [[21, 22], [22, 23], [23, 23], [24, 23], [25, 23], [26, 23], [27, 22]]) put(x, y, 'k');
      put(23, 24, 'w'); put(24, 24, 'w'); // petite dent
    }

    // Contour : toute case vide au contact d'une case remplie.
    const out = g.map((row) => row.slice());
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (g[y][x]) continue;
        if ((y > 0 && g[y - 1][x]) || (y < H - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < W - 1 && g[y][x + 1])) out[y][x] = 'o';
      }
    }
    return out;
  }

  function draw(canvas, mood, gaze) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    sprite(mood || 'idle', gaze).forEach((row, y) => row.forEach((ch, x) => {
      if (!ch) return;
      ctx.fillStyle = PAL[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
  }

  /** Les outils sont dessinés en 24 × 16 : on les double, avec un liseré clair en haut à gauche pour le volume. */
  function scaleTool(canvas) {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    tmp.getContext('2d').drawImage(canvas, 0, 0);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(tmp, 0, 0, W, H);
  }

  global.Mole16 = { draw, scaleTool, WIDTH: W, HEIGHT: H };
})(window);
