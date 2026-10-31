'use strict';

/*
 * Fond animé « Galerie vivante » : les grottes des galeries de forage (caves.js) défilent lentement derrière l'interface
 * (refonte 16-bit, réservée au responsable). Un palier toutes les 14 s, de l'ossuaire au cœur prismatique, avec les mêmes décors,
 * animations, premier plan et lueurs que pendant le forage, et l'ambiance du forage en cours (graine de caves.js).
 * La vie de mine (minelife.js) anime les galeries creusées entre les grottes.
 * Figé si l'animation est réduite, en pause quand la page est cachée.
 */
(function (global) {
  const SCENE_MS = 14000;
  const DRIFT = 3; // pixels de décor par seconde : la caméra descend doucement dans le palier
  // Paliers montrés (on saute « Racines », juste sous la surface).
  const FIRST = 1;

  let canvas = null;
  let running = false;
  let calm = false;
  let started = 0;
  let raf = 0;
  let cave = null; // monde des grottes, construit pour une graine donnée

  /** Construit le monde des grottes avec l'ambiance actuelle de caves.js (sans toucher à la graine du forage). */
  function buildCave() {
    const { WIDTH: W, SKY, PPP, WORLD_H } = global.Pixel;
    const dims = { W, SKY, PPP, WORLD_H };
    const world = document.createElement('canvas');
    world.width = W;
    world.height = WORLD_H;
    const ctx = world.getContext('2d');
    const img = ctx.createImageData(W, WORLD_H);
    const set = (x, y, hex) => {
      if (x < 0 || x >= W || y < 0 || y >= WORLD_H) return;
      const n = parseInt(hex.slice(1), 16);
      const i = (y * W + x) * 4;
      img.data[i] = n >> 16;
      img.data[i + 1] = (n >> 8) & 255;
      img.data[i + 2] = n & 255;
      img.data[i + 3] = 255;
    };
    const built = global.Caves.build({ ...dims, set });
    for (let i = 0; i < built.alpha.length; i++) img.data[i * 4 + 3] = built.alpha[i];
    // Vie de mine : galeries étayées creusées entre les grottes, scènes tirées avec la graine du forage.
    let num = 7;
    for (const c of global.Caves.seed()) num = (Math.imul(num, 31) + c.charCodeAt(0)) | 0;
    const life = global.MineLife ? global.MineLife.build({ ...dims, data: img.data, set, seed: num }) : null;
    ctx.putImageData(img, 0, 0);
    return { seed: global.Caves.seed(), dims, world, life, anim: built.anim, back: global.Caves.backdrop(dims), front: global.Caves.foreground(dims) };
  }

  const tierCount = () => global.Caves.TIERS.length - FIRST;

  function frame(now) {
    raf = 0;
    if (!running || !canvas) return;
    if (!cave || cave.seed !== global.Caves.seed()) cave = buildCave();
    const { dims, world } = cave;
    const h = canvas.height;
    const el = Math.max(0, now - started);
    const time = calm ? 3 : el / 1000;
    const scene = Math.floor((calm ? 0 : el) / SCENE_MS);
    const tier = global.Caves.TIERS[FIRST + (scene % tierCount())];
    const since = calm ? 0 : (el % SCENE_MS) / 1000;
    // Toujours sous la surface (pas de ciel au-dessus de l'ossuaire).
    const cam = Math.max(dims.SKY + 4, Math.min(dims.WORLD_H - h, Math.round(dims.SKY + tier.from * dims.PPP - h / 3 + since * DRIFT)));
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = tier.dark;
    g.fillRect(0, 0, canvas.width, h);
    global.Caves.drawBack(g, cave.back, cam, h, dims);
    g.drawImage(world, 0, cam, dims.W, h, 0, 0, dims.W, h);
    g.save();
    g.translate(0, -cam);
    global.Caves.drawAnim(g, cave.anim, time, cam, h, calm);
    if (cave.life) global.MineLife.draw(g, cave.life, time, cam, h, calm);
    g.restore();
    global.Caves.drawFront(g, cave.front, cam, h, time);
    global.Caves.drawAir(g, dims, cam, h, time, calm);
    if (!calm && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (running && !raf) raf = requestAnimationFrame(frame);
    kickWagons();
  }
  document.addEventListener('visibilitychange', kick);

  /** Active ou coupe le fond ; `reduced` fige le décor sur une image fixe. */
  function setOn(on, reduced) {
    calm = !!reduced;
    if (on && !canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'galerie-bg';
      canvas.width = global.Pixel.WIDTH;
      canvas.height = global.Pixel.HEIGHT;
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
  // ---------- Wagonnets : le bouton du forage du jour sur l'accueil, et l'aiguillage de « Jouer » ----------
  // Toiles de 160×64 : rails sur toute la largeur, wagonnet plein de minerai lumineux au centre ; `departWagon` le fait filer vers la
  // droite (forage du jour) ou vers la gauche (duel, illimité). L'aiguillage ajoute un levier et deux panneaux.
  const WW = 160, WH = 64;
  const wagons = new Map(); // toile → { kind, go: { t0, dir, resolve } pendant un départ }
  let wagonRaf = 0;
  function drawWagon(g, t, k, kind) {
    const moving = k !== 0, dir = Math.sign(k) || 1;
    const cx = Math.round(80 + k * 140), cy = 30, b = moving ? Math.round(Math.sin(t * 18)) : Math.round(Math.sin(t * 2) * 0.6);
    g.clearRect(0, 0, WW, WH);
    // Rails (les traverses défilent quand le wagonnet part).
    g.fillStyle = '#3a2412';
    const off = moving ? (Math.abs(k) * 140) % 10 : 0;
    for (let x = -off * dir; x < WW + 10; x += 10) g.fillRect(Math.round(x), cy + 23, 4, 3);
    g.fillStyle = '#8a8e98'; g.fillRect(0, cy + 21, WW, 2);
    if (kind === 'switch') {
      // Levier d'aiguillage et deux panneaux fléchés.
      const lean = Math.round(Math.sin(t) * 2);
      g.fillStyle = '#5a5e68'; g.fillRect(77, cy + 24, 6, 3);
      g.fillStyle = '#c0402c'; g.fillRect(79 + lean, cy + 14, 2, 10);
      g.fillStyle = '#ffd36a'; g.fillRect(78 + lean, cy + 12, 4, 3);
      for (const [x, right] of [[8, false], [140, true]]) {
        g.fillStyle = '#4a2f1a'; g.fillRect(x + 5, cy - 2, 2, 23);
        g.fillStyle = '#8c6034'; g.fillRect(x, cy - 12, 12, 9);
        g.fillStyle = '#ffd36a'; g.fillRect(x + 3, cy - 8, 6, 1); g.fillRect(right ? x + 8 : x + 3, cy - 9, 1, 3);
      }
    }
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    // Lueur du minerai et de la lanterne.
    const gl = g.createRadialGradient(cx, cy - 6, 0, cx, cy - 6, 52);
    gl.addColorStop(0, `rgba(255,190,80,${0.5 + 0.12 * Math.sin(t * 3)})`); gl.addColorStop(1, 'rgba(255,190,80,0)');
    g.fillStyle = gl; g.fillRect(cx - 52, cy - 58, 104, 90);
    // Pile de minerai : cristaux facettés (clair en haut à gauche, sombre en bas à droite), qui scintillent.
    const GEM = [[-19, -9, 7, 0], [-12, -14, 8, 1], [-3, -17, 9, 2], [6, -13, 8, 0], [13, -8, 7, 1], [-8, -8, 7, 2], [1, -10, 8, 1], [-16, -4, 7, 1], [9, -5, 7, 2]];
    const PAL = [['#fff2b0', '#ffd36a', '#c8841c'], ['#ffd9a0', '#ff9a3c', '#a8480e'], ['#ffffff', '#ffe27a', '#d9a02a']];
    for (const [dx, dy, sz, k] of GEM) {
      const [hi, mid, lo] = PAL[(k + Math.floor(t * 1.5 + dx)) % 3 < 0 ? 0 : (k + Math.floor(t * 1.5 + dx)) % 3];
      R(cx + dx, cy + dy + b, sz, sz - 1, mid);
      R(cx + dx, cy + dy + b, sz - 2, 2, hi);
      R(cx + dx + sz - 2, cy + dy + 2 + b, 2, sz - 3, lo);
      R(cx + dx + 1, cy + dy + sz - 2 + b, sz - 2, 1, lo);
    }
    if (Math.floor(t * 3) % 4 === 0) { R(cx - 4, cy - 19 + b, 1, 5, '#fff'); R(cx - 6, cy - 17 + b, 5, 1, '#fff'); }
    // Caisse : planches de bois cerclées de fer, avec ombre sous le bord.
    R(cx - 28, cy - 4 + b, 56, 25, '#150d06');
    for (let i = 0; i < 4; i++) { R(cx - 26, cy - 2 + i * 5 + b, 52, 4, i % 2 ? '#6a4524' : '#7d5430'); R(cx - 26, cy - 2 + i * 5 + b, 52, 1, '#9a6c3c'); R(cx - 26, cy + 1 + i * 5 + b, 52, 1, '#3e2812'); }
    for (let i = 0; i < 8; i++) R(cx - 26 + i * 7, cy - 2 + b, 1, 20, '#3e2812'); // joints verticaux des planches
    R(cx - 29, cy - 5 + b, 58, 4, '#8a8e98'); R(cx - 29, cy - 5 + b, 58, 1, '#c4c8d0'); R(cx - 29, cy - 2 + b, 58, 1, '#4a4e58'); // rebord de fer
    for (const x of [cx - 18, cx + 16]) { R(x - 2, cy - 4 + b, 4, 22, '#5a5e68'); R(x - 2, cy - 4 + b, 1, 22, '#8a8e98'); R(x, cy + 1 + b, 1, 1, '#c4c8d0'); R(x, cy + 9 + b, 1, 1, '#c4c8d0'); } // bandes de fer + rivets
    R(cx - 26, cy + 17 + b, 52, 2, '#2a1a0a');
    // Lanterne accrochée à l'avant, qui se balance un peu.
    const lx = cx + (dir > 0 ? 30 : -34), sw = Math.round(Math.sin(t * 2.4) * 1.4);
    R(lx + 2 + sw, cy - 2 + b, 1, 5, '#555');
    R(lx + sw, cy + 3 + b, 5, 6, '#2a2218'); R(lx + 1 + sw, cy + 4 + b, 3, 4, `rgba(255,${200 + Math.round(30 * Math.sin(t * 7))},90,1)`);
    // Attelage et roues à rayons.
    R(cx - 31, cy + 14 + b, 3, 2, '#5a5e68'); R(cx + 28, cy + 14 + b, 3, 2, '#5a5e68');
    for (const dx of [-17, 9]) {
      R(cx + dx, cy + 17, 9, 9, '#0e0e12'); R(cx + dx + 1, cy + 18, 7, 7, '#555a64'); R(cx + dx + 3, cy + 20, 3, 3, '#1a1a1e');
      const sp = moving ? Math.floor(t * 24) % 2 : 0;
      R(cx + dx + (sp ? 1 : 4), cy + (sp ? 21 : 18), sp ? 7 : 1, sp ? 1 : 7, '#8a8e98'); R(cx + dx + 4, cy + 21, 1, 1, '#ffd36a');
    }
    // Étincelles sous les roues au départ, derrière le wagonnet.
    if (moving) for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ffd36a' : '#ff7a2a'; const d = (i * 7 + t * 90) % 24; g.fillRect(dir > 0 ? cx - 26 - d : cx + 26 + d, cy + 18 + (i % 3), 1, 1); }
  }
  function wagonFrame(now) {
    wagonRaf = 0;
    const t = now / 1000;
    let again = false;
    for (const [cv, st] of wagons) {
      if (!cv.isConnected) { wagons.delete(cv); continue; }
      let k = 0;
      if (st.go) {
        const e = Math.min(1, (now - st.go.t0) / 650);
        k = e * e * st.go.dir;
        if (e >= 1) { const done = st.go.resolve; st.go = null; drawWagon(cv.getContext('2d'), t, k, st.kind); done(); continue; }
        again = true;
      } else if (cv.getClientRects().length === 0) continue; // toile cachée (feuille fermée) : rien à dessiner
      else if (!calm) again = true;
      drawWagon(cv.getContext('2d'), calm ? 0 : t, k, st.kind);
    }
    if (again && !document.hidden) wagonRaf = requestAnimationFrame(wagonFrame);
  }
  function kickWagons() {
    if (!wagonRaf) wagonRaf = requestAnimationFrame(wagonFrame);
  }
  /** Branche une toile de wagonnet (`kind` : 'wagon' sur l'accueil, 'switch' pour l'aiguillage). */
  function mountWagon(canvas, kind = 'wagon') {
    canvas.width = WW;
    canvas.height = WH;
    wagons.set(canvas, { kind, go: null });
    kickWagons();
  }
  /** Le wagonnet file vers la droite (dir 1) ou la gauche (dir -1) ; la promesse se résout quand il a quitté l'écran. */
  function departWagon(dir = 1, canvas) {
    const cv = canvas || [...wagons.keys()][0];
    const st = cv && wagons.get(cv);
    if (!st) return Promise.resolve();
    return new Promise((resolve) => {
      st.go = { t0: performance.now(), dir: dir < 0 ? -1 : 1, resolve };
      if (wagonRaf) cancelAnimationFrame(wagonRaf);
      wagonRaf = requestAnimationFrame(wagonFrame);
    });
  }
  /** Remet les wagonnets en place (retour à l'accueil, feuille rouverte). */
  function resetWagon() {
    for (const st of wagons.values()) st.go = null;
    kickWagons();
  }


  /** Vignette de la galerie de secours : un wagonnet sur son rail, la taupe qui dépasse de la caisse, dans l'arche d'un tunnel éclairé. */
  function drawRescue(canvas, t = 0, still = true) {
    const calm = still;
    const W = 96, H = 40; // coordonnées de la scène ; la toile fait le double pour que la taupe (48 × 32) garde sa finesse
    canvas.width = W * 2;
    canvas.height = H * 2;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.scale(2, 2);
    g.clearRect(0, 0, W, H);
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // Arche du tunnel : roche en dégradé, deux étais, une lanterne qui éclaire.
    for (let y = 0; y < 30; y++) for (let x = 0; x < W; x++) {
      const dx = (x - 47.5) / 40, dy = (y - 30) / 29, d = dx * dx + dy * dy;
      if (d > 1) continue;
      if (d > 0.8) R(x, y, 1, 1, d > 0.93 ? '#120c08' : (x + y) % 3 ? '#4a4048' : '#5d555e');
      else { const t = Math.sqrt(d); R(x, y, 1, 1, t < 0.3 ? '#4a3418' : t < 0.55 ? '#2e2214' : '#1a1410'); }
    }
    const gl = g.createRadialGradient(47, 24, 0, 47, 24, 34);
    gl.addColorStop(0, 'rgba(255,194,90,0.45)'); gl.addColorStop(1, 'rgba(255,194,90,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, 34);
    for (const x of [14, 80]) { R(x, 8, 3, 22, '#6a4524'); R(x, 8, 1, 22, '#8c6034'); R(x - 2, 6, 7, 3, '#8c6034'); }
    R(46, 2, 2, 5, '#555'); R(44, 7, 6, 6, '#2a2218'); R(45, 8, 4, 4, '#ffd36a'); R(46, 9, 2, 2, '#fff2b0');
    // Rails et traverses.
    R(0, 33, W, 2, '#8a8e98'); R(0, 33, W, 1, '#c4c8d0');
    for (let x = 2; x < W; x += 8) R(x, 35, 5, 3, '#4a2f1a');
    R(0, 38, W, 2, '#150d06');
    // Wagonnet (arrière) puis la taupe assise dedans, puis l'avant de la caisse par-dessus ses jambes.
    const bob = calm ? 0 : Math.round(Math.sin(t * 3) * 0.6);
    R(25, 20, 46, 13, '#150d06');
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0); // taupe et patte en pixels réels de la toile
    if (global.Mole16) {
      const m = document.createElement('canvas');
      global.Mole16.draw(m, 'happy', { x: 0, y: 0 });
      g.imageSmoothingEnabled = false;
      g.drawImage(m, 72, 8 + bob * 2);
    }
    // Patte qui fait signe : « suis-moi ! » (bras levé qui balance, patte rose au bout).
    const sw = calm ? 0 : Math.sin(t * 7);
    const sx = 114, sy = 34 + bob * 2, tx = Math.round(122 + sw * 7), ty = Math.round(12 - Math.abs(sw) * 2);
    g.fillStyle = '#3a2410';
    for (let i = 0; i <= 12; i++) { const f = i / 12; g.fillRect(Math.round(sx + (tx - sx) * f) - 1, Math.round(sy + (ty - sy) * f) - 1, 7, 7); }
    g.fillStyle = '#9a6a3a';
    for (let i = 0; i <= 12; i++) { const f = i / 12; g.fillRect(Math.round(sx + (tx - sx) * f), Math.round(sy + (ty - sy) * f), 5, 5); }
    g.fillStyle = '#f28bb3'; g.fillRect(tx - 2, ty - 5, 9, 8);
    g.fillStyle = '#ffc4d8'; g.fillRect(tx - 2, ty - 5, 9, 2);
    g.restore();
    for (let i = 0; i < 3; i++) { R(25, 21 + i * 4, 46, 3, i % 2 ? '#6a4524' : '#7d5430'); R(25, 21 + i * 4, 46, 1, '#9a6c3c'); }
    R(23, 19, 50, 3, '#8a8e98'); R(23, 19, 50, 1, '#c4c8d0');
    for (const x of [33, 62]) { R(x, 20, 2, 13, '#5a5e68'); R(x, 20, 1, 13, '#8a8e98'); }
    for (const x of [31, 59]) { R(x, 29, 7, 7, '#0e0e12'); R(x + 1, 30, 5, 5, '#555a64'); R(x + 3, 32, 1, 1, '#ffd36a'); }
    R(19, 27, 4, 2, '#5a5e68'); R(73, 27, 4, 2, '#5a5e68');
  }
  /** Anime la vignette tant que la fenêtre est ouverte (ne fait rien si les animations sont réduites). */
  function playRescue(canvas, dialog) {
    drawRescue(canvas, 0, calm || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches));
    if (calm) return;
    const t0 = performance.now();
    const step = (now) => {
      if (!dialog.open || !canvas.isConnected) return;
      drawRescue(canvas, (now - t0) / 1000, false);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Dessine une image fixe du palier n (0 = ossuaire …) sur une toile, pour illustrer le tutoriel avec les vraies grottes du jeu. */
  function snapshot(canvas, n) {
    if (!global.Caves || !global.Pixel) return;
    if (!cave || cave.seed !== global.Caves.seed()) cave = buildCave();
    const { dims, world } = cave;
    const h = canvas.height = Math.min(canvas.height || 80, dims.WORLD_H);
    canvas.width = dims.W;
    const tier = global.Caves.TIERS[FIRST + (n % tierCount())];
    const cam = Math.max(dims.SKY + 4, Math.min(dims.WORLD_H - h, Math.round(dims.SKY + tier.from * dims.PPP - h / 3 + 20)));
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = tier.dark;
    g.fillRect(0, 0, canvas.width, h);
    global.Caves.drawBack(g, cave.back, cam, h, dims);
    g.drawImage(world, 0, cam, dims.W, h, 0, 0, dims.W, h);
    g.save();
    g.translate(0, -cam);
    global.Caves.drawAnim(g, cave.anim, 3, cam, h, true);
    if (cave.life) global.MineLife.draw(g, cave.life, 3, cam, h, true);
    g.restore();
    global.Caves.drawFront(g, cave.front, cam, h, 3);
  }

  /** Pour les captures et les essais : affiche directement le palier n (0 = ossuaire … 8 = cœur prismatique). */
  function showTier(n) {
    started = performance.now() - n * SCENE_MS - 2000;
  }

  global.Galerie = { setOn, showTier, drawRescue, playRescue, snapshot, mountWagon, departWagon, resetWagon, get TIER_COUNT() { return tierCount(); } };
})(window);
