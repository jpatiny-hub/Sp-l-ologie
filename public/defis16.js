'use strict';

/*
 * Défis en 16 bits (refonte), deux scènes de mine dans le style des grottes du jeu :
 *   Defis16.weekly(canvas, ch, avatar, t)       → « Ton filon » : le mineur du joueur marche sur un chemin en lacets, dans une caverne
 *                                                  de cristaux et de plantes lumineuses, jusqu'aux diamants. Sa place suit l'avancée du défi.
 *   Defis16.collective(canvas, data, colors, t) → « Galerie commune » : la foreuse à chenilles perce quatre galeries jusqu'au filon de
 *                                                  pierres précieuses du mois ; ce qu'elle a percé s'allume derrière elle.
 *   Defis16.finds(data)                         → découvertes de la galerie du mois, dans l'ordre où la foreuse les dégage
 *   Defis16.SIZE                                → taille des canevas [largeur, hauteur]
 * t = temps en secondes (0 = image fixe, état final). `ch.from` / `data.from` : avancée vue lors de la dernière visite (le mineur et la
 * foreuse y partent, puis avancent jusqu'à la place actuelle). Les couleurs du mois viennent du serveur (`data.gallery.colors`, voir src/gems.js).
 */
(function (global) {
  const W = 160;
  const H = 200;
  const SIZE = { weekly: [W, H], collective: [W, H] };
  const hash = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  function vnoise(x, y, s, cell) {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const r = (a, b) => hash(a * 127.1 + b * 311.7 + s * 74.7);
    const top = r(x0, y0) + (r(x0 + 1, y0) - r(x0, y0)) * sx;
    const bot = r(x0, y0 + 1) + (r(x0 + 1, y0 + 1) - r(x0, y0 + 1)) * sx;
    return top + (bot - top) * sy;
  }
  const fbm = (x, y, s) => vnoise(x, y, s, 16) * 0.55 + vnoise(x, y, s + 1, 6) * 0.3 + vnoise(x, y, s + 2, 2.5) * 0.15;
  const mk = (w = W, h = H) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const tone = (pal, v, x, y) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * (pal.length - 1) + bay(x, y))))];
  const cache = {};
  const once = (key, fn) => (cache[key] = cache[key] || fn());
  const px = (x, c, X, Y, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(Math.round(X), Math.round(Y), w, h); };
  function glow(x, cx, cy, r, color, a) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = a; x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); x.restore();
  }
  function setup(canvas) {
    canvas.width = W * 2; canvas.height = H * 2;
    const x = canvas.getContext('2d');
    x.setTransform(2, 0, 0, 2, 0, 0);
    x.imageSmoothingEnabled = false;
    return x;
  }

  // ---------- Palettes de pierres ----------
  const CY = ['#0e3a5a', '#1e86b0', '#5ee0ff', '#d8fbff'];
  const VI = ['#3a1a6a', '#7a32b0', '#c79bff', '#f3e0ff'];
  const TE = ['#0a4a3a', '#1fa07a', '#5effc0', '#d8ffee'];
  const AM = ['#6a3a06', '#c8801c', '#ffc24a', '#fff0b8'];
  const mix = (a, b, k) => { const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const [p, q] = [n(a), n(b)]; return `#${p.map((v, i) => Math.round(v + (q[i] - v) * k).toString(16).padStart(2, '0')).join('')}`; };
  const PALS = [CY, VI, TE, AM];
  const DIA = ['#3a78b0', '#6ab8e8', '#cdf4ff', '#ffffff'];

  /** Cristal : colonne à pointe, base en (cx, by), `flip` = 1 vers le haut, -1 vers le bas. */
  function crystal(x, cx, by, h, w, pal, flip = 1) {
    for (let r = 0; r < h; r++) {
      const cw = r >= h - 2 ? 1 : r >= h - 4 ? Math.max(1, w - 1) : w;
      const X = cx - Math.floor(cw / 2), Y = by - flip * r - (flip < 0 ? 0 : 0);
      px(x, pal[2], X, Y, cw, 1);
      if (cw > 1) { px(x, pal[3], X, Y, 1, 1); px(x, pal[1], X + cw - 1, Y, 1, 1); }
    }
    px(x, pal[3], cx, by - flip * (h - 1), 1, 1);
  }
  function cluster(x, cx, by, s, pal, flip = 1) {
    crystal(x, cx - 4 * s, by, 6 * s, 2 + (s > 1 ? 1 : 0), pal, flip);
    crystal(x, cx, by, 11 * s, 3, pal, flip);
    crystal(x, cx + 4 * s, by, 7 * s, 2 + (s > 1 ? 1 : 0), pal, flip);
    if (s > 1) crystal(x, cx + 8, by, 4 * s, 2, pal, flip);
  }
  function mushroom(x, cx, by, s, pair) {
    px(x, '#d8d0c0', cx, by - 3 * s, 1, 3 * s);
    px(x, pair[0], cx - 2 * s, by - 3 * s - s, 4 * s + 1, s + 1);
    px(x, pair[1], cx - s, by - 3 * s - s - 1, 2 * s + 1, 1);
    px(x, '#ffffff', cx - s, by - 3 * s - s, 1, 1);
  }
  function vine(x, vx, top, len, sway) {
    for (let i = 0; i < len; i++) px(x, i % 3 === 2 ? '#1f8a5a' : '#134a3a', vx + Math.round(Math.sin(i * 0.7 + sway) * 1.2), top + i, 1, 1);
    const ex = vx + Math.round(Math.sin(len * 0.7 + sway) * 1.2);
    px(x, '#7dffb0', ex - 1, top + len, 3, 2);
    px(x, '#d8ffe8', ex, top + len, 1, 1);
  }
  function glowFern(x, cx, by, s, pal) {
    for (let i = -3; i <= 3; i++) {
      const h = 5 * s - Math.abs(i) * s;
      for (let r = 0; r < h; r++) px(x, r === h - 1 ? pal[3] : pal[1], cx + i * s + Math.round(i * r * 0.25), by - r - (Math.abs(i) > 1 ? 0 : 3), 1, 1);
    }
    px(x, pal[2], cx, by, 1, 3);
  }
  function diamond(x, cx, cy, w, lit, t, seed = 0) {
    // Brillant vu de face : table plate, couronne qui s'élargit, culasse qui se resserre. cy = pointe basse.
    const hc = Math.round(w * 0.45), hp = Math.round(w * 0.7);
    const pal = lit ? DIA : ['#1a2430', '#2a3a4a', '#4a6074', '#6a8094'];
    for (let r = 0; r < hc + hp; r++) {
      const half = r < hc ? Math.round(w * (0.5 + 0.5 * (r / hc)) * 0.7) : Math.round(w * 0.7 * (1 - (r - hc) / hp) * 1);
      const y = cy - hc - hp + r;
      px(x, pal[1], cx - half, y, half * 2 + 1, 1);
      if (r < hc && (r % 3 === 1)) px(x, pal[3], cx - half + 1, y, half * 2 - 1, 1);
      px(x, pal[0], cx + half, y, 1, 1);
      px(x, pal[2], cx - half, y, Math.max(1, Math.round(half * 0.45)), 1);
      if (r >= hc) { px(x, pal[2], cx - Math.round(half * 0.2), y, Math.max(1, Math.round(half * 0.4)), 1); }
    }
    if (lit) {
      const a = 0.5 + 0.5 * Math.sin(t * 5 + seed * 2);
      if (a > 0.7) { px(x, '#ffffff', cx - Math.round(w * 0.3), cy - hc - hp + 1, 1, 3); px(x, '#ffffff', cx - Math.round(w * 0.3) - 1, cy - hc - hp + 2, 3, 1); }
    }
  }

  // ======================================================================
  // DÉFI DE LA SEMAINE : chemin en lacets dans une caverne, du puits jusqu'aux diamants
  // ======================================================================
  const AMBER = ['#120b06', '#1f140b', '#2e1e10', '#412b17', '#583b20', '#73502d'];
  const PATH = once('path', () => {
    const pts = [];
    for (let i = 0; i <= 600; i++) {
      const s = i / 600;
      pts.push([80 + 54 * Math.sin(s * Math.PI * 3 - Math.PI / 2) * (0.9 + 0.1 * Math.sin(s * 11)), 40 + s * 128]);
    }
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, len, total: len[len.length - 1] };
  });
  function along(f) {
    const L = Math.max(0, Math.min(1, f)) * PATH.total;
    let i = 1;
    while (i < PATH.len.length - 1 && PATH.len[i] < L) i++;
    const a = PATH.pts[i - 1], b = PATH.pts[i];
    const k = (L - PATH.len[i - 1]) / Math.max(1e-6, PATH.len[i] - PATH.len[i - 1]);
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: b[0] - a[0] };
  }
  // Décor de la caverne : position le long du chemin, nature, côté. Les éléments s'éclairent quand le mineur les atteint.
  const DECOR = once('decor', () => {
    const out = [];
    const kinds = ['cristal', 'fougere', 'champignon', 'cristal', 'fougere', 'geode'];
    for (let k = 0; k < 22; k++) {
      const q = (k + 0.5) / 22;
      const p = along(q);
      const side = k % 2 ? 1 : -1;
      out.push({ q, kind: kinds[k % kinds.length], x: p.x + side * (9 + (k % 3) * 3), y: p.y + 2 - (k % 3 === 0 ? 0 : 0), pal: PALS[k % 4], k });
    }
    return out;
  });
  const HANGING = [[14, 6, 12], [40, 5, 18], [66, 7, 9], [96, 6, 15], [122, 5, 11], [148, 7, 17]];
  const weekRock = () => once('wrock', () => {
    const c = mk(), x = c.getContext('2d');
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
      const strata = Math.sin((y + vnoise(i, y, 8, 22) * 14) / 6) * 0.1;
      px(x, tone(AMBER, Math.max(0, Math.min(1, fbm(i, y, 3) * 0.95 + strata - 0.05 + (y < 30 ? -0.25 + y / 120 : 0))), i, y), i, y);
    }
    for (let k = 0; k < 30; k++) {
      const gx = Math.floor(hash(k * 7 + 1) * W), gy = 24 + Math.floor(hash(k * 5 + 3) * 170);
      px(x, k % 3 ? '#b8700f' : '#5ee0ff', gx, gy); px(x, k % 3 ? '#ffd23f' : '#c8f8ff', gx, gy - 1);
    }
    for (let i = 0; i < W; i++) {
      const h = Math.floor(4 + hash(i * 3.3) * 6 + (i % 9 === 0 ? 8 : 0));
      for (let y = 0; y < h; y++) px(x, y < h - 2 ? '#0b0705' : '#2e1e10', i, y);
    }
    const sx = Math.round(PATH.pts[0][0]);
    for (let y = 0; y < 36; y++) { px(x, '#6a4422', sx - 4, y); px(x, '#6a4422', sx + 3, y); if (y % 4 === 0) px(x, '#9a6a3a', sx - 4, y, 8, 1); }
    return c;
  });
  function decorLayer(t) {
    const c = mk(), x = c.getContext('2d');
    HANGING.forEach(([vx, top, len], i) => vine(x, vx, top + 4, len, t * 1.5 + i));
    DECOR.forEach((d) => {
      if (d.kind === 'cristal') cluster(x, d.x, d.y, 1, d.pal);
      else if (d.kind === 'fougere') glowFern(x, d.x, d.y, 1, d.k % 4 === 1 ? TE : CY);
      else if (d.kind === 'champignon') { mushroom(x, d.x, d.y, 1, ['#c0509a', '#ff8ad0']); mushroom(x, d.x + 5, d.y + 1, 1, ['#2aa0c0', '#7ae8ff']); }
      else { px(x, '#16121c', d.x - 5, d.y - 9, 11, 9); crystal(x, d.x - 2, d.y - 1, 6, 2, VI); crystal(x, d.x + 1, d.y - 1, 8, 2, VI); crystal(x, d.x + 3, d.y - 1, 5, 2, CY); }
    });
    return c;
  }
  function weekPathLayer(f) {
    const c = mk(), x = c.getContext('2d');
    const P = PATH.pts;
    for (let i = 0; i < P.length; i += 2) px(x, '#0b0705', P[i][0] - 5, P[i][1] - 4, 11, 9);
    const reached = f * PATH.total;
    for (let i = 0; i < P.length; i++) {
      const [X, Y] = P[i];
      const lit = PATH.len[i] <= reached;
      px(x, lit ? '#6e4a2c' : '#2a1c10', X - 4, Y, 9, 3);
      px(x, lit ? '#b07a42' : '#3a2818', X - 4, Y, 9, 1);
    }
    for (let L = 4; L < PATH.total; L += 7) {
      const p = along(L / PATH.total);
      const lit = L <= reached;
      px(x, lit ? '#3a2410' : '#1d130a', p.x - 4, p.y + 1, 9, 1);
      if (lit && Math.floor(L / 7) % 2) px(x, '#2a180a', p.x + (Math.floor(L / 14) % 2 ? -2 : 1), p.y, 2, 1);
    }
    [0.17, 0.5, 0.83].forEach((q) => {
      const p = along(q);
      for (let y = 0; y < 14; y++) { px(x, '#4a2c14', p.x - 7, p.y - 14 + y); px(x, '#4a2c14', p.x + 7, p.y - 14 + y); }
      px(x, '#6a4422', p.x - 8, p.y - 15, 17, 2);
    });
    return c;
  }
  function week(canvas, o, t, walking) {
    const x = setup(canvas);
    const goal = Math.max(1, o.goal);
    const f = Math.max(0, Math.min(1, o.progress / goal));
    const done = f >= 1;
    x.drawImage(weekRock(), 0, 0);
    x.drawImage(weekPathLayer(f), 0, 0);
    x.drawImage(decorLayer(t), 0, 0);
    // Lueurs du décor : les plantes et les cristaux brillent, plus fort quand le mineur est passé
    DECOR.forEach((d) => {
      const near = f >= d.q ? 1 : 0.45;
      const col = d.kind === 'fougere' ? '#4effb0' : d.kind === 'champignon' ? '#ff8ad0' : d.pal[2];
      glow(x, d.x, d.y - 6, 17, col, (0.2 + 0.07 * Math.sin(t * 3 + d.k)) * near);
    });
    HANGING.forEach(([vx, top, len], i) => glow(x, vx, top + 4 + len, 12, '#7dffb0', 0.22 + 0.06 * Math.sin(t * 2 + i)));
    // Fanions : un par étape
    const n = o.markers;
    for (let k = 1; k < n; k++) {
      const q = k / n, p = along(q), lit = f >= q - 1e-6;
      const side = p.x < 80 ? 9 : -9;
      for (let y = 0; y < 11; y++) px(x, '#5a3a1e', p.x + side, p.y - 10 + y);
      px(x, lit ? '#ffd84a' : '#4a3a20', p.x + side + 1, p.y - 10, 5, 3);
      px(x, lit ? '#ffd84a' : '#4a3a20', p.x + side + 1, p.y - 7, 3, 1);
      if (lit) glow(x, p.x + side + 3, p.y - 9, 12, '#ffb030', 0.25 + 0.05 * Math.sin(t * 6 + k));
    }
    // Les diamants, enchâssés dans une niche au bout du chemin
    const end = along(1);
    const cx = Math.round(end.x + 15), cy = Math.round(end.y + 2);
    glow(x, cx, cy - 8, 22, '#2a3a4a', 0.5);
    for (let i = 0; i < 26; i++) px(x, '#3a2818', cx - 13 + i, cy + 2, 1, 1);
    diamond(x, cx - 5, cy, 7, done, t, 1);
    diamond(x, cx + 5, cy, 5, done, t, 2);
    diamond(x, cx, cy - 7, 9, done, t, 3);
    if (!done) glow(x, cx, cy - 8, 20, '#8fe8ff', 0.13 + 0.1 * Math.sin(t * 2.4));
    // Le mineur
    const p = along(f);
    const spr = global.Avatar ? global.Avatar.sprite(o.avatar || {}) : null;
    if (spr) {
      const bob = walking ? (Math.floor(t * 8) % 2) : 0;
      x.save();
      x.translate(Math.round(p.x), Math.round(p.y + 1 - bob));
      if (walking && p.dx < 0) x.scale(-1, 1);
      x.drawImage(spr, -8, -28);
      x.restore();
    }
    // Obscurité : la partie parcourue, le mineur et les diamants sont éclairés
    const dark = mk(), d = dark.getContext('2d');
    d.fillStyle = 'rgba(6,4,2,0.74)'; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (hx, hy, r, a) => { const g = d.createRadialGradient(hx, hy, 0, hx, hy, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = g; d.fillRect(hx - r, hy - r, 2 * r, 2 * r); };
    for (let L = 0; L <= f * PATH.total; L += 8) { const q = along(L / PATH.total); hole(q.x, q.y - 6, 24, 0.7); }
    hole(p.x, p.y - 12, 44 + Math.sin(t * 5) * 1.5, 1);
    hole(cx, cy - 8, done ? 64 : 24, done ? 1 : 0.7);
    hole(PATH.pts[0][0], 20, 26, 0.8);
    HANGING.forEach(([vx, top, len]) => hole(vx, top + 4 + len, 9, 0.35));
    for (let L = f * PATH.total; L <= PATH.total; L += 10) { const q = along(L / PATH.total); hole(q.x, q.y, 10, 0.3); }
    x.drawImage(dark, 0, 0);
    glow(x, p.x + 6, p.y - 12, 26, '#ffd070', 0.2);
    x.save(); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) { const s = (t * 0.05 + hash(i + 40)) % 1; px(x, 'rgba(255,210,140,0.5)', p.x - 30 + hash(i * 9) * 60 + Math.sin(t + i) * 3, p.y - 40 + s * 40); }
    if (done) for (let i = 0; i < 16; i++) { const s = (t * 0.5 + hash(i + 3)) % 1; px(x, ['#ffffff', '#8fe8ff', '#ffe36e'][i % 3], cx - 20 + hash(i * 7) * 40, cy - 6 - s * 38, 1, s < 0.5 ? 2 : 1); }
    x.restore();
  }

  // ======================================================================
  // DÉFI DU MOIS : quatre galeries qui se suivent ; la foreuse perce la roche, derrière elle la galerie s'éclaire
  // ======================================================================
  const LANES = [26, 76, 126, 176];
  const XL = 14, XR = 146, END_X = 38, HALF = 13, START_X = 46;
  const SEGS = once('segs', () => {
    const s = [];
    LANES.forEach((y, i) => {
      const r = i % 2 === 0;
      const x1 = r ? XR : (i === LANES.length - 1 ? END_X : XL);
      const x0 = i === 0 ? START_X : r ? XL : XR;
      s.push({ kind: 'lane', y, x0, x1, len: Math.abs(x1 - x0), lane: i });
      if (i < LANES.length - 1) s.push({ kind: 'drop', x: r ? XR : XL, y0: y, y1: LANES[i + 1], len: LANES[i + 1] - y });
    });
    let acc = 0;
    s.forEach((g) => { g.at = acc; acc += g.len; });
    return { s, total: acc };
  });
  function nose(f) {
    const L = Math.max(0, Math.min(1, f)) * SEGS.total;
    for (const g of SEGS.s) {
      if (L <= g.at + g.len) {
        const k = (L - g.at) / g.len;
        if (g.kind === 'lane') return { x: g.x0 + (g.x1 - g.x0) * k, y: g.y, dir: g.x1 > g.x0 ? 'r' : 'l' };
        return { x: g.x, y: g.y0 + (g.y1 - g.y0) * k, dir: 'd' };
      }
    }
    const g = SEGS.s[SEGS.s.length - 1];
    return { x: g.x1, y: g.y, dir: 'l' };
  }
  /** Fraction du parcours à laquelle le point (x, y) d'une galerie est atteint. */
  function atOf(x, y) {
    for (const g of SEGS.s) {
      if (g.kind === 'lane' && Math.abs(y - g.y) <= HALF) return (g.at + Math.min(g.len, Math.abs(x - g.x0))) / SEGS.total;
      if (g.kind === 'drop' && Math.abs(x - g.x) <= HALF && y >= g.y0 && y <= g.y1) return (g.at + (y - g.y0)) / SEGS.total;
    }
    return 0;
  }
  const RECTS = once('rects', () => {
    const r = [[XL - 6, 0, 12, LANES[0]]];
    SEGS.s.forEach((g) => {
      if (g.kind === 'lane') { const a = g.lane === 0 ? XL : Math.min(g.x0, g.x1); r.push([a - HALF, g.y - HALF, Math.max(g.x0, g.x1) - a + 2 * HALF, 2 * HALF + 1]); }
      else r.push([g.x - HALF, g.y0, 2 * HALF, g.y1 - g.y0]);
    });
    return r;
  });
  const inside = (i, y) => RECTS.some(([x0, y0, w, h]) => i >= x0 && i < x0 + w && y >= y0 && y < y0 + h);
    const FEAT_Q = [0.1, 0.35, 0.6, 0.7, 0.88];
  const KIND_ORDER = ['poche', 'bosquet', 'lac', 'geode', 'fossile'];
  const KIND_NAMES = { poche: 'Une poche de cristaux', bosquet: 'Un bosquet de champignons lumineux', lac: 'Un lac souterrain', geode: 'Une géode scintillante', fossile: "Un fossile d'ammonite" };
  const LAKE_NAMES = { saphir: 'Un lac gelé', topaze: 'Un lac de lave', rubis: 'Un lac de rubis fondu', 'aigue-marine': 'Une source cristalline' };
  /** Couleurs et ordre des découvertes d'une galerie (par défaut : les émeraudes de novembre). */
  const DEFAULT_COLORS = { gem: ['#05381c', '#118a45', '#4ade80', '#d4ffe4'], deco: [['#0a4a3a', '#1fa07a', '#5effc0', '#d8ffee'], ['#05381c', '#118a45', '#4ade80', '#d4ffe4'], ['#0e3a5a', '#1e86b0', '#5ee0ff', '#d8fbff'], ['#6a3a06', '#c8801c', '#ffc24a', '#fff0b8']], water: ['#7ae8ff', '#3fb3e8', '#1e76b0', '#123f6b'], wall: ['#06121a', '#0b2228', '#11382f', '#184a3a'], rock: ['#15110f', '#201a16', '#2a2419', '#363023', '#463e2d'], glow: '#4effb0' };
  const kits = {};
  function kit(data) {
    const g = data && data.gallery;
    const key = g ? g.gem : 'emeraude';
    if (kits[key]) return kits[key];
    const c = g ? g.colors : DEFAULT_COLORS;
    const monthNo = data && data.month ? Number(data.month.slice(5, 7)) : 11;
    const shift = monthNo % KIND_ORDER.length;
    const kinds = KIND_ORDER.map((_, i) => KIND_ORDER[(i + shift) % KIND_ORDER.length]);
    const de = g ? (/^[aeiouyéèêàâ]/i.test(g.gemName) ? "d'" : 'de ') + g.gemName : "d'émeraudes";
    return (kits[key] = { key, gem: c.gem, deco: c.deco, water: c.water, wall: c.wall, rock: c.rock, glow: c.glow, kinds, finds: [...FEAT_Q.map((q, i) => ({ at: q, name: kinds[i] === 'lac' && LAKE_NAMES[key] ? LAKE_NAMES[key] : KIND_NAMES[kinds[i]] })), { at: 1, name: `Le filon ${de}` }] });
  }

  const rockLayer = (K) => once(`mrock${K.key}`, () => {
    const c = mk(), x = c.getContext('2d');
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
      const strata = Math.sin((y + vnoise(i, y, 12, 20) * 12) / 5) * 0.1;
      px(x, tone(K.rock, Math.max(0, Math.min(1, fbm(i, y, 21) * 0.9 + strata)), i, y), i, y);
    }
    for (let k = 0; k < 60; k++) {
      const gx = Math.floor(hash(k * 7.7) * W), gy = Math.floor(hash(k * 3.1 + 4) * H);
      if (inside(gx, gy)) continue;
      const c1 = k % 4 === 0 ? K.deco[3][2] : k % 4 === 1 ? K.deco[2][2] : k % 4 === 2 ? K.deco[1][2] : '#7a6a58';
      px(x, c1, gx, gy);
    }
    return c;
  });
  const tunnelLayer = (K) => once(`mtunnel${K.key}`, () => {
    const c = mk(), x = c.getContext('2d');
    const glows = [];
    const reg = (X, Y, col, r, a) => glows.push({ x: X, y: Y, col, r, a, q: atOf(X, Y) });
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
      if (!inside(i, y)) continue;
      px(x, tone(K.wall, 0.25 + fbm(i, y, 40) * 0.6, i, y), i, y);
    }
    // Bords : plafond sombre, sol de pierre, parois
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
      if (!inside(i, y)) continue;
      const up = inside(i, y - 1), dn = inside(i, y + 1), lf = inside(i - 1, y), rt = inside(i + 1, y);
      if (!up) for (let k = 0; k < 3; k++) px(x, k === 0 ? '#2a2018' : '#05070d', i, y + k);
      if (!dn) { px(x, '#8a7458', i, y); px(x, '#4a3a2a', i, y - 1); px(x, '#2a2018', i, y - 2); }
      if (!lf || !rt) px(x, '#05070d', i, y);
    }
    SEGS.s.forEach((g, gi) => {
      if (g.kind === 'lane') {
        const a = Math.min(g.x0, g.x1), b = Math.max(g.x0, g.x1);
        const top = g.y - HALF, floor = g.y + HALF - 2;
        // Poutres tous les ~46 px
        for (let X = a - HALF + 22 + (g.lane % 2) * 10; X < b + HALF - 14; X += 46) {
          if (g.lane === 3 && X < END_X + 10) continue;
          px(x, '#4a2c14', X, top + 3, 3, floor - top - 3); px(x, '#6a4422', X, top + 3, 1, floor - top - 3);
          px(x, '#6a4422', X - 3, top + 3, 9, 2);
          px(x, '#16121c', X + 1, top + 6, 1, 3); px(x, '#ffd84a', X + 1, top + 8, 1, 2);
          reg(X + 1, top + 9, '#ffb030', 15, 0.32);
        }
        // Stalactites et petits cristaux de plafond
        for (let X = a - HALF + 3; X < b + HALF - 2; X += 5 + Math.floor(hash(X * 1.3 + gi) * 5)) {
          const len = 2 + Math.floor(hash(X * 2.1 + gi) * 4);
          for (let r = 0; r < len; r++) px(x, r === len - 1 ? '#8a7458' : '#3a2e22', X, top + 3 + r);
        }
        // Végétation et cristaux
        for (let X = a - HALF + 6; X < b + HALF - 8; X += 11 + Math.floor(hash(X * 0.7 + gi * 3) * 9)) {
          const h = hash(X * 3.3 + gi * 11);
          const hereQ = atOf(X, g.y);
          if (g.lane === 3 && X < END_X + 4) continue;
          if (h < 0.34) { const pal = K.deco[(X + gi) % 4]; cluster(x, X, floor, 1, pal); reg(X, floor - 7, pal[2], 14, 0.26); }
          else if (h < 0.55) { glowFern(x, X, floor, 1, X % 2 ? K.deco[0] : K.deco[2]); reg(X, floor - 6, K.glow, 12, 0.2); }
          else if (h < 0.75) { mushroom(x, X, floor, 1, [K.deco[1][1], K.deco[1][2]]); reg(X, floor - 5, K.deco[1][2], 10, 0.18); }
          else { vine(x, X, top + 3, 5 + Math.floor(hash(X) * 8), X); reg(X, top + 14, K.glow, 10, 0.2); }
          void hereQ;
        }
      } else {
        for (let k = 0; k < 4; k++) {
          const Y = g.y0 + 8 + k * 12;
          vine(x, g.x - HALF + 2, Y, 6 + k, k * 2); vine(x, g.x + HALF - 2, Y + 6, 7, k + 1);
          reg(g.x - HALF + 2, Y + 8, K.glow, 9, 0.18);
        }
        // Échelle
        for (let Y = g.y0; Y < g.y1; Y++) { px(x, '#6a4422', g.x - 3, Y); px(x, '#6a4422', g.x + 3, Y); if (Y % 4 === 0) px(x, '#9a6a3a', g.x - 3, Y, 7, 1); }
      }
    });
    // Puits d'entrée : échelle du camp
    for (let Y = 0; Y < LANES[0] - HALF + 2; Y++) { px(x, '#6a4422', XL - 3, Y); px(x, '#6a4422', XL + 2, Y); if (Y % 4 === 0) px(x, '#9a6a3a', XL - 3, Y, 6, 1); }
    // Éléments de décor spéciaux, posés sur les galeries
    K.finds.forEach((ft, fi) => {
      const kindName = fi < FEAT_Q.length ? K.kinds[fi] : 'filon';
      const p = nose(ft.q);
      const g = SEGS.s.find((s) => s.kind === 'lane' && Math.abs(p.y - s.y) < 1);
      if (!g && kindName !== 'filon') return;
      const fy = p.y + HALF - 2, X = Math.round(p.x);
      if (kindName === 'poche') { cluster(x, X, fy, 2, K.deco[0]); cluster(x, X + 18, fy, 1, K.deco[2]); reg(X, fy - 12, K.deco[0][2], 26, 0.4); }
      else if (kindName === 'bosquet') {
        for (let k = -3; k <= 3; k++) mushroom(x, X + k * 6, fy + (k % 2), 1 + (Math.abs(k) < 2 ? 1 : 0), k % 2 ? [K.deco[0][1], K.deco[0][2]] : [K.deco[1][1], K.deco[1][2]]);
        reg(X, fy - 8, K.deco[1][2], 28, 0.32); reg(X + 12, fy - 6, K.deco[0][2], 18, 0.25);
      } else if (kindName === 'lac') {
        for (let i = -22; i <= 22; i++) for (let r = 0; r < 4; r++) px(x, K.water[r], X + i, fy - 3 + r);
        for (let i = -18; i <= 18; i += 6) px(x, K.water[0], X + i + Math.round(hash(i) * 3), fy - 3);
        crystal(x, X - 10, fy - 4, 4, 2, K.deco[0]); crystal(x, X + 12, fy - 4, 5, 2, K.deco[0]);
        reg(X, fy - 4, K.water[1], 30, 0.22);
      } else if (kindName === 'geode') {
        const gy = p.y - 2;
        for (let yy = -8; yy <= 8; yy++) for (let xx = -9; xx <= 9; xx++) { const d = (xx / 9) ** 2 + (yy / 8) ** 2; if (d <= 1) px(x, d > 0.6 ? '#4a3a2a' : tone(K.deco[2], 0.5 + (1 - d) * 0.5, xx, yy), X + xx, gy + yy); }
        crystal(x, X - 3, gy + 5, 7, 2, K.deco[2]); crystal(x, X + 1, gy + 6, 9, 3, K.deco[2]); crystal(x, X + 4, gy + 5, 6, 2, K.deco[2]);
        reg(X, gy, K.deco[2][2], 24, 0.35);
      } else if (kindName === 'fossile') {
        const gy = p.y - 1;
        for (let a = 0; a < 15; a += 0.18) { const r = 0.9 + a * 0.62; px(x, a > 11 ? '#8a7a5a' : '#d8c8a0', X + Math.cos(a) * r, gy + Math.sin(a) * r); if (a > 6) px(x, '#a89870', X + Math.cos(a) * (r - 1), gy + Math.sin(a) * (r - 1)); }
      } else if (kindName === 'filon') {
        // Le filon : colonnes d'émeraudes sur le sol, aux parois et au plafond de la salle du fond
        const cy2 = LANES[3];
        for (let yy = cy2 - HALF; yy <= cy2 + HALF; yy++) for (let xx = 0; xx < END_X - 2; xx++) px(x, tone(['#050508', K.gem[0], mix(K.gem[0], K.gem[1], 0.5), K.gem[1]], 0.35 + fbm(xx, yy, 7) * 0.5, xx, yy), xx, yy);
        for (let xx = 0; xx < END_X - 2; xx++) { px(x, '#05070d', xx, cy2 - HALF); px(x, '#05070d', xx, cy2 - HALF + 1); px(x, '#8a7458', xx, cy2 + HALF); }
        crystal(x, 5, cy2 + HALF - 1, 14, 4, K.gem); crystal(x, 11, cy2 + HALF - 1, 22, 5, K.gem); crystal(x, 18, cy2 + HALF - 1, 16, 4, K.gem); crystal(x, 25, cy2 + HALF - 1, 20, 5, K.gem); crystal(x, 31, cy2 + HALF - 1, 11, 3, K.gem);
        crystal(x, 8, cy2 - HALF + 2, 8, 3, K.gem, -1); crystal(x, 21, cy2 - HALF + 2, 10, 3, K.gem, -1); crystal(x, 29, cy2 - HALF + 2, 6, 2, K.gem, -1);
        reg(18, cy2, K.gem[2], 48, 0.6);
      }
    });
    return { img: c, glows };
  });
  function month(canvas, o, t, digging) {
    const x = setup(canvas);
    const K = o.kit;
    const f = Math.max(0, Math.min(1, o.f));
    const n = nose(f);
    const L = f * SEGS.total;
    x.drawImage(rockLayer(K), 0, 0);
    // Reflets de la veine à venir : on devine la pierre derrière la roche
    if (f < 1) for (let k = 0; k < 9; k++) {
      const gx = 4 + hash(k * 5.5) * 28, gy = LANES[3] - 10 + hash(k * 2.2) * 20;
      if (Math.sin(t * 2.3 + k * 1.9) > 0.1) px(x, k % 3 ? K.gem[2] : K.gem[3], gx, gy);
    }
    // Zone déjà percée
    const mask = mk(), m = mask.getContext('2d');
    m.fillStyle = '#000';
    m.fillRect(XL - 6, 0, 12, LANES[0]);
    m.fillRect(XL - HALF, LANES[0] - HALF, START_X - XL + HALF + 4, 2 * HALF + 1);
    SEGS.s.forEach((g) => {
      if (L <= g.at) return;
      const k = Math.min(1, (L - g.at) / g.len);
      if (g.kind === 'lane') {
        const a = g.x0, b = g.x0 + (g.x1 - g.x0) * k;
        const x0 = g.x1 > g.x0 ? a - HALF : b - 3, x1 = g.x1 > g.x0 ? b + 3 : a + HALF;
        m.fillRect(Math.round(x0), g.y - HALF, Math.round(x1 - x0), 2 * HALF + 1);
      } else {
        m.fillRect(g.x - HALF, g.y0, 2 * HALF, Math.round((g.y1 - g.y0) * k) + 3);
      }
    });
    if (f >= 1) m.fillRect(0, LANES[3] - HALF, END_X + HALF, 2 * HALF + 1);
    const T = tunnelLayer(K);
    const lay = mk(), l = lay.getContext('2d');
    l.drawImage(T.img, 0, 0);
    l.globalCompositeOperation = 'destination-in';
    l.drawImage(mask, 0, 0);
    // Ombre de la galerie sur la roche
    const sh = mk(), s = sh.getContext('2d');
    s.drawImage(mask, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = 'rgba(0,0,0,0.6)'; s.fillRect(0, 0, W, H);
    x.drawImage(sh, 1, 2);
    x.drawImage(lay, 0, 0);
    // Lueurs : seulement dans la partie percée
    T.glows.forEach((g, i) => { if (g.q <= f + 0.004) glow(x, g.x, g.y, g.r, g.col, g.a * (0.85 + 0.15 * Math.sin(t * 3 + i))); });
    // Foreuse à chenilles (la même que l'ancienne scène), réduite de moitié, pointe tournée dans le sens de l'avancée
    if (f < 1) {
      drillAt(x, n.x, n.y, n.dir, t, true);
      if (digging) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) {
          const a = hash(i + Math.floor(t * 20)) * Math.PI * 2, r = 2 + hash(i * 3 + Math.floor(t * 20)) * 6;
          px(x, i % 2 ? '#ffc060' : '#8a7a6a', n.x + Math.cos(a) * r + (n.dir === 'r' ? 3 : n.dir === 'l' ? -3 : 0), n.y + Math.sin(a) * r + (n.dir === 'd' ? 3 : 0));
        }
        x.restore();
      }
      glow(x, n.x, n.y, 28, '#ffe0a0', 0.2);
    }
    if (f >= 1) {
      // La foreuse s'arrête devant le filon
      drillAt(x, END_X, LANES[3], 'l', t, false);
      x.save(); x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) { const s2 = (t * 0.3 + hash(i + 7)) % 1; px(x, [K.gem[2], K.gem[3], '#ffffff', '#ffe36e'][i % 4], 2 + hash(i * 5) * 40, LANES[3] + 12 - s2 * 36, 1, 2); }
      x.restore();
    }
    const v = x.createRadialGradient(80, 100, 60, 80, 100, 140);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
  }

  // ---------- Foreuse à chenilles (reprise de l'ancienne scène, réduite de moitié) ----------
  /**
   * Foreuse de chantier à chenilles, dessinée d'un seul tenant : chenilles intégrées au châssis, cabine vitrée avec gyrophare,
   * échappement qui fume, bras hydraulique et foret conique qui tourne. Pointe du foret en (tipX + 8, baseY - 21), chenilles posées sur baseY.
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

  const drillBuf = mk(96, 60);
  /** Foreuse dont la pointe est en (nx, ny), tournée vers la droite ('r'), la gauche ('l') ou le bas ('d'). */
  function drillAt(x, nx, ny, dir, t, moving) {
    const b = drillBuf.getContext('2d');
    b.clearRect(0, 0, 96, 60);
    b.imageSmoothingEnabled = false;
    tunnelDrill(b, 72, 52, t, moving);
    x.save();
    x.translate(Math.round(nx), Math.round(ny));
    if (dir === 'd') x.rotate(Math.PI / 2);
    else if (dir === 'l') x.scale(-1, 1);
    x.scale(0.5, 0.5);
    x.imageSmoothingEnabled = false;
    x.drawImage(drillBuf, -80, -31);
    x.restore();
  }

  // ---------- Points d'entrée ----------
  const anim = {};
  /** Avancée affichée : part de `from` et rejoint `to` en `dur` secondes à partir du premier dessin animé. */
  function walk(slot, key, from, to, t, dur) {
    if (!(t > 0) || from == null || from >= to) return { v: to, moving: false };
    const a = anim[slot];
    if (!a || a.key !== key) anim[slot] = { key, start: t };
    const k = Math.min(1, (t - anim[slot].start) / dur);
    return { v: from + (to - from) * k, moving: k < 1 };
  }
  function weekly(canvas, ch, avatar, t) {
    const goal = Math.max(1, ch.goal);
    const w = walk('week', `${ch.id}:${ch.from}:${ch.progress}`, ch.from, ch.progress, t, 2.4);
    week(canvas, { progress: w.v, goal, markers: goal <= 10 ? goal : 5, avatar }, t, w.moving);
  }
  function collective(canvas, data, colors, t) {
    const goal = Math.max(1, data.goal);
    const f = Math.min(1, data.total / goal);
    const from = data.from == null ? null : Math.min(1, data.from / goal);
    const w = walk('month', `${data.month}:${data.from}:${data.total}`, from, f, t, 3.2);
    month(canvas, { f: w.v, kit: kit(data) }, t, w.moving || f < 1);
  }
  const finds = (data) => kit(data).finds;

  /** Pierre taillée de 16 × 16 pixels pour la vitrine : couleurs de la pierre (ombre → reflet), grisée si elle n'est pas trouvée. */
  function gem(canvas, colors, state) {
    canvas.width = 16; canvas.height = 16;
    const x = canvas.getContext('2d');
    x.clearRect(0, 0, 16, 16);
    const found = state === 'found';
    const pal = found ? colors : state === 'current' ? colors.map((c) => mix(c, '#1a1410', 0.55)) : ['#1c1a20', '#2a2830', '#3a3844', '#4a4858'];
    const outline = found ? '#16121c' : '#2a2830';
    // Contour : table plate en haut, couronne qui s'évase, culasse en pointe
    const edge = (y) => (y < 3 ? [3, 12] : y < 6 ? [3 - (y - 3), 12 + (y - 3)] : [Math.round(1 + (y - 5) * 0.62), Math.round(14 - (y - 5) * 0.62)]);
    for (let y = 2; y <= 14; y++) {
      const [a, b] = edge(y);
      for (let X = a; X <= b; X++) {
        const rim = X === a || X === b || y === 2 || y === 14;
        const mid = (a + b) / 2;
        const c = rim ? outline : y < 6 ? (X < mid - 1 ? pal[3] : X > mid + 1 ? pal[1] : pal[2]) : X < mid - 2 ? pal[2] : X > mid + 2 ? pal[0] : y > 10 ? pal[1] : pal[2];
        x.fillStyle = c; x.fillRect(X, y, 1, 1);
      }
    }
    if (found) { x.fillStyle = '#ffffff'; x.fillRect(5, 4, 2, 1); x.fillRect(5, 5, 1, 1); x.fillRect(11, 8, 1, 1); }
    if (state === 'future') { x.fillStyle = '#6a6878'; x.fillRect(7, 6, 2, 1); x.fillRect(8, 7, 1, 2); x.fillRect(8, 10, 1, 1); }
  }

  global.Defis16 = { weekly, collective, finds, gem, SIZE };
})(window);
