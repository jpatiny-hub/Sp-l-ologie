'use strict';
/*
 * Foreuse de base — jaune et cubique (première foreuse du jeu), dessinée en pixel art.
 * Fichier autonome (aucune dépendance) : ouvrir apercu.html dans un navigateur pour la voir.
 *
 *   FOREUSE_DE_BASE.dessiner16(avatar, k)     → sprite 16-bit classique, échelle k (1 = 40 × 68 px, 2,4 = 96 × 163 px)
 *   FOREUSE_DE_BASE.dessinerMinimal(k)        → version minimaliste (silhouette, aplats), échelle k (1 = 26 × 44 px)
 *   FOREUSE_DE_BASE.versCanevas(sprite, zoom) → <canvas> prêt à afficher (pixels nets)
 *
 * « avatar » est un sprite de la même forme (voir design/README.md) : son visage apparaît dans le hublot. Sans avatar, le hublot a un simple reflet.
 * Les formes sont recalculées à chaque échelle (pas un simple agrandissement) : les détails fins restent nets.
 */
(function (global) {
  const hash = (x, y, s) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

  // ---- Grille de pixels (couleurs + masque) ----
class Lo {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Float32Array(w * h * 3); this.a = new Float32Array(w * h); }
  put(x, y, r, g, b, a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    if (a >= 1) { this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.a[y * this.w + x] = 1; }
    else { this.d[i] += (r - this.d[i]) * a; this.d[i + 1] += (g - this.d[i + 1]) * a; this.d[i + 2] += (b - this.d[i + 2]) * a; }
  }
  get(x, y) { const i = (y * this.w + x) * 3; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  poly(pts, col, shade) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) { const c = shade ? shade(x, y, col) : col; this.put(x, y, c[0], c[1], c[2]); }
    }
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c[0], c[1], c[2]); }
  disc(cx, cy, r, c, shade) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) { const k = shade ? shade(x, y, c) : c; this.put(x, y, k[0], k[1], k[2]); }
    }
  }
}


  // ---- Palettes à 4 tons et pinceaux « pixel art » ----
  const hexc = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const R = (a) => a.map(hexc); // rampe : [ombre profonde, ombre, base, lumière]
  const M = {
    skin: R(['#8a4a3a', '#c98466', '#f2c8a2', '#ffe6cc']), skinD: R(['#4a2418', '#7a4630', '#a8694a', '#c8856a']), skinM: R(['#7a3c24', '#b27040', '#dea468', '#f4c890']),
    helm: R(['#7a4e0c', '#c8901a', '#f4c430', '#fff08a']), orange: R(['#6e2814', '#b4521a', '#ec8430', '#ffb860']), blue: R(['#1a2450', '#2a3c74', '#3e5aa0', '#6e8ad0']),
    brown: R(['#2a1608', '#523018', '#7a4c28', '#a8723c']), hairD: R(['#140c08', '#2a1a10', '#44281a', '#6a4430']), hairR: R(['#5a1c08', '#9a3a14', '#d4682a', '#f4a050']),
    steel: R(['#222834', '#4c566a', '#8e9ab0', '#dde4f0']), brass: R(['#4e300a', '#946414', '#d49c3a', '#fadc86']), copper: R(['#40160c', '#82351e', '#c4623a', '#f2a478']),
    iron: R(['#101218', '#262a36', '#444b5c', '#6c758a']), red: R(['#44080e', '#861a26', '#c83a3c', '#f4806c']), patina: R(['#0a3232', '#1c645e', '#38a08c', '#8ae2c2']),
    white: R(['#5a6684', '#9aa4c0', '#e6eaf4', '#ffffff']), navy: R(['#0c1230', '#1a2658', '#2c3c88', '#5a72c4']), glass: R(['#143c5a', '#2a7aa8', '#68c4ea', '#d8f8ff']),
    amber: R(['#7a2c00', '#cc6a1a', '#ffb440', '#fff2b8']), wood: R(['#3a2010', '#6e4220', '#9a6232', '#c48a50']), leather: R(['#2c1408', '#5a2e14', '#8a5028', '#b87a44']),
    purple: R(['#2a1038', '#4e2468', '#7a44a0', '#b27ad0']), teal: R(['#0a3036', '#18626a', '#2e9a9e', '#74d4d0']), cream: R(['#5a4a38', '#a89478', '#e8d8b8', '#fff4dc']),
    gold: R(['#5a3c00', '#a87a10', '#e8b824', '#fff0a0']), blond: R(['#7a5a14', '#b88a2a', '#e8c44a', '#fff0a8']), black: R(['#08060a', '#1a1620', '#2e2a38', '#4c4660']),
  };
  const LX = -0.55, LY = -0.62, LZ = 0.56;
  const bandOf = (d) => (d < 0.12 ? 0 : d < 0.45 ? 1 : d < 0.9 ? 2 : 3);

  class S extends Lo {
    pix(x, y, c) { this.put(Math.round(x), Math.round(y), c[0], c[1], c[2]); }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.pix(x + i, y + j, c); }
    ell(cx, cy, rx, ry, ramp, o = {}) { // ellipsoïde en 4 tons
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, q = nx * nx + ny * ny;
        if (q > 1) continue; if (o.maxY !== undefined && y > o.maxY) continue; if (o.minY !== undefined && y < o.minY) continue;
        const nz = Math.sqrt(1 - q);
        this.pix(x, y, ramp[bandOf(Math.max(0, nx * LX + ny * LY + nz * LZ) * 1.15)]);
      }
    }
    cyl(x, y, w, h, ramp, o = {}) { // cylindre vertical
      const cx = x + w / 2;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const nx = (x + i + 0.5 - cx) / (w / 2), nz = Math.sqrt(Math.max(0, 1 - nx * nx));
        this.pix(x + i, y + j, ramp[bandOf(Math.max(0, nx * LX + nz * LZ + 0.18) * 1.1)]);
      }
    }
    hcyl(x, y, w, h, ramp) { // cylindre horizontal
      const cy = y + h / 2;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const ny = (y + j + 0.5 - cy) / (h / 2), nz = Math.sqrt(Math.max(0, 1 - ny * ny));
        this.pix(x + i, y + j, ramp[bandOf(Math.max(0, ny * LY + nz * LZ + 0.18) * 1.1)]);
      }
    }
    plate(x, y, w, h, r, ramp, o = {}) { // plaque : liseré clair en haut à gauche, sombre en bas à droite
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const dx = Math.max(r - i - 0.5, 0, i + 0.5 - (w - r)), dy = Math.max(r - j - 0.5, 0, j + 0.5 - (h - r));
        if (dx * dx + dy * dy > r * r) continue;
        let t = 2;
        if (i === 0 || j === 0 || (dx > 0 && dy > 0 && i + j < r + 1)) t = 3;
        if (i === w - 1 || j === h - 1) t = 1;
        if (o.shadeBottom && j > h * 0.62 && t === 2) t = 1;
        this.pix(x + i, y + j, ramp[t]);
      }
    }
    poly(pts, ramp, o = {}) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.pix(x, y, ramp[o.tone === undefined ? 2 : o.tone]);
      }
    }
    ringp(cx, cy, r1, r2, ramp) {
      for (let y = Math.floor(cy - r2); y <= Math.ceil(cy + r2); y++) for (let x = Math.floor(cx - r2); x <= Math.ceil(cx + r2); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d > r2 || d < r1) continue;
        const t = (d - r1) / (r2 - r1), tilt = 2 * t - 1, ux = dx / d, uy = dy / d, nz = Math.sqrt(Math.max(0, 1 - tilt * tilt));
        this.pix(x, y, ramp[bandOf(Math.max(0, ux * tilt * LX + uy * tilt * LY + nz * LZ) * 1.15)]);
      }
    }
    gearp(cx, cy, r, teeth, rot, ramp) {
      for (let y = Math.floor(cy - r - 3); y <= Math.ceil(cy + r + 3); y++) for (let x = Math.floor(cx - r - 3); x <= Math.ceil(cx + r + 3); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
        const Rr = r + (Math.cos(teeth * th + rot) > 0.2 ? 1.6 : 0);
        if (d > Rr) continue;
        if (d < r * 0.3) { this.pix(x, y, ramp[0]); continue; }
        if (d < r * 0.5) { this.pix(x, y, ramp[1]); continue; }
        this.pix(x, y, ramp[(dx + dy < 0) ? 3 : (dx + dy > r * 0.6) ? 1 : 2]);
      }
    }
    line(x0, y0, x1, y1, ramp, w = 1) {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
      for (let i = 0; i <= n; i++) { const t = i / n; const x = lerp(x0, x1, t), y = lerp(y0, y1, t); for (let k = 0; k < w; k++) this.pix(x + k * 0.9, y, ramp[k === 0 ? 3 : k === w - 1 ? 1 : 2]); }
    }
    rivet(x, y, ramp = M.brass) { this.pix(x, y, ramp[3]); this.pix(x + 1, y + 1, ramp[0]); }
    /** Contour « selout » : sombre, teinté par la couleur voisine. */
    outline() {
      const { w, h } = this, add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (this.a[y * w + x]) continue;
        let n = null;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && this.a[yy * w + xx]) { n = (yy * w + xx) * 3; break; } }
        if (n !== null) add.push([x, y, this.d[n] * 0.2 + 8, this.d[n + 1] * 0.2 + 6, this.d[n + 2] * 0.24 + 12]);
      }
      add.forEach(([x, y, r, g, b]) => this.put(x, y, r, g, b));
      return this;
    }
  }


  // ---- Mise à l'échelle ----
  function scaled(raw, k) {
    const e = (v) => Math.round(v * k), sz = (a, b) => Math.max(1, e(a + b) - e(a));
    return {
      ell: (cx, cy, rx, ry, ramp, o) => raw.ell(cx * k, cy * k, rx * k, ry * k, ramp, o && { maxY: o.maxY === undefined ? undefined : o.maxY * k, minY: o.minY === undefined ? undefined : o.minY * k }),
      cyl: (x, y, w, h, ramp) => raw.cyl(e(x), e(y), sz(x, w), sz(y, h), ramp),
      hcyl: (x, y, w, h, ramp) => raw.hcyl(e(x), e(y), sz(x, w), sz(y, h), ramp),
      plate: (x, y, w, h, r, ramp, o) => raw.plate(e(x), e(y), sz(x, w), sz(y, h), Math.max(1, Math.round(r * k * 0.8)), ramp, o),
      poly: (pts, ramp, o) => raw.poly(pts.map(([x, y]) => [x * k, y * k]), ramp, o),
      ringp: (cx, cy, r1, r2, ramp) => raw.ringp(cx * k, cy * k, r1 * k, r2 * k, ramp),
      gearp: (cx, cy, r, teeth, rot, ramp) => raw.gearp(cx * k, cy * k, r * k, teeth, rot, ramp),
      line: (x0, y0, x1, y1, ramp, w = 1) => raw.line(x0 * k, y0 * k, x1 * k, y1 * k, ramp, Math.max(1, Math.round(w * k * 0.8))),
      rect: (x, y, w, h, c) => raw.rect(e(x), e(y), sz(x, w), sz(y, h), c),
      rivet: (x, y, ramp) => raw.rivet(e(x), e(y), ramp),
      pix: (x, y, c) => raw.rect(e(x), e(y), Math.max(1, Math.round(k * 0.8)), Math.max(1, Math.round(k * 0.8)), c),
    };
  }


  // ---- Foreuse ----
  const W = [255, 255, 255];
  /** Visage de l'avatar agrandi ×2 (entier) dans une fenêtre ronde de rayon r (en pixels réels). */
  const face = (raw, av, cx, cy, r, fs = 2) => {
    if (!av) return false;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = 12 + Math.floor(dx / fs), y = 12 + Math.floor(dy / fs);
      if (x < 0 || y < 0 || x >= av.w || y >= av.h || !av.a[y * av.w + x]) continue;
      const i = (y * av.w + x) * 3; raw.put(Math.round(cx + dx), Math.round(cy + dy), av.d[i], av.d[i + 1], av.d[i + 2]);
    }
    return true;
  };
  const mk = (wd, hd, k) => { const raw = new S(Math.round(wd * k), Math.round(hd * k)); return { raw, s: scaled(raw, k), k }; };
  /** Remplit un solide de révolution vertical (cône, fuseau…) : half(yd) en unités de dessin, colour(xd, yd, bord). */
  const solid = (g, cx, y0, y1, half, colour) => {
    const { raw, k } = g;
    for (let Y = Math.floor(y0 * k); Y < Math.ceil(y1 * k); Y++) {
      const yd = (Y + 0.5) / k, hk = Math.max(0, Math.round(half(yd) * k));
      for (let X = Math.round(cx * k) - hk; X <= Math.round(cx * k) + hk; X++) raw.pix(X, Y, colour((X + 0.5) / k - cx, yd, X === Math.round(cx * k) - hk, hk / k));
    }
  };

  // ================================================================ A. Foreuse de base
  function base16(av, k) {
    const g = mk(40, 68, k), { s, raw } = g;
    s.rect(19, 0, 2, 9, M.iron[2]); s.rect(19, 0, 1, 9, M.iron[3]);
    s.plate(3, 8, 34, 24, 4, M.helm); s.rect(4, 27, 32, 4, M.helm[1]);
    for (let x = 5; x < 35; x += 6) s.rect(x, 28, 3, 3, M.black[1]);
    s.ell(20, 19, 8.4, 8.4, M.iron); s.ell(20, 19, 6.6, 6.6, [M.glass[1], M.glass[1], M.glass[2], M.glass[2]]);
    if (!face(raw, av, 20 * k, 19 * k, Math.round(6.2 * k), k >= 1.8 ? 2 : 1)) { s.rect(16, 15, 3, 2, W); }
    s.rect(31, 12, 4, 4, M.orange[2]); s.rect(31, 12, 4, 1, M.orange[3]); s.rect(32, 13, 1, 1, W);
    s.plate(6, 32, 28, 6, 2, M.steel); for (const x of [9, 17, 25, 31]) s.rect(x, 35, 1, 1, M.steel[0]);
    solid(g, 20, 39, 67, (y) => 11 * (1 - (y - 39) / 28), (x, y, edge) => (edge ? M.steel[3] : Math.floor((y - 39 + (x < 0 ? 0 : 1)) / 2) % 2 ? M.steel[1] : M.steel[2]));
    return raw.outline();
  }
  function baseMin(k) {
    const g = mk(26, 44, k), { s } = g;
    s.rect(12, 0, 2, 5, [90, 96, 110]); s.rect(4, 5, 18, 13, [246, 196, 48]); s.rect(4, 15, 18, 3, [200, 150, 30]);
    s.rect(9, 8, 8, 7, [40, 52, 70]); s.rect(10, 9, 6, 5, [94, 200, 240]); s.rect(10, 9, 2, 1, W); s.rect(18, 7, 2, 2, [255, 106, 61]); s.rect(6, 18, 14, 3, [140, 150, 168]);
    for (let y = 0; y < 17; y++) { const half = Math.round(6 * (1 - y / 17)); s.rect(13 - half, 21 + y, half * 2, 1, y % 4 < 2 ? [190, 198, 212] : [120, 130, 148]); }
    return g.raw;
  }



  /** Petit avatar d'exemple (mineur, 28 × 37) : seule la tête sert au hublot — voir public/avatar.js pour les vrais avatars. */
  function avatarExemple() {
    const s = new S(28, 37), skin = M.skin, K = [20, 14, 24], rr = (x, y, w, h, c) => { s.rect(x + 1, y, w - 2, h, c); s.rect(x, y + 1, w, h - 2, c); };
    rr(6, 7, 13, 11, skin[2]); s.rect(6, 15, 13, 3, skin[1]);
    s.rect(9, 11, 2, 2, K); s.rect(14, 11, 2, 2, K); s.pix(9, 11, [255, 255, 255]); s.pix(14, 11, [255, 255, 255]);
    s.rect(8, 14, 2, 1, [240, 138, 130]); s.rect(15, 14, 2, 1, [240, 138, 130]); s.rect(11, 15, 3, 1, [160, 70, 70]);
    s.rect(5, 10, 2, 5, M.hairD[2]); s.rect(18, 10, 2, 5, M.hairD[2]);
    rr(6, 4, 13, 6, M.helm[2]); s.rect(5, 9, 15, 2, M.helm[1]); s.rect(6, 4, 13, 1, M.helm[3]); s.rect(10, 2, 5, 3, M.brass[2]); s.rect(11, 3, 3, 1, [255, 250, 214]);
    return s.outline();
  }

  function versCanevas(lo, zoom = 4) {
    const c = document.createElement('canvas'); c.width = lo.w; c.height = lo.h;
    const x = c.getContext('2d'), im = x.createImageData(lo.w, lo.h);
    for (let i = 0; i < lo.w * lo.h; i++) { const k = i * 3, j = i * 4; im.data[j] = lo.d[k]; im.data[j + 1] = lo.d[k + 1]; im.data[j + 2] = lo.d[k + 2]; im.data[j + 3] = lo.a[i] ? 255 : 0; }
    x.putImageData(im, 0, 0); c.style.width = `${lo.w * zoom}px`; c.style.height = `${lo.h * zoom}px`; c.style.imageRendering = 'pixelated';
    return c;
  }
  global.FOREUSE_DE_BASE = { dessiner16: base16, dessinerMinimal: baseMin, avatarExemple, versCanevas, Grille: Lo, Pinceau: S, palettes: M };
})(typeof window !== 'undefined' ? window : globalThis);
