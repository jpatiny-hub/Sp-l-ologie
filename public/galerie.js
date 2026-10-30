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
    if (wagon && !wagonRaf) wagonRaf = requestAnimationFrame(wagonFrame);
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
  // ---------- Wagonnet : le bouton du forage du jour sur l'accueil ----------
  // Toile de 160×64 : rails sur toute la largeur, wagonnet plein de minerai lumineux au centre ; `departWagon` le fait filer vers la droite.
  const WW = 160, WH = 64;
  let wagon = null;
  let wagonRaf = 0;
  let wagonGo = null; // { t0, resolve } pendant le départ
  function drawWagon(g, t, k) {
    const moving = k > 0;
    const cx = Math.round(80 + k * 140), cy = 30, b = moving ? Math.round(Math.sin(t * 18)) : Math.round(Math.sin(t * 2) * 0.6);
    g.clearRect(0, 0, WW, WH);
    // Rails (les traverses défilent quand le wagonnet part).
    g.fillStyle = '#3a2412';
    const off = moving ? (k * 140) % 10 : 0;
    for (let x = -off; x < WW; x += 10) g.fillRect(Math.round(x), cy + 23, 4, 3);
    g.fillStyle = '#8a8e98'; g.fillRect(0, cy + 21, WW, 2);
    // Lueur du minerai.
    const gl = g.createRadialGradient(cx, cy - 4, 0, cx, cy - 4, 40);
    gl.addColorStop(0, `rgba(255,190,80,${0.5 + 0.12 * Math.sin(t * 3)})`); gl.addColorStop(1, 'rgba(255,190,80,0)');
    g.fillStyle = gl; g.fillRect(cx - 40, cy - 44, 80, 80);
    // Minerai qui scintille.
    const ORE = ['#ffd36a', '#ff9a3c', '#fff2b0'];
    for (let i = 0; i < 9; i++) {
      g.fillStyle = ORE[(i + Math.floor(t * 2)) % 3];
      g.fillRect(cx - 20 + (i * 5) % 40, cy - 12 - (i % 3) * 3 + b, 5, 5);
    }
    // Caisse rivetée.
    g.fillStyle = '#1a1208'; g.fillRect(cx - 26, cy - 6 + b, 52, 24);
    g.fillStyle = '#7a7e88'; g.fillRect(cx - 24, cy - 4 + b, 48, 20);
    g.fillStyle = '#a8acb4'; g.fillRect(cx - 24, cy - 4 + b, 48, 3);
    g.fillStyle = '#5a5e68'; for (let i = 0; i < 4; i++) g.fillRect(cx - 20 + i * 12, cy + 2 + b, 2, 2);
    // Roues.
    for (const dx of [-16, 8]) { g.fillStyle = '#111'; g.fillRect(cx + dx, cy + 16, 8, 8); g.fillStyle = moving && Math.floor(t * 20) % 2 ? '#888' : '#555'; g.fillRect(cx + dx + 2, cy + 18, 4, 4); }
    // Étincelles sous les roues au départ.
    if (moving) for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ffd36a' : '#ff7a2a'; g.fillRect(cx - 26 - ((i * 7 + t * 90) % 24), cy + 18 + (i % 3), 1, 1); }
  }
  function wagonFrame(now) {
    wagonRaf = 0;
    if (!wagon || !wagon.isConnected) return;
    const t = now / 1000;
    let k = 0;
    if (wagonGo) {
      const e = Math.min(1, (now - wagonGo.t0) / 650);
      k = e * e;
      if (e >= 1) { const done = wagonGo.resolve; wagonGo = null; drawWagon(wagon.getContext('2d'), t, 1); done(); return; }
    }
    drawWagon(wagon.getContext('2d'), calm ? 0 : t, k);
    if ((!calm || wagonGo) && !document.hidden) wagonRaf = requestAnimationFrame(wagonFrame);
  }
  /** Branche la toile du wagonnet (dessin au repos, léger balancement). */
  function mountWagon(canvas) {
    wagon = canvas;
    canvas.width = WW;
    canvas.height = WH;
    if (!wagonRaf) wagonRaf = requestAnimationFrame(wagonFrame);
  }
  /** Le wagonnet file vers la droite ; la promesse se résout quand il a quitté l'écran. */
  function departWagon() {
    if (!wagon) return Promise.resolve();
    return new Promise((resolve) => {
      wagonGo = { t0: performance.now(), resolve };
      if (wagonRaf) cancelAnimationFrame(wagonRaf);
      wagonRaf = requestAnimationFrame(wagonFrame);
    });
  }
  /** Remet le wagonnet en place (retour à l'accueil). */
  function resetWagon() {
    wagonGo = null;
    if (wagon && !wagonRaf) wagonRaf = requestAnimationFrame(wagonFrame);
  }

  /** Pour les captures et les essais : affiche directement le palier n (0 = ossuaire … 8 = cœur prismatique). */
  function showTier(n) {
    started = performance.now() - n * SCENE_MS - 2000;
  }

  global.Galerie = { setOn, showTier, mountWagon, departWagon, resetWagon, get TIER_COUNT() { return tierCount(); } };
})(window);
