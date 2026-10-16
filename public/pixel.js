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
  const MAX_POINTS = 700;
  const WORLD_H = SKY + MAX_POINTS * PPP + 28;
  const SHAFT_W = 18;
  const SHAFT_X = Math.floor(W / 2 - SHAFT_W / 2);
  const DRILL_SPEED = 55; // points par seconde

  // Couches traversées (en points de score). Le nom est affiché pendant la descente.
  const ZONES = [
    { from: 0, name: 'Terre végétale', dark: '#24160c', colors: ['#4a2f1a', '#5a3a20', '#6b4627', '#3b2414'] },
    { from: 6, name: 'Limon et argile', dark: '#3d2814', colors: ['#b07a43', '#a06d3a', '#c28d53', '#8e5f31'] },
    { from: 24, name: 'Calcaire (pierre bleue)', dark: '#262c33', colors: ['#6f7d8b', '#7b8997', '#64717e', '#8995a1'] },
    { from: 44, name: 'Veine de houille', dark: '#08080a', colors: ['#17171b', '#202026', '#2a2a31', '#111114'] },
    { from: 58, name: 'Croûte granitique', dark: '#2e2624', colors: ['#a8968f', '#c5a89c', '#7d716c', '#e0d4c8'] },
    { from: 110, name: 'Manteau supérieur', dark: '#1d220d', colors: ['#56632a', '#647233', '#4a5623', '#76863d'] },
    { from: 260, name: 'Manteau inférieur', dark: '#2a0d07', colors: ['#6e2818', '#7d301c', '#5e2013', '#8f3a22'] },
    { from: 500, name: 'Noyau externe', dark: '#5a2306', colors: ['#d06d1f', '#e88a2a', '#f7b23b', '#b5561a'] },
    { from: 650, name: 'Noyau interne', dark: '#8a5d12', colors: ['#f9e27a', '#fbeaa0', '#f3d25a', '#fff6cc'] },
  ];

  // Correspondance score → profondeur réelle (km), interpolée linéairement.
  const DEPTH_TABLE = [
    [0, 0], [6, 0.0005], [24, 0.02], [44, 0.4], [58, 1.2], [110, 35], [260, 660], [500, 2890], [650, 5150], [700, 6371],
  ];

  const TIER_COLORS = {
    invalid: '#4a4a4a', timeout: '#4a4a4a', skip: '#4a4a4a',
    evident: '#8b5a2b', courant: '#e8c547', original: '#f08a24', rare: '#d9342b', tres_rare: '#9b4dca', pepite: '#5ee0ff',
  };

  function depthKm(points) {
    const p = Math.max(0, Math.min(MAX_POINTS, points));
    for (let i = 1; i < DEPTH_TABLE.length; i++) {
      const [p1, k1] = DEPTH_TABLE[i];
      const [p0, k0] = DEPTH_TABLE[i - 1];
      if (p <= p1) return k0 + ((p - p0) / (p1 - p0)) * (k1 - k0);
    }
    return 6371;
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

  function skyColor(x, y) {
    const bands = ['#4f9fd3', '#5eaedb', '#70bde2', '#86cbe8', '#a0d8ee', '#bfe6f3'];
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

  function stamp(set, pattern, x0, y0, colors) {
    pattern.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch !== '.') set(x0 + dx, y0 + dy, colors[ch] || colors['#']);
      });
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
      set(x, SKY - 1, '#5fa83a');
      set(x, SKY, '#4b8c2c');
      if (hash(x, 1, 9) > 0.65) set(x, SKY - 2, '#6dbb45');
    }

    // Fossiles, os, pépites d'or et diamants, à l'écart du puits.
    const sideX = (i, s) => {
      const left = hash(i, s, 21) < 0.5;
      const span = SHAFT_X - 14;
      return left ? 4 + Math.floor(hash(i, s, 22) * span) : SHAFT_X + SHAFT_W + 6 + Math.floor(hash(i, s, 22) * span);
    };
    for (let i = 0; i < 5; i++) {
      stamp(set, AMMONITE, sideX(i, 1), SKY + 26 * PPP + Math.floor(hash(i, 2, 23) * 14 * PPP), { '#': '#d9d2c3' });
    }
    stamp(set, BONE, sideX(1, 5), SKY + 14 * PPP, { '#': '#ece4cf' });
    for (let i = 0; i < 6; i++) {
      const gx = sideX(i, 7);
      const gy = SKY + 65 * PPP + Math.floor(hash(i, 8, 24) * 40 * PPP);
      set(gx, gy, '#f5c542');
      set(gx + 1, gy, '#ffe48a');
      set(gx, gy + 1, '#c99a26');
    }
    for (let i = 0; i < 7; i++) {
      stamp(set, DIAMOND, sideX(i, 9), SKY + 150 * PPP + Math.floor(hash(i, 10, 25) * 70 * PPP), { c: '#9fe8ff', w: '#ffffff' });
    }

    ctx.putImageData(img, 0, 0);
    return canvas;
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
      this.depth = 0;
      this.target = 0;
      this.camY = 0;
      this.particles = [];
      this.mode = 'follow';
      this.tourDir = 1;
      this.tourPause = 0;
      this.onDepth = null;
      this.last = performance.now();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    /** layers : [{ points, tier }] dans l'ordre des thèmes. */
    setLayers(layers, animate) {
      this.layers = layers.slice();
      this.target = Math.min(MAX_POINTS, layers.reduce((s, l) => s + (l.points || 0), 0));
      this.mode = 'follow';
      if (!animate) {
        this.depth = this.target;
        this.camY = this.cameraTarget();
      }
      this.emitDepth();
    }

    /** Hauteur visible (en pixels du jeu) : réduite sur petit écran pour garder de gros pixels. */
    setViewHeight(h) {
      const next = Math.max(100, Math.min(H, Math.round(h)));
      if (next === this.h) return;
      this.h = next;
      this.canvas.height = next;
      this.camY = this.cameraTarget();
    }

    tour() {
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
        this.depth = Math.min(this.target, this.depth + DRILL_SPEED * dt);
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
      } else if (this.depth > this.target) {
        this.depth = this.target;
        this.emitDepth();
      }
      this.particles = this.particles.filter((p) => {
        p.life -= dt;
        p.vy += 160 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        return p.life > 0;
      });

      if (this.mode === 'tour') {
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

    draw(time) {
      const ctx = this.ctx;
      const cam = Math.round(this.camY);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.world, 0, cam, W, this.h, 0, 0, W, this.h);
      ctx.save();
      ctx.translate(0, -cam);

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
        drawDigit(ctx, i + 1, SHAFT_X + SHAFT_W + 4 + stagger * 5, y - 3, '#fff');
      });

      // Câble depuis la poulie du chevalement.
      const bodyTop = tip - DRILL_BITS[0].length - DRILL_BODY.length;
      ctx.fillStyle = '#26262c';
      ctx.fillRect(W / 2, SKY - 38, 1, Math.max(0, bodyTop - (SKY - 38)));

      // Foreuse.
      const shake = this.drilling ? Math.round(Math.sin(time * 60)) : 0;
      const bit = this.drilling ? DRILL_BITS[Math.floor(time * 14) % 3] : DRILL_BITS[0];
      const x0 = W / 2 - 8 + shake;
      drawPattern(ctx, DRILL_BODY, x0, bodyTop, DRILL_PALETTE);
      drawPattern(ctx, bit, x0, tip - bit.length, DRILL_PALETTE);
      if (Math.floor(time * 3) % 2 === 0) {
        ctx.fillStyle = '#ffd36b';
        ctx.fillRect(x0 + 12, bodyTop + 5, 1, 1);
      }

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

      // Ambiance chaude dans les profondeurs.
      const heat = Math.max(0, Math.min(1, (this.depth - 260) / 440));
      if (heat > 0) {
        ctx.fillStyle = `rgba(255, 90, 20, ${0.08 * heat + Math.sin(time * 3) * 0.02 * heat})`;
        ctx.fillRect(0, 0, W, this.h);
      }
    }
  }

  global.Pixel = { DrillScene, ZONES, MAX_POINTS, depthKm, formatDepth, zoneName, TIER_COLORS, WIDTH: W, HEIGHT: H };
})(window);
