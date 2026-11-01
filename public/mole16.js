'use strict';

/*
 * La taupe mineuse en 16 bits : 48 × 32 pixels (le double de l'ancienne), contour net, trois tons par matière, reflets.
 *   Mole16.draw(canvas, mood, gaze, prop) → dessine la taupe ; `gaze` = { x, y } entre -1 et 1 (le regard suit le doigt)
 *   Mole16.tool(canvas, id)          → dessine l'outil de la taupe (pioche, lanterne, plan, café, diamant, wagonnet, dynamite, carnet, sandwich)
 * Humeurs : idle, look, blink, sleep, happy, sad, stars, cheer, worry, think, confused, dizzy, meh, shh, surprised.
 * Accessoires (4e argument de draw) : question, loupe, confetti, dizzy, shh, idee.
 */
(function (global) {
  const W = 48;
  const H = 32;
  const PAL = {
    o: '#150e0b', // contour
    L: '#c28a58', M: '#92603a', D: '#5d3a1e', // fourrure
    e: '#f1dfb4', E: '#d3b784', // ventre
    y: '#ffe36b', Y: '#f2c230', Z: '#b8860b', // casque
    g: '#9fe8ff', G: '#fffbe0', // lampe
    p: '#f7b3b6', P: '#d9808a', // museau, pattes
    n: '#4a2535', // truffe
    w: '#ffffff', k: '#150e0b', // yeux
    c: '#f6ecd0', // griffes, moustaches
    t: '#e0606e', // langue
    r: '#ff8f9a', // joues
    s: '#ffd23f', // étoiles
    b: '#7fd0f7', // larme
  };

  /** Dessine les formes dans une grille de lettres, puis ajoute le contour. */
  function sprite(mood, gaze) {
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    const put = (x, y, ch) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch; };
    // Ellipse ombrée : lumière venant d'en haut à gauche ; `keep` limite les lignes dessinées.
    const ell = (cx, cy, rx, ry, tones, keep) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        if (keep && !keep(y)) continue;
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const nx = (x + 0.5 - cx) / rx;
          const ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny > 1) continue;
          const t = -0.6 * nx - 0.8 * ny;
          put(x, y, tones.length === 1 ? tones : t > 0.4 ? tones[0] : t > -0.35 ? tones[1] : tones[2]);
        }
      }
    };
    const rect = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ch); };
    const gx = Math.max(-1, Math.min(1, Math.round((gaze && gaze.x) || 0)));
    const gy = Math.round((gaze && gaze.y) || 0) > 0 ? 1 : 0;

    // Pieds, corps, ventre, petites pattes.
    ell(17, 30, 3.6, 1.8, 'LMD');
    ell(31, 30, 3.6, 1.8, 'LMD');
    ell(24, 26, 7.5, 5, 'LMD');
    ell(24, 27, 4, 3, 'eeE');
    ell(14, 25, 2.4, 2.8, 'LMD');
    ell(34, 25, 2.4, 2.8, 'LMD');
    ell(14, 27, 1.7, 1.4, 'ppP');
    ell(34, 27, 1.7, 1.4, 'ppP');
    // Grosse tête ronde, casque de petite taille posé dessus.
    ell(24, 16, 16, 10, 'LMD');
    ell(24, 6.5, 9, 5.5, 'yYZ', (y) => y <= 7);
    rect(14, 8, 34, 9, 'Y'); rect(15, 8, 33, 8, 'y'); rect(14, 10, 34, 10, 'Z');
    put(14, 8, null); put(34, 8, null); put(14, 10, null); put(34, 10, null);
    rect(23, 2, 25, 7, 'Y'); rect(24, 3, 24, 7, 'Z');
    ell(24, 4.6, 3, 2.2, 'GgG');
    put(23, 4, 'G');
    // Museau crème, truffe, grandes joues.
    ell(24, 20.5, 6, 3.8, 'eeE');
    ell(12.5, 20, 3, 1.8, 'r');
    ell(35.5, 20, 3, 1.8, 'r');
    ell(24, 19, 2.2, 1.4, 'n');
    put(23, 18, 'w');

    // Yeux : deux petits points brillants (centres en x = 15 et 33).
    for (const cx of [15, 33]) {
      const side = cx < 24 ? -1 : 1;
      const dot = (dx, dy, tall) => {
        const ex = cx - 1 + dx;
        const ey = 15 + dy;
        rect(ex, ey, ex + 1, ey + (tall || 3), 'k');
        put(ex, ey, 'w');
      };
      if (mood === 'blink' || mood === 'sleep') rect(cx - 1, 17, cx + 1, 17, 'k');
      else if (mood === 'happy' || mood === 'cheer' || mood === 'shh') { put(cx - 1, 17, 'k'); put(cx, 16, 'k'); put(cx + 1, 17, 'k'); }
      else if (mood === 'stars') {
        for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) put(cx + dx, 16 + dy, 's');
        put(cx, 16, 'G');
      } else if (mood === 'dizzy') {
        for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) put(cx + dx, 16 + dy, 'k');
      } else if (mood === 'meh') {
        rect(cx - 1, 16, cx + 1, 17, 'k'); rect(cx - 1, 16, cx + 1, 16, 'M');
      } else if (mood === 'think') {
        dot(1 + gx, -1, 2);
      } else if (mood === 'worry' || mood === 'surprised') {
        dot(0, -1, 4);
        put(cx + 1, 18, 'w');
      } else dot(gx, gy);
      // Sourcils.
      if (mood === 'sad' || mood === 'worry') { put(cx + side * 2, 13, 'k'); put(cx + side, 13, 'k'); put(cx, 12, 'k'); put(cx - side, 12, 'k'); }
      if (mood === 'confused') { if (side < 0) { put(cx - 1, 13, 'k'); put(cx, 13, 'k'); put(cx + 1, 14, 'k'); } else { put(cx - 1, 11, 'k'); put(cx, 11, 'k'); put(cx + 1, 11, 'k'); } }
      if (mood === 'think' && side > 0) { put(cx - 1, 12, 'k'); put(cx, 12, 'k'); put(cx + 1, 12, 'k'); }
      if (mood === 'surprised') { rect(cx - 1, 12, cx + 1, 12, 'k'); }
    }
    if (mood === 'sad') { put(13, 19, 'b'); put(13, 20, 'b'); put(13, 21, 'b'); } // larme
    if (mood === 'worry') { put(40, 10, 'b'); put(40, 11, 'b'); put(39, 12, 'b'); put(40, 12, 'b'); put(41, 12, 'b'); put(40, 13, 'b'); } // goutte de sueur

    // Bouche.
    if (mood === 'happy' || mood === 'stars') {
      rect(22, 22, 26, 22, 'k'); rect(23, 23, 25, 23, 't');
    } else if (mood === 'cheer') {
      rect(21, 22, 27, 22, 'k'); rect(22, 23, 26, 24, 'k'); rect(23, 24, 25, 24, 't'); rect(23, 23, 25, 23, 'w');
    } else if (mood === 'sad') {
      for (const [x, y] of [[22, 23], [23, 22], [24, 22], [25, 22], [26, 23]]) put(x, y, 'k');
    } else if (mood === 'sleep') {
      rect(23, 22, 25, 22, 'k'); put(24, 23, 'k');
    } else if (mood === 'worry' || mood === 'dizzy') {
      for (const [x, y] of [[22, 23], [23, 22], [24, 23], [25, 22], [26, 23]]) put(x, y, 'k');
    } else if (mood === 'surprised') {
      rect(23, 22, 25, 23, 'k'); put(24, 22, 'n');
    } else if (mood === 'meh') {
      rect(22, 22, 26, 22, 'k');
    } else if (mood === 'confused') {
      for (const [x, y] of [[22, 23], [23, 22], [24, 23], [25, 22], [26, 22]]) put(x, y, 'k');
    } else if (mood === 'think') {
      rect(24, 22, 26, 22, 'k');
    } else if (mood === 'shh') {
      // cachée par le doigt
    } else {
      for (const [x, y] of [[22, 22], [23, 23], [24, 22], [25, 23], [26, 22]]) put(x, y, 'k');
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

  function paint(ctx, grid, pal) {
    grid.forEach((row, y) => row.forEach((ch, x) => {
      if (!ch) return;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
  }

  // Tenue de saison (essai) : 'automne' = écharpe tricotée et feuille d'érable sur le casque.
  let season = null;
  function setSeason(id) {
    season = id || null;
  }
  function autumn(ctx) {
    const st = ['#c8442a', '#e8a33a'];
    for (let x = 15; x < 34; x++) { ctx.fillStyle = st[Math.floor(x / 2) % 2]; ctx.fillRect(x, 22, 1, 3); }
    ctx.fillStyle = '#3a1a0e'; ctx.fillRect(15, 25, 19, 1);
    for (let y = 25; y < 31; y++) { ctx.fillStyle = st[Math.floor(y / 2) % 2]; ctx.fillRect(30, y, 3, 1); }
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(30, 31, 1, 1); ctx.fillRect(32, 31, 1, 1);
    ctx.fillStyle = '#d9622b'; ctx.fillRect(27, 2, 4, 2); ctx.fillRect(28, 1, 2, 1); ctx.fillRect(26, 3, 1, 1); ctx.fillRect(31, 3, 1, 1);
    ctx.fillStyle = '#8c3a1e'; ctx.fillRect(29, 4, 1, 2);
  }

  /** `prop` : un accessoire posé par-dessus la taupe (voir PROPS) ; sert aux situations de jeu. */
  function draw(canvas, mood, gaze, prop) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    paint(ctx, sprite(mood || 'idle', gaze), PAL);
    if (season === 'automne' && mood !== 'sleep') autumn(ctx);
    if (prop && PROPS[prop]) {
      const k = canvasKit();
      PROPS[prop](k);
      paint(ctx, k.outline(), TOOL_PAL);
    }
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
    L: '#c28a58', M: '#92603a', D: '#5d3a1e', // fourrure
    b: '#7fd0f7', q: '#9a6bd6', // bleu, violet
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

  // Accessoires de situation, posés par-dessus la taupe (mêmes mains en (14, 27) et (34, 27)).
  const raisedArm = (k, x) => { k.ell(x, 19, 2.3, 5, 'LMD'); k.ell(x, 13.5, 2, 2, 'ppP'); };
  const PROPS = {
    // Point d'interrogation doré au-dessus de la tête : réponse refusée.
    question(k) {
      const glyph = ['.YYY.', 'Y...Y', '....Y', '...Y.', '..Y..', '..Y..', '.....', '..Y..'];
      glyph.forEach((row, dy) => [...row].forEach((ch, dx) => { if (ch !== '.') { k.put(40 + dx, 1 + dy, 'Y'); k.put(41 + dx, 1 + dy, 'Y'); } }));
      k.rect(41, 3, 42, 4, 'Y');
    },
    // Loupe tenue de la patte droite : « tu voulais dire ça ? ».
    loupe(k) {
      k.line(36, 28, 40, 23, 'N'); k.line(37, 28, 41, 23, 'n');
      k.ell(41, 19, 4.6, 4.6, 'ddd'); k.ell(41, 19, 3.2, 3.2, 'ccB');
      k.put(39, 17, 'w'); k.put(40, 17, 'w'); k.put(39, 18, 'w');
      hand(k, 35, 28);
    },
    // Bras levés et confettis : belle réponse.
    confetti(k) {
      raisedArm(k, 6); raisedArm(k, 42);
      const bits = [[2, 3, 'r'], [9, 1, 'B'], [12, 6, 'Y'], [5, 8, 'g'], [35, 6, 'r'], [38, 1, 'B'], [45, 3, 'Y'], [41, 8, 'g'], [28, 0, 'r'], [18, 0, 'Y']];
      for (const [x, y, ch] of bits) { k.put(x, y, ch); k.put(x + 1, y, ch); k.put(x, y + 1, ch); }
    },
    // Petites étoiles qui tournent autour du casque : chrono écoulé.
    dizzy(k) {
      for (const [x, y] of [[9, 4], [24, 0], [39, 4]]) { k.put(x, y, 'Y'); k.put(x - 1, y, 'y'); k.put(x + 1, y, 'y'); k.put(x, y - 1, 'y'); k.put(x, y + 1, 'y'); }
    },
    // Doigt sur la bouche : chut, le résultat reste secret.
    shh(k) {
      k.ell(24, 25.5, 2.4, 1.8, 'LMD');
      k.rect(23, 21, 25, 24, 'M'); k.rect(23, 21, 23, 24, 'L'); k.rect(24, 21, 24, 22, 'p');
    },
    // Ampoule au-dessus de la tête : une idée.
    idee(k) {
      k.ell(40, 5, 3.4, 3.4, 'yYZ'); k.rect(39, 9, 41, 10, 'd'); k.put(39, 4, 'w'); k.put(40, 4, 'w');
      for (const [x, y] of [[44, 2], [45, 5], [35, 1]]) k.put(x, y, 'Y');
    },
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

  global.Mole16 = { draw, tool, setSeason, PROP_IDS: Object.keys(PROPS), WIDTH: W, HEIGHT: H };
})(window);
