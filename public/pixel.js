'use strict';

/*
 * Rendu pixel art de la coupe de terrain et de la foreuse.
 * Le monde est dessiné une fois dans un canevas hors écran (ciel + couches géologiques),
 * puis la caméra suit la foreuse. 1 point de score = 2 pixels de profondeur.
 */
(function (global) {
  const W = 160;
  const H = 200;
  const SKY = 56;
  const PPP = 2;
  const MAX_POINTS = 600;
  const WORLD_H = SKY + MAX_POINTS * PPP + 28;
  const SHAFT_W = 18;
  const SHAFT_X = Math.floor(W / 2 - SHAFT_W / 2);
  const DRILL_SPEED = 55; // points par seconde (descentes longues)
  // Durée de la descente : au moins 2,2 s pour une réponse évidente, et un peu plus quand on creuse loin
  // (la foreuse va alors plus vite, pour garder une descente cohérente sans être interminable).
  const DRILL_TIME_MIN = 2.2;
  const DRILL_TIME_PER_POINT = 0.016;
  const DRILL_TIME_MAX = 5;

  // Couches traversées (en points de score). Le nom est affiché pendant la descente.
  const ZONES = [
    { from: 0, name: 'Terre végétale', dark: '#24160c', colors: ['#4a2f1a', '#5a3a20', '#6b4627', '#3b2414'] },
    { from: 6, name: 'Limon et argile', dark: '#3d2814', colors: ['#b07a43', '#a06d3a', '#c28d53', '#8e5f31'] },
    { from: 24, name: 'Calcaire (pierre bleue)', dark: '#262c33', colors: ['#6f7d8b', '#7b8997', '#64717e', '#8995a1'] },
    { from: 44, name: 'Veine de houille', dark: '#08080a', colors: ['#17171b', '#202026', '#2a2a31', '#111114'] },
    { from: 58, name: 'Croûte granitique', dark: '#2e2624', colors: ['#a8968f', '#c5a89c', '#7d716c', '#e0d4c8'] },
    { from: 110, name: 'Manteau supérieur', dark: '#1d220d', colors: ['#56632a', '#647233', '#4a5623', '#76863d'] },
    { from: 220, name: 'Manteau inférieur', dark: '#2a0d07', colors: ['#6e2818', '#7d301c', '#5e2013', '#8f3a22'] },
    { from: 430, name: 'Noyau externe', dark: '#5a2306', colors: ['#d06d1f', '#e88a2a', '#f7b23b', '#b5561a'] },
    { from: 560, name: 'Noyau interne', dark: '#8a5d12', colors: ['#f9e27a', '#fbeaa0', '#f3d25a', '#fff6cc'] },
  ];

  // Correspondance score → profondeur réelle (km), interpolée linéairement.
  const DEPTH_TABLE = [
    [0, 0], [6, 0.0005], [24, 0.02], [44, 0.4], [58, 1.2], [110, 35], [220, 660], [430, 2890], [560, 5150], [600, 6371],
  ];

  const PALETTES = {
    normal: {
      invalid: '#4a4a4a', timeout: '#4a4a4a', skip: '#4a4a4a',
      evident: '#8b5a2b', courant: '#e8c547', original: '#f08a24', rare: '#d9342b', pepite: '#5ee0ff',
    },
    // Daltonisme rouge-vert (protanopie, deutéranopie) : axe bleu-jaune et luminosité, sans rouge ni vert.
    'rouge-vert': {
      invalid: '#4a4a4a', timeout: '#4a4a4a', skip: '#4a4a4a',
      evident: '#2b4c9b', courant: '#6fb5f0', original: '#f6e86a', rare: '#c76a00', pepite: '#ffffff',
    },
    // Daltonisme bleu-jaune (tritanopie) : axe rouge-vert-rose, sans bleu ni jaune.
    'bleu-jaune': {
      invalid: '#4a4a4a', timeout: '#4a4a4a', skip: '#4a4a4a',
      evident: '#6b3a2a', courant: '#ff9ab0', original: '#d62828', rare: '#2e8b57', pepite: '#ffffff',
    },
    // Niveaux de gris (achromatopsie) : cinq luminosités bien espacées.
    gris: {
      invalid: '#4a4a4a', timeout: '#4a4a4a', skip: '#4a4a4a',
      evident: '#555555', courant: '#8a8a8a', original: '#b8b8b8', rare: '#dedede', pepite: '#ffffff',
    },
  };
  // Objet partagé avec l'interface : son contenu change avec le mode daltonien.
  const TIER_COLORS = { ...PALETTES.normal };

  // Symbole propre à chaque rareté (mode daltonien) : texte et motif 5 × 5 pour les repères du puits.
  const TIER_SYMBOLS = { evident: '·', courant: '–', original: '+', rare: '×', pepite: '◆', skip: '', timeout: '', invalid: '' };
  const TIER_GLYPHS = {
    evident: ['.....', '.....', '..#..', '.....', '.....'],
    courant: ['.....', '.....', '.###.', '.....', '.....'],
    original: ['.....', '..#..', '.###.', '..#..', '.....'],
    rare: ['.....', '.#.#.', '..#..', '.#.#.', '.....'],
    pepite: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  };
  let colorblind = false;

  /** `mode` : « normal », « rouge-vert », « bleu-jaune » ou « gris » (un booléen vrai vaut « rouge-vert »). */
  function setColorblind(mode) {
    const key = mode === true ? 'rouge-vert' : PALETTES[mode] ? mode : 'normal';
    colorblind = key !== 'normal';
    Object.assign(TIER_COLORS, PALETTES[key]);
  }

  function depthKm(points) {
    const p = Math.max(0, Math.min(MAX_POINTS, points));
    for (let i = 1; i < DEPTH_TABLE.length; i++) {
      const [p1, k1] = DEPTH_TABLE[i];
      const [p0, k0] = DEPTH_TABLE[i - 1];
      if (p <= p1) return k0 + ((p - p0) / (p1 - p0)) * (k1 - k0);
    }
    return 6371;
  }

  /** Distance restante jusqu'au centre de la Terre, déjà formatée. */
  function formatRemaining(points) {
    const km = 6371 - depthKm(points);
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${Math.round(km).toLocaleString('fr-BE')} km`;
  }

  function formatDepth(points) {
    const km = depthKm(points);
    if (km < 0.001) return `${Math.round(km * 100000)} cm`;
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${Math.round(km).toLocaleString('fr-BE')} km`;
  }

  function zoneIndex(points) {
    let zi = 0;
    for (let i = 0; i < ZONES.length; i++) if (points >= ZONES[i].from) zi = i;
    return zi;
  }

  function zoneName(points) {
    if (points >= MAX_POINTS) return 'Centre de la Terre';
    return ZONES[zoneIndex(points)].name;
  }

  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const RGB = {};
  function c(hex) {
    return RGB[hex] || (RGB[hex] = rgb(hex));
  }

  function boundaryOffset(x, zi) {
    return Math.round(Math.sin(x * 0.19 + zi * 2.3) * 1.6 + Math.sin(x * 0.053 + zi * 0.7) * 2.2);
  }

  function zoneAtPixel(x, d) {
    for (let zi = ZONES.length - 1; zi > 0; zi--) {
      if (d >= ZONES[zi].from * PPP + boundaryOffset(x, zi)) return zi;
    }
    return 0;
  }

  // Couleur d'un pixel de terrain : x, profondeur d en pixels sous la surface.
  function groundColor(zi, x, d) {
    const z = ZONES[zi];
    const n = hash(x, d, zi);
    const pick = (i) => z.colors[i % z.colors.length];
    switch (zi) {
      case 0:
        if (hash(x >> 1, d, 7) < 0.05) return '#2d1c10';
        return pick(Math.floor(n * 4));
      case 1: {
        if (hash(x >> 1, d >> 1, 11) > 0.978) return n < 0.5 ? '#9a948a' : '#bdb6aa';
        const band = Math.floor((d + Math.sin(x * 0.12) * 2) / 4);
        return pick(band + (n < 0.25 ? 1 : 0));
      }
      case 2: {
        const layer = Math.floor(d / 7);
        if (d % 7 === 0 || (x + layer * 13) % 23 === 0) return '#4f5a66';
        return pick(Math.floor(n * 3) + (layer % 2));
      }
      case 3:
        if (n > 0.975) return '#8a8fa0';
        return pick(Math.floor(n * 4));
      case 4:
        if (n < 0.45) return z.colors[0];
        if (n < 0.7) return z.colors[1];
        if (n < 0.85) return z.colors[2];
        if (n < 0.96) return z.colors[3];
        return '#2b2626';
      case 5:
        if ((x + d) % 9 === 0 && n < 0.6) return '#3f4a1e';
        return pick(Math.floor(n * 4));
      case 6: {
        const crack = Math.abs(Math.sin(x * 0.21 + d * 0.09 + Math.sin(d * 0.05) * 3));
        if (crack < 0.05) return '#ff7a2a';
        if (crack < 0.1) return '#c4481f';
        return pick(Math.floor(n * 4));
      }
      case 7: {
        if (n > 0.988) return '#fff1a8';
        const swirl = Math.sin(d * 0.22 + Math.sin(x * 0.13 + d * 0.02) * 2.5);
        if (swirl > 0.6) return z.colors[2];
        if (swirl > 0) return z.colors[1];
        if (swirl > -0.6) return z.colors[0];
        return z.colors[3];
      }
      default: {
        if ((x * 3 + d) % 11 === 0 || (x * 3 - d + 1100) % 13 === 0) return '#e9c046';
        return pick(Math.floor(n * 4));
      }
    }
  }

  // Décor de saison (« halloween » : nuit violette, pleine lune, chauves-souris, citrouilles ; « toussaint » : crépuscule gris-bleu, nuages, bougies et chrysanthèmes) ; null = décor habituel.
  let season = null;
  function setSeason(id) {
    season = id || null;
  }

  function skyColor(x, y) {
    const bands = season === 'halloween'
      ? ['#0f0820', '#170d33', '#22123f', '#34174d', '#5a2a5a', '#a0442e']
      : season === 'toussaint'
        ? ['#262e3c', '#303a4c', '#3c485c', '#4d5c71', '#6a7a8d', '#97a2b0']
        : ['#4f9fd3', '#5eaedb', '#70bde2', '#86cbe8', '#a0d8ee', '#bfe6f3'];
    const h = (SKY - 6) / bands.length;
    const b = Math.min(bands.length - 1, Math.floor(y / h));
    const within = y - b * h;
    if (within < 1.5 && b > 0 && (x + y) % 2 === 0) return bands[b - 1];
    return bands[b];
  }

  // Petits motifs posés dans le décor.
  const AMMONITE = ['.###.', '#...#', '#.#.#', '#..##', '.##..'];
  const BONE = ['##...##', '.#####.', '##...##'];
  const DIAMOND = ['.c.', 'cwc', '.c.'];
  const TRILOBITE = ['.aaa.', 'abxba', '.bxb.', 'abxba', '.bxb.', 'abxba', '..x..'];
  const AMPHORA = ['.###.', '..#..', '#.#.#', '#####', '.###.', '.###.', '..#..'];
  const MOLE = ['..###..', '.#####.', '#######p', '.#.#.#.'];
  const WORM = ['.pp...', 'p..p.p', '....p.'];
  // Squelette humain allongé (sépulture ancienne), tête à gauche.
  const SKELETON = [
    '.##............',
    '#..#.#.#.#.....',
    '#..##########..',
    '.##..#.#.#.#.##',
    '.............#.#',
  ];

  function stamp(set, pattern, x0, y0, colors) {
    pattern.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch !== '.') set(x0 + dx, y0 + dy, colors[ch] || colors['#']);
      });
    });
  }


  // Halloween : crânes, côtes et os longs enfouis à toutes les profondeurs, à l'écart du puits.
  const SKULL = ['.######.', '########', '#..##..#', '#..##..#', '########', '.#.##.#.', '..####..'];
  const RIBS = ['#.#####.#', '.#.###.#.', '#.#####.#', '.#.###.#.', '..#####..'];
  const LONGBONE = ['##.........##', '.###########.', '##.........##'];
  const HW_GHOST = ['..www..', '.wwwww.', 'wwkwkww', 'wwwwwww', 'wwwwwww', 'wwwwwww', 'w.www.w'];

  function haunt(set) {
    const spots = [
      [SKULL, 46, 12], [LONGBONE, 24, 40], [RIBS, 120, 30], [SKULL, 112, 46], [RIBS, 6, 52], [SKULL, 14, 66],
      [LONGBONE, 140, 70], [LONGBONE, 40, 84], [SKULL, 130, 92], [RIBS, 40, 100], [LONGBONE, 104, 110], [SKULL, 50, 122],
      [RIBS, 140, 140], [LONGBONE, 4, 150], [SKULL, 108, 160], [RIBS, 10, 180], [LONGBONE, 120, 190], [SKULL, 20, 205],
      [RIBS, 112, 220], [LONGBONE, 30, 240], [SKULL, 136, 250], [RIBS, 36, 280], [LONGBONE, 138, 300], [SKULL, 56, 300],
      [RIBS, 132, 330], [SKULL, 104, 350], [LONGBONE, 14, 360], [RIBS, 8, 390], [SKULL, 24, 410], [LONGBONE, 106, 420],
      [RIBS, 110, 440], [SKULL, 128, 470], [LONGBONE, 44, 500], [LONGBONE, 126, 520],
    ];
    spots.forEach(([pattern, x, d]) => {
      const bone = d > 250 ? '#b8ad94' : '#ddd3b8';
      stamp(set, pattern, x, at(d), { '#': bone });
    });
  }

  function buildWorld() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = WORLD_H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, WORLD_H);
    const set = (x, y, hex) => {
      if (x < 0 || x >= W || y < 0 || y >= WORLD_H) return;
      const [r, g, b] = c(hex);
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    };

    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < W; x++) {
        if (y < SKY) set(x, y, skyColor(x, y));
        else {
          const d = y - SKY;
          set(x, y, groundColor(zoneAtPixel(x, d), x, d));
        }
      }
    }

    if (season === 'halloween') {
      // Étoiles, pleine lune et chauves-souris à la place du soleil et des nuages.
      for (let i = 0; i < 26; i++) set(Math.floor(hash(i, 5, 71) * W), Math.floor(hash(i, 9, 72) * (SKY - 24)), hash(i, 3, 73) > 0.5 ? '#ffffff' : '#9a86c4');
      for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) if (x * x + y * y <= 40) set(W - 26 + x, 16 + y, '#ffeeb0');
      [[-3, -2, 1], [2, 1, 1], [-1, 3, 1], [3, -3, 1]].forEach(([dx, dy]) => set(W - 26 + dx, 16 + dy, '#e8cf86'));
      const bat = (bx, by) => {
        ['#05030a'].forEach((col) => {
          set(bx, by, col); set(bx + 1, by, col); set(bx + 2, by, col);
          set(bx - 2, by - 1, col); set(bx - 1, by, col); set(bx + 3, by, col); set(bx + 4, by - 1, col);
          set(bx - 3, by - 2, col); set(bx + 5, by - 2, col);
          set(bx, by - 1, col); set(bx + 2, by - 1, col);
        });
      };
      [[22, 34], [58, 30], [102, 22], [82, 40]].forEach(([bx, by]) => bat(bx, by));
    } else if (season === 'toussaint') {
      // Soleil voilé et gros nuages gris.
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 30) set(W - 26 + x, 16 + y, '#b9c2cf');
      [[10, 12, 34], [70, 8, 40], [118, 20, 30], [38, 28, 26]].forEach(([cx, cy, w]) => {
        for (let x = 0; x < w; x++) {
          set(cx + x, cy, '#7d8999');
          set(cx + x, cy + 1, '#6a7686');
          if (x > 3 && x < w - 3) set(cx + x, cy - 1, '#8a96a6');
          if (x > 7 && x < w - 6) set(cx + x, cy - 2, '#97a2b0');
        }
      });
    } else {
    // Soleil et nuages.
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 30) set(W - 26 + x, 14 + y, '#ffe27a');
    [[18, 10, 18], [92, 18, 14]].forEach(([cx, cy, w]) => {
      for (let x = 0; x < w; x++) {
        set(cx + x, cy, '#ffffff');
        set(cx + x, cy + 1, '#e6f4fa');
        if (x > 3 && x < w - 3) set(cx + x, cy - 1, '#ffffff');
        if (x > 6 && x < w - 5) set(cx + x, cy - 2, '#ffffff');
      }
    });
    }

    // Terril à gauche (clin d'œil aux anciens charbonnages wallons).
    for (let y = 0; y < 24; y++) {
      const half = Math.floor(y * 1.3);
      for (let x = -half; x <= half; x++) {
        const px = 30 + x;
        const py = SKY - 24 + y;
        const vegetated = y < 14 && hash(px, py, 3) < 0.35 - y * 0.02;
        set(px, py, vegetated ? '#4c7a34' : hash(px, py, 4) < 0.5 ? '#2b2b2f' : '#38363b');
      }
    }

    // Maisons à droite.
    [[112, 10, '#b5523b'], [124, 12, '#9c4632'], [138, 9, '#b5523b']].forEach(([hx, hw, roof]) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < hw; x++) set(hx + x, SKY - 8 + y, (x + y) % 5 === 0 ? '#8f4a35' : '#a85a40');
      for (let y = 0; y < 5; y++) for (let x = y; x < hw - y; x++) set(hx + x, SKY - 9 - (4 - y), roof);
      set(hx + 3, SKY - 5, '#ffe9a0');
      set(hx + 3, SKY - 4, '#ffe9a0');
    });

    // Chevalement (tour de forage) au-dessus du puits.
    const cx = W / 2;
    for (let y = 0; y < 34; y++) {
      const spread = Math.floor((34 - y) / 3.2);
      set(cx - 4 - spread, SKY - 1 - y, '#3a3a44');
      set(cx + 3 + spread, SKY - 1 - y, '#3a3a44');
      if (y % 6 === 0) for (let x = cx - 4 - spread; x <= cx + 3 + spread; x++) set(x, SKY - 1 - y, '#4b4b57');
    }
    for (let a = 0; a < 32; a++) {
      const t = (a / 32) * Math.PI * 2;
      set(Math.round(cx + Math.cos(t) * 4), Math.round(SKY - 38 + Math.sin(t) * 4), '#5c5c6a');
    }
    set(cx, SKY - 38, '#5c5c6a');

    // Herbe.
    for (let x = 0; x < W; x++) {
      set(x, SKY - 1, season === 'halloween' ? '#3d6b2a' : season === 'toussaint' ? '#566b3c' : '#5fa83a');
      set(x, SKY, season === 'halloween' ? '#2f5a20' : season === 'toussaint' ? '#465a30' : '#4b8c2c');
      if (hash(x, 1, 9) > 0.65) set(x, SKY - 2, season === 'halloween' ? '#4a7d32' : season === 'toussaint' ? '#62784a' : '#6dbb45');
    }
    if (season === 'toussaint') {
      // Chrysanthèmes (blanc, jaune, rouille, pourpre) et bougies allumées le long du sol.
      [[100, '#ffffff'], [110, '#f2c230'], [121, '#e8742a'], [132, '#b0306e'], [143, '#ffffff'], [60, '#f2c230'], [72, '#ffffff'], [14, '#e8742a'], [48, '#b0306e']].forEach(([fx, col], i) => {
        const w = 5 + (i % 2);
        for (let y = 0; y < 4; y++) for (let x = 0; x < w; x++) if (!((y === 0 || y === 3) && (x === 0 || x === w - 1))) set(fx + x, SKY - 5 + y, hash(fx + x, y, 51) > 0.8 ? '#fff7d6' : col);
        set(fx + 2, SKY - 2, '#3f5a2c');
      });
      [[90, 3], [118, 4], [150, 3], [30, 3], [84, 4]].forEach(([cx0, h]) => {
        for (let y = 0; y < h; y++) set(cx0, SKY - 1 - y, '#f4efe0');
        set(cx0, SKY - 2 - h, '#ffd84a');
        set(cx0, SKY - 3 - h, '#ff9a2a');
        set(cx0 - 1, SKY - 2 - h, '#7a5d1f');
        set(cx0 + 1, SKY - 2 - h, '#7a5d1f');
      });
    }
    if (season === 'halloween') {
      // Citrouilles devant les maisons et au pied du chevalement.
      [[106, 4], [128, 5], [66, 4], [150, 4]].forEach(([px0, w]) => {
        for (let y = 0; y < 4; y++) for (let x = 0; x < w; x++) set(px0 + x, SKY - 5 + y, y === 0 && x > 0 && x < w - 1 ? '#c25410' : '#f07a1a');
        set(px0 + Math.floor(w / 2), SKY - 6, '#4c7a34');
        set(px0 + 1, SKY - 4, '#2a1206');
        set(px0 + w - 2, SKY - 4, '#2a1206');
        set(px0 + 1, SKY - 2, '#2a1206');
        set(px0 + w - 2, SKY - 2, '#2a1206');
      });
    }

    decorate(set);
    if (season === 'halloween') haunt(set);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // Éléments animés du décor, repérés pendant la construction du monde.
  const twinkles = [];
  const bubbles = [];

  function line(set, x0, y0, x1, y1, color) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), color);
  }

  /** Appelle fn(x, y, r) pour chaque pixel d'une ellipse (r : distance normalisée au centre, 0 → 1). */
  function ellipse(cx, cy, rx, ry, fn, rough = 0) {
    for (let y = -ry - 1; y <= ry + 1; y++) {
      for (let x = -rx - 1; x <= rx + 1; x++) {
        const r = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2);
        if (r <= 1 + (hash(cx + x, cy + y, 31) - 0.5) * rough) fn(cx + x, cy + y, r, x, y);
      }
    }
  }

  // Profondeur (en pixels sous la surface) → ordonnée dans le monde.
  const at = (d) => SKY + d;

  // Fossiles, squelettes, poche de pétrole, galerie de mine… couche par couche, à l'écart du puits.
  function decorate(set) {
    // Terre végétale : racines et ver de terre.
    [8, 23, 41, 57, 104, 118, 133, 150].forEach((x, i) => {
      let px = x;
      for (let y = 1; y < 6 + (i % 3) * 2; y++) {
        if (hash(x, y, 40) < 0.3) px += hash(x, y, 41) < 0.5 ? -1 : 1;
        set(px, at(y), '#8a6a3f');
      }
    });
    stamp(set, WORM, 30, at(6), { p: '#d98a8a' });

    // Limon : sépulture ancienne, amphore, taupe dans sa galerie, os.
    stamp(set, SKELETON, 8, at(30), { '#': '#ece4cf' });
    stamp(set, AMPHORA, 134, at(18), { '#': '#b5603b' });
    stamp(set, BONE, 44, at(20), { '#': '#ece4cf' });
    for (let x = 98; x < 126; x++) {
      const y = at(38) + Math.round(Math.sin(x * 0.35) * 1.5);
      set(x, y, '#5e3c1f');
      set(x, y + 1, '#5e3c1f');
      set(x, y + 2, '#6b4627');
    }
    stamp(set, MOLE, 118, at(35), { '#': '#3b3533', p: '#f0a3a3' });

    // Calcaire : grotte à concrétions (clin d'œil aux grottes de Han), fossiles, poche de pétrole.
    ellipse(24, at(62), 18, 6, (x, y) => set(x, y, '#141a21'), 0.35);
    for (let x = 9; x < 40; x += 3) {
      const len = 1 + Math.floor(hash(x, 1, 42) * 4);
      const top = at(57) + Math.round(hash(x, 2, 43) * 2);
      for (let k = 0; k < len; k++) set(x, top + k, k === len - 1 ? '#c9d2da' : '#9aa6b2');
      const floor = at(67) - Math.round(hash(x, 3, 44) * 2);
      for (let k = 0; k < Math.floor(hash(x, 4, 45) * 3); k++) set(x + 1, floor - k, '#9aa6b2');
    }
    for (let x = 18; x < 30; x++) set(x, at(67), '#3b6e8f');
    twinkles.push({ x: 26, y: at(66), color: '#bfe6f3' });
    [[50, 54], [12, 76], [148, 52], [102, 52], [62, 80]].forEach(([x, d]) => stamp(set, AMMONITE, x, at(d), { '#': '#d9d2c3' }));
    stamp(set, TRILOBITE, 36, at(73), { a: '#bfb39a', b: '#a89c84', x: '#8c826e' });
    [[56, 60], [150, 64]].forEach(([x, d]) => {
      for (let k = 0; k < 8; k += 2) set(x, at(d + k), '#cfc8b8');
    });
    // Piège pétrolier : gaz au sommet du dôme, pétrole dessous, couverture d'argile.
    ellipse(122, at(77), 22, 7, (x, y, r, dx, dy) => {
      if (r > 0.86) set(x, y, '#6f6250');
      else if (dy < -2) set(x, y, '#a9b6c0');
      else set(x, y, hash(x, y, 46) < 0.05 ? '#4a3a63' : hash(x, y, 47) < 0.06 ? '#5b4a2a' : '#0f0b07');
    });
    twinkles.push({ x: 116, y: at(78), color: '#7b6aa0' }, { x: 131, y: at(80), color: '#8a7442' });

    // Houille : squelette d'iguanodon (découvert dans un charbonnage de Bernissart en 1878)
    // et galerie de mine avec étançons, rails et berline.
    const yb = at(110);
    const bone = '#d9cfb8';
    const spine = [[4, yb - 3], [12, yb - 6], [20, yb - 9], [27, yb - 11], [34, yb - 11], [40, yb - 10], [45, yb - 13], [48, yb - 15]];
    for (let i = 1; i < spine.length; i++) line(set, ...spine[i - 1], ...spine[i], bone);
    // Épines des vertèbres, juste au-dessus de la colonne.
    const spineY = (x) => {
      for (let i = 1; i < spine.length; i++) {
        const [x0, y0] = spine[i - 1];
        const [x1, y1] = spine[i];
        if (x <= x1) return Math.round(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
      }
      return spine[spine.length - 1][1];
    };
    for (let x = 8; x < 44; x += 2) set(x, spineY(x) - 1, bone);
    for (let x = 28; x <= 39; x += 2) line(set, x, yb - 10, x - 1, yb - 10 + 4 + ((x * 7) % 3), bone);
    ['.####..', '#.#####', '.######', '..##.#.'].forEach((row, dy) => {
      [...row].forEach((ch, dx) => ch === '#' && set(47 + dx, yb - 18 + dy, bone));
    });
    line(set, 26, yb - 11, 29, yb - 5, bone);
    line(set, 29, yb - 5, 25, yb - 1, bone);
    line(set, 23, yb, 28, yb, bone);
    line(set, 38, yb - 9, 41, yb - 5, bone);
    line(set, 41, yb - 5, 40, yb - 3, bone);
    set(42, yb - 6, bone);
    set(43, yb - 7, bone);
    const gTop = at(96);
    for (let y = gTop; y < gTop + 10; y++) for (let x = 94; x < 154; x++) set(x, y, y === gTop ? '#2a221b' : '#3a2c20');
    for (let x = 96; x < 154; x += 12) {
      line(set, x, gTop + 1, x, gTop + 8, '#8a5a2b');
      line(set, x - 2, gTop + 1, x + 2, gTop + 1, '#a06d3a');
    }
    for (let x = 94; x < 154; x++) {
      set(x, gTop + 8, x % 3 === 0 ? '#5a3a20' : '#3a2c20');
      set(x, gTop + 9, '#7d7d86');
    }
    ['k.kkk.k', 'gggggggg', 'gggggggg', '.w....w.'].forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch !== '.') set(124 + dx, gTop + 4 + dy, { k: '#111114', g: '#6b6f78', w: '#222226' }[ch]);
      });
    });
    set(110, gTop + 2, '#3a3a44');
    set(110, gTop + 3, '#ffd36b');
    twinkles.push({ x: 110, y: gTop + 3, color: '#fff1a8', steady: true });

    // Croûte : géode d'améthyste, filons de quartz, pépites d'or.
    ellipse(22, at(160), 8, 7, (x, y, r, dx, dy) => {
      if (r > 0.82) set(x, y, '#8e8a99');
      else if (r > 0.3) {
        const facet = Math.floor((Math.atan2(dy, dx) + Math.PI) * 2.5) % 3;
        set(x, y, ['#9b59b6', '#c39be0', '#6c3483'][facet]);
      } else set(x, y, '#2a1838');
    });
    twinkles.push({ x: 19, y: at(158), color: '#f1e1ff' }, { x: 25, y: at(163), color: '#f1e1ff' });
    [[100, 130, 122, 146], [128, 170, 150, 160], [40, 196, 60, 206]].forEach(([x0, d0, x1, d1]) => line(set, x0, at(d0), x1, at(d1), '#e9e4dc'));
    [[44, 132], [110, 140], [140, 178], [8, 184], [58, 150], [100, 204]].forEach(([gx, d]) => {
      set(gx, at(d), '#f5c542');
      set(gx + 1, at(d), '#ffe48a');
      set(gx, at(d) + 1, '#c99a26');
      twinkles.push({ x: gx + 1, y: at(d), color: '#ffffff' });
    });

    // Manteau supérieur : olivine, diamonds, poches de magma.
    for (let i = 0; i < 26; i++) {
      const x = sideX(i, 50);
      const d = 226 + Math.floor(hash(i, 51, 52) * 280);
      set(x, at(d), '#a5d16a');
      set(x + 1, at(d), '#7fb24a');
      set(x, at(d) + 1, '#7fb24a');
    }
    for (let i = 0; i < 7; i++) {
      const x = sideX(i, 9);
      const y = at(300 + Math.floor(hash(i, 10, 25) * 140));
      stamp(set, DIAMOND, x, y, { c: '#9fe8ff', w: '#ffffff' });
      twinkles.push({ x: x + 1, y: y + 1, color: '#ffffff' });
    }
    [[24, 270, 7], [130, 340, 8], [40, 420, 6], [118, 480, 9]].forEach(([x, d, r]) => magma(set, x, at(d), r));

    // Manteau inférieur : plaque océanique plongeante, panache chaud, magma.
    for (let k = 0; k < 220; k++) {
      const x = Math.round(k * 0.28);
      for (let w = 0; w < 5; w++) set(x, at(540 + k) + w, hash(x, k, 53) < 0.5 ? '#3a1a14' : '#451f17');
    }
    for (let d = 560; d < 990; d++) {
      const cx = 140 + Math.round(Math.sin(d * 0.03) * 3);
      const half = 3 + Math.round(Math.sin(d * 0.011) * 1.5);
      for (let x = cx - half; x <= cx + half; x++) set(x, at(d), Math.abs(x - cx) < half - 1 ? '#b8532c' : '#9c4227');
    }
    [[30, 640, 8], [112, 760, 10], [50, 880, 7]].forEach(([x, d, r]) => magma(set, x, at(d), r));

    // Noyau : quelques étincelles de fer en fusion.
    for (let i = 0; i < 10; i++) twinkles.push({ x: sideX(i, 60), y: at(1010 + Math.floor(hash(i, 61, 62) * 380)), color: '#fff6cc' });
  }

  function magma(set, cx, cy, r) {
    ellipse(cx, cy, r, Math.ceil(r / 2), (x, y, d) => set(x, y, d > 0.75 ? '#c4481f' : d > 0.4 ? '#e8742a' : '#ffd25a'), 0.3);
    bubbles.push({ x: cx, y: cy, r });
  }

  // Abscisse au hasard de part et d'autre du puits.
  function sideX(i, s) {
    const left = hash(i, s, 21) < 0.5;
    const span = SHAFT_X - 14;
    return left ? 4 + Math.floor(hash(i, s, 22) * span) : SHAFT_X + SHAFT_W + 6 + Math.floor(hash(i, s, 22) * span);
  }

  // Foreuse : carrosserie + mèche animée (3 images).
  const DRILL_PALETTE = {
    k: '#1b1b1f', y: '#f2c230', d: '#c8941c', g: '#8a8a8a', b: '#5ec8f0', w: '#e8f8ff', o: '#ff6a3d', s: '#a9b0b8', S: '#5d646d',
  };
  const DRILL_BODY = [
    '.....kk.........',
    '.....kgk........',
    '..kkkkkkkkkkkk..',
    '.kyyyyyyyyyyyyk.',
    '.kyykkkkkyyyyyk.',
    '.kyykbbbkyyyoyk.',
    '.kyykbwbkyyyyyk.',
    '.kyykkkkkyyyyyk.',
    '.kyyyyyyyyyyyyk.',
    '.kddddddddddddk.',
    '.kdkdkdkdkdkddk.',
    '..kkkkkkkkkkkk..',
    '...kssssssssk...',
    '...kkkkkkkkkk...',
  ];
  const DRILL_BITS = [
    ['....kSssSssk....', '....ksSssSsk....', '.....kSssSk.....', '.....ksSssk.....', '......kSsk......', '......ksSk......', '.......kk.......'],
    ['....ksSssSsk....', '....kssSssSk....', '.....ksSssk.....', '.....kssSsk.....', '......ksSk......', '......kSsk......', '.......kk.......'],
    ['....kssSssSk....', '....kSssSssk....', '.....kssSsk.....', '.....kSssSk.....', '......kSsk......', '......kssk......', '.......kk.......'],
  ];

  const BIT_PALETTE = { c: '#9fe8ff', r: '#b07a43' };

  // Forets : 3 images d'animation chacun.
  function auger(frame) {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      const half = Math.max(1, 5 - Math.floor(r / 2));
      const flight = (r + frame) % 2 === 0;
      const w = flight ? half + 1 : 1;
      rows.push(`${'.'.repeat(8 - w - 1)}k${(flight ? 'S' : 's').repeat(w * 2)}k${'.'.repeat(8 - w - 1)}`);
    }
    rows.push('.......kk.......');
    return rows;
  }
  const BITS = {
    standard: DRILL_BITS,
    tariere: [auger(0), auger(1), auger(2)],
    tricone: [0, 1, 2].map((f) => {
      const t = (i) => ((i + f) % 3 === 0 ? 'S' : 's');
      return [
        '...kssssssssk...',
        `..k${t(0)}${t(1)}${t(2)}${t(0)}${t(1)}${t(2)}${t(0)}${t(1)}${t(2)}${t(0)}k..`,
        `..k${t(1)}${t(2)}k${t(0)}${t(1)}${t(2)}${t(0)}k${t(1)}${t(2)}k..`,
        `..k${t(2)}k.k${t(0)}${t(1)}k.k${t(2)}k..`,
        '...k...kk...k...',
      ];
    }),
    diamant: [0, 1, 2].map((f) => {
      const w = (i) => (i === f ? 'w' : 'c');
      return ['....kssssssk....', `....kc${w(0)}cccck....`, `.....kcc${w(1)}ck.....`, `.....kc${w(2)}cck.....`, '......kcck......', `......k${w(0)}ck......`, '.......kk.......'];
    }),
    carotteuse: [0, 1, 2].map((f) => {
      const t = (i) => ((i + f) % 2 === 0 ? 'S' : 's');
      return ['....kssssssk....', `....k${t(0)}k..k${t(1)}k....`, `....k${t(1)}k..k${t(0)}k....`, `....k${t(0)}krrk${t(1)}k....`, `....k${t(1)}krrk${t(0)}k....`, `....k${t(0)}k..k${t(1)}k....`, `....k.k..k.k....`];
    }),
  };

  // Carrosseries : palette, forme propre (citrouille, spectre) et accessoires posés par-dessus.
  const PUMPKIN = [
    '..h....nn....h..',
    '..hh..nn....hh..',
    '...kkkkkkkkkk...',
    '..kyydyyyydyyk..',
    '.kyyydyyyydyyyk.',
    '.kyyeyyyyyyeyyk.',
    '.kyeeeyyyyeeeyk.',
    '.kyyyyyeeyyyyyk.',
    '.kyeyyyyyyyyeyk.',
    '.kyyeeeeeeeeyyk.',
    '.kyyyeyyeyyeyyk.',
    '..kkkkkkkkkkkk..',
    '...kssssssssk...',
    '...kkkkkkkkkk...',
  ];
  const GHOST = [
    '................',
    '.....kkkkkk.....',
    '...kkyyyyyykk...',
    '..kyyyyyyyyyyk..',
    '.kyyyyyyyyyyyyk.',
    '.kyykkyyyykkyyk.',
    '.kyykkyyyykkyyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyykkyyyyyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyyyyyyyyyk.',
    '.kykykykykykykk.',
    '...kssssssssk...',
    '...kkkkkkkkkk...',
  ];
  // Bandes noire, jaune et rouge, en épargnant le hublot.
  // Drapeau arc-en-ciel : six bandes horizontales.
  const PRIDE = ['r', 'o', 'j', 'v', 'b', 'p'].map((c) => c.repeat(12));
  const TRICOLORE = [];
  for (let r = 3; r <= 8; r++) {
    let row = '';
    for (let c = 2; c <= 13; c++) {
      const hublot = r >= 4 && r <= 7 && c >= 4 && c <= 8;
      row += hublot ? '.' : c <= 5 ? 'n' : c <= 9 ? 'j' : 'r';
    }
    TRICOLORE.push(row);
  }
  // Reflets en damier sur la carrosserie, en épargnant le hublot et le voyant.
  const GOLD_PLATING = [];
  for (let r = 0; r < 7; r++) {
    let row = '';
    for (let c = 0; c < 12; c++) {
      const hublot = r >= 1 && r <= 4 && c >= 2 && c <= 7;
      const voyant = r === 2 && c === 10;
      row += !hublot && !voyant && (r + c) % 2 === 0 ? 'h' : '.';
    }
    GOLD_PLATING.push(row);
  }
  const SKINS = {
    classique: {},
    acier: { pal: { y: '#9aaabb', d: '#5d6f82' } },
    cuivre: { pal: { y: '#d0803e', d: '#8a4a22' } },
    emeraude: { pal: { y: '#3fbf7f', d: '#23784f' } },
    obsidienne: { pal: { y: '#3a2f57', d: '#1f1830', b: '#b28cff', w: '#efe2ff', o: '#b28cff' } },
    // Or massif : plus clair et plus brillant que la peinture de chantier jaune, avec un reflet quadrillé.
    or: {
      pal: { y: '#ffe36e', d: '#a8741a', h: '#fffbd0' },
      overlay: { dx: 2, dy: 3, rows: GOLD_PLATING, pal: { h: '#fff3a8' } },
      sparkle: '#ffffff',
    },
    diamant: { pal: { y: '#c8f2ff', d: '#79c5e3' }, sparkle: '#ffffff' },
    cordee: { pal: { y: '#d9342b', d: '#8f1f19' } },
    expedition: { pal: { y: '#2f5fd0', d: '#1d3b85', o: '#f2c230' } },
    legende: { pal: { y: '#7b3fbf', d: '#f2c230' }, sparkle: '#f2c230' },
    'feu-artifice': { pal: { y: '#f2c230', d: '#7b3fbf' }, fireworks: true },
    cupidon: { pal: { y: '#f28bb3', d: '#c2577f' }, overlay: { dx: 10, dy: 7, rows: ['h.h', 'hhh', '.h.'], pal: { h: '#e0245e' } } },
    globe: {
      pal: { y: '#2f7fd0', d: '#1d5a99' },
      overlay: { dx: 1, dy: 3, rows: ['.gg......gg..', '.g........gg.', '..........g..', '.........g...', '..g.....gg...', '.ggg.......g.'], pal: { g: '#4caf50' } },
    },
    oeuf: { pal: { y: '#f6e7a8', d: '#9fd3e8' }, overlay: { dx: 1, dy: 3, rows: ['.z.z.z.z.z.z.', 'z.z.z.z.z.z.z'], pal: { z: '#e88bb3' } } },
    fierte: { overlay: { dx: 2, dy: 3, rows: PRIDE, pal: { r: '#e40303', o: '#ff8c00', j: '#ffed00', v: '#008026', b: '#24408e', p: '#732982' } } },
    tricolore: { overlay: { dx: 2, dy: 3, rows: TRICOLORE, pal: { n: '#1b1b1f', j: '#f6d32d', r: '#e22b2b' } } },
    taupe: { pal: { y: '#5a4e4e', d: '#3b3333' }, overlay: { dx: 11, dy: 4, rows: ['k...', '....', '..pp', '..pp'], pal: { k: '#000000', p: '#f0a3a3' } } },
    citrouille: { rows: PUMPKIN, pal: { y: '#f07a1a', d: '#c25410', e: '#ffe14d', n: '#4c7a34', h: '#b3121b', k: '#2a1206' } },
    spectre: { rows: GHOST, pal: { y: '#e8eef5', k: '#3b4252' }, alpha: 0.85 },
    casque: {
      pal: { y: '#3b5ea8', d: '#26407a' },
      overlay: { dx: 2, dy: -3, rows: ['...hhhhhh...', '..hhhhhhhh..', '..hhhwwhhh..', 'kkkkkkkkkkkk'], pal: { h: '#f2c230', w: '#fff6b0', k: '#1b1b1f' } },
    },
    mitre: { pal: { y: '#b3121b', d: '#f2c230' }, overlay: { dx: 4, dy: -4, rows: ['...gg...', '..rggr..', '.rrggrr.', '.rrggrr.', 'gggggggg'], pal: { r: '#b3121b', g: '#f2c230' } } },
    noel: {
      pal: { y: '#c8102e', d: '#f4f4f4' },
      overlay: { dx: 2, dy: -3, rows: ['......e.....', '.....eee....', '......e.....', '............', '............', 'wwwwwwwwwwww', 'w..w...w..w.'], pal: { e: '#ffd84a', w: '#ffffff' } },
    },
    // Duels : le gladiateur (crête de bronze), le rempart (acier à blason) et la némésis (noire aux yeux rouges).
    gladiateur: {
      pal: { y: '#b0702c', d: '#6e3f12' },
      overlay: { dx: 2, dy: -3, rows: ['....rrrr....', '...rrrrrr...', '..rrrrrrrr..', 'hhhhhhhhhhhh'], pal: { r: '#c0261d', h: '#8a8f98' } },
    },
    rempart: {
      pal: { y: '#8aa0b8', d: '#4a5f78' },
      overlay: { dx: 4, dy: 3, rows: ['hhhhhh', 'hrrrrh', 'hrwwrh', '.hrrh.', '..hh..'], pal: { h: '#3b4252', r: '#c0261d', w: '#ffffff' } },
    },
    // Victoires écrasantes : le bélier (cornes), le blindé (camouflage et rivets), la pierre (briques),
    // la muraille de Troie (créneaux, sable) et les jumeaux (deux losanges en miroir).
    belier: {
      pal: { y: '#7a5a3a', d: '#4d3822' },
      overlay: { dx: 1, dy: -3, rows: ['.ee......ee.', 'e..e....e..e', 'e..e....e..e', '.ee......ee.'], pal: { e: '#f2e6c8' } },
    },
    tank: {
      pal: { y: '#4b5d3a', d: '#2e3a22' },
      overlay: { dx: 2, dy: 3, rows: ['gg..tt..gg.t', '..tt..gg..gg', 'tt..gg..tt..', 's.s.s.s.s.s.'], pal: { g: '#2e3a22', t: '#7a8a4a', s: '#c9ccd3' } },
    },
    pierre: {
      pal: { y: '#8b8b86', d: '#5c5c58' },
      overlay: { dx: 1, dy: 3, rows: ['.m.....m.....', 'mmmmmmmmmmmmm', '...m.....m...', 'mmmmmmmmmmmmm'], pal: { m: '#4a4a46' } },
    },
    'muraille-de-troie': {
      pal: { y: '#b89968', d: '#7a6238' },
      overlay: { dx: 1, dy: -3, rows: ['gg.gg.gg.gg.gg', 'gg.gg.gg.gg.gg', 'gggggggggggggg'], pal: { g: '#9c7f4e' } },
    },
    jumeaux: {
      pal: { y: '#cfd8e3', d: '#8aa0b8' },
      overlay: { dx: 3, dy: 3, rows: ['.cc....cc.', 'cccc..cccc', '.cc....cc.'], pal: { c: '#5ee0ff' } },
    },
    nemesis: {
      pal: { y: '#1a1a20', d: '#0c0c10', k: '#000000' },
      overlay: { dx: 9, dy: 4, rows: ['ee.ee', 'ee.ee'], pal: { e: '#ff2a2a' } },
    },
    // Réactions : la foreuse « Ovation » (confettis) et la foreuse « Claque » (pompons de supporter).
    ovation: {
      pal: { y: '#ff9ad0', d: '#b0306e' },
      overlay: { dx: 2, dy: 3, rows: ['a..b..c..a.b', '.c..a..b.c..', 'b..c..a..b.c'], pal: { a: '#5ee0ff', b: '#ffd84a', c: '#ffffff' } },
      sparkle: '#ffffff',
    },
    claque: {
      pal: { y: '#2f7fd0', d: '#e2553f' },
      overlay: { dx: 2, dy: -3, rows: ['.rr......rr.', 'rrrr....rrrr', '.rr......rr.'], pal: { r: '#ffd84a' } },
    },
    'chat-noir': {
      pal: { y: '#25252b', d: '#18181c', k: '#000000' },
      overlay: { dx: 1, dy: 0, rows: ['.k.........k..', '.kk.......kk..', '..............', '..............', '..............', '.........e.e..'], pal: { k: '#000000', e: '#ffd84a' } },
    },
  };

  /**
   * Dessine la foreuse (carrosserie + foret) dont la pointe est en (x0 + 8, tip).
   * Renvoie l'ordonnée du haut de la carrosserie (pour accrocher le câble).
   */
  function drawDrill(ctx, skin, x0, tip, time, drilling) {
    const body = SKINS[skin && skin.body] || SKINS.classique;
    const frames = BITS[skin && skin.bit] || BITS.standard;
    const bit = drilling ? frames[Math.floor(time * 14) % 3] : frames[0];
    const rows = body.rows || DRILL_BODY;
    const bodyTop = tip - bit.length - rows.length;
    const palette = { ...DRILL_PALETTE, ...BIT_PALETTE, ...body.pal };
    ctx.save();
    if (body.alpha) ctx.globalAlpha = body.alpha;
    drawPattern(ctx, rows, x0, bodyTop, palette);
    if (body.overlay) drawPattern(ctx, body.overlay.rows, x0 + body.overlay.dx, bodyTop + body.overlay.dy, body.overlay.pal);
    ctx.restore();
    drawPattern(ctx, bit, x0, tip - bit.length, palette);
    if (!body.rows && Math.floor(time * 3) % 2 === 0) {
      ctx.fillStyle = '#ffd36b';
      ctx.fillRect(x0 + 12, bodyTop + 5, 1, 1);
    }
    if (body.sparkle) {
      const k = Math.floor(time * 4);
      if (hash(k, 1, 80) > 0.5) {
        ctx.fillStyle = body.sparkle;
        ctx.fillRect(x0 + 2 + Math.floor(hash(k, 2, 81) * 12), bodyTop + 3 + Math.floor(hash(k, 3, 82) * 7), 1, 1);
      }
    }
    if (body.fireworks) {
      const colors = ['#ff5e5e', '#5ee0ff', '#ffe14d', '#b28cff', '#7fcf5a'];
      for (let i = 0; i < 6; i++) {
        const k = Math.floor(time * 5) + i * 7;
        if (hash(k, i, 83) < 0.45) continue;
        ctx.fillStyle = colors[(k + i) % colors.length];
        ctx.fillRect(x0 - 3 + Math.floor(hash(k, 4, 84) * 22), bodyTop - 4 + Math.floor(hash(k, 5, 85) * 12), 1, 1);
      }
    }
    return bodyTop;
  }

  const DIGITS = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'],
  };

  function drawPattern(ctx, rows, x0, y0, palette) {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch === '.') continue;
        ctx.fillStyle = palette[ch];
        ctx.fillRect(x0 + dx, y0 + dy, 1, 1);
      }
    });
  }

  function drawDigit(ctx, n, x, y, color) {
    const rows = DIGITS[n];
    ctx.fillStyle = '#000';
    rows.forEach((r, dy) => [...r].forEach((b, dx) => b === '1' && ctx.fillRect(x + dx + 1, y + dy + 1, 1, 1)));
    ctx.fillStyle = color;
    rows.forEach((r, dy) => [...r].forEach((b, dx) => b === '1' && ctx.fillRect(x + dx, y + dy, 1, 1)));
  }

  class DrillScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      canvas.width = W;
      canvas.height = H;
      this.h = H;
      this.world = buildWorld();
      this.layers = [];
      this.skin = { body: 'classique', bit: 'standard' };
      this.avatar = null;
      this.depth = 0;
      this.target = 0;
      this.speed = DRILL_SPEED;
      this.ovProgress = 0;
      this.ovFrom = 0;
      this.onOverview = null;
      this.camY = 0;
      this.particles = [];
      this.mode = 'follow';
      this.tourDir = 1;
      this.tourPause = 0;
      this.onDepth = null;
      // Appelés pendant la descente animée : début/fin du forage, passage d'une couche.
      this.onDrill = null;
      this.onZone = null;
      this.wasDrilling = false;
      this.zone = 0;
      this.last = performance.now();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    /** Reconstruit le décor (changement de saison). */
    rebuild() {
      this.world = buildWorld();
    }

    /** layers : [{ points, tier }] dans l'ordre des thèmes. */
    setLayers(layers, animate) {
      this.layers = layers.slice();
      this.target = Math.min(MAX_POINTS, layers.reduce((s, l) => s + (l.points || 0), 0));
      this.mode = 'follow';
      if (this.onOverview) this.onOverview(0);
      const distance = this.target - this.depth;
      this.speed = distance > 0
        ? distance / Math.min(DRILL_TIME_MAX, DRILL_TIME_MIN + DRILL_TIME_PER_POINT * distance)
        : DRILL_SPEED;
      if (!animate) {
        this.depth = this.target;
        this.camY = this.cameraTarget();
        this.zone = zoneIndex(this.depth);
      }
      this.emitDepth();
    }

    setSkin(skin) {
      this.skin = { body: 'classique', bit: 'standard', ...skin };
    }

    /** Avatar du joueur : au hublot de la foreuse, ou debout à la surface (selon son choix). */
    setAvatar(avatar) {
      this.avatar = avatar || null;
    }

    drawAvatarSurface(ctx, time) {
      const av = this.avatar;
      if (!av || av.lieu !== 'surface' || !global.Avatar) return;
      const bob = Math.round(Math.sin(time * 2) * 0.5);
      ctx.drawImage(global.Avatar.sprite(av), 0, 0, 16, 28, 34, SKY - 28 + bob, 16, 28);
    }

    drawAvatarHublot(ctx, x0, bodyTop) {
      const av = this.avatar;
      if (!av || av.lieu !== 'hublot' || !global.Avatar) return;
      // Hublot rond (8 x 7 pixels) sur la carrosserie, avec le visage du joueur.
      ctx.fillStyle = '#1b1b1f';
      ctx.fillRect(x0 + 4, bodyTop + 3, 8, 7);
      ctx.fillStyle = '#5ec8f0';
      ctx.fillRect(x0 + 5, bodyTop + 4, 6, 5);
      ctx.drawImage(global.Avatar.sprite(av), 5, global.Avatar.OY + 1, 6, 5, x0 + 5, bodyTop + 4, 6, 5);
      ctx.fillStyle = '#1b1b1f';
      ctx.fillRect(x0 + 4, bodyTop + 3, 1, 1);
      ctx.fillRect(x0 + 11, bodyTop + 3, 1, 1);
      ctx.fillRect(x0 + 4, bodyTop + 9, 1, 1);
      ctx.fillRect(x0 + 11, bodyTop + 9, 1, 1);
    }

    /** Hauteur visible (en pixels du jeu) : réduite sur petit écran pour garder de gros pixels. */
    setViewHeight(h) {
      const next = Math.max(100, Math.min(H, Math.round(h)));
      if (next === this.h) return;
      this.h = next;
      this.canvas.height = next;
      this.camY = this.cameraTarget();
    }

    /** Dézoome jusqu'à voir toute la Terre : distance restante entre la foreuse et le centre. */
    overview() {
      this.mode = 'overview';
      this.ovProgress = 0;
      this.ovFrom = this.camY;
      if (this.onOverview) this.onOverview(0);
    }

    tour() {
      if (this.onOverview) this.onOverview(0);
      this.mode = 'tour';
      this.tourDir = 1;
      this.tourPause = 1.2;
      this.camY = 0;
    }

    get drilling() {
      return this.depth < this.target - 0.01;
    }

    tipY() {
      return SKY + this.depth * PPP;
    }

    cameraTarget() {
      return Math.max(0, Math.min(WORLD_H - this.h, this.tipY() - this.h * 0.6));
    }

    emitDepth() {
      if (this.onDepth) this.onDepth(this.depth);
    }

    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw(t / 1000);
      requestAnimationFrame(this.frame);
    }

    update(dt) {
      if (this.drilling) {
        this.depth = Math.min(this.target, this.depth + this.speed * dt);
        this.emitDepth();
        const colors = ZONES[zoneIndex(this.depth)].colors;
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            x: W / 2 + (Math.random() * 10 - 5),
            y: this.tipY(),
            vx: (Math.random() - 0.5) * 70,
            vy: -30 - Math.random() * 50,
            life: 0.4 + Math.random() * 0.5,
            color: colors[Math.floor(Math.random() * colors.length)],
          });
        }
        const zone = zoneIndex(this.depth);
        if (zone !== this.zone && this.onZone) this.onZone(zone);
        this.zone = zone;
      } else if (this.depth > this.target) {
        this.depth = this.target;
        this.zone = zoneIndex(this.depth);
        this.emitDepth();
      }
      if (this.drilling !== this.wasDrilling) {
        this.wasDrilling = this.drilling;
        if (this.onDrill) this.onDrill(this.wasDrilling, this.zone);
      }
      this.particles = this.particles.filter((p) => {
        p.life -= dt;
        p.vy += 160 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        return p.life > 0;
      });

      if (this.mode === 'overview') {
        const before = this.ovProgress;
        this.ovProgress = Math.min(1, this.ovProgress + dt / 2.2);
        if (this.onOverview && (this.ovProgress >= 1) !== (before >= 1)) this.onOverview(1);
      } else if (this.mode === 'tour') {
        const bottom = Math.max(0, Math.min(WORLD_H - this.h, this.tipY() + 30 - this.h));
        if (this.tourPause > 0) this.tourPause -= dt;
        else {
          this.camY += this.tourDir * 70 * dt;
          if (this.camY >= bottom) {
            this.camY = bottom;
            this.tourDir = -1;
            this.tourPause = 2;
          } else if (this.camY <= 0) {
            this.camY = 0;
            this.tourDir = 1;
            this.tourPause = 2;
          }
        }
      } else {
        this.camY += (this.cameraTarget() - this.camY) * Math.min(1, dt * 6);
      }
    }

    /** Vue d'ensemble : toute la hauteur du monde tient dans l'écran, avec la distance jusqu'au centre. */
    drawOverview(time) {
      const ctx = this.ctx;
      const t = this.ovProgress;
      const p = t * t * (3 - 2 * t);
      const srcH = this.h + (WORLD_H - this.h) * p;
      const srcY = this.ovFrom * (1 - p);
      const sy = this.h / srcH;
      const Y = (y) => (y - srcY) * sy;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.world, 0, srcY, W, srcH, 0, 0, W, this.h);

      const tip = this.tipY();
      for (let zi = 0; zi < ZONES.length; zi++) {
        const top = SKY + ZONES[zi].from * PPP;
        const bottom = zi + 1 < ZONES.length ? SKY + ZONES[zi + 1].from * PPP : WORLD_H;
        const y0 = Math.max(top, SKY + 1);
        const y1 = Math.min(bottom, tip);
        if (y1 <= y0) continue;
        ctx.fillStyle = ZONES[zi].dark;
        ctx.fillRect(SHAFT_X, Math.round(Y(y0)), SHAFT_W, Math.max(1, Math.round(Y(y1)) - Math.round(Y(y0))));
      }
      // Fin de chaque thème : un trait de la couleur de la rareté.
      let cumulative = 0;
      this.layers.forEach((layer) => {
        cumulative += layer.points || 0;
        if (cumulative > this.depth + 0.01) return;
        ctx.fillStyle = TIER_COLORS[layer.tier] || '#888';
        ctx.fillRect(SHAFT_X - 7, Math.round(Y(SKY + Math.min(cumulative, MAX_POINTS) * PPP)) - 1, 6, 2);
      });

      const yTip = Math.round(Y(tip));
      const yCore = Math.round(Y(SKY + MAX_POINTS * PPP + 6));
      if (sy > 0.45) drawDrill(ctx, this.skin, W / 2 - 8, yTip, time, false);
      const show = Math.max(0, Math.min(1, (p - 0.55) / 0.45));
      if (show > 0) {
        ctx.save();
        ctx.globalAlpha = show;
        // Foreuse : losange repère.
        ctx.fillStyle = '#000';
        ctx.fillRect(W / 2 - 4, yTip - 4, 9, 9);
        ctx.fillStyle = '#ff7a1a';
        ctx.fillRect(W / 2 - 3, yTip - 3, 7, 7);
        ctx.fillStyle = '#fff1a8';
        ctx.fillRect(W / 2 - 1, yTip - 1, 3, 3);
        if (this.depth < MAX_POINTS - 0.01) {
          // Distance restante : trait pointillé jusqu'au centre de la Terre et accolade.
          const offset = Math.floor(time * 6) % 4;
          ctx.fillStyle = '#ffd84d';
          for (let y = yTip + 6 + offset; y < yCore - 5; y += 4) ctx.fillRect(W / 2, y, 1, 2);
          const bx = W / 2 + 16;
          ctx.fillRect(bx, yTip, 1, yCore - yTip);
          ctx.fillRect(bx - 3, yTip, 4, 1);
          ctx.fillRect(bx - 3, yCore, 4, 1);
          ctx.fillRect(W / 2 - 2, yCore - 6, 5, 1);
          ctx.fillRect(W / 2 - 1, yCore - 7, 3, 1);
        }
        // Centre de la Terre : étoile qui scintille.
        const r = 3 + Math.round(Math.sin(time * 4));
        ctx.fillStyle = '#fff1a8';
        ctx.fillRect(W / 2 - r, yCore, 2 * r + 1, 1);
        ctx.fillRect(W / 2, yCore - r, 1, 2 * r + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(W / 2 - 1, yCore - 1, 3, 3);
        ctx.restore();
      }
    }

    /** Halloween : des fantômes translucides survolent l'écran pendant que la foreuse creuse. */
    drawGhosts(ctx, time) {
      if (season !== 'halloween' || !this.drilling) return;
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) {
        const dir = i % 2 ? -1 : 1;
        const span = W + 24;
        const raw = (time * (7 + i * 2) + i * 53) % span;
        const x = Math.round(dir > 0 ? raw - 12 : span - raw - 12);
        const y = Math.round(10 + i * 24 + Math.sin(time * 1.6 + i * 2) * 5);
        drawPattern(ctx, HW_GHOST, x, y, { w: '#e8e0ff', k: '#241437' });
      }
      ctx.restore();
    }

    draw(time) {
      if (this.mode === 'overview') {
        this.drawOverview(time);
        return;
      }
      const ctx = this.ctx;
      const cam = Math.round(this.camY);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.world, 0, cam, W, this.h, 0, 0, W, this.h);
      ctx.save();
      ctx.translate(0, -cam);
      this.drawAvatarSurface(ctx, time);

      // Décor animé : scintillements et bulles de magma.
      const inView = (y) => y >= cam - 4 && y <= cam + this.h + 4;
      twinkles.forEach((tw, i) => {
        if (!inView(tw.y)) return;
        const on = tw.steady ? Math.sin(time * 9 + i) > -0.6 : hash(i, Math.floor(time * 3 + i * 0.37), 70) > 0.8;
        if (!on) return;
        ctx.fillStyle = tw.color;
        ctx.fillRect(tw.x, tw.y, 1, 1);
      });
      bubbles.forEach((b, i) => {
        if (!inView(b.y)) return;
        const span = Math.ceil(b.r / 2) * 2;
        for (let k = 0; k < 2; k++) {
          const phase = (time * 4 + i * 1.7 + k * span * 0.5) % span;
          ctx.fillStyle = '#fff1a8';
          ctx.fillRect(b.x - 2 + k * 4, Math.round(b.y + span / 2 - phase), 1, 1);
        }
      });

      // Puits creusé, coloré selon la roche traversée.
      const tip = Math.round(this.tipY());
      for (let zi = 0; zi < ZONES.length; zi++) {
        const top = SKY + ZONES[zi].from * PPP;
        const bottom = zi + 1 < ZONES.length ? SKY + ZONES[zi + 1].from * PPP : WORLD_H;
        const y0 = Math.max(top, SKY + 1);
        const y1 = Math.min(bottom, tip);
        if (y1 <= y0) continue;
        ctx.fillStyle = ZONES[zi].dark;
        ctx.fillRect(SHAFT_X, y0, SHAFT_W, y1 - y0);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(SHAFT_X, y0, 2, y1 - y0);
        ctx.fillRect(SHAFT_X + SHAFT_W - 2, y0, 2, y1 - y0);
      }

      // Repères de fin de chaque thème : planche, couleur de la rareté et numéro.
      let cumulative = 0;
      let previousY = -100;
      let stagger = 0;
      this.layers.forEach((layer, i) => {
        cumulative += layer.points || 0;
        if (cumulative > this.depth + 0.01) return;
        const y = SKY + Math.round(Math.min(cumulative, MAX_POINTS) * PPP);
        stagger = y - previousY < 7 ? stagger + 1 : 0;
        previousY = y;
        ctx.fillStyle = '#c99a5b';
        ctx.fillRect(SHAFT_X - 2, y - 1, SHAFT_W + 4, 2);
        ctx.fillStyle = '#7a5530';
        ctx.fillRect(SHAFT_X - 2, y + 1, SHAFT_W + 4, 1);
        const fx = SHAFT_X - 10 - stagger * 7;
        ctx.fillStyle = '#000';
        ctx.fillRect(fx - 1, y - 4, 7, 7);
        ctx.fillStyle = TIER_COLORS[layer.tier] || '#888';
        ctx.fillRect(fx, y - 3, 5, 5);
        if (colorblind && TIER_GLYPHS[layer.tier]) drawPattern(ctx, TIER_GLYPHS[layer.tier], fx, y - 3, { '#': '#000' });
        drawDigit(ctx, i + 1, SHAFT_X + SHAFT_W + 4 + stagger * 5, y - 3, '#fff');
      });

      // Câble depuis la poulie du chevalement, puis la foreuse.
      const shake = this.drilling ? Math.round(Math.sin(time * 60)) : 0;
      const x0 = W / 2 - 8 + shake;
      const frames = BITS[this.skin.bit] || BITS.standard;
      const rows = (SKINS[this.skin.body] || {}).rows || DRILL_BODY;
      const bodyTop = tip - frames[0].length - rows.length;
      ctx.fillStyle = '#26262c';
      ctx.fillRect(W / 2, SKY - 38, 1, Math.max(0, bodyTop - (SKY - 38)));
      drawDrill(ctx, this.skin, x0, tip, time, this.drilling);
      this.drawAvatarHublot(ctx, x0, bodyTop);

      for (const p of this.particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }

      // Centre de la Terre atteint : halo scintillant.
      if (this.depth >= MAX_POINTS - 0.01) {
        const cy = SKY + MAX_POINTS * PPP + 6;
        for (let i = 0; i < 12; i++) {
          const a = time * 2 + (i / 12) * Math.PI * 2;
          ctx.fillStyle = i % 2 ? '#ffffff' : '#fff1a8';
          ctx.fillRect(Math.round(W / 2 + Math.cos(a) * 14), Math.round(cy + Math.sin(a) * 6), 1, 1);
        }
      }
      ctx.restore();
      this.drawGhosts(ctx, time);

      // Ambiance chaude dans les profondeurs.
      const heat = Math.max(0, Math.min(1, (this.depth - 220) / 380));
      if (heat > 0) {
        ctx.fillStyle = `rgba(255, 90, 20, ${0.08 * heat + Math.sin(time * 3) * 0.02 * heat})`;
        ctx.fillRect(0, 0, W, this.h);
      }
    }
  }

  global.Pixel = {
    DrillScene, ZONES, MAX_POINTS, depthKm, formatDepth, formatRemaining, zoneName, zoneIndex, TIER_COLORS, TIER_SYMBOLS, setColorblind, setSeason, drawDrill, WIDTH: W, HEIGHT: H,
  };
})(window);
