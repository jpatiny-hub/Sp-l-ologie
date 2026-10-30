'use strict';

/*
 * Fond animé « Galerie vivante » : grottes en 16-bit qui défilent lentement derrière l'interface (essai réservé au responsable, réglage betaGalerie).
 * Les décors reprennent les paliers des galeries de forage (PR « Galeries 16-bit ») : mêmes teintes de roche, mêmes motifs (ossements, fossiles,
 * mine oubliée, gemmes, temple, cristaux prismatiques), mais dessinés ici de façon autonome pour ne pas dépendre de ce fichier.
 * Figé si l'animation est réduite, en pause quand la page est cachée.
 */
(function (global) {
  const W = 120, H = 240; // définition du décor, agrandi sans lissage
  const SCENE_MS = 14000;
  const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };

  // Motifs : # = couleur principale du palier, les autres lettres sont fixes (voir PAT).
  const SKULL = ['.#####.', '#######', '#kk#kk#', '#kk#kk#', '.##k##.', '.#.#.#.'];
  const RIBS = ['#.#####.#', '.#.###.#.', '#.#####.#', '.#.###.#.', '..#####..'];
  const LONGBONE = ['##.........##', '.###########.', '##.........##'];
  const AMMONITE = ['..####.', '.#....#', '#..##.#', '#.#..##', '#.#.#..', '.#..#..', '..##...'];
  const TRILOBITE = ['.###.', '#####', '.#.#.', '#####', '.#.#.', '#####', '..#..'];
  const FISH = ['...#.#.#.#....#', '.##########..##', '#k#.#.#.#.#####', '.##########..##', '...#.#.#.#....#'];
  const CART = ['.bobobob.', 'ggggggggg', 'gGGGGGGGg', 'ggggggggg', '.w.....w.'];
  const PICKAXE = ['.hhh.', 'h.b.h', '..b..', '..b..', '..b..'];
  const MUSH = ['.###.', '##s##', '#s###', '..t..', '..t..'];
  const IDOL = ['...########...', '.############.', '##############', '###yy####yy###', '###yy####yy###', '##############', '######..######', '#####....#####', '##############', '###.######.###', '###..####..###', '####......####'];
  const GLYPH = ['#.#', '###', '..#'];
  const JELLY = ['.###.', '#s###', '#####', '#.#.#', '.#.#.', '#...#'];
  const PAT = { k: '#07060a', y: '#ffd36a', b: '#7a4a22', o: '#4a3a2a', g: '#6a6a72', G: '#9a9aa2', w: '#d8d8d8', h: '#9aa0a8', s: '#ffffff', t: '#d8d0b0' };
  function pat(g, rows, x, y, main) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      g.fillStyle = ch === '#' ? main : PAT[ch] || main;
      g.fillRect(x + i, y + j, 1, 1);
    }));
  }

  // Paliers repris des galeries de forage : rock = 5 teintes de la plus sombre à la plus claire, back = fond, air = lueur, gem = gemmes du sol.
  const TIERS = [
    { id: 'ossuaire', rock: ['#3a2614', '#5c3d22', '#7d5630', '#9c7040', '#b98b55'], back: ['#140c06', '#1d130a', '#28190e'], air: [106, 68, 32], main: '#e8dcc0', motifs: [SKULL, RIBS, LONGBONE, SKULL], gems: null, extra: 'candles' },
    { id: 'fossiles', rock: ['#2a3340', '#3e4a5a', '#566577', '#71819a', '#93a3b8'], back: ['#0b0f15', '#11171f', '#18202a'], air: [42, 90, 138], main: '#d4e0ee', motifs: [AMMONITE, TRILOBITE, FISH], gems: ['#dcf6ff', '#8ed0f0'], extra: 'dust' },
    { id: 'oubliees', rock: ['#1b1b22', '#2a2a34', '#3a3a46', '#4a4a58', '#5c5c6c'], back: ['#050506', '#09090b', '#0f0f12'], air: [90, 62, 26], main: '#8a6a44', motifs: [CART, PICKAXE, CART], gems: null, extra: 'lanterns' },
    { id: 'amethyste', rock: ['#241632', '#382350', '#4f3470', '#6a4a8c', '#8a6aa8'], back: ['#0c0614', '#130a1e', '#1b1028'], air: [90, 44, 160], main: '#c8a8f0', motifs: [], gems: ['#9b59d6', '#f08ab4', '#d2acf5'], extra: 'dust' },
    { id: 'emeraudes', rock: ['#0d2420', '#163a32', '#215246', '#2f6b5a', '#4a8a70'], back: ['#040e0b', '#081612', '#0c1f19'], air: [18, 112, 90], main: '#7fe6a8', motifs: [MUSH, MUSH], gems: ['#2fbf6a', '#86f2ae'], extra: 'dust' },
    { id: 'saphir', rock: ['#0d1838', '#142554', '#1e3670', '#2c4c90', '#4468b0'], back: ['#040818', '#070d22', '#0a142e'], air: [26, 76, 184], main: '#c8a0f0', motifs: [JELLY, JELLY], gems: ['#3a7ae8', '#92c8ff'], extra: 'falls' },
    { id: 'rubis', rock: ['#2e1010', '#4a1616', '#6a2020', '#8c3028', '#a84a38'], back: ['#0c0303', '#140606', '#1e0909'], air: [160, 44, 18], main: '#ff9a6a', motifs: [], gems: ['#e0283c', '#ff96a4'], extra: 'embers' },
    { id: 'temple', rock: ['#2a2414', '#4a3e22', '#6a5a32', '#8c7a48', '#b09c62'], back: ['#0a1010', '#0f1818', '#152121'], air: [30, 106, 96], main: '#6ae6d0', motifs: [IDOL, GLYPH, GLYPH], gems: ['#f0a830', '#ffe28e'], extra: 'dust' },
    { id: 'prisme', rock: ['#1a0f2e', '#2a1a48', '#3e2a66', '#5a4088', '#7c60aa'], back: ['#04020a', '#080512', '#0d091b'], air: [90, 36, 160], main: '#ffffff', motifs: [], gems: 'rainbow', extra: 'dust' },
  ];
  const RAINBOW = ['#e0283c', '#f0a830', '#2fbf6a', '#3a7ae8', '#9b59d6', '#f08ab4'];

  const css = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  /** Un plan de roche : plafond et sol ondulés, avec stalactites ; f = vitesse relative (parallaxe). */
  function rock(g, t, f, seed, ceilY, floorY, c0, c1, spikes) {
    const ox = Math.floor(t * 14 * f);
    for (let x = 0; x < W; x++) {
      const c = x + ox;
      const ce = ceilY + 6 * Math.sin(c * .07 + seed) + 3 * Math.sin(c * .19 + 1);
      const fl = floorY + 5 * Math.sin(c * .05 + 2 + seed) + 2 * Math.sin(c * .23);
      g.fillStyle = c0; g.fillRect(x, 0, 1, ce);
      g.fillStyle = c1; g.fillRect(x, ce, 1, 2);
      g.fillStyle = c0; g.fillRect(x, fl, 1, H - fl);
      g.fillStyle = c1; g.fillRect(x, fl, 1, 2);
      if (spikes && hash(c * 7 + seed) < .07) { const L = 6 + Math.floor(hash(c + seed) * 12); g.fillStyle = c0; for (let k = 0; k < L; k++) g.fillRect(x, ce + k, 1, 1); }
    }
  }
  function slots(t, f, n, gap, fn) {
    const ox = Math.floor(t * 14 * f), span = n * gap;
    for (let i = 0; i < n; i++) {
      const px = ((i * gap + Math.floor(hash(i) * gap * .4) - ox) % span + span) % span - 24;
      if (px > -24 && px < W + 4) fn(i, px);
    }
  }
  function crystals(g, t, f, colors, floorY, pulseOn) {
    slots(t, f, 6, 29, (i, px) => {
      const col = colors === 'rainbow' ? RAINBOW[Math.floor(t / 2 + i) % RAINBOW.length] : colors[Math.floor(hash(i + 9) * colors.length)];
      const hgt = 10 + Math.floor(hash(i + 3) * 18), up = hash(i + 5) < .65;
      const pulse = pulseOn ? .6 + .4 * Math.sin(t * 2 + i * 1.7) : .7;
      const y0 = up ? floorY + 4 : 24;
      const cy = up ? y0 - hgt / 2 : y0 + hgt / 2, gl = g.createRadialGradient(px, cy, 1, px, cy, hgt + 6);
      gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = .35 * pulse; g.fillStyle = gl; g.fillRect(px - hgt - 6, cy - hgt - 6, 2 * hgt + 12, 2 * hgt + 12); g.globalAlpha = 1;
      g.fillStyle = col;
      for (let k = 0; k < hgt; k++) { const w = Math.max(1, 5 - Math.floor(k * 5 / hgt)); g.fillRect(px - Math.floor(w / 2), up ? y0 - k : y0 + k, w, 1); }
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(px - 1, up ? y0 - hgt + 2 : y0 + hgt - 3, 1, 3);
    });
  }
  function lantern(g, x, y, t, glow) {
    const fl = .75 + .25 * Math.sin(t * 7 + x) + .08 * Math.sin(t * 17 + x * 2), sw = Math.round(Math.sin(t * 1.3 + x) * 1.5);
    const gr = g.createRadialGradient(x + sw, y + 4, 1, x + sw, y + 4, 34);
    gr.addColorStop(0, `rgba(255,170,60,${.55 * fl * glow})`); gr.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = gr; g.fillRect(x - 36, y - 30, 74, 74);
    g.fillStyle = '#2a2a2a'; g.fillRect(x + sw, y - 10, 1, 10);
    g.fillStyle = '#3b3b3b'; g.fillRect(x + sw - 2, y, 5, 1); g.fillRect(x + sw - 2, y + 7, 5, 1);
    g.fillStyle = fl > .85 ? '#ffe08a' : '#ffb347'; g.fillRect(x + sw - 1, y + 1, 3, 6);
  }
  function beams(g, t, f, color, gap) {
    const ox = Math.floor(t * 14 * f);
    for (let x = -gap; x < W + gap; x += gap) {
      const px = x - (ox % gap);
      g.fillStyle = color; g.fillRect(px, 20, 5, H - 60); g.fillRect(px - 6, 18, 17, 6);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px + 3, 24, 2, H - 64);
    }
  }
  function foreman(g, t, x, y) {
    const bob = Math.round(Math.sin(t * 1.5) * .6);
    g.fillStyle = '#0b0b0d'; g.fillRect(x - 6, y - 24 + bob, 12, 24); g.fillRect(x - 7, y - 20 + bob, 3, 12);
    g.fillStyle = '#ffd23a'; g.fillRect(x - 6, y - 30 + bob, 12, 6); g.fillRect(x - 8, y - 25 + bob, 16, 2);
    g.fillStyle = '#fff6c0'; g.fillRect(x + 6, y - 28 + bob, 2, 2);
    g.save(); g.globalAlpha = .22 + .05 * Math.sin(t * 4); g.fillStyle = '#ffe9a0'; g.beginPath(); g.moveTo(x + 8, y - 27 + bob); g.lineTo(x + 70, y - 55); g.lineTo(x + 70, y + 2); g.closePath(); g.fill(); g.restore();
    g.fillStyle = '#2a2a2a'; g.fillRect(x + 9, y - 14 + bob, 4, 5); g.fillStyle = '#ffb347'; g.fillRect(x + 10, y - 13 + bob, 2, 3);
  }
  function dust(g, t, n, color) {
    for (let i = 0; i < n; i++) {
      const x = (hash(i) * W + Math.sin(t * .6 + i * 3) * 10 + t * 2 * (hash(i + 1) - .3)) % W;
      const y = 60 + hash(i + 2) * 120 + Math.cos(t * .7 + i * 2) * 8, a = .5 + .5 * Math.sin(t * 2.4 + i * 4), px = Math.floor((x + W) % W);
      g.fillStyle = color; g.globalAlpha = a; g.fillRect(px, Math.floor(y), 1, 1);
      g.globalAlpha = a * .3; g.fillRect(px - 1, Math.floor(y), 3, 1); g.fillRect(px, Math.floor(y) - 1, 1, 3); g.globalAlpha = 1;
    }
  }
  function embers(g, t, n) {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(hash(i) * W + Math.sin(t + i) * 3), y = H - 20 - ((t * (8 + hash(i + 1) * 12) + hash(i + 2) * H) % (H - 40));
      g.fillStyle = hash(i + 3) < .5 ? '#ff7a2a' : '#ffd36a'; g.fillRect(x, Math.floor(y), 1, 1);
    }
  }
  function falls(g, t, x0, w) {
    for (let x = 0; x < w; x++) for (let k = 0; k < 9; k++) {
      const sp = 40 + hash(x * 9 + k) * 40, y = ((t * sp + hash(x + k * 31) * H) % (H - 70)) + 20;
      g.fillStyle = hash(x * 3 + k) < .3 ? '#d8f4ff' : '#4a9fd8'; g.fillRect(x0 + x, Math.floor(y), 1, 5);
    }
    g.fillStyle = 'rgba(190,235,255,.28)';
    for (let i = 0; i < 14; i++) g.fillRect(x0 - 8 + Math.floor(hash(i) * (w + 16)), H - 62 - Math.floor((t * 14 + i * 7) % 18), 3, 2);
  }

  function drawTier(g, t, tier) {
    const [r0, r1, r2, r3] = tier.rock, [b0, b1, b2] = tier.back;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, b0); bg.addColorStop(.5, b1); bg.addColorStop(1, b2);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    rock(g, t, .22, 1, 30, 150, r0, r1, true);
    if (tier.extra === 'falls') { g.fillStyle = '#18506b'; g.fillRect(34, 0, 46, H - 52); falls(g, t, 40, 34); }
    if (tier.extra === 'lanterns') beams(g, t, .5, '#4a3322', 56);
    // Motifs incrustés dans le mur (ossements, fossiles, objets, idoles).
    if (tier.motifs.length) slots(t, .5, 8, 46, (i, px) => {
      const m = tier.motifs[Math.floor(hash(i + 40) * tier.motifs.length)];
      const y = tier.extra === 'lanterns' ? 168 + Math.floor(hash(i + 7) * 8) : 70 + Math.floor(hash(i + 8) * 90);
      const glow = tier.id === 'temple' || tier.id === 'saphir' ? .6 + .4 * Math.sin(t * 2 + i) : 1;
      g.globalAlpha = glow; pat(g, m, px, y, tier.main); g.globalAlpha = 1;
    });
    if (tier.extra === 'lanterns') { lantern(g, 22, 40, t, 1); lantern(g, 86, 44, t + 2, 1); }
    if (tier.extra === 'candles') { lantern(g, 30, 130, t, .5); lantern(g, 96, 150, t + 1, .5); }
    rock(g, t, 1, 2, 12, 182, r1, r3, true);
    if (tier.gems) crystals(g, t, 1, tier.gems, 182, true);
    if (tier.id === 'oubliees') { foreman(g, t, 40, 192); }
    if (tier.id === 'prisme') { const hue = (t * 20) % 360; g.fillStyle = `hsla(${hue},80%,60%,.07)`; g.fillRect(0, 0, W, H); }
    // Lueur de l'air du palier.
    g.globalCompositeOperation = 'lighter';
    const air = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * .9);
    air.addColorStop(0, css(tier.air, .32)); air.addColorStop(1, css(tier.air, 0)); g.fillStyle = air; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    if (tier.extra === 'embers') embers(g, t, 14);
    dust(g, t, 10, `rgb(${Math.min(255, tier.air[0] * 2.4)},${Math.min(255, tier.air[1] * 2.4)},${Math.min(255, tier.air[2] * 2.4)})`);
  }

  let canvas = null;
  let running = false;
  let calm = false;
  let started = 0;
  let raf = 0;

  function frame(now) {
    raf = 0;
    if (!running || !canvas) return;
    const g = canvas.getContext('2d');
    const el = Math.max(0, now - started);
    const t = calm ? 3 : el / 1000;
    g.clearRect(0, 0, W, H);
    drawTier(g, t, TIERS[Math.floor((calm ? 0 : el) / SCENE_MS) % TIERS.length]);
    if (!calm && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (running && !raf) raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', kick);

  /** Active ou coupe le fond ; `reduced` fige le décor sur une image fixe. */
  function setOn(on, reduced) {
    calm = !!reduced;
    if (on && !canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'galerie-bg';
      canvas.width = W;
      canvas.height = H;
      canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(canvas);
    }
    if (canvas) canvas.hidden = !on;
    if (on && !running) started = performance.now();
    running = !!on;
    if (running) {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
  }
  /** Pour les captures et les essais : affiche directement le palier n (0 à 8). */
  function showTier(n) {
    started = performance.now() - n * SCENE_MS - 2000;
  }

  global.Galerie = { setOn, showTier, TIER_COUNT: TIERS.length };
})(window);
