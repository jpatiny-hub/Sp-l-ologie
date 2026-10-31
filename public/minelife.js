'use strict';

/*
 * Vie de mine (refonte, réservée au responsable) : des galeries étayées creusées dans la roche entre les grottes de caves.js, avec
 * lanternes, rails et petites scènes tirées au hasard pour chaque forage (graine) : table des plans, mineur à la pioche, casse-croûte,
 * canari, gouttière, dynamite, géomètre, éboulement, convoi de wagonnets, chariot à bras, taupe en balade, monte-charge et
 * chauves-souris. `build` creuse les galeries dans le monde (une fois) ; `draw` anime les scènes à chaque image.
 */
(function (global) {
  const TH = 16; // hauteur d'une galerie
  const STEP = 44; // écart entre deux étais
  let W = 160;
  let SKY = 56;
  let PPP = 2;
  let calm = false;
  const hash = (a, b, c) => { let h = Math.imul(a * 374761393 + b * 668265263 + c * 2246822519, 3266489917); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };
  const rngOf = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tierAt = (y) => global.Caves.TIERS[global.Caves.tierIndex(Math.max(0, (y - SKY) / PPP))];
  const WOOD = ['#2a1a0e', '#4a2f1a', '#6b4627', '#8c6034'];

  /**
   * Creuse une galerie par tranche de 150 px, là où la roche est la plus pleine (`data` : pixels RGBA du monde, alpha déjà posé),
   * puis tire les scènes. Renvoie l'état à passer à `draw`.
   */
  function build({ W: w, SKY: sky, PPP: ppp, WORLD_H, data, set, seed }) {
    W = w; SKY = sky; PPP = ppp;
    const rows = [];
    for (let y = 0; y < WORLD_H; y++) { let n = 0; for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 240) n++; rows.push(n / W); }
    const tunnels = [];
    for (let y0 = SKY + 40; y0 + 150 < WORLD_H - 20; y0 += 150) {
      let best = -1, by = 0;
      for (let y = y0; y < y0 + 150 - TH; y++) { let s = 0; for (let k = -2; k < TH + 2; k++) s += rows[y + k]; if (s > best) { best = s; by = y; } }
      tunnels.push({ ty: by, gaps: [], tier: tierAt(by) });
    }
    const lights = [];
    tunnels.forEach((tu, k) => carve(set, tu, k, lights));
    const world = { tunnels, lights, events: [] };
    world.events = roll(world, seed);
    return world;
  }

  function carve(set, tu, k, lights) {
    const ty = tu.ty, r = tu.tier.rock, b = tu.tier.back, bot = ty + TH - 1;
    const off = Math.floor(hash(k, 3, 7) * 30);
    for (let x = 0; x < W; x++) {
      const top = ty + (hash(x >> 1, k, 11) > 0.7 ? 1 : 0);
      set(x, top - 1, r[0]); if (hash(x, k, 12) > 0.6) set(x, top - 2, r[1]);
      for (let y = top; y < bot - 2; y++) {
        const v = (y - top) / (TH - 3);
        set(x, y, hash(x, y, 13) > 0.85 ? b[2] : v < 0.25 ? b[0] : v > 0.8 ? b[2] : b[1]);
      }
      set(x, bot - 1, (x + off) % 4 === 0 ? '#5a3a20' : r[0]);
      set(x, bot, r[0]);
      set(x, bot - 2, '#8a8e98');
      if (x % 6 === 0) set(x, bot - 3, '#b4b8c0');
    }
    for (let x = off - STEP; x < W; x += STEP) {
      if (x + 12 + 30 <= W && x + 12 >= 0) tu.gaps.push(x + 12);
      if (x + 11 < 0) continue;
      for (let y = ty; y < ty + TH - 3; y++) { set(x, y, WOOD[2]); set(x + 1, y, WOOD[1]); set(x + 10, y, WOOD[2]); set(x + 11, y, WOOD[1]); }
      for (let xx = x - 1; xx <= x + 12; xx++) { set(xx, ty, WOOD[3]); set(xx, ty + 1, WOOD[1]); }
      lights.push({ x: x + 5, y: ty + 2, s: hash(x, k, 15) * 6, k });
    }
  }

  // ---------- Petits personnages ----------
  const PERSON = ['.hhh.', 'hhLhh', '.fff.', '.fff.', 'bbbbb', '.bbb.', '.p.p.', '.k.k.'];
  const WALK = ['.pp..', 'k..k.'];
  const SIT = ['pppp.', '...k.'];
  function person(ctx, x, feet, shirt, pose, flip, bend) {
    const rows = PERSON.slice(0, 6).concat(pose === 'walk' ? WALK : pose === 'sit' ? SIT : PERSON.slice(6));
    const C = { h: '#e9b422', L: '#fff2b0', f: '#d8a07a', b: shirt, p: '#3a3440', k: '#2a1d14' };
    const y0 = feet - 8 + (pose === 'sit' ? 1 : 0);
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (!C[ch]) return;
      const xx = flip ? x + 4 - i : x + i;
      ctx.fillStyle = C[ch]; ctx.fillRect(xx + (j < 4 ? bend || 0 : 0), y0 + j, 1, 1);
    }));
  }
  const px = (ctx, c, x, y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  function glow(ctx, x, y, r, rgb, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  const cyc = (t, s, period) => (((t + s) % period) + period) % period;

  // ---------- Catalogue des événements ----------
  // kind : scene (posée dans un espace entre deux étais), sol (scène qui occupe le sol), passage (circule sur les rails), imprevu (surgit de temps en temps).
  const EV = {
    table: { name: 'Table des plans', kind: 'sol', when: 'scène', desc: 'Le contremaître penché sur un plan déroulé, lanterne sur la table, tabouret à côté.',
      draw(ctx, e, t) {
        const x = e.x, fy = e.fy;
        for (let i = 4; i < 24; i++) { px(ctx, WOOD[3], x + i, fy - 5); px(ctx, WOOD[1], x + i, fy - 4); }
        for (const lx of [5, 22]) px(ctx, WOOD[1], x + lx, fy - 3, 1, 3);
        for (let i = 7; i < 18; i++) px(ctx, i % 3 ? '#e8d8a8' : '#d8c48c', x + i, fy - 6);
        px(ctx, '#3a6ab0', x + 9, fy - 6); px(ctx, '#3a6ab0', x + 12, fy - 6); px(ctx, '#c0402c', x + 15, fy - 6);
        px(ctx, '#c8b07a', x + 19, fy - 6, 4, 1); px(ctx, '#a8905a', x + 22, fy - 7);
        px(ctx, WOOD[3], x + 26, fy - 3, 4, 1); px(ctx, WOOD[1], x + 26, fy - 2, 1, 2); px(ctx, WOOD[1], x + 29, fy - 2, 1, 2);
        person(ctx, x, fy, '#3a6a8c', 'stand', false, calm ? 0 : Math.floor(t * 0.7) % 2);
        lamp(ctx, x + 6, fy - 9, t, 2, true);
        for (let y = e.ty + 3; y < e.ty + 7; y++) for (let i = 27; i < 33; i++) px(ctx, (i + y) % 5 ? '#d8c89a' : '#3a6ab0', x + i, y);
      } },
    pioche: { name: 'Mineur à la pioche', kind: 'sol', when: 'scène', desc: 'Un mineur attaque un filon de gemmes ; les éclats jaillissent à chaque coup.',
      draw(ctx, e, t) {
        const x = e.x, fy = e.fy, up = calm ? 0 : Math.floor(t * 3) % 2;
        const G = ['#c8a0ff', '#86f2ae', '#92c8ff'];
        for (let j = 0; j < 7; j++) for (let i = 0; i < 4; i++) if (hash(i, j, e.x) > 0.35) px(ctx, j % 3 === 0 ? e.tier.rock[3] : e.tier.rock[2], x + 24 + i, fy - 8 + j);
        [[25, -6], [26, -3], [24, -4]].forEach(([i, j], n) => px(ctx, G[(n + Math.floor(t * 2)) % 3], x + i, fy + j));
        person(ctx, x + 15, fy, '#8c3a28', 'stand');
        if (up) { px(ctx, '#6b4627', x + 20, fy - 10, 1, 4); px(ctx, '#b4b8c0', x + 19, fy - 11, 3, 1); }
        else { px(ctx, '#6b4627', x + 19, fy - 5, 3, 1); px(ctx, '#b4b8c0', x + 22, fy - 6, 1, 3); if (!calm) for (let s = 0; s < 3; s++) px(ctx, s % 2 ? '#ffd36a' : '#fff2b0', x + 22 - s * 2, fy - 7 - ((t * 9 + s) % 3)); }
      } },
    casse: { name: 'Casse-croûte', kind: 'sol', when: 'scène', desc: 'Deux mineurs assis sur des caisses autour du brasero, la soupe fume.',
      draw(ctx, e, t) {
        const x = e.x, fy = e.fy;
        px(ctx, WOOD[2], x + 3, fy - 3, 5, 3); px(ctx, WOOD[1], x + 3, fy - 3, 5, 1);
        px(ctx, WOOD[2], x + 22, fy - 3, 5, 3); px(ctx, WOOD[1], x + 22, fy - 3, 5, 1);
        person(ctx, x + 3, fy - 3, '#2f6b5a', 'sit');
        person(ctx, x + 22, fy - 3, '#8c6034', 'sit', true);
        px(ctx, '#3a3440', x + 13, fy - 2, 5, 2); px(ctx, '#1a1a1a', x + 14, fy - 1, 3, 1);
        const fl = calm ? 0 : Math.floor(t * 8) % 2;
        px(ctx, fl ? '#ffd36a' : '#ff9a3c', x + 14, fy - 3, 3, 1); px(ctx, '#ff7a2a', x + 15 - fl, fy - 4);
        px(ctx, '#5a5e68', x + 13, fy - 6, 5, 2);
        if (!calm) for (let s = 0; s < 3; s++) { const p = cyc(t * 0.9, s / 3, 1); px(ctx, `rgba(230,230,240,${0.6 * (1 - p)})`, x + 15 + Math.round(Math.sin(t * 2 + s * 2)), fy - 7 - p * 5); }
        glow(ctx, x + 15, fy - 3, 16, '255,150,60', calm ? 0.35 : 0.3 + 0.08 * Math.sin(t * 9));
      } },
    canari: { name: 'Le canari', kind: 'scene', when: 'scène', desc: 'La cage du canari suspendue au plafond ; il sautille et chante tant que l’air est bon.',
      draw(ctx, e, t) {
        const sw = calm ? 0 : Math.round(Math.sin(t * 1.6) * 1);
        const cx = e.x + 15 + sw, cy = e.ty + 5;
        px(ctx, '#2a1d14', e.x + 15, e.ty + 1, 1, 2);
        px(ctx, '#b48a3a', cx - 2, cy - 1, 5, 1); for (const i of [-2, 0, 2]) px(ctx, '#b48a3a', cx + i, cy, 1, 4); px(ctx, '#b48a3a', cx - 2, cy + 4, 5, 1);
        const hop = !calm && Math.floor(t * 3) % 3 === 0 ? 1 : 0;
        px(ctx, '#ffe04a', cx - 1, cy + 2 - hop, 2, 2); px(ctx, '#ff9a3c', cx + 1, cy + 2 - hop);
        if (!calm) { const p = cyc(t * 0.6, 0, 1); px(ctx, `rgba(255,242,176,${1 - p})`, cx + 3 + p * 3, cy - p * 4); }
      } },
    goutte: { name: 'Gouttière', kind: 'scene', when: 'scène', desc: 'De l’eau suinte du plafond et tombe goutte à goutte dans une flaque qui frissonne.',
      draw(ctx, e, t) {
        const x = e.x + 16, top = e.ty + 2, fy = e.fy;
        px(ctx, e.tier.rock[2], x - 1, top, 3, 1); px(ctx, e.tier.rock[2], x, top + 1);
        px(ctx, '#2c4c90', x - 4, fy - 1, 9, 1); px(ctx, '#4468b0', x - 3, fy - 1, 7, 1);
        const p = calm ? 0 : cyc(t, 0, 1.4) / 1.4;
        if (p < 0.6) px(ctx, '#92c8ff', x, top + 2 + (fy - top - 4) * (p / 0.6) ** 2);
        else { const r = Math.round((p - 0.6) * 10); px(ctx, '#dcf6ff', x - r, fy - 1); px(ctx, '#dcf6ff', x + r, fy - 1); if (r < 2) px(ctx, '#dcf6ff', x, fy - 2 - r); }
      } },
    dynamite: { name: 'Dynamite', kind: 'sol', when: 'imprévu', desc: 'La mèche crépite, le mineur se bouche les oreilles… boum, puis un nuage de poussière.',
      draw(ctx, e, t) {
        const x = e.x, fy = e.fy, c = calm ? 1 : cyc(t, e.x, 9);
        if (c < 4.6) {
          px(ctx, '#c0402c', x + 24, fy - 4, 4, 3); px(ctx, '#ff6a50', x + 24, fy - 4, 4, 1); px(ctx, '#2a1d14', x + 23, fy - 2);
          const fuse = Math.round(x + 22 - Math.min(1, c / 4.2) * 0) ;
          const sp = x + 8 + Math.min(1, c / 4.2) * 14;
          for (let i = Math.ceil(sp); i <= fuse; i++) px(ctx, '#1a1208', i, fy - 1);
          if (!calm) { px(ctx, Math.floor(t * 20) % 2 ? '#fff2b0' : '#ff9a3c', sp, fy - 2); glow(ctx, sp, fy - 2, 6, '255,200,90', 0.5); }
        }
        if (c >= 4.6 && c < 5.0) glow(ctx, x + 26, fy - 3, 30, '255,240,200', 1 - (c - 4.6) / 0.4);
        if (c >= 4.6 && c < 7.5) for (let s = 0; s < 14; s++) { const k = (c - 4.6) / 2.9, a = hash(s, 1, e.x) * Math.PI; px(ctx, `rgba(170,160,150,${0.8 * (1 - k)})`, x + 26 + Math.cos(a) * (2 + k * 12) * (s % 2 ? 1 : -1), fy - 3 - Math.sin(a) * k * 6); }
        person(ctx, x + 2, fy, '#5a2ca0', c >= 4.4 && c < 6 ? 'sit' : 'stand');
        if (c >= 3 && c < 6) { px(ctx, '#d8a07a', x + 1, fy - 6); px(ctx, '#d8a07a', x + 7, fy - 6); }
      } },
    arpenteur: { name: 'Le géomètre', kind: 'sol', when: 'scène', desc: 'Un géomètre vise le fond de la galerie avec son théodolite ; le point rouge clignote sur la paroi.',
      draw(ctx, e, t) {
        const x = e.x, fy = e.fy;
        px(ctx, WOOD[3], x + 13, fy - 3); px(ctx, WOOD[3], x + 12, fy - 2); px(ctx, WOOD[3], x + 14, fy - 2); px(ctx, WOOD[3], x + 11, fy - 1); px(ctx, WOOD[3], x + 15, fy - 1); px(ctx, WOOD[3], x + 13, fy - 2, 1, 2);
        px(ctx, '#b48a3a', x + 12, fy - 5, 3, 2); px(ctx, '#3a3440', x + 15, fy - 5);
        person(ctx, x + 5, fy, '#2c4c90', 'stand', false, 1);
        const on = calm || Math.floor(t * 2) % 2;
        if (on) { for (let i = x + 17; i < x + 30; i += 2) px(ctx, 'rgba(255,80,80,.35)', i, fy - 5); px(ctx, '#ff4a4a', x + 30, fy - 5); glow(ctx, x + 30, fy - 5, 4, '255,60,60', 0.6); }
      } },
    eboulement: { name: 'Petit éboulement', kind: 'sol', when: 'imprévu', desc: 'Quelques cailloux se détachent de la voûte ; la poussière retombe lentement sur le tas.',
      draw(ctx, e, t) {
        const x = e.x + 10, fy = e.fy, c = calm ? 8 : cyc(t, e.x * 0.1, 11);
        const pile = Math.min(1, c / 2.5);
        for (let i = 0; i < 9; i++) if (hash(i, 2, e.x) < pile) px(ctx, e.tier.rock[(i % 3) + 1], x + 2 + i, fy - 1 - (i > 2 && i < 6 ? 1 : 0));
        if (c < 2.5) for (let s = 0; s < 6; s++) { const p = cyc(c * 1.4, hash(s, 3, e.x), 1); px(ctx, e.tier.rock[3], x + 2 + Math.floor(hash(s, 4, e.x) * 9), e.ty + 2 + p * (fy - e.ty - 4), 1 + (s % 2), 1); }
        if (c < 4) for (let s = 0; s < 10; s++) { const k = c / 4; px(ctx, `rgba(190,180,170,${0.45 * (1 - k)})`, x + 6 + Math.cos(s) * (k * 10), fy - 2 - Math.abs(Math.sin(s * 3)) * k * 6); }
      } },
    convoi: { name: 'Convoi de wagonnets', kind: 'passage', when: 'passage', desc: 'Trois wagons chargés de minerai filent sur les rails, phare devant, étincelles aux joints.',
      draw(ctx, e, t) { const lead = trainX(e, t); for (let i = 0; i < 3; i++) wagonMini(ctx, lead - i * 12 * e.dir, e.fy, t, e.dir, i, false); } },
    chariot: { name: 'Chariot à bras', kind: 'passage', when: 'passage', desc: 'Un mineur pousse sa brouette de minerai d’un étai à l’autre.',
      draw(ctx, e, t) {
        const x = Math.round(trainX(e, t)), fy = e.fy, d = e.dir;
        px(ctx, '#6b4627', x - 4, fy - 4, 7, 3); px(ctx, '#ffd36a', x - 3, fy - 5, 2, 1); px(ctx, '#c8a0ff', x, fy - 5, 2, 1);
        px(ctx, '#111', x + (d > 0 ? 2 : -4), fy - 1, 2, 2);
        px(ctx, WOOD[1], x - d * 5, fy - 4, 2, 1);
        person(ctx, x - d * 11, fy, '#4a8a70', calm || Math.floor(t * 5) % 2 ? 'stand' : 'walk', d < 0, 0);
      } },
    taupe: { name: 'La taupe en balade', kind: 'passage', when: 'passage', desc: 'La mascotte traverse la galerie en trottinant, casque vissé sur la tête.',
      draw(ctx, e, t) {
        const x = Math.round(trainX(e, t)), fy = e.fy, hop = !calm && Math.floor(t * 6) % 2 ? 1 : 0, d = e.dir;
        const M = ['.yyy..', 'bbbbb.', 'bwbbbp', 'ooooo.', 'b...b.'];
        const C = { y: '#e9b422', b: '#6b4a32', w: '#fff', p: '#e59aa0', o: '#e8732a' };
        M.forEach((row, j) => [...row].forEach((ch, i) => { if (C[ch]) px(ctx, C[ch], d > 0 ? x + i : x + 5 - i, fy - 5 + j - hop); }));
      } },
    lift: { name: 'Monte-charge', kind: 'lift', when: 'passage', desc: 'Une cage relie deux galeries par un puits ; elle monte, s’arrête, redescend.',
      draw(ctx, e, t) {
        const x = e.x + 12, y0 = e.y0, y1 = e.fy;
        ctx.fillStyle = e.tier.back[0]; ctx.fillRect(x, y0, 9, y1 - y0);
        for (let y = y0; y < y1; y++) { px(ctx, WOOD[2], x - 1, y); px(ctx, WOOD[2], x + 9, y); if ((y - y0) % 10 === 0) px(ctx, WOOD[1], x, y, 9, 1); }
        const span = y1 - y0 - 10, c = calm ? 0.5 : cyc(t, e.x * 0.05, 12) / 12;
        const k = c < 0.35 ? 0 : c < 0.5 ? (c - 0.35) / 0.15 : c < 0.85 ? 1 : 1 - (c - 0.85) / 0.15;
        const cy = Math.round(y0 + 1 + span * (0.5 - 0.5 * Math.cos(Math.PI * k)));
        px(ctx, '#8a8e98', x + 4, y0, 1, cy - y0);
        px(ctx, '#5a5e68', x, cy, 9, 1); px(ctx, '#5a5e68', x, cy + 9, 9, 1); px(ctx, '#5a5e68', x, cy, 1, 10); px(ctx, '#5a5e68', x + 8, cy, 1, 10);
        person(ctx, x + 2, cy + 9, '#c0402c', 'stand');
        lamp(ctx, x + 4, cy + 1, t, 3, true);
      } },
    chauves: { name: 'Chauves-souris', kind: 'imprevu', when: 'imprévu', desc: 'Une volée de chauves-souris traverse l’écran, réveillée par un wagon.',
      draw(ctx, e, t) {
        const c = calm ? 2 : cyc(t, e.x * 0.1, e.period || 4);
        const dur = e.dur || 4; if (c > dur) return;
        const p = c / dur;
        for (let i = 0; i < 6; i++) {
          const bx = e.x0 + (e.x1 - e.x0) * p + hash(i, 1, 5) * 14 - 7, by = e.y0 + (e.y1 - e.y0) * p + hash(i, 2, 5) * 10 - 5 + Math.sin(t * 6 + i) * 2;
          const up = !calm && Math.floor(t * 12 + i) % 2;
          px(ctx, '#5a4a6e', bx - 1, by, 4, 2); px(ctx, '#3a2a4a', bx - 3, by - (up ? 1 : -1), 2, 1); px(ctx, '#3a2a4a', bx + 3, by - (up ? 1 : -1), 2, 1); px(ctx, '#ff4a4a', bx, by);
        }
      } },
  };
  const ORDER = ['table', 'pioche', 'casse', 'canari', 'goutte', 'dynamite', 'arpenteur', 'eboulement', 'convoi', 'chariot', 'taupe', 'lift', 'chauves'];
  function trainX(e, t) { const span = e.span || W + 70; return (e.xmin || 0) + ((((e.x0 + (calm ? 0 : t * e.sp)) % span) + span) % span) - 30; }
  function lamp(ctx, x, y, t, s, onTable) {
    const f = calm ? 0.8 : 0.72 + 0.18 * Math.sin(t * 7 + s) + 0.08 * Math.sin(t * 17 + s * 3);
    glow(ctx, x, y + 2, onTable ? 22 : 16, '255,190,90', 0.42 * f);
    if (!onTable) px(ctx, '#2a1d14', x, y);
    px(ctx, '#2a1d14', x - 1, y + 1, 3, 1); px(ctx, '#2a1d14', x - 1, y + 4, 3, 1);
    px(ctx, calm || Math.sin(t * 7 + s) > -0.7 ? '#ffd36a' : '#f0a830', x - 1, y + 2, 3, 2); px(ctx, '#fff2b0', x, y + 2);
  }
  function wagonMini(ctx, x, fy, t, dir, i, empty) {
    x = Math.round(x);
    const bob = !calm && Math.floor(t * 6 + x / 4) % 4 === 0 ? -1 : 0, y = fy;
    px(ctx, '#1a1208', x - 5, y - 7 + bob, 11, 6); px(ctx, '#7a7e88', x - 4, y - 6 + bob, 9, 4); px(ctx, '#a8acb4', x - 4, y - 6 + bob, 9, 1);
    if (!empty) { const ORE = ['#ffd36a', '#ff9a3c', '#fff2b0', '#c8a0ff']; for (let j = 0; j < 4; j++) px(ctx, ORE[(j + i + Math.floor(t * 3)) % 4], x - 3 + j * 2, y - 8 + bob - (j % 2), 2, 2); }
    px(ctx, '#111', x - 3, y - 1, 2, 2); px(ctx, '#111', x + 2, y - 1, 2, 2);
    if (i === 0) { px(ctx, '#fff2b0', x + dir * 6, y - 5 + bob); glow(ctx, x + dir * 12, y - 4, 12, '255,230,160', 0.35); }
    if (!calm && Math.floor(t * 10 + x) % 7 === 0) px(ctx, '#ffd36a', x - dir * 6, y);
  }

  function roll(world, seed) {
    const rnd = rngOf((seed | 0) * 9973 + 17);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const floor = shuffle(['table', 'pioche', 'casse', 'dynamite', 'arpenteur', 'eboulement']);
    const air = ['canari', 'goutte'];
    const events = [];
    if (world.tunnels.length < 3) return events;
    const T = world.tunnels, liftK = 1 + Math.floor(rnd() * (T.length - 2));
    T.forEach((tu, k) => {
      const base = { ty: tu.ty, fy: tu.ty + TH - 3, tier: tu.tier, k };
      const free = shuffle(tu.gaps.slice());
      if (k === liftK && free.length) { const g = free.pop(); events.push({ ...base, id: 'lift', x: g, y0: T[k - 1].ty + 2 }); }
      const traffic = rnd() < 0.5;
      if (traffic) {
        const id = pick(['convoi', 'convoi', 'chariot', 'taupe']), dir = rnd() < 0.5 ? 1 : -1;
        events.push({ ...base, id, dir, sp: dir * (id === 'convoi' ? 14 + rnd() * 8 : id === 'taupe' ? 6 : 5), x0: rnd() * W });
        if (free.length && rnd() < 0.7) events.push({ ...base, id: pick(air), x: free.pop() });
      } else {
        const n = Math.min(free.length, 1 + (rnd() < 0.5 ? 1 : 0));
        for (let i = 0; i < n; i++) { const id = floor.length ? floor.pop() : pick(air); events.push({ ...base, id, x: free.pop() }); }
      }
    });
    // Imprévu à l'échelle de l'écran : une volée de chauves-souris, de temps en temps.
    events.push({ id: 'chauves', screen: true, period: 14 + rnd() * 8, dur: 4, x: Math.floor(rnd() * 100), x0: -20, x1: W + 20, y0f: 0.35 + rnd() * 0.35, y1f: 0.18 + rnd() * 0.35 });
    return events;
  }

  /** Dessine la vie de mine ; `ctx` est déjà dans le repère du monde (translaté de -cam). */
  function draw(ctx, world, t, cam, h, reduced) {
    calm = !!reduced;
    const inView = (y) => y > cam - 30 && y < cam + h + 30;
    world.lights.forEach((l) => { if (inView(l.y)) lamp(ctx, l.x, l.y, t, l.s, false); });
    world.events.forEach((e) => {
      if (e.screen) { ctx.save(); ctx.translate(0, cam); EV[e.id].draw(ctx, { ...e, y0: e.y0f * h, y1: e.y1f * h }, t); ctx.restore(); return; }
      if (e.id === 'lift' ? e.fy > cam - 10 && e.y0 < cam + h + 10 : inView(e.ty)) EV[e.id].draw(ctx, e, t);
    });
  }

  global.MineLife = { build, draw, EVENTS: EV };
})(window);
