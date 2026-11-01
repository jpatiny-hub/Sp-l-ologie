'use strict';
/**
 * Foreuses 16-bit (essai réservé au responsable) : sprites de 32 pixels de large, soit 2 pixels par pixel du jeu en mode HD-2D.
 * Chaque foreuse = carrosserie (style) + blindage + foret ; les foreuses de fête ajoutent un effet animé qui sort de la pointe.
 * Même générateur que la planche de test « Atelier des foreuses ».
 */
(function (global) {
  // ---------- Palette (5 tons par matière : reflet, clair, moyen, sombre, ombre) ----------
  const INK = '#16121c';
  const M = {
    diamant: ['#ffffff', '#e6fbff', '#a8e8ff', '#6ab8e8', '#3a78b0'],
    jaune: ['#fff3a0', '#ffd23f', '#f0a81c', '#b8700f', '#7a430a'],
    acier: ['#f2f6fa', '#c3cbd6', '#8f99a8', '#5f6877', '#3b414d'],
    fonte: ['#b9c0cc', '#7e8796', '#545c6b', '#363c48', '#22262f'],
    verre: ['#e8fbff', '#8fe3ff', '#3fb3e8', '#1e76b0', '#123f6b'],
    laiton: ['#fff0b8', '#f0c869', '#c89436', '#8d5f1c', '#5a3a10'],
    cuivre: ['#ffd0a8', '#e8925a', '#b85d2c', '#7e3a18', '#4e220c'],
    marine: ['#bfe9ff', '#5fb0e8', '#2f78c0', '#1d4c8a', '#122c58'],
    orange: ['#ffe0b0', '#ffa04a', '#e86a1c', '#a8420e', '#6a2406'],
    kaki: ['#d6dca0', '#9aa65a', '#6b7a3a', '#465226', '#2c3418'],
    nacre: ['#ffffff', '#e6ecf5', '#bcc6d6', '#8592a8', '#56607a'],
    visiere: ['#b0f8ff', '#40d8ff', '#1a6a9a', '#0e3a5e', '#081f36'],
    pierre: ['#c9bcd6', '#8f7fa8', '#62557a', '#413858', '#2a223c'],
    amethyste: ['#ffe0ff', '#e59cff', '#b45ee8', '#7a32b0', '#4a1a78'],
    turquoise: ['#e6ffff', '#8ff0ff', '#3fc8e8', '#1e86b0', '#124e78'],
    fer: ['#9a8f8a', '#6e6460', '#4a4240', '#2f2827', '#1d1817'],
    braise: ['#fff3c0', '#ffc060', '#e87a20', '#a84410', '#5a1e06'],
    bois: ['#f0c890', '#c8945a', '#9a6a3a', '#6a4422', '#432812'],
    or: ['#fffbd0', '#ffe36e', '#e8b830', '#a8741a', '#6a440a'],
    ecaille: ['#d8ffd0', '#7ee08a', '#3fae5e', '#227a3e', '#124a24'],
    rouge: ['#ffc0b0', '#ff5e4a', '#d02e22', '#8e1a14', '#5a0c0a'],
  };

  // ---------- Tampon de pixels : x de -1 à 32, y de -5 à 48 ----------
  const BW = 34, BH = 54;
  const buf = () => ({ cells: new Array(BW * BH).fill(null) });
  const idx = (x, y) => { const X = x + 1, Y = y + 5; return X < 0 || Y < 0 || X >= BW || Y >= BH ? -1 : Y * BW + X; };
  const get = (b, x, y) => { const i = idx(x, y); return i < 0 ? null : b.cells[i]; };
  const set = (b, x, y, c, o = {}) => { const i = idx(x, y); if (i >= 0) b.cells[i] = { c, g: !!o.glow, o: o.outline !== false && !o.glow, a: o.alpha || 1 }; };

  // ---------- Formes (tests au centre du pixel) ----------
  const rr = (x0, y0, x1, y1, r = 0) => (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    if (px < x0 || px > x1 + 1 || py < y0 || py > y1 + 1) return false;
    const cx = Math.min(Math.max(px, x0 + r), x1 + 1 - r), cy = Math.min(Math.max(py, y0 + r), y1 + 1 - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r + 0.01;
  };
  const circ = (cx, cy, r) => (x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
  const poly = (pts) => (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const and = (a, b) => (x, y) => a(x, y) && b(x, y);
  const not = (a) => (x, y) => !a(x, y);
  const or = (...fs) => (x, y) => fs.some((f) => f(x, y));

  // ---------- Ombrage ----------
  const BAYER = [[-0.22, 0.07], [0.22, -0.07]];
  const lerpCurve = (u) => {
    const P = [[0, 1.7], [0.22, 0.3], [0.45, 1], [0.78, 2.2], [1, 3.3]];
    for (let i = 1; i < P.length; i++) if (u <= P[i][0]) { const [a, ta] = P[i - 1], [b, tb] = P[i]; return ta + ((u - a) / (b - a)) * (tb - ta); }
    return 3.3;
  };
  const cyl = (x0, x1, y0, y1) => (x, y) => {
    const u = (x + 0.5 - x0) / (x1 + 1 - x0), v = (y + 0.5 - y0) / (y1 + 1 - y0);
    return lerpCurve(u) + (v > 0.72 ? (v - 0.72) * 3.2 : 0) - (v < 0.14 ? 0.6 : 0);
  };
  const sph = (cx, cy, r) => (x, y) => Math.hypot(x + 0.5 - (cx - r * 0.38), y + 0.5 - (cy - r * 0.42)) / (r * 1.45) * 3.8;
  const flat = (t) => () => t;
  const toneAt = (t, x, y) => Math.max(0, Math.min(4, Math.round(t + BAYER[y & 1][x & 1])));

  /** Remplit une pièce : ombrage, liseré sombre là où elle chevauche une pièce déjà posée. */
  function part(b, mask, mat, shade, o = {}) {
    const X0 = o.x0 ?? -1, X1 = o.x1 ?? 32, Y0 = o.y0 ?? -5, Y1 = o.y1 ?? 48;
    const edge = o.edge ?? 'deep';
    const writes = [];
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      if (!mask(x, y)) continue;
      let c;
      const border = !mask(x - 1, y) || !mask(x + 1, y) || !mask(x, y - 1) || !mask(x, y + 1);
      const under = border && [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => !mask(nx, ny) && get(b, nx, ny));
      if (under && edge !== 'none') c = edge === 'ink' ? INK : mat[4];
      else {
        const t = toneAt(shade(x, y), x, y);
        c = (o.color && o.color(x, y, t)) || mat[t];
      }
      writes.push([x, y, c]);
    }
    for (const [x, y, c] of writes) set(b, x, y, c, o);
  }
  /** Recolore des pixels déjà posés. */
  function paint(b, mask, colorFn, o = {}) {
    for (let y = -5; y <= 48; y++) for (let x = -1; x <= 32; x++) {
      const cell = get(b, x, y);
      if (cell && mask(x, y)) { const c = colorFn(x, y, cell.c); if (c) set(b, x, y, c, { glow: o.glow ?? cell.g, outline: o.outline ?? cell.o }); }
    }
  }
  const dot = (b, x, y, c, o) => set(b, x, y, c, o);
  // Petit générateur pseudo-aléatoire stable.
  const hash = (a, b2, s = 0) => { let h = (a * 374761393 + b2 * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // Hublot commun : anneau, verre, reflet.
  function hublot(b, cx, cy, r, ring = M.acier, glass = M.verre) {
    part(b, circ(cx, cy, r), ring, sph(cx, cy, r), { edge: 'ink' });
    part(b, circ(cx, cy, r - 1.9), glass, sph(cx, cy, r - 1.9));
    dot(b, Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.45), '#ffffff');
    dot(b, Math.floor(cx - r * 0.45) + 1, Math.floor(cy - r * 0.45), '#ffffff');
    dot(b, Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.45) + 1, '#ffffff');
  }
  const rivet = (b, x, y, mat) => { dot(b, x, y, mat[4]); dot(b, x, y - 1, mat[0]); };

  // ---------- Styles de carrosserie ----------
  const STYLES = {
    chantier: {
      nom: 'Chantier', detail: 'La foreuse de base en 16-bit, gyrophare et bande de sécurité',
      body: { x0: 3, x1: 28, y0: 6, y1: 25 }, hub: { cx: 16, cy: 14, r: 6.5 },
      back(b, f) {
        const corps = rr(3, 6, 28, 25, 5);
        part(b, rr(15, 2, 16, 6), M.acier, cyl(15, 16, 2, 6));
        part(b, corps, M.jaune, cyl(3, 28, 6, 25));
        paint(b, and(corps, rr(4, 21, 27, 23)), (x, y) => (((x - y) % 4 + 4) % 4 < 2 ? '#2a2430' : null));
        for (const [x, y] of [[6, 10], [25, 10], [6, 18], [25, 18]]) rivet(b, x, y, M.jaune);
        part(b, rr(7, 25, 24, 28, 1), M.acier, cyl(7, 24, 25, 28));
        const on = f % 2 === 0;
        part(b, circ(16, 2, 2.1), on ? M.orange : M.cuivre, on ? flat(0.6) : flat(2.5), { glow: on });
      },
      front(b) { hublot(b, 16, 14, 6.5); },
    },
    vapeur: {
      nom: 'Vapeur', detail: 'Laiton, cerclages de cuivre, cheminée qui fume et manomètre',
      body: { x0: 4, x1: 27, y0: 7, y1: 25 }, hub: { cx: 14, cy: 15, r: 6 },
      back(b, f) {
        part(b, rr(6, 1, 9, 7), M.fonte, cyl(6, 9, 1, 7));
        part(b, rr(5, 0, 10, 1), M.fonte, cyl(5, 10, 0, 1));
        part(b, rr(4, 7, 27, 25, 3), M.laiton, cyl(4, 27, 7, 25));
        for (const yb of [9, 21]) {
          part(b, and(rr(4, 7, 27, 25, 3), rr(3, yb, 28, yb + 1)), M.cuivre, cyl(4, 27, yb, yb + 1), { edge: 'none' });
          for (let x = 6; x <= 26; x += 3) dot(b, x, yb, M.cuivre[0]);
        }
        part(b, rr(9, 25, 22, 28, 1), M.cuivre, cyl(9, 22, 25, 28));
        // Fumée : trois bouffées qui montent.
        for (let i = 0; i < 3; i++) {
          const k = (f + i * 1.33) % 4;
          const cx = 7.5 + k * 0.9 - i * 0.6, cy = -1 - k * 1.1;
          const r = 0.9 + k * 0.35;
          for (let y = -5; y <= 0; y++) for (let x = 2; x <= 14; x++) if (circ(cx, cy, r)(x, y) && !get(b, x, y)) set(b, x, y, k < 2 ? '#d8d0e0' : '#a99cbd', { outline: false, alpha: 0.9 - k * 0.15 });
        }
      },
      front(b, f) {
        hublot(b, 14, 15, 6, M.laiton);
        part(b, circ(23.5, 16, 2.8), M.acier, sph(23.5, 16, 2.8), { edge: 'ink' });
        part(b, circ(23.5, 16, 1.8), ['#ffffff', '#f4efe2', '#e2dac4', '#c8bea2', '#a49a80'], flat(1));
        const needle = [[0, -1], [1, 0], [0, 1], [-1, 0]][f % 4];
        dot(b, 23, 15, M.rouge[2]);
        dot(b, 23 + needle[0], 15 + needle[1], M.rouge[2]);
      },
    },
    bathyscaphe: {
      nom: 'Bathyscaphe', detail: 'Coque sphérique, ailerons, projecteur et bulles',
      body: { x0: 4, x1: 27, y0: 4, y1: 26 }, hub: { cx: 16, cy: 15, r: 6.5 },
      back(b, f) {
        part(b, rr(13, 1, 18, 4, 1), M.fonte, cyl(13, 18, 1, 4));
        part(b, rr(1, 13, 4, 21, 1), M.orange, cyl(1, 4, 13, 21));
        part(b, rr(27, 13, 30, 21, 1), M.orange, cyl(27, 30, 13, 21));
        part(b, circ(16, 15.5, 11.6), M.marine, sph(16, 15.5, 11.6));
        part(b, rr(10, 25, 21, 28, 1), M.acier, cyl(10, 21, 25, 28));
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; dot(b, Math.round(16 + Math.cos(a) * 9.8 - 0.5), Math.round(15.5 + Math.sin(a) * 9.8 - 0.5), M.marine[4]); }
        part(b, rr(14, 0, 17, 1), M.or, flat(0.5), { glow: true });
        // Bulles qui montent le long de la coque.
        for (let i = 0; i < 3; i++) {
          const k = (f + i * 1.4) % 4;
          const x = i === 1 ? 28 : 2 + i, y = 10 - Math.round(k * 2.6) - i * 2;
          if (!get(b, x, y)) set(b, x, y, '#bfe9ff', { outline: false });
        }
      },
      front(b) {
        hublot(b, 16, 15, 6.5, M.laiton);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; dot(b, Math.floor(16 + Math.cos(a) * 5.4), Math.floor(15 + Math.sin(a) * 5.4), M.laiton[4]); }
      },
    },
    char: {
      nom: 'Char', detail: 'Coque à pans coupés, camouflage, chenilles et périscope',
      body: { x0: 3, x1: 28, y0: 6, y1: 25 }, hub: { cx: 16, cy: 13.5, r: 5 },
      back(b, f) {
        part(b, rr(20, 1, 22, 6), M.fonte, cyl(20, 22, 1, 6));
        part(b, rr(18, 0, 23, 2, 1), M.fonte, cyl(18, 23, 0, 2));
        dot(b, 18, 1, M.verre[1], { glow: true });
        for (const x0 of [0, 28]) {
          part(b, rr(x0, 8, x0 + 3, 27, 1), M.fonte, cyl(x0, x0 + 3, 8, 27), {
            color: (x, y, t) => (((y + f) % 3 === 0) && x > x0 && x < x0 + 3 ? M.fonte[4] : (((y + f) % 3 === 1) ? M.fonte[Math.max(0, t - 1)] : null)),
          });
        }
        const coque = poly([[7, 6], [25, 6], [28.5, 10], [28.5, 26], [3, 26], [3, 10]]);
        part(b, coque, M.kaki, cyl(3, 28, 6, 25));
        paint(b, coque, (x, y) => {
          const n = hash(Math.floor(x / 3), Math.floor(y / 2), 7);
          return n > 0.78 ? M.kaki[3] : n < 0.16 ? '#a8945a' : null;
        });
        for (let x = 5; x <= 26; x += 3) rivet(b, x, 24, M.kaki);
        part(b, rr(6, 25, 25, 28, 1), M.fonte, cyl(6, 25, 25, 28));
        // Étoile.
        for (const [x, y] of [[16, 18], [15, 19], [16, 19], [17, 19], [14, 19], [18, 19], [15, 20], [16, 20], [17, 20], [15, 21], [17, 21]]) dot(b, x, y, '#efe8d8');
      },
      front(b) {
        part(b, rr(9, 10, 22, 16, 1), M.fonte, cyl(9, 22, 10, 16), { edge: 'ink' });
        part(b, rr(10, 11, 21, 15), M.verre, cyl(10, 21, 11, 15));
        dot(b, 11, 12, '#ffffff'); dot(b, 12, 12, '#ffffff'); dot(b, 11, 13, '#ffffff');
      },
    },
    neon: {
      nom: 'Néon', detail: 'Coque nacrée profilée, visière et filets lumineux',
      body: { x0: 3, x1: 28, y0: 4, y1: 25 }, hub: { cx: 16, cy: 12.5, r: 5 },
      back(b, f) {
        part(b, poly([[3, 19], [0, 27], [4, 26]]), M.nacre, cyl(0, 4, 19, 27));
        part(b, poly([[28, 19], [32, 27], [28, 26]]), M.nacre, cyl(28, 32, 19, 27));
        const coque = poly([[12, 3], [20, 3], [28.5, 11], [28.5, 23], [25.5, 26], [6, 26], [3, 23], [3, 11]]);
        part(b, coque, M.nacre, cyl(3, 28, 3, 25));
        part(b, rr(9, 26, 22, 28, 1), M.fonte, cyl(9, 22, 26, 28));
        const pulse = [0.4, 0.8, 1.2, 0.8][f];
        const lum = pulse < 1 ? '#5ef2ff' : '#b8fbff';
        paint(b, and(coque, or(rr(5, 20, 26, 20), (x, y) => Math.abs((x - 13) + (y - 4)) < 0.6 && y < 11 && y > 4, (x, y) => Math.abs((x - 18) - (y - 4)) < 0.6 && y < 11 && y > 4)), () => lum, { glow: true, outline: true });
        for (const x of [11, 15, 16, 20]) dot(b, x, 29, f % 2 ? '#5ef2ff' : '#b8fbff', { glow: true });
        part(b, circ(16, 1.2, 1.6), M.turquoise, flat(0.6 + pulse * 0.5), { glow: true });
        part(b, rr(15.5, 2, 16.5, 3), M.fonte, flat(2));
      },
      front(b, f) {
        part(b, rr(7, 10, 24, 15, 2), M.visiere, cyl(7, 24, 10, 15), { edge: 'ink' });
        for (let i = 0; i < 4; i++) dot(b, 9 + i + f * 3, 11 + (i > 1 ? 1 : 0), 'rgba(176,248,255,0.9)', { glow: true });
      },
    },
    geode: {
      nom: 'Géode', detail: 'Bloc de roche fendue où poussent des cristaux scintillants',
      body: { x0: 3, x1: 28, y0: 8, y1: 25 }, hub: { cx: 16, cy: 16, r: 5.8 },
      back(b, f) {
        const shards = [
          [[5, 10], [7.5, 2], [10, 10], M.amethyste],
          [[10, 9], [13, -1], [16, 9], M.amethyste],
          [[18, 9], [22, 1], [24, 10], M.turquoise],
          [[23, 11], [28.5, 4], [28.5, 12], M.amethyste],
          [[14, 8], [17, 4], [19, 9], M.turquoise],
        ];
        for (const [a, top, c, mat] of shards) {
          part(b, poly([a, top, c]), mat, (x) => (x + 0.5 < top[0] ? 0.6 : 2.3));
        }
        const bloc = poly([[3, 11], [6, 8], [26, 8], [28.5, 11], [28.5, 22], [26, 26], [6, 26], [3, 23]]);
        part(b, bloc, M.pierre, cyl(3, 28, 8, 25));
        paint(b, bloc, (x, y) => { const n = hash(x, y, 3); return n > 0.86 ? M.pierre[3] : n < 0.07 ? M.pierre[0] : null; });
        for (const [x, y] of [[5, 13], [6, 14], [6, 15], [7, 16], [25, 19], [26, 20], [25, 21]]) dot(b, x, y, M.pierre[4]);
        part(b, rr(8, 25, 23, 28, 1), M.pierre, cyl(8, 23, 25, 28), { color: (x, y, t) => M.pierre[Math.min(4, t + 1)] });
        const tw = [[7, 4], [13, 1], [22, 3], [27, 7]][f];
        dot(b, tw[0], tw[1], '#ffffff', { glow: true });
      },
      front(b) { hublot(b, 16, 16, 5.8, M.pierre, M.amethyste); },
    },
    forge: {
      nom: 'Fournaise', detail: 'Fonte noire fendue de braises, cheminées crachant des étincelles',
      body: { x0: 3, x1: 28, y0: 6, y1: 25 }, hub: { cx: 16, cy: 14, r: 6 },
      back(b, f) {
        for (const x0 of [5, 23]) part(b, rr(x0, 2, x0 + 3, 6), M.fer, cyl(x0, x0 + 3, 2, 6));
        for (const x0 of [5, 23]) for (let x = x0; x <= x0 + 3; x++) dot(b, x, 2, f % 2 ? M.braise[1] : M.braise[2], { glow: true });
        part(b, rr(3, 6, 28, 25, 3), M.fer, cyl(3, 28, 6, 25));
        const cracks = [[4, 9], [5, 10], [5, 11], [6, 12], [26, 8], [26, 9], [25, 10], [26, 11], [9, 23], [10, 22], [11, 22], [12, 23], [22, 22], [23, 23], [24, 22]];
        cracks.forEach(([x, y], i) => dot(b, x, y, (i + f) % 3 === 0 ? M.braise[0] : M.braise[2], { glow: true }));
        for (const x0 of [4, 24]) for (let y = 16; y <= 20; y += 2) for (let x = x0; x <= x0 + 3; x++) dot(b, x, y, (x + f) % 2 ? M.braise[1] : M.braise[3], { glow: true });
        part(b, rr(8, 25, 23, 28, 1), M.fer, cyl(8, 23, 25, 28));
        // Étincelles.
        for (let i = 0; i < 4; i++) {
          const k = (f + i) % 4;
          const x = (i % 2 ? 24 : 6) + Math.round(hash(i, f, 9) * 3) - 1, y = 1 - k * 1.5 - (i > 1 ? 1 : 0);
          if (!get(b, x, Math.round(y))) set(b, x, Math.round(y), k < 2 ? M.braise[0] : M.braise[2], { glow: true });
        }
      },
      front(b) {
        hublot(b, 16, 14, 6, M.fer, M.braise);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; dot(b, Math.floor(16 + Math.cos(a) * 5.2), Math.floor(14 + Math.sin(a) * 5.2), M.fer[0]); }
      },
    },
    prospecteur: {
      nom: 'Prospecteur', detail: 'Caisse en planches cerclée de fer, lanterne et pioche',
      body: { x0: 4, x1: 27, y0: 7, y1: 25 }, hub: { cx: 15, cy: 15, r: 6 },
      back(b, f) {
        part(b, poly([[1, 8], [2.5, 7], [7.5, 22], [6, 23]]), M.bois, flat(1.5));
        part(b, poly([[-0.5, 9], [2, 6], [5, 5], [4, 7], [2, 8]]), M.acier, flat(1));
        const caisse = rr(4, 7, 27, 25, 2);
        part(b, caisse, M.bois, cyl(4, 27, 7, 25), { color: (x, y, t) => ((x - 4) % 5 === 4 ? M.bois[4] : hash(x, Math.floor(y / 3), 5) > 0.8 ? M.bois[Math.min(4, t + 1)] : null) });
        for (const yb of [9, 22]) {
          paint(b, and(caisse, rr(3, yb, 28, yb)), (x) => M.fonte[x < 9 ? 1 : x > 22 ? 3 : 2]);
          for (let x = 6; x <= 26; x += 5) dot(b, x, yb, M.fonte[0]);
        }
        part(b, rr(8, 25, 23, 28, 1), M.fonte, cyl(8, 23, 25, 28));
        part(b, rr(24, 4, 29, 4), M.fonte, flat(2));
        part(b, rr(29, 4, 29, 5), M.fonte, flat(2));
        part(b, rr(27, 6, 31, 11, 1), M.fonte, flat(2));
        const flame = [M.braise[0], M.braise[1], M.braise[0], M.or[1]][f];
        part(b, rr(28, 7, 30, 10), [flame, flame, M.braise[1], M.braise[2], M.braise[3]], (x, y) => (y < 9 ? 0 : 1.6), { glow: true, edge: 'none' });
      },
      front(b) { hublot(b, 15, 15, 6, M.laiton); },
    },
    cristal: {
      nom: 'Cristal', detail: 'Coque en quartz taillé, facettes qui scintillent, éclats sur le dessus',
      body: { x0: 3, x1: 28, y0: 7, y1: 26 }, hub: { cx: 16, cy: 16, r: 5.5 },
      back(b, f) {
        const shards = [
          [[5, 11], [8, 1], [11, 11], M.turquoise],
          [[11, 10], [15, -2], [19, 10], M.diamant],
          [[19, 11], [23, 2], [26, 11], M.turquoise],
        ];
        for (const [a, top, c, mat] of shards) part(b, poly([a, top, c]), mat, (x) => (x + 0.5 < top[0] ? 0.7 : 2.4));
        const gem = poly([[3, 13], [8, 7], [24, 7], [28.5, 13], [28.5, 21], [24, 26], [8, 26], [3, 21]]);
        part(b, gem, M.turquoise, cyl(3, 28, 7, 26));
        const facets = [[8, 7, 12, 13], [24, 7, 20, 13], [3, 13, 8, 17], [28, 13, 24, 17], [8, 26, 12, 21], [24, 26, 20, 21]];
        for (const [x0, y0, x1, y1] of facets) {
          const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
          for (let i = 0; i <= n; i++) dot(b, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), M.turquoise[0]);
        }
        part(b, rr(9, 25, 22, 28, 1), M.acier, cyl(9, 22, 25, 28));
        const tw = [[8, 3], [15, 0], [23, 4], [27, 15]][f];
        dot(b, tw[0], tw[1], '#ffffff', { glow: true });
      },
      front(b) { hublot(b, 16, 16, 5.5, M.diamant, M.turquoise); },
    },
    lampiste: {
      nom: 'Lampiste', detail: 'Lanterne de laiton à barreaux, flamme qui vacille derrière le verre',
      body: { x0: 4, x1: 27, y0: 6, y1: 25 }, hub: { cx: 15.5, cy: 15, r: 6 },
      back(b, f) {
        part(b, rr(11, 0, 20, 2, 1), M.laiton, cyl(11, 20, 0, 2));
        part(b, rr(13, 2, 18, 6), M.laiton, cyl(13, 18, 2, 6));
        part(b, rr(4, 6, 27, 25, 3), M.laiton, cyl(4, 27, 6, 25));
        for (const x of [7, 11, 20, 24]) for (let y = 8; y <= 23; y++) dot(b, x, y, M.laiton[(y + f) % 5 === 0 ? 1 : 4]);
        part(b, rr(7, 25, 24, 28, 1), M.cuivre, cyl(7, 24, 25, 28));
        const on = f % 2 === 0;
        dot(b, 15, 0, on ? M.braise[0] : M.braise[1], { glow: true });
      },
      front(b, f) {
        hublot(b, 15, 15, 6, M.laiton, M.braise);
        const fl = [[[15, 17], [15, 16], [15, 15], [14, 16], [16, 16]], [[15, 17], [15, 16], [15, 14], [14, 16], [16, 16]], [[15, 17], [15, 16], [15, 15], [14, 17], [16, 16]], [[15, 17], [15, 16], [15, 14], [16, 17], [14, 16]]][f];
        fl.forEach(([x, y], i) => dot(b, x, y, i < 2 ? M.or[0] : M.braise[1], { glow: true }));
      },
    },
  };

  // Une carrosserie par galerie du mois (src/gems.js) : bloc de roche sertie de la pierre du filon, couleurs prises de la pierre.
  const GEM_DRILLS = [{"id": "topaze", "one": "Topaze", "gem": ["#6a3a06", "#c8801c", "#ffc24a", "#fff0b8"]}, {"id": "rubis", "one": "Rubis", "gem": ["#4a0a14", "#a8142a", "#ff4a64", "#ffd0d8"]}, {"id": "peridot", "one": "Péridot", "gem": ["#1a4a05", "#5aa010", "#a8ee3a", "#eaffc0"]}, {"id": "opale", "one": "Opale", "gem": ["#4a3a8a", "#e0a8e8", "#a8f0e0", "#ffffff"]}, {"id": "aigue-marine", "one": "Aigue-marine", "gem": ["#0a4a5a", "#2aa8b8", "#7ae8e8", "#e0ffff"]}, {"id": "amethyste", "one": "Améthyste", "gem": ["#3a1a6a", "#7a32b0", "#c79bff", "#f3e0ff"]}, {"id": "citrine", "one": "Citrine", "gem": ["#7a4a06", "#d8921c", "#ffd04a", "#fff6c0"]}, {"id": "tourmaline", "one": "Tourmaline", "gem": ["#0a4a2a", "#d83a8a", "#5aeaa0", "#ffe0f0"]}, {"id": "grenat", "one": "Grenat", "gem": ["#3a0a10", "#8a1a24", "#d8383c", "#ffc0b8"]}, {"id": "onyx", "one": "Onyx", "gem": ["#08080e", "#2a2a44", "#6a6a9a", "#e8e8ff"]}, {"id": "emeraude", "one": "Émeraude", "gem": ["#05381c", "#118a45", "#4ade80", "#d4ffe4"]}, {"id": "saphir", "one": "Saphir", "gem": ["#0a1e5a", "#1e50c8", "#5a90ff", "#d8e8ff"]}];
  const mixHex = (a, b, k) => {
    const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [n(a), n(b)];
    return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
  };
  for (const g of GEM_DRILLS) {
    const mat = [g.gem[3], g.gem[2], g.gem[1], mixHex(g.gem[1], g.gem[0], 0.5), g.gem[0]];
    STYLES[`gemme-${g.id}`] = {
      nom: g.one, detail: `Bloc de roche serti de ${g.one.toLowerCase()}s taillées, couleurs de la galerie du mois`,
      body: { x0: 3, x1: 28, y0: 8, y1: 25 }, hub: { cx: 16, cy: 16, r: 5.8 },
      back(b, f) {
        const shards = [
          [[5, 10], [7.5, 2], [10, 10]],
          [[10, 9], [13, -1], [16, 9]],
          [[18, 9], [22, 1], [24, 10]],
          [[23, 11], [28.5, 4], [28.5, 12]],
        ];
        for (const [a, top, c] of shards) part(b, poly([a, top, c]), mat, (x) => (x + 0.5 < top[0] ? 0.5 : 2.2));
        const bloc = poly([[3, 11], [6, 8], [26, 8], [28.5, 11], [28.5, 22], [26, 26], [6, 26], [3, 23]]);
        part(b, bloc, M.pierre, cyl(3, 28, 8, 25));
        paint(b, bloc, (x, y) => { const n = hash(x, y, 5); return n > 0.84 ? mat[3] : n < 0.06 ? mat[1] : null; });
        part(b, rr(8, 25, 23, 28, 1), M.pierre, cyl(8, 23, 25, 28), { color: (x, y, t) => M.pierre[Math.min(4, t + 1)] });
        const tw = [[7, 4], [13, 1], [22, 3], [27, 7]][f];
        dot(b, tw[0], tw[1], '#ffffff', { glow: true });
      },
      front(b) { hublot(b, 16, 16, 5.8, M.pierre, mat); },
    };
  }

  // ---------- Blindages ----------
  const ARMORS = {
    aucun: { nom: 'Aucun', detail: 'Carrosserie nue' },
    plaques: {
      nom: 'Plaques rivetées', detail: 'Plaques d\'acier sur les flancs et le front',
      back(b, s) {
        const { x0, x1, y0, y1 } = s.body, h = s.hub;
        for (const [a, c] of [[x0 - 1, x0 + 4], [x1 - 4, x1 + 1]]) {
          part(b, rr(a, y0 + 4, c, y1 - 2, 1), M.acier, cyl(a, c, y0 + 4, y1 - 2));
          for (let y = y0 + 6; y <= y1 - 3; y += 4) rivet(b, Math.round((a + c) / 2), y, M.acier);
        }
        part(b, rr(h.cx - 7, h.cy - h.r - 2, h.cx + 6, h.cy - h.r + 1, 1), M.acier, cyl(h.cx - 7, h.cx + 6, h.cy - h.r - 2, h.cy - h.r + 1));
      },
    },
    lourd: {
      nom: 'Blindage lourd', detail: 'Épaulières, mentonnière et grille de hublot',
      back(b, s) {
        const { x0, x1, y0, y1 } = s.body;
        for (const [a, c] of [[x0 - 2, x0 + 3], [x1 - 3, x1 + 2]]) part(b, rr(a, y0 + 12, c, y1, 1), M.fonte, cyl(a, c, y0 + 12, y1));
        part(b, poly([[5, 23], [27, 23], [23, 29], [9, 29]]), M.fonte, cyl(5, 26, 23, 29));
        for (let x = 10; x <= 22; x += 4) rivet(b, x, 26, M.fonte);
        for (const [a, c] of [[x0 - 3, x0 + 6], [x1 - 6, x1 + 3]]) {
          part(b, rr(a, y0 + 1, c, y0 + 11, 3), M.fonte, cyl(a, c, y0 + 1, y0 + 11));
          part(b, rr(a + 1, y0 + 2, c - 1, y0 + 3, 1), M.acier, flat(0.8), { edge: 'none' });
          rivet(b, Math.round((a + c) / 2), y0 + 8, M.fonte);
        }
      },
      front(b, s) {
        const h = s.hub;
        for (const dx of [-2, 1]) for (let y = Math.ceil(h.cy - h.r + 1.5); y <= Math.floor(h.cy + h.r - 1.5); y++) {
          const x = Math.round(h.cx + dx - 0.5);
          if (circ(h.cx, h.cy, h.r - 1.4)(x, y)) dot(b, x, y, M.fonte[3]);
        }
      },
    },
    pointes: {
      nom: 'Hérisson', detail: 'Plaques et pointes d\'acier tout autour',
      back(b, s) {
        const { x0, x1, y0 } = s.body;
        for (const y of [y0 + 5, y0 + 10, y0 + 15]) {
          part(b, poly([[x0 + 1, y - 1.8], [x0 - 4, y + 0.5], [x0 + 1, y + 2.2]]), M.acier, (x, yy) => (yy + 0.5 < y + 0.5 ? 0.4 : 2.2));
          part(b, poly([[x1, y - 1.8], [x1 + 5, y + 0.5], [x1, y + 2.2]]), M.acier, (x, yy) => (yy + 0.5 < y + 0.5 ? 0.4 : 2.2));
        }
        for (const cx of [x0 + 4, x1 - 3]) part(b, poly([[cx - 2, y0 + 1], [cx + 0.5, y0 - 4], [cx + 3, y0 + 1]]), M.acier, (x) => (x + 0.5 < cx + 0.5 ? 0.4 : 2.2));
        ARMORS.plaques.back(b, s);
      },
    },
    ecailles: {
      nom: 'Carapace', detail: 'Écailles de dragon qui couvrent toute la coque',
      back(b, s) {
        const { x0, x1, y0, y1 } = s.body, h = s.hub;
        const zone = (x, y) => x > x0 && x < x1 && y > y0 && y < y1 && !circ(h.cx, h.cy, h.r + 1.2)(x, y);
        paint(b, zone, (x, y, c) => {
          if (c === INK) return null;
          const row = Math.floor((y - y0) / 3), ly = (y - y0) % 3, lx = ((x - x0 + (row % 2) * 2) % 4 + 4) % 4;
          if (ly === 2 || lx === 0) return M.ecaille[4];
          const u = (x - x0) / (x1 - x0);
          const base = u < 0.3 ? 1 : u < 0.7 ? 2 : 3;
          return M.ecaille[Math.max(0, base - (ly === 0 && lx < 3 ? 1 : 0))];
        });
      },
    },
  };

  // ---------- Forets (4 images d'animation) ----------
  function cone(b, axis, hwTop, yTop, yTip, f, dir = 1, opts = {}) {
    const hw = (py) => hwTop * (1 - (py - yTop) / (yTip - yTop));
    const mask = poly([[axis - hwTop, yTop], [axis + hwTop, yTop], [axis + 0.6, yTip], [axis - 0.6, yTip]]);
    part(b, mask, opts.mat || M.acier, (x, y) => { const w = Math.max(0.8, hw(y + 0.5)); return lerpCurve(Math.min(1, Math.max(0, 0.5 + (x + 0.5 - axis) / (2 * w)))); }, {
      color: opts.color || ((x, y, t) => {
        const g = (((y * 2 + (x - axis) * dir + f * 2 * dir) % 8) + 8) % 8;
        return g < 2 ? M.acier[Math.min(4, t + 2)] : g === 2 ? M.acier[Math.max(0, t - 1)] : null;
      }),
    });
    return hw;
  }
  const BITS = {
    spirale: { nom: 'Spirale', detail: 'Le cône classique à rainures', draw: (b, f) => cone(b, 16, 9, 29, 46.6, f) },
    tariere: {
      nom: 'Tarière', detail: 'Longue vis à filets qui remonte les déblais',
      draw(b, f) {
        part(b, rr(14, 29, 17, 44), M.fonte, cyl(14, 17, 29, 44));
        for (let k = 0; k < 6; k++) {
          const yk = 29 + k * 3.4 - f * 0.85;
          const hw = 8.2 - (yk - 29) * 0.3;
          if (yk < 28.5 || yk > 44) continue;
          part(b, (x, y) => { const s = y + 0.5 - (yk + (x + 0.5 - 16) * 0.22); return s >= 0 && s < 1.8 && Math.abs(x + 0.5 - 16) <= hw && y >= 29 && y <= 45; }, M.acier, (x) => lerpCurve(0.5 + (x + 0.5 - 16) / (2 * hw)));
        }
        part(b, poly([[14, 44], [18, 44], [16.6, 47.2], [15.4, 47.2]]), M.acier, cyl(14, 17, 44, 47));
      },
    },
    tricone: {
      nom: 'Tricône', detail: 'Trois molettes à dents qui tournent, comme en forage pétrolier',
      draw(b, f) {
        const dents = (x, y, t) => ((x + y + f) % 3 === 0 && ((x - y) & 1) === 0 ? '#f4f6fa' : (x + y + f) % 3 === 1 && ((x - y) & 1) === 1 ? M.acier[4] : null);
        part(b, poly([[6, 31], [15, 31], [10, 40]]), M.acier, cyl(6, 15, 31, 40), { color: dents });
        part(b, poly([[17, 31], [26, 31], [22, 40]]), M.acier, cyl(17, 26, 31, 40), { color: dents });
        part(b, rr(9, 29, 22, 32, 1), M.fonte, cyl(9, 22, 29, 32));
        part(b, poly([[10.5, 33], [21.5, 33], [16.6, 46.6], [15.4, 46.6]]), M.acier, cyl(10, 21, 33, 46), { color: dents });
      },
    },
    couronne: {
      nom: 'Couronne diamant', detail: 'Cylindre serti de diamants qui scintillent',
      draw(b, f) {
        part(b, rr(8, 29, 23, 41, 1), M.acier, cyl(8, 23, 29, 41));
        paint(b, rr(8, 33, 23, 35), (x, y) => ((x + f * 2 + (y === 34 ? 2 : 0)) % 4 === 0 ? M.turquoise[1] : M.fonte[x < 12 ? 2 : x > 19 ? 4 : 3]));
        for (let i = 0; i < 5; i++) {
          const xc = 9.5 + i * 3.25;
          part(b, poly([[xc - 1.6, 41.5], [xc + 1.6, 41.5], [xc, 45.5]]), M.turquoise, (x) => (x + 0.5 < xc ? 0.4 : 2.2));
          if (i === (f * 2) % 5 || i === (f * 2 + 3) % 5) dot(b, Math.floor(xc) - (i % 2), 42, '#ffffff', { glow: true });
        }
      },
    },
    carotteuse: {
      nom: 'Carotteuse', detail: 'Tube creux qui remonte une carotte de roche',
      draw(b, f) {
        const couches = ['#b08a5a', '#8a6a4a', '#c9a878', '#6a5040'];
        part(b, rr(11, 31, 20, 44), ['#c9a878', '#b08a5a', '#8a6a4a', '#6a5040', '#4a3828'], cyl(11, 20, 31, 44), { color: (x, y, t) => (t >= 3 ? null : couches[(Math.floor((y + f) / 2) % 4 + 4) % 4]) });
        part(b, rr(8, 29, 10, 44), M.acier, cyl(8, 10, 29, 44));
        part(b, rr(21, 29, 23, 44), M.acier, cyl(21, 23, 29, 44));
        part(b, rr(7, 29, 24, 31, 1), M.fonte, cyl(7, 24, 29, 31));
        for (const x0 of [8, 21]) part(b, poly([[x0, 44.5], [x0 + 3, 44.5], [x0 + 1.5, 47.2]]), M.or, (x) => (x + 0.5 < x0 + 1.5 ? 0.5 : 2));
      },
    },
    tambour: {
      nom: 'Tambour', detail: 'Large tête de tunnelier à molettes, pour les gros chantiers',
      draw(b, f) {
        part(b, rr(13, 29, 18, 31), M.fonte, cyl(13, 18, 29, 31));
        part(b, rr(1, 31, 30, 39, 3), M.fonte, cyl(1, 30, 31, 39));
        for (let i = 0; i < 5; i++) {
          const cx = 4.5 + i * 5.75;
          part(b, circ(cx, 35, 2.4), M.or, sph(cx, 35, 2.4));
          const a = (f / 4) * Math.PI * 2 + i;
          dot(b, Math.floor(cx + Math.cos(a) * 1.2), Math.floor(35 + Math.sin(a) * 1.2), M.or[4]);
        }
        for (let x = 2; x <= 29; x++) {
          if ((x + f) % 3 === 0) { set(b, x, 40, x < 16 ? M.acier[0] : M.acier[2]); if (x > 3 && x < 28) set(b, x, 41, M.acier[3]); }
        }
      },
    },
    double: {
      nom: 'Double foret', detail: 'Deux cônes qui tournent en sens contraire',
      draw(b, f) {
        cone(b, 10, 5.2, 31, 45, f, 1);
        cone(b, 22, 5.2, 31, 45, f, -1);
        part(b, rr(4, 29, 27, 31, 1), M.fonte, cyl(4, 27, 29, 31));
      },
    },
    fraise: {
      nom: 'Fraise à dents', detail: 'Cône hérissé de dents en carbure doré',
      draw(b, f) {
        const hw = (py) => 9 * (1 - (py - 29) / 17.6);
        for (let y = 31; y <= 43; y++) if ((y + f) % 4 < 2) {
          const w = hw(y + 0.5);
          set(b, Math.floor(16 - w) - 1, y, M.or[1]);
          set(b, Math.ceil(16 + w), y, M.or[3]);
        }
        cone(b, 16, 9, 29, 46.6, f, 1, {
          color: (x, y, t) => ((y + f) % 3 === 0 && ((x + y) & 1) === 0 ? M.or[Math.min(4, t)] : (y + f) % 3 === 1 && ((x + y) & 1) === 0 ? M.acier[4] : null),
        });
      },
    },
    plasma: {
      nom: 'Plasma', detail: 'Buse à bobines de cuivre qui fond la roche',
      draw(b, f) {
        for (let y = 37; y <= 47; y++) {
          const w = 1.4 + 0.9 * Math.abs(Math.sin(y * 1.3 + f * 1.7)) + (y > 44 ? (y - 44) * 0.9 : 0);
          for (let x = 8; x <= 24; x++) {
            const d = Math.abs(x + 0.5 - 16);
            if (d <= w * 0.55) set(b, x, y, '#ffffff', { glow: true });
            else if (d <= w) set(b, x, y, '#8ff8ff', { glow: true });
            else if (d <= w + 1.1) set(b, x, y, '#2fb8e8', { glow: true, alpha: 0.85 });
          }
        }
        for (let i = 0; i < 6; i++) {
          const x = 10 + Math.floor(hash(i, f, 2) * 12), y = 38 + Math.floor(hash(i, f, 4) * 9);
          if (!get(b, x, y)) set(b, x, y, i % 2 ? '#ffffff' : '#5ef2ff', { glow: true });
        }
        const buse = poly([[9, 29], [23, 29], [19.5, 37], [12.5, 37]]);
        part(b, buse, M.fonte, cyl(9, 22, 29, 37));
        paint(b, and(buse, or(rr(0, 31, 31, 31), rr(0, 34, 31, 34))), (x) => M.cuivre[x < 13 ? 1 : x > 18 ? 3 : 2]);
        for (let x = 13; x <= 18; x++) dot(b, x, 36, f % 2 ? '#b8fbff' : '#5ef2ff', { glow: true });
      },
    },
  };

  // ---------- Assemblage ----------
  function build(styleKey, armorKey, bitKey, f, fBit = f) {
    const b = buf();
    const s = typeof styleKey === 'string' ? STYLES[styleKey] : styleKey, a = ARMORS[armorKey];
    (typeof bitKey === 'string' ? BITS[bitKey] : bitKey).draw(b, fBit);
    s.back(b, f);
    if (a.back) a.back(b, s, f);
    s.front(b, f);
    if (a.front) a.front(b, s, f);
    // Contour extérieur à l'encre.
    const out = [];
    for (let y = -5; y <= 48; y++) for (let x = -1; x <= 32; x++) {
      if (get(b, x, y)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const c = get(b, x + dx, y + dy); return c && c.o; })) out.push([x, y]);
    }
    for (const [x, y] of out) set(b, x, y, INK);
    return b;
  }


  // ---------- Foreuses de fête : carrosserie, foret et effet animé autour de la pointe ----------
  const FUR = ['#ffffff', '#f4f4f8', '#d8dce8', '#aab0c4', '#7a8098'];
  const ROSE = ['#ffe0ee', '#ff9ac8', '#e8508f', '#a82a64', '#6a1440'];
  const SAPIN = ['#c8f0a0', '#5fbf4a', '#2f8a3a', '#1d5a2a', '#103a1c'];
  const POTION = ['#e8ffb0', '#a8ff5a', '#5fe03a', '#2fa020', '#1a6010'];
  const PASTEL = ['#fffbe0', '#fff0a0', '#f0d060', '#c8a030', '#8a6a10'];
  const CIEL = ['#f0faff', '#b8e4ff', '#7ac0f0', '#4a8ac8', '#2a5a90'];
  const NUIT = ['#6a6a9a', '#3a3a62', '#26264a', '#181830', '#0c0c18'];
  const ARDOISE = ['#7aa88a', '#4a7a5e', '#30584a', '#1e3c30', '#10241c'];
  const CHALK = '#eef4ea';

  const groove = (x, y, f, dir = 1) => (((y * 2 + (x - 16) * dir + f * 2 * dir) % 8) + 8) % 8;
  const coneBit = (colorOf) => ({ draw: (b, f) => cone(b, 16, 9, 29, 46.6, f, 1, { color: (x, y, t) => colorOf(x, y, t, f) }) });
  const FBITS = {
    spirale: BITS.spirale,
    sorciere: coneBit((x, y, t, f) => (groove(x, y, f) < 3 ? '#2a1838' : M.amethyste[t])),
    citrouille: coneBit((x, y, t, f) => (groove(x, y, f) < 3 ? '#1b1410' : M.orange[t])),
    sucre: coneBit((x, y, t, f) => (groove(x, y, f) < 4 ? FUR[t] : M.rouge[t])),
    dore: coneBit((x, y, t, f) => (groove(x, y, f) < 2 ? M.or[Math.min(4, t + 2)] : M.or[t])),
    rose: coneBit((x, y, t, f) => (groove(x, y, f) < 2 ? ROSE[Math.min(4, t + 2)] : ROSE[t])),
    paques: coneBit((x, y, t, f) => [ROSE, CIEL, PASTEL][((Math.floor((y + f) / 3) % 3) + 3) % 3][t]),
  };

  const FSTYLES = {
    chaudron: {
      hub: { cx: 16, cy: 18, r: 5 },
      back(b, f) {
        part(b, rr(5, 25, 8, 28), M.fer, cyl(5, 8, 25, 28));
        part(b, rr(23, 25, 26, 28), M.fer, cyl(23, 26, 25, 28));
        part(b, rr(11, 26, 20, 28), M.fer, cyl(11, 20, 26, 28));
        part(b, (x, y) => ((x + 0.5 - 16) / 13) ** 2 + ((y + 0.5 - 7.5) / 2.6) ** 2 <= 1, POTION, (x, y) => (y < 7 ? 0.5 : 1.6), { glow: true, edge: 'none' });
        part(b, and(circ(16, 13, 14.5), rr(2, 9, 29, 27)), M.fer, sph(16, 13, 14.5));
        part(b, rr(0, 8, 31, 10, 2), M.fer, cyl(0, 31, 8, 10), { color: (x, y, t) => M.fer[Math.max(0, t - 1)] });
        for (const [x, len] of [[6, 1 + (f % 3)], [24, 1 + ((f + 1) % 3)]]) for (let y = 11; y < 11 + len; y++) dot(b, x, y, POTION[2], { glow: true });
        const bub = [[9, 5], [15, 4], [21, 5], [12, 6]];
        const [bx, by] = bub[f];
        dot(b, bx, by - 1, POTION[1], { glow: true }); dot(b, bx - 1, by, POTION[1], { glow: true }); dot(b, bx + 1, by, POTION[1], { glow: true });
      },
      front(b) { hublot(b, 16, 18, 5, M.fer, POTION); },
    },
    citrouille: {
      hub: { cx: 16, cy: 16, r: 5 },
      back(b, f) {
        part(b, rr(8, 25, 23, 28, 1), SAPIN, cyl(8, 23, 25, 28), { color: (x, y, t) => SAPIN[Math.min(4, t + 1)] });
        part(b, rr(14, 3, 17, 8), SAPIN, cyl(14, 17, 3, 8), { color: (x, y, t) => SAPIN[Math.min(4, t + 1)] });
        const corps = rr(2, 7, 29, 26, 8);
        part(b, corps, M.orange, cyl(2, 29, 7, 26));
        paint(b, and(corps, (x, y) => (x === 8 || x === 23 || x === 15) && y > 8 && y < 25), () => M.orange[3]);
        part(b, poly([[17, 5], [23, 1], [21.5, 6]]), SAPIN, flat(1.2));
        const lum = [M.braise[0], M.braise[1], M.braise[0], M.or[1]][f];
        const face = or(poly([[7, 16], [13.5, 16], [10.2, 10.5]]), poly([[18.5, 16], [25, 16], [21.8, 10.5]]), poly([[14.5, 18.5], [17.5, 18.5], [16, 16.5]]),
          and(rr(7, 19, 24, 22, 1), not(or(rr(10, 19, 11, 19), rr(20, 19, 21, 19), rr(15, 22, 16, 22)))));
        paint(b, and(corps, face), (x, y) => (y >= 20 ? M.braise[1] : lum), { glow: true, outline: true });
      },
      front() {},
    },
    noel: {
      hub: { cx: 16, cy: 14, r: 4.8 },
      back(b) {
        part(b, rr(8, 25, 23, 28, 1), M.fonte, cyl(8, 23, 25, 28));
        part(b, poly([[6, 7], [25, 7], [22, 1], [27, -3], [17, -1]]), M.rouge, cyl(6, 25, -3, 7));
        part(b, circ(27.5, -3, 2), FUR, sph(27.5, -3, 2));
        const corps = rr(3, 7, 28, 25, 5);
        part(b, corps, M.rouge, cyl(3, 28, 7, 25));
        part(b, or(rr(2, 6, 29, 9, 2), ...[4, 7, 10, 13, 16, 19, 22, 25, 28].map((x) => circ(x, 9.6, 1.4))), FUR, cyl(2, 29, 6, 10));
        paint(b, and(corps, rr(3, 22, 28, 25)), (x) => FUR[x < 8 ? 1 : x > 23 ? 3 : 2]);
        paint(b, and(corps, rr(3, 19, 28, 20)), () => '#1b1410');
        part(b, and(rr(13, 18, 18, 21), not(rr(15, 19, 16, 20))), M.or, cyl(13, 18, 18, 21));
      },
      front(b) { hublot(b, 16, 14, 4.8); },
    },
    sapin: {
      hub: { cx: 16, cy: 18, r: 4.6 },
      back(b, f) {
        part(b, rr(12, 25, 19, 28), M.bois, cyl(12, 19, 25, 28));
        part(b, poly([[16, 9], [30.5, 25.5], [1.5, 25.5]]), SAPIN, cyl(1, 30, 9, 25));
        part(b, poly([[16, 3.5], [27, 16.5], [5, 16.5]]), SAPIN, cyl(5, 27, 3, 16));
        part(b, poly([[16, -1], [24, 9.5], [8, 9.5]]), SAPIN, cyl(8, 24, -1, 9));
        const cols = [M.rouge[1], M.or[1], M.turquoise[1], ROSE[1]];
        let i = 0;
        for (const [y, x0, x1] of [[8, 10, 22], [15, 7, 25], [24, 4, 28]]) for (let x = x0; x <= x1; x += 3) dot(b, x, y, cols[(i++ + f) % 4], { glow: true });
        const star = ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'];
        star.forEach((row, r) => [...row].forEach((ch, c) => ch === 'y' && dot(b, 14 + c, -5 + r, f % 2 ? M.or[0] : M.or[1], { glow: true })));
      },
      front(b) { hublot(b, 16, 18, 4.6, M.or, M.rouge); },
    },
    cupidon: {
      hub: { cx: 16, cy: 15, r: 5 },
      back(b, f) {
        const flap = f % 2;
        part(b, poly([[4, 12], [-0.5, 7 + flap], [0, 13], [-0.5, 17 - flap], [4, 16]]), FUR, flat(1.4));
        part(b, poly([[28, 12], [32.5, 7 + flap], [32, 13], [32.5, 17 - flap], [28, 16]]), FUR, flat(2.2));
        part(b, or(circ(10.5, 12, 6.8), circ(21.5, 12, 6.8), poly([[3.9, 14], [28.1, 14], [16, 27.6]])), ROSE, cyl(3, 28, 5, 26));
        part(b, rr(11, 26, 20, 28, 1), M.fonte, cyl(11, 20, 26, 28));
      },
      front(b) { hublot(b, 16, 15, 5, ROSE, M.verre); },
    },
    nicolas: {
      hub: { cx: 16, cy: 17, r: 5.3 },
      back(b) {
        part(b, rr(29, 2, 30, 27), M.or, cyl(29, 30, 2, 27));
        part(b, and(circ(27.8, 2, 2.6), not(circ(27.8, 2, 1.2))), M.or, sph(27.8, 2, 2.6));
        part(b, rr(8, 25, 23, 28, 1), M.or, cyl(8, 23, 25, 28));
        const mitre = poly([[8, 11], [8, 3], [16, -3.5], [24, 3], [24, 11]]);
        part(b, mitre, M.rouge, cyl(8, 24, -3, 11));
        paint(b, and(mitre, (x, y) => x === 8 || x === 23 || x === 15 || x === 16 || y === 10), (x) => M.or[x < 12 ? 1 : x > 20 ? 3 : 2]);
        for (const [x, y] of [[14, 3], [17, 3], [13, 3], [18, 3]]) dot(b, x, y, M.or[1]);
        const corps = rr(3, 10, 28, 25, 4);
        part(b, corps, M.rouge, cyl(3, 28, 10, 25));
        paint(b, and(corps, (x) => x === 6 || x === 25), () => M.or[2]);
      },
      front(b) { hublot(b, 16, 17, 5.3, M.or); },
    },
    paques: {
      hub: { cx: 16, cy: 15, r: 5 },
      back(b) {
        for (const [p, inner] of [[[[9, 6], [7, -4], [11, -4], [12, 6]], rr(9, -2, 10, 3)], [[[20, 6], [21, -4], [25, -4], [23, 6]], rr(22, -2, 23, 3)]]) {
          part(b, poly(p), FUR, flat(1.3));
          paint(b, inner, () => ROSE[1]);
        }
        part(b, rr(10, 25, 21, 28, 1), CIEL, cyl(10, 21, 25, 28));
        const oeuf = (x, y) => ((x + 0.5 - 16) / 13.2) ** 2 + ((y + 0.5 - 16) / (y + 0.5 < 16 ? 11.5 : 10.5)) ** 2 <= 1;
        part(b, oeuf, PASTEL, cyl(3, 28, 4, 26));
        paint(b, and(oeuf, (x, y) => y === 8 + ((x >> 1) & 1) || y === 9 + ((x >> 1) & 1)), (x) => ROSE[x < 9 ? 1 : x > 22 ? 3 : 2]);
        paint(b, and(oeuf, (x, y) => (y === 21 || y === 22) && x % 4 < 2), (x) => CIEL[x < 9 ? 1 : x > 22 ? 3 : 2]);
      },
      front(b) { hublot(b, 16, 15, 5, PASTEL); },
    },
    nouvelan: {
      hub: { cx: 16, cy: 14.5, r: 5.5 },
      back(b) {
        part(b, rr(8, 25, 23, 28, 1), M.or, cyl(8, 23, 25, 28));
        const chap = poly([[10.5, 7], [21.5, 7], [16, -3]]);
        part(b, chap, ROSE, cyl(10, 21, -3, 7), { color: (x, y, t) => (((x + y) % 4 + 4) % 4 < 2 ? M.or[t] : null) });
        part(b, circ(16, -3.6, 1.5), M.turquoise, flat(0.8), { glow: true });
        const corps = rr(3, 6, 28, 25, 5);
        part(b, corps, NUIT, cyl(3, 28, 6, 25));
        paint(b, and(corps, (x, y) => y === 8 || y === 22), (x) => M.or[x < 8 ? 1 : x > 23 ? 3 : 2]);
        paint(b, corps, (x, y) => (hash(x, y, 11) > 0.92 ? [M.or[1], ROSE[1], M.turquoise[1]][Math.floor(hash(x, y, 12) * 3)] : null));
      },
      front(b, f) {
        part(b, circ(16, 14.5, 5.5), M.or, sph(16, 14.5, 5.5), { edge: 'ink' });
        part(b, circ(16, 14.5, 4), ['#ffffff', '#f6f2e8', '#e6dcc8', '#c8bea2', '#a49a80'], flat(1));
        for (const [x, y] of [[15, 11], [16, 11], [19, 14], [12, 14], [15, 17], [16, 17]]) dot(b, x, y, '#8a7a5a');
        for (let k = 0; k <= 2; k++) dot(b, 15, 14 - k, INK);
        const a = -Math.PI / 2 - (3 - f) * 0.25;
        for (let k = 1; k <= 3; k++) dot(b, Math.round(15.5 + Math.cos(a) * k - 0.5 + 0.5), Math.round(14 + Math.sin(a) * k), M.rouge[2]);
      },
    },
    gille: {
      hub: { cx: 16, cy: 16.5, r: 5 },
      back(b, f) {
        part(b, rr(8, 25, 23, 28, 1), M.fonte, cyl(8, 23, 25, 28));
        for (const i of [-3, 3, -2, 2, -1, 1, 0]) {
          const x0 = 16 + i * 1.5, x1 = 16 + i * 4.4, y1 = -3.6 + Math.abs(i) * 0.9 + (i === 0 ? -0.6 : 0);
          const plume = or(...[0, 0.2, 0.4, 0.6, 0.8, 1].map((s) => circ(x0 + (x1 - x0) * s, 6 + (y1 - 6) * s, 1.2 + s * 1.1)));
          part(b, plume, FUR, (x, y) => (x + 0.5 < x1 ? 0.3 : 1.4) + (y > 3 ? 0.8 : 0), { color: (x, y, t) => (y < y1 - 0.5 && (i + f) % 3 === 0 ? CIEL[t] : null) });
        }
        part(b, rr(10, 5, 21, 7), M.fonte, cyl(10, 21, 5, 7));
        const corps = rr(3, 8, 28, 25, 4);
        part(b, corps, M.jaune, cyl(3, 28, 8, 25));
        paint(b, and(corps, (x, y) => (((x + y) % 6) + 6) % 6 === 0 || (((x - y) % 6) + 6) % 6 === 0), (x) => M.rouge[x < 8 ? 1 : x > 23 ? 3 : 2]);
        part(b, and(rr(2, 7, 29, 11), (x, y) => y < 10 || (x % 3 === 1)), FUR, cyl(2, 29, 7, 11));
        for (let x = 5; x <= 26; x += 3) dot(b, x, 23, (x + f) % 2 ? M.or[0] : M.or[2], { glow: (x + f) % 2 === 1 });
      },
      front(b) { hublot(b, 16, 16.5, 5); },
    },
    pi: {
      hub: { cx: 16, cy: 14, r: 5 },
      back(b) {
        part(b, rr(8, 25, 23, 28, 1), M.bois, cyl(8, 23, 25, 28));
        const corps = rr(3, 6, 28, 25, 3);
        part(b, corps, ARDOISE, cyl(3, 28, 6, 25));
        paint(b, and(corps, not(rr(5, 8, 26, 23, 1))), (x) => M.bois[x < 8 ? 1 : x > 23 ? 3 : 2]);
        const glyph = (rows, x0, y0) => rows.forEach((row, r) => [...row].forEach((ch, c) => ch === 'w' && dot(b, x0 + c, y0 + r, CHALK)));
        glyph(['wwwww', '.w.w.', '.w.w.', '.w.w.', 'w..w.'], 5, 16);
        glyph(['wwww', 'w...', '.w..', 'w...', 'wwww'], 23, 16);
        part(b, rr(11, 4, 20, 6), NUIT, cyl(11, 20, 4, 6));
        part(b, poly([[6, 3.5], [16, 0.5], [26, 3.5], [16, 6]]), NUIT, flat(1.5));
        for (let y = 3; y <= 9; y++) dot(b, 24, y, M.or[y > 7 ? 2 : 1]);
        dot(b, 25, 9, M.or[2]); dot(b, 23, 9, M.or[2]);
      },
      front(b) { hublot(b, 16, 14, 5); },
    },
    poisson: {
      hub: { cx: 16, cy: 16, r: 5 },
      back(b, f) {
        const wag = f % 2 ? 1 : 0;
        part(b, poly([[16, 8], [7 + wag, -3], [11, -1], [16, 2], [21, -1], [25 + wag, -3]]), M.orange, flat(1.4), { color: (x, y, t) => (y < 0 ? '#1b1410' : null) });
        part(b, poly([[4, 15], [-0.5, 20 + wag], [4, 21]]), M.orange, flat(1.2));
        part(b, poly([[28, 15], [32.5, 20 + wag], [28, 21]]), M.orange, flat(2.4));
        part(b, rr(11, 25, 20, 28, 1), M.orange, cyl(11, 20, 25, 28), { color: (x, y, t) => M.orange[Math.min(4, t + 1)] });
        const corps = (x, y) => ((x + 0.5 - 16) / 12.6) ** 2 + ((y + 0.5 - 15.2) / 10.8) ** 2 <= 1;
        part(b, corps, M.orange, cyl(3, 28, 4, 26));
        paint(b, and(corps, (x, y) => y >= 9 && y <= 12), (x, y) => (y === 9 || y === 12 ? '#1b1410' : FUR[x < 9 ? 1 : x > 22 ? 3 : 2]));
        paint(b, and(corps, (x, y) => y >= 19 && y <= 22), (x, y) => (y === 19 || y === 22 ? '#1b1410' : FUR[x < 9 ? 1 : x > 22 ? 3 : 2]));
      },
      front(b) { hublot(b, 16, 16, 5, M.orange); },
    },
    gateau: {
      hub: { cx: 16, cy: 20, r: 4.2 },
      back(b, f) {
        part(b, rr(1, 25, 30, 27, 1), M.acier, cyl(1, 30, 25, 27));
        for (const [x, c] of [[10, M.turquoise], [15, ROSE], [21, M.or]]) {
          part(b, rr(x, 1, x + 1, 6), c, cyl(x, x + 1, 1, 6), { color: (xx, y, t) => (y % 2 ? FUR[t] : null) });
          const fl = (f + x) % 3;
          dot(b, x + (fl === 1 ? 1 : 0), -1, M.or[0], { glow: true });
          dot(b, x, 0, M.braise[1], { glow: true }); dot(b, x + 1, 0, M.braise[fl === 2 ? 0 : 1], { glow: true });
        }
        const bas = rr(2, 15, 29, 25, 2);
        part(b, bas, ROSE, cyl(2, 29, 15, 25));
        paint(b, and(bas, (x, y) => y <= 16 || (y === 17 && x % 4 === 1) || (y === 18 && x % 8 === 1)), (x) => FUR[x < 8 ? 1 : x > 23 ? 3 : 2]);
        part(b, rr(6, 7, 25, 14, 2), FUR, cyl(6, 25, 7, 14));
        for (const x of [8, 13, 18, 23]) { dot(b, x, 7, M.rouge[1]); dot(b, x, 8, M.rouge[2]); }
      },
      front(b) { hublot(b, 16, 20, 4.2, FUR); },
    },
  };

  // Petits sprites d'effets.
  const FX = {
    heart: ['.r.r.', 'rwrrr', 'rrrrr', '.rrr.', '..r..'],
    heartS: ['r.r', 'rrr', '.r.'],
    snow: ['.w.', 'www', '.w.'],
    star: ['.y.', 'yWy', '.y.'],
    batUp: ['k.....k', 'kk.k.kk', '.kkekk.', '..k.k..'],
    batDown: ['.......', '.kkkkk.', 'kkkekkk', 'k..k..k'],
    ghost: ['.www.', 'wwwww', 'wkwkw', 'wwwww', 'wwwww', 'w.w.w'],
    ring: ['.g.', 'g.g', '.g.'],
    coin: ['.oo.', 'oOOo', 'oOOo', '.oo.'],
    speculoos: ['bbbb', 'bBbB', 'bbbb'],
    mandarine: ['.v.', 'ooo', 'ooo', '.o.'],
    orange: ['.vo.', 'oOoo', 'oooo', '.oo.'],
    chick: ['.yy.', 'yyke', 'yyy.', '.yy.'],
    egg: ['.p.', 'ppp', 'qqq', '.p.'],
    fish: ['.www.w', 'wkwwww', '.www.w'],
    balloon: ['.bb.', 'bWbb', 'bbbb', '.bb.', '..l.', '..l.'],
  };
  const DIGITS = {
    3: ['ww', '.w', 'ww', '.w', 'ww'], '.': ['.', '.', '.', '.', 'w'], 1: ['.w', 'ww', '.w', '.w', '.w'], 4: ['w.w', 'w.w', 'www', '..w', '..w'],
    5: ['ww', 'w.', 'ww', '.w', 'ww'], 9: ['ww', 'ww', 'ww', '.w', 'ww'], 2: ['ww', '.w', 'ww', 'w.', 'ww'], 6: ['ww', 'w.', 'ww', 'ww', 'ww'],
    8: ['ww', 'ww', '..', 'ww', 'ww'], 7: ['ww', '.w', '.w', '.w', '.w'],
  };
  const PI_DIGITS = '3.14159265358979';

  // Scène : 52 × 84 pixels, pointe de la foreuse en (26, 60).
  let SW = 52, SH = 84, TIPX = 26, TIPY = 60;
  /** Particules sans état : chacune renaît toutes les L images, avec un décalage. */
  function each(N, L, t, fn) {
    for (let i = 0; i < N; i++) {
      const tt = t + (i * L) / N, cycle = Math.floor(tt / L), age = tt - cycle * L;
      fn(i, age / L, age, hash(i, cycle, 31), hash(i, cycle, 47));
    }
  }
  const EFFECTS = {
    chaudron(P, t) {
      each(6, 28, t, (i, u, age, a, c) => {
        const x = TIPX - 10 + a * 20 + Math.sin(age * 0.5 + i) * 1.5, y = TIPY - u * 46;
        P.spr(x, y, u > 0.9 ? FX.ring : [u > 0.5 ? 'g' : 'G'], { g: POTION[1], G: POTION[2] }, true, i % 2);
      });
      each(3, 36, t, (i, u, age, a) => {
        const dir = i % 2 ? 1 : -1;
        const x = TIPX + dir * (u * 26) - 3, y = TIPY - 2 - u * 34 - Math.sin(u * 9) * 2;
        P.spr(x, y, Math.floor(t / 3) % 2 ? FX.batUp : FX.batDown, { k: '#8a6ab8', e: '#ff4a4a' }, false, 1);
      });
    },
    citrouille(P, t) {
      each(3, 44, t, (i, u, age, a) => {
        const x = TIPX - 3 + (i - 1) * 9 + Math.sin(age * 0.25 + i * 2) * 3, y = TIPY - 2 - u * 52;
        P.spr(x, y, FX.ghost, { w: '#eef2ff', k: '#2a2440' }, false, 1, u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 0.85);
      });
    },
    noel(P, t) {
      each(14, 70, t, (i, u, age, a) => {
        const x = (a * SW + Math.sin(age * 0.15 + i) * 2) % SW, y = u * SH - 2;
        P.spr(x, y, i % 3 ? ['w'] : FX.snow, { w: '#ffffff' }, false, i % 2);
      });
      each(4, 12, t, (i, u, age, a) => P.spr(TIPX - 2 + (a - 0.5) * 14, TIPY - 2 + (hash(i, 9) - 0.5) * 6, u < 0.5 ? FX.star : ['W'], { y: M.or[1], W: '#ffffff' }, true, 1));
    },
    sapin(P, t) {
      each(6, 34, t, (i, u, age, a) => {
        const x = TIPX - 1 + (a - 0.5) * 30 * u, y = TIPY - u * 44;
        P.spr(x, y, Math.floor(age / 3 + i) % 3 ? FX.star : ['W'], { y: M.or[1], W: '#ffffff' }, true, i % 2);
      });
    },
    cupidon(P, t) {
      each(7, 32, t, (i, u, age, a) => {
        const x = TIPX - 2 + (a - 0.5) * 34 * Math.sqrt(u) + Math.sin(age * 0.4 + i) * 1.5, y = TIPY - 1 - u * 48;
        const big = i % 3 === 0;
        P.spr(x, y, big ? FX.heart : FX.heartS, { r: i % 2 ? ROSE[1] : M.rouge[1], w: '#ffffff' }, true, i % 2, u > 0.8 ? (1 - u) / 0.2 : 1);
      });
    },
    nicolas(P, t) {
      const kinds = [[FX.coin, { o: M.or[2], O: M.or[1] }], [FX.speculoos, { b: '#b8743a', B: '#7a4a20' }], [FX.mandarine, { o: '#ff8a1f', v: SAPIN[1] }]];
      each(6, 22, t, (i, u, age, a, c) => {
        const vx = (a - 0.5) * 1.6, vy = 1.5 + c * 0.6;
        const x = TIPX - 2 + vx * age, y = TIPY - 2 - vy * age + 0.07 * age * age;
        const [rows, pal] = kinds[i % 3];
        P.spr(x, y, rows, pal, false, 1);
      });
    },
    paques(P, t) {
      each(4, 30, t, (i, u, age, a) => {
        const dir = i % 2 ? 1 : -1;
        const x = TIPX - 2 + dir * u * 16, hop = Math.abs(Math.sin(u * Math.PI * 4)) * 5;
        P.spr(x, TIPY + 5 - hop, i % 4 === 3 ? FX.egg : dir > 0 ? FX.chick : FX.chick.map((r) => [...r].reverse().join('')), { y: PASTEL[1], k: INK, e: '#ff8a1f', p: ROSE[1], q: CIEL[1] }, false, 1);
      });
    },
    nouvelan(P, t) {
      const cols = [M.or[1], ROSE[1], M.turquoise[1], POTION[1]];
      each(2, 26, t, (i, u, age, a, c) => {
        const cx = 12 + a * 28, cy = 10 + c * 18, r = 2 + u * 9;
        if (u < 0.15) { P.spr(cx, cy + (0.15 - u) * 60, ['W'], { W: '#ffffff' }, true, 0); return; }
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2;
          P.spr(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r + u * u * 4, ['c'], { c: cols[(i + k) % 4] }, true, 0, 1 - u * 0.8);
        }
      });
      each(10, 50, t, (i, u, age, a) => P.spr(a * SW, u * SH, ['c'], { c: cols[i % 4] }, false, i % 2));
    },
    gille(P, t) {
      each(5, 24, t, (i, u, age, a, c) => {
        const vx = (a - 0.5) * 2, vy = 1.6 + c * 0.5;
        P.spr(TIPX - 2 + vx * age, TIPY - 2 - vy * age + 0.07 * age * age, FX.orange, { o: '#ff8a1f', O: '#ffc070', v: SAPIN[1] }, false, 1);
      });
    },
    pi(P, t) {
      each(5, 40, t, (i, u, age, a, c) => {
        const tt = t + (i * 40) / 5;
        const d = PI_DIGITS[Math.floor(tt / 8) % PI_DIGITS.length];
        const x = TIPX - 1 + Math.sin(u * 5 + i) * 10 * u, y = TIPY - u * 50;
        P.spr(x, y, DIGITS[d] || DIGITS[3], { w: CHALK }, false, 1, u > 0.75 ? (1 - u) / 0.25 : 1);
      });
    },
    poisson(P, t) {
      each(6, 30, t, (i, u, age, a) => P.spr(TIPX - 10 + a * 20 + Math.sin(age * 0.5) , TIPY - u * 50, FX.ring, { g: '#bfe9ff' }, false, i % 2));
      each(2, 40, t, (i, u, age) => {
        const x = TIPX - 3 + Math.sin(age * 0.2 + i * 3) * 14, y = TIPY - u * 54;
        P.spr(x, y, Math.sin(age * 0.2 + i * 3 + 1.57) > 0 ? FX.fish.map((r) => [...r].reverse().join('')) : FX.fish, { w: '#ffffff', k: INK }, false, 1);
      });
    },
    gateau(P, t) {
      const cols = [M.or[1], ROSE[1], M.turquoise[1], POTION[1], M.rouge[1], '#ffffff'];
      each(16, 26, t, (i, u, age, a, c) => {
        const ang = -Math.PI * (0.1 + a * 0.8), sp = 0.9 + c * 0.7;
        const x = TIPX + Math.cos(ang) * sp * age, y = TIPY - 1 + Math.sin(ang) * sp * age + 0.03 * age * age;
        P.spr(x, y, (i + Math.floor(age / 2)) % 2 ? ['c'] : ['cc'], { c: cols[i % 6] }, false, i % 2);
      });
      each(2, 60, t, (i, u, age) => P.spr(8 + i * 32 + Math.sin(age * 0.15) * 2, SH - u * (SH + 10), FX.balloon, { b: i ? ROSE[1] : M.turquoise[1], W: '#ffffff', l: '#d8dce8' }, false, 0));
    },
  };

  // Séries accordées aux panoplies du vestiaire : chevalier et pirate (nain = Pionnier, steampunk = Horloger).
  FBITS.lance = coneBit((x, y, t, f) => (groove(x, y, f) < 4 ? FUR[t] : M.rouge[t]));
  FBITS.lance.draw = (b, f) => {
    cone(b, 16, 4.5, 33, 47, f, 1, { color: (x, y, t) => (groove(x, y, f) < 4 ? FUR[t] : M.rouge[t]) });
    part(b, poly([[7, 29], [25, 29], [19.5, 34], [12.5, 34]]), M.acier, cyl(7, 24, 29, 34));
  };
  FBITS.tresor = coneBit((x, y, t, f) => (groove(x, y, f) < 2 ? M.or[Math.max(0, t - 1)] : M.bois[t]));
  Object.assign(FSTYLES, {
    chevalier: {
      hub: { cx: 16, cy: 12, r: 5 },
      back(b, f) {
        part(b, rr(8, 25, 23, 28, 1), M.or, cyl(8, 23, 25, 28));
        const wave = f % 2;
        part(b, or(circ(15, 2, 2.4), circ(19, 1 + wave, 2.2), circ(23, 2 + wave, 2), circ(26, 4 + wave, 1.6)), M.rouge, (x, y) => (y < 1.5 ? 0.6 : 1.8));
        const heaume = rr(4, 4, 27, 25, 6);
        part(b, heaume, M.acier, cyl(4, 27, 4, 25));
        paint(b, and(heaume, (x, y) => (x === 15 || x === 16) && y < 7), (x) => M.acier[x === 15 ? 0 : 2]);
        for (const x of [6, 25]) for (let y = 15; y <= 21; y += 2) dot(b, x, y, M.acier[4]);
        part(b, poly([[11.5, 17], [20.5, 17], [20.5, 21.5], [16, 25.6], [11.5, 21.5]]), M.rouge, cyl(11, 20, 17, 25), {
          edge: 'ink',
          color: (x, y, t) => (y === 20 || y === 21 ? M.or[Math.min(4, t)] : null),
        });
      },
      front(b) { hublot(b, 16, 12, 5); },
    },
    pirate: {
      hub: { cx: 16, cy: 18, r: 4.6 },
      back(b, f) {
        part(b, rr(15, -3, 16, 12), M.bois, cyl(15, 16, -3, 12));
        const wave = f % 2;
        part(b, rr(17, -5, 21 + wave, -3), ['#5a5a6a', '#3a3a48', '#26262e', '#18181e', '#0c0c10'], flat(2));
        dot(b, 19, -4, '#ffffff');
        const voile = (x, y) => y >= -1 && y <= 9 && x >= 9 - (y > 4 ? 1 : 0) && x <= 22 + (y > 3 && y < 8 ? 1 + wave : 0);
        part(b, voile, ['#fffbf0', '#f4ead4', '#dccca8', '#b8a47a', '#8a7650'], cyl(9, 23, -1, 9));
        const skull = ['.www.', 'wkwkw', 'wwwww', '.w.w.'];
        skull.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') dot(b, 14 + c, 1 + r, ch === 'w' ? '#2a2430' : '#f4ead4'); }));
        dot(b, 13, 6, '#2a2430'); dot(b, 19, 6, '#2a2430'); dot(b, 14, 5, '#2a2430'); dot(b, 18, 5, '#2a2430');
        part(b, rr(9, 25, 22, 28, 1), M.bois, cyl(9, 22, 25, 28), { color: (x, y, t) => M.bois[Math.min(4, t + 1)] });
        const coque = poly([[1.5, 11], [30.5, 11], [26.5, 26], [5.5, 26]]);
        part(b, coque, M.bois, cyl(2, 29, 11, 25), { color: (x, y, t) => ((y - 11) % 3 === 2 ? M.bois[Math.min(4, t + 1)] : null) });
        paint(b, and(coque, (x, y) => y === 11 || y === 12), (x) => M.or[x < 8 ? 1 : x > 23 ? 3 : 2]);
        for (const x0 of [5, 24]) {
          part(b, rr(x0, 16, x0 + 2, 18), ['#3a3a48', '#26262e', '#18181e', '#0c0c10', '#000000'], flat(2), { edge: 'ink' });
        }
      },
      front(b) { hublot(b, 16, 18, 4.6, M.laiton); },
    },
  });
  FX.gem = ['.c.', 'cWc', '.c.'];
  FX.gear = ['.g.g.', 'ggggg', 'gg.gg', 'ggggg', '.g.g.'];
  FX.nugget = ['oO', 'oo'];
  FX.spark = ['W'];
  Object.assign(EFFECTS, {
    chevalier(P, t) {
      each(8, 10, t, (i, u, age, a, c) => {
        const vx = (a - 0.5) * 3.2, vy = 1 + c * 1.4;
        const x = TIPX - 1 + vx * age, y = TIPY - 1 - vy * age + 0.12 * age * age;
        P.spr(x, y, u < 0.5 ? ['W'] : ['y'], { W: '#ffffff', y: M.or[1] }, true, 1, 1 - u * 0.6);
        if (u < 0.6) P.spr(x - vx * 0.6, y + vy * 0.6, ['y'], { y: M.braise[1] }, true, 1, 0.6);
      });
    },
    pirate(P, t) {
      const kinds = [[FX.coin, { o: M.or[2], O: M.or[1] }], [FX.gem, { c: '#ff4a6a', W: '#ffffff' }], [FX.coin, { o: M.or[2], O: M.or[1] }], [FX.gem, { c: M.turquoise[1], W: '#ffffff' }]];
      each(7, 22, t, (i, u, age, a, c) => {
        const vx = (a - 0.5) * 1.8, vy = 1.6 + c * 0.6;
        const [rows, pal] = kinds[i % 4];
        P.spr(TIPX - 2 + vx * age, TIPY - 2 - vy * age + 0.08 * age * age, rows, pal, i % 2 === 1, 1);
      });
    },
    pionnier(P, t) {
      each(5, 20, t, (i, u, age, a, c) => {
        const vx = (a - 0.5) * 1.4, vy = 1.3 + c * 0.5;
        P.spr(TIPX - 1 + vx * age, TIPY - 2 - vy * age + 0.09 * age * age, FX.nugget, { o: M.or[2], O: M.or[0] }, false, 1);
      });
      each(8, 16, t, (i, u, age, a) => P.spr(TIPX - 6 + a * 12, TIPY - u * 10, ['d'], { d: '#c8a878' }, false, i % 2, 1 - u));
    },
    horloger(P, t) {
      each(3, 30, t, (i, u, age, a) => {
        const x = TIPX - 3 + (i - 1) * 10 + Math.sin(age * 0.2 + i) * 2, y = TIPY - 2 - u * 40;
        P.spr(x, y, FX.gear, { g: i % 2 ? M.laiton[1] : M.cuivre[1] }, false, 1, u > 0.8 ? (1 - u) / 0.2 : 1);
      });
      each(6, 24, t, (i, u, age, a) => {
        const r = 1 + u * 2;
        const rows = r < 2 ? ['ss', 'ss'] : ['.ss.', 'ssss', 'ssss', '.ss.'];
        P.spr(TIPX - 8 + a * 16, TIPY - 4 - u * 30, rows, { s: '#d8d0e0' }, false, i % 2, 0.7 * (1 - u));
      });
    },
  });

  const styleOf = (m) => FSTYLES[m.style] || STYLES[m.style];
  const bitOf = (m) => FBITS[m.bit] || BITS[m.bit];
  const FETES = [
    { nom: 'Chaudron', quand: 'Halloween', effet: 'Potion qui bouillonne, bulles vertes et chauves-souris', style: 'chaudron', bit: 'sorciere', amb: '#5fe03a', roche: ['#1f2a1c', '#283622', '#161e14'] },
    { nom: 'Citrouille', quand: 'Halloween', effet: 'Visage qui vacille, petits fantômes qui s\'envolent', style: 'citrouille', bit: 'citrouille', face: false, amb: '#ff8a1f', roche: ['#2a1c18', '#36241e', '#1e1410'] },
    { nom: 'Père Noël', quand: 'Noël', effet: 'Neige qui tombe, étincelles à la pointe', style: 'noel', bit: 'sucre', amb: '#bfe9ff', roche: ['#1c2232', '#252c40', '#141826'] },
    { nom: 'Sapin', quand: 'Noël', effet: 'Guirlande qui clignote, étoiles dorées', style: 'sapin', bit: 'dore', amb: '#ffd23f', roche: ['#1c2232', '#252c40', '#141826'] },
    { nom: 'Cupidon', quand: 'Saint-Valentin', effet: 'Petites ailes qui battent, cœurs qui s\'envolent du forage', style: 'cupidon', bit: 'rose', amb: '#ff6aa8', roche: ['#2a1826', '#362032', '#1e101a'] },
    { nom: 'Grand Saint', quand: 'Saint-Nicolas, 6 décembre', effet: 'Mitre et crosse, pluie de speculoos, mandarines et pièces en chocolat', style: 'nicolas', bit: 'dore', amb: '#ffd23f', roche: ['#2a1c1c', '#362424', '#1e1414'] },
    { nom: 'Lapin', quand: 'Pâques', effet: 'Œuf peint à oreilles, poussins qui sautillent', style: 'paques', bit: 'paques', amb: '#fff0a0', roche: ['#22281c', '#2c3424', '#181e14'] },
    { nom: 'Minuit', quand: 'Nouvel An', effet: 'Horloge à 23 h 59, feux d\'artifice et confettis', style: 'nouvelan', bit: 'dore', amb: '#b28cff', roche: ['#1a1a2e', '#22223a', '#121222'] },
    { nom: 'Gille', quand: 'Carnaval (Binche)', effet: 'Chapeau à plumes, grelots, oranges lancées depuis le forage', style: 'gille', bit: 'spirale', amb: '#ffa04a', roche: ['#2a2218', '#362c20', '#1e1810'] },
    { nom: 'Pi', quand: 'Journée de π, 14 mars', effet: 'Tableau noir à la craie, les décimales de π s\'échappent', style: 'pi', bit: 'spirale', amb: '#a8ffd0', roche: ['#1c2624', '#24302e', '#141c1a'] },
    { nom: 'Poisson', quand: '1er avril', effet: 'Poisson-clown qui frétille, poissons en papier et bulles', style: 'poisson', bit: 'spirale', amb: '#5fb0e8', roche: ['#18222e', '#202c3a', '#101820'] },
    { nom: 'Gâteau', quand: 'Anniversaire du joueur', effet: 'Bougies qui vacillent, confettis et ballons', style: 'gateau', bit: 'rose', amb: '#ffd0e8', roche: ['#2a1c26', '#362430', '#1e141a'] },
    { nom: 'Chevalier', quand: 'Série chevalier', effet: 'Heaume à plumet et blason, lance de joute, gerbes d\'étincelles', style: 'chevalier', bit: 'lance', amb: '#ffd23f', roche: ['#22222e', '#2c2c3a', '#16161e'] },
    { nom: 'Pirate', quand: 'Série pirate', effet: 'Coque de navire, voile à tête de mort, pluie de pièces et de gemmes', style: 'pirate', bit: 'tresor', amb: '#ffd23f', roche: ['#18222e', '#202c3a', '#101820'] },
    { id: 'pionnier', nom: 'Pionnier', quand: 'Série nain', effet: 'Pépites d\'or et poussière qui jaillissent du forage', style: 'prospecteur', bit: 'tariere', amb: '#ffc060', roche: ['#2a2218', '#362c20', '#1e1810'] },
    { id: 'horloger', nom: 'Horloger', quand: 'Série steampunk', effet: 'Engrenages qui s\'envolent et bouffées de vapeur', style: 'vapeur', armor: 'plaques', bit: 'tricone', amb: '#f0c869', roche: ['#2a2218', '#362c20', '#1e1810'] },
  ];


  // ---------- Dans le jeu ----------
  // Dans le puits, la foreuse paraît petite : les effets s'écartent davantage que sur la planche.
  const SPREAD = 1.8;
  // Modèles proposés : les foreuses de fête (avec effet) puis les modèles composés de pièces.
  const MODELS = [
    ...FETES.map((m) => ({ id: m.id || m.style, nom: m.nom, quand: m.quand, style: styleOf(m), armor: m.armor || 'aucun', bit: bitOf(m), effect: EFFECTS[m.id || m.style], hub: m.face === false ? null : styleOf(m).hub })),
    ...[
      ['bourdon', 'Bourdon', 'chantier', 'plaques', 'spirale'],
      ['horloger', 'Horloger', 'vapeur', 'plaques', 'tricone'],
      ['nautile', 'Nautile', 'bathyscaphe', 'ecailles', 'couronne'],
      ['mammouth', 'Mammouth', 'char', 'lourd', 'tambour'],
      ['comete', 'Comète', 'neon', 'aucun', 'plasma'],
      ['amethyste', 'Améthyste', 'geode', 'pointes', 'double'],
      ['fournaise', 'Fournaise', 'forge', 'lourd', 'fraise'],
      ['pionnier', 'Pionnier', 'prospecteur', 'aucun', 'tariere'],
    ].filter(([id]) => !FETES.some((m) => m.id === id)).map(([id, nom, style, armor, bit]) => ({ id, nom, quand: null, style: STYLES[style], armor, bit, effect: null, hub: armor === 'lourd' ? null : STYLES[style].hub })),
  ];
  /**
   * Foreuse à dessiner : identifiant d'un modèle, ou « style/blindage/foret » composé dans l'Atelier.
   * Renvoie null si une pièce n'existe pas.
   */
  const composed = new Map();
  function resolve(spec) {
    if (typeof spec !== 'string') return null;
    const m = MODELS.find((x) => x.id === spec);
    if (m) return m;
    if (composed.has(spec)) return composed.get(spec);
    const [style, armor, bit] = spec.split('/');
    const out = STYLES[style] && ARMORS[armor] && BITS[bit] ? { id: spec, style: STYLES[style], armor, bit: BITS[bit], effect: null, hub: armor === 'lourd' ? null : STYLES[style].hub } : null;
    composed.set(spec, out);
    return out;
  }
  const sprites = new Map();
  /** Sprite (canevas 34 × 54) d'une foreuse de fête, mis en cache par image d'animation. */
  function sprite(id, fBody, fBit) {
    const key = `${id}:${fBody}:${fBit}`;
    if (sprites.has(key)) return sprites.get(key);
    const m = resolve(id);
    const b = build(m.style, m.armor, m.bit, fBody, fBit);
    const mk = () => Object.assign(global.document.createElement('canvas'), { width: BW, height: BH });
    const img = mk(), glow = mk();
    const x = img.getContext('2d'), g = glow.getContext('2d');
    let hasGlow = false;
    for (let Y = 0; Y < BH; Y++) for (let X = 0; X < BW; X++) {
      const c = b.cells[Y * BW + X];
      if (!c) continue;
      x.globalAlpha = c.a; x.fillStyle = c.c; x.fillRect(X, Y, 1, 1);
      if (c.g) { g.fillStyle = c.c; g.fillRect(X, Y, 1, 1); hasGlow = true; }
    }
    const out = { img, glow: hasGlow ? glow : null };
    sprites.set(key, out);
    return out;
  }

  /**
   * Dessine une foreuse de fête dont la pointe est en (tipX, tipY) pixels d'écran, `px` pixels d'écran par pixel du sprite.
   * view = { w, h } : taille de l'écran en pixels du sprite (pour les effets qui couvrent toute la scène, comme la neige).
   * Renvoie la position du hublot à l'écran (pour y poser le visage du joueur), ou null.
   */
  function draw(ctx, id, o) {
    const model = resolve(id);
    if (!model) return null;
    const { tipX, tipY, px, time, drilling, view, calm } = o;
    const t = time * 14;
    const fBody = Math.floor(time * 9) % 4;
    const fBit = drilling ? Math.floor(time * 12) % 4 : 0;
    SW = view.w; SH = view.h;
    TIPX = tipX / px; TIPY = tipY / px;
    const layer = (front) => ({
      spr(x, y, rows, pal, isGlow, isFront, alpha = 1) {
        if (Boolean(isFront) !== front) return;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        rows.forEach((row, r) => [...row].forEach((ch, c) => {
          if (ch === '.' || !pal[ch]) return;
          ctx.fillStyle = pal[ch];
          ctx.fillRect(Math.round(TIPX + (x - TIPX) * SPREAD + c) * px, Math.round(TIPY + (y - TIPY) * SPREAD + r) * px, px, px);
        }));
        ctx.globalAlpha = 1;
      },
    });
    const fx = drilling && !calm ? model.effect : null;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (fx) fx(layer(false), t);
    const s = sprite(id, fBody, fBit);
    // Pixel (17, 51) du tampon = pointe du foret.
    const ox = Math.round(tipX - 17 * px), oy = Math.round(tipY - 51 * px);
    ctx.drawImage(s.img, ox, oy, BW * px, BH * px);
    if (fx) fx(layer(true), t);
    if (s.glow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.filter = `blur(${px * 1.3}px)`;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(s.glow, ox, oy, BW * px, BH * px);
    }
    ctx.restore();
    const h = model.hub;
    return h ? { cx: ox + (h.cx + 1) * px, cy: oy + (h.cy + 5) * px, r: (h.r - 1.9) * px } : null;
  }

  /** Vignette fixe (Atelier) : la foreuse entière, centrée en bas du canevas, `px` pixels d'écran par pixel du sprite. */
  function thumb(canvas, id, px = 1) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!resolve(id)) return;
    draw(ctx, id, { tipX: Math.round(canvas.width / 2 - px), tipY: canvas.height - 2 * px, px, time: 0, drilling: false, view: { w: canvas.width / px, h: canvas.height / px }, calm: true });
  }

  const pieces = (o) => Object.entries(o).map(([id, p]) => ({ id, nom: p.nom, detail: p.detail || '' }));
  global.Drills16 = {
    /** Modèles de fête et de série (réglages du responsable, Atelier). */
    MODELS: MODELS.map((m) => ({ id: m.id, nom: m.nom, quand: m.quand })),
    /** Pièces à combiner dans l'Atelier. */
    PARTS: { styles: pieces(STYLES), armors: pieces(ARMORS), bits: pieces(BITS) },
    FETES: FETES.map((m) => ({ id: m.id || m.style, nom: m.nom, quand: m.quand, effet: m.effet })),
    has: (id) => !!resolve(id),
    draw,
    thumb,
  };
})(window);
