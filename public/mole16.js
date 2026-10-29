'use strict';

/*
 * La taupe mineuse en 16 bits : 48 × 32 pixels (le double de l'ancienne), contour net, trois tons par matière, reflets.
 *   Mole16.draw(canvas, mood, gaze)  → dessine la taupe ; `gaze` = { x, y } entre -1 et 1 (le regard suit le doigt)
 *   Mole16.tool(canvas, id)          → dessine l'outil de la taupe (pioche, lanterne, plan, café, diamant, wagonnet, dynamite, carnet, sandwich)
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

  // Palette des outils (à part de celle de la taupe).
  const TOOL_PAL = {
    o: '#150e0b',
    n: '#b07a45', N: '#8a5a2b', m: '#5d3a1e', // bois
    S: '#e4e8f0', s: '#a9afbd', d: '#6b7080', // acier
    y: '#fff6b0', Y: '#ffd23f', Z: '#c98f12', // lueur, or
    f: '#ff9a2e', F: '#ff5a1f', // flamme
    r: '#e8453c', R: '#a82a24', // rouge
    c: '#d8f6ff', B: '#6fcdf5', C: '#3d8fc4', // cristal
    w: '#ffffff', e: '#efe6cf', E: '#cdbf9c', // porcelaine, papier
    g: '#6fbf3f', G: '#3f8a2a', // salade
    t: '#e0b46a', T: '#b98530', // pain
    p: '#f4a9a8', P: '#d77f86', // mains
    k: '#2a2a33', // noir doux
  };

  /** Grille 48 × 32 avec ses outils de dessin (ellipse ombrée, rectangle, ligne, contour). */
  function canvasKit() {
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    const put = (x, y, ch) => { if (x >= 0 && x < W && y >= 0 && y < H) g[Math.round(y)][Math.round(x)] = ch; };
    const rect = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ch); };
    const ell = (cx, cy, rx, ry, tones) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const nx = (x + 0.5 - cx) / rx;
          const ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny > 1) continue;
          const t = -0.6 * nx - 0.8 * ny;
          put(x, y, t > 0.4 ? tones[0] : t > -0.35 ? tones[1] : tones[2]);
        }
      }
    };
    const line = (x0, y0, x1, y1, ch) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) put(x0 + ((x1 - x0) * i) / (n || 1), y0 + ((y1 - y0) * i) / (n || 1), ch);
    };
    const outline = () => {
      const out = g.map((row) => row.slice());
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (g[y][x]) continue;
          if ((y > 0 && g[y - 1][x]) || (y < H - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < W - 1 && g[y][x + 1])) out[y][x] = 'o';
        }
      }
      return out;
    };
    return { g, put, rect, ell, line, outline };
  }
  const hand = (k, x, y) => { k.ell(x, y, 2.6, 2.4, 'ppP'); };

  // Chaque outil se dessine dans la grille 48 × 32, mains de la taupe en (12, 27) et (36, 27).
  const TOOLS = {
    pioche(k) {
      k.rect(35, 8, 36, 27, 'N'); k.rect(35, 8, 35, 27, 'n'); k.rect(36, 20, 36, 27, 'm');
      k.ell(38, 6, 9, 3, 'SsS'); // tête d'acier
      k.line(29, 8, 31, 10, 's'); k.line(47, 8, 45, 10, 's');
      k.rect(34, 4, 38, 8, 'd'); k.rect(34, 4, 38, 4, 'S'); k.rect(34, 5, 34, 8, 's');
      hand(k, 36, 26);
    },
    lanterne(k) {
      k.rect(11, 15, 12, 16, 'd'); k.put(10, 16, 'd'); k.put(13, 16, 'd');
      k.rect(8, 17, 15, 18, 'd'); k.rect(8, 17, 15, 17, 's');
      k.ell(11.5, 23, 4.2, 4.3, 'yYZ');
      k.rect(10, 22, 13, 24, 'y');
      k.rect(8, 28, 15, 29, 'd'); k.rect(8, 28, 15, 28, 's');
      k.line(8, 19, 8, 27, 'd'); k.line(15, 19, 15, 27, 'd');
      hand(k, 12, 28);
    },
    plan(k) {
      k.rect(9, 23, 38, 30, 'e'); k.rect(9, 23, 38, 23, 'w'); k.rect(9, 30, 38, 30, 'E');
      for (const x of [17, 26, 34]) k.line(x, 23, x, 30, 'E');
      k.line(12, 28, 19, 25, 'N'); k.line(19, 25, 23, 28, 'N'); k.line(23, 28, 30, 26, 'N');
      k.rect(31, 25, 33, 27, 'r'); k.put(32, 26, 'R'); // croix du trésor
      hand(k, 10, 27); hand(k, 37, 27);
    },
    cafe(k) {
      k.rect(31, 19, 40, 27, 'e'); k.rect(31, 19, 40, 19, 'w'); k.rect(31, 19, 32, 27, 'w'); k.rect(40, 20, 40, 27, 'E');
      k.rect(32, 20, 39, 21, 'm'); // café
      k.rect(41, 21, 43, 21, 'e'); k.line(43, 21, 43, 24, 'e'); k.rect(41, 24, 43, 24, 'e');
      k.line(34, 17, 33, 14, 'w'); k.line(33, 14, 35, 11, 'E'); k.line(38, 16, 39, 13, 'w'); k.line(39, 13, 37, 10, 'E');
      hand(k, 36, 27);
    },
    diamant(k) {
      k.rect(34, 12, 41, 14, 'C'); k.rect(35, 12, 36, 12, 'c');
      k.line(33, 14, 42, 14, 'C');
      k.rect(33, 15, 42, 17, 'B'); k.rect(33, 15, 36, 16, 'c');
      k.line(34, 18, 41, 18, 'B'); k.line(35, 19, 40, 19, 'C'); k.line(36, 20, 39, 20, 'C'); k.put(37, 21, 'C'); k.put(38, 21, 'C');
      for (const [x, y] of [[44, 8], [45, 9], [43, 9], [44, 10], [30, 11], [30, 12], [29, 12], [31, 12]]) k.put(x, y, 'w');
      hand(k, 37, 25);
    },
    wagonnet(k) {
      k.ell(9, 22, 7.5, 2.8, 'YZZ'); k.rect(4, 21, 7, 22, 'y'); // tas de minerai
      k.rect(0, 24, 17, 29, 'S'); k.rect(0, 24, 17, 24, 'w'); k.rect(0, 29, 17, 29, 's'); k.rect(0, 27, 17, 27, 'd');
      for (const x of [4, 9, 14]) k.line(x, 25, x, 26, 's');
      k.ell(4, 30, 2.2, 1.6, 'Sdd'); k.ell(14, 30, 2.2, 1.6, 'Sdd');
      hand(k, 12, 27);
    },
    dynamite(k) {
      for (const x of [37, 41]) { k.rect(x, 15, x + 3, 27, 'r'); k.rect(x, 15, x, 27, 'F'); k.rect(x + 3, 15, x + 3, 27, 'R'); k.rect(x, 20, x + 3, 21, 'e'); }
      k.rect(39, 13, 40, 14, 'k');
      k.line(40, 12, 42, 9, 'e'); k.line(42, 9, 44, 9, 'e');
      k.rect(44, 6, 46, 8, 'y'); k.put(45, 5, 'f'); k.put(43, 7, 'f'); k.put(47, 7, 'F'); k.put(45, 9, 'f');
      hand(k, 38, 27);
    },
    carnet(k) {
      k.rect(3, 15, 15, 30, 'T'); k.rect(3, 15, 4, 30, 'm');
      k.rect(5, 16, 14, 29, 'e'); k.rect(5, 16, 14, 16, 'w');
      for (const y of [19, 22, 25]) k.line(6, y, 13, y, 'E');
      k.line(6, 26, 10, 26, 'k');
      k.line(37, 14, 31, 26, 'Y'); k.line(38, 14, 32, 26, 'Z');
      k.rect(36, 10, 38, 13, 'R'); k.put(30, 27, 'k'); k.put(31, 27, 'k');
      hand(k, 12, 28); hand(k, 33, 24);
    },
    sandwich(k) {
      k.ell(37, 15, 7, 3.2, 'ttT'); // dessus du pain
      k.rect(31, 18, 43, 19, 'g'); k.rect(31, 19, 43, 19, 'G');
      k.rect(32, 20, 42, 21, 'r'); k.rect(32, 21, 42, 21, 'R');
      k.rect(32, 22, 42, 23, 'Y');
      k.ell(37, 25, 7, 2.6, 'ttT'); // dessous
      k.put(34, 13, 'w'); k.put(37, 12, 'w'); k.put(40, 13, 'w');
      hand(k, 36, 28);
    },
    sieste() {},
  };

  /** Dessine l'outil `id` de la taupe dans le canevas (48 × 32), mêmes dimensions que la taupe. */
  function tool(canvas, id) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const draw = TOOLS[id];
    if (!draw) return;
    const k = canvasKit();
    draw(k);
    k.outline().forEach((row, y) => row.forEach((ch, x) => {
      if (!ch) return;
      ctx.fillStyle = TOOL_PAL[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
  }

  global.Mole16 = { draw, tool, WIDTH: W, HEIGHT: H };
})(window);
